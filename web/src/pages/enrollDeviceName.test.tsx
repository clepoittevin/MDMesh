// Enroll: the optional device name goes into the code when the admin leaves the field or presses Enter, not as they
// type (each code made lives until it expires); a blank name sends nothing. Through the real route, against a stubbed
// API.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { chooseOption } from '../test/select';
import { describe, expect, it } from 'vitest';
import { AppRoutes } from '../App';
import { renderInConsole, settled, stubApi } from '../test/console';

const LOAD = { timeout: 10_000 };
const SLOW = 20_000;

/** Mints tokens tok-1, tok-2, …, echoing the name it was asked for (as a server with names does). */
function api() {
  let n = 0;
  return (path: string, init?: RequestInit): unknown => {
    const p = new URL(path, 'http://console').pathname.replace('/rest/private', '');
    if (p === '/configurations/search') return [];
    if (p === '/agent/v1/token' && init?.method === 'POST') {
      const body = JSON.parse(String(init.body ?? '{}')) as { maxUses?: number; deviceName?: string };
      n += 1;
      return {
        token: `tok-${n}`,
        expiresAt: Date.now() + 24 * 3600_000,
        maxUses: body.maxUses ?? 1,
        deviceName: body.deviceName ?? null,
      };
    }
    return null;
  };
}

const posts = (fetch: ReturnType<typeof stubApi>) =>
  fetch.mock.calls
    .filter(([input, init]) => String(input).endsWith('/agent/v1/token') && init?.method === 'POST')
    .map(([, init]) => JSON.parse(String(init?.body)) as Record<string, unknown>);
const main = () => within(screen.getByRole('main'));
const nameField = () => main().getByRole('textbox', { name: 'Device name' }) as HTMLInputElement;

async function openEnroll(fetch: ReturnType<typeof stubApi>) {
  renderInConsole(<AppRoutes />, { path: '/enroll' });
  await waitFor(() => expect(posts(fetch)).toHaveLength(1), LOAD);
  await main().findByRole('button', { name: 'New code' }, LOAD);
  await settled();
}

describe('Enroll: device name', () => {
  it('mints once when the name is committed, not per keystroke, and trims it', async () => {
    const fetch = stubApi(api());
    await openEnroll(fetch);
    expect(posts(fetch)[0]).not.toHaveProperty('deviceName');

    for (const v of ['S', 'Sc', 'Sco', 'Scorer ']) fireEvent.change(nameField(), { target: { value: ` ${v}` } });
    await settled();
    expect(posts(fetch)).toHaveLength(1);
    // Until then the code on screen doesn't carry the name, so it isn't shown.
    expect(main().getByText('Press Enter to put the name in the code.')).toBeTruthy();
    expect(main().queryByRole('img', { name: /Enrollment QR code/ })).toBeNull();

    fireEvent.blur(nameField());
    await waitFor(() => expect(posts(fetch)).toHaveLength(2), LOAD);
    expect(posts(fetch)[1]).toMatchObject({ deviceName: 'Scorer' });
    expect(nameField().value).toBe('Scorer');
    expect(await main().findByText('Scorer', undefined, LOAD)).toBeTruthy();
    await settled();

    // Committing the same name again makes no new code.
    fireEvent.keyDown(nameField(), { key: 'Enter' });
    await settled();
    expect(posts(fetch)).toHaveLength(2);
  }, SLOW);

  it('commits on Enter, numbers a batch in the help, and sends nothing for a blank name', async () => {
    const fetch = stubApi(api());
    await openEnroll(fetch);
    chooseOption(main().getByRole('combobox', { name: 'Devices' }), { value: '10' });
    await waitFor(() => expect(posts(fetch)).toHaveLength(2), LOAD);
    await settled();

    fireEvent.change(nameField(), { target: { value: 'Target' } });
    // The help follows what is typed, before it is committed.
    expect(main().getByText(/numbered in the order they enroll: “Target 1”, “Target 2”/)).toBeTruthy();
    fireEvent.keyDown(nameField(), { key: 'Enter' });
    await waitFor(() => expect(posts(fetch)).toHaveLength(3), LOAD);
    expect(posts(fetch)[2]).toMatchObject({ deviceName: 'Target', maxUses: 10 });
    expect(main().getByText(/numbered in the order they enroll: “Target 1”, “Target 2”/)).toBeTruthy();
    await settled();

    fireEvent.change(nameField(), { target: { value: '   ' } });
    fireEvent.blur(nameField());
    await waitFor(() => expect(posts(fetch)).toHaveLength(4), LOAD);
    expect(posts(fetch)[3]).not.toHaveProperty('deviceName');
    await settled();
  }, SLOW);

  it('puts the name in the code by itself after a pause in typing', async () => {
    const fetch = stubApi(api());
    await openEnroll(fetch);
    fireEvent.change(nameField(), { target: { value: 'Reception ' } });
    expect(posts(fetch)).toHaveLength(1);
    await waitFor(() => expect(posts(fetch)).toHaveLength(2), LOAD);
    expect(posts(fetch)[1]).toMatchObject({ deviceName: 'Reception' });
    // The field is left as typed (the space may be the start of the next word).
    expect(nameField().value).toBe('Reception ');
    await settled();
    expect(main().queryByText('Press Enter to put the name in the code.')).toBeNull();
    expect(posts(fetch)).toHaveLength(2);
  }, SLOW);
});
