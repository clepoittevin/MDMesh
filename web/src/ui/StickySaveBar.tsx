import { useEffect, useRef, type ReactNode } from 'react';
import { useIntl } from 'react-intl';
import { Button } from './Button';
import { cx } from './cx';
import './StickySaveBar.css';

export interface StickySaveBarProps {
  /** Number of changed fields; the bar renders nothing at 0. */
  count: number;
  /** Context sentence ("Kiosk settings change on 2 devices. Their launcher restarts on the next sync."). */
  message?: ReactNode;
  onDiscard: () => void;
  onSave: () => void;
  /** "Save and apply" when omitted. */
  saveLabel?: string;
  /** "Discard" when omitted. */
  discardLabel?: string;
  /** Saving in progress: both buttons disabled, save label swapped. */
  busy?: boolean;
  /** "Saving…" when omitted. */
  busyLabel?: string;
  /** Block saving (e.g. assigned apps failed to load) while still showing the bar. */
  saveDisabled?: boolean;
  className?: string;
}

/**
 * Unsaved-changes bar: sticky 16px above the viewport bottom inside the content column, a floating bar (--elev-2,
 * --radius-control). `role="region"` named "Unsaved changes". While mounted it sets
 * scroll-padding-bottom so a focused field never hides under it (WCAG 2.4.11).
 */
export function StickySaveBar({
  count,
  message,
  onDiscard,
  onSave,
  saveLabel,
  discardLabel,
  busy,
  busyLabel,
  saveDisabled,
  className,
}: StickySaveBarProps) {
  const intl = useIntl();
  const ref = useRef<HTMLDivElement>(null);
  const visible = count > 0;

  useEffect(() => {
    if (!visible || !ref.current) return;
    const root = document.documentElement;
    const prev = root.style.scrollPaddingBottom;
    const apply = () => {
      const h = ref.current?.offsetHeight ?? 0;
      root.style.scrollPaddingBottom = `${h + 32}px`;
      // Toasts stack above the bar, never over Save (ui/Toast.css).
      root.style.setProperty('--v2-savebar-offset', `${h + 16}px`);
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      root.style.scrollPaddingBottom = prev;
      root.style.removeProperty('--v2-savebar-offset');
    };
  }, [visible]);

  if (!visible) return null;
  return (
    <div ref={ref} role="region" aria-label={intl.formatMessage({ id: 'shell.saveBar.label', defaultMessage: 'Unsaved changes' })} className={cx('v2-savebar', className)}>
      <span className="v2-savebar__count" aria-live="polite">
        <span className="v2-savebar__dot" aria-hidden="true" />
        {intl.formatMessage(
          {
            id: 'shell.saveBar.count',
            defaultMessage: '{count, plural, one {# unsaved change} other {# unsaved changes}}',
          },
          { count },
        )}
      </span>
      {message ? <span className="v2-savebar__msg">{message}</span> : <span className="v2-savebar__msg" />}
      <div className="v2-savebar__actions">
        <Button size="lg" onClick={onDiscard} disabled={busy}>
          {discardLabel ?? intl.formatMessage({ id: 'shell.saveBar.discard', defaultMessage: 'Discard' })}
        </Button>
        <Button size="lg" variant="primary" className="v2-savebar__save" onClick={onSave} disabled={busy || saveDisabled}>
          {busy
            ? (busyLabel ?? intl.formatMessage({ id: 'shell.saveBar.saving', defaultMessage: 'Saving…' }))
            : (saveLabel ?? intl.formatMessage({ id: 'shell.saveBar.save', defaultMessage: 'Save and apply' }))}
        </Button>
      </div>
    </div>
  );
}
