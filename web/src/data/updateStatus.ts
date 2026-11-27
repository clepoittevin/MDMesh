// Wording and rules for the supervisor's update status, shared by the Overview server card, the sidebar's update
// card and Settings → Updates.
import { defineMessages, type IntlShape } from 'react-intl';
import { isApplyTerminal, type UpdateStatus } from '../api/updates';
import { compareVersions } from './releaseNotes';
import { fmtDate } from '../ui/format';
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
  missedTextBlocked: {
    id: 'updates.security.missedTextBlocked',
    defaultMessage:
      '{versions} fixed security issues this server doesn’t have yet. It runs {current}, and can’t install {latest} itself (below).',
  },
  whatFixed: { id: 'updates.security.whatFixed', defaultMessage: 'What {version} fixed' },
  releaseNotes: { id: 'updates.security.releaseNotes', defaultMessage: 'Release notes' },
  navUpdating: { id: 'updates.nav.updating', defaultMessage: 'Updating' },
  navFailed: { id: 'updates.nav.failed', defaultMessage: 'Failed' },
  navSecurity: { id: 'updates.nav.securityFixes', defaultMessage: 'Security fixes' },
  navReady: { id: 'updates.nav.ready', defaultMessage: '1 ready' },
  navCantInstall: { id: 'updates.nav.cantInstall', defaultMessage: 'Can’t install' },
  serverFirst: {
    id: 'updates.serverFirst',
    defaultMessage: 'Agent {version} comes with server {version}: update the server first, then roll it out here.',
  },
  blockedShortSecurity: {
    id: 'updates.blocked.short.security',
    defaultMessage: 'This server is missing security fixes from {versions}, and can’t install them itself.',
  },
  blockedShortPlatform: { id: 'updates.blocked.short.platform', defaultMessage: 'Its images don’t include this server’s platform.' },
  blockedShortPlatformNamed: {
    id: 'updates.blocked.short.platformNamed',
    defaultMessage: 'Its images don’t include this server’s platform ({platform}).',
  },
  blockedShortOwner: { id: 'updates.blocked.short.owner', defaultMessage: 'Its images are published under another owner.' },
  blockedShortDigests: { id: 'updates.blocked.short.digests', defaultMessage: 'Its images aren’t pinned by digest.' },
  blockedShortOther: { id: 'updates.blocked.short.other', defaultMessage: 'This server can’t install it itself.' },
  blockedTextPlatform: {
    id: 'updates.blocked.text.platform',
    defaultMessage:
      'Its images don’t include this server’s platform. This server keeps running {current}. To follow later releases, wait for one with images for this platform, or move to the native install (DEPLOY.md, Option C), which runs on x86_64 and Arm64.',
  },
  blockedTextPlatformNamed: {
    id: 'updates.blocked.text.platformNamed',
    defaultMessage:
      'Its images don’t include this server’s platform ({platform}). This server keeps running {current}. To follow later releases, wait for one with images for this platform, or move to the native install (DEPLOY.md, Option C), which runs on x86_64 and Arm64.',
  },
  blockedTextOwner: {
    id: 'updates.blocked.text.owner',
    defaultMessage:
      'It publishes its images under another owner than this server pulls from. Set GITHUB_REPO or IMAGE_OWNER in the server’s .env to match, then run docker compose up -d.',
  },
  blockedTextDigests: {
    id: 'updates.blocked.text.digests',
    defaultMessage: 'Its signed manifest doesn’t pin its images by digest, so it can only be installed by hand (docs/UPGRADING.md).',
  },
  blockedTextOther: { id: 'updates.blocked.text.other', defaultMessage: 'The updater says: {reason}.' },
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
  return fmtDate(ms, { day: 'numeric', month: 'short', year: 'numeric' });
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
 * A newer release, as every update hint shows it: on offer (`ready`), or found but not installable by this server's
 * updater (`blocked`: the supervisor's `blocked`, absent before 0.6.0), with the security releases this server is
 * missing (the supervisor's `missedSecurity`, from the verified manifest only; absent before 0.5.0). For `ready` they
 * are the ones the update skips over; for `blocked`, also the release itself when it has security fixes. Null when
 * there's nothing newer to show.
 */
export interface UpdateOffer {
  kind: 'ready' | 'blocked';
  latest: string;
  missed: string[];
}
export function updateOffer(s: UpdateStatus | null | undefined): UpdateOffer | null {
  if (!s?.latest) return null;
  const kind = s.updateAvailable ? 'ready' : s.blocked ? 'blocked' : null;
  if (!kind) return null;
  const missed = Array.isArray(s.missedSecurity)
    ? s.missedSecurity.filter((v): v is string => typeof v === 'string' && RELEASE_VERSION.test(v))
    : [];
  return { kind, latest: s.latest, missed };
}

/** The security releases this server is missing while a newer release is shown (updateOffer), oldest first. */
export function missedSecurity(s: UpdateStatus | null | undefined): string[] {
  return updateOffer(s)?.missed ?? [];
}

/** "MDMesh X is the latest release" / "Up to date": the last check worked, and found nothing newer on offer, blocked
 *  or unverified. */
export function upToDate(s: UpdateStatus | null | undefined): boolean {
  return !!s && !lastCheckError(s) && !updateOffer(s) && !unverifiedRelease(s);
}

/** A newer release was found whose signature couldn't be verified (never offered or installed). */
export function unverifiedRelease(s: UpdateStatus | null | undefined): boolean {
  return (
    !!s &&
    !s.updateAvailable &&
    !s.verified &&
    !!s.latest &&
    RELEASE_VERSION.test(s.latest) &&
    RELEASE_VERSION.test(s.current) &&
    compareVersions(s.latest, s.current) > 0
  );
}

/**
 * The updater has checked and has no agent APK to offer, and it is the one serving /files/agent.apk, which the
 * enrollment QR code points at: a device that scans the code can't install the agent. (A native install serves its
 * last published copy; a supervisor before 0.6.0 doesn't say, and serves it on the installs that update themselves.
 * A console without a reachable updater can't tell.)
 */
export function agentUnavailable(s: UpdateStatus | null | undefined): boolean {
  if (!s || !s.checkedAt || s.apk) return false;
  return s.apkServed ?? s.applySupported !== false;
}

/**
 * Settings → Agent rollout: the agent of a newer release, which comes with that release's server and isn't offered
 * until the server runs it (the updater never offers an agent ahead of the server). Null when there's none.
 */
export function agentAfterServerUpdate(s: UpdateStatus | null | undefined): string | null {
  if (!s?.latest || !RELEASE_VERSION.test(s.latest) || !RELEASE_VERSION.test(s.current)) return null;
  if (compareVersions(s.latest, s.current) <= 0 || s.apk?.version === s.latest) return null;
  return s.latest;
}

/**
 * An active rollout's agent is newer than the server (after a rollback, say): the updater refuses to hand that agent
 * out (HTTP 409), so devices that haven't installed it yet can't. The server's version when so, else null.
 */
export function rolloutAheadOfServer(targetVersion: string | null | undefined, s: UpdateStatus | null | undefined): string | null {
  if (!targetVersion || !s || !RELEASE_VERSION.test(targetVersion) || !RELEASE_VERSION.test(s.current)) return null;
  return compareVersions(targetVersion, s.current) > 0 ? s.current : null;
}

/** The plain rule, for Rollout: the newer release's agent comes after its server. */
export const serverFirstText = (version: string, intl: IntlShape = EN_INTL): string =>
  intl.formatMessage(updateStatusMessages.serverFirst, { version });

/** A blocked release, in a few words for the sidebar and the Overview (its cause, unless security comes first). */
export function blockedShort(s: UpdateStatus, missed: readonly string[], intl: IntlShape = EN_INTL): string {
  const m = updateStatusMessages;
  if (missed.length > 0) return intl.formatMessage(m.blockedShortSecurity, { versions: joinVersions(missed, intl) });
  switch (s.blockedCode) {
    case 'platform':
      return intl.formatMessage(s.platform ? m.blockedShortPlatformNamed : m.blockedShortPlatform, { platform: s.platform });
    case 'owner':
      return intl.formatMessage(m.blockedShortOwner);
    case 'digests':
      return intl.formatMessage(m.blockedShortDigests);
    default:
      return intl.formatMessage(m.blockedShortOther);
  }
}

/** Settings → Updates: why a blocked release can't be installed here, and what to do. */
export function blockedText(s: UpdateStatus, intl: IntlShape = EN_INTL): string {
  const m = updateStatusMessages;
  switch (s.blockedCode) {
    case 'platform':
      return intl.formatMessage(s.platform ? m.blockedTextPlatformNamed : m.blockedTextPlatform, { platform: s.platform, current: s.current });
    case 'owner':
      return intl.formatMessage(m.blockedTextOwner);
    case 'digests':
      return intl.formatMessage(m.blockedTextDigests);
    default:
      return s.blocked ? intl.formatMessage(m.blockedTextOther, { reason: s.blocked }) : '';
  }
}

/** "0.1.13", "0.1.13 and 0.1.14", "0.1.12, 0.1.13 and 0.1.14". */
export function joinVersions(vs: readonly string[], intl: IntlShape = EN_INTL): string {
  if (vs.length <= 1) return vs[0] ?? '';
  return intl.formatMessage(updateStatusMessages.versionsJoin, { head: vs.slice(0, -1).join(', '), last: vs[vs.length - 1] });
}

/** The line under an update that skips security releases (the sidebar card, the Overview's Server card). */
export const missedSecurityShort = (vs: readonly string[], intl: IntlShape = EN_INTL): string =>
  intl.formatMessage(updateStatusMessages.missedShort, { versions: joinVersions(vs, intl) });

/** Settings → Updates: the notice's text (`blocked`: the release that has them can't be installed here). */
export const missedSecurityText = (vs: readonly string[], current: string, latest: string, blocked = false, intl: IntlShape = EN_INTL): string =>
  intl.formatMessage(blocked ? updateStatusMessages.missedTextBlocked : updateStatusMessages.missedText, {
    versions: joinVersions(vs, intl),
    current,
    latest,
  });

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

/** Settings' section list: the Updates entry's meta. An apply running or failed comes first; then missing security
 *  fixes in amber ("Security fixes"), then a release this server can't install (quiet), then a plain ready update. */
export function updatesNavMeta(
  s: UpdateStatus | null | undefined,
  intl: IntlShape = EN_INTL,
): { meta?: string; metaTone?: 'ok' | 'warn' | 'alert' } {
  const m = updateStatusMessages;
  const apply = s?.apply;
  if (apply && !isApplyTerminal(apply.phase)) return { meta: intl.formatMessage(m.navUpdating), metaTone: 'warn' };
  if (apply && (apply.phase === 'failed' || apply.phase === 'rolled_back')) return { meta: intl.formatMessage(m.navFailed), metaTone: 'alert' };
  const offer = updateOffer(s);
  if (offer && offer.missed.length > 0) return { meta: intl.formatMessage(m.navSecurity), metaTone: 'warn' };
  if (offer?.kind === 'blocked') return { meta: intl.formatMessage(m.navCantInstall) };
  return offer ? { meta: intl.formatMessage(m.navReady), metaTone: 'ok' } : {};
}
