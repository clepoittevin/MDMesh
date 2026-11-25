// The roles and their descriptions that Headwind's Liquibase seed writes in Russian (db.changelog.xml: userRoles 1–3,
// and the Observer role added later). The database keeps those names: upstream migrations find roles by them
// (`WHERE name IN ('Администратор', …)`), so renaming them would break a later update. The console shows them in the
// console's language instead. A role an admin renamed, or created, shows as typed.
import { defineMessages, type IntlShape, type MessageDescriptor } from 'react-intl';

type Seeded = 'superAdmin' | 'admin' | 'user' | 'observer';

/** Seeded name → role, and the seeded (untouched) description. */
const SEED: Readonly<Record<string, { key: Seeded; description: string }>> = {
  'Супер-Администратор': { key: 'superAdmin', description: 'Всевидящее око Саурона' },
  'Администратор': { key: 'admin', description: 'Выполняет функции администратора для одной клиентской записи' },
  'Пользователь': { key: 'user', description: 'Пользователь для одной клиентской записи' },
  'Наблюдатель': { key: 'observer', description: 'Наблюдатель зорко наблюдает' },
};

/** The seeded ids, for a seeded role whose name no longer matches (an older seed, or a partial rename). */
const BY_ID: Readonly<Record<number, Seeded>> = { 1: 'superAdmin', 2: 'admin', 3: 'user' };

const names = defineMessages<Seeded>({
  superAdmin: { id: 'roles.seeded.superAdmin', defaultMessage: 'Super admin' },
  admin: { id: 'roles.seeded.admin', defaultMessage: 'Admin' },
  user: { id: 'roles.seeded.user', defaultMessage: 'User' },
  observer: { id: 'roles.seeded.observer', defaultMessage: 'Observer' },
}) as Record<Seeded, MessageDescriptor>;

const descriptions = defineMessages<Seeded>({
  superAdmin: { id: 'roles.seeded.superAdmin.description', defaultMessage: 'Manages every organization on this server' },
  admin: { id: 'roles.seeded.admin.description', defaultMessage: 'Administers one organization' },
  user: { id: 'roles.seeded.user.description', defaultMessage: 'Manages the devices of one organization' },
  observer: { id: 'roles.seeded.observer.description', defaultMessage: 'Sees the devices without changing them' },
}) as Record<Seeded, MessageDescriptor>;

const CYRILLIC = /[Ѐ-ӿ]/;

interface RoleLike {
  id?: number;
  name?: string;
  description?: string | null;
}

function seededKey(role: RoleLike): Seeded | null {
  const name = role.name?.trim() ?? '';
  const seed = SEED[name];
  if (seed) return seed.key;
  // Still Russian but not a seeded name we know: the seeded ids are the next best guess.
  if (CYRILLIC.test(name) && role.id != null && BY_ID[role.id]) return BY_ID[role.id];
  return null;
}

/** Whether the role still has a name from Headwind's Russian seed (shown translated). */
export const isSeededRole = (role: RoleLike): boolean => seededKey(role) !== null;

/** The role's name to show: a seeded one in the console's language, anything else as typed. */
export function roleName(intl: IntlShape, role: RoleLike): string {
  const key = seededKey(role);
  return key ? intl.formatMessage(names[key]) : (role.name ?? '');
}

/** The role's description to show: a seeded description translated unless an admin changed it. */
export function roleDescription(intl: IntlShape, role: RoleLike): string {
  const key = seededKey(role);
  const description = role.description?.trim() ?? '';
  if (!key) return description;
  const seed = SEED[role.name?.trim() ?? ''];
  if (!description || description === seed?.description || CYRILLIC.test(description)) {
    return intl.formatMessage(descriptions[key]);
  }
  return description;
}
