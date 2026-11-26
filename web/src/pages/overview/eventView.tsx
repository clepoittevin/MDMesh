import type { ReactNode } from 'react';
import type { IntlShape } from 'react-intl';
import type { DeviceView } from '../../api/devices';
import type { DeviceEvent } from '../../api/events';
import { eventVerb, parseCommandResult } from '../../data/deviceActivity';
import {
  IconAlert,
  IconBattery,
  IconCheck,
  IconDownload,
  IconInfo,
  IconLock,
  IconNetwork,
  IconPlus,
  IconPower,
  IconTrash,
  type StatusTone,
} from '../../ui';

/**
 * How the Overview's recent activity shows a device event: icon, tone, verb phrase and detail. The verb phrase is in
 * the console's language when the caller passes its `intl` (useIntl()), else in English.
 */
export function eventView(
  ev: DeviceEvent,
  device: DeviceView,
  appNames: Record<string, string>,
  intl?: IntlShape,
): { icon: ReactNode; tone: StatusTone; what: string; detail?: string } {
  const what = eventVerb(ev.type, intl);
  // Classic: the event detail, else the device description.
  const detail = ev.detail || device.description || undefined;
  switch (ev.type) {
    case 'enrolled':
      return { icon: <IconPlus size={15} />, tone: 'ok', what, detail };
    case 'appInstalled':
    case 'appUninstalled': {
      // Detail is the package name; show the library name when the app is in the library.
      const pkg = ev.detail?.trim() ?? '';
      const name = pkg ? appNames[pkg] : undefined;
      return {
        icon: ev.type === 'appInstalled' ? <IconDownload size={15} /> : <IconTrash size={15} />,
        tone: 'idle',
        what,
        detail: name ?? detail,
      };
    }
    case 'commandResult': {
      const r = parseCommandResult(ev.detail);
      if (!r) return { icon: <IconCheck size={15} />, tone: 'idle', what, detail };
      const s = r.status.toLowerCase();
      const tone: StatusTone = s === 'done' ? 'ok' : s === 'failed' ? 'alert' : s === 'expired' ? 'warn' : 'idle';
      return {
        icon: tone === 'alert' ? <IconAlert size={15} /> : <IconCheck size={15} />,
        tone,
        what,
        detail: `#${r.id} · ${r.status}`,
      };
    }
    case 'lowBattery':
      return { icon: <IconBattery size={15} />, tone: 'warn', what, detail };
    case 'connectivityChange':
      return { icon: <IconNetwork size={15} />, tone: 'idle', what, detail };
    case 'boot':
      return { icon: <IconPower size={15} />, tone: 'idle', what, detail };
    case 'kioskPinLockout':
      return { icon: <IconLock size={15} />, tone: 'alert', what, detail };
    case 'kioskCrashLoop':
    case 'wipeNotStarted':
    case 'storageRecovered':
    case 'configReapplyFailed':
      return { icon: <IconAlert size={15} />, tone: 'warn', what, detail };
    default:
      return { icon: <IconInfo size={15} />, tone: 'idle', what, detail };
  }
}
