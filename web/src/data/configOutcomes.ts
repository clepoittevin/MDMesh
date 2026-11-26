// config.apply outcomes (the agent's per-key result in a command's `detail`): labels, classification and the one-line
// summary. Shared by the device page's configuration panel and the command history wording (deviceActivity.ts).
import { defineMessages, type IntlShape } from 'react-intl';
import { CONFIG_FIELDS } from './configFields';
import { EN_INTL, untyped } from './configIntl';

const FIELD_LABEL = new Map(CONFIG_FIELDS.map((f) => [f.key, f.label]));

const messages = untyped(defineMessages({
  appPermission: { id: 'configurations.outcome.label.appPermission', defaultMessage: 'App permission: {name}' },
  kiosk: { id: 'configurations.outcome.label.kiosk', defaultMessage: 'Kiosk mode' },
  kioskGuard: { id: 'configurations.outcome.label.kioskGuard', defaultMessage: 'Kiosk protection' },
  location: { id: 'configurations.outcome.label.location', defaultMessage: 'Location reporting' },
  connectivity: { id: 'configurations.outcome.label.connectivity', defaultMessage: 'Connectivity' },
  apps: { id: 'configurations.outcome.label.apps', defaultMessage: 'Apps' },
  applied: { id: 'configurations.outcome.text.applied', defaultMessage: 'Applied' },
  notSupported: { id: 'configurations.outcome.text.notSupported', defaultMessage: 'Not supported' },
  notRequested: { id: 'configurations.outcome.text.notRequested', defaultMessage: 'Not requested by this app' },
  deferred: { id: 'configurations.outcome.text.deferred', defaultMessage: 'Deferred' },
  failed: { id: 'configurations.outcome.text.failed', defaultMessage: 'Failed' },
  requiresDeviceOwner: { id: 'configurations.outcome.reason.requiresDeviceOwner', defaultMessage: 'Requires Device Owner mode.' },
  requiresAndroid11: {
    id: 'configurations.outcome.reason.requiresAndroid11',
    defaultMessage: 'Requires Android 11 or later (this device is API {api}).',
  },
  requiresAgent: {
    id: 'configurations.outcome.reason.requiresAgent',
    defaultMessage: 'Requires an agent that supports Location services.',
  },
  summary: {
    id: 'configurations.outcome.summary.line',
    defaultMessage:
      '{applied, plural, one {# setting applied} other {# settings applied}}{failed, plural, =0 {} other {, # failed}}{deferred, plural, =0 {} one {, # deferred} other {, # deferred}}{unsupported, plural, =0 {} other {, # not supported on this device}}.',
  },
}));

/** A server plugin's policy key, `x.<plugin id>.<key>` (DesiredConfigContributor), as its plugin and its key. */
const PLUGIN_KEY = /^x\.([a-z][a-z0-9-]*)\.([A-Za-z][A-Za-z0-9]*)$/;

/** Mixed-case words a key may hold, as a label spells them (a whole word only: not followed by a lowercase letter). */
const KNOWN_WORDS: Readonly<Record<string, string>> = { IPv4: 'IPv4', IPv6: 'IPv6', WiFi: 'Wi-Fi', '2FA': '2FA' };
const KNOWN_WORD = new RegExp(`(${Object.keys(KNOWN_WORDS).join('|')})(?![a-z])`);

/** camelCase in words, lowercase but for its acronyms. */
function humps(part: string): string[] {
  return part
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(' ')
    .filter(Boolean)
    .map((w) => (/^[A-Z][A-Z0-9]+$/.test(w) ? w : w.toLowerCase()));
}

/**
 * A camelCase key in words, lowercase but for its acronyms and the mixed-case words it knows: `blockTethering` →
 * "block tethering", `enableUSB` → "enable USB", `USBMode` → "USB mode", `enableIPv6` → "enable IPv6", `allowWiFi` →
 * "allow Wi-Fi".
 */
function words(key: string): string {
  // split() with a capturing group puts each known word at an odd index.
  return key
    .split(KNOWN_WORD)
    .flatMap((part, i) => (i % 2 ? [KNOWN_WORDS[part]] : humps(part)))
    .join(' ');
}

/**
 * config.apply outcome key → label: `policies.usbStorage` → "USB storage", `kiosk` → "Kiosk mode", `kiosk.guard` →
 * "Kiosk protection", a server plugin's `policies.x.netaccess.blockTethering` → "netaccess: block tethering".
 */
export function outcomeKeyLabel(key: string, intl: IntlShape = EN_INTL): string {
  if (key.startsWith('appPermissions.')) {
    const rest = key.slice('appPermissions.'.length);
    const split = rest.indexOf('.android.permission.');
    if (split > 0) return `${rest.slice(0, split)}: ${words(rest.slice(split + '.android.permission.'.length)).toLowerCase()}`;
    return intl.formatMessage(messages.appPermission, { name: rest });
  }
  const k = key.startsWith('policies.') ? key.slice('policies.'.length) : key;
  if (k === 'kiosk') return intl.formatMessage(messages.kiosk);
  if (k === 'kiosk.guard') return intl.formatMessage(messages.kioskGuard);
  if (k === 'location') return intl.formatMessage(messages.location);
  if (k === 'connectivity') return intl.formatMessage(messages.connectivity);
  if (k === 'apps' || k === 'applications') return intl.formatMessage(messages.apps);
  const plugin = key.startsWith('policies.') ? PLUGIN_KEY.exec(k) : null;
  if (plugin) return `${plugin[1]}: ${words(plugin[2])}`;
  const field = FIELD_LABEL.get(k);
  return field ? intl.formatMessage(field) : key;
}

export type OutcomeKind = 'applied' | 'failed' | 'unsupported' | 'deferred';

export interface Outcome {
  key: string;
  label: string;
  kind: OutcomeKind;
  /** The value column ("Applied", "Failed", "Not supported", "Deferred"). */
  text: string;
  /** The reason after "failed: " / "deferred: ". */
  reason?: string;
}

/** Context the console already knows when it explains a device-specific unsupported outcome. */
export interface OutcomeDeviceContext {
  androidSdkInt?: number;
  isDeviceOwner?: boolean;
}

/**
 * An older agent and an older Android release both return the wire-level `unsupported` outcome. Give the only
 * version-gated core policy a useful, truthful distinction without inventing a new protocol result reason.
 */
export function unsupportedOutcomeReason(
  key: string,
  context: OutcomeDeviceContext,
  intl: IntlShape = EN_INTL,
): string | undefined {
  if (key !== 'policies.locationServices') return undefined;
  if (context.isDeviceOwner === false) return intl.formatMessage(messages.requiresDeviceOwner);
  if (context.androidSdkInt != null && context.androidSdkInt < 30) {
    return intl.formatMessage(messages.requiresAndroid11, { api: context.androidSdkInt });
  }
  return intl.formatMessage(messages.requiresAgent);
}

/** Classify one outcome string from `lastCommand.detail` (proto config-apply-result). */
export function classifyOutcome(key: string, raw: string, intl: IntlShape = EN_INTL): Outcome {
  const label = outcomeKeyLabel(key, intl);
  const say = (m: (typeof messages)[keyof typeof messages]) => intl.formatMessage(m);
  const reasonOf = (p: string) => {
    const r = raw.slice(p.length).replace(/^[:\s]+/, '').trim();
    return r || undefined;
  };
  if (raw === 'applied') return { key, label, kind: 'applied', text: say(messages.applied) };
  if (raw === 'unsupported') return { key, label, kind: 'unsupported', text: say(messages.notSupported) };
  if (raw === 'not-requested') return { key, label, kind: 'unsupported', text: say(messages.notRequested) };
  if (raw.startsWith('deferred')) return { key, label, kind: 'deferred', text: say(messages.deferred), reason: reasonOf('deferred') };
  if (raw.startsWith('failed')) return { key, label, kind: 'failed', text: say(messages.failed), reason: reasonOf('failed') };
  return { key, label, kind: 'failed', text: raw };
}

/** "4 settings applied, 1 failed, 1 not supported on this device." */
export function outcomeSummary(list: Outcome[], intl: IntlShape = EN_INTL): string {
  const n = (k: OutcomeKind) => list.filter((o) => o.kind === k).length;
  return intl.formatMessage(messages.summary, {
    applied: n('applied'),
    failed: n('failed'),
    deferred: n('deferred'),
    unsupported: n('unsupported'),
  });
}
