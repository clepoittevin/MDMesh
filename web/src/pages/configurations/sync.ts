import { defineMessages, type IntlShape } from 'react-intl';
import type { ConfigSyncSummary } from '../../api/configSync';
import type { BarSegment } from '../../ui';
import { EN_INTL, untyped } from '../../data/configIntl';

export type SyncTone = 'ok' | 'warn' | 'idle';

export interface SyncLine {
  segments: BarSegment[];
  text: string;
  tone: SyncTone;
}

/** The sentences under a configuration. The functions below answer in English unless given an `intl`. */
export const syncMessages = untyped(defineMessages({
  usedOnlyByWiped: {
    id: 'configurations.sync.usedOnlyByWiped',
    defaultMessage: 'Used only by {count, plural, one {# wiped device} other {# wiped devices}}',
  },
  unavailable: { id: 'configurations.sync.unavailable', defaultMessage: 'Sync status unavailable' },
  unused: { id: 'configurations.sync.unused', defaultMessage: 'Not used by any device yet' },
  inSyncOne: { id: 'configurations.sync.inSyncOne', defaultMessage: 'In sync' },
  inSyncAll: { id: 'configurations.sync.inSyncAll', defaultMessage: 'All {total} in sync' },
  someInSync: { id: 'configurations.sync.someInSync', defaultMessage: '{inSync, plural, one {#} other {#}} of {total} in sync' },
  applying: { id: 'configurations.sync.applying', defaultMessage: '{count} applying' },
  agentsTooOld: {
    id: 'configurations.sync.agentsTooOld',
    defaultMessage: '{count, plural, one {# agent too old} other {# agents too old}}',
  },
  notReported: { id: 'configurations.sync.notReported', defaultMessage: '{count, plural, one {#} other {#}} not reported yet' },
  usedBy: {
    id: 'configurations.sync.usedBy',
    defaultMessage:
      'Used by <link>{count, plural, one {# device} other {# devices}}</link>{state, select, one {, in sync.} both {, both in sync.} all {, all in sync.} none {, none in sync yet.} other {, {inSync, plural, one {#} other {#}} in sync.}}',
  },
  usedByWipedLink: {
    id: 'configurations.sync.usedByWipedLink',
    defaultMessage: 'Used only by <link>{count, plural, one {# wiped device} other {# wiped devices}}</link>.',
  },
}));

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** How many wiped devices a configuration has when they are all it has, else 0. */
export function wipedOnly(s: ConfigSyncSummary | undefined): number {
  return s && s.total === 0 ? (s.wiped ?? 0) : 0;
}

/** "Used only by 2 wiped devices", or null when that isn't the case. */
export function wipedOnlyLine(s: ConfigSyncSummary | undefined, intl: IntlShape = EN_INTL): string | null {
  const n = wipedOnly(s);
  return n > 0 ? intl.formatMessage(syncMessages.usedOnlyByWiped, { count: n }) : null;
}

/** Every device the server counts when it refuses a delete, wiped ones too (undefined = unknown). */
export function devicesBlockingDelete(s: ConfigSyncSummary | undefined): number | undefined {
  return s ? s.total + (s.wiped ?? 0) : undefined;
}

/**
 * The sync bar and line under a configuration card. The summary's four counts are disjoint
 * (in sync + out of sync + agent too old + never reported = total), wiped devices aside. Out of sync reads "applying", as on the classic
 * SyncBar; a "failed" split needs data the server doesn't send.
 */
export function syncLine(s: ConfigSyncSummary | undefined, unavailable: boolean, intl: IntlShape = EN_INTL): SyncLine {
  if (!s || s.total === 0) {
    return {
      segments: [],
      text:
        wipedOnlyLine(s, intl) ??
        intl.formatMessage(unavailable && !s ? syncMessages.unavailable : syncMessages.unused),
      tone: 'idle',
    };
  }
  const segments: BarSegment[] = [
    { value: s.inSync, tone: 'ok' },
    { value: s.outOfSync + s.unsupported, tone: 'warn' },
    { value: s.neverSeen, tone: 'idle' },
  ];
  if (s.inSync === s.total) {
    const text = s.total === 1 ? intl.formatMessage(syncMessages.inSyncOne) : intl.formatMessage(syncMessages.inSyncAll, { total: s.total });
    return { segments, text, tone: 'ok' };
  }
  const parts = [
    intl.formatMessage(syncMessages.someInSync, { inSync: s.inSync, total: s.total }),
    s.outOfSync > 0 ? intl.formatMessage(syncMessages.applying, { count: s.outOfSync }) : null,
    s.unsupported > 0 ? intl.formatMessage(syncMessages.agentsTooOld, { count: s.unsupported }) : null,
    s.neverSeen > 0 ? intl.formatMessage(syncMessages.notReported, { count: s.neverSeen }) : null,
  ].filter(Boolean);
  const tone: SyncTone = s.outOfSync + s.unsupported > 0 ? 'warn' : 'idle';
  return { segments, text: parts.join(' · '), tone };
}

/** How a configuration's live devices stand, for the editor's "Used by" line (`syncMessages.usedBy`). */
export function usedByState(s: ConfigSyncSummary | undefined): { count: number; state: 'one' | 'both' | 'all' | 'none' | 'some'; inSync: number } | null {
  if (!s || s.total === 0) return null;
  const n = s.total;
  const state = s.inSync === n ? (n === 1 ? 'one' : n === 2 ? 'both' : 'all') : s.inSync === 0 ? 'none' : 'some';
  return { count: n, state, inSync: s.inSync };
}

/** "Used by 2 devices, both in sync." (editor subtitle), as its count and the rest of the sentence. */
export function usedByLine(s: ConfigSyncSummary | undefined): { count: number; rest: string } | null {
  const u = usedByState(s);
  if (!u) return null;
  const rest = { one: ', in sync.', both: ', both in sync.', all: ', all in sync.', none: ', none in sync yet.', some: `, ${u.inSync} in sync.` }[u.state];
  return { count: u.count, rest };
}

export { plural };
