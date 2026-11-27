import { useId, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { FormattedMessage, defineMessages, useIntl, type MessageDescriptor } from 'react-intl';
import {
  ACTION_TEMPLATES,
  formatActionTemplate,
  CLEAR_PIN_LOCKOUT_AGENT,
  type CommandHistoryItem,
  type CommandTemplateExt,
} from '../api/commands';
import { DEVICE_RESET_LABEL, SOME_DEFERRED_LABEL, staleCause, summarizeStatus, type ConfigStatus } from '../api/configSync';
import type { DeviceEvent } from '../api/events';
import { doNotTrackHintMessage } from '../api/locationTracking';
import { paths } from '../routes';
import {
  Button,
  ButtonLink,
  Callout,
  Card,
  CardHeader,
  EmptyState,
  Field,
  IconAlert,
  IconCheckSmall,
  IconCrossSmall,
  IconDashSmall,
  IconDownload,
  IconEnterKiosk,
  IconExitKiosk,
  IconFactoryReset,
  IconHistory,
  IconKey,
  IconLock,
  IconPower,
  IconRing,
  IconScreenMessage,
  IconStopRing,
  IconSync,
  IconWarning,
  Input,
  Modal,
  Segmented,
  SkeletonRows,
  StatusPill,
  Table,
  Tooltip,
  cx,
  LinkButton,
  type Column,
} from '../ui';
import { capitalise, commandStatus, configNeedsPanel, fmtWhen, isoTime, powerLabel, shortRevision } from './deviceDetailFormat';
import type { DeviceView } from '../api/devices';
import { classifyOutcome, outcomeSummary, unsupportedOutcomeReason, type Outcome } from '../data/configOutcomes';
import { commandDetail, commandName, commandTime } from '../data/deviceActivity';
import { parseOutcomes } from '../api/configSync';
import { fmtDateTime } from '../ui/format';
import { versionAtLeast } from '../data/kiosk';

const messagesRaw = defineMessages({
  failedPrefix: { id: 'deviceDetail.config.failedPrefix', defaultMessage: 'Failed:' },
  itsConfiguration: { id: 'deviceDetail.config.itsConfiguration', defaultMessage: 'Its configuration' },
  noneTitle: { id: 'deviceDetail.config.noneTitle', defaultMessage: 'No configuration' },
  noneText: {
    id: 'deviceDetail.config.noneText',
    defaultMessage: 'This device has no configuration, so nothing is enforced on it.',
  },
  revision: { id: 'deviceDetail.config.revision', defaultMessage: 'Revision' },
  revisionApplied: { id: 'deviceDetail.config.revisionApplied', defaultMessage: 'Revision {rev} · applied {when}' },
  revisionOnly: { id: 'deviceDetail.config.revisionOnly', defaultMessage: 'Revision {rev}' },
  revisionExpectedReports: {
    id: 'deviceDetail.config.revisionExpectedReports',
    defaultMessage: 'Expected revision {rev} · device reports {applied} ({when})',
  },
  revisionExpectedReportsNoTime: {
    id: 'deviceDetail.config.revisionExpectedReportsNoTime',
    defaultMessage: 'Expected revision {rev} · device reports {applied}',
  },
  revisionExpectedNone: {
    id: 'deviceDetail.config.revisionExpectedNone',
    defaultMessage: 'Expected revision {rev} · device reports none yet',
  },
  editNamed: { id: 'deviceDetail.config.editNamed', defaultMessage: 'Edit {name}' },
  editDefault: { id: 'deviceDetail.config.editDefault', defaultMessage: 'Edit configuration' },
  inSyncTitle: { id: 'deviceDetail.config.inSyncTitle', defaultMessage: 'Configuration in sync' },
  inSyncText: { id: 'deviceDetail.config.inSyncText', defaultMessage: '{name} is applied on this device.' },
  showSettings: {
    id: 'deviceDetail.config.showSettings',
    defaultMessage: 'Show {count, plural, one {# setting} other {# settings}}',
  },
  outOfSyncTitle: { id: 'deviceDetail.config.outOfSyncTitle', defaultMessage: 'Configuration out of sync' },
  outOfSyncText: {
    id: 'deviceDetail.config.outOfSyncText',
    defaultMessage: 'The device runs an older revision of {name}. It applies the current one at its next check-in.',
  },
  agentTooOldTitle: { id: 'deviceDetail.config.agentTooOldTitle', defaultMessage: 'Agent too old for configurations' },
  agentTooOldText: {
    id: 'deviceDetail.config.agentTooOldText',
    defaultMessage:
      'Update the agent (<link>Settings → Updates</link>) to enable configuration enforcement.',
  },
  partialTitle: { id: 'deviceDetail.config.partialTitle', defaultMessage: 'Configuration didn’t fully apply' },
  failedTitle: { id: 'deviceDetail.config.failedTitle', defaultMessage: 'Configuration didn’t apply' },
  nameSummary: { id: 'deviceDetail.config.nameSummary', defaultMessage: '{name}: {summary}' },
  failedToApply: { id: 'deviceDetail.config.failedToApply', defaultMessage: '{name} failed to apply.' },
  failedToApplyDetail: {
    id: 'deviceDetail.config.failedToApplyDetail',
    defaultMessage: '{name} failed to apply: {detail}',
  },
  applyingTitle: { id: 'deviceDetail.config.applyingTitle', defaultMessage: 'Applying configuration' },
  applyingText: { id: 'deviceDetail.config.applyingText', defaultMessage: '{name} is on its way to the device.' },
  notReportedTitle: { id: 'deviceDetail.config.notReportedTitle', defaultMessage: 'Configuration not reported yet' },
  notReportedText: {
    id: 'deviceDetail.config.notReportedText',
    defaultMessage: 'The device hasn’t reported which revision of {name} it runs.',
  },
  staleTitle: { id: 'deviceDetail.config.staleTitle', defaultMessage: 'Configuration out of date on the device' },
  staleWithCause: {
    id: 'deviceDetail.config.staleWithCause',
    defaultMessage: '{cause} The device asked for {name} again; the server re-sends it.',
  },
  staleNoCause: {
    id: 'deviceDetail.config.staleNoCause',
    defaultMessage:
      'The device asked for {name} again; the server re-sends it. If the device turned Wi-Fi back on to stay reachable after Wi-Fi radio turned it off, Wi-Fi stays on until {name} changes.',
  },
  deferredTitle: { id: 'deviceDetail.config.deferredTitle', defaultMessage: 'Some settings were deferred' },
  deferredText: {
    id: 'deviceDetail.config.deferredText',
    defaultMessage:
      '{name}: {summary} Deferred settings are tried again at the next configuration change, reboot or agent update.',
  },
  unsupportedTitle: { id: 'deviceDetail.config.unsupportedTitle', defaultMessage: 'Some settings aren’t supported' },
  notDeviceOwner: {
    id: 'deviceDetail.config.notDeviceOwner',
    defaultMessage:
      'This device’s agent isn’t the device owner, and most of these settings need device-owner mode.',
  },
  retryApply: { id: 'deviceDetail.config.retryApply', defaultMessage: 'Retry apply' },

  remoteActions: { id: 'deviceDetail.actions.title', defaultMessage: 'Remote actions' },
  messageTitle: { id: 'deviceDetail.actions.messageTitle', defaultMessage: 'Message' },
  messageSub: { id: 'deviceDetail.actions.messageSub', defaultMessage: 'Get someone’s attention' },
  sendAlert: { id: 'deviceDetail.actions.sendAlert', defaultMessage: 'Send alert' },
  lockScreenMessage: { id: 'deviceDetail.actions.lockScreenMessage', defaultMessage: 'Lock-screen message' },
  ring: { id: 'deviceDetail.actions.ring', defaultMessage: 'Ring' },
  stopRinging: { id: 'deviceDetail.actions.stopRinging', defaultMessage: 'Stop ringing' },
  kioskTitle: { id: 'deviceDetail.actions.kioskTitle', defaultMessage: 'Kiosk & apps' },
  kioskSub: { id: 'deviceDetail.actions.kioskSub', defaultMessage: 'What runs on screen' },
  returnToKiosk: { id: 'deviceDetail.actions.returnToKiosk', defaultMessage: 'Return to configured kiosk' },
  returnToKioskTip: {
    id: 'deviceDetail.actions.returnToKioskTip',
    defaultMessage: 'Puts the device back into the kiosk its configuration defines.',
  },
  customKiosk: { id: 'deviceDetail.actions.customKiosk', defaultMessage: 'Custom kiosk' },
  exitKiosk: { id: 'deviceDetail.actions.exitKiosk', defaultMessage: 'Exit kiosk' },
  clearPinLockout: { id: 'deviceDetail.actions.clearPinLockout', defaultMessage: 'Clear PIN lockout' },
  lockoutTooOld: {
    id: 'deviceDetail.actions.lockoutTooOld',
    defaultMessage: 'Clear PIN lockout needs agent {version} or later on the device.',
  },
  installConfigApps: { id: 'deviceDetail.actions.installConfigApps', defaultMessage: 'Install configuration apps' },
  installConfigAppsTip: {
    id: 'deviceDetail.actions.installConfigAppsTip',
    defaultMessage:
      'Sends every app the configuration marks Install again. Apps added to it install at the next check-in.',
  },
  deviceTitle: { id: 'deviceDetail.actions.deviceTitle', defaultMessage: 'Device' },
  deviceSub: { id: 'deviceDetail.actions.deviceSub', defaultMessage: 'Interrupts the user' },
  lock: { id: 'deviceDetail.actions.lock', defaultMessage: 'Lock' },
  reboot: { id: 'deviceDetail.actions.reboot', defaultMessage: 'Reboot' },
  powerTitle: { id: 'deviceDetail.actions.powerTitle', defaultMessage: 'Power use' },
  powerSub: { id: 'deviceDetail.actions.powerSub', defaultMessage: 'How often it reports' },
  connection: { id: 'deviceDetail.actions.connection', defaultMessage: 'Connection' },
  waitingForDevice: { id: 'deviceDetail.actions.waitingForDevice', defaultMessage: 'Waiting for the device' },
  configSetsConnectivity: {
    id: 'deviceDetail.actions.configSetsConnectivity',
    defaultMessage:
      'This device’s configuration sets Connectivity: {mode}. A change here lasts until the configuration changes, the device restarts or the agent updates; to keep a mode, set it in the configuration.',
  },
  location: { id: 'deviceDetail.actions.location', defaultMessage: 'Location' },
  locationAccurate: { id: 'deviceDetail.actions.locationAccurate', defaultMessage: 'Accurate' },
  locationBatterySaver: { id: 'deviceDetail.actions.locationBatterySaver', defaultMessage: 'Battery-saver' },
  locationSent: { id: 'deviceDetail.actions.locationSent', defaultMessage: 'Sent' },
  locationUnknown: {
    id: 'deviceDetail.actions.locationUnknown',
    defaultMessage: 'The device doesn’t report its location mode; the last change was sent from this console.',
  },
  destructiveTitle: { id: 'deviceDetail.actions.destructiveTitle', defaultMessage: 'Destructive' },
  destructiveSub: { id: 'deviceDetail.actions.destructiveSub', defaultMessage: 'Asks you to confirm' },
  resetPasscode: { id: 'deviceDetail.actions.resetPasscode', defaultMessage: 'Reset passcode' },
  factoryReset: { id: 'deviceDetail.actions.factoryReset', defaultMessage: 'Factory reset' },

  targetDevice: { id: 'deviceDetail.dialog.targetDevice', defaultMessage: 'Device {number}' },
  cancel: { id: 'deviceDetail.dialog.cancel', defaultMessage: 'Cancel' },
  send: { id: 'deviceDetail.dialog.send', defaultMessage: 'Send' },
  typeToConfirm: { id: 'deviceDetail.dialog.typeToConfirm', defaultMessage: 'Type {word} to confirm' },
  interrupts: {
    id: 'deviceDetail.dialog.interrupts',
    defaultMessage: 'This interrupts whoever is using the device.',
  },

  showLess: { id: 'deviceDetail.commands.showLess', defaultMessage: 'show less' },
  showMore: { id: 'deviceDetail.commands.showMore', defaultMessage: 'show more' },
  colCommand: { id: 'deviceDetail.commands.colCommand', defaultMessage: 'Command' },
  colStatus: { id: 'deviceDetail.commands.colStatus', defaultMessage: 'Status' },
  colWhen: { id: 'deviceDetail.commands.colWhen', defaultMessage: 'When' },
  count: { id: 'deviceDetail.commands.count', defaultMessage: '{count, plural, one {# command} other {# commands}}' },
  loading: { id: 'deviceDetail.commands.loading', defaultMessage: 'Loading {title}' },
  emptyTitle: { id: 'deviceDetail.commands.emptyTitle', defaultMessage: 'No commands yet' },
  emptyText: {
    id: 'deviceDetail.commands.emptyText',
    defaultMessage: 'Actions you send to this device show up here with their result.',
  },
});
const messages: Record<keyof typeof messagesRaw, MessageDescriptor> = messagesRaw;

export const TEMPLATE: Record<string, CommandTemplateExt> = Object.fromEntries(ACTION_TEMPLATES.map((t) => [t.key, t]));

/* ===============================================================================================================
   Configuration status panel ("Configuration didn't fully apply")
   =============================================================================================================== */

type PanelTone = 'alert' | 'warn' | 'idle' | 'ok';

const OUTCOME_TONE: Record<Outcome['kind'], 'ok' | 'alert' | 'idle' | 'warn'> = {
  applied: 'ok',
  failed: 'alert',
  unsupported: 'idle',
  deferred: 'warn',
};

function OutcomeIcon({ kind }: { kind: Outcome['kind'] }) {
  if (kind === 'applied') return <IconCheckSmall size={12} />;
  if (kind === 'failed') return <IconCrossSmall size={12} />;
  return <IconDashSmall size={12} />;
}

function OutcomeGrid({ list }: { list: Outcome[] }) {
  return (
    <ul className="v2-device-cfg__outcomes">
      {list.map((o) => (
        <li key={o.key} className={`is-${OUTCOME_TONE[o.kind]}`}>
          <span className="v2-device-cfg__oicon" aria-hidden="true">
            <OutcomeIcon kind={o.kind} />
          </span>
          <span className="v2-device-cfg__okey" title={o.key}>
            {o.label}
            {o.reason && o.kind !== 'failed' ? <span className="v2-device-cfg__oreason">{o.reason}</span> : null}
          </span>
          {o.kind === 'failed' && o.reason ? (
            // A failed key shows why in the value column ("Needs device owner").
            <span className="v2-device-cfg__oval">
              <span className="v2-visually-hidden">
                <FormattedMessage {...messages.failedPrefix} />{' '}
              </span>
              {capitalise(o.reason)}
            </span>
          ) : (
            <span className="v2-device-cfg__oval">{o.text}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

export function ConfigPanel({
  status,
  configName,
  isDeviceOwner,
  androidSdkInt,
  busy,
  onRetry,
  now,
  events,
}: {
  status: ConfigStatus | null;
  configName: string | undefined;
  /** Telemetry security.isDeviceOwner (undefined when not reported). */
  isDeviceOwner: boolean | undefined;
  /** Telemetry hardware.sdkInt; used only to explain version-gated policy outcomes. */
  androidSdkInt: number | undefined;
  busy: boolean;
  /** Sends the configuration again ("Retry apply"); left out for a role that may not, which then sees no button. */
  onRetry?: () => void;
  now: number;
  /** The device's recent events: one may say why its configuration is out of date ([staleCause]). */
  events?: ReadonlyArray<DeviceEvent>;
}) {
  const titleId = useId();
  const intl = useIntl();
  const verdict = summarizeStatus(status);
  const parsed = parseOutcomes(status?.lastCommand?.detail);
  const outcomes = useMemo(() => Object.entries(parsed?.outcomes ?? {}).map(([k, v]) => {
    const outcome = classifyOutcome(k, String(v), intl);
    return outcome.kind === 'unsupported'
      ? { ...outcome, reason: unsupportedOutcomeReason(outcome.key, { androidSdkInt, isDeviceOwner }, intl) }
      : outcome;
  }), [parsed, androidSdkInt, isDeviceOwner, intl]);
  const cfgId = status?.configurationId ?? null;
  const name = configName ?? intl.formatMessage(messages.itsConfiguration);
  const strongName = <strong>{name}</strong>;

  if (!status || cfgId == null) {
    return (
      <PanelShell
        tone="idle"
        icon={<IconDashSmall size={14} />}
        titleId={titleId}
        title={intl.formatMessage(messages.noneTitle)}
        text={intl.formatMessage(messages.noneText)}
      />
    );
  }

  const failed = outcomes.filter((o) => o.kind === 'failed').length;
  const unsupported = outcomes.filter((o) => o.kind === 'unsupported').length;
  const full = configNeedsPanel(status, outcomes);

  // W6: the revisions are detail, not the headline: folded under "Revision", 7-character short forms.
  const appliedWhen =
    status.appliedAt && isoTime(status.appliedAt) ? (
      <time dateTime={isoTime(status.appliedAt)} title={fmtDateTime(status.appliedAt)}>
        {fmtWhen(status.appliedAt, now, intl)}
      </time>
    ) : null;
  const rev = (r: string | null | undefined) => (
    <span className="v2-mono" title={r ?? undefined}>
      {shortRevision(r, intl)}
    </span>
  );
  const sameRevision = !!status.appliedRevision && status.appliedRevision === status.currentRevision;
  const revisionLine = (
    <details className="v2-device-cfg__rev">
      <summary>{intl.formatMessage(messages.revision)}</summary>
      <p>
        {sameRevision ? (
          appliedWhen ? (
            <FormattedMessage
              {...messages.revisionApplied}
              values={{ rev: rev(status.currentRevision), when: appliedWhen }}
            />
          ) : (
            <FormattedMessage {...messages.revisionOnly} values={{ rev: rev(status.currentRevision) }} />
          )
        ) : status.appliedRevision ? (
          appliedWhen ? (
            <FormattedMessage
              {...messages.revisionExpectedReports}
              values={{ rev: rev(status.currentRevision), applied: rev(status.appliedRevision), when: appliedWhen }}
            />
          ) : (
            <FormattedMessage
              {...messages.revisionExpectedReportsNoTime}
              values={{ rev: rev(status.currentRevision), applied: rev(status.appliedRevision) }}
            />
          )
        ) : (
          <FormattedMessage {...messages.revisionExpectedNone} values={{ rev: rev(status.currentRevision) }} />
        )}
      </p>
    </details>
  );
  const edit = (
    <ButtonLink to={paths.configuration(cfgId)}>
      {configName ? intl.formatMessage(messages.editNamed, { name: configName }) : intl.formatMessage(messages.editDefault)}
    </ButtonLink>
  );

  if (!full) {
    // Clean "In sync": one compact panel, the per-key list folded away.
    return (
      <PanelShell
        tone="ok"
        icon={<IconCheckSmall size={14} />}
        titleId={titleId}
        title={intl.formatMessage(messages.inSyncTitle)}
        text={<FormattedMessage {...messages.inSyncText} values={{ name: strongName }} />}
      >
        {outcomes.length ? (
          <details className="v2-device-cfg__more">
            <summary>{intl.formatMessage(messages.showSettings, { count: outcomes.length })}</summary>
            <OutcomeGrid list={outcomes} />
          </details>
        ) : null}
        <div className="v2-device-cfg__actions">
          {edit}
          {revisionLine}
        </div>
      </PanelShell>
    );
  }

  let tone: PanelTone = 'warn';
  let title = intl.formatMessage(messages.outOfSyncTitle);
  let text: ReactNode = <FormattedMessage {...messages.outOfSyncText} values={{ name: strongName }} />;
  if (!status.supported) {
    title = intl.formatMessage(messages.agentTooOldTitle);
    text = (
      <FormattedMessage
        {...messages.agentTooOldText}
        values={{ link: (chunks) => <Link to={`${paths.settings}#updates`}>{chunks}</Link> }}
      />
    );
  } else if (verdict.label === 'Apply failed' || failed > 0) {
    tone = 'alert';
    title = intl.formatMessage(
      outcomes.length && outcomes.some((o) => o.kind === 'applied') ? messages.partialTitle : messages.failedTitle,
    );
    text = outcomes.length ? (
      <FormattedMessage {...messages.nameSummary} values={{ name: strongName, summary: outcomeSummary(outcomes, intl) }} />
    ) : status.lastCommand?.detail ? (
      <FormattedMessage
        {...messages.failedToApplyDetail}
        values={{ name: strongName, detail: status.lastCommand.detail }}
      />
    ) : (
      <FormattedMessage {...messages.failedToApply} values={{ name: strongName }} />
    );
  } else if (verdict.label === 'Applying…') {
    tone = 'idle';
    title = intl.formatMessage(messages.applyingTitle);
    text = <FormattedMessage {...messages.applyingText} values={{ name: strongName }} />;
  } else if (verdict.label === 'Not reported yet') {
    tone = 'idle';
    title = intl.formatMessage(messages.notReportedTitle);
    text = <FormattedMessage {...messages.notReportedText} values={{ name: strongName }} />;
  } else if (verdict.label === DEVICE_RESET_LABEL) {
    title = intl.formatMessage(messages.staleTitle);
    const cause = staleCause(events, status, intl);
    text = cause ? (
      <FormattedMessage {...messages.staleWithCause} values={{ cause, name: strongName }} />
    ) : (
      <FormattedMessage {...messages.staleNoCause} values={{ name: strongName }} />
    );
  } else if (verdict.label === SOME_DEFERRED_LABEL) {
    title = intl.formatMessage(messages.deferredTitle);
    text = <FormattedMessage {...messages.deferredText} values={{ name: strongName, summary: outcomeSummary(outcomes, intl) }} />;
  } else if (status.inSync && unsupported > 0) {
    tone = 'idle';
    title = intl.formatMessage(messages.unsupportedTitle);
    text = <FormattedMessage {...messages.nameSummary} values={{ name: strongName, summary: outcomeSummary(outcomes, intl) }} />;
  }

  const retryable = status.supported && !status.inSync && (verdict.label === 'Apply failed' || verdict.label === 'Out of sync');
  const icon = tone === 'idle' ? <IconDashSmall size={14} /> : <IconWarning size={17} />;

  return (
    <PanelShell
      tone={tone}
      icon={icon}
      titleId={titleId}
      title={title}
      text={
        <>
          {text}
          {unsupported > 0 && isDeviceOwner === false ? (
            <>
              {' '}
              <FormattedMessage {...messages.notDeviceOwner} />
            </>
          ) : null}
        </>
      }
    >
      {outcomes.length ? <OutcomeGrid list={outcomes} /> : null}
      <div className="v2-device-cfg__actions">
        {retryable && onRetry ? (
          <Button variant="primary" icon={<IconSync />} disabled={busy} onClick={onRetry}>
            <FormattedMessage {...messages.retryApply} />
          </Button>
        ) : null}
        {edit}
        {revisionLine}
      </div>
    </PanelShell>
  );
}

function PanelShell({
  tone,
  icon,
  title,
  titleId,
  text,
  children,
}: {
  tone: PanelTone;
  icon: ReactNode;
  title: ReactNode;
  titleId: string;
  text: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Card
      aria-labelledby={titleId}
      tone={tone === 'alert' ? 'alert' : tone === 'warn' ? 'warn' : 'default'}
      className={cx('v2-device-cfg', `is-${tone}`)}
    >
      <span className="v2-device-cfg__tile" aria-hidden="true">
        {icon}
      </span>
      <div className="v2-device-cfg__body">
        <div className="v2-device-cfg__intro">
          <h2 id={titleId} className="v2-device-cfg__title">
            {title}
          </h2>
          <p className="v2-device-cfg__text">{text}</p>
        </div>
        {children}
      </div>
    </Card>
  );
}

/* ===============================================================================================================
   Remote actions (Message / Kiosk & apps / Device / Power use / Destructive)
   =============================================================================================================== */

/** The Remote actions card's id: the header menu's "All actions" scrolls to it and focuses it. */
export const REMOTE_ACTIONS_ID = 'v2-device-remote-actions';

type ActionRunner = (t: CommandTemplateExt) => void;

interface Tile {
  key: string;
  label: string;
  icon: ReactNode;
  /** A template key, or a local action. */
  run: () => void;
  /** What it does, in a tooltip. */
  tip?: string;
  /** Default subtle; the row's main action is primary. */
  variant?: 'primary' | 'subtle';
  /** Unavailable for a reason the row's hint gives. */
  disabled?: boolean;
}

function ActionHead({ id, title, sub }: { id: string; title: string; sub: string }) {
  return (
    <div className="v2-device-actions__head">
      <span id={id} className="v2-device-actions__title">
        {title}
      </span>
      <span className="v2-device-actions__sub">{sub}</span>
    </div>
  );
}

function ActionRow({
  title,
  sub,
  tiles,
  busy,
  hint,
}: {
  title: string;
  sub: string;
  tiles: Tile[];
  busy: boolean;
  /** A note under the buttons (why one is unavailable); disabled buttons point at it. */
  hint?: ReactNode;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className="v2-device-actions__row" role="group" aria-labelledby={id}>
      <ActionHead id={id} title={title} sub={sub} />
      <div className="v2-device-actions__tiles">
        {tiles.map((t) => (
          <Tooltip key={t.key} content={t.tip}>
            <Button
              variant={t.variant ?? 'subtle'}
              icon={t.icon}
              disabled={busy || t.disabled}
              aria-describedby={t.disabled && hint ? hintId : undefined}
              onClick={t.run}
            >
              {t.label}
            </Button>
          </Tooltip>
        ))}
        {hint ? (
          <p id={hintId} className="v2-device-actions__hint">
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** The configured-kiosk action in Remote actions: absent (the hint says why), or offered, possibly unavailable. */
export interface KioskReturnOffer {
  /** Show "Return to configured kiosk". */
  offered: boolean;
  /** Offered but unavailable: the hint says why. */
  disabled?: boolean;
  /** Under the kiosk buttons: why there is no configured kiosk, or why it can't be used now. */
  hint?: ReactNode;
  onReturn: () => void;
}

export function RemoteActions({
  busy,
  onAction,
  onEnterKiosk,
  kioskReturn,
  onInstallConfigApps,
  powerMode,
  powerPending,
  configPowerMode,
  locationMode,
  locationPending,
  locationUnknown,
  doNotTrack,
  agentVersion,
}: {
  busy: boolean;
  onAction: ActionRunner;
  /** Opens the custom (one-time) kiosk dialog. */
  onEnterKiosk: () => void;
  kioskReturn: KioskReturnOffer;
  onInstallConfigApps: () => void;
  /** Selected connection mode ('alwaysOn' | 'adaptive'), from state or the request just sent. */
  powerMode: string | undefined;
  powerPending: boolean;
  /** The connection mode the configuration sets ('alwaysOn' | 'adaptive'), or undefined when it doesn't manage it. */
  configPowerMode: string | undefined;
  /** Selected location mode ('active' | 'passive'), when known. */
  locationMode: string | undefined;
  locationPending: boolean;
  /** The current location mode can't be told (a device-level change was sent before; the agent doesn't report it). */
  locationUnknown: boolean;
  doNotTrack: boolean | null;
  /** The device's agent version, when reported: Clear PIN lockout needs CLEAR_PIN_LOCKOUT_AGENT. */
  agentVersion?: string | null;
}) {
  const titleId = useId();
  const intl = useIntl();
  // Unknown (not reported yet) stays available: the server holds the command from an agent that can't run it.
  const lockoutTooOld = versionAtLeast(agentVersion, CLEAR_PIN_LOCKOUT_AGENT) === false;
  const kioskHint =
    kioskReturn.hint || lockoutTooOld ? (
      <>
        {kioskReturn.hint}
        {kioskReturn.hint && lockoutTooOld ? ' ' : null}
        {lockoutTooOld ? intl.formatMessage(messages.lockoutTooOld, { version: CLEAR_PIN_LOCKOUT_AGENT }) : null}
      </>
    ) : undefined;
  const tile = (key: string, label: string, icon: ReactNode): Tile => ({
    key,
    label,
    icon,
    tip: formatActionTemplate(intl, TEMPLATE[key]).description,
    run: () => onAction(TEMPLATE[key]),
  });
  const send = (key: string) => onAction(TEMPLATE[key]);

  return (
    <Card id={REMOTE_ACTIONS_ID} tabIndex={-1} aria-labelledby={titleId} className="v2-device-actions">
      <CardHeader title={intl.formatMessage(messages.remoteActions)} titleId={titleId} className="v2-device-actions__h" />
      <ActionRow
        title={intl.formatMessage(messages.messageTitle)}
        sub={intl.formatMessage(messages.messageSub)}
        busy={busy}
        tiles={[
          tile('alert', intl.formatMessage(messages.sendAlert), <IconAlert />),
          tile('lockscreen-message', intl.formatMessage(messages.lockScreenMessage), <IconScreenMessage />),
          tile('ring', intl.formatMessage(messages.ring), <IconRing />),
          tile('ring-stop', intl.formatMessage(messages.stopRinging), <IconStopRing />),
        ]}
      />
      <ActionRow
        title={intl.formatMessage(messages.kioskTitle)}
        sub={intl.formatMessage(messages.kioskSub)}
        busy={busy}
        hint={kioskHint}
        tiles={[
          ...(kioskReturn.offered
            ? [
                {
                  key: 'kiosk-return',
                  label: intl.formatMessage(messages.returnToKiosk),
                  icon: <IconEnterKiosk />,
                  tip: intl.formatMessage(messages.returnToKioskTip),
                  variant: 'primary' as const,
                  disabled: kioskReturn.disabled,
                  run: kioskReturn.onReturn,
                },
              ]
            : []),
          { key: 'kiosk-enter', label: intl.formatMessage(messages.customKiosk), icon: <IconEnterKiosk />, tip: formatActionTemplate(intl, TEMPLATE['kiosk-enter']).description, run: onEnterKiosk },
          tile('kiosk-exit', intl.formatMessage(messages.exitKiosk), <IconExitKiosk />),
          { ...tile('kiosk-clear-lockout', intl.formatMessage(messages.clearPinLockout), <IconKey />), disabled: lockoutTooOld },
          {
            key: 'config-apps',
            label: intl.formatMessage(messages.installConfigApps),
            icon: <IconDownload size={16} />,
            tip: intl.formatMessage(messages.installConfigAppsTip),
            run: onInstallConfigApps,
          },
        ]}
      />
      <ActionRow
        title={intl.formatMessage(messages.deviceTitle)}
        sub={intl.formatMessage(messages.deviceSub)}
        busy={busy}
        tiles={[
          tile('lock', intl.formatMessage(messages.lock), <IconLock size={16} />),
          tile('reboot', intl.formatMessage(messages.reboot), <IconPower />),
        ]}
      />
      <div className="v2-device-actions__row" role="group" aria-labelledby={`${titleId}-pw`}>
        <ActionHead
          id={`${titleId}-pw`}
          title={intl.formatMessage(messages.powerTitle)}
          sub={intl.formatMessage(messages.powerSub)}
        />
        {/* Two label / control pairs on one grid: both Segmented controls start at the same x (I14). */}
        <div className="v2-device-actions__power">
          <span className="v2-device-actions__seglabel" id={`${titleId}-conn`}>
            {intl.formatMessage(messages.connection)}
          </span>
          <span className="v2-device-actions__segctl">
            <Segmented<string>
              aria-labelledby={`${titleId}-conn`}
              aria-describedby={configPowerMode ? `${titleId}-connhint` : undefined}
              value={powerMode}
              disabled={busy}
              onChange={(v) => send(v === 'alwaysOn' ? 'power-always' : 'power-adaptive')}
              options={[
                { value: 'alwaysOn', label: powerLabel('alwaysOn', intl) as string },
                { value: 'adaptive', label: powerLabel('adaptive', intl) as string },
              ]}
            />
            {powerPending ? (
              <span className="v2-device-actions__pending">{intl.formatMessage(messages.waitingForDevice)}</span>
            ) : null}
          </span>
          {configPowerMode ? (
            <p id={`${titleId}-connhint`} className="v2-device-actions__hint v2-device-actions__seghint">
              {intl.formatMessage(messages.configSetsConnectivity, { mode: powerLabel(configPowerMode, intl) as string })}
            </p>
          ) : null}
          <span className="v2-device-actions__seglabel" id={`${titleId}-loc`}>
            {intl.formatMessage(messages.location)}
          </span>
          <span className="v2-device-actions__segctl">
            <Segmented<string>
              aria-labelledby={`${titleId}-loc`}
              aria-describedby={doNotTrack || locationUnknown ? `${titleId}-lochint` : undefined}
              value={doNotTrack ? undefined : locationMode}
              disabled={busy || doNotTrack === true}
              onChange={(v) => send(v === 'active' ? 'location-active' : 'location-passive')}
              options={[
                { value: 'active', label: intl.formatMessage(messages.locationAccurate) },
                { value: 'passive', label: intl.formatMessage(messages.locationBatterySaver) },
              ]}
            />
            {locationPending && !doNotTrack ? (
              <span className="v2-device-actions__pending">{intl.formatMessage(messages.locationSent)}</span>
            ) : null}
          </span>
          {doNotTrack ? (
            <p id={`${titleId}-lochint`} className="v2-device-actions__hint v2-device-actions__seghint">
              {intl.formatMessage(doNotTrackHintMessage)}
            </p>
          ) : locationUnknown ? (
            <p id={`${titleId}-lochint`} className="v2-device-actions__hint v2-device-actions__seghint">
              {intl.formatMessage(messages.locationUnknown)}
            </p>
          ) : null}
        </div>
      </div>
      {/* C4: a plain row under a hairline, red-text buttons; each opens a confirmation. */}
      <div className="v2-device-actions__row is-danger" role="group" aria-labelledby={`${titleId}-dz`}>
        <ActionHead
          id={`${titleId}-dz`}
          title={intl.formatMessage(messages.destructiveTitle)}
          sub={intl.formatMessage(messages.destructiveSub)}
        />
        <div className="v2-device-actions__tiles">
          <Tooltip content={formatActionTemplate(intl, TEMPLATE['passcode-reset']).description}>
            <Button variant="danger" icon={<IconKey />} disabled={busy} onClick={() => send('passcode-reset')}>
              {intl.formatMessage(messages.resetPasscode)}
            </Button>
          </Tooltip>
          <Tooltip content={formatActionTemplate(intl, TEMPLATE.wipe).description}>
            <Button variant="danger" icon={<IconFactoryReset />} disabled={busy} onClick={() => send('wipe')}>
              {intl.formatMessage(messages.factoryReset)}
            </Button>
          </Tooltip>
        </div>
      </div>
    </Card>
  );
}

/* ===============================================================================================================
   Action dialog (parameters and confirmations)
   =============================================================================================================== */

/** "WH-SCAN-07 · Warehouse scanner": which device a dialog acts on. */
export function DialogTarget({ device }: { device: Pick<DeviceView, 'number' | 'description'> }) {
  return (
    <p className="v2-device-target">
      <FormattedMessage {...messages.targetDevice} values={{ number: <strong>{device.number}</strong> }} />
      {device.description ? ` · ${device.description}` : null}
    </p>
  );
}

/**
 * Asks for a command's inputs or confirmation. The confirm button says the verb ("Reboot", "Factory reset"), never
 * "Confirm": solid red for what can't be undone (the destructive group), the normal primary otherwise. Keep it
 * mounted with `open` (and its template from useStickyValue) so it animates closed.
 */
export function ActionDialog({
  open = true,
  template,
  device,
  busy,
  onCancel,
  onSend,
}: {
  open?: boolean;
  template: CommandTemplateExt;
  /** Named in the dialog, so a confirmation always says which device it goes to. */
  device: Pick<DeviceView, 'number' | 'description'>;
  busy: boolean;
  onCancel: () => void;
  onSend: (values: Record<string, string>) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [confirmText, setConfirmText] = useState('');
  const formId = useId();
  const intl = useIntl();
  const t = template;
  const text = formatActionTemplate(intl, t);
  const typeToConfirm = t.confirm === 'type-to-confirm';
  const canSend = typeToConfirm
    ? confirmText === 'WIPE'
    : !t.params?.some((p) => p.required && !values[p.key]);
  const hasInputs = (t.params?.length ?? 0) > 0 || typeToConfirm;
  const irreversible = t.group === 'destructive';
  const submit = () => {
    if (open && !busy && canSend) onSend(values);
  };

  return (
    <Modal
      open={open}
      size="sm"
      role={t.danger ? 'alertdialog' : 'dialog'}
      title={text.title}
      description={text.description}
      onClose={onCancel}
      dismissOnBackdrop={!hasInputs}
      footer={
        <>
          <Button size="lg" disabled={busy} onClick={onCancel}>
            {intl.formatMessage(messages.cancel)}
          </Button>
          <Button
            size="lg"
            variant={irreversible ? 'danger-primary' : 'primary'}
            disabled={busy || !canSend}
            onClick={hasInputs ? undefined : submit}
            form={hasInputs ? formId : undefined}
            type={hasInputs ? 'submit' : 'button'}
          >
            {t.danger ? text.label : intl.formatMessage(messages.send)}
          </Button>
        </>
      }
    >
      <DialogTarget device={device} />
      {hasInputs ? (
        <form
          id={formId}
          className="v2-device-actionform"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {text.params.map((p) => (
            <Field key={p.key} label={p.label}>
              <Input
                type={p.kind === 'password' ? 'password' : p.kind === 'number' ? 'number' : 'text'}
                autoComplete={p.kind === 'password' ? 'new-password' : 'off'}
                placeholder={p.placeholder}
                required={p.required}
                value={values[p.key] ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [p.key]: e.target.value }))}
              />
            </Field>
          ))}
          {typeToConfirm ? (
            <Field
              label={
                <FormattedMessage {...messages.typeToConfirm} values={{ word: <strong>WIPE</strong> }} />
              }
            >
              <Input value={confirmText} autoComplete="off" spellCheck={false} onChange={(e) => setConfirmText(e.target.value)} />
            </Field>
          ) : null}
        </form>
      ) : t.danger ? (
        <Callout tone="warn" icon={<IconWarning size={16} />}>
          <FormattedMessage {...messages.interrupts} />
        </Callout>
      ) : null}
    </Modal>
  );
}

/* ===============================================================================================================
   Commands: the full history on the Activity tab
   =============================================================================================================== */

const DETAIL_LIMIT = 160;

/** Long details clamped at 160 characters with show more / show less (classic CommandDetail). */
function CommandDetail({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const intl = useIntl();
  if (text.length <= DETAIL_LIMIT) return <>{text}</>;
  return (
    <>
      {open ? text : `${text.slice(0, DETAIL_LIMIT)}…`}{' '}
      <LinkButton tone="quiet" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {intl.formatMessage(open ? messages.showLess : messages.showMore)}
      </LinkButton>
    </>
  );
}

export function CommandsCard({
  title,
  items,
  now,
  loaded,
}: {
  title: string;
  items: CommandHistoryItem[];
  now: number;
  loaded: boolean;
}) {
  const titleId = useId();
  const intl = useIntl();
  const columns: Column<CommandHistoryItem>[] = [
    {
      key: 'command',
      header: intl.formatMessage(messages.colCommand),
      className: 'v2-device-cmds__cmd',
      cell: (c) => {
        const detail = commandDetail(c, intl);
        return (
          <>
            <span className="v2-device-cmds__name" title={c.type}>
              {commandName(c.type, intl)}
            </span>
            {detail ? (
              <>
                {' '}
                <span className="v2-device-cmds__detail">
                  <CommandDetail text={detail} />
                </span>
              </>
            ) : null}
          </>
        );
      },
    },
    {
      key: 'status',
      header: intl.formatMessage(messages.colStatus),
      shrink: true,
      cell: (c) => {
        const st = commandStatus(c.status, intl);
        return <StatusPill status={st.kind} label={st.label} dot={false} />;
      },
    },
    {
      key: 'when',
      header: intl.formatMessage(messages.colWhen),
      shrink: true,
      align: 'right',
      className: 'v2-device-cmds__when',
      cell: (c) => {
        const when = commandTime(c);
        return when && isoTime(when) ? (
          <time dateTime={isoTime(when)} title={fmtDateTime(when)}>
            {fmtWhen(when, now, intl)}
          </time>
        ) : (
          '—'
        );
      },
    },
  ];
  return (
    <Card padding="list" clip aria-labelledby={titleId} className="v2-device-cmds">
      <CardHeader
        inset
        title={title}
        titleId={titleId}
        actions={
          items.length ? (
            <span className="v2-device-meta">{intl.formatMessage(messages.count, { count: items.length })}</span>
          ) : null
        }
      />
      {!loaded && !items.length ? (
        <SkeletonRows compact count={4} label={intl.formatMessage(messages.loading, { title: title.toLowerCase() })} />
      ) : items.length ? (
        <Table<CommandHistoryItem> aria-label={title} rowPad={10} rows={items} rowKey={(c) => String(c.id)} columns={columns} />
      ) : (
        <div className="v2-device-cmds__empty">
          <EmptyState bare icon={<IconHistory />} title={intl.formatMessage(messages.emptyTitle)}>
            <FormattedMessage {...messages.emptyText} />
          </EmptyState>
        </div>
      )}
    </Card>
  );
}
