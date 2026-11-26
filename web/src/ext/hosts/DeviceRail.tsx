import { useIntl } from 'react-intl';
import { KeyValueGroup, type KeyValueItem } from '../../ui/KeyValueList';
import { coreRailMessages } from '../core/device';
import { ExtensionBoundary } from '../ExtensionBoundary';
import { safeCall } from '../safeCall';
import { useContributions } from '../useContributions';
import { useDevice } from '../useDevice';

/**
 * The rail groups of the device page, in order. `items` runs through safeCall (a throw leaves the group out), and
 * each group renders in its own boundary, so a value React cannot render breaks only that group.
 */
export function DeviceRailGroups() {
  const device = useDevice();
  const intl = useIntl();
  const groups = useContributions('device.railGroup')
    .map((entry) => {
      const items: unknown = safeCall(entry.contribution.items, [device], [], `${entry.key}.items`);
      return { entry, items: Array.isArray(items) ? (items as KeyValueItem[]) : [] };
    })
    .filter((g) => g.items.length > 0);
  return groups.map(({ entry, items }, i) => {
    // Core's group titles in the console's language; an extension's as it gives it.
    const core = entry.extension.core ? coreRailMessages[entry.contribution.id] : undefined;
    return (
      <ExtensionBoundary key={`${device.device.number}:${entry.key}`} entry={entry}>
        <KeyValueGroup title={core ? intl.formatMessage(core) : entry.contribution.title} items={items} last={i === groups.length - 1} />
      </ExtensionBoundary>
    );
  });
}
