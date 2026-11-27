// The seeded roles and their descriptions. Headwind's Liquibase seed writes them in Russian (db.changelog.xml:
// userRoles 1–3, and the Observer role added later); the installers then rename them in English
// (install/sql/hmdm_init.en.sql), but a database seeded another way keeps the Russian. Upstream migrations find roles by
// those names (`WHERE name IN ('Администратор', …)`), so the console doesn't rename them: it shows either seed in the
// console's language. Only those exact names and descriptions are translated: a role an admin renamed or created, and a
// description an admin wrote (in Russian too), show as typed.
import { defineMessages, type IntlShape, type MessageDescriptor } from 'react-intl';
import { own } from './own';

type Seeded = 'superAdmin' | 'admin' | 'user' | 'observer';

/** Seeded name → role, and the seeded (untouched) description. */
const SEED: Readonly<Record<string, { key: Seeded; description: string }>> = {
  'Супер-Администратор': { key: 'superAdmin', description: 'Всевидящее око Саурона' },
  'Администратор': { key: 'admin', description: 'Выполняет функции администратора для одной клиентской записи' },
  'Пользователь': { key: 'user', description: 'Пользователь для одной клиентской записи' },
  'Наблюдатель': { key: 'observer', description: 'Наблюдатель зорко наблюдает' },
  // The installers' English seed (hmdm_init.en.sql).
  'Super-Admin': { key: 'superAdmin', description: 'Can sign in as any user. In shared mode, manages corporate accounts' },
  Admin: { key: 'admin', description: 'Full access to the control panel' },
  User: { key: 'user', description: 'Limited access to the control panel' },
  Observer: { key: 'observer', description: 'Read-only access to the control panel' },
};

const names = defineMessages<Seeded>({
  superAdmin: { id: 'roles.seeded.superAdmin', defaultMessage: 'Super admin' },
  admin: { id: 'roles.seeded.admin', defaultMessage: 'Admin' },
  user: { id: 'roles.seeded.user', defaultMessage: 'User' },
  observer: { id: 'roles.seeded.observer', defaultMessage: 'Observer' },
}) as Record<Seeded, MessageDescriptor>;

const descriptions = defineMessages<Seeded>({
  superAdmin: {
    id: 'roles.seeded.superAdmin.description',
    defaultMessage: 'Can sign in as any user. In shared mode, manages corporate accounts',
  },
  admin: { id: 'roles.seeded.admin.description', defaultMessage: 'Full access to the control panel' },
  user: { id: 'roles.seeded.user.description', defaultMessage: 'Limited access to the control panel' },
  observer: { id: 'roles.seeded.observer.description', defaultMessage: 'Read-only access to the control panel' },
}) as Record<Seeded, MessageDescriptor>;

const CYRILLIC = /[Ѐ-ӿ]/;

interface RoleLike {
  id?: number;
  name?: string;
  description?: string | null;
}

const seededKey = (role: RoleLike): Seeded | null => own(SEED, role.name?.trim() ?? '')?.key ?? null;

/** Whether the role still has a name from Headwind's Russian seed (shown translated, kept in the database). */
export const isSeededRole = (role: RoleLike): boolean => seededKey(role) !== null && CYRILLIC.test(role.name ?? '');

/** The role's name to show: a seeded one in the console's language, anything else as typed. */
export function roleName(intl: IntlShape, role: RoleLike): string {
  const key = seededKey(role);
  return key ? intl.formatMessage(names[key]) : (role.name ?? '');
}

/** The role's description to show: its seeded description (of either seed) translated, anything else as typed. */
export function roleDescription(intl: IntlShape, role: RoleLike): string {
  const key = seededKey(role);
  const description = role.description?.trim() ?? '';
  const seeded = key && Object.values(SEED).some((seed) => seed.key === key && seed.description === description);
  return seeded ? intl.formatMessage(descriptions[key]) : description;
}
