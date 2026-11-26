import type { ReactNode } from 'react';
import { defineMessages, FormattedMessage, useIntl } from 'react-intl';
import { untyped } from '../data/configIntl';
import { Button } from './Button';
import { Callout } from './Card';
import { IconAlert } from './icons';
import { cx } from './cx';

const messages = untyped(
  defineMessages({
    couldntLoad: {
      id: 'ui.errorState.couldntLoad',
      defaultMessage: 'Couldn’t load {thing}.',
      description: '{thing} is a noun phrase with its article, e.g. "the devices", "this configuration".',
    },
    retry: { id: 'ui.errorState.retry', defaultMessage: 'Retry' },
    retrying: { id: 'ui.errorState.retrying', defaultMessage: 'Retrying…' },
  }),
);

/**
 * The console's one load-failure state: "Couldn't load {thing}." (plus an optional detail) and a Retry button at the
 * right. Numbers that failed to load show as "—" beside it, never as 0.
 */
export function ErrorState({
  thing,
  detail,
  onRetry,
  retrying,
  className,
}: {
  /** What failed, as the sentence needs it: "devices", "this configuration". */
  thing: ReactNode;
  detail?: ReactNode;
  onRetry?: () => void;
  retrying?: boolean;
  className?: string;
}) {
  const intl = useIntl();
  return (
    <Callout tone="alert" role="alert" icon={<IconAlert />} className={cx('v2-errorstate', className)}>
      <span className="v2-errorstate__text">
        <FormattedMessage {...messages.couldntLoad} values={{ thing }} />
        {detail ? <> {detail}</> : null}
      </span>
      {onRetry ? (
        <Button size="sm" onClick={onRetry} disabled={retrying}>
          {intl.formatMessage(retrying ? messages.retrying : messages.retry)}
        </Button>
      ) : null}
    </Callout>
  );
}
