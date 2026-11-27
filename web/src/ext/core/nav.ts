import { defineMessages, type MessageDescriptor } from 'react-intl';
import { paths } from '../../routes';
import { IconApps, IconConfigurations, IconDevices, IconEnroll, IconOverview, IconSettings } from '../../ui/icons';
import type { NavItemContribution } from '../types';
import { DeviceCountBadge } from './DeviceCountBadge';
import { ORDER } from './order';

/** The sidebar. Who sees an item follows its page's permission (core/access.ts). */
export const CORE_NAV: readonly NavItemContribution[] = [
  { slot: 'nav.item', id: 'overview', order: ORDER.navItem.overview, label: 'Overview', icon: IconOverview, to: paths.overview },
  {
    slot: 'nav.item',
    id: 'devices',
    order: ORDER.navItem.devices,
    label: 'Devices',
    icon: IconDevices,
    to: paths.devices,
    badge: DeviceCountBadge,
  },
  {
    slot: 'nav.item',
    id: 'configurations',
    order: ORDER.navItem.configurations,
    label: 'Configurations',
    icon: IconConfigurations,
    to: paths.configurations,
  },
  { slot: 'nav.item', id: 'apps', order: ORDER.navItem.apps, label: 'Apps', icon: IconApps, to: paths.apps },
  { slot: 'nav.item', id: 'enroll', order: ORDER.navItem.enroll, label: 'Enroll', icon: IconEnroll, to: paths.enroll },
  { slot: 'nav.item', id: 'settings', order: ORDER.navItem.settings, label: 'Settings', icon: IconSettings, to: paths.settings },
];

/**
 * The sidebar labels as messages, by contribution id (a core item's `label` stays its English text, which is part of
 * the registry's data; the sidebar shows the message for a core item).
 */
export const coreNavMessages: Readonly<Record<string, MessageDescriptor>> = defineMessages({
  overview: { id: 'shell.nav.overview', defaultMessage: 'Overview' },
  devices: { id: 'shell.nav.devices', defaultMessage: 'Devices' },
  configurations: { id: 'shell.nav.configurations', defaultMessage: 'Configurations' },
  apps: { id: 'shell.nav.apps', defaultMessage: 'Apps' },
  enroll: { id: 'shell.nav.enroll', defaultMessage: 'Enroll' },
  settings: { id: 'shell.nav.settings', defaultMessage: 'Settings' },
});
