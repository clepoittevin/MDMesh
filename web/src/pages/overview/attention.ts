// Overview wording on top of the shared fleet health rules (web/src/data/fleetHealth.ts): the attention row's text,
// tone and action, and the subtitle's "mostly for …" phrase.
import { defineMessages, type IntlShape, type MessageDescriptor } from 'react-intl';
import { syncVerdictLabel } from '../../api/configSync';
import type { DeviceView } from '../../api/devices';
import { EN_INTL, untyped } from '../../data/configIntl';
import { ISSUE_REASON_MESSAGES, ISSUE_TONE, issueKind, presenceOf, type IssueKind, type Presence, type SyncVerdict } from '../../data/fleetHealth';
import type { StatusTone } from '../../ui';

const reasonMessages = untyped(defineMessages({
  offline: { id: 'overview.reason.offline', defaultMessage: 'being offline' },
  failed: { id: 'overview.reason.failed', defaultMessage: 'a configuration that failed to apply' },
  outOfSync: { id: 'overview.reason.outOfSync', defaultMessage: 'a configuration out of sync' },
  agentTooOld: { id: 'overview.reason.agentTooOld', defaultMessage: 'an out-of-date agent' },
  deferred: { id: 'overview.reason.deferred', defaultMessage: 'deferred settings' },
  reset: { id: 'overview.reason.reset', defaultMessage: 'a configuration out of date on the device' },
  rowOffline: { id: 'overview.attention.offline', defaultMessage: 'Offline' },
}));

export type Bucket = Presence;

/** A device's configuration issue (summarizeStatus output that isConfigIssue accepted). */
export type ConfigIssue = SyncVerdict;

/**
 * Wiped first (it no longer reports, so it is neither offline nor needs attention), then offline (recency of last
 * check-in); a still-reporting device whose configuration didn't apply is attention.
 */
export function bucketOf(d: DeviceView, issues: Record<number, ConfigIssue>, now?: number): Bucket {
  return presenceOf(d.lastUpdate, !!issues[d.id], now, d.wipedAt);
}

export type RowAction = 'sync' | 'agent' | 'open';

export interface AttentionReason {
  /** Board wording for the row. */
  text: string;
  tone: StatusTone;
  action: RowAction;
  /** Subtitle phrase: "… need attention, mostly for <phrase>". */
  phrase: string;
}

const ROW: Record<IssueKind, { action: RowAction; phrase: MessageDescriptor }> = {
  failed: { action: 'open', phrase: reasonMessages.failed },
  outOfSync: { action: 'sync', phrase: reasonMessages.outOfSync },
  agentTooOld: { action: 'agent', phrase: reasonMessages.agentTooOld },
  deferred: { action: 'open', phrase: reasonMessages.deferred },
  reset: { action: 'sync', phrase: reasonMessages.reset },
};

/** Row wording, tone and action for a configuration issue (summarizeStatus output) or offline. */
export function reasonFor(issue: ConfigIssue | undefined, intl: IntlShape = EN_INTL): AttentionReason {
  if (!issue) {
    return { text: intl.formatMessage(reasonMessages.rowOffline), tone: 'idle', action: 'open', phrase: intl.formatMessage(reasonMessages.offline) };
  }
  const k = issueKind(issue);
  if (!k) {
    const text = syncVerdictLabel(issue.label, intl);
    return { text, tone: issue.tone, action: 'open', phrase: text.toLowerCase() };
  }
  const row = ROW[k];
  return { text: intl.formatMessage(ISSUE_REASON_MESSAGES[k]), tone: ISSUE_TONE[k], action: row.action, phrase: intl.formatMessage(row.phrase) };
}

/** The most common reason among the attention devices, and whether it covers all of them or most (> half). */
export function topReason(
  devices: ReadonlyArray<DeviceView>,
  issues: Record<number, ConfigIssue>,
  now: number,
  intl: IntlShape = EN_INTL,
): { phrase: string; share: 'all' | 'most' } | null {
  const tally = new Map<string, number>();
  let n = 0;
  for (const d of devices) {
    if (bucketOf(d, issues, now) !== 'attention') continue;
    n++;
    const p = reasonFor(issues[d.id], intl).phrase;
    tally.set(p, (tally.get(p) ?? 0) + 1);
  }
  let best: [string, number] | null = null;
  for (const e of tally) if (!best || e[1] > best[1]) best = e;
  if (!best || n === 0) return null;
  if (best[1] === n) return { phrase: best[0], share: 'all' };
  if (best[1] * 2 > n) return { phrase: best[0], share: 'most' };
  return null;
}
