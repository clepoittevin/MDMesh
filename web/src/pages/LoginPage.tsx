import { useRef, useState, type FormEvent } from 'react';
import { defineMessages, useIntl, type MessageDescriptor } from 'react-intl';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import type { AuthUser } from '../api/auth';
import { paths } from '../routes';
import { AuthFooter, AuthLayout, Button, Callout, Field, IconAlert, IconCheck, IconClock, Input, PasswordInput } from '../ui';
import { safeReturnPath } from '../auth/safeReturnPath';
import { authMessages } from '../api/authMessages';
import { isTooManyAttempts, isUnreachable } from './authCommon';

const messages = defineMessages({
  wrong: { id: 'auth.login.wrong', defaultMessage: 'Wrong username or password.' },
  passwordChanged: {
    id: 'auth.login.passwordChanged',
    defaultMessage: 'Password updated. Sign in with your new password.',
  },
  resetExpired: {
    id: 'auth.login.resetExpired',
    defaultMessage: 'That password change expired. Sign in again to set your password.',
  },
  sessionExpired: {
    id: 'auth.login.sessionExpired',
    defaultMessage: 'Your session expired. Sign in again to pick up where you left off.',
  },
  title: { id: 'auth.login.title', defaultMessage: 'Sign in' },
  username: { id: 'auth.login.username', defaultMessage: 'Username' },
  usernameMissing: { id: 'auth.login.usernameMissing', defaultMessage: 'Enter your username.' },
  password: { id: 'auth.login.password', defaultMessage: 'Password' },
  passwordMissing: { id: 'auth.login.passwordMissing', defaultMessage: 'Enter your password.' },
  signingIn: { id: 'auth.login.signingIn', defaultMessage: 'Signing in…' },
  signIn: { id: 'auth.login.signIn', defaultMessage: 'Sign in' },
});

interface LoginState {
  /** A return path in navigation state (ProtectedRoute itself uses `?from=`). */
  from?: unknown;
  passwordChanged?: boolean;
  sessionExpired?: boolean;
  /** SetPasswordPage: the server refused the reset token (it works once, for 24 hours). */
  resetExpired?: boolean;
}

/**
 * Sign in, without the shell. Same request, errors and redirects as the classic `pages/LoginPage.tsx`:
 * the password goes through `useAuth().signIn` (api/auth.ts hashes it exactly as the classic page does), and `from`
 * is only ever a same-origin path. Two failures are told apart: "can't reach the server", and the server's sign-in
 * limit (LoginThrottle, v0.3.9), which says so. Every other failure reads "Wrong username or password." (the server
 * answers unknown users and wrong passwords alike).
 */
export function LoginPage() {
  const { signIn } = useAuth();
  const intl = useIntl();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const state = (location.state ?? null) as LoginState | null;
  const from = safeReturnPath(params.get('from') ?? state?.from, paths.overview);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [missing, setMissing] = useState<{ user?: boolean; pw?: boolean }>({});
  const [error, setError] = useState<MessageDescriptor | null>(null);
  const [busy, setBusy] = useState(false);
  const userRef = useRef<HTMLInputElement>(null);
  const pwRef = useRef<HTMLInputElement>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    // The card is noValidate, so the classic `required` check happens here: an empty field is never sent.
    const empty = { user: username === '', pw: password === '' };
    if (empty.user || empty.pw) {
      setMissing(empty);
      (empty.user ? userRef : pwRef).current?.focus();
      return;
    }
    setError(null);
    setBusy(true);
    let u: AuthUser;
    try {
      u = await signIn(username, password);
    } catch (err) {
      setError(
        isUnreachable(err) ? authMessages.unreachable : isTooManyAttempts(err) ? authMessages.tooMany : messages.wrong,
      );
      return;
    } finally {
      setBusy(false);
    }
    // Outside the try, so a navigation error is never reported as a wrong password.
    // An account flagged for a password reset (the seeded admin) sets its own password before the console.
    if (u.passwordReset) {
      const back = from === paths.overview ? '' : `?from=${encodeURIComponent(from)}`;
      navigate(`${paths.setPassword}${back}`, { replace: true });
    } else {
      navigate(from, { replace: true });
    }
  }

  const notice = error
    ? null
    : state?.passwordChanged
      ? { tone: 'ok' as const, icon: <IconCheck size={16} />, text: intl.formatMessage(messages.passwordChanged) }
      : state?.resetExpired
        ? {
            tone: 'info' as const,
            icon: <IconClock size={16} />,
            text: intl.formatMessage(messages.resetExpired),
          }
        : state?.sessionExpired
          ? {
              tone: 'info' as const,
              icon: <IconClock size={16} />,
              text: intl.formatMessage(messages.sessionExpired),
            }
          : null;

  return (
    <AuthLayout title={intl.formatMessage(messages.title)} onSubmit={onSubmit} footer={<AuthFooter showVersion />}>
      {notice ? (
        <Callout tone={notice.tone} icon={notice.icon} role="status">
          {notice.text}
        </Callout>
      ) : null}

      <Field
        label={intl.formatMessage(messages.username)}
        error={missing.user ? intl.formatMessage(messages.usernameMissing) : undefined}
      >
        <Input
          ref={userRef}
          size="lg"
          type="text"
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus
          required
          value={username}
          onChange={(e) => {
            setUsername(e.target.value);
            if (missing.user) setMissing((m) => ({ ...m, user: false }));
          }}
        />
      </Field>

      <Field
        label={intl.formatMessage(messages.password)}
        error={missing.pw ? intl.formatMessage(messages.passwordMissing) : undefined}
      >
        <PasswordInput
          ref={pwRef}
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (missing.pw) setMissing((m) => ({ ...m, pw: false }));
          }}
        />
      </Field>

      {error ? (
        <Callout tone="alert" icon={<IconAlert size={16} />} role="alert">
          {intl.formatMessage(error)}
        </Callout>
      ) : null}

      <Button type="submit" variant="primary" size="lg" disabled={busy}>
        {intl.formatMessage(busy ? messages.signingIn : messages.signIn)}
      </Button>
    </AuthLayout>
  );
}
