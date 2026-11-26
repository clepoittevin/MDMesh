// The configurations the server seeds, shown in the console's language. The installers seed three English templates
// (install/sql/hmdm_init.en.sql, ids 1–3), and Headwind's Liquibase seed a Russian default ('По умолчанию') that a
// database not seeded by an installer keeps. The database keeps those names: the built-in templates are recognised by
// id and English name (configurationRules.ts isLocked), so renaming them would unlock them. A configuration an admin
// created or renamed, and a description an admin changed, show as typed.
import { defineMessages, type IntlShape, type MessageDescriptor } from 'react-intl';

type Seeded = 'managedLauncher' | 'miui' | 'background' | 'default';

/** Seeded name → configuration, and its seeded description. `ids`: the seed ids the name must have (none: any id). */
const SEED: Readonly<Record<string, { key: Seeded; description: string; ids?: readonly number[] }>> = {
  'Managed Launcher': {
    key: 'managedLauncher',
    ids: [1],
    description:
      'Displays a set of application icons predefined by the administrator. To show or hide applications, use the Applications tab.',
  },
  'MIUI (Xiaomi Redmi)': { key: 'miui', ids: [2], description: 'Optimized for MIUI-running devices' },
  'Background (Agent) Mode': {
    key: 'background',
    ids: [3],
    description:
      'The MDMesh agent runs in the background to install apps and report device status. The user can use the device freely (permissive mode).',
  },
  'По умолчанию': { key: 'default', description: 'Базовая конфигурация для всех устройств' },
};

const names = defineMessages<Seeded>({
  managedLauncher: { id: 'configurations.seeded.managedLauncher', defaultMessage: 'Managed Launcher' },
  miui: { id: 'configurations.seeded.miui', defaultMessage: 'MIUI (Xiaomi Redmi)' },
  background: { id: 'configurations.seeded.background', defaultMessage: 'Background (Agent) Mode' },
  default: { id: 'configurations.seeded.default', defaultMessage: 'Default' },
}) as Record<Seeded, MessageDescriptor>;

const descriptions = defineMessages<Seeded>({
  managedLauncher: {
    id: 'configurations.seeded.managedLauncher.description',
    defaultMessage:
      'Displays a set of application icons predefined by the administrator. To show or hide applications, use the Applications tab.',
  },
  miui: { id: 'configurations.seeded.miui.description', defaultMessage: 'Optimized for MIUI-running devices' },
  background: {
    id: 'configurations.seeded.background.description',
    defaultMessage:
      'The MDMesh agent runs in the background to install apps and report device status. The user can use the device freely (permissive mode).',
  },
  default: { id: 'configurations.seeded.default.description', defaultMessage: 'Basic configuration for all devices' },
}) as Record<Seeded, MessageDescriptor>;

interface ConfigLike {
  id?: number | null;
  name?: string | null;
  description?: string | null;
}

function seeded(c: ConfigLike) {
  const seed = SEED[c.name?.trim() ?? ''];
  if (!seed) return null;
  if (seed.ids && (c.id == null || !seed.ids.includes(c.id))) return null;
  return seed;
}

/** The configuration's name to show: a seeded one in the console's language, anything else as typed. */
export function configName(intl: IntlShape, c: ConfigLike | null | undefined): string {
  if (!c) return '';
  const seed = seeded(c);
  return seed ? intl.formatMessage(names[seed.key]) : (c.name ?? '');
}

/** The configuration's description to show: a seeded description translated unless an admin changed it. */
export function configDescription(intl: IntlShape, c: ConfigLike | null | undefined): string {
  if (!c) return '';
  const description = c.description?.trim() ?? '';
  const seed = seeded(c);
  if (seed && description === seed.description) return intl.formatMessage(descriptions[seed.key]);
  return description;
}
