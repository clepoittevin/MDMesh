import { createElement, useState } from 'react';
import { defineMessages, useIntl, type MessageDescriptor } from 'react-intl';
import { Link, NavLink } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { useMayManageDeployment } from '../auth/useMayManageDeployment';
import { useTheme } from './theme';
import { isApplyTerminal, type UpdateStatus } from '../api/updates';
import { useSupervisor } from '../data/useSupervisor';
import { applyPhaseLabel, blockedShort, missedSecurityShort, updateOffer } from '../data/updateStatus';
import { coreNavMessages } from '../ext/core/nav';
import { ExtensionBoundary } from '../ext/ExtensionBoundary';
import { useContributions } from '../ext/useContributions';
import { paths, UPDATES_HREF } from '../routes';
import * as DM from '@radix-ui/react-dropdown-menu';
import { usePrefetchRoute } from '../ext/usePrefetchRoute';
import { IconChevronDown, IconMoon, IconSignOut, IconSun } from './icons';
import { cx } from './cx';
import './Menu.css';
import './Sidebar.css';

const messages = defineMessages<'updating' | 'viewProgress' | 'rolledBack' | 'failed' | 'openRecovery' | 'howShell' | 'howApply' | 'howAdmin' | 'updateTitle' | 'missedWithHow' | 'reviewUpdate' | 'serverUpdate' | 'verified' | 'unverified' | 'account' | 'switchToDark' | 'switchToLight' | 'signOut' | 'main' | 'cantInstall' | 'seeWhy'>({
  updating: { id: 'shell.sidebar.updating', defaultMessage: 'Updating to {version}' },
  viewProgress: { id: 'shell.sidebar.viewProgress', defaultMessage: 'View progress' },
  rolledBack: { id: 'shell.sidebar.rolledBack', defaultMessage: 'Update rolled back' },
  failed: { id: 'shell.sidebar.failed', defaultMessage: 'Update failed' },
  openRecovery: { id: 'shell.sidebar.openRecovery', defaultMessage: 'Open recovery' },
  howShell: { id: 'shell.sidebar.howShell', defaultMessage: 'Update from the server shell.' },
  howApply: { id: 'shell.sidebar.howApply', defaultMessage: 'About 2 minutes to apply.' },
  howAdmin: { id: 'shell.sidebar.howAdmin', defaultMessage: 'An admin can apply it.' },
  updateTitle: { id: 'shell.sidebar.updateTitle', defaultMessage: 'Update {version}' },
  missedWithHow: { id: 'shell.sidebar.missedWithHow', defaultMessage: '{summary} {how}' },
  reviewUpdate: { id: 'shell.sidebar.reviewUpdate', defaultMessage: 'Review update' },
  cantInstall: { id: 'shell.sidebar.cantInstall', defaultMessage: '{version} can’t be installed' },
  seeWhy: { id: 'shell.sidebar.seeWhy', defaultMessage: 'See why' },
  serverUpdate: { id: 'shell.sidebar.serverUpdate', defaultMessage: 'Server update {version}' },
  verified: { id: 'shell.sidebar.verified', defaultMessage: 'Verified release. {how}' },
  unverified: { id: 'shell.sidebar.unverified', defaultMessage: 'Signature not verified. {how}' },
  account: { id: 'shell.sidebar.account', defaultMessage: 'Account:' },
  switchToDark: { id: 'shell.sidebar.switchToDark', defaultMessage: 'Switch to dark mode' },
  switchToLight: { id: 'shell.sidebar.switchToLight', defaultMessage: 'Switch to light mode' },
  signOut: { id: 'shell.sidebar.signOut', defaultMessage: 'Sign out' },
  main: { id: 'shell.sidebar.main', defaultMessage: 'Main' },
}) as Record<'updating' | 'viewProgress' | 'rolledBack' | 'failed' | 'openRecovery' | 'howShell' | 'howApply' | 'howAdmin' | 'updateTitle' | 'missedWithHow' | 'reviewUpdate' | 'serverUpdate' | 'verified' | 'unverified' | 'account' | 'switchToDark' | 'switchToLight' | 'signOut' | 'main' | 'cantInstall' | 'seeWhy', MessageDescriptor>;

/** MDMesh wordmark: ink square + "MDM" 600 + "esh" 400 secondary, at the card-title size. */
export function Wordmark({ size = 17, className }: { size?: 17 | 18; className?: string }) {
  return (
    <span className={cx('v2-wordmark', size === 18 && 'v2-wordmark--18', className)} role="img" aria-label="MDMesh">
      <span className="v2-wordmark__mark" aria-hidden="true" />
      <span aria-hidden="true">
        MDM<span className="v2-wordmark__esh">esh</span>
      </span>
    </span>
  );
}

/**
 * The sidebar's server-update card, above the account row: a status dot and "Server update 0.1.15", one short line,
 * and the action. When the update brings security fixes from releases this server skipped, the dot is amber, the
 * title "Update 0.1.15" and the line says which. The Overview's Server card says the same in the same words; both
 * lead to Settings → Updates. Hidden when there is nothing to say.
 */
function UpdateCard({ status, onNavigate }: { status: UpdateStatus | null; onNavigate?: () => void }) {
  // Only the admin who runs the install may update; anyone else is told so instead of how long it takes.
  const canUpdate = useMayManageDeployment();
  const intl = useIntl();
  if (!status) return null;
  const apply = status.apply;
  const active = !!apply && !isApplyTerminal(apply.phase);
  const failed = !!apply && (apply.phase === 'failed' || apply.phase === 'rolled_back');

  if (active && apply) {
    return (
      <Link to={UPDATES_HREF} className="v2-updcard" onClick={onNavigate}>
        <span className="v2-updcard__title">
          <span className="v2-updcard__dot is-warn" aria-hidden="true" />
          {intl.formatMessage(messages.updating, { version: apply.toVersion })}
        </span>
        <span className="v2-updcard__text">{applyPhaseLabel(apply.phase, intl)}</span>
        <span className="v2-updcard__action">{intl.formatMessage(messages.viewProgress)}</span>
      </Link>
    );
  }
  if (failed && apply) {
    return (
      <a href="/recovery" className="v2-updcard">
        <span className="v2-updcard__title">
          <span className="v2-updcard__dot is-alert" aria-hidden="true" />
          {intl.formatMessage(apply.phase === 'rolled_back' ? messages.rolledBack : messages.failed)}
        </span>
        {apply.error ? <span className="v2-updcard__text">{apply.error}</span> : null}
        <span className="v2-updcard__action">{intl.formatMessage(messages.openRecovery)}</span>
      </a>
    );
  }
  const offer = updateOffer(status);
  if (!offer) return null;
  // Found but not installable here: quiet, unless it leaves security fixes missing (amber, and it says so).
  if (offer.kind === 'blocked') {
    return (
      <Link to={UPDATES_HREF} className="v2-updcard" onClick={onNavigate}>
        <span className="v2-updcard__title">
          <span className={cx('v2-updcard__dot', offer.missed.length > 0 ? 'is-warn' : 'is-idle')} aria-hidden="true" />
          {intl.formatMessage(messages.cantInstall, { version: offer.latest })}
        </span>
        <span className="v2-updcard__text">{blockedShort(status, offer.missed, intl)}</span>
        <span className="v2-updcard__action">{intl.formatMessage(messages.seeWhy)}</span>
      </Link>
    );
  }
  const how =
    status.applySupported === false
      ? intl.formatMessage(messages.howShell)
      : canUpdate
        ? intl.formatMessage(messages.howApply)
        : intl.formatMessage(messages.howAdmin);
  // The update skips over security releases (verified manifest only): amber, and the card says which. Who can apply
  // it, or how, still shows where it isn't this admin's one click.
  const missed = offer.missed;
  if (missed.length > 0) {
    return (
      <Link to={UPDATES_HREF} className="v2-updcard" onClick={onNavigate}>
        <span className="v2-updcard__title">
          <span className="v2-updcard__dot is-warn" aria-hidden="true" />
          {intl.formatMessage(messages.updateTitle, { version: status.latest })}
        </span>
        <span className="v2-updcard__text">
          {status.applySupported === false || !canUpdate
            ? intl.formatMessage(messages.missedWithHow, { summary: missedSecurityShort(missed, intl), how })
            : missedSecurityShort(missed, intl)}
        </span>
        <span className="v2-updcard__action">{intl.formatMessage(messages.reviewUpdate)}</span>
      </Link>
    );
  }
  return (
    <Link to={UPDATES_HREF} className="v2-updcard" onClick={onNavigate}>
      <span className="v2-updcard__title">
        <span className={cx('v2-updcard__dot', status.verified ? 'is-ok' : 'is-warn')} aria-hidden="true" />
        {intl.formatMessage(messages.serverUpdate, { version: status.latest })}
      </span>
      <span className="v2-updcard__text">
        {intl.formatMessage(status.verified ? messages.verified : messages.unverified, { how })}
      </span>
      <span className="v2-updcard__action">{intl.formatMessage(messages.reviewUpdate)}</span>
    </Link>
  );
}

/** The signed-in user's row: their login, and a menu with the theme switch and Sign out. */
function AccountMenu() {
  const { user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const intl = useIntl();
  const name = user?.login || user?.name || '—';
  const [open, setOpen] = useState(false);
  return (
    <DM.Root modal={false} open={open} onOpenChange={setOpen}>
      <DM.Trigger
        className="v2-account"
        onClick={(e) => {
          // A click with no pointer behind it (a screen reader's activation) toggles, as on Menu.
          if (e.detail === 0) setOpen((o) => !o);
        }}
      >
        <span className="v2-account__avatar" aria-hidden="true">
          {name.slice(0, 1).toUpperCase()}
        </span>
        <span className="v2-account__name">
          <span className="v2-visually-hidden">{intl.formatMessage(messages.account)} </span>
          {name}
        </span>
        <IconChevronDown />
      </DM.Trigger>
      <DM.Portal>
        <DM.Content className="v2-menu__popup" side="top" align="start" sideOffset={4} collisionPadding={8} loop>
          <DM.Item className="v2-menu__item" onSelect={toggleTheme}>
            <span className="v2-menu__icon" aria-hidden="true">
              {theme === 'dark' ? <IconSun /> : <IconMoon />}
            </span>
            {intl.formatMessage(theme === 'dark' ? messages.switchToLight : messages.switchToDark)}
          </DM.Item>
          <DM.Separator className="v2-menu__sep" />
          <DM.Item className="v2-menu__item" onSelect={() => void signOut()}>
            <span className="v2-menu__icon" aria-hidden="true">
              <IconSignOut />
            </span>
            {intl.formatMessage(messages.signOut)}
          </DM.Item>
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  );
}

export interface SidebarProps {
  /** Called when a link is followed (closes the mobile drawer). */
  onNavigate?: () => void;
  id?: string;
  className?: string;
}

/**
 * The left column: wordmark, main nav (--nav-item rows; hovering or focusing one starts loading its page), the
 * server-update card when there is one, and the account row (theme and sign out in its menu).
 * The nav is the registry's `nav.item` slot (core's items are ext/core/nav.ts), filtered by the user's role.
 */
export function Sidebar({ onNavigate, id, className }: SidebarProps) {
  const intl = useIntl();
  const navItems = useContributions('nav.item');
  const prefetch = usePrefetchRoute();
  // The shell's shared status (at the fastest cadence any mounted consumer asks for: 30 min for the sidebar alone,
  // every minute in a versioned build because of ReloadPrompt, fast while an apply runs); hidden while the
  // supervisor is unreachable.
  const supervisor = useSupervisor();
  const update = supervisor.reachable ? supervisor.status : null;

  return (
    <nav id={id} aria-label={intl.formatMessage(messages.main)} className={cx('v2-sidebar', className)}>
      <Link to={paths.overview} className="v2-sidebar__brand" onClick={onNavigate}>
        <Wordmark />
      </Link>
      <div className="v2-sidebar__nav">
        {navItems.map((entry) => {
          const { to, icon, badge } = entry.contribution;
          const core = entry.extension.core ? coreNavMessages[entry.contribution.id] : undefined;
          const label = core ? intl.formatMessage(core) : entry.contribution.label;
          return (
            <NavLink
              key={entry.key}
              to={to}
              end={to === paths.overview}
              className={({ isActive }) => cx('v2-navitem', isActive && 'is-active')}
              onClick={onNavigate}
              onPointerEnter={() => prefetch(to)}
              onFocus={() => prefetch(to)}
            >
              <ExtensionBoundary entry={entry} fallback="none">
                {createElement(icon)}
              </ExtensionBoundary>
              {badge ? (
                <>
                  <span className="v2-navitem__label">{label}</span>
                  <ExtensionBoundary entry={entry} fallback="none">
                    {createElement(badge)}
                  </ExtensionBoundary>
                </>
              ) : (
                label
              )}
            </NavLink>
          );
        })}
      </div>
      <div className="v2-sidebar__foot">
        <UpdateCard status={update} onNavigate={onNavigate} />
        <AccountMenu />
      </div>
    </nav>
  );
}
