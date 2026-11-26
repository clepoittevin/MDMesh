// Dialogs that act on a set of devices (the Devices list's bulk bar and row menus; any page with a device selection):
// run an action, move to a configuration, delete. Same operations, payloads and toasts as the v0.3 console's bulk
// dialogs, on <Modal> (Escape, focus trap, focus return). Each takes `open`: keep it mounted while closed (its content
// from useStickyValue, a fresh `key` per opening) so it animates out. Not in the barrel (API code): import from
// '../ui/BulkModals'.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { FormattedMessage, defineMessages, useIntl, type IntlShape, type MessageDescriptor } from 'react-intl';
import { listApplications, type Application } from '../api/applications';
import { configName } from '../data/seededConfigs';
import {
  ACTION_TEMPLATES,
  buildInstallCommand,
  bulkQueueCommand,
  formatActionTemplate,
  formatCommandError,
  isBulkForbidden,
  type AppInstallSpec,
  type CommandTemplateExt,
} from '../api/commands';
import {
  getConfigurationApps,
  getConfigurations,
  type Configuration,
  type ConfigurationSummary,
} from '../api/configurations';
import { bulkSetConfiguration, deleteDevicesBulk } from '../api/devices';
import { exitPinRule, exitPinValid } from '../data/configurationRules';
import {
  buildKioskPayload,
  configuredKiosk,
  configuredKioskCommand,
  configuredKioskSummary,
  exitPinHelp,
  kioskMessages,
  kioskTheme,
  type ConfiguredKiosk,
  type KioskChoice,
} from '../data/kiosk';
import { useToast } from './toast';
import { Button } from './Button';
import { Callout } from './Card';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';
import { Eyebrow, Field } from './Field';
import { Checkbox, Input, SearchInput, Select } from './Input';
import { Modal } from './Modal';
import { PasswordInput } from './Password';
import { Segmented } from './Segmented';
import { SkeletonRows } from './Skeleton';
import { Tooltip } from './Tooltip';
import './BulkModals.css';
import { apiErrorText } from '../api/apiErrorText';

const messages: Record<string, MessageDescriptor> = defineMessages({
  devices: { id: 'devices.bulk.devices.count', defaultMessage: '{count, plural, one {# device} other {# devices}}' },
  queuedFor: {
    id: 'devices.bulk.toast.queuedFor',
    defaultMessage: 'Queued for {count, plural, one {# device} other {# devices}}{skipped, plural, =0 {} other { (# skipped)}}.',
  },
  actionQueued: { id: 'devices.bulk.toast.actionQueued', defaultMessage: '{label} queued' },
  actionFailed: { id: 'devices.bulk.toast.actionFailed', defaultMessage: '{label} failed' },
  notInstallable: { id: 'devices.bulk.toast.notInstallable', defaultMessage: 'Not installable' },
  noHostedApk: { id: 'devices.bulk.toast.noHostedApk', defaultMessage: '{name} has no hosted APK.' },
  installQueued: { id: 'devices.bulk.toast.installQueued', defaultMessage: 'Install queued' },
  installQueuedBody: {
    id: 'devices.bulk.toast.installQueuedBody',
    defaultMessage: '{name} → {count, plural, one {# device} other {# devices}}{skipped, plural, =0 {} other { (# skipped)}}.',
  },
  installFailed: { id: 'devices.bulk.toast.installFailed', defaultMessage: 'Install failed' },
  customKioskQueued: { id: 'devices.bulk.toast.customKioskQueued', defaultMessage: 'Custom kiosk queued' },
  customKioskFailed: { id: 'devices.bulk.toast.customKioskFailed', defaultMessage: 'Custom kiosk failed' },
  configuredKioskQueued: { id: 'devices.bulk.toast.configuredKioskQueued', defaultMessage: 'Return to configured kiosk queued' },
  couldntQueue: {
    id: 'devices.bulk.error.couldntQueue',
    defaultMessage:
      'Couldn’t queue the command: {reason}.{queued, plural, =0 {} one { It was already queued for # device.} other { It was already queued for # devices.}}',
  },
  notAccepted: { id: 'devices.bulk.error.notAccepted', defaultMessage: 'the server didn’t accept it' },
  requestFailed: { id: 'devices.bulk.error.requestFailed', defaultMessage: 'request failed' },
  loadAppsFailed: { id: 'devices.bulk.error.loadAppsFailed', defaultMessage: 'Failed to load apps' },
  groupActions: { id: 'devices.bulk.catalog.groupActions', defaultMessage: 'Actions' },
  groupDisruptive: { id: 'devices.bulk.catalog.groupDisruptive', defaultMessage: 'Disruptive' },
  groupApps: { id: 'devices.bulk.catalog.groupApps', defaultMessage: 'Apps' },
  groupKiosk: { id: 'devices.bulk.catalog.groupKiosk', defaultMessage: 'Kiosk' },
  installApp: { id: 'devices.bulk.catalog.installApp', defaultMessage: 'Install app' },
  returnToKiosk: { id: 'devices.bulk.catalog.returnToKiosk', defaultMessage: 'Return to configured kiosk' },
  returnToKioskHint: {
    id: 'devices.bulk.catalog.returnToKioskHint',
    defaultMessage: 'Puts each device back into the kiosk its configuration defines.',
  },
  customKiosk: { id: 'devices.bulk.catalog.customKiosk', defaultMessage: 'Custom kiosk' },
  customKioskHint: {
    id: 'devices.bulk.catalog.customKioskHint',
    defaultMessage: 'Locks the devices to apps you pick now, as a one-time kiosk their configurations don’t define.',
  },
  close: { id: 'devices.bulk.common.close', defaultMessage: 'Close' },
  back: { id: 'devices.bulk.common.back', defaultMessage: 'Back' },
  cancel: { id: 'devices.bulk.common.cancel', defaultMessage: 'Cancel' },
  queueing: { id: 'devices.bulk.common.queueing', defaultMessage: 'Queueing…' },
  runTitle: {
    id: 'devices.bulk.run.title',
    defaultMessage: 'Run action on {count, plural, one {# device} other {# devices}}',
  },
  runsOn: {
    id: 'devices.bulk.run.runsOn',
    defaultMessage: 'This will run on <strong>{count, plural, one {# device} other {# devices}}</strong>.',
  },
  optional: { id: 'devices.bulk.run.optionalField', defaultMessage: '{label} (optional)' },
  actionOnDevices: {
    id: 'devices.bulk.run.actionOnDevices',
    defaultMessage: '{label} {count, plural, one {# device} other {# devices}}',
  },
  sendTo: { id: 'devices.bulk.run.sendTo', defaultMessage: 'Send to {count, plural, one {# device} other {# devices}}' },
  installTitle: {
    id: 'devices.bulk.install.title',
    defaultMessage: 'Install app on {count, plural, one {# device} other {# devices}}',
  },
  filterApps: { id: 'devices.bulk.install.filterApps', defaultMessage: 'Filter apps' },
  configuredTitle: { id: 'devices.bulk.configured.title', defaultMessage: 'Return to configured kiosk?' },
  configuredDescription: {
    id: 'devices.bulk.configured.description',
    defaultMessage: 'Each device goes back into the kiosk its configuration defines. Devices without one are skipped.',
  },
  configuredThing: { id: 'devices.bulk.configured.loadThing', defaultMessage: 'the configurations’ kiosks' },
  configuredLoading: { id: 'devices.bulk.configured.loading', defaultMessage: 'Loading the configurations’ kiosks' },
  byConfiguration: { id: 'devices.bulk.configured.listLabel', defaultMessage: 'By configuration' },
  groupRow: {
    id: 'devices.bulk.configured.groupRow',
    defaultMessage: '<strong>{name}</strong> · {count, plural, one {# device} other {# devices}}: {detail}',
  },
  groupKioskLeftOut: {
    id: 'devices.bulk.configured.mainAppLeftOut',
    defaultMessage: '{summary}. Its main app isn’t set to Install and shown in kiosk, so the kiosk leaves it out',
  },
  groupNone: { id: 'devices.bulk.configured.noConfigurationName', defaultMessage: 'No configuration' },
  groupUnknown: { id: 'devices.bulk.configured.unknownConfigurationName', defaultMessage: 'Configuration {id}' },
  skipNone: {
    id: 'devices.bulk.configured.skipNoConfiguration',
    defaultMessage: 'skipped, no configuration, so no configured kiosk',
  },
  skipUnavailable: {
    id: 'devices.bulk.configured.skipUnavailable',
    defaultMessage: 'skipped, its configuration isn’t available to you',
  },
  skipKioskOff: {
    id: 'devices.bulk.configured.skipKioskOff',
    defaultMessage: 'skipped, kiosk mode is off in this configuration',
  },
  skipNoApps: {
    id: 'devices.bulk.configured.skipNoApps',
    defaultMessage: 'skipped, no app is set to Install and shown in kiosk',
  },
  returnDevices: {
    id: 'devices.bulk.configured.returnDevices',
    defaultMessage: 'Return {count, plural, one {# device} other {# devices}} to configured kiosk',
  },
  kioskTitle: {
    id: 'devices.bulk.kiosk.title',
    defaultMessage: 'Custom kiosk on {count, plural, one {# device} other {# devices}}',
  },
  kioskDescription: {
    id: 'devices.bulk.kiosk.description',
    defaultMessage: 'A one-time kiosk with apps you pick now. The devices’ configurations don’t define it.',
  },
  kioskModeLabel: { id: 'devices.bulk.kiosk.modeLabel', defaultMessage: 'Kiosk mode' },
  modeLauncher: { id: 'devices.bulk.kiosk.modeLauncher', defaultMessage: 'Allowed apps (launcher grid)' },
  modeSingle: { id: 'devices.bulk.kiosk.modeSingle', defaultMessage: 'Pin a single app' },
  filterLibraryApps: { id: 'devices.bulk.kiosk.filterLibraryApps', defaultMessage: 'Filter Library apps' },
  appToPin: { id: 'devices.bulk.kiosk.appToPin', defaultMessage: 'App to pin' },
  allowedApps: { id: 'devices.bulk.kiosk.allowedApps', defaultMessage: 'Allowed apps' },
  exitMode: { id: 'devices.bulk.kiosk.exitMode', defaultMessage: 'Exit mode' },
  exitGesture: { id: 'devices.bulk.kiosk.exitGesture', defaultMessage: 'Gesture' },
  exitVisible: { id: 'devices.bulk.kiosk.exitVisible', defaultMessage: 'Visible button' },
  exitRemote: { id: 'devices.bulk.kiosk.exitRemote', defaultMessage: 'Remote only' },
  exitPin: { id: 'devices.bulk.kiosk.exitPin', defaultMessage: 'Kiosk exit PIN' },
  pinDigits: { id: 'devices.bulk.kiosk.pinDigits', defaultMessage: '6 to 12 digits' },
  showPin: { id: 'devices.bulk.kiosk.showPin', defaultMessage: 'Show PIN' },
  enterKiosk: {
    id: 'devices.bulk.kiosk.enterOn',
    defaultMessage: 'Enter kiosk on {count, plural, one {# device} other {# devices}}',
  },
  libraryThing: { id: 'devices.bulk.library.loadThing', defaultMessage: 'the library' },
  libraryLoading: { id: 'devices.bulk.library.loading', defaultMessage: 'Loading the library' },
  noAppsMatch: { id: 'devices.bulk.library.noMatch', defaultMessage: 'No apps match' },
  noAppsYet: { id: 'devices.bulk.library.empty', defaultMessage: 'No apps in the library yet' },
  tryAnother: { id: 'devices.bulk.library.tryAnother', defaultMessage: 'Try another name or package.' },
  addAppsFirst: { id: 'devices.bulk.library.addAppsFirst', defaultMessage: 'Add apps under Apps first.' },
  configurationFallback: { id: 'devices.bulk.move.configurationFallback', defaultMessage: 'configuration' },
  configurationChanged: { id: 'devices.bulk.move.changed', defaultMessage: 'Configuration changed' },
  movedBody: {
    id: 'devices.bulk.move.changedBody',
    defaultMessage: '{count, plural, one {# device} other {# devices}} → {name}.',
  },
  changeFailed: { id: 'devices.bulk.move.failed', defaultMessage: 'Change failed' },
  moveTitle: { id: 'devices.bulk.move.title', defaultMessage: 'Change configuration' },
  moveDescription: {
    id: 'devices.bulk.move.description',
    defaultMessage:
      '{label} {count, plural, one {takes} other {take}} the new configuration at the next check-in.',
  },
  moving: { id: 'devices.bulk.move.moving', defaultMessage: 'Moving…' },
  move: { id: 'devices.bulk.move.move', defaultMessage: 'Move' },
  configuration: { id: 'devices.bulk.move.configuration', defaultMessage: 'Configuration' },
  selectConfiguration: { id: 'devices.bulk.move.selectConfiguration', defaultMessage: 'Select a configuration' },
  deleted: {
    id: 'devices.bulk.delete.deleted',
    defaultMessage: '{count, plural, one {Device deleted} other {Devices deleted}}',
    description: 'DESTRUCTIVE: the devices were removed from MDMesh',
  },
  deletedBody: { id: 'devices.bulk.delete.deletedBody', defaultMessage: '{subject} removed.' },
  deleteFailed: { id: 'devices.bulk.delete.failed', defaultMessage: 'Delete failed' },
  deleteTitle: {
    id: 'devices.bulk.delete.title',
    defaultMessage: '{count, plural, one {Delete device?} other {Delete # devices?}}',
    description: 'DESTRUCTIVE: removes the devices from MDMesh',
  },
  deleteDescription: {
    id: 'devices.bulk.delete.description',
    defaultMessage:
      '{count, plural, one {Removes it from MDMesh. It comes back if it checks in again.} other {Removes them from MDMesh. They come back if they check in again.}}',
    description: 'DESTRUCTIVE: removes the devices from MDMesh',
  },
  deleting: { id: 'devices.bulk.delete.deleting', defaultMessage: 'Deleting…' },
  deleteButton: {
    id: 'devices.bulk.delete.button',
    defaultMessage: 'Delete {subject}',
    description: 'DESTRUCTIVE: removes the devices from MDMesh',
  },
});

const strong = (chunks: ReactNode) => <strong>{chunks}</strong>;

// ---------------------------------------------------------------------------------------------------------------
// Run action
// ---------------------------------------------------------------------------------------------------------------

// Only safe + disruptive actions run in bulk: the server refuses the destructive ones (isBulkForbidden) there,
// and kiosk-enter has its own steps (Return to configured kiosk, and Custom kiosk's Library picker). Same rule as
// the classic BulkActionModal.
const BULK_GROUPS: Array<{ id: 'safe' | 'disruptive'; title: MessageDescriptor }> = [
  { id: 'safe', title: messages.groupActions },
  { id: 'disruptive', title: messages.groupDisruptive },
];

function bulkable(t: CommandTemplateExt): boolean {
  if (isBulkForbidden(t.request.type)) return false;
  return t.key !== 'kiosk-enter';
}

/** A Library app as an install spec (single url or split bundle parts); null when nothing is hosted. */
function specForApp(app: Application): AppInstallSpec | null {
  let parts: { url: string; sha256?: string }[] | undefined;
  if (app.parts) {
    try {
      const arr = JSON.parse(app.parts) as { url: string; sha256?: string }[];
      if (Array.isArray(arr) && arr.length) parts = arr;
    } catch {
      parts = undefined;
    }
  }
  if (!parts && !app.url) return null;
  return { url: app.url ?? '', packageName: app.pkg, versionCode: app.latestVersion, parts };
}

type Step =
  | { kind: 'catalog' }
  | { kind: 'params'; t: CommandTemplateExt }
  | { kind: 'apps' }
  | { kind: 'kiosk' }
  | { kind: 'configured' };

/** The selected devices of one configuration, and its kiosk (null: skipped, `skip` says why). */
type SkipReason = 'none' | 'unavailable' | 'kioskOff' | 'noApps';
interface KioskGroup {
  key: string;
  /** The configuration's name (English placeholders for "none" and "unknown": shown through groupName). */
  name: string;
  /** The configuration's id when it is not available to the user (its placeholder name is "Configuration {id}"). */
  unknownId?: number;
  ids: number[];
  kiosk: ConfiguredKiosk | null;
  skip?: SkipReason;
}

const SKIP_MESSAGES: Record<SkipReason, MessageDescriptor> = {
  none: messages.skipNone,
  unavailable: messages.skipUnavailable,
  kioskOff: messages.skipKioskOff,
  noApps: messages.skipNoApps,
};

function groupName(intl: IntlShape, g: KioskGroup): string {
  if (g.skip === 'none') return intl.formatMessage(messages.groupNone);
  if (g.unknownId != null) return intl.formatMessage(messages.groupUnknown, { id: g.unknownId });
  // The key is the configuration's id for a configuration that loaded.
  return configName(intl, { id: Number(g.key), name: g.name });
}

/**
 * The selection by configuration, each with the kiosk its configuration defines (configuredKiosk), for "Return to
 * configured kiosk". Throws when the configurations or a kiosk configuration's apps can't be loaded.
 */
async function loadKioskGroups(
  deviceIds: number[],
  devices: ReadonlyArray<{ id: number; configurationId?: number }>,
): Promise<KioskGroup[]> {
  const byConfig = new Map<number | undefined, number[]>();
  for (const id of deviceIds) {
    const cid = devices.find((d) => d.id === id)?.configurationId;
    byConfig.set(cid, [...(byConfig.get(cid) ?? []), id]);
  }
  const configs = await getConfigurations();
  const groups: KioskGroup[] = [];
  for (const [cid, ids] of byConfig) {
    const cfg = cid == null ? undefined : configs.find((c) => c.id === cid);
    const key = String(cid ?? 'none');
    if (cid == null) {
      groups.push({ key, name: 'No configuration', ids, kiosk: null, skip: 'none' });
    } else if (!cfg) {
      groups.push({ key, name: `Configuration ${cid}`, unknownId: cid, ids, kiosk: null, skip: 'unavailable' });
    } else if (cfg.kioskMode !== true) {
      groups.push({ key, name: cfg.name, ids, kiosk: null, skip: 'kioskOff' });
    } else {
      const kiosk = configuredKiosk(cfg, await getConfigurationApps(cid));
      groups.push(
        kiosk && kiosk.apps.length
          ? { key, name: cfg.name, ids, kiosk }
          : { key, name: cfg.name, ids, kiosk: null, skip: 'noApps' },
      );
    }
  }
  // Devices that return first, then the skipped ones; by name within each.
  return groups.sort((a, b) => Number(!a.kiosk) - Number(!b.kiosk) || a.name.localeCompare(b.name));
}

/** Library apps, loaded when a step needs them. */
function useLibrary(enabled: boolean) {
  const intl = useIntl();
  const [apps, setApps] = useState<Application[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled || apps) return;
    let cancelled = false;
    listApplications()
      .then((r) => {
        if (!cancelled) setApps(r);
      })
      .catch((e) => {
        if (!cancelled) setErr(apiErrorText(intl, e) || intl.formatMessage(messages.loadAppsFailed));
      });
    return () => {
      cancelled = true;
    };
    // intl is stable for the page's language
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, apps]);
  return { apps, err };
}

export function RunActionModal({
  open = true,
  deviceIds,
  devices,
  onClose,
  onDone,
}: {
  open?: boolean;
  deviceIds: number[];
  devices: ReadonlyArray<{ id: number; configurationId?: number }>;
  onClose: () => void;
  /** After a command was queued (clears the selection). */
  onDone: () => void;
}) {
  const toast = useToast();
  const intl = useIntl();
  const queuedFor = (count: number, skipped: number) => intl.formatMessage(messages.queuedFor, { count, skipped });
  const n = deviceIds.length;
  const [step, setStep] = useState<Step>({ kind: 'catalog' });
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [appQuery, setAppQuery] = useState('');
  const library = useLibrary(step.kind === 'apps' || step.kind === 'kiosk');

  // kiosk step state
  const [mode, setMode] = useState<KioskChoice['mode']>('launcher');
  const [pkgs, setPkgs] = useState<Set<string>>(new Set());
  const [exitMode, setExitMode] = useState<KioskChoice['exitMode']>('gesture');
  const [password, setPassword] = useState('');
  // The PIN's error shows once the field is left, not while the first digits are typed.
  const [pinLeft, setPinLeft] = useState(false);

  // configured-kiosk step state
  const [groups, setGroups] = useState<KioskGroup[] | null>(null);
  const [groupsErr, setGroupsErr] = useState<string | null>(null);
  const [groupsAttempt, setGroupsAttempt] = useState(0);
  const [sendErr, setSendErr] = useState<string | null>(null);
  useEffect(() => {
    if (step.kind !== 'configured') return;
    let cancelled = false;
    setGroups(null);
    setGroupsErr(null);
    loadKioskGroups(deviceIds, devices)
      .then((g) => {
        if (!cancelled) setGroups(g);
      })
      .catch((e) => {
        if (!cancelled) setGroupsErr(apiErrorText(intl, e) || intl.formatMessage(messages.requestFailed));
      });
    return () => {
      cancelled = true;
    };
    // intl is stable for the page's language
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.kind, deviceIds, devices, groupsAttempt]);

  const finish = () => {
    onDone();
    onClose();
  };

  async function run(t: CommandTemplateExt, vals: Record<string, string>) {
    const { label } = formatActionTemplate(intl, t);
    setBusy(true);
    try {
      const req = t.build ? t.build(vals) : t.request;
      const res = await bulkQueueCommand(deviceIds, req);
      const skipped = res.skipped?.length ?? 0;
      toast.push('ok', intl.formatMessage(messages.actionQueued, { label }), queuedFor(res.queued, skipped));
      finish();
    } catch (e) {
      toast.push('err', intl.formatMessage(messages.actionFailed, { label }), formatCommandError(intl, e));
    } finally {
      setBusy(false);
    }
  }

  async function runInstall(app: Application) {
    const spec = specForApp(app);
    if (!spec) {
      toast.push('err', intl.formatMessage(messages.notInstallable), intl.formatMessage(messages.noHostedApk, { name: app.name }));
      return;
    }
    setBusy(true);
    try {
      const res = await bulkQueueCommand(deviceIds, buildInstallCommand(spec));
      const skipped = res.skipped?.length ?? 0;
      toast.push(
        'ok',
        intl.formatMessage(messages.installQueued),
        intl.formatMessage(messages.installQueuedBody, { name: app.name, count: res.queued, skipped }),
      );
      finish();
    } catch (e) {
      toast.push('err', intl.formatMessage(messages.installFailed), formatCommandError(intl, e));
    } finally {
      setBusy(false);
    }
  }

  async function enterKiosk() {
    setBusy(true);
    try {
      const choice: KioskChoice = { mode, packages: Array.from(pkgs), exitMode, password };
      // One command per configuration, each carrying that configuration's launcher theme (classic BulkKioskModal).
      const groups = new Map<number | undefined, number[]>();
      for (const id of deviceIds) {
        const cid = devices.find((d) => d.id === id)?.configurationId;
        groups.set(cid, [...(groups.get(cid) ?? []), id]);
      }
      const configs: Configuration[] = await getConfigurations().catch(() => []);
      let queued = 0;
      let skipped = 0;
      for (const [cid, ids] of groups) {
        const payload = buildKioskPayload(choice, kioskTheme(configs.find((c) => c.id === cid)));
        const res = await bulkQueueCommand(ids, { type: 'kiosk.enter', payload: JSON.stringify(payload) });
        queued += res.queued ?? 0;
        skipped += res.skipped?.length ?? 0;
      }
      toast.push('ok', intl.formatMessage(messages.customKioskQueued), queuedFor(queued, skipped));
      finish();
    } catch (e) {
      toast.push('err', intl.formatMessage(messages.customKioskFailed), formatCommandError(intl, e));
    } finally {
      setBusy(false);
    }
  }

  /** One `kiosk.enter` per configuration, each carrying the kiosk that configuration defines. */
  async function returnToConfiguredKiosk() {
    if (!groups) return;
    setBusy(true);
    setSendErr(null);
    let queued = 0;
    let skipped = groups.filter((g) => !g.kiosk).reduce((n, g) => n + g.ids.length, 0);
    try {
      for (const g of groups) {
        if (!g.kiosk) continue;
        const res = await bulkQueueCommand(g.ids, { type: 'kiosk.enter', payload: configuredKioskCommand(g.kiosk) });
        queued += res.queued ?? 0;
        skipped += res.skipped?.length ?? 0;
      }
      toast.push('ok', intl.formatMessage(messages.configuredKioskQueued), queuedFor(queued, skipped));
      finish();
    } catch (e) {
      setSendErr(
        intl.formatMessage(messages.couldntQueue, {
          reason: apiErrorText(intl, e) || intl.formatMessage(messages.notAccepted),
          queued,
        }),
      );
    } finally {
      setBusy(false);
    }
  }

  function pick(t: CommandTemplateExt) {
    // Inputs or a confirmation (Reboot) first; everything else queues at once, as in the v0.3 console.
    if ((t.params && t.params.length > 0) || t.confirm) {
      setValues({});
      setStep({ kind: 'params', t });
      return;
    }
    void run(t, {});
  }

  function togglePkg(pkg: string) {
    setPkgs((prev) => {
      if (mode === 'single') return new Set(prev.has(pkg) ? [] : [pkg]);
      const next = new Set(prev);
      if (next.has(pkg)) next.delete(pkg);
      else next.add(pkg);
      return next;
    });
  }
  function switchMode(m: KioskChoice['mode']) {
    setMode(m);
    if (m === 'single' && pkgs.size > 1) setPkgs(new Set([Array.from(pkgs)[0]]));
  }

  const filteredApps = useMemo(
    () => (library.apps ?? []).filter((a) => `${a.name} ${a.pkg}`.toLowerCase().includes(appQuery.toLowerCase())),
    [library.apps, appQuery],
  );

  const back = (
    <Button size="lg" disabled={busy} onClick={() => setStep({ kind: 'catalog' })}>
      {intl.formatMessage(messages.back)}
    </Button>
  );

  let title = intl.formatMessage(messages.runTitle, { count: n });
  let description: string | undefined;
  let body: ReactNode;
  let footer: ReactNode;

  if (step.kind === 'catalog') {
    body = (
      <>
        {BULK_GROUPS.map((g) => (
          <ActionGroup key={g.id} title={intl.formatMessage(g.title)}>
            {ACTION_TEMPLATES.filter(bulkable)
              .filter((t) => (t.group ?? 'safe') === g.id)
              .map((t) => {
                const text = formatActionTemplate(intl, t);
                return (
                  <Tooltip key={t.key} content={text.description}>
                    <Button variant={t.danger ? 'danger' : 'secondary'} disabled={busy} onClick={() => pick(t)}>
                      {text.label}
                    </Button>
                  </Tooltip>
                );
              })}
          </ActionGroup>
        ))}
        <ActionGroup title={intl.formatMessage(messages.groupApps)}>
          <Button disabled={busy} onClick={() => setStep({ kind: 'apps' })}>
            {intl.formatMessage(messages.installApp)}
          </Button>
        </ActionGroup>
        <ActionGroup title={intl.formatMessage(messages.groupKiosk)}>
          <Tooltip content={intl.formatMessage(messages.returnToKioskHint)}>
            <Button
              disabled={busy}
              onClick={() => {
                setSendErr(null);
                setStep({ kind: 'configured' });
              }}
            >
              {intl.formatMessage(messages.returnToKiosk)}
            </Button>
          </Tooltip>
          <Tooltip content={intl.formatMessage(messages.customKioskHint)}>
            <Button disabled={busy} onClick={() => setStep({ kind: 'kiosk' })}>
              {intl.formatMessage(messages.customKiosk)}
            </Button>
          </Tooltip>
        </ActionGroup>
      </>
    );
    footer = (
      <Button size="lg" disabled={busy} onClick={onClose}>
        {intl.formatMessage(messages.close)}
      </Button>
    );
  } else if (step.kind === 'params') {
    const t = step.t;
    const text = formatActionTemplate(intl, t);
    const canSend = !t.params?.some((p) => p.required && !values[p.key]);
    title = text.title;
    description = text.description;
    body = (
      <>
        <p className="v2-bulkmodal__text">
          <FormattedMessage {...messages.runsOn} values={{ count: n, strong }} />
        </p>
        {text.params.map((p) =>
          p.kind === 'password' ? (
            <Field key={p.key} label={p.label}>
              <PasswordInput
                placeholder={p.placeholder}
                value={values[p.key] ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [p.key]: e.target.value }))}
              />
            </Field>
          ) : (
            <Field key={p.key} label={p.required ? p.label : intl.formatMessage(messages.optional, { label: p.label })}>
              <Input
                type={p.kind === 'number' ? 'number' : 'text'}
                placeholder={p.placeholder}
                required={p.required}
                value={values[p.key] ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [p.key]: e.target.value }))}
              />
            </Field>
          ),
        )}
      </>
    );
    footer = (
      <>
        {back}
        <Button
          size="lg"
          variant={t.group === 'destructive' ? 'danger-primary' : 'primary'}
          disabled={busy || !canSend}
          onClick={() => {
            void run(t, values);
          }}
        >
          {busy
            ? intl.formatMessage(messages.queueing)
            : t.danger
              ? intl.formatMessage(messages.actionOnDevices, { label: text.label, count: n })
              : intl.formatMessage(messages.sendTo, { count: n })}
        </Button>
      </>
    );
  } else if (step.kind === 'apps') {
    title = intl.formatMessage(messages.installTitle, { count: n });
    body = (
      <>
        <SearchInput
          aria-label={intl.formatMessage(messages.filterApps)}
          placeholder={intl.formatMessage(messages.filterApps)}
          value={appQuery}
          onChange={setAppQuery}
        />
        <LibraryState apps={library.apps} err={library.err} empty={filteredApps.length === 0} />
        {filteredApps.length > 0 ? (
          <div className="v2-bulkmodal__grid">
            {filteredApps.map((a) => (
              <Tooltip key={a.id ?? a.pkg} content={a.pkg}>
                <Button
                  disabled={busy}
                  onClick={() => {
                    void runInstall(a);
                  }}
                >
                  {a.name}
                  {a.version ? ` (${a.version})` : ''}
                </Button>
              </Tooltip>
            ))}
          </div>
        ) : null}
      </>
    );
    footer = back;
  } else if (step.kind === 'configured') {
    const ready = groups?.filter((g) => g.kiosk) ?? [];
    const readyCount = ready.reduce((k, g) => k + g.ids.length, 0);
    title = intl.formatMessage(messages.configuredTitle);
    description = intl.formatMessage(messages.configuredDescription);
    body = (
      <>
        {groupsErr ? (
          <ErrorState thing={intl.formatMessage(messages.configuredThing)} detail={groupsErr} onRetry={() => setGroupsAttempt((k) => k + 1)} />
        ) : !groups ? (
          <SkeletonRows compact count={2} label={intl.formatMessage(messages.configuredLoading)} />
        ) : (
          <ul className="v2-bulkmodal__kiosks" aria-label={intl.formatMessage(messages.byConfiguration)}>
            {groups.map((g) => (
              <li key={g.key} className={g.kiosk ? undefined : 'is-skipped'}>
                <FormattedMessage
                  {...messages.groupRow}
                  values={{
                    strong,
                    name: groupName(intl, g),
                    count: g.ids.length,
                    detail: g.kiosk
                      ? g.kiosk.mainAppLeftOut
                        ? intl.formatMessage(messages.groupKioskLeftOut, { summary: configuredKioskSummary(g.kiosk, intl) })
                        : configuredKioskSummary(g.kiosk, intl)
                      : intl.formatMessage(SKIP_MESSAGES[g.skip ?? 'noApps']),
                  }}
                />
              </li>
            ))}
          </ul>
        )}
        {sendErr ? (
          <Callout tone="alert" role="alert">
            {sendErr}
          </Callout>
        ) : null}
      </>
    );
    footer = (
      <>
        {back}
        <Button
          size="lg"
          variant="primary"
          disabled={busy || readyCount === 0}
          onClick={() => {
            void returnToConfiguredKiosk();
          }}
        >
          {busy ? intl.formatMessage(messages.queueing) : intl.formatMessage(messages.returnDevices, { count: readyCount })}
        </Button>
      </>
    );
  } else {
    // A custom kiosk's PIN is new: it follows the configurations' rule.
    const pinError = exitPinValid(password) ? undefined : exitPinRule(intl);
    const canApply = pkgs.size > 0 && (mode === 'launcher' || pkgs.size === 1) && pinError == null;
    title = intl.formatMessage(messages.kioskTitle, { count: n });
    description = intl.formatMessage(messages.kioskDescription);
    body = (
      <>
        <Segmented
          aria-label={intl.formatMessage(messages.kioskModeLabel)}
          value={mode}
          onChange={switchMode}
          options={[
            { value: 'launcher', label: intl.formatMessage(messages.modeLauncher) },
            { value: 'single', label: intl.formatMessage(messages.modeSingle) },
          ]}
        />
        <SearchInput
          aria-label={intl.formatMessage(messages.filterLibraryApps)}
          placeholder={intl.formatMessage(messages.filterLibraryApps)}
          value={appQuery}
          onChange={setAppQuery}
        />
        <LibraryState apps={library.apps} err={library.err} empty={filteredApps.length === 0} />
        {filteredApps.length > 0 ? (
          // I8: one row per app, its checkbox first (as the device page's custom kiosk).
          <div className="v2-bulkmodal__apps" role="group" aria-label={intl.formatMessage(mode === 'single' ? messages.appToPin : messages.allowedApps)}>
            {filteredApps.map((a) => {
              const on = pkgs.has(a.pkg);
              return (
                <label key={a.id ?? a.pkg} className={`v2-bulkmodal__app${on ? ' is-on' : ''}`}>
                  <Checkbox checked={on} disabled={busy} onChange={() => togglePkg(a.pkg)} />
                  <span className="v2-bulkmodal__appmeta">
                    <span className="v2-bulkmodal__appname">{a.name}</span>
                    <span className="v2-bulkmodal__apppkg">{a.pkg}</span>
                  </span>
                </label>
              );
            })}
          </div>
        ) : null}
        <Field label={intl.formatMessage(messages.exitMode)}>
          <Select value={exitMode} onChange={(e) => setExitMode(e.target.value as KioskChoice['exitMode'])}>
            <option value="gesture">{intl.formatMessage(messages.exitGesture)}</option>
            <option value="visible">{intl.formatMessage(messages.exitVisible)}</option>
            <option value="remote">{intl.formatMessage(messages.exitRemote)}</option>
          </Select>
        </Field>
        <Field
          label={intl.formatMessage(messages.exitPin)}
          help={pinLeft && pinError ? undefined : intl.formatMessage(messages.pinDigits)}
          error={pinLeft ? pinError : undefined}
        >
          <Tooltip content={exitPinHelp(intl)}>
            <PasswordInput
              value={password}
              autoComplete="new-password"
              inputMode="numeric"
              toggleLabel={intl.formatMessage(messages.showPin)}
              placeholder={intl.formatMessage(kioskMessages.exitPinPlaceholder)}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={() => setPinLeft(true)}
            />
          </Tooltip>
        </Field>
      </>
    );
    footer = (
      <>
        {back}
        <Button
          size="lg"
          variant="primary"
          disabled={busy || !canApply}
          onClick={() => {
            void enterKiosk();
          }}
        >
          {busy ? intl.formatMessage(messages.queueing) : intl.formatMessage(messages.enterKiosk, { count: n })}
        </Button>
      </>
    );
  }

  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onClose}
      title={title}
      description={description}
      dismissOnBackdrop={step.kind === 'catalog'}
      footer={footer}
    >
      {body}
    </Modal>
  );
}

function ActionGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="v2-bulkmodal__group" aria-label={title}>
      <Eyebrow as="h3">{title}</Eyebrow>
      <div className="v2-bulkmodal__grid">{children}</div>
    </section>
  );
}

function LibraryState({ apps, err, empty }: { apps: Application[] | null; err: string | null; empty: boolean }) {
  const intl = useIntl();
  if (err) return <ErrorState thing={intl.formatMessage(messages.libraryThing)} detail={err} />;
  if (!apps) return <SkeletonRows compact count={4} label={intl.formatMessage(messages.libraryLoading)} />;
  if (empty)
    return (
      <EmptyState bare title={intl.formatMessage(apps.length ? messages.noAppsMatch : messages.noAppsYet)}>
        {intl.formatMessage(apps.length ? messages.tryAnother : messages.addAppsFirst)}
      </EmptyState>
    );
  return null;
}

// ---------------------------------------------------------------------------------------------------------------
// Change configuration
// ---------------------------------------------------------------------------------------------------------------

export function ChangeConfigurationModal({
  open = true,
  ids,
  configurations,
  configurationsError,
  label,
  onClose,
  onDone,
}: {
  open?: boolean;
  ids: number[];
  /** Every configuration, sorted by name. */
  configurations: ConfigurationSummary[];
  /** Shown instead of the choices when the configurations could not be loaded (the list is then empty). */
  configurationsError?: string | null;
  /** "KSK-0151" for a single device from its menu; otherwise "N devices". */
  label?: string;
  onClose: () => void;
  onDone: () => void | Promise<void>;
}) {
  const toast = useToast();
  const intl = useIntl();
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const n = ids.length;

  async function apply() {
    if (!target) return;
    setBusy(true);
    try {
      await bulkSetConfiguration(ids, Number(target));
      const picked = configurations.find((c) => c.id === Number(target));
      const name = picked ? configName(intl, picked) : intl.formatMessage(messages.configurationFallback);
      toast.push('ok', intl.formatMessage(messages.configurationChanged), intl.formatMessage(messages.movedBody, { count: n, name }));
      onClose();
      await onDone();
    } catch (e) {
      toast.push('err', intl.formatMessage(messages.changeFailed), apiErrorText(intl, e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      size="sm"
      onClose={busy ? () => undefined : onClose}
      title={intl.formatMessage(messages.moveTitle)}
      description={intl.formatMessage(messages.moveDescription, {
        label: label ?? intl.formatMessage(messages.devices, { count: n }),
        count: n,
      })}
      footer={
        <>
          <Button size="lg" disabled={busy} onClick={onClose}>
            {intl.formatMessage(messages.cancel)}
          </Button>
          <Button
            size="lg"
            variant="primary"
            disabled={busy || !target}
            onClick={() => {
              void apply();
            }}
          >
            {busy ? intl.formatMessage(messages.moving) : intl.formatMessage(messages.move)}
          </Button>
        </>
      }
    >
      {configurationsError ? (
        <Callout tone="alert" role="alert">
          {configurationsError}
        </Callout>
      ) : null}
      <Field label={intl.formatMessage(messages.configuration)}>
        <Select value={target} disabled={!!configurationsError} onChange={(e) => setTarget(e.target.value)}>
          <option value="">{intl.formatMessage(messages.selectConfiguration)}</option>
          {configurations.map((c) => (
            <option key={c.id} value={String(c.id)}>
              {configName(intl, c)}
            </option>
          ))}
        </Select>
      </Field>
    </Modal>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------------------------------------------

export function DeleteDevicesModal({
  open = true,
  ids,
  label,
  onClose,
  onDone,
}: {
  open?: boolean;
  ids: number[];
  label?: string;
  onClose: () => void;
  onDone: () => void | Promise<void>;
}) {
  const toast = useToast();
  const intl = useIntl();
  const [busy, setBusy] = useState(false);
  const n = ids.length;
  // "KSK-0151" for one device named from its menu, otherwise "N devices".
  const subject = label && n === 1 ? label : intl.formatMessage(messages.devices, { count: n });

  async function apply() {
    setBusy(true);
    try {
      await deleteDevicesBulk(ids);
      toast.push('ok', intl.formatMessage(messages.deleted, { count: n }), intl.formatMessage(messages.deletedBody, { subject }));
      onClose();
      await onDone();
    } catch (e) {
      toast.push('err', intl.formatMessage(messages.deleteFailed), apiErrorText(intl, e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      size="sm"
      role="alertdialog"
      onClose={busy ? () => undefined : onClose}
      title={intl.formatMessage(messages.deleteTitle, { count: n })}
      description={intl.formatMessage(messages.deleteDescription, { count: n })}
      footer={
        <>
          <Button size="lg" disabled={busy} onClick={onClose}>
            {intl.formatMessage(messages.cancel)}
          </Button>
          <Button
            size="lg"
            variant="danger-primary"
            disabled={busy}
            onClick={() => {
              void apply();
            }}
          >
            {busy ? intl.formatMessage(messages.deleting) : intl.formatMessage(messages.deleteButton, { subject })}
          </Button>
        </>
      }
    />
  );
}
