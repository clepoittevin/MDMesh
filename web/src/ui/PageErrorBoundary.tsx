import { Component, type ErrorInfo, type ReactNode } from 'react';
import { defineMessages, useIntl } from 'react-intl';
import { isChunkLoadError } from './AppErrorBoundary';
import { Button } from './Button';
import { Card } from './Card';
import { EmptyState } from './EmptyState';
import { IconWarning } from './icons';

interface Props {
  /** Key the boundary by the pathname so navigation resets it. */
  children: ReactNode;
}

interface State {
  /** Separate from `error`, as a component may throw a falsy value (`throw undefined`). */
  crashed: boolean;
  error: unknown;
}

const messages = defineMessages({
  loadTitle: { id: 'shell.crash.loadTitle', defaultMessage: 'Couldn’t load this page' },
  title: { id: 'shell.crash.title', defaultMessage: 'This page ran into a problem' },
  reload: { id: 'shell.crash.reload', defaultMessage: 'Reload' },
  retry: { id: 'shell.crash.retry', defaultMessage: 'Retry' },
  stale: {
    id: 'shell.crash.stale',
    defaultMessage: 'The console was probably updated while this tab was open. Reload to get the current version.',
  },
  rest: { id: 'shell.crash.rest', defaultMessage: 'The rest of the console still works. Retry, or reload the page.' },
});

/**
 * What a crashed page shows in its place: a failed chunk (the console was updated while the tab was open) offers a
 * reload, anything else a retry. Shared by this boundary and the per-page ExtensionBoundary.
 */
export function PageCrash({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const intl = useIntl();
  const chunk = isChunkLoadError(error);
  const detail = error instanceof Error ? error.message : String(error);
  return (
    <Card role="alert">
      <EmptyState
        icon={<IconWarning size={18} />}
        title={intl.formatMessage(chunk ? messages.loadTitle : messages.title)}
        action={
          chunk ? (
            <Button variant="primary" size="lg" onClick={() => window.location.reload()}>
              {intl.formatMessage(messages.reload)}
            </Button>
          ) : (
            <Button variant="primary" size="lg" onClick={onRetry}>
              {intl.formatMessage(messages.retry)}
            </Button>
          )
        }
      >
        {chunk
          ? intl.formatMessage(messages.stale)
          : import.meta.env.DEV
            ? detail
            : intl.formatMessage(messages.rest)}
      </EmptyState>
    </Card>
  );
}

/**
 * Wraps the page inside AppShell (keyed by pathname): a crash or a failed page chunk replaces only the page, so
 * the sidebar and navigation keep working.
 */
export class PageErrorBoundary extends Component<Props, State> {
  state: State = { crashed: false, error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { crashed: true, error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('page crashed', error, info.componentStack);
  }

  render() {
    const { crashed, error } = this.state;
    if (!crashed) return this.props.children;
    return <PageCrash error={error} onRetry={() => this.setState({ crashed: false, error: null })} />;
  }
}
