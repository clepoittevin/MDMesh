// English text for the pure functions of the configuration screens that build sentences (outcome labels, the kiosk
// summary, the sync line…): each takes an optional `intl`, and without one answers in English from the message's
// defaultMessage, which is what code outside React (and every test written before the French catalog) gets.
import { createIntl, type MessageDescriptor } from 'react-intl';

export const EN_INTL = createIntl({ locale: 'en' });

/**
 * A `defineMessages` block as plain descriptors: react-intl types each message's values from its text, which is
 * checked at the call site only when written `defineMessage<{ name: string }>`; these blocks name their values in
 * the ICU text and pass them where the message is used.
 */
export const untyped = <T extends Record<string, MessageDescriptor>>(messages: T): { [K in keyof T]: MessageDescriptor } => messages;
