// Devices: the "Only unnamed devices" filter keeps the devices without a name (none, or only spaces), and counts as a
// filter on the Filter button. Through the real route, against a stubbed API.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppRoutes } from '../App';
import type { DeviceView } from '../api/devices';
import { renderInConsole, settled, stubApi } from '../test/console';

const LOAD = { timeout: 10_000 };
const NOW = Date.now();
const DEVICES: DeviceView[] = [
  { id: 1, number: 'D-1', description: 'Reception', lastUpdate: NOW },
  { id: 2, number: 'UNNAMED-2', lastUpdate: NOW },
  { id: 3, number: 'BLANK-3', description: '   ', lastUpdate: NOW },
  { id: 4, number: 'D-4', description: 'Office', lastUpdate: NOW },
  // Wiped: left out of All, so out of the count too.
  { id: 5, number: 'WIPED-5', lastUpdate: NOW, wipedAt: NOW },
];
const main = () => within(screen.getByRole('main'));

describe('Devices: only unnamed devices', () => {
  it('shows only devices with a blank name and counts as a filter', async () => {
    stubApi((path) => {
      if (path.endsWith('/devices/search')) return { devices: { items: DEVICES, totalItemsCount: DEVICES.length } };
      if (path.endsWith('/configurations/search')) return [];
      return null;
    });
    renderInConsole(<AppRoutes />, { path: '/devices' });
    await main().findByText('Reception', undefined, LOAD);
    await settled();

    fireEvent.click(main().getByRole('button', { name: 'Filter' }));
    const only = await screen.findByRole('checkbox', { name: /Only unnamed devices/ });
    expect(only.closest('label')?.textContent?.trim()).toMatch(/^Only unnamed devices 2Devices/);
    fireEvent.click(only);

    await waitFor(() => expect(main().queryByText('Reception')).toBeNull());
    expect(main().queryByText('Office')).toBeNull();
    expect(main().getAllByText('UNNAMED-2').length).toBeGreaterThan(0);
    expect(main().getAllByText('BLANK-3').length).toBeGreaterThan(0);
    expect(main().queryByText('WIPED-5')).toBeNull();
    expect(main().getByRole('button', { name: 'Filter, 1 on' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    await main().findByText('Reception', undefined, LOAD);
    expect(main().getByRole('button', { name: 'Filter' })).toBeTruthy();
  });
});
