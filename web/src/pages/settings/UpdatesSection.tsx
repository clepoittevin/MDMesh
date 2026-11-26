import { useId, useMemo, useState, type ReactNode } from 'react';
import { FormattedMessage, defineMessages, useIntl, type IntlShape } from 'react-intl';
import { untyped } from '../../data/configIntl';
import { applyUpdate, checkForUpdates, setAutoUpdate, type UpdateActionResult, type UpdateStatus } from '../../api/updates';
import { apiErrorCodeText } from '../../api/apiErrorText';
import { useMayManageDeployment } from '../../auth/useMayManageDeployment';
import {
  Badge,
  Button,
  ButtonAnchor,
  Callout,
  Card,
  CardHeader,
  CopyField,
  IconAlert,
  IconCheck,
  IconInfo,
  IconShield,
  Modal,
  Notice,
  RelativeTime,
  Skeleton,
  Stepper,
  Toggle,
  Tooltip,
  cx,
  LinkButton,
} from '../../ui';
import { applyRunning, type SupervisorState } from '../../data/useSupervisor';
import { entrySize, parseReleaseEntries, type ReleaseEntry } from '../../data/releaseNotes';
import type { Block, NotesSection } from '../../whatsnew/changelog';
import { InlineText, NotesList } from '../../whatsnew/NotesView';
import {
  agoText,
  applyPhaseLabel,
  lastCheckError,
  missedSecurity,
  missedSecurityLink,
  missedSecurityText,
  safeReleaseUrl,
} from '../../data/updateStatus';

/** Apply phases in order (supervisor APPLY_PHASES before `done`). */
const PHASES = ['authorizing', 'backup', 'pull', 'recreate', 'healthcheck'] as const;

const messages = untyped(defineMessages({
  stepAuthorize: { id: 'updates.step.authorize', defaultMessage: 'Authorize' },
  stepBackup: { id: 'updates.step.backup', defaultMessage: 'Back up' },
  stepDownload: { id: 'updates.step.download', defaultMessage: 'Download' },
  stepRestart: { id: 'updates.step.restart', defaultMessage: 'Restart' },
  stepHealthcheck: { id: 'updates.step.healthcheck', defaultMessage: 'Health check' },
  autoLocked: {
    id: 'updates.auto.locked',
    defaultMessage: 'Only a super-admin, or the admin of a single-customer install, can change this.',
  },
  manualDocker: { id: 'updates.manual.docker', defaultMessage: 'Docker, installed from source' },
  manualNative: { id: 'updates.manual.native', defaultMessage: 'Native install' },
  manualCommand: { id: 'updates.manual.commandLabel', defaultMessage: '{label} update command' },
  // The release's channel as a label ("Stable channel").
  channelLabel: {
    id: 'updates.ready.channel',
    defaultMessage: '{channel, select, stable {Stable channel} beta {Beta channel} other {{name} channel}}',
  },
  releasedOn: { id: 'updates.ready.releasedOn', defaultMessage: 'released {date}' },
  notesVersion: { id: 'updates.notes.version', defaultMessage: 'Version {version}' },
  notesTitle: { id: 'updates.notes.title', defaultMessage: 'Release notes' },
  notesSecurity: { id: 'updates.notes.securityFixes', defaultMessage: 'Security fixes' },
  notesShowLess: { id: 'updates.notes.showLess', defaultMessage: 'Show less' },
  notesShowAll: { id: 'updates.notes.showAll', defaultMessage: 'Show all notes ({count})' },
  checkFailed: { id: 'updates.check.failed', defaultMessage: 'Couldn’t check for updates. Try again in a minute.' },
  applyNotStarted: { id: 'updates.apply.notStarted', defaultMessage: 'The update did not start.' },
  applyNotStartedDetail: { id: 'updates.apply.notStartedDetail', defaultMessage: 'The update did not start: {error}' },
  autoSaveFailedDetail: { id: 'updates.auto.saveFailedDetail', defaultMessage: 'Could not save: {error}' },
  autoSaveFailed: { id: 'updates.auto.saveFailed', defaultMessage: 'Could not save.' },
  title: { id: 'updates.card.title', defaultMessage: 'Updates' },
  // Read before a relative time ("Checked 5 minutes ago"); keeps its trailing space.
  checkedPrefix: { id: 'updates.check.checkedPrefix', defaultMessage: 'Checked ' },
  notChecked: { id: 'updates.check.notChecked', defaultMessage: 'Not checked yet' },
  checking: { id: 'updates.check.checking', defaultMessage: 'Checking…' },
  checkNow: { id: 'updates.check.now', defaultMessage: 'Check now' },
  retry: { id: 'updates.card.retry', defaultMessage: 'Retry' },
  loading: { id: 'updates.card.loading', defaultMessage: 'Checking for updates' },
  unreachable: {
    id: 'updates.card.unreachable',
    defaultMessage:
      'The updater isn’t reachable, so this console can’t check for or install updates. It runs next to the server (the {service} service) and serves {path}.',
  },
  stale: {
    id: 'updates.card.stale',
    defaultMessage: 'Can’t reach the updater right now. Showing the last state it reported.',
  },
  lastCheckFailed: { id: 'updates.check.lastFailed', defaultMessage: 'The last check failed: {error}' },
  applyDidntStart: { id: 'updates.apply.didntStart', defaultMessage: 'The update didn’t start: {error}' },
  updatingTo: { id: 'updates.apply.updatingTo', defaultMessage: 'Updating to MDMesh {version}' },
  startedAuto: { id: 'updates.apply.startedAutomatically', defaultMessage: 'Started automatically' },
  progressLabel: { id: 'updates.apply.progressLabel', defaultMessage: 'Update progress' },
  startedAgo: { id: 'updates.apply.startedAgo', defaultMessage: 'Started {ago}.' },
  restartHelp: {
    id: 'updates.apply.restartHelp',
    defaultMessage:
      'The console may stop answering for a minute while the server restarts. This page keeps checking and catches up on its own.',
  },
  rolledBackTitle: { id: 'updates.failed.rolledBackTitle', defaultMessage: 'The update to {version} was rolled back' },
  failedTitle: { id: 'updates.failed.title', defaultMessage: 'The update to {version} failed' },
  rolledBackHelp: {
    id: 'updates.failed.rolledBackHelp',
    defaultMessage: 'It didn’t pass its checks, so the server went back to {version} and its database backup.',
  },
  failedHelp: {
    id: 'updates.failed.help',
    defaultMessage: 'It stopped and could not roll back on its own. Recovery can roll back to the backup or retry.',
  },
  finishedAgo: { id: 'updates.failed.finishedAgo', defaultMessage: 'Finished {ago}.' },
  openRecovery: { id: 'updates.failed.openRecovery', defaultMessage: 'Open recovery' },
  doneText: {
    id: 'updates.done.text',
    defaultMessage: 'Updated to MDMesh {version} {ago}. Reload to use the new console.',
  },
  reload: { id: 'updates.done.reload', defaultMessage: 'Reload' },
  missingSecurity: { id: 'updates.security.noticeTitle', defaultMessage: 'Missing security fixes' },
  readyTitle: { id: 'updates.ready.title', defaultMessage: 'MDMesh {version} is ready' },
  signatureVerified: { id: 'updates.ready.signatureVerified', defaultMessage: 'Signature verified' },
  signatureNotVerified: { id: 'updates.ready.signatureNotVerified', defaultMessage: 'Signature not verified' },
  updateButton: { id: 'updates.ready.updateButton', defaultMessage: 'Update server and console' },
  fullNotes: { id: 'updates.ready.fullNotes', defaultMessage: 'Full release notes ↗' },
  onlyAdmin: {
    id: 'updates.ready.onlyAdmin',
    defaultMessage: 'Only a super-admin, or the admin of a single-customer install, can update.',
  },
  takesAbout: {
    id: 'updates.ready.takesAbout',
    defaultMessage:
      'Takes about 2 minutes. The database is backed up first, and devices keep working while the console restarts.',
  },
  cantInstall: {
    id: 'updates.ready.unverifiedCantInstall',
    defaultMessage: 'The release signature could not be verified, so it can’t be installed.',
  },
  manualHelp: {
    id: 'updates.manual.help',
    defaultMessage:
      'This server can’t update itself: it was installed from source or with the native installer. Update it from the server’s shell, in the MDMesh folder:',
  },
  apkCarried: {
    id: 'updates.ready.apkCarried',
    defaultMessage: 'The release carries agent {version}. <link>Roll it out to devices</link> after the server update.',
  },
  latest: {
    id: 'updates.upToDate.latest',
    defaultMessage: 'MDMesh {version} is the latest release{hasChannel, select, true { on the {channel} channel} other {}}.',
  },
  unverifiedFound: {
    id: 'updates.upToDate.unverifiedFound',
    defaultMessage:
      'MDMesh {version} was found, but its signature couldn’t be verified, so it won’t be offered or installed.',
  },
  autoLabel: { id: 'updates.auto.label', defaultMessage: 'Install updates automatically' },
  autoHelp: {
    id: 'updates.auto.help',
    defaultMessage: 'Verified releases install within a few hours of release. Unverified releases never install on their own.',
  },
  autoSkipped: {
    id: 'updates.auto.skipped',
    defaultMessage: 'Automatic updates won’t install {version} again, because its last update failed or was rolled back.',
  },
  autoSkippedManage: {
    id: 'updates.auto.skippedManage',
    defaultMessage: 'Update installs it by hand; a newer release installs on its own.',
  },
  autoSkippedOther: { id: 'updates.auto.skippedOther', defaultMessage: 'A newer release installs on its own.' },
  confirmTitle: { id: 'updates.confirm.title', defaultMessage: 'Update to MDMesh {version}?' },
  cancel: { id: 'updates.confirm.cancel', defaultMessage: 'Cancel' },
  starting: { id: 'updates.confirm.starting', defaultMessage: 'Starting…' },
  updateNow: { id: 'updates.confirm.updateNow', defaultMessage: 'Update now' },
  confirmText: {
    id: 'updates.confirm.text',
    defaultMessage:
      'The server and console restart, which takes about 2 minutes. The database is backed up first, and the update rolls back on its own if it fails. Devices keep working and reconnect when the server is back.',
  },
}));

const PHASE_STEP = {
  authorizing: messages.stepAuthorize,
  backup: messages.stepBackup,
  pull: messages.stepDownload,
  recreate: messages.stepRestart,
  healthcheck: messages.stepHealthcheck,
} as const;
/** Source installs (APPLY_SUPPORTED=0) update from the shell: the documented commands (README, classic Settings). */
const MANUAL_STEPS = [
  { label: messages.manualDocker, cmd: './setup.sh --update' },
  { label: messages.manualNative, cmd: 'sudo ./setup.sh --update --native' },
] as const;

const DONE_NOTICE_MS = 24 * 60 * 60 * 1000;

const SHORT_DATE = { day: 'numeric', month: 'short', year: 'numeric' } as const;

function releasedOn(iso: string | null | undefined, intl: IntlShape): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return intl.formatDate(t, SHORT_DATE);
}

function channelLabel(ch: string | null | undefined, intl: IntlShape): string | null {
  if (!ch) return null;
  return intl.formatMessage(messages.channelLabel, { channel: ch, name: `${ch.charAt(0).toUpperCase()}${ch.slice(1)}` });
}

/** Up to this many items per group, and no Under the hood, while the notes are folded. */
const FOLDED_ITEMS = 3;
/** Notes longer than this (items and paragraphs, all entries) start folded. */
const FOLD_OVER = 6;

/** "22 Oct 2026" from a heading's date or an ISO time. */
function noteDate(d: string | null, intl: IntlShape): string | null {
  if (!d) return null;
  const t = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T12:00:00` : d);
  return Number.isFinite(t) ? intl.formatDate(t, SHORT_DATE) : null;
}

const noNavigation = () => {};
function NotesBlocks({ blocks, folded }: { blocks: Block[]; folded: boolean }) {
  return (
    <>
      {blocks.map((b, i) =>
        b.kind === 'list' ? (
          <NotesList
            key={i}
            items={folded ? b.items.slice(0, FOLDED_ITEMS) : b.items}
            onNavigate={noNavigation}
            className="v2-relnotes__list"
            links="feed"
          />
        ) : (
          <p key={i} className="v2-relnotes__p">
            <InlineText text={b.text} onNavigate={noNavigation} links="feed" />
          </p>
        ),
      )}
    </>
  );
}

const groupSize = (g: NotesSection) => g.blocks.reduce((n, b) => n + (b.kind === 'list' ? b.items.length : 1), 0);

/** One release: version and date, its one-line summary, then its items grouped under New, Fixes, Security and so on. */
function ReleaseNotesEntry({ entry, folded }: { entry: ReleaseEntry; folded: boolean }) {
  const headId = useId();
  const intl = useIntl();
  const date = noteDate(entry.date, intl);
  const groups = folded ? entry.groups.filter((g) => g.kind !== 'underTheHood') : entry.groups;
  return (
    <article className="v2-relnotes__entry" aria-labelledby={headId}>
      <header className="v2-relnotes__head">
        <h3 id={headId} className="v2-relnotes__version">
          {entry.version ? (
            <FormattedMessage
              {...messages.notesVersion}
              values={{ version: <span className="v2-num">{entry.version}</span> }}
            />
          ) : (
            intl.formatMessage(messages.notesTitle)
          )}
        </h3>
        {date ? <span className="v2-relnotes__date">{date}</span> : null}
        {entry.security ? (
          <Badge tone="alert" size="sm">
            {intl.formatMessage(messages.notesSecurity)}
          </Badge>
        ) : null}
      </header>
      {entry.headline ? (
        <p className="v2-relnotes__headline">
          <InlineText text={entry.headline} onNavigate={noNavigation} links="feed" />
        </p>
      ) : null}
      {!folded && entry.intro.length ? <NotesBlocks blocks={entry.intro} folded={false} /> : null}
      {groups.map((g, i) => (
        <div key={i} className="v2-relnotes__group">
          <h4 className="v2-eyebrow v2-relnotes__label">
            {g.title}
            <span className="v2-relnotes__count v2-num">{groupSize(g)}</span>
          </h4>
          <NotesBlocks blocks={g.blocks} folded={folded} />
        </div>
      ))}
    </article>
  );
}

/**
 * The ready release's notes as a short changelog: an entry per release, newest first. Long notes start folded (the
 * newest entry, a few items per group, no Under the hood) behind "Show all notes".
 */
function ReleaseNotes({ status }: { status: UpdateStatus }) {
  const entries = useMemo(
    () => parseReleaseEntries(status.release?.notes, status.latest, status.release?.publishedAt),
    [status.release?.notes, status.latest, status.release?.publishedAt],
  );
  const total = entries.reduce((n, e) => n + entrySize(e), 0);
  const long = total > FOLD_OVER || entries.length > 1;
  const [open, setOpen] = useState(false);
  const id = useId();
  const intl = useIntl();
  if (entries.length === 0) return null;
  const folded = long && !open;
  return (
    <div className="v2-relnotes-wrap">
      <div id={id} className="v2-relnotes">
        {(folded ? entries.slice(0, 1) : entries).map((e, i) => (
          <ReleaseNotesEntry key={i} entry={e} folded={folded} />
        ))}
      </div>
      {long ? (
        <LinkButton aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}>
          {open ? intl.formatMessage(messages.notesShowLess) : intl.formatMessage(messages.notesShowAll, { count: total })}
        </LinkButton>
      ) : null}
    </div>
  );
}

/** Settings → Updates: check, the ready release, apply with live progress, automatic updates. */
/** Why an apply or auto toggle failed: the supervisor's own text as sent, else the status in the console's words. */
function failureText(intl: IntlShape, r: UpdateActionResult): string {
  if (r.error) return r.error;
  if (r.httpStatus === undefined) return '';
  return apiErrorCodeText(intl, r.httpStatus === 0 ? 'network' : 'http', r.httpStatus);
}

export function UpdatesSection({
  id,
  sup,
  rolloutHref,
}: {
  id: string;
  sup: SupervisorState;
  /** In-page link to the agent rollout section. */
  rolloutHref: string;
}) {
  const { status: s, loaded, reachable } = sup;
  const [checking, setChecking] = useState(false);
  const [checkMsg, setCheckMsg] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [starting, setStarting] = useState(false);
  const [applyErr, setApplyErr] = useState<string | null>(null);
  const [autoSaving, setAutoSaving] = useState(false);
  const [autoErr, setAutoErr] = useState<string | null>(null);
  // The supervisor refuses checking, updating, rolling back and the switch to anyone but the admin who runs the install
  // (v0.3.8: a super-admin, or the org admin of a single-customer install; the server's deploymentAdmin). Anyone else
  // sees the status only.
  const canManage = useMayManageDeployment();
  const intl = useIntl();
  const m = messages;
  const ago = (ms: number) => agoText(ms, intl);
  const mono = (text: string) => <span className="v2-mono">{text}</span>;
  const num = (text: string | null | undefined) => <span className="v2-num">{text}</span>;
  const autoLockedReason = intl.formatMessage(m.autoLocked);

  const checkNow = async () => {
    setChecking(true);
    setCheckMsg(null);
    const x = await checkForUpdates();
    setChecking(false);
    if (x) sup.setStatus(x);
    else setCheckMsg(intl.formatMessage(m.checkFailed));
  };

  const applyNow = async () => {
    setStarting(true);
    setApplyErr(null);
    const r = await applyUpdate();
    setStarting(false);
    setConfirming(false);
    if (!r.ok) {
      // The supervisor's own reason is shown as it is (as before); a bare status gets the sentence around it.
      const why = failureText(intl, r);
      setApplyErr(r.error || (why ? intl.formatMessage(m.applyNotStartedDetail, { error: why }) : intl.formatMessage(m.applyNotStarted)));
    }
    void sup.refresh(); // shows the progress at once and polls every 3 s while it runs
  };

  const toggleAuto = async (next: boolean) => {
    setAutoSaving(true);
    setAutoErr(null);
    const r = await setAutoUpdate(next);
    setAutoSaving(false);
    if (!r.ok) {
      const why = failureText(intl, r);
      setAutoErr(why ? intl.formatMessage(m.autoSaveFailedDetail, { error: why }) : intl.formatMessage(m.autoSaveFailed));
      return;
    }
    sup.patch({ auto: next });
  };

  const apply = s?.apply ?? null;
  const running = applyRunning(s);
  const failed = !!apply && (apply.phase === 'failed' || apply.phase === 'rolled_back');
  const justDone =
    !!apply && apply.phase === 'done' && !!apply.finishedAt && Date.now() - apply.finishedAt < DONE_NOTICE_MS;
  const canApply = s?.applySupported !== false;
  const lastError = lastCheckError(s);
  const releaseUrl = safeReleaseUrl(s?.release?.url);
  const missed = missedSecurity(s);
  const missedLink = missedSecurityLink(missed, s?.release?.url, intl);

  const header = (
    <CardHeader
      title={intl.formatMessage(m.title)}
      titleId={`${id}-title`}
      actions={
        !loaded ? null : s ? (
          <>
            <span className="v2-settings-meta">
              {s.checkedAt ? (
                <RelativeTime value={s.checkedAt} style="long" prefix={intl.formatMessage(m.checkedPrefix)} />
              ) : (
                intl.formatMessage(m.notChecked)
              )}
            </span>
            {canManage ? (
              <Button size="sm" onClick={() => void checkNow()} disabled={checking || running}>
                {checking ? intl.formatMessage(m.checking) : intl.formatMessage(m.checkNow)}
              </Button>
            ) : null}
          </>
        ) : (
          <Button size="sm" onClick={() => void sup.refresh()}>
            {intl.formatMessage(m.retry)}
          </Button>
        )
      }
    />
  );

  return (
    <Card id={id} aria-labelledby={`${id}-title`} gap={12} className="v2-settings-card">
      {header}

      {!loaded ? (
        <div className="v2-settings-skel" role="status">
          <span className="v2-visually-hidden">{intl.formatMessage(m.loading)}</span>
          <Skeleton height="title" width="45%" />
          <Skeleton width="80%" />
        </div>
      ) : null}

      {loaded && !s ? (
        <Callout tone="info" icon={<IconInfo />}>
          <FormattedMessage {...m.unreachable} values={{ service: mono('supervisor'), path: mono('/update') }} />
        </Callout>
      ) : null}

      {s && !reachable ? (
        <p className="v2-settings-muted" role="status">
          {intl.formatMessage(m.stale)}
        </p>
      ) : null}

      {checkMsg ? (
        <Callout tone="alert" role="alert" icon={<IconAlert />}>
          {checkMsg}
        </Callout>
      ) : null}
      {s && lastError && !checkMsg ? (
        <Callout tone="warn" icon={<IconAlert />}>
          {intl.formatMessage(m.lastCheckFailed, { error: lastError })}
        </Callout>
      ) : null}
      {applyErr ? (
        <Callout tone="alert" role="alert" icon={<IconAlert />}>
          {intl.formatMessage(m.applyDidntStart, { error: applyErr })}
        </Callout>
      ) : null}

      {/* Apply in progress: live phase, polled every 3 s. */}
      {s && running && apply ? (
        <div className="v2-settings-upd v2-settings-upd--busy">
          <div className="v2-settings-upd__titleline">
            <span className="v2-settings-upd__title">
              <FormattedMessage {...m.updatingTo} values={{ version: num(apply.toVersion) }} />
            </span>
            {apply.trigger === 'auto' ? (
              <Badge tone="neutral" size="md">
                {intl.formatMessage(m.startedAuto)}
              </Badge>
            ) : null}
          </div>
          {apply.phase === 'rollback' ? null : (
            <Stepper
              aria-label={intl.formatMessage(m.progressLabel)}
              steps={PHASES.map((p) => intl.formatMessage(PHASE_STEP[p]))}
              current={Math.max(0, PHASES.indexOf(apply.phase as (typeof PHASES)[number]))}
            />
          )}
          <p className={cx('v2-settings-upd__line', apply.phase === 'rollback' && 'is-warn')} role="status" aria-live="polite">
            {applyPhaseLabel(apply.phase, intl)}
            {apply.startedAt ? ` ${intl.formatMessage(m.startedAgo, { ago: ago(apply.startedAt) })}` : null}
          </p>
          {apply.error ? <p className="v2-settings-upd__line is-warn">{apply.error}</p> : null}
          <p className="v2-settings-upd__help">
            {intl.formatMessage(m.restartHelp)}
          </p>
        </div>
      ) : null}

      {/* The last apply failed or rolled back. */}
      {s && failed && apply ? (
        <div className="v2-settings-upd v2-settings-upd--alert" role="alert">
          <span className="v2-settings-upd__title">
            <FormattedMessage
              {...(apply.phase === 'rolled_back' ? m.rolledBackTitle : m.failedTitle)}
              values={{ version: num(apply.toVersion) }}
            />
          </span>
          <p className="v2-settings-upd__help">
            {apply.phase === 'rolled_back' ? (
              <FormattedMessage {...m.rolledBackHelp} values={{ version: num(apply.fromVersion) }} />
            ) : (
              intl.formatMessage(m.failedHelp)
            )}
            {apply.finishedAt ? <> {intl.formatMessage(m.finishedAgo, { ago: ago(apply.finishedAt) })}</> : null}
          </p>
          {apply.error ? <p className="v2-settings-upd__error v2-mono">{apply.error}</p> : null}
          <div className="v2-settings-upd__actions">
            <ButtonAnchor href="/recovery" size="lg">
              {intl.formatMessage(m.openRecovery)}
            </ButtonAnchor>
          </div>
        </div>
      ) : null}

      {s && justDone && apply && !running ? (
        <Callout tone="ok" role="status" icon={<IconCheck />}>
          <span className="v2-settings-callout-row">
            <span>
              <FormattedMessage
                {...m.doneText}
                values={{ version: num(apply.toVersion), ago: ago(apply.finishedAt as number) }}
              />
            </span>
            <Button size="sm" onClick={() => window.location.reload()}>
              {intl.formatMessage(m.reload)}
            </Button>
          </span>
        </Callout>
      ) : null}

      {/* The offered release skips over security releases this server never got (the supervisor's missedSecurity, from
          the verified manifest). Amber, not red: nothing failed, and the update below includes the fixes. */}
      {s && s.latest && missed.length > 0 && !running ? (
        <Notice
          tone="warn"
          icon={<IconShield size={16} />}
          title={intl.formatMessage(m.missingSecurity)}
          className="v2-settings-secnotice"
          action={
            missedLink ? (
              <a className="v2-settings-link" href={missedLink.href} target="_blank" rel="noreferrer">
                {missedLink.label} ↗
              </a>
            ) : undefined
          }
        >
          <p>{missedSecurityText(missed, s.current, s.latest, intl)}</p>
        </Notice>
      ) : null}

      {/* A release is ready. */}
      {s && s.updateAvailable && s.latest && !running ? (
        <div className="v2-settings-upd v2-settings-upd--ready">
          <div className="v2-settings-upd__titleline">
            <span className="v2-settings-upd__title">
              <FormattedMessage {...m.readyTitle} values={{ version: num(s.latest) }} />
            </span>
            {s.verified ? (
              <Badge tone="ok" size="md" icon={<IconCheck size={12} />}>
                {intl.formatMessage(m.signatureVerified)}
              </Badge>
            ) : (
              <Badge tone="warn" size="md" icon={<IconAlert size={12} />}>
                {intl.formatMessage(m.signatureNotVerified)}
              </Badge>
            )}
            {channelLabel(s.channel, intl) || releasedOn(s.release?.publishedAt, intl) ? (
              <span className="v2-settings-meta">
                {[
                  channelLabel(s.channel, intl),
                  releasedOn(s.release?.publishedAt, intl) &&
                    intl.formatMessage(m.releasedOn, { date: releasedOn(s.release?.publishedAt, intl) }),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            ) : null}
          </div>

          <ReleaseNotes status={s} />

          {canApply ? (
            // Without the Update button, its help ("Takes about 2 minutes…") goes too, and a line says who can update;
            // the unverified warning stays.
            <div className="v2-settings-upd__actions">
              {canManage ? (
                <Button
                  variant="primary"
                  size="lg"
                  disabled={!s.verified || starting}
                  onClick={() => setConfirming(true)}
                >
                  {intl.formatMessage(m.updateButton)}
                </Button>
              ) : null}
              {releaseUrl ? (
                <a className="v2-settings-link" href={releaseUrl} target="_blank" rel="noreferrer">
                  {intl.formatMessage(m.fullNotes)}
                </a>
              ) : null}
              {!canManage ? (
                <span className="v2-settings-upd__help v2-settings-upd__sentence">
                  {intl.formatMessage(m.onlyAdmin)}
                </span>
              ) : null}
              {canManage || !s.verified ? (
                <span className={cx('v2-settings-upd__help', 'v2-settings-upd__sentence', !s.verified && 'is-alert')}>
                  {s.verified ? intl.formatMessage(m.takesAbout) : intl.formatMessage(m.cantInstall)}
                </span>
              ) : null}
            </div>
          ) : (
            <div className="v2-settings-manual">
              <p className="v2-settings-upd__help">
                {intl.formatMessage(m.manualHelp)}
              </p>
              {MANUAL_STEPS.map((step) => {
                const label = intl.formatMessage(step.label);
                return (
                  <div key={step.cmd} className="v2-settings-manual__row">
                    <span className="v2-settings-manual__label">{label}</span>
                    <CopyField value={step.cmd} aria-label={intl.formatMessage(m.manualCommand, { label })} />
                  </div>
                );
              })}
              {releaseUrl ? (
                <a className="v2-settings-link" href={releaseUrl} target="_blank" rel="noreferrer">
                  {intl.formatMessage(m.fullNotes)}
                </a>
              ) : null}
            </div>
          )}
          {s.apk?.available ? (
            <p className="v2-settings-upd__help">
              <FormattedMessage
                {...m.apkCarried}
                values={{
                  version: num(s.apk.version),
                  link: (chunks: ReactNode[]) => <a href={rolloutHref}>{chunks}</a>,
                }}
              />
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Nothing to install. */}
      {s && !s.updateAvailable && !running ? (
        <div className="v2-settings-uptodate">
          <span className="v2-settings-uptodate__icon" aria-hidden="true">
            <IconCheck size={12} />
          </span>
          <span>
            <FormattedMessage
              {...m.latest}
              values={{
                version: num(s.current),
                hasChannel: String(!!s.channel),
                channel: (s.channel ?? '').toLowerCase(),
              }}
            />
          </span>
        </div>
      ) : null}
      {s && !s.updateAvailable && s.latest && !s.verified && s.latest !== s.current ? (
        <Callout tone="warn" icon={<IconAlert />}>
          <FormattedMessage {...m.unverifiedFound} values={{ version: num(s.latest) }} />
        </Callout>
      ) : null}

      {/* Automatic updates: only where the updater can apply (APPLY_SUPPORTED); stored in its auto.json. */}
      {s && canApply ? (
        <div className="v2-settings-auto">
          <div className="v2-settings-auto__text">
            <span id={`${id}-auto`} className="v2-settings-auto__label">
              {intl.formatMessage(m.autoLabel)}
            </span>
            <span id={`${id}-auto-help`} className="v2-settings-auto__help">
              {intl.formatMessage(m.autoHelp)}
            </span>
            {canManage ? null : (
              <span id={`${id}-auto-locked`} className="v2-visually-hidden">
                {autoLockedReason}
              </span>
            )}
          </div>
          {canManage ? (
            <Toggle
              aria-labelledby={`${id}-auto`}
              aria-describedby={`${id}-auto-help`}
              checked={!!s.auto}
              disabled={autoSaving}
              onChange={(v) => void toggleAuto(v)}
            />
          ) : (
            // Read-only, not `disabled`: it stays focusable so keyboard users get the reason too (aria-disabled).
            <Tooltip content={autoLockedReason}>
              <Toggle
                className="is-locked"
                aria-labelledby={`${id}-auto`}
                aria-describedby={`${id}-auto-help ${id}-auto-locked`}
                aria-disabled="true"
                checked={!!s.auto}
                onClick={(e) => e.preventDefault()}
                onChange={() => {}}
              />
            </Tooltip>
          )}
          {s.auto && s.autoSkipped && s.autoSkipped === s.latest ? (
            <p className="v2-settings-auto__note">
              <FormattedMessage {...m.autoSkipped} values={{ version: num(s.autoSkipped) }} />{' '}
              {intl.formatMessage(canManage ? m.autoSkippedManage : m.autoSkippedOther)}
            </p>
          ) : null}
          {autoErr ? (
            <p className="v2-settings-auto__note is-alert" role="alert">
              {autoErr}
            </p>
          ) : null}
        </div>
      ) : null}

      <Modal
        open={confirming}
        onClose={() => !starting && setConfirming(false)}
        role="alertdialog"
        size="sm"
        dismissOnBackdrop={!starting}
        title={intl.formatMessage(m.confirmTitle, { version: s?.latest ?? '' })}
        footer={
          <>
            <Button size="lg" onClick={() => setConfirming(false)} disabled={starting}>
              {intl.formatMessage(m.cancel)}
            </Button>
            <Button variant="primary" size="lg" onClick={() => void applyNow()} disabled={starting}>
              {starting ? intl.formatMessage(m.starting) : intl.formatMessage(m.updateNow)}
            </Button>
          </>
        }
      >
        <p className="v2-settings-modal-text">
          {intl.formatMessage(m.confirmText)}
        </p>
      </Modal>
    </Card>
  );
}
