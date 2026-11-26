// The devices that enroll while the Enroll page is open, so the admin sees the device they just set up arrive and
// come online instead of being told to look under Devices.

import { useCallback, useEffect, useState } from 'react';
import { defineMessages, type IntlShape, type MessageDescriptor } from 'react-intl';
import { EN_INTL, untyped } from '../data/configIntl';
import { ApiError } from '../api/client';
import { listEnrolledSince, type EnrolledDevice } from '../api/enroll';
import { isOnline, ONLINE_WINDOW_MS } from '../data/presence';

/** How often the page looks for new devices while it is visible. */
export const ARRIVALS_POLL_MS = 5_000;
/** The page stops looking after this long (a code left open on a screen), until asked to look again. */
export const ARRIVALS_WATCH_MS = 30 * 60_000;
/** A device enrolled this long ago that hasn't checked in is no longer "getting its configuration". */
export const SETTING_UP_MS = 10 * 60_000;
/** Newest enrollments asked for on each look (the server bounds it at 50). */
const PAGE = 25;

export type ArrivalState = 'settingUp' | 'online' | 'silent' | 'offline';

export interface Arrival {
  number: string;
  name: string;
  enrollTime: number;
  state: ArrivalState;
}

/**
 * The devices enrolled at or after `since` (server time: the code's creation), newest first. Enrollment stamps
 * last-seen with the enrollment time itself, so a later last-seen means the device has checked in: it got its
 * configuration, and is online while that is recent. One that hasn't checked in within a few minutes is said so.
 */
export function arrivalsSince(devices: EnrolledDevice[] | null | undefined, since: number, now: number = Date.now()): Arrival[] {
  return (devices ?? [])
    .filter((d) => typeof d.enrollTime === 'number' && d.enrollTime >= since)
    .sort((a, b) => b.enrollTime - a.enrollTime)
    .map((d) => {
      const checkedIn = typeof d.lastUpdate === 'number' && d.lastUpdate > d.enrollTime;
      let state: ArrivalState;
      if (!checkedIn) state = now - d.enrollTime > SETTING_UP_MS ? 'silent' : 'settingUp';
      else state = isOnline(d.lastUpdate, now) ? 'online' : 'offline';
      return { number: d.number, name: d.description?.trim() || d.number, enrollTime: d.enrollTime, state };
    });
}

export interface ArrivalsWatch {
  arrivals: Arrival[];
  /** False once the page stopped looking (after {@link ARRIVALS_WATCH_MS}, or a server without the endpoint). */
  watching: boolean;
  /** The server can't list them (it predates the endpoint): say nothing about arrivals. */
  unsupported: boolean;
  /** Look again for another {@link ARRIVALS_WATCH_MS}. */
  watchAgain: () => void;
}

/**
 * Looks for devices enrolled since `since` every few seconds while the page is visible: none while hidden (at once
 * when shown again), nothing after unmount, and not after {@link ARRIVALS_WATCH_MS}. `since` undefined: not looking.
 */
export function useArrivals(since: number | undefined): ArrivalsWatch {
  const [devices, setDevices] = useState<EnrolledDevice[]>([]);
  const [watching, setWatching] = useState(true);
  const [unsupported, setUnsupported] = useState(false);
  const [round, setRound] = useState(0);
  /** Server time of the last answer (devices' times are the server's too). */
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (since == null || unsupported) return;
    let on = true;
    let running = false;
    let t: ReturnType<typeof setTimeout> | undefined;
    const ctrl = new AbortController();
    const until = Date.now() + ARRIVALS_WATCH_MS;
    setWatching(true);
    const run = async () => {
      if (Date.now() >= until) {
        if (on) setWatching(false);
        return;
      }
      running = true;
      try {
        const res = await listEnrolledSince(since, PAGE, ctrl.signal);
        if (on) {
          setDevices(res.devices);
          // The server's clock, so the 10-minute "hasn't checked in" rule holds whatever the browser's clock says.
          setNow(res.serverTime);
        }
      } catch (e) {
        if (e instanceof ApiError && (e.httpStatus === 404 || e.httpStatus === 405)) {
          if (on) {
            setUnsupported(true);
            setWatching(false);
          }
          running = false;
          return;
        }
        /* keep what is shown; the next look tries again */
      }
      running = false;
      if (on && !document.hidden) t = setTimeout(() => void run(), ARRIVALS_POLL_MS);
    };
    const onVisibility = () => {
      if (document.hidden) {
        clearTimeout(t);
      } else if (!running) {
        clearTimeout(t);
        void run();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    void run();
    return () => {
      on = false;
      ctrl.abort();
      clearTimeout(t);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [since, round, unsupported]);

  const watchAgain = useCallback(() => setRound((r) => r + 1), []);
  return {
    arrivals: since == null ? [] : arrivalsSince(devices, since, now),
    watching: since != null && watching,
    unsupported,
    watchAgain,
  };
}

/**
 * What changed between two looks, for a screen reader: each device that is new or whose state moved,
 * newest first. The list itself is not a live region (a poll would re-read all of it); the
 * page announces only these.
 */
export function arrivalChanges(prev: readonly Arrival[], next: readonly Arrival[]): Arrival[] {
  const before = new Map(prev.map((a) => [a.number, a.state]));
  return next.filter((a) => before.get(a.number) !== a.state);
}

const MINUTES = ONLINE_WINDOW_MS / 60_000;

const arrivalMessages = untyped(defineMessages({
  settingUp: { id: 'enroll.arrivals.stateSettingUp', defaultMessage: 'Enrolled, getting its configuration…' },
  online: { id: 'enroll.arrivals.stateOnline', defaultMessage: 'Online' },
  silent: { id: 'enroll.arrivals.stateSilent', defaultMessage: 'Enrolled, hasn’t checked in yet' },
  offline: { id: 'enroll.arrivals.stateOffline', defaultMessage: 'Enrolled, but not heard from in the last {minutes} minutes' },
  one: { id: 'enroll.arrivals.newsOne', defaultMessage: '{name}: {state}.' },
  enrolled: { id: 'enroll.arrivals.newsEnrolled', defaultMessage: '{count, plural, one {# device enrolled.} other {# devices enrolled.}}' },
  manySettingUp: {
    id: 'enroll.arrivals.newsSettingUp',
    defaultMessage: '{count, plural, one {# device is getting its configuration.} other {# devices are getting their configuration.}}',
  },
  manyOnline: { id: 'enroll.arrivals.newsOnline', defaultMessage: '{count, plural, one {# device is online.} other {# devices are online.}}' },
  manySilent: {
    id: 'enroll.arrivals.newsSilent',
    defaultMessage: '{count, plural, one {# device hasn’t checked in yet.} other {# devices haven’t checked in yet.}}',
  },
  manyOffline: {
    id: 'enroll.arrivals.newsOffline',
    defaultMessage:
      '{count, plural, one {# device hasn’t been heard from in the last {minutes} minutes.} other {# devices haven’t been heard from in the last {minutes} minutes.}}',
  },
}));

const STATE_MESSAGE: Record<ArrivalState, MessageDescriptor> = {
  settingUp: arrivalMessages.settingUp,
  online: arrivalMessages.online,
  silent: arrivalMessages.silent,
  offline: arrivalMessages.offline,
};
const PLURAL_MESSAGE: Record<ArrivalState, MessageDescriptor> = {
  settingUp: arrivalMessages.manySettingUp,
  online: arrivalMessages.manyOnline,
  silent: arrivalMessages.manySilent,
  offline: arrivalMessages.manyOffline,
};

/** What the page says of a device in each state (its pill), in the console's language. */
export function arrivalLabel(state: ArrivalState, intl: IntlShape = EN_INTL): string {
  return intl.formatMessage(STATE_MESSAGE[state], { minutes: MINUTES });
}

/** What the page says of a device in each state: its pill, and the announcement of one device (English). */
export const ARRIVAL_LABEL: Record<ArrivalState, string> = {
  settingUp: arrivalLabel('settingUp'),
  online: arrivalLabel('online'),
  silent: arrivalLabel('silent'),
  offline: arrivalLabel('offline'),
};

/**
 * What a screen reader hears after a look, as sentences: one device by name, several counted (a batch code can
 * bring dozens in one look, and a sentence each would bury the page). New devices first, then changes of state,
 * grouped by state in the order they come.
 */
export function arrivalNews(prev: readonly Arrival[], next: readonly Arrival[], intl: IntlShape = EN_INTL): string[] {
  const one = (a: Arrival) => intl.formatMessage(arrivalMessages.one, { name: a.name, state: arrivalLabel(a.state, intl) });
  const known = new Set(prev.map((a) => a.number));
  const changed = arrivalChanges(prev, next);
  const fresh = changed.filter((a) => !known.has(a.number));
  const moved = changed.filter((a) => known.has(a.number));
  const lines: string[] = [];
  if (fresh.length === 1) lines.push(one(fresh[0]));
  else if (fresh.length > 1) lines.push(intl.formatMessage(arrivalMessages.enrolled, { count: fresh.length }));
  const byState = new Map<ArrivalState, Arrival[]>();
  for (const a of moved) byState.set(a.state, [...(byState.get(a.state) ?? []), a]);
  for (const [state, list] of byState) {
    lines.push(list.length === 1 ? one(list[0]) : intl.formatMessage(PLURAL_MESSAGE[state], { count: list.length, minutes: MINUTES }));
  }
  return lines;
}
