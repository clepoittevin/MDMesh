import { defineMessages, type IntlShape, type MessageDescriptor } from 'react-intl';
import { apiClient } from './client';

// Queue a command for a device (agent v1 contract):
//   POST /rest/private/agent/v1/devices/{deviceId}/commands
//   body: { type, requiresCapability?, payload? }   payload is a JSON STRING.
// Returns the queued command (we read its id defensively for the toast).

export interface QueueCommandRequest {
  type: string;
  requiresCapability?: string;
  /** A JSON-encoded string, not an object. */
  payload?: string;
}

export interface QueuedCommand {
  id?: number | string;
  type?: string;
  status?: string;
  [key: string]: unknown;
}

/** A user-facing command the console can dispatch. */
export interface CommandTemplate {
  key: string;
  label: string;
  description: string;
  /** Visual tone: a destructive/disruptive action is flagged. */
  danger?: boolean;
  request: QueueCommandRequest;
}

/** Why a command type isn't sent to several devices at once (isBulkForbidden). */
export const BULK_FORBIDDEN_TEXT = 'Wipe, passcode reset and app uninstall are sent from the device’s page only.';

/** The server's error keys for a refused command, as messages (shown translated; commandErrorText gives the English). */
export const commandErrorMessages: Record<string, MessageDescriptor> = defineMessages({
  'error.agent.command.wiped': {
    id: 'commands.error.wiped',
    defaultMessage: 'The device was wiped, so it takes no more commands.',
  },
  'error.agent.command.noConfiguration': {
    id: 'commands.error.noConfiguration',
    defaultMessage: 'The device has no configuration, so there is no configured kiosk to return to.',
  },
  'error.agent.command.serverOwned': {
    id: 'commands.error.serverOwned',
    defaultMessage: 'The server sends the configuration itself. Use Retry apply on the device page.',
  },
  'error.agent.command.bulkForbidden': {
    id: 'commands.error.bulkForbidden',
    defaultMessage: 'Wipe, passcode reset and app uninstall are sent from the device’s page only.',
  },
  'error.agent.device.unknown': {
    id: 'commands.error.deviceUnknown',
    defaultMessage: 'The server has no device with this number. It may have been deleted.',
  },
});
const hasOwn = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
/** What a refused command (or Install configuration apps, or Retry apply) says, by the server's error key. */
export function commandErrorText(e: unknown): string {
  const message = e instanceof Error ? e.message : '';
  return hasOwn(commandErrorMessages, message) ? String(commandErrorMessages[message].defaultMessage) : message;
}
/** commandErrorText in the console's language: a known server key is translated, anything else is shown as sent. */
export function formatCommandError(intl: IntlShape, e: unknown): string {
  const message = e instanceof Error ? e.message : '';
  return hasOwn(commandErrorMessages, message) ? intl.formatMessage(commandErrorMessages[message]) : message;
}

export async function queueCommand(
  deviceId: number | string,
  req: QueueCommandRequest,
  signal?: AbortSignal,
): Promise<QueuedCommand> {
  return apiClient.post<QueuedCommand>(
    `/private/agent/v1/devices/${deviceId}/commands`,
    req,
    signal,
  );
}

export interface BulkCommandResult {
  queued: number;
  skipped: number[];
}

/**
 * What the bulk endpoint refuses (AdminCommandPolicy.BULK_FORBIDDEN_TYPES), lowercase: wipe, passcode reset, and an
 * app's uninstall or hide (app.setHidden is reserved: no agent handles it yet).
 */
const BULK_FORBIDDEN_TYPES: readonly string[] = ['device.wipe', 'device.passcodereset', 'app.uninstall', 'app.sethidden'];

/** Whether the bulk endpoint refuses this command type, compared as the server compares it (trimmed, any case). */
export const isBulkForbidden = (type: string): boolean => BULK_FORBIDDEN_TYPES.includes(type.trim().toLowerCase());

/**
 * Queue one opaque command for many devices at once (agent-v1 bulk contract):
 *   POST /rest/private/agent/v1/bulk/commands   body: { deviceIds, command }
 * `deviceIds` are numeric device ids (as held by the DevicesPage selection); the server resolves each
 * to its device number. Destructive types are rejected server-side. Fire-and-forget.
 */
export async function bulkQueueCommand(
  deviceIds: number[],
  req: QueueCommandRequest,
  signal?: AbortSignal,
): Promise<BulkCommandResult> {
  return apiClient.post<BulkCommandResult>(
    '/private/agent/v1/bulk/commands',
    { deviceIds, command: req },
    signal,
  );
}

// --- Remote Actions catalog + device state/history/sync ----------------------------

export interface ActionParam {
  key: string;
  label: string;
  kind: 'text' | 'password' | 'number';
  required?: boolean;
  placeholder?: string;
}

export interface CommandTemplateExt extends CommandTemplate {
  /** Inputs gathered before sending; values folded into the payload by `build`. */
  params?: ActionParam[];
  /** Confirmation strength required before queueing. */
  confirm?: 'simple' | 'type-to-confirm';
  /** The title of the dialog that asks first ("Reboot device?"); defaults to `label`, which is the verb. */
  title?: string;
  /** Bucket for grouping in the UI. */
  group?: 'safe' | 'disruptive' | 'destructive';
  /** Builds the request from gathered params (overrides static `request` when present). */
  build?: (values: Record<string, string>) => QueueCommandRequest;
}

export const ACTION_TEMPLATES: CommandTemplateExt[] = [
  {
    key: 'lockscreen-message', label: 'Set lock-screen message', title: 'Lock-screen message', group: 'safe',
    description: 'Shows your message on the lock screen. Leave it empty to clear it.',
    params: [{ key: 'message', label: 'Message', kind: 'text', placeholder: 'Property of ACME IT' }],
    request: { type: 'device.lockscreenMessage', requiresCapability: 'device.lockscreenMessage' },
    build: (v) => ({
      type: 'device.lockscreenMessage', requiresCapability: 'device.lockscreenMessage',
      payload: JSON.stringify({ message: v.message ?? '' }),
    }),
  },
  {
    key: 'alert', label: 'Send alert', group: 'safe',
    description: 'Shows a high-priority message on the device.',
    params: [
      { key: 'title', label: 'Title', kind: 'text', placeholder: 'Message from IT' },
      { key: 'body', label: 'Message', kind: 'text', required: true },
    ],
    request: { type: 'device.alert', requiresCapability: 'device.alert' },
    build: (v) => ({
      type: 'device.alert', requiresCapability: 'device.alert',
      payload: JSON.stringify({ title: v.title || undefined, body: v.body ?? '' }),
    }),
  },
  {
    key: 'ring', label: 'Ring', group: 'safe',
    description: 'Plays a loud locate tone for 30 seconds.',
    request: {
      type: 'device.ring', requiresCapability: 'device.ring',
      payload: JSON.stringify({ durationMs: 30000 }),
    },
  },
  {
    key: 'ring-stop', label: 'Stop ringing', group: 'safe',
    description: 'Silences a locate tone that is playing.',
    request: { type: 'device.ringStop', requiresCapability: 'device.ringStop' },
  },
  {
    key: 'lock', label: 'Lock', title: 'Lock device?', group: 'disruptive', danger: true,
    description: 'Locks the screen now.',
    request: { type: 'device.lock', requiresCapability: 'device.lock' },
  },
  {
    key: 'reboot', label: 'Reboot', title: 'Reboot device?', group: 'disruptive', danger: true,
    description: 'The device restarts and is unavailable for about a minute.', confirm: 'simple',
    request: { type: 'device.reboot', requiresCapability: 'device.reboot' },
  },
  {
    key: 'passcode-reset', label: 'Reset passcode', title: 'Reset passcode?', group: 'destructive', danger: true,
    description: 'The current passcode stops working. Leave the new one blank to remove it.', confirm: 'simple',
    params: [{ key: 'newPassword', label: 'New passcode (blank to clear)', kind: 'password' }],
    request: { type: 'device.passcodeReset', requiresCapability: 'device.passcodeReset' },
    build: (v) => ({
      type: 'device.passcodeReset', requiresCapability: 'device.passcodeReset',
      payload: JSON.stringify({ newPassword: v.newPassword ?? '' }),
    }),
  },
  {
    key: 'wipe', label: 'Factory reset', title: 'Factory reset?', group: 'destructive', danger: true,
    description: 'Erases all data. This can’t be undone.', confirm: 'type-to-confirm',
    request: { type: 'device.wipe', requiresCapability: 'device.wipe' },
  },
  {
    key: 'power-adaptive', label: 'Connectivity: Battery-saver', group: 'safe',
    description: 'Hold the live connection only when the screen is on or charging; use the low-power heartbeat when idle. Battery-friendly default.',
    request: {
      type: 'device.powerMode', requiresCapability: 'device.powerMode',
      payload: JSON.stringify({ mode: 'adaptive' }),
    },
  },
  {
    key: 'power-always', label: 'Connectivity: Always-on', group: 'safe',
    description: 'Keep the live connection up 24/7 for constant instant connectivity (higher battery use).',
    request: {
      type: 'device.powerMode', requiresCapability: 'device.powerMode',
      payload: JSON.stringify({ mode: 'alwaysOn' }),
    },
  },
  {
    key: 'location-passive', label: 'Location: Battery-saver', group: 'safe',
    description: 'Report the device’s last-known location each check-in — near-zero battery, no active GPS.',
    request: {
      type: 'device.locationMode', requiresCapability: 'device.locationMode',
      payload: JSON.stringify({ mode: 'passive' }),
    },
  },
  {
    key: 'location-active', label: 'Location: Accurate', group: 'safe',
    description: 'Take a fresh GPS fix each check-in for tighter tracking (higher battery use).',
    request: {
      type: 'device.locationMode', requiresCapability: 'device.locationMode',
      payload: JSON.stringify({ mode: 'active' }),
    },
  },
  {
    // The custom (one-time) kiosk, handled specially: opens the app-picker dialog (library or a scan of the device,
    // builds the KioskApplyPayload, queues kiosk.enter ungated). Listed here only for the button + grouping. The
    // kiosk a configuration defines is "Return to configured kiosk" (data/kiosk.ts configuredKiosk).
    key: 'kiosk-enter', label: 'Custom kiosk', group: 'disruptive', danger: true,
    description: 'Locks the device to apps you pick now, as a one-time kiosk its configuration doesn’t define.',
    request: { type: 'kiosk.enter' },
  },
  {
    key: 'kiosk-exit', label: 'Exit kiosk', group: 'disruptive',
    description: 'Ends kiosk mode and restores the normal home screen.',
    request: { type: 'kiosk.exit' },
  },
  {
    // Gated on the agent's capability: an agent before 0.5.0 has no handler, so the server holds it from such a device.
    key: 'kiosk-clear-lockout', label: 'Clear PIN lockout', group: 'safe',
    description: 'Lets staff try the exit PIN again now, with a full set of tries. The device stays in kiosk.',
    request: { type: 'kiosk.clearPinLockout', requiresCapability: 'device.kioskClearPinLockout' },
  },
];

/** The wording of one catalog entry (ACTION_TEMPLATES, by `key`), as messages. */
export interface ActionTemplateMessages {
  label: MessageDescriptor;
  title?: MessageDescriptor;
  description: MessageDescriptor;
  /** By the param's key. */
  params?: Record<string, { label: MessageDescriptor; placeholder?: MessageDescriptor }>;
}

const actionParamMessages = defineMessages({
  message: { id: 'commands.param.message.label', defaultMessage: 'Message' },
  messagePlaceholder: { id: 'commands.param.lockscreenMessage.placeholder', defaultMessage: 'Property of ACME IT' },
  title: { id: 'commands.param.title.label', defaultMessage: 'Title' },
  titlePlaceholder: { id: 'commands.param.title.placeholder', defaultMessage: 'Message from IT' },
  newPassword: { id: 'commands.param.newPassword.label', defaultMessage: 'New passcode (blank to clear)' },
});

export const actionTemplateMessages: Record<string, ActionTemplateMessages> = {
  'lockscreen-message': {
    ...defineMessages({
      label: { id: 'commands.action.lockscreenMessage.label', defaultMessage: 'Set lock-screen message' },
      title: { id: 'commands.action.lockscreenMessage.title', defaultMessage: 'Lock-screen message' },
      description: {
        id: 'commands.action.lockscreenMessage.description',
        defaultMessage: 'Shows your message on the lock screen. Leave it empty to clear it.',
      },
    }),
    params: { message: { label: actionParamMessages.message, placeholder: actionParamMessages.messagePlaceholder } },
  },
  alert: {
    ...defineMessages({
      label: { id: 'commands.action.alert.label', defaultMessage: 'Send alert' },
      description: { id: 'commands.action.alert.description', defaultMessage: 'Shows a high-priority message on the device.' },
    }),
    params: {
      title: { label: actionParamMessages.title, placeholder: actionParamMessages.titlePlaceholder },
      body: { label: actionParamMessages.message },
    },
  },
  ring: defineMessages({
    label: { id: 'commands.action.ring.label', defaultMessage: 'Ring' },
    description: { id: 'commands.action.ring.description', defaultMessage: 'Plays a loud locate tone for 30 seconds.' },
  }),
  'ring-stop': defineMessages({
    label: { id: 'commands.action.ringStop.label', defaultMessage: 'Stop ringing' },
    description: { id: 'commands.action.ringStop.description', defaultMessage: 'Silences a locate tone that is playing.' },
  }),
  lock: defineMessages({
    label: { id: 'commands.action.lock.label', defaultMessage: 'Lock' },
    title: { id: 'commands.action.lock.title', defaultMessage: 'Lock device?' },
    description: { id: 'commands.action.lock.description', defaultMessage: 'Locks the screen now.' },
  }),
  reboot: defineMessages({
    label: { id: 'commands.action.reboot.label', defaultMessage: 'Reboot' },
    title: { id: 'commands.action.reboot.title', defaultMessage: 'Reboot device?' },
    description: {
      id: 'commands.action.reboot.description',
      defaultMessage: 'The device restarts and is unavailable for about a minute.',
    },
  }),
  'passcode-reset': {
    ...defineMessages({
      label: { id: 'commands.action.passcodeReset.label', defaultMessage: 'Reset passcode' },
      title: { id: 'commands.action.passcodeReset.title', defaultMessage: 'Reset passcode?' },
      description: {
        id: 'commands.action.passcodeReset.description',
        defaultMessage: 'The current passcode stops working. Leave the new one blank to remove it.',
      },
    }),
    params: { newPassword: { label: actionParamMessages.newPassword } },
  },
  wipe: defineMessages({
    label: { id: 'commands.action.wipe.label', defaultMessage: 'Factory reset' },
    title: { id: 'commands.action.wipe.title', defaultMessage: 'Factory reset?' },
    description: {
      id: 'commands.action.wipe.description',
      defaultMessage: 'Erases all data. This can’t be undone.',
      description: 'DESTRUCTIVE: erases the device',
    },
  }),
  'power-adaptive': defineMessages({
    label: { id: 'commands.action.powerAdaptive.label', defaultMessage: 'Connectivity: Battery-saver' },
    description: {
      id: 'commands.action.powerAdaptive.description',
      defaultMessage:
        'Hold the live connection only when the screen is on or charging; use the low-power heartbeat when idle. Battery-friendly default.',
    },
  }),
  'power-always': defineMessages({
    label: { id: 'commands.action.powerAlways.label', defaultMessage: 'Connectivity: Always-on' },
    description: {
      id: 'commands.action.powerAlways.description',
      defaultMessage: 'Keep the live connection up 24/7 for constant instant connectivity (higher battery use).',
    },
  }),
  'location-passive': defineMessages({
    label: { id: 'commands.action.locationPassive.label', defaultMessage: 'Location: Battery-saver' },
    description: {
      id: 'commands.action.locationPassive.description',
      defaultMessage: 'Report the device’s last-known location each check-in — near-zero battery, no active GPS.',
    },
  }),
  'location-active': defineMessages({
    label: { id: 'commands.action.locationActive.label', defaultMessage: 'Location: Accurate' },
    description: {
      id: 'commands.action.locationActive.description',
      defaultMessage: 'Take a fresh GPS fix each check-in for tighter tracking (higher battery use).',
    },
  }),
  'kiosk-enter': defineMessages({
    label: { id: 'commands.action.kioskEnter.label', defaultMessage: 'Custom kiosk' },
    description: {
      id: 'commands.action.kioskEnter.description',
      defaultMessage: 'Locks the device to apps you pick now, as a one-time kiosk its configuration doesn’t define.',
    },
  }),
  'kiosk-exit': defineMessages({
    label: { id: 'commands.action.kioskExit.label', defaultMessage: 'Exit kiosk' },
    description: {
      id: 'commands.action.kioskExit.description',
      defaultMessage: 'Ends kiosk mode and restores the normal home screen.',
    },
  }),
  'kiosk-clear-lockout': defineMessages({
    label: { id: 'commands.action.kioskClearLockout.label', defaultMessage: 'Clear PIN lockout' },
    description: {
      id: 'commands.action.kioskClearLockout.description',
      defaultMessage: 'Lets staff try the exit PIN again now, with a full set of tries. The device stays in kiosk.',
    },
  }),
};

/** A catalog entry's wording in the console's language: `label`, the dialog `title` (the label when it has none), the
 *  description, and each param with its translated label and placeholder. An entry without messages (a plugin's)
 *  keeps its own text. */
export function formatActionTemplate(
  intl: IntlShape,
  t: CommandTemplateExt,
): { label: string; title: string; description: string; params: ActionParam[] } {
  const m = hasOwn(actionTemplateMessages, t.key) ? actionTemplateMessages[t.key] : undefined;
  const label = m ? intl.formatMessage(m.label) : t.label;
  return {
    label,
    title: m?.title ? intl.formatMessage(m.title) : m ? label : (t.title ?? label),
    description: m ? intl.formatMessage(m.description) : t.description,
    params: (t.params ?? []).map((p) => {
      const pm = m?.params && hasOwn(m.params, p.key) ? m.params[p.key] : undefined;
      return {
        ...p,
        label: pm ? intl.formatMessage(pm.label) : p.label,
        placeholder: pm?.placeholder ? intl.formatMessage(pm.placeholder) : p.placeholder,
      };
    }),
  };
}

/** The agent release that takes Clear PIN lockout (`kiosk.clearPinLockout`, protocol 1.11). */
export const CLEAR_PIN_LOCKOUT_AGENT = '0.5.0';

export interface DeviceState {
  battery: number; charging: boolean; locked: boolean; kioskActive: boolean;
  androidRelease: string; lastBootAt: number; updatedAt: number;
  agentVersion?: string | null;
  powerMode?: string | null;
  appliedConfigRevision?: string | null;
  /** Server-owned kiosk-command sequence and the generation of the latest on-device kiosk return. */
  kioskGeneration?: number | null;
  kioskReturnGeneration?: number | null;
}

export interface CommandHistoryItem {
  id: number | string; type: string; status: string;
  detail?: string | null; createdAt?: number; deliveredAt?: number; completedAt?: number;
  /** Server-derived package name for app.install / app.uninstall; absent otherwise. Payloads are never returned. */
  subject?: string | null;
}

export async function getDeviceState(deviceId: number | string): Promise<DeviceState | null> {
  return apiClient.get<DeviceState | null>(`/private/agent/v1/devices/${deviceId}/state`);
}

export async function listCommandHistory(
  deviceId: number | string, since = 0, signal?: AbortSignal,
): Promise<CommandHistoryItem[]> {
  return apiClient.get<CommandHistoryItem[]>(
    `/private/agent/v1/devices/${deviceId}/commands?since=${since}`,
    signal,
  );
}

/**
 * Wake the device to check in now. `connected` is false when it has no live connection, so the wake goes nowhere
 * and it picks its commands up at its next check-in; undefined when the server does not say (an older one).
 */
export async function forceSync(deviceId: number | string): Promise<{ connected?: boolean }> {
  const res = await apiClient.post<{ connected?: unknown } | null>(`/private/agent/v1/devices/${deviceId}/sync`, {});
  return typeof res?.connected === 'boolean' ? { connected: res.connected } : {};
}

/** What Retry apply did (AgentAdminResource.retryConfig). */
export type RetryConfigResult = 'queued' | 'alreadyQueued' | 'inSync' | 'unsupported' | 'noConfiguration';

/**
 * Retry apply: the server queues the device's configuration now, without the hour it otherwise waits after a failed
 * attempt, and wakes the device. `connected` false: no live connection, so it applies at its next check-in.
 */
export async function retryConfigApply(
  deviceId: number | string,
): Promise<{ result?: RetryConfigResult; connected?: boolean }> {
  const res = await apiClient.post<{ result?: unknown; connected?: unknown } | null>(
    `/private/agent/v1/devices/${deviceId}/retryConfig`,
    {},
  );
  const known: RetryConfigResult[] = ['queued', 'alreadyQueued', 'inSync', 'unsupported', 'noConfiguration'];
  return {
    result: known.includes(res?.result as RetryConfigResult) ? (res?.result as RetryConfigResult) : undefined,
    connected: typeof res?.connected === 'boolean' ? res.connected : undefined,
  };
}

/** Queue app.install for the device's configuration apps marked action=install. */
export async function syncConfigApps(deviceId: number | string): Promise<{ queued: number }> {
  return apiClient.post<{ queued: number }>(`/private/agent/v1/devices/${deviceId}/syncApps`, {});
}

// --- App deploy (app store) -------------------------------------------------

export interface AppInstallSpec {
  url: string;
  packageName: string;
  versionCode?: number;
  /** The APK's SHA-256 (required for a URL not hosted by MDMesh; the server hashes its own files). The agent refuses an install without one. */
  sha256?: string;
  runAfterInstall?: boolean;
  /** Split-APK bundle: when present the agent installs all parts in one session
   *  and `url`/`sha256` are ignored. */
  parts?: { url: string; sha256?: string }[];
}

/** Build the agent-v1 `app.install` command request for a spec (single APK or split bundle). */
export function buildInstallCommand(spec: AppInstallSpec): QueueCommandRequest {
  // A split bundle installs from `parts`; a single APK from `url`/`sha256`.
  const payload = spec.parts?.length
    ? {
        packageName: spec.packageName,
        versionCode: spec.versionCode,
        runAfterInstall: spec.runAfterInstall ?? false,
        parts: spec.parts,
      }
    : {
        url: spec.url,
        packageName: spec.packageName,
        versionCode: spec.versionCode,
        sha256: spec.sha256,
        runAfterInstall: spec.runAfterInstall ?? false,
      };
  return {
    type: 'app.install',
    // The gate token is the prefixed appManagement key (app.<key>); the agent advertises
    // app.silentInstall. (Bare 'silentInstall' never matched — see proto/endpoints.md.)
    requiresCapability: 'app.silentInstall',
    payload: JSON.stringify(payload),
  };
}

/** Queue an `app.install` for a device (the proven OTA path). */
export async function installApp(
  deviceId: number | string,
  spec: AppInstallSpec,
): Promise<QueuedCommand> {
  return queueCommand(deviceId, buildInstallCommand(spec));
}
