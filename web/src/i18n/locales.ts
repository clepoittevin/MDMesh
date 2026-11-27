// Which language the console speaks. English is the source: its text is the `defaultMessage` beside each use in
// code, so it needs no catalog and renders synchronously. French ships as locales/fr.json (the same shape as
// en.json); a message missing there shows in English. In dev, `npm run i18n:pseudo` compiles the en-XA
// pseudo-locale (accented and padded English) into ./pseudo/, and setting `mdmesh-locale` to `en-XA` in
// localStorage shows it: any text that stays plain English was never extracted.
import type { IntlConfig } from 'react-intl';

export const SOURCE_LOCALE = 'en';
export const LOCALE_KEY = 'mdmesh-locale';

export type Catalog = NonNullable<IntlConfig['messages']>;

type Source = Record<string, { defaultMessage: string }>;

/** A translation file (same shape as en.json) as react-intl messages: id → text. */
const toCatalog = (source: Source): Catalog =>
  Object.fromEntries(Object.entries(source).map(([id, m]) => [id, m.defaultMessage]));

/** The shipped translations: every locales/<code>.json but the English source. */
const SHIPPED = Object.fromEntries(
  Object.entries(import.meta.glob<Source>(['./locales/*.json', '!./locales/en.json'], { import: 'default' }))
    .map(([path, load]) => [path.slice('./locales/'.length, -'.json'.length), load] as const)
    .filter(([code]) => code !== SOURCE_LOCALE)
    .map(([code, load]) => [code, () => load().then(toCatalog)]),
);

/** Locale code → its catalog, loaded on demand: the shipped translations, plus the pseudo-locale in dev. */
export const CATALOGS: Readonly<Record<string, () => Promise<Catalog>>> = import.meta.env.DEV
  ? {
      ...SHIPPED,
      ...Object.fromEntries(
        Object.entries(import.meta.glob<Catalog>('./pseudo/*.json', { import: 'default' })).map(([path, load]) => [
          path.slice('./pseudo/'.length, -'.json'.length),
          load,
        ]),
      ),
    }
  : SHIPPED;

/** The languages the Settings page offers, each named in its own language. */
export const LANGUAGE_NAMES: Readonly<Record<string, string>> = { en: 'English', fr: 'Français' };

/**
 * The locale to show: the stored preference if it is available, else the first browser language available (exactly,
 * or by its language: en-GB → en), else English.
 */
export function resolveLocale(
  available: readonly string[],
  preference: string | null,
  browser: readonly string[],
): string {
  const find = (code: string) => available.find((a) => a.toLowerCase() === code.toLowerCase());
  if (preference && find(preference)) return find(preference) as string;
  for (const lang of browser) {
    const match = find(lang) ?? find(lang.split('-')[0]);
    if (match) return match;
  }
  return SOURCE_LOCALE;
}

export function storedLocale(): string | null {
  try {
    return localStorage.getItem(LOCALE_KEY);
  } catch {
    return null;
  }
}

/** Saves the language chosen in Settings (null: follow the browser). The console reloads to apply it. */
export function storeLocale(code: string | null): void {
  try {
    if (code) localStorage.setItem(LOCALE_KEY, code);
    else localStorage.removeItem(LOCALE_KEY);
  } catch {
    // Storage blocked: the browser's language still applies.
  }
}
