// The shipped translations, loaded as the console loads them (the real catalog through IntlRoot), and the language
// preference Settings stores.
import { render, screen } from '@testing-library/react';
import { FormattedMessage } from 'react-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IntlRoot } from './IntlRoot';
import { CATALOGS, LANGUAGE_NAMES, LOCALE_KEY, storeLocale, storedLocale } from './locales';

const shipped = Object.keys(import.meta.glob(['./locales/*.json', '!./locales/en.json'])).map((path) =>
  path.slice('./locales/'.length, -'.json'.length),
);

// A message of the console's own: English in the code, its translation only in the catalog.
const Sample = () => <FormattedMessage id="devices.attention.label" defaultMessage="Needs attention" />;
const browserIn = (...languages: string[]) => vi.spyOn(navigator, 'languages', 'get').mockReturnValue(languages);

afterEach(() => {
  document.documentElement.lang = '';
});

describe('the shipped translations', () => {
  it('include French, and each can be picked in Settings by its own name', () => {
    expect(shipped).toContain('fr');
    for (const code of shipped) {
      expect(Object.keys(CATALOGS)).toContain(code);
      expect(LANGUAGE_NAMES[code], `add ${code} to LANGUAGE_NAMES`).toBeTruthy();
    }
  });

  it('French loads for a French browser', async () => {
    browserIn('fr-FR', 'fr', 'en');
    render(<IntlRoot><Sample /></IntlRoot>);
    expect(await screen.findByText('Nécessite une intervention')).toBeTruthy();
    expect(document.documentElement.lang).toBe('fr');
  });

  it('French loads when chosen in Settings, on a browser in English', async () => {
    browserIn('en-US', 'en');
    storeLocale('fr');
    render(<IntlRoot><Sample /></IntlRoot>);
    expect(await screen.findByText('Nécessite une intervention')).toBeTruthy();
  });

  it('English chosen in Settings wins over a French browser', () => {
    browserIn('fr-FR', 'fr');
    storeLocale('en');
    render(<IntlRoot><Sample /></IntlRoot>);
    expect(screen.getByText('Needs attention')).toBeTruthy();
    expect(document.documentElement.lang).toBe('en');
  });
});

describe('the stored language', () => {
  it('is kept under one key, and cleared to follow the browser again', () => {
    expect(storedLocale()).toBeNull();
    storeLocale('fr');
    expect(localStorage.getItem(LOCALE_KEY)).toBe('fr');
    expect(storedLocale()).toBe('fr');
    storeLocale(null);
    expect(storedLocale()).toBeNull();
  });
});
