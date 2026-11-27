import { createIntl } from 'react-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CATALOGS } from '../i18n/locales';
import { formatRelativeIntl } from './RelativeTime';

const en = createIntl({ locale: 'en' });
const fr = createIntl({ locale: 'fr', messages: await CATALOGS.fr() });
const NOW = new Date(2026, 10, 26, 15, 5).getTime();
const MIN = 60_000;
const DAY = 24 * 60 * MIN;

afterEach(() => {
  document.documentElement.lang = '';
});

describe('formatRelativeIntl', () => {
  it('counts in the console’s language, short and long', () => {
    expect(formatRelativeIntl(en, NOW - 3 * MIN, NOW)).toBe('3m ago');
    expect(formatRelativeIntl(fr, NOW - 3 * MIN, NOW)).toBe('il y a 3 min');
    expect(formatRelativeIntl(en, NOW - MIN, NOW, 'long')).toBe('1 minute ago');
    expect(formatRelativeIntl(fr, NOW - MIN, NOW, 'long')).toBe('il y a 1 minute');
    expect(formatRelativeIntl(fr, NOW - 5 * MIN, NOW, 'long')).toBe('il y a 5 minutes');
    expect(formatRelativeIntl(fr, NOW - DAY, NOW, 'long')).toBe('Hier');
    expect(formatRelativeIntl(fr, NOW, NOW, 'long')).toBe('à l’instant');
  });

  it('gives the date past 30 days, in the console’s locale', () => {
    document.documentElement.lang = 'fr';
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-US']);
    expect(formatRelativeIntl(fr, NOW - 40 * DAY, NOW, 'long')).toBe('17 oct. 2026');
  });
});
