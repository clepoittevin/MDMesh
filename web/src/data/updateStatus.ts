// Wording and rules for the supervisor's update status, shared by the Overview server card, the sidebar's update
// card and Settings → Updates.
import { defineMessages, type IntlShape } from 'react-intl';
import { isApplyTerminal, type UpdateStatus } from '../api/updates';
import { EN_INTL, untyped } from './configIntl';

/** The update status's wording as messages (each helper below takes an optional `intl`; English without one). */
export const updateStatusMessages = untyped(defineMessages({
  phaseAuthorizing: { id: 'updates.phase.authorizing', defaultMessage: 'Authorizing…' },
  phaseBackup: { id: 'updates.phase.backup', defaultMessage: 'Backing up the database…' },
  phasePull: { id: 'updates.phase.pull', defaultMessage: 'Downloading the new images…' },
  phaseRecreate: { id: 'updates.phase.recreate', defaultMessage: 'Restarting services…' },
  phaseHealthcheck: { id: 'updates.phase.healthcheck', defaultMessage: 'Checking health…' },
  phaseRollback: { id: 'updates.phase.rollback', defaultMessage: 'Rolling back…' },
  // "0.1.12, 0.1.13" and "0.1.14": the last two (or more) versions of a list.
  versionsJoin: { id: 'updates.security.versionsJoin', defaultMessage: '{head} and {last}' },
  missedShort: {
    id: 'updates.security.missedShort',
    defaultMessage: 'Includes security fixes from {versions} that this server is missing.',
  },
  missedText: {
    id: 'updates.security.missedText',
    defaultMessage:
      '{versions} fixed security issues this server doesn’t have yet. It runs {current}, and updating to {latest} includes those fixes.',
  },
  whatFixed: { id: 'updates.security.whatFixed', defaultMessage: 'What {version} fixed' },
  releaseNotes: { id: 'updates.security.releaseNotes', defaultMessage: 'Release notes' },
  navUpdating: { id: 'updates.nav.updating', defaultMessage: 'Updating' },
  navFailed: { id: 'updates.nav.failed', defaultMessage: 'Failed' },
  navSecurity: { id: 'updates.nav.securityFixes', defaultMessage: 'Security fixes' },
  navReady: { id: 'updates.nav.ready', defaultMessage: '1 ready' },
  // A past time read mid-sentence ("Started 3 minutes ago."), as the console's long relative times.
  agoNow: { id: 'updates.time.justNow', defaultMessage: 'just now' },
  agoMinutes: { id: 'updates.time.minutesAgo', defaultMessage: '{count, plural, one {# minute ago} other {# minutes ago}}' },
  agoHours: { id: 'updates.time.hoursAgo', defaultMessage: '{count, plural, one {# hour ago} other {# hours ago}}' },
  agoYesterday: { id: 'updates.time.yesterday', defaultMessage: 'yesterday' },
  agoDays: { id: 'updates.time.daysAgo', defaultMessage: '{count, plural, one {# day ago} other {# days ago}}' },
}));

/**
 * "just now", "3 minutes ago", "2 hours ago", "yesterday", "3 days ago", then the date: for use mid-sentence (the
 * long relative time of ui/RelativeTime, lower-case, in the console's language).
 */
export function agoText(ms: number, intl: IntlShape = EN_INTL, now: number = Date.now()): string {
  const m = updateStatusMessages;
  const min = Math.floor(Math.max(0, now - ms) / 60000);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);
  if (min < 1) return intl.formatMessage(m.agoNow);
  if (min < 60) return intl.formatMessage(m.agoMinutes, { count: min });
  if (hr < 24) return intl.formatMessage(m.agoHours, { count: hr });
  if (day === 1) return intl.formatMessage(m.agoYesterday);
  if (day < 30) return intl.formatMessage(m.agoDays, { count: day });
  return intl.formatDate(ms, { day: 'numeric', month: 'short', year: 'numeric' });
}

const PHASE_MESSAGE: Readonly<Record<string, keyof typeof updateStatusMessages>> = {
  authorizing: 'phaseAuthorizing',
  backup: 'phaseBackup',
  pull: 'phasePull',
  recreate: 'phaseRecreate',
  healthcheck: 'phaseHealthcheck',
  rollback: 'phaseRollback',
};

/** The live line for each apply phase (the v0.3 console's UpdateBanner wording), in English. */
export const APPLY_PHASE_LABEL: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(PHASE_MESSAGE).map(([phase, key]) => [phase, EN_INTL.formatMessage(updateStatusMessages[key])]),
);

export const applyPhaseLabel = (phase: string, intl: IntlShape = EN_INTL): string => {
  const key = Object.prototype.hasOwnProperty.call(PHASE_MESSAGE, phase) ? PHASE_MESSAGE[phase] : undefined;
  return key ? intl.formatMessage(updateStatusMessages[key]) : phase;
};

/** The supervisor's placeholder error until its first GitHub poll after a (re)start: not a failed check. */
const NOT_POLLED_YET = 'not polled yet';

/** The last update check's error, or null when it succeeded or simply hasn't run yet. */
export function lastCheckError(s: UpdateStatus | null | undefined): string | null {
  const e = s?.error;
  return e && e !== NOT_POLLED_YET ? e : null;
}

/** A release link is shown only when it is an https: URL (it comes from the release feed, not from us). */
export function safeReleaseUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

const RELEASE_VERSION = /^\d+\.\d+\.\d+$/;

/**
 * The security releases the offered update skips over, oldest first: the supervisor's `missedSecurity` (from the
 * verified manifest only; absent from a supervisor before 0.5.0). Empty unless an update is on offer.
 */
export function missedSecurity(s: UpdateStatus | null | undefined): string[] {
  if (!s?.updateAvailable || !s.latest || !Array.isArray(s.missedSecurity)) return [];
  return s.missedSecurity.filter((v): v is string => typeof v === 'string' && RELEASE_VERSION.test(v));
}

/** "0.1.13", "0.1.13 and 0.1.14", "0.1.12, 0.1.13 and 0.1.14". */
export function joinVersions(vs: readonly string[], intl: IntlShape = EN_INTL): string {
  if (vs.length <= 1) return vs[0] ?? '';
  return intl.formatMessage(updateStatusMessages.versionsJoin, { head: vs.slice(0, -1).join(', '), last: vs[vs.length - 1] });
}

/** The line under an update that skips security releases (the sidebar card, the Overview's Server card). */
export const missedSecurityShort = (vs: readonly string[], intl: IntlShape = EN_INTL): string =>
  intl.formatMessage(updateStatusMessages.missedShort, { versions: joinVersions(vs, intl) });

/** Settings → Updates: the notice's text. */
export const missedSecurityText = (vs: readonly string[], current: string, latest: string, intl: IntlShape = EN_INTL): string =>
  intl.formatMessage(updateStatusMessages.missedText, { versions: joinVersions(vs, intl), current, latest });

/** The GitHub repository page a release link belongs to (`https://github.com/<owner>/<repo>`), or null. */
function releaseRepo(releaseUrl: string | null | undefined): string | null {
  const safe = safeReleaseUrl(releaseUrl);
  if (!safe) return null;
  const u = new URL(safe);
  if (u.hostname !== 'github.com' || u.port || u.username || u.password || u.search || u.hash) return null;
  const m = /^\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/releases\/tag\/[^/]+$/.exec(u.pathname);
  return m ? `https://github.com/${m[1]}/${m[2]}` : null;
}

/**
 * The notice's link, on the offered release's repository (its link must be an https github.com release page): one
 * missed release links to its own page ("What 0.1.13 fixed"); several link to the releases list ("Release notes").
 */
export function missedSecurityLink(
  vs: readonly string[],
  releaseUrl: string | null | undefined,
  intl: IntlShape = EN_INTL,
): { href: string; label: string } | null {
  const repo = releaseRepo(releaseUrl);
  if (!repo || vs.length === 0) return null;
  return vs.length === 1
    ? { href: `${repo}/releases/tag/v${vs[0]}`, label: intl.formatMessage(updateStatusMessages.whatFixed, { version: vs[0] }) }
    : { href: `${repo}/releases`, label: intl.formatMessage(updateStatusMessages.releaseNotes) };
}

/** Settings' section list: the Updates entry's meta. An apply running or failed comes first; then skipped security
 *  fixes in amber ("Security fixes"), then a plain ready update. */
export function updatesNavMeta(
  s: UpdateStatus | null | undefined,
  intl: IntlShape = EN_INTL,
): { meta?: string; metaTone?: 'ok' | 'warn' | 'alert' } {
  const m = updateStatusMessages;
  const apply = s?.apply;
  if (apply && !isApplyTerminal(apply.phase)) return { meta: intl.formatMessage(m.navUpdating), metaTone: 'warn' };
  if (apply && (apply.phase === 'failed' || apply.phase === 'rolled_back')) return { meta: intl.formatMessage(m.navFailed), metaTone: 'alert' };
  if (missedSecurity(s).length > 0) return { meta: intl.formatMessage(m.navSecurity), metaTone: 'warn' };
  return s?.updateAvailable ? { meta: intl.formatMessage(m.navReady), metaTone: 'ok' } : {};
}
