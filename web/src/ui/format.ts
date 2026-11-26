// Small display helpers. Render an em dash for absent values.

export const DASH = '—';

/**
 * The console's language for dates and numbers formatted outside react-intl: IntlRoot keeps `<html lang>` on the
 * active locale, so dates follow the console (French months in French) rather than the browser. Undefined (the
 * browser's) before it is set, as in tests.
 */
export function consoleLocale(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  return document.documentElement.lang || undefined;
}

export function fmtDateTime(ms?: number): string {
  if (!ms) return DASH;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return DASH;
  return d.toLocaleString(consoleLocale(), {
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
