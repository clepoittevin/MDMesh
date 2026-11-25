import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { FormattedMessage, defineMessages, useIntl, type IntlShape, type MessageDescriptor } from 'react-intl';
import type { CommandHistoryItem, QueueCommandRequest } from '../api/commands';
import type { AppInfo } from '../api/deviceApps';
import {
  Button,
  Callout,
  Card,
  CardHeader,
  Checkbox,
  EmptyState,
  IconApps,
  IconDownload,
  IconSync,
  IconWarning,
  RelativeTime,
  SearchInput,
  SkeletonRows,
  Table,
  Tooltip,
  type Column,
} from '../ui';
import { appsCsv, byLabel, filterApps, latestScan, scanProgress } from '../data/deviceApps';
import { DASH } from './deviceDetailFormat';

const messagesRaw = defineMessages({
  scanLabel: { id: 'deviceDetail.apps.scanLabel', defaultMessage: 'App scan' },
  scanTimedOut: {
    id: 'deviceDetail.apps.scanTimedOut',
    defaultMessage: 'Timed out waiting for the device (is it online?)',
  },
  colApp: { id: 'deviceDetail.apps.colApp', defaultMessage: 'App' },
  colPackage: { id: 'deviceDetail.apps.colPackage', defaultMessage: 'Package' },
  colVersion: { id: 'deviceDetail.apps.colVersion', defaultMessage: 'Version' },
  colType: { id: 'deviceDetail.apps.colType', defaultMessage: 'Type' },
  typeSystem: { id: 'deviceDetail.apps.typeSystem', defaultMessage: 'System' },
  typeUser: { id: 'deviceDetail.apps.typeUser', defaultMessage: 'User' },
  noScanTitle: { id: 'deviceDetail.apps.noScanTitle', defaultMessage: 'No recent scan' },
  noScanText: {
    id: 'deviceDetail.apps.noScanText',
    defaultMessage: 'The device’s recent commands hold no finished app scan.',
  },
  noScanTextCanScan: {
    id: 'deviceDetail.apps.noScanTextCanScan',
    defaultMessage: 'The device’s recent commands hold no finished app scan. Scan now asks it for its apps.',
  },
  emptyScanTitle: { id: 'deviceDetail.apps.emptyScanTitle', defaultMessage: 'The last scan listed no apps' },
  emptyScanText: {
    id: 'deviceDetail.apps.emptyScanText',
    defaultMessage: 'Give the device a moment after an update, then scan again.',
  },
  title: { id: 'deviceDetail.apps.title', defaultMessage: 'Installed apps' },
  subtitle: {
    id: 'deviceDetail.apps.subtitle',
    defaultMessage: 'The apps with a launcher icon, from the device’s latest scan.',
  },
  count: { id: 'deviceDetail.apps.count', defaultMessage: '{count, plural, one {# app} other {# apps}}' },
  scanned: { id: 'deviceDetail.apps.scanned', defaultMessage: 'scanned {when}' },
  exportTip: { id: 'deviceDetail.apps.exportTip', defaultMessage: 'All apps, system ones included' },
  exportCsv: { id: 'deviceDetail.apps.exportCsv', defaultMessage: 'Export CSV' },
  scanning: { id: 'deviceDetail.apps.scanning', defaultMessage: 'Scanning…' },
  scanNow: { id: 'deviceDetail.apps.scanNow', defaultMessage: 'Scan now' },
  asking: { id: 'deviceDetail.apps.asking', defaultMessage: 'Asking the device for its apps…' },
  searchLabel: { id: 'deviceDetail.apps.searchLabel', defaultMessage: 'Search apps' },
  searchPlaceholder: { id: 'deviceDetail.apps.searchPlaceholder', defaultMessage: 'Search name or package' },
  showSystem: { id: 'deviceDetail.apps.showSystem', defaultMessage: 'Show system apps' },
  loadingScan: { id: 'deviceDetail.apps.loadingScan', defaultMessage: 'Loading the last scan' },
  noMatch: { id: 'deviceDetail.apps.noMatch', defaultMessage: 'No apps match.' },
  noMatchSystemHidden: {
    id: 'deviceDetail.apps.noMatchSystemHidden',
    defaultMessage: 'No apps match. System apps are hidden.',
  },
});
const messages: Record<keyof typeof messagesRaw, MessageDescriptor> = messagesRaw;

/** How long Scan now waits for the device, as the kiosk picker does (api/deviceApps runForResult). */
const SCAN_TIMEOUT_MS = 75_000;

/** The page's queue: toasts the outcome, nudges the device and refreshes the polled history. */
type Queue = (
  label: string,
  request: () => QueueCommandRequest,
  onQueued?: (cmdId: number | string | undefined) => void,
) => Promise<boolean>;

export interface AppScanState {
  /** Queued and not answered yet (and not timed out). */
  scanning: boolean;
  /** Why the last Scan now gave no list. */
  error: string | null;
  start: () => void;
}

/**
 * Scan now: queues apps.scan through the page's queue and follows it in the page's polled history, so there is no
 * second poll. Kept by the page, so a scan in flight survives a tab change; a different device forgets it.
 */
export function useAppScan(number: string | undefined, history: readonly CommandHistoryItem[], queue: Queue): AppScanState {
  const [queueing, setQueueing] = useState(false);
  const [queued, setQueued] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const seq = useRef(0);
  const intl = useIntl();

  useEffect(() => {
    seq.current++;
    setQueueing(false);
    setQueued(null);
    setTimedOut(false);
  }, [number]);

  const progress = queued ? scanProgress(history, queued) : null;
  const waiting = progress?.state === 'pending';
  useEffect(() => {
    if (!waiting) return;
    const t = setTimeout(() => setTimedOut(true), SCAN_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [queued, waiting]);

  async function start() {
    const mine = ++seq.current;
    setQueueing(true);
    setQueued(null);
    setTimedOut(false);
    try {
      await queue(intl.formatMessage(messages.scanLabel), () => ({ type: 'apps.scan' }), (cmdId) => {
        if (mine === seq.current && cmdId != null) setQueued(String(cmdId));
      });
    } finally {
      if (mine === seq.current) setQueueing(false);
    }
  }

  return {
    scanning: queueing || (waiting && !timedOut),
    error:
      progress?.state === 'failed'
        ? progress.reason
        : waiting && timedOut
          ? intl.formatMessage(messages.scanTimedOut)
          : null,
    start: () => void start(),
  };
}

function appColumns(intl: IntlShape): ReadonlyArray<Column<AppInfo>> {
  return [
    { key: 'app', header: intl.formatMessage(messages.colApp), cell: (a) => a.label },
    { key: 'pkg', header: intl.formatMessage(messages.colPackage), cell: (a) => a.pkg, mono: true },
    {
      key: 'version',
      header: intl.formatMessage(messages.colVersion),
      cell: (a) => `${a.versionName ?? DASH}${a.versionCode != null ? ` (${a.versionCode})` : ''}`,
      mono: true,
    },
    {
      key: 'type',
      header: intl.formatMessage(messages.colType),
      cell: (a) => intl.formatMessage(a.system ? messages.typeSystem : messages.typeUser),
    },
  ];
}

function downloadCsv(name: string, text: string) {
  const url = URL.createObjectURL(new Blob(['\uFEFF' + text], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * The device's installed apps from its latest apps.scan in the polled history: the apps with a launcher icon, as the
 * agent reports them. Scan now (`scan`, only for a role with edit_devices) asks the device again; Export CSV writes
 * every app, system ones included, for app audits.
 */
export function AppsTab({
  number,
  history,
  loaded,
  scan,
}: {
  number: string;
  history: readonly CommandHistoryItem[];
  loaded: boolean;
  scan?: AppScanState;
}) {
  const titleId = useId();
  const intl = useIntl();
  const columns = useMemo(() => appColumns(intl), [intl]);
  const [query, setQuery] = useState('');
  const [showSystem, setShowSystem] = useState(false);
  const latest = useMemo(() => latestScan(history), [history]);
  const all = useMemo(() => [...(latest?.apps ?? [])].sort(byLabel), [latest]);
  const shown = filterApps(all, query, showSystem);
  const systemHidden = !showSystem && all.some((a) => a.system);
  const counted = showSystem ? all.length : all.filter((a) => !a.system).length;

  let empty: { title: string; text?: string } | null = null;
  if (!latest) {
    empty = {
      title: intl.formatMessage(messages.noScanTitle),
      text: intl.formatMessage(scan ? messages.noScanTextCanScan : messages.noScanText),
    };
  } else if (all.length === 0) {
    empty = {
      title: intl.formatMessage(messages.emptyScanTitle),
      text: scan ? intl.formatMessage(messages.emptyScanText) : undefined,
    };
  }

  return (
    <Card padding="list" clip aria-labelledby={titleId} className="v2-device-apps">
      <CardHeader
        inset
        spacing={8}
        title={intl.formatMessage(messages.title)}
        titleId={titleId}
        subtitle={intl.formatMessage(messages.subtitle)}
        actions={
          <>
            {latest ? (
              <span className="v2-device-meta">
                {intl.formatMessage(messages.count, { count: counted })}
                {latest.scannedAt ? (
                  <>
                    {' · '}
                    <FormattedMessage {...messages.scanned} values={{ when: <RelativeTime value={latest.scannedAt} /> }} />
                  </>
                ) : null}
              </span>
            ) : null}
            {/* X7: nothing to export until a scan lists apps. */}
            {all.length ? (
              <Tooltip content={intl.formatMessage(messages.exportTip)}>
                <Button size="sm" icon={<IconDownload size={16} />} onClick={() => downloadCsv(`apps-${number}.csv`, appsCsv(all))}>
                  <FormattedMessage {...messages.exportCsv} />
                </Button>
              </Tooltip>
            ) : null}
            {scan ? (
              <Button size="sm" icon={<IconSync />} disabled={scan.scanning} onClick={scan.start}>
                {intl.formatMessage(scan.scanning ? messages.scanning : messages.scanNow)}
              </Button>
            ) : null}
          </>
        }
      />
      {scan?.error || scan?.scanning || all.length ? (
        <div className="v2-device-apps__body">
          {scan?.error ? (
            <Callout tone="alert" role="alert" icon={<IconWarning size={16} />}>
              {scan.error}
            </Callout>
          ) : null}
          {scan?.scanning ? (
            <p className="v2-device-meta" role="status">
              <FormattedMessage {...messages.asking} />
            </p>
          ) : null}
          {all.length ? (
            <div className="v2-device-apps__tools">
              <SearchInput
                className="v2-device-apps__search"
                aria-label={intl.formatMessage(messages.searchLabel)}
                placeholder={intl.formatMessage(messages.searchPlaceholder)}
                value={query}
                onChange={setQuery}
              />
              <Checkbox label={intl.formatMessage(messages.showSystem)} checked={showSystem} onChange={(e) => setShowSystem(e.target.checked)} />
            </div>
          ) : null}
        </div>
      ) : null}
      {!loaded && !all.length ? (
        <SkeletonRows compact count={5} label={intl.formatMessage(messages.loadingScan)} />
      ) : empty ? (
        <div className="v2-device-cmds__empty">
          <EmptyState bare icon={<IconApps />} title={empty.title}>
            {empty.text ?? null}
          </EmptyState>
        </div>
      ) : (
        <Table
          aria-label={intl.formatMessage(messages.title)}
          columns={columns}
          rows={shown}
          rowKey={(a) => a.pkg}
          minWidth={560}
          empty={intl.formatMessage(systemHidden ? messages.noMatchSystemHidden : messages.noMatch)}
        />
      )}
    </Card>
  );
}
