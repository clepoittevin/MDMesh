// Devices: the "Only unnamed devices" filter keeps the devices without a name (none, or only spaces), and counts as a
// filter on the Filter button, and stays on while a search finds none of them. Through the real route, against a
// stubbed API.
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

  it('stays on, with nothing listed, while a search matches only named devices', async () => {
    const fetch = stubApi((path, init) => {
      if (path.endsWith('/devices/search')) {
        const value = (JSON.parse(String(init?.body)) as { value: string }).value;
        const items = value ? DEVICES.filter((d) => d.description === value) : DEVICES;
        return { devices: { items, totalItemsCount: items.length } };
      }
      if (path.endsWith('/configurations/search')) return [];
      return null;
    });
    const searched = (value: string) =>
      fetch.mock.calls.some(
        ([path, init]) => String(path).endsWith('/devices/search') && (JSON.parse(String(init?.body)) as { value: string }).value === value,
      );
    renderInConsole(<AppRoutes />, { path: '/devices' });
    await main().findByText('Reception', undefined, LOAD);
    await settled();

    fireEvent.click(main().getByRole('button', { name: 'Filter' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: /Only unnamed devices/ }));
    await waitFor(() => expect(main().queryByText('Reception')).toBeNull());

    // The server's answer holds one named device and no unnamed one.
    const search = main().getByRole('searchbox', { name: 'Search devices' });
    fireEvent.change(search, { target: { value: 'Reception' } });
    await waitFor(() => expect(searched('Reception')).toBe(true), LOAD);
    await settled();
    expect(main().queryByText('Reception')).toBeNull();
    expect(main().getByRole('button', { name: 'Filter, 1 on' })).toBeTruthy();
    // Still there to turn off, though it counts no device.
    const only = screen.getByRole('checkbox', { name: /Only unnamed devices/ }) as HTMLInputElement;
    expect(only.checked).toBe(true);
    expect(only.closest('label')?.textContent?.trim()).toMatch(/^Only unnamed devices 0Devices/);

    // Without the search, the unnamed devices are back, still filtered.
    fireEvent.change(search, { target: { value: '' } });
    await waitFor(() => expect(main().getAllByText('UNNAMED-2').length).toBeGreaterThan(0), LOAD);
    await settled();
    expect(main().queryByText('Reception')).toBeNull();
    expect(main().getByRole('button', { name: 'Filter, 1 on' })).toBeTruthy();

    // Turned off with no unnamed device in the list, it goes: nothing to filter on.
    fireEvent.change(search, { target: { value: 'Reception' } });
    await screen.findByRole('checkbox', { name: /Only unnamed devices 0/ }, LOAD);
    await settled();
    fireEvent.click(screen.getByRole('checkbox', { name: /Only unnamed devices/ }));
    await main().findByText('Reception', undefined, LOAD);
    expect(screen.queryByRole('checkbox', { name: /Only unnamed devices/ })).toBeNull();
  }, 30_000);
});
