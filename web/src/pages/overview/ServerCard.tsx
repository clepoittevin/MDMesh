// The Overview's Server card: the running version, and an update on offer, running or failed.
import type { ReactNode } from 'react';
import { defineMessage, defineMessages, useIntl } from 'react-intl';
import { isApplyTerminal, type UpdateStatus } from '../../api/updates';
import { applyPhaseLabel, lastCheckError, missedSecurity, missedSecurityShort } from '../../data/updateStatus';
import { UPDATES_HREF } from '../../routes';
import { ButtonAnchor, ButtonLink, Card, CardHeader, IconCheck, IconShield, RelativeTime, StatusDot } from '../../ui';

const messages = defineMessages({
  viewProgress: { id: 'overview.server.viewProgress', defaultMessage: 'View progress' },
  rolledBack: { id: 'overview.server.rolledBack', defaultMessage: 'Update rolled back' },
  failed: { id: 'overview.server.failed', defaultMessage: 'Update failed' },
  openRecovery: { id: 'overview.server.openRecovery', defaultMessage: 'Open recovery' },
  reviewUpdate: { id: 'overview.server.reviewUpdate', defaultMessage: 'Review update' },
  title: { id: 'overview.server.title', defaultMessage: 'Server' },
  checkFailed: { id: 'overview.server.checkFailed', defaultMessage: 'The last update check failed.' },
  // Read before a relative time ("checked 5 minutes ago"); keeps its trailing space.
  checkedPrefix: { id: 'overview.server.checkedPrefix', defaultMessage: 'checked ' },
});
const updatingTo = defineMessage<{ version: string }>({
  id: 'overview.server.updatingTo',
  defaultMessage: 'Updating to {version}',
});
const isAvailable = defineMessage<{ version: string }>({
  id: 'overview.server.isAvailable',
  defaultMessage: '{version} is available',
});
const signatureVerified = defineMessage<{ hasChannel: string; channel: string }>({
  id: 'overview.server.signatureVerified',
  defaultMessage: 'Signature verified{hasChannel, select, true { · {channel} channel} other {}}',
});
const signatureNotVerified = defineMessage<{ hasChannel: string; channel: string }>({
  id: 'overview.server.signatureNotVerified',
  defaultMessage: 'Signature not verified{hasChannel, select, true { · {channel} channel} other {}}',
});
const running = defineMessage<{ version: string }>({
  id: 'overview.server.running',
  defaultMessage: 'Running {version}',
});
const upToDate = defineMessage<{ hasChannel: string; channel: string }>({
  id: 'overview.server.upToDate',
  defaultMessage: 'Up to date{hasChannel, select, true { · {channel} channel} other {}}',
});

/**
 * The server's version, and an update as an inset callout with its action: "0.1.15 is available", its signature and
 * channel, "Review update" (the sidebar's card says the same and links to the same place). A running or failed
 * update shows its progress or the way to recovery instead.
 */
export function ServerCard({ status }: { status: UpdateStatus }) {
  const intl = useIntl();
  const apply = status.apply;
  const active = !!apply && !isApplyTerminal(apply.phase);
  const failed = !!apply && (apply.phase === 'failed' || apply.phase === 'rolled_back');
  const channel = { hasChannel: String(!!status.channel), channel: status.channel ?? '' };

  let panel: ReactNode = null;
  if (active && apply) {
    panel = (
      <div className="v2-ov-srv__panel">
        <span className="v2-ov-srv__title">{intl.formatMessage(updatingTo, { version: apply.toVersion })}</span>
        <span className="v2-ov-srv__line is-warn">
          <StatusDot tone="warn" />
          {applyPhaseLabel(apply.phase)}
        </span>
        <ButtonLink size="sm" to={UPDATES_HREF}>
          {intl.formatMessage(messages.viewProgress)}
        </ButtonLink>
      </div>
    );
  } else if (failed && apply) {
    panel = (
      <div className="v2-ov-srv__panel">
        <span className="v2-ov-srv__title">{intl.formatMessage(apply.phase === 'rolled_back' ? messages.rolledBack : messages.failed)}</span>
        {apply.error ? <span className="v2-ov-srv__line is-alert">{apply.error}</span> : null}
        {/* /recovery is served outside the SPA. */}
        <ButtonAnchor size="sm" href="/recovery">
          {intl.formatMessage(messages.openRecovery)}
        </ButtonAnchor>
      </div>
    );
  } else if (status.updateAvailable && status.latest) {
    // An update that skips security releases (verified manifest only) says so in amber, as the sidebar card does.
    const missed = missedSecurity(status);
    panel = (
      <div className="v2-ov-srv__panel">
        <span className="v2-ov-srv__title">{intl.formatMessage(isAvailable, { version: status.latest })}</span>
        {missed.length > 0 ? (
          <span className="v2-ov-srv__line v2-ov-srv__line--long is-warn">
            <span className="v2-ov-srv__icon" aria-hidden="true">
              <IconShield size={14} />
            </span>
            <span>{missedSecurityShort(missed)}</span>
          </span>
        ) : status.verified ? (
          <span className="v2-ov-srv__line is-ok">
            <IconCheck size={14} />
            {intl.formatMessage(signatureVerified, channel)}
          </span>
        ) : (
          <span className="v2-ov-srv__line is-warn">
            <StatusDot tone="warn" />
            {intl.formatMessage(signatureNotVerified, channel)}
          </span>
        )}
        <ButtonLink size="sm" to={UPDATES_HREF}>
          {intl.formatMessage(messages.reviewUpdate)}
        </ButtonLink>
      </div>
    );
  }

  return (
    <Card gap={12} aria-labelledby="v2-ov-srv">
      <CardHeader title={intl.formatMessage(messages.title)} titleId="v2-ov-srv" />
      <div className="v2-ov-srv__run">
        <StatusDot tone="ok" size={8} />
        <span>{intl.formatMessage(running, { version: status.current })}</span>
      </div>
      {panel ??
        (lastCheckError(status) ? (
          <span className="v2-ov-srv__meta">{intl.formatMessage(messages.checkFailed)}</span>
        ) : (
          <span className="v2-ov-srv__meta">
            {intl.formatMessage(upToDate, channel)}
            {status.checkedAt ? (
              <>
                {' · '}
                <RelativeTime value={status.checkedAt} style="long" prefix={intl.formatMessage(messages.checkedPrefix)} />
              </>
            ) : null}
          </span>
        ))}
    </Card>
  );
}
