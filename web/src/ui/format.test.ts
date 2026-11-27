import { afterEach, describe, expect, it, vi } from 'vitest';
import { LOCALE_KEY } from '../i18n/locales';
import { consoleLocale, fmtDate, fmtDateTime } from './format';

/** The console in `lang` (what IntlRoot sets), on a browser that prefers `browser`, with `chosen` picked in Settings. */
function consoleIn(lang: string, browser: string[], chosen?: string) {
  document.documentElement.lang = lang;
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(browser);
  if (chosen) localStorage.setItem(LOCALE_KEY, chosen);
}

afterEach(() => {
  document.documentElement.lang = '';
});

const NOV_26 = new Date(2026, 10, 26, 15, 5).getTime();

describe('consoleLocale', () => {
  it('is the browser’s own before the console has a language', () => {
    expect(consoleLocale()).toBeUndefined();
  });

  it('keeps the browser’s region when it speaks the console’s language', () => {
    consoleIn('en', ['en-GB', 'en']);
    expect(consoleLocale()).toBe('en-GB');
    consoleIn('fr', ['de-CH', 'fr-CA']);
    expect(consoleLocale()).toBe('fr-CA');
  });

  it('is the console’s language on a browser in another one', () => {
    consoleIn('fr', ['en-US', 'en']);
    expect(consoleLocale()).toBe('fr');
  });

  it('is English when English was chosen in Settings on a browser in another language', () => {
    consoleIn('en', ['fr-FR', 'fr'], 'en');
    expect(consoleLocale()).toBe('en');
  });

  it('stays the browser’s own for English nobody chose (no translation for the browser’s language)', () => {
    consoleIn('en', ['de-DE', 'de']);
    expect(consoleLocale()).toBeUndefined();
  });

  it('stays the browser’s own when that browser lists English after its own language', () => {
    consoleIn('en', ['de-DE', 'de', 'en-US', 'en']);
    expect(consoleLocale()).toBeUndefined();
    consoleIn('en', ['es-ES', 'es', 'en']);
    expect(consoleLocale()).toBeUndefined();
  });

  it('takes the region of an English listed second once English is chosen', () => {
    consoleIn('en', ['de-DE', 'de', 'en-GB', 'en'], 'en');
    expect(consoleLocale()).toBe('en-GB');
  });
});

describe('dates', () => {
  it('are English once English is chosen on a French browser', () => {
    consoleIn('en', ['fr-FR', 'fr'], 'en');
    expect(fmtDateTime(NOV_26)).toBe('Nov 26, 2026, 03:05 PM');
    expect(fmtDate(NOV_26, { day: 'numeric', month: 'short', year: 'numeric' })).toBe('Nov 26, 2026');
  });

  it('keep the day-first order of an English browser outside the US', () => {
    consoleIn('en', ['en-GB']);
    expect(fmtDate(NOV_26, { day: 'numeric', month: 'short', year: 'numeric' })).toBe('26 Nov 2026');
    expect(fmtDateTime(NOV_26)).toMatch(/^26 Nov 2026, 15:05$/);
  });

  it('stay as the browser writes them for English nobody chose, even with English further down its list', () => {
    consoleIn('en', ['de-DE', 'de', 'en-US', 'en']);
    expect(fmtDateTime(NOV_26)).toBe(new Date(NOV_26).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }));
    expect(consoleLocale()).toBeUndefined();
  });

  it('are French in the French console, whatever the browser', () => {
    consoleIn('fr', ['en-US']);
    expect(fmtDate(NOV_26, { day: 'numeric', month: 'short', year: 'numeric' })).toBe('26 nov. 2026');
    expect(fmtDateTime(NOV_26)).toContain('26 nov. 2026');
  });

  it('show a dash for no date', () => {
    expect(fmtDateTime(undefined)).toBe('—');
    expect(fmtDateTime(Number.NaN)).toBe('—');
  });
});
