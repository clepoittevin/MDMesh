import { useEffect, useState } from 'react';
import { defineMessages, useIntl, type IntlShape } from 'react-intl';
import { untyped } from '../data/configIntl';
import { DASH, fmtDateTime } from './format';

export type RelativeStyle = 'short' | 'long';

/**
 * - `short` (tables and feeds): "20s ago" (with `seconds`) or "just now", "3m ago", "2h ago", "2d ago",
 *   "3mo ago", "1y ago"
 * - `long` (sentences): "just now", "3 minutes ago", "2 hours ago", "Yesterday", "3 days ago",
 *   then the date
 */
export function formatRelative(ms: number, now: number, style: RelativeStyle = 'short', seconds = false): string {
  const diff = Math.max(0, now - ms);
  const sec = Math.floor(diff / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);
  if (style === 'short') {
    if (sec < 60) return seconds ? `${sec}s ago` : 'just now';
    if (min < 60) return `${min}m ago`;
    if (hr < 24) return `${hr}h ago`;
    if (day < 30) return `${day}d ago`;
    if (day < 365) return `${Math.floor(day / 30)}mo ago`;
    return `${Math.floor(day / 365)}y ago`;
  }
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'} ago`;
  if (sec < 60) return seconds && sec >= 5 ? plural(sec, 'second') : 'just now';
  if (min < 60) return plural(min, 'minute');
  if (hr < 24) return plural(hr, 'hour');
  if (day === 1) return 'Yesterday';
  if (day < 30) return `${day} days ago`;
  return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

const messages = untyped(
  defineMessages({
    justNow: { id: 'format.relative.justNow', defaultMessage: 'just now' },
    secondsShort: { id: 'format.relative.secondsShort', defaultMessage: '{count}s ago' },
    minutesShort: { id: 'format.relative.minutesShort', defaultMessage: '{count}m ago' },
    hoursShort: { id: 'format.relative.hoursShort', defaultMessage: '{count}h ago' },
    daysShort: { id: 'format.relative.daysShort', defaultMessage: '{count}d ago' },
    monthsShort: { id: 'format.relative.monthsShort', defaultMessage: '{count}mo ago' },
    yearsShort: { id: 'format.relative.yearsShort', defaultMessage: '{count, plural, one {#y ago} other {#y ago}}' },
    seconds: { id: 'format.relative.seconds', defaultMessage: '{count, plural, one {# second ago} other {# seconds ago}}' },
    minutes: { id: 'format.relative.minutes', defaultMessage: '{count, plural, one {# minute ago} other {# minutes ago}}' },
    hours: { id: 'format.relative.hours', defaultMessage: '{count, plural, one {# hour ago} other {# hours ago}}' },
    yesterday: { id: 'format.relative.yesterday', defaultMessage: 'Yesterday' },
    days: { id: 'format.relative.days', defaultMessage: '{count, plural, one {# day ago} other {# days ago}}' },
  }),
);

/**
 * formatRelative in the console's language (the same steps and English words; French « il y a 3 min », « Hier »…),
 * the date past 30 days in the console's locale. formatRelative itself stays English: code outside React and callers
 * that read its English words (" ago", "just now", "Yesterday") use it.
 */
export function formatRelativeIntl(
  intl: IntlShape,
  ms: number,
  now: number,
  style: RelativeStyle = 'short',
  seconds = false,
): string {
  const diff = Math.max(0, now - ms);
  const sec = Math.floor(diff / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);
  const f = (m: (typeof messages)[keyof typeof messages], count?: number) => intl.formatMessage(m, { count });
  if (style === 'short') {
    if (sec < 60) return seconds ? f(messages.secondsShort, sec) : f(messages.justNow);
    if (min < 60) return f(messages.minutesShort, min);
    if (hr < 24) return f(messages.hoursShort, hr);
    if (day < 30) return f(messages.daysShort, day);
    if (day < 365) return f(messages.monthsShort, Math.floor(day / 30));
    return f(messages.yearsShort, Math.floor(day / 365));
  }
  if (sec < 60) return seconds && sec >= 5 ? f(messages.seconds, sec) : f(messages.justNow);
  if (min < 60) return f(messages.minutes, min);
  if (hr < 24) return f(messages.hours, hr);
  if (day === 1) return f(messages.yesterday);
  if (day < 30) return f(messages.days, day);
  return intl.formatDate(ms, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Re-render cadence: every second under a minute (when seconds show), 30s under an hour, else every 5 minutes. */
function nextTick(ms: number, now: number, seconds: boolean): number {
  const age = now - ms;
  if (age < 60_000) return seconds ? 1000 : 60_000 - age;
  if (age < 3_600_000) return 30_000;
  return 300_000;
}

export interface RelativeTimeProps {
  /** Epoch ms (or an ISO string). Missing renders an em dash. */
  value: number | string | null | undefined;
  style?: RelativeStyle;
  /** Count seconds under a minute ("Updated 20s ago"). */
  seconds?: boolean;
  /** Text before the time ("Updated ", "Checked "). */
  prefix?: string;
  className?: string;
}

/** A ticking <time> with the absolute date in its title. */
export function RelativeTime({ value, style = 'short', seconds = false, prefix = '', className }: RelativeTimeProps) {
  const ms = typeof value === 'string' ? Date.parse(value) : value ?? NaN;
  // A finite number can still be out of Date's range (toISOString would throw).
  const valid = Number.isFinite(ms) && !Number.isNaN(new Date(ms as number).getTime());
  const intl = useIntl();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!valid) return;
    const t = setTimeout(() => setNow(Date.now()), nextTick(ms as number, now, seconds));
    return () => clearTimeout(t);
  }, [ms, now, seconds, valid]);
  if (!valid) return <span className={className}>{DASH}</span>;
  return (
    <time dateTime={new Date(ms as number).toISOString()} title={fmtDateTime(ms as number)} className={className}>
      {prefix}
      {formatRelativeIntl(intl, ms as number, now, style, seconds)}
    </time>
  );
}
