import { useCallback, useEffect, useRef, useState } from 'react';
import {
  searchDevices,
  type DeviceView,
  type ConfigurationLookup,
} from '../api/devices';
import { defineMessages, type IntlShape } from 'react-intl';
import { ApiError } from '../api/client';
import { untyped } from './configIntl';

export interface DevicesState {
  devices: DeviceView[];
  total: number;
  configurations: Record<string, ConfigurationLookup>;
  loading: boolean;
  error: string | null;
  /** The search value the shown list answers (the latest request's, once its answer is in). */
  query: string;
  /** Loads the list for `value`; an answer that arrives after a newer request's is dropped. */
  reload: (value?: string) => Promise<void>;
}

/** The generic load failure (no reason known): ErrorState says "Couldn't load …" without repeating it. */
export const LOAD_DEVICES_FAILED = 'Failed to load devices.';

const loadErrorMessages = untyped(defineMessages({
  failed: { id: 'devices.load.failed', defaultMessage: 'Failed to load devices.' },
  expired: { id: 'devices.load.sessionExpired', defaultMessage: 'Your session has expired. Sign in again.' },
  unreachable: { id: 'deviceDetail.page.cannotReach', defaultMessage: 'Cannot reach the server.' },
}));
const SESSION_EXPIRED = loadErrorMessages.expired.defaultMessage as string;
const UNREACHABLE = loadErrorMessages.unreachable.defaultMessage as string;

/** The error a device list load reports (English, as useDevices and the Overview's data give it). */
export function loadErrorOf(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.httpStatus === 401 || err.httpStatus === 403) return SESSION_EXPIRED;
    if (err.httpStatus === 0) return UNREACHABLE;
  }
  return LOAD_DEVICES_FAILED;
}

/** That error in the console's language; anything else (a server's own text) is shown as it came. */
export function loadErrorText(error: string, intl: IntlShape): string {
  if (error === LOAD_DEVICES_FAILED) return intl.formatMessage(loadErrorMessages.failed);
  if (error === SESSION_EXPIRED) return intl.formatMessage(loadErrorMessages.expired);
  if (error === UNREACHABLE) return intl.formatMessage(loadErrorMessages.unreachable);
  return error;
}

const messageFor = loadErrorOf;

export function useDevices(
  initialValue = '',
  pageSize = 1000,
): DevicesState {
  const [devices, setDevices] = useState<DeviceView[]>([]);
  const [total, setTotal] = useState(0);
  const [configurations, setConfigurations] = useState<
    Record<string, ConfigurationLookup>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState(initialValue);
  // Every request takes the next number; only the latest one's answer is applied, so a slow earlier search can
  // never overwrite a newer one (or a list loaded after unmount, which bumps it too).
  const seq = useRef(0);
  useEffect(() => () => void (seq.current += 1), []);

  const reload = useCallback(
    async (value = '') => {
      const mine = ++seq.current;
      setLoading(true);
      setError(null);
      try {
        const res = await searchDevices({ value, pageSize });
        if (mine !== seq.current) return;
        setDevices(res.devices?.items ?? []);
        setTotal(res.devices?.totalItemsCount ?? 0);
        setConfigurations(res.configurations ?? {});
        setQuery(value);
      } catch (err) {
        if (mine !== seq.current) return;
        setError(messageFor(err));
        setDevices([]);
        setTotal(0);
        setQuery(value);
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    },
    [pageSize],
  );

  useEffect(() => {
    void reload(initialValue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload]);

  return { devices, total, configurations, loading, error, query, reload };
}
