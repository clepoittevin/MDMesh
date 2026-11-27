// Small display helpers. Render an em dash for absent values.
import { SOURCE_LOCALE, storedLocale } from '../i18n/locales';

export const DASH = '—';

const language = (tag: string) => tag.split('-')[0].toLowerCase();

/**
 * The locale every date in the console is written in. Dates are in the console's language (`<html lang>`, which
 * IntlRoot sets), with the region of the browser when the browser lists that language: an English console on an
 * en-GB browser keeps "26 Nov 2026", a French one on fr-CA its own order. English chosen in Settings gives English
 * dates on any browser. English nobody chose, on a browser whose first language is another one (it has no
 * translation), keeps the browser's formats, as before the console had languages, even when that browser lists
 * English further down, as most do. Undefined is the browser's own, also before `<html lang>` is set, as in tests.
 */
export function consoleLocale(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const lang = document.documentElement.lang;
  if (!lang) return undefined;
  const browser = navigator.languages ?? [];
  const fallback = lang === SOURCE_LOCALE && storedLocale()?.toLowerCase() !== SOURCE_LOCALE;
  if (fallback && browser.length > 0 && language(browser[0]) !== language(lang)) return undefined;
  return browser.find((tag) => language(tag) === language(lang)) ?? (fallback ? undefined : lang);
}

/** A date (and time, when `options` ask for one) in the console's locale. */
export function fmtDate(ms: number | Date, options: Intl.DateTimeFormatOptions): string {
  return new Date(ms).toLocaleString(consoleLocale(), options);
}

export function fmtDateTime(ms?: number): string {
  if (!ms) return DASH;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return DASH;
  return fmtDate(d, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function orDash(v?: string | number | null): string {
  if (v === undefined || v === null || v === '') return DASH;
  return String(v);
}
