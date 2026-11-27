import { createIntl } from 'react-intl';
import { describe, expect, it } from 'vitest';
import { configDescription, configName } from './seededConfigs';

const en = createIntl({ locale: 'en' });
const fr = createIntl({
  locale: 'fr',
  messages: {
    'configurations.seeded.background': 'Mode arrière-plan (agent)',
    'configurations.seeded.background.description': 'L’agent tourne en arrière-plan.',
    'configurations.seeded.default': 'Par défaut',
  },
});

describe('seeded configurations', () => {
  it('shows the built-in templates in the console language, and English as seeded', () => {
    expect(configName(fr, { id: 3, name: 'Background (Agent) Mode' })).toBe('Mode arrière-plan (agent)');
    expect(configName(en, { id: 3, name: 'Background (Agent) Mode' })).toBe('Background (Agent) Mode');
    expect(
      configDescription(fr, {
        id: 3,
        name: 'Background (Agent) Mode',
        description:
          'The MDMesh agent runs in the background to install apps and report device status. The user can use the device freely (permissive mode).',
      }),
    ).toBe('L’agent tourne en arrière-plan.');
  });

  it('shows the Russian Liquibase default translated, whatever its id', () => {
    expect(configName(fr, { id: 7, name: 'По умолчанию' })).toBe('Par défaut');
    expect(configName(en, { id: 7, name: 'По умолчанию' })).toBe('Default');
  });

  it('leaves a copy, a reused name and an edited description as typed', () => {
    expect(configName(fr, { id: 12, name: 'Background (Agent) Mode' })).toBe('Background (Agent) Mode');
    expect(configName(fr, { id: 4, name: 'Accueil' })).toBe('Accueil');
    expect(configDescription(fr, { id: 3, name: 'Background (Agent) Mode', description: 'Téléphones de service' })).toBe(
      'Téléphones de service',
    );
    expect(configName(fr, null)).toBe('');
  });

  it('shows a configuration named like something every object inherits as typed', () => {
    for (const name of ['constructor', 'toString', '__proto__']) {
      expect(configName(fr, { id: 4, name })).toBe(name);
      expect(configDescription(fr, { id: 4, name, description: 'Shared tablets' })).toBe('Shared tablets');
    }
  });
});
