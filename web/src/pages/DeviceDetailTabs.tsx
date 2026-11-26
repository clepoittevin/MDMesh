import { useId, useState, type ReactNode } from 'react';
import { FormattedMessage, defineMessages, useIntl, type IntlShape, type MessageDescriptor } from 'react-intl';
import type { CommandHistoryItem } from '../api/commands';
import type { DeviceEvent } from '../api/events';
import type { LocationFix } from '../api/deviceLocations';
import type { TelemetrySnapshot } from '../api/telemetry';
import { doNotTrackHintMessage } from '../api/locationTracking';
import { fmtDateTime } from '../ui/format';
import {
  ActivityList,
  ActivityRow,
  Button,
  Callout,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  IconAlert,
  IconBattery,
  IconControl,
  IconDownload,
  IconEnroll,
  IconEnterKiosk,
  IconExitKiosk,
  IconHistory,
  IconInfo,
  IconLock,
  IconNetwork,
  IconPin,
  IconPower,
  IconPulse,
  IconSync,
  IconTrash,
  Grid,
  GridCell,
  KeyValueList,
  Skeleton,
  SkeletonFacts,
  SkeletonRows,
  RelativeTime,
  Segmented,
  Table,
  type KeyValueItem,
} from '../ui';
import { CommandsCard } from './DeviceDetailControl';
import { LocationMap } from '../ui/LocationMap';
import { eventDetail, eventLabel } from '../data/deviceActivity';
import {
  DASH,
  capitalise,
  eventTone,
  fixesCount,
  fmtAccuracy,
  fmtBytes,
  fmtStorage,
  locationRangeOptions,
  networkLabel,
  cleanLocation,
  rangeParts,
  providerLabel,
  teleNum,
  teleObj,
  teleStr,
} from './deviceDetailFormat';

/* ===============================================================================================================
   Telemetry: every key the agent reports, grouped and formatted; unknown keys listed raw so nothing is lost.
   =============================================================================================================== */

type Section = 'hardware' | 'dynamic' | 'security' | 'identity' | 'top';
type Snap = Record<Section, Record<string, unknown>>;

const messagesRaw = defineMessages({
  yes: { id: 'deviceDetail.tele.yes', defaultMessage: 'Yes' },
  no: { id: 'deviceDetail.tele.no', defaultMessage: 'No' },
  on: { id: 'deviceDetail.tele.on', defaultMessage: 'On' },
  off: { id: 'deviceDetail.tele.off', defaultMessage: 'Off' },
  locked: { id: 'deviceDetail.tele.locked', defaultMessage: 'Locked' },
  unlocked: { id: 'deviceDetail.tele.unlocked', defaultMessage: 'Unlocked' },
  running: { id: 'deviceDetail.tele.running', defaultMessage: 'Running' },
  allowed: { id: 'deviceDetail.tele.allowed', defaultMessage: 'Allowed' },
  blocked: { id: 'deviceDetail.tele.blocked', defaultMessage: 'Blocked' },
  durationDays: { id: 'deviceDetail.tele.durationDays', defaultMessage: '{d}d {h}h' },
  durationHours: { id: 'deviceDetail.tele.durationHours', defaultMessage: '{h}h {m}m' },
  durationMinutes: { id: 'deviceDetail.tele.durationMinutes', defaultMessage: '{m}m' },
  notCharging: { id: 'deviceDetail.tele.chargingNone', defaultMessage: 'Not charging' },
  chargingAc: { id: 'deviceDetail.tele.chargingAc', defaultMessage: 'Charging (AC)' },
  chargingUsb: { id: 'deviceDetail.tele.chargingUsb', defaultMessage: 'Charging (USB)' },
  chargingWireless: { id: 'deviceDetail.tele.chargingWireless', defaultMessage: 'Charging (wireless)' },
  screenSize: { id: 'deviceDetail.tele.screenSize', defaultMessage: '{w} × {h} px' },
  screenSizeDpi: { id: 'deviceDetail.tele.screenSizeDpi', defaultMessage: '{w} × {h} px · {dpi} dpi' },
  screenDpi: { id: 'deviceDetail.tele.screenDpi', defaultMessage: '{dpi} dpi' },
  percent: { id: 'deviceDetail.tele.percent', defaultMessage: '{value}%' },
  celsius: { id: 'deviceDetail.tele.celsius', defaultMessage: '{value} °C' },
  volts: { id: 'deviceDetail.tele.volts', defaultMessage: '{value} V' },
  dbm: { id: 'deviceDetail.tele.dbm', defaultMessage: '{value} dBm' },
  mbps: { id: 'deviceDetail.tele.mbps', defaultMessage: '{value} Mbps' },
  signalOf4: { id: 'deviceDetail.tele.signalOf4', defaultMessage: '{level} of 4' },
  patchAge: { id: 'deviceDetail.tele.patchAge', defaultMessage: '{count, plural, one {# day} other {# days}}' },

  groupHardware: { id: 'deviceDetail.tele.groupHardware', defaultMessage: 'Hardware' },
  groupStorage: { id: 'deviceDetail.tele.groupStorage', defaultMessage: 'Storage and memory' },
  groupBattery: { id: 'deviceDetail.tele.groupBattery', defaultMessage: 'Battery' },
  groupNetwork: { id: 'deviceDetail.tele.groupNetwork', defaultMessage: 'Network' },
  groupState: { id: 'deviceDetail.tele.groupState', defaultMessage: 'State' },
  groupLocation: { id: 'deviceDetail.tele.groupLocation', defaultMessage: 'Location' },
  groupSecurity: { id: 'deviceDetail.tele.groupSecurity', defaultMessage: 'Security' },
  groupIdentity: { id: 'deviceDetail.tele.groupIdentity', defaultMessage: 'Identity' },
  groupOther: { id: 'deviceDetail.tele.groupOther', defaultMessage: 'Other' },

  manufacturer: { id: 'deviceDetail.tele.manufacturer', defaultMessage: 'Manufacturer' },
  brand: { id: 'deviceDetail.tele.brand', defaultMessage: 'Brand' },
  model: { id: 'deviceDetail.tele.model', defaultMessage: 'Model' },
  deviceCode: { id: 'deviceDetail.tele.deviceCode', defaultMessage: 'Device code' },
  android: { id: 'deviceDetail.tele.android', defaultMessage: 'Android' },
  apiLevel: { id: 'deviceDetail.tele.apiLevel', defaultMessage: 'API level' },
  securityPatch: { id: 'deviceDetail.tele.securityPatch', defaultMessage: 'Security patch' },
  screen: { id: 'deviceDetail.tele.screen', defaultMessage: 'Screen' },
  abis: { id: 'deviceDetail.tele.abis', defaultMessage: 'ABIs' },
  build: { id: 'deviceDetail.tele.build', defaultMessage: 'Build' },
  storageUsed: { id: 'deviceDetail.tele.storageUsed', defaultMessage: 'Storage used' },
  storageFree: { id: 'deviceDetail.tele.storageFree', defaultMessage: 'Storage free' },
  memory: { id: 'deviceDetail.tele.memory', defaultMessage: 'Memory' },
  memoryFree: { id: 'deviceDetail.tele.memoryFree', defaultMessage: 'Memory free' },
  level: { id: 'deviceDetail.tele.level', defaultMessage: 'Level' },
  power: { id: 'deviceDetail.tele.power', defaultMessage: 'Power' },
  health: { id: 'deviceDetail.tele.health', defaultMessage: 'Health' },
  temperature: { id: 'deviceDetail.tele.temperature', defaultMessage: 'Temperature' },
  voltage: { id: 'deviceDetail.tele.voltage', defaultMessage: 'Voltage' },
  connection: { id: 'deviceDetail.tele.connection', defaultMessage: 'Connection' },
  wifiNetwork: { id: 'deviceDetail.tele.wifiNetwork', defaultMessage: 'Wi-Fi network' },
  accessPoint: { id: 'deviceDetail.tele.accessPoint', defaultMessage: 'Access point' },
  wifiSignal: { id: 'deviceDetail.tele.wifiSignal', defaultMessage: 'Wi-Fi signal' },
  linkSpeed: { id: 'deviceDetail.tele.linkSpeed', defaultMessage: 'Link speed' },
  localIp: { id: 'deviceDetail.tele.localIp', defaultMessage: 'Local IP' },
  publicIp: { id: 'deviceDetail.tele.publicIp', defaultMessage: 'Public IP' },
  mobileOperator: { id: 'deviceDetail.tele.mobileOperator', defaultMessage: 'Mobile operator' },
  mobileSignal: { id: 'deviceDetail.tele.mobileSignal', defaultMessage: 'Mobile signal' },
  roaming: { id: 'deviceDetail.tele.roaming', defaultMessage: 'Roaming' },
  lock: { id: 'deviceDetail.tele.lock', defaultMessage: 'Lock' },
  kiosk: { id: 'deviceDetail.tele.kiosk', defaultMessage: 'Kiosk' },
  foregroundApp: { id: 'deviceDetail.tele.foregroundApp', defaultMessage: 'Foreground app' },
  uptime: { id: 'deviceDetail.tele.uptime', defaultMessage: 'Uptime' },
  lastBoot: { id: 'deviceDetail.tele.lastBoot', defaultMessage: 'Last boot' },
  lastFix: { id: 'deviceDetail.tele.lastFix', defaultMessage: 'Last fix' },
  deviceOwner: { id: 'deviceDetail.tele.deviceOwner', defaultMessage: 'Device owner' },
  storageEncrypted: { id: 'deviceDetail.tele.storageEncrypted', defaultMessage: 'Storage encrypted' },
  screenLockSet: { id: 'deviceDetail.tele.screenLockSet', defaultMessage: 'Screen lock set' },
  usbDebugging: { id: 'deviceDetail.tele.usbDebugging', defaultMessage: 'USB debugging' },
  developerOptions: { id: 'deviceDetail.tele.developerOptions', defaultMessage: 'Developer options' },
  unknownSources: { id: 'deviceDetail.tele.unknownSources', defaultMessage: 'Unknown sources' },
  patchAgeLabel: { id: 'deviceDetail.tele.patchAgeLabel', defaultMessage: 'Patch age' },
  serial: { id: 'deviceDetail.tele.serial', defaultMessage: 'Serial' },
  imei: { id: 'deviceDetail.tele.imei', defaultMessage: 'IMEI' },
  imsi: { id: 'deviceDetail.tele.imsi', defaultMessage: 'IMSI' },
  iccid: { id: 'deviceDetail.tele.iccid', defaultMessage: 'ICCID' },
  phoneNumber: { id: 'deviceDetail.tele.phoneNumber', defaultMessage: 'Phone number' },

  loadingTelemetry: { id: 'deviceDetail.tele.loading', defaultMessage: 'Loading telemetry…' },
  noTelemetryTitle: { id: 'deviceDetail.tele.noneTitle', defaultMessage: 'No telemetry yet' },
  noTelemetryText: {
    id: 'deviceDetail.tele.noneText',
    defaultMessage: 'The agent reports its hardware, network and battery details at check-in.',
  },
  reported: { id: 'deviceDetail.tele.reported', defaultMessage: 'Reported {when}' },
});
const messages: Record<keyof typeof messagesRaw, MessageDescriptor> = messagesRaw;

type Fmt = (d: MessageDescriptor, values?: Record<string, string | number>) => string;

interface RowSpec {
  label: MessageDescriptor;
  /** Keys this row reads (consumed, so they don't reappear under Other). */
  keys: Array<[Section, string]>;
  render: (s: Snap, f: Fmt, intl: IntlShape) => ReactNode | undefined;
  mono?: boolean;
}

const yesNo = (f: Fmt, v: unknown, yes: MessageDescriptor = messages.yes, no: MessageDescriptor = messages.no) =>
  v === true ? f(yes) : v === false ? f(no) : undefined;
const list = (v: unknown) =>
  Array.isArray(v) ? (v.length ? v.map((x) => teleStr(x) ?? '?').join(', ') : undefined) : teleStr(v);
const str = (v: unknown) => (Array.isArray(v) ? undefined : teleStr(v));

function duration(ms: number, f: Fmt): string {
  const min = Math.floor(ms / 60000);
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = min % 60;
  if (d) return f(messages.durationDays, { d, h });
  if (h) return f(messages.durationHours, { h, m });
  return f(messages.durationMinutes, { m });
}

const batteryHealthMessages = defineMessages({
  good: { id: 'deviceDetail.tele.health.good', defaultMessage: 'Good' },
  overheat: { id: 'deviceDetail.tele.health.overheat', defaultMessage: 'Overheating' },
  dead: { id: 'deviceDetail.tele.health.dead', defaultMessage: 'Dead' },
  overVoltage: { id: 'deviceDetail.tele.health.overVoltage', defaultMessage: 'Over voltage' },
  cold: { id: 'deviceDetail.tele.health.cold', defaultMessage: 'Cold' },
  unknown: { id: 'deviceDetail.tele.health.unknown', defaultMessage: 'Unknown' },
});
const BATTERY_HEALTH: Record<string, MessageDescriptor> = batteryHealthMessages;

const CHARGING: Record<string, MessageDescriptor> = {
  none: messages.notCharging,
  ac: messages.chargingAc,
  usb: messages.chargingUsb,
  wireless: messages.chargingWireless,
};

/** A number to `digits` fixed decimals in the console's language ("25.0", "3,70"). */
const fixed = (intl: IntlShape, v: number, digits: number) =>
  intl.formatNumber(v, { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: false });

const GROUPS: Array<{ title: MessageDescriptor; rows: RowSpec[] }> = [
  {
    title: messages.groupHardware,
    rows: [
      { label: messages.manufacturer, keys: [['hardware', 'manufacturer']], render: (s) => str(s.hardware.manufacturer) && capitalise(String(s.hardware.manufacturer)) },
      { label: messages.brand, keys: [['hardware', 'brand']], render: (s) => str(s.hardware.brand) },
      { label: messages.model, keys: [['hardware', 'model']], render: (s) => str(s.hardware.model) },
      { label: messages.deviceCode, keys: [['hardware', 'device']], render: (s) => str(s.hardware.device), mono: true },
      { label: messages.android, keys: [['hardware', 'osRelease']], render: (s) => str(s.hardware.osRelease) },
      { label: messages.apiLevel, keys: [['hardware', 'sdkInt']], render: (s) => str(s.hardware.sdkInt), mono: true },
      { label: messages.securityPatch, keys: [['hardware', 'securityPatch']], render: (s) => str(s.hardware.securityPatch), mono: true },
      {
        label: messages.screen,
        keys: [['hardware', 'screenWidthPx'], ['hardware', 'screenHeightPx'], ['hardware', 'densityDpi']],
        render: (s, f) => {
          const w = teleNum(s.hardware.screenWidthPx);
          const h = teleNum(s.hardware.screenHeightPx);
          const dpi = teleNum(s.hardware.densityDpi);
          if (!w || !h) return dpi ? f(messages.screenDpi, { dpi }) : undefined;
          return dpi ? f(messages.screenSizeDpi, { w, h, dpi }) : f(messages.screenSize, { w, h });
        },
      },
      { label: messages.abis, keys: [['hardware', 'abis']], render: (s) => list(s.hardware.abis), mono: true },
      { label: messages.build, keys: [['hardware', 'buildFingerprint']], render: (s) => str(s.hardware.buildFingerprint), mono: true },
    ],
  },
  {
    title: messages.groupStorage,
    rows: [
      {
        label: messages.storageUsed,
        keys: [['hardware', 'totalStorageBytes']],
        render: (s, _f, intl) => {
          const total = teleNum(s.hardware.totalStorageBytes);
          return total ? fmtStorage(total, teleNum(s.dynamic.freeStorageBytes), intl) : undefined;
        },
      },
      { label: messages.storageFree, keys: [['dynamic', 'freeStorageBytes']], render: (s, _f, intl) => (teleNum(s.dynamic.freeStorageBytes) != null ? fmtBytes(teleNum(s.dynamic.freeStorageBytes), intl) : undefined) },
      { label: messages.memory, keys: [['hardware', 'totalRamBytes']], render: (s, _f, intl) => (teleNum(s.hardware.totalRamBytes) != null ? fmtBytes(teleNum(s.hardware.totalRamBytes), intl) : undefined) },
      { label: messages.memoryFree, keys: [['dynamic', 'freeRamBytes']], render: (s, _f, intl) => (teleNum(s.dynamic.freeRamBytes) != null ? fmtBytes(teleNum(s.dynamic.freeRamBytes), intl) : undefined) },
    ],
  },
  {
    title: messages.groupBattery,
    rows: [
      { label: messages.level, keys: [['dynamic', 'batteryPct']], render: (s, f) => (teleNum(s.dynamic.batteryPct) != null && (s.dynamic.batteryPct as number) >= 0 ? f(messages.percent, { value: String(s.dynamic.batteryPct) }) : undefined) },
      { label: messages.power, keys: [['dynamic', 'chargingSource']], render: (s, f) => (str(s.dynamic.chargingSource) ? (CHARGING[String(s.dynamic.chargingSource)] ? f(CHARGING[String(s.dynamic.chargingSource)]) : String(s.dynamic.chargingSource)) : undefined) },
      {
        label: messages.health,
        keys: [['dynamic', 'batteryHealth']],
        render: (s, f) => {
          const v = str(s.dynamic.batteryHealth);
          if (!v) return undefined;
          const known = BATTERY_HEALTH[String(v)];
          return known ? f(known) : capitalise(String(v).replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase());
        },
      },
      { label: messages.temperature, keys: [['dynamic', 'batteryTempC']], render: (s, f, intl) => (teleNum(s.dynamic.batteryTempC) != null ? f(messages.celsius, { value: fixed(intl, s.dynamic.batteryTempC as number, 1) }) : undefined) },
      { label: messages.voltage, keys: [['dynamic', 'batteryVoltageMv']], render: (s, f, intl) => (teleNum(s.dynamic.batteryVoltageMv) ? f(messages.volts, { value: fixed(intl, (s.dynamic.batteryVoltageMv as number) / 1000, 2) }) : undefined) },
    ],
  },
  {
    title: messages.groupNetwork,
    rows: [
      { label: messages.connection, keys: [['dynamic', 'networkType']], render: (s, _f, intl) => networkLabel(str(s.dynamic.networkType), intl) },
      { label: messages.wifiNetwork, keys: [['dynamic', 'wifiSsid']], render: (s) => str(s.dynamic.wifiSsid) },
      { label: messages.accessPoint, keys: [['dynamic', 'wifiBssid']], render: (s) => str(s.dynamic.wifiBssid), mono: true },
      { label: messages.wifiSignal, keys: [['dynamic', 'wifiRssi']], render: (s, f) => (teleNum(s.dynamic.wifiRssi) != null ? f(messages.dbm, { value: String(s.dynamic.wifiRssi) }) : undefined) },
      { label: messages.linkSpeed, keys: [['dynamic', 'wifiLinkSpeedMbps']], render: (s, f) => (teleNum(s.dynamic.wifiLinkSpeedMbps) != null ? f(messages.mbps, { value: String(s.dynamic.wifiLinkSpeedMbps) }) : undefined) },
      { label: messages.localIp, keys: [['dynamic', 'ipAddress']], render: (s) => str(s.dynamic.ipAddress), mono: true },
      { label: messages.publicIp, keys: [['top', 'publicIp']], render: (s) => str(s.top.publicIp), mono: true },
      { label: messages.mobileOperator, keys: [['dynamic', 'cellularOperator']], render: (s) => str(s.dynamic.cellularOperator) },
      { label: messages.mobileSignal, keys: [['dynamic', 'cellularSignalLevel']], render: (s, f) => (teleNum(s.dynamic.cellularSignalLevel) != null ? f(messages.signalOf4, { level: String(s.dynamic.cellularSignalLevel) }) : undefined) },
      { label: messages.roaming, keys: [['dynamic', 'roaming']], render: (s, f) => yesNo(f, s.dynamic.roaming) },
    ],
  },
  {
    title: messages.groupState,
    rows: [
      { label: messages.screen, keys: [['dynamic', 'screenOn']], render: (s, f) => yesNo(f, s.dynamic.screenOn, messages.on, messages.off) },
      { label: messages.lock, keys: [['dynamic', 'locked']], render: (s, f) => yesNo(f, s.dynamic.locked, messages.locked, messages.unlocked) },
      { label: messages.kiosk, keys: [['dynamic', 'kioskActive']], render: (s, f) => yesNo(f, s.dynamic.kioskActive, messages.running, messages.off) },
      { label: messages.foregroundApp, keys: [['dynamic', 'foregroundApp']], render: (s) => str(s.dynamic.foregroundApp), mono: true },
      { label: messages.uptime, keys: [['dynamic', 'uptimeMs']], render: (s, f) => (teleNum(s.dynamic.uptimeMs) != null ? duration(s.dynamic.uptimeMs as number, f) : undefined) },
      { label: messages.lastBoot, keys: [['dynamic', 'lastBootAt']], render: (s) => (teleNum(s.dynamic.lastBootAt) ? fmtDateTime(s.dynamic.lastBootAt as number) : undefined) },
    ],
  },
  {
    title: messages.groupLocation,
    rows: [
      {
        label: messages.lastFix,
        keys: [['dynamic', 'location']],
        render: (s, _f, intl) => {
          const l = cleanLocation(s.dynamic.location);
          if (!l) return undefined;
          const bits = [`${l.lat.toFixed(5)}, ${l.lon.toFixed(5)}`];
          if (l.accuracyM != null) bits.push(fmtAccuracy(l.accuracyM, intl));
          if (l.provider) bits.push(providerLabel(l.provider, intl) ?? l.provider);
          if (l.capturedAt) bits.push(fmtDateTime(l.capturedAt));
          return bits.join(' · ');
        },
      },
    ],
  },
  {
    title: messages.groupSecurity,
    rows: [
      { label: messages.deviceOwner, keys: [['security', 'isDeviceOwner']], render: (s, f) => yesNo(f, s.security.isDeviceOwner) },
      { label: messages.storageEncrypted, keys: [['security', 'storageEncrypted']], render: (s, f) => yesNo(f, s.security.storageEncrypted) },
      { label: messages.screenLockSet, keys: [['security', 'deviceSecure']], render: (s, f) => yesNo(f, s.security.deviceSecure) },
      { label: messages.usbDebugging, keys: [['security', 'adbEnabled']], render: (s, f) => yesNo(f, s.security.adbEnabled, messages.on, messages.off) },
      { label: messages.developerOptions, keys: [['security', 'devOptionsEnabled']], render: (s, f) => yesNo(f, s.security.devOptionsEnabled, messages.on, messages.off) },
      { label: messages.unknownSources, keys: [['security', 'unknownSourcesAllowed']], render: (s, f) => yesNo(f, s.security.unknownSourcesAllowed, messages.allowed, messages.blocked) },
      {
        label: messages.patchAgeLabel,
        keys: [['security', 'patchAgeDays']],
        render: (s, f) => (teleNum(s.security.patchAgeDays) != null ? f(messages.patchAge, { count: s.security.patchAgeDays as number }) : undefined),
      },
    ],
  },
  {
    title: messages.groupIdentity,
    rows: [
      { label: messages.serial, keys: [['identity', 'serial']], render: (s) => str(s.identity.serial), mono: true },
      { label: messages.imei, keys: [['identity', 'imei']], render: (s) => list(s.identity.imei), mono: true },
      { label: messages.imsi, keys: [['identity', 'imsi']], render: (s) => list(s.identity.imsi), mono: true },
      { label: messages.iccid, keys: [['identity', 'iccid']], render: (s) => list(s.identity.iccid), mono: true },
      { label: messages.phoneNumber, keys: [['identity', 'phoneNumber']], render: (s) => list(s.identity.phoneNumber), mono: true },
    ],
  },
];

/** Raw value as the classic TelemetryCard showed it. */
function raw(v: unknown): string {
  if (v === null || v === undefined) return DASH;
  if (Array.isArray(v)) return v.length ? v.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(', ') : DASH;
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function telemetryGroups(t: TelemetrySnapshot, intl: IntlShape): Array<{ title: string; items: KeyValueItem[] }> {
  const f: Fmt = (d, values) => intl.formatMessage(d, values);
  const top = teleObj(t);
  const s: Snap = {
    hardware: teleObj(top.hardware),
    dynamic: teleObj(top.dynamic),
    security: teleObj(top.security),
    identity: teleObj(top.identity),
    top,
  };
  const used = new Set<string>();
  const out: Array<{ title: string; items: KeyValueItem[] }> = [];
  for (const g of GROUPS) {
    const items: KeyValueItem[] = [];
    for (const r of g.rows) {
      const label = f(r.label);
      const present = r.keys.some(([sec, k]) => k in s[sec]);
      r.keys.forEach(([sec, k]) => used.add(`${sec}.${k}`));
      if (!present) continue;
      const v = r.render(s, f, intl);
      items.push({ key: r.label.id as string, label, value: v ?? DASH, mono: r.mono && v != null });
    }
    if (items.length) out.push({ title: f(g.title), items });
  }
  // Anything else the agent sent (older or newer agents): listed raw, like the classic dump.
  const other: KeyValueItem[] = [];
  for (const sec of ['hardware', 'dynamic', 'security', 'identity'] as const) {
    for (const [k, v] of Object.entries(s[sec])) {
      if (!used.has(`${sec}.${k}`)) other.push({ key: `${sec}.${k}`, label: k, value: raw(v), mono: true });
    }
  }
  for (const [k, v] of Object.entries(top)) {
    if (['hardware', 'dynamic', 'security', 'identity'].includes(k) || used.has(`top.${k}`)) continue;
    other.push({ key: `top.${k}`, label: k, value: raw(v), mono: true });
  }
  if (other.length) out.push({ title: f(messages.groupOther), items: other });
  return out;
}

type TeleGroup = { title: string; items: KeyValueItem[] };

/**
 * Where each telemetry group sits in the bento grid: the first (Hardware, the longest) is the tall cell, the next two
 * stack beside it, the rest pair up in halves, and an odd last one takes the full width with its rows in two
 * columns. Every row of the grid is filled edge to edge, so there are no holes at any width; below the grid's
 * breakpoints every cell takes the full width (ui/Grid.css).
 */
function telemetryLayout(groups: TeleGroup[]): Array<{ group: TeleGroup; span: 6 | 12; rows: 1 | 2; wide: boolean }> {
  if (groups.length === 1) return [{ group: groups[0], span: 12, rows: 1, wide: true }];
  const out: Array<{ group: TeleGroup; span: 6 | 12; rows: 1 | 2; wide: boolean }> = [];
  let rest = groups;
  if (groups.length >= 3) {
    out.push({ group: groups[0], span: 6, rows: 2, wide: false });
    out.push({ group: groups[1], span: 6, rows: 1, wide: false });
    out.push({ group: groups[2], span: 6, rows: 1, wide: false });
    rest = groups.slice(3);
  }
  rest.forEach((group, i) => {
    const alone = rest.length % 2 === 1 && i === rest.length - 1;
    out.push({ group, span: alone ? 12 : 6, rows: 1, wide: alone });
  });
  return out;
}

export function TelemetryTab({ telemetry, loaded, reportedAt }: { telemetry: TelemetrySnapshot | null; loaded: boolean; reportedAt?: number }) {
  const intl = useIntl();
  if (!telemetry) {
    if (!loaded) {
      return (
        <Grid stretch aria-busy="true">
          {[6, 6, 6, 6].map((span, i) => (
            <GridCell key={i} span={span as 6}>
              <Card>
                <SkeletonFacts count={i === 0 ? 8 : 4} label={i === 0 ? intl.formatMessage(messages.loadingTelemetry) : undefined} />
              </Card>
            </GridCell>
          ))}
        </Grid>
      );
    }
    return (
      <Card>
        <EmptyState icon={<IconPulse />} title={intl.formatMessage(messages.noTelemetryTitle)}>
          <FormattedMessage {...messages.noTelemetryText} />
        </EmptyState>
      </Card>
    );
  }
  const layout = telemetryLayout(telemetryGroups(telemetry, intl));
  return (
    <div className="v2-device-tele">
      {reportedAt ? (
        <p className="v2-device-meta v2-device-tele__when">
          <FormattedMessage
            {...messages.reported}
            values={{ when: <RelativeTime value={reportedAt} style="long" seconds /> }}
          />
        </p>
      ) : null}
      <Grid stretch className="v2-device-tele__grid">
        {layout.map(({ group, span, rows, wide }) => (
          <GridCell key={group.title} span={span} rows={rows}>
            <Card as="section" aria-label={group.title} className="v2-device-tele__card">
              <CardHeader title={group.title} level={3} spacing={8} />
              <KeyValueList items={group.items} columns={wide ? 2 : 1} />
            </Card>
          </GridCell>
        ))}
      </Grid>
    </div>
  );
}

/* ===============================================================================================================
   Activity: device events and the full command history
   =============================================================================================================== */

const activityMessagesRaw = defineMessages({
  events: { id: 'deviceDetail.activity.events', defaultMessage: 'Events' },
  eventCount: { id: 'deviceDetail.activity.eventCount', defaultMessage: '{count, plural, one {# event} other {# events}}' },
  loadingEvents: { id: 'deviceDetail.activity.loadingEvents', defaultMessage: 'Loading events' },
  deviceEvents: { id: 'deviceDetail.activity.deviceEvents', defaultMessage: 'Device events' },
  noEventsTitle: { id: 'deviceDetail.activity.noEventsTitle', defaultMessage: 'No events yet' },
  noEventsText: {
    id: 'deviceDetail.activity.noEventsText',
    defaultMessage: 'Boots, app installs, network changes and low battery show up here.',
  },
  commands: { id: 'deviceDetail.activity.commands', defaultMessage: 'Commands' },
});
const activityMessages: Record<keyof typeof activityMessagesRaw, MessageDescriptor> = activityMessagesRaw;

const locationMessagesRaw = defineMessages({
  title: { id: 'deviceDetail.location.title', defaultMessage: 'Location history' },
  timeRange: { id: 'deviceDetail.location.timeRange', defaultMessage: 'Time range' },
  latest: { id: 'deviceDetail.location.latest', defaultMessage: 'latest {when}' },
  refresh: { id: 'deviceDetail.location.refresh', defaultMessage: 'Refresh' },
  thing: { id: 'deviceDetail.location.thing', defaultMessage: 'the location history' },
  fixesBeforeOff: {
    id: 'deviceDetail.location.fixesBeforeOff',
    defaultMessage: 'The fixes below were reported before tracking was turned off.',
  },
  loading: { id: 'deviceDetail.location.loading', defaultMessage: 'Loading the location history' },
  emptyInRange: {
    id: 'deviceDetail.location.emptyInRange',
    defaultMessage:
      'No location in {kind, select, hour {the last hour} days {the last {count} days} other {the last {count} hours}}',
  },
  emptyInRangeText: { id: 'deviceDetail.location.emptyInRangeText', defaultMessage: 'Pick a longer range, or All.' },
  emptyTitle: { id: 'deviceDetail.location.emptyTitle', defaultMessage: 'No location reported yet' },
  emptyText: {
    id: 'deviceDetail.location.emptyText',
    defaultMessage: 'Wake the device, or switch it to Accurate location mode.',
  },
  mapInRange: {
    id: 'deviceDetail.location.mapInRange',
    defaultMessage:
      'Map of the device’s locations in {kind, select, hour {the last hour} days {the last {count} days} other {the last {count} hours}}',
  },
  mapRecent: { id: 'deviceDetail.location.mapRecent', defaultMessage: 'Map of the device’s recent locations' },
  asList: { id: 'deviceDetail.location.asList', defaultMessage: 'Locations as a list ({count})' },
  reportedLocations: { id: 'deviceDetail.location.reportedLocations', defaultMessage: 'Reported locations' },
  colWhen: { id: 'deviceDetail.location.colWhen', defaultMessage: 'When' },
  colPosition: { id: 'deviceDetail.location.colPosition', defaultMessage: 'Position' },
  colAccuracy: { id: 'deviceDetail.location.colAccuracy', defaultMessage: 'Accuracy' },
  colSource: { id: 'deviceDetail.location.colSource', defaultMessage: 'Source' },
});
const locationMessages: Record<keyof typeof locationMessagesRaw, MessageDescriptor> = locationMessagesRaw;

export function EventIcon({ type }: { type: string }) {
  switch (type) {
    case 'boot':
      return <IconPower size={15} />;
    case 'appInstalled':
      return <IconDownload size={15} />;
    case 'appUninstalled':
      return <IconTrash size={15} />;
    case 'commandResult':
      return <IconControl size={15} />;
    case 'connectivityChange':
      return <IconNetwork size={15} />;
    case 'lowBattery':
      return <IconBattery size={15} />;
    case 'enrolled':
      return <IconEnroll size={15} />;
    case 'kioskPinLockout':
      return <IconLock size={15} />;
    case 'kioskCrashLoop':
    case 'wipeNotStarted':
    case 'storageRecovered':
    case 'configReapplyFailed':
    case 'eventsDropped':
      return <IconAlert size={15} />;
    case 'kioskExit':
      return <IconExitKiosk size={15} />;
    case 'kioskReturn':
      return <IconEnterKiosk size={15} />;
    default:
      return <IconInfo size={15} />;
  }
}

export function ActivityTab({
  events,
  eventsLoaded,
  commands,
  commandsLoaded,
  now,
}: {
  events: DeviceEvent[];
  eventsLoaded: boolean;
  commands: CommandHistoryItem[];
  commandsLoaded: boolean;
  now: number;
}) {
  const titleId = useId();
  const intl = useIntl();
  return (
    <>
      <Card padding="list" clip aria-labelledby={titleId}>
        <CardHeader
          inset
          title={intl.formatMessage(activityMessages.events)}
          titleId={titleId}
          actions={
            events.length ? (
              <span className="v2-device-meta">{intl.formatMessage(activityMessages.eventCount, { count: events.length })}</span>
            ) : null
          }
        />
        {!eventsLoaded && !events.length ? (
          <SkeletonRows compact count={4} label={intl.formatMessage(activityMessages.loadingEvents)} />
        ) : events.length ? (
          <ActivityList aria-label={intl.formatMessage(activityMessages.deviceEvents)}>
            {events.map((e) => {
              const detail = eventDetail(e, { commands }, intl);
              return (
                <ActivityRow
                  key={e.id}
                  icon={<EventIcon type={e.type} />}
                  tone={eventTone(e.type)}
                  who={eventLabel(e.type, intl)}
                  what={detail ? <span className="v2-device-evdetail">{detail}</span> : ''}
                  when={<RelativeTime value={e.ts} />}
                />
              );
            })}
          </ActivityList>
        ) : (
          <div className="v2-device-cmds__empty">
            <EmptyState bare icon={<IconHistory />} title={intl.formatMessage(activityMessages.noEventsTitle)}>
              <FormattedMessage {...activityMessages.noEventsText} />
            </EmptyState>
          </div>
        )}
      </Card>
      <CommandsCard title={intl.formatMessage(activityMessages.commands)} items={commands} now={now} loaded={commandsLoaded} />
    </>
  );
}

/* ===============================================================================================================
   Location history (classic LocationPanel)
   =============================================================================================================== */

export function LocationTab({
  fixes,
  error,
  doNotTrack,
  onRefresh,
  refreshing,
  range,
  onRangeChange,
}: {
  fixes: LocationFix[] | null;
  error: string | null;
  doNotTrack: boolean | null;
  onRefresh: () => void;
  refreshing: boolean;
  /** Hours back from now; 0 is All. */
  range: number;
  onRangeChange: (hours: number) => void;
}) {
  const titleId = useId();
  const intl = useIntl();
  const inRange = range > 0 ? rangeParts(range) : undefined;
  // The list mounts only while it is open (up to 500 fixes).
  const [listOpen, setListOpen] = useState(false);
  return (
    <Card aria-labelledby={titleId} gap={16} className="v2-device-loc">
      <CardHeader
        title={intl.formatMessage(locationMessages.title)}
        titleId={titleId}
        actions={
          <>
            <Segmented size="sm" aria-label={intl.formatMessage(locationMessages.timeRange)} options={locationRangeOptions(intl)} value={range} onChange={onRangeChange} />
            {fixes ? (
              <span className="v2-device-meta">
                {fixesCount(fixes.length, range, intl)}
                {fixes[0] ? (
                  <>
                    {' · '}
                    <FormattedMessage
                      {...locationMessages.latest}
                      values={{ when: <RelativeTime value={fixes[0].capturedAt} /> }}
                    />
                  </>
                ) : null}
              </span>
            ) : null}
            <Button size="sm" icon={<IconSync />} disabled={refreshing} onClick={onRefresh}>
              <FormattedMessage {...locationMessages.refresh} />
            </Button>
          </>
        }
      />
      {error ? <ErrorState thing={intl.formatMessage(locationMessages.thing)} detail={error} onRetry={onRefresh} retrying={refreshing} /> : null}
      {doNotTrack ? (
        <Callout tone="info" icon={<IconInfo />}>
          {intl.formatMessage(doNotTrackHintMessage)}
          {fixes && fixes.length > 0 ? (
            <>
              {' '}
              <FormattedMessage {...locationMessages.fixesBeforeOff} />
            </>
          ) : null}
        </Callout>
      ) : null}
      {!fixes && !error ? (
        <div role="status">
          <span className="v2-visually-hidden">{intl.formatMessage(locationMessages.loading)}</span>
          <Skeleton className="v2-device-loc__skel" />
        </div>
      ) : null}
      {fixes && fixes.length === 0 && inRange ? (
        <EmptyState bare icon={<IconPin />} title={intl.formatMessage(locationMessages.emptyInRange, inRange)}>
          <FormattedMessage {...locationMessages.emptyInRangeText} />
        </EmptyState>
      ) : null}
      {fixes && fixes.length === 0 && !inRange && !doNotTrack ? (
        <EmptyState bare icon={<IconPin />} title={intl.formatMessage(locationMessages.emptyTitle)}>
          <FormattedMessage {...locationMessages.emptyText} />
        </EmptyState>
      ) : null}
      {fixes && fixes.length > 0 ? (
        <LocationMap
          fixes={fixes}
          fitKey={range}
          label={inRange ? intl.formatMessage(locationMessages.mapInRange, inRange) : intl.formatMessage(locationMessages.mapRecent)}
        />
      ) : null}
      {fixes && fixes.length > 0 ? (
        // The map's points open their details on a pointer only; the same fixes as text, for keyboards and screen
        // readers (2.1.1, 1.1.1).
        <details className="v2-device-loclist" onToggle={(e) => setListOpen(e.currentTarget.open)}>
          <summary>{intl.formatMessage(locationMessages.asList, { count: fixes.length })}</summary>
          {listOpen ? (
            <Table<LocationFix>
              aria-label={intl.formatMessage(locationMessages.reportedLocations)}
              edge={0}
              rowPad={10}
              rows={fixes}
              rowKey={(f) => f.id ?? f.capturedAt}
              columns={[
                { key: 'when', header: intl.formatMessage(locationMessages.colWhen), cell: (f) => fmtDateTime(f.capturedAt) },
                { key: 'where', header: intl.formatMessage(locationMessages.colPosition), cell: (f) => <span className="v2-mono">{`${f.lat.toFixed(5)}, ${f.lon.toFixed(5)}`}</span> },
                { key: 'acc', header: intl.formatMessage(locationMessages.colAccuracy), cell: (f) => (f.accuracy != null ? fmtAccuracy(f.accuracy, intl) : DASH) },
                { key: 'src', header: intl.formatMessage(locationMessages.colSource), cell: (f) => f.provider || DASH },
              ]}
            />
          ) : null}
        </details>
      ) : null}
    </Card>
  );
}
