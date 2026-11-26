// Devices-list wording for the shared fleet health rules (web/src/data/fleetHealth.ts, useFleetSync.ts): the sync
// line's status kind and label, and the attention strip's filter chips. No per-device battery / network / agent
// version here: those are not in the list API.
import { defineMessages, type IntlShape } from 'react-intl';
import { syncVerdictLabel } from '../api/configSync';
import { EN_INTL, untyped } from '../data/configIntl';
import type { IssueKind, SyncVerdict } from '../data/fleetHealth';
import type { StatusKind } from '../ui';

const chipMessages = untyped(defineMessages({
  failed: {
    id: 'devices.chip.failed',
    defaultMessage: '{count, plural, one {# configuration failed} other {# configuration failed}}',
  },
  outOfSync: { id: 'devices.chip.outOfSync', defaultMessage: '{count, plural, one {# out of sync} other {# out of sync}}' },
  agentTooOld: {
    id: 'devices.chip.agentTooOld',
    defaultMessage: '{count, plural, one {# agent too old} other {# agent too old}}',
  },
  deferred: {
    id: 'devices.chip.deferred',
    defaultMessage: '{count, plural, one {# settings deferred} other {# settings deferred}}',
  },
  reset: {
    id: 'devices.chip.reset',
    defaultMessage: '{count, plural, one {# out of date on the device} other {# out of date on the device}}',
  },
  notReported: { id: 'status.sync.notReported', defaultMessage: 'Not reported' },
}));

const chipText = (k: IssueKind) => (n: number, intl: IntlShape = EN_INTL) => intl.formatMessage(chipMessages[k], { count: n });

/** Attention-strip filter chips: "1 configuration failed", "2 out of sync"… (pass `intl` for the console's language). */
export const ISSUE_CHIP: Record<IssueKind, { tone: 'alert' | 'warn'; text: (n: number, intl?: IntlShape) => string }> = {
  failed: { tone: 'alert', text: chipText('failed') },
  outOfSync: { tone: 'warn', text: chipText('outOfSync') },
  agentTooOld: { tone: 'warn', text: chipText('agentTooOld') },
  deferred: { tone: 'warn', text: chipText('deferred') },
  reset: { tone: 'warn', text: chipText('reset') },
};

/** StatusKind for the sync line, by tone (the label is passed separately, so product wording is kept). */
export function syncKind(s: SyncVerdict): StatusKind {
  switch (s.tone) {
    case 'ok':
      return 'inSync';
    case 'warn':
      return 'applying';
    case 'alert':
      return 'applyFailed';
    default:
      return 'notReported';
  }
}

/** Sync-line wording: the board's "Not reported" for summarizeStatus's "Not reported yet". */
export function syncLabel(s: SyncVerdict, intl: IntlShape = EN_INTL): string {
  return s.label === 'Not reported yet' ? intl.formatMessage(chipMessages.notReported) : syncVerdictLabel(s.label, intl);
}
