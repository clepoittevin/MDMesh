import { useId, type ReactNode } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Link } from 'react-router';
import { Button } from './Button';
import { Select } from './Input';
import { cx } from './cx';
import './Pagination.css';

export interface PaginationProps {
  /** 1-based page. */
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  /** With both, a "Rows per page" select is shown (10 / 50 / 100). */
  pageSizeOptions?: ReadonlyArray<number>;
  onPageSizeChange?: (size: number) => void;
  /** Text after the count ("· needs attention first"). */
  suffix?: ReactNode;
  /**
   * `inset`: the footer row of a table card, 12×16 padding with a top rule.
   * `plain`: under a card grid, no padding or rule.
   */
  variant?: 'inset' | 'plain';
  /** Noun for the screen-reader label ("devices"); "items" when omitted. */
  noun?: string;
  className?: string;
}

/** "Showing 1–10 of 248", optional rows-per-page, Previous / Next. */
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  pageSizeOptions,
  onPageSizeChange,
  suffix,
  variant = 'inset',
  noun,
  className,
}: PaginationProps) {
  const intl = useIntl();
  const sizeId = useId();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);
  return (
    <nav aria-label={intl.formatMessage(
        { id: 'shell.pagination.pagesOf', defaultMessage: 'Pages of {noun}' },
        { noun: noun ?? intl.formatMessage({ id: 'shell.pagination.items', defaultMessage: 'items' }) },
      )} className={cx('v2-pager', `v2-pager--${variant}`, className)}>
      <span className="v2-pager__count" aria-live="polite">
        <FormattedMessage
          id="shell.pagination.showing"
          defaultMessage="Showing <num>{first}–{last}</num> of <num>{total}</num>"
          values={{ first, last, total, num: (chunks) => <span className="v2-num">{chunks}</span> }}
        />
        {suffix ? <> {suffix}</> : null}
      </span>
      {pageSizeOptions && onPageSizeChange ? (
        <span className="v2-pager__size">
          <span id={sizeId}>
            <FormattedMessage id="shell.pagination.rowsPerPage" defaultMessage="Rows per page" />
          </span>
          <Select
            size="sm"
            aria-labelledby={sizeId}
            className="v2-pager__select"
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
          >
            {pageSizeOptions.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </span>
      ) : null}
      <div className="v2-pager__buttons">
        <Button size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          <FormattedMessage id="shell.pagination.previous" defaultMessage="Previous" />
        </Button>
        <Button size="sm" disabled={page >= pages} onClick={() => onPageChange(page + 1)}>
          <FormattedMessage id="shell.pagination.next" defaultMessage="Next" />
        </Button>
      </div>
    </nav>
  );
}

/** Centred "Show more" (F-Droid): secondary 9×18. */
export function ShowMore({
  onClick,
  busy,
  label,
  busyLabel,
}: {
  onClick: () => void;
  busy?: boolean;
  /** "Show more" when omitted. */
  label?: string;
  /** "Loading…" when omitted. */
  busyLabel?: string;
}) {
  const intl = useIntl();
  return (
    <div className="v2-showmore">
      <Button className="v2-showmore__btn" onClick={onClick} disabled={busy}>
        {busy
          ? (busyLabel ?? intl.formatMessage({ id: 'shell.pagination.loading', defaultMessage: 'Loading…' }))
          : (label ?? intl.formatMessage({ id: 'shell.pagination.showMore', defaultMessage: 'Show more' }))}
      </Button>
    </div>
  );
}

/** Card-header meta "Showing 6 of 14 · See all" (Needs attention): 13px secondary + a 600 link. */
export function CountMeta({ shown, total, to, linkLabel }: { shown: number; total: number; to?: string; linkLabel?: string }) {
  const intl = useIntl();
  return (
    <>
      {/* Only when the list is cut short: "Showing 5 of 5" says nothing. */}
      {shown < total ? (
        <span className="v2-countmeta">
          <FormattedMessage
            id="shell.pagination.showingOf"
            defaultMessage="Showing {shown} of {total}"
            values={{ shown, total }}
          />
        </span>
      ) : null}
      {to ? (
        <Link to={to} className="v2-countmeta__link">
          {linkLabel ?? intl.formatMessage({ id: 'shell.pagination.seeAll', defaultMessage: 'See all' })}
        </Link>
      ) : null}
    </>
  );
}
