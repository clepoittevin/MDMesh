import { Component, Suspense, type ErrorInfo, type ReactNode } from 'react';
import { defineMessages, FormattedMessage, useIntl, type IntlShape } from 'react-intl';
import { untyped } from '../data/configIntl';
import { isChunkLoadError } from '../ui/AppErrorBoundary';
import { Badge } from '../ui/Badge';
import { LinkButton } from '../ui/Button';
import { Callout } from '../ui/Card';
import { IconWarning } from '../ui/icons';
import { PageCrash } from '../ui/PageErrorBoundary';
import type { SlotEntry } from './registry';

/**
 * What replaces a crashed contribution:
 * - `callout` (default): a small alert callout in its place (a tab, a section, a card), the page around it works
 * - `page`: the page-level card, for a routed page (the same one core pages have always shown)
 * - `inline`: a small "Error" mark, where a callout does not fit (a table cell or header, a menu label)
 * - `none`: nothing, for decorations such as a nav badge
 */
type BoundaryFallback = 'callout' | 'page' | 'inline' | 'none';

interface Props {
  entry: SlotEntry;
  fallback?: BoundaryFallback;
  /**
   * Puts the callout or the inline mark in a frame, e.g. a section's card, so its anchor and heading stay in place,
   * or a stat tile's dt and dd, so the stat grid's markup stays valid.
   */
  frame?: (fallback: ReactNode) => ReactNode;
  /** A sentence after the crash callout's own, e.g. what happens to the section's changes. */
  crashNote?: string;
  /** Told when the contribution crashes (true) and when "Retry" renders it again (false). */
  onCrash?: (crashed: boolean) => void;
  children: ReactNode;
}

interface State {
  /** Separate from `error`, as a component may throw a falsy value (`throw undefined`). */
  crashed: boolean;
  error: unknown;
}

const messages = untyped(
  defineMessages({
    coreLoad: { id: 'ext.crash.coreLoad', defaultMessage: 'This part of the page couldn’t load.' },
    coreProblem: { id: 'ext.crash.coreProblem', defaultMessage: 'This part of the page ran into a problem.' },
    extensionLoad: { id: 'ext.crash.extensionLoad', defaultMessage: 'The “{title}” extension couldn’t load.' },
    extensionProblem: { id: 'ext.crash.extensionProblem', defaultMessage: 'The “{title}” extension ran into a problem.' },
    reload: { id: 'ext.crash.reload', defaultMessage: 'Reload' },
    retry: { id: 'ext.crash.retry', defaultMessage: 'Retry' },
    error: { id: 'ext.crash.error', defaultMessage: 'Error' },
  }),
);

/** "This part of the page ran into a problem." (couldn’t load, for a chunk that failed), or the extension's. */
function crashSentence(intl: IntlShape, entry: SlotEntry, chunk: boolean): string {
  if (entry.extension.core) return intl.formatMessage(chunk ? messages.coreLoad : messages.coreProblem);
  return intl.formatMessage(chunk ? messages.extensionLoad : messages.extensionProblem, { title: entry.extension.title });
}

/** The inline mark: "Error", the sentence in its tooltip. */
function InlineCrash({ entry }: { entry: SlotEntry }) {
  const intl = useIntl();
  return (
    <Badge tone="alert" title={crashSentence(intl, entry, false)}>
      {intl.formatMessage(messages.error)}
    </Badge>
  );
}

function CrashCallout({ entry, error, note, onRetry }: { entry: SlotEntry; error: unknown; note?: string; onRetry: () => void }) {
  const intl = useIntl();
  const chunk = isChunkLoadError(error);
  return (
    <Callout tone="alert" role="alert" icon={<IconWarning size={16} />}>
      {crashSentence(intl, entry, chunk)} {note ? `${note} ` : ''}
      {chunk ? (
        <LinkButton tone="inline" onClick={() => window.location.reload()}>
          <FormattedMessage {...messages.reload} />
        </LinkButton>
      ) : (
        <LinkButton tone="inline" onClick={onRetry}>
          <FormattedMessage {...messages.retry} />
        </LinkButton>
      )}
    </Callout>
  );
}

/**
 * Around every contribution component: Suspense for its lazy chunk, and an error boundary so a crash or a failed
 * chunk takes out only that contribution. Key it by whatever should reset it (the device, the configuration).
 */
export class ExtensionBoundary extends Component<Props, State> {
  state: State = { crashed: false, error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { crashed: true, error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error(`[ext:${this.props.entry.key}] crashed`, error, info.componentStack);
    this.props.onCrash?.(true);
  }

  private retry = () => {
    this.props.onCrash?.(false);
    this.setState({ crashed: false, error: null });
  };

  render() {
    const { entry, fallback = 'callout', frame, children } = this.props;
    const { crashed, error } = this.state;
    if (!crashed) return <Suspense fallback={null}>{children}</Suspense>;
    if (fallback === 'none') return null;
    if (fallback === 'page') return <PageCrash error={error} onRetry={this.retry} />;
    const shown =
      fallback === 'inline' ? (
        <InlineCrash entry={entry} />
      ) : (
        <CrashCallout entry={entry} error={error} note={this.props.crashNote} onRetry={this.retry} />
      );
    return frame ? frame(shown) : shown;
  }
}
