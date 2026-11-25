// Field schema for the configuration editor. The main editor shows what the MDMesh agent applies
// (plus the provisioning Wi-Fi the enrollment QR reads); every other field sits in one collapsed
// "Headwind launcher only" section. Field keys are the exact Configuration JSON properties (see
// com.hmdm.persistence.domain.Configuration). The editor round-trips the whole object on save, so a
// field that is hidden, or not listed here at all, keeps its stored value.
//
// type:
//   text/textarea/password/color/time → string input
//   int    → number
//   enum   → <select> from options
//   switch → plain boolean (Java primitive; false default)
//   tri    → nullable Boolean with three segments (see `segments`)
//   flag   → nullable Boolean where null means the same as false on the device: a checkbox, or two
//            segments when `flagLabels` is set. Turning it off restores a stored null, so opening and
//            saving never turns null into false (that would change the config revision).
//   app    → application version id selector (mainAppId / contentAppId)

import { defineMessage, defineMessages, type IntlShape, type MessageDescriptor } from 'react-intl';

export type FieldType =
  | 'text' | 'textarea' | 'password' | 'int' | 'enum'
  | 'switch' | 'tri' | 'flag' | 'time' | 'color' | 'app';

export type FieldGroup =
  | 'Identity' | 'Apps' | 'Kiosk' | 'Kiosk appearance' | 'Network' | 'Restrictions' | 'Enrollment'
  | 'Security' | 'Display' | 'Updates' | 'Advanced';

/** Text the console shows: a message to translate, or a literal that is not translated (a language's own name). */
export type FieldText = MessageDescriptor | string;

/** The text as the active language has it. */
export const fieldText = (intl: IntlShape, text: FieldText): string =>
  typeof text === 'string' ? text : intl.formatMessage(text);

export interface FieldOption {
  value: string | number;
  label: FieldText;
}

export interface TriSegment {
  value: boolean | null;
  label: MessageDescriptor;
}

export interface FieldDef {
  key: string;
  label: MessageDescriptor;
  type: FieldType;
  group: FieldGroup;
  /** One line, at most 80 characters. */
  help: MessageDescriptor;
  /** The longer explanation, behind "Learn more". */
  more?: MessageDescriptor;
  /** The agent version a setting needs, shown as a tag ("Agent 0.3.4+"); older agents ignore it. */
  agent?: string;
  /** Applied on devices by the MDMesh agent via config.apply. Unset = Headwind launcher field, not applied. */
  enforced?: boolean;
  /** Takes effect only while kiosk mode is on. */
  kioskOnly?: boolean;
  /** Not sent to devices, but read by the console's enrollment QR (provisioning Wi-Fi). */
  enrollQr?: boolean;
  /**
   * Not a column of its own: the setting is the Extra QR parameters entry of this name (without its
   * `android.app.extra.` prefix), read from and written to `qrParameters`.
   */
  qrKey?: string;
  /** Configuration metadata (name, description): always shown, never sent to devices, not "Enforced". */
  metadata?: boolean;
  options?: FieldOption[];
  /** tri: the segments in display order. Default: Not managed / On / Off. */
  segments?: TriSegment[];
  /** flag: [label for off/null, label for true]; renders two segments instead of a checkbox. */
  flagLabels?: [MessageDescriptor, MessageDescriptor];
  min?: number;
  max?: number;
}

/** Policy where true = allowed, false = blocked. */
const segment = defineMessages({
  notManaged: { id: 'configFields.segment.notManaged', defaultMessage: 'Not managed' },
  allow: { id: 'configFields.segment.allow', defaultMessage: 'Allow' },
  block: { id: 'configFields.segment.block', defaultMessage: 'Block' },
  on: { id: 'configFields.segment.on', defaultMessage: 'On' },
  off: { id: 'configFields.segment.off', defaultMessage: 'Off' },
});
const ALLOW_BLOCK: TriSegment[] = [
  { value: null, label: segment.notManaged }, { value: true, label: segment.allow }, { value: false, label: segment.block },
];
/** Policy stored as "disableX": true = blocked, false = allowed. */
const ALLOW_BLOCK_INVERTED: TriSegment[] = [
  { value: null, label: segment.notManaged }, { value: false, label: segment.allow }, { value: true, label: segment.block },
];
export const DEFAULT_SEGMENTS: TriSegment[] = [
  { value: null, label: segment.notManaged }, { value: true, label: segment.on }, { value: false, label: segment.off },
];

// Behaviour that depends on the agent version (agent 0.3.4 / protocol 1.4): `help` is one line, `more` the detail.
const WIFI_RADIO_MORE = defineMessage({ id: 'configFields.wifiRadio.more', defaultMessage: 'Off is skipped (shown as deferred) while Wi-Fi is the only network, so the device stays reachable, and is tried again at the next configuration change, reboot or agent update. Phones that switch mobile data off while on Wi-Fi cannot apply it. If the device cannot reach the server for about 30 minutes after Wi-Fi was turned off (SIM removed, server only reachable on the Wi-Fi network), the agent turns Wi-Fi back on and keeps it on until the configuration is changed; Off then shows as deferred. A longer server outage, or a user cutting the device off (airplane mode, pulling the SIM), does the same. Any change to the configuration applies Off again. Not managed lifts the lock and leaves the radio as it is.' });
const CONNECTIVITY_MORE = defineMessage({ id: 'configFields.connectivityMode.more', defaultMessage: 'Older agents ignore it. Battery-saver holds the live connection only while the screen is on or the device is charging, so a command sent to a locked phone on battery waits for the next heartbeat (about 10 minutes, longer in deep Doze) or for the screen to come on. Always-on keeps the connection up 24/7, so commands such as Lock, Ring or Wipe reach a locked phone without waiting for the heartbeat, at a battery cost. The mode set here is applied again when the configuration changes, the device restarts or the agent updates, so a mode set on a device page lasts only until then. To keep a lost device on Always-on, set its configuration to Always-on (or move the device to one that is). To switch devices back, choose Battery-saver; — (not managed) leaves each device as it is.' });
const LOCATION_MORE = defineMessage({ id: 'configFields.requestUpdates.more', defaultMessage: 'Do not track collects no location with agent 0.3.4 or later, and the server drops any location an older agent still reports. Last known (passive) reports the location the device already has at each check-in; GPS (fresh fix) asks for a new fix each time (more accurate, more battery).' });
const LOCATION_SERVICES_MORE = defineMessage({ id: 'configFields.locationServices.more', defaultMessage: 'Needs an Android 11+ Device Owner device; older agents report it unsupported. While managed, the user cannot change the setting. Not managed restores the user setting control but leaves Location services in their current state. This is separate from Location reporting, which controls what MDMesh collects.' });

export const GROUP_ORDER: FieldGroup[] = [
  'Identity', 'Apps', 'Kiosk', 'Kiosk appearance', 'Network', 'Restrictions', 'Enrollment',
  'Security', 'Display', 'Updates', 'Advanced',
];

/** The section headings of the Headwind launcher settings, by group. */
export const GROUP_LABELS: Record<FieldGroup, MessageDescriptor> = defineMessages({
  Identity: { id: 'configFields.group.identity', defaultMessage: 'Identity' },
  Apps: { id: 'configFields.group.apps', defaultMessage: 'Apps' },
  Kiosk: { id: 'configFields.group.kiosk', defaultMessage: 'Kiosk' },
  'Kiosk appearance': { id: 'configFields.group.kioskAppearance', defaultMessage: 'Kiosk appearance' },
  Network: { id: 'configFields.group.network', defaultMessage: 'Network' },
  Restrictions: { id: 'configFields.group.restrictions', defaultMessage: 'Restrictions' },
  Enrollment: { id: 'configFields.group.enrollment', defaultMessage: 'Enrollment' },
  Security: { id: 'configFields.group.security', defaultMessage: 'Security' },
  Display: { id: 'configFields.group.display', defaultMessage: 'Display' },
  Updates: { id: 'configFields.group.updates', defaultMessage: 'Updates' },
  Advanced: { id: 'configFields.group.advanced', defaultMessage: 'Advanced' },
}) as Record<FieldGroup, MessageDescriptor>;

/** One-line notes under a section heading of the main editor. */
export const GROUP_NOTES: Partial<Record<FieldGroup, MessageDescriptor>> = {
  Kiosk: defineMessage({ id: 'configFields.groupNote.kiosk', defaultMessage: 'Everything below kiosk mode applies only while kiosk mode is on.' }),
  'Kiosk appearance': defineMessage({ id: 'configFields.groupNote.kioskAppearance', defaultMessage: 'The look of the MDMesh kiosk launcher, while kiosk mode is on.' }),
  Network: defineMessage({ id: 'configFields.groupNote.network', defaultMessage: 'Not managed leaves a setting as it is, except Wi-Fi radio and Location services: Not managed lifts their lock.' }),
  Restrictions: defineMessage({
    id: 'configFields.groupNote.restrictions',
    defaultMessage: 'Not managed leaves a setting as it is, except Camera (agent 0.5.0+: it restores access after an MDMesh block) and Safe Mode (see its setting).',
  }),
  Enrollment: defineMessage({ id: 'configFields.groupNote.enrollment', defaultMessage: 'Not sent to devices: the Enroll page puts these in the enrollment QR.' }),
};

/** Languages offered for the enrollment QR's PROVISIONING_LOCALE (Android's language_COUNTRY form). */
const QR_LOCALES: FieldOption[] = [
  ['de_DE', 'Deutsch (Deutschland)'], ['en_GB', 'English (UK)'], ['en_US', 'English (US)'], ['es_ES', 'Español (España)'],
  ['fr_BE', 'Français (Belgique)'], ['fr_CA', 'Français (Canada)'], ['fr_CH', 'Français (Suisse)'], ['fr_FR', 'Français (France)'],
  ['it_IT', 'Italiano (Italia)'], ['nl_NL', 'Nederlands (Nederland)'], ['pl_PL', 'Polski (Polska)'], ['pt_BR', 'Português (Brasil)'],
  ['pt_PT', 'Português (Portugal)'],
].map(([value, label]) => ({ value, label: `${label} · ${value}` }));

/** Time zones offered for the enrollment QR's PROVISIONING_TIME_ZONE: the browser's IANA list, else a short one. */
const QR_TIME_ZONES: FieldOption[] = (() => {
  const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
  let zones: string[] = [];
  try {
    zones = intl.supportedValuesOf?.('timeZone') ?? [];
  } catch {
    zones = [];
  }
  if (zones.length === 0) zones = ['UTC', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'America/New_York', 'America/Los_Angeles'];
  return zones.map((z) => ({ value: z, label: z }));
})();

export const CONFIG_FIELDS: FieldDef[] = [
  // ── Identity ──────────────────────────────────────────────────────────────
  { key: 'name', label: defineMessage({ id: 'configFields.name.label', defaultMessage: 'Name' }), type: 'text', group: 'Identity', metadata: true, help: defineMessage({ id: 'configFields.name.help', defaultMessage: 'Unique name for this configuration template.' }) },
  { key: 'description', label: defineMessage({ id: 'configFields.description.label', defaultMessage: 'Description' }), type: 'textarea', group: 'Identity', metadata: true, help: defineMessage({ id: 'configFields.description.help', defaultMessage: 'Optional notes about what this template is for.' }) },

  // ── Apps ──────────────────────────────────────────────────────────────────
  { key: 'mainAppId', label: defineMessage({ id: 'configFields.mainAppId.label', defaultMessage: 'Main app' }), type: 'app', group: 'Apps', enforced: true, kioskOnly: true, help: defineMessage({ id: 'configFields.mainAppId.help', defaultMessage: 'The app the kiosk opens, pinned full-screen when it is the only kiosk app.' }) },
  { key: 'contentAppId', label: defineMessage({ id: 'configFields.contentAppId.label', defaultMessage: 'Content app' }), type: 'app', group: 'Apps', help: defineMessage({ id: 'configFields.contentAppId.help', defaultMessage: 'App the Headwind launcher showed instead of its icon grid.' }) },
  { key: 'autostartForeground', label: defineMessage({ id: 'configFields.autostartForeground.label', defaultMessage: 'Keep apps foreground' }), type: 'tri', group: 'Apps', help: defineMessage({ id: 'configFields.autostartForeground.help', defaultMessage: 'Headwind launcher kept auto-started apps in the foreground.' }) },

  // ── Kiosk ─────────────────────────────────────────────────────────────────
  { key: 'kioskMode', label: defineMessage({ id: 'configFields.kioskMode.label', defaultMessage: 'Kiosk mode' }), type: 'switch', group: 'Kiosk', enforced: true, help: defineMessage({ id: 'configFields.kioskMode.help', defaultMessage: 'Lock the device to the main app, or to the apps shown in kiosk.' }) },
  { key: 'kioskExit', label: defineMessage({ id: 'configFields.kioskExit.label', defaultMessage: 'Kiosk exit' }), type: 'flag', group: 'Kiosk', enforced: true, kioskOnly: true, flagLabels: [defineMessage({ id: 'configFields.kioskExit.flagOff', defaultMessage: 'Hidden gesture' }), defineMessage({ id: 'configFields.kioskExit.flagOn', defaultMessage: 'Visible button' })], help: defineMessage({ id: 'configFields.kioskExit.help', defaultMessage: 'How to reach the exit PIN prompt: a visible button, or 7 taps top-right.' }) },
  { key: 'password', label: defineMessage({ id: 'configFields.password.label', defaultMessage: 'Kiosk exit PIN' }), type: 'password', group: 'Kiosk', enforced: true, kioskOnly: true, help: defineMessage({ id: 'configFields.password.help', defaultMessage: '6 to 12 digits, asked for when someone leaves kiosk on the device.' }), more: defineMessage({ id: 'configFields.password.more', defaultMessage: 'Leave it empty and the device has no exit (end kiosk from the console; agents before 0.3.6 let anyone leave). With agent 0.5.0, 5 wrong PINs lock the exit for 1 minute, each further 3 for longer up to 1 hour, then every wrong PIN for another hour; Clear PIN lockout on the device page ends a lockout, and so does a new PIN. Administrators get an email if the server can send email (SMTP).' }) },
  { key: 'kioskHome', label: defineMessage({ id: 'configFields.kioskHome.label', defaultMessage: 'Home button' }), type: 'flag', group: 'Kiosk', enforced: true, kioskOnly: true, help: defineMessage({ id: 'configFields.kioskHome.help', defaultMessage: 'Allow the Home button in kiosk.' }) },
  { key: 'kioskRecents', label: defineMessage({ id: 'configFields.kioskRecents.label', defaultMessage: 'Recents button' }), type: 'flag', group: 'Kiosk', enforced: true, kioskOnly: true, help: defineMessage({ id: 'configFields.kioskRecents.help', defaultMessage: 'Allow the Recent-apps button in kiosk. Needs Home button on.' }) },
  { key: 'kioskNotifications', label: defineMessage({ id: 'configFields.kioskNotifications.label', defaultMessage: 'Notifications' }), type: 'flag', group: 'Kiosk', enforced: true, kioskOnly: true, help: defineMessage({ id: 'configFields.kioskNotifications.help', defaultMessage: 'Allow the notification shade in kiosk. Needs Home button on.' }) },
  { key: 'kioskSystemInfo', label: defineMessage({ id: 'configFields.kioskSystemInfo.label', defaultMessage: 'System info' }), type: 'flag', group: 'Kiosk', enforced: true, kioskOnly: true, help: defineMessage({ id: 'configFields.kioskSystemInfo.help', defaultMessage: 'Show the status bar (time, battery, signal) in kiosk.' }) },
  { key: 'kioskKeyguard', label: defineMessage({ id: 'configFields.kioskKeyguard.label', defaultMessage: 'Lock screen' }), type: 'flag', group: 'Kiosk', enforced: true, kioskOnly: true, help: defineMessage({ id: 'configFields.kioskKeyguard.help', defaultMessage: 'Allow the lock screen in kiosk.' }) },
  { key: 'kioskLockButtons', label: defineMessage({ id: 'configFields.kioskLockButtons.label', defaultMessage: 'Lock hardware buttons' }), type: 'flag', group: 'Kiosk', enforced: true, kioskOnly: true, help: defineMessage({ id: 'configFields.kioskLockButtons.help', defaultMessage: 'Block the power menu in kiosk. Volume buttons have their own setting.' }) },
  { key: 'kioskLockVolume', label: defineMessage({ id: 'configFields.kioskLockVolume.label', defaultMessage: 'Lock volume buttons (kiosk)' }), type: 'flag', group: 'Kiosk', enforced: true, kioskOnly: true, help: defineMessage({ id: 'configFields.kioskLockVolume.help', defaultMessage: 'Blocks volume changes in kiosk. Android mutes the device while locked.' }), more: defineMessage({ id: 'configFields.kioskLockVolume.more', defaultMessage: 'Ring is silent while volume is locked; the lock is lifted when kiosk ends.' }), agent: '0.3.4' },
  { key: 'runDefaultLauncher', label: defineMessage({ id: 'configFields.runDefaultLauncher.label', defaultMessage: 'Allow stock launcher' }), type: 'tri', group: 'Kiosk', help: defineMessage({ id: 'configFields.runDefaultLauncher.help', defaultMessage: 'Headwind launcher did not make itself Home. MDMesh takes Home in kiosk only.' }) },
  { key: 'kioskScreenOn', label: defineMessage({ id: 'configFields.kioskScreenOn.label', defaultMessage: 'Keep screen on' }), type: 'tri', group: 'Kiosk', help: defineMessage({ id: 'configFields.kioskScreenOn.help', defaultMessage: 'Headwind launcher kept the screen awake in kiosk.' }) },
  { key: 'showWifi', label: defineMessage({ id: 'configFields.showWifi.label', defaultMessage: 'Show Wi-Fi on error' }), type: 'tri', group: 'Kiosk', help: defineMessage({ id: 'configFields.showWifi.help', defaultMessage: 'Headwind launcher showed Wi-Fi settings when it could not reach the server.' }) },

  // ── Kiosk appearance ──────────────────────────────────────────────────────
  { key: 'backgroundColor', label: defineMessage({ id: 'configFields.backgroundColor.label', defaultMessage: 'Background color' }), type: 'color', group: 'Kiosk appearance', enforced: true, kioskOnly: true, help: defineMessage({ id: 'configFields.backgroundColor.help', defaultMessage: 'Kiosk launcher background. Always solid: transparency is ignored.' }) },
  { key: 'textColor', label: defineMessage({ id: 'configFields.textColor.label', defaultMessage: 'Text color' }), type: 'color', group: 'Kiosk appearance', enforced: true, kioskOnly: true, help: defineMessage({ id: 'configFields.textColor.help', defaultMessage: 'Kiosk launcher text. Needs 4.5:1 contrast with the background color.' }), more: defineMessage({ id: 'configFields.textColor.more', defaultMessage: 'With less, the device uses a readable color instead.' }) },
  { key: 'iconSize', label: defineMessage({ id: 'configFields.iconSize.label', defaultMessage: 'Icon size' }), type: 'enum', group: 'Kiosk appearance', enforced: true, kioskOnly: true, help: defineMessage({ id: 'configFields.iconSize.help', defaultMessage: 'App icon size in the kiosk launcher.' }), options: [
    { value: 'SMALL', label: defineMessage({ id: 'configFields.iconSize.option.small', defaultMessage: 'Small' }) }, { value: 'MEDIUM', label: defineMessage({ id: 'configFields.iconSize.option.medium', defaultMessage: 'Medium' }) }, { value: 'LARGE', label: defineMessage({ id: 'configFields.iconSize.option.large', defaultMessage: 'Large' }) },
  ] },

  // ── Network ───────────────────────────────────────────────────────────────
  { key: 'wifi', label: defineMessage({ id: 'configFields.wifi.label', defaultMessage: 'Wi-Fi settings' }), type: 'tri', group: 'Network', enforced: true, segments: ALLOW_BLOCK, help: defineMessage({ id: 'configFields.wifi.help', defaultMessage: 'Block locks the Wi-Fi settings so users can’t change networks.' }), more: defineMessage({ id: 'configFields.wifi.more', defaultMessage: 'It does not turn Wi-Fi off: that is Wi-Fi radio. Allow lifts the lock.' }) },
  { key: 'wifiRadio', label: defineMessage({ id: 'configFields.wifiRadio.label', defaultMessage: 'Wi-Fi radio' }), type: 'tri', group: 'Network', enforced: true, segments: DEFAULT_SEGMENTS, help: defineMessage({ id: 'configFields.wifiRadio.help', defaultMessage: 'Turns Wi-Fi on or off. On Android 13+, Off also stops users turning it on.' }), more: WIFI_RADIO_MORE, agent: '0.3.4' },
  { key: 'locationServices', label: defineMessage({ id: 'configFields.locationServices.label', defaultMessage: 'Location services' }), type: 'tri', group: 'Network', enforced: true, segments: DEFAULT_SEGMENTS, help: defineMessage({ id: 'configFields.locationServices.help', defaultMessage: 'Turns Android Location services on or off, and locks the setting.' }), more: LOCATION_SERVICES_MORE, agent: '0.5.0' },
  { key: 'bluetooth', label: defineMessage({ id: 'configFields.bluetooth.label', defaultMessage: 'Bluetooth' }), type: 'tri', group: 'Network', enforced: true, segments: ALLOW_BLOCK, help: defineMessage({ id: 'configFields.bluetooth.help', defaultMessage: 'Block turns Bluetooth off and stops users turning it on.' }), more: defineMessage({ id: 'configFields.bluetooth.more', defaultMessage: 'Allow lifts the block (it does not turn Bluetooth on).' }) },
  { key: 'requestUpdates', label: defineMessage({ id: 'configFields.requestUpdates.label', defaultMessage: 'Location reporting' }), type: 'enum', group: 'Network', enforced: true, help: defineMessage({ id: 'configFields.requestUpdates.help', defaultMessage: 'Which location the device reports at each check-in.' }), more: LOCATION_MORE, options: [
    { value: 'DONOTTRACK', label: defineMessage({ id: 'configFields.requestUpdates.option.donottrack', defaultMessage: 'Do not track' }) }, { value: 'WIFI', label: defineMessage({ id: 'configFields.requestUpdates.option.wifi', defaultMessage: 'Last known (passive)' }) }, { value: 'GPS', label: defineMessage({ id: 'configFields.requestUpdates.option.gps', defaultMessage: 'GPS (fresh fix)' }) },
  ] },
  { key: 'connectivityMode', label: defineMessage({ id: 'configFields.connectivityMode.label', defaultMessage: 'Connectivity' }), type: 'enum', group: 'Network', enforced: true, help: defineMessage({ id: 'configFields.connectivityMode.help', defaultMessage: 'How quickly commands reach a locked phone on battery.' }), more: CONNECTIVITY_MORE, agent: '0.4.0', options: [
    { value: 'adaptive', label: defineMessage({ id: 'configFields.connectivityMode.option.adaptive', defaultMessage: 'Battery-saver' }) }, { value: 'alwaysOn', label: defineMessage({ id: 'configFields.connectivityMode.option.alwaysOn', defaultMessage: 'Always-on' }) },
  ] },
  { key: 'mobileData', label: defineMessage({ id: 'configFields.mobileData.label', defaultMessage: 'Mobile data' }), type: 'tri', group: 'Network', help: defineMessage({ id: 'configFields.mobileData.help', defaultMessage: 'Headwind launcher switched mobile data (needed system-app rights).' }) },
  { key: 'gps', label: defineMessage({ id: 'configFields.gps.label', defaultMessage: 'GPS / location' }), type: 'tri', group: 'Network', help: defineMessage({ id: 'configFields.gps.help', defaultMessage: 'Headwind launcher switched the location setting.' }) },

  // ── Restrictions ──────────────────────────────────────────────────────────
  { key: 'disableSafeBoot', label: defineMessage({ id: 'configFields.disableSafeBoot.label', defaultMessage: 'Safe Mode' }), type: 'tri', group: 'Restrictions', enforced: true, segments: ALLOW_BLOCK_INVERTED, help: defineMessage({ id: 'configFields.disableSafeBoot.help', defaultMessage: 'Block prevents rebooting into Safe Mode, which would bypass the kiosk.' }), more: defineMessage({ id: 'configFields.disableSafeBoot.more', defaultMessage: 'Not managed blocks it on a configuration with kiosk on, and on any device in kiosk (agent 0.3.7 or later); otherwise it is allowed, and agent 0.3.7 lifts a block nothing asks for. Older agents keep a block until this is set to Allow. Allow permits it, even in kiosk.' }) },
  { key: 'disableFactoryReset', label: defineMessage({ id: 'configFields.disableFactoryReset.label', defaultMessage: 'Factory reset' }), type: 'tri', group: 'Restrictions', enforced: true, segments: ALLOW_BLOCK_INVERTED, help: defineMessage({ id: 'configFields.disableFactoryReset.help', defaultMessage: 'Block prevents a factory reset from Settings. A factory reset sent from the console lifts the block first.' }), more: defineMessage({ id: 'configFields.disableFactoryReset.more', defaultMessage: 'Agents before 0.5.1 wipe without lifting it, and some devices then stop in recovery. Before wiping one of those, set this to Allow and sync.' }) },
  { key: 'disableScreenshots', label: defineMessage({ id: 'configFields.disableScreenshots.label', defaultMessage: 'Screenshots' }), type: 'tri', group: 'Restrictions', enforced: true, segments: ALLOW_BLOCK_INVERTED, help: defineMessage({ id: 'configFields.disableScreenshots.help', defaultMessage: 'Block prevents screenshots and screen recording.' }) },
  { key: 'usbStorage', label: defineMessage({ id: 'configFields.usbStorage.label', defaultMessage: 'USB storage' }), type: 'tri', group: 'Restrictions', enforced: true, segments: ALLOW_BLOCK, help: defineMessage({ id: 'configFields.usbStorage.help', defaultMessage: 'Block stops USB file transfer and mounting external storage.' }) },
  { key: 'camera', label: defineMessage({ id: 'configFields.camera.label', defaultMessage: 'Camera' }), type: 'tri', group: 'Restrictions', enforced: true, segments: ALLOW_BLOCK, help: defineMessage({ id: 'configFields.camera.help', defaultMessage: 'Block stops every app using the camera hardware.' }), more: defineMessage({ id: 'configFields.camera.more', defaultMessage: 'It does not hide camera apps, install one, or remove photos. On agent 0.5.0 or later, Not managed restores access after MDMesh blocked it. On older agents, choose Allow to lift a block.' }) },
  { key: 'blockStatusBar', label: defineMessage({ id: 'configFields.blockStatusBar.label', defaultMessage: 'Lock status bar' }), type: 'switch', group: 'Restrictions', help: defineMessage({ id: 'configFields.blockStatusBar.help', defaultMessage: 'Headwind launcher covered the status bar.' }) },
  { key: 'lockVolume', label: defineMessage({ id: 'configFields.lockVolume.label', defaultMessage: 'Lock volume (legacy)' }), type: 'tri', group: 'Restrictions', help: defineMessage({ id: 'configFields.lockVolume.help', defaultMessage: 'Headwind launcher blocked volume changes.' }) },
  { key: 'allowedClasses', label: defineMessage({ id: 'configFields.allowedClasses.label', defaultMessage: 'Allowed app classes' }), type: 'text', group: 'Restrictions', help: defineMessage({ id: 'configFields.allowedClasses.help', defaultMessage: 'Headwind launcher allowlist of settings screens.' }) },
  { key: 'restrictions', label: defineMessage({ id: 'configFields.restrictions.label', defaultMessage: 'Android restrictions' }), type: 'textarea', group: 'Restrictions', help: defineMessage({ id: 'configFields.restrictions.help', defaultMessage: 'Comma-separated Android user restrictions the Headwind launcher applied.' }) },

  // ── Enrollment (provisioning Wi-Fi for the console's QR) ───────────────────
  { key: 'wifiSSID', label: defineMessage({ id: 'configFields.wifiSSID.label', defaultMessage: 'Setup Wi-Fi name (SSID)' }), type: 'text', group: 'Enrollment', enrollQr: true, help: defineMessage({ id: 'configFields.wifiSSID.help', defaultMessage: 'Wi-Fi network a new device joins during setup.' }) },
  { key: 'wifiPassword', label: defineMessage({ id: 'configFields.wifiPassword.label', defaultMessage: 'Setup Wi-Fi password' }), type: 'password', group: 'Enrollment', enrollQr: true, help: defineMessage({ id: 'configFields.wifiPassword.help', defaultMessage: 'Embedded in the enrollment QR in plain text.' }) },
  { key: 'wifiSecurityType', label: defineMessage({ id: 'configFields.wifiSecurityType.label', defaultMessage: 'Setup Wi-Fi security' }), type: 'enum', group: 'Enrollment', enrollQr: true, help: defineMessage({ id: 'configFields.wifiSecurityType.help', defaultMessage: 'Security type of the setup Wi-Fi network.' }), options: [
    { value: 'NONE', label: defineMessage({ id: 'configFields.wifiSecurityType.option.none', defaultMessage: 'Open' }) }, { value: 'WPA', label: defineMessage({ id: 'configFields.wifiSecurityType.option.wpa', defaultMessage: 'WPA/WPA2' }) }, { value: 'WEP', label: defineMessage({ id: 'configFields.wifiSecurityType.option.wep', defaultMessage: 'WEP' }) }, { value: 'EAP', label: defineMessage({ id: 'configFields.wifiSecurityType.option.eap', defaultMessage: 'Enterprise (EAP)' }) },
  ] },
  { key: 'qrWifiHidden', qrKey: 'PROVISIONING_WIFI_HIDDEN', label: defineMessage({ id: 'configFields.qrWifiHidden.label', defaultMessage: 'Hidden network' }), type: 'switch', group: 'Enrollment', enrollQr: true, help: defineMessage({ id: 'configFields.qrWifiHidden.help', defaultMessage: "The setup Wi-Fi doesn't broadcast its name." }) },
  // Setup screens: entries of the Extra QR parameters, shown as settings of their own.
  { key: 'qrSkipEducation', qrKey: 'PROVISIONING_SKIP_EDUCATION_SCREENS', label: defineMessage({ id: 'configFields.qrSkipEducation.label', defaultMessage: 'Skip intro screens' }), type: 'switch', group: 'Enrollment', enrollQr: true, help: defineMessage({ id: 'configFields.qrSkipEducation.help', defaultMessage: "Hides Android's education screens during setup. Google's terms still show." }), more: defineMessage({ id: 'configFields.qrSkipEducation.more', defaultMessage: 'Android 8 and later. The setup wizard steps that come after enrollment (Google terms, accounts) are up to the device maker and still show.' }) },
  { key: 'qrLocale', qrKey: 'PROVISIONING_LOCALE', label: defineMessage({ id: 'configFields.qrLocale.label', defaultMessage: 'Language' }), type: 'enum', group: 'Enrollment', enrollQr: true, help: defineMessage({ id: 'configFields.qrLocale.help', defaultMessage: 'Language and region set during setup.' }), options: QR_LOCALES },
  { key: 'qrTimeZone', qrKey: 'PROVISIONING_TIME_ZONE', label: defineMessage({ id: 'configFields.qrTimeZone.label', defaultMessage: 'Time zone' }), type: 'enum', group: 'Enrollment', enrollQr: true, help: defineMessage({ id: 'configFields.qrTimeZone.help', defaultMessage: 'Time zone set during setup.' }), options: QR_TIME_ZONES },
  { key: 'mobileEnrollment', label: defineMessage({ id: 'configFields.mobileEnrollment.label', defaultMessage: 'Enroll over mobile data' }), type: 'switch', group: 'Enrollment', enrollQr: true, help: defineMessage({ id: 'configFields.mobileEnrollment.help', defaultMessage: 'Lets setup download the agent on mobile data. Android 10 and later.' }), more: defineMessage({ id: 'configFields.mobileEnrollment.more', defaultMessage: 'Adds PROVISIONING_USE_MOBILE_DATA to the enrollment QR. Without it, Android waits for Wi-Fi before downloading the agent.' }) },

  // ── Security ──────────────────────────────────────────────────────────────
  { key: 'appPermissions', label: defineMessage({ id: 'configFields.appPermissions.label', defaultMessage: 'App permissions' }), type: 'enum', group: 'Security', help: defineMessage({ id: 'configFields.appPermissions.help', defaultMessage: 'How the Headwind launcher handled runtime permissions for managed apps.' }), options: [
    { value: 'GRANTALL', label: defineMessage({ id: 'configFields.appPermissions.option.grantall', defaultMessage: 'Grant all automatically' }) }, { value: 'ASKLOCATION', label: defineMessage({ id: 'configFields.appPermissions.option.asklocation', defaultMessage: 'Ask for location only' }) },
    { value: 'DENYLOCATION', label: defineMessage({ id: 'configFields.appPermissions.option.denylocation', defaultMessage: 'Deny location' }) }, { value: 'ASKALL', label: defineMessage({ id: 'configFields.appPermissions.option.askall', defaultMessage: 'Ask for everything' }) },
  ] },
  { key: 'passwordMode', label: defineMessage({ id: 'configFields.passwordMode.label', defaultMessage: 'Passcode quality' }), type: 'text', group: 'Security', help: defineMessage({ id: 'configFields.passwordMode.help', defaultMessage: 'Headwind launcher passcode rule: present, easy, moderate or strong.' }) },
  { key: 'encryptDevice', label: defineMessage({ id: 'configFields.encryptDevice.label', defaultMessage: 'Require encryption' }), type: 'switch', group: 'Security', help: defineMessage({ id: 'configFields.encryptDevice.help', defaultMessage: 'Headwind launcher asked for encryption. Android 10 and later always encrypt.' }) },
  { key: 'permissive', label: defineMessage({ id: 'configFields.permissive.label', defaultMessage: 'Permissive mode' }), type: 'tri', group: 'Security', help: defineMessage({ id: 'configFields.permissive.help', defaultMessage: 'Headwind launcher mode that locked nothing down.' }) },
  { key: 'lockSafeSettings', label: defineMessage({ id: 'configFields.lockSafeSettings.label', defaultMessage: 'Lock safe settings' }), type: 'tri', group: 'Security', help: defineMessage({ id: 'configFields.lockSafeSettings.help', defaultMessage: 'Old Headwind launcher setting. To block Safe Mode, use Restrictions → Safe Mode.' }) },
  { key: 'disableLocation', label: defineMessage({ id: 'configFields.disableLocation.label', defaultMessage: 'Block location permission' }), type: 'tri', group: 'Security', help: defineMessage({ id: 'configFields.disableLocation.help', defaultMessage: 'Never read, even by the Headwind launcher.' }) },

  // ── Display ───────────────────────────────────────────────────────────────
  { key: 'autoBrightness', label: defineMessage({ id: 'configFields.autoBrightness.label', defaultMessage: 'Auto brightness' }), type: 'tri', group: 'Display', help: defineMessage({ id: 'configFields.autoBrightness.help', defaultMessage: 'Headwind launcher brightness mode.' }) },
  { key: 'brightness', label: defineMessage({ id: 'configFields.brightness.label', defaultMessage: 'Brightness' }), type: 'int', group: 'Display', min: 0, max: 255, help: defineMessage({ id: 'configFields.brightness.help', defaultMessage: 'Manual brightness 0–255 (when auto brightness is off).' }) },
  { key: 'manageTimeout', label: defineMessage({ id: 'configFields.manageTimeout.label', defaultMessage: 'Manage screen timeout' }), type: 'tri', group: 'Display', help: defineMessage({ id: 'configFields.manageTimeout.help', defaultMessage: 'Headwind launcher set the screen-off timeout.' }) },
  { key: 'timeout', label: defineMessage({ id: 'configFields.timeout.label', defaultMessage: 'Screen timeout (s)' }), type: 'int', group: 'Display', min: 0, help: defineMessage({ id: 'configFields.timeout.help', defaultMessage: 'Seconds before the screen turns off (when managed).' }) },
  { key: 'manageVolume', label: defineMessage({ id: 'configFields.manageVolume.label', defaultMessage: 'Manage volume' }), type: 'tri', group: 'Display', help: defineMessage({ id: 'configFields.manageVolume.help', defaultMessage: 'Headwind launcher set the system volume.' }) },
  { key: 'volume', label: defineMessage({ id: 'configFields.volume.label', defaultMessage: 'Volume (%)' }), type: 'int', group: 'Display', min: 0, max: 100, help: defineMessage({ id: 'configFields.volume.help', defaultMessage: 'System volume 0–100% (when managed).' }) },
  { key: 'orientation', label: defineMessage({ id: 'configFields.orientation.label', defaultMessage: 'Screen orientation' }), type: 'enum', group: 'Display', help: defineMessage({ id: 'configFields.orientation.help', defaultMessage: 'Headwind launcher locked its own screen orientation.' }), options: [
    { value: 0, label: defineMessage({ id: 'configFields.orientation.option.0', defaultMessage: 'No lock (auto)' }) }, { value: 1, label: defineMessage({ id: 'configFields.orientation.option.1', defaultMessage: 'Portrait' }) }, { value: 2, label: defineMessage({ id: 'configFields.orientation.option.2', defaultMessage: 'Landscape' }) },
  ] },
  { key: 'useDefaultDesignSettings', label: defineMessage({ id: 'configFields.useDefaultDesignSettings.label', defaultMessage: 'Default launcher design' }), type: 'switch', group: 'Display', help: defineMessage({ id: 'configFields.useDefaultDesignSettings.help', defaultMessage: 'Headwind launcher ignored its custom colors. MDMesh uses Kiosk appearance.' }) },
  { key: 'backgroundImageUrl', label: defineMessage({ id: 'configFields.backgroundImageUrl.label', defaultMessage: 'Background image URL' }), type: 'text', group: 'Display', help: defineMessage({ id: 'configFields.backgroundImageUrl.help', defaultMessage: 'Headwind launcher wallpaper. Another URL here replaces the kiosk image.' }), more: defineMessage({ id: 'configFields.backgroundImageUrl.more', defaultMessage: 'With a kiosk background image, this shows its address.' }) },
  { key: 'desktopHeader', label: defineMessage({ id: 'configFields.desktopHeader.label', defaultMessage: 'Launcher header' }), type: 'enum', group: 'Display', help: defineMessage({ id: 'configFields.desktopHeader.help', defaultMessage: 'Header line above the Headwind launcher.' }), options: [
    { value: 'NO_HEADER', label: defineMessage({ id: 'configFields.desktopHeader.option.noHeader', defaultMessage: 'None' }) }, { value: 'DEVICE_ID', label: defineMessage({ id: 'configFields.desktopHeader.option.deviceId', defaultMessage: 'Device ID' }) }, { value: 'DESCRIPTION', label: defineMessage({ id: 'configFields.desktopHeader.option.description', defaultMessage: 'Description' }) },
    { value: 'CUSTOM1', label: defineMessage({ id: 'configFields.desktopHeader.option.custom1', defaultMessage: 'Custom 1' }) }, { value: 'CUSTOM2', label: defineMessage({ id: 'configFields.desktopHeader.option.custom2', defaultMessage: 'Custom 2' }) }, { value: 'CUSTOM3', label: defineMessage({ id: 'configFields.desktopHeader.option.custom3', defaultMessage: 'Custom 3' }) }, { value: 'TEMPLATE', label: defineMessage({ id: 'configFields.desktopHeader.option.template', defaultMessage: 'Template' }) },
  ] },
  { key: 'desktopHeaderTemplate', label: defineMessage({ id: 'configFields.desktopHeaderTemplate.label', defaultMessage: 'Header template' }), type: 'text', group: 'Display', help: defineMessage({ id: 'configFields.desktopHeaderTemplate.help', defaultMessage: 'Custom header text (when header = Template).' }) },
  { key: 'displayStatus', label: defineMessage({ id: 'configFields.displayStatus.label', defaultMessage: 'Show status bar' }), type: 'switch', group: 'Display', help: defineMessage({ id: 'configFields.displayStatus.help', defaultMessage: 'Headwind launcher status strip (battery, time).' }) },

  // ── Updates ───────────────────────────────────────────────────────────────
  { key: 'systemUpdateType', label: defineMessage({ id: 'configFields.systemUpdateType.label', defaultMessage: 'System updates' }), type: 'enum', group: 'Updates', help: defineMessage({ id: 'configFields.systemUpdateType.help', defaultMessage: 'When the Headwind launcher let Android OS updates install.' }), options: [
    { value: 0, label: defineMessage({ id: 'configFields.systemUpdateType.option.0', defaultMessage: 'Default' }) }, { value: 1, label: defineMessage({ id: 'configFields.systemUpdateType.option.1', defaultMessage: 'Immediately' }) }, { value: 2, label: defineMessage({ id: 'configFields.systemUpdateType.option.2', defaultMessage: 'Scheduled' }) }, { value: 3, label: defineMessage({ id: 'configFields.systemUpdateType.option.3', defaultMessage: 'Postponed' }) },
  ] },
  { key: 'systemUpdateFrom', label: defineMessage({ id: 'configFields.systemUpdateFrom.label', defaultMessage: 'System update from' }), type: 'time', group: 'Updates', help: defineMessage({ id: 'configFields.systemUpdateFrom.help', defaultMessage: 'Start of the system-update window (HH:MM, when Scheduled).' }) },
  { key: 'systemUpdateTo', label: defineMessage({ id: 'configFields.systemUpdateTo.label', defaultMessage: 'System update to' }), type: 'time', group: 'Updates', help: defineMessage({ id: 'configFields.systemUpdateTo.help', defaultMessage: 'End of the system-update window (HH:MM, when Scheduled).' }) },
  { key: 'scheduleAppUpdate', label: defineMessage({ id: 'configFields.scheduleAppUpdate.label', defaultMessage: 'Schedule app updates' }), type: 'switch', group: 'Updates', help: defineMessage({ id: 'configFields.scheduleAppUpdate.help', defaultMessage: 'Headwind launcher installed app updates only within a time window.' }) },
  { key: 'appUpdateFrom', label: defineMessage({ id: 'configFields.appUpdateFrom.label', defaultMessage: 'App update from' }), type: 'time', group: 'Updates', help: defineMessage({ id: 'configFields.appUpdateFrom.help', defaultMessage: 'Start of the app-update window (HH:MM).' }) },
  { key: 'appUpdateTo', label: defineMessage({ id: 'configFields.appUpdateTo.label', defaultMessage: 'App update to' }), type: 'time', group: 'Updates', help: defineMessage({ id: 'configFields.appUpdateTo.help', defaultMessage: 'End of the app-update window (HH:MM).' }) },
  { key: 'downloadUpdates', label: defineMessage({ id: 'configFields.downloadUpdates.label', defaultMessage: 'Download updates over' }), type: 'enum', group: 'Updates', help: defineMessage({ id: 'configFields.downloadUpdates.help', defaultMessage: 'Which connection Headwind launcher downloads could use.' }), options: [
    { value: 'UNLIMITED', label: defineMessage({ id: 'configFields.downloadUpdates.option.unlimited', defaultMessage: 'Any connection' }) }, { value: 'LIMITED', label: defineMessage({ id: 'configFields.downloadUpdates.option.limited', defaultMessage: 'Limited data OK' }) }, { value: 'WIFI', label: defineMessage({ id: 'configFields.downloadUpdates.option.wifi', defaultMessage: 'Wi-Fi only' }) },
  ] },

  // ── Advanced ──────────────────────────────────────────────────────────────
  { key: 'timeZone', label: defineMessage({ id: 'configFields.timeZone.label', defaultMessage: 'Time zone' }), type: 'text', group: 'Advanced', help: defineMessage({ id: 'configFields.timeZone.help', defaultMessage: "Olson time zone (e.g. America/New_York) or 'auto', set by the Headwind launcher." }) },
  { key: 'newServerUrl', label: defineMessage({ id: 'configFields.newServerUrl.label', defaultMessage: 'Migrate to server URL' }), type: 'text', group: 'Advanced', help: defineMessage({ id: 'configFields.newServerUrl.help', defaultMessage: 'Headwind launcher moved itself to this server.' }) },
  { key: 'eventReceivingComponent', label: defineMessage({ id: 'configFields.eventReceivingComponent.label', defaultMessage: 'Event receiver' }), type: 'text', group: 'Advanced', help: defineMessage({ id: 'configFields.eventReceivingComponent.help', defaultMessage: 'package/class that received Headwind launcher broadcasts.' }) },
  { key: 'qrParameters', label: defineMessage({ id: 'configFields.qrParameters.label', defaultMessage: 'Extra QR parameters' }), type: 'textarea', group: 'Enrollment', enrollQr: true, help: defineMessage({ id: 'configFields.qrParameters.help', defaultMessage: 'Other Android setup entries, as JSON members.' }), more: defineMessage({ id: 'configFields.qrParameters.more', defaultMessage: 'MDMesh passes on only a few known entries (mobile data, sensors permission opt-out, local time, organization name, support URL), each with a value of its type; the editor says which are left out. For example "android.app.extra.PROVISIONING_SENSORS_PERMISSION_GRANT_OPT_OUT": true. JSON members, as Headwind took them, or one JSON object. The Enroll page adds them to the code it shows for this configuration. Entries naming the agent, its download, its checksum or its enrollment extras, and MDMesh\'s defaults (system apps stay enabled, no encryption step), are never replaced. Wi-Fi entries here are not used: Wi-Fi comes from the setup Wi-Fi above and the Enroll page.' }) },
  { key: 'adminExtras', label: defineMessage({ id: 'configFields.adminExtras.label', defaultMessage: 'QR admin extras' }), type: 'textarea', group: 'Advanced', help: defineMessage({ id: 'configFields.adminExtras.help', defaultMessage: 'Extra admin-extras entries for Headwind\'s server QR. MDMesh\'s QR ignores them.' }) },
];

/** Always-visible editor fields: metadata, enforced, and the enrollment-QR Wi-Fi. */
export const PRIMARY_FIELDS = CONFIG_FIELDS.filter((f) => f.enforced || f.metadata || f.enrollQr);
/** Fields only the Headwind launcher read: stored and round-tripped, shown in the collapsed section. */
export const LEGACY_FIELDS = CONFIG_FIELDS.filter((f) => !f.enforced && !f.metadata && !f.enrollQr);
/** Changing any of these re-enters/exits kiosk on every device of the configuration. */
export const KIOSK_AFFECTING_KEYS: ReadonlySet<string> = new Set([
  'kioskMode', 'mainAppId', 'kioskExit', 'kioskHome', 'kioskRecents', 'kioskNotifications', 'kioskSystemInfo',
  'kioskKeyguard', 'kioskLockButtons', 'kioskLockVolume', 'password', 'backgroundColor', 'backgroundImageFileId', 'textColor', 'iconSize', 'applications',
]);

/**
 * The value a `flag` field gets when it is switched off: a stored null stays null (the agent treats null and
 * false alike, but the config revision does not), anything else becomes false. Pure.
 */
export function flagOffValue(stored: unknown): boolean | null {
  return stored == null ? null : false;
}
