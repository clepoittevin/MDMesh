import { useEffect, useState } from 'react';
import { defineMessages, useIntl, type MessageDescriptor } from 'react-intl';
import { useAuth } from '../../auth/AuthContext';
import { roleDescription, roleName } from '../../data/seededRoles';
import {
  deleteRole,
  deleteUser,
  listAssignableRoles,
  listEditableRoles,
  listPermissions,
  listUsers,
  managementError,
  type ManagedUser,
  type Permission,
  type UserRole,
  type ManagementCapabilities,
} from '../../api/users';
import {
  Badge,
  Button,
  Callout,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Field,
  Menu,
  Modal,
  PasswordInput,
  SearchInput,
  SkeletonRows,
  Table,
  TabPanel,
  Tabs,
  useStickyValue,
  useToast,
  type MenuItem,
} from '../../ui';
import { UserEditor } from '../users/UserEditor';
import { RoleEditor } from '../users/RoleEditor';
import './UsersSection.css';

type Snapshot = {
  capabilities: ManagementCapabilities;
  users: ManagedUser[];
  assignable: UserRole[];
  roles: UserRole[];
  permissions: Permission[];
};
type Deleting = { kind: 'user' | 'role'; id: number; name: string };
type View = 'users' | 'roles';

const TABS_ID = 'v2-users-tabs';

const messages = defineMessages<'rowAction' | 'moreActions' | 'edit' | 'delete' | 'usersTable' | 'noMatchingUsers' | 'noUsers' | 'colUser' | 'colEmail' | 'colRole' | 'colAccess' | 'colActions' | 'colDescription' | 'colPermissions' | 'you' | 'beyond' | 'beyondTitle' | 'access' | 'rolesTable' | 'noMatchingRoles' | 'noRoles' | 'title' | 'subtitle' | 'newRole' | 'newUser' | 'thing' | 'loading' | 'manage' | 'tabUsers' | 'tabRoles' | 'searchRoles' | 'searchUsers' | 'protectedRoles' | 'userSavedTitle' | 'userSavedBody' | 'roleSavedTitle' | 'roleSavedBody' | 'userDeletedTitle' | 'userDeletedBody' | 'roleDeletedTitle' | 'roleDeletedBody' | 'deleteTitle' | 'cancel' | 'deleting' | 'deleteRole' | 'deleteUser' | 'deleteRoleText' | 'deleteUserText' | 'currentPassword' | 'currentPasswordHelp' | 'showCurrent'>({
  rowAction: { id: 'settings.users.rowAction', defaultMessage: '{action} {name}' },
  moreActions: { id: 'settings.users.moreActions', defaultMessage: 'More actions for {name}' },
  edit: { id: 'settings.users.edit', defaultMessage: 'Edit' },
  delete: { id: 'settings.users.delete', defaultMessage: 'Delete' },
  usersTable: { id: 'settings.users.usersTable', defaultMessage: 'Users' },
  noMatchingUsers: { id: 'settings.users.noMatchingUsers', defaultMessage: 'No matching users' },
  noUsers: { id: 'settings.users.noUsers', defaultMessage: 'No users yet' },
  colUser: { id: 'settings.users.colUser', defaultMessage: 'User' },
  colEmail: { id: 'settings.users.colEmail', defaultMessage: 'Email' },
  colRole: { id: 'settings.users.colRole', defaultMessage: 'Role' },
  colAccess: { id: 'settings.users.colAccess', defaultMessage: 'Access' },
  colActions: { id: 'settings.users.colActions', defaultMessage: 'Actions' },
  colDescription: { id: 'settings.users.colDescription', defaultMessage: 'Description' },
  colPermissions: { id: 'settings.users.colPermissions', defaultMessage: 'Permissions' },
  you: { id: 'settings.users.you', defaultMessage: 'You' },
  beyond: { id: 'settings.users.beyond', defaultMessage: 'Beyond your access' },
  beyondTitle: {
    id: 'settings.users.beyondTitle',
    defaultMessage: 'This account reaches more than you do, or only a super-admin manages it.',
  },
  access: {
    id: 'settings.users.access',
    defaultMessage:
      '{devices, select, all {All devices} other {Selected device groups}} · {configs, select, all {All configurations} other {Selected configurations}}',
  },
  rolesTable: { id: 'settings.users.rolesTable', defaultMessage: 'Roles' },
  noMatchingRoles: { id: 'settings.users.noMatchingRoles', defaultMessage: 'No matching roles' },
  noRoles: { id: 'settings.users.noRoles', defaultMessage: 'No editable roles yet' },
  title: { id: 'settings.users.title', defaultMessage: 'Users & roles' },
  subtitle: {
    id: 'settings.users.subtitle',
    defaultMessage: 'Console accounts, what they may do, and which devices they reach.',
  },
  newRole: { id: 'settings.users.newRole', defaultMessage: 'New role' },
  newUser: { id: 'settings.users.newUser', defaultMessage: 'New user' },
  thing: { id: 'settings.users.thing', defaultMessage: 'users and roles' },
  loading: { id: 'settings.users.loading', defaultMessage: 'Loading users and roles' },
  manage: { id: 'settings.users.manage', defaultMessage: 'Manage' },
  tabUsers: { id: 'settings.users.tabUsers', defaultMessage: 'Users' },
  tabRoles: { id: 'settings.users.tabRoles', defaultMessage: 'Roles' },
  searchRoles: { id: 'settings.users.searchRoles', defaultMessage: 'Search roles' },
  searchUsers: { id: 'settings.users.searchUsers', defaultMessage: 'Search users' },
  protectedRoles: {
    id: 'settings.users.protectedRoles',
    defaultMessage: 'Administrator roles are protected, so only roles you can edit are listed.',
  },
  userSavedTitle: { id: 'settings.users.userSavedTitle', defaultMessage: 'User saved' },
  userSavedBody: { id: 'settings.users.userSavedBody', defaultMessage: 'The account list is up to date.' },
  roleSavedTitle: { id: 'settings.users.roleSavedTitle', defaultMessage: 'Role saved' },
  roleSavedBody: { id: 'settings.users.roleSavedBody', defaultMessage: 'The role list is up to date.' },
  userDeletedTitle: { id: 'settings.users.userDeletedTitle', defaultMessage: 'User deleted' },
  userDeletedBody: { id: 'settings.users.userDeletedBody', defaultMessage: '{name} can no longer sign in.' },
  roleDeletedTitle: { id: 'settings.users.roleDeletedTitle', defaultMessage: 'Role deleted' },
  roleDeletedBody: { id: 'settings.users.roleDeletedBody', defaultMessage: '{name} is no longer available.' },
  deleteTitle: {
    id: 'settings.users.deleteTitle',
    defaultMessage: 'Delete {name}?',
    description: 'DESTRUCTIVE: title of the confirmation for deleting a user account or a role',
  },
  cancel: { id: 'settings.users.cancel', defaultMessage: 'Cancel' },
  deleting: { id: 'settings.users.deleting', defaultMessage: 'Deleting…' },
  deleteRole: {
    id: 'settings.users.deleteRole',
    defaultMessage: 'Delete role',
    description: 'DESTRUCTIVE: confirms deleting a role',
  },
  deleteUser: {
    id: 'settings.users.deleteUser',
    defaultMessage: 'Delete user',
    description: 'DESTRUCTIVE: confirms deleting a user account',
  },
  deleteRoleText: {
    id: 'settings.users.deleteRoleText',
    defaultMessage: 'Only a role no one is assigned to can be deleted.',
  },
  deleteUserText: {
    id: 'settings.users.deleteUserText',
    defaultMessage: 'This account can no longer sign in to the console.',
  },
  currentPassword: { id: 'settings.users.currentPassword', defaultMessage: 'Your current password' },
  currentPasswordHelp: { id: 'settings.users.currentPasswordHelp', defaultMessage: 'Needed to delete an account.' },
  showCurrent: { id: 'settings.users.showCurrent', defaultMessage: 'Show your current password' },
}) as Record<'rowAction' | 'moreActions' | 'edit' | 'delete' | 'usersTable' | 'noMatchingUsers' | 'noUsers' | 'colUser' | 'colEmail' | 'colRole' | 'colAccess' | 'colActions' | 'colDescription' | 'colPermissions' | 'you' | 'beyond' | 'beyondTitle' | 'access' | 'rolesTable' | 'noMatchingRoles' | 'noRoles' | 'title' | 'subtitle' | 'newRole' | 'newUser' | 'thing' | 'loading' | 'manage' | 'tabUsers' | 'tabRoles' | 'searchRoles' | 'searchUsers' | 'protectedRoles' | 'userSavedTitle' | 'userSavedBody' | 'roleSavedTitle' | 'roleSavedBody' | 'userDeletedTitle' | 'userDeletedBody' | 'roleDeletedTitle' | 'roleDeletedBody' | 'deleteTitle' | 'cancel' | 'deleting' | 'deleteRole' | 'deleteUser' | 'deleteRoleText' | 'deleteUserText' | 'currentPassword' | 'currentPasswordHelp' | 'showCurrent', MessageDescriptor>;

/** Text kept to one line, ending in "…" when its column is narrow (the full text on hover). */
function Clip({ text, sub }: { text: string; sub?: boolean }) {
  return (
    <span className={sub ? 'v2-users-clip v2-users-clip--sub' : 'v2-users-clip'} title={text}>
      {text}
    </span>
  );
}

/** Row actions, shown on row hover or focus: a "…" menu, or its one action as a visible button. */
function RowActions({ name, items }: { name: string; items: MenuItem[] }) {
  const intl = useIntl();
  if (items.length === 0) return null;
  const [only] = items;
  return (
    <div className="v2-rowactions">
      {items.length === 1 ? (
        <Button size="sm" variant="ghost" aria-label={intl.formatMessage(messages.rowAction, { action: only.textValue, name })} onClick={only.onSelect}>
          {only.label}
        </Button>
      ) : (
        <Menu label={intl.formatMessage(messages.moreActions, { name })} iconSize="xs" items={items} />
      )}
    </div>
  );
}

export function UsersSection({
  capabilities,
  anchorId,
  headingId,
}: {
  capabilities: ManagementCapabilities;
  anchorId: string;
  headingId: string;
}) {
  const { user } = useAuth();
  const intl = useIntl();
  const toast = useToast();
  const [data, setData] = useState<Snapshot | null>(null);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<View>('users');
  const [q, setQ] = useState('');
  const [editingUser, setEditingUser] = useState<ManagedUser | 'new' | null>(null);
  const [editingRole, setEditingRole] = useState<UserRole | 'new' | null>(null);
  // Each opening is a fresh form (a new key); a closed dialog stays mounted with what it showed, so it animates out.
  const [session, setSession] = useState(0);
  const shownUser = useStickyValue(editingUser);
  const shownRole = useStickyValue(editingRole);
  const [deleting, setDeleting] = useState<Deleting | null>(null);
  const shownDelete = useStickyValue(deleting);
  const [deleteError, setDeleteError] = useState('');
  // Deleting an account takes the caller's own current password; kept for this dialog only
  const [deletePassword, setDeletePassword] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setData(null);
    (async () => {
      if (!capabilities.users) return { capabilities, users: [], assignable: [], roles: [], permissions: [] };
      const [users, assignable, roles, permissions] = await Promise.all([
        listUsers(controller.signal),
        listAssignableRoles(controller.signal),
        capabilities.roles ? listEditableRoles(controller.signal) : Promise.resolve([]),
        capabilities.roles ? listPermissions(controller.signal) : Promise.resolve([]),
      ]);
      return {
        capabilities,
        users: users ?? [],
        assignable: assignable ?? [],
        roles: roles ?? [],
        permissions: permissions ?? [],
      };
    })()
      .then((snapshot) => {
        if (!controller.signal.aborted) setData(snapshot);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(managementError(intl, e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [revision, user, capabilities]);
  // The shell remounts pages across account changes. A permission refresh also closes open administration forms.
  useEffect(() => {
    setEditingUser(null);
    setEditingRole(null);
    setDeleting(null);
    setDeletePassword('');
  }, [user]);
  const editUser = (target: ManagedUser | 'new') => {
    setSession((n) => n + 1);
    setEditingUser(target);
  };
  const editRole = (target: UserRole | 'new') => {
    setSession((n) => n + 1);
    setEditingRole(target);
  };
  const saved = (title: string, body: string) => {
    setEditingUser(null);
    setEditingRole(null);
    setDeleting(null);
    setDeletePassword('');
    toast.push('ok', title, body);
    setRevision((r) => r + 1);
  };
  const confirmDelete = async () => {
    if (!deleting || busy || (deleting.kind === 'user' && !deletePassword)) return;
    setBusy(true);
    setDeleteError('');
    try {
      if (deleting.kind === 'user') await deleteUser(deleting.id, deletePassword);
      else await deleteRole(deleting.id);
      if (deleting.kind === 'user') {
        saved(
          intl.formatMessage(messages.userDeletedTitle),
          intl.formatMessage(messages.userDeletedBody, { name: deleting.name }),
        );
      } else {
        saved(
          intl.formatMessage(messages.roleDeletedTitle),
          intl.formatMessage(messages.roleDeletedBody, { name: deleting.name }),
        );
      }
    } catch (e) {
      setDeleteError(managementError(intl, e));
    } finally {
      setBusy(false);
    }
  };
  const closeDelete = () => {
    setDeleting(null);
    setDeletePassword('');
  };
  const askDelete = (kind: 'user' | 'role', id: number, name: string) => {
    setDeleteError('');
    setDeletePassword('');
    setDeleting({ kind, id, name });
  };
  if (!capabilities.users) return null;
  const needle = q.trim().toLowerCase();
  const rolesTab = tab === 'roles' && !!data?.capabilities.roles;
  const iAmSuper = !!(user?.superAdmin || user?.userRole?.superAdmin);
  // The server decides (UserResource.getUsers, UserDAO.manageableAccounts); the caller's own row has its own routes.
  const beyondReach = (u: ManagedUser) => u.id !== user?.id && u.editable === false;

  /** What this account may do to another one (the server enforces the same). */
  const userActions = (u: ManagedUser): MenuItem[] => {
    if (u.id === user?.id || u.editable === false || (u.userRole?.superAdmin && !iAmSuper)) return [];
    const edit = intl.formatMessage(messages.edit);
    const del = intl.formatMessage(messages.delete);
    const items: MenuItem[] = [{ key: 'edit', label: edit, textValue: edit, onSelect: () => editUser(u) }];
    if (!u.userRole?.superAdmin) {
      items.push({
        key: 'delete',
        label: del,
        textValue: del,
        danger: true,
        onSelect: () => askDelete('user', u.id!, u.login),
      });
    }
    return items;
  };
  const roleActions = (r: UserRole): MenuItem[] => {
    const edit = intl.formatMessage(messages.edit);
    const del = intl.formatMessage(messages.delete);
    return [
      { key: 'edit', label: edit, textValue: edit, onSelect: () => editRole(r) },
      { key: 'delete', label: del, textValue: del, danger: true, onSelect: () => askDelete('role', r.id!, roleName(intl, r)) },
    ];
  };

  const usersTable = data ? (
    <Table
      minWidth={600}
      aria-label={intl.formatMessage(messages.usersTable)}
      className="v2-users-table"
      empty={
        <EmptyState
          bare
          title={intl.formatMessage(needle ? messages.noMatchingUsers : messages.noUsers)}
        />
      }
      rowKey={(u) => u.id!}
      rows={data.users.filter((u) => `${u.login} ${u.name ?? ''} ${u.email ?? ''}`.toLowerCase().includes(needle))}
      onRowClick={(u) => {
        if (userActions(u).length) editUser(u);
      }}
      columns={[
        {
          key: 'user',
          header: intl.formatMessage(messages.colUser),
          className: 'v2-users-col v2-users-col--wide',
          cell: (u) => (
            <span className="v2-users-who">
              <span className="v2-users-who__line">
                <Clip text={u.name || u.login} />
                {u.id === user?.id ? <Badge tone="neutral">{intl.formatMessage(messages.you)}</Badge> : null}
                {beyondReach(u) ? (
                  <Badge tone="neutral" title={intl.formatMessage(messages.beyondTitle)}>
                    {intl.formatMessage(messages.beyond)}
                  </Badge>
                ) : null}
              </span>
              {u.name ? <Clip text={u.login} sub /> : null}
            </span>
          ),
        },
        { key: 'email', header: intl.formatMessage(messages.colEmail), className: 'v2-users-col', cell: (u) => (u.email ? <Clip text={u.email} /> : '—') },
        { key: 'role', header: intl.formatMessage(messages.colRole), className: 'v2-users-col', cell: (u) => <Clip text={(u.userRole && roleName(intl, u.userRole)) || '—'} /> },
        {
          key: 'access',
          header: intl.formatMessage(messages.colAccess),
          className: 'v2-users-col v2-users-col--wide',
          cell: (u) => (
            <Clip
              text={intl.formatMessage(messages.access, {
                devices: u.allDevicesAvailable ? 'all' : 'selected',
                configs: u.allConfigAvailable ? 'all' : 'selected',
              })}
            />
          ),
        },
        {
          key: 'actions',
          header: intl.formatMessage(messages.colActions),
          headerHidden: true,
          shrink: true,
          align: 'right',
          cell: (u) => <RowActions name={u.login} items={userActions(u)} />,
        },
      ]}
    />
  ) : null;

  const rolesTable = data ? (
    <Table
      minWidth={480}
      aria-label={intl.formatMessage(messages.rolesTable)}
      className="v2-users-table"
      empty={
        <EmptyState bare title={intl.formatMessage(needle ? messages.noMatchingRoles : messages.noRoles)} />
      }
      rowKey={(r) => r.id!}
      rows={data.roles.filter((r) =>
        `${r.name} ${roleName(intl, r)} ${roleDescription(intl, r)}`.toLowerCase().includes(needle),
      )}
      onRowClick={(r) => editRole(r)}
      columns={[
        { key: 'name', header: intl.formatMessage(messages.colRole), className: 'v2-users-col', cell: (r) => <Clip text={roleName(intl, r)} /> },
        {
          key: 'description',
          header: intl.formatMessage(messages.colDescription),
          className: 'v2-users-col v2-users-col--wide',
          cell: (r) => {
            const description = roleDescription(intl, r);
            return description ? <Clip text={description} /> : '—';
          },
        },
        {
          key: 'permissions',
          header: intl.formatMessage(messages.colPermissions),
          align: 'right',
          shrink: true,
          cell: (r) => <span className="v2-num">{(r.permissions ?? []).length}</span>,
        },
        {
          key: 'actions',
          header: intl.formatMessage(messages.colActions),
          headerHidden: true,
          shrink: true,
          align: 'right',
          cell: (r) => <RowActions name={roleName(intl, r)} items={roleActions(r)} />,
        },
      ]}
    />
  ) : null;

  return (
    <Card id={anchorId} aria-labelledby={headingId} padding="list" className="v2-settings-card v2-users">
      <CardHeader
        inset
        titleId={headingId}
        title={intl.formatMessage(messages.title)}
        subtitle={intl.formatMessage(messages.subtitle)}
        actions={
          data && !loading ? (
            <Button variant="primary" size="sm" onClick={() => (rolesTab ? editRole('new') : editUser('new'))}>
              {intl.formatMessage(rolesTab ? messages.newRole : messages.newUser)}
            </Button>
          ) : undefined
        }
      />
      {error ? (
        <div className="v2-users-pad">
          <ErrorState thing={intl.formatMessage(messages.thing)} detail={error} onRetry={() => setRevision((r) => r + 1)} />
        </div>
      ) : null}
      {loading ? (
        <SkeletonRows count={3} label={intl.formatMessage(messages.loading)} />
      ) : data ? (
        <>
          <div className="v2-users-toolbar">
            {data.capabilities.roles ? (
              <Tabs<View>
                aria-label={intl.formatMessage(messages.manage)}
                size="md"
                idBase={TABS_ID}
                value={tab}
                onChange={(next) => {
                  if (next === tab) return;
                  setTab(next);
                  setQ('');
                }}
                items={[
                  { key: 'users', label: intl.formatMessage(messages.tabUsers) },
                  { key: 'roles', label: intl.formatMessage(messages.tabRoles) },
                ]}
              />
            ) : null}
            <SearchInput
              className="v2-users-search"
              value={q}
              onChange={setQ}
              placeholder={intl.formatMessage(rolesTab ? messages.searchRoles : messages.searchUsers)}
              aria-label={intl.formatMessage(rolesTab ? messages.searchRoles : messages.searchUsers)}
            />
          </div>
          {data.capabilities.roles ? (
            <TabPanel idBase={TABS_ID} tabKey={tab} className="v2-users-panel">
              {rolesTab ? (
                <>
                  <div className="v2-users-pad">
                    <Callout>{intl.formatMessage(messages.protectedRoles)}</Callout>
                  </div>
                  {rolesTable}
                </>
              ) : (
                usersTable
              )}
            </TabPanel>
          ) : (
            usersTable
          )}
        </>
      ) : null}
      {shownUser ? (
        <UserEditor
          key={`user-${session}`}
          open={editingUser !== null}
          target={shownUser}
          roles={data?.assignable ?? []}
          onClose={() => setEditingUser(null)}
          onSaved={() => saved(intl.formatMessage(messages.userSavedTitle), intl.formatMessage(messages.userSavedBody))}
        />
      ) : null}
      {shownRole ? (
        <RoleEditor
          key={`role-${session}`}
          open={editingRole !== null}
          target={shownRole}
          permissions={data?.permissions ?? []}
          onClose={() => setEditingRole(null)}
          onSaved={() => saved(intl.formatMessage(messages.roleSavedTitle), intl.formatMessage(messages.roleSavedBody))}
        />
      ) : null}
      <Modal
        open={deleting !== null}
        role="alertdialog"
        size="sm"
        title={intl.formatMessage(messages.deleteTitle, { name: shownDelete?.name ?? '' })}
        dismissOnBackdrop={false}
        onClose={() => {
          if (!busy) closeDelete();
        }}
        footer={
          <>
            <Button size="lg" disabled={busy} onClick={closeDelete}>
              {intl.formatMessage(messages.cancel)}
            </Button>
            <Button
              variant="danger-primary"
              size="lg"
              disabled={busy || (shownDelete?.kind === 'user' && !deletePassword)}
              onClick={() => void confirmDelete()}
            >
              {busy
                ? intl.formatMessage(messages.deleting)
                : intl.formatMessage(shownDelete?.kind === 'role' ? messages.deleteRole : messages.deleteUser)}
            </Button>
          </>
        }
      >
        <p className="v2-users-text">
          {intl.formatMessage(shownDelete?.kind === 'role' ? messages.deleteRoleText : messages.deleteUserText)}
        </p>
        {shownDelete?.kind === 'user' ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void confirmDelete();
            }}
          >
            <Field
              label={intl.formatMessage(messages.currentPassword)}
              help={intl.formatMessage(messages.currentPasswordHelp)}
            >
              <PasswordInput
                value={deletePassword}
                required
                disabled={busy}
                autoComplete="current-password"
                toggleLabel={intl.formatMessage(messages.showCurrent)}
                onChange={(e) => setDeletePassword(e.target.value)}
              />
            </Field>
          </form>
        ) : null}
        {deleteError ? (
          <Callout tone="alert" role="alert">
            {deleteError}
          </Callout>
        ) : null}
      </Modal>
    </Card>
  );
}
