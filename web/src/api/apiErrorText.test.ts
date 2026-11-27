import { createIntl } from 'react-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CATALOGS } from '../i18n/locales';
import { apiErrorCodeText, apiErrorText } from './apiErrorText';
import { apiClient } from './client';

const en = createIntl({ locale: 'en' });
const fr = createIntl({ locale: 'fr', messages: await CATALOGS.fr() });

/** The error a request ends with when the server (or the network) answers this way. */
async function failure(answer: () => Response | Promise<Response>): Promise<unknown> {
  vi.stubGlobal('fetch', async () => answer());
  return apiClient.get('/private/devices').then(
    () => {
      throw new Error('the request succeeded');
    },
    (e: unknown) => e,
  );
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apiErrorText', () => {
  it('words the console’s own failures in the console’s language', async () => {
    const offline = await failure(() => Promise.reject(new TypeError('Failed to fetch')));
    expect(apiErrorText(en, offline)).toBe('Cannot reach the server.');
    expect(apiErrorText(fr, offline)).toBe('Impossible de joindre le serveur.');

    const expired = await failure(() => json({}, 401));
    expect(apiErrorText(en, expired)).toBe('Your session has expired. Sign in again.');
    expect(apiErrorText(fr, expired)).not.toBe(apiErrorText(en, expired));

    const http = await failure(() => json({}, 500));
    expect(apiErrorText(en, http)).toBe('Request failed with HTTP 500');
    expect(apiErrorText(fr, http)).toContain('500');
    expect(apiErrorText(fr, http)).not.toBe(apiErrorText(en, http));

    const page = await failure(() => new Response('<html>Bad gateway</html>'));
    expect(apiErrorText(en, page)).toBe('Unexpected non-JSON response from server');

    const silent = await failure(() => json({ status: 'ERROR', message: null }));
    expect(apiErrorText(en, silent)).toBe('The server returned an error');
    expect(apiErrorText(fr, silent)).not.toBe(apiErrorText(en, silent));
  });

  it('leaves what the server said as sent, for the screen to map', async () => {
    const refused = await failure(() => json({ status: 'ERROR', message: 'error.permission.denied' }));
    expect(apiErrorText(fr, refused)).toBe('error.permission.denied');
  });

  it('gives any other error’s message, and nothing for what is not an error', () => {
    expect(apiErrorText(fr, new Error('boom'))).toBe('boom');
    expect(apiErrorText(fr, { message: 'not an Error' })).toBe('');
    expect(apiErrorText(fr, undefined)).toBe('');
  });

  it('words a code on its own', () => {
    expect(apiErrorCodeText(en, 'http', 503)).toBe('Request failed with HTTP 503');
    expect(apiErrorCodeText(en, 'network')).toBe('Cannot reach the server.');
  });
});
