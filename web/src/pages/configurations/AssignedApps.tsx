// The configuration editor's assigned-apps table, with search, an "On devices" filter and a sort once the list is
// long. The controls only choose which rows show and in what order: every edit goes to the editor's draft by app id,
// so what is saved, the changed count and the leave guard never depend on them.
import { useRef, useState, type ReactNode } from 'react';
import { defineMessages, useIntl, type MessageDescriptor } from 'react-intl';
import { untyped } from '../../data/configIntl';
import type { ConfigApp } from '../../api/configurations';
import {
  AppTile,
  Button,
  Checkbox,
  EmptyState,
  IconButton,
  IconClose,
  IconSearch,
  LabelledSelect,
  SearchInput,
  Segmented,
  Select,
  SkeletonRows,
  Table,
  type Column,
} from '../../ui';

/** Lists this long or shorter show no search, filter or sort, and keep their stored order. */
export const APP_CONTROLS_THRESHOLD = 8;

type StateFilter = 'all' | 'install' | 'skip' | 'remove';
type SortKey = 'name' | 'pkg' | 'state';

/** The `action` values (On devices): 1 Install, 0 Do not install, 2 Remove. */
const ACTION: Record<Exclude<StateFilter, 'all'>, number> = { install: 1, skip: 0, remove: 2 };
/** Sort by state in the filter's order: Install, Do not install, Remove, then anything else. */
const STATE_RANK: Record<number, number> = { 1: 0, 0: 1, 2: 2 };

const messages = untyped(defineMessages({
  sortName: { id: 'configEditor.apps.sortName', defaultMessage: 'Name' },
  sortPackage: { id: 'configEditor.apps.sortPackage', defaultMessage: 'Package' },
  sortState: { id: 'configEditor.apps.sortState', defaultMessage: 'On devices' },
  colApp: { id: 'configEditor.apps.colApp', defaultMessage: 'App' },
  colAction: { id: 'configEditor.apps.colAction', defaultMessage: 'On devices' },
  colKiosk: { id: 'configEditor.apps.colKiosk', defaultMessage: 'Show in kiosk' },
  colRemove: { id: 'configEditor.apps.colRemove', defaultMessage: 'Remove' },
  removeApp: { id: 'configEditor.apps.removeApp', defaultMessage: 'Remove {name}' },
  searchLabel: { id: 'configEditor.apps.searchLabel', defaultMessage: 'Search assigned apps' },
  searchPlaceholder: { id: 'configEditor.apps.searchPlaceholder', defaultMessage: 'Search name or package' },
  filterAll: { id: 'configEditor.apps.filterAll', defaultMessage: 'All' },
  filterInstall: { id: 'configEditor.apps.filterInstall', defaultMessage: 'Install' },
  filterSkip: { id: 'configEditor.apps.filterSkip', defaultMessage: 'Do not install' },
  filterRemove: { id: 'configEditor.apps.filterRemove', defaultMessage: 'Remove' },
  sort: { id: 'configEditor.apps.sort', defaultMessage: 'Sort' },
  showing: { id: 'configEditor.apps.showing', defaultMessage: 'Showing {shown} of {total, plural, one {# apps} other {# apps}}' },
  loading: { id: 'configEditor.apps.loading', defaultMessage: 'Loading the assigned apps…' },
  tableLabel: { id: 'configEditor.apps.tableLabel', defaultMessage: 'Assigned apps' },
  emptyTitle: { id: 'configEditor.apps.emptyTitle', defaultMessage: 'No apps yet' },
  emptyBody: {
    id: 'configEditor.apps.emptyBody',
    defaultMessage: 'Added apps install on every device that uses this configuration.',
  },
  noMatch: { id: 'configEditor.apps.noMatch', defaultMessage: 'No apps match' },
  clear: { id: 'configEditor.apps.clear', defaultMessage: 'Clear' },
  actionLabel: { id: 'configEditor.apps.actionLabel', defaultMessage: 'What happens to {name}' },
  actionInstall: { id: 'configEditor.apps.actionInstall', defaultMessage: 'Install' },
  actionRemove: { id: 'configEditor.apps.actionRemove', defaultMessage: 'Remove' },
  actionSkip: { id: 'configEditor.apps.actionSkip', defaultMessage: 'Do not install' },
  kioskRemoved: { id: 'configEditor.apps.kioskRemoved', defaultMessage: 'Removed' },
  kioskNotInstalled: { id: 'configEditor.apps.kioskNotInstalled', defaultMessage: 'Not installed' },
  kioskShown: { id: 'configEditor.apps.kioskShown', defaultMessage: 'Shown' },
  kioskHidden: { id: 'configEditor.apps.kioskHidden', defaultMessage: 'Hidden' },
  kioskFor: { id: 'configEditor.apps.kioskFor', defaultMessage: 'in kiosk: {name}' },
}));

const SORT_LABEL: Record<SortKey, MessageDescriptor> = {
  name: messages.sortName,
  pkg: messages.sortPackage,
  state: messages.sortState,
};

const actionOf = (a: ConfigApp) => a.action ?? 1;
const nameOf = (a: ConfigApp) => a.name ?? a.pkg ?? `#${a.id}`;
const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

export interface AssignedAppsProps {
  /** The draft's assigned apps. */
  apps: ConfigApp[];
  /** The assigned apps have loaded, or failed to (`error`). */
  ready: boolean;
  error: boolean;
  readOnly: boolean;
  /** Kiosk mode is on: the Show in kiosk column. */
  kioskColumn: boolean;
  onAction: (id: number, action: number) => void;
  onKioskVisibility: (id: number, shown: boolean) => void;
  onRemove: (id: number) => void;
  /** Optional controls rendered within an installed app's App cell. */
  renderAppDetails?: (app: ConfigApp) => ReactNode;
  /** Changes when the editor discards its edits: the rows are filed again by their restored state. */
  resetKey: number;
}

export function AssignedApps({
  apps,
  ready,
  error,
  readOnly,
  kioskColumn,
  onAction,
  onKioskVisibility,
  onRemove,
  renderAppDetails,
  resetKey,
}: AssignedAppsProps) {
  const intl = useIntl();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<StateFilter>('all');
  const [sort, setSort] = useState<SortKey>('name');
  const searchRef = useRef<HTMLInputElement>(null);

  // Each app's state when the view last changed (search, filter, sort, Discard). Rows are filtered and sorted by it,
  // so a row edited to a state the filter hides stays where it is until the view changes; an app added since has
  // none, and shows whatever the filter.
  const capture = () => new Map(apps.map((a) => [a.id, actionOf(a)]));
  const [filed, setFiled] = useState<ReadonlyMap<number, number>>(() => new Map());
  const [filedFor, setFiledFor] = useState(resetKey);
  if (filedFor !== resetKey) {
    setFiledFor(resetKey);
    setFiled(capture());
  }
  // A change of view files the rows again; the same value again (Segmented repeats one on Home/End) is no change.
  const view =
    <T,>(set: (v: T) => void, current: T) =>
    (v: T) => {
      if (Object.is(v, current)) return;
      set(v);
      setFiled(capture());
    };

  const controls = ready && apps.length > APP_CONTROLS_THRESHOLD;
  // The controls come and go as the list crosses the threshold: each time, the view starts again from every app,
  // so a filter left from before doesn't come back over states changed while it was hidden.
  const [hadControls, setHadControls] = useState(controls);
  if (hadControls !== controls) {
    setHadControls(controls);
    setQ('');
    setFilter('all');
    setFiled(capture());
  }
  const needle = controls ? q.trim().toLowerCase() : '';
  const shownFilter: StateFilter = controls ? filter : 'all';
  const filtering = needle !== '' || shownFilter !== 'all';
  const stateOf = (a: ConfigApp) => filed.get(a.id) ?? actionOf(a);

  const rows = apps.filter(
    (a) =>
      !filed.has(a.id) ||
      ((!needle || (a.name ?? '').toLowerCase().includes(needle) || (a.pkg ?? '').toLowerCase().includes(needle)) &&
        (shownFilter === 'all' || stateOf(a) === ACTION[shownFilter])),
  );
  if (controls) {
    const byName = (x: ConfigApp, y: ConfigApp) => collator.compare(nameOf(x), nameOf(y));
    const rank = (a: ConfigApp) => STATE_RANK[stateOf(a)] ?? 3;
    rows.sort(
      sort === 'pkg'
        ? // An app without a package goes last.
          (x, y) => Number(!x.pkg) - Number(!y.pkg) || collator.compare(x.pkg ?? '', y.pkg ?? '') || byName(x, y)
        : sort === 'state'
          ? (x, y) => rank(x) - rank(y) || byName(x, y)
          : byName,
    );
  }

  const count = (f: Exclude<StateFilter, 'all'>) => apps.filter((a) => actionOf(a) === ACTION[f]).length;
  const clear = () => {
    setQ('');
    setFilter('all');
    setFiled(capture());
    searchRef.current?.focus();
  };

  const edit = { readOnly, onAction, onKioskVisibility, onRemove };
  const columns: Column<ConfigApp>[] = [
    { key: 'app', header: intl.formatMessage(messages.colApp), className: 'v2-cfged-apps__app', cell: (a) => <AppCell app={a} details={renderAppDetails?.(a)} /> },
    { key: 'action', header: intl.formatMessage(messages.colAction), shrink: true, className: 'v2-cfged-apps__action', cell: (a) => <ActionCell app={a} {...edit} /> },
    ...(kioskColumn
      ? [{ key: 'kiosk', header: intl.formatMessage(messages.colKiosk), shrink: true, className: 'v2-cfged-apps__kiosk', cell: (a: ConfigApp) => <KioskCell app={a} {...edit} /> }]
      : []),
    {
      key: 'rm',
      header: intl.formatMessage(messages.colRemove),
      headerHidden: true,
      shrink: true,
      className: 'v2-cfged-apps__rm',
      cell: (a) =>
        readOnly ? null : (
          <div className="v2-rowactions">
            <IconButton size="xs" label={intl.formatMessage(messages.removeApp, { name: nameOf(a) })} onClick={() => onRemove(a.id)}>
              <IconClose />
            </IconButton>
          </div>
        ),
    },
  ];
  return (
    <>
      {controls ? (
        <div className="v2-cfged-appsbar">
          <SearchInput
            ref={searchRef}
            className="v2-cfged-appsbar__search"
            aria-label={intl.formatMessage(messages.searchLabel)}
            placeholder={intl.formatMessage(messages.searchPlaceholder)}
            value={q}
            onChange={view(setQ, q)}
          />
          <Segmented<StateFilter>
            aria-label={intl.formatMessage(messages.colAction)}
            value={filter}
            onChange={view(setFilter, filter)}
            options={[
              { value: 'all', label: intl.formatMessage(messages.filterAll), count: apps.length },
              { value: 'install', label: intl.formatMessage(messages.filterInstall), count: count('install') },
              { value: 'skip', label: intl.formatMessage(messages.filterSkip), count: count('skip') },
              { value: 'remove', label: intl.formatMessage(messages.filterRemove), count: count('remove') },
            ]}
          />
          <LabelledSelect label={intl.formatMessage(messages.sort)} value={sort} onChange={(e) => view(setSort, sort)(e.target.value as SortKey)}>
            {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
              <option key={k} value={k}>
                {intl.formatMessage(SORT_LABEL[k])}
              </option>
            ))}
          </LabelledSelect>
          <span className="v2-visually-hidden" aria-live="polite">
            {filtering ? intl.formatMessage(messages.showing, { shown: rows.length, total: apps.length }) : ''}
          </span>
        </div>
      ) : null}
      {!ready && !error ? (
        <div className="v2-cfged-apps__loading">
          <SkeletonRows count={3} compact label={intl.formatMessage(messages.loading)} />
        </div>
      ) : (
        <Table<ConfigApp>
          aria-label={intl.formatMessage(messages.tableLabel)}
          className="v2-cfged-apps"
          columns={columns}
          rows={rows}
          rowKey={(a) => a.id}
          edge={0}
          rowPad={10}
          empty={
            apps.length === 0 ? (
              <EmptyState bare title={intl.formatMessage(messages.emptyTitle)}>
                {intl.formatMessage(messages.emptyBody)}
              </EmptyState>
            ) : (
              <EmptyState
                bare
                icon={<IconSearch />}
                title={intl.formatMessage(messages.noMatch)}
                action={
                  <Button size="sm" onClick={clear}>
                    {intl.formatMessage(messages.clear)}
                  </Button>
                }
              />
            )
          }
        />
      )}
    </>
  );
}

type EditProps = Pick<AssignedAppsProps, 'readOnly' | 'onAction' | 'onKioskVisibility' | 'onRemove'>;

function AppCell({ app: a, details }: { app: ConfigApp; details?: ReactNode }) {
  const name = nameOf(a);
  return (
    <div className="v2-cfged-app">
      <AppTile name={name} size={32} />
      <div className="v2-cfged-app__text">
        <span className="v2-cfged-app__name">
          {name}
          {a.version ? <span className="v2-cfged-app__ver"> {a.version}</span> : null}
        </span>
        {a.pkg ? <span className="v2-cfged-app__pkg">{a.pkg}</span> : null}
        {details ? <div className="v2-cfged-app__details">{details}</div> : null}
      </div>
    </div>
  );
}

function ActionCell({ app: a, readOnly, onAction }: { app: ConfigApp } & EditProps) {
  const intl = useIntl();
  return (
    <Select
      size="sm"
      aria-label={intl.formatMessage(messages.actionLabel, { name: nameOf(a) })}
      value={actionOf(a)}
      disabled={readOnly}
      onChange={(e) => onAction(a.id, Number(e.target.value))}
    >
      <option value={1}>{intl.formatMessage(messages.actionInstall)}</option>
      <option value={2}>{intl.formatMessage(messages.actionRemove)}</option>
      <option value={0}>{intl.formatMessage(messages.actionSkip)}</option>
    </Select>
  );
}

/** Show in kiosk: whether this installed app appears and launches in kiosk mode. */
function KioskCell({ app: a, readOnly, onKioskVisibility }: { app: ConfigApp } & EditProps) {
  const intl = useIntl();
  const name = nameOf(a);
  const action = actionOf(a);
  const shown = a.showIcon !== false;
  const kioskText = intl.formatMessage(
    action !== 1 ? (action === 2 ? messages.kioskRemoved : messages.kioskNotInstalled) : shown ? messages.kioskShown : messages.kioskHidden,
  );
  return (
    <Checkbox
      className={`v2-cfged-app__kiosk is-${action !== 1 ? 'off' : shown ? 'on' : 'hidden'}`}
      label={
        <>
          {kioskText}
          <span className="v2-visually-hidden"> {intl.formatMessage(messages.kioskFor, { name })}</span>
        </>
      }
      checked={action === 1 && shown}
      disabled={readOnly || action !== 1}
      onChange={(e) => onKioskVisibility(a.id, e.target.checked)}
    />
  );
}
