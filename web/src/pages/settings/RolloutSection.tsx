import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FormattedMessage, defineMessages, useIntl, type IntlShape, type MessageDescriptor } from 'react-intl';
import { untyped } from '../../data/configIntl';
import { searchDevices, type DeviceView } from '../../api/devices';
import {
  cancelRollout,
  createRollout,
  getRolloutTargetSummary,
  promoteRollout,
  type ActiveRollout,
  type RolloutCounts,
  type RolloutTargetSummary,
} from '../../api/rollout';
import type { UpdateStatus } from '../../api/updates';
import { agoText } from '../../data/updateStatus';
import {
  Button,
  Callout,
  Card,
  CardHeader,
  Checkbox,
  ErrorState,
  IconAlert,
  Modal,
  RelativeTime,
  RolloutSteps,
  SearchInput,
  Skeleton,
  SkeletonRows,
  useStickyValue,
  type RolloutStep,
} from '../../ui';
import { CORE_ACTION_ACCESS } from '../../ext/core/access';
import { usePermission } from '../../ext/permissions';
import { rolloutActive, type RolloutState } from './hooks';
import { apiErrorText } from '../../api/apiErrorText';

const AGENT_PACKAGE = (import.meta.env.VITE_AGENT_PACKAGE as string) || 'com.mdmesh.agent';
/** Devices fetched per search in the canary picker (classic: one page of 200). */
const PICKER_PAGE = 200;
/** How often "current on every device" is checked again, so a device enrolled meanwhile brings the offer back. */
export const SUMMARY_POLL_MS = 30000;

const messages = untyped(defineMessages({
  errorActive: { id: 'rollout.error.active', defaultMessage: 'Another rollout is already running. Refresh to see it.' },
  errorCanaryEmpty: {
    id: 'rollout.error.canaryEmpty',
    defaultMessage: 'None of the chosen devices can take part. Pick devices you manage.',
  },
  errorSha256: {
    id: 'rollout.error.sha256',
    defaultMessage: 'This agent release has no complete SHA-256 checksum, so it can’t be rolled out.',
  },
  errorInvalid: {
    id: 'rollout.error.invalid',
    defaultMessage: 'This agent release is incomplete. Check for updates, then try again.',
  },
  errorStage: { id: 'rollout.error.stage', defaultMessage: 'The rollout has already moved on. The page now shows where it is.' },
  errorPermission: {
    id: 'rollout.error.permissionDenied',
    defaultMessage: 'Managing rollouts needs permission to edit devices and access to every device.',
  },
  errorUnknown: { id: 'rollout.error.unknown', defaultMessage: 'Something went wrong.' },
  noteUpdated: { id: 'rollout.cohort.updated', defaultMessage: '{count} updated' },
  noteInstalling: { id: 'rollout.cohort.installing', defaultMessage: '{count} installing' },
  noteWaiting: { id: 'rollout.cohort.waiting', defaultMessage: '{count} waiting to check in' },
  noteTooOld: {
    id: 'rollout.cohort.tooOld',
    defaultMessage: '{count, plural, one {# too old to update itself} other {# too old to update themselves}}',
  },
  hintNone: {
    id: 'rollout.promote.hintNone',
    defaultMessage: 'None of the canary devices can install the agent on their own. Cancel and pick others.',
  },
  hintDone: {
    id: 'rollout.promote.hintDone',
    defaultMessage: '{count, plural, one {The canary device has updated.} other {All # canary devices have updated.}}',
  },
  hintWaitOne: { id: 'rollout.promote.hintWaitOne', defaultMessage: 'Available once the canary device has updated.' },
  hintWaitTwo: { id: 'rollout.promote.hintWaitTwo', defaultMessage: 'Available once both canary devices have updated.' },
  hintWaitAll: { id: 'rollout.promote.hintWaitAll', defaultMessage: 'Available once all {count} canary devices have updated.' },
  step1: { id: 'rollout.step.one', defaultMessage: 'Step 1' },
  step2: { id: 'rollout.step.two', defaultMessage: 'Step 2' },
  canary: { id: 'rollout.step.canary', defaultMessage: 'Canary' },
  everyoneElse: { id: 'rollout.step.everyoneElse', defaultMessage: 'Everyone else' },
  stateDone: { id: 'rollout.state.done', defaultMessage: 'Done' },
  stateBlocked: { id: 'rollout.state.blocked', defaultMessage: 'Blocked' },
  stateInProgress: { id: 'rollout.state.inProgress', defaultMessage: 'In progress' },
  stateNotNeeded: { id: 'rollout.state.notNeeded', defaultMessage: 'Not needed' },
  stateWaiting: { id: 'rollout.state.waiting', defaultMessage: 'Waiting' },
  noOthers: { id: 'rollout.step.noOthers', defaultMessage: 'No other devices.' },
  ofOthers: { id: 'rollout.step.ofOtherDevices', defaultMessage: 'other devices' },
  allInCanary: { id: 'rollout.step.allInCanary', defaultMessage: 'Every device is in the canary.' },
  ofRest: { id: 'rollout.step.ofRest', defaultMessage: 'of the rest of the fleet' },
  ofUpdated: { id: 'rollout.step.ofUpdated', defaultMessage: 'of {total} updated' },
  startsOnPromote: { id: 'rollout.step.startsOnPromote', defaultMessage: 'Starts when you promote the rollout.' },
  pickerTitle: { id: 'rollout.picker.title', defaultMessage: 'Choose canary devices' },
  pickerDescription: {
    id: 'rollout.picker.description',
    defaultMessage: 'They get agent {version} first. Once they’ve updated, you promote it to everyone else.',
  },
  pickerSelected: {
    id: 'rollout.picker.selected',
    defaultMessage: '{count, plural, one {# device selected} other {# devices selected}}',
  },
  cancel: { id: 'rollout.picker.cancel', defaultMessage: 'Cancel' },
  starting: { id: 'rollout.picker.starting', defaultMessage: 'Starting…' },
  startCanary: { id: 'rollout.picker.start', defaultMessage: 'Start canary ({count})' },
  searchLabel: { id: 'rollout.picker.searchLabel', defaultMessage: 'Search devices' },
  searchPlaceholder: { id: 'rollout.picker.searchPlaceholder', defaultMessage: 'Search by number or description' },
  devicesThing: { id: 'rollout.picker.loadThing', defaultMessage: 'devices' },
  devicesList: { id: 'rollout.picker.listLabel', defaultMessage: 'Devices' },
  // Read before a relative time ("seen 3m ago"); keeps its trailing space.
  seenPrefix: { id: 'rollout.picker.seenPrefix', defaultMessage: 'seen ' },
  noMatch: { id: 'rollout.picker.noMatch', defaultMessage: 'No devices match.' },
  noDevices: { id: 'rollout.picker.noDevices', defaultMessage: 'No devices enrolled yet.' },
  loadingDevices: { id: 'rollout.picker.loading', defaultMessage: 'Loading devices' },
  showing: {
    id: 'rollout.picker.showing',
    defaultMessage: 'Showing {shown} of {total} devices. Search to find others.',
  },
  title: { id: 'rollout.card.title', defaultMessage: 'Agent rollout' },
  subtitleFleet: {
    id: 'rollout.card.subtitleFleet',
    defaultMessage: 'Updating the agent to {version} on every device. Started {ago}.',
  },
  subtitleCanary: {
    id: 'rollout.card.subtitleCanary',
    defaultMessage:
      'Updating the agent to {version} on {count, plural, one {# canary device} other {# canary devices}} first, then the rest of the fleet. Started {ago}.',
  },
  finishRollout: { id: 'rollout.action.finish', defaultMessage: 'Finish rollout' },
  cancelRollout: { id: 'rollout.action.cancel', defaultMessage: 'Cancel rollout' },
  refreshFailed: { id: 'rollout.load.refreshFailed', defaultMessage: 'Couldn’t refresh the rollout: {error}' },
  wholeFleetDone: {
    id: 'rollout.hint.wholeFleetDone',
    defaultMessage: 'Every device is in the canary, so there is no one to promote to. Finish the rollout to close it.',
  },
  wholeFleetWaiting: {
    id: 'rollout.hint.wholeFleetWaiting',
    defaultMessage: 'Every device is in the canary. The rollout closes once they’ve updated; if one can’t, finish it.',
  },
  promote: { id: 'rollout.action.promoteToEveryone', defaultMessage: 'Promote to everyone else' },
  fleetDone: {
    id: 'rollout.hint.fleetDone',
    defaultMessage: 'Every device that can update has the new agent. Finish the rollout to close it.',
  },
  fleetWaiting: {
    id: 'rollout.hint.fleetWaiting',
    defaultMessage: 'Devices that are offline get the update when they next check in. Finish the rollout once you’re done.',
  },
  checking: { id: 'rollout.card.loading', defaultMessage: 'Checking for a rollout' },
  current: {
    id: 'rollout.start.current',
    defaultMessage: 'Agent {version} is current on every device that can update itself.',
  },
  ready: { id: 'rollout.start.ready', defaultMessage: 'Agent {version} is ready to roll out' },
  readyHelp: {
    id: 'rollout.start.help',
    defaultMessage: 'Pick a few canary devices to update first. Once they’ve updated, promote it to everyone else.',
  },
  rollOut: { id: 'rollout.start.button', defaultMessage: 'Roll out agent' },
  none: {
    id: 'rollout.start.none',
    defaultMessage:
      'No rollout is running. Each verified server release brings a new agent; once the updater has downloaded it, you can roll it out to devices here.',
  },
  promoteTitle: { id: 'rollout.promote.title', defaultMessage: 'Promote to everyone else?' },
  notYet: { id: 'rollout.promote.notYet', defaultMessage: 'Not yet' },
  promoting: { id: 'rollout.promote.promoting', defaultMessage: 'Promoting…' },
  promoteButton: { id: 'rollout.promote.button', defaultMessage: 'Promote' },
  promoteText: {
    id: 'rollout.promote.text',
    defaultMessage:
      'Agent {version} is sent to every other device that can install it. Devices that are offline get it when they next check in.',
  },
  finishTitle: { id: 'rollout.stop.finishTitle', defaultMessage: 'Finish this rollout?' },
  cancelTitle: { id: 'rollout.stop.cancelTitle', defaultMessage: 'Cancel this rollout?' },
  keepRunning: { id: 'rollout.stop.keepRunning', defaultMessage: 'Keep it running' },
  stopping: { id: 'rollout.stop.stopping', defaultMessage: 'Stopping…' },
  stopRemaining: {
    id: 'rollout.stop.remaining',
    defaultMessage:
      '{count, plural, one {# device hasn’t} other {# devices haven’t}} updated yet and stop being offered agent {version}.',
  },
  stopText: {
    id: 'rollout.stop.text',
    defaultMessage: 'Installs already under way finish on their own, and devices that updated keep the new agent.',
  },
}));

/** Server error keys (RolloutResource) in words. Anything else is shown as the server sent it. */
const ROLLOUT_ERRORS: Record<string, MessageDescriptor> = {
  'error.rollout.active': messages.errorActive,
  'error.rollout.canary.empty': messages.errorCanaryEmpty,
  'error.rollout.sha256': messages.errorSha256,
  'error.rollout.invalid': messages.errorInvalid,
  'error.rollout.stage': messages.errorStage,
  'error.permission.denied': messages.errorPermission,
};
const rolloutError = (e: unknown, intl: IntlShape) => {
  const m = apiErrorText(intl, e);
  if (!m) return intl.formatMessage(messages.errorUnknown);
  return Object.prototype.hasOwnProperty.call(ROLLOUT_ERRORS, m) ? intl.formatMessage(ROLLOUT_ERRORS[m]) : m;
};

const eligibleOf = (c: RolloutCounts) => Math.max(0, c.total - c.ineligible);
const cohortDone = (c: RolloutCounts) => eligibleOf(c) > 0 && c.pending === 0 && c.outstanding === 0;

/** "1 updated · 1 installing · 2 waiting to check in · 1 too old to update itself". */
function cohortNote(c: RolloutCounts, intl: IntlShape): string {
  const m = messages;
  const parts = [intl.formatMessage(m.noteUpdated, { count: c.updated })];
  if (c.pending > 0) parts.push(intl.formatMessage(m.noteInstalling, { count: c.pending }));
  if (c.outstanding > 0) parts.push(intl.formatMessage(m.noteWaiting, { count: c.outstanding }));
  if (c.ineligible > 0) parts.push(intl.formatMessage(m.noteTooOld, { count: c.ineligible }));
  return parts.join(' · ');
}

function promoteHint(c: RolloutCounts, intl: IntlShape): string {
  const m = messages;
  const n = eligibleOf(c);
  if (n === 0) return intl.formatMessage(m.hintNone);
  if (cohortDone(c)) return intl.formatMessage(m.hintDone, { count: n });
  if (n === 1) return intl.formatMessage(m.hintWaitOne);
  if (n === 2) return intl.formatMessage(m.hintWaitTwo);
  return intl.formatMessage(m.hintWaitAll, { count: n });
}

/** A canary-stage rollout whose canary is every device: there is nobody to promote to, so it can only be finished. */
const wholeFleetCanary = (r: ActiveRollout) => r.stage === 'canary' && r.progress.others === 0;

function steps(r: ActiveRollout, wholeFleet: boolean, intl: IntlShape): RolloutStep[] {
  const m = messages;
  const t = (d: MessageDescriptor) => intl.formatMessage(d);
  const c = r.progress.canary;
  const f = r.progress.fleet;
  const canaryOk = cohortDone(c) || r.stage === 'fleet';
  const out: RolloutStep[] = [
    {
      key: 'canary',
      step: t(m.step1),
      name: t(m.canary),
      state: t(canaryOk ? m.stateDone : eligibleOf(c) === 0 ? m.stateBlocked : m.stateInProgress),
      stateTone: canaryOk ? 'ok' : 'warn',
      active: r.stage === 'canary',
      done: c.updated,
      busy: c.pending,
      total: eligibleOf(c),
      ofLabel: intl.formatMessage(m.ofUpdated, { total: eligibleOf(c) }),
      note: cohortNote(c, intl),
    },
  ];
  if (r.stage === 'fleet' && f) {
    const fe = eligibleOf(f);
    const done = cohortDone(f) || (fe === 0 && f.total === 0);
    out.push({
      key: 'fleet',
      step: t(m.step2),
      name: t(m.everyoneElse),
      state: t(done ? m.stateDone : m.stateInProgress),
      stateTone: done ? 'ok' : 'warn',
      active: true,
      done: f.updated,
      busy: f.pending,
      total: fe,
      ofLabel: intl.formatMessage(m.ofUpdated, { total: fe }),
      note: f.total === 0 ? t(m.noOthers) : cohortNote(f, intl),
    });
  } else if (wholeFleet) {
    out.push({
      key: 'fleet',
      step: t(m.step2),
      name: t(m.everyoneElse),
      state: t(m.stateNotNeeded),
      stateTone: 'muted',
      done: 0,
      total: 0,
      ofLabel: t(m.ofOthers),
      note: t(m.allInCanary),
    });
  } else {
    out.push({
      key: 'fleet',
      step: t(m.step2),
      name: t(m.everyoneElse),
      state: t(m.stateWaiting),
      stateTone: 'muted',
      done: 0,
      total: null,
      ofLabel: t(m.ofRest),
      note: t(m.startsOnPromote),
    });
  }
  return out;
}

/* ---- canary picker ---------------------------------------------------------------------------------------- */

function CanaryPicker({
  open,
  version,
  busy,
  error,
  onCancel,
  onStart,
}: {
  open: boolean;
  version: string;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onStart: (numbers: string[]) => void;
}) {
  const [query, setQuery] = useState('');
  const [devices, setDevices] = useState<DeviceView[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<Map<string, DeviceView>>(new Map());
  const [retry, setRetry] = useState(0);
  const seq = useRef(0);
  const intl = useIntl();
  const m = messages;

  useEffect(() => {
    if (!open) return;
    const id = ++seq.current;
    const t = setTimeout(
      () => {
        setLoading(true);
        setLoadErr(null);
        searchDevices({ value: query.trim(), pageSize: PICKER_PAGE })
          .then((r) => {
            if (id !== seq.current) return;
            setDevices(r.devices?.items ?? []);
            setTotal(r.devices?.totalItemsCount ?? 0);
          })
          .catch((e) => {
            if (id === seq.current) setLoadErr(apiErrorText(intl, e));
          })
          .finally(() => {
            if (id === seq.current) setLoading(false);
          });
      },
      query ? 250 : 0,
    );
    return () => clearTimeout(t);
  }, [open, query, retry]);

  const toggle = (d: DeviceView) =>
    setSelected((s) => {
      const next = new Map(s);
      if (next.has(d.number)) next.delete(d.number);
      else next.set(d.number, d);
      return next;
    });

  const n = selected.size;
  return (
    <Modal
      open={open}
      onClose={() => !busy && onCancel()}
      dismissOnBackdrop={false}
      size="md"
      title={intl.formatMessage(m.pickerTitle)}
      description={
        <FormattedMessage {...m.pickerDescription} values={{ version: <span className="v2-num">{version}</span> }} />
      }
      footer={
        <>
          <span className="v2-settings-picker__count" aria-live="polite">
            {intl.formatMessage(m.pickerSelected, { count: n })}
          </span>
          <Button size="lg" onClick={onCancel} disabled={busy}>
            {intl.formatMessage(m.cancel)}
          </Button>
          <Button variant="primary" size="lg" onClick={() => onStart(Array.from(selected.keys()))} disabled={busy || n === 0}>
            {busy ? intl.formatMessage(m.starting) : intl.formatMessage(m.startCanary, { count: n })}
          </Button>
        </>
      }
    >
      <div className="v2-settings-picker">
        <SearchInput
          value={query}
          onChange={setQuery}
          aria-label={intl.formatMessage(m.searchLabel)}
          placeholder={intl.formatMessage(m.searchPlaceholder)}
        />
        {error ? (
          <Callout tone="alert" role="alert" icon={<IconAlert />}>
            {error}
          </Callout>
        ) : null}
        {loadErr !== null ? (
          <ErrorState thing={intl.formatMessage(m.devicesThing)} detail={loadErr || undefined} onRetry={() => setRetry((r) => r + 1)} retrying={loading} />
        ) : null}
        <ul className="v2-settings-picker__list" aria-label={intl.formatMessage(m.devicesList)} aria-busy={loading || undefined}>
          {devices.map((d) => (
            <li key={d.id}>
              <Checkbox
                checked={selected.has(d.number)}
                onChange={() => toggle(d)}
                label={
                  <span className="v2-settings-picker__dev">
                    <span className="v2-mono">{d.number}</span>
                    {d.description ? <span className="v2-settings-picker__desc">{d.description}</span> : null}
                    {d.lastUpdate ? (
                      <RelativeTime value={d.lastUpdate} prefix={intl.formatMessage(m.seenPrefix)} className="v2-settings-picker__seen" />
                    ) : null}
                  </span>
                }
              />
            </li>
          ))}
        </ul>
        {!loading && loadErr === null && devices.length === 0 ? (
          <p className="v2-settings-muted">{intl.formatMessage(query ? m.noMatch : m.noDevices)}</p>
        ) : null}
        {loading && devices.length === 0 ? <SkeletonRows count={4} compact label={intl.formatMessage(m.loadingDevices)} /> : null}
        {total > devices.length ? (
          <p className="v2-settings-muted">
            {intl.formatMessage(m.showing, { shown: devices.length, total })}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}

/* ---- section ---------------------------------------------------------------------------------------------- */

type Confirm = 'promote' | 'cancel' | null;

/** Settings → Agent rollout: canary devices first, then promote to everyone else; finish or cancel. */
export function RolloutSection({
  id,
  ro,
  status,
  statusLoaded,
}: {
  id: string;
  ro: RolloutState;
  status: UpdateStatus | null;
  statusLoaded: boolean;
}) {
  const { rollout, loaded, loadError } = ro;
  const active = rolloutActive(rollout) ? rollout : null;
  const apk = status?.apk ?? null;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  // A rollout that ends (here or elsewhere) takes its open confirmation with it, so it can't reopen on the next one.
  const hasActive = !!active;
  useEffect(() => {
    if (!hasActive) setConfirm(null);
  }, [hasActive]);
  const [picking, setPicking] = useState(false);
  // Each opening of the picker starts blank (a new key); closed, it stays mounted to animate out.
  const [pickSession, setPickSession] = useState(0);
  const [pickErr, setPickErr] = useState<string | null>(null);
  const [summary, setSummary] = useState<RolloutTargetSummary | null>(null);
  const summaryRequest = useRef(0);
  // Starting, promoting and stopping a rollout queue commands on the whole fleet (ext/core/access.ts): a role without
  // edit_devices, or a user limited to some device groups, sees the rollout without its buttons.
  const canEdit = usePermission(CORE_ACTION_ACCESS.rollout);
  const intl = useIntl();
  const m = messages;
  const num = (text: string | undefined) => <span className="v2-num">{text}</span>;
  // A canary of every device can only be finished. Whole-fleet reach comes with canEdit, so for an editor `others`
  // counts the whole fleet; a user limited to some groups may simply not see the other devices.
  const wholeFleet = canEdit && !!active && wholeFleetCanary(active);
  const items = useMemo(() => (active ? steps(active, wholeFleet, intl) : []), [active, wholeFleet, intl]);

  const refreshSummary = useCallback(() => {
    const request = ++summaryRequest.current;
    if (!apk?.available) {
      setSummary(null);
      return;
    }
    return getRolloutTargetSummary(apk.version)
      .then((next) => { if (request === summaryRequest.current) setSummary(next); })
      .catch(() => { if (request === summaryRequest.current) setSummary(null); });
  }, [apk?.available, apk?.version]);

  // A rollout can finish during Settings' normal polling. Its target summary must be refreshed
  // when that active rollout disappears, otherwise the old incomplete summary offers it again.
  useEffect(() => {
    void refreshSummary();
  }, [refreshSummary, active?.id]);

  // Nothing polls while no rollout runs, so check "current on every device" again now and then: a device enrolled
  // since, on an older agent, brings the start-rollout offer back without a reload.
  const current = !active && !!summary?.complete;
  useEffect(() => {
    if (!current) return;
    const t = setInterval(() => {
      if (document.visibilityState !== 'hidden') void refreshSummary();
    }, SUMMARY_POLL_MS);
    return () => clearInterval(t);
  }, [current, refreshSummary]);

  const start = async (numbers: string[]) => {
    if (!apk) return;
    setBusy(true);
    setPickErr(null);
    try {
      const created = await createRollout({
        targetVersion: apk.version,
        packageName: AGENT_PACKAGE,
        apkVersionCode: apk.versionCode,
        apkSha256: apk.sha256,
        canaryDeviceNumbers: numbers,
      });
      ro.set(created);
      setPicking(false);
      setErr(null);
      void ro.refresh();
    } catch (e) {
      setPickErr(rolloutError(e, intl));
    } finally {
      setBusy(false);
    }
  };

  const promote = async () => {
    if (!active) return;
    setBusy(true);
    setErr(null);
    try {
      ro.set(await promoteRollout(active.id));
      void ro.refresh();
    } catch (e) {
      setErr(rolloutError(e, intl));
      void ro.refresh();
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const stop = async () => {
    if (!active) return;
    setBusy(true);
    setErr(null);
    try {
      await cancelRollout(active.id);
      ro.set(null);
      void ro.refresh();
    } catch (e) {
      setErr(rolloutError(e, intl));
      void ro.refresh(); // show what the server has now, as a failed promote does
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const titleId = `${id}-title`;
  const fleet = active?.stage === 'fleet';
  // Finish, not Cancel or Promote: the fleet stage, or a canary of every device.
  const finishing = fleet || wholeFleet;
  const remaining = active
    ? (() => {
        const c = fleet ? active.progress.fleet : active.progress.canary;
        return c ? c.pending + c.outstanding : 0;
      })()
    : 0;
  // What the promote and stop dialogs say, kept while they animate closed (the rollout may be gone by then).
  const shownConfirm = useStickyValue(
    confirm && active ? { kind: confirm, finishing, remaining, version: active.targetVersion } : null,
  );

  return (
    <Card id={id} aria-labelledby={titleId} gap={12} className="v2-settings-card">
      {active ? (
        <CardHeader
          title={intl.formatMessage(m.title)}
          titleId={titleId}
          subtitle={
            <FormattedMessage
              {...(fleet ? m.subtitleFleet : m.subtitleCanary)}
              values={{
                version: num(active.targetVersion),
                count: eligibleOf(active.progress.canary),
                ago: agoText(active.createdAt, intl),
              }}
            />
          }
          actions={
            !canEdit ? undefined : finishing ? (
              <Button size="sm" onClick={() => setConfirm('cancel')} disabled={busy}>
                {intl.formatMessage(m.finishRollout)}
              </Button>
            ) : (
              <Button size="sm" variant="danger" onClick={() => setConfirm('cancel')} disabled={busy}>
                {intl.formatMessage(m.cancelRollout)}
              </Button>
            )
          }
        />
      ) : (
        <CardHeader title={intl.formatMessage(m.title)} titleId={titleId} />
      )}

      {loadError ? (
        <Callout tone="warn" icon={<IconAlert />}>
          {intl.formatMessage(m.refreshFailed, { error: rolloutError({ message: loadError }, intl) })}
        </Callout>
      ) : null}
      {err ? (
        <Callout tone="alert" role="alert" icon={<IconAlert />}>
          {err}
        </Callout>
      ) : null}

      {active ? (
        <>
          <RolloutSteps steps={items} />
          {finishing && !fleet ? (
            <p className="v2-settings-promote__hint">
              {intl.formatMessage(remaining === 0 ? m.wholeFleetDone : m.wholeFleetWaiting)}
            </p>
          ) : !fleet ? (
            <div className="v2-settings-promote">
              {canEdit ? (
                <Button
                  variant="primary"
                  disabled={busy || !cohortDone(active.progress.canary)}
                  onClick={() => setConfirm('promote')}
                >
                  {intl.formatMessage(m.promote)}
                </Button>
              ) : null}
              <span className="v2-settings-promote__hint">{promoteHint(active.progress.canary, intl)}</span>
            </div>
          ) : (
            <p className="v2-settings-promote__hint">
              {intl.formatMessage(remaining === 0 ? m.fleetDone : m.fleetWaiting)}
            </p>
          )}
        </>
      ) : !loaded || (!statusLoaded && !loadError) ? (
        <div className="v2-settings-skel" role="status">
          <span className="v2-visually-hidden">{intl.formatMessage(m.checking)}</span>
          <Skeleton width="60%" />
        </div>
      ) : apk?.available && summary?.complete ? (
        <p className="v2-settings-muted">
          <FormattedMessage {...m.current} values={{ version: num(apk.version) }} />
        </p>
      ) : apk?.available ? (
        <div className="v2-settings-start">
          <div className="v2-settings-start__text">
            <span className="v2-settings-start__label">
              <FormattedMessage {...m.ready} values={{ version: num(apk.version) }} />
            </span>
            <span className="v2-settings-start__help">
              {intl.formatMessage(m.readyHelp)}
            </span>
          </div>
          {canEdit ? (
            <Button
              variant="primary"
              onClick={() => {
                setPickErr(null);
                setPickSession((n) => n + 1);
                setPicking(true);
              }}
            >
              {intl.formatMessage(m.rollOut)}
            </Button>
          ) : null}
        </div>
      ) : (
        <p className="v2-settings-muted">
          {intl.formatMessage(m.none)}
        </p>
      )}

      {apk ? (
        <CanaryPicker
          key={pickSession}
          open={picking}
          version={apk.version}
          busy={busy}
          error={pickErr}
          onCancel={() => setPicking(false)}
          onStart={(nums) => void start(nums)}
        />
      ) : null}

      <Modal
        open={confirm === 'promote' && !!active}
        onClose={() => !busy && setConfirm(null)}
        size="sm"
        title={intl.formatMessage(m.promoteTitle)}
        footer={
          <>
            <Button size="lg" onClick={() => setConfirm(null)} disabled={busy}>
              {intl.formatMessage(m.notYet)}
            </Button>
            <Button variant="primary" size="lg" onClick={() => void promote()} disabled={busy}>
              {busy ? intl.formatMessage(m.promoting) : intl.formatMessage(m.promoteButton)}
            </Button>
          </>
        }
      >
        <p className="v2-settings-modal-text">
          <FormattedMessage {...m.promoteText} values={{ version: num(shownConfirm?.version) }} />
        </p>
      </Modal>

      <Modal
        open={confirm === 'cancel' && !!active}
        onClose={() => !busy && setConfirm(null)}
        role="alertdialog"
        size="sm"
        title={intl.formatMessage(shownConfirm?.finishing ? m.finishTitle : m.cancelTitle)}
        footer={
          <>
            <Button size="lg" onClick={() => setConfirm(null)} disabled={busy}>
              {intl.formatMessage(m.keepRunning)}
            </Button>
            {/* Stopping is not undone, but nothing is lost: devices keep what they installed (danger, not solid). */}
            <Button
              variant={shownConfirm?.finishing ? 'primary' : 'danger'}
              size="lg"
              onClick={() => void stop()}
              disabled={busy}
            >
              {busy
                ? intl.formatMessage(m.stopping)
                : intl.formatMessage(shownConfirm?.finishing ? m.finishRollout : m.cancelRollout)}
            </Button>
          </>
        }
      >
        <p className="v2-settings-modal-text">
          {shownConfirm && shownConfirm.remaining > 0
            ? `${intl.formatMessage(m.stopRemaining, { count: shownConfirm.remaining, version: shownConfirm.version })} `
            : ''}
          {intl.formatMessage(m.stopText)}
        </p>
      </Modal>
    </Card>
  );
}
