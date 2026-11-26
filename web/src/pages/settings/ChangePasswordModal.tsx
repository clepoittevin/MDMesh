import { useEffect, useId, useState, type FormEvent } from 'react';
import { defineMessages, useIntl, type MessageDescriptor } from 'react-intl';
import {
  changeOwnPassword,
  IMPERSONATED,
  isTooManyAttempts,
  type AuthUser,
} from '../../api/auth';
import { authMessages } from '../../api/authMessages';
import { Button, Callout, Field, IconAlert, Modal, PasswordInput, RuleList, useToast, type Rule } from '../../ui';
import { apiErrorText } from '../../api/apiErrorText';

const messages = defineMessages<'ruleDifferent' | 'ruleMatch' | 'sessionMissing' | 'changedTitle' | 'changedBody' | 'newEmpty' | 'refused' | 'notChanged' | 'title' | 'description' | 'cancel' | 'current' | 'wrongCurrent' | 'showCurrent'>({
  ruleDifferent: { id: 'settings.password.ruleDifferent', defaultMessage: 'Different from your current password' },
  ruleMatch: { id: 'settings.password.ruleMatch', defaultMessage: 'Both new passwords match' },
  sessionMissing: {
    id: 'settings.password.sessionMissing',
    defaultMessage: 'Your session is missing your account details. Sign out and in again, then retry.',
  },
  changedTitle: { id: 'settings.password.changedTitle', defaultMessage: 'Password changed' },
  changedBody: {
    id: 'settings.password.changedBody',
    defaultMessage: 'Use the new password the next time you sign in.',
  },
  newEmpty: { id: 'settings.password.newEmpty', defaultMessage: 'Enter a new password.' },
  refused: {
    id: 'settings.password.refused',
    defaultMessage: 'The server refused the change. Sign out and in again, then retry.',
  },
  notChanged: { id: 'settings.password.notChanged', defaultMessage: 'The password was not changed.' },
  title: { id: 'settings.password.title', defaultMessage: 'Change password' },
  description: { id: 'settings.password.description', defaultMessage: 'For {login}.' },
  cancel: { id: 'settings.password.cancel', defaultMessage: 'Cancel' },
  current: { id: 'settings.password.current', defaultMessage: 'Current password' },
  wrongCurrent: { id: 'settings.password.wrongCurrent', defaultMessage: 'That isn’t your current password.' },
  showCurrent: { id: 'settings.password.showCurrent', defaultMessage: 'Show current password' },
}) as Record<'ruleDifferent' | 'ruleMatch' | 'sessionMissing' | 'changedTitle' | 'changedBody' | 'newEmpty' | 'refused' | 'notChanged' | 'title' | 'description' | 'cancel' | 'current' | 'wrongCurrent' | 'showCurrent', MessageDescriptor>;

/** Also the account editor's minimum (Settings → Users & roles). */
export const MIN_LENGTH = 8;

/**
 * Change your own password (new with the redesign: the v0.3 console had no such form). `PUT /private/users/current` checks
 * the current password server-side; the rules below are the ones the client can check (same minimum as the
 * set-password page). The caller keeps it mounted while it animates closed and gives each opening a new `key`, so
 * every opening starts blank.
 */
export function ChangePasswordModal({ open, user, onClose }: { open: boolean; user: AuthUser | null; onClose: () => void }) {
  const intl = useIntl();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [wrongCurrent, setWrongCurrent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Typed passwords don't outlive the dialog: cleared once it has finished closing (not during its exit motion).
  useEffect(() => {
    if (open) return;
    const t = window.setTimeout(() => {
      setCurrent('');
      setNext('');
      setAgain('');
    }, 300);
    return () => window.clearTimeout(t);
  }, [open]);
  const rulesId = useId();
  const formId = useId();

  const typed = next.length > 0;
  const rules: Rule[] = [
    { key: 'len', label: intl.formatMessage(authMessages.minLength, { min: MIN_LENGTH }), met: typed ? next.length >= MIN_LENGTH : null },
    { key: 'diff', label: intl.formatMessage(messages.ruleDifferent), met: typed && current ? next !== current : null },
    { key: 'match', label: intl.formatMessage(messages.ruleMatch), met: again ? next === again : null },
  ];
  const valid = current.length > 0 && next.length >= MIN_LENGTH && next !== current && next === again;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid || busy) return;
    if (!user?.id || !user.login) {
      setErr(intl.formatMessage(messages.sessionMissing));
      return;
    }
    setBusy(true);
    setErr(null);
    setWrongCurrent(false);
    try {
      await changeOwnPassword({ id: user.id, login: user.login }, current, next);
      toast.push('ok', intl.formatMessage(messages.changedTitle), intl.formatMessage(messages.changedBody));
      onClose();
    } catch (ex) {
      const m = (ex as Error).message;
      if (m === 'error.password.wrong') setWrongCurrent(true);
      // The current-password check counts as a sign-in for the server's limit (LoginThrottle, v0.3.9).
      else if (isTooManyAttempts(ex)) setErr(intl.formatMessage(authMessages.tooMany));
      else if (m === 'error.password.empty') setErr(intl.formatMessage(messages.newEmpty));
      else if (m === IMPERSONATED) setErr(intl.formatMessage(authMessages.impersonated));
      else if (m === 'error.permission.denied') setErr(intl.formatMessage(messages.refused));
      else setErr(apiErrorText(intl, ex) || intl.formatMessage(messages.notChanged));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      dismissOnBackdrop={false}
      size="sm"
      title={intl.formatMessage(messages.title)}
      description={user?.login ? intl.formatMessage(messages.description, { login: user.login }) : undefined}
      footer={
        <>
          <Button size="lg" onClick={onClose} disabled={busy}>
            {intl.formatMessage(messages.cancel)}
          </Button>
          <Button type="submit" form={formId} variant="primary" size="lg" disabled={!valid || busy}>
            {busy ? intl.formatMessage(authMessages.saving) : intl.formatMessage(messages.title)}
          </Button>
        </>
      }
    >
      <form id={formId} className="v2-settings-pwform" onSubmit={(e) => void submit(e)} noValidate>
        {err ? (
          <Callout tone="alert" role="alert" icon={<IconAlert />}>
            {err}
          </Callout>
        ) : null}
        <Field
          label={intl.formatMessage(messages.current)}
          error={wrongCurrent ? intl.formatMessage(messages.wrongCurrent) : undefined}
        >
          <PasswordInput
            size="md"
            autoComplete="current-password"
            toggleLabel={intl.formatMessage(messages.showCurrent)}
            value={current}
            onChange={(e) => {
              setCurrent(e.target.value);
              setWrongCurrent(false);
            }}
            required
          />
        </Field>
        <Field label={intl.formatMessage(authMessages.newPassword)}>
          <PasswordInput
            size="md"
            autoComplete="new-password"
            toggleLabel={intl.formatMessage(authMessages.showNew)}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            aria-describedby={rulesId}
            required
          />
        </Field>
        <Field label={intl.formatMessage(authMessages.typeAgain)}>
          <PasswordInput
            size="md"
            autoComplete="new-password"
            toggleLabel={intl.formatMessage(authMessages.showAgain)}
            value={again}
            onChange={(e) => setAgain(e.target.value)}
            aria-describedby={rulesId}
            required
          />
        </Field>
        <RuleList id={rulesId} rules={rules} />
      </form>
    </Modal>
  );
}
