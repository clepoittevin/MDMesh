import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ApiError } from '../api/client';
import { getConfigurations, type Configuration } from '../api/configurations';
import { mintEnrollToken, revokeAllEnrollTokens } from '../api/enroll';
import { getUpdateStatus, type UpdateStatus } from '../api/updates';
import { Link } from 'react-router';
import { defineMessage, defineMessages, FormattedMessage, useIntl, type IntlShape, type MessageDescriptor } from 'react-intl';
import { arrivalLabel, arrivalNews, useArrivals, type Arrival } from '../enroll/arrivals';
import { addressProblem, wifiProblem } from '../enroll/checks';
import {
  agentApkUrl,
  buildProvisioningPayload,
  configurationQrExtras,
  extrasInCode,
  extrasLeftOut,
  qrPayloadBytes,
  QR_DENSE_BYTES,
  QR_MAX_BYTES,
  summarizeQrExtras,
  serverBaseUrl,
  type WifiSecurity,
} from '../enroll/provisioning';
import {
  Button,
  Callout,
  Card,
  CardHeader,
  CopyField,
  Field,
  Grid,
  GridCell,
  IconAlert,
  IconSync,
  IconWarning,
  Input,
  KeyValueList,
  MOBILE_QUERY,
  NumberedSteps,
  PageHeader,
  Select,
  Skeleton,
  TabPanel,
  Tabs,
  Toggle,
  useMediaQuery,
  useToast,
  type KeyValueItem,
  LinkButton,
  Modal,
} from '../ui';
import { paths } from '../routes';
// Not from the barrel: QrPanel pulls in `qrcode`, which stays in this page's chunk.
import { QrPanel } from '../ui/QrPanel';
import './EnrollPage.css';
import { apiErrorText } from '../api/apiErrorText';

/** This browser's default enrollment configuration (written by Settings; same key as the v0.3 console). */
const DEFAULT_CONFIG_KEY = 'mdmesh-default-config';
const SECURITY_VALUES: WifiSecurity[] = ['WPA', 'WEP', 'NONE', 'EAP'];
/**
 * The installers bake a verified release's signing checksum into the build. Without it, enroll/provisioning.ts
 * falls back to the debug agent's package and checksum (we only read the flag here; the payload is built there).
 */
const RELEASE_BUILD = !!(import.meta.env as Record<string, string | undefined>).VITE_AGENT_CHECKSUM;
const METHOD_TABS = 'v2-enroll-method';

type Method = 'qr' | 'token';
interface Minted {
  value: string;
  expiresAt?: number;
  /** When the server made it (server clock). */
  createdAt?: number;
  /** The devices it enrolls, as the server says (1 from a server whose tokens are all single-use). */
  maxUses: number;
  /** The server applied the chosen devices and validity; false: it predates them, and made a single-use 24 h code. */
  limitsApplied: boolean;
  /** The configuration choice it was made for: the code shows only with that configuration's setup entries. */
  cfgId: string;
}

const enrollDefs = defineMessages({
  serverSetting: { id: 'enroll.page.serverSetting', defaultMessage: 'Use the server default' },
  valid24h: { id: 'enroll.valid.24h', defaultMessage: '24 hours' },
  valid3d: { id: 'enroll.valid.3d', defaultMessage: '3 days' },
  valid7d: { id: 'enroll.valid.7d', defaultMessage: '7 days' },
  valid30d: { id: 'enroll.valid.30d', defaultMessage: '30 days' },
  usesOne: { id: 'enroll.uses.one', defaultMessage: 'One device, then it stops working' },
  usesMany: { id: 'enroll.uses.many', defaultMessage: 'Up to {count} devices, then it stops working' },
  usesOptionOne: { id: 'enroll.uses.optionOne', defaultMessage: 'One device' },
  usesOptionMany: { id: 'enroll.uses.optionMany', defaultMessage: 'Up to {count} devices' },
  replaced: {
    id: 'enroll.replaced.notice',
    defaultMessage:
      '{count, plural, one {The code for a batch you replaced still works {hasUntil, select, true {until {until}} other {until it expires}}, for anyone who has it.} other {The # codes for a batch you replaced still work {hasUntil, select, true {until {until}} other {until they expire}}, for anyone who has them.}}',
  },
  revokeUnsupported: {
    id: 'enroll.revoke.unsupported',
    defaultMessage: "This server can't stop codes. Update it, or wait for the codes to expire.",
  },
  revokeDenied: {
    id: 'enroll.revoke.denied',
    defaultMessage: "Your account can't stop codes: it needs permission to edit devices.",
  },
  revokeFailed: { id: 'enroll.revoke.failed', defaultMessage: "Couldn't stop the codes." },
  tokenUnreachable: { id: 'enroll.token.unreachable', defaultMessage: 'Cannot reach the server.' },
  tokenConfigGone: {
    id: 'enroll.token.configGone',
    defaultMessage: "That configuration doesn't exist any more, or your account can't use it. Pick another one.",
  },
  tokenDenied: {
    id: 'enroll.token.denied',
    defaultMessage: "Your account can't enroll devices: it needs permission to edit devices.",
  },
  tokenMaxUses: { id: 'enroll.token.maxUses', defaultMessage: 'A code can enroll 1 to 1000 devices.' },
  tokenValidHours: {
    id: 'enroll.token.validHours',
    defaultMessage: 'A code can be valid for 1 hour to 30 days.',
  },
  tokenFailed: { id: 'enroll.token.failed', defaultMessage: 'Couldn’t make a code.' },
  untilUnderMinute: { id: 'enroll.until.underMinute', defaultMessage: 'in under a minute' },
  untilMinutes: {
    id: 'enroll.until.minutes',
    defaultMessage: '{count, plural, one {in # minute} other {in # minutes}}',
  },
  untilHours: {
    id: 'enroll.until.hours',
    defaultMessage: '{count, plural, one {in # hour} other {in # hours}}',
  },
  untilDays: { id: 'enroll.until.days', defaultMessage: 'in {count} days' },
  stepReset: {
    id: 'enroll.steps.reset',
    defaultMessage: 'Factory-reset the device, or start with one fresh from the box.',
  },
  stepTap: { id: 'enroll.steps.tap', defaultMessage: 'On the first welcome screen, tap the same spot six times.' },
  stepScanWifi: { id: 'enroll.steps.scanWifi', defaultMessage: 'Scan this code when the camera opens.' },
  stepScan: {
    id: 'enroll.steps.scan',
    defaultMessage: 'Scan this code when the camera opens. Connect to Wi-Fi if the device asks.',
  },
  stepWait: {
    id: 'enroll.steps.wait',
    defaultMessage: 'Wait a few minutes while the agent installs. The device then appears below, and under Devices.',
  },
  stoppedLooking: {
    id: 'enroll.arrivals.stoppedLooking',
    defaultMessage: 'Stopped looking for new devices after 30 minutes.',
  },
  codesStoppedTitle: { id: 'enroll.stop.toastTitle', defaultMessage: 'Codes stopped' },
  codesStoppedAll: {
    id: 'enroll.stop.toastAll',
    defaultMessage: 'Every enrollment code stopped working. A new code is ready.',
  },
  codesStoppedCount: {
    id: 'enroll.stop.toastCount',
    defaultMessage: '{count, plural, one {# code stopped working. A new code is ready.} other {# codes stopped working. A new code is ready.}}',
  },
  configNumbered: { id: 'enroll.config.numbered', defaultMessage: 'Configuration #{id}' },
  serverDefault: { id: 'enroll.config.serverDefault', defaultMessage: 'Server default' },
  helpLimitsIgnored: {
    id: 'enroll.devices.helpLimitsIgnored',
    defaultMessage:
      'This server makes single-use codes, valid for 24 hours, whatever is chosen here. Update it to set up a batch with one code.',
  },
  helpOne: {
    id: 'enroll.devices.helpOne',
    defaultMessage: 'One device, then the code stops working: the one to send a customer.',
  },
  helpMany: {
    id: 'enroll.devices.helpMany',
    defaultMessage:
      'Anyone with this code can enroll up to {count} devices until it expires, or until you stop all codes. Share it only with whoever sets them up.',
  },
  noToken: { id: 'enroll.token.none', defaultMessage: 'The server did not return a token.' },
  makingCode: { id: 'enroll.code.making', defaultMessage: 'Making a code…' },
  expiredAt: { id: 'enroll.code.expiredAt', defaultMessage: 'Expired {when}' },
  expiresIn: { id: 'enroll.code.expiresIn', defaultMessage: '{when} ({relative})' },
  factConfiguration: { id: 'enroll.facts.configuration', defaultMessage: 'Configuration' },
  factWifi: { id: 'enroll.facts.wifi', defaultMessage: 'Joins Wi-Fi' },
  wifiNotInCode: { id: 'enroll.facts.wifiNotInCode', defaultMessage: 'Not in the code (see Wi-Fi above)' },
  wifiNoName: { id: 'enroll.facts.wifiNoName', defaultMessage: 'No network name yet' },
  factUse: { id: 'enroll.facts.use', defaultMessage: 'Use' },
  factExpires: { id: 'enroll.facts.expires', defaultMessage: 'Expires' },
  configsFailed: {
    id: 'enroll.config.loadFailed',
    defaultMessage: 'Couldn’t load configurations, so the code uses the server default. <retry>Retry</retry>',
  },
  configHelp: {
    id: 'enroll.config.help',
    defaultMessage: 'New devices start with it. The code is tied to it, so pick before you share it.',
  },
  chooseTitle: { id: 'enroll.choose.title', defaultMessage: 'Choose what the device gets' },
  fieldConfiguration: { id: 'enroll.choose.configuration', defaultMessage: 'Configuration' },
  loadingConfigs: { id: 'enroll.choose.loadingConfigs', defaultMessage: 'Loading configurations…' },
  defaultSuffix: { id: 'enroll.choose.defaultSuffix', defaultMessage: '{name} (default)' },
  fieldDevices: { id: 'enroll.choose.devices', defaultMessage: 'Devices' },
  fieldValidFor: { id: 'enroll.choose.validFor', defaultMessage: 'Valid for' },
  wifiJoin: { id: 'enroll.wifi.join', defaultMessage: 'Join Wi-Fi during setup' },
  wifiJoinHelp: {
    id: 'enroll.wifi.joinHelp',
    defaultMessage: 'Only needed if the device can’t reach the server on mobile data.',
  },
  wifiName: { id: 'enroll.wifi.name', defaultMessage: 'Network name' },
  wifiSecurity: { id: 'enroll.wifi.security', defaultMessage: 'Security' },
  wifiWpa: { id: 'enroll.wifi.wpa', defaultMessage: 'WPA / WPA2' },
  wifiWep: { id: 'enroll.wifi.wep', defaultMessage: 'WEP' },
  wifiOpen: { id: 'enroll.wifi.open', defaultMessage: 'Open' },
  wifiEap: { id: 'enroll.wifi.eap', defaultMessage: 'EAP (from the configuration)' },
  wifiPassword: { id: 'enroll.wifi.password', defaultMessage: 'Wi-Fi password' },
  wifiPasswordWarning: {
    id: 'enroll.wifi.passwordWarning',
    defaultMessage: 'The Wi-Fi password is written into the QR code. Anyone who photographs the code can read it.',
  },
  wifiFrom: {
    id: 'enroll.wifi.filledFrom',
    defaultMessage: '{hasFrom, select, true {Filled in from {name}. } other {}}Changes here only affect this code.',
  },
  noAgentFrame: { id: 'enroll.qr.noAgentFrame', defaultMessage: 'No QR code: there is no agent to install yet.' },
  qrLabel: { id: 'enroll.qr.label', defaultMessage: 'Enrollment QR code for {name}' },
  qrFullTitle: { id: 'enroll.qr.fullScreenTitle', defaultMessage: 'Scan to enroll: {name}' },
  qrFullNote: {
    id: 'enroll.qr.fullScreenNote',
    defaultMessage:
      '{maxUses, plural, one {Single-use.} other {For up to # devices.}}{hasExpiry, select, true { Expires {when}.} other {}}',
  },
  codeExpired: { id: 'enroll.code.expired', defaultMessage: 'This code has expired.' },
  noCodeYet: { id: 'enroll.code.none', defaultMessage: 'No code yet.' },
  newCode: { id: 'enroll.code.new', defaultMessage: 'New code' },
  enrollTitle: { id: 'enroll.device.title', defaultMessage: 'Enroll the device' },
  methodLabel: { id: 'enroll.device.methodLabel', defaultMessage: 'Method' },
  methodQr: { id: 'enroll.device.methodQr', defaultMessage: 'QR code' },
  methodToken: { id: 'enroll.device.methodToken', defaultMessage: 'Token' },
  noAgentCallout: {
    id: 'enroll.device.noAgentCallout',
    defaultMessage:
      'This server has no agent app to give new devices, so a device that scans a code can’t install it. The updater hasn’t verified an agent for this server: GitHub didn’t answer (it tries again every few minutes), the release this server runs has a signed manifest that doesn’t check out, or no release with an agent was found (is <mono>GITHUB_REPO</mono> set?). See Settings → Updates and the updater’s log. Devices that already run the agent can still use a token.',
  },
  retry: { id: 'enroll.device.retry', defaultMessage: 'Retry' },
  expiredCallout: {
    id: 'enroll.code.expiredCallout',
    defaultMessage: 'This code has expired. Make a new one before you enroll a device.',
  },
  stopAllCodes: {
    id: 'enroll.stop.action',
    defaultMessage: 'Stop all codes',
    description: 'DESTRUCTIVE: every enrollment code that still works stops working',
  },
  howToScan: { id: 'enroll.device.howToScan', defaultMessage: 'How to scan the code' },
  tokenLabel: { id: 'enroll.token.label', defaultMessage: 'Enrollment token' },
  tokenCopiedTitle: { id: 'enroll.token.copiedTitle', defaultMessage: 'Token copied' },
  tokenCopiedBody: { id: 'enroll.token.copiedBody', defaultMessage: 'Enrollment token copied to clipboard.' },
  makingToken: { id: 'enroll.token.making', defaultMessage: 'Making a token…' },
  tokenExpired: { id: 'enroll.token.expired', defaultMessage: 'This token has expired.' },
  noTokenYet: { id: 'enroll.token.noneYet', defaultMessage: 'No token yet.' },
  newToken: { id: 'enroll.token.new', defaultMessage: 'New token' },
  tokenNote: {
    id: 'enroll.token.note',
    defaultMessage:
      'For headless or scripted provisioning: pass it as <mono>com.mdmesh.ENROLL_TOKEN</mono>, with <mono2>com.mdmesh.SERVER_URL</mono2> set to the server address. Scanning the QR code is the usual way.',
  },
  arrivalsTitle: { id: 'enroll.arrivals.title', defaultMessage: 'Enrolled while this page is open' },
  lookAgain: { id: 'enroll.arrivals.lookAgain', defaultMessage: 'Look again' },
  noDeviceYet: {
    id: 'enroll.arrivals.noDeviceYet',
    defaultMessage: 'No device yet. A device shows here within seconds of enrolling.',
  },
  codesTitle: { id: 'enroll.codes.title', defaultMessage: 'Enrollment codes' },
  codesHelp: {
    id: 'enroll.codes.help',
    defaultMessage: 'A code shared further than meant? Stop every code that still works; enrolled devices stay enrolled.',
  },
  debugAgent: {
    id: 'enroll.codes.debugAgent',
    defaultMessage:
      'No verified agent release was found when this console was built, so the code expects the debug build of the agent. Host a debug agent APK at the Agent address below, or re-run the installer once a release is published.',
  },
  footServer: { id: 'enroll.codes.server', defaultMessage: 'Server' },
  footAgent: { id: 'enroll.codes.agent', defaultMessage: 'Agent' },
  footVersion: { id: 'enroll.codes.version', defaultMessage: 'Version' },
  pageTitle: { id: 'enroll.page.title', defaultMessage: 'Enroll a device' },
  pageSubtitle: {
    id: 'enroll.page.subtitle',
    defaultMessage: 'Set up a new or factory-reset Android device so MDMesh manages it.',
  },
  stopModalTitle: {
    id: 'enroll.stop.modalTitle',
    defaultMessage: 'Stop all enrollment codes?',
    description: 'DESTRUCTIVE: every enrollment code that still works stops working',
  },
  stopModalBody: {
    id: 'enroll.stop.modalBody',
    defaultMessage:
      'Every code that still works stops now: this one, codes you replaced, and codes other admins made, printed or shared ones too. Devices already enrolled stay enrolled. A new code is made for your choices.',
  },
  cancel: { id: 'enroll.stop.cancel', defaultMessage: 'Cancel' },
  stopping: { id: 'enroll.stop.stopping', defaultMessage: 'Stopping…' },
});
// Widened so values can be passed (react-intl would otherwise type them from the ICU text).
const E: { [K in keyof typeof enrollDefs]: MessageDescriptor } = enrollDefs;

/** The mono-spaced text of a rich message. */
const MONO = {
  mono: (chunks: ReactNode) => <span className="v2-mono">{chunks}</span>,
  mono2: (chunks: ReactNode) => <span className="v2-mono">{chunks}</span>,
};

/**
 * How many devices one code enrolls: one, a code to send to a customer, or a batch set up together. A code for several
 * works for anyone who has it until it expires, so it is bounded both ways.
 */
const USES_OPTIONS = [1, 10, 25, 100];
/** How long a code is valid. */
const VALID_OPTIONS: { hours: number; label: MessageDescriptor }[] = [
  { hours: 24, label: E.valid24h },
  { hours: 72, label: E.valid3d },
  { hours: 168, label: E.valid7d },
  { hours: 720, label: E.valid30d },
];

function usesText(intl: IntlShape, n: number): string {
  return n === 1 ? intl.formatMessage(E.usesOne) : intl.formatMessage(E.usesMany, { count: n });
}

/** Codes for a batch this page replaced that may still work: how many, and when the last of them expires. */
interface Replaced {
  count: number;
  until?: number;
}

/** What to say about the codes this page replaced. */
function replacedText(intl: IntlShape, r: Replaced): string {
  return intl.formatMessage(E.replaced, {
    count: r.count,
    hasUntil: String(!!r.until),
    until: r.until ? fmtExpiry(intl, r.until) : '',
  });
}

/** Why stopping the codes failed, in words. */
function revokeError(intl: IntlShape, err: unknown): string {
  if (err instanceof ApiError) {
    if (err.httpStatus === 404 || err.httpStatus === 405) return intl.formatMessage(E.revokeUnsupported);
    if (err.message === 'error.permission.denied') return intl.formatMessage(E.revokeDenied);
    return apiErrorText(intl, err) || intl.formatMessage(E.revokeFailed);
  }
  return intl.formatMessage(E.revokeFailed);
}

function readDefault(): string {
  try {
    return localStorage.getItem(DEFAULT_CONFIG_KEY) ?? '';
  } catch {
    return '';
  }
}

/** Sentences for the token errors the server is known to send; anything else is shown as it comes (classic). */
function tokenError(intl: IntlShape, err: unknown): string {
  if (err instanceof ApiError && err.httpStatus === 0) return intl.formatMessage(E.tokenUnreachable);
  if (err instanceof ApiError) {
    if (err.message === 'error.configuration.not.found') return intl.formatMessage(E.tokenConfigGone);
    if (err.message === 'error.permission.denied') return intl.formatMessage(E.tokenDenied);
    if (err.message === 'error.agent.token.maxUses') return intl.formatMessage(E.tokenMaxUses);
    if (err.message === 'error.agent.token.validHours') return intl.formatMessage(E.tokenValidHours);
    return apiErrorText(intl, err) || intl.formatMessage(E.tokenFailed);
  }
  return intl.formatMessage(E.tokenFailed);
}

/** Token expiry, short enough for the summary box: a token lives 30 days at most, so no year ("Oct 16, 1:54 PM"). */
function fmtExpiry(intl: IntlShape, ms: number): string {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '—';
  return intl.formatDate(d, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** "in 7 days", "in 24 hours", "in 5 minutes", "in under a minute". */
function untilText(intl: IntlShape, ms: number, now: number): string {
  const min = Math.floor((ms - now) / 60_000);
  if (min < 1) return intl.formatMessage(E.untilUnderMinute);
  if (min < 60) return intl.formatMessage(E.untilMinutes, { count: min });
  const hr = Math.round(min / 60);
  if (hr >= 48) return intl.formatMessage(E.untilDays, { count: Math.round(hr / 24) });
  return intl.formatMessage(E.untilHours, { count: hr });
}

/** The clock, every `everyMs`, and also right at `at` (a code's expiry), so an expired code is never left up. */
function useNow(everyMs: number, at?: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  useEffect(() => {
    if (at == null) return;
    const ms = at - Date.now();
    if (ms <= 0 || ms > 2 ** 31 - 1) return;
    const t = setTimeout(() => setNow(Date.now()), ms + 50);
    return () => clearTimeout(t);
  }, [at]);
  return now;
}

/** How long a configuration choice must settle before a token is minted for it (arrowing through the select). */
const MINT_SETTLE_MS = 300;

function qrSteps(intl: IntlShape, wifiInCode: boolean): ReactNode[] {
  return [
    intl.formatMessage(E.stepReset),
    intl.formatMessage(E.stepTap),
    intl.formatMessage(wifiInCode ? E.stepScanWifi : E.stepScan),
    intl.formatMessage(E.stepWait),
  ];
}

/** How long a piece of arrival news stays in the live region: read by then, and not left for browse mode to find. */
const NEWS_MS = 7000;

interface News {
  id: number;
  text: string;
  /** When it leaves the live region. */
  until: number;
}

/**
 * What a screen reader hears about the devices enrolling: each new device or change of state once, as it happens
 * (several at once counted), and that the page stopped looking. Each piece is its own keyed node that leaves after
 * {@link NEWS_MS}, as the toasts' announcements do: the same sentence twice (a second stop, two "Scanner: Online."
 * looks apart) is a new node, so it is read again. `active` false (no code yet, a server without the list): nothing.
 * `clear` empties it (Look again: the stop it says no longer holds).
 */
function useArrivalNews(arrivals: Arrival[], active: boolean, watching: boolean): { news: News[]; clear: () => void } {
  const intl = useIntl();
  const [news, setNews] = useState<News[]>([]);
  const seq = useRef(0);
  const seen = useRef<Arrival[]>([]);
  const wasWatching = useRef(watching);
  useEffect(() => {
    if (!active) return;
    const lines = arrivalNews(seen.current, arrivals, intl);
    seen.current = arrivals;
    if (wasWatching.current && !watching) lines.push(intl.formatMessage(E.stoppedLooking));
    wasWatching.current = watching;
    if (!lines.length) return;
    const id = ++seq.current;
    setNews((n) => [...n.slice(-4), { id, text: lines.join(' '), until: Date.now() + NEWS_MS }]);
  }, [arrivals, active, watching, intl]);
  useEffect(() => {
    if (!news.length) return;
    const t = setTimeout(
      () => setNews((n) => n.filter((x) => x.until > Date.now())),
      Math.max(0, news[0].until - Date.now()) + 1,
    );
    return () => clearTimeout(t);
  }, [news]);
  const clear = useCallback(() => setNews([]), []);
  return { news, clear };
}

/** Enroll. Classic: pages/EnrollPage.tsx. */
const setupMessages = defineMessages({
  label: { id: 'enroll.setup.label', defaultMessage: 'Setup' },
  skipIntro: { id: 'enroll.setup.skipIntro', defaultMessage: 'intro screens skipped' },
  mobileData: { id: 'enroll.setup.mobileData', defaultMessage: 'mobile data' },
  hiddenWifi: { id: 'enroll.setup.hiddenWifi', defaultMessage: 'hidden Wi-Fi' },
  nothing: { id: 'enroll.setup.nothing', defaultMessage: 'Nothing added' },
});
const setupWifiLeftOut = defineMessage<{ count: number }>({
  id: 'enroll.setup.wifiLeftOut',
  defaultMessage:
    '{count, plural, one {# Wi-Fi entry left out} other {# Wi-Fi entries left out}}: Wi-Fi comes from this page (and the configuration\'s setup Wi-Fi)',
});
const setupNotKnown = defineMessages({
  serverDefault: {
    id: 'enroll.setup.serverDefault',
    defaultMessage: "Not added: choose a configuration to add its setup entries (the page can't tell which one is the server default)",
  },
  notLoaded: {
    id: 'enroll.setup.notLoaded',
    defaultMessage: "Not added: the configuration didn't load, so the code has none of its setup entries",
  },
});
const setupUnsupported = defineMessage<{ count: number }>({
  id: 'enroll.setup.unsupported',
  defaultMessage:
    '{count, plural, one {# entry left out} other {# entries left out}}: not a setup entry MDMesh passes on, or a value of the wrong type',
});
const qrSizeMessages = defineMessages({
  tooLargeFrame: { id: 'enroll.qrSize.tooLargeFrame', defaultMessage: 'No QR code: it would be too large to scan.' },
});
const qrTooLarge = defineMessage<{ bytes: number; max: number }>({
  id: 'enroll.qrSize.tooLarge',
  defaultMessage:
    "This code would hold {bytes} bytes, more than a QR code can ({max}). The server address (it is in the code twice) or the Wi-Fi is too long: shorten them.",
});
const qrDense = defineMessage<{ bytes: number }>({
  id: 'enroll.qrSize.dense',
  defaultMessage:
    "This code holds {bytes} bytes, so it is dense: some devices' setup cameras may struggle to scan it. A shorter server address or Wi-Fi, or fewer Extra QR parameters, make it lighter.",
});
const setupOthers = defineMessage<{ count: number }>({
  id: 'enroll.setup.others',
  defaultMessage: '{count, plural, one {# other entry} other {# other entries}}',
});
const setupProtectedLeftOut = defineMessage<{ summary: string; count: number }>({
  id: 'enroll.setup.protectedLeftOut',
  defaultMessage: '{summary} ({count, plural, one {#} other {#}} protected left out)',
});
const setupUnreadable = defineMessage<{ summary: string; error: string }>({
  id: 'enroll.setup.unreadable',
  defaultMessage: '{summary} (other Extra QR parameters left out: {error})',
});

export function EnrollPage() {
  const intl = useIntl();
  const toast = useToast();
  const mobile = useMediaQuery(MOBILE_QUERY);

  const [method, setMethod] = useState<Method>('qr');
  const [defaultId] = useState(readDefault);
  const [cfgId, setCfgId] = useState(defaultId);
  const [uses, setUses] = useState(1);
  const [validHours, setValidHours] = useState(24);
  /** null while loading. */
  const [configs, setConfigs] = useState<Configuration[] | null>(null);
  const [configsFailed, setConfigsFailed] = useState(false);

  const [wifiOn, setWifiOn] = useState(false);
  const [wifiSsid, setWifiSsid] = useState('');
  const [wifiPass, setWifiPass] = useState('');
  const [wifiSec, setWifiSec] = useState<WifiSecurity>('WPA');
  /** The configuration the Wi-Fi fields were filled from (null: nothing saved there, or typed by hand). */
  const [wifiFrom, setWifiFrom] = useState<string | null>(null);

  const [token, setToken] = useState<Minted | null>(null);
  const [minting, setBusy] = useState(false);
  /** The first code waits for the configuration list, so a stored default that is gone is never minted for. */
  const [mintReady, setMintReady] = useState(false);
  const busy = minting || !mintReady;
  const [tokError, setTokError] = useState<string | null>(null);
  const mintSeq = useRef(0);
  const minted = useRef(false);
  /** The code last shown, to tell whether a new one replaces a code for a batch that still works. */
  const shown = useRef<Minted | null>(null);
  const [replaced, setReplaced] = useState<Replaced | null>(null);
  const [stopOpen, setStopOpen] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [stopError, setStopError] = useState<string | null>(null);
  const now = useNow(30_000, token?.expiresAt);
  /** Server time of the first code made on this visit: devices enrolled since then show up on the page. */
  const [since, setSince] = useState<number | undefined>(undefined);
  const { arrivals, watching, unsupported: arrivalsUnsupported, watchAgain } = useArrivals(since);
  const { news: arrivalSaid, clear: clearArrivalNews } = useArrivalNews(arrivals, since != null && !arrivalsUnsupported, watching);
  const arrivalsHead = useRef<HTMLHeadingElement>(null);
  const lookAgain = () => {
    clearArrivalNews();
    watchAgain();
    // "Look again" goes away when the page looks again: keep focus on the list instead of losing it to the page.
    arrivalsHead.current?.focus();
  };

  const [update, setUpdate] = useState<UpdateStatus | null>(null);

  const loadConfigs = useCallback(() => {
    setConfigsFailed(false);
    setConfigs(null);
    getConfigurations()
      .then((list) => setConfigs([...list].sort((a, b) => a.name.localeCompare(b.name))))
      .catch(() => {
        setConfigs([]);
        setConfigsFailed(true);
      });
  }, []);

  useEffect(() => {
    loadConfigs();
  }, [loadConfigs]);

  // The mirrored agent's version, for the footer. Only meaningful when the code points at the release mirror.
  useEffect(() => {
    if (!RELEASE_BUILD) return;
    let cancelled = false;
    void getUpdateStatus().then((s) => {
      if (!cancelled) setUpdate(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = useMemo(() => configs?.find((c) => String(c.id) === cfgId) ?? null, [configs, cfgId]);

  // A stored default that is no longer in the list (deleted, or not usable by this account) falls back to the
  // server setting instead of minting against a dead id, and is forgotten so the next visit doesn't fall back again.
  const stale = !!configs && !configsFailed && !!cfgId && !selected;
  useEffect(() => {
    if (!stale) return;
    try {
      if (localStorage.getItem(DEFAULT_CONFIG_KEY) === cfgId) localStorage.removeItem(DEFAULT_CONFIG_KEY);
    } catch {
      /* storage unavailable */
    }
    setCfgId('');
  }, [stale, cfgId]);
  // Once the list has answered (or failed) and the choice is a real one, codes can be minted.
  useEffect(() => {
    if (configs && !stale) setMintReady(true);
  }, [configs, stale]);

  // Choosing a configuration fills the Wi-Fi fields from its saved enrollment Wi-Fi (still editable). The server
  // setting keeps what is there, but it no longer came from a configuration.
  useEffect(() => {
    if (!selected) {
      if (configs) setWifiFrom(null);
      return;
    }
    const ssid = typeof selected.wifiSSID === 'string' ? selected.wifiSSID : '';
    const sec = typeof selected.wifiSecurityType === 'string' ? selected.wifiSecurityType : '';
    setWifiSsid(ssid);
    setWifiPass(typeof selected.wifiPassword === 'string' ? selected.wifiPassword : '');
    setWifiSec((SECURITY_VALUES as string[]).includes(sec) ? (sec as WifiSecurity) : 'WPA');
    setWifiOn(!!ssid.trim());
    setWifiFrom(ssid.trim() ? selected.name : null);
  }, [selected, configs]);

  /**
   * Mint a token for `maxUses` devices, valid `hours`, bound to configuration `id` ('' = none: the server's setting
   * for new devices). The latest call wins. `keep` leaves the current code up while a new one for the SAME choices is
   * minted ("New code"); changing a choice clears it, so a code never carries a token for other choices.
   */
  const generate = useCallback(async (id: string, keep: boolean, maxUses: number, hours: number) => {
    const seq = ++mintSeq.current;
    const n = Number(id);
    // A new code doesn't stop the one it replaces. For a batch that one keeps working for anyone who has it: say so,
    // and offer to stop it (a single-use code is less of a worry, and the page never showed it to anyone else).
    const prev = shown.current;
    shown.current = null;
    if (prev && prev.maxUses > 1 && !(prev.expiresAt && prev.expiresAt <= Date.now())) {
      setReplaced((r) => ({
        count: (r?.count ?? 0) + 1,
        until: Math.max(r?.until ?? 0, prev.expiresAt ?? 0) || undefined,
      }));
    }
    setBusy(true);
    setTokError(null);
    if (!keep) setToken(null);
    try {
      const res = await mintEnrollToken(Number.isFinite(n) && n > 0 ? n : undefined, { maxUses, validHours: hours });
      if (seq !== mintSeq.current) return;
      const applied = typeof res.maxUses === 'number';
      const devices = typeof res.maxUses === 'number' ? res.maxUses : 1;
      if (res.token) {
        const createdAt = typeof res.createdAt === 'number' ? res.createdAt : undefined;
        const next = { value: res.token, expiresAt: res.expiresAt, createdAt, maxUses: devices, limitsApplied: applied, cfgId: id };
        shown.current = next;
        setToken(next);
        if (createdAt != null) setSince((s) => s ?? createdAt);
      } else setTokError(intl.formatMessage(E.noToken));
    } catch (err) {
      if (seq === mintSeq.current) setTokError(tokenError(intl, err));
    } finally {
      if (seq === mintSeq.current) setBusy(false);
    }
  }, [intl]);

  // The token binds the device to the configuration and its limits server-side: mint again whenever a choice changes.
  // The first code is minted at once; a later choice waits until it settles, so arrowing through a select mints one
  // token (each lives until it expires), not one per option passed. The old code goes at once: it is for other choices.
  useEffect(() => {
    if (!mintReady) return;
    if (minted.current) {
      ++mintSeq.current; // drop an answer still on its way for the previous choice
      setToken(null);
      setTokError(null);
      setBusy(true);
    }
    const t = setTimeout(
      () => {
        minted.current = true;
        void generate(cfgId, false, uses, validHours);
      },
      minted.current ? MINT_SETTLE_MS : 0,
    );
    return () => clearTimeout(t);
  }, [cfgId, uses, validHours, generate, mintReady]);

  const newCode = () => void generate(cfgId, true, uses, validHours);

  /** Stop every code that still works, then make a new one for the current choices (the shown one stopped too). */
  const stopAll = async () => {
    setStopping(true);
    setStopError(null);
    try {
      const res = await revokeAllEnrollTokens();
      shown.current = null;
      setReplaced(null);
      setStopOpen(false);
      const n = typeof res.revoked === 'number' ? res.revoked : null;
      toast.push(
        'ok',
        intl.formatMessage(E.codesStoppedTitle),
        n === null ? intl.formatMessage(E.codesStoppedAll) : intl.formatMessage(E.codesStoppedCount, { count: n }),
      );
      void generate(cfgId, false, uses, validHours);
    } catch (err) {
      setStopError(revokeError(intl, err));
    } finally {
      setStopping(false);
    }
  };
  const openStop = () => {
    setStopError(null);
    setStopOpen(true);
  };

  const givesName =
    selected?.name ?? (cfgId ? intl.formatMessage(E.configNumbered, { id: cfgId }) : intl.formatMessage(E.serverDefault));
  // What the code does, not what was asked: an older server ignores both choices and makes a single-use 24 h code.
  const limitsIgnored = !!token && !token.limitsApplied && (uses !== 1 || validHours !== 24);
  let devicesHelp: string;
  if (limitsIgnored) {
    devicesHelp = intl.formatMessage(E.helpLimitsIgnored);
  } else if (uses === 1) {
    devicesHelp = intl.formatMessage(E.helpOne);
  } else {
    devicesHelp = intl.formatMessage(E.helpMany, { count: uses });
  }
  const ssid = wifiSsid.trim();
  const wifiIssue = wifiOn ? wifiProblem({ ssid: wifiSsid, password: wifiPass, security: wifiSec }, intl) : null;
  const wifiInCode = wifiOn && !!ssid && !wifiIssue;
  // The code carries this page's address (see enroll/provisioning.ts); compare it with the server's own setting, which
  // every configuration carries.
  const serverSetting = useMemo(
    () => configs?.map((c) => c.baseUrl).find((v): v is string => typeof v === 'string' && v.trim() !== '') ?? null,
    [configs],
  );
  const address = useMemo(() => addressProblem(serverBaseUrl(), serverSetting, intl), [serverSetting, intl]);
  const expired = !!token?.expiresAt && token.expiresAt <= now;
  // The chosen configuration's setup entries (Enrollment section): added to the code, protected entries aside.
  const qrExtras = useMemo(() => configurationQrExtras(selected), [selected]);
  const extrasText = useMemo(() => {
    // What goes in the code (Wi-Fi entries only with the page's own network), as buildProvisioningPayload adds it.
    const sum = summarizeQrExtras(extrasInCode(qrExtras.entries, wifiInCode));
    const leftOut = extrasLeftOut(qrExtras.entries, wifiInCode);
    const wifiLeftOut = leftOut.wifi.length;
    const unsupported = leftOut.unsupported.length + leftOut.invalid.length;
    const parts = [
      sum.locale,
      sum.timeZone,
      sum.skipIntro ? intl.formatMessage(setupMessages.skipIntro) : null,
      sum.mobileData ? intl.formatMessage(setupMessages.mobileData) : null,
      sum.hiddenWifi ? intl.formatMessage(setupMessages.hiddenWifi) : null,
      sum.others > 0 ? intl.formatMessage(setupOthers, { count: sum.others }) : null,
      wifiLeftOut > 0 ? intl.formatMessage(setupWifiLeftOut, { count: wifiLeftOut }) : null,
      unsupported > 0 ? intl.formatMessage(setupUnsupported, { count: unsupported }) : null,
    ].filter((x): x is string => !!x);
    return parts.join(' · ');
  }, [qrExtras, intl, wifiInCode]);
  // A code goes only with the setup entries of the configuration it was made for: right after another configuration is
  // chosen, the old code is still here for a render while the new configuration's entries already are.
  const payload = useMemo(
    () =>
      token && token.cfgId === cfgId
        ? buildProvisioningPayload(
            token.value,
            wifiInCode ? { ssid: wifiSsid, password: wifiPass, security: wifiSec } : undefined,
            qrExtras.entries,
          )
        : null,
    [token, cfgId, wifiInCode, wifiSsid, wifiPass, wifiSec, qrExtras],
  );

  let expiresValue: ReactNode = busy ? (
    <>
      <Skeleton width="12em" />
      <span className="v2-visually-hidden">{intl.formatMessage(E.makingCode)}</span>
    </>
  ) : (
    '—'
  );
  if (token?.expiresAt) {
    expiresValue = expired ? (
      <span className="v2-enroll__expired">{intl.formatMessage(E.expiredAt, { when: fmtExpiry(intl, token.expiresAt) })}</span>
    ) : (
      intl.formatMessage(E.expiresIn, { when: fmtExpiry(intl, token.expiresAt), relative: untilText(intl, token.expiresAt, now) })
    );
  }
  const facts = (withWifi: boolean): KeyValueItem[] => [
    // What the code carries, named plainly (the picker's "Use the server default" is an instruction, not a name).
    { key: 'configuration', label: intl.formatMessage(E.factConfiguration), value: givesName },
    ...(withWifi && wifiOn
      ? [
          {
            key: 'wifi',
            label: intl.formatMessage(E.factWifi),
            value: wifiIssue ? intl.formatMessage(E.wifiNotInCode) : ssid || intl.formatMessage(E.wifiNoName),
          },
        ]
      : []),
    // Without the chosen configuration's settings (server default, or the list didn't load), the code has none: say so.
    ...(!selected
      ? [{
          key: 'qrExtras',
          label: intl.formatMessage(setupMessages.label),
          value: intl.formatMessage(cfgId ? setupNotKnown.notLoaded : setupNotKnown.serverDefault),
        }]
      : []),
    ...(selected
      ? [{
          key: 'qrExtras',
          label: intl.formatMessage(setupMessages.label),
          value: qrExtras.error
            ? intl.formatMessage(setupUnreadable, {
                summary: extrasText || intl.formatMessage(setupMessages.nothing),
                error: qrExtras.error,
              })
            : qrExtras.ignored.length
              ? intl.formatMessage(setupProtectedLeftOut, {
                  summary: extrasText || intl.formatMessage(setupMessages.nothing),
                  count: qrExtras.ignored.length,
                })
              : extrasText || intl.formatMessage(setupMessages.nothing),
        }]
      : []),
    { key: 'use', label: intl.formatMessage(E.factUse), value: usesText(intl, token?.maxUses ?? uses) },
    { key: 'expires', label: intl.formatMessage(E.factExpires), value: expiresValue },
  ];

  const agentVersion = RELEASE_BUILD && update?.apk?.available ? update.apk.version : null;
  // No agent to download: a QR code would fail on the device, so the page says why instead of showing one.
  // deploy-0.5.1: no agentUnavailable on 0.5.1, so the newer no-agent notice stays off.
  const noAgent = false;

  const configHelp = configsFailed ? (
    <FormattedMessage
      {...E.configsFailed}
      values={{
        retry: (chunks) => (
          <LinkButton tone="inline" onClick={loadConfigs}>
            {chunks}
          </LinkButton>
        ),
      }}
    />
  ) : (
    intl.formatMessage(E.configHelp)
  );

  const chooseCard = (
    <Card gap={16} aria-labelledby="v2-enroll-choose" className="v2-enroll__choose">
      <CardHeader number={1} title={intl.formatMessage(E.chooseTitle)} titleId="v2-enroll-choose" />
      <Field label={intl.formatMessage(E.fieldConfiguration)} help={configHelp}>
        <Select value={cfgId} onChange={(e) => setCfgId(e.target.value)} disabled={configs === null}>
          {configs === null ? (
            <option value={cfgId}>{intl.formatMessage(E.loadingConfigs)}</option>
          ) : (
            <>
              <option value="">{intl.formatMessage(E.serverSetting)}</option>
              {configsFailed && cfgId ? <option value={cfgId}>{intl.formatMessage(E.configNumbered, { id: cfgId })}</option> : null}
              {configs.map((c) => (
                <option key={String(c.id)} value={String(c.id)}>
                  {String(c.id) === defaultId ? intl.formatMessage(E.defaultSuffix, { name: c.name }) : c.name}
                </option>
              ))}
            </>
          )}
        </Select>
      </Field>

      <div className="v2-enroll__limits">
        <Field label={intl.formatMessage(E.fieldDevices)} help={devicesHelp}>
          <Select value={String(uses)} onChange={(e) => setUses(Number(e.target.value))}>
            {USES_OPTIONS.map((n) => (
              <option key={n} value={String(n)}>
                {n === 1 ? intl.formatMessage(E.usesOptionOne) : intl.formatMessage(E.usesOptionMany, { count: n })}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={intl.formatMessage(E.fieldValidFor)}>
          <Select value={String(validHours)} onChange={(e) => setValidHours(Number(e.target.value))}>
            {VALID_OPTIONS.map((o) => (
              <option key={o.hours} value={String(o.hours)}>
                {intl.formatMessage(o.label)}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="v2-enroll__wifi">
        <div className="v2-enroll__wifirow">
          <div className="v2-enroll__wifitext">
            <span id="v2-enroll-wifi" className="v2-enroll__wifilabel">
              {intl.formatMessage(E.wifiJoin)}
            </span>
            <span id="v2-enroll-wifi-help" className="v2-enroll__help">
              {intl.formatMessage(E.wifiJoinHelp)}
            </span>
          </div>
          <Toggle
            checked={wifiOn}
            onChange={setWifiOn}
            showState={false}
            aria-labelledby="v2-enroll-wifi"
            aria-describedby="v2-enroll-wifi-help"
          />
        </div>
        {wifiOn ? (
          <>
            <div className="v2-enroll__wifigrid">
              <Field label={intl.formatMessage(E.wifiName)}>
                <Input
                  value={wifiSsid}
                  onChange={(e) => setWifiSsid(e.target.value)}
                  placeholder="Office-WiFi"
                  autoComplete="off"
                  spellCheck={false}
                />
              </Field>
              <Field label={intl.formatMessage(E.wifiSecurity)}>
                <Select
                  value={wifiSec}
                  aria-describedby={wifiIssue ? 'v2-enroll-wifi-issue' : undefined}
                  onChange={(e) => setWifiSec(e.target.value as WifiSecurity)}
                >
                  <option value="WPA">{intl.formatMessage(E.wifiWpa)}</option>
                  <option value="WEP">{intl.formatMessage(E.wifiWep)}</option>
                  <option value="NONE">{intl.formatMessage(E.wifiOpen)}</option>
                  {wifiSec === 'EAP' ? <option value="EAP">{intl.formatMessage(E.wifiEap)}</option> : null}
                </Select>
              </Field>
              {wifiSec !== 'NONE' ? (
                <Field label={intl.formatMessage(E.wifiPassword)} className="v2-enroll__wide">
                  <Input
                    type="password"
                    value={wifiPass}
                    onChange={(e) => setWifiPass(e.target.value)}
                    autoComplete="new-password"
                    aria-describedby={wifiIssue ? 'v2-enroll-wifi-issue' : undefined}
                  />
                </Field>
              ) : null}
            </div>
            {/* One live region for both notes, there while Wi-Fi is on: a note that appears or changes as the admin
                types is read out, which a region created with its text often is not. */}
            <div role="status" id={wifiIssue ? 'v2-enroll-wifi-issue' : undefined} className="v2-enroll__wifinote">
              {wifiIssue ? (
                <Callout tone="warn" icon={<IconWarning size={16} />}>
                  {wifiIssue}
                </Callout>
              ) : wifiSec !== 'NONE' ? (
                <Callout tone="warn" icon={<IconWarning size={16} />}>
                  {intl.formatMessage(E.wifiPasswordWarning)}
                </Callout>
              ) : null}
            </div>
            <span className="v2-enroll__help">
              {intl.formatMessage(E.wifiFrom, { hasFrom: String(!!wifiFrom), name: wifiFrom ?? '' })}
            </span>
          </>
        ) : null}
      </div>
    </Card>
  );

  // A QR code holds at most QR_MAX_BYTES: a larger code can't be drawn, and reloading wouldn't help, so say why.
  const payloadBytes = payload ? qrPayloadBytes(payload) : 0;
  const tooLarge = payloadBytes > QR_MAX_BYTES;
  const qrPanel = noAgent ? (
    <div className="v2-qr">
      <div className="v2-qr__frame v2-enroll__qrwait" role="status">
        {intl.formatMessage(E.noAgentFrame)}
      </div>
    </div>
  ) : tooLarge ? (
    <div className="v2-qr">
      <div className="v2-qr__frame v2-enroll__qrwait" role="status">
        {intl.formatMessage(qrSizeMessages.tooLargeFrame)}
      </div>
    </div>
  ) : payload && !expired ? (
      <QrPanel
        value={payload}
        label={intl.formatMessage(E.qrLabel, { name: givesName })}
        onNewCode={newCode}
        newCodeBusy={busy}
        fullScreenTitle={intl.formatMessage(E.qrFullTitle, { name: givesName })}
        fullScreenNote={intl.formatMessage(E.qrFullNote, {
          maxUses: token?.maxUses ?? 1,
          hasExpiry: String(!!token?.expiresAt),
          when: token?.expiresAt ? fmtExpiry(intl, token.expiresAt) : '',
        })}
      />
    ) : (
      <div className="v2-qr">
        <div className="v2-qr__frame v2-enroll__qrwait" role="status">
          {busy ? (
            <>
              <Skeleton height="100%" className="v2-enroll__qrskel" />
              <span className="v2-visually-hidden">{intl.formatMessage(E.makingCode)}</span>
            </>
          ) : expired ? (
            intl.formatMessage(E.codeExpired)
          ) : (
            intl.formatMessage(E.noCodeYet)
          )}
        </div>
        <div className="v2-qr__actions">
          <Button icon={<IconSync size={14} />} onClick={newCode} disabled={busy}>
            {intl.formatMessage(busy ? E.makingCode : E.newCode)}
          </Button>
        </div>
      </div>
    );

  const enrollCard = (
    <Card gap={16} aria-labelledby="v2-enroll-device" className="v2-enroll__device">
      <CardHeader
        number={2}
        title={intl.formatMessage(E.enrollTitle)}
        titleId="v2-enroll-device"
        actions={
          <Tabs
            size="md"
            idBase={METHOD_TABS}
            aria-label={intl.formatMessage(E.methodLabel)}
            value={method}
            onChange={setMethod}
            items={[
              { key: 'qr', label: intl.formatMessage(E.methodQr) },
              { key: 'token', label: intl.formatMessage(E.methodToken) },
            ]}
          />
        }
      />
      {noAgent ? (
        <Callout tone="alert" icon={<IconAlert />} role="status">
          <FormattedMessage {...E.noAgentCallout} values={MONO} />
        </Callout>
      ) : null}
      {tooLarge ? (
        <Callout tone="alert" icon={<IconAlert />} role="status">
          {intl.formatMessage(qrTooLarge, { bytes: payloadBytes, max: QR_MAX_BYTES })}
        </Callout>
      ) : payloadBytes > QR_DENSE_BYTES ? (
        <Callout tone="warn" icon={<IconWarning size={16} />} role="status">
          {intl.formatMessage(qrDense, { bytes: payloadBytes })}
        </Callout>
      ) : null}
      {/* Pre-flight problems, not failures: amber (nothing has gone wrong yet; the admin can still fix it here). */}
      {address ? (
        <Callout tone="warn" icon={<IconWarning size={16} />} role="status">
          {address.text}
        </Callout>
      ) : null}
      {tokError ? (
        <Callout tone="alert" role="alert" icon={<IconAlert />} className="v2-errorstate">
          <span className="v2-errorstate__text">{tokError}</span>
          <Button size="sm" onClick={newCode} disabled={busy}>
            {intl.formatMessage(E.retry)}
          </Button>
        </Callout>
      ) : null}
      {expired && !busy ? (
        <Callout tone="warn" icon={<IconWarning size={16} />} role="status">
          {intl.formatMessage(E.expiredCallout)}
        </Callout>
      ) : null}
      {replaced && !(replaced.until && replaced.until <= now) ? (
        <Callout tone="warn" icon={<IconWarning size={16} />} role="status">
          {replacedText(intl, replaced)}{' '}
          <LinkButton tone="inline" onClick={openStop}>
            {intl.formatMessage(E.stopAllCodes)}
          </LinkButton>
        </Callout>
      ) : null}
      <TabPanel idBase={METHOD_TABS} tabKey={method} className="v2-enroll__panel">
        {method === 'qr' ? (
          <div className="v2-enroll__qrtab">
            <div className="v2-enroll__cols">
              {qrPanel}
              <KeyValueList variant="facts" items={facts(true)} className="v2-enroll__facts" />
            </div>
            <details className="v2-enroll__how">
              <summary>{intl.formatMessage(E.howToScan)}</summary>
              <NumberedSteps steps={qrSteps(intl, wifiInCode)} />
            </details>
          </div>
        ) : (
          <div className="v2-enroll__token">
            {token && !expired ? (
              <Field label={intl.formatMessage(E.tokenLabel)}>
                <CopyField
                  value={token.value}
                  onCopied={() => toast.push('ok', intl.formatMessage(E.tokenCopiedTitle), intl.formatMessage(E.tokenCopiedBody))}
                />
              </Field>
            ) : busy ? (
              <div role="status" className="v2-enroll__tokenwait">
                <Skeleton height="control" />
                <span className="v2-visually-hidden">{intl.formatMessage(E.makingToken)}</span>
              </div>
            ) : (
              <span className="v2-enroll__tokenwait" role="status">
                {intl.formatMessage(expired ? E.tokenExpired : E.noTokenYet)}
              </span>
            )}
            <div>
              <Button icon={<IconSync size={14} />} onClick={newCode} disabled={busy}>
                {intl.formatMessage(busy && token ? E.makingToken : E.newToken)}
              </Button>
            </div>
            <KeyValueList variant="facts" items={facts(false)} />
            <p className="v2-enroll__note">
              <FormattedMessage {...E.tokenNote} values={MONO} />
            </p>
          </div>
        )}
      </TabPanel>
      {/* Not the list: a look every 5 s would re-read all of it. Each new device or change of state, once. */}
      <div className="v2-visually-hidden" role="status">
        {arrivalSaid.map((n) => (
          <p key={n.id}>{n.text}</p>
        ))}
      </div>
    </Card>
  );

  const arrivalsCard = (
    <Card gap={12} aria-labelledby="v2-enroll-arrivals" className="v2-enroll__arrivals">
      <div className="v2-cardhead">
        <div className="v2-cardhead__text">
          <h2 id="v2-enroll-arrivals" className="v2-cardhead__title v2-enroll__arrivalshead" tabIndex={-1} ref={arrivalsHead}>
            {intl.formatMessage(E.arrivalsTitle)}
          </h2>
        </div>
      </div>
      {!watching ? (
        <span className="v2-enroll__help">
          {intl.formatMessage(E.stoppedLooking)}{' '}
          <LinkButton tone="inline" onClick={lookAgain}>
            {intl.formatMessage(E.lookAgain)}
          </LinkButton>
        </span>
      ) : null}
      {arrivals.length === 0 ? (
        watching ? (
          <span className="v2-enroll__help">{intl.formatMessage(E.noDeviceYet)}</span>
        ) : null
      ) : (
        <ul className="v2-enroll__arrivallist" aria-labelledby="v2-enroll-arrivals">
          {arrivals.map((a) => (
            <li key={a.number}>
              <Link to={paths.device(a.number)}>{a.name}</Link>
              <span className={`v2-enroll__arrival v2-enroll__arrival--${a.state}`}>{arrivalLabel(a.state, intl)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );

  const codesCard = (
    <Card gap={12} aria-labelledby="v2-enroll-codes" className="v2-enroll__codes">
      <CardHeader
        title={intl.formatMessage(E.codesTitle)}
        titleId="v2-enroll-codes"
        actions={
          <Button size="sm" variant="danger" onClick={openStop}>
            {intl.formatMessage(E.stopAllCodes)}
          </Button>
        }
      />
      <span className="v2-enroll__help">{intl.formatMessage(E.codesHelp)}</span>
      {!RELEASE_BUILD ? (
        <Callout tone="warn" icon={<IconWarning size={16} />}>
          {intl.formatMessage(E.debugAgent)}
        </Callout>
      ) : null}
      <dl className="v2-enroll__foot">
        <div>
          <dt>{intl.formatMessage(E.footServer)}</dt>
          <dd className="v2-mono">{serverBaseUrl()}</dd>
        </div>
        <div>
          <dt>{intl.formatMessage(E.footAgent)}</dt>
          <dd className="v2-mono">{agentApkUrl()}</dd>
        </div>
        {agentVersion ? (
          <div>
            <dt>{intl.formatMessage(E.footVersion)}</dt>
            <dd>{agentVersion}</dd>
          </div>
        ) : null}
      </dl>
    </Card>
  );

  // Devices enrolled with a code from this page show once there is a code, on a server that can list them.
  const showArrivals = since != null && !arrivalsUnsupported;
  const setupCells = [
    <GridCell key="choose" span={6}>
      {chooseCard}
    </GridCell>,
    <GridCell key="enroll" span={6}>
      {enrollCard}
    </GridCell>,
  ];

  return (
    <>
      <PageHeader title={intl.formatMessage(E.pageTitle)} subtitle={intl.formatMessage(E.pageSubtitle)} />
      <Grid className="v2-enroll">
        {/* QR first on phones: the person is usually holding the device to scan. */}
        {mobile ? setupCells.reverse() : setupCells}
        {showArrivals ? <GridCell span={6}>{arrivalsCard}</GridCell> : null}
        <GridCell span={showArrivals ? 6 : 12}>{codesCard}</GridCell>
      </Grid>
      <Modal
        open={stopOpen}
        size="sm"
        role="alertdialog"
        title={intl.formatMessage(E.stopModalTitle)}
        description={intl.formatMessage(E.stopModalBody)}
        onClose={() => {
          if (!stopping) setStopOpen(false);
        }}
        footer={
          <>
            <Button size="lg" disabled={stopping} onClick={() => setStopOpen(false)}>
              {intl.formatMessage(E.cancel)}
            </Button>
            <Button size="lg" variant="danger-primary" disabled={stopping} onClick={() => void stopAll()}>
              {intl.formatMessage(stopping ? E.stopping : E.stopAllCodes)}
            </Button>
          </>
        }
      >
        {stopError ? (
          <Callout tone="alert" role="alert">
            {stopError}
          </Callout>
        ) : null}
      </Modal>
    </>
  );
}
