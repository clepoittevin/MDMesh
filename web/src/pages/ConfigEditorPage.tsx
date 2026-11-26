import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import {
  extensionErrorsOf,
  getConfiguration,
  getConfigurationApps,
  saveConfiguration,
  type ConfigApp,
  type Configuration,
} from '../api/configurations';
import { ApiError } from '../api/client';
import { commitUpload, listApplications, uploadRawFile, type Application } from '../api/applications';
import {
  KIOSK_IMAGE_AGENT,
  kioskImageContentId,
  kioskImageErrorText,
  kioskImageProblem,
  kioskImageUploadName,
  normalizeKioskImage,
} from '../data/kioskBackground';
import { getSyncSummary, type ConfigSyncSummary } from '../api/configSync';
import {
  CONFIG_FIELDS,
  GROUP_LABELS,
  GROUP_NOTES,
  GROUP_ORDER,
  LEGACY_FIELDS,
  PRIMARY_FIELDS,
  type FieldDef,
} from '../data/configFields';
import {
  affectedDeviceCount,
  cloneForNew,
  exitPinProblem,
  hasDefaultPin,
  hasLegacyPin,
  hasNoPin,
  isLocked,
  locationServicesAction,
} from '../data/configurationRules';
import { configuredKiosk } from '../data/kiosk';
import { kioskAffectingChanges } from '../data/kioskChanges';
import { manageableAppPermissions, managedAppPermissionLabel } from '../data/managedAppPermissions';
import {
  Badge,
  Breadcrumb,
  Button,
  ButtonLink,
  Callout,
  Card,
  CardHeader,
  ChangedChip,
  EmptyState,
  ErrorState,
  Eyebrow,
  Field,
  FieldRow,
  IconChevronDown,
  IconConfigurations,
  IconCopy,
  IconInfo,
  IconLockSmall,
  IconPlus,
  IconTrash,
  IconWarning,
  Input,
  PageHeader,
  SectionLayout,
  SectionNav,
  Select,
  SkeletonFacts,
  StickySaveBar,
  Textarea,
  useLeaveGuard,
  useToast,
} from '../ui';
import { CORE_ACTION_ACCESS, CORE_PAGE_ACCESS } from '../ext/core/access';
import { CoreConfigProvider, type CoreConfigSection } from '../ext/core/config';
import { useConfigSections, type ConfigSectionMeta } from '../ext/hosts/ConfigSections';
import { NoAccess } from '../ext/hosts/RoutePage';
import { usePermission } from '../ext/permissions';
import { paths } from '../routes';
import { AssignedApps } from './configurations/AssignedApps';
import { KioskBackgroundField, hostedPath, useKioskBackgroundInfo } from './configurations/KioskBackground';
import { KioskBackgroundPreview } from './configurations/KioskPreview';
import { kioskColours, type FitMode } from '../data/kioskScrim';
import { KioskPlacement } from './configurations/KioskPlacement';
import { KioskGallery } from './configurations/KioskGallery';
import { AgentTag, AppSelect, FieldControl, FieldHelp } from './configurations/controls';
import {
  joinQrParameters,
  parseExtraQrParameters,
  settingsInRest,
  unusedInRest,
  qrPayloadBytes,
  QR_EXTRA_TYPES,
  QR_EXTRA_PREFIX,
  extrasInCode,
  qrSettingValueOk,
  QR_SETTING_KEYS,
  splitQrParameters,
  type QrParametersSplit,
} from '../enroll/provisioning';
import { defineMessage, defineMessages, FormattedMessage, useIntl, type IntlShape, type MessageDescriptor } from 'react-intl';
import { untyped } from '../data/configIntl';

const enrollmentMessages = untyped(defineMessages({
  setupScreens: { id: 'configEditor.enrollment.setupScreens', defaultMessage: 'Setup screens' },
  setupScreensHelp: {
    id: 'configEditor.enrollment.setupScreensHelp',
    defaultMessage: 'Android applies these while the device sets itself up.',
  },
}));
const qrInvalid = defineMessage({
  id: 'configEditor.enrollment.qrInvalid',
  defaultMessage: 'Not valid JSON yet. It is saved as typed; the Enroll page leaves it out until it is fixed.',
});
const qrUnused = {
  wifi: defineMessage<{ keys: string }>({
    id: 'configEditor.enrollment.qrUnusedWifi',
    defaultMessage: '{keys}: not used. Wi-Fi comes from the setup Wi-Fi above and the Enroll page.',
  }),
  protected: defineMessage<{ keys: string }>({
    id: 'configEditor.enrollment.qrUnusedProtected',
    defaultMessage: '{keys}: not used. MDMesh sets these itself.',
  }),
  unsupported: defineMessage<{ keys: string; known: string }>({
    id: 'configEditor.enrollment.qrUnusedUnsupported',
    defaultMessage: '{keys}: not used. MDMesh passes on only these setup entries: {known}.',
  }),
  invalid: defineMessage<{ keys: string }>({
    id: 'configEditor.enrollment.qrUnusedInvalid',
    defaultMessage: "{keys}: not used. The value isn't of the type this entry takes.",
  }),
};
const qrSettingInvalid = defineMessage<{ value: string }>({
  id: 'configEditor.enrollment.qrSettingInvalid',
  defaultMessage: "“{value}” isn't a value Android takes here, so it is left out of the code. Choose one from the list.",
});
const qrLong = defineMessage<{ bytes: number }>({
  id: 'configEditor.enrollment.qrLong',
  defaultMessage: 'These entries are long ({bytes} bytes): the enrollment QR code gets dense, and may not fit at all.',
});
const qrDuplicates = defineMessage<{ keys: string }>({
  id: 'configEditor.enrollment.qrDuplicates',
  defaultMessage: '{keys}: use the setting above instead. Once that is set, it wins over this entry.',
});
const messages = untyped(defineMessages({
  crumbConfigurations: { id: 'configEditor.page.crumbConfigurations', defaultMessage: 'Configurations' },
  newTitle: { id: 'configEditor.page.newTitle', defaultMessage: 'New configuration' },
  title: { id: 'configEditor.page.title', defaultMessage: 'Configuration' },
  loading: { id: 'configEditor.page.loading', defaultMessage: 'Loading configuration…' },
  failedThis: { id: 'configEditor.page.failedThis', defaultMessage: 'this configuration' },
  templateMissing: { id: 'configEditor.page.templateMissing', defaultMessage: 'Template not found' },
  configMissing: { id: 'configEditor.page.configMissing', defaultMessage: 'Configuration not found' },
  allConfigurations: { id: 'configEditor.page.allConfigurations', defaultMessage: 'All configurations' },
  templateMissingBody: {
    id: 'configEditor.page.templateMissingBody',
    defaultMessage: 'The configuration to copy no longer exists, or you don’t have access to it.',
  },
  configMissingBody: {
    id: 'configEditor.page.configMissingBody',
    defaultMessage: 'It may have been deleted, or you don’t have access to it.',
  },
  buttonsAndScreens: { id: 'configEditor.layout.buttonsAndScreens', defaultMessage: 'Buttons and system screens' },
  leavingKiosk: { id: 'configEditor.layout.leavingKiosk', defaultMessage: 'Leaving kiosk mode' },
  launcherLook: { id: 'configEditor.layout.launcherLook', defaultMessage: 'Launcher look' },
  onlyInKiosk: { id: 'configEditor.layout.onlyInKiosk', defaultMessage: 'Only applies in kiosk mode' },
  turnOnKiosk: { id: 'configEditor.layout.turnOnKiosk', defaultMessage: 'Turn on kiosk mode to change these' },
  helpKioskMode: {
    id: 'configEditor.help.kioskMode',
    defaultMessage: 'When off, the settings below are ignored and the device uses its own launcher.',
  },
  helpKioskHome: { id: 'configEditor.help.kioskHome', defaultMessage: 'The Android home button or gesture.' },
  helpKioskRecents: {
    id: 'configEditor.help.kioskRecents',
    defaultMessage: 'The app switcher. Needs Home button on (Android requires it).',
  },
  helpKioskNotifications: {
    id: 'configEditor.help.kioskNotifications',
    defaultMessage: 'The notification shade. Needs Home button on (Android requires it).',
  },
  subKiosk: { id: 'configEditor.section.kioskSub', defaultMessage: 'Lock the screen to the apps marked “Show in kiosk”.' },
  subNetwork: { id: 'configEditor.section.networkSub', defaultMessage: 'Radios, location and connectivity. {note}' },
  subSecurity: { id: 'configEditor.section.securitySub', defaultMessage: 'What people on the device can change. {note}' },
  legacyNote: {
    id: 'configEditor.legacy.note',
    defaultMessage: 'The MDMesh agent ignores these. They stay stored, and saving keeps their values.',
  },
  changed: { id: 'configEditor.nav.changed', defaultMessage: '{count, plural, one {# changed} other {# changed}}' },
  checkPin: { id: 'configEditor.nav.checkPin', defaultMessage: 'Check PIN' },
  defaultPin: { id: 'configEditor.nav.defaultPin', defaultMessage: 'Default PIN' },
  noPin: { id: 'configEditor.nav.noPin', defaultMessage: 'No PIN' },
  oldPin: { id: 'configEditor.nav.oldPin', defaultMessage: 'Old PIN' },
  syncPickUp: {
    id: 'configEditor.sync.pickUp',
    defaultMessage: 'Devices using this configuration pick up the changes on their next sync.',
  },
  syncAllOld: {
    id: 'configEditor.sync.allOld',
    defaultMessage:
      '{total, plural, one {The device using this configuration has an agent too old for configuration sync, so it does not pick up changes until the agent is updated.} other {All # devices using this configuration have agents too old for configuration sync, so they do not pick up changes until the agent is updated.}}',
  },
  syncSomeOld: {
    id: 'configEditor.sync.someOld',
    defaultMessage:
      'Devices using this configuration pick up the changes on their next sync, except {old, plural, one {# device that has an agent too old for configuration sync} other {# devices that have agents too old for configuration sync}}.',
  },
  imageStillUploadingTitle: { id: 'configEditor.toast.imageUploadingTitle', defaultMessage: 'Image still uploading' },
  imageStillUploading: {
    id: 'configEditor.toast.imageUploading',
    defaultMessage: 'Wait for the selected background image to finish uploading before saving.',
  },
  nameRequiredTitle: { id: 'configEditor.toast.nameRequiredTitle', defaultMessage: 'Name required' },
  nameRequired: { id: 'configEditor.toast.nameRequired', defaultMessage: 'Give the configuration a name.' },
  stillLoadingTitle: { id: 'configEditor.toast.stillLoadingTitle', defaultMessage: 'Still loading' },
  stillLoading: {
    id: 'configEditor.toast.stillLoading',
    defaultMessage: 'The assigned apps are still loading — try again in a moment.',
  },
  checkExitPin: { id: 'configEditor.toast.checkExitPin', defaultMessage: 'Check the exit PIN' },
  fixProblems: {
    id: 'configEditor.toast.fixProblems',
    defaultMessage: 'Fix {count, plural, one {# problem} other {# problems}} before saving',
  },
  created: { id: 'configEditor.toast.created', defaultMessage: 'Configuration created' },
  saved: { id: 'configEditor.toast.saved', defaultMessage: 'Configuration saved' },
  saveFailed: { id: 'configEditor.toast.saveFailed', defaultMessage: 'Save failed' },
  pinWarnProblem: {
    id: 'configEditor.pin.warnProblem',
    defaultMessage: '{problem} Devices on this configuration keep the PIN they have until you save.',
  },
  pinDefaultTemplate: {
    id: 'configEditor.pin.defaultTemplate',
    defaultMessage:
      'This template uses a well-known default PIN. Duplicate it, set your own PIN, and move its devices to the copy.',
  },
  pinDefault: {
    id: 'configEditor.pin.default',
    defaultMessage: 'This is a well-known default PIN: anyone who knows it can leave kiosk. Choose one only your staff know.',
  },
  pinNoneTemplate: {
    id: 'configEditor.pin.noneTemplate',
    defaultMessage: 'This template has no exit PIN. Duplicate it, set a PIN, and move its devices to the copy.',
  },
  pinNone: {
    id: 'configEditor.pin.none',
    defaultMessage: 'No exit PIN: agents before 0.3.6 let anyone leave kiosk; later ones have no exit on the device. Set one.',
  },
  pinLegacy: {
    id: 'configEditor.pin.legacy',
    defaultMessage:
      'This PIN was saved before exit PINs had to be 6 to 12 digits. Devices keep using it, but it is easier to guess. Set a new one.',
  },
  imageNotUsed: { id: 'configEditor.toast.imageNotUsed', defaultMessage: 'Image not used' },
  imageUnreadable: { id: 'configEditor.toast.imageUnreadable', defaultMessage: 'The image could not be read.' },
  imageNoIdentity: {
    id: 'configEditor.toast.imageNoIdentity',
    defaultMessage: 'The server did not return the uploaded image identity.',
  },
  imageUploaded: { id: 'configEditor.toast.imageUploaded', defaultMessage: 'Background image uploaded' },
  imageUploadedBody: {
    id: 'configEditor.toast.imageUploadedBody',
    defaultMessage: 'Check the preview, then save and apply the configuration to use it in kiosk.',
  },
  imageUploadFailed: { id: 'configEditor.toast.imageUploadFailed', defaultMessage: 'Image upload failed' },
  imageChosen: { id: 'configEditor.toast.imageChosen', defaultMessage: 'Background image chosen' },
  imageChosenBody: {
    id: 'configEditor.toast.imageChosenBody',
    defaultMessage: '{name}. Save and apply the configuration to use it in kiosk.',
  },
  backgroundImage: { id: 'configEditor.background.label', defaultMessage: 'Background image' },
  backgroundImageHelp: {
    id: 'configEditor.background.help',
    defaultMessage: 'A PNG, JPEG or WebP photo behind the kiosk launcher.',
  },
  backgroundImageMore: {
    id: 'configEditor.background.more',
    defaultMessage: 'Where the image can’t be shown, the background color is used.',
  },
  basedOn: { id: 'configEditor.header.basedOn', defaultMessage: 'Based on “{name}”. Not saved yet.' },
  notSavedYet: { id: 'configEditor.header.notSavedYet', defaultMessage: 'Not saved yet.' },
  notUsedYet: { id: 'configEditor.header.notUsedYet', defaultMessage: 'Not used by any device yet.' },
  creating: { id: 'configEditor.action.creating', defaultMessage: 'Creating…' },
  create: { id: 'configEditor.action.create', defaultMessage: 'Create configuration' },
  saving: { id: 'configEditor.action.saving', defaultMessage: 'Saving…' },
  saveAndApply: { id: 'configEditor.action.saveAndApply', defaultMessage: 'Save and apply' },
  duplicateToEdit: { id: 'configEditor.action.duplicateToEdit', defaultMessage: 'Duplicate to edit' },
  duplicate: { id: 'configEditor.action.duplicate', defaultMessage: 'Duplicate' },
  delete: {
    id: 'configEditor.action.delete',
    defaultMessage: 'Delete',
    description: 'DESTRUCTIVE: opens the confirmation to delete the configuration.',
  },
  saveOffLoading: {
    id: 'configEditor.bar.saveOffLoading',
    defaultMessage: 'Saving is off until the assigned apps load.',
  },
  loadingApps: { id: 'configEditor.bar.loadingApps', defaultMessage: 'Loading the assigned apps…' },
  kioskChangeDevices: {
    id: 'configEditor.bar.kioskChangeDevices',
    defaultMessage:
      'Kiosk settings change on {count, plural, one {# device. It re-applies kiosk at the next check-in.} other {# devices. They re-apply kiosk at the next check-in.}}',
  },
  kioskChangeUnknown: {
    id: 'configEditor.bar.kioskChangeUnknown',
    defaultMessage: 'Kiosk settings change on the devices that use this configuration, at their next check-in.',
  },
  notSaved: { id: 'configEditor.bar.notSaved', defaultMessage: 'This configuration is not saved yet.' },
  wipedOnlySentence: {
    id: 'configEditor.bar.wipedOnly',
    defaultMessage: 'Used only by {count, plural, one {# wiped device} other {# wiped devices}}.',
  },
  noDeviceUses: { id: 'configEditor.bar.noDeviceUses', defaultMessage: 'No device uses this configuration yet.' },
  identity: { id: 'configEditor.section.identity', defaultMessage: 'Identity' },
  apps: { id: 'configEditor.section.apps', defaultMessage: 'Apps' },
  appsSub: {
    id: 'configEditor.section.appsSub',
    defaultMessage: 'What gets installed, and which apps the kiosk shows.',
  },
  addApps: { id: 'configEditor.section.addApps', defaultMessage: 'Add apps' },
  failedLibrary: { id: 'configEditor.section.failedLibrary', defaultMessage: 'the app library' },
  failedLibraryDetail: {
    id: 'configEditor.section.failedLibraryDetail',
    defaultMessage: 'Apps can’t be added until it loads.',
  },
  mainAppOff: {
    id: 'configEditor.section.mainAppOff',
    defaultMessage: 'The app the kiosk opens. Turn kiosk mode on to choose one.',
  },
  mainAppMore: {
    id: 'configEditor.section.mainAppMore',
    defaultMessage: 'Only apps set to Install and shown in kiosk can be chosen.',
  },
  permissionsSummary: {
    id: 'configEditor.permissions.summary',
    defaultMessage: 'Permissions · {count, plural, one {# available} other {# available}}',
  },
  permissionsNote: {
    id: 'configEditor.permissions.note',
    defaultMessage: 'Each device applies what its Android and the app support. Default lifts the override.',
  },
  permissionDefault: { id: 'configEditor.permissions.default', defaultMessage: 'Default' },
  permissionGrant: { id: 'configEditor.permissions.grant', defaultMessage: 'Grant' },
  permissionDeny: { id: 'configEditor.permissions.deny', defaultMessage: 'Deny' },
  onDevicesSummary: { id: 'configEditor.apps.onDevicesSummary', defaultMessage: 'What On devices does' },
  onDevicesBody: {
    id: 'configEditor.apps.onDevicesBody',
    defaultMessage:
      '“Do not install” keeps an app listed without installing it. “Remove” takes the app out of this configuration; it is not uninstalled from devices yet.{kiosk, select, true { “Show in kiosk” sets whether an installed app appears in the kiosk launcher.} other {}}',
  },
  sectionKiosk: { id: 'configEditor.section.kiosk', defaultMessage: 'Kiosk' },
  sectionNetwork: { id: 'configEditor.section.network', defaultMessage: 'Network' },
  sectionSecurity: { id: 'configEditor.section.security', defaultMessage: 'Security and restrictions' },
  sectionEnrollment: { id: 'configEditor.section.enrollment', defaultMessage: 'Enrollment' },
  legacyTitle: {
    id: 'configEditor.legacy.title',
    defaultMessage: 'Legacy launcher settings <count>{total}</count>',
  },
  legacySub: {
    id: 'configEditor.legacy.sub',
    defaultMessage: 'Only the Headwind launcher read these.{changed, plural, =0 {} one { # changed.} other { # changed.}}',
  },
  hideSettings: { id: 'configEditor.legacy.hide', defaultMessage: 'Hide settings' },
  showSettings: { id: 'configEditor.legacy.show', defaultMessage: 'Show settings' },
  builtin: { id: 'configEditor.badge.builtin', defaultMessage: 'Built-in' },
  kiosk: { id: 'configEditor.badge.kiosk', defaultMessage: 'Kiosk' },
  builtinNote: {
    id: 'configEditor.page.builtinNote',
    defaultMessage: 'A built-in template is view only. Duplicate it to make your own editable copy.',
  },
  failedAssigned: { id: 'configEditor.page.failedAssigned', defaultMessage: 'this configuration’s assigned apps' },
  failedAssignedDetail: {
    id: 'configEditor.page.failedAssignedDetail',
    defaultMessage: 'Saving is off until they load, so the app list isn’t wiped.',
  },
  sections: { id: 'configEditor.page.sections', defaultMessage: 'Sections' },
  unsavedNotCopied: {
    id: 'configEditor.page.unsavedNotCopied',
    defaultMessage: 'Unsaved changes on this page are not copied.',
  },
}));

import { AppPickerModal, CopyConfigModal, DeleteConfigModal, KioskConfirmModal, configModalMessages } from './configurations/modals';
import { devicesBlockingDelete, syncMessages, usedByState, wipedOnly } from './configurations/sync';
import { WATCH_MS, type ConfigWatch } from './configurations/watch';
import './ConfigEditorPage.css';
import { apiErrorText } from '../api/apiErrorText';

/** Configuration editor; `:id` is a configuration id or "new" (optionally `?from=<id>`). */
export function ConfigEditorPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  // A new configuration, blank or from a template, needs add_config (ext/core/access.ts), as its save does. Without
  // it, /new says so, as a page the role cannot use does, instead of an editor whose save the server refuses.
  const canAdd = usePermission(CORE_ACTION_ACCESS.addConfig);
  if (id === 'new' && !canAdd) return <NoAccess />;
  const from = id === 'new' ? params.get('from') : null;
  // A new key per target: /new → /new?from=2 keeps the pathname, so the editor must remount by hand.
  return <EditorLoader key={`${id}|${from ?? ''}`} id={id} from={from} />;
}

type Loaded =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'missing'; template: boolean }
  | { kind: 'ready'; initial: Configuration; base: Configuration | null };

/** The app library for the picker and the main-app choices: loading, failed (with Retry), or the apps. */
type Library = Application[] | 'loading' | 'error';

/** A configuration id from the URL: digits only (Number() would also take "1e1", "0x2" or " 2"). */
const parseId = (s: string | null): number | null => (s != null && /^\d{1,9}$/.test(s) ? Number(s) : null);

function EditorLoader({ id, from }: { id: string; from: string | null }) {
  const intl = useIntl();
  const isNew = id === 'new';
  const [state, setState] = useState<Loaded>({ kind: 'loading' });
  const [library, setLibrary] = useState<Library>('loading');
  const [libraryAttempt, setLibraryAttempt] = useState(0);
  const [sync, setSync] = useState<ConfigSyncSummary[] | null>(null);
  const [syncFailed, setSyncFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!location.hash) window.scrollTo(0, 0);
    getSyncSummary().then(setSync, () => setSyncFailed(true));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLibrary('loading');
    listApplications()
      .then((a) => !cancelled && setLibrary(a.filter((x) => (x.type ?? 'app') !== 'web')))
      .catch(() => !cancelled && setLibrary('error'));
    return () => {
      cancelled = true;
    };
  }, [libraryAttempt]);

  useEffect(() => {
    let cancelled = false;
    const wanted = isNew ? from : id;
    if (isNew && !wanted) {
      setState({ kind: 'ready', initial: cloneForNew(null), base: null });
      return;
    }
    const num = parseId(wanted);
    if (num == null) {
      setState({ kind: 'missing', template: isNew });
      return;
    }
    setState({ kind: 'loading' });
    // The full configuration (GET /configurations/{id}): the list endpoint's rows lack `files`,
    // `applicationSettings` and `applicationUsageParameters`, and a save (PUT) replaces those lists with whatever it
    // carries, so editing from a list row would delete them. The assigned apps load separately (Editor).
    getConfiguration(num)
      .then((c) => {
        if (cancelled) return;
        if (!c || c.id !== num) setState({ kind: 'missing', template: isNew });
        else setState({ kind: 'ready', initial: isNew ? cloneForNew(c) : c, base: isNew ? c : null });
      })
      .catch((e) => {
        if (cancelled) return;
        // The server answers an id that does not exist, or one this user may not open, with "permission denied".
        const denied = e instanceof ApiError && e.message === 'error.permission.denied';
        setState(denied ? { kind: 'missing', template: isNew } : { kind: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [id, from, isNew, attempt]);

  const crumbs = (label: string) => (
    <Breadcrumb items={[{ label: intl.formatMessage(messages.crumbConfigurations), to: paths.configurations }, { label }]} />
  );

  if (state.kind !== 'ready') {
    const title = intl.formatMessage(isNew ? messages.newTitle : messages.title);
    return (
      <>
        <PageHeader title={title} breadcrumb={crumbs(title)} />
        {state.kind === 'loading' ? (
          <Card aria-busy="true">
            <SkeletonFacts count={6} label={intl.formatMessage(messages.loading)} />
          </Card>
        ) : state.kind === 'error' ? (
          <ErrorState thing={intl.formatMessage(messages.failedThis)} onRetry={() => setAttempt((n) => n + 1)} />
        ) : (
          <Card>
            <EmptyState
              icon={<IconConfigurations />}
              title={intl.formatMessage(state.template ? messages.templateMissing : messages.configMissing)}
              action={
                <ButtonLink to={paths.configurations}>
                  {intl.formatMessage(messages.allConfigurations)}
                </ButtonLink>
              }
            >
              {intl.formatMessage(state.template ? messages.templateMissingBody : messages.configMissingBody)}
            </EmptyState>
          </Card>
        )}
      </>
    );
  }

  const configId = isNew ? null : (state.initial.id ?? null);
  const syncRow = configId != null ? sync?.find((r) => r.configurationId === configId) : undefined;
  return (
    <Editor
      initial={state.initial}
      base={state.base}
      library={library}
      onRetryLibrary={() => setLibraryAttempt((n) => n + 1)}
      syncRow={syncRow}
      syncKnown={sync != null && !syncFailed}
      crumbs={crumbs}
    />
  );
}

// ---- section layout ----------------------------------------------------------------------------------------------

type SectionId = 'identity' | 'apps' | 'kiosk' | 'network' | 'security' | 'enrollment' | 'headwind';

const FIELD: Record<string, FieldDef> = Object.fromEntries(CONFIG_FIELDS.map((f) => [f.key, f]));
const LEGACY_KEYS: ReadonlySet<string> = new Set(LEGACY_FIELDS.map((f) => f.key));

/** Which nav section a field's change counts towards. */
function sectionOf(f: FieldDef): SectionId {
  if (LEGACY_KEYS.has(f.key)) return 'headwind';
  switch (f.group) {
    case 'Identity':
      return 'identity';
    case 'Apps':
      return 'apps';
    case 'Kiosk':
    case 'Kiosk appearance':
      return 'kiosk';
    case 'Network':
      return 'network';
    case 'Restrictions':
    case 'Security':
      return 'security';
    case 'Enrollment':
      return 'enrollment';
    default:
      return 'headwind';
  }
}

type Item = { eyebrow: MessageDescriptor; help?: MessageDescriptor; kiosk?: boolean } | string;

/** Field order and sub-groups; every primary field not listed falls through to the end of its section. */
const LAYOUT: Record<'kiosk' | 'network' | 'security' | 'enrollment', Item[]> = {
  kiosk: [
    'kioskMode',
    { eyebrow: messages.buttonsAndScreens, kiosk: true },
    'kioskHome',
    'kioskRecents',
    'kioskNotifications',
    'kioskSystemInfo',
    'kioskKeyguard',
    'kioskLockButtons',
    'kioskLockVolume',
    { eyebrow: messages.leavingKiosk, kiosk: true },
    'kioskExit',
    'password',
    { eyebrow: messages.launcherLook, kiosk: true },
    'backgroundColor',
    'textColor',
    'iconSize',
  ],
  network: ['wifi', 'wifiRadio', 'bluetooth', 'locationServices', 'requestUpdates', 'connectivityMode'],
  security: ['camera', 'usbStorage', 'disableScreenshots', 'disableFactoryReset', 'disableSafeBoot'],
  enrollment: [
    'wifiSSID',
    'wifiPassword',
    'wifiSecurityType',
    'qrWifiHidden',
    { eyebrow: enrollmentMessages.setupScreens, help: enrollmentMessages.setupScreensHelp },
    'qrSkipEducation',
    'qrLocale',
    'qrTimeZone',
    'mobileEnrollment',
    'qrParameters',
  ],
};
for (const [sec, items] of Object.entries(LAYOUT) as Array<[keyof typeof LAYOUT, Item[]]>) {
  const placed = new Set(items.filter((i): i is string => typeof i === 'string'));
  for (const f of PRIMARY_FIELDS) if (sectionOf(f) === sec && !placed.has(f.key)) items.push(f.key);
}

/** Board help where it is clearer and still accurate; otherwise configFields help is used. */
const HELP: Record<string, MessageDescriptor> = {
  kioskMode: messages.helpKioskMode,
  kioskHome: messages.helpKioskHome,
  kioskRecents: messages.helpKioskRecents,
  kioskNotifications: messages.helpKioskNotifications,
};

/** The line under a section's title: its own sentence, then the group's note where it has one. */
function sectionSub(id: 'kiosk' | 'network' | 'security' | 'enrollment', intl: IntlShape): string {
  const note = (g: keyof typeof GROUP_NOTES) => (GROUP_NOTES[g] ? intl.formatMessage(GROUP_NOTES[g]!) : '');
  switch (id) {
    case 'kiosk':
      return intl.formatMessage(messages.subKiosk);
    case 'network':
      return intl.formatMessage(messages.subNetwork, { note: note('Network') }).trim();
    case 'security':
      return intl.formatMessage(messages.subSecurity, { note: note('Restrictions') }).trim();
    default:
      return note('Enrollment');
  }
}

// ---- change detection ----------------------------------------------------------------------------------------------

const norm = (v: unknown) => (v === undefined ? null : v);

function appsSignature(c: Configuration): string {
  return ((c.applications ?? []) as ConfigApp[])
    .map((a) => `${a.id}:${a.action ?? 1}:${a.showIcon === false ? 0 : 1}:${a.usedVersionId ?? ''}`)
    .sort()
    .join(',');
}

/** Order-free: setting a permission back to what it was is no change, wherever the rule moved in the list. */
function appPermissionsSignature(c: Configuration): string {
  const rules = Array.isArray(c.managedAppPermissions) ? (c.managedAppPermissions as Array<Record<string, unknown>>) : [];
  return rules
    .map((r) => `${String(r?.applicationId)} ${String(r?.permission)} ${String(r?.state)}`)
    .sort()
    .join(',');
}

/** Other entries longer than this leave little room in the enrollment QR code (QR_DENSE_BYTES in all). */
const QR_REST_LONG_BYTES = 600;

/**
 * The Extra QR parameters texts an editor wrote last, with the settings and the typed rest each was written from.
 * Text with no settings that is only setting entries reads back as those settings (splitQrParameters), so while
 * editing, the editor reads back what it wrote and the typed text is never taken apart under the cursor. One per
 * editor; a few entries, so a state updater run twice (StrictMode) still finds the text it started from.
 */
type TypedQr = Map<string, QrParametersSplit>;

function qrSplit(c: Configuration, typed: TypedQr | null): QrParametersSplit {
  const text = c.qrParameters;
  return (typeof text === 'string' && typed?.get(text)) || splitQrParameters(text);
}

/** A setup setting kept in the Extra QR parameters (null when unset, as Android's default). */
function qrSettingOf(c: Configuration, qrKey: string, typed: TypedQr | null): unknown {
  const v = qrSplit(c, typed).settings[qrKey];
  return v == null || v === false || v === '' ? null : v;
}

/** The Extra QR parameters other than the setup settings, as the editor's field shows them. */
function qrRestOf(c: Configuration, typed: TypedQr | null): string {
  return qrSplit(c, typed).rest;
}

/** The Extra QR parameters with one part replaced; back to unset when nothing is left and nothing was stored. */
function withQr(d: Configuration, change: { setting?: [string, unknown]; rest?: string }, typed: TypedQr): unknown {
  const split = qrSplit(d, typed);
  const settings = { ...split.settings };
  if (change.setting) settings[change.setting[0]] = change.setting[1];
  const rest = change.rest ?? split.rest;
  const text = joinQrParameters(settings, rest);
  typed.delete(text);
  typed.set(text, { settings, rest });
  if (typed.size > 4) typed.delete(typed.keys().next().value as string);
  return text === '' && d.qrParameters == null ? null : text;
}

function changedKeys(before: Configuration, after: Configuration, typed: TypedQr | null = null): Set<string> {
  const out = new Set<string>();
  for (const f of CONFIG_FIELDS) {
    // A setting kept in the Extra QR parameters changes when its entry does; the parameters themselves count as
    // changed only for their other entries, so one switch is one change.
    if (f.key === 'qrParameters') {
      if (norm(qrRestOf(before, typed) || null) !== norm(qrRestOf(after, typed) || null)) out.add(f.key);
      continue;
    }
    if (f.qrKey) {
      // Parsed from text: compare values, not identities (an array or object parses anew each time).
      const was = JSON.stringify(qrSettingOf(before, f.qrKey, typed));
      const is = JSON.stringify(qrSettingOf(after, f.qrKey, typed));
      if (was !== is) out.add(f.key);
      continue;
    }
    if (norm(before[f.key]) !== norm(after[f.key])) out.add(f.key);
  }
  // The background image picker is a managed asset control rather than a generic CONFIG_FIELDS control.
  // Its identity must still participate in the editor's dirty state and save/apply flow.
  if (norm(before.backgroundImageFileId) !== norm(after.backgroundImageFileId)
    || norm(after.backgroundImageAction) !== null
    || norm(before.backgroundImageFit) !== norm(after.backgroundImageFit)
    || norm(before.backgroundImageFocalX) !== norm(after.backgroundImageFocalX)
    || norm(before.backgroundImageFocalY) !== norm(after.backgroundImageFocalY)) out.add('backgroundImageFileId');
  if (appsSignature(before) !== appsSignature(after)) out.add('applications');
  if (appPermissionsSignature(before) !== appPermissionsSignature(after)) out.add('managedAppPermissions');
  return out;
}

/** Save-bar sentence for a configuration devices use: agents too old for config.apply never pick a change up. */
function syncMessage(row: ConfigSyncSummary, intl: IntlShape): string {
  const old = Math.min(row.unsupported, row.total);
  if (old === 0) return intl.formatMessage(messages.syncPickUp);
  if (old === row.total) return intl.formatMessage(messages.syncAllOld, { total: row.total });
  return intl.formatMessage(messages.syncSomeOld, { old });
}

const FOCUSABLE = ['input', 'select', 'textarea', 'button'].map((tag) => `${tag}:not(:disabled)`).join(', ');

/** Scroll to the section a save stopped at, and put the cursor in its first field. */
function focusSection(anchor: string) {
  const section = document.getElementById(anchor);
  section?.scrollIntoView?.({ block: 'start' });
  section?.querySelector<HTMLElement>(FOCUSABLE)?.focus({ preventScroll: true });
}

// ---- editor ------------------------------------------------------------------------------------------------------

function Editor({
  initial,
  base,
  library,
  onRetryLibrary,
  syncRow,
  syncKnown,
  crumbs,
}: {
  initial: Configuration;
  /** The template a new configuration copies (`?from=`). */
  base: Configuration | null;
  library: Library;
  onRetryLibrary: () => void;
  syncRow: ConfigSyncSummary | undefined;
  syncKnown: boolean;
  crumbs: (label: string) => ReactNode;
}) {
  const toast = useToast();
  const intl = useIntl();
  const apps = useMemo(() => (Array.isArray(library) ? library : []), [library]);
  const libraryReady = Array.isArray(library);
  const isNew = initial.id == null;
  const readOnly = !isNew && isLocked(initial);
  const [draft, setDraft] = useState<Configuration>(() => ({ ...initial }));
  // The unmodified starting point for change detection. Kept separate from `initial` because the configuration
  // endpoint omits `applications`: once the real assigned apps load, both draft and baseline get them.
  const [baseline, setBaseline] = useState<Configuration>(() => ({ ...initial }));
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmKeys, setConfirmKeys] = useState<string[] | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [copying, setCopying] = useState(false);
  // Duplicate (PUT /configurations/copy) and Delete both need copy_config (ext/core/access.ts).
  const canCopy = usePermission(CORE_ACTION_ACCESS.copyConfig);
  // What the server checks for a save (ConfigurationResource PUT): configurations, and add_config for a new one.
  const mayEdit = usePermission(CORE_PAGE_ACCESS.configurations);
  const mayAdd = usePermission(CORE_ACTION_ACCESS.addConfig);
  const canSave = mayEdit && (!isNew || mayAdd);
  const [nameError, setNameError] = useState<string | null>(null);
  const [advanced, setAdvanced] = useState(false);
  // Discards so far: the apps table files its rows again by their restored state.
  const [discards, setDiscards] = useState(0);
  const nameRef = useRef<HTMLInputElement>(null);
  const [backgroundUploading, setBackgroundUploading] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const mayDeleteFiles = usePermission(CORE_ACTION_ACCESS.uploadFile);
  const ids = useId();

  // The assigned apps: the configuration's own, or the template's for a copy. Until they arrive, saving is blocked
  // (a PUT replaces the whole app set and, with desired state, the kiosk allowlist on every device). A failed fetch
  // does not unblock it (fail closed); Retry instead.
  const appsSource = isNew ? (base?.id ?? null) : (initial.id ?? null);
  const [appsReady, setAppsReady] = useState(appsSource == null);
  const [appsError, setAppsError] = useState(false);
  const [appsAttempt, setAppsAttempt] = useState(0);
  useEffect(() => {
    if (appsSource == null) return;
    let cancelled = false;
    setAppsError(false);
    getConfigurationApps(appsSource)
      .then((assigned) => {
        if (cancelled) return;
        setDraft((d) => ({ ...d, applications: assigned.map((a) => ({ ...a })) }));
        setBaseline((b) => ({ ...b, applications: assigned.map((a) => ({ ...a })) }));
        setAppsReady(true);
      })
      .catch(() => {
        if (!cancelled) setAppsError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [appsSource, appsAttempt]);

  const typedQr = useRef<TypedQr>(new Map());
  const set = useCallback((key: string, value: unknown) => setDraft((d) => {
    const qrKey = FIELD[key]?.qrKey;
    if (qrKey || key === 'qrParameters') {
      const change = qrKey ? { setting: [qrKey, value] as [string, unknown] } : { rest: value == null ? '' : String(value) };
      return { ...d, qrParameters: withQr(d, change, typedQr.current) };
    }
    if (key === 'locationServices') {
      return { ...d, locationServices: value, locationServicesAction: locationServicesAction(value) };
    }
    return { ...d, [key]: value };
  }), []);

  const changed = useMemo(() => changedKeys(baseline, draft, typedQr.current), [baseline, draft]);

  const kioskOn = draft.kioskMode === true;
  const allowed: ConfigApp[] = (draft.applications as ConfigApp[] | undefined) ?? [];
  const allowedIds = useMemo(() => new Set(allowed.map((a) => a.id)), [allowed]);
  // Only an installed app that is shown in kiosk can be the main app.
  const mainAppChoices = apps.filter((a) =>
    allowed.some((x) => x.id === a.id && (x.action ?? 1) === 1 && x.showIcon !== false),
  );

  // The server marks a well-known default PIN; once the PIN is edited here that flag is stale.
  const defaultPin = hasDefaultPin(draft) && (draft.password ?? '') === (baseline.password ?? '');
  const noPin = hasNoPin(draft);
  // A new or changed PIN must follow the rule; one saved before it may stay as it is (a copy is new: it may not).
  const pinProblem = readOnly ? null : exitPinProblem(draft.password, isNew ? null : baseline.password, intl);
  const legacyPin = !pinProblem && hasLegacyPin(draft);

  const deviceCount = isNew ? 0 : affectedDeviceCount(syncRow);
  const kioskKeys = isNew ? [] : kioskAffectingChanges(baseline, draft);

  // ---- sections and their changes ----
  const changedIn = (sec: SectionId) => {
    let n = 0;
    for (const k of changed) {
      if (k === 'applications') n += sec === 'apps' ? 1 : 0;
      else if (k === 'backgroundImageFileId') n += sec === 'kiosk' ? 1 : 0;
      else if (FIELD[k] && sectionOf(FIELD[k]) === sec) n++;
    }
    return readOnly ? 0 : n;
  };
  const kioskChanged = changedIn('kiosk');
  const appsChanged = changedIn('apps');
  const hwChanged = changedIn('headwind');
  const changedLabel = (n: number) => (n > 0 ? intl.formatMessage(messages.changed, { count: n }) : '');
  const coreMeta: Record<CoreConfigSection, ConfigSectionMeta> = {
    identity: { meta: changedLabel(changedIn('identity')) },
    apps: { meta: appsChanged ? changedLabel(appsChanged) : String(allowed.length) },
    kiosk: {
      meta: pinProblem
        ? intl.formatMessage(messages.checkPin)
        : kioskChanged
          ? changedLabel(kioskChanged)
          : defaultPin
            ? intl.formatMessage(messages.defaultPin)
            : noPin
              ? intl.formatMessage(messages.noPin)
              : legacyPin
                ? intl.formatMessage(messages.oldPin)
                : '',
      metaTone: pinProblem ? 'alert' : !kioskChanged && (defaultPin || noPin || legacyPin) ? 'warn' : 'default',
    },
    network: { meta: changedLabel(changedIn('network')) },
    security: { meta: changedLabel(changedIn('security')) },
    enrollment: { meta: changedLabel(changedIn('enrollment')) },
    headwind: { meta: hwChanged ? changedLabel(hwChanged) : String(LEGACY_FIELDS.length) },
  };
  // Extension sections: their namespaces of `extensions`, read only when the template is or the role may not save.
  const host = useConfigSections({ draft, baseline, setDraft, readOnly: readOnly || !canSave, coreMeta, idBase: ids });
  const count = readOnly ? 0 : changed.size + host.count;
  const guard = useLeaveGuard(count > 0, count);

  function addApps(chosen: Application[]) {
    const entries: ConfigApp[] = chosen.map((app) => ({
      id: app.id,
      name: app.name,
      pkg: app.pkg,
      version: app.version,
      // Same version the server would default to; lets the main-app picker resolve it.
      usedVersionId: app.latestVersion,
      action: 1,
      showIcon: true,
      remove: false,
    }));
    set('applications', [...allowed, ...entries]);
  }
  /** Change the assigned apps; a main app that is no longer installed and shown in kiosk is cleared. */
  function updateApps(id: number, next: (assigned: ConfigApp[]) => ConfigApp[]) {
    setDraft((d) => {
      const assigned = (d.applications as ConfigApp[] | undefined) ?? [];
      const target = assigned.find((a) => a.id === id);
      const applications = next(assigned);
      // Permission rules are valid only for applications this configuration installs. Drop them at the same time as
      // the application assignment/action changes, rather than leaving an invisible rule for the server to reject.
      const installed = new Set(applications.filter((app) => (app.action ?? 1) === 1).map((app) => app.id));
      const managedAppPermissions = Array.isArray(d.managedAppPermissions)
        ? d.managedAppPermissions.filter((rule) => !!rule && typeof rule === 'object' && installed.has(Number((rule as Record<string, unknown>).applicationId)))
        : d.managedAppPermissions;
      const after = applications.find((a) => a.id === id);
      const stillMain = after != null && (after.action ?? 1) === 1 && after.showIcon !== false;
      const mainAppId = !stillMain && target?.usedVersionId != null && target.usedVersionId === d.mainAppId ? null : d.mainAppId;
      return { ...d, applications, managedAppPermissions, mainAppId };
    });
  }
  const removeApp = (id: number) => updateApps(id, (list) => list.filter((a) => a.id !== id));
  const setAppAction = (id: number, action: number) =>
    updateApps(id, (list) => list.map((a) => (a.id === id ? { ...a, action } : a)));
  // A hidden app cannot remain the kiosk's pinned main app: updateApps clears the stale selection.
  const setAppKioskVisibility = (id: number, showIcon: boolean) =>
    updateApps(id, (list) => list.map((a) => (a.id === id ? { ...a, showIcon } : a)));
  const setAppPermission = (applicationId: number, permission: string, state: string) => setDraft((d) => {
    const rules = Array.isArray(d.managedAppPermissions) ? d.managedAppPermissions as Array<Record<string, unknown>> : [];
    const without = rules.filter((r) => !(r.applicationId === applicationId && r.permission === permission));
    return { ...d, managedAppPermissions: state === 'default' ? without : [...without, { applicationId, permission, state }] };
  });
  const appPermissionState = (applicationId: number, permission: string): string => {
    const rules = Array.isArray(draft.managedAppPermissions) ? draft.managedAppPermissions as Array<Record<string, unknown>> : [];
    return String(rules.find((r) => r.applicationId === applicationId && r.permission === permission)?.state ?? 'default');
  };

  function requestSave() {
    if (backgroundUploading) {
      toast.push('err', intl.formatMessage(messages.imageStillUploadingTitle), intl.formatMessage(messages.imageStillUploading));
      return;
    }
    if (!String(draft.name ?? '').trim()) {
      setNameError(intl.formatMessage(messages.nameRequired));
      toast.push('err', intl.formatMessage(messages.nameRequiredTitle), intl.formatMessage(messages.nameRequired));
      nameRef.current?.focus();
      return;
    }
    if (!appsReady) {
      toast.push('err', intl.formatMessage(messages.stillLoadingTitle), intl.formatMessage(messages.stillLoading));
      return;
    }
    if (pinProblem) {
      toast.push('err', intl.formatMessage(messages.checkExitPin), pinProblem);
      focusSection('kiosk');
      document.querySelector<HTMLInputElement>(`[aria-labelledby="${ids}-password"]`)?.focus({ preventScroll: true });
      return;
    }
    const invalid = host.validate();
    if (invalid) {
      toast.push('err', intl.formatMessage(messages.fixProblems, { count: invalid.problems }), `${invalid.title}: ${invalid.message}`);
      focusSection(invalid.anchor);
      return;
    }
    // deviceCount null = unknown -> confirm anyway (fail closed); 0 = no device will re-apply.
    if (kioskKeys.length > 0 && deviceCount !== 0) {
      setConfirmKeys(kioskKeys);
      return;
    }
    void doSave();
  }

  async function doSave() {
    if (backgroundUploading) return;
    setBusy(true);
    try {
      // The whole configuration goes back (the server replaces every column and list), with the name as validated.
      // Its `extensions` are the loaded ones, with the namespaces the sections changed on top (saveConfiguration).
      const name = String(draft.name ?? '').trim();
      await saveConfiguration({ ...draft, name, extensions: baseline.extensions }, host.changed);
      toast.push('ok', intl.formatMessage(isNew ? messages.created : messages.saved), name);
      const watch: ConfigWatch | undefined =
        initial.id != null ? { id: initial.id, until: Date.now() + WATCH_MS } : undefined;
      guard.exit(paths.configurations, watch ? { watch } : undefined);
    } catch (e) {
      // A plugin's validator (or core's own checks) refused the sections' data: say why, in the toast and the sections.
      const refused = extensionErrorsOf(e);
      if (refused) {
        host.showServerErrors(refused);
        toast.push('err', intl.formatMessage(messages.saveFailed), refused.map((r) => r.message).join(' '));
        setBusy(false);
        return;
      }
      const msg = apiErrorText(intl, e);
      const dup = /duplicate/i.test(msg);
      const exists = intl.formatMessage(configModalMessages.nameExists);
      if (dup) setNameError(exists);
      toast.push('err', intl.formatMessage(messages.saveFailed), dup ? exists : msg);
      setBusy(false);
    }
  }

  function discard() {
    // Back to the loaded values; the leave guard then drops its extra history entry by itself.
    setDraft(baseline);
    setDiscards((n) => n + 1);
    setNameError(null);
    host.reset();
  }

  // ---- rows ----
  const pinWarn = pinProblem
    ? intl.formatMessage(messages.pinWarnProblem, { problem: pinProblem })
    : defaultPin
    ? intl.formatMessage(readOnly ? messages.pinDefaultTemplate : messages.pinDefault)
    : noPin
      ? intl.formatMessage(readOnly ? messages.pinNoneTemplate : messages.pinNone)
      : legacyPin
        ? intl.formatMessage(messages.pinLegacy)
        : null;

  const row = (key: string, opts: { divider?: boolean } = {}) => {
    const field = FIELD[key];
    if (!field) return null;
    // A setting kept in the Extra QR parameters reads its entry there, and waits while that text can't be read.
    // The setup settings read their entry in the Extra QR parameters, whose own field shows only the other entries.
    const value = field.qrKey ? qrSettingOf(draft, field.qrKey, typedQr.current) : key === 'qrParameters' ? qrRestOf(draft, typedQr.current) : draft[key];
    const stored = field.qrKey ? qrSettingOf(baseline, field.qrKey, typedQr.current) : key === 'qrParameters' ? qrRestOf(baseline, typedQr.current) || null : baseline[key];
    // An entry typed by hand that the list doesn't offer stays selectable as itself.
    const def =
      field.qrKey && field.options && typeof value === 'string' && value && !field.options.some((o) => o.value === value)
        ? { ...field, options: [{ value, label: value }, ...field.options] }
        : field;
    // A PIN that stops the save stays editable with kiosk off, so it can be fixed or cleared without turning kiosk on.
    const off = def.kioskOnly === true && !kioskOn && !(key === 'password' && pinProblem != null);
    const help =
      field.qrKey && !qrSettingValueOk(field.qrKey, value)
        ? intl.formatMessage(qrSettingInvalid, { value: String(value) })
        : intl.formatMessage(HELP[key] ?? def.help);
    let qrNote: { tone: 'alert' | 'warn'; text: string } | null = null;
    if (key === 'qrParameters') {
      const rest = qrRestOf(draft, typedQr.current);
      const parsed = parseExtraQrParameters(rest);
      const dupes = settingsInRest(rest);
      const unused = unusedInRest(rest);
      // What these entries add to the code, not the text typed (entries left out don't count).
      const restBytes = parsed.error ? 0 : qrPayloadBytes(JSON.stringify(extrasInCode(parsed.entries, true)));
      const known = [...QR_EXTRA_TYPES.keys()].filter((k) => !QR_SETTING_KEYS.includes(k)).map((k) => QR_EXTRA_PREFIX + k).join(', ');
      const notes = [
        dupes.length ? intl.formatMessage(qrDuplicates, { keys: dupes.join(', ') }) : null,
        unused.wifi.length ? intl.formatMessage(qrUnused.wifi, { keys: unused.wifi.join(', ') }) : null,
        unused.protected.length ? intl.formatMessage(qrUnused.protected, { keys: unused.protected.join(', ') }) : null,
        unused.unsupported.length
          ? intl.formatMessage(qrUnused.unsupported, { keys: unused.unsupported.join(', '), known })
          : null,
        unused.invalid.length ? intl.formatMessage(qrUnused.invalid, { keys: unused.invalid.join(', ') }) : null,
        restBytes > QR_REST_LONG_BYTES ? intl.formatMessage(qrLong, { bytes: restBytes }) : null,
      ].filter((x): x is string => !!x);
      if (parsed.error) qrNote = { tone: 'alert', text: intl.formatMessage(qrInvalid) };
      else if (notes.length) qrNote = { tone: 'warn', text: notes.join(' ') };
    }
    // The PIN callout asks for a new PIN, which a disabled row (kiosk off) cannot take; the nav still flags it.
    const showPinWarn = key === 'password' && pinWarn != null && (readOnly || !off);
    return (
      <FieldRow
        key={key}
        id={`${ids}-${key}`}
        label={intl.formatMessage(def.label)}
        help={<FieldHelp text={help} more={def.more ? intl.formatMessage(def.more) : undefined} />}
        adornment={
          def.agent || (changed.has(key) && !readOnly) ? (
            <>
              {def.agent ? <AgentTag version={def.agent} /> : null}
              {changed.has(key) && !readOnly ? <ChangedChip /> : null}
            </>
          ) : undefined
        }
        disabled={off}
        divider={opts.divider}
        className={def.type === 'textarea' ? 'v2-cfged-row--wide' : undefined}
        below={
          showPinWarn ? (
            <Callout tone={pinProblem ? 'alert' : 'warn'} icon={<IconWarning size={16} />}>
              {pinWarn}
            </Callout>
          ) : qrNote ? (
            <Callout tone={qrNote.tone} icon={<IconWarning size={16} />}>
              {qrNote.text}
            </Callout>
          ) : undefined
        }
      >
        {({ labelId, helpId }) => (
          <FieldControl
            def={def}
            value={value}
            stored={stored}
            onChange={(v) => set(key, v)}
            disabled={readOnly}
            labelId={labelId}
            helpId={helpId}
            apps={apps}
            assigned={allowed}
            tone={showPinWarn ? (pinProblem ? 'invalid' : 'warn') : undefined}
          />
        )}
      </FieldRow>
    );
  };

  async function uploadBackgroundImage(picked: File) {
    const typeProblem = kioskImageProblem({ type: picked.type, size: 0 }, intl);
    if (typeProblem) {
      toast.push('err', intl.formatMessage(messages.imageNotUsed), typeProblem);
      return;
    }
    setBackgroundUploading(true);
    try {
      // At most 3840 px along its long edge (drawn upright when scaled); the server removes the metadata.
      let file: File;
      try {
        file = (await normalizeKioskImage(picked, undefined, intl)).file;
      } catch (e) {
        toast.push('err', intl.formatMessage(messages.imageNotUsed), apiErrorText(intl, e) || intl.formatMessage(messages.imageUnreadable));
        return;
      }
      const problem = kioskImageProblem(file, intl);
      if (problem) {
        toast.push('err', intl.formatMessage(messages.imageNotUsed), problem);
        return;
      }
      // Hosted under a name from its content: an edited image with the same file name doesn't clash with the old one.
      const name = kioskImageUploadName(file.name, await kioskImageContentId(file));
      const temporary = await uploadRawFile(new File([file], name, { type: file.type }));
      const saved = await commitUpload(temporary.serverPath);
      if (saved.id == null) throw new Error(intl.formatMessage(messages.imageNoIdentity));
      // URL and checksum are server-canonicalized on save. Clearing the old values avoids a stale preview payload.
      // Another image: its own focal point starts at the centre (Fill or Fit stays as chosen).
      setDraft((d) => ({
        ...d,
        backgroundImageAction: 'replace',
        backgroundImageFileId: saved.id,
        backgroundImageUrl: undefined,
        backgroundImageSha256: undefined,
        backgroundImageFocalX: 0.5,
        backgroundImageFocalY: 0.5,
      }));
      toast.push('ok', intl.formatMessage(messages.imageUploaded), intl.formatMessage(messages.imageUploadedBody));
    } catch (e) {
      toast.push('err', intl.formatMessage(messages.imageUploadFailed), kioskImageErrorText(e, intl));
    } finally {
      setBackgroundUploading(false);
    }
  }

  const backgroundFileId = draft.backgroundImageFileId as number | null | undefined;
  const backgroundInfo = useKioskBackgroundInfo(kioskOn ? backgroundFileId : null);
  // The preview's apps are the device's: the kiosk this draft sends (configuredKiosk, as config.apply builds it), so the
  // main app first, then by package, each package once, all of them; a single-app kiosk pins its app instead of a grid.
  const draftKiosk = useMemo(() => (kioskOn ? configuredKiosk(draft as Configuration, allowed) : null), [kioskOn, draft, allowed]);
  const kioskAppNames = useMemo(() => draftKiosk?.apps.map((a) => a.name) ?? [], [draftKiosk]);
  const pinnedApp = draftKiosk?.payload.mode === 'single' ? (draftKiosk.apps[0]?.name ?? draftKiosk.payload.pinPackage) : undefined;

  const imageFitMode: FitMode = draft.backgroundImageFit === 'fit' ? 'fit' : 'fill';
  const focalX = typeof draft.backgroundImageFocalX === 'number' ? draft.backgroundImageFocalX : 0.5;
  const focalY = typeof draft.backgroundImageFocalY === 'number' ? draft.backgroundImageFocalY : 0.5;
  const imageFocal = useMemo(() => ({ x: focalX, y: focalY }), [focalX, focalY]);

  const backgroundImageRow = kioskOn ? (
    <FieldRow
      id={`${ids}-backgroundImage`}
      label={intl.formatMessage(messages.backgroundImage)}
      help={<FieldHelp text={intl.formatMessage(messages.backgroundImageHelp)} more={intl.formatMessage(messages.backgroundImageMore)} />}
      adornment={
        <>
          <AgentTag version={KIOSK_IMAGE_AGENT} />
          {changed.has('backgroundImageFileId') && !readOnly ? <ChangedChip /> : null}
        </>
      }
      disabled={readOnly}
      below={backgroundInfo.info ? (
        <div className="v2-cfged-kbg">
          <KioskPlacement
            src={hostedPath(backgroundInfo.info.url)}
            width={backgroundInfo.info.width}
            height={backgroundInfo.info.height}
            fit={imageFitMode}
            focal={imageFocal}
            disabled={readOnly}
            onFit={(v) => setDraft((d) => ({ ...d, backgroundImageFit: v }))}
            onFocal={(f) => setDraft((d) => ({ ...d, backgroundImageFocalX: f.x, backgroundImageFocalY: f.y }))}
          />
          <KioskBackgroundPreview
            src={hostedPath(backgroundInfo.info.url)}
            width={backgroundInfo.info.width}
            height={backgroundInfo.info.height}
            colours={kioskColours(draft.backgroundColor as string | undefined, draft.textColor as string | undefined)}
            appNames={kioskAppNames}
            pinned={pinnedApp}
            exitVisible={draft.kioskExit === true}
            iconSize={draft.iconSize as string | undefined}
            fit={imageFitMode}
            focal={imageFocal}
          />
        </div>
      ) : undefined}
    >
      {({ labelId }) => (
        <KioskBackgroundField
          fileId={backgroundFileId}
          info={backgroundInfo.info}
          error={backgroundInfo.error}
          legacyUrl={draft.backgroundImageUrl as string | undefined}
          readOnly={readOnly}
          uploading={backgroundUploading}
          onFile={(file) => void uploadBackgroundImage(file)}
          onRemove={() => setDraft((d) => ({
            ...d,
            backgroundImageAction: 'remove',
            backgroundImageFileId: null,
            backgroundImageUrl: undefined,
            backgroundImageSha256: undefined,
          }))}
          onBrowse={() => setGalleryOpen(true)}
          labelId={labelId}
        />
      )}
    </FieldRow>
  ) : null;
  const gallery = kioskOn ? (
    <KioskGallery
      open={galleryOpen}
      onClose={() => setGalleryOpen(false)}
      currentFileId={backgroundFileId}
      canDelete={mayDeleteFiles}
      onChoose={(item) => {
        setDraft((d) => ({
          ...d,
          backgroundImageAction: 'replace',
          backgroundImageFileId: item.fileId,
          backgroundImageUrl: undefined,
          backgroundImageSha256: undefined,
          backgroundImageFocalX: item.fileId === backgroundFileId ? d.backgroundImageFocalX : 0.5,
          backgroundImageFocalY: item.fileId === backgroundFileId ? d.backgroundImageFocalY : 0.5,
        }));
        setGalleryOpen(false);
        toast.push('ok', intl.formatMessage(messages.imageChosen), intl.formatMessage(messages.imageChosenBody, { name: item.name }));
      }}
    />
  ) : null;

  const renderItems = (items: Item[]) =>
    items.map((it) => {
      if (typeof it === 'string') return row(it);
      const text = (m: MessageDescriptor | undefined) => (m == null ? m : intl.formatMessage(m));
      const help = it.kiosk ? intl.formatMessage(kioskOn ? messages.onlyInKiosk : messages.turnOnKiosk) : text(it.help);
      const eyebrow = text(it.eyebrow);
      return (
        <div key={eyebrow} className="v2-cfged-eyebrow">
          <Eyebrow as="h3" help={help}>
            {eyebrow}
          </Eyebrow>
        </div>
      );
    });

  const section = (id: 'kiosk' | 'network' | 'security' | 'enrollment', title: string) => (
    <Card as="section" id={id} padding="rows" aria-labelledby={`${ids}-${id}-h`}>
      <CardHeader titleId={`${ids}-${id}-h`} title={title} subtitle={sectionSub(id, intl)} spacing={12} />
      {renderItems(LAYOUT[id])}
      {id === 'kiosk' ? backgroundImageRow : null}
      {id === 'kiosk' ? gallery : null}
    </Card>
  );

  const legacyGroups = GROUP_ORDER.map((g) => ({ group: g, fields: LEGACY_FIELDS.filter((f) => f.group === g) })).filter(
    (x) => x.fields.length > 0,
  );

  // ---- header ----
  const savedName = isNew ? intl.formatMessage(messages.newTitle) : String(baseline.name ?? '');
  const usedBy = usedByState(syncRow);
  let subtitle: ReactNode = null;
  if (isNew) subtitle = base ? intl.formatMessage(messages.basedOn, { name: String(base.name) }) : intl.formatMessage(messages.notSavedYet);
  else if (usedBy && initial.id != null)
    subtitle = (
      <FormattedMessage
        {...syncMessages.usedBy}
        values={{
          count: usedBy.count,
          state: usedBy.state,
          inSync: usedBy.inSync,
          link: (chunks) => (
            <Link to={`${paths.devices}?config=${initial.id}`} className="v2-cfged-devlink">
              {chunks}
            </Link>
          ),
        }}
      />
    );
  else if (wipedOnly(syncRow) > 0 && initial.id != null)
    subtitle = (
      <FormattedMessage
        {...syncMessages.usedByWipedLink}
        values={{
          count: wipedOnly(syncRow),
          link: (chunks) => (
            <Link to={`${paths.devices}?status=wiped&config=${initial.id}`} className="v2-cfged-devlink">
              {chunks}
            </Link>
          ),
        }}
      />
    );
  else if (syncKnown) subtitle = intl.formatMessage(messages.notUsedYet);

  // Duplicate = the server copy (PUT /configurations/copy), the same path as the list's Duplicate: it copies every
  // setting, the apps, configuration files and app settings of the saved configuration.
  const actions = isNew ? (
    <Button size="lg" variant="primary" onClick={requestSave} disabled={busy || !appsReady || backgroundUploading}>
      {intl.formatMessage(busy ? messages.creating : messages.create)}
    </Button>
  ) : !canCopy ? null : readOnly ? (
    <Button size="lg" variant="primary" icon={<IconCopy />} onClick={() => setCopying(true)}>
      {intl.formatMessage(messages.duplicateToEdit)}
    </Button>
  ) : (
    <>
      <Button icon={<IconCopy />} onClick={() => setCopying(true)}>
        {intl.formatMessage(messages.duplicate)}
      </Button>
      <Button variant="danger" icon={<IconTrash />} onClick={() => setDeleting(true)}>
        {intl.formatMessage(messages.delete)}
      </Button>
    </>
  );

  // ---- save bar sentence ----
  let message: ReactNode;
  if (appsError && !appsReady) message = intl.formatMessage(messages.saveOffLoading);
  else if (!appsReady) message = intl.formatMessage(messages.loadingApps);
  else if (kioskKeys.length > 0 && deviceCount != null && deviceCount > 0)
    message = intl.formatMessage(messages.kioskChangeDevices, { count: deviceCount });
  else if (kioskKeys.length > 0 && deviceCount == null) message = intl.formatMessage(messages.kioskChangeUnknown);
  else if (isNew) message = intl.formatMessage(messages.notSaved);
  else if (syncRow && syncRow.total > 0) message = syncMessage(syncRow, intl);
  else if (wipedOnly(syncRow) > 0) message = intl.formatMessage(messages.wipedOnlySentence, { count: wipedOnly(syncRow) });
  else if (syncKnown) message = intl.formatMessage(messages.noDeviceUses);

  // ---- sections ----
  // Core's cards, which its contributions render among the extensions' sections (ext/core/config.tsx).
  const coreParts: Record<CoreConfigSection, ReactNode> = {
    identity: (
      <Card as="section" id="identity" aria-labelledby={`${ids}-identity-h`} gap={14}>
        <h2 id={`${ids}-identity-h`} className="v2-cfged-h2">
          {intl.formatMessage(messages.identity)}
        </h2>
        <div className="v2-cfged-identity">
          <Field
            label={
              <span className="v2-cfged-labelline">
                {intl.formatMessage(FIELD.name.label)}
                {changed.has('name') && !readOnly ? <ChangedChip /> : null}
              </span>
            }
            error={nameError}
          >
            <Input
              ref={nameRef}
              value={draft.name == null ? '' : String(draft.name)}
              disabled={readOnly}
              required
              onChange={(e) => {
                set('name', e.target.value);
                if (nameError) setNameError(null);
              }}
            />
          </Field>
          <Field
            label={
              <span className="v2-cfged-labelline">
                {intl.formatMessage(FIELD.description.label)}
                {changed.has('description') && !readOnly ? <ChangedChip /> : null}
              </span>
            }
          >
            <Textarea
              rows={3}
              value={draft.description == null ? '' : String(draft.description)}
              disabled={readOnly}
              onChange={(e) =>
                set('description', e.target.value === '' && baseline.description == null ? baseline.description : e.target.value)
              }
            />
          </Field>
        </div>
      </Card>
    ),
    apps: (
      <Card as="section" id="apps" padding="rows" aria-labelledby={`${ids}-apps-h`}>
        <CardHeader
          titleId={`${ids}-apps-h`}
          title={intl.formatMessage(messages.apps)}
          subtitle={intl.formatMessage(messages.appsSub)}
          spacing={12}
          actions={
            readOnly ? undefined : (
              <Button size="sm" icon={<IconPlus />} onClick={() => setPickerOpen(true)} disabled={!appsReady || !libraryReady}>
                {intl.formatMessage(messages.addApps)}
              </Button>
            )
          }
        />
        {library === 'error' ? (
          <div className="v2-cfged-libnote">
            <ErrorState
              thing={intl.formatMessage(messages.failedLibrary)}
              detail={intl.formatMessage(messages.failedLibraryDetail)}
              onRetry={onRetryLibrary}
            />
          </div>
        ) : null}
        <FieldRow
          id={`${ids}-mainAppId`}
          label={intl.formatMessage(FIELD.mainAppId.label)}
          help={
            <FieldHelp
              text={intl.formatMessage(kioskOn ? FIELD.mainAppId.help : messages.mainAppOff)}
              more={kioskOn ? intl.formatMessage(messages.mainAppMore) : undefined}
            />
          }
          adornment={changed.has('mainAppId') && !readOnly ? <ChangedChip /> : undefined}
          disabled={!kioskOn}
          className="v2-cfged-mainrow"
        >
          {({ labelId, helpId }) => (
            <AppSelect
              aria-labelledby={labelId}
              aria-describedby={helpId}
              value={draft.mainAppId}
              apps={mainAppChoices}
              assigned={allowed}
              disabled={readOnly}
              onChange={(v) => set('mainAppId', v)}
            />
          )}
        </FieldRow>
        <AssignedApps
          apps={allowed}
          ready={appsReady}
          error={appsError}
          readOnly={readOnly}
          kioskColumn={kioskOn}
          onAction={setAppAction}
          onKioskVisibility={setAppKioskVisibility}
          onRemove={removeApp}
          resetKey={discards}
          renderAppDetails={(app) => {
            if ((app.action ?? 1) !== 1) return null;
            const configured = (Array.isArray(draft.managedAppPermissions) ? draft.managedAppPermissions : [])
              .filter((rule): rule is Record<string, unknown> => !!rule && typeof rule === 'object')
              .filter((rule) => rule.applicationId === app.id && typeof rule.permission === 'string')
              .map((rule) => String(rule.permission));
            const permissions = manageableAppPermissions(app.requestedPermissions, configured);
            if (permissions.length === 0) return null;
            return (
              <details className="v2-cfged-permission-app">
                <summary>{intl.formatMessage(messages.permissionsSummary, { count: permissions.length })}</summary>
                <p>{intl.formatMessage(messages.permissionsNote)}</p>
                {permissions.map((permission) => (
                  <label className="v2-cfged-permission-app__row" key={permission}>
                    <span>{managedAppPermissionLabel(permission, intl)}</span>
                    {/* The shared Select: the 3:1 input border every select has (componentEdges.test.ts). */}
                    <Select size="sm" aria-label={managedAppPermissionLabel(permission, intl)} value={appPermissionState(app.id, permission)} disabled={readOnly} onChange={(e) => setAppPermission(app.id, permission, e.target.value)}>
                      <option value="default">{intl.formatMessage(messages.permissionDefault)}</option><option value="grant">{intl.formatMessage(messages.permissionGrant)}</option><option value="deny">{intl.formatMessage(messages.permissionDeny)}</option>
                    </Select>
                  </label>
                ))}
              </details>
            );
          }}
        />
        <details className="v2-cfged-apps__note">
          <summary>{intl.formatMessage(messages.onDevicesSummary)}</summary>
          <p>{intl.formatMessage(messages.onDevicesBody, { kiosk: String(kioskOn) })}</p>
        </details>
      </Card>
    ),
    kiosk: section('kiosk', intl.formatMessage(messages.sectionKiosk)),
    network: section('network', intl.formatMessage(messages.sectionNetwork)),
    security: section('security', intl.formatMessage(messages.sectionSecurity)),
    enrollment: section('enrollment', intl.formatMessage(messages.sectionEnrollment)),
    headwind: (
      <Card as="section" id="headwind" tone="dashed" padding="none" className="v2-cfged-hw" aria-labelledby={`${ids}-hw-h`}>
        <div className="v2-cfged-hw__head">
          <div className="v2-cfged-hw__text">
            <h2 id={`${ids}-hw-h`} className="v2-cfged-h2">
              <FormattedMessage
                {...messages.legacyTitle}
                values={{
                  total: LEGACY_FIELDS.length,
                  count: (chunks) => <span className="v2-cfged-hw__count v2-num">{chunks}</span>,
                }}
              />
            </h2>
            <span className="v2-cfged-hw__sub">{intl.formatMessage(messages.legacySub, { changed: hwChanged })}</span>
          </div>
          <Button
            size="sm"
            aria-expanded={advanced}
            aria-controls={`${ids}-hw-body`}
            iconEnd={<IconChevronDown className={advanced ? 'v2-cfged-chev is-open' : 'v2-cfged-chev'} />}
            onClick={() => setAdvanced((v) => !v)}
          >
            {intl.formatMessage(advanced ? messages.hideSettings : messages.showSettings)}
          </Button>
        </div>
        {advanced ? (
          <div id={`${ids}-hw-body`} className="v2-cfged-hw__body">
            <p className="v2-cfged-hw__note">{intl.formatMessage(messages.legacyNote)}</p>
            {legacyGroups.map(({ group, fields }) => (
              <div key={group} className="v2-cfged-hw__group">
                <div className="v2-cfged-eyebrow">
                  <Eyebrow as="h3">{intl.formatMessage(GROUP_LABELS[group])}</Eyebrow>
                </div>
                {fields.map((f) => row(f.key))}
              </div>
            ))}
          </div>
        ) : null}
      </Card>
    ),
  };

  return (
    <>
      <PageHeader
        title={savedName}
        docTitle={savedName}
        breadcrumb={crumbs(savedName)}
        titleAdornment={
          readOnly || baseline.kioskMode === true ? (
            <span className="v2-cfged-tags">
              {readOnly ? (
                <Badge tone="neutral" size="md" icon={<IconLockSmall />}>
                  {intl.formatMessage(messages.builtin)}
                </Badge>
              ) : null}
              {baseline.kioskMode === true ? <Badge size="md">{intl.formatMessage(messages.kiosk)}</Badge> : null}
            </span>
          ) : undefined
        }
        subtitle={subtitle}
        actions={actions}
        actionsGap={8}
      />

      {readOnly ? (
        <Callout tone="info" icon={<IconInfo size={16} />}>
          {intl.formatMessage(messages.builtinNote)}
        </Callout>
      ) : null}

      {appsError && !appsReady ? (
        <ErrorState
          thing={intl.formatMessage(messages.failedAssigned)}
          detail={intl.formatMessage(messages.failedAssignedDetail)}
          onRetry={() => setAppsAttempt((n) => n + 1)}
        />
      ) : null}

      <SectionLayout nav={<SectionNav aria-label={intl.formatMessage(messages.sections)} items={host.nav} />}>
        <CoreConfigProvider parts={coreParts}>{host.sections}</CoreConfigProvider>

        {readOnly ? null : (
          <StickySaveBar
            count={count}
            message={message}
            onDiscard={discard}
            onSave={requestSave}
            saveLabel={intl.formatMessage(isNew ? messages.create : messages.saveAndApply)}
            busy={busy}
            busyLabel={intl.formatMessage(isNew ? messages.creating : messages.saving)}
            saveDisabled={!appsReady || backgroundUploading}
          />
        )}
      </SectionLayout>

      <AppPickerModal
        open={pickerOpen}
        apps={apps}
        excludeIds={allowedIds}
        onAdd={addApps}
        onClose={() => setPickerOpen(false)}
      />
      <KioskConfirmModal
        keys={confirmKeys}
        count={deviceCount}
        saveDisabled={backgroundUploading}
        onCancel={() => setConfirmKeys(null)}
        onConfirm={() => {
          if (backgroundUploading) return;
          setConfirmKeys(null);
          void doSave();
        }}
      />
      <CopyConfigModal
        source={copying ? initial : null}
        note={count > 0 ? intl.formatMessage(messages.unsavedNotCopied) : undefined}
        onClose={() => setCopying(false)}
        onDone={(_name, copyId) => {
          setCopying(false);
          // Open the copy; unsaved edits here still get the leave prompt.
          guard.navigate(copyId != null ? paths.configuration(copyId) : paths.configurations);
        }}
      />
      <DeleteConfigModal
        target={deleting ? initial : null}
        deviceCount={devicesBlockingDelete(syncRow)}
        wipedCount={syncRow?.wiped}
        onClose={() => setDeleting(false)}
        onDeleted={() => {
          setDeleting(false);
          guard.exit(paths.configurations);
        }}
      />
      {guard.dialog}
    </>
  );
}
