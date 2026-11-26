// Apps page model on top of the shared library rules (web/src/data/apps.ts): file types, where a library app
// installs from, and the library loader the three sources share. No JSX.
import { useCallback, useEffect, useRef, useState } from 'react';
import { defineMessage, defineMessages, useIntl, type IntlShape, type MessageDescriptor } from 'react-intl';
import { getAppConfigLinks, listApplications, type Application } from '../api/applications';
import { getServerBaseUrl } from '../api/configurations';
import { isDeployableLibraryApp, isHostedHere } from '../data/apps';
import { apiErrorText } from '../api/apiErrorText';

/** Order of the Custom APK source choices. */
export const FILE_EXTS = ['.apk', '.apks', '.xapk', '.apkm', '.zip'] as const;
export const FILE_ACCEPT = [...FILE_EXTS, 'application/vnd.android.package-archive'].join(',');

/** Number of split parts in a version's `parts` JSON string (0 when absent or unreadable). */
export function partCount(parts: string | undefined): number {
  if (!parts) return 0;
  try {
    const p = JSON.parse(parts) as unknown;
    return Array.isArray(p) ? p.length : 0;
  } catch {
    return 0;
  }
}

export type LibrarySource = 'uploaded' | 'link' | 'bundle' | 'fdroid';

/** The name of each source, as the Source column and filter show it. */
export const SOURCE_MESSAGES: Record<LibrarySource, MessageDescriptor> = defineMessages({
  uploaded: { id: 'apps.source.uploaded', defaultMessage: 'Uploaded' },
  link: { id: 'apps.source.link', defaultMessage: 'Link' },
  bundle: { id: 'apps.source.bundle', defaultMessage: 'Split bundle' },
  fdroid: { id: 'apps.source.fdroid', defaultMessage: 'F-Droid' },
});

const noteMessages = defineMessages({
  parts: {
    id: 'apps.source.noteParts',
    defaultMessage: '{count, plural, one {# part} other {# parts}}',
  },
  hosted: { id: 'apps.source.noteHosted', defaultMessage: 'Hosted by MDMesh' },
  downloaded: { id: 'apps.source.noteDownloaded', defaultMessage: 'Downloaded by each device' },
});

const modelMessages = defineMessages({
  loadFailed: { id: 'apps.model.loadFailed', defaultMessage: 'Could not load the app library.' },
});
const configurationFallbackMessage = defineMessage<{ id: string | number }>({
  id: 'apps.model.configurationFallback',
  defaultMessage: 'Configuration {id}',
});

/** The second line of a source: a host name (already text), or a message to format. */
export type SourceNote = { text: string } | { message: MessageDescriptor; values?: Record<string, number> };

export function formatSourceNote(intl: IntlShape, note: SourceNote): string {
  return 'text' in note ? note.text : intl.formatMessage(note.message, note.values);
}

function hostOf(url: string): string {
  try {
    return new URL(url.trim()).host;
  } catch {
    return url.trim();
  }
}

export function isFdroidUrl(url: string | undefined): boolean {
  if (!url) return false;
  const h = hostOf(url).toLowerCase();
  return h === 'f-droid.org' || h.endsWith('.f-droid.org');
}

export interface SourceInfo {
  kind: LibrarySource;
  /** Second line: "Hosted by MDMesh", "cdn.example.com", "3 parts", "Downloaded by each device". */
  note: SourceNote;
  /** MDMesh hosts the file (or every part) and works out the checksum itself. */
  hosted: boolean;
}

/** Where a library app installs from, inferred from its url host and split parts. */
export function sourceOf(app: Application, baseUrl: string | null): SourceInfo {
  const parts = partCount(app.parts);
  if (parts > 1 || (!app.url && parts > 0)) {
    return { kind: 'bundle', note: { message: noteMessages.parts, values: { count: parts } }, hosted: true };
  }
  if (isHostedHere(app.url, baseUrl)) return { kind: 'uploaded', note: { message: noteMessages.hosted }, hosted: true };
  if (isFdroidUrl(app.url)) return { kind: 'fdroid', note: { message: noteMessages.downloaded }, hosted: false };
  return { kind: 'link', note: { text: app.url ? hostOf(app.url) : '' }, hosted: false };
}

/** An app MDMesh doesn't host and that has no stored SHA-256: devices refuse to install it. */
export function missingChecksum(app: Application, baseUrl: string | null): boolean {
  return !!app.url && !sourceOf(app, baseUrl).hosted && app.hasApkHash === false;
}

/** Library list and the server's base.url, shared by the three sources (tab count, F-Droid "In library"). */
export interface LibraryState {
  /** Deployable library apps; null while loading. */
  apps: Application[] | null;
  error: string | null;
  baseUrl: string | null;
  reload: () => void;
  setApps: (update: (current: Application[]) => Application[]) => void;
}

export function useLibrary(): LibraryState {
  const intl = useIntl();
  const [apps, setAppsState] = useState<Application[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The server's base.url decides which APK URLs it hosts (and hashes itself); null until read.
  const [baseUrl, setBaseUrl] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    listApplications()
      .then((list) => {
        if (!cancelled) setAppsState(list.filter(isDeployableLibraryApp));
      })
      .catch(() => {
        if (cancelled) return;
        setAppsState((cur) => cur ?? []);
        setError(intl.formatMessage(modelMessages.loadFailed));
      });
    return () => {
      cancelled = true;
    };
  }, [tick, intl]);

  useEffect(() => {
    let cancelled = false;
    getServerBaseUrl()
      .then((u) => !cancelled && setBaseUrl(u))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const setApps = useCallback((update: (current: Application[]) => Application[]) => {
    setAppsState((cur) => (cur ? update(cur) : cur));
  }, []);

  return { apps, error, baseUrl, reload, setApps };
}

/** The source tabs the role has something to do on, besides the Library (which every role with the page sees). */
export interface Sources {
  custom: boolean;
  fdroid: boolean;
}

/** Configuration names per app id: undefined = loading, 'error' = could not load. */
export type UsedIn = Record<number, string[] | 'error' | undefined>;

/**
 * "Used in" for the library: configuration names from each used app's configuration links. The list already says
 * which apps are used at all (`deletionProhibited`), so unused apps cost no request. Answers are kept for the
 * life of the Apps page (across tab switches and library reloads): only apps not asked about yet, or whose last
 * answer failed, are probed (at most 4 at a time), and `invalidate(id)` drops one app's answer after a change that
 * affects its links. `active` false (another tab) starts no probes.
 */
export function useUsedIn(apps: Application[] | null, active: boolean): { usedIn: UsedIn; invalidate: (id: number) => void } {
  const intl = useIntl();
  const [answers, setAnswers] = useState<Record<number, string[] | 'error'>>({});
  // Mirrors `answers` for the effect (which must not re-run on every answer), plus the ids being asked now.
  const known = useRef<Record<number, string[] | 'error'>>({});
  const inFlight = useRef(new Set<number>());
  // Bumped per app by invalidate(): an answer to a question asked before the change is dropped.
  const versions = useRef<Record<number, number>>({});
  const alive = useRef(true);
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (!apps || !active) return;
    let stopped = false;
    const todo = apps.filter(
      (a) => a.deletionProhibited !== false && !inFlight.current.has(a.id) && (known.current[a.id] ?? 'error') === 'error',
    );
    let i = 0;
    const worker = async () => {
      while (!stopped && i < todo.length) {
        const a = todo[i++];
        const version = versions.current[a.id] ?? 0;
        inFlight.current.add(a.id);
        let answer: string[] | 'error';
        try {
          const links = await getAppConfigLinks(a.id);
          answer = links
            .filter((l) => l.id != null)
            .map((l) => l.configurationName || intl.formatMessage(configurationFallbackMessage, { id: l.configurationId }));
        } catch {
          answer = 'error';
        }
        if ((versions.current[a.id] ?? 0) !== version) continue; // asked before an invalidate: a newer probe owns it
        inFlight.current.delete(a.id);
        // An answer is still right for its app after the list changed, so it is kept even if this run stopped.
        known.current = { ...known.current, [a.id]: answer };
        if (alive.current) setAnswers(known.current);
      }
    };
    void Promise.all(Array.from({ length: Math.min(4, todo.length) }, worker));
    return () => {
      stopped = true;
    };
  }, [apps, active, generation, intl]);

  const invalidate = useCallback((id: number) => {
    versions.current = { ...versions.current, [id]: (versions.current[id] ?? 0) + 1 };
    inFlight.current.delete(id);
    const rest = { ...known.current };
    delete rest[id];
    known.current = rest;
    setAnswers(rest);
    setGeneration((g) => g + 1);
  }, []);

  const usedIn: UsedIn = {};
  for (const a of apps ?? []) usedIn[a.id] = a.deletionProhibited === false ? [] : answers[a.id];
  return { usedIn, invalidate };
}

/** "41.0 MB" (1 decimal under 100, none above). */
export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '';
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 100 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

/** A configuration's name for a link that has none: "Configuration 7". */
export function configurationFallback(intl: IntlShape, id: number | string): string {
  return intl.formatMessage(configurationFallbackMessage, { id });
}

/** What a failed request says: the console's own ApiError texts translated, the server's as sent (apiErrorText). */
export function errorText(e: unknown, intl: Pick<IntlShape, 'formatMessage'>): string {
  return apiErrorText(intl, e);
}
