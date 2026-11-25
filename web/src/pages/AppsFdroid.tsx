import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { defineMessages, useIntl, type MessageDescriptor } from 'react-intl';
import { listApplications, saveAndroidApplication, type Application } from '../api/applications';
import { searchFdroid, type FDroidApp } from '../api/fdroid';
import {
  AppTile,
  Button,
  Card,
  EmptyState,
  ErrorState,
  IconCheck,
  IconInfo,
  IconSearch,
  IconWarning,
  SearchInput,
  ShowMore,
  Skeleton,
  useToast,
} from '../ui';
import { canDeploy, type DeployModes, type DeploySubject } from '../data/apps';
import { CORE_ACTION_ACCESS } from '../ext/core/access';
import { usePermission } from '../ext/permissions';
import { errorText } from './appsModel';

/** The server caps a search at 100 results; one request fetches them all, Show more pages through them. */
const FETCH_LIMIT = 100;
const PAGE = 12;

const messageDefs = defineMessages({
  addedTitle: { id: 'apps.fdroid.addedTitle', defaultMessage: 'Added to Library' },
  addedBody: {
    id: 'apps.fdroid.addedBody',
    defaultMessage: '{name} is in your Library — now assignable to a configuration.',
  },
  alreadyTitle: { id: 'apps.fdroid.alreadyTitle', defaultMessage: 'Already in Library' },
  alreadyBody: { id: 'apps.fdroid.alreadyBody', defaultMessage: '{name} is already in your Library.' },
  addFailedTitle: { id: 'apps.fdroid.addFailedTitle', defaultMessage: 'Could not add to Library' },
  addFailedBody: { id: 'apps.fdroid.addFailedBody', defaultMessage: 'The server rejected the save.' },
  searchLabel: { id: 'apps.fdroid.searchLabel', defaultMessage: 'Search F-Droid' },
  searchPlaceholder: { id: 'apps.fdroid.searchPlaceholder', defaultMessage: 'Search the F-Droid catalogue' },
  matchesInfo: {
    id: 'apps.fdroid.matchesInfo',
    defaultMessage:
      'Matches from the f-droid.org catalogue. Devices download the app straight from f-droid.org, and MDMesh checks it against the catalogue’s checksum.',
  },
  browseInfo: {
    id: 'apps.fdroid.browseInfo',
    defaultMessage:
      'The f-droid.org catalogue, A to Z. Devices download the app straight from f-droid.org, and MDMesh checks it against the catalogue’s checksum.',
  },
  loadThing: { id: 'apps.fdroid.loadThing', defaultMessage: 'the F-Droid catalogue' },
  gridLabel: { id: 'apps.fdroid.gridLabel', defaultMessage: 'F-Droid apps' },
  searching: { id: 'apps.fdroid.searching', defaultMessage: 'Searching F-Droid…' },
  noMatch: { id: 'apps.fdroid.noMatch', defaultMessage: 'No apps match your search' },
  inLibrary: { id: 'apps.fdroid.inLibrary', defaultMessage: 'In library' },
  noChecksum: {
    id: 'apps.fdroid.noChecksum',
    defaultMessage: 'No checksum in the catalogue, can’t deploy',
  },
  deployNamed: { id: 'apps.fdroid.deployNamed', defaultMessage: 'Deploy {name}' },
  deploy: { id: 'apps.fdroid.deploy', defaultMessage: 'Deploy' },
  adding: { id: 'apps.fdroid.adding', defaultMessage: 'Adding…' },
  addToLibrary: { id: 'apps.fdroid.addToLibrary', defaultMessage: 'Add to library' },
  // Read out after the visible words (2.5.3, label in name): a space while adding, a colon otherwise.
  nameSuffix: {
    id: 'apps.fdroid.nameSuffix',
    defaultMessage: '{busy, select, true { {name}} other {: {name}}}',
  },
  capped: {
    id: 'apps.fdroid.capped',
    defaultMessage: 'Showing the first {count} matches. Search to narrow them down.',
  },
});
// Widened so values can be passed (react-intl would otherwise type them from the ICU text).
const messages: { [K in keyof typeof messageDefs]: MessageDescriptor } = messageDefs;

/**
 * F-Droid: search the catalogue the server caches, add an app to the library or deploy it straight from
 * f-droid.org. Apps without a SHA-256 in the index can't be deployed (devices could not verify them).
 */
export function AppsFdroid({
  tabs,
  library,
  deployModes,
  onDeploy,
  onLibraryChanged,
}: {
  tabs: ReactNode;
  /** Deployable library apps (null while loading): drives "In library". */
  library: Application[] | null;
  deployModes: DeployModes;
  /** Left out for a role that may not deploy at all; an app is offered Deploy when the role has a mode for it. */
  onDeploy?: (s: DeploySubject) => void;
  onLibraryChanged: () => void;
}) {
  const intl = useIntl();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [apps, setApps] = useState<FDroidApp[] | null>(null);
  const [error, setError] = useState(false);
  const [searching, setSearching] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const [tick, setTick] = useState(0);
  const [adding, setAdding] = useState<Set<string>>(() => new Set());
  /** Packages added here, until the library list catches up. */
  const [added, setAdded] = useState<Map<string, number>>(() => new Map());
  // Adding to the library needs edit_applications (ext/core/access.ts).
  const canAdd = usePermission(CORE_ACTION_ACCESS.addApp);

  useEffect(() => {
    let cancelled = false;
    setError(false);
    const t = setTimeout(
      () => {
        setSearching(true);
        searchFdroid(q, FETCH_LIMIT)
          .then((r) => {
            if (cancelled) return;
            setApps(r);
            setShown(PAGE);
          })
          .catch(() => {
            if (cancelled) return;
            setApps([]);
            setError(true);
          })
          .finally(() => !cancelled && setSearching(false));
      },
      q ? 350 : 0,
    );
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, tick]);

  const byPkg = useMemo(() => {
    const m = new Map<string, Application>();
    for (const a of library ?? []) if (!m.has(a.pkg)) m.set(a.pkg, a);
    return m;
  }, [library]);

  /** The library id to deploy with: only when the library entry is this exact catalogue version. */
  function libraryIdFor(a: FDroidApp): number | undefined {
    const lib = byPkg.get(a.packageName);
    if (lib) return lib.versionCode === a.versionCode ? lib.id : undefined;
    return added.get(a.packageName);
  }

  /** Pushing works for any catalogue app; adding to a configuration only for one already in the library. */
  const deployable = (a: FDroidApp) => !!onDeploy && canDeploy(deployModes, { applicationId: libraryIdFor(a) });

  function deploy(a: FDroidApp) {
    if (!a.sha256 || !onDeploy) return; // no checksum, or the role may not: the action isn't offered
    onDeploy({
      label: a.name,
      packageName: a.packageName,
      url: a.apkUrl,
      versionCode: a.versionCode,
      // The hex sha256 from the F-Droid index pins the APK the admin picked.
      sha256: a.sha256,
      applicationId: libraryIdFor(a),
    });
  }

  // Same as the Custom APK link path: a library entry pointing at f-droid.org, pinned by the index's SHA-256.
  async function addToLibrary(a: FDroidApp) {
    if (!a.sha256) return;
    setAdding((s) => new Set(s).add(a.packageName));
    try {
      const saved = await saveAndroidApplication({
        name: a.name || a.packageName,
        pkg: a.packageName,
        url: a.apkUrl,
        sha256: a.sha256.toLowerCase(),
        version: a.versionName || String(a.versionCode), // applicationVersions.version is NOT NULL
        versionCode: a.versionCode,
        type: 'app',
      });
      setAdded((m) => new Map(m).set(a.packageName, saved.id));
      toast.push('ok', intl.formatMessage(messages.addedTitle), intl.formatMessage(messages.addedBody, { name: a.name }));
      onLibraryChanged();
    } catch (e) {
      const existing = (await listApplications(a.packageName).catch(() => [])).find((x) => x.pkg === a.packageName);
      if (existing?.id) {
        toast.push('ok', intl.formatMessage(messages.alreadyTitle), intl.formatMessage(messages.alreadyBody, { name: a.name }));
        onLibraryChanged();
      } else {
        toast.push('err', intl.formatMessage(messages.addFailedTitle), errorText(e) || intl.formatMessage(messages.addFailedBody));
      }
    } finally {
      setAdding((s) => {
        const n = new Set(s);
        n.delete(a.packageName);
        return n;
      });
    }
  }

  const visible = apps ? apps.slice(0, shown) : [];
  const capped = !!apps && apps.length >= FETCH_LIMIT && shown >= apps.length;

  return (
    <>
      <div className="v2-apps-toolbar">
        {tabs}
        <span className="v2-apps-toolbar__spacer" />
        <SearchInput
          className="v2-apps-fd__search"
          aria-label={intl.formatMessage(messages.searchLabel)}
          placeholder={intl.formatMessage(messages.searchPlaceholder)}
          value={q}
          onChange={setQ}
        />
      </div>

      <p className="v2-apps-fd__info">
        <IconInfo size={16} />
        <span>
          {intl.formatMessage(q.trim() ? messages.matchesInfo : messages.browseInfo)}
        </span>
      </p>

      {error ? <ErrorState thing={intl.formatMessage(messages.loadThing)} onRetry={() => setTick((t) => t + 1)} /> : null}

      {apps === null ? (
        <ul className="v2-apps-fd__grid" aria-busy="true" aria-label={intl.formatMessage(messages.gridLabel)}>
          <li className="v2-visually-hidden" role="status">
            {intl.formatMessage(messages.searching)}
          </li>
          {Array.from({ length: 6 }, (_, i) => (
            <li key={i} className="v2-apps-fd__card is-loading" aria-hidden="true">
              <div className="v2-apps-fd__body">
                <Skeleton width="44px" height="44px" />
                <div className="v2-apps-fd__text">
                  <Skeleton width="50%" height="title" />
                  <Skeleton width="70%" />
                  <Skeleton width="90%" />
                </div>
              </div>
              <div className="v2-apps-fd__foot">
                <Skeleton width="25%" />
              </div>
            </li>
          ))}
        </ul>
      ) : apps.length === 0 ? (
        error ? null : (
          <Card>
            <EmptyState icon={<IconSearch />} title={intl.formatMessage(messages.noMatch)} />
          </Card>
        )
      ) : (
        <>
          <ul className="v2-apps-fd__grid" aria-label={intl.formatMessage(messages.gridLabel)} aria-busy={searching || undefined}>
            {visible.map((a) => {
              const inLib = byPkg.has(a.packageName) || added.has(a.packageName);
              const busy = adding.has(a.packageName);
              return (
                <li key={a.packageName} className="v2-apps-fd__card">
                  <div className="v2-apps-fd__body">
                    <AppTile name={a.name} size={44} src={a.iconUrl ?? undefined} />
                    <div className="v2-apps-fd__text">
                      <h3 className="v2-apps-fd__name">{a.name}</h3>
                      <span className="v2-apps-fd__pkg" title={a.packageName}>
                        {a.packageName}
                      </span>
                      {a.summary ? <p className="v2-apps-fd__summary">{a.summary}</p> : null}
                    </div>
                  </div>
                  <div className="v2-apps-fd__foot">
                    <span className="v2-apps-fd__ver">{a.versionName || a.versionCode}</span>
                    {!a.sha256 ? (
                      <>
                        {inLib ? (
                          <span className="v2-apps-fd__inlib">
                            <IconCheck size={14} />
                            {intl.formatMessage(messages.inLibrary)}
                          </span>
                        ) : null}
                        <span className="v2-apps-fd__blocked">
                          <IconWarning size={14} />
                          {intl.formatMessage(messages.noChecksum)}
                        </span>
                      </>
                    ) : inLib ? (
                      <>
                        <span className="v2-apps-fd__inlib">
                          <IconCheck size={14} />
                          {intl.formatMessage(messages.inLibrary)}
                        </span>
                        {deployable(a) ? (
                          <Button size="sm" onClick={() => deploy(a)} aria-label={intl.formatMessage(messages.deployNamed, { name: a.name })}>
                            {intl.formatMessage(messages.deploy)}
                          </Button>
                        ) : null}
                      </>
                    ) : (
                      <>
                        {canAdd ? (
                          <Button size="sm" disabled={busy} onClick={() => void addToLibrary(a)}>
                            {/* The name starts with the visible words (2.5.3, label in name); the app's name follows. */}
                            {intl.formatMessage(busy ? messages.adding : messages.addToLibrary)}
                            <span className="v2-visually-hidden">{intl.formatMessage(messages.nameSuffix, { busy: String(busy), name: a.name })}</span>
                          </Button>
                        ) : null}
                        {deployable(a) ? (
                          <Button size="sm" variant="primary" onClick={() => deploy(a)} aria-label={intl.formatMessage(messages.deployNamed, { name: a.name })}>
                            {intl.formatMessage(messages.deploy)}
                          </Button>
                        ) : null}
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {shown < apps.length ? (
            <ShowMore onClick={() => setShown((n) => n + PAGE)} />
          ) : capped ? (
            <p className="v2-apps-fd__capped">{intl.formatMessage(messages.capped, { count: FETCH_LIMIT })}</p>
          ) : null}
        </>
      )}
    </>
  );
}
