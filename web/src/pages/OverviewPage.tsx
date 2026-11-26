import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { configName } from '../data/seededConfigs';
import { defineMessages, FormattedMessage, useIntl, type IntlShape, type MessageDescriptor } from 'react-intl';
import { forceSync } from '../api/commands';
import { syncVerdictLabel, type ConfigSyncSummary } from '../api/configSync';
import type { ConfigurationLookup, DeviceView } from '../api/devices';
import type { ActiveRollout } from '../api/rollout';
import { isOnline } from '../data/presence';
import { LOAD_DEVICES_FAILED, loadErrorText } from '../data/useDevices';
import { CORE_ACTION_ACCESS } from '../ext/core/access';
import { CoreOverviewProvider } from '../ext/core/overview';
import { OverviewRows, OverviewStats, useHasExtensionStats } from '../ext/hosts/OverviewCards';
import { useCurrentUser, usePermission } from '../ext/permissions';
import { paths } from '../routes';
import {
  ActivityList,
  ActivityRow,
  AttentionList,
  Button,
  ButtonLink,
  Card,
  CardHeader,
  CountMeta,
  DeviceIdentity,
  EmptyState,
  ErrorState,
  FleetSummary,
  NumberedSteps,
  Grid,
  GridCell,
  IconCheck,
  IconPlus,
  PageHeader,
  RelativeTime,
  Segmented,
  StackedBar,
  StatCell,
  StatGrid,
  StatusDot,
  SkeletonFacts,
  SkeletonRows,
  deriveDeviceKind,
  useToast,
  type AttentionItem,
  type BarSegment,
  type StatNote,
} from '../ui';
import { eventView } from './overview/eventView';
import { ServerCard } from './overview/ServerCard';
import { ISSUE_REASON_MESSAGES, issueKind, type IssueKind, type SyncCheck } from '../data/fleetHealth';
import { wipedOnlyLine } from './configurations/sync';
import { bucketOf, reasonFor, type ConfigIssue } from './overview/attention';
import { useOverviewData, type ActivityItem, type OverviewData } from './overview/useOverviewData';
import './OverviewPage.css';
import { apiErrorText } from '../api/apiErrorText';

/** Rows in "Needs attention" and "Recent activity". */
const ATTENTION_ROWS = 6;
const ACTIVITY_ROWS = 8;
/** Settings sections the Overview links to (Settings side-nav anchors). */
const SETTINGS_ROLLOUT = `${paths.settings}#agent-rollout`;

const messageDefs = defineMessages({
  title: { id: 'overview.page.title', defaultMessage: 'Overview' },
  enrollDevice: { id: 'overview.page.enrollDevice', defaultMessage: 'Enroll device' },
  fleetThing: { id: 'overview.page.fleetThing', defaultMessage: 'the fleet' },
  lastData: { id: 'overview.page.lastData', defaultMessage: 'Showing the last data loaded.' },
  firstTitle: { id: 'overview.firstRun.title', defaultMessage: 'Enroll your first device' },
  firstSubtitle: {
    id: 'overview.firstRun.subtitle',
    defaultMessage: 'The fleet, its health and its activity show here once a device reports in.',
  },
  firstStep1: {
    id: 'overview.firstRun.step1',
    defaultMessage:
      "Pick what new devices get in <link>Configurations</link> (the default one works to start).",
  },
  firstStep2: { id: 'overview.firstRun.step2', defaultMessage: 'Make an enrollment code on the Enroll page.' },
  firstStep3: {
    id: 'overview.firstRun.step3',
    defaultMessage:
      "Factory-reset the device and scan the code at its welcome screen, or type the token on a device that's set up.",
  },
  fleetStatus: { id: 'overview.page.fleetStatus', defaultMessage: 'Fleet status' },
  devicesEnrolled: {
    id: 'overview.fleet.devicesEnrolled',
    defaultMessage: '{count, plural, one {device enrolled} other {devices enrolled}}',
  },
  statusOfFirst: {
    id: 'overview.fleet.statusOfFirst',
    defaultMessage: 'status of the first <num>{count}</num>',
  },
  wipedLink: { id: 'overview.fleet.wipedLink', defaultMessage: '<link><num>{count}</num> wiped</link>' },
  legendOnline: { id: 'overview.fleet.online', defaultMessage: 'Online' },
  legendAttention: { id: 'overview.fleet.needsAttention', defaultMessage: 'Needs attention' },
  legendOffline: { id: 'overview.fleet.offline', defaultMessage: 'Offline' },
  // Subtitle
  subNone: { id: 'overview.subtitle.none', defaultMessage: 'No devices enrolled yet. Enroll one to see it here.' },
  subAllWiped: { id: 'overview.subtitle.allWiped', defaultMessage: 'Every enrolled device was wiped.' },
  subOnlineSynced: { id: 'overview.subtitle.onlineSynced', defaultMessage: 'Every device is online and in sync.' },
  subOnlineChecking: {
    id: 'overview.subtitle.onlineChecking',
    defaultMessage: 'Every device is online. Checking configuration sync…',
  },
  subOnlineFailed: {
    id: 'overview.subtitle.onlineFailed',
    defaultMessage: 'Every device is online. Configuration sync could not be checked.',
  },
  subOnlinePartial: {
    id: 'overview.subtitle.onlinePartial',
    defaultMessage: 'Every device is online. Configuration sync was only partly checked.',
  },
  subOffline: {
    id: 'overview.subtitle.offline',
    defaultMessage:
      '{lead, select, true {Most of the fleet is healthy. } other {}}{offline, plural, one {<num>#</num> device is offline.} other {<num>#</num> devices are offline.}}',
  },
  subAttention: {
    id: 'overview.subtitle.attention',
    defaultMessage:
      '{lead, select, true {Most of the fleet is healthy. } other {}}{partial, select, true {At least } other {}}{attention, plural, one {<num>#</num> device needs} other {<num>#</num> devices need}} attention{hasReason, select, true {, {share, select, all {all} other {mostly}} for {reason}} other {}}{offline, plural, =0 {} one {, and <num>#</num> is offline} other {, and <num>#</num> are offline}}.',
  },
  reasonOffline: { id: 'overview.reason.offline', defaultMessage: 'being offline' },
  reasonFailed: { id: 'overview.reason.failed', defaultMessage: 'a configuration that failed to apply' },
  reasonOutOfSync: { id: 'overview.reason.outOfSync', defaultMessage: 'a configuration out of sync' },
  reasonAgentTooOld: { id: 'overview.reason.agentTooOld', defaultMessage: 'an out-of-date agent' },
  reasonDeferred: { id: 'overview.reason.deferred', defaultMessage: 'deferred settings' },
  reasonReset: { id: 'overview.reason.reset', defaultMessage: 'a configuration out of date on the device' },
  rowOffline: { id: 'overview.attention.offline', defaultMessage: 'Offline' },
  updatedPrefix: { id: 'overview.updated.prefix', defaultMessage: 'Updated ' },
  // Stats
  syncLabel: { id: 'overview.sync.label', defaultMessage: 'Configuration in sync' },
  syncFailed: { id: 'overview.sync.failed', defaultMessage: 'Could not be checked' },
  syncChecking: { id: 'overview.sync.checking', defaultMessage: 'Checking…' },
  syncOutOfSync: { id: 'overview.sync.outOfSync', defaultMessage: '{count} out of sync' },
  syncAgentTooOld: { id: 'overview.sync.agentTooOld', defaultMessage: '{count, plural, one {#} other {#}} agent too old' },
  syncNotReported: { id: 'overview.sync.notReported', defaultMessage: '{count} not reported' },
  syncNoConfig: { id: 'overview.sync.noConfig', defaultMessage: 'No device has a configuration' },
  syncAll: { id: 'overview.sync.all', defaultMessage: 'All in sync' },
  rolloutLabel: { id: 'overview.rollout.label', defaultMessage: 'Agent {version} rollout' },
  rolloutFleet: { id: 'overview.rollout.fleet', defaultMessage: 'Rolling out to the fleet' },
  rolloutCanary: { id: 'overview.rollout.canary', defaultMessage: 'Canary devices first' },
  rolloutInstalling: { id: 'overview.rollout.installing', defaultMessage: '{count} installing' },
  rolloutQueued: { id: 'overview.rollout.queued', defaultMessage: '{count} queued' },
  rolloutTooOld: { id: 'overview.rollout.tooOld', defaultMessage: '{count} too old to update' },
  // Needs attention
  notConnectedTitle: { id: 'overview.attention.notConnectedTitle', defaultMessage: '{number} isn’t connected right now' },
  notConnectedBody: { id: 'overview.attention.notConnectedBody', defaultMessage: 'It syncs at its next check-in.' },
  syncRequested: { id: 'overview.attention.syncRequested', defaultMessage: 'Sync requested' },
  syncRequestedBody: {
    id: 'overview.attention.syncRequestedBody',
    defaultMessage: '{number} checks in now and picks up its configuration.',
  },
  syncFailedToast: { id: 'overview.attention.syncFailedToast', defaultMessage: 'Sync failed' },
  syncNowNamed: { id: 'overview.attention.syncNowNamed', defaultMessage: 'Sync now: {name}' },
  syncing: { id: 'overview.attention.syncing', defaultMessage: 'Syncing…' },
  syncNow: { id: 'overview.attention.syncNow', defaultMessage: 'Sync now' },
  updateAgentNamed: { id: 'overview.attention.updateAgentNamed', defaultMessage: 'Update agent: {name}' },
  updateAgent: { id: 'overview.attention.updateAgent', defaultMessage: 'Update agent' },
  loadingAttention: {
    id: 'overview.attention.loading',
    defaultMessage: 'Loading devices that need attention…',
  },
  notKnown: { id: 'overview.attention.notKnown', defaultMessage: 'Not known' },
  notKnownBody: {
    id: 'overview.attention.notKnownBody',
    defaultMessage: 'The devices couldn’t be loaded, so it isn’t known which need attention.',
  },
  noDevices: { id: 'overview.attention.noDevices', defaultMessage: 'No devices yet' },
  noDevicesBody: {
    id: 'overview.attention.noDevicesBody',
    defaultMessage: 'Devices that are offline or whose configuration didn’t apply show up here.',
  },
  noActive: { id: 'overview.attention.noActive', defaultMessage: 'No active devices' },
  allClear: { id: 'overview.attention.allClear', defaultMessage: 'All clear' },
  allOnline: { id: 'overview.attention.allOnline', defaultMessage: 'All online' },
  attentionListLabel: { id: 'overview.attention.listLabel', defaultMessage: 'Devices that need attention' },
  attentionTitle: { id: 'overview.attention.title', defaultMessage: 'Needs attention' },
  // By configuration
  configurationFallback: { id: 'overview.byConfig.fallback', defaultMessage: 'Configuration {id}' },
  syncNotReportedNote: { id: 'overview.byConfig.syncNotReported', defaultMessage: 'Sync not reported' },
  syncUnavailable: { id: 'overview.byConfig.syncUnavailable', defaultMessage: 'Sync status unavailable' },
  noteAllInSync: { id: 'overview.byConfig.allInSync', defaultMessage: 'All in sync' },
  noteInSync: { id: 'overview.byConfig.inSync', defaultMessage: '{count} in sync' },
  noteOutOfSync: { id: 'overview.byConfig.outOfSync', defaultMessage: '{count} out of sync' },
  noteAgentTooOld: { id: 'overview.byConfig.agentTooOld', defaultMessage: '{count, plural, one {#} other {#}} agent too old' },
  noteNotReported: { id: 'overview.byConfig.notReported', defaultMessage: '{count} not reported' },
  noteDeferred: { id: 'overview.byConfig.deferred', defaultMessage: '{count} deferred settings' },
  noConfiguration: { id: 'overview.byConfig.none', defaultMessage: 'No configuration' },
  nothingAssigned: {
    id: 'overview.byConfig.nothingAssigned',
    defaultMessage: '{count, plural, one {# device has} other {# devices have}} nothing assigned',
  },
  byConfigTitle: { id: 'overview.byConfig.title', defaultMessage: 'By configuration' },
  manage: { id: 'overview.byConfig.manage', defaultMessage: 'Manage' },
  loadingConfigs: { id: 'overview.byConfig.loading', defaultMessage: 'Loading configurations…' },
  byConfigUnknownBody: { id: 'overview.byConfig.unknownBody', defaultMessage: 'The devices couldn’t be loaded.' },
  byConfigEmptyBody: {
    id: 'overview.byConfig.emptyBody',
    defaultMessage: 'Devices are counted here by the configuration they use.',
  },
  // Recent activity
  filterAll: { id: 'overview.activity.filterAll', defaultMessage: 'All' },
  filterCommands: { id: 'overview.activity.filterCommands', defaultMessage: 'Commands' },
  filterEvents: { id: 'overview.activity.filterEvents', defaultMessage: 'Device events' },
  activityUnknownBody: {
    id: 'overview.activity.unknownBody',
    defaultMessage: 'The devices couldn’t be loaded, so their recent activity isn’t known.',
  },
  loadingActivity: { id: 'overview.activity.loading', defaultMessage: 'Loading activity…' },
  noCommandResults: { id: 'overview.activity.noCommandResults', defaultMessage: 'No command results' },
  noRecentEvents: { id: 'overview.activity.noRecentEvents', defaultMessage: 'No recent events' },
  commandResultsBody: {
    id: 'overview.activity.commandResultsBody',
    defaultMessage: 'Results of commands run by the most recently seen devices show up here.',
  },
  recentEventsBody: {
    id: 'overview.activity.recentEventsBody',
    defaultMessage: 'Events from the most recently seen devices show up here.',
  },
  activityListLabel: { id: 'overview.activity.listLabel', defaultMessage: 'Recent activity' },
  activityTitle: { id: 'overview.activity.title', defaultMessage: 'Recent activity' },
  filterActivity: { id: 'overview.activity.filterLabel', defaultMessage: 'Filter activity' },
});
// Widened so values can be passed (react-intl would otherwise type them from the ICU text).
const messages: { [K in keyof typeof messageDefs]: MessageDescriptor } = messageDefs;

const SUBTITLE_SYNC = {
  complete: messages.subOnlineSynced,
  pending: messages.subOnlineChecking,
  failed: messages.subOnlineFailed,
  partial: messages.subOnlinePartial,
} as const;

/** Why a device needs attention, as the subtitle's "mostly for …" phrase (the key is an issue kind, or offline). */
const REASON_PHRASE: Record<IssueKind | 'offline', MessageDescriptor> = {
  offline: messages.reasonOffline,
  failed: messages.reasonFailed,
  outOfSync: messages.reasonOutOfSync,
  agentTooOld: messages.reasonAgentTooOld,
  deferred: messages.reasonDeferred,
  reset: messages.reasonReset,
};

/** The issue's kind (or offline) and its phrase and row text, translated; other verdicts keep their own label. */
function reasonText(intl: IntlShape, issue: ConfigIssue | undefined): { key: string; phrase: string; text: string } {
  if (!issue) {
    return { key: 'offline', phrase: intl.formatMessage(REASON_PHRASE.offline), text: intl.formatMessage(messages.rowOffline) };
  }
  const kind = issueKind(issue);
  if (!kind) {
    const text = syncVerdictLabel(issue.label, intl);
    return { key: `label:${issue.label}`, phrase: text.toLowerCase(), text };
  }
  return { key: kind, phrase: intl.formatMessage(REASON_PHRASE[kind]), text: intl.formatMessage(ISSUE_REASON_MESSAGES[kind]) };
}

/** The most common reason among the attention devices, and whether it covers all of them or most (> half). */
function topReasonPhrase(
  intl: IntlShape,
  devices: ReadonlyArray<DeviceView>,
  issues: Record<number, ConfigIssue>,
  now: number,
): { phrase: string; share: 'all' | 'most' } | null {
  const tally = new Map<string, { phrase: string; n: number }>();
  let n = 0;
  for (const d of devices) {
    if (bucketOf(d, issues, now) !== 'attention') continue;
    n++;
    const r = reasonText(intl, issues[d.id]);
    const cur = tally.get(r.key);
    tally.set(r.key, { phrase: r.phrase, n: (cur?.n ?? 0) + 1 });
  }
  let best: { phrase: string; n: number } | null = null;
  for (const e of tally.values()) if (!best || e.n > best.n) best = e;
  if (!best || n === 0) return null;
  if (best.n === n) return { phrase: best.phrase, share: 'all' };
  if (best.n * 2 > n) return { phrase: best.phrase, share: 'most' };
  return null;
}

const Num = ({ children }: { children: ReactNode }) => <span className="v2-num">{children}</span>;
const NUM_TAG = { num: (chunks: ReactNode) => <Num>{chunks}</Num> };

interface Counts {
  online: number;
  attention: number;
  offline: number;
  /** Not in the fleet bar: a wiped device no longer reports (#137). */
  wiped: number;
}

/** Re-render on an interval so online/attention/offline decay while the page is open (classic: 30 s). */
function useNow(ms: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** Overview. Classic: pages/DashboardPage.tsx. */
export function OverviewPage() {
  const intl = useIntl();
  const data = useOverviewData();
  const now = useNow(30_000);
  // Enrolling writes to devices (ext/core/access.ts).
  const canEnroll = usePermission(CORE_ACTION_ACCESS.editDevices);
  const { devices, issues, syncCheck } = data;

  const counts = useMemo<Counts>(() => {
    const c: Counts = { online: 0, attention: 0, offline: 0, wiped: 0 };
    for (const d of devices) c[bucketOf(d, issues, now)]++;
    return c;
  }, [devices, issues, now]);

  // Attention or offline (a wiped device is neither): configuration problems first, then the longest silent (classic
  // order).
  const needsAttention = useMemo(
    () =>
      devices
        .filter((d) => {
          const b = bucketOf(d, issues, now);
          return b === 'attention' || b === 'offline';
        })
        .sort((a, b) => Number(!!issues[b.id]) - Number(!!issues[a.id]) || (a.lastUpdate ?? 0) - (b.lastUpdate ?? 0)),
    [devices, issues, now],
  );

  const showSubtitle = !data.loading && data.loadedAt !== null;
  // The first load failed: nothing is known, so the cards say so instead of showing an empty fleet.
  const unknown = data.loadedAt === null && !!data.error;
  const firstLoad = data.loading && data.loadedAt === null;
  // Nothing enrolled yet: the first-run steps instead of a fleet of zeros.
  // Only for someone who sees the whole fleet (a scoped user's empty view says nothing about the fleet) and may enroll;
  // anyone else gets the cards' own "No devices yet".
  const user = useCurrentUser();
  const firstRun = !firstLoad && !unknown && data.total === 0 && canEnroll && !!user?.allDevices;
  const extensionStats = useHasExtensionStats();

  // Core's cards, which the contributions in ext/core/overview.tsx pick out; extensions' cards are placed among them.
  const core = {
    sync: <SyncStat summary={data.summary} failed={data.summaryFailed} />,
    rollout: data.rollout ? <RolloutStat rollout={data.rollout} /> : null,
    needsAttention: (
      <NeedsAttention
        loading={firstLoad}
        unknown={unknown}
        rows={needsAttention}
        issues={issues}
        now={now}
        syncCheck={syncCheck}
        hasDevices={devices.length > 0}
        allWiped={devices.length > 0 && counts.wiped === devices.length}
      />
    ),
    byConfiguration: (
      <ByConfiguration
        devices={devices}
        configurations={data.configurations}
        summary={data.summary}
        loading={firstLoad}
        unknown={unknown}
      />
    ),
    recentActivity: <RecentActivity activity={unknown ? null : data.activity} appNames={data.appNames} unknown={unknown} />,
    server: data.update ? <ServerCard status={data.update} /> : null,
  };

  return (
    <CoreOverviewProvider parts={core}>
      <PageHeader
        title={intl.formatMessage(messages.title)}
        subtitle={showSubtitle ? <Subtitle data={data} counts={counts} now={now} /> : null}
        actions={
          <>
            <UpdatedAt loadedAt={data.loadedAt} failed={!!data.error} />
            {canEnroll ? (
              <ButtonLink to={paths.enroll} variant="primary" size="lg" icon={<IconPlus />}>
                {intl.formatMessage(messages.enrollDevice)}
              </ButtonLink>
            ) : null}
          </>
        }
      />

      {data.error ? (
        <ErrorState
          thing={intl.formatMessage(messages.fleetThing)}
          detail={[data.error === LOAD_DEVICES_FAILED ? null : loadErrorText(data.error, intl), data.loadedAt !== null ? intl.formatMessage(messages.lastData) : null]
            .filter(Boolean)
            .join(' ') || undefined}
          onRetry={data.refresh}
        />
      ) : null}

      {/* First run: no device yet, so no dashboard of zeros, the three steps to the first one instead. */}
      {firstRun ? (
        <Card aria-labelledby="v2-ov-first" className="v2-ov-first">
          <CardHeader
            title={intl.formatMessage(messages.firstTitle)}
            titleId="v2-ov-first"
            subtitle={intl.formatMessage(messages.firstSubtitle)}
          />
          <NumberedSteps
            steps={[
              <FormattedMessage
                {...messages.firstStep1}
                values={{ link: (chunks) => <Link to={paths.configurations}>{chunks}</Link> }}
              />,
              <>{intl.formatMessage(messages.firstStep2)}</>,
              <>{intl.formatMessage(messages.firstStep3)}</>,
            ]}
          />
          <div>
            <ButtonLink to={paths.enroll} variant="primary" icon={<IconPlus />}>
              {intl.formatMessage(messages.enrollDevice)}
            </ButtonLink>
          </div>
        </Card>
      ) : null}
      {/* First run hides the fleet and core's stats (all zeros), not an extension's: those may be about anything. */}
      {firstRun && extensionStats ? (
        <Card aria-label={intl.formatMessage(messages.fleetStatus)} className="v2-ov-stats">
          <StatGrid>
            <OverviewStats extensionsOnly />
          </StatGrid>
        </Card>
      ) : null}

      {/* The 12-column page grid: the fleet and its stats as one even row, then the cards in two columns (8 and 4,
          ext/hosts/OverviewCards), so card edges line up down the page. */}
      {firstRun ? null : (
        <Grid stretch>
          <GridCell span={8}>
            <FleetSummary
              headingId="v2-ov-fleet"
              loading={firstLoad}
              total={unknown ? null : data.total}
              caption={
                <>
                  {intl.formatMessage(messages.devicesEnrolled, { count: data.total })}
                  {data.total > devices.length && devices.length > 0 ? (
                    <>
                      {' · '}
                      <FormattedMessage {...messages.statusOfFirst} values={{ count: devices.length, ...NUM_TAG }} />
                    </>
                  ) : null}
                  {/* Beside the total, not in the bar and legend: a wiped device is enrolled but no longer reports. */}
                  {counts.wiped > 0 ? (
                    <>
                      {' · '}
                      <FormattedMessage
                        {...messages.wipedLink}
                        values={{
                          count: counts.wiped,
                          ...NUM_TAG,
                          link: (chunks) => <Link to={`${paths.devices}?status=wiped`}>{chunks}</Link>,
                        }}
                      />
                    </>
                  ) : null}
                </>
              }
              legend={[
                { key: 'online', label: intl.formatMessage(messages.legendOnline), count: counts.online, tone: 'ok', to: `${paths.devices}?status=online` },
                {
                  key: 'attention',
                  label: intl.formatMessage(messages.legendAttention),
                  count: counts.attention,
                  tone: 'warn',
                  to: `${paths.devices}?status=attention`,
                },
                { key: 'offline', label: intl.formatMessage(messages.legendOffline), count: counts.offline, tone: 'idle', to: `${paths.devices}?status=offline` },
              ]}
            />
          </GridCell>
          <GridCell span={4}>
            <Card aria-label={intl.formatMessage(messages.fleetStatus)} className="v2-ov-stats">
              <StatGrid>
                <OverviewStats />
              </StatGrid>
            </Card>
          </GridCell>
        </Grid>
      )}
      <OverviewRows />
    </CoreOverviewProvider>
  );
}

/* ---- header ------------------------------------------------------------------------------------------------------ */

/** "Most of the fleet is healthy. 14 devices need attention, mostly for an out-of-date agent." from real counts. */
function Subtitle({ data, counts, now }: { data: OverviewData; counts: Counts; now: number }) {
  const intl = useIntl();
  const { devices, issues, syncCheck } = data;
  // Wiped devices are left out: they no longer report, so they are neither healthy nor offline.
  const shown = devices.length - counts.wiped;
  if (devices.length === 0) return <>{intl.formatMessage(messages.subNone)}</>;
  if (shown === 0) return <>{intl.formatMessage(messages.subAllWiped)}</>;

  if (counts.attention === 0 && counts.offline === 0) return <>{intl.formatMessage(SUBTITLE_SYNC[syncCheck])}</>;

  const lead = String(counts.online * 2 >= shown);
  if (counts.attention === 0) {
    return <FormattedMessage {...messages.subOffline} values={{ lead, offline: counts.offline, ...NUM_TAG }} />;
  }
  const reason = topReasonPhrase(intl, devices, issues, now);
  return (
    <FormattedMessage
      {...messages.subAttention}
      values={{
        lead,
        partial: String(syncCheck === 'partial'),
        attention: counts.attention,
        hasReason: String(!!reason),
        share: reason?.share ?? 'most',
        reason: reason?.phrase ?? '',
        offline: counts.offline,
        ...NUM_TAG,
      }}
    />
  );
}

/** "● Updated 20s ago": when the data last loaded (warn mark when the latest refresh failed). */
function UpdatedAt({ loadedAt, failed }: { loadedAt: number | null; failed: boolean }) {
  const intl = useIntl();
  if (loadedAt === null) return null;
  return (
    <span className="v2-ov-updated">
      <StatusDot tone={failed ? 'warn' : 'ok'} size={7} />
      <RelativeTime value={loadedAt} seconds prefix={intl.formatMessage(messages.updatedPrefix)} />
    </span>
  );
}

/* ---- stats beside the fleet bar ---------------------------------------------------------------------------------- */

function SyncStat({ summary, failed }: { summary: ConfigSyncSummary[] | null; failed: boolean }) {
  const intl = useIntl();
  if (!summary) {
    return (
      <StatCell
        label={intl.formatMessage(messages.syncLabel)}
        value="—"
        notes={[failed ? { text: intl.formatMessage(messages.syncFailed), tone: 'alert' } : { text: intl.formatMessage(messages.syncChecking) }]}
      />
    );
  }
  const t = summary.reduce(
    (a, s) => ({
      total: a.total + s.total,
      inSync: a.inSync + s.inSync,
      outOfSync: a.outOfSync + s.outOfSync,
      unsupported: a.unsupported + s.unsupported,
      neverSeen: a.neverSeen + s.neverSeen,
    }),
    { total: 0, inSync: 0, outOfSync: 0, unsupported: 0, neverSeen: 0 },
  );
  const notes: StatNote[] = [];
  if (t.outOfSync > 0) notes.push({ text: intl.formatMessage(messages.syncOutOfSync, { count: t.outOfSync }), tone: 'warn' });
  if (t.unsupported > 0) notes.push({ text: intl.formatMessage(messages.syncAgentTooOld, { count: t.unsupported }), tone: 'warn' });
  if (t.neverSeen > 0) notes.push({ text: intl.formatMessage(messages.syncNotReported, { count: t.neverSeen }) });
  if (t.total === 0) notes.push({ text: intl.formatMessage(messages.syncNoConfig) });
  else if (notes.length === 0) notes.push({ text: intl.formatMessage(messages.syncAll), tone: 'ok' });
  return <StatCell label={intl.formatMessage(messages.syncLabel)} value={t.inSync} of={`/${t.total}`} notes={notes.slice(0, 2)} />;
}

/** While an agent rollout runs: devices updated in its current stage (Settings → Agent rollout has the controls). */
function RolloutStat({ rollout }: { rollout: ActiveRollout }) {
  const intl = useIntl();
  const fleet = rollout.stage === 'fleet' ? rollout.progress.fleet : null;
  const c = fleet ?? rollout.progress.canary;
  const notes: StatNote[] = [{ text: intl.formatMessage(fleet ? messages.rolloutFleet : messages.rolloutCanary) }];
  if (c.pending > 0) notes.push({ text: intl.formatMessage(messages.rolloutInstalling, { count: c.pending }), tone: 'warn' });
  else if (c.outstanding > 0) notes.push({ text: intl.formatMessage(messages.rolloutQueued, { count: c.outstanding }) });
  else if (c.ineligible > 0) notes.push({ text: intl.formatMessage(messages.rolloutTooOld, { count: c.ineligible }) });
  return (
    <StatCell
      label={
        <Link to={SETTINGS_ROLLOUT} className="v2-ov-statlink">
          {intl.formatMessage(messages.rolloutLabel, { version: rollout.targetVersion })}
        </Link>
      }
      value={c.updated}
      of={`/${Math.max(c.total - c.ineligible, 0)}`}
      notes={notes}
    />
  );
}

/* ---- Needs attention ---------------------------------------------------------------------------------------------- */

function NeedsAttention({
  loading,
  unknown,
  rows,
  issues,
  now,
  syncCheck,
  hasDevices,
  allWiped,
}: {
  loading: boolean;
  unknown?: boolean;
  rows: DeviceView[];
  issues: Record<number, ConfigIssue>;
  now: number;
  syncCheck: SyncCheck;
  hasDevices: boolean;
  /** Every enrolled device was wiped: none is online, so "All clear" would say the opposite. */
  allWiped: boolean;
}) {
  const intl = useIntl();
  const toast = useToast();
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  // Syncing and rolling out write to devices (ext/core/access.ts): a role without edit_devices opens the device.
  const canEdit = usePermission(CORE_ACTION_ACCESS.editDevices);

  async function syncNow(d: DeviceView) {
    setBusy((b) => ({ ...b, [d.number]: true }));
    try {
      const { connected } = await forceSync(d.number);
      if (connected === false) {
        toast.push(
          'warn',
          intl.formatMessage(messages.notConnectedTitle, { number: d.number }),
          intl.formatMessage(messages.notConnectedBody),
        );
      } else {
        toast.push('ok', intl.formatMessage(messages.syncRequested), intl.formatMessage(messages.syncRequestedBody, { number: d.number }));
      }
    } catch (e) {
      toast.push('err', intl.formatMessage(messages.syncFailedToast), apiErrorText(intl, e));
    } finally {
      setBusy((b) => ({ ...b, [d.number]: false }));
    }
  }

  const shown = rows.slice(0, ATTENTION_ROWS);
  const items: AttentionItem[] = shown.map((d) => {
    const issue = isOnline(d.lastUpdate, now) ? issues[d.id] : undefined;
    const r = reasonFor(issue, intl);
    const reasonLabel = reasonText(intl, issue).text;
    const to = paths.device(d.number);
    const name = d.description || d.number;
    let action: ReactNode;
    if (r.action === 'sync' && canEdit) {
      action = (
        <Button size="sm" disabled={!!busy[d.number]} aria-label={intl.formatMessage(messages.syncNowNamed, { name })} onClick={() => void syncNow(d)}>
          {intl.formatMessage(busy[d.number] ? messages.syncing : messages.syncNow)}
        </Button>
      );
    } else if (r.action === 'agent' && canEdit) {
      action = (
        <ButtonLink size="sm" to={SETTINGS_ROLLOUT} aria-label={intl.formatMessage(messages.updateAgentNamed, { name })}>
          {intl.formatMessage(messages.updateAgent)}
        </ButtonLink>
      );
    }
    return {
      key: d.id,
      device: (
        <DeviceIdentity
          variant="attention"
          to={to}
          name={name}
          number={d.number}
          kind={deriveDeviceKind({ kioskMode: d.kioskMode, name: d.description })}
        />
      ),
      reason: reasonLabel,
      tone: r.tone,
      when: <RelativeTime value={d.lastUpdate} />,
      action,
    };
  });

  let body: ReactNode;
  if (loading) body = <SkeletonRows count={5} label={intl.formatMessage(messages.loadingAttention)} />;
  else if (unknown)
    body = (
      <EmptyState bare title={intl.formatMessage(messages.notKnown)}>
        {intl.formatMessage(messages.notKnownBody)}
      </EmptyState>
    );
  else if (!hasDevices)
    body = (
      <EmptyState bare title={intl.formatMessage(messages.noDevices)}>
        {intl.formatMessage(messages.noDevicesBody)}
      </EmptyState>
    );
  else if (allWiped)
    body = (
      <EmptyState bare title={intl.formatMessage(messages.noActive)}>
        {intl.formatMessage(messages.subAllWiped)}
      </EmptyState>
    );
  else if (items.length === 0)
    body = (
      <EmptyState bare icon={<IconCheck />} title={intl.formatMessage(syncCheck === 'complete' ? messages.allClear : messages.allOnline)}>
        {intl.formatMessage(SUBTITLE_SYNC[syncCheck])}
      </EmptyState>
    );
  else body = <AttentionList aria-label={intl.formatMessage(messages.attentionListLabel)} items={items} />;

  return (
    <Card padding="list" clip aria-labelledby="v2-ov-att" className="v2-ov-att">
      <CardHeader
        inset
        title={intl.formatMessage(messages.attentionTitle)}
        titleId="v2-ov-att"
        actions={
          !loading && rows.length > 0 ? (
            <CountMeta shown={shown.length} total={rows.length} to={`${paths.devices}?status=attention`} />
          ) : null
        }
      />
      {body}
    </Card>
  );
}

/* ---- By configuration ---------------------------------------------------------------------------------------------- */

interface ConfigRow {
  key: string;
  name: string;
  to?: string;
  count: number;
  segments: BarSegment[];
  note: string;
  tone: 'ok' | 'warn' | 'muted';
}

function ByConfiguration({
  devices,
  configurations,
  summary,
  loading,
  unknown,
}: {
  devices: DeviceView[];
  configurations: Record<string, ConfigurationLookup>;
  summary: ConfigSyncSummary[] | null;
  loading: boolean;
  unknown?: boolean;
}) {
  const intl = useIntl();
  const rows = useMemo<ConfigRow[]>(() => {
    // Devices per configuration from the device list (the classic card); sync detail from the summary when loaded.
    const byId = new Map<number, number>();
    let none = 0;
    for (const d of devices) {
      if (d.configurationId == null || !configurations[String(d.configurationId)]) none++;
      else byId.set(d.configurationId, (byId.get(d.configurationId) ?? 0) + 1);
    }
    const sums = new Map<number, ConfigSyncSummary>((summary ?? []).map((s) => [s.configurationId, s]));
    const ids = new Set<number>(byId.keys());
    for (const s of sums.values()) if (s.total > 0 && configurations[String(s.configurationId)]) ids.add(s.configurationId);
    const out: ConfigRow[] = [...ids].map((id) => {
      const s = sums.get(id);
      const stored = configurations[String(id)]?.name;
      const name = stored != null ? configName(intl, { id, name: stored }) : intl.formatMessage(messages.configurationFallback, { id });
      const to = paths.configuration(id);
      if (!s || s.total === 0) {
        return {
          key: String(id),
          name,
          to,
          count: byId.get(id) ?? 0,
          segments: [],
          note: wipedOnlyLine(s, intl) ?? intl.formatMessage(summary ? messages.syncNotReportedNote : messages.syncUnavailable),
          tone: 'muted',
        };
      }
      const parts = [s.inSync === s.total ? intl.formatMessage(messages.noteAllInSync) : intl.formatMessage(messages.noteInSync, { count: s.inSync })];
      if (s.outOfSync) parts.push(intl.formatMessage(messages.noteOutOfSync, { count: s.outOfSync }));
      if (s.unsupported) parts.push(intl.formatMessage(messages.noteAgentTooOld, { count: s.unsupported }));
      if (s.neverSeen) parts.push(intl.formatMessage(messages.noteNotReported, { count: s.neverSeen }));
      if (s.deferred) parts.push(intl.formatMessage(messages.noteDeferred, { count: s.deferred }));
      return {
        key: String(id),
        name,
        to,
        count: s.total,
        segments: [
          { value: s.inSync, tone: 'ok' },
          { value: s.outOfSync + s.unsupported, tone: 'warn' },
          { value: s.neverSeen, tone: 'pending' },
        ],
        note: parts.join(' · '),
        tone: s.outOfSync || s.unsupported || s.deferred ? 'warn' : s.inSync === s.total ? 'ok' : 'muted',
      };
    });
    out.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    if (none > 0) {
      out.push({
        key: 'none',
        name: intl.formatMessage(messages.noConfiguration),
        count: none,
        segments: [{ value: none, tone: 'pending' }],
        note: intl.formatMessage(messages.nothingAssigned, { count: none }),
        tone: 'muted',
      });
    }
    return out;
  }, [devices, configurations, summary, intl]);

  return (
    <Card aria-labelledby="v2-ov-cfg">
      <CardHeader
        spacing={8}
        title={intl.formatMessage(messages.byConfigTitle)}
        titleId="v2-ov-cfg"
        actions={<Link to={paths.configurations}>{intl.formatMessage(messages.manage)}</Link>}
      />
      {loading ? (
        <SkeletonFacts count={3} label={intl.formatMessage(messages.loadingConfigs)} />
      ) : unknown ? (
        <EmptyState bare title={intl.formatMessage(messages.notKnown)}>
          {intl.formatMessage(messages.byConfigUnknownBody)}
        </EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState bare title={intl.formatMessage(messages.noDevices)}>
          {intl.formatMessage(messages.byConfigEmptyBody)}
        </EmptyState>
      ) : (
        <ul className="v2-ov-cfgs">
          {rows.map((r) => (
            <li key={r.key} className="v2-ov-cfg">
              <div className="v2-ov-cfg__head">
                {r.to ? (
                  <Link to={r.to} className="v2-ov-cfg__name">
                    {r.name}
                  </Link>
                ) : (
                  <span className="v2-ov-cfg__name">{r.name}</span>
                )}
                <span className="v2-ov-cfg__count">{r.count}</span>
              </div>
              {r.segments.length > 0 ? <StackedBar segments={r.segments} /> : null}
              <span className={`v2-ov-cfg__note is-${r.tone}`}>{r.note}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ---- Recent activity ---------------------------------------------------------------------------------------------- */

type ActivityFilter = 'all' | 'commands' | 'events';


function RecentActivity({
  activity,
  appNames,
  unknown,
}: {
  activity: ActivityItem[] | null;
  appNames: Record<string, string>;
  unknown?: boolean;
}) {
  const intl = useIntl();
  const filters: ReadonlyArray<{ value: ActivityFilter; label: string }> = [
    { value: 'all', label: intl.formatMessage(messages.filterAll) },
    { value: 'commands', label: intl.formatMessage(messages.filterCommands) },
    { value: 'events', label: intl.formatMessage(messages.filterEvents) },
  ];
  const [filter, setFilter] = useState<ActivityFilter>('all');
  const rows = (activity ?? [])
    .filter((a) =>
      filter === 'all' ? true : filter === 'commands' ? a.ev.type === 'commandResult' : a.ev.type !== 'commandResult',
    )
    .slice(0, ACTIVITY_ROWS);

  let body: ReactNode;
  if (unknown)
    body = (
      <EmptyState bare title={intl.formatMessage(messages.notKnown)}>
        {intl.formatMessage(messages.activityUnknownBody)}
      </EmptyState>
    );
  else if (activity === null) body = <SkeletonRows count={6} compact label={intl.formatMessage(messages.loadingActivity)} />;
  else if (rows.length === 0)
    body = (
      <EmptyState bare title={intl.formatMessage(filter === 'commands' ? messages.noCommandResults : messages.noRecentEvents)}>
        {intl.formatMessage(filter === 'commands' ? messages.commandResultsBody : messages.recentEventsBody)}
      </EmptyState>
    );
  else
    body = (
      <ActivityList aria-label={intl.formatMessage(messages.activityListLabel)}>
        {rows.map((a) => {
          const v = eventView(a.ev, appNames, a.commands, intl);
          return (
            <ActivityRow
              key={a.key}
              icon={v.icon}
              tone={v.tone}
              who={a.device.number}
              whoTo={paths.device(a.device.number)}
              what={v.what}
              detail={v.detail}
              when={<RelativeTime value={a.ev.ts} />}
            />
          );
        })}
      </ActivityList>
    );

  return (
    <Card padding="list" clip aria-labelledby="v2-ov-act">
      <CardHeader
        inset
        title={intl.formatMessage(messages.activityTitle)}
        titleId="v2-ov-act"
        actions={<Segmented size="sm" aria-label={intl.formatMessage(messages.filterActivity)} options={filters} value={filter} onChange={setFilter} />}
      />
      {body}
    </Card>
  );
}

