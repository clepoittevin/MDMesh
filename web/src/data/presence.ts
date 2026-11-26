// Device presence: online when its last check-in is recent.
import { defineMessages, type IntlShape } from 'react-intl';
import { EN_INTL, untyped } from './configIntl';

/** Online if the last check-in is within this window (ms). */
export const ONLINE_WINDOW_MS = 10 * 60 * 1000;

export function isOnline(lastUpdate?: number, now: number = Date.now()): boolean {
  if (!lastUpdate) return false;
  return now - lastUpdate <= ONLINE_WINDOW_MS;
}

/**
 * The warn toast after a wake (forceSync) that found no live connection, in the same words on every page: the sync,
 * or the command just queued, waits for the device's next check-in. A device can look online and still have none.
 */
export function notConnected(number: string, after: 'sync' | 'command', intl: IntlShape = EN_INTL): [title: string, body: string] {
  return [
    intl.formatMessage(presenceMessages.notConnectedTitle, { number }),
    intl.formatMessage(after === 'sync' ? presenceMessages.notConnectedSync : presenceMessages.notConnectedCommand),
  ];
}

const presenceMessages = untyped(defineMessages({
  notConnectedTitle: { id: 'overview.attention.notConnectedTitle', defaultMessage: '{number} isn’t connected right now' },
  notConnectedSync: { id: 'overview.attention.notConnectedBody', defaultMessage: 'It syncs at its next check-in.' },
  notConnectedCommand: { id: 'devices.notConnected.commandBody', defaultMessage: 'It gets the command at its next check-in.' },
}));
