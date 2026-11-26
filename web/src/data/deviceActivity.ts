// Device activity wording shared by the Overview feed and the device page: command names, the detail line of a
// command, and device event labels. Pure, no React.
import { createIntl, defineMessages, type IntlShape, type MessageDescriptor } from 'react-intl';
import type { CommandHistoryItem } from '../api/commands';
import { classifyOutcome, outcomeSummary } from './configOutcomes';

const commandMessagesRaw = defineMessages({
  configApply: { id: 'deviceActivity.command.configApply', defaultMessage: 'Apply configuration' },
  configSync: { id: 'deviceActivity.command.configSync', defaultMessage: 'Sync configuration' },
  lock: { id: 'deviceActivity.command.lock', defaultMessage: 'Lock' },
  reboot: { id: 'deviceActivity.command.reboot', defaultMessage: 'Reboot' },
  wipe: { id: 'deviceActivity.command.wipe', defaultMessage: 'Factory reset' },
  passcodeReset: { id: 'deviceActivity.command.passcodeReset', defaultMessage: 'Reset passcode' },
  alert: { id: 'deviceActivity.command.alert', defaultMessage: 'Send alert' },
  lockscreenMessage: { id: 'deviceActivity.command.lockscreenMessage', defaultMessage: 'Lock-screen message' },
  ring: { id: 'deviceActivity.command.ring', defaultMessage: 'Ring' },
  ringStop: { id: 'deviceActivity.command.ringStop', defaultMessage: 'Stop ringing' },
  powerMode: { id: 'deviceActivity.command.powerMode', defaultMessage: 'Connection mode' },
  locationMode: { id: 'deviceActivity.command.locationMode', defaultMessage: 'Location mode' },
  kioskEnter: { id: 'deviceActivity.command.kioskEnter', defaultMessage: 'Enter kiosk' },
  kioskExit: { id: 'deviceActivity.command.kioskExit', defaultMessage: 'Exit kiosk' },
  clearPinLockout: { id: 'deviceActivity.command.clearPinLockout', defaultMessage: 'Clear PIN lockout' },
  appInstall: { id: 'deviceActivity.command.appInstall', defaultMessage: 'Install app' },
  appUninstall: { id: 'deviceActivity.command.appUninstall', defaultMessage: 'Uninstall app' },
  appsScan: { id: 'deviceActivity.command.appsScan', defaultMessage: 'Scan apps' },
  appsIcons: { id: 'deviceActivity.command.appsIcons', defaultMessage: 'Fetch app icons' },
  policyApply: { id: 'deviceActivity.command.policyApply', defaultMessage: 'Apply policy' },
  remoteStart: { id: 'deviceActivity.command.remoteStart', defaultMessage: 'Start remote session' },
  remoteStop: { id: 'deviceActivity.command.remoteStop', defaultMessage: 'Stop remote session' },
});
const commandMessages: Record<keyof typeof commandMessagesRaw, MessageDescriptor> = commandMessagesRaw;

const COMMAND_NAMES: Record<string, MessageDescriptor> = {
  'config.apply': commandMessages.configApply,
  'config.sync': commandMessages.configSync,
  'device.lock': commandMessages.lock,
  'device.reboot': commandMessages.reboot,
  'device.wipe': commandMessages.wipe,
  'device.passcodeReset': commandMessages.passcodeReset,
  'device.alert': commandMessages.alert,
  'device.lockscreenMessage': commandMessages.lockscreenMessage,
  'device.ring': commandMessages.ring,
  'device.ringStop': commandMessages.ringStop,
  'device.powerMode': commandMessages.powerMode,
  'device.locationMode': commandMessages.locationMode,
  'kiosk.enter': commandMessages.kioskEnter,
  'kiosk.exit': commandMessages.kioskExit,
  'kiosk.clearPinLockout': commandMessages.clearPinLockout,
  'app.install': commandMessages.appInstall,
  'app.uninstall': commandMessages.appUninstall,
  'apps.scan': commandMessages.appsScan,
  'apps.icons': commandMessages.appsIcons,
  'policy.apply': commandMessages.policyApply,
  'remote.startSession': commandMessages.remoteStart,
  'remote.stopSession': commandMessages.remoteStop,
};

const detailMessagesRaw = defineMessages({
  outcomeFailed: { id: 'deviceActivity.detail.outcomeFailed', defaultMessage: '{label} failed' },
  appsFound: { id: 'deviceActivity.detail.appsFound', defaultMessage: '{count, plural, one {# app} other {# apps}} found' },
  icons: { id: 'deviceActivity.detail.icons', defaultMessage: '{count, plural, one {# icon} other {# icons}}' },
});
const detailMessages: Record<keyof typeof detailMessagesRaw, MessageDescriptor> = detailMessagesRaw;

// English, for callers that pass no intl.
const EN = createIntl({ locale: 'en' });

export function commandName(type: string, intl: IntlShape = EN): string {
  const d = Object.prototype.hasOwnProperty.call(COMMAND_NAMES, type) ? COMMAND_NAMES[type] : undefined;
  return d ? intl.formatMessage(d) : type;
}

/** The time a command row shows: when it finished, else when it was delivered, else queued. */
export function commandTime(c: CommandHistoryItem): number | undefined {
  return c.completedAt || c.deliveredAt || c.createdAt || undefined;
}

/**
 * The detail line for a command: JSON results are summarised (config.apply outcomes, app scans, icon batches);
 * everything else is the agent's text. App commands lead with their package.
 */
export function commandDetail(c: CommandHistoryItem, intl: IntlShape = EN): string | undefined {
  const parts: string[] = [];
  if (c.subject) parts.push(c.subject);
  const d = c.detail?.trim();
  if (d) {
    let summary: string | undefined;
    if (d.startsWith('{')) {
      try {
        const j = JSON.parse(d) as Record<string, unknown>;
        if (j.outcomes && typeof j.outcomes === 'object') {
          const list = Object.entries(j.outcomes as Record<string, string>).map(([k, v]) => classifyOutcome(k, String(v), intl));
          const bad = list.filter((o) => o.kind === 'failed');
          summary = bad.length
            ? bad.map((o) => (o.reason ? `${o.label}: ${o.reason}` : intl.formatMessage(detailMessages.outcomeFailed, { label: o.label }))).join('; ')
            : outcomeSummary(list, intl).replace(/\.$/, '');
        } else if (Array.isArray(j.apps)) {
          summary = intl.formatMessage(detailMessages.appsFound, { count: j.apps.length });
        } else if (Array.isArray(j.icons)) {
          summary = intl.formatMessage(detailMessages.icons, { count: j.icons.length });
        }
      } catch {
        /* not JSON after all: show the text */
      }
    }
    parts.push(summary ?? d);
  }
  return parts.length ? parts.join(' · ') : undefined;
}

/** Device event type → label (the device page's event list, the v0.3 console's EventTimeline wording). */
const EVENT_LABEL_MESSAGESRaw = defineMessages({
  boot: { id: 'deviceActivity.event.boot', defaultMessage: 'Booted' },
  appInstalled: { id: 'deviceActivity.event.appInstalled', defaultMessage: 'App installed' },
  appUninstalled: { id: 'deviceActivity.event.appUninstalled', defaultMessage: 'App uninstalled' },
  commandResult: { id: 'deviceActivity.event.commandResult', defaultMessage: 'Command' },
  connectivityChange: { id: 'deviceActivity.event.connectivityChange', defaultMessage: 'Network change' },
  lowBattery: { id: 'deviceActivity.event.lowBattery', defaultMessage: 'Low battery' },
  enrolled: { id: 'deviceActivity.event.enrolled', defaultMessage: 'Enrolled' },
  kioskPinLockout: { id: 'deviceActivity.event.kioskPinLockout', defaultMessage: 'Exit PIN locked' },
  kioskCrashLoop: { id: 'deviceActivity.event.kioskCrashLoop', defaultMessage: 'Kiosk app keeps closing' },
  kioskExit: { id: 'deviceActivity.event.kioskExit', defaultMessage: 'Left kiosk mode' },
  kioskReturn: { id: 'deviceActivity.event.kioskReturn', defaultMessage: 'Returned to kiosk mode' },
  wipeNotStarted: { id: 'deviceActivity.event.wipeNotStarted', defaultMessage: 'Factory reset didn’t start' },
  storageRecovered: { id: 'deviceActivity.event.storageRecovered', defaultMessage: 'Storage recovered' },
  configReapplyFailed: { id: 'deviceActivity.event.configReapplyFailed', defaultMessage: 'Config re-apply failed' },
  eventsDropped: { id: 'deviceActivity.event.eventsDropped', defaultMessage: 'Events dropped' },
});
export const EVENT_LABEL_MESSAGES: Record<keyof typeof EVENT_LABEL_MESSAGESRaw, MessageDescriptor> = EVENT_LABEL_MESSAGESRaw;

/** The same events as a verb phrase after the device name ("KIOSK-FRONT booted"), the v0.3 console's Dashboard wording. */
const EVENT_VERB_MESSAGESRaw = defineMessages({
  boot: { id: 'deviceActivity.eventVerb.boot', defaultMessage: 'booted' },
  appInstalled: { id: 'deviceActivity.eventVerb.appInstalled', defaultMessage: 'installed an app' },
  appUninstalled: { id: 'deviceActivity.eventVerb.appUninstalled', defaultMessage: 'removed an app' },
  commandResult: { id: 'deviceActivity.eventVerb.commandResult', defaultMessage: 'ran a command' },
  connectivityChange: { id: 'deviceActivity.eventVerb.connectivityChange', defaultMessage: 'changed network' },
  lowBattery: { id: 'deviceActivity.eventVerb.lowBattery', defaultMessage: 'reported low battery' },
  enrolled: { id: 'deviceActivity.eventVerb.enrolled', defaultMessage: 'enrolled' },
  kioskPinLockout: { id: 'deviceActivity.eventVerb.kioskPinLockout', defaultMessage: 'locked the exit PIN' },
  kioskCrashLoop: { id: 'deviceActivity.eventVerb.kioskCrashLoop', defaultMessage: 'reported the kiosk app keeps closing' },
  kioskExit: { id: 'deviceActivity.eventVerb.kioskExit', defaultMessage: 'left kiosk mode' },
  kioskReturn: { id: 'deviceActivity.eventVerb.kioskReturn', defaultMessage: 'returned to kiosk mode' },
  wipeNotStarted: { id: 'deviceActivity.eventVerb.wipeNotStarted', defaultMessage: 'didn’t start its factory reset' },
  storageRecovered: { id: 'deviceActivity.eventVerb.storageRecovered', defaultMessage: 'recovered damaged storage' },
  configReapplyFailed: { id: 'deviceActivity.eventVerb.configReapplyFailed', defaultMessage: 'failed to re-apply its configuration' },
  eventsDropped: { id: 'deviceActivity.eventVerb.eventsDropped', defaultMessage: 'dropped events it could not send' },
});
export const EVENT_VERB_MESSAGES: Record<keyof typeof EVENT_VERB_MESSAGESRaw, MessageDescriptor> = EVENT_VERB_MESSAGESRaw;

const plain = (m: Record<string, MessageDescriptor>): Record<string, string> =>
  Object.fromEntries(Object.entries(m).map(([k, d]) => [k, d.defaultMessage as string]));

/** The English labels, by event type (tests and callers without an intl); the console shows EVENT_LABEL_MESSAGES. */
export const EVENT_LABELS: Record<string, string> = plain(EVENT_LABEL_MESSAGES);

/** The English verb phrases, by event type; the console shows EVENT_VERB_MESSAGES. */
export const EVENT_VERBS: Record<string, string> = plain(EVENT_VERB_MESSAGES);

/** An event type's label in the console's language (the raw type when it is not a known one). */
export function eventLabel(type: string, intl: IntlShape = EN): string {
  const d = (EVENT_LABEL_MESSAGES as Record<string, MessageDescriptor>)[type];
  return d ? intl.formatMessage(d) : type;
}

/** An event type's verb phrase in the console's language (the raw type when it is not a known one). */
export function eventVerb(type: string, intl: IntlShape = EN): string {
  const d = (EVENT_VERB_MESSAGES as Record<string, MessageDescriptor>)[type];
  return d ? intl.formatMessage(d) : type;
}

/** A commandResult event's detail is "<commandId>:<status>" (agent CheckInCoordinator); null for anything else. */
export function parseCommandResult(detail: string | null | undefined): { id: string; status: string } | null {
  const m = detail?.match(/^(\d+):([\w.-]+)$/);
  return m ? { id: m[1], status: m[2] } : null;
}

/** A command's reported step, as words after its name ("Lock: done"). */
const stepMessagesRaw = defineMessages({
  done: { id: 'deviceActivity.step.done', defaultMessage: 'done' },
  failed: { id: 'deviceActivity.step.failed', defaultMessage: 'failed' },
  expired: { id: 'deviceActivity.step.expired', defaultMessage: 'expired' },
  unsupported: { id: 'deviceActivity.step.unsupported', defaultMessage: 'not supported' },
  accepted: { id: 'deviceActivity.step.accepted', defaultMessage: 'running' },
  delivered: { id: 'deviceActivity.step.delivered', defaultMessage: 'delivered' },
  pending: { id: 'deviceActivity.step.pending', defaultMessage: 'pending' },
});
const STEP_WORDS: Record<string, MessageDescriptor> = stepMessagesRaw;

const eventDetailMessagesRaw = defineMessages({
  // A command result whose command is not in the history: its number, then its step ("Command #12: done").
  unknownCommand: { id: 'deviceActivity.eventDetail.unknownCommand', defaultMessage: 'Command #{id}: {step}' },
  // A command's name, then its step ("Lock: done").
  commandStep: { id: 'deviceActivity.eventDetail.commandStep', defaultMessage: '{name}: {step}' },
  kioskExited: { id: 'deviceActivity.eventDetail.kioskExited', defaultMessage: 'With the exit PIN, on the device' },
  kioskReturned: { id: 'deviceActivity.eventDetail.kioskReturned', defaultMessage: 'From the device' },
});
const eventDetailMessages: Record<keyof typeof eventDetailMessagesRaw, MessageDescriptor> = eventDetailMessagesRaw;

/** The agent's fixed sentences for the on-device kiosk exit and return (KioskLauncherActivity, StatusViewModel). */
const KIOSK_DETAILS: Record<string, MessageDescriptor> = {
  'exited on-device': eventDetailMessages.kioskExited,
  'returned on-device': eventDetailMessages.kioskReturned,
};

const own = <T,>(map: Record<string, T>, key: string): T | undefined =>
  Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined;

/**
 * An event's detail line, in words. A command result names its command and step ("Lock: done", "Install app:
 * failed · com.x · checksum mismatch") from the device's command history, when `commands` has it; an app event
 * shows the library's name for the package (`appNames`); the on-device kiosk exit and return say so plainly.
 * Anything else is the agent's detail as sent (network type, battery level and the like, when it sends them).
 */
export function eventDetail(
  ev: { type: string; detail?: string | null },
  { commands, appNames }: { commands?: readonly CommandHistoryItem[]; appNames?: Record<string, string> } = {},
  intl: IntlShape = EN,
): string | undefined {
  const raw = ev.detail?.trim() || undefined;
  switch (ev.type) {
    case 'commandResult': {
      const r = parseCommandResult(raw);
      if (!r) return raw;
      const status = r.status.toLowerCase();
      const word = own(STEP_WORDS, status);
      const step = word ? intl.formatMessage(word) : status;
      const c = commands?.find((x) => String(x.id) === r.id);
      if (!c) return intl.formatMessage(eventDetailMessages.unknownCommand, { id: r.id, step });
      // The history holds the command's last result: its detail belongs to this event only when this is that step.
      const more = c.status === status ? commandDetail(c, intl) : c.subject || undefined;
      const line = intl.formatMessage(eventDetailMessages.commandStep, { name: commandName(c.type, intl), step });
      return more ? `${line} · ${more}` : line;
    }
    case 'appInstalled':
    case 'appUninstalled':
      return raw && (appNames?.[raw] ?? raw);
    case 'kioskExit':
    case 'kioskReturn': {
      const d = raw ? own(KIOSK_DETAILS, raw) : undefined;
      return d ? intl.formatMessage(d) : raw;
    }
    default:
      return raw;
  }
}
