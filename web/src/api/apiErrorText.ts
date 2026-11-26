// The console's own ApiError texts (api/client) in the console's language. A message the server sent (an error key,
// a refusal's reason) is left as it came: the screens map the keys they know, and the rest is shown as sent.
import { defineMessage, defineMessages, type IntlShape } from 'react-intl';
import { apiErrorCode, ApiError, type ApiErrorCode } from './client';

const messages = defineMessages({
  network: { id: 'deviceDetail.page.cannotReach', defaultMessage: 'Cannot reach the server.' },
  unauthenticated: { id: 'devices.load.sessionExpired', defaultMessage: 'Your session has expired. Sign in again.' },
  nonJson: { id: 'api.error.notJson', defaultMessage: 'Unexpected non-JSON response from server' },
  server: { id: 'api.error.server', defaultMessage: 'The server returned an error' },
});
const httpMessage = defineMessage<{ status: number }>({ id: 'api.error.httpStatus', defaultMessage: 'Request failed with HTTP {status}' });

/** The console-side ApiError text for `code`, translated. */
export function apiErrorCodeText(intl: Pick<IntlShape, 'formatMessage'>, code: ApiErrorCode, httpStatus = 0): string {
  return code === 'http' ? intl.formatMessage(httpMessage, { status: httpStatus }) : intl.formatMessage(messages[code]);
}

/**
 * What a failed request says, for a toast or an error state: the console's own ApiError texts translated, any other
 * error's message as it is (the server's text, or an error key the caller maps first), '' when there is none.
 */
export function apiErrorText(intl: Pick<IntlShape, 'formatMessage'>, e: unknown): string {
  const code = apiErrorCode(e);
  if (code) return apiErrorCodeText(intl, code, (e as ApiError).httpStatus);
  return e instanceof Error ? e.message : '';
}
