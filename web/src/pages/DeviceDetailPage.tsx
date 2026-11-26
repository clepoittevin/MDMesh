import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { FormattedMessage, defineMessages, useIntl, type MessageDescriptor } from 'react-intl';
import { configName as shownConfigName } from '../data/seededConfigs';
import {
  getDeviceByNumber,
  searchDevices,
  updateDeviceDescription,
  type ConfigurationLookup,
  type DeviceView,
} from '../api/devices';
import { getTelemetry, type TelemetrySnapshot } from '../api/telemetry';
import { getConfigStatus, summarizeStatus, type ConfigStatus } from '../api/configSync';
import {
  formatActionTemplate,
  formatCommandError,
  forceSync,
  retryConfigApply,
  getDeviceState,
  listCommandHistory,
  queueCommand,
  syncConfigApps,
  type CommandHistoryItem,
  type CommandTemplateExt,
  type DeviceState,
  type QueueCommandRequest,
} from '../api/commands';
import { getEvents, type DeviceEvent } from '../api/events';
import { listLocations, type LocationFix } from '../api/deviceLocations';
import { getConfiguration, getConfigurationApps, type ConfigApp, type Configuration } from '../api/configurations';
import { listApplications, type Application } from '../api/applications';
import { ApiError } from '../api/client';
import { fmtDateTime } from '../ui/format';
import { paths } from '../routes';
import {
  Breadcrumb,
  Button,
  Callout,
  Card,
  DeviceTile,
  Skeleton,
  SkeletonFacts,
  Tooltip,
  IconAlert,
  IconDownload,
  IconLock,
  IconPencil,
  IconPower,
  IconRing,
  IconScreenMessage,
  IconSync,
  ButtonLink,
  EmptyState,
  ErrorState,
  IconButton,
  Input,
  LinkButton,
  formatRelativeIntl,
  Menu,
  StatusText,
  deriveDeviceKind,
  kindInputFromTelemetry,
  useStickyValue,
  useToast,
  type KeyValueItem,
} from '../ui';
import { ActionDialog, ConfigPanel, RemoteActions, TEMPLATE, type KioskReturnOffer } from './DeviceDetailControl';
import { DeviceKioskBackground } from './configurations/KioskBackground';
import { ActivityTab, LocationTab, TelemetryTab } from './DeviceDetailTabs';
import { AppsTab, useAppScan } from './DeviceDetailApps';
import { ConfiguredKioskDialog, DeviceKioskDialog } from './DeviceKioskDialog';
import { CORE_ACTION_ACCESS } from '../ext/core/access';
import { withCoreParts } from '../ext/core/device';
import { usePermission } from '../ext/permissions';
import { commandRequest, type DeviceCommand } from '../ext/types';
import { DeviceRailGroups } from '../ext/hosts/DeviceRail';
import { DeviceTabs, useDeviceTabs } from '../ext/hosts/DeviceTabs';
import { DeviceProvider } from '../ext/useDevice';
import {
  configuredKiosk,
  configuredKioskIds,
  configuredKioskState,
  rememberConfiguredKiosk,
} from '../data/kiosk';
import { ISSUE_REASON_MESSAGES, issueKind, presenceOf } from '../data/fleetHealth';
import { notConnected } from '../data/presence';
import { deviceKindMessages } from '../ui/DeviceCells';
import {
  DASH,
  cleanFixes,
  cleanLocation,
  fmtAccuracy,
  fmtAge,
  isoTime,
  fmtStorage,
  locationSince,
  makeModel,
  networkLabel,
  powerLabel,
  providerLabel,
  teleNum,
  teleObj,
  teleStr,
  validTime,
} from './deviceDetailFormat';
import './DeviceDetailPage.css';
import { apiErrorText } from '../api/apiErrorText';

const messagesRaw = defineMessages({
  breadcrumbDevices: { id: 'deviceDetail.breadcrumb.devices', defaultMessage: 'Devices' },
  nameSaved: { id: 'deviceDetail.name.saved', defaultMessage: 'Name saved' },
  nameCleared: { id: 'deviceDetail.name.cleared', defaultMessage: 'Name cleared.' },
  renameFailed: { id: 'deviceDetail.name.renameFailed', defaultMessage: 'Rename failed' },
  deviceName: { id: 'deviceDetail.name.label', defaultMessage: 'Device name' },
  saving: { id: 'deviceDetail.name.saving', defaultMessage: 'Saving…' },
  save: { id: 'deviceDetail.name.save', defaultMessage: 'Save' },
  cancel: { id: 'deviceDetail.name.cancel', defaultMessage: 'Cancel' },
  renameDevice: { id: 'deviceDetail.name.renameLabel', defaultMessage: 'Rename device' },
  addName: { id: 'deviceDetail.name.addNameLabel', defaultMessage: 'Add a name' },
  renameThisDevice: { id: 'deviceDetail.name.renameTitle', defaultMessage: 'Rename this device' },
  addNameTitle: { id: 'deviceDetail.name.addNameTitle', defaultMessage: 'Add a name' },

  locationsFailed: { id: 'deviceDetail.page.locationsFailed', defaultMessage: 'Failed to load locations' },
  requestFailed: { id: 'deviceDetail.page.requestFailed', defaultMessage: 'request failed' },
  documentName: { id: 'deviceDetail.page.documentName', defaultMessage: 'Device {id}' },
  syncRequested: { id: 'deviceDetail.page.syncRequested', defaultMessage: 'Sync requested' },
  syncFailed: { id: 'deviceDetail.page.syncFailed', defaultMessage: 'Sync failed' },
  alreadyApplied: { id: 'deviceDetail.page.alreadyApplied', defaultMessage: 'Already applied' },
  alreadyAppliedText: {
    id: 'deviceDetail.page.alreadyAppliedText',
    defaultMessage: 'The device has the current configuration.',
  },
  notSent: { id: 'deviceDetail.page.notSent', defaultMessage: 'Not sent' },
  agentTooOld: {
    id: 'deviceDetail.page.agentTooOld',
    defaultMessage: 'The device’s agent is too old for configurations.',
  },
  noConfiguration: { id: 'deviceDetail.page.noConfiguration', defaultMessage: 'The device has no configuration.' },
  configSentAgain: { id: 'deviceDetail.page.configSentAgain', defaultMessage: 'Configuration sent again' },
  configAlreadyQueued: {
    id: 'deviceDetail.page.configAlreadyQueued',
    defaultMessage: 'It was already on its way; the device was woken.',
  },
  retryFailed: { id: 'deviceDetail.page.retryFailed', defaultMessage: 'Retry failed' },
  installAppsQueued: {
    id: 'deviceDetail.page.installAppsQueued',
    defaultMessage: 'Install configuration apps queued',
  },
  installAppsQueuedText: {
    id: 'deviceDetail.page.installAppsQueuedText',
    defaultMessage: '{count, plural, one {# install command} other {# install commands}} queued.',
  },
  installAppsFailed: {
    id: 'deviceDetail.page.installAppsFailed',
    defaultMessage: 'Install configuration apps failed',
  },
  commandQueued: { id: 'deviceDetail.page.commandQueued', defaultMessage: '{label} queued' },
  commandFailed: { id: 'deviceDetail.page.commandFailed', defaultMessage: '{label} failed' },
  commandId: { id: 'deviceDetail.page.commandId', defaultMessage: 'Command {id}' },

  itsConfigurationStart: { id: 'deviceDetail.kiosk.itsConfigurationStart', defaultMessage: 'Its configuration' },
  itsConfigurationMid: { id: 'deviceDetail.kiosk.itsConfigurationMid', defaultMessage: 'its configuration' },
  noConfigHint: {
    id: 'deviceDetail.kiosk.noConfigHint',
    defaultMessage: 'This device has no configuration, so there is no configured kiosk to return to.',
  },
  configLoadFailed: {
    id: 'deviceDetail.kiosk.configLoadFailed',
    defaultMessage: 'Couldn’t load {name}, so its kiosk isn’t available here: {error}. Trying again in 15 seconds.',
  },
  noKioskMode: {
    id: 'deviceDetail.kiosk.noKioskMode',
    defaultMessage: '{name} doesn’t use kiosk mode, so there is no configured kiosk to return to.',
  },
  appsLoadFailed: {
    id: 'deviceDetail.kiosk.appsLoadFailed',
    defaultMessage: 'Couldn’t load the apps of {name}, so its kiosk can’t be built: {error}.',
  },
  retry: { id: 'deviceDetail.kiosk.retry', defaultMessage: 'Retry' },
  loadingKiosk: { id: 'deviceDetail.kiosk.loading', defaultMessage: 'Loading the kiosk that {name} defines…' },
  noKioskApps: {
    id: 'deviceDetail.kiosk.noApps',
    defaultMessage:
      '{name} has kiosk mode on, but no app is set to Install and shown in kiosk, so its kiosk has nothing to show. Add one in the configuration.',
  },
  waitingKiosk: {
    id: 'deviceDetail.kiosk.waiting',
    defaultMessage: 'Waiting for the device to enter the kiosk that {name} defines.',
  },
  alreadyInKiosk: {
    id: 'deviceDetail.kiosk.alreadyIn',
    defaultMessage: 'The device is already in the kiosk that {name} defines.',
  },

  loadingDevice: { id: 'deviceDetail.page.loadingDevice', defaultMessage: 'Loading device…' },
  cannotReach: { id: 'deviceDetail.page.cannotReach', defaultMessage: 'Cannot reach the server.' },
  thisDevice: { id: 'deviceDetail.page.thisDevice', defaultMessage: 'this device' },
  notFoundTitle: { id: 'deviceDetail.page.notFoundTitle', defaultMessage: 'Device not found' },
  goToDevices: { id: 'deviceDetail.page.goToDevices', defaultMessage: 'Go to Devices' },
  notFoundText: {
    id: 'deviceDetail.page.notFoundText',
    defaultMessage: 'No device has the number or id {id}. It may have been deleted.',
  },

  railBatteryValue: {
    id: 'deviceDetail.rail.batteryValue',
    defaultMessage: '{pct}% · {charging, select, true {charging} other {not charging}}',
  },
  railKioskRunningApp: { id: 'deviceDetail.rail.kioskRunningApp', defaultMessage: 'Running · {app}' },
  railKioskRunning: { id: 'deviceDetail.rail.kioskRunning', defaultMessage: 'Running' },
  railKioskOff: { id: 'deviceDetail.rail.kioskOff', defaultMessage: 'Off' },
  railLocked: { id: 'deviceDetail.rail.locked', defaultMessage: 'Locked' },
  railUnlocked: { id: 'deviceDetail.rail.unlocked', defaultMessage: 'Unlocked' },
  railBattery: { id: 'deviceDetail.rail.battery', defaultMessage: 'Battery' },
  railScreen: { id: 'deviceDetail.rail.screen', defaultMessage: 'Screen' },
  railKiosk: { id: 'deviceDetail.rail.kiosk', defaultMessage: 'Kiosk' },
  railConnection: { id: 'deviceDetail.rail.connection', defaultMessage: 'Connection' },
  railCoordinates: { id: 'deviceDetail.rail.coordinates', defaultMessage: 'Coordinates' },
  railAccuracy: { id: 'deviceDetail.rail.accuracy', defaultMessage: 'Accuracy' },
  railSource: { id: 'deviceDetail.rail.source', defaultMessage: 'Source' },
  railFixAge: { id: 'deviceDetail.rail.fixAge', defaultMessage: 'Fix age' },
  railLocation: { id: 'deviceDetail.rail.location', defaultMessage: 'Location' },
  railNotTracked: { id: 'deviceDetail.rail.notTracked', defaultMessage: 'Not tracked' },
  railNoFix: { id: 'deviceDetail.rail.noFix', defaultMessage: 'No fix reported yet' },
  railModel: { id: 'deviceDetail.rail.model', defaultMessage: 'Model' },
  railAndroid: { id: 'deviceDetail.rail.android', defaultMessage: 'Android' },
  railStorage: { id: 'deviceDetail.rail.storage', defaultMessage: 'Storage' },
  railSerial: { id: 'deviceDetail.rail.serial', defaultMessage: 'Serial' },
  railImei: { id: 'deviceDetail.rail.imei', defaultMessage: 'IMEI' },
  railPublicIp: { id: 'deviceDetail.rail.publicIp', defaultMessage: 'Public IP' },
  railLocalIp: { id: 'deviceDetail.rail.localIp', defaultMessage: 'Local IP' },
  railConfiguration: { id: 'deviceDetail.rail.configuration', defaultMessage: 'Configuration' },
  railAgent: { id: 'deviceDetail.rail.agent', defaultMessage: 'Agent' },
  railMdmMode: { id: 'deviceDetail.rail.mdmMode', defaultMessage: 'MDM mode' },
  railDeviceOwner: { id: 'deviceDetail.rail.deviceOwner', defaultMessage: 'Device owner' },
  railNotDeviceOwner: { id: 'deviceDetail.rail.notDeviceOwner', defaultMessage: 'Not device owner' },
  railEnrolled: { id: 'deviceDetail.rail.enrolled', defaultMessage: 'Enrolled' },

  wipedNotice: {
    id: 'deviceDetail.page.wipedNotice',
    defaultMessage:
      'Wiped {when}. The device erased itself, so it no longer reports. Delete it from <link>Devices</link>, or keep it for its history.',
  },
  checkedIn: { id: 'deviceDetail.page.checkedIn', defaultMessage: 'checked in {when}' },
  neverCheckedIn: { id: 'deviceDetail.page.neverCheckedIn', defaultMessage: 'checked in never' },
  quickActions: { id: 'deviceDetail.page.quickActions', defaultMessage: 'Quick actions' },
  syncNow: { id: 'deviceDetail.page.syncNow', defaultMessage: 'Sync now' },
  lock: { id: 'deviceDetail.page.lock', defaultMessage: 'Lock' },
  moreActions: { id: 'deviceDetail.page.moreActions', defaultMessage: 'More actions' },
  ring: { id: 'deviceDetail.page.ring', defaultMessage: 'Ring' },
  sendAlert: { id: 'deviceDetail.page.sendAlert', defaultMessage: 'Send alert' },
  lockScreenMessage: { id: 'deviceDetail.page.lockScreenMessage', defaultMessage: 'Lock-screen message' },
  installConfigApps: { id: 'deviceDetail.page.installConfigApps', defaultMessage: 'Install configuration apps' },
  reboot: { id: 'deviceDetail.page.reboot', defaultMessage: 'Reboot' },
  viewAllActivity: { id: 'deviceDetail.page.viewAllActivity', defaultMessage: 'View all activity' },
  railLabel: { id: 'deviceDetail.page.railLabel', defaultMessage: 'Device' },
  openInMaps: { id: 'deviceDetail.page.openInMaps', defaultMessage: 'Open location in Maps ↗' },
  opensInNewTab: { id: 'deviceDetail.page.opensInNewTab', defaultMessage: '(opens in a new tab)' },
});
const messages: Record<keyof typeof messagesRaw, MessageDescriptor> = messagesRaw;

const POLL_MS = 5000;
const DAY = 24 * 3600 * 1000;

/** Re-render on an interval so relative times ("checked in 3m ago") and presence stay current. */
function useNow(ms: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/* ===============================================================================================================
   Name (description) editing, in the rail header
   =============================================================================================================== */

function DeviceName({
  device,
  canRename,
  onSaved,
}: {
  device: DeviceView;
  /** The role holds edit_device_desc; without it the name shows without its pencil. */
  canRename: boolean;
  onSaved: (description: string) => void;
}) {
  const toast = useToast();
  const intl = useIntl();
  const inputId = useId();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(device.description ?? '');
  const [saving, setSaving] = useState(false);
  const pencilRef = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);

  useEffect(() => {
    if (!editing) setValue(device.description ?? '');
  }, [device.description, editing]);

  // Focus goes back to the pencil when the editor closes.
  useEffect(() => {
    if (wasEditing.current && !editing) pencilRef.current?.focus();
    wasEditing.current = editing;
  }, [editing]);

  const cancel = () => {
    setValue(device.description ?? '');
    setEditing(false);
  };

  async function save() {
    const next = value.trim();
    if (next === (device.description ?? '')) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await updateDeviceDescription(device.id, next);
      onSaved(next);
      setEditing(false);
      toast.push('ok', intl.formatMessage(messages.nameSaved), next || intl.formatMessage(messages.nameCleared));
    } catch (e) {
      toast.push('err', intl.formatMessage(messages.renameFailed), apiErrorText(intl, e));
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <form
        className="v2-device-rename"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label htmlFor={inputId} className="v2-visually-hidden">
          {intl.formatMessage(messages.deviceName)}
        </label>
        <Input
          id={inputId}
          autoFocus
          value={value}
          maxLength={200}
          placeholder={intl.formatMessage(messages.deviceName)}
          disabled={saving}
          className="v2-device-rename__input"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              cancel();
            }
          }}
        />
        <div className="v2-device-rename__actions">
          <Button type="submit" variant="primary" size="md" disabled={saving}>
            {intl.formatMessage(saving ? messages.saving : messages.save)}
          </Button>
          <Button size="md" disabled={saving} onClick={cancel}>
            {intl.formatMessage(messages.cancel)}
          </Button>
        </div>
      </form>
    );
  }

  const named = !!device.description;
  return (
    <div className="v2-device-name">
      <h1 className="v2-device-name__h">{named ? device.description : device.number}</h1>
      {canRename ? (
        <IconButton
          ref={pencilRef}
          size="md"
          className="v2-device-name__edit"
          label={intl.formatMessage(named ? messages.renameDevice : messages.addName)}
          title={intl.formatMessage(named ? messages.renameThisDevice : messages.addNameTitle)}
          onClick={() => setEditing(true)}
        >
          <IconPencil size={15} />
        </IconButton>
      ) : null}
    </div>
  );
}

/* ===============================================================================================================
   Page
   =============================================================================================================== */

/**
 * Device detail, left-rail layout with a tabbed panel. Classic: pages/DeviceDetailPage.tsx. The
 * page loads and polls the device; its tabs and rail groups are the registry's `device.tab` and `device.railGroup`
 * contributions, core's (ext/core/device.tsx) and extensions' alike, which read it through `useDevice()`.
 */
export function DeviceDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const intl = useIntl();
  const now = useNow(30_000);
  const tabsId = useId();
  // What the role may change (ext/core/access.ts); the reads stay for everyone.
  const canEdit = usePermission(CORE_ACTION_ACCESS.editDevices);
  const canRename = usePermission(CORE_ACTION_ACCESS.renameDevice);

  const [device, setDevice] = useState<DeviceView | null>(null);
  const [configs, setConfigs] = useState<Record<string, ConfigurationLookup>>({});
  const [loading, setLoading] = useState(true);
  // Why no device shows: not found, the server can't be reached, or the load failed.
  const [error, setError] = useState<'notFound' | 'unreachable' | 'failed' | null>(null);

  const [tele, setTele] = useState<TelemetrySnapshot | null>(null);
  const [teleLoaded, setTeleLoaded] = useState(false);
  const [ds, setDs] = useState<DeviceState | null>(null);
  const [dsLoaded, setDsLoaded] = useState(false);
  const [cfgStatus, setCfgStatus] = useState<ConfigStatus | null>(null);
  const [cfgLoaded, setCfgLoaded] = useState(false);
  const [history, setHistory] = useState<CommandHistoryItem[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [events, setEvents] = useState<DeviceEvent[]>([]);
  const [eventsLoaded, setEventsLoaded] = useState(false);
  const [fixes, setFixes] = useState<LocationFix[] | null>(null);
  const [fixesError, setFixesError] = useState<string | null>(null);
  const [fixesLoading, setFixesLoading] = useState(false);
  // The Location tab's time range, in hours (0: All). The rail shows the newest fix any load found, so a range with
  // no fix in it doesn't blank the device's location there.
  const [fixesRange, setFixesRange] = useState(0);
  const [latestFix, setLatestFix] = useState<LocationFix | null>(null);
  const [configuration, setConfiguration] = useState<Configuration | null>(null);
  const [configurationError, setConfigurationError] = useState<string | null>(null);
  // The configuration's assigned apps, loaded when its kiosk mode is on (the configured kiosk is built from them).
  const [cfgApps, setCfgApps] = useState<ConfigApp[] | null>(null);
  const [cfgAppsError, setCfgAppsError] = useState<string | null>(null);
  const [cfgAppsAttempt, setCfgAppsAttempt] = useState(0);
  // kiosk.enter command ids this browser sent as the configured kiosk (the history can't tell them from a custom one).
  const [configuredIds, setConfiguredIds] = useState<Set<string>>(() => new Set());
  const [library, setLibrary] = useState<Application[] | null>(null);

  const deviceTabs = useDeviceTabs();
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<CommandTemplateExt | null>(null);
  const [kioskOpen, setKioskOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  // Each opening of a dialog gets a fresh one (its own inputs); a closed one stays mounted until the next, so it can
  // animate out. The sticky values keep its content while it does.
  const [dialogSeq, setDialogSeq] = useState(0);
  // The custom kiosk dialog loads the library and the theme when it mounts: it mounts on its own openings only.
  const [kioskSeq, setKioskSeq] = useState(0);
  const shownDialog = useStickyValue(dialog);
  const [powerRequested, setPowerRequested] = useState<string | null>(null);
  const [locationRequested, setLocationRequested] = useState<string | null>(null);

  /* ---- device lookup ---- */
  // The route param is the device number (every link in the console uses it) or, from old links, the database id.
  // An exact number match always wins; the id is tried only when no device has that number, and a substring match
  // is never taken (a device numbered "12" must not open the one whose id is 12, or "WH-12" for "12").
  // An old link moves to the number route with its query and hash kept. They are read through a ref, so opening a
  // tab (`?tab=`) does not load the device again.
  const queryRef = useRef('');
  useEffect(() => {
    queryRef.current = location.search + location.hash;
  }, [location.search, location.hash]);
  const loadSeq = useRef(0);
  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    const current = () => seq === loadSeq.current;
    let redirected = false;
    /** Found by database id (an old link), not by number. */
    let byId = false;
    setLoading(true);
    setError(null);
    setDevice(null);
    try {
      // The exact lookup decides; the narrow search supplies the configuration names and the list's richer row.
      const [lookupResult, res] = await Promise.all([
        getDeviceByNumber(id).then(
          (d) => ({ ok: true as const, d }),
          (e: unknown) => ({ ok: false as const, e }),
        ),
        searchDevices({ value: id, pageSize: 100 }),
      ]);
      if (!lookupResult.ok && lookupResult.e instanceof ApiError && lookupResult.e.httpStatus === 0) throw lookupResult.e;
      const exact = lookupResult.ok ? lookupResult.d : null;
      const row = (res.devices?.items ?? []).find((d) => d.number === id);
      let found: DeviceView | null = row && (!exact || exact.id === row.id) ? row : exact ?? row ?? null;
      let lookup = res.configurations ?? {};
      // The lookup failed and the search has no exact row: whether a device has this number is unknown, so the id
      // is never tried (it could open, and act on, a different device).
      if (!found && !lookupResult.ok) throw lookupResult.e;
      if (!found && /^[1-9]\d{0,9}$/.test(id)) {
        const all = await searchDevices({ pageSize: 1000 });
        const items = all.devices?.items ?? [];
        found = items.find((d) => d.number === id) ?? null;
        if (!found) {
          found = items.find((d) => d.id === Number(id)) ?? null;
          byId = found != null;
        }
        lookup = { ...lookup, ...(all.configurations ?? {}) };
      }
      if (!current()) return;
      if (found && byId) {
        // An old id-style link: show the device under its number, so the URL names what is open (and a bookmark
        // made now keeps working). Stay on the spinner until the number route loads.
        redirected = true;
        navigate(paths.device(found.number) + queryRef.current, { replace: true });
        return;
      }
      setConfigs(lookup);
      setDevice(found);
      if (!found) setError('notFound');
    } catch (err) {
      if (!current()) return;
      setDevice(null);
      setError(err instanceof ApiError && err.httpStatus === 0 ? 'unreachable' : 'failed');
    } finally {
      if (current() && !redirected) setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => {
    void load();
  }, [load]);

  const number = device?.number;

  const fixesSeq = useRef(0);
  // A different device: forget the previous one's data (and drop its answers still in flight).
  useEffect(() => {
    fixesSeq.current++;
    setTele(null);
    setTeleLoaded(false);
    setDs(null);
    setDsLoaded(false);
    setCfgStatus(null);
    setCfgLoaded(false);
    setHistory([]);
    setHistoryLoaded(false);
    setEvents([]);
    setEventsLoaded(false);
    setFixes(null);
    setFixesError(null);
    setFixesLoading(false);
    setFixesRange(0);
    setLatestFix(null);
    setPowerRequested(null);
    setLocationRequested(null);
    setDialog(null);
    setKioskOpen(false);
    setReturnOpen(false);
    setConfiguredIds(number ? configuredKioskIds(number) : new Set());
  }, [number]);

  /* ---- polling: state, telemetry, config status, command history, events ----
     Self-scheduling and never overlapping; every answer is dropped once the page shows another device. A refresh
     (after an action) runs the next round now, or right after the one in flight. Paused while the tab is hidden. */
  const kickRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    if (!number) return;
    let on = true;
    let running = false;
    let again = false;
    let t: ReturnType<typeof setTimeout> | undefined;
    const run = async () => {
      running = true;
      clearTimeout(t);
      await Promise.all([
        getTelemetry(number)
          .then((v) => {
            if (!on) return;
            // A snapshot that isn't an object counts as none (nothing below may read fields off a string).
            setTele(v && typeof v === 'object' && !Array.isArray(v) ? v : null);
            setTeleLoaded(true);
          })
          .catch(() => undefined),
        getDeviceState(number)
          .then((v) => {
            if (!on) return;
            setDs(v);
            setDsLoaded(true);
          })
          .catch(() => undefined),
        getConfigStatus(number)
          .then((v) => {
            if (!on) return;
            setCfgStatus(v);
            setCfgLoaded(true);
          })
          .catch(() => undefined),
        listCommandHistory(number)
          .then((v) => {
            if (!on) return;
            setHistory(Array.isArray(v) ? v : []);
            setHistoryLoaded(true);
          })
          .catch(() => undefined),
        getEvents(number)
          .then((v) => {
            if (!on) return;
            setEvents(Array.isArray(v) ? v : []);
            setEventsLoaded(true);
          })
          .catch(() => undefined),
      ]);
      running = false;
      if (!on) return;
      if (again) {
        again = false;
        void run();
      } else if (!document.hidden) {
        t = setTimeout(() => void run(), POLL_MS);
      }
    };
    const kick = () => {
      if (!on) return;
      if (running) again = true;
      else void run();
    };
    const onVisibility = () => {
      if (!document.hidden && !running) {
        clearTimeout(t);
        void run();
      }
    };
    kickRef.current = kick;
    document.addEventListener('visibilitychange', onVisibility);
    void run();
    return () => {
      on = false;
      clearTimeout(t);
      document.removeEventListener('visibilitychange', onVisibility);
      kickRef.current = () => undefined;
    };
  }, [number]);
  const refresh = useCallback(() => kickRef.current(), []);

  /* ---- location history: reloaded on every new state report, and on demand ---- */
  const loadFixes = useCallback(async () => {
    if (!number) return;
    const seq = ++fixesSeq.current;
    const current = () => seq === fixesSeq.current;
    setFixesLoading(true);
    setFixesError(null);
    try {
      const list = cleanFixes(await listLocations(number, locationSince(fixesRange, Date.now())));
      if (!current()) return;
      setFixes(list);
      // A range runs up to now, so a non-empty answer starts with the device's newest fix.
      if (list[0]) setLatestFix(list[0]);
    } catch (e) {
      if (current()) setFixesError(apiErrorText(intl, e) || intl.formatMessage(messages.locationsFailed));
    } finally {
      if (current()) setFixesLoading(false);
    }
  }, [number, fixesRange, intl]);

  useEffect(() => {
    void loadFixes();
  }, [loadFixes, ds?.updatedAt]);

  // Another range: say it is loading rather than show the last range's fixes under the new one's name.
  const changeFixesRange = (hours: number) => {
    if (hours === fixesRange) return;
    setFixesRange(hours);
    setFixes(null);
  };

  /* ---- the configuration (location tracking mode) ---- */
  const configurationId = device?.configurationId;
  useEffect(() => {
    setConfiguration(null);
    setConfigurationError(null);
    if (configurationId == null) return;
    let active = true;
    let t: ReturnType<typeof setTimeout> | undefined;
    // Retried until it loads: the Do-not-track lock and the configured kiosk below depend on it.
    const fetchConfiguration = () =>
      getConfiguration(configurationId)
        .then((c) => {
          if (!active) return;
          setConfiguration(c);
          setConfigurationError(null);
        })
        .catch((e: unknown) => {
          if (!active) return;
          setConfigurationError(apiErrorText(intl, e) || intl.formatMessage(messages.requestFailed));
          t = setTimeout(fetchConfiguration, 15_000);
        });
    void fetchConfiguration();
    return () => {
      active = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configurationId]);

  const kioskConfigured = configuration?.kioskMode === true;
  useEffect(() => {
    setCfgApps(null);
    setCfgAppsError(null);
    if (configurationId == null || !kioskConfigured) return;
    let active = true;
    getConfigurationApps(configurationId)
      .then((apps) => {
        if (active) setCfgApps(Array.isArray(apps) ? apps : []);
      })
      .catch((e: unknown) => {
        if (active) setCfgAppsError(apiErrorText(intl, e) || intl.formatMessage(messages.requestFailed));
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configurationId, kioskConfigured, cfgAppsAttempt]);

  // Same rule as useDoNotTrack: unset counts as Do not track; null while unknown.
  const doNotTrack: boolean | null =
    configurationId == null || !configuration
      ? null
      : ((configuration.requestUpdates as string | undefined) ?? 'DONOTTRACK') === 'DONOTTRACK';

  /* ---- the kiosk app's name, from the library, while kiosk runs ---- */
  const dyn = teleObj(tele?.dynamic);
  const foreground = teleStr(dyn.foregroundApp);
  const kioskRunning = ds?.kioskActive === true;
  useEffect(() => {
    if (!kioskRunning || !foreground || library) return;
    let active = true;
    listApplications()
      .then((l) => {
        if (active) setLibrary(l);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [kioskRunning, foreground, library]);

  // A requested connection mode stops being "pending" once the device reports it.
  useEffect(() => {
    if (powerRequested && ds?.powerMode === powerRequested) setPowerRequested(null);
  }, [ds?.powerMode, powerRequested]);

  /* ---- document title ---- */
  // A device that can't be shown still names the page (2.4.2).
  const docName = device
    ? device.description || device.number
    : error
      ? intl.formatMessage(messages.documentName, { id })
      : null;
  useEffect(() => {
    if (!docName) return;
    const prev = document.title;
    document.title = `${docName} · MDMesh`;
    return () => {
      document.title = prev;
    };
  }, [docName]);

  /* ---- actions ---- */
  async function syncNow() {
    if (!number) return;
    setBusy(true);
    try {
      const { connected } = await forceSync(number);
      refresh();
      if (connected === false) toast.push('warn', ...notConnected(number, 'sync', intl));
      else toast.push('ok', intl.formatMessage(messages.syncRequested), '');
    } catch (e) {
      toast.push('err', intl.formatMessage(messages.syncFailed), apiErrorText(intl, e));
    } finally {
      setBusy(false);
    }
  }

  /**
   * Retry apply: the server queues the configuration now (an automatic retry after a failure waits an hour) and wakes
   * the device. Says what happened when nothing was sent: already on its way, already applied, or no live connection.
   */
  async function retryApply() {
    if (!number) return;
    setBusy(true);
    try {
      const { result, connected } = await retryConfigApply(number);
      refresh();
      if (result === 'inSync') {
        toast.push('ok', intl.formatMessage(messages.alreadyApplied), intl.formatMessage(messages.alreadyAppliedText));
      } else if (result === 'unsupported' || result === 'noConfiguration') {
        toast.push(
          'warn',
          intl.formatMessage(messages.notSent),
          intl.formatMessage(result === 'unsupported' ? messages.agentTooOld : messages.noConfiguration),
        );
      } else if (connected === false) toast.push('warn', ...notConnected(number, 'command', intl));
      else {
        toast.push(
          'ok',
          intl.formatMessage(messages.configSentAgain),
          result === 'alreadyQueued' ? intl.formatMessage(messages.configAlreadyQueued) : '',
        );
      }
    } catch (e) {
      toast.push('err', intl.formatMessage(messages.retryFailed), formatCommandError(intl, e));
    } finally {
      setBusy(false);
    }
  }

  async function installConfigApps() {
    if (!number) return;
    setBusy(true);
    try {
      const res = await syncConfigApps(number);
      toast.push(
        'ok',
        intl.formatMessage(messages.installAppsQueued),
        intl.formatMessage(messages.installAppsQueuedText, { count: res.queued }),
      );
      refresh();
    } catch (e) {
      toast.push('err', intl.formatMessage(messages.installAppsFailed), formatCommandError(intl, e));
    } finally {
      setBusy(false);
    }
  }

  /**
   * Queue a command, toast the outcome, nudge the device and refresh. Resolves to whether it was queued. `onQueued`
   * runs as soon as the server has the command, before the nudge, which can take a while.
   */
  const queue = useCallback(
    async (
      label: string,
      request: () => QueueCommandRequest,
      onQueued?: (cmdId: number | string | undefined) => void,
    ): Promise<boolean> => {
      if (!number) return false;
      try {
        const res = await queueCommand(number, request());
        const cmdId = (res?.id as number | string | undefined) ?? '';
        toast.push(
          'ok',
          intl.formatMessage(messages.commandQueued, { label }),
          cmdId ? intl.formatMessage(messages.commandId, { id: cmdId }) : '',
        );
        onQueued?.(res?.id);
        const nudge = await forceSync(number).catch(() => undefined); // nudge the device
        if (nudge?.connected === false) toast.push('warn', ...notConnected(number, 'command', intl));
        refresh();
        return true;
      } catch (e) {
        toast.push('err', intl.formatMessage(messages.commandFailed, { label }), formatCommandError(intl, e));
        return false;
      }
    },
    [number, toast, refresh, intl],
  );

  /**
   * One of the page's own commands: its actions are greyed out until the nudge is done; its dialog closes, and a mode
   * it requests shows pending, as soon as it is queued.
   */
  async function send(t: CommandTemplateExt, values: Record<string, string> = {}) {
    setBusy(true);
    try {
      await queue(
        formatActionTemplate(intl, t).label,
        () => (t.build ? t.build(values) : t.request),
        () => {
          if (t.key === 'power-always' || t.key === 'power-adaptive') {
            setPowerRequested(t.key === 'power-always' ? 'alwaysOn' : 'adaptive');
          }
          if (t.key === 'location-active' || t.key === 'location-passive') {
            setLocationRequested(t.key === 'location-active' ? 'active' : 'passive');
          }
          setDialog(null);
        },
      );
    } finally {
      setBusy(false);
    }
  }

  // An extension's command goes through `queue` alone: it never greys out the page's actions (the tab shows its own
  // progress), and whatever else the object carries (a `key`) cannot make it pass for one of the page's commands.
  const sendCommand = useCallback(
    (c: DeviceCommand, values: Record<string, string> = {}) => queue(c.label, () => commandRequest(c, values)),
    [queue],
  );

  const appScan = useAppScan(number, history, queue);

  function openKiosk() {
    setKioskSeq((n) => n + 1);
    setKioskOpen(true);
  }

  function runAction(t: CommandTemplateExt) {
    if (t.key === 'kiosk-enter') {
      openKiosk();
      return;
    }
    if ((t.params && t.params.length > 0) || t.confirm) {
      setDialogSeq((n) => n + 1);
      setDialog(t);
      return;
    }
    void send(t, {});
  }

  /* ---- derived ---- */
  const hw = teleObj(tele?.hardware);
  const idn = teleObj(tele?.identity);
  const sec = teleObj(tele?.security);
  const topTele = teleObj(tele);

  const verdict = summarizeStatus(cfgStatus);
  const issue = cfgLoaded ? issueKind(verdict) : null;
  // Last contact: the device row's lastUpdate (loaded once) or the polled state report, whichever is newer, so a
  // device that keeps reporting doesn't turn Offline while the page stays open.
  const lastSeen = Math.max(validTime(device?.lastUpdate) ?? 0, validTime(ds?.updatedAt) ?? 0) || undefined;
  const presence = device ? presenceOf(lastSeen, issue !== null, now, device.wipedAt) : 'offline';
  // It erased itself, so no command reaches it: the page's own ones are greyed out (extensions' tabs decide theirs).
  const wiped = presence === 'wiped';

  const kind = deriveDeviceKind({
    ...kindInputFromTelemetry(tele),
    kioskMode: device?.kioskMode,
    kioskActive: ds?.kioskActive,
    name: device?.description,
  });
  const storedConfigName =
    device?.configurationId != null
      ? configs[String(device.configurationId)]?.name ??
        (configuration?.id === device.configurationId ? configuration.name : undefined)
      : undefined;
  // Shown in the console's language for a seeded configuration (seededConfigs), as typed otherwise.
  const configName =
    storedConfigName != null ? shownConfigName(intl, { id: device?.configurationId, name: storedConfigName }) : undefined;

  const counts24h = useMemo(() => {
    const since = now - DAY;
    return events.filter((e) => e.ts >= since).length + history.filter((c) => (c.createdAt ?? 0) >= since).length;
  }, [events, history, now]);

  // Location mode: the agent doesn't report it. The configuration sets it on config.apply, so it is known
  // only while no device-level change was ever sent; a change sent from this page is shown as requested.
  const hasLocationCommand = history.some((c) => c.type === 'device.locationMode');
  const requestUpdates = configuration?.requestUpdates as string | undefined;
  const configLocationMode = requestUpdates === 'GPS' ? 'active' : requestUpdates === 'WIFI' ? 'passive' : undefined;
  const locationMode = locationRequested ?? (hasLocationCommand ? undefined : configLocationMode);
  const powerShown = powerRequested ?? ds?.powerMode ?? undefined;
  // The configuration's Connectivity is applied again at every config.apply, restart and agent update.
  const connectivityMode = configuration?.connectivityMode as string | undefined;
  const configPowerMode = connectivityMode === 'alwaysOn' || connectivityMode === 'adaptive' ? connectivityMode : undefined;

  /* ---- the configured kiosk ("Return to configured kiosk") ---- */
  const kiosk = useMemo(
    () => (configuration && cfgApps ? configuredKiosk(configuration, cfgApps) : null),
    [configuration, cfgApps],
  );
  const kioskState = configuredKioskState({
    history,
    kioskActive: ds?.kioskActive,
    inSync: cfgStatus?.inSync,
    kioskGeneration: ds?.kioskGeneration,
    kioskReturnGeneration: ds?.kioskReturnGeneration,
    configuredIds,
  });
  const cfgStart = configName ?? intl.formatMessage(messages.itsConfigurationStart);
  const cfgMid = configName ?? intl.formatMessage(messages.itsConfigurationMid);
  const openReturn = () => {
    setDialogSeq((n) => n + 1);
    setReturnOpen(true);
  };
  const shownKiosk = useStickyValue(returnOpen ? kiosk : null);
  let kioskReturn: KioskReturnOffer;
  if (configurationId == null) {
    kioskReturn = { offered: false, onReturn: openReturn, hint: intl.formatMessage(messages.noConfigHint) };
  } else if (!configuration) {
    kioskReturn = {
      offered: false,
      onReturn: openReturn,
      hint: configurationError
        ? intl.formatMessage(messages.configLoadFailed, { name: cfgMid, error: configurationError })
        : undefined,
    };
  } else if (configuration.kioskMode !== true) {
    kioskReturn = {
      offered: false,
      onReturn: openReturn,
      hint: intl.formatMessage(messages.noKioskMode, { name: cfgStart }),
    };
  } else if (cfgAppsError) {
    kioskReturn = {
      offered: true,
      disabled: true,
      onReturn: openReturn,
      hint: (
        <>
          {intl.formatMessage(messages.appsLoadFailed, { name: cfgMid, error: cfgAppsError })}{' '}
          <LinkButton onClick={() => setCfgAppsAttempt((n) => n + 1)}>{intl.formatMessage(messages.retry)}</LinkButton>
        </>
      ),
    };
  } else if (!kiosk) {
    kioskReturn = { offered: true, disabled: true, onReturn: openReturn, hint: intl.formatMessage(messages.loadingKiosk, { name: cfgMid }) };
  } else if (kiosk.apps.length === 0) {
    kioskReturn = {
      offered: true,
      disabled: true,
      onReturn: openReturn,
      hint: intl.formatMessage(messages.noKioskApps, { name: cfgStart }),
    };
  } else if (kioskState === 'sending') {
    kioskReturn = {
      offered: true,
      disabled: true,
      onReturn: openReturn,
      hint: intl.formatMessage(messages.waitingKiosk, { name: cfgMid }),
    };
  } else if (kioskState === 'active') {
    kioskReturn = {
      offered: true,
      disabled: true,
      onReturn: openReturn,
      hint: intl.formatMessage(messages.alreadyInKiosk, { name: cfgMid }),
    };
  } else {
    kioskReturn = { offered: true, onReturn: openReturn };
  }

  function onReturnQueued(cmdId: number | string | undefined) {
    if (!number) return;
    if (cmdId != null) {
      rememberConfiguredKiosk(number, cmdId);
      setConfiguredIds((prev) => new Set([...prev, String(cmdId)]));
    }
    void forceSync(number) // nudge the device
      .catch(() => undefined)
      .then((nudge) => {
        if (nudge?.connected === false) toast.push('warn', ...notConnected(number, 'command', intl));
        refresh();
      });
  }

  /* ---- states without a device ---- */
  if (loading) {
    return (
      <>
        <Breadcrumb items={[{ label: intl.formatMessage(messages.breadcrumbDevices), to: paths.devices }, { label: id, mono: true }]} />
        {/* The page's own shape at its own size, so nothing moves when the device arrives. */}
        <div className="v2-device-cols" role="status" aria-busy="true">
          <span className="v2-visually-hidden">{intl.formatMessage(messages.loadingDevice)}</span>
          <Card className="v2-device-id">
            <Skeleton width="60%" />
            <Skeleton width="80%" height="var(--lh-page)" />
            <Skeleton width="50%" />
            <Skeleton height="control" />
          </Card>
          <Card className="v2-device-main">
            <SkeletonFacts count={8} />
          </Card>
          <Card className="v2-device-rail">
            <SkeletonFacts count={6} />
          </Card>
        </div>
      </>
    );
  }

  if (!device) {
    return (
      <>
        <Breadcrumb items={[{ label: intl.formatMessage(messages.breadcrumbDevices), to: paths.devices }, { label: id, mono: true }]} />
        <h1 className="v2-visually-hidden">{intl.formatMessage(messages.documentName, { id })}</h1>
        {error && error !== 'notFound' ? (
          <ErrorState
            thing={intl.formatMessage(messages.thisDevice)}
            detail={error === 'unreachable' ? intl.formatMessage(messages.cannotReach) : undefined}
            onRetry={() => void load()}
          />
        ) : (
          <Card role="alert">
            <EmptyState
              title={intl.formatMessage(messages.notFoundTitle)}
              action={
                <ButtonLink to={paths.devices} variant="primary">
                  {intl.formatMessage(messages.goToDevices)}
                </ButtonLink>
              }
            >
              <FormattedMessage {...messages.notFoundText} values={{ id: <span className="v2-mono">{id}</span> }} />
            </EmptyState>
          </Card>
        )}
      </>
    );
  }

  /* ---- rail groups ---- */
  const batteryText =
    ds && typeof ds.battery === 'number' && Number.isFinite(ds.battery) && ds.battery >= 0
      ? intl.formatMessage(messages.railBatteryValue, { pct: Math.round(ds.battery), charging: String(!!ds.charging) })
      : DASH;
  const kioskApp = foreground ? library?.find((a) => a.pkg === foreground)?.name ?? foreground : undefined;
  const kioskText = ds
    ? ds.kioskActive
      ? kioskApp
        ? intl.formatMessage(messages.railKioskRunningApp, { app: kioskApp })
        : intl.formatMessage(messages.railKioskRunning)
      : intl.formatMessage(messages.railKioskOff)
    : DASH;
  const net = networkLabel(teleStr(dyn.networkType), intl);
  const power = powerLabel(ds?.powerMode, intl);
  const connection = net && power ? `${net} · ${power.toLowerCase()}` : net ?? power ?? DASH;

  const statusItems: KeyValueItem[] = [
    { key: 'battery', label: intl.formatMessage(messages.railBattery), value: batteryText },
    {
      key: 'screen',
      label: intl.formatMessage(messages.railScreen),
      value: ds ? intl.formatMessage(ds.locked ? messages.railLocked : messages.railUnlocked) : DASH,
    },
    { key: 'kiosk', label: intl.formatMessage(messages.railKiosk), value: kioskText },
    { key: 'conn', label: intl.formatMessage(messages.railConnection), value: connection },
  ];

  const loc = latestFix
    ? { lat: latestFix.lat, lon: latestFix.lon, accuracyM: latestFix.accuracy, provider: latestFix.provider, capturedAt: latestFix.capturedAt }
    : cleanLocation(dyn.location);
  const fixIso = isoTime(loc?.capturedAt);
  const locationItems: KeyValueItem[] = loc
    ? [
        {
          key: 'coords',
          label: intl.formatMessage(messages.railCoordinates),
          value: `${loc.lat.toFixed(5)}, ${loc.lon.toFixed(5)}`,
          mono: true,
        },
        {
          key: 'acc',
          label: intl.formatMessage(messages.railAccuracy),
          value: loc.accuracyM != null ? fmtAccuracy(loc.accuracyM, intl) : DASH,
        },
        {
          key: 'src',
          label: intl.formatMessage(messages.railSource),
          value: loc.provider ? <span title={loc.provider}>{providerLabel(loc.provider, intl)}</span> : DASH,
        },
        {
          key: 'age',
          label: intl.formatMessage(messages.railFixAge),
          value:
            loc.capturedAt && fixIso ? (
              <time dateTime={fixIso} title={fmtDateTime(loc.capturedAt)}>
                {fmtAge(loc.capturedAt, now, intl)}
              </time>
            ) : (
              DASH
            ),
        },
      ]
    : [
        {
          key: 'none',
          label: intl.formatMessage(messages.railLocation),
          value: intl.formatMessage(doNotTrack ? messages.railNotTracked : messages.railNoFix),
        },
      ];

  const model = teleStr(hw.model);
  const hardwareItems: KeyValueItem[] = [
    { key: 'model', label: intl.formatMessage(messages.railModel), value: model ?? DASH },
    {
      key: 'android',
      label: intl.formatMessage(messages.railAndroid),
      value: teleStr(hw.osRelease) ?? (ds?.androidRelease || undefined) ?? device.androidVersion ?? DASH,
    },
    // The Telemetry tab owns the full hardware and network facts; the rail keeps the identity ones, and the rest
    // only while there is no telemetry to show them.
    ...(tele
      ? []
      : [
          {
            key: 'storage',
            label: intl.formatMessage(messages.railStorage),
            value: fmtStorage(teleNum(hw.totalStorageBytes), teleNum(dyn.freeStorageBytes), intl),
          },
        ]),
    { key: 'serial', label: intl.formatMessage(messages.railSerial), value: teleStr(idn.serial) ?? device.serial ?? DASH, mono: true },
    { key: 'imei', label: intl.formatMessage(messages.railImei), value: teleStr(idn.imei) ?? device.imei ?? DASH, mono: true },
  ];
  // With telemetry, the Telemetry tab shows the IPs; a public IP only the server knows (none in the report) stays here.
  const networkItems: KeyValueItem[] = tele
    ? !teleStr(topTele.publicIp) && device.publicIp
      ? [{ key: 'public', label: intl.formatMessage(messages.railPublicIp), value: device.publicIp, mono: true }]
      : []
    : [
        { key: 'local', label: intl.formatMessage(messages.railLocalIp), value: teleStr(dyn.ipAddress) ?? DASH, mono: true },
        {
          key: 'public',
          label: intl.formatMessage(messages.railPublicIp),
          value: teleStr(topTele.publicIp) ?? device.publicIp ?? DASH,
          mono: true,
        },
      ];
  const deviceOwner = typeof sec.isDeviceOwner === 'boolean' ? sec.isDeviceOwner : undefined;
  const ownerSource = deviceOwner ?? device.mdmMode;
  const managementItems: KeyValueItem[] = [
    { key: 'cfg', label: intl.formatMessage(messages.railConfiguration), value: configName ?? DASH },
    // The agent's own report only: device.launcherVersion is the configuration's main-app version.
    { key: 'agent', label: intl.formatMessage(messages.railAgent), value: ds?.agentVersion || DASH, mono: !!ds?.agentVersion },
    {
      key: 'mdm',
      label: intl.formatMessage(messages.railMdmMode),
      value:
        ownerSource == null
          ? DASH
          : intl.formatMessage(ownerSource ? messages.railDeviceOwner : messages.railNotDeviceOwner),
    },
    {
      key: 'enrolled',
      label: intl.formatMessage(messages.railEnrolled),
      value: device.enrollTime ? fmtDateTime(device.enrollTime) : DASH,
    },
  ];

  const subline = [intl.formatMessage(deviceKindMessages[kind]), makeModel(teleStr(hw.manufacturer), model)].filter(Boolean).join(' · ');
  const reasonText = presence === 'attention' && issue ? intl.formatMessage(ISSUE_REASON_MESSAGES[issue]) : undefined;
  const lastAge = lastSeen ? fmtAge(lastSeen, now) : null;
  const lastIso = isoTime(lastSeen);

  // The device as its tabs and rail groups read it, with core's own tab bodies and rail rows (ext/core/device.tsx).
  const deviceValue = withCoreParts(
    {
      device,
      telemetry: tele,
      telemetryLoaded: teleLoaded,
      state: ds,
      configuration,
      configStatus: cfgStatus,
      now,
      refresh,
      sendCommand,
    },
    {
      tabs: {
        control: (
          <>
            {cfgLoaded ? (
              <ConfigPanel
                status={cfgStatus}
                configName={configName}
                isDeviceOwner={deviceOwner}
                androidSdkInt={teleNum(hw.sdkInt)}
                busy={busy}
                onRetry={canEdit && !wiped ? () => void retryApply() : undefined}
                now={now}
                events={events}
              />
            ) : null}
            {cfgLoaded && cfgStatus?.kioskBackgroundImage ? (
              <DeviceKioskBackground
                image={cfgStatus.kioskBackgroundImage}
                configurationId={cfgStatus.configurationId}
                configName={configName}
              />
            ) : null}
            {canEdit ? (
              <RemoteActions
                busy={busy || wiped}
                onAction={runAction}
                onEnterKiosk={openKiosk}
                kioskReturn={kioskReturn}
                onInstallConfigApps={() => void installConfigApps()}
                powerMode={powerShown}
                powerPending={!!powerRequested && ds?.powerMode !== powerRequested}
                configPowerMode={configPowerMode}
                locationMode={locationMode}
                locationPending={!!locationRequested}
                locationUnknown={!locationRequested && hasLocationCommand}
                doNotTrack={doNotTrack}
                agentVersion={ds?.agentVersion}
              />
            ) : null}
            {/* Activity owns the command history (I12); a quiet way there. */}
            <div className="v2-device-allact">
              <LinkButton tone="quiet" onClick={() => deviceTabs.select('activity')}>
                {intl.formatMessage(messages.viewAllActivity)}
              </LinkButton>
            </div>
          </>
        ),
        telemetry: <TelemetryTab telemetry={tele} loaded={teleLoaded} reportedAt={ds?.updatedAt} />,
        apps: <AppsTab number={device.number} history={history} loaded={historyLoaded} scan={canEdit && !wiped ? appScan : undefined} />,
        activity: (
          <ActivityTab events={events} eventsLoaded={eventsLoaded} commands={history} commandsLoaded={historyLoaded} now={now} />
        ),
        location: (
          <LocationTab
            fixes={fixes}
            error={fixesError}
            doNotTrack={doNotTrack}
            refreshing={fixesLoading}
            onRefresh={() => void loadFixes()}
            range={fixesRange}
            onRangeChange={changeFixesRange}
          />
        ),
      },
      rail: {
        status: statusItems,
        location: locationItems,
        hardware: hardwareItems,
        network: networkItems,
        management: managementItems,
      },
      activityCount: counts24h > 0 ? String(counts24h) : undefined,
    },
  );

  return (
    <DeviceProvider value={deviceValue}>
      <Breadcrumb items={[{ label: intl.formatMessage(messages.breadcrumbDevices), to: paths.devices }, { label: device.number, mono: true }]} />

      {device.wipedAt != null ? (
        <Callout tone="info">
          <FormattedMessage
            {...messages.wipedNotice}
            values={{
              when: <time dateTime={isoTime(device.wipedAt)}>{fmtDateTime(device.wipedAt)}</time>,
              link: (chunks) => <Link to={`${paths.devices}?status=wiped`}>{chunks}</Link>,
            }}
          />
        </Callout>
      ) : null}

      {/* Left: the identity card (status, name, quick actions) over the facts rail; right: the tabs. In the document
          (and on phones) the order is identity, tabs, facts. */}
      <div className="v2-device-cols">
        <div className="v2-card v2-card--pad-default v2-device-id">
          <div className="v2-device-id__top">
            <span className="v2-device-presence">
              <Tooltip content={reasonText}>
                <span>
                  <StatusText variant="meta" status={presence} />
                </span>
              </Tooltip>
              {reasonText ? <span className="v2-visually-hidden">: {reasonText}</span> : null}
              <span aria-hidden="true">·</span>
              <span>
                {lastSeen && lastAge && lastIso ? (
                  <FormattedMessage
                    {...messages.checkedIn}
                    values={{
                      when: (
                        <time dateTime={lastIso} title={fmtDateTime(lastSeen)}>
                          {formatRelativeIntl(intl, lastSeen, now, 'short')}
                        </time>
                      ),
                    }}
                  />
                ) : (
                  intl.formatMessage(messages.neverCheckedIn)
                )}
              </span>
            </span>
            <DeviceTile kind={kind} tile={40} title={intl.formatMessage(deviceKindMessages[kind])} className="v2-device-id__tile" />
          </div>
          <div className="v2-device-id__name">
            <DeviceName
              device={device}
              canRename={canRename}
              onSaved={(desc) => setDevice((d) => (d ? { ...d, description: desc } : d))}
            />
            <span className="v2-device-id__sub">
              {/* The number is always here: the name above replaces it once the device has one. */}
              {device.description ? (
                <>
                  <span className="v2-device-id__num">{device.number}</span>
                  {subline ? <span aria-hidden="true"> · </span> : null}
                </>
              ) : null}
              {subline}
            </span>
          </div>
          {canEdit ? (
            <div role="toolbar" aria-label={intl.formatMessage(messages.quickActions)} className="v2-device-id__actions">
              <Button
                variant="primary"
                icon={<IconSync />}
                className="v2-device-id__sync"
                disabled={busy || wiped}
                onClick={() => void syncNow()}
              >
                {intl.formatMessage(messages.syncNow)}
              </Button>
              <Tooltip content={formatActionTemplate(intl, TEMPLATE.lock).description}>
                <Button icon={<IconLock />} disabled={busy || wiped} onClick={() => runAction(TEMPLATE.lock)}>
                  {intl.formatMessage(messages.lock)}
                </Button>
              </Tooltip>
              <Menu
                label={intl.formatMessage(messages.moreActions)}
                iconSize="md"
                disabled={busy || wiped}
                items={[
                  { key: 'ring', label: intl.formatMessage(messages.ring), icon: <IconRing />, onSelect: () => runAction(TEMPLATE.ring) },
                  { key: 'alert', label: intl.formatMessage(messages.sendAlert), icon: <IconAlert />, onSelect: () => runAction(TEMPLATE.alert) },
                  {
                    key: 'lsm',
                    label: intl.formatMessage(messages.lockScreenMessage),
                    icon: <IconScreenMessage />,
                    onSelect: () => runAction(TEMPLATE['lockscreen-message']),
                  },
                  'separator',
                  {
                    key: 'apps',
                    label: intl.formatMessage(messages.installConfigApps),
                    icon: <IconDownload size={16} />,
                    onSelect: () => void installConfigApps(),
                  },
                  { key: 'reboot', label: intl.formatMessage(messages.reboot), icon: <IconPower />, onSelect: () => runAction(TEMPLATE.reboot) },
                ]}
              />
            </div>
          ) : null}
        </div>
        <div className="v2-device-main">
          <DeviceTabs {...deviceTabs} idBase={tabsId} />
        </div>
        <aside aria-label={intl.formatMessage(messages.railLabel)} className="v2-card v2-card--pad-default v2-device-rail">
          <DeviceRailGroups />
          {loc ? (
            <a
              className="v2-device-maps"
              href={`https://www.google.com/maps?q=${loc.lat},${loc.lon}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {intl.formatMessage(messages.openInMaps)}
              <span className="v2-visually-hidden"> {intl.formatMessage(messages.opensInNewTab)}</span>
            </a>
          ) : null}
        </aside>
      </div>

      {shownDialog ? (
        <ActionDialog
          key={`${shownDialog.key}-${dialogSeq}`}
          open={dialog != null}
          template={shownDialog}
          device={device}
          busy={busy}
          onCancel={() => setDialog(null)}
          onSend={(values) => {
            if (dialog) void send(dialog, values);
          }}
        />
      ) : null}
      {kioskSeq > 0 ? (
        <DeviceKioskDialog
          key={kioskSeq}
          open={kioskOpen}
          device={device}
          configName={configName}
          onClose={() => setKioskOpen(false)}
          onQueued={refresh}
        />
      ) : null}
      {shownKiosk ? (
        <ConfiguredKioskDialog
          key={`return-${dialogSeq}`}
          open={returnOpen && kiosk != null}
          device={device}
          configName={cfgMid}
          kiosk={shownKiosk}
          history={history}
          agentVersion={ds?.agentVersion}
          agentReported={!dsLoaded || ds != null}
          onClose={() => setReturnOpen(false)}
          onQueued={onReturnQueued}
        />
      ) : null}
    </DeviceProvider>
  );
}
