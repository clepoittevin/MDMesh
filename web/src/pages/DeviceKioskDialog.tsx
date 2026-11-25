import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { scanApps, fetchIcons, getLatestScan, type AppInfo } from '../api/deviceApps';
import { listApplications, appCategory, type Application } from '../api/applications';
import { getConfiguration } from '../api/configurations';
import { Link } from 'react-router';
import { FormattedMessage, defineMessages, useIntl, type MessageDescriptor } from 'react-intl';
import { queueCommand, type CommandHistoryItem } from '../api/commands';
import {
  LOCK_VOLUME_AGENT,
  buildKioskPayload,
  cacheIcon,
  cachedIcon,
  configuredKioskCommand,
  configuredKioskSummary,
  EXIT_PIN_HELP,
  EXIT_PIN_PLACEHOLDER,
  kioskTheme,
  NO_PIN_MEANS,
  versionAtLeast,
  type ConfiguredKiosk,
  type KioskTheme,
} from '../data/kiosk';
import { EXIT_PIN_RULE, exitPinValid } from '../data/configurationRules';
import { paths } from '../routes';
import { fmtDateTime } from '../ui/format';
import {
  Badge,
  Button,
  Callout,
  Checkbox,
  Field,
  IconWarning,
  Input,
  KeyValueList,
  Modal,
  SearchInput,
  Segmented,
  Select,
  SkeletonRows,
  Tooltip,
  useToast,
} from '../ui';
import { DialogTarget } from './DeviceDetailControl';

type Mode = 'launcher' | 'single';
type Source = 'library' | 'device';
type ExitMode = 'gesture' | 'visible' | 'remote';

/** A row in either source, normalised so the list renders the same way. */
interface PickItem {
  pkg: string;
  label: string;
  iconUrl?: string;
  system: boolean;
  badge?: string;
}

const messagesRaw = defineMessages({
  categoryUploaded: { id: 'deviceKiosk.category.uploaded', defaultMessage: 'Uploaded' },
  categorySystem: { id: 'deviceKiosk.category.system', defaultMessage: 'System' },
  categoryWeb: { id: 'deviceKiosk.category.web', defaultMessage: 'Web app' },
  themeError: {
    id: 'deviceKiosk.themeError',
    defaultMessage: 'Could not load the configuration theme; the kiosk will use the default look.',
  },
  libraryFailed: { id: 'deviceKiosk.libraryFailed', defaultMessage: 'Failed to load library' },
  noAppsReported: {
    id: 'deviceKiosk.noAppsReported',
    defaultMessage: 'The device reported no apps. Give it a moment after an update, then retry.',
  },
  scanFailed: { id: 'deviceKiosk.scanFailed', defaultMessage: 'Scan failed' },
  iconFetchFailed: { id: 'deviceKiosk.iconFetchFailed', defaultMessage: 'Icon fetch failed' },
  queuedTitle: { id: 'deviceKiosk.queuedTitle', defaultMessage: 'Custom kiosk queued' },
  queuedBody: { id: 'deviceKiosk.queuedBody', defaultMessage: '{count, plural, one {# app} other {# apps}}' },
  failedTitle: { id: 'deviceKiosk.failedTitle', defaultMessage: 'Custom kiosk failed' },
  title: { id: 'deviceKiosk.title', defaultMessage: 'Custom kiosk' },
  description: {
    id: 'deviceKiosk.description',
    defaultMessage: 'A one-time kiosk with apps you pick now, from your library or from a scan of the device.',
  },
  descriptionNamed: {
    id: 'deviceKiosk.descriptionNamed',
    defaultMessage:
      'A one-time kiosk with apps you pick now, from your library or from a scan of the device. {name} doesn’t define it.',
  },
  itsConfiguration: { id: 'deviceKiosk.itsConfiguration', defaultMessage: 'Its configuration' },
  cancel: { id: 'deviceKiosk.cancel', defaultMessage: 'Cancel' },
  sending: { id: 'deviceKiosk.sending', defaultMessage: 'Sending…' },
  enterKioskWithApps: {
    id: 'deviceKiosk.enterKioskWithApps',
    defaultMessage: 'Enter kiosk with {count, plural, one {# app} other {# apps}}',
  },
  enterKiosk: { id: 'deviceKiosk.enterKiosk', defaultMessage: 'Enter kiosk' },
  loadingTheme: { id: 'deviceKiosk.loadingTheme', defaultMessage: 'Loading the configuration’s launcher look' },
  appsFrom: { id: 'deviceKiosk.appsFrom', defaultMessage: 'Apps from' },
  sourceLibrary: { id: 'deviceKiosk.sourceLibrary', defaultMessage: 'Library' },
  sourceDevice: { id: 'deviceKiosk.sourceDevice', defaultMessage: 'Device apps' },
  kioskLabel: { id: 'deviceKiosk.kioskLabel', defaultMessage: 'Kiosk' },
  modeLauncher: { id: 'deviceKiosk.modeLauncher', defaultMessage: 'Allowed apps (launcher grid)' },
  modeSingle: { id: 'deviceKiosk.modeSingle', defaultMessage: 'Pin a single app' },
  searchLabel: { id: 'deviceKiosk.searchLabel', defaultMessage: 'Search apps' },
  searchPlaceholder: { id: 'deviceKiosk.searchPlaceholder', defaultMessage: 'Search apps…' },
  showSystem: { id: 'deviceKiosk.showSystem', defaultMessage: 'Show system apps' },
  loadingIcons: { id: 'deviceKiosk.loadingIcons', defaultMessage: 'Loading icons…' },
  loadIcons: { id: 'deviceKiosk.loadIcons', defaultMessage: 'Load icons' },
  scanning: { id: 'deviceKiosk.scanning', defaultMessage: 'Scanning…' },
  rescan: { id: 'deviceKiosk.rescan', defaultMessage: 'Re-scan' },
  savedScan: {
    id: 'deviceKiosk.savedScan',
    defaultMessage:
      'Saved scan from {date} · {count, plural, one {# app} other {# apps}}. Re-scan to refresh.',
  },
  unsavedScan: {
    id: 'deviceKiosk.unsavedScan',
    defaultMessage: '{count, plural, one {# app} other {# apps}}. Re-scan to refresh.',
  },
  scanningDevice: { id: 'deviceKiosk.scanningDevice', defaultMessage: 'Scanning device…' },
  scanDeviceApps: { id: 'deviceKiosk.scanDeviceApps', defaultMessage: 'Scan device apps' },
  asking: { id: 'deviceKiosk.asking', defaultMessage: 'Asking the device for its installed apps…' },
  appsGroup: { id: 'deviceKiosk.appsGroup', defaultMessage: 'Apps' },
  loadingLibrary: { id: 'deviceKiosk.loadingLibrary', defaultMessage: 'Loading the library' },
  noMatch: { id: 'deviceKiosk.noMatch', defaultMessage: 'No apps match.' },
  exitMode: { id: 'deviceKiosk.exitMode', defaultMessage: 'Exit mode' },
  exitGesture: { id: 'deviceKiosk.exitGesture', defaultMessage: 'Gesture (7-tap corner)' },
  exitVisible: { id: 'deviceKiosk.exitVisible', defaultMessage: 'Visible button' },
  exitRemote: { id: 'deviceKiosk.exitRemote', defaultMessage: 'Remote only' },
  exitPin: { id: 'deviceKiosk.exitPin', defaultMessage: 'Kiosk exit PIN' },
  exitPinHelp: { id: 'deviceKiosk.exitPinHelp', defaultMessage: '6 to 12 digits' },

  returnTitle: { id: 'deviceKiosk.return.title', defaultMessage: 'Return to configured kiosk?' },
  returnDescription: {
    id: 'deviceKiosk.return.description',
    defaultMessage:
      'Puts the device back into the kiosk that {name} defines: its main app, allowed apps, kiosk options, exit PIN and launcher look.',
  },
  returnButton: { id: 'deviceKiosk.return.button', defaultMessage: 'Return to kiosk' },
  returnQueued: { id: 'deviceKiosk.return.queued', defaultMessage: 'Return to configured kiosk queued' },
  returnQueuedBody: { id: 'deviceKiosk.return.queuedBody', defaultMessage: 'Command {id}' },
  notAccepted: { id: 'deviceKiosk.return.notAccepted', defaultMessage: 'The server didn’t accept the command.' },
  factKiosk: { id: 'deviceKiosk.return.factKiosk', defaultMessage: 'Kiosk' },
  factApps: { id: 'deviceKiosk.return.factApps', defaultMessage: 'Apps' },
  factExit: { id: 'deviceKiosk.return.factExit', defaultMessage: 'Exit' },
  factExitPin: { id: 'deviceKiosk.return.factExitPin', defaultMessage: 'Exit PIN' },
  exitButtonVisible: { id: 'deviceKiosk.return.exitButtonVisible', defaultMessage: 'Visible exit button' },
  exitButtonGesture: {
    id: 'deviceKiosk.return.exitButtonGesture',
    defaultMessage: 'Hidden gesture: 7 taps in the top-right corner',
  },
  pinConfigured: { id: 'deviceKiosk.return.pinConfigured', defaultMessage: 'The configuration’s PIN' },
  pinNone: { id: 'deviceKiosk.return.pinNone', defaultMessage: 'None: {meaning}' },
  mainAppLeftOut: {
    id: 'deviceKiosk.return.mainAppLeftOut',
    defaultMessage:
      'The main app set in {name} isn’t set to Install and shown in kiosk, so this kiosk leaves it out. The configuration’s own kiosk does the same.',
  },
  pinnedMissing: {
    id: 'deviceKiosk.return.pinnedMissing',
    defaultMessage:
      '{app} wasn’t on the device at its last app scan{hasDate, select, true { ({date})} other {}}. Until it is installed, the kiosk shows a launcher grid instead of pinning it. Use Install configuration apps first.',
  },
  listMissing: {
    id: 'deviceKiosk.return.listMissing',
    defaultMessage:
      'Not on the device at its last app scan{hasDate, select, true { ({date})} other {}}: {apps}. The kiosk can’t open an app that isn’t installed. Use Install configuration apps first.',
  },
  oldAgentForVolume: {
    id: 'deviceKiosk.return.oldAgentForVolume',
    defaultMessage:
      'This device runs agent {version}. Agents before {minimum} ignore Lock volume buttons, so the kiosk starts without that lock. <link>Update the agent</link> to apply it.',
  },
  notReported: {
    id: 'deviceKiosk.return.notReported',
    defaultMessage: 'This device hasn’t reported from the MDMesh agent yet. The command waits until it checks in.',
  },
  queueFailed: { id: 'deviceKiosk.return.queueFailed', defaultMessage: 'Couldn’t queue the command: {error}' },
});
const messages: Record<keyof typeof messagesRaw, MessageDescriptor> = messagesRaw;

const CATEGORY_LABEL: Record<string, MessageDescriptor> = {
  uploaded: messages.categoryUploaded,
  system: messages.categorySystem,
  web: messages.categoryWeb,
};

/**
 * Custom kiosk (classic KioskEnterModal on the console's Modal): a one-time kiosk the configuration doesn't define. Pick
 * apps from the library or a scan of the device, choose launcher grid or a single pinned app, the exit mode and an
 * optional exit PIN, then queue `kiosk.enter` with the configuration's launcher theme.
 */
export function DeviceKioskDialog({
  open = true,
  device,
  configName,
  onClose,
  onQueued,
}: {
  /** Kept mounted while closed (with a fresh `key` per opening) so it animates out. */
  open?: boolean;
  device: { number: string; configurationId?: number; description?: string };
  /** The device's configuration, named in the description; undefined when it has none (or it isn't loaded). */
  configName?: string;
  onClose: () => void;
  onQueued: () => void;
}) {
  const toast = useToast();
  const intl = useIntl();
  const ids = useId();
  const [source, setSource] = useState<Source>('library');
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [mode, setMode] = useState<Mode>('launcher');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exitMode, setExitMode] = useState<ExitMode>('gesture');
  const [password, setPassword] = useState('');
  // The PIN's error shows once the field is left, not while the first digits are typed.
  const [pinLeft, setPinLeft] = useState(false);
  const [busy, setBusy] = useState(false);
  const [theme, setTheme] = useState<KioskTheme | undefined>();
  const [themeLoading, setThemeLoading] = useState(device.configurationId != null);
  const [themeError, setThemeError] = useState<string | null>(null);

  const [lib, setLib] = useState<Application[] | null>(null);
  const [libErr, setLibErr] = useState<string | null>(null);

  const [apps, setApps] = useState<AppInfo[] | null>(null);
  const [scannedAt, setScannedAt] = useState<number | null>(null);
  const [scanning, setScanning] = useState(false);
  const [loadedSaved, setLoadedSaved] = useState(false);
  const [scanErr, setScanErr] = useState<string | null>(null);
  const [deviceIcons, setDeviceIcons] = useState<Record<string, string>>({});
  const [loadingIcons, setLoadingIcons] = useState(false);

  // Cancels in-flight scan / icon polls when the dialog closes or unmounts.
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    const ac = new AbortController();
    abortRef.current = ac;
    return () => ac.abort();
  }, []);
  useEffect(() => {
    if (!open) abortRef.current?.abort();
  }, [open]);

  // A manual kiosk action must carry the assigned configuration's theme, or the launcher falls back to black.
  useEffect(() => {
    if (device.configurationId == null) return;
    let cancelled = false;
    getConfiguration(device.configurationId)
      .then((c) => {
        if (!cancelled) setTheme(kioskTheme(c));
      })
      .catch(() => {
        if (!cancelled) setThemeError(intl.formatMessage(messages.themeError));
      })
      .finally(() => {
        if (!cancelled) setThemeLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [device.configurationId]);

  useEffect(() => {
    listApplications()
      .then(setLib)
      .catch((e) => setLibErr(e instanceof Error ? e.message : intl.formatMessage(messages.libraryFailed)));
  }, []);

  function primeFrom(list: AppInfo[]) {
    const primed: Record<string, string> = {};
    for (const a of list) {
      const c = cachedIcon(a.pkg, a.versionCode);
      if (c) primed[a.pkg] = c;
    }
    setDeviceIcons((prev) => ({ ...prev, ...primed }));
  }

  // First visit to Device apps: show the last saved scan (from command history) instead of scanning again.
  useEffect(() => {
    if (source !== 'device' || loadedSaved) return;
    setLoadedSaved(true);
    getLatestScan(device.number)
      .then((snap) => {
        if (snap) {
          primeFrom(snap.apps);
          setApps(snap.apps);
          setScannedAt(snap.scannedAt ?? null);
        }
      })
      .catch(() => undefined);
  }, [source, loadedSaved, device.number]);

  async function scan() {
    setScanning(true);
    setScanErr(null);
    try {
      const list = await scanApps(device.number, abortRef.current?.signal);
      setApps(list);
      setScannedAt(Date.now());
      primeFrom(list);
      if (!list.length) setScanErr(intl.formatMessage(messages.noAppsReported));
    } catch (e) {
      if (abortRef.current?.signal.aborted) return;
      setScanErr(e instanceof Error ? e.message : intl.formatMessage(messages.scanFailed));
    } finally {
      setScanning(false);
    }
  }

  const items: PickItem[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (label: string, pkg: string) => !q || label.toLowerCase().includes(q) || pkg.toLowerCase().includes(q);
    if (source === 'library') {
      // The library is a curated catalogue: all of it, search-filtered, uploaded and web apps first.
      return (lib ?? [])
        .filter((a) => a.pkg)
        .map((a) => ({
          pkg: a.pkg,
          label: a.name || a.pkg,
          iconUrl: a.icon || undefined,
          system: appCategory(a) === 'system',
          badge: appCategory(a),
        }))
        .filter((i) => match(i.label, i.pkg))
        .sort((a, b) => Number(a.system) - Number(b.system) || a.label.localeCompare(b.label));
    }
    // Device scan: launchable apps only (kiosk can't pin anything else); the toggle reveals system apps.
    return (apps ?? [])
      .filter((a) => typeof a.pkg === 'string' && a.pkg && a.launchable !== false)
      .map((a) => ({
        pkg: a.pkg,
        // A scan entry from the device may lack a label (or send a non-string): fall back to the package name.
        label: typeof a.label === 'string' && a.label ? a.label : a.pkg,
        iconUrl: deviceIcons[a.pkg],
        system: !!a.system,
        badge: a.system ? 'system' : undefined,
      }))
      .filter((i) => (showAll || !i.system) && match(i.label, i.pkg));
  }, [source, lib, apps, deviceIcons, query, showAll]);

  async function loadDeviceIcons() {
    if (source !== 'device' || !apps) return;
    const byPkg = new Map(apps.map((a) => [a.pkg, a]));
    const need = items.filter((i) => !deviceIcons[i.pkg]).map((i) => i.pkg);
    if (!need.length) return;
    setLoadingIcons(true);
    try {
      await fetchIcons(
        device.number,
        need,
        (batch) => {
          setDeviceIcons((prev) => ({ ...prev, ...batch }));
          for (const [pkg, url] of Object.entries(batch)) cacheIcon(pkg, byPkg.get(pkg)?.versionCode, url);
        },
        abortRef.current?.signal,
      );
    } catch (e) {
      if (abortRef.current?.signal.aborted) return;
      toast.push('err', intl.formatMessage(messages.iconFetchFailed), e instanceof Error ? e.message : '');
    } finally {
      setLoadingIcons(false);
    }
  }

  function toggle(pkg: string) {
    setSelected((prev) => {
      if (mode === 'single') return new Set(prev.has(pkg) ? [] : [pkg]);
      const next = new Set(prev);
      if (next.has(pkg)) next.delete(pkg);
      else next.add(pkg);
      return next;
    });
  }

  function switchMode(m: Mode) {
    setMode(m);
    if (m === 'single' && selected.size > 1) setSelected(new Set());
  }

  // The configuration's PIN rule: a custom kiosk's PIN is new, so it must follow it.
  const pinError = exitPinValid(password) ? undefined : EXIT_PIN_RULE;
  const canApply =
    !themeLoading && selected.size > 0 && (mode === 'launcher' || selected.size === 1) && pinError == null;

  async function apply() {
    const pkgs = [...selected];
    const payload = buildKioskPayload({ mode, packages: pkgs, exitMode, password }, theme);
    setBusy(true);
    try {
      await queueCommand(device.number, { type: 'kiosk.enter', payload: JSON.stringify(payload) });
      toast.push('ok', intl.formatMessage(messages.queuedTitle), intl.formatMessage(messages.queuedBody, { count: pkgs.length }));
      onQueued();
      onClose();
    } catch (e) {
      toast.push('err', intl.formatMessage(messages.failedTitle), e instanceof Error ? e.message : '');
    } finally {
      setBusy(false);
    }
  }

  const listShown = source === 'library' || apps != null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      dismissOnBackdrop={false}
      title={intl.formatMessage(messages.title)}
      description={
        device.configurationId != null
          ? intl.formatMessage(messages.descriptionNamed, {
              name: configName ?? intl.formatMessage(messages.itsConfiguration),
            })
          : intl.formatMessage(messages.description)
      }
      className="v2-device-kiosk"
      footer={
        <>
          <Button size="lg" disabled={busy} onClick={onClose}>
            {intl.formatMessage(messages.cancel)}
          </Button>
          <Button size="lg" variant="primary" disabled={busy || !canApply} onClick={() => void apply()}>
            {busy
              ? intl.formatMessage(messages.sending)
              : selected.size
                ? intl.formatMessage(messages.enterKioskWithApps, { count: selected.size })
                : intl.formatMessage(messages.enterKiosk)}
          </Button>
        </>
      }
    >
      <div className="v2-device-kiosk__body">
        <DialogTarget device={device} />
        {themeLoading ? (
          <span className="v2-visually-hidden" role="status">
            {intl.formatMessage(messages.loadingTheme)}
          </span>
        ) : null}
        {themeError ? (
          <Callout tone="warn" icon={<IconWarning size={16} />}>
            {themeError}
          </Callout>
        ) : null}

        <div className="v2-device-kiosk__row">
          <span className="v2-device-kiosk__label" id={`${ids}-src`}>
            {intl.formatMessage(messages.appsFrom)}
          </span>
          <Segmented<Source>
            aria-labelledby={`${ids}-src`}
            value={source}
            onChange={setSource}
            options={[
              { value: 'library', label: intl.formatMessage(messages.sourceLibrary) },
              { value: 'device', label: intl.formatMessage(messages.sourceDevice) },
            ]}
          />
        </div>
        <div className="v2-device-kiosk__row">
          <span className="v2-device-kiosk__label" id={`${ids}-mode`}>
            {intl.formatMessage(messages.kioskLabel)}
          </span>
          <Segmented<Mode>
            aria-labelledby={`${ids}-mode`}
            value={mode}
            onChange={switchMode}
            options={[
              { value: 'launcher', label: intl.formatMessage(messages.modeLauncher) },
              { value: 'single', label: intl.formatMessage(messages.modeSingle) },
            ]}
          />
        </div>

        <div className="v2-device-kiosk__toolbar">
          <SearchInput
            className="v2-device-kiosk__search"
            aria-label={intl.formatMessage(messages.searchLabel)}
            placeholder={intl.formatMessage(messages.searchPlaceholder)}
            value={query}
            onChange={setQuery}
          />
          {source === 'device' ? (
            <Checkbox label={intl.formatMessage(messages.showSystem)} checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          ) : null}
          {source === 'device' && apps ? (
            <>
              <Button size="md" disabled={loadingIcons} onClick={() => void loadDeviceIcons()}>
                {intl.formatMessage(loadingIcons ? messages.loadingIcons : messages.loadIcons)}
              </Button>
              <Button size="md" disabled={scanning} onClick={() => void scan()}>
                {intl.formatMessage(scanning ? messages.scanning : messages.rescan)}
              </Button>
            </>
          ) : null}
        </div>

        {source === 'device' && apps ? (
          <p className="v2-device-kiosk__note">
            {scannedAt
              ? intl.formatMessage(messages.savedScan, { date: fmtDateTime(scannedAt), count: apps.length })
              : intl.formatMessage(messages.unsavedScan, { count: apps.length })}
          </p>
        ) : null}
        {source === 'device' && apps && scanErr ? (
          <Callout tone="alert" role="alert" icon={<IconWarning size={16} />}>
            {scanErr}
          </Callout>
        ) : null}

        {source === 'device' && !apps ? (
          <div className="v2-device-kiosk__scan">
            <Button variant="primary" size="lg" disabled={scanning} onClick={() => void scan()}>
              {intl.formatMessage(scanning ? messages.scanningDevice : messages.scanDeviceApps)}
            </Button>
            {scanning ? (
              <p className="v2-device-kiosk__note" role="status">
                {intl.formatMessage(messages.asking)}
              </p>
            ) : null}
            {scanErr ? (
              <Callout tone="alert" role="alert" icon={<IconWarning size={16} />}>
                {scanErr}
              </Callout>
            ) : null}
          </div>
        ) : null}

        {listShown ? (
          <div className="v2-device-kiosk__list" role="group" aria-label={intl.formatMessage(messages.appsGroup)}>
            {source === 'library' && libErr ? (
              <Callout tone="alert" role="alert" icon={<IconWarning size={16} />}>
                {libErr}
              </Callout>
            ) : null}
            {source === 'library' && !lib && !libErr ? <SkeletonRows compact count={4} label={intl.formatMessage(messages.loadingLibrary)} /> : null}
            {items.map((i) => {
              const on = selected.has(i.pkg);
              // I8: the checkbox leads the row; the whole row is its label.
              return (
                <label key={i.pkg} className={`v2-device-kiosk__app${on ? ' is-on' : ''}`}>
                  <Checkbox checked={on} onChange={() => toggle(i.pkg)} />
                  {i.iconUrl ? (
                    <img
                      className="v2-device-kiosk__ico"
                      src={i.iconUrl}
                      alt=""
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.visibility = 'hidden';
                      }}
                    />
                  ) : (
                    <span className="v2-device-kiosk__ico is-letter" aria-hidden="true">
                      {i.label.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <span className="v2-device-kiosk__meta">
                    <span className="v2-device-kiosk__name">{i.label}</span>
                    <span className="v2-device-kiosk__pkg">{i.pkg}</span>
                  </span>
                  {i.badge ? (
                    <Badge tone={i.system ? 'neutral' : 'outline'} size="sm">
                      {CATEGORY_LABEL[i.badge] ? intl.formatMessage(CATEGORY_LABEL[i.badge]) : i.badge}
                    </Badge>
                  ) : null}
                </label>
              );
            })}
            {!items.length && (source === 'library' ? lib : apps) ? (
              <p className="v2-device-kiosk__note v2-device-kiosk__empty">{intl.formatMessage(messages.noMatch)}</p>
            ) : null}
          </div>
        ) : null}

        <div className="v2-device-kiosk__exit">
          <Field label={intl.formatMessage(messages.exitMode)}>
            <Select value={exitMode} onChange={(e) => setExitMode(e.target.value as ExitMode)}>
              <option value="gesture">{intl.formatMessage(messages.exitGesture)}</option>
              <option value="visible">{intl.formatMessage(messages.exitVisible)}</option>
              <option value="remote">{intl.formatMessage(messages.exitRemote)}</option>
            </Select>
          </Field>
          <Field
            label={intl.formatMessage(messages.exitPin)}
            help={pinLeft && pinError ? undefined : intl.formatMessage(messages.exitPinHelp)}
            error={pinLeft ? pinError : undefined}
          >
            <Tooltip content={EXIT_PIN_HELP}>
              <Input
                type="password"
                autoComplete="new-password"
                inputMode="numeric"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onBlur={() => setPinLeft(true)}
                placeholder={EXIT_PIN_PLACEHOLDER}
              />
            </Tooltip>
          </Field>
        </div>
      </div>
    </Modal>
  );
}

/* ===============================================================================================================
   Return to configured kiosk: confirm, then queue the kiosk the configuration defines
   =============================================================================================================== */

/** Packages in the device's newest saved app scan, and when it ran; null when it was never scanned. */
function lastScan(history: CommandHistoryItem[]): { id: number; pkgs: Set<string>; at?: number } | null {
  let scan: CommandHistoryItem | undefined;
  for (const c of history) {
    if (c.type === 'apps.scan' && c.status === 'done' && c.detail && (!scan || Number(c.id) > Number(scan.id))) scan = c;
  }
  if (!scan) return null;
  try {
    const apps = (JSON.parse(scan.detail!) as { apps?: unknown } | null)?.apps;
    if (!Array.isArray(apps)) return null;
    const pkgs = new Set(apps.map((a) => (a && typeof a === 'object' ? (a as { pkg?: unknown }).pkg : undefined)).filter((x): x is string => typeof x === 'string'));
    return pkgs.size ? { id: Number(scan.id), pkgs, at: scan.completedAt } : null;
  } catch {
    return null;
  }
}

/**
 * Confirms "Return to configured kiosk": says what the configuration's kiosk is, warns about what would make it
 * differ on this device, then queues `kiosk.enter` with the configuration's own kiosk document.
 */
export function ConfiguredKioskDialog({
  open = true,
  device,
  configName,
  kiosk,
  history,
  agentVersion,
  agentReported,
  onClose,
  onQueued,
}: {
  /** Kept mounted while closed (with a fresh `key` per opening) so it animates out. */
  open?: boolean;
  device: { number: string; description?: string };
  configName: string;
  kiosk: ConfiguredKiosk;
  /** The device's command history: its last app scan and installs since. */
  history: CommandHistoryItem[];
  agentVersion: string | null | undefined;
  /** False when the device has never sent an agent state report. */
  agentReported: boolean;
  onClose: () => void;
  /** After the command was queued, with its id. */
  onQueued: (id: number | string | undefined) => void;
}) {
  const toast = useToast();
  const intl = useIntl();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const p = kiosk.payload;

  const missing = useMemo(() => {
    const scan = lastScan(history);
    if (!scan) return null;
    // Installed since the scan (the history names an app.install's package).
    const installed = new Set(
      history
        .filter((c) => c.type === 'app.install' && c.status === 'done' && Number(c.id) > scan.id && typeof c.subject === 'string')
        .map((c) => c.subject as string),
    );
    const list = kiosk.apps.filter((a) => !scan.pkgs.has(a.pkg) && !installed.has(a.pkg));
    return list.length ? { list, at: scan.at } : null;
  }, [history, kiosk.apps]);

  const scanDate = missing?.at ? fmtDateTime(missing.at) : undefined;
  const pinnedMissing = p.mode === 'single' && missing?.list.some((a) => a.pkg === p.pinPackage);
  const oldAgentForVolume = p.features.lockVolume === true && versionAtLeast(agentVersion, LOCK_VOLUME_AGENT) === false;

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const res = await queueCommand(device.number, { type: 'kiosk.enter', payload: configuredKioskCommand(kiosk) });
      toast.push(
        'ok',
        intl.formatMessage(messages.returnQueued),
        res?.id != null ? intl.formatMessage(messages.returnQueuedBody, { id: res.id }) : '',
      );
      onQueued(res?.id);
      onClose();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : intl.formatMessage(messages.notAccepted));
    } finally {
      setBusy(false);
    }
  }

  const appNames = kiosk.apps.map((a) => a.name).join(', ');
  return (
    <Modal
      open={open}
      size="sm"
      onClose={busy ? () => undefined : onClose}
      title={intl.formatMessage(messages.returnTitle)}
      description={intl.formatMessage(messages.returnDescription, { name: configName })}
      className="v2-device-kreturn"
      footer={
        <>
          <Button size="lg" disabled={busy} onClick={onClose}>
            {intl.formatMessage(messages.cancel)}
          </Button>
          <Button size="lg" variant="primary" disabled={busy} onClick={() => void send()}>
            {intl.formatMessage(busy ? messages.sending : messages.returnButton)}
          </Button>
        </>
      }
    >
      <DialogTarget device={device} />
      <KeyValueList
        variant="facts"
        items={[
          { key: 'kiosk', label: intl.formatMessage(messages.factKiosk), value: configuredKioskSummary(kiosk) },
          ...(p.mode === 'launcher' ? [{ key: 'apps', label: intl.formatMessage(messages.factApps), value: appNames }] : []),
          {
            key: 'exit',
            label: intl.formatMessage(messages.factExit),
            value: intl.formatMessage(p.exitMode === 'visible' ? messages.exitButtonVisible : messages.exitButtonGesture),
          },
          {
            key: 'pin',
            label: intl.formatMessage(messages.factExitPin),
            value: p.password
              ? intl.formatMessage(messages.pinConfigured)
              : intl.formatMessage(messages.pinNone, { meaning: NO_PIN_MEANS }),
          },
        ]}
      />
      {kiosk.mainAppLeftOut ? (
        <Callout tone="warn" icon={<IconWarning size={16} />}>
          <FormattedMessage {...messages.mainAppLeftOut} values={{ name: configName }} />
        </Callout>
      ) : null}
      {missing ? (
        <Callout tone="warn" icon={<IconWarning size={16} />}>
          {pinnedMissing
            ? intl.formatMessage(messages.pinnedMissing, {
                app: missing.list.find((a) => a.pkg === p.pinPackage)?.name ?? '',
                hasDate: String(scanDate != null),
                date: scanDate ?? '',
              })
            : intl.formatMessage(messages.listMissing, {
                apps: missing.list.map((a) => a.name).join(', '),
                hasDate: String(scanDate != null),
                date: scanDate ?? '',
              })}
        </Callout>
      ) : null}
      {oldAgentForVolume ? (
        <Callout tone="warn" icon={<IconWarning size={16} />}>
          <FormattedMessage
            {...messages.oldAgentForVolume}
            values={{
              version: agentVersion,
              minimum: LOCK_VOLUME_AGENT,
              link: (chunks) => <Link to={`${paths.settings}#updates`}>{chunks}</Link>,
            }}
          />
        </Callout>
      ) : null}
      {!agentReported ? (
        <Callout tone="info">
          <FormattedMessage {...messages.notReported} />
        </Callout>
      ) : null}
      {error ? (
        <Callout tone="alert" role="alert" icon={<IconWarning size={16} />}>
          <FormattedMessage {...messages.queueFailed} values={{ error }} />
        </Callout>
      ) : null}
    </Modal>
  );
}
