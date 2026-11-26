// The What's new dialog: a release's CHANGELOG.md section, once per version per browser after sign-in (seen.ts), and
// again from Settings (useWhatsNew). Mounted by AppShell, so never over the sign-in or set-password page.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { defineMessages, useIntl } from 'react-intl';
import { untyped } from '../data/configIntl';
import { useAuth } from '../auth/AuthContext';
import { applyRunning, useSupervisor } from '../data/useSupervisor';
import { Button, ButtonAnchor } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { useStickyValue } from '../ui/useStickyValue';
import { BUILD_VERSION, loadSection, releaseNotesUrl, whatsNewTarget, type WhatsNewTarget } from './bundle';
import { parseNotes, type ChangelogSection } from './changelog';
import { NotesView } from './NotesView';
import { markSeen, markShownByItself, whatsNewOnSignIn } from './seen';
import './WhatsNew.css';

export interface WhatsNewApi {
  /** The notes this console has for the running version; null while unknown or when it has none. */
  target: WhatsNewTarget | null;
  open: () => void;
}

const messages = untyped(defineMessages({
  titleUnreleased: { id: 'updates.whatsNew.titleUnreleased', defaultMessage: 'What’s new (unreleased)' },
  title: { id: 'updates.whatsNew.title', defaultMessage: 'What’s new in {version}' },
  unreleasedDescription: {
    id: 'updates.whatsNew.unreleasedDescription',
    defaultMessage: 'Not released yet: this dev build shows the Unreleased notes.',
  },
  released: { id: 'updates.whatsNew.released', defaultMessage: 'Released {date}.' },
  changelogLink: { id: 'updates.whatsNew.changelogLink', defaultMessage: 'CHANGELOG.md on GitHub ↗' },
  fullNotesLink: { id: 'updates.whatsNew.fullNotesLink', defaultMessage: 'Full release notes on GitHub ↗' },
  done: { id: 'updates.whatsNew.done', defaultMessage: 'Done' },
  loadFailed: { id: 'updates.whatsNew.loadFailed', defaultMessage: 'Couldn’t load the release notes. Read them on GitHub.' },
}));

const Ctx = createContext<WhatsNewApi | null>(null);

/** What's new for Settings; null outside the signed-in shell. */
export function useWhatsNew(): WhatsNewApi | null {
  return useContext(Ctx);
}

interface Shown {
  target: WhatsNewTarget;
  /** Null when the notes couldn't be loaded. */
  section: ChangelogSection | null;
}

export function WhatsNewProvider({ children }: { children: ReactNode }) {
  const { status, loaded } = useSupervisor();
  const serverVersion = status?.current;
  // Until the supervisor answers, the server's version isn't known (a dev build's Unreleased needs none).
  const target = useMemo(
    () => (loaded ? whatsNewTarget([serverVersion, BUILD_VERSION]) : whatsNewTarget([])),
    [loaded, serverVersion],
  );
  const [shown, setShown] = useState<Shown | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /** Whether it opened. */
  const show = useCallback(async (t: WhatsNewTarget, auto: boolean) => {
    const section = await loadSection(t);
    if (!mounted.current || (auto && !section)) return false;
    // Seen once it is on screen: notes that never load are not marked, and open on the next page load.
    markSeen(t.id);
    setShown({ target: t, section });
    return true;
  }, []);

  // Once per version, after sign-in: once the server has accepted the session (a stored sign-in can be expired, and
  // the sign-in page would replace the dialog), and not while an update is still applying (the version is about to
  // change).
  const { sessionConfirmed } = useAuth();
  const decided = useRef<string | null>(null);
  const updating = applyRunning(status);
  useEffect(() => {
    if (!target || !sessionConfirmed || updating || decided.current === target.id) return;
    decided.current = target.id;
    const what = whatsNewOnSignIn(target.id);
    if (what === 'fresh') markSeen(target.id);
    if (what === 'show') {
      // Once per page load: a server version that changes later (a late or newer answer) doesn't open it again.
      markShownByItself();
      // Notes that didn't load opened nothing: a version the server reports later may still open it.
      void show(target, true).then((opened) => {
        if (!opened) markShownByItself(false);
      });
    }
  }, [target, sessionConfirmed, updating, show]);

  const api = useMemo<WhatsNewApi>(
    () => ({
      target,
      open: () => {
        if (target) void show(target, false);
      },
    }),
    [target, show],
  );

  return (
    <Ctx.Provider value={api}>
      {children}
      <WhatsNewDialog shown={shown} onClose={() => setShown(null)} />
    </Ctx.Provider>
  );
}

function WhatsNewDialog({ shown: current, onClose }: { shown: Shown | null; onClose: () => void }) {
  // The last notes shown stay rendered while the dialog animates closed.
  const shown = useStickyValue(current);
  const intl = useIntl();
  // Focus starts at the top of the notes, so a long release opens at its title, not scrolled down to the buttons.
  const startRef = useRef<HTMLDivElement>(null);
  const notes = useMemo(() => (shown?.section ? parseNotes(shown.section.body) : null), [shown]);
  const t = shown?.target;
  const title = !t
    ? ''
    : t.version === null
      ? intl.formatMessage(messages.titleUnreleased)
      : intl.formatMessage(messages.title, { version: t.version });
  const description = !t
    ? undefined
    : t.version === null
      ? intl.formatMessage(messages.unreleasedDescription)
      : shown?.section?.date
        ? intl.formatMessage(messages.released, { date: shown.section.date })
        : undefined;
  return (
    <Modal
      open={current !== null}
      onClose={onClose}
      size="md"
      title={title}
      description={description}
      initialFocus={startRef}
      className="v2-whatsnew-modal"
      footer={
        t ? (
          <>
            <ButtonAnchor href={releaseNotesUrl(t)} target="_blank" rel="noopener noreferrer">
              {intl.formatMessage(t.version === null ? messages.changelogLink : messages.fullNotesLink)}
            </ButtonAnchor>
            <Button variant="primary" onClick={onClose}>
              {intl.formatMessage(messages.done)}
            </Button>
          </>
        ) : null
      }
    >
      <div ref={startRef} tabIndex={-1} className="v2-whatsnew__start">
        {notes ? (
          <NotesView notes={notes} onNavigate={onClose} />
        ) : (
          <p className="v2-whatsnew__p">{intl.formatMessage(messages.loadFailed)}</p>
        )}
      </div>
    </Modal>
  );
}
