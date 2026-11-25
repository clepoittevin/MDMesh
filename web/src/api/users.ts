import { defineMessages, type IntlShape, type MessageDescriptor } from 'react-intl';
import { hashPassword, isTooManyAttempts } from './auth';
import { authMessages } from './authMessages';
import { apiClient, deleteWithBody } from './client';

export interface Permission {
  id: number;
  name: string;
}
export interface UserRole {
  id?: number;
  name: string;
  description?: string;
  superAdmin?: boolean;
  permissions: Permission[];
}
export interface AccessItem {
  id: number;
  name: string;
}
export interface ManagedUser {
  id?: number;
  login: string;
  name?: string;
  email?: string;
  userRole: UserRole;
  allDevicesAvailable: boolean;
  allConfigAvailable: boolean;
  groups: AccessItem[];
  configurations: AccessItem[];
  passwordReset?: boolean;
  editable?: boolean;
}
export interface ManagementCapabilities {
  users: boolean;
  roles: boolean;
}
export const getManagementCapabilities = (signal?: AbortSignal) =>
  apiClient.get<ManagementCapabilities>('/private/users/management', signal);
export const listUsers = (signal?: AbortSignal) => apiClient.get<ManagedUser[]>('/private/users/all', signal);
export const getUser = (id: number, signal?: AbortSignal) => apiClient.get<ManagedUser>(`/private/users/${id}`, signal);
export const listAssignableRoles = (signal?: AbortSignal) => apiClient.get<UserRole[]>('/private/users/roles', signal);
export const listEditableRoles = (signal?: AbortSignal) => apiClient.get<UserRole[]>('/private/roles/all', signal);
export const listPermissions = (signal?: AbortSignal) =>
  apiClient.get<Permission[]>('/private/roles/permissions', signal);
export const listGroups = (signal?: AbortSignal) => apiClient.get<AccessItem[]>('/private/groups/search', signal);
export const listAccessConfigurations = (signal?: AbortSignal) =>
  apiClient.get<AccessItem[]>('/private/configurations/list', signal);
/**
 * `currentPassword` is the caller's own: the server asks for it to create an account, and when another account's email
 * or password changes (recovery links go to that address). It goes with this request only.
 */
export async function saveUser(user: ManagedUser, password: string, currentPassword = ''): Promise<void> {
  // Explicit fields only: never round-trip account secrets or client-supplied role permissions.
  await apiClient.put('/private/users', {
    id: user.id,
    login: user.login.trim(),
    name: user.name?.trim(),
    email: user.email?.trim(),
    userRole: { id: user.userRole.id },
    allDevicesAvailable: user.allDevicesAvailable,
    allConfigAvailable: user.allConfigAvailable,
    groups: user.groups.map(({ id }) => ({ id })),
    configurations: user.configurations.map(({ id }) => ({ id })),
    ...(password ? { newPassword: hashPassword(password) } : {}),
    ...(currentPassword ? { oldPassword: hashPassword(currentPassword) } : {}),
  });
}
/** Deleting an account takes the caller's own current password; it goes with this request only. */
export const deleteUser = (id: number, currentPassword: string) =>
  deleteWithBody<void>(`/private/users/other/${id}`, { oldPassword: hashPassword(currentPassword) });
export const saveRole = (role: UserRole) =>
  apiClient.put<void>('/private/roles', {
    id: role.id,
    name: role.name.trim(),
    description: role.description?.trim(),
    permissions: role.permissions.map(({ id }) => ({ id })),
  });
export const deleteRole = (id: number) => apiClient.del<void>(`/private/roles/${id}`);

const errors = defineMessages({
  duplicateLogin: { id: 'users.error.duplicateLogin', defaultMessage: 'That login is already in use.' },
  duplicateEmail: { id: 'users.error.duplicateEmail', defaultMessage: 'That email address is already in use.' },
  duplicateRole: { id: 'users.error.duplicateRole', defaultMessage: 'A role with that name already exists.' },
  roleProtected: {
    id: 'users.error.roleProtected',
    defaultMessage: 'Administrator roles cannot be changed or deleted.',
  },
  roleInUse: {
    id: 'users.error.roleInUse',
    defaultMessage: 'This role is assigned to users. Assign them another role before deleting it.',
  },
  rolePermission: {
    id: 'users.error.rolePermission',
    defaultMessage: 'The selected permissions are not valid. Reload the page and try again.',
  },
  roleName: { id: 'users.error.roleName', defaultMessage: 'Enter a role name of up to 50 characters.' },
  roleSave: { id: 'users.error.roleSave', defaultMessage: 'Could not save the role. Reload and try again.' },
  roleDelete: {
    id: 'users.error.roleDelete',
    defaultMessage: 'Could not delete the role. It may still be assigned to users.',
  },
  passwordEmpty: { id: 'users.error.passwordEmpty', defaultMessage: 'Enter a password for the new account.' },
  passwordWrong: { id: 'users.error.passwordWrong', defaultMessage: 'Your current password is not correct.' },
  permissionDenied: {
    id: 'users.error.permissionDenied',
    defaultMessage:
      'Not allowed. You can give only the access you have, and change only accounts within your own access.',
  },
  userLogin: { id: 'users.error.userLogin', defaultMessage: 'Enter a login.' },
  userNotFound: { id: 'users.error.userNotFound', defaultMessage: 'This account no longer exists. Reload the page.' },
  removeSelf: { id: 'users.error.removeSelf', defaultMessage: 'You can’t delete your own account.' },
  generic: { id: 'users.error.generic', defaultMessage: 'Could not complete the operation.' },
});

/** The server's error codes, as the text the console shows for each. */
const messages: Record<string, MessageDescriptor> = {
  'error.duplicate.login': errors.duplicateLogin,
  'error.duplicate.email': errors.duplicateEmail,
  'error.duplicate.role': errors.duplicateRole,
  'error.role.protected': errors.roleProtected,
  'error.role.in.use': errors.roleInUse,
  'error.role.permission': errors.rolePermission,
  'error.role.name': errors.roleName,
  'error.role.save': errors.roleSave,
  'error.role.delete': errors.roleDelete,
  'error.password.empty': errors.passwordEmpty,
  'error.password.wrong': errors.passwordWrong,
  'error.password.impersonated': authMessages.impersonated,
  'error.permission.denied': errors.permissionDenied,
  'error.user.login': errors.userLogin,
  'error.user.not.found': errors.userNotFound,
  "Can't remove self": errors.removeSelf,
};
export function managementError(intl: IntlShape, error: unknown): string {
  if (isTooManyAttempts(error)) return intl.formatMessage(authMessages.tooMany);
  const message = error instanceof Error ? error.message : '';
  if (!message) return intl.formatMessage(errors.generic);
  const known = Object.prototype.hasOwnProperty.call(messages, message) ? messages[message] : undefined;
  return known ? intl.formatMessage(known) : message;
}
