import { createIntl } from 'react-intl';
import { describe, expect, it } from 'vitest';
import { isSeededRole, roleDescription, roleName } from './seededRoles';

const en = createIntl({ locale: 'en' });
const fr = createIntl({
  locale: 'fr',
  messages: { 'roles.seeded.admin': 'Administrateur', 'roles.seeded.observer': 'Observateur' },
});

describe('seeded roles', () => {
  it("shows Headwind's Russian seed names in the console's language", () => {
    expect(roleName(en, { id: 2, name: 'Администратор' })).toBe('Admin');
    expect(roleName(fr, { id: 2, name: 'Администратор' })).toBe('Administrateur');
    expect(roleName(fr, { id: 104, name: 'Наблюдатель' })).toBe('Observateur');
    expect(roleName(en, { id: 1, name: ' Супер-Администратор ' })).toBe('Super admin');
  });

  it('falls back to the seeded id for an unknown Russian name, and leaves other names as typed', () => {
    expect(roleName(en, { id: 3, name: 'Пользователь системы' })).toBe('User');
    expect(roleName(fr, { id: 2, name: 'Arbitres' })).toBe('Arbitres');
    expect(roleName(en, { id: 120, name: 'Оператор' })).toBe('Оператор');
    expect(isSeededRole({ id: 2, name: 'Arbitres' })).toBe(false);
  });

  it('translates a seeded description, keeps one an admin wrote', () => {
    expect(roleDescription(en, { id: 4, name: 'Наблюдатель', description: 'Наблюдатель зорко наблюдает' })).toBe(
      'Read-only access to the control panel',
    );
    expect(roleDescription(en, { id: 2, name: 'Администратор', description: 'Responsables du club' })).toBe(
      'Responsables du club',
    );
    expect(roleDescription(en, { id: 9, name: 'Arbitres', description: 'Saisie des scores' })).toBe('Saisie des scores');
  });
});

describe("the installers' English seed", () => {
  it('shows it in the console language, and in English as the installer wrote it', () => {
    expect(roleName(fr, { id: 100, name: 'Observer' })).toBe('Observateur');
    expect(roleName(en, { id: 3, name: 'User' })).toBe('User');
    expect(roleDescription(en, { id: 3, name: 'User', description: 'Limited access to the control panel' })).toBe(
      'Limited access to the control panel',
    );
    expect(isSeededRole({ id: 3, name: 'User' })).toBe(false);
  });
});
