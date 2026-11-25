import { useMemo, useState, type FormEvent } from 'react';
import { defineMessages, FormattedMessage, useIntl, type MessageDescriptor } from 'react-intl';
import { untyped } from '../../data/configIntl';
import {
  copyConfiguration,
  deleteConfiguration,
  getConfigurations,
  type Configuration,
} from '../../api/configurations';
import { appCategory, type AppCategory, type Application } from '../../api/applications';
import { CONFIG_FIELDS } from '../../data/configFields';
import {
  AppTile,
  Button,
  Checkbox,
  EmptyState,
  Field,
  IconCheckSmall,
  Input,
  Modal,
  SearchInput,
  Segmented,
  useStickyValue,
  useToast,
} from '../../ui';
import './modals.css';

const errMessage = (e: unknown) => (e instanceof Error ? e.message : '');

export const configModalMessages = untyped(defineMessages({
  nameExists: { id: 'configurations.modal.nameExists', defaultMessage: 'A configuration with that name exists.' },
  duplicateTitle: { id: 'configurations.modal.duplicateTitle', defaultMessage: 'Duplicate configuration' },
  duplicateLead: {
    id: 'configurations.modal.duplicateLead',
    defaultMessage: 'An editable copy of “{name}” with the same settings and apps. Devices stay on their current configuration.',
  },
  newName: { id: 'configurations.modal.newName', defaultMessage: 'New name' },
  cancel: { id: 'configurations.modal.cancel', defaultMessage: 'Cancel' },
  duplicate: { id: 'configurations.modal.duplicate', defaultMessage: 'Duplicate' },
  duplicating: { id: 'configurations.modal.duplicating', defaultMessage: 'Duplicating…' },
  duplicateFailed: { id: 'configurations.modal.duplicateFailed', defaultMessage: 'Duplicate failed' },
  duplicated: { id: 'configurations.modal.duplicated', defaultMessage: 'Configuration duplicated' },
  deleteTitle: { id: 'configurations.modal.deleteTitle', defaultMessage: 'Delete configuration?' },
  deleteDescription: {
    id: 'configurations.modal.deleteDescription',
    defaultMessage: '“{name}” and its settings are deleted for good.',
    description: 'DESTRUCTIVE: deletes the configuration and its settings, with no undo.',
  },
  deleteConfirm: {
    id: 'configurations.modal.deleteConfirm',
    defaultMessage: 'Delete configuration',
    description: 'DESTRUCTIVE: deletes the configuration for good.',
  },
  deleting: { id: 'configurations.modal.deleting', defaultMessage: 'Deleting…' },
  deleted: { id: 'configurations.modal.deleted', defaultMessage: 'Configuration deleted' },
  deleteFailed: { id: 'configurations.modal.deleteFailed', defaultMessage: 'Delete failed' },
  devicesStillUse: { id: 'configurations.modal.devicesStillUse', defaultMessage: 'Devices still use this configuration.' },
  deleteBlocked: {
    id: 'configurations.modal.deleteBlocked',
    defaultMessage:
      '{count, plural, one {# device still uses this configuration, so the server will refuse to delete it. Move it to another configuration first.} other {# devices still use this configuration, so the server will refuse to delete it. Move them to another configuration first.}}',
  },
  deleteBlockedWiped: {
    id: 'configurations.modal.deleteBlockedWiped',
    defaultMessage:
      'That includes {count, plural, one {# wiped device} other {# wiped devices}}, listed under the Wiped filter on Devices.',
  },
  newTitle: { id: 'configurations.modal.newTitle', defaultMessage: 'New configuration' },
  blank: { id: 'configurations.modal.blank', defaultMessage: 'Blank configuration' },
  blankSub: { id: 'configurations.modal.blankSub', defaultMessage: 'Set everything yourself.' },
  basedOn: { id: 'configurations.modal.basedOn', defaultMessage: 'Based on “{name}”' },
  basedOnSub: { id: 'configurations.modal.basedOnSub', defaultMessage: 'Its settings and apps, ready to change.' },
  create: { id: 'configurations.modal.create', defaultMessage: 'Create' },
  startFrom: { id: 'configurations.modal.startFrom', defaultMessage: 'Start from' },
  kioskKeyApps: { id: 'configurations.modal.kioskKeyApps', defaultMessage: 'Apps' },
  kioskKeyBackground: { id: 'configurations.modal.kioskKeyBackground', defaultMessage: 'Background image' },
  kioskTitleUnknown: { id: 'configurations.modal.kioskTitleUnknown', defaultMessage: 'Change kiosk on its devices?' },
  kioskTitle: {
    id: 'configurations.modal.kioskTitle',
    defaultMessage: 'Change kiosk on {count, plural, one {# device} other {# devices}}?',
  },
  keepEditing: { id: 'configurations.modal.keepEditing', defaultMessage: 'Keep editing' },
  saveAndApply: { id: 'configurations.modal.saveAndApply', defaultMessage: 'Save and apply' },
  kioskBody: {
    id: 'configurations.modal.kioskBody',
    defaultMessage:
      'This edit changes kiosk settings ({settings}). Every device assigned to this configuration will re-apply kiosk at its next check-in, usually within seconds. Turning kiosk off lifts it only on devices that entered kiosk through this configuration.',
  },
  catUploaded: { id: 'configurations.picker.uploaded', defaultMessage: 'Uploaded' },
  catSystem: { id: 'configurations.picker.system', defaultMessage: 'System' },
  catWeb: { id: 'configurations.picker.web', defaultMessage: 'Web apps' },
  addApps: { id: 'configurations.picker.title', defaultMessage: 'Add apps' },
  searchApps: { id: 'configurations.picker.search', defaultMessage: 'Search apps' },
  category: { id: 'configurations.picker.category', defaultMessage: 'Category' },
  apps: { id: 'configurations.picker.apps', defaultMessage: 'Apps' },
  libraryEmpty: { id: 'configurations.picker.libraryEmpty', defaultMessage: 'The app library is empty' },
  allAdded: { id: 'configurations.picker.allAdded', defaultMessage: 'Every app is already added' },
  noApps: { id: 'configurations.picker.noApps', defaultMessage: 'No apps here' },
  addCount: { id: 'configurations.picker.addCount', defaultMessage: 'Add {count}' },
  add: { id: 'configurations.picker.add', defaultMessage: 'Add' },
}));

/**
 * Copy a configuration on the server under a new name (classic CopyModal: "Copy" / "Use as template"). The server
 * copy (PUT /configurations/copy) takes every setting, the apps, configuration files and app settings of the saved
 * configuration; it is the one Duplicate path (list and editor). `onDone` gets the copy's id, found by its unique
 * name since the copy answers without one (null if it cannot be found).
 */
export function CopyConfigModal({
  source,
  note,
  onClose,
  onDone,
}: {
  source: Configuration | null;
  /** An extra line under the lead (the editor: unsaved changes are not copied). */
  note?: string;
  onClose: () => void;
  onDone: (name: string, id: number | null) => void;
}) {
  const intl = useIntl();
  const [busy, setBusy] = useState(false);
  // Kept mounted with what it last showed, so it plays its exit (useStickyValue).
  const shown = useStickyValue(source);
  // Escape and the close button wait for a running copy (closing would hide its outcome).
  const close = () => {
    if (!busy) onClose();
  };
  return (
    <Modal open={source != null} onClose={close} title={intl.formatMessage(configModalMessages.duplicateTitle)} size="sm" dismissOnBackdrop={false}>
      {shown ? (
        <CopyForm key={shown.id} source={shown} note={note} busy={busy} setBusy={setBusy} onClose={close} onDone={onDone} />
      ) : null}
    </Modal>
  );
}

function CopyForm({
  source,
  note,
  busy,
  setBusy,
  onClose,
  onDone,
}: {
  source: Configuration;
  note?: string;
  busy: boolean;
  setBusy: (b: boolean) => void;
  onClose: () => void;
  onDone: (name: string, id: number | null) => void;
}) {
  const toast = useToast();
  const intl = useIntl();
  const [name, setName] = useState(`${source.name} copy`);
  const [error, setError] = useState<string | null>(null);

  async function go(e: FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n || source.id == null) return;
    setBusy(true);
    setError(null);
    try {
      await copyConfiguration(source.id, n, source.description as string | undefined);
    } catch (err) {
      const msg = errMessage(err);
      const dup = /duplicate/i.test(msg);
      const exists = intl.formatMessage(configModalMessages.nameExists);
      if (dup) setError(exists);
      toast.push('err', intl.formatMessage(configModalMessages.duplicateFailed), dup ? exists : msg);
      setBusy(false);
      return;
    }
    toast.push('ok', intl.formatMessage(configModalMessages.duplicated), n);
    const id = await getConfigurations().then(
      (list) => list.find((x) => x.name === n)?.id ?? null,
      () => null,
    );
    setBusy(false);
    onDone(n, id);
  }

  return (
    <form className="v2-configs-modalform" onSubmit={(e) => void go(e)}>
      <p className="v2-configs-modalform__lead">
        <FormattedMessage {...configModalMessages.duplicateLead} values={{ name: source.name }} />
      </p>
      {note ? <p className="v2-configs-modalform__lead">{note}</p> : null}
      <Field label={intl.formatMessage(configModalMessages.newName)} error={error}>
        <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </Field>
      <div className="v2-configs-modalform__actions">
        <Button size="lg" onClick={onClose} disabled={busy}>
          {intl.formatMessage(configModalMessages.cancel)}
        </Button>
        <Button size="lg" variant="primary" type="submit" disabled={busy || !name.trim()}>
          {intl.formatMessage(busy ? configModalMessages.duplicating : configModalMessages.duplicate)}
        </Button>
      </div>
    </form>
  );
}

/** Delete confirmation (classic: window.confirm). */
export function DeleteConfigModal({
  target,
  deviceCount,
  wipedCount = 0,
  onClose,
  onDeleted,
}: {
  target: Configuration | null;
  /** Devices using it, wiped ones included, from the sync summary (undefined = unknown). */
  deviceCount?: number;
  /** Of deviceCount: the wiped ones, which the Devices list only shows under its Wiped filter. */
  wipedCount?: number;
  onClose: () => void;
  onDeleted: (c: Configuration) => void;
}) {
  const toast = useToast();
  const intl = useIntl();
  const [busy, setBusy] = useState(false);
  // Kept mounted with what it last showed, so it plays its exit (useStickyValue).
  const shown = useStickyValue(target);

  async function go() {
    if (!target || target.id == null) return;
    setBusy(true);
    try {
      await deleteConfiguration(target.id);
      toast.push('ok', intl.formatMessage(configModalMessages.deleted), target.name);
      onDeleted(target);
    } catch (e) {
      const msg = errMessage(e);
      toast.push('err', intl.formatMessage(configModalMessages.deleteFailed), /device/i.test(msg) ? intl.formatMessage(configModalMessages.devicesStillUse) : msg);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={target != null}
      onClose={busy ? () => undefined : onClose}
      role="alertdialog"
      size="sm"
      title={intl.formatMessage(configModalMessages.deleteTitle)}
      description={shown ? intl.formatMessage(configModalMessages.deleteDescription, { name: shown.name }) : undefined}
      footer={
        <>
          <Button size="lg" onClick={onClose} disabled={busy}>
            {intl.formatMessage(configModalMessages.cancel)}
          </Button>
          <Button size="lg" variant="danger-primary" onClick={() => void go()} disabled={busy}>
            {intl.formatMessage(busy ? configModalMessages.deleting : configModalMessages.deleteConfirm)}
          </Button>
        </>
      }
    >
      {deviceCount ? (
        <p className="v2-configs-modalnote">
          {intl.formatMessage(configModalMessages.deleteBlocked, { count: deviceCount })}
          {wipedCount > 0 ? ` ${intl.formatMessage(configModalMessages.deleteBlockedWiped, { count: wipedCount })}` : null}
        </p>
      ) : null}
    </Modal>
  );
}

/**
 * "New configuration": blank, or based on one of the built-in templates (classic NewChooser). The page opens it only
 * when there is a template to offer; with none, New configuration creates a blank one directly.
 */
export function NewConfigChooser({
  open,
  templates,
  onClose,
  onPick,
}: {
  open: boolean;
  templates: Configuration[];
  onClose: () => void;
  onPick: (base: Configuration | null) => void;
}) {
  const intl = useIntl();
  // The choice: "blank" or a template id. Starts on Blank each time it opens.
  const [choice, setChoice] = useState('blank');
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) setChoice('blank');
  }
  const options = [
    { value: 'blank', name: intl.formatMessage(configModalMessages.blank), sub: intl.formatMessage(configModalMessages.blankSub) },
    ...templates.map((t) => ({
      value: String(t.id),
      name: intl.formatMessage(configModalMessages.basedOn, { name: t.name }),
      sub: intl.formatMessage(configModalMessages.basedOnSub),
    })),
  ];
  const create = (e: FormEvent) => {
    e.preventDefault();
    onPick(choice === 'blank' ? null : (templates.find((t) => String(t.id) === choice) ?? null));
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={intl.formatMessage(configModalMessages.newTitle)}
      size="sm"
      footer={
        <>
          <Button size="lg" onClick={onClose}>
            {intl.formatMessage(configModalMessages.cancel)}
          </Button>
          <Button size="lg" variant="primary" type="submit" form="v2-configs-chooser">
            {intl.formatMessage(configModalMessages.create)}
          </Button>
        </>
      }
    >
      <form id="v2-configs-chooser" onSubmit={create}>
        <fieldset className="v2-configs-chooser">
          <legend className="v2-visually-hidden">{intl.formatMessage(configModalMessages.startFrom)}</legend>
          {options.map((o) => (
            <label key={o.value} className={choice === o.value ? 'v2-configs-chooser__opt is-on' : 'v2-configs-chooser__opt'}>
              <input
                type="radio"
                name="v2-configs-chooser"
                className="v2-visually-hidden"
                value={o.value}
                checked={choice === o.value}
                onChange={() => setChoice(o.value)}
              />
              <span className="v2-configs-chooser__text">
                <span className="v2-configs-chooser__name">{o.name}</span>
                <span className="v2-configs-chooser__sub">{o.sub}</span>
              </span>
              <span className="v2-configs-chooser__mark" aria-hidden="true">
                {choice === o.value ? <IconCheckSmall /> : null}
              </span>
            </label>
          ))}
        </fieldset>
      </form>
    </Modal>
  );
}

const FIELD_LABEL: Record<string, MessageDescriptor> = Object.fromEntries(CONFIG_FIELDS.map((f) => [f.key, f.label]));
FIELD_LABEL.applications = configModalMessages.kioskKeyApps;
FIELD_LABEL.backgroundImageFileId = configModalMessages.kioskKeyBackground;

/** Kiosk-change confirmation (classic KioskChangeConfirm). `count` null = unknown: still confirm, without a number. */
export function KioskConfirmModal({
  keys,
  count,
  saveDisabled = false,
  onCancel,
  onConfirm,
}: {
  keys: string[] | null;
  count: number | null;
  saveDisabled?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const intl = useIntl();
  const shown = useStickyValue(keys);
  return (
    <Modal
      open={keys != null}
      onClose={onCancel}
      title={count == null ? intl.formatMessage(configModalMessages.kioskTitleUnknown) : intl.formatMessage(configModalMessages.kioskTitle, { count })}
      footer={
        <>
          <Button size="lg" onClick={onCancel}>
            {intl.formatMessage(configModalMessages.keepEditing)}
          </Button>
          <Button size="lg" variant="primary" onClick={onConfirm} disabled={saveDisabled}>
            {intl.formatMessage(configModalMessages.saveAndApply)}
          </Button>
        </>
      }
    >
      <p className="v2-configs-modalnote">
        {intl.formatMessage(configModalMessages.kioskBody, {
          settings: (shown ?? []).map((k) => (FIELD_LABEL[k] ? intl.formatMessage(FIELD_LABEL[k]) : k)).join(', '),
        })}
      </p>
    </Modal>
  );
}

const CAT_LABEL: Record<AppCategory, MessageDescriptor> = {
  uploaded: configModalMessages.catUploaded,
  system: configModalMessages.catSystem,
  web: configModalMessages.catWeb,
};
// Web apps are not offered: configurations assign installable apps only (the editor leaves them out of the library).
const CAT_ORDER: AppCategory[] = ['uploaded', 'system'];

/** Searchable, categorised, multi-select app picker (classic AppPicker). Defaults to "Uploaded". */
export function AppPickerModal({
  open,
  apps,
  excludeIds,
  onAdd,
  onClose,
}: {
  open: boolean;
  apps: Application[];
  excludeIds: Set<number>;
  onAdd: (apps: Application[]) => void;
  onClose: () => void;
}) {
  // A fresh picker (no search, nothing ticked) each time it opens; kept mounted while it closes, for its exit.
  const [session, setSession] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) setSession((n) => n + 1);
  }
  const intl = useIntl();
  return (
    <Modal open={open} onClose={onClose} title={intl.formatMessage(configModalMessages.addApps)} size="lg">
      <PickerBody key={session} apps={apps} excludeIds={excludeIds} onAdd={onAdd} onClose={onClose} />
    </Modal>
  );
}

function PickerBody({
  apps,
  excludeIds,
  onAdd,
  onClose,
}: {
  apps: Application[];
  excludeIds: Set<number>;
  onAdd: (apps: Application[]) => void;
  onClose: () => void;
}) {
  const intl = useIntl();
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const available = useMemo(() => apps.filter((a) => !excludeIds.has(a.id)), [apps, excludeIds]);
  const counts = useMemo(() => {
    const c: Record<AppCategory, number> = { uploaded: 0, system: 0, web: 0 };
    for (const a of available) c[appCategory(a)]++;
    return c;
  }, [available]);
  const tabs = CAT_ORDER.filter((c) => counts[c] > 0);
  const [cat, setCat] = useState<AppCategory>(counts.uploaded > 0 ? 'uploaded' : (tabs[0] ?? 'uploaded'));

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return available
      .filter((a) => appCategory(a) === cat)
      .filter((a) => !needle || `${a.name} ${a.pkg}`.toLowerCase().includes(needle))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [available, cat, q]);

  const toggle = (id: number) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="v2-configs-picker">
      <div className="v2-configs-picker__top">
        <SearchInput
          className="v2-configs-picker__search"
          value={q}
          onChange={setQ}
          placeholder={intl.formatMessage(configModalMessages.searchApps)}
          aria-label={intl.formatMessage(configModalMessages.searchApps)}
          autoFocus
        />
        {tabs.length > 0 ? (
          <Segmented
            aria-label={intl.formatMessage(configModalMessages.category)}
            value={cat}
            onChange={setCat}
            options={tabs.map((c) => ({ value: c, label: intl.formatMessage(CAT_LABEL[c]), count: counts[c] }))}
          />
        ) : null}
      </div>
      <div className="v2-configs-picker__list" role="group" aria-label={intl.formatMessage(configModalMessages.apps)}>
        {shown.length === 0 ? (
          <EmptyState
            bare
            title={intl.formatMessage(
              apps.length === 0 ? configModalMessages.libraryEmpty : available.length === 0 ? configModalMessages.allAdded : configModalMessages.noApps,
            )}
          />
        ) : (
          shown.map((a) => (
            <label key={a.id} className={picked.has(a.id) ? 'v2-configs-picker__row is-on' : 'v2-configs-picker__row'}>
              <Checkbox checked={picked.has(a.id)} onChange={() => toggle(a.id)} />
              <AppTile name={a.name} size={32} />
              <span className="v2-configs-picker__meta">
                <span className="v2-configs-picker__name">{a.name}</span>
                <span className="v2-configs-picker__pkg">{a.pkg}</span>
              </span>
              {a.version ? <span className="v2-configs-picker__ver">{a.version}</span> : null}
            </label>
          ))
        )}
      </div>
      <div className="v2-configs-modalform__actions">
        <Button size="lg" onClick={onClose}>
          {intl.formatMessage(configModalMessages.cancel)}
        </Button>
        <Button
          size="lg"
          variant="primary"
          disabled={picked.size === 0}
          onClick={() => {
            const chosen = apps.filter((a) => picked.has(a.id));
            if (chosen.length) onAdd(chosen);
            onClose();
          }}
        >
          {picked.size ? intl.formatMessage(configModalMessages.addCount, { count: picked.size }) : intl.formatMessage(configModalMessages.add)}
        </Button>
      </div>
    </div>
  );
}
