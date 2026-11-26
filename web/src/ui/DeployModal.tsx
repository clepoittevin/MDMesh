import { useEffect, useId, useMemo, useState } from 'react';
import { defineMessages, useIntl, type MessageDescriptor } from 'react-intl';
import { searchDevices, type DeviceView } from '../api/devices';
import { listConfigurationNames, type ConfigurationSummary } from '../api/configurations';
import { getAppConfigLinks, updateAppConfigLinks, type AppConfigLink } from '../api/applications';
import { installApp } from '../api/commands';
import type { DeployModes, DeploySubject } from '../data/apps';
import { useToast } from './toast';
import { Button } from './Button';
import { Field } from './Field';
import { Checkbox, SearchInput, Select } from './Input';
import { Modal } from './Modal';
import { RelativeTime } from './RelativeTime';
import { SkeletonRows } from './Skeleton';
import { StatusDot, type StatusTone } from './Status';
import { TabPanel, Tabs } from './Tabs';
import './DeployModal.css';
import { apiErrorText } from '../api/apiErrorText';

type Mode = 'device' | 'config';

/** Device check-in recency (the server's statusCode colour) as a shape-coded mark + word. */
const presenceMessages = defineMessages({
  online: { id: 'deploy.presence.online', defaultMessage: 'Online' },
  idle: { id: 'deploy.presence.idle', defaultMessage: 'Idle' },
  offline: { id: 'deploy.presence.offline', defaultMessage: 'Offline' },
  unknown: { id: 'deploy.presence.unknown', defaultMessage: 'Unknown' },
});
const PRESENCE: Record<string, { tone: StatusTone; label: MessageDescriptor }> = {
  green: { tone: 'ok', label: presenceMessages.online },
  yellow: { tone: 'idle', label: presenceMessages.idle },
  red: { tone: 'idle', label: presenceMessages.offline },
};
const UNKNOWN: { tone: StatusTone; label: MessageDescriptor } = { tone: 'idle', label: presenceMessages.unknown };

const messages: Record<string, MessageDescriptor> = defineMessages({
  pushedTitle: { id: 'deploy.toast.pushedTitle', defaultMessage: 'Deploy {label}' },
  pushedBody: {
    id: 'deploy.toast.pushedBody',
    defaultMessage:
      '{ok, plural, one {# device queued} other {# devices queued}}{fail, plural, =0 {} other {, # failed}}.',
  },
  addedTitle: { id: 'deploy.toast.addedTitle', defaultMessage: 'Added {label}' },
  addedBody: { id: 'deploy.toast.addedBody', defaultMessage: 'Assigned to {name}.' },
  configurationFallback: { id: 'deploy.toast.configurationFallback', defaultMessage: 'configuration' },
  assignFailed: { id: 'deploy.toast.assignFailed', defaultMessage: 'Assign failed' },
  deploying: { id: 'deploy.submit.deploying', defaultMessage: 'Deploying…' },
  deployTo: {
    id: 'deploy.submit.deployTo',
    defaultMessage: 'Deploy to {count, plural, one {# device} other {# devices}}',
  },
  deploy: { id: 'deploy.submit.deploy', defaultMessage: 'Deploy' },
  addToConfiguration: { id: 'deploy.submit.addToConfiguration', defaultMessage: 'Add to configuration' },
  title: { id: 'deploy.modal.title', defaultMessage: 'Deploy {label}' },
  versionCode: { id: 'deploy.modal.versionCode', defaultMessage: 'version code {code}' },
  parts: { id: 'deploy.modal.parts', defaultMessage: '{count, plural, one {# part} other {# parts}}' },
  cancel: { id: 'deploy.modal.cancel', defaultMessage: 'Cancel' },
  howToDeploy: { id: 'deploy.tabs.label', defaultMessage: 'How to deploy' },
  pushTab: { id: 'deploy.tabs.push', defaultMessage: 'Push to devices' },
  configTab: { id: 'deploy.tabs.configuration', defaultMessage: 'Add to a configuration' },
  libraryOnly: {
    id: 'deploy.note.libraryOnly',
    defaultMessage: 'Only apps in the library can be added to a configuration.',
  },
  filterDevices: { id: 'deploy.devices.filter', defaultMessage: 'Filter devices' },
  clearShown: { id: 'deploy.devices.clearShown', defaultMessage: 'Clear shown' },
  selectAllShown: { id: 'deploy.devices.selectAllShown', defaultMessage: 'Select all {count} shown' },
  loadingDevices: { id: 'deploy.devices.loading', defaultMessage: 'Loading devices…' },
  devicesList: { id: 'deploy.devices.listLabel', defaultMessage: 'Devices' },
  loadFailed: { id: 'deploy.devices.loadFailed', defaultMessage: 'Couldn’t load devices.' },
  noDevices: { id: 'deploy.devices.none', defaultMessage: 'No devices yet.' },
  noMatch: { id: 'deploy.devices.noMatch', defaultMessage: 'No devices match.' },
  presenceHidden: { id: 'deploy.devices.presenceHidden', defaultMessage: '{status},' },
  launchAfter: { id: 'deploy.devices.launchAfter', defaultMessage: 'Launch the app after install' },
  selected: { id: 'deploy.devices.selected', defaultMessage: '{count, plural, one {#} other {#}} selected' },
  configuration: { id: 'deploy.config.label', defaultMessage: 'Configuration' },
  configurationHelp: {
    id: 'deploy.config.help',
    defaultMessage: 'Every device on this configuration installs the app on its next sync.',
  },
  selectConfiguration: { id: 'deploy.config.select', defaultMessage: 'Select a configuration' },
});

/**
 * Deploy dialog (classic components/DeployModal): push the app to any number of devices now, or add it to a
 * configuration (library apps only), offering the modes the role may use. Keep it mounted while it closes (`open`
 * false, the last subject kept) so it plays its exit; mount a fresh one (a new `key`) for each opening.
 */
export function DeployModal({
  open = true,
  subject,
  modes,
  onClose,
  onAssigned,
}: {
  /** Default true: rendered means open. Pass false to close it with its exit motion. */
  open?: boolean;
  subject: DeploySubject;
  modes: DeployModes;
  onClose: () => void;
  /** After the app was added to a configuration (its "Used in" changed). */
  onAssigned?: (applicationId: number) => void;
}) {
  const toast = useToast();
  const intl = useIntl();
  const idBase = useId();
  const canAssign = subject.applicationId != null;
  const [chosenMode, setMode] = useState<Mode>(modes.devices ? 'device' : 'config');
  // A role refresh can take a mode away while the dialog is open: the other one shows (the page closes the dialog
  // when the role has none left).
  const mode: Mode = chosenMode === 'device' ? (modes.devices ? 'device' : 'config') : modes.configuration ? 'config' : 'device';
  const [devices, setDevices] = useState<DeviceView[] | null>(null);
  const [devicesError, setDevicesError] = useState(false);
  const [configs, setConfigs] = useState<Pick<ConfigurationSummary, 'id' | 'name'>[]>([]);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [config, setConfig] = useState('');
  const [runAfter, setRunAfter] = useState(false);
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    searchDevices({ pageSize: 1000 })
      .then((r) => !cancelled && setDevices(r.devices?.items ?? []))
      .catch(() => {
        if (cancelled) return;
        setDevices([]);
        setDevicesError(true);
      });
    listConfigurationNames()
      .then((l) => !cancelled && setConfigs(l ?? []))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const list = devices ?? [];
    if (!q) return list;
    return list.filter((d) => `${d.number ?? ''} ${d.description ?? ''}`.toLowerCase().includes(q));
  }, [devices, filter]);

  const allShownPicked = shown.length > 0 && shown.every((d) => picked.has(d.number));

  function toggle(num: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(num)) next.delete(num);
      else next.add(num);
      return next;
    });
  }

  function toggleShown() {
    setPicked((prev) => {
      const next = new Set(prev);
      for (const d of shown) {
        if (allShownPicked) next.delete(d.number);
        else next.add(d.number);
      }
      return next;
    });
  }

  async function pushNow() {
    if (picked.size === 0) return;
    setBusy(true);
    let ok = 0;
    let fail = 0;
    for (const num of picked) {
      try {
        await installApp(num, {
          url: subject.url,
          packageName: subject.packageName,
          versionCode: subject.versionCode,
          sha256: subject.sha256,
          runAfterInstall: runAfter,
          parts: subject.parts,
        });
        ok++;
      } catch {
        fail++;
      }
    }
    setBusy(false);
    toast.push(
      fail ? 'err' : 'ok',
      intl.formatMessage(messages.pushedTitle, { label: subject.label }),
      intl.formatMessage(messages.pushedBody, { ok, fail }),
    );
    onClose();
  }

  async function assignConfig() {
    if (!config || subject.applicationId == null) return;
    setBusy(true);
    try {
      const cid = Number(config);
      const links = await getAppConfigLinks(subject.applicationId);
      let found = false;
      const updated: AppConfigLink[] = links.map((l) => {
        if (l.configurationId !== cid) return l;
        found = true;
        return { ...l, action: 1, remove: false, notify: true };
      });
      if (!found) {
        updated.push({
          configurationId: cid,
          applicationId: subject.applicationId,
          action: 1,
          showIcon: true, // configurationApplications.showIcon is NOT NULL
          remove: false,
          notify: true,
        });
      }
      await updateAppConfigLinks({ applicationId: subject.applicationId, configurations: updated });
      const name = configs.find((c) => c.id === cid)?.name ?? intl.formatMessage(messages.configurationFallback);
      toast.push(
        'ok',
        intl.formatMessage(messages.addedTitle, { label: subject.label }),
        intl.formatMessage(messages.addedBody, { name }),
      );
      onAssigned?.(subject.applicationId);
      onClose();
    } catch (e) {
      toast.push('err', intl.formatMessage(messages.assignFailed), apiErrorText(intl, e));
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = mode === 'device' ? picked.size > 0 : !!config;
  const submitLabel = busy
    ? intl.formatMessage(messages.deploying)
    : mode === 'device'
      ? picked.size > 0
        ? intl.formatMessage(messages.deployTo, { count: picked.size })
        : intl.formatMessage(messages.deploy)
      : intl.formatMessage(messages.addToConfiguration);

  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      dismissOnBackdrop={!busy}
      title={intl.formatMessage(messages.title, { label: subject.label })}
      description={
        <>
          <span className="v2-mono">{subject.packageName}</span>
          {subject.versionCode != null ? ` · ${intl.formatMessage(messages.versionCode, { code: subject.versionCode })}` : ''}
          {subject.parts?.length ? ` · ${intl.formatMessage(messages.parts, { count: subject.parts.length })}` : ''}
        </>
      }
      footer={
        <>
          <Button size="lg" onClick={onClose} disabled={busy}>
            {intl.formatMessage(messages.cancel)}
          </Button>
          <Button
            size="lg"
            variant="primary"
            disabled={busy || !canSubmit}
            onClick={() => void (mode === 'device' ? pushNow() : assignConfig())}
          >
            {submitLabel}
          </Button>
        </>
      }
    >
      <div className="v2-deploy">
        <Tabs
          size="md"
          idBase={idBase}
          aria-label={intl.formatMessage(messages.howToDeploy)}
          value={mode}
          onChange={setMode}
          items={[
            ...(modes.devices ? [{ key: 'device' as const, label: intl.formatMessage(messages.pushTab) }] : []),
            ...(modes.configuration ? [{ key: 'config' as const, label: intl.formatMessage(messages.configTab), disabled: !canAssign }] : []),
          ]}
        />
        {modes.configuration && !canAssign ? (
          <p className="v2-deploy__note">{intl.formatMessage(messages.libraryOnly)}</p>
        ) : null}

        {mode === 'device' ? (
          <TabPanel idBase={idBase} tabKey="device" className="v2-deploy__panel">
            <div className="v2-deploy__tools">
              <SearchInput
                className="v2-deploy__search"
                aria-label={intl.formatMessage(messages.filterDevices)}
                placeholder={intl.formatMessage(messages.filterDevices)}
                value={filter}
                onChange={setFilter}
              />
              {shown.length > 0 ? (
                <Checkbox
                  label={
                    allShownPicked
                      ? intl.formatMessage(messages.clearShown)
                      : intl.formatMessage(messages.selectAllShown, { count: shown.length })
                  }
                  checked={allShownPicked}
                  indeterminate={!allShownPicked && shown.some((d) => picked.has(d.number))}
                  onChange={toggleShown}
                />
              ) : null}
            </div>
            {devices === null ? (
              <div className="v2-deploy__list" aria-busy="true">
                <SkeletonRows compact count={4} label={intl.formatMessage(messages.loadingDevices)} />
              </div>
            ) : (
              <ul className="v2-deploy__list" aria-label={intl.formatMessage(messages.devicesList)}>
                {shown.length === 0 ? (
                  <li className="v2-deploy__empty">
                    {intl.formatMessage(devicesError ? messages.loadFailed : devices.length === 0 ? messages.noDevices : messages.noMatch)}
                  </li>
                ) : (
                  shown.map((d) => {
                    const p = (d.statusCode && PRESENCE[d.statusCode]) || UNKNOWN;
                    return (
                      <li key={d.id}>
                        <label className="v2-deploy__row">
                          <Checkbox checked={picked.has(d.number)} onChange={() => toggle(d.number)} />
                          <StatusDot tone={p.tone} />
                          <span className="v2-visually-hidden">{intl.formatMessage(messages.presenceHidden, { status: intl.formatMessage(p.label) })}{' '}</span>
                          <span className="v2-deploy__num">{d.number || '—'}</span>
                          <span className="v2-deploy__desc">{d.description}</span>
                          <RelativeTime className="v2-deploy__seen" value={d.lastUpdate} />
                        </label>
                      </li>
                    );
                  })
                )}
              </ul>
            )}
            <div className="v2-deploy__foot">
              <Checkbox label={intl.formatMessage(messages.launchAfter)} checked={runAfter} onChange={(e) => setRunAfter(e.target.checked)} />
              <span className="v2-deploy__count" aria-live="polite">
                {intl.formatMessage(messages.selected, { count: picked.size })}
              </span>
            </div>
          </TabPanel>
        ) : (
          <TabPanel idBase={idBase} tabKey="config" className="v2-deploy__panel">
            <Field label={intl.formatMessage(messages.configuration)} help={intl.formatMessage(messages.configurationHelp)}>
              <Select value={config} onChange={(e) => setConfig(e.target.value)}>
                <option value="">{intl.formatMessage(messages.selectConfiguration)}</option>
                {configs.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          </TabPanel>
        )}
      </div>
    </Modal>
  );
}
