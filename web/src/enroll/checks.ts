// Checks the Enroll page runs before an admin hands a QR code to a device. A device keeps the server address from the
// code for good (only a factory reset changes it), and a Wi-Fi it can't join stops setup at the Wi-Fi step, so both
// are caught here, where they can still be fixed, rather than on the device.

import { createIntl, defineMessage, defineMessages, type IntlShape } from 'react-intl';
import type { WifiConfig } from './provisioning';

/** Formats the messages below; the Enroll page passes its own (useIntl), so they follow the console's language. */
type Formatter = Pick<IntlShape, 'formatMessage'>;
const englishIntl: Formatter = createIntl({ locale: 'en' });

const addressMessages = {
  loopback: defineMessage<{ origin: string; hasServer: string; serverOrigin: string }>({
    id: 'enroll.checks.loopback',
    defaultMessage:
      "This console is open at {origin}, which only this computer can reach, so a device that scans this code can't enroll.{hasServer, select, true { Open the console at {serverOrigin} and make the code there.} other { Open the console at the server’s public https:// address and make the code there.}}",
  }),
  http: defineMessage<{ hasServer: string; serverOrigin: string }>({
    id: 'enroll.checks.http',
    defaultMessage:
      "This console is open over http://. Android 9 and later enroll only over https://, so most devices that scan this code can't reach the server.{hasServer, select, true { Open the console at {serverOrigin} and make the code there.} other { Open the console at its https:// address and make the code there.}}",
  }),
  otherAddress: defineMessage<{ origin: string; serverOrigin: string }>({
    id: 'enroll.checks.otherAddress',
    defaultMessage:
      "This console is open at {origin}, but the server's address is {serverOrigin}. The code gives devices {origin}, and they keep it until a factory reset. Open the console at {serverOrigin} and make the code there.",
  }),
  local: defineMessage<{ origin: string }>({
    id: 'enroll.checks.local',
    defaultMessage:
      'Devices that scan this code use {origin}, a local address: they enroll only on this network, and keep that address until a factory reset.',
  }),
};

const wifiMessages = defineMessages({
  eap: {
    id: 'enroll.checks.wifiEap',
    defaultMessage:
      "Enterprise (EAP) Wi-Fi can't be joined from a QR code, so it is left out: connect the device to Wi-Fi on its screen, or use a WPA or open network here.",
  },
  noPassword: {
    id: 'enroll.checks.wifiNoPassword',
    defaultMessage:
      'Enter the Wi-Fi password, or choose Open. Until then the network is left out of the code and the device asks for Wi-Fi on its screen.',
  },
  wpaLength: {
    id: 'enroll.checks.wifiWpaLength',
    defaultMessage:
      'A WPA password has 8 to 63 characters (or is a 64-digit hex key), so the device could not join with this one. It is left out of the code until it is fixed.',
  },
  wepKey: {
    id: 'enroll.checks.wifiWepKey',
    defaultMessage:
      'A WEP key has 5 or 13 characters, or 10 or 26 hex digits, so the device could not join with this one. It is left out of the code until it is fixed.',
  },
});

export interface AddressProblem {
  /**
   * blocks: devices that scan this code can't enroll; caution: only some can, or later moves will hurt. Both are
   * pre-flight problems (shown amber, not red: nothing has failed yet).
   */
  severity: 'blocks' | 'caution';
  text: string;
}

function hostOf(u: URL): string {
  return u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
}

function isLoopback(host: string): boolean {
  return host === 'localhost' || host.endsWith('.localhost') || host === '::1' || /^127\./.test(host) || host === '0.0.0.0';
}

function isPrivate(host: string): boolean {
  if (/^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) return true;
  // Carrier-grade NAT (100.64.0.0/10), which Tailscale also uses.
  const cg = /^100\.(\d+)\./.exec(host);
  if (cg && Number(cg[1]) >= 64 && Number(cg[1]) <= 127) return true;
  const m = /^172\.(\d+)\./.exec(host);
  if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return true;
  if (/^f[cd][0-9a-f]{2}:/.test(host) || /^fe80:/.test(host)) return true;
  return host.endsWith('.local') || host.endsWith('.lan') || host.endsWith('.internal') || (!host.includes('.') && !host.includes(':'));
}

/**
 * What is wrong with the address a code made here gives devices: `origin` is where this console is open (the code
 * carries it), `baseUrl` the server's own setting (`base.url`, null when unknown). null when nothing is.
 */
export function addressProblem(origin: string, baseUrl: string | null, intl: Formatter = englishIntl): AddressProblem | null {
  let here: URL;
  try {
    here = new URL(origin);
  } catch {
    return null;
  }
  const host = hostOf(here);
  let server: URL | null = null;
  try {
    server = baseUrl && baseUrl.trim() ? new URL(baseUrl.trim()) : null;
  } catch {
    server = null;
  }
  const serverOrigin = server && server.protocol.startsWith('http') ? server.origin : null;
  const otherServer = serverOrigin && serverOrigin !== here.origin ? serverOrigin : null;

  if (isLoopback(host)) {
    return {
      severity: 'blocks',
      text: intl.formatMessage(addressMessages.loopback, {
        origin: here.origin,
        hasServer: String(!!otherServer),
        serverOrigin: otherServer ?? '',
      }),
    };
  }
  if (here.protocol !== 'https:') {
    return {
      severity: 'blocks',
      text: intl.formatMessage(addressMessages.http, { hasServer: String(!!otherServer), serverOrigin: otherServer ?? '' }),
    };
  }
  if (serverOrigin && serverOrigin !== here.origin) {
    return {
      severity: 'caution',
      text: intl.formatMessage(addressMessages.otherAddress, { origin: here.origin, serverOrigin }),
    };
  }
  if (isPrivate(host)) {
    return {
      severity: 'caution',
      text: intl.formatMessage(addressMessages.local, { origin: here.origin }),
    };
  }
  return null;
}

/**
 * Why Wi-Fi from this form can't go into the code, or null. A QR code with a network the device can't join stops
 * setup at the Wi-Fi step; without one, the device asks for Wi-Fi on its screen.
 */
export function wifiProblem(wifi: WifiConfig | undefined, intl: Formatter = englishIntl): string | null {
  if (!wifi || !wifi.ssid.trim()) return null;
  const security = wifi.security ?? (wifi.password ? 'WPA' : 'NONE');
  if (security === 'EAP') {
    return intl.formatMessage(wifiMessages.eap);
  }
  if (security !== 'NONE' && !wifi.password) {
    return intl.formatMessage(wifiMessages.noPassword);
  }
  if (security === 'WPA' && wifi.password) {
    const p = wifi.password;
    const hexKey = p.length === 64 && /^[0-9a-fA-F]+$/.test(p);
    if (p.length < 8 || (p.length > 63 && !hexKey)) {
      return intl.formatMessage(wifiMessages.wpaLength);
    }
  }
  if (security === 'WEP' && wifi.password) {
    const p = wifi.password;
    const ok = p.length === 5 || p.length === 13 || ((p.length === 10 || p.length === 26) && /^[0-9a-fA-F]+$/.test(p));
    if (!ok) {
      return intl.formatMessage(wifiMessages.wepKey);
    }
  }
  return null;
}
