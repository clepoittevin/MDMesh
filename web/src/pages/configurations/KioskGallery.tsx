// "Choose from uploaded images": the customer's kiosk background images (one per content), to use one without
// uploading it again, or delete one nothing uses.
import { useCallback, useEffect, useRef, useState } from 'react';
import { defineMessages, useIntl, type IntlShape } from 'react-intl';
import { untyped } from '../../data/configIntl';
import {
  deleteKioskBackgroundImage,
  listKioskBackgroundImages,
  type KioskGalleryItem,
} from '../../api/configurations';
import { Button, Modal, SkeletonRows } from '../../ui';
import { fmtDateTime } from '../../ui/format';
import { fmtBytes } from '../deviceDetailFormat';
import { hostedPath, shortSha } from './KioskBackground';
import './KioskGallery.css';
import { apiErrorText } from '../../api/apiErrorText';

const PAGE = 20;
/** Fetched per request; the list keeps the first n of them. */
const FETCH = 100;

const messages = untyped(defineMessages({
  serverFailed: { id: 'configEditor.gallery.serverFailed', defaultMessage: 'The server could not do that. Try again.' },
  deletedStatus: { id: 'configEditor.gallery.deletedStatus', defaultMessage: '{name} deleted.' },
  title: { id: 'configEditor.gallery.title', defaultMessage: 'Uploaded images' },
  description: {
    id: 'configEditor.gallery.description',
    defaultMessage: 'Kiosk background images uploaded before. Use one without uploading it again.',
  },
  close: { id: 'configEditor.gallery.close', defaultMessage: 'Close' },
  empty: { id: 'configEditor.gallery.empty', defaultMessage: 'No images uploaded yet.' },
  notUsed: { id: 'configEditor.gallery.notUsed', defaultMessage: 'Not used' },
  usedByNames: { id: 'configEditor.gallery.usedByNames', defaultMessage: 'Used by {names}' },
  usedByNamesAndOthers: {
    id: 'configEditor.gallery.usedByNamesAndOthers',
    defaultMessage: 'Used by {names} and {count, plural, one {# other} other {# others}}',
  },
  usedByOthers: {
    id: 'configEditor.gallery.usedByOthers',
    defaultMessage: 'Used by {count, plural, one {# other} other {# others}}',
  },
  meta: { id: 'configEditor.gallery.meta', defaultMessage: '{width} × {height} px · {size} · {date}' },
  inUse: { id: 'configEditor.gallery.inUse', defaultMessage: 'In use here' },
  use: { id: 'configEditor.gallery.use', defaultMessage: 'Use' },
  useNamed: { id: 'configEditor.gallery.useNamed', defaultMessage: 'Use {name}' },
  deleteQuestion: {
    id: 'configEditor.gallery.deleteQuestion',
    defaultMessage: 'Delete {name}?',
    description: 'DESTRUCTIVE: asks before deleting an uploaded image for good.',
  },
  deleteForGoodNamed: {
    id: 'configEditor.gallery.deleteForGoodNamed',
    defaultMessage: 'Delete {name} for good',
    description: 'DESTRUCTIVE: deletes the uploaded image for good.',
  },
  deleteForGood: {
    id: 'configEditor.gallery.deleteForGood',
    defaultMessage: 'Delete for good',
    description: 'DESTRUCTIVE: deletes the uploaded image for good.',
  },
  keep: { id: 'configEditor.gallery.keep', defaultMessage: 'Keep' },
  deleteNamed: { id: 'configEditor.gallery.deleteNamed', defaultMessage: 'Delete {name}' },
  delete: { id: 'configEditor.gallery.delete', defaultMessage: 'Delete' },
  loading: { id: 'configEditor.gallery.loading', defaultMessage: 'Loading…' },
  showMore: { id: 'configEditor.gallery.showMore', defaultMessage: 'Show more ({count})' },
  loadingImages: { id: 'configEditor.gallery.loadingImages', defaultMessage: 'Loading images…' },
}));

const errorText = (e: unknown, intl: IntlShape) => {
  const sent = apiErrorText(intl, e);
  return sent && !/^error\./.test(sent) ? sent : intl.formatMessage(messages.serverFailed);
};

export function KioskGallery({
  open,
  onClose,
  currentFileId,
  onChoose,
  canDelete,
}: {
  open: boolean;
  onClose: () => void;
  /** The draft's image: marked, and not offered again. */
  currentFileId: number | null | undefined;
  onChoose: (item: KioskGalleryItem) => void;
  /** The user may delete files (edit_files). */
  canDelete: boolean;
}) {
  const intl = useIntl();
  const [items, setItems] = useState<KioskGalleryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const list = useRef<HTMLUListElement>(null);
  /** Where focus goes once the rows have re-rendered (a row's button by sha256 and role, or the list). */
  const [focusNext, setFocusNext] = useState<{ sha?: string; role: 'use' | 'delete' | 'confirm' | 'list' } | null>(null);

  // Always the first n images from the top, never a page appended to a list that has changed since: a delete here or
  // an upload elsewhere shifts the server's pages, and an appended page would skip or repeat images.
  const loadUpTo = useCallback(async (n: number) => {
    setLoading(true);
    setError(null);
    try {
      const out: KioskGalleryItem[] = [];
      let count = 0;
      for (let page = 0; ; page++) {
        const res = await listKioskBackgroundImages(page, FETCH);
        count = res.total;
        for (const it of res.items) if (!out.some((x) => x.sha256 === it.sha256)) out.push(it);
        if (res.items.length < FETCH || out.length >= n) break;
      }
      setItems(out.slice(0, n));
      setTotal(count);
    } catch (e) {
      setError(errorText(e, intl));
    } finally {
      setLoading(false);
    }
  }, [intl]);

  useEffect(() => {
    if (open) {
      setConfirming(null);
      setStatus('');
      void loadUpTo(PAGE);
    }
  }, [open, loadUpTo]);

  useEffect(() => {
    if (!focusNext) return;
    const root = list.current;
    const el = focusNext.role === 'list' || !focusNext.sha
      ? root
      : root?.querySelector<HTMLElement>(`[data-sha="${focusNext.sha}"] [data-role="${focusNext.role}"]`);
    (el ?? root)?.focus();
    setFocusNext(null);
  }, [focusNext, items, confirming]);

  async function remove(item: KioskGalleryItem) {
    setError(null);
    const index = items.findIndex((x) => x.sha256 === item.sha256);
    const next = items[index + 1] ?? items[index - 1];
    try {
      for (const id of item.fileIds) await deleteKioskBackgroundImage(id);
      setItems((prev) => prev.filter((x) => x.sha256 !== item.sha256));
      setTotal((t) => t - 1);
      setStatus(intl.formatMessage(messages.deletedStatus, { name: item.name }));
      setConfirming(null);
      setFocusNext(next ? { sha: next.sha256, role: 'use' } : { role: 'list' });
    } catch (e) {
      // Some files may be gone already: show what the server has now, not a row that points at deleted files.
      setConfirming(null);
      await loadUpTo(Math.max(PAGE, items.length));
      setError(errorText(e, intl));
      setFocusNext({ role: 'list' });
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={intl.formatMessage(messages.title)}
      description={intl.formatMessage(messages.description)}
      footer={<Button onClick={onClose}>{intl.formatMessage(messages.close)}</Button>}
    >
      <div className="v2-kgal">
        <p className="v2-kgal__status" role="status" aria-live="polite">
          {status}
        </p>
        {error ? (
          <p className="v2-kgal__error" role="alert">
            {error}
          </p>
        ) : null}
        {!loading && items.length === 0 && !error ? <p className="v2-kgal__empty">{intl.formatMessage(messages.empty)}</p> : null}
        <ul ref={list} className="v2-kgal__list" aria-label={intl.formatMessage(messages.title)} tabIndex={-1}>
          {items.map((item) => {
            const current = item.fileIds.includes(currentFileId ?? -1);
            const others = item.usedByCount - item.usedBy.length;
            const names = item.usedBy.map((u) => u.name).join(', ');
            const uses = item.usedByCount === 0
              ? intl.formatMessage(messages.notUsed)
              : others <= 0
                ? intl.formatMessage(messages.usedByNames, { names })
                : item.usedBy.length
                  ? intl.formatMessage(messages.usedByNamesAndOthers, { names, count: others })
                  : intl.formatMessage(messages.usedByOthers, { count: others });
            return (
              <li key={item.sha256} className="v2-kgal__item" data-sha={item.sha256}>
                <img className="v2-kgal__thumb" src={hostedPath(item.url)} alt="" width={96} height={64} loading="lazy" />
                <div className="v2-kgal__facts">
                  <span className="v2-kgal__name">{item.name}</span>
                  <span className="v2-kgal__meta">
                    {intl.formatMessage(messages.meta, { width: item.width, height: item.height, size: fmtBytes(item.size, intl), date: fmtDateTime(item.uploadTime ?? undefined) })}
                  </span>
                  <span className="v2-kgal__meta">
                    <span className="v2-mono" title={item.sha256}>
                      {shortSha(item.sha256)}
                    </span>{' '}
                    · {uses}
                  </span>
                </div>
                <div className="v2-kgal__actions">
                  {current ? (
                    <span className="v2-kgal__current">{intl.formatMessage(messages.inUse)}</span>
                  ) : (
                    <Button size="sm" data-role="use" onClick={() => onChoose(item)} aria-label={intl.formatMessage(messages.useNamed, { name: item.name })}>
                      {intl.formatMessage(messages.use)}
                    </Button>
                  )}
                  {canDelete && item.usedByCount === 0 && !current ? (
                    confirming === item.sha256 ? (
                      <span className="v2-kgal__confirm" role="group" aria-label={intl.formatMessage(messages.deleteQuestion, { name: item.name })}>
                        <Button size="sm" variant="danger-primary" data-role="confirm" onClick={() => void remove(item)} aria-label={intl.formatMessage(messages.deleteForGoodNamed, { name: item.name })}>
                          {intl.formatMessage(messages.deleteForGood)}
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => {
                            setConfirming(null);
                            setFocusNext({ sha: item.sha256, role: 'delete' });
                          }}
                        >
                          {intl.formatMessage(messages.keep)}
                        </Button>
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        data-role="delete"
                        onClick={() => {
                          setConfirming(item.sha256);
                          setFocusNext({ sha: item.sha256, role: 'confirm' });
                        }}
                        aria-label={intl.formatMessage(messages.deleteNamed, { name: item.name })}
                      >
                        {intl.formatMessage(messages.delete)}
                      </Button>
                    )
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
        {items.length < total ? (
          <Button size="sm" onClick={() => void loadUpTo(items.length + PAGE)} disabled={loading}>
            {loading ? intl.formatMessage(messages.loading) : intl.formatMessage(messages.showMore, { count: total - items.length })}
          </Button>
        ) : loading && items.length === 0 ? (
          <SkeletonRows count={3} compact label={intl.formatMessage(messages.loadingImages)} />
        ) : null}
      </div>
    </Modal>
  );
}
