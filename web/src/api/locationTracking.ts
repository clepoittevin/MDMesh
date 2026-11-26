import { useEffect, useState } from 'react';
import { defineMessage } from 'react-intl';
import { getConfiguration } from './configurations';

/** Shown wherever location is offered on a device whose configuration does not track it. */
export const doNotTrackHintMessage = defineMessage({
  id: 'deviceDetail.location.doNotTrackHint',
  defaultMessage:
    "This device's configuration is set to Location reporting: Do not track, so no location is read or stored. Change it in the configuration to track this device.",
});

/** The same in English (doNotTrackHintMessage is what the console shows). */
export const DO_NOT_TRACK_HINT: string = doNotTrackHintMessage.defaultMessage as string;

/**
 * True when the device's configuration is "Do not track" (since v0.3.4 the agent then reads no location and the
 * server stores none, so per-device location modes have no effect). Null while unknown or on error.
 */
export function useDoNotTrack(configurationId?: number | null): boolean | null {
  const [value, setValue] = useState<boolean | null>(null);
  useEffect(() => {
    setValue(null);
    if (configurationId == null) return;
    let active = true;
    getConfiguration(configurationId)
      .then((cfg) => { if (active) setValue((cfg.requestUpdates ?? 'DONOTTRACK') === 'DONOTTRACK'); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [configurationId]);
  return value;
}
