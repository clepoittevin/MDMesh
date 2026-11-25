import { useEffect, useState } from 'react';
import { defineMessages, FormattedMessage, useIntl, type IntlShape, type MessageDescriptor } from 'react-intl';
import { Link } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import type { AuthUser } from '../api/auth';
import { API_BASE } from '../api/client';
import { listConfigurations, type ConfigurationSummary } from '../api/configurations';
import type { UpdateStatus } from '../api/updates';
import { getManagementCapabilities, managementError, type ManagementCapabilities } from '../api/users';
import { useTheme, type ThemePreference } from '../ui/theme';
import { roleName } from '../data/seededRoles';
import { CATALOGS, LANGUAGE_NAMES, SOURCE_LOCALE, storeLocale, storedLocale } from '../i18n/locales';
import { paths } from '../routes';
import {
  Button,
  Card,
  CardHeader,
  ErrorState,
  KeyValueList,
  PageHeader,
  SectionLayout,
  SectionNav,
  Segmented,
  Select,
  LinkButton,
} from '../ui';
import { ChangePasswordModal } from './settings/ChangePasswordModal';
import { UsersSection } from './settings/UsersSection';
import { useSupervisor } from '../data/useSupervisor';
import { updatesNavMeta } from '../data/updateStatus';
import { CORE_ACTION_ACCESS } from '../ext/core/access';
import { CORE_SETTINGS, CoreSettingsProvider } from '../ext/core/settings';
import { useSettingsSections, type SectionMeta } from '../ext/hosts/SettingsSections';
import { usePermission } from '../ext/permissions';
import { rolloutActive, useActiveRollout, useConnection, type Connection } from './settings/hooks';
import { RolloutSection } from './settings/RolloutSection';
import { UpdatesSection } from './settings/UpdatesSection';
import { useWhatsNew } from '../whatsnew/WhatsNew';
import './SettingsPage.css';

/** Section ids, also the anchors other pages link to (ext/core/settings.tsx). */
const S = CORE_SETTINGS;

/** Per-browser default enrollment configuration (read by Enroll). The server keeps no default. */
const DEFAULT_CONFIG_KEY = 'mdmesh-default-config';
/** Build-time console version (Docker images set it; source and dev builds don't). */
const CONSOLE_VERSION = (import.meta.env.VITE_APP_VERSION as string | undefined) || null;

const messages = defineMessages<'themeLight' | 'themeDark' | 'themeSystem' | 'versionBoth' | 'versionConsole' | 'checking' | 'unreachable' | 'retry' | 'connected' | 'running' | 'sections' | 'whatsNew' | 'accountTitle' | 'changePassword' | 'signOut' | 'name' | 'login' | 'email' | 'role' | 'usersTitle' | 'usersThing' | 'serverTitle' | 'connection' | 'address' | 'serverAndConsole' | 'installedWith' | 'installSource' | 'installDocker' | 'enrollmentTitle' | 'enrollDevice' | 'defaultConfig' | 'loadFailed' | 'noConfigs' | 'preselected' | 'noDefault' | 'appearanceTitle' | 'theme' | 'themeHelp' | 'pageTitle' | 'pageSubtitle'>({
  themeLight: { id: 'settings.theme.light', defaultMessage: 'Light' },
  themeDark: { id: 'settings.theme.dark', defaultMessage: 'Dark' },
  themeSystem: { id: 'settings.theme.system', defaultMessage: 'Match system' },
  versionBoth: { id: 'settings.server.versionBoth', defaultMessage: 'server {server} · console {console}' },
  versionConsole: { id: 'settings.server.versionConsole', defaultMessage: 'console {console}' },
  checking: { id: 'settings.server.checking', defaultMessage: 'Checking…' },
  unreachable: { id: 'settings.server.unreachable', defaultMessage: 'Unreachable' },
  retry: { id: 'settings.server.retry', defaultMessage: 'Retry' },
  connected: { id: 'settings.server.connected', defaultMessage: 'Connected · {ms} ms' },
  running: { id: 'settings.rollout.running', defaultMessage: 'Running' },
  sections: { id: 'settings.sections', defaultMessage: 'Settings sections' },
  whatsNew: { id: 'settings.server.whatsNew', defaultMessage: 'What’s new' },
  accountTitle: { id: 'settings.account.title', defaultMessage: 'Account' },
  changePassword: { id: 'settings.account.changePassword', defaultMessage: 'Change password' },
  signOut: { id: 'settings.account.signOut', defaultMessage: 'Sign out' },
  name: { id: 'settings.account.name', defaultMessage: 'Name' },
  login: { id: 'settings.account.login', defaultMessage: 'Login' },
  email: { id: 'settings.account.email', defaultMessage: 'Email' },
  role: { id: 'settings.account.role', defaultMessage: 'Role' },
  usersTitle: { id: 'settings.section.users', defaultMessage: 'Users & roles' },
  usersThing: { id: 'settings.section.usersThing', defaultMessage: 'users and roles' },
  serverTitle: { id: 'settings.server.title', defaultMessage: 'Server' },
  connection: { id: 'settings.server.connection', defaultMessage: 'Connection' },
  address: { id: 'settings.server.address', defaultMessage: 'Address' },
  serverAndConsole: { id: 'settings.server.serverAndConsole', defaultMessage: 'Server and console' },
  installedWith: { id: 'settings.server.installedWith', defaultMessage: 'Installed with' },
  installSource: {
    id: 'settings.server.installSource',
    defaultMessage: 'Source or native installer, updated from the shell',
  },
  installDocker: { id: 'settings.server.installDocker', defaultMessage: 'Docker, can update itself' },
  enrollmentTitle: { id: 'settings.enrollment.title', defaultMessage: 'Enrollment' },
  enrollDevice: { id: 'settings.enrollment.enrollDevice', defaultMessage: 'Enroll a device' },
  defaultConfig: { id: 'settings.enrollment.defaultConfig', defaultMessage: 'Default configuration' },
  loadFailed: {
    id: 'settings.enrollment.loadFailed',
    defaultMessage: 'Couldn’t load configurations. <retry>Retry</retry>',
  },
  noConfigs: {
    id: 'settings.enrollment.noConfigs',
    defaultMessage: 'No configurations yet. Once you create one, it can be the default here.',
  },
  preselected: {
    id: 'settings.enrollment.preselected',
    defaultMessage: 'Pre-selected when you open Enroll. Saved in this browser only.',
  },
  noDefault: { id: 'settings.enrollment.noDefault', defaultMessage: 'No default' },
  appearanceTitle: { id: 'settings.appearance.title', defaultMessage: 'Appearance' },
  theme: { id: 'settings.appearance.theme', defaultMessage: 'Theme' },
  themeHelp: {
    id: 'settings.appearance.themeHelp',
    defaultMessage: 'Match system follows your computer’s light or dark setting.',
  },
  pageTitle: { id: 'settings.page.title', defaultMessage: 'Settings' },
  pageSubtitle: {
    id: 'settings.page.subtitle',
    defaultMessage: 'Your account, the server, updates and console preferences.',
  },
}) as Record<'themeLight' | 'themeDark' | 'themeSystem' | 'versionBoth' | 'versionConsole' | 'checking' | 'unreachable' | 'retry' | 'connected' | 'running' | 'sections' | 'whatsNew' | 'accountTitle' | 'changePassword' | 'signOut' | 'name' | 'login' | 'email' | 'role' | 'usersTitle' | 'usersThing' | 'serverTitle' | 'connection' | 'address' | 'serverAndConsole' | 'installedWith' | 'installSource' | 'installDocker' | 'enrollmentTitle' | 'enrollDevice' | 'defaultConfig' | 'loadFailed' | 'noConfigs' | 'preselected' | 'noDefault' | 'appearanceTitle' | 'theme' | 'themeHelp' | 'pageTitle' | 'pageSubtitle', MessageDescriptor>;

function roleLabel(intl: IntlShape, u: AuthUser | null): string {
  if (!u) return '—';
  if (u.superAdmin || u.userRole?.superAdmin) return intl.formatMessage({ id: 'roles.seeded.superAdmin', defaultMessage: 'Super admin' });
  return u.userRole ? roleName(intl, u.userRole) || '—' : '—';
}

function readDefaultConfig(): string {
  try {
    return localStorage.getItem(DEFAULT_CONFIG_KEY) ?? '';
  } catch {
    return '';
  }
}

/** The address admins use: the API base when it is absolute (split deployments), else this page's origin. */
function serverAddress(): string {
  if (/^https?:\/\//i.test(API_BASE)) {
    try {
      return new URL(API_BASE).origin;
    } catch {
      return API_BASE;
    }
  }
  return window.location.origin;
}

/** "0.3.3" when server and console agree; both when they differ (a console reload pending, or a dev build). */
function versionLine(intl: IntlShape, s: UpdateStatus | null): string | null {
  const server = s?.current || null;
  if (server && CONSOLE_VERSION && CONSOLE_VERSION !== server) {
    return intl.formatMessage(messages.versionBoth, { server, console: CONSOLE_VERSION });
  }
  return server ?? (CONSOLE_VERSION ? intl.formatMessage(messages.versionConsole, { console: CONSOLE_VERSION }) : null);
}

function ConnectionValue({ conn, onRetry }: { conn: Connection; onRetry: () => void }) {
  const intl = useIntl();
  if (conn.state === 'checking') {
    return (
      <span className="v2-settings-conn">
        <span className="v2-settings-conn__dot is-idle" aria-hidden="true" />
        {intl.formatMessage(messages.checking)}
      </span>
    );
  }
  if (conn.state === 'down') {
    return (
      <span className="v2-settings-conn">
        <span className="v2-settings-conn__dot is-alert" aria-hidden="true" />
        {intl.formatMessage(messages.unreachable)}
        <LinkButton onClick={onRetry}>{intl.formatMessage(messages.retry)}</LinkButton>
      </span>
    );
  }
  return (
    <span className="v2-settings-conn">
      <span className="v2-settings-conn__dot is-ok" aria-hidden="true" />
      {intl.formatMessage(messages.connected, { ms: String(conn.ms) })}
    </span>
  );
}

/** Settings. Replaces the classic pages/SettingsPage.tsx + components/RolloutPanel.tsx. */
export function SettingsPage() {
  const { user, signOut } = useAuth();
  const { preference, setPreference } = useTheme();
  const intl = useIntl();
  const themeOptions: ReadonlyArray<{ value: ThemePreference; label: string }> = [
    { value: 'light', label: intl.formatMessage(messages.themeLight) },
    { value: 'dark', label: intl.formatMessage(messages.themeDark) },
    { value: 'system', label: intl.formatMessage(messages.themeSystem) },
  ];
  const languageOptions = [
    { value: '', label: intl.formatMessage({ id: 'settings.language.auto', defaultMessage: 'Browser' }) },
    ...[SOURCE_LOCALE, ...Object.keys(CATALOGS).filter((c) => LANGUAGE_NAMES[c])].map((c) => ({
      value: c,
      label: LANGUAGE_NAMES[c] ?? c,
    })),
  ];
  const storedLanguage = storedLocale();
  const language = storedLanguage && languageOptions.some((o) => o.value === storedLanguage) ? storedLanguage : '';
  const sup = useSupervisor(5 * 60 * 1000);
  const ro = useActiveRollout();
  const { conn, recheck } = useConnection();
  const [pwOpen, setPwOpen] = useState(false);
  const [pwSession, setPwSession] = useState(0);
  const [configs, setConfigs] = useState<ConfigurationSummary[] | null>(null);
  const [configsErr, setConfigsErr] = useState(false);
  const [configsRetry, setConfigsRetry] = useState(0);
  const [defaultConfig, setDefaultConfig] = useState<string>(readDefaultConfig);
  // Enrolling writes to devices (ext/core/access.ts).
  const canEnroll = usePermission(CORE_ACTION_ACCESS.editDevices);
  // Users & roles shows once the server says this account administers users (ext/core/access.ts manageUsers).
  const mayAdminister = usePermission(CORE_ACTION_ACCESS.manageUsers);
  const [management, setManagement] = useState<{
    user: AuthUser;
    capabilities: ManagementCapabilities | null;
    error: string;
  } | null>(null);
  const [managementRetry, setManagementRetry] = useState(0);
  useEffect(() => {
    if (!mayAdminister || !user) return;
    const controller = new AbortController();
    getManagementCapabilities(controller.signal).then(
      (capabilities) => {
        if (!controller.signal.aborted) setManagement({ user, capabilities, error: '' });
      },
      (error) => {
        if (!controller.signal.aborted) setManagement({ user, capabilities: null, error: managementError(intl, error) });
      },
    );
    return () => controller.abort();
  }, [mayAdminister, user, managementRetry, intl]);
  const administration = management?.user === user && mayAdminister ? management : null;
  const showUsers = administration?.capabilities?.users === true || !!administration?.error;

  useEffect(() => {
    let on = true;
    listConfigurations()
      .then((list) => {
        if (on) setConfigs([...list].sort((a, b) => a.name.localeCompare(b.name)));
      })
      .catch(() => {
        if (!on) return;
        setConfigs([]);
        setConfigsErr(true);
      });
    return () => {
      on = false;
    };
  }, [configsRetry]);

  const retryConfigs = () => {
    setConfigs(null);
    setConfigsErr(false);
    setConfigsRetry((r) => r + 1);
  };

  const chooseDefault = (v: string) => {
    setDefaultConfig(v);
    try {
      if (v) localStorage.setItem(DEFAULT_CONFIG_KEY, v);
      else localStorage.removeItem(DEFAULT_CONFIG_KEY);
    } catch {
      /* storage unavailable: the choice lasts for this visit */
    }
  };

  const s = sup.status;
  const updMeta: SectionMeta = updatesNavMeta(s);
  // Core's sections and extensions' come from the registry (ext/core/settings.tsx); the page builds core's bodies.
  const { nav, sections } = useSettingsSections(
    {
      [S.updates]: updMeta,
      [S.agentRollout]: rolloutActive(ro.rollout) ? { meta: intl.formatMessage(messages.running), metaTone: 'warn' } : {},
    },
    showUsers ? [] : [S.users],
  );
  const sideNav = <SectionNav items={nav} aria-label={intl.formatMessage(messages.sections)} />;

  // A stored default whose configuration is gone shows as "No default".
  const known = configs === null || configs.some((c) => String(c.id) === defaultConfig);
  const version = versionLine(intl, s);
  // What's new again, beside the version, when this console has notes for it.
  const whatsNew = useWhatsNew();
  const versionValue = whatsNew?.target ? (
    <span className="v2-settings-ver">
      {version ? <span className="v2-num">{version}</span> : null}
      <LinkButton onClick={whatsNew.open}>{intl.formatMessage(messages.whatsNew)}</LinkButton>
    </span>
  ) : (
    version
  );

  // Core's section bodies, which the contributions in ext/core/settings.tsx pick out.
  const core = {
    account: (
      <Card id={S.account} aria-labelledby={`${S.account}-title`} padding="rows" className="v2-settings-card">
        <CardHeader
          title={intl.formatMessage(messages.accountTitle)}
          titleId={`${S.account}-title`}
          spacing={8}
          actions={
            <>
              <Button
                size="sm"
                onClick={() => {
                  setPwSession((n) => n + 1);
                  setPwOpen(true);
                }}
                disabled={!user}
              >
                {intl.formatMessage(messages.changePassword)}
              </Button>
              <Button size="sm" onClick={() => void signOut()}>
                {intl.formatMessage(messages.signOut)}
              </Button>
            </>
          }
        />
        <KeyValueList
          variant="rows"
          items={[
            { key: 'name', label: intl.formatMessage(messages.name), value: user?.name || user?.login || '—' },
            { key: 'login', label: intl.formatMessage(messages.login), value: user?.login || '—' },
            { key: 'email', label: intl.formatMessage(messages.email), value: user?.email || '—' },
            { key: 'role', label: intl.formatMessage(messages.role), value: roleLabel(intl, user) },
          ]}
        />
      </Card>
    ),
    users: administration?.capabilities?.users ? (
      <UsersSection capabilities={administration.capabilities} anchorId={S.users} headingId={`${S.users}-title`} />
    ) : administration?.error ? (
      <Card id={S.users} aria-labelledby={`${S.users}-title`} gap={12} className="v2-settings-card">
        <CardHeader title={intl.formatMessage(messages.usersTitle)} titleId={`${S.users}-title`} />
        <ErrorState
          thing={intl.formatMessage(messages.usersThing)}
          detail={administration.error}
          onRetry={() => setManagementRetry((r) => r + 1)}
        />
      </Card>
    ) : null,
    server: (
      <Card id={S.server} aria-labelledby={`${S.server}-title`} padding="rows" className="v2-settings-card">
        <CardHeader title={intl.formatMessage(messages.serverTitle)} titleId={`${S.server}-title`} spacing={8} />
        <KeyValueList
          variant="rows"
          items={[
            { key: 'conn', label: intl.formatMessage(messages.connection), value: <ConnectionValue conn={conn} onRetry={recheck} /> },
            { key: 'addr', label: intl.formatMessage(messages.address), value: serverAddress(), mono: true },
            ...(versionValue
              ? [{ key: 'ver', label: intl.formatMessage(messages.serverAndConsole), value: <span className="v2-num">{versionValue}</span> }]
              : []),
            ...(s
              ? [
                  {
                    key: 'how',
                    label: intl.formatMessage(messages.installedWith),
                    value:
                      s.applySupported === false
                        ? intl.formatMessage(messages.installSource)
                        : intl.formatMessage(messages.installDocker),
                  },
                ]
              : []),
          ]}
        />
      </Card>
    ),
    updates: (
      <UpdatesSection id={S.updates} sup={sup} rolloutHref={`#${S.agentRollout}`} />
    ),
    agentRollout: (
      <RolloutSection id={S.agentRollout} ro={ro} status={s} statusLoaded={sup.loaded} />
    ),
    enrollment: (
      <Card id={S.enrollment} aria-labelledby={`${S.enrollment}-title`} padding="rows" className="v2-settings-card">
        <CardHeader
          title={intl.formatMessage(messages.enrollmentTitle)}
          titleId={`${S.enrollment}-title`}
          spacing={8}
          actions={canEnroll ? <Link to={paths.enroll}>{intl.formatMessage(messages.enrollDevice)}</Link> : undefined}
        />
        <div className="v2-settings-pref">
          <div className="v2-settings-pref__text">
            <span id="v2-settings-default-config" className="v2-settings-pref__label">
              {intl.formatMessage(messages.defaultConfig)}
            </span>
            <span id="v2-settings-default-config-help" className="v2-settings-pref__help">
              {configsErr ? (
                <FormattedMessage
                  {...messages.loadFailed}
                  values={{
                    retry: (chunks) => (
                      <LinkButton tone="inline" onClick={retryConfigs}>
                        {chunks}
                      </LinkButton>
                    ),
                  }}
                />
              ) : configs && configs.length === 0 ? (
                intl.formatMessage(messages.noConfigs)
              ) : (
                intl.formatMessage(messages.preselected)
              )}
            </span>
          </div>
          <Select
            className="v2-settings-pref__select"
            aria-labelledby="v2-settings-default-config"
            aria-describedby="v2-settings-default-config-help"
            value={known ? defaultConfig : ''}
            onChange={(e) => chooseDefault(e.target.value)}
            disabled={configs === null || configsErr}
          >
            <option value="">{intl.formatMessage(messages.noDefault)}</option>
            {(configs ?? []).map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
      </Card>
    ),
    appearance: (
      <Card id={S.appearance} aria-labelledby={`${S.appearance}-title`} padding="rows" className="v2-settings-card">
        <CardHeader title={intl.formatMessage(messages.appearanceTitle)} titleId={`${S.appearance}-title`} spacing={8} />
        <div className="v2-settings-pref">
          <div className="v2-settings-pref__text">
            <span id="v2-settings-theme" className="v2-settings-pref__label">
              {intl.formatMessage(messages.theme)}
            </span>
            <span id="v2-settings-theme-help" className="v2-settings-pref__help">
              {intl.formatMessage(messages.themeHelp)}
            </span>
          </div>
          <Segmented
            className="v2-settings-pref__control"
            aria-labelledby="v2-settings-theme"
            aria-describedby="v2-settings-theme-help"
            options={themeOptions}
            value={preference}
            onChange={(v) => setPreference(v)}
          />
        </div>
        <div className="v2-settings-pref">
          <div className="v2-settings-pref__text">
            <span id="v2-settings-language" className="v2-settings-pref__label">
              {intl.formatMessage({ id: 'settings.language.label', defaultMessage: 'Language' })}
            </span>
            <span id="v2-settings-language-help" className="v2-settings-pref__help">
              {intl.formatMessage({
                id: 'settings.language.help',
                defaultMessage: 'Browser follows your browser’s language. Saved in this browser only; the page reloads.',
              })}
            </span>
          </div>
          <Segmented
            className="v2-settings-pref__control"
            aria-labelledby="v2-settings-language"
            aria-describedby="v2-settings-language-help"
            options={languageOptions}
            value={language}
            onChange={(v) => {
              storeLocale(v || null);
              window.location.reload();
            }}
          />
        </div>
      </Card>
    ),
  };

  return (
    <>
      <PageHeader title={intl.formatMessage(messages.pageTitle)} subtitle={intl.formatMessage(messages.pageSubtitle)} />
      <CoreSettingsProvider parts={core}>
        <SectionLayout contentBasis={560} nav={sideNav} className="v2-settings-layout">
          {sections}
        </SectionLayout>
      </CoreSettingsProvider>

      <ChangePasswordModal key={pwSession} open={pwOpen} user={user} onClose={() => setPwOpen(false)} />
    </>
  );
}
