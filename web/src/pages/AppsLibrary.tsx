import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { configName } from '../data/seededConfigs';
import { defineMessages, FormattedMessage, useIntl, type IntlShape, type MessageDescriptor } from 'react-intl';
import {
  deleteApplication,
  getAppConfigLinks,
  getVersions,
  setVersionSha256,
  type Application,
  type ApplicationVersion,
} from '../api/applications';
import { useAuth } from '../auth/AuthContext';
import {
  AppTile,
  Badge,
  Button,
  ButtonLink,
  Card,
  EmptyState,
  ErrorState,
  Field,
  IconApps,
  IconButton,
  IconCheck,
  IconDownload,
  IconWarning,
  Input,
  LabelledSelect,
  Menu,
  Modal,
  Notice,
  SearchInput,
  Skeleton,
  SkeletonRows,
  Table,
  Tooltip,
  useMediaQuery,
  useToast,
  type SortDir,
} from '../ui';
import { useStickyValue } from '../ui/useStickyValue';
import { loneButtonItem } from '../ui/loneAction';
import { useRefocusAfterRemove } from '../ui/useRefocusAfterRemove';
import { SHA256_HEX, targetVersion } from '../data/apps';
import { CORE_ACTION_ACCESS } from '../ext/core/access';
import { withCoreAppsParts } from '../ext/core/lists';
import { ORDER } from '../ext/core/order';
import { useListColumns, useRowActionHelpers, useRowMenu, type PlacedColumn } from '../ext/hosts/lists';
import { usePermission } from '../ext/permissions';
import {
  SOURCE_MESSAGES,
  configurationFallback,
  errorText,
  formatSourceNote,
  missingChecksum,
  sourceOf,
  type LibrarySource as SourceKind,
  type LibraryState,
  type Sources,
  type UsedIn,
} from './appsModel';

type SourceFilter = 'all' | SourceKind;

const NARROW = '(max-width: 900px)';

const messageDefs = defineMessages({
  waysUploadFdroid: {
    id: 'apps.library.waysUploadFdroid',
    defaultMessage: 'Upload an APK or link to one, or pick an app from F-Droid.',
  },
  waysLinkFdroid: {
    id: 'apps.library.waysLinkFdroid',
    defaultMessage: 'Link to an APK, or pick an app from F-Droid.',
  },
  waysUpload: { id: 'apps.library.waysUpload', defaultMessage: 'Upload an APK or link to one.' },
  waysLink: { id: 'apps.library.waysLink', defaultMessage: 'Link to an APK.' },
  deployHelp: {
    id: 'apps.library.deployHelp',
    defaultMessage: 'Apps in the library can be added to a configuration or pushed straight to devices.',
  },
  noSingleTitle: { id: 'apps.library.noSingleTitle', defaultMessage: 'No single APK' },
  noSingleBody: {
    id: 'apps.library.noSingleBody',
    defaultMessage: 'This app has no single-APK version to set a SHA-256 on.',
  },
  versionsFailed: { id: 'apps.library.versionsFailed', defaultMessage: 'Could not load the app versions' },
  inUseTitle: { id: 'apps.library.inUseTitle', defaultMessage: 'App is still in use' },
  inUseBody: {
    id: 'apps.library.inUseBody',
    defaultMessage:
      'Remove it from {names} before deleting the Library record. This does not uninstall the app from devices.',
  },
  removeFailed: { id: 'apps.library.removeFailed', defaultMessage: 'Remove failed' },
  removedTitle: { id: 'apps.library.removedTitle', defaultMessage: 'Removed from Library' },
  removedBody: { id: 'apps.library.removedBody', defaultMessage: '{name} — devices keep the installed app.' },
  stillUsed: { id: 'apps.library.stillUsed', defaultMessage: 'A configuration still uses this app.' },
  menuChecksum: { id: 'apps.library.menuChecksum', defaultMessage: 'SHA-256 checksum' },
  menuRemoving: { id: 'apps.library.menuRemoving', defaultMessage: 'Removing…' },
  menuRemove: { id: 'apps.library.menuRemove', defaultMessage: 'Remove from library' },
  opening: { id: 'apps.library.opening', defaultMessage: 'Opening…' },
  deploy: { id: 'apps.library.deploy', defaultMessage: 'Deploy' },
  deployNamed: { id: 'apps.library.deployNamed', defaultMessage: 'Deploy {name}' },
  moreFor: { id: 'apps.library.moreFor', defaultMessage: 'More for {name}' },
  missingTip: {
    id: 'apps.library.missingTip',
    defaultMessage: 'Not hosted by MDMesh and no SHA-256: devices refuse to install it.',
  },
  missing: { id: 'apps.library.missing', defaultMessage: 'Missing' },
  hostedTip: {
    id: 'apps.library.hostedTip',
    defaultMessage: 'MDMesh hosts this file and works out its SHA-256; devices check the download against it.',
  },
  storedTip: {
    id: 'apps.library.storedTip',
    defaultMessage: 'Devices check the download against the stored SHA-256.',
  },
  verified: { id: 'apps.library.verified', defaultMessage: 'Verified' },
  notUsed: { id: 'apps.library.notUsed', defaultMessage: 'Not used yet' },
  colApp: { id: 'apps.library.colApp', defaultMessage: 'App' },
  colVersion: { id: 'apps.library.colVersion', defaultMessage: 'Version' },
  colSource: { id: 'apps.library.colSource', defaultMessage: 'Source' },
  colChecksum: { id: 'apps.library.colChecksum', defaultMessage: 'Checksum' },
  colUsedIn: { id: 'apps.library.colUsedIn', defaultMessage: 'Used in' },
  colActions: { id: 'apps.library.colActions', defaultMessage: 'Actions' },
  loadingApps: { id: 'apps.library.loadingApps', defaultMessage: 'Loading apps…' },
  emptyTitle: { id: 'apps.library.emptyTitle', defaultMessage: 'No apps in the library yet' },
  addOwn: { id: 'apps.library.addOwn', defaultMessage: 'Add your own app' },
  browseFdroid: { id: 'apps.library.browseFdroid', defaultMessage: 'Browse F-Droid' },
  noMatchTitle: { id: 'apps.library.noMatchTitle', defaultMessage: 'No apps match your search' },
  libraryLabel: { id: 'apps.library.libraryLabel', defaultMessage: 'Library' },
  tableNoMatch: { id: 'apps.library.tableNoMatch', defaultMessage: 'No apps match your search.' },
  tableEmpty: { id: 'apps.library.tableEmpty', defaultMessage: 'No apps in the library yet.' },
  searchLabel: { id: 'apps.library.searchLabel', defaultMessage: 'Search the library' },
  searchPlaceholder: { id: 'apps.library.searchPlaceholder', defaultMessage: 'Search name or package' },
  sourceFilter: { id: 'apps.library.sourceFilter', defaultMessage: 'Source' },
  sourceAll: { id: 'apps.library.sourceAll', defaultMessage: 'All' },
  loadThing: { id: 'apps.library.loadThing', defaultMessage: 'the app library' },
  missingNotice: { id: 'apps.library.missingNotice', defaultMessage: 'Missing checksum' },
  addChecksum: { id: 'apps.library.addChecksum', defaultMessage: 'Add checksum' },
  missingOne: {
    id: 'apps.library.missingOne',
    defaultMessage:
      '<strong>{name} has no SHA-256 checksum.</strong> Devices only install a linked file they can check against it.{canSet, select, true { Add the checksum before deploying it.} other {}}',
  },
  missingMany: {
    id: 'apps.library.missingMany',
    defaultMessage:
      '<strong>{name} and {count, plural, one {# other app} other {# other apps}} have no SHA-256 checksum.</strong> Devices only install a linked file they can check against its checksum.{canSet, select, true { Add the checksums before deploying them.} other {}}',
  },
  removeTitle: { id: 'apps.library.removeTitle', defaultMessage: 'Remove {name} from the library?' },
  cancel: { id: 'apps.library.cancel', defaultMessage: 'Cancel' },
  removeBody: {
    id: 'apps.library.removeBody',
    defaultMessage:
      'This deletes its library record and the APK files MDMesh hosts for it, unless another library entry uses them. Devices keep the installed app.',
  },
  shaSavedTitle: { id: 'apps.library.shaSavedTitle', defaultMessage: 'SHA-256 saved' },
  shaSavedBody: {
    id: 'apps.library.shaSavedBody',
    defaultMessage: '{name} can now be installed; devices verify the APK against it.',
  },
  shaSaveFailed: { id: 'apps.library.shaSaveFailed', defaultMessage: 'Could not save the SHA-256' },
  shaTitle: { id: 'apps.library.shaTitle', defaultMessage: 'SHA-256 checksum for {name}' },
  shaDescription: {
    id: 'apps.library.shaDescription',
    defaultMessage: 'Devices check the downloaded file against it before they install.',
  },
  saving: { id: 'apps.library.saving', defaultMessage: 'Saving…' },
  save: { id: 'apps.library.save', defaultMessage: 'Save' },
  shaFieldLabel: { id: 'apps.library.shaFieldLabel', defaultMessage: 'SHA-256 (64 hex characters)' },
  shaFieldError: {
    id: 'apps.library.shaFieldError',
    defaultMessage: 'Enter the SHA-256 as 64 hex characters (0-9, a-f).',
  },
  shaFieldHelp: {
    id: 'apps.library.shaFieldHelp',
    defaultMessage: 'A checksum is already stored; this one replaces it.',
  },
});
// Widened so values can be passed (react-intl would otherwise type them from the ICU text).
const messages: { [K in keyof typeof messageDefs]: MessageDescriptor } = messageDefs;

/** The empty library's help: only the ways in and the deploying the role has. */
function emptyLibraryText(intl: IntlShape, sources: Sources, mayUpload: boolean, mayDeploy: boolean): string {
  const ways = sources.fdroid
    ? mayUpload
      ? messages.waysUploadFdroid
      : messages.waysLinkFdroid
    : sources.custom
      ? mayUpload
        ? messages.waysUpload
        : messages.waysLink
      : null;
  return [ways && intl.formatMessage(ways), mayDeploy && intl.formatMessage(messages.deployHelp)].filter(Boolean).join(' ');
}

/**
 * Library: every deployable app in the library as a table (cards ≤ 900px), with the missing-checksum
 * notice, and per row Deploy plus the "…" menu (SHA-256 checksum, Remove from library), revealed on hover or focus.
 */
export function AppsLibrary({
  tabs,
  library,
  sources,
  onDeploy,
  deployingId,
  usedIn,
}: {
  tabs: ReactNode;
  library: LibraryState;
  /** The source tabs shown: the empty library links to these only. */
  sources: Sources;
  /** "Used in" per app (useUsedIn, kept by the page across tab switches). */
  usedIn: UsedIn;
  /** Left out for a role that may not deploy at all (neither edit_devices nor edit_applications): no Deploy. */
  onDeploy?: (app: Application) => void;
  /** The app whose deploy subject is being resolved. */
  deployingId: number | null;
}) {
  const { apps, error, baseUrl, reload, setApps } = library;
  const intl = useIntl();
  const toast = useToast();
  const { user } = useAuth();
  const narrow = useMediaQuery(NARROW);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<SourceFilter>('all');
  const [removing, setRemoving] = useState<number | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<Application | null>(null);
  const [shaFor, setShaFor] = useState<{ app: Application; version: ApplicationVersion } | null>(null);
  // Both dialogs stay mounted while they close, showing what they showed (exit motion).
  const removeShown = useStickyValue(confirmRemove);
  const shaShown = useStickyValue(shaFor);
  // Only extension columns sort (core's never did): null until one is picked.
  const [sort, setSort] = useState<{ key: string; dir: SortDir } | null>(null);
  const extensionColumns = useListColumns('apps');
  const listHelpers = useRowActionHelpers(reload);

  const shown = useMemo(() => {
    if (!apps) return [];
    const needle = q.trim().toLowerCase();
    const matching = apps.filter(
      (a) =>
        (filter === 'all' || sourceOf(a, baseUrl).kind === filter) &&
        (!needle || `${a.name} ${a.pkg}`.toLowerCase().includes(needle)),
    );
    const byExtension = sort && extensionColumns.compare(sort.key, sort.dir);
    return byExtension ? [...matching].sort(byExtension) : matching;
  }, [apps, q, filter, baseUrl, sort, extensionColumns]);

  const missing = useMemo(() => (apps ?? []).filter((a) => missingChecksum(a, baseUrl)), [apps, baseUrl]);

  // The row menu's entry and the missing-checksum notice open the same dialog, so both follow this one check.
  const maySetChecksum = usePermission(CORE_ACTION_ACCESS.setAppChecksum);
  const mayUpload = usePermission(CORE_ACTION_ACCESS.uploadFile);
  const canEditSha = (a: Application) => maySetChecksum && !!a.url && !sourceOf(a, baseUrl).hosted && !a.commonApplication;
  const canRemove = (a: Application) => !a.commonApplication || !!user?.superAdmin;

  // An APK MDMesh doesn't host installs only with a known SHA-256: set it on the version the app installs.
  async function editSha256(app: Application) {
    try {
      const version = targetVersion(app, await getVersions(app.id));
      if (!version?.url) {
        toast.push('err', intl.formatMessage(messages.noSingleTitle), intl.formatMessage(messages.noSingleBody));
        return;
      }
      setShaFor({ app, version });
    } catch (e) {
      toast.push('err', intl.formatMessage(messages.versionsFailed), errorText(e, intl));
    }
  }

  // After a removal, focus goes to the next app rather than falling to the page with the removed row's "…".
  const removeFocus = useRefocusAfterRemove();
  const cancelRemove = () => {
    removeFocus.forget();
    setConfirmRemove(null);
  };

  // #66: removing a library record never uninstalls the app; refuse while a configuration still uses it.
  async function askRemove(app: Application) {
    try {
      const links = await getAppConfigLinks(app.id);
      const active = links.filter((l) => l.id != null);
      if (active.length > 0) {
        const names = active.map((l) =>
          l.configurationName ? configName(intl, { id: l.configurationId, name: l.configurationName }) : configurationFallback(intl, l.configurationId),
        );
        toast.push(
          'err',
          intl.formatMessage(messages.inUseTitle),
          intl.formatMessage(messages.inUseBody, { names: names.join(', ') }),
        );
        removeFocus.forget();
        return;
      }
      setConfirmRemove(app);
    } catch (e) {
      removeFocus.forget();
      toast.push('err', intl.formatMessage(messages.removeFailed), errorText(e, intl));
    }
  }

  async function remove(app: Application) {
    setConfirmRemove(null);
    setRemoving(app.id);
    try {
      await deleteApplication(app.id);
      setApps((cur) => cur.filter((a) => a.id !== app.id));
      toast.push('ok', intl.formatMessage(messages.removedTitle), intl.formatMessage(messages.removedBody, { name: app.name }));
    } catch (e) {
      removeFocus.forget();
      const msg = errorText(e, intl);
      toast.push('err', intl.formatMessage(messages.removeFailed), /config\.reference\.exists/.test(msg) ? intl.formatMessage(messages.stillUsed) : msg);
    } finally {
      setRemoving(null);
    }
  }

  // The "…" menu comes from the registry: core's entries (ext/core/lists.tsx) pick these out of the helpers.
  const helpers = withCoreAppsParts(listHelpers, {
    row: {
      checksum: (a) => (canEditSha(a) ? { key: 'sha', label: intl.formatMessage(messages.menuChecksum), onSelect: () => void editSha256(a) } : null),
      remove: (a) =>
        canRemove(a)
          ? {
              key: 'remove',
              label: intl.formatMessage(removing === a.id ? messages.menuRemoving : messages.menuRemove),
              textValue: intl.formatMessage(messages.menuRemove),
              danger: true,
              disabled: removing != null,
              onSelect: () => {
                removeFocus.remember();
                void askRemove(a);
              },
            }
          : null,
    },
  });
  const rowMenu = useRowMenu('apps', helpers);
  // Without Deploy and any menu entry for the role, the table has no Actions column (as on Devices).
  const hasActions = !!onDeploy || rowMenu.available;

  const actions = (a: Application, size: 'xs' | 'sm' = 'xs') => {
    const items = rowMenu.items(a);
    const single = loneButtonItem(items);
    const busy = deployingId === a.id;
    return (
      <div className="v2-rowactions">
        {onDeploy ? (
          <Tooltip content={intl.formatMessage(busy ? messages.opening : messages.deploy)}>
            <IconButton
              label={intl.formatMessage(messages.deployNamed, { name: a.name })}
              size={size}
              onClick={() => onDeploy(a)}
              // Not disabled while it opens: focus must stay on the button so the dialog can return it there.
              aria-busy={busy || undefined}
            >
              <IconDownload size={14} />
            </IconButton>
          </Tooltip>
        ) : null}
        {single ? (
          <Button
            size="sm"
            variant="ghost"
            icon={single.icon}
            disabled={single.disabled}
            onClick={single.onSelect}
            // The visible words first ("Removing…" while busy), then the app (one such button per row; 2.5.3).
            aria-label={`${typeof single.label === 'string' ? single.label : (single.textValue ?? '')} ${a.name}`.trim()}
          >
            {single.label}
          </Button>
        ) : items.length > 0 ? (
          <Menu label={intl.formatMessage(messages.moreFor, { name: a.name })} iconSize={size} items={items} />
        ) : null}
      </div>
    );
  };

  const appCell = (a: Application) => (
    <div className="v2-apps-lib__app">
      <AppTile name={a.name} size={32} />
      <span className="v2-apps-lib__name" title={a.name}>
        {a.name}
      </span>
      <span className="v2-apps-lib__pkg" title={a.pkg}>
        {a.pkg}
      </span>
    </div>
  );

  const sourceCell = (a: Application) => {
    const s = sourceOf(a, baseUrl);
    const note = formatSourceNote(intl, s.note);
    return (
      <div className="v2-apps-lib__src">
        <span>{intl.formatMessage(SOURCE_MESSAGES[s.kind])}</span>
        {note ? (
          <span className="v2-apps-lib__srcnote" title={note}>
            {note}
          </span>
        ) : null}
      </div>
    );
  };

  const checksumCell = (a: Application) =>
    missingChecksum(a, baseUrl) ? (
      <Tooltip content={intl.formatMessage(messages.missingTip)}>
        <span className="v2-apps-lib__badge">
          <Badge tone="warn" size="md">
            {intl.formatMessage(messages.missing)}
          </Badge>
        </span>
      </Tooltip>
    ) : (
      <Tooltip
        content={
          intl.formatMessage(sourceOf(a, baseUrl).hosted ? messages.hostedTip : messages.storedTip)
        }
      >
        <span className="v2-apps-lib__badge">
          <Badge tone="ok" size="md" icon={<IconCheck size={12} />}>
            {intl.formatMessage(messages.verified)}
          </Badge>
        </span>
      </Tooltip>
    );

  const usedCell = (a: Application) => {
    const u = usedIn[a.id];
    if (u === undefined) return <Skeleton width="96px" />;
    if (u === 'error') return <span className="v2-apps-lib__muted">—</span>;
    if (u.length === 0) return <span className="v2-apps-lib__muted">{intl.formatMessage(messages.notUsed)}</span>;
    const head = u.slice(0, 2).join(', ');
    return (
      <span className="v2-apps-lib__used" title={u.join(', ')}>
        {head}
        {u.length > 2 ? <span className="v2-apps-lib__muted"> +{u.length - 2}</span> : null}
      </span>
    );
  };

  // Core's columns are the page's own; extension columns take their places among them (ORDER.appsColumn).
  const C = ORDER.appsColumn;
  const coreColumns: PlacedColumn<Application>[] = [
    { key: 'app', order: C.app, header: intl.formatMessage(messages.colApp), cell: appCell, className: 'v2-apps-lib__colapp' },
    { key: 'version', order: C.version, header: intl.formatMessage(messages.colVersion), mono: true, cell: (a) => a.version || '—' },
    { key: 'source', order: C.source, header: intl.formatMessage(messages.colSource), cell: sourceCell },
    { key: 'checksum', order: C.checksum, header: intl.formatMessage(messages.colChecksum), cell: checksumCell },
    { key: 'used', order: C.usedIn, header: intl.formatMessage(messages.colUsedIn), cell: usedCell },
  ];
  const columns = extensionColumns.place(
    coreColumns,
    hasActions ? [{ key: 'actions', header: intl.formatMessage(messages.colActions), headerHidden: true, shrink: true, cell: actions }] : [],
  );
  const onSort = (key: string) =>
    setSort((cur) => ({ key, dir: cur?.key === key && cur.dir === 'ascending' ? 'descending' : 'ascending' }));

  const first = missing[0];
  const filtering = q.trim() !== '' || filter !== 'all';
  // X7: search and the Source filter only once there is something to search.
  const hasApps = !!apps && apps.length > 0;

  let body: ReactNode;
  if (apps === null) {
    body = (
      <Card padding="none" clip aria-busy="true">
        <SkeletonRows count={6} label={intl.formatMessage(messages.loadingApps)} />
      </Card>
    );
  } else if (apps.length === 0) {
    body = error ? null : (
      <Card>
        <EmptyState
          icon={<IconApps />}
          title={intl.formatMessage(messages.emptyTitle)}
          action={
            sources.custom || sources.fdroid ? (
              <>
                {sources.custom ? (
                  <ButtonLink to="?source=custom" variant="primary">
                    {intl.formatMessage(messages.addOwn)}
                  </ButtonLink>
                ) : null}
                {sources.fdroid ? <ButtonLink to="?source=fdroid">{intl.formatMessage(messages.browseFdroid)}</ButtonLink> : null}
              </>
            ) : undefined
          }
        >
          {emptyLibraryText(intl, sources, mayUpload, !!onDeploy) || null}
        </EmptyState>
      </Card>
    );
  } else if (narrow) {
    body =
      shown.length === 0 ? (
        <Card>
          <EmptyState icon={<IconApps />} title={intl.formatMessage(messages.noMatchTitle)} />
        </Card>
      ) : (
        <ul className="v2-apps-libcards" aria-label={intl.formatMessage(messages.libraryLabel)}>
          {shown.map((a) => (
            <li key={a.id} className="v2-apps-libcard">
              <div className="v2-apps-libcard__top">
                {appCell(a)}
                {hasActions ? actions(a, 'sm') : null}
              </div>
              <dl className="v2-apps-libcard__facts">
                <div>
                  <dt>{intl.formatMessage(messages.colVersion)}</dt>
                  <dd className="v2-num">{a.version || '—'}</dd>
                </div>
                <div>
                  <dt>{intl.formatMessage(messages.colSource)}</dt>
                  <dd>{sourceCell(a)}</dd>
                </div>
                <div>
                  <dt>{intl.formatMessage(messages.colChecksum)}</dt>
                  <dd>{checksumCell(a)}</dd>
                </div>
                <div>
                  <dt>{intl.formatMessage(messages.colUsedIn)}</dt>
                  <dd>{usedCell(a)}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      );
  } else {
    body = (
      <Card padding="none" clip aria-label={intl.formatMessage(messages.libraryLabel)}>
        <Table
          aria-label={intl.formatMessage(messages.libraryLabel)}
          columns={columns}
          rows={shown}
          rowKey={(a) => a.id}
          minWidth={900}
          empty={intl.formatMessage(filtering ? messages.tableNoMatch : messages.tableEmpty)}
          sort={{ key: sort?.key ?? '', dir: sort?.dir ?? 'ascending', onSort }}
          className="v2-apps-lib__table"
        />
      </Card>
    );
  }

  return (
    <>
      <div className="v2-apps-toolbar">
        {tabs}
        {hasApps ? (
          <>
            <span className="v2-apps-toolbar__spacer" />
            <SearchInput
              className="v2-apps-lib__search"
              aria-label={intl.formatMessage(messages.searchLabel)}
              placeholder={intl.formatMessage(messages.searchPlaceholder)}
              value={q}
              onChange={setQ}
            />
            <LabelledSelect label={intl.formatMessage(messages.sourceFilter)} value={filter} onChange={(e) => setFilter(e.target.value as SourceFilter)}>
              <option value="all">{intl.formatMessage(messages.sourceAll)}</option>
              <option value="uploaded">{intl.formatMessage(SOURCE_MESSAGES.uploaded)}</option>
              <option value="link">{intl.formatMessage(SOURCE_MESSAGES.link)}</option>
              <option value="bundle">{intl.formatMessage(SOURCE_MESSAGES.bundle)}</option>
              <option value="fdroid">{intl.formatMessage(SOURCE_MESSAGES.fdroid)}</option>
            </LabelledSelect>
          </>
        ) : null}
      </div>

      {error ? <ErrorState thing={intl.formatMessage(messages.loadThing)} onRetry={reload} /> : null}

      {first ? (
        <Notice
          tone="warn"
          aria-label={intl.formatMessage(messages.missingNotice)}
          icon={<IconWarning size={16} />}
          action={
            canEditSha(first) ? (
              <Button size="sm" onClick={() => void editSha256(first)}>
                {intl.formatMessage(messages.addChecksum)}
              </Button>
            ) : undefined
          }
        >
          <span>
            {missing.length === 1 ? (
              <FormattedMessage
                {...messages.missingOne}
                values={{ name: first.name, canSet: String(maySetChecksum), strong: (chunks) => <strong>{chunks}</strong> }}
              />
            ) : (
              <FormattedMessage
                {...messages.missingMany}
                values={{
                  name: first.name,
                  count: missing.length - 1,
                  canSet: String(maySetChecksum),
                  strong: (chunks) => <strong>{chunks}</strong>,
                }}
              />
            )}
          </span>
        </Notice>
      ) : null}

      {body}

      {shaShown ? (
        <Sha256Dialog
          open={shaFor !== null}
          app={shaShown.app}
          version={shaShown.version}
          onClose={() => setShaFor(null)}
          onSaved={() => {
            const id = shaShown.app.id;
            setShaFor(null);
            setApps((cur) => cur.map((a) => (a.id === id ? { ...a, hasApkHash: true } : a)));
          }}
        />
      ) : null}

      <Modal
        open={confirmRemove !== null}
        onClose={cancelRemove}
        role="alertdialog"
        size="sm"
        title={removeShown ? intl.formatMessage(messages.removeTitle, { name: removeShown.name }) : ''}
        footer={
          <>
            <Button size="lg" onClick={cancelRemove}>
              {intl.formatMessage(messages.cancel)}
            </Button>
            <Button size="lg" variant="danger-primary" onClick={() => confirmRemove && void remove(confirmRemove)}>
              {intl.formatMessage(messages.menuRemove)}
            </Button>
          </>
        }
      >
        <p className="v2-apps-modaltext">{intl.formatMessage(messages.removeBody)}</p>
      </Modal>
    </>
  );
}

/** Store the SHA-256 of the version an app installs (classic Sha256Modal). */
function Sha256Dialog({
  open,
  app,
  version,
  onClose,
  onSaved,
}: {
  /** False while it plays its exit (kept mounted with its last app). */
  open: boolean;
  app: Application;
  version: ApplicationVersion;
  onClose: () => void;
  onSaved: () => void;
}) {
  const intl = useIntl();
  const toast = useToast();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  // Each opening starts empty.
  useEffect(() => {
    if (open) setValue('');
  }, [open, version.id]);
  const trimmed = value.trim();
  const valid = SHA256_HEX.test(trimmed);

  async function save() {
    if (!valid) return;
    setBusy(true);
    try {
      await setVersionSha256(version.id, trimmed.toLowerCase());
      toast.push('ok', intl.formatMessage(messages.shaSavedTitle), intl.formatMessage(messages.shaSavedBody, { name: app.name }));
      onSaved();
    } catch (e) {
      toast.push('err', intl.formatMessage(messages.shaSaveFailed), errorText(e, intl));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      dismissOnBackdrop={false}
      title={intl.formatMessage(messages.shaTitle, { name: app.name })}
      description={intl.formatMessage(messages.shaDescription)}
      footer={
        <>
          <Button size="lg" onClick={onClose} disabled={busy}>
            {intl.formatMessage(messages.cancel)}
          </Button>
          <Button size="lg" variant="primary" type="submit" form="v2-apps-sha" disabled={busy || !valid}>
            {intl.formatMessage(busy ? messages.saving : messages.save)}
          </Button>
        </>
      }
    >
      <form
        id="v2-apps-sha"
        className="v2-apps-shaform"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <p className="v2-apps-shaform__url">{version.url}</p>
        <Field
          label={intl.formatMessage(messages.shaFieldLabel)}
          error={trimmed !== '' && !valid ? intl.formatMessage(messages.shaFieldError) : undefined}
          help={version.apkHash ? intl.formatMessage(messages.shaFieldHelp) : undefined}
        >
          <Input mono value={value} onChange={(e) => setValue(e.target.value)} autoComplete="off" spellCheck={false} />
        </Field>
      </form>
    </Modal>
  );
}
