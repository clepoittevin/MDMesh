import { useState } from 'react';
import { defineMessages, useIntl, type MessageDescriptor } from 'react-intl';
import { authMessages } from '../../api/authMessages';
import { managementError, saveRole, type Permission, type UserRole } from '../../api/users';
import { isSeededRole, roleName } from '../../data/seededRoles';
import { Button, Callout, Checkbox, Field, Input, Modal, SearchInput, Textarea } from '../../ui';

const messages = defineMessages<'newTitle' | 'editTitle' | 'description' | 'cancel' | 'save' | 'name' | 'descriptionField' | 'permissions' | 'filter'>({
  newTitle: { id: 'users.roleEditor.newTitle', defaultMessage: 'New role' },
  editTitle: { id: 'users.roleEditor.editTitle', defaultMessage: 'Edit {name}' },
  description: {
    id: 'users.roleEditor.description',
    defaultMessage: 'Permission changes apply to every user with this role on their next server request.',
  },
  cancel: { id: 'users.roleEditor.cancel', defaultMessage: 'Cancel' },
  save: { id: 'users.roleEditor.save', defaultMessage: 'Save role' },
  name: { id: 'users.roleEditor.name', defaultMessage: 'Role name' },
  descriptionField: { id: 'users.roleEditor.descriptionField', defaultMessage: 'Description' },
  permissions: {
    id: 'users.roleEditor.permissions',
    defaultMessage: 'Permissions ({count} selected)',
  },
  filter: { id: 'users.roleEditor.filter', defaultMessage: 'Filter permissions' },
}) as Record<'newTitle' | 'editTitle' | 'description' | 'cancel' | 'save' | 'name' | 'descriptionField' | 'permissions' | 'filter', MessageDescriptor>;

export function RoleEditor({
  open = true,
  target,
  permissions,
  onClose,
  onSaved,
}: {
  /** False while it animates closed (the caller keeps it mounted). */
  open?: boolean;
  target: UserRole | 'new';
  permissions: Permission[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const intl = useIntl();
  const [draft, setDraft] = useState<UserRole>(
    target === 'new'
      ? { name: '', description: '', permissions: [] }
      : { ...target, permissions: target.permissions ?? [] },
  );
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await saveRole(draft);
      onSaved();
    } catch (e) {
      setError(managementError(intl, e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      title={
        target === 'new'
          ? intl.formatMessage(messages.newTitle)
          : intl.formatMessage(messages.editTitle, { name: roleName(intl, target) })
      }
      dismissOnBackdrop={false}
      description={intl.formatMessage(messages.description)}
      onClose={() => {
        if (!busy) onClose();
      }}
      footer={
        <>
          <Button size="lg" disabled={busy} onClick={onClose}>
            {intl.formatMessage(messages.cancel)}
          </Button>
          <Button size="lg" variant="primary" type="submit" form="role-form" disabled={busy}>
            {busy ? intl.formatMessage(authMessages.saving) : intl.formatMessage(messages.save)}
          </Button>
        </>
      }
    >
      {error && (
        <Callout tone="alert" role="alert">
          {error}
        </Callout>
      )}
      <form
        id="role-form"
        className="v2-users-form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <fieldset disabled={busy} className="v2-users-fields">
          <Field
            label={intl.formatMessage(messages.name)}
            help={
              target !== 'new' && isSeededRole(target)
                ? intl.formatMessage({
                    id: 'roles.editor.seededHint',
                    defaultMessage:
                      'Name from the original Russian setup, shown as “{shown}” in the console. Keep it: server updates find this role by it.',
                  }, { shown: roleName(intl, target) })
                : undefined
            }
          >
            <Input
              value={draft.name}
              required
              maxLength={50}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </Field>
          <Field label={intl.formatMessage(messages.descriptionField)}>
            <Textarea
              value={draft.description ?? ''}
              maxLength={1000}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            />
          </Field>
          <fieldset className="v2-users-scope">
            <legend>{intl.formatMessage(messages.permissions, { count: draft.permissions.length })}</legend>
            <SearchInput value={q} onChange={setQ} placeholder={intl.formatMessage(messages.filter)}
              aria-label={intl.formatMessage(messages.filter)}
            />
            <div className="v2-users-choices">
              {permissions
                .filter((p) => p.name.toLowerCase().includes(q.toLowerCase()))
                .map((p) => (
                  <Checkbox
                    key={p.id}
                    className="v2-users-choice"
                    checked={draft.permissions.some((v) => v.id === p.id)}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        permissions: e.target.checked
                          ? [...draft.permissions, p]
                          : draft.permissions.filter((v) => v.id !== p.id),
                      })
                    }
                    label={
                      <span>
                        {p.name.replace(/_/g, ' ')} <span className="v2-users-choice__code">({p.name})</span>
                      </span>
                    }
                  />
                ))}
            </div>
          </fieldset>
        </fieldset>
      </form>
    </Modal>
  );
}
