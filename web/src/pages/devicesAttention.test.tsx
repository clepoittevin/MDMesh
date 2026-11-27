// The Devices page's "need attention" banner while the configuration check is partial (a device's state could not be
// read): the count is a lower bound, shown as "2+". Rendered through the real routes, against a stubbed API, in
// English and with the shipped French catalog.
import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AppRoutes } from '../App';
import { LOCALE_KEY } from '../i18n/locales';
import { renderInConsole, settled, stubApi } from '../test/console';

const NOW = Date.now();
const DEVICES = [
  { id: 1, number: 'WH-1', description: 'Front desk', configurationId: 3, lastUpdate: NOW },
  { id: 2, number: 'WH-2', description: 'Back office', configurationId: 3, lastUpdate: NOW },
  { id: 3, number: 'WH-3', description: 'Dock', configurationId: 3, lastUpdate: NOW },
];

/** Three online devices on one configuration: two answer out of sync, and WH-3's state can't be read. */
function api(path: string): unknown {
  const p = new URL(path, 'http://console').pathname.replace('/rest/private', '');
  if (p === '/devices/search') {
    return { devices: { items: DEVICES, totalItemsCount: DEVICES.length }, configurations: { 3: { id: 3, name: 'Warehouse' } } };
  }
  if (p === '/configurations/search') return [{ id: 3, name: 'Warehouse' }];
  if (p === '/agent/v1/configurations/syncSummary') {
    return [{ configurationId: 3, total: 3, inSync: 0, outOfSync: 3, unsupported: 0, neverSeen: 0, deferred: 0 }];
  }
  if (p === '/agent/v1/devices/WH-3/configStatus') throw new Error('offline');
  if (p.endsWith('/configStatus')) {
    return { configurationId: 3, currentRevision: 'b', appliedRevision: 'a', inSync: false, supported: true };
  }
  return null;
}

afterEach(() => {
  document.documentElement.lang = '';
});

describe('the attention banner while the configuration check is partial', () => {
  it('counts "2+" in English', async () => {
    stubApi(api);
    renderInConsole(<AppRoutes />, { path: '/devices' });
    const banner = within(await screen.findByLabelText('Needs attention'));
    expect(banner.getByText('2+ need attention')).toBeTruthy();
    await settled();
  });

  it('counts "2+" in French, from the shipped catalog', async () => {
    localStorage.setItem(LOCALE_KEY, 'fr');
    stubApi(api);
    renderInConsole(<AppRoutes />, { path: '/devices' });
    const banner = within(await screen.findByLabelText('Nécessite une intervention'));
    expect(banner.getByText('2+ nécessitent une intervention')).toBeTruthy();
    expect(document.documentElement.lang).toBe('fr');
    await settled();
  });
});
