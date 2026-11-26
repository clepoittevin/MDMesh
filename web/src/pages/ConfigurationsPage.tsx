import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { defineMessages, useIntl } from 'react-intl';
import { untyped } from '../data/configIntl';
import { configDescription, configName } from '../data/seededConfigs';
import { Link, useLocation, useNavigate } from 'react-router';
import { getConfigurationApps, getConfigurations, type ConfigApp, type Configuration } from '../api/configurations';
import { listApplications, type Application } from '../api/applications';
import { getSyncSummary, type ConfigSyncSummary } from '../api/configSync';
import { searchDevices } from '../api/devices';
import { appNameForVersionId, hasDefaultPin, hasLegacyPin, hasNoPin, isLocked } from '../data/configurationRules';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  IconConfigurations,
  IconCopy,
  IconLockSmall,
  IconPencil,
  IconPlus,
  IconSearch,
  IconTrash,
  Menu,
  PageHeader,
  SearchInput,
  Segmented,
  Skeleton,
  SkeletonRows,
  StackedBar,
  Grid,
  GridCell,
  MetaGrid,
  ButtonLink,
  Tooltip,
  type MenuEntry,
} from '../ui';
import { CORE_ACTION_ACCESS } from '../ext/core/access';
import { usePermission } from '../ext/permissions';
import { paths } from '../routes';
import { useRefocusAfterRemove } from '../ui/useRefocusAfterRemove';
import { CopyConfigModal, DeleteConfigModal, NewConfigChooser } from './configurations/modals';
import { devicesBlockingDelete, syncLine } from './configurations/sync';
import type { ConfigWatch } from './configurations/watch';
import './ConfigurationsPage.css';

const messages = untyped(defineMessages({
  title: { id: 'configurations.page.title', defaultMessage: 'Configurations' },
  subtitle: {
    id: 'configurations.page.subtitle',
    defaultMessage: 'The apps, kiosk rules and restrictions a device follows. Devices pick up changes on their next sync.',
  },
  newConfiguration: { id: 'configurations.page.new', defaultMessage: 'New configuration' },
  loading: { id: 'configurations.page.loading', defaultMessage: 'Loading configurations…' },
  emptyTitle: { id: 'configurations.page.emptyTitle', defaultMessage: 'No configurations yet' },
  emptyBody: {
    id: 'configurations.page.emptyBody',
    defaultMessage: 'Create one to set the apps and rules your devices follow.',
  },
  noMatchTitle: { id: 'configurations.page.noMatchTitle', defaultMessage: 'No configurations match' },
  noMatchBody: { id: 'configurations.page.noMatchBody', defaultMessage: 'Try another name or description.' },
  showAll: { id: 'configurations.page.showAll', defaultMessage: 'Show all configurations' },
  listLabel: { id: 'configurations.page.listLabel', defaultMessage: 'Configurations' },
  search: { id: 'configurations.page.search', defaultMessage: 'Search configurations' },
  showLabel: { id: 'configurations.page.showLabel', defaultMessage: 'Show' },
  showAllKinds: { id: 'configurations.page.showAllKinds', defaultMessage: 'All' },
  showCustom: { id: 'configurations.page.showCustom', defaultMessage: 'Custom' },
  showBuiltin: { id: 'configurations.page.showBuiltin', defaultMessage: 'Built-in' },
  unassigned: {
    id: 'configurations.page.unassigned',
    defaultMessage:
      '{count, plural, one {# device has no configuration} other {# devices have no configuration}} · Assign',
  },
  failedConfigurations: { id: 'configurations.page.failedConfigurations', defaultMessage: 'configurations' },
  failedLibrary: { id: 'configurations.page.failedLibrary', defaultMessage: 'the app library' },
  failedLibraryDetail: { id: 'configurations.page.failedLibraryDetail', defaultMessage: 'Some main apps show as “—”.' },
  builtin: { id: 'configurations.badge.builtin', defaultMessage: 'Built-in' },
  kiosk: { id: 'configurations.badge.kiosk', defaultMessage: 'Kiosk' },
  defaultPin: { id: 'configurations.badge.defaultPin', defaultMessage: 'Default PIN' },
  defaultPinTip: {
    id: 'configurations.badge.defaultPinTip',
    defaultMessage: 'The kiosk exit PIN is a well-known default. Change it.',
  },
  noPin: { id: 'configurations.badge.noPin', defaultMessage: 'No PIN' },
  noPinTip: { id: 'configurations.badge.noPinTip', defaultMessage: 'Kiosk mode has no exit PIN. Set one.' },
  oldPin: { id: 'configurations.badge.oldPin', defaultMessage: 'Old PIN' },
  oldPinTip: {
    id: 'configurations.badge.oldPinTip',
    defaultMessage:
      'The kiosk exit PIN isn’t 6 to 12 digits (it was saved before that rule). Devices keep it. Set a new one.',
  },
  view: { id: 'configurations.row.view', defaultMessage: 'View' },
  edit: { id: 'configurations.row.edit', defaultMessage: 'Edit' },
  duplicateToEdit: { id: 'configurations.row.duplicateToEdit', defaultMessage: 'Duplicate to edit' },
  duplicate: { id: 'configurations.row.duplicate', defaultMessage: 'Duplicate' },
  delete: {
    id: 'configurations.row.delete',
    defaultMessage: 'Delete',
    description: 'DESTRUCTIVE: opens the confirmation to delete the configuration.',
  },
  moreFor: { id: 'configurations.row.moreFor', defaultMessage: 'More for {name}' },
  mainApp: { id: 'configurations.card.mainApp', defaultMessage: 'Main app' },
  apps: { id: 'configurations.card.apps', defaultMessage: 'Apps' },
  devices: { id: 'configurations.card.devices', defaultMessage: 'Devices' },
}));

/** Custom: made on this server (by any admin), as opposed to the built-in templates the server seeds. */
type Show = 'all' | 'custom' | 'builtin';

const POLL_MS = 10_000;
/** Concurrent /configurations/applications/{id} requests: each answer carries the whole app library. */
const APPS_IN_FLIGHT = 4;

/** Configurations list. Classic: pages/ConfigurationsPage.tsx. */
export function ConfigurationsPage() {
  const intl = useIntl();
  const navigate = useNavigate();
  const location = useLocation();
  const [configs, setConfigs] = useState<Configuration[] | null>(null);
  const [error, setError] = useState(false);
  const [apps, setApps] = useState<Application[]>([]);
  const [libraryFailed, setLibraryFailed] = useState(false);
  const [sync, setSync] = useState<Record<number, ConfigSyncSummary>>({});
  const [syncFailed, setSyncFailed] = useState(false);
  const [syncLoaded, setSyncLoaded] = useState(false);
  const [assigned, setAssigned] = useState<Record<number, ConfigApp[] | null>>({});
  const [unassigned, setUnassigned] = useState<number | null>(null);
  const [q, setQ] = useState('');
  const [show, setShow] = useState<Show>('all');
  const [chooserOpen, setChooserOpen] = useState(false);
  const [copyOf, setCopyOf] = useState<Configuration | null>(null);
  const [deleting, setDeleting] = useState<Configuration | null>(null);
  // After a delete, focus goes to the next card rather than falling to the page with the deleted card's "…".
  const deleteFocus = useRefocusAfterRemove();
  // Creating needs add_config; duplicating and deleting copy_config (ext/core/access.ts). Opening one needs neither.
  const canAdd = usePermission(CORE_ACTION_ACCESS.addConfig);
  const canCopy = usePermission(CORE_ACTION_ACCESS.copyConfig);
  // Set by the editor after a save (location state), so the list follows that configuration's devices catching up.
  const [watch, setWatch] = useState<ConfigWatch | null>(() => {
    const w = (location.state as { watch?: ConfigWatch } | null)?.watch;
    return w && Date.now() < w.until ? w : null;
  });

  const applySync = (rows: ConfigSyncSummary[]) => setSync(Object.fromEntries(rows.map((r) => [r.configurationId, r])));

  // The assigned apps already fetched, by configuration id (kept across a reload after a delete).
  const assignedRef = useRef<Record<number, ConfigApp[] | null>>({});
  const loadGen = useRef(0);

  /** Loads the list. `refetchApps` false keeps the assigned apps already fetched (after a delete nothing changed). */
  const load = useCallback(async (refetchApps = true) => {
    const gen = ++loadGen.current;
    setError(false);
    let list: Configuration[];
    try {
      list = await getConfigurations();
    } catch {
      if (gen !== loadGen.current) return;
      setConfigs((prev) => prev ?? []);
      setError(true);
      return;
    }
    if (gen !== loadGen.current) return;
    setConfigs(list);
    getSyncSummary()
      .then((rows) => {
        if (gen !== loadGen.current) return;
        applySync(rows);
        setSyncFailed(false);
      })
      .catch(() => {
        if (gen === loadGen.current) setSyncFailed(true);
      })
      .finally(() => {
        if (gen === loadGen.current) setSyncLoaded(true);
      });
    // The list endpoint omits each configuration's apps: fetch them for the Apps count and the main app's version,
    // a few at a time. A newer load (Retry, delete) stops this one's queue.
    const ids = list.map((c) => c.id).filter((id): id is number => id != null);
    const kept: Record<number, ConfigApp[] | null> = {};
    if (!refetchApps) for (const id of ids) if (assignedRef.current[id]) kept[id] = assignedRef.current[id];
    assignedRef.current = kept;
    setAssigned(kept);
    const todo = ids.filter((id) => !(id in kept));
    const put = (id: number, a: ConfigApp[] | null) => {
      if (gen !== loadGen.current) return;
      assignedRef.current = { ...assignedRef.current, [id]: a };
      setAssigned(assignedRef.current);
    };
    let next = 0;
    const worker = async () => {
      while (gen === loadGen.current && next < todo.length) {
        const id = todo[next++];
        await getConfigurationApps(id).then(
          (a) => put(id, a),
          () => put(id, null),
        );
      }
    };
    await Promise.all(Array.from({ length: Math.min(APPS_IN_FLIGHT, todo.length) }, worker));
  }, []);

  const loadLibrary = useCallback(() => {
    setLibraryFailed(false);
    listApplications()
      .then((a) => setApps(a.filter((x) => (x.type ?? 'app') !== 'web')))
      .catch(() => setLibraryFailed(true));
  }, []);

  useEffect(() => {
    void load();
    loadLibrary();
    // Same limit as the Devices page (it loads up to 1000 and pages in the browser).
    searchDevices({ pageSize: 1000 })
      .then((r) => setUnassigned((r.devices?.items ?? []).filter((d) => d.configurationId == null).length))
      .catch(() => setUnassigned(null));
    // Leaving the page stops the app-list queue and drops answers still on their way.
    const gens = loadGen;
    return () => {
      gens.current++;
    };
  }, [load, loadLibrary]);

  // A save returns before devices have applied the new desired state, so poll the saved configuration's sync
  // summary for a short window: stop once its devices catch up or after two minutes (powered-off devices stay out
  // of sync). Self-scheduling: the next tick is armed only after the current one finishes; stops on leave.
  useEffect(() => {
    if (!watch) return;
    let on = true;
    let t: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const rows = await getSyncSummary().catch(() => null);
      if (!on) return;
      if (rows) applySync(rows);
      const row = rows?.find((r) => r.configurationId === watch.id);
      if ((rows && !row?.outOfSync) || Date.now() >= watch.until) {
        setWatch(null);
        return;
      }
      t = setTimeout(() => void poll(), POLL_MS);
    };
    t = setTimeout(() => void poll(), POLL_MS);
    return () => {
      on = false;
      clearTimeout(t);
    };
  }, [watch]);

  const counts = useMemo(() => {
    const all = configs ?? [];
    const builtin = all.filter(isLocked).length;
    return { all: all.length, builtin, custom: all.length - builtin };
  }, [configs]);
  // Filtering by kind only helps when there are both: with one kind empty the filter is hidden, and shows everything.
  const bothKinds = counts.builtin > 0 && counts.custom > 0;
  const kind: Show = bothKinds ? show : 'all';

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (configs ?? [])
      .filter((c) => (kind === 'all' ? true : kind === 'builtin' ? isLocked(c) : !isLocked(c)))
      .filter(
        (c) =>
          !needle ||
          `${c.name} ${c.description ?? ''} ${configName(intl, c)} ${configDescription(intl, c)}`.toLowerCase().includes(needle),
      );
  }, [configs, q, kind, intl]);

  const templates = useMemo(() => (configs ?? []).filter(isLocked), [configs]);
  // With no template the chooser would offer one option (Blank): create directly instead (K7).
  const chooses = templates.length > 0;
  const newConfig = () => (chooses ? setChooserOpen(true) : navigate(paths.configuration('new')));
  const newLabel = intl.formatMessage(messages.newConfiguration);
  // Whether there are templates (and so the chooser) is known once the list is in: until then New configuration
  // waits. After a failed load it opens a blank one, as nothing else can be offered.
  const listing = configs === null && !error;

  let body: ReactNode = null;
  if (configs === null) {
    body = (
      <Card padding="none" clip aria-busy="true">
        <SkeletonRows count={4} label={intl.formatMessage(messages.loading)} />
      </Card>
    );
  } else if (configs.length === 0) {
    body = error ? null : (
      <Card>
        <EmptyState
          icon={<IconConfigurations />}
          title={intl.formatMessage(messages.emptyTitle)}
          action={
            canAdd ? (
              <Button variant="primary" icon={<IconPlus />} onClick={newConfig}>
                {newLabel}
              </Button>
            ) : undefined
          }
        >
          {canAdd ? intl.formatMessage(messages.emptyBody) : undefined}
        </EmptyState>
      </Card>
    );
  } else {
    body =
      shown.length === 0 ? (
        <Card>
          <EmptyState
            bare
            icon={<IconSearch />}
            title={intl.formatMessage(messages.noMatchTitle)}
            action={
              <Button
                size="sm"
                onClick={() => {
                  setQ('');
                  setShow('all');
                }}
              >
                {intl.formatMessage(messages.showAll)}
              </Button>
            }
          >
            {intl.formatMessage(messages.noMatchBody)}
          </EmptyState>
        </Card>
      ) : (
        // Cards on the page grid, three to a row on wide screens; each row's cards end level (comparable content).
        <Grid as="ul" stretch aria-label={intl.formatMessage(messages.listLabel)} className="v2-configs__grid">
          {shown.map((c) => (
            <GridCell as="li" span={4} key={c.id ?? c.name}>
              <ConfigCard
                c={c}
                apps={apps}
                assigned={c.id != null ? assigned[c.id] : undefined}
                sync={c.id != null ? sync[c.id] : undefined}
                syncFailed={syncFailed}
                syncLoaded={syncLoaded}
                onCopy={canCopy ? () => setCopyOf(c) : undefined}
                onDelete={
                  canCopy
                    ? () => {
                        deleteFocus.remember();
                        setDeleting(c);
                      }
                    : undefined
                }
              />
            </GridCell>
          ))}
        </Grid>
      );
  }

  return (
    <>
      <PageHeader
        title={intl.formatMessage(messages.title)}
        subtitle={intl.formatMessage(messages.subtitle)}
        subtitleMaxCh={72}
        actions={
          canAdd ? (
            <Button variant="primary" size="lg" icon={<IconPlus />} onClick={newConfig} disabled={listing}>
              {newLabel}
            </Button>
          ) : undefined
        }
      />

      <div className="v2-configs-toolbar">
        <SearchInput
          className="v2-configs-toolbar__search"
          value={q}
          onChange={setQ}
          placeholder={intl.formatMessage(messages.search)}
          aria-label={intl.formatMessage(messages.search)}
        />
        {bothKinds ? (
          <Segmented<Show>
            aria-label={intl.formatMessage(messages.showLabel)}
            value={show}
            onChange={setShow}
            options={[
              { value: 'all', label: intl.formatMessage(messages.showAllKinds), count: counts.all },
              { value: 'custom', label: intl.formatMessage(messages.showCustom), count: counts.custom },
              { value: 'builtin', label: intl.formatMessage(messages.showBuiltin), count: counts.builtin },
            ]}
          />
        ) : null}
        <span className="v2-configs-toolbar__spacer" />
        {unassigned ? (
          <Link className="v2-configs-toolbar__unassigned" to={`${paths.devices}?config=none`}>
            <span aria-hidden="true" className="v2-configs-toolbar__ring" />
            {intl.formatMessage(messages.unassigned, { count: unassigned })}
          </Link>
        ) : null}
      </div>

      {error ? <ErrorState thing={intl.formatMessage(messages.failedConfigurations)} onRetry={() => void load()} /> : null}
      {libraryFailed && !error ? (
        <ErrorState
          thing={intl.formatMessage(messages.failedLibrary)}
          detail={intl.formatMessage(messages.failedLibraryDetail)}
          onRetry={loadLibrary}
        />
      ) : null}

      {body}

      <NewConfigChooser
        open={chooserOpen}
        templates={templates}
        onClose={() => setChooserOpen(false)}
        onPick={(base) => {
          setChooserOpen(false);
          navigate(base?.id != null ? `${paths.configuration('new')}?from=${base.id}` : paths.configuration('new'));
        }}
      />
      <CopyConfigModal
        source={copyOf}
        onClose={() => setCopyOf(null)}
        onDone={(_name, id) => {
          setCopyOf(null);
          // Open the copy ("Duplicate to edit"), or show it in the list when its id could not be found.
          if (id != null) navigate(paths.configuration(id));
          else void load(false);
        }}
      />
      <DeleteConfigModal
        target={deleting}
        deviceCount={devicesBlockingDelete(deleting?.id != null ? sync[deleting.id] : undefined)}
        wipedCount={deleting?.id != null ? sync[deleting.id]?.wiped : undefined}
        onClose={() => {
          // Cancelled, or the delete failed: the card stays.
          deleteFocus.forget();
          setDeleting(null);
        }}
        onDeleted={() => {
          setDeleting(null);
          void load(false);
        }}
      />
    </>
  );
}

/** Name (the row's link), its tags, and the description on one line. */
function ConfigIdentity({ c }: { c: Configuration }) {
  const intl = useIntl();
  const locked = isLocked(c);
  const description = configDescription(intl, c);
  return (
    <div className="v2-configs-id">
      <div className="v2-configs-id__line">
        <Link to={paths.configuration(c.id ?? '')} className="v2-configs-id__name">
          {configName(intl, c)}
        </Link>
        {locked ? (
          <Badge tone="neutral" icon={<IconLockSmall />}>
            {intl.formatMessage(messages.builtin)}
          </Badge>
        ) : null}
        {c.kioskMode ? <Badge>{intl.formatMessage(messages.kiosk)}</Badge> : null}
        {hasDefaultPin(c) ? (
          <Tooltip content={intl.formatMessage(messages.defaultPinTip)}>
            <Badge tone="warn" tabIndex={0}>
              {intl.formatMessage(messages.defaultPin)}
            </Badge>
          </Tooltip>
        ) : null}
        {hasNoPin(c) ? (
          <Tooltip content={intl.formatMessage(messages.noPinTip)}>
            <Badge tone="warn" tabIndex={0}>
              {intl.formatMessage(messages.noPin)}
            </Badge>
          </Tooltip>
        ) : null}
        {hasLegacyPin(c) ? (
          <Tooltip content={intl.formatMessage(messages.oldPinTip)}>
            <Badge tone="warn" tabIndex={0}>
              {intl.formatMessage(messages.oldPin)}
            </Badge>
          </Tooltip>
        ) : null}
      </div>
      {description ? (
        <span className="v2-configs-id__desc" title={description}>
          {description}
        </span>
      ) : null}
    </div>
  );
}

/** The main app with its version; "—" when there is none (or the library failed). */
function MainApp({
  c,
  apps,
  assigned,
}: {
  c: Configuration;
  apps: Application[];
  /** undefined = loading, null = failed. */
  assigned: ConfigApp[] | null | undefined;
}) {
  const mainId = (c.mainAppId as number | null | undefined) ?? undefined;
  const main = mainId != null ? assigned?.find((a) => a.usedVersionId === mainId) : undefined;
  const label = main ? `${main.name ?? main.pkg}${main.version ? ` ${main.version}` : ''}` : appNameForVersionId(apps, mainId, assigned ?? []);
  return (
    <span className="v2-configs-main" title={typeof label === 'string' ? label : undefined}>
      {label}
    </span>
  );
}

/** The sync bar and its line: how many of the configuration's devices run it. */
function SyncCell({ row, failed, loaded }: { row?: ConfigSyncSummary; failed: boolean; loaded: boolean }) {
  const intl = useIntl();
  if (!loaded) return <Skeleton width="60%" />;
  const line = syncLine(row, failed, intl);
  return (
    <div className="v2-configs-sync">
      <StackedBar segments={line.segments} track />
      <span className={`v2-configs-sync__text is-${line.tone}`}>{line.text}</span>
    </div>
  );
}

/**
 * The card's "…" menu: only what its footer doesn't show (one place per surface), so for now Delete, kept out of
 * reach of a stray click and the home for the card's later actions. None for a built-in or a role without
 * copy_config.
 */
function RowMenu({ c, onDelete }: { c: Configuration; onDelete?: () => void }) {
  const intl = useIntl();
  if (isLocked(c) || !onDelete) return null;
  const del = intl.formatMessage(messages.delete);
  const menu: MenuEntry[] = [{ key: 'delete', label: del, textValue: del, icon: <IconTrash />, danger: true, onSelect: onDelete }];
  return <Menu items={menu} label={intl.formatMessage(messages.moreFor, { name: configName(intl, c) })} iconSize="xs" align="end" />;
}

/**
 * One configuration as a card: name, tags and description with its "…" menu (Delete); main app, apps and devices;
 * the sync bar; and its actions (Edit or View, Duplicate).
 */
function ConfigCard({
  c,
  apps,
  assigned,
  sync,
  syncFailed,
  syncLoaded,
  onCopy,
  onDelete,
}: {
  c: Configuration;
  apps: Application[];
  /** undefined = loading, null = failed. */
  assigned: ConfigApp[] | null | undefined;
  sync?: ConfigSyncSummary;
  syncFailed: boolean;
  syncLoaded: boolean;
  /** Duplicate and Delete, left out for a role without copy_config. */
  onCopy?: () => void;
  onDelete?: () => void;
}) {
  const intl = useIntl();
  const locked = isLocked(c);
  const to = paths.configuration(c.id ?? '');
  const devices = sync?.total ?? (syncFailed ? '—' : syncLoaded ? 0 : undefined);
  return (
    <Card as="article" aria-label={configName(intl, c)} className="v2-configs-card">
      <div className="v2-configs-card__top">
        <ConfigIdentity c={c} />
        <RowMenu c={c} onDelete={onDelete} />
      </div>
      <MetaGrid
        boxed
        className="v2-configs-card__meta"
        columns="minmax(0, 1.6fr) repeat(2, minmax(0, 1fr))"
        cells={[
          { key: 'main', label: intl.formatMessage(messages.mainApp), value: <MainApp c={c} apps={apps} assigned={assigned} /> },
          {
            key: 'apps',
            label: intl.formatMessage(messages.apps),
            value: assigned === undefined ? <Skeleton width="2ch" /> : assigned === null ? '—' : assigned.length,
          },
          { key: 'devices', label: intl.formatMessage(messages.devices), value: devices === undefined ? <Skeleton width="2ch" /> : devices },
        ]}
      />
      <SyncCell row={sync} failed={syncFailed} loaded={syncLoaded} />
      <div className="v2-configs-card__foot">
        <ButtonLink to={to} size="sm" icon={locked ? undefined : <IconPencil />}>
          {intl.formatMessage(locked ? messages.view : messages.edit)}
        </ButtonLink>
        {onCopy ? (
          <Button size="sm" icon={<IconCopy />} onClick={onCopy}>
            {intl.formatMessage(locked ? messages.duplicateToEdit : messages.duplicate)}
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
