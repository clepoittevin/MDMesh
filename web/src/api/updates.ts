// Update status from the decoupled supervisor. NOT under /rest — it's served at the origin by Caddy
// (handle /update/* → supervisor), independent of the Java server.

/** Live state of an in-progress (or last) apply. Phases: authorizing→backup→pull→recreate→
 *  healthcheck→done; failures end at rollback→rolled_back or failed. */
export interface ApplyState {
  phase: string;
  fromVersion: string;
  toVersion: string;
  trigger: 'manual' | 'auto';
  startedAt: number;
  finishedAt: number | null;
  error: string | null;
}

export interface UpdateStatus {
  current: string;
  latest: string | null;
  updateAvailable: boolean;
  verified: boolean;
  channel: string | null;
  checkedAt: number | null;
  error: string | null;
  apply: ApplyState | null;
  auto: boolean;
  /** The release automatic updates will not apply again (its update failed or was rolled back), from the
   *  supervisor's auto.json `skipVersion`. A manual Update still applies it; a newer release still auto-applies. */
  autoSkipped?: string | null;
  /** False on deployments that can't self-apply (native installs) — hide apply/auto controls.
   *  Absent (older supervisor) means supported. */
  applySupported?: boolean;
  /** The mirrored agent APK for the latest verified release (for device rollouts), or null. */
  apk: { version: string; versionCode: number; sha256: string; available: boolean } | null;
  /** The security releases the offered update skips over (newer than `current`, older than `latest`), oldest first,
   *  from the verified manifest's securityReleases. Empty when nothing is skipped or the manifest isn't verified;
   *  absent from a supervisor before 0.5.0. */
  missedSecurity?: string[];
  /** Release notes / link / date for the picked release, or null when there's no release. */
  release: { notes: string | null; url: string | null; publishedAt: string | null } | null;
}

/** Phases that mean an apply has settled and the UI should stop spinning. */
export const APPLY_TERMINAL = ['done', 'rolled_back', 'failed'];
export const isApplyTerminal = (p?: string | null): boolean => !!p && APPLY_TERMINAL.includes(p);

export async function getUpdateStatus(): Promise<UpdateStatus | null> {
  try {
    const r = await fetch('/update/status', { headers: { Accept: 'application/json' } });
    if (!r.ok) return null;
    return (await r.json()) as UpdateStatus;
  } catch {
    return null; // supervisor not reachable (e.g. dev without the stack) → no banner
  }
}

/** Force an on-demand poll of GitHub and return the refreshed status (authz'd + rate-limited server-side). */
export async function checkForUpdates(): Promise<UpdateStatus | null> {
  try {
    const r = await fetch('/update/check', {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json', 'X-MDMesh-Console': '1' },
    });
    return r.ok ? ((await r.json()) as UpdateStatus) : null;
  } catch {
    return null;
  }
}

/**
 * How an apply or auto-update toggle went. On failure `error` is the supervisor's own text, when its body has one;
 * otherwise `httpStatus` says why (0: the request didn't reach it) and the screen words it.
 */
export interface UpdateActionResult {
  ok: boolean;
  error?: string;
  httpStatus?: number;
}

/** A refused request's result: the body's `error` text if it sent one, and the status either way. */
async function refused(r: Response): Promise<UpdateActionResult> {
  const body = await r.json().catch(() => ({}));
  const error = (body as { error?: unknown }).error;
  return { ok: false, error: typeof error === 'string' && error ? error : undefined, httpStatus: r.status };
}

/** Kick off a one-click apply. credentials:'include' forwards JSESSIONID for the supervisor's authz. */
export async function applyUpdate(): Promise<UpdateActionResult> {
  try {
    const r = await fetch('/update/apply', { method: 'POST', credentials: 'include', headers: { Accept: 'application/json', 'X-MDMesh-Console': '1' } });
    if (r.status === 202) return { ok: true };
    return await refused(r);
  } catch {
    return { ok: false, httpStatus: 0 };
  }
}

/** Toggle unattended ("automatic") updates. */
export async function setAutoUpdate(auto: boolean): Promise<UpdateActionResult> {
  try {
    const r = await fetch('/update/auto', {
      method: 'POST', credentials: 'include',
      headers: { 'content-type': 'application/json', Accept: 'application/json', 'X-MDMesh-Console': '1' },
      body: JSON.stringify({ auto }),
    });
    if (r.ok) return { ok: true };
    return await refused(r);
  } catch {
    return { ok: false, httpStatus: 0 };
  }
}
