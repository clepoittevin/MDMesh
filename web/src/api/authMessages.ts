// Wording the sign-in, set-password and change-password forms, and the user-management errors, share. The English
// constants in api/auth.ts and pages/authCommon.ts stay as they are; these are what the console shows.
import { defineMessages, type MessageDescriptor } from 'react-intl';

export const authMessages = defineMessages<'unreachable' | 'tooMany' | 'impersonated' | 'newPassword' | 'typeAgain' | 'showNew' | 'showAgain' | 'minLength' | 'saving'>({
  unreachable: { id: 'auth.error.unreachable', defaultMessage: 'Cannot reach the server. Check that it is running.' },
  tooMany: {
    id: 'auth.error.tooMany',
    defaultMessage: 'Too many failed sign-ins. Wait a few minutes, then try again.',
  },
  impersonated: {
    id: 'auth.error.impersonated',
    defaultMessage:
      'You are signed in as another account, so this needs its owner. Sign in with your own account to do it.',
  },
  newPassword: { id: 'auth.field.newPassword', defaultMessage: 'New password' },
  typeAgain: { id: 'auth.field.typeAgain', defaultMessage: 'Type it again' },
  showNew: { id: 'auth.field.showNew', defaultMessage: 'Show new password' },
  showAgain: { id: 'auth.field.showAgain', defaultMessage: 'Show the password typed again' },
  minLength: { id: 'auth.rule.minLength', defaultMessage: 'At least {min} characters' },
  saving: { id: 'auth.action.saving', defaultMessage: 'Saving…' },
}) as Record<'unreachable' | 'tooMany' | 'impersonated' | 'newPassword' | 'typeAgain' | 'showNew' | 'showAgain' | 'minLength' | 'saving', MessageDescriptor>;
