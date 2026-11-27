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

  it('leaves any other name as typed, a seeded role renamed in Russian included', () => {
    expect(roleName(en, { id: 3, name: 'Пользователь системы' })).toBe('Пользователь системы');
    expect(isSeededRole({ id: 3, name: 'Пользователь системы' })).toBe(false);
    expect(roleName(fr, { id: 2, name: 'Support' })).toBe('Support');
    expect(roleName(en, { id: 120, name: 'Оператор' })).toBe('Оператор');
    expect(isSeededRole({ id: 2, name: 'Support' })).toBe(false);
    expect(isSeededRole({ id: 2, name: 'Администратор' })).toBe(true);
  });

  it('translates a seeded description, keeps one an admin wrote', () => {
    expect(roleDescription(en, { id: 4, name: 'Наблюдатель', description: 'Наблюдатель зорко наблюдает' })).toBe(
      'Read-only access to the control panel',
    );
    expect(roleDescription(en, { id: 2, name: 'Администратор', description: 'Équipe informatique' })).toBe(
      'Équipe informatique',
    );
    expect(roleDescription(en, { id: 2, name: 'Администратор', description: 'Администраторы филиала' })).toBe(
      'Администраторы филиала',
    );
    expect(roleDescription(en, { id: 9, name: 'Support', description: 'Assistance aux utilisateurs' })).toBe(
      'Assistance aux utilisateurs',
    );
  });

  it('translates a seeded description left in the other seed’s language', () => {
    expect(roleDescription(en, { id: 2, name: 'Admin', description: 'Выполняет функции администратора для одной клиентской записи' })).toBe(
      'Full access to the control panel',
    );
  });

  it('does not describe a role that has no description, even one named like a seeded role', () => {
    expect(roleDescription(en, { id: 140, name: 'Observer' })).toBe('');
    expect(roleDescription(en, { id: 140, name: 'Observer', description: ' ' })).toBe('');
    expect(roleDescription(en, { id: 2, name: 'Администратор', description: null })).toBe('');
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

describe('a role named like something every object inherits', () => {
  it('shows as typed', () => {
    for (const name of ['constructor', 'toString', '__proto__']) {
      expect(roleName(fr, { id: 9, name })).toBe(name);
      expect(roleDescription(fr, { id: 9, name, description: 'Help desk' })).toBe('Help desk');
    }
  });
});
