import { queueCommand, listCommandHistory, type QueueCommandRequest } from './commands';

// Device app inventory for the kiosk picker. The agent answers `apps.scan` / `apps.icons`
// commands and returns the data as JSON in the command-result `detail`; we read it back from
// the command-history endpoint we already poll — so there is no dedicated server API.

export interface AppInfo {
  pkg: string;
  label: string;
  system?: boolean;
  launchable?: boolean;
  versionName?: string;
  versionCode?: number;
}

/** A scan result's app list, from device-supplied JSON: entries without a package name are dropped. */
function toApps(v: unknown): AppInfo[] {
  if (!Array.isArray(v)) return [];
  return v.filter((a): a is AppInfo => !!a && typeof a === 'object' && typeof (a as AppInfo).pkg === 'string' && !!(a as AppInfo).pkg);
}

/**
 * Why an app scan or icon fetch stopped, for the screen to word (data/deviceApps deviceAppsErrorText): the command
 * wasn't queued, the caller cancelled, the device didn't answer in time, the device reported a failure (`detail` is
 * its own text, if it sent any), its result wasn't JSON, or the icon batches ran past their overall cap.
 */
export type DeviceAppsErrorCode = 'notQueued' | 'cancelled' | 'timedOut' | 'deviceFailed' | 'badResult' | 'iconsTooSlow';

/** An app scan / icon fetch failure; `message` stays the English it always was. */
export class DeviceAppsError extends Error {
  constructor(
    readonly code: DeviceAppsErrorCode,
    message: string,
    /** For deviceFailed: the command's final status (failed, unsupported, expired). */
    readonly commandStatus?: string,
    /** For deviceFailed: the device's own reason, when it sent one. */
    readonly detail?: string,
  ) {
    super(message);
    this.name = 'DeviceAppsError';
  }
}

/** A device-supplied result, parsed; a body that isn't JSON is a badResult. */
function parseResult<T>(detail: string): T | null {
  try {
    return JSON.parse(detail || '{}') as T | null;
  } catch {
    throw new DeviceAppsError('badResult', 'The device sent a result that could not be read');
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Queue a command and poll command history until it completes, returning its result `detail`. */
async function runForResult(
  deviceId: number | string,
  req: QueueCommandRequest,
  timeoutMs = 75000,
  signal?: AbortSignal,
): Promise<string> {
  const queued = await queueCommand(deviceId, req, signal);
  const id = queued?.id;
  if (id == null) throw new DeviceAppsError('notQueued', 'Command was not queued');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (signal?.aborted) throw new DeviceAppsError('cancelled', 'Cancelled');
    await sleep(1500);
    if (signal?.aborted) throw new DeviceAppsError('cancelled', 'Cancelled');
    const hist = await listCommandHistory(deviceId, 0, signal).catch(() => []);
    const cmd = hist.find((c) => String(c.id) === String(id));
    if (!cmd) continue;
    if (cmd.status === 'done') return cmd.detail ?? '';
    if (cmd.status === 'failed' || cmd.status === 'unsupported' || cmd.status === 'expired') {
      throw new DeviceAppsError('deviceFailed', cmd.detail || `Device returned ${cmd.status}`, cmd.status, cmd.detail || undefined);
    }
  }
  throw new DeviceAppsError('timedOut', 'Timed out waiting for the device (is it online?)');
}

/** Scan the device for installed packages (metadata only — no icons). */
export async function scanApps(deviceId: number | string, signal?: AbortSignal): Promise<AppInfo[]> {
  const detail = await runForResult(deviceId, { type: 'apps.scan' }, 75000, signal);
  const parsed = parseResult<{ apps?: unknown }>(detail);
  return toApps(parsed?.apps);
}

export interface ScanSnapshot {
  apps: AppInfo[];
  scannedAt?: number;
}

/**
 * The device's most recent saved scan, read from command history (every apps.scan result is
 * durably stored per device in the command's detail). Returns null if the device was never scanned,
 * so the picker can show the saved list instantly instead of re-scanning every time.
 */
export async function getLatestScan(deviceId: number | string): Promise<ScanSnapshot | null> {
  const hist = await listCommandHistory(deviceId).catch(() => []); // newest-first (id DESC)
  const scan = hist.find((c) => c.type === 'apps.scan' && c.status === 'done' && !!c.detail);
  if (!scan?.detail) return null;
  try {
    const apps = toApps((JSON.parse(scan.detail) as { apps?: unknown } | null)?.apps);
    return apps.length ? { apps, scannedAt: scan.completedAt } : null;
  } catch {
    return null;
  }
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Overall cap across all icon batches — on top of the per-command timeout. */
const ICONS_DEADLINE_MS = 3 * 60 * 1000;

/** Fetch base64-PNG icons for the given packages, in batches. Returns a pkg→dataURL map. */
export async function fetchIcons(
  deviceId: number | string,
  packages: string[],
  onBatch?: (icons: Record<string, string>) => void,
  signal?: AbortSignal,
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const deadline = Date.now() + ICONS_DEADLINE_MS;
  for (const batch of chunk(packages, 24)) {
    const left = deadline - Date.now();
    if (left <= 0) throw new DeviceAppsError('iconsTooSlow', 'Icon fetch took too long — try again');
    const detail = await runForResult(deviceId, {
      type: 'apps.icons',
      payload: JSON.stringify({ packages: batch }),
    }, Math.min(75000, left), signal);
    const parsed = parseResult<{ icons?: Array<{ pkg: string; pngBase64: string }> }>(detail);
    const got: Record<string, string> = {};
    for (const ic of parsed?.icons ?? []) got[ic.pkg] = `data:image/png;base64,${ic.pngBase64}`;
    Object.assign(out, got);
    onBatch?.(got);
  }
  return out;
}
