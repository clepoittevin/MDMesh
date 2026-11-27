// Pure display helpers for the device detail page. No React here. The helpers that produce text take an optional
// `intl` (from useIntl()); without it they answer in English, as callers outside this page (the kiosk gallery's
// fmtBytes) and the tests read them.
import { createIntl, defineMessages, type IntlShape, type MessageDescriptor } from 'react-intl';
import { DEVICE_RESET_REVISION, type ConfigStatus } from '../api/configSync';
import type { Outcome } from '../data/configOutcomes';
import { own } from '../data/own';
import { LOCATION_HISTORY_LIMIT, type LocationFix } from '../api/deviceLocations';
import { formatRelative, formatRelativeIntl } from '../ui/RelativeTime';
import type { StatusKind, StatusTone } from '../ui/Status';

export const DASH = '—';

const messagesRaw = defineMessages({
  gigabytes: { id: 'deviceDetail.format.gigabytes', defaultMessage: '{value} GB' },
  megabytes: { id: 'deviceDetail.format.megabytes', defaultMessage: '{value} MB' },
  kilobytes: { id: 'deviceDetail.format.kilobytes', defaultMessage: '{value} KB' },
  bytes: { id: 'deviceDetail.format.bytes', defaultMessage: '{value} B' },
  storageUsed: { id: 'deviceDetail.format.storageUsed', defaultMessage: '{used} / {total} GB' },
  storageFree: { id: 'deviceDetail.format.storageFree', defaultMessage: '{free} free' },
  alwaysOn: { id: 'deviceDetail.format.powerAlwaysOn', defaultMessage: 'Always-on' },
  batterySaver: { id: 'deviceDetail.format.powerBatterySaver', defaultMessage: 'Battery-saver' },
  wifi: { id: 'deviceDetail.format.networkWifi', defaultMessage: 'Wi-Fi' },
  mobileData: { id: 'deviceDetail.format.networkMobile', defaultMessage: 'Mobile data' },
  noNetwork: { id: 'deviceDetail.format.networkNone', defaultMessage: 'No network' },
  ethernet: { id: 'deviceDetail.format.networkEthernet', defaultMessage: 'Ethernet' },
  fused: { id: 'deviceDetail.format.providerFused', defaultMessage: 'Fused' },
  gps: { id: 'deviceDetail.format.providerGps', defaultMessage: 'GPS' },
  network: { id: 'deviceDetail.format.providerNetwork', defaultMessage: 'Network' },
  passive: { id: 'deviceDetail.format.providerPassive', defaultMessage: 'Passive' },
  range1h: { id: 'deviceDetail.format.range1h', defaultMessage: '1h' },
  range24h: { id: 'deviceDetail.format.range24h', defaultMessage: '24h' },
  range7d: { id: 'deviceDetail.format.range7d', defaultMessage: '7d' },
  rangeAll: { id: 'deviceDetail.format.rangeAll', defaultMessage: 'All' },
  rangeLast: {
    id: 'deviceDetail.format.rangeLast',
    defaultMessage:
      '{kind, select, hour {the last hour} days {the last {count} days} other {the last {count} hours}}',
  },
  fixesNewestInRange: { id: 'deviceDetail.format.fixesNewestInRange', defaultMessage: 'newest {count} in this range' },
  fixesNewest: { id: 'deviceDetail.format.fixesNewest', defaultMessage: 'newest {count} fixes' },
  fixes: { id: 'deviceDetail.format.fixes', defaultMessage: '{count, plural, one {# fix} other {# fixes}}' },
  outOfDate: { id: 'deviceDetail.format.revisionOutOfDate', defaultMessage: 'Out of date' },
  delivered: { id: 'deviceDetail.format.commandDelivered', defaultMessage: 'Delivered' },
  running: { id: 'deviceDetail.format.commandRunning', defaultMessage: 'Running' },
  accuracy: { id: 'deviceDetail.format.accuracy', defaultMessage: '±{value} m' },
});
const messages: Record<keyof typeof messagesRaw, MessageDescriptor> = messagesRaw;

// English, for callers that pass no intl.
const EN = createIntl({ locale: 'en' });
const fm = (intl: IntlShape | undefined, d: MessageDescriptor, values?: Record<string, string | number>) =>
  (intl ?? EN).formatMessage(d, values);
/** A number without digit grouping, to `digits` decimals at most (the decimal separator follows the locale). */
const num = (intl: IntlShape | undefined, v: number, digits: number) =>
  (intl ?? EN).formatNumber(v, { maximumFractionDigits: digits, useGrouping: false });

/** A telemetry value as a single string (arrays → first element, as the classic page reads IMEI lists). */
export function teleStr(v: unknown): string | undefined {
  const one = Array.isArray(v) ? v[0] : v;
  if (one == null || one === '') return undefined;
  // Only scalars: a device sending an object or a nested list gets "—", not "[object Object]".
  return typeof one === 'string' || typeof one === 'number' || typeof one === 'boolean' ? String(one) : undefined;
}

/** A telemetry section as a plain object ({} for anything else: a device can send a string or a list). */
export function teleObj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

export function teleNum(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/** Decimal gigabytes (what Android's own storage screen shows). "18.2", "32", "0.4". */
function gb(bytes: number, intl?: IntlShape): string {
  const v = bytes / 1e9;
  return num(intl, v, v >= 100 ? 0 : 1);
}

/** Bytes as "3.8 GB", "512 MB", "12 KB". */
export function fmtBytes(bytes: number | undefined, intl?: IntlShape): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return DASH;
  if (bytes >= 1e9) return fm(intl, messages.gigabytes, { value: gb(bytes, intl) });
  if (bytes >= 1e6) return fm(intl, messages.megabytes, { value: num(intl, Math.round(bytes / 1e6), 0) });
  if (bytes >= 1e3) return fm(intl, messages.kilobytes, { value: num(intl, Math.round(bytes / 1e3), 0) });
  return fm(intl, messages.bytes, { value: num(intl, bytes, 0) });
}

/** Storage as used / total ("18.2 / 32 GB"), from the agent's totalStorageBytes and freeStorageBytes. */
export function fmtStorage(total: number | undefined, free: number | undefined, intl?: IntlShape): string {
  if (total != null && total > 0) {
    if (free != null && free >= 0 && free <= total) {
      return fm(intl, messages.storageUsed, { used: gb(total - free, intl), total: gb(total, intl) });
    }
    return fm(intl, messages.gigabytes, { value: gb(total, intl) });
  }
  if (free != null && free >= 0) return fm(intl, messages.storageFree, { free: fmtBytes(free, intl) });
  return DASH;
}

/** "Always-on" / "Battery-saver" for the agent's power mode. */
export function powerLabel(mode?: string | null, intl?: IntlShape): string | undefined {
  if (mode === 'alwaysOn') return fm(intl, messages.alwaysOn);
  if (mode === 'adaptive') return fm(intl, messages.batterySaver);
  return undefined;
}

/** The agent's networkType (wifi | cellular | none) as a label. */
export function networkLabel(type?: string, intl?: IntlShape): string | undefined {
  if (!type) return undefined;
  const t = type.toLowerCase();
  if (t === 'wifi' || t === 'wi-fi') return fm(intl, messages.wifi);
  if (t === 'cellular' || t === 'mobile') return fm(intl, messages.mobileData);
  if (t === 'none') return fm(intl, messages.noNetwork);
  if (t === 'ethernet') return fm(intl, messages.ethernet);
  return type;
}

/** Android location provider → label; the raw value goes in a tooltip. */
export function providerLabel(p?: unknown, intl?: IntlShape): string | undefined {
  if (typeof p !== 'string' || !p) return undefined;
  const map: Record<string, MessageDescriptor> = {
    fused: messages.fused,
    gps: messages.gps,
    network: messages.network,
    passive: messages.passive,
  };
  const d = own(map, p.toLowerCase());
  return d ? fm(intl, d) : p;
}

/** "±12 m": a location's accuracy radius. */
export function fmtAccuracy(meters: number, intl?: IntlShape): string {
  return fm(intl, messages.accuracy, { value: num(intl, Math.round(meters), 0) });
}

/** A timestamp (epoch ms) the browser can turn into a date, or undefined (bad telemetry must not throw). */
export function validTime(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 && !Number.isNaN(new Date(v).getTime()) ? v : undefined;
}

/** `<time dateTime>` for an epoch-ms value, or undefined when it isn't a valid date. */
export function isoTime(v: unknown): string | undefined {
  const t = validTime(v);
  return t === undefined ? undefined : new Date(t).toISOString();
}

/** A location as the page shows it: numbers checked, provider a string, time a valid date. */
export interface CleanLocation {
  lat: number;
  lon: number;
  accuracyM?: number;
  provider?: string;
  capturedAt?: number;
}

const isLat = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 90;
const isLon = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 180;
const accuracyOf = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined);
const providerOf = (v: unknown) => (typeof v === 'string' && v ? v : undefined);

/** The telemetry's dynamic.location, or undefined when it has no usable coordinates. */
export function cleanLocation(v: unknown): CleanLocation | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const l = v as Record<string, unknown>;
  if (!isLat(l.lat) || !isLon(l.lon)) return undefined;
  return { lat: l.lat, lon: l.lon, accuracyM: accuracyOf(l.accuracyM), provider: providerOf(l.provider), capturedAt: validTime(l.capturedAt) };
}

/** The location history with malformed fixes dropped (no coordinates or no valid time) and fields type-checked. */
export function cleanFixes(list: unknown): LocationFix[] {
  if (!Array.isArray(list)) return [];
  const out: LocationFix[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const f = raw as Record<string, unknown>;
    const capturedAt = validTime(f.capturedAt);
    if (!isLat(f.lat) || !isLon(f.lon) || capturedAt === undefined) continue;
    out.push({ ...(f as unknown as LocationFix), lat: f.lat, lon: f.lon, capturedAt, accuracy: accuracyOf(f.accuracy), provider: providerOf(f.provider) });
  }
  return out;
}

/** The Location tab's time ranges, in hours back from now. 0 is All: the newest fixes, however old. */
export const LOCATION_RANGES: ReadonlyArray<{ value: number; label: string }> = [
  { value: 1, label: messages.range1h.defaultMessage as string },
  { value: 24, label: messages.range24h.defaultMessage as string },
  { value: 168, label: messages.range7d.defaultMessage as string },
  { value: 0, label: messages.rangeAll.defaultMessage as string },
];

/** The ranges as the Segmented control shows them, labels in the console's language. */
export function locationRangeOptions(intl: IntlShape): Array<{ value: number; label: string }> {
  const label: Record<number, MessageDescriptor> = {
    1: messages.range1h,
    24: messages.range24h,
    168: messages.range7d,
    0: messages.rangeAll,
  };
  return LOCATION_RANGES.map((r) => ({ value: r.value, label: intl.formatMessage(label[r.value]) }));
}

/** The `since` of a range (listLocations): `hours` before `now`, or 0 for All. */
export function locationSince(hours: number, now: number): number {
  return hours > 0 ? now - hours * 3600 * 1000 : 0;
}

/** "the last hour", "the last 24 hours", "the last 7 days"; undefined for All. */
export function rangePhrase(hours: number, intl?: IntlShape): string | undefined {
  if (hours <= 0) return undefined;
  const p = rangeParts(hours);
  return fm(intl, messages.rangeLast, { kind: p.kind, count: p.count });
}

/** A range's phrase as ICU arguments (`kind`: hour | hours | days; `count`), for sentences that name the range. */
export function rangeParts(hours: number): { kind: 'hour' | 'hours' | 'days'; count: number } {
  if (hours === 1) return { kind: 'hour', count: 1 };
  return hours > 24 && hours % 24 === 0 ? { kind: 'days', count: hours / 24 } : { kind: 'hours', count: hours };
}

/** "12 fixes", or "newest 500 in this range" when the server's cap cut the list (the range holds more). */
export function fixesCount(count: number, hours: number, intl?: IntlShape): string {
  if (count >= LOCATION_HISTORY_LIMIT) {
    return fm(intl, hours > 0 ? messages.fixesNewestInRange : messages.fixesNewest, { count });
  }
  return fm(intl, messages.fixes, { count });
}

/** "6m", "2h", "just now": an age without the trailing "ago" (rail "Fix age"). */
export function fmtAge(ms: number, now: number, intl?: IntlShape): string {
  // In another language the age keeps its own wording ("il y a 6 min"): stripping an English " ago" can't apply.
  if (intl && intl.locale !== 'en') return formatRelativeIntl(intl, ms, now, 'short');
  return formatRelative(ms, now, 'short').replace(/ ago$/, '');
}

/** A command's time: "3m ago", "2h ago" within a day, then "Yesterday", "3 days ago", the date. */
export function fmtWhen(ms: number, now: number, intl?: IntlShape): string {
  const style = now - ms < 24 * 3600 * 1000 ? 'short' : 'long';
  return intl ? formatRelativeIntl(intl, ms, now, style) : formatRelative(ms, now, style);
}

export function capitalise(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** "Samsung SM-X200" (manufacturer, then model unless the model already starts with it). */
export function makeModel(manufacturer?: string, model?: string): string | undefined {
  if (!model && !manufacturer) return undefined;
  if (!manufacturer) return model;
  if (!model) return capitalise(manufacturer);
  return model.toLowerCase().startsWith(manufacturer.toLowerCase()) ? model : `${capitalise(manufacturer)} ${model}`;
}

/* ---------------------------------------------------------------------------------------------------------------
   Configuration status
   --------------------------------------------------------------------------------------------------------------- */

/** Short revision for display, 7 characters as git shows them ("8b04d7a"); "Out of date" for the agent's stale marker. */
export function shortRevision(r?: string | null, intl?: IntlShape): string {
  if (r === DEVICE_RESET_REVISION) return fm(intl, messages.outOfDate);
  return r ? r.slice(0, 7) : DASH;
}

/** Whether the configuration panel shows in full (anything but a clean "In sync"). */
export function configNeedsPanel(s: ConfigStatus | null, outcomes: Outcome[]): boolean {
  if (!s || s.configurationId == null) return false;
  if (!s.supported || !s.inSync) return true;
  return outcomes.some((o) => o.kind !== 'applied');
}

/** Command status → status pill (Done / Failed / Expired). */
export function commandStatus(status: string, intl?: IntlShape): { kind: StatusKind; label?: string } {
  switch (status) {
    case 'done':
      return { kind: 'done' };
    case 'failed':
      return { kind: 'failed' };
    case 'expired':
      return { kind: 'expired' };
    case 'unsupported':
      return { kind: 'notSupported' };
    case 'pending':
      return { kind: 'pending' };
    case 'delivered':
      return { kind: 'pending', label: fm(intl, messages.delivered) };
    case 'accepted':
      return { kind: 'pending', label: fm(intl, messages.running) };
    default:
      return { kind: 'pending', label: capitalise(status) };
  }
}

/**
 * Device events the agent reports as something to look at (#220's storage recovery, a failed boot re-apply, a factory
 * reset that didn't start, #222; a full agent buffer that dropped events).
 */
export const WARN_EVENTS: ReadonlySet<string> = new Set([
  'lowBattery',
  'kioskCrashLoop',
  'storageRecovered',
  'configReapplyFailed',
  'wipeNotStarted',
  'eventsDropped',
]);

export function eventTone(type: string): StatusTone {
  if (type === 'kioskPinLockout') return 'alert';
  if (WARN_EVENTS.has(type)) return 'warn';
  if (type === 'enrolled' || type === 'appInstalled') return 'ok';
  return 'idle';
}
