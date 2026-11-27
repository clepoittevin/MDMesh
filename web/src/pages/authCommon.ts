// Page-local helpers for the two auth pages (Sign in and Set password). The footer is the shared
// AuthFooter (ui/AuthLayout) and the return path check is auth/safeReturnPath.
import { authMessages } from '../api/authMessages';
import { ApiError } from '../api/client';
import './authPages.css';

/** Classic wording: a network failure is the only error that is told apart. */
export function isUnreachable(err: unknown): boolean {
  return err instanceof ApiError && err.httpStatus === 0;
}

/** English; the pages show authMessages.unreachable. */
export const UNREACHABLE: string = authMessages.unreachable.defaultMessage as string;

// The sign-in limit's answer, shared with Settings' password change (api/auth.ts).
export { isTooManyAttempts, TOO_MANY_MESSAGE as TOO_MANY } from '../api/auth';
