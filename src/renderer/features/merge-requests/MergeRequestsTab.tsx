import { useEffect, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { ProjectMember, MRNote } from '@/shared/api/contract';
import type { MergeRequest, UserRole } from '@/shared/types';
// Relative imports: eslint's import/no-unresolved has no TS-aware resolver
// for the `@/*` alias on value imports (see src/test/renderWithApi.tsx and
// src/renderer/api/FakeApi.ts for the same pre-existing gap).
import { useApi } from '../../api/ApiContext';
import { useData, useMRDismissal } from '../../windows/menubar/DataProvider';
import { EmptyState } from '../../shared/EmptyState/EmptyState';
import { SectionHeader } from '../../shared/SectionHeader/SectionHeader';
import { formatTime } from '../../utils/format';
import { MergeRequestRow } from './MergeRequestRow';
import styles from './MergeRequestsTab.module.css';

// index.html:2515-2526 -- the four `renderSection` calls inside `renderMRs`
// define the sections that exist, their titles, their `.section-icon`
// color class (index.html:414-417) and, by call order, the order they
// appear in. Read directly off that function, not guessed:
//   renderSection('To review',      toReview,   'review',     ...)
//   renderSection('No reviewer',    unassigned, 'unassigned', ...)
//   renderSection('Assigned',       assigned,   'assigned',   ...)
//   renderSection('Created by me',  authored,   'authored',   ...)
// each gated on `.length > 0` -- an empty section renders nothing at all,
// not an empty header.
const SECTIONS: { title: string; role: UserRole; iconBackground: string }[] = [
  { title: 'To review', role: 'reviewer', iconBackground: 'var(--gradient-orange)' },
  { title: 'No reviewer', role: 'unassigned', iconBackground: 'var(--gradient-red)' },
  { title: 'Assigned', role: 'assignee', iconBackground: 'var(--gradient-blue)' },
  { title: 'Created by me', role: 'author', iconBackground: 'var(--gradient-green)' },
];

// index.html:2772 -- one fixed icon reused for every section, regardless
// of type; only the background color (SECTIONS above) varies.
const SECTION_ICON: ReactNode = (
  <svg viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="5" />
  </svg>
);

type DropdownKind = 'assign' | 'reviewer';

interface DropdownState {
  projectId: number;
  mrIid: number;
  mrId: number;
  kind: DropdownKind;
  top: number;
  left: number;
  status: 'loading' | 'empty' | 'error' | 'loaded' | 'updating' | 'itemError';
  members: ProjectMember[];
}

interface NotesPanelState {
  projectId: number;
  mrIid: number;
  top: number;
  right: number;
  status: 'loading' | 'empty' | 'error' | 'loaded';
  notes: MRNote[];
}

function sameNotesPanel(cur: NotesPanelState | null, projectId: number, mrIid: number): boolean {
  return !!cur && cur.projectId === projectId && cur.mrIid === mrIid;
}

function sameDropdown(cur: DropdownState | null, projectId: number, mrIid: number, kind: DropdownKind): boolean {
  return !!cur && cur.projectId === projectId && cur.mrIid === mrIid && cur.kind === kind;
}

/**
 * index.html:2665-2743 -- the floating comments panel. Rendered through a
 * portal to `document.body` (index.html:2689's `document.body.appendChild`)
 * so its `position: fixed` coordinates are relative to the viewport, not
 * whichever scrolling `.content` ancestor it would otherwise inherit from
 * in the normal tree.
 */
function NotesPanel({ state, onClose }: { state: NotesPanelState; onClose: () => void }) {
  return createPortal(
    <div
      className={styles.notesPanel}
      style={{ top: state.top, right: state.right }}
      onClick={(e) => e.stopPropagation()}
    >
      {state.status === 'loading' && <div className={styles.notesPanelLoading}>Loading comments...</div>}
      {state.status === 'error' && <div className={styles.notesPanelEmpty}>Error loading comments</div>}
      {state.status === 'empty' && <div className={styles.notesPanelEmpty}>No comments</div>}
      {state.status === 'loaded' && (
        <>
          {/* index.html:2700-2706 */}
          <div className={styles.notesPanelHeader}>
            <svg viewBox="0 0 24 24">
              <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z" />
            </svg>
            {state.notes.length} comment{state.notes.length > 1 ? 's' : ''}
            <button
              className={styles.notesPanelClose}
              title="Close"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
            >
              <svg viewBox="0 0 24 24">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
              </svg>
            </button>
          </div>
          {/* index.html:2708-2728 -- only the first 10 notes are shown. */}
          {state.notes.slice(0, 10).map((note) => (
            <div className={styles.noteItem} key={note.id}>
              <div className={styles.noteAuthor}>
                {/* index.html:2709-2711 -- dedicated markup, not `Avatar`:
                    `.note-author-placeholder` has its own size/font/no
                    border/no stacking margin, distinct from the mini
                    avatar stack. Reproduces the same unguarded
                    `note.author.name[0].toUpperCase()` crash risk as
                    Avatar's mini size (see Avatar.tsx's doc comment) --
                    same class of preserved bug, different markup. */}
                {note.author.avatar_url ? (
                  <img src={note.author.avatar_url} alt={note.author.name} />
                ) : (
                  <div className={styles.noteAuthorPlaceholder}>{note.author.name[0].toUpperCase()}</div>
                )}
                <span className={styles.noteAuthorName}>{note.author.name}</span>
                <span className={styles.noteAuthorTime}>{formatTime(note.createdAt)}</span>
              </div>
              {/* index.html:2713-2716 -- the note body only gets the
                  backtick-code and newline-to-<br> transforms, NOT full
                  `simpleMarkdown` (bold/italic/headers/links). A narrower,
                  separate rendering path in the source; reproduced as its
                  own inline transform rather than routed through
                  `simpleMarkdown`, which would also linkify and bold text
                  this view never did. */}
              <div
                className={styles.noteBody}
                dangerouslySetInnerHTML={{
                  __html: escapeForNoteBody(note.body).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\n/g, '<br>'),
                }}
              />
            </div>
          ))}
        </>
      )}
    </div>,
    document.body
  );
}

// index.html:2714's `escapeHtml(note.body)` -- a plain textContent/innerHTML
// round-trip, mirroring `format.ts`'s private `escapeForMarkdown` exactly
// (that helper is not exported -- see format.ts's doc comment for why it is
// scoped to `simpleMarkdown` only -- so this note-body path gets its own
// copy rather than reaching into that module's internals).
function escapeForNoteBody(text: string): string {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

/**
 * index.html:2568-2663 -- the assign/reviewer member-picker dropdown.
 * Portalled to `document.body` for the same reason as `NotesPanel`.
 */
function MemberDropdown({
  state,
  onSelect,
}: {
  state: DropdownState;
  onSelect: (userId: 'me' | number) => void;
}) {
  return createPortal(
    <div
      className={styles.mrDropdown}
      style={{ top: state.top, left: state.left }}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
      }}
    >
      {state.status === 'loading' && <div className={styles.mrDropdownLoading}>Loading members...</div>}
      {state.status === 'empty' && <div className={styles.mrDropdownLoading}>No members found</div>}
      {state.status === 'error' && <div className={styles.mrDropdownLoading}>Error loading members</div>}
      {state.status === 'itemError' && <div className={styles.mrDropdownLoading}>Error</div>}
      {state.status === 'updating' && <div className={styles.mrDropdownLoading}>Updating...</div>}
      {state.status === 'loaded' && (
        <>
          {/* index.html:2589-2596 -- "Me" always comes first. */}
          <button
            className={`${styles.mrDropdownItem} ${styles.meItem}`}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onSelect('me');
            }}
          >
            <svg
              viewBox="0 0 24 24"
              style={{ width: 22, height: 22, fill: 'var(--accent-purple)', flexShrink: 0 }}
            >
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
            </svg>
            <div className={styles.memberInfo}>
              <span className={styles.memberName}>Me</span>
              <span className={styles.memberUsername}>Assign to myself</span>
            </div>
          </button>
          {state.members.map((member) => (
            <button
              className={styles.mrDropdownItem}
              key={member.id}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onSelect(member.id);
              }}
            >
              {member.avatar_url ? (
                <img src={member.avatar_url} alt={member.name} />
              ) : (
                // index.html:2601 -- dedicated inline-styled placeholder,
                // not a CSS class in the source; reproduced the same way
                // rather than promoted into the module's stylesheet. Same
                // unguarded `member.name[0].toUpperCase()` crash risk as
                // Avatar's mini size and NotesPanel's author placeholder
                // above.
                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    background: 'var(--gradient-blue)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 10,
                    fontWeight: 600,
                    color: 'white',
                    flexShrink: 0,
                  }}
                >
                  {member.name[0].toUpperCase()}
                </div>
              )}
              <div className={styles.memberInfo}>
                <span className={styles.memberName}>{member.name}</span>
                <span className={styles.memberUsername}>@{member.username}</span>
              </div>
            </button>
          ))}
        </>
      )}
    </div>,
    document.body
  );
}

/**
 * index.html:2443-2884 (`loadDismissedMRs`, `renderMRs`, `renderSection`)
 * ported to React. Mounted once at startup inside `#mrs-content`
 * (MenubarApp.tsx) and stays mounted regardless of which tab is active --
 * see the "all panes stay mounted" comment there. `dismissedMRIds` lives in
 * `DataProvider` (via `useMRDismissal`), not local state, because
 * `MenubarApp`'s `#mrCount` badge needs the same filtered count (see
 * task-15-report.md for the badge-count fix this task makes).
 */
export function MergeRequestsTab() {
  const api = useApi();
  const data = useData();
  const { dismissedMRIds, dismissMR, restoreMRs } = useMRDismissal();

  const [notesPanel, setNotesPanel] = useState<NotesPanelState | null>(null);
  const [dropdown, setDropdown] = useState<DropdownState | null>(null);
  // index.html:2644-2647 -- transient "Done" visual feedback on the
  // just-used action button, cleared once `refresh()`'s resulting
  // `data:updated` repopulates `assignees`/`reviewers` and the button stops
  // rendering at all (see MergeRequestRow's `showAssignBtn`/`showReviewerBtn`).
  const [doneActions, setDoneActions] = useState<Set<string>>(new Set());

  // index.html:2745-2756. Both the `.mr-action-btn`/`.mr-dropdown` click
  // handlers and the `.notes-badge`/`.notes-panel` ones call
  // `e.stopPropagation()` (index.html:2558-2559,2578,2668-2669,2691), so a
  // click that should keep either open never reaches `document` at all --
  // this handler only ever runs for a genuine "outside" click, so it can
  // simply close both unconditionally rather than reproducing the source's
  // (structurally dead, since it can never see one of the click) `closest()`
  // exclusion checks.
  useEffect(() => {
    function handleDocumentClick() {
      setDropdown(null);
      setNotesPanel(null);
    }
    document.addEventListener('click', handleDocumentClick);
    return () => document.removeEventListener('click', handleDocumentClick);
  }, []);

  // index.html:2463-2464
  const visibleMRs = data.mergeRequests.filter((mr) => !dismissedMRIds.includes(mr.id));
  const dismissedCount = data.mergeRequests.length - visibleMRs.length;

  async function handleToggleNotes(mr: MergeRequest, event: ReactMouseEvent) {
    const rect = event.currentTarget.getBoundingClientRect();
    const wasOpen = sameNotesPanel(notesPanel, mr.projectId, mr.iid);
    // index.html:2673-2674 -- toggling notes always closes any open dropdown too.
    setDropdown(null);
    setNotesPanel(null);
    if (wasOpen) return;

    const top = rect.bottom + 6;
    const right = window.innerWidth - rect.right;
    setNotesPanel({ projectId: mr.projectId, mrIid: mr.iid, top, right, status: 'loading', notes: [] });

    try {
      const notes = await api.gitlab.getMRNotes(mr.projectId, mr.iid);
      setNotesPanel((cur) =>
        sameNotesPanel(cur, mr.projectId, mr.iid)
          ? notes && notes.length > 0
            ? { ...cur!, status: 'loaded', notes }
            : { ...cur!, status: 'empty' }
          : cur
      );
    } catch {
      setNotesPanel((cur) => (sameNotesPanel(cur, mr.projectId, mr.iid) ? { ...cur!, status: 'error' } : cur));
    }
  }

  async function handleAction(mr: MergeRequest, kind: DropdownKind, event: ReactMouseEvent) {
    const rect = event.currentTarget.getBoundingClientRect();
    setDropdown({
      projectId: mr.projectId,
      mrIid: mr.iid,
      mrId: mr.id,
      kind,
      top: rect.bottom + 4,
      left: rect.left,
      status: 'loading',
      members: [],
    });

    try {
      const members = await api.gitlab.getProjectMembers(mr.projectId);
      if (!members || members.length === 0) {
        setDropdown((cur) => (sameDropdown(cur, mr.projectId, mr.iid, kind) ? { ...cur!, status: 'empty' } : cur));
        setTimeout(() => {
          setDropdown((cur) => (sameDropdown(cur, mr.projectId, mr.iid, kind) ? null : cur));
        }, 2000);
        return;
      }
      setDropdown((cur) =>
        sameDropdown(cur, mr.projectId, mr.iid, kind) ? { ...cur!, status: 'loaded', members } : cur
      );
    } catch {
      setDropdown((cur) => (sameDropdown(cur, mr.projectId, mr.iid, kind) ? { ...cur!, status: 'error' } : cur));
      setTimeout(() => {
        setDropdown((cur) => (sameDropdown(cur, mr.projectId, mr.iid, kind) ? null : cur));
      }, 2000);
    }
  }

  async function handleSelectMember(userId: 'me' | number) {
    if (!dropdown) return;
    const { projectId, mrIid, mrId, kind } = dropdown;
    setDropdown((cur) => (sameDropdown(cur, projectId, mrIid, kind) ? { ...cur!, status: 'updating' } : cur));

    try {
      // index.html:2626-2631,2636-2640 -- "me" is passed as the sentinel
      // id 0, not resolved to a real user id client-side.
      const ids = userId === 'me' ? [0] : [userId];
      if (kind === 'assign') {
        await api.gitlab.assignMR(projectId, mrIid, ids);
      } else {
        await api.gitlab.addReviewer(projectId, mrIid, ids);
      }
      setDropdown(null);
      setDoneActions((prev) => new Set(prev).add(`${mrId}:${kind}`));
      // index.html:2649-2651
      setTimeout(() => {
        void api.gitlab.refresh();
      }, 1000);
    } catch {
      setDropdown((cur) => (sameDropdown(cur, projectId, mrIid, kind) ? { ...cur!, status: 'itemError' } : cur));
      setTimeout(() => {
        setDropdown((cur) => (sameDropdown(cur, projectId, mrIid, kind) ? null : cur));
      }, 2000);
    }
  }

  // index.html:2469-2475
  if (data.isLoading) {
    return (
      <div className={styles.loadingState} id="mrs-loading">
        <div className={styles.loadingSpinner} />
        <div className={styles.loadingText}>Loading merge requests...</div>
      </div>
    );
  }

  // index.html:2479-2493
  if (visibleMRs.length === 0 && dismissedCount === 0) {
    return (
      <EmptyState
        id="mrs-empty"
        titleId="mrs-empty-title"
        messageId="mrs-empty-desc"
        title="No Merge Requests"
        message={
          data.hasAccounts
            ? 'No open merge requests found for your account'
            : 'Add your GitLab account to track your merge requests in real-time'
        }
        icon={
          <svg viewBox="0 0 24 24">
            <path d="M6 3a3 3 0 0 0-3 3v2.25a3 3 0 0 0 3 3h.75v2.25a3 3 0 0 0 3 3h1.5V18a3 3 0 0 0 3 3h3a3 3 0 0 0 3-3v-2.25a3 3 0 0 0-3-3h-.75V10.5a3 3 0 0 0-3-3h-1.5V6a3 3 0 0 0-3-3H6z" />
          </svg>
        }
        action={
          !data.hasAccounts && (
            <button
              className={styles.btn}
              id="addAccountBtn"
              onClick={() => {
                void api.app.showPreferences();
              }}
            >
              Configure GitLab
            </button>
          )
        }
      />
    );
  }

  // index.html:2497-2526
  const sections = SECTIONS.map((section) => ({
    ...section,
    items: visibleMRs.filter((mr) => mr.userRole === section.role),
  })).filter((section) => section.items.length > 0);

  return (
    <div id="mrs-list">
      {dismissedCount > 0 && (
        <div className={styles.dismissedNotice}>
          <span>
            {dismissedCount} MR{dismissedCount > 1 ? 's' : ''} hidden
          </span>
          <button
            id="restoreMRsBtn"
            onClick={() => {
              void restoreMRs();
            }}
          >
            Show all
          </button>
        </div>
      )}

      {sections.map((section) => (
        <div className={styles.section} key={section.role}>
          <SectionHeader
            title={section.title}
            count={section.items.length}
            icon={SECTION_ICON}
            iconBackground={section.iconBackground}
          />
          {section.items.map((mr) => {
            const mrDoneKinds = new Set<DropdownKind>();
            if (doneActions.has(`${mr.id}:assign`)) mrDoneKinds.add('assign');
            if (doneActions.has(`${mr.id}:reviewer`)) mrDoneKinds.add('reviewer');
            return (
              <MergeRequestRow
                key={mr.id}
                mr={mr}
                doneKinds={mrDoneKinds}
                onOpen={() => {
                  void api.app.openExternal(mr.webUrl);
                }}
                onDismiss={() => {
                  void dismissMR(mr.id);
                }}
                onToggleNotes={(e) => {
                  void handleToggleNotes(mr, e);
                }}
                onAction={(kind, e) => {
                  void handleAction(mr, kind, e);
                }}
              />
            );
          })}
        </div>
      ))}

      {dropdown && <MemberDropdown state={dropdown} onSelect={(id) => void handleSelectMember(id)} />}
      {notesPanel && <NotesPanel state={notesPanel} onClose={() => setNotesPanel(null)} />}
    </div>
  );
}
