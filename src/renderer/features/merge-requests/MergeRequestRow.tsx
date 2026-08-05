import type { CSSProperties, MouseEvent } from 'react';
import type { MergeRequest, MergeRequestAuthor } from '@/shared/types';
// Relative import: eslint's import/no-unresolved has no TS-aware resolver
// for the `@/*` alias on value imports (see src/test/renderWithApi.tsx and
// src/renderer/api/FakeApi.ts for the same pre-existing gap).
import { Avatar, AvatarOverflow } from '../../shared/Avatar/Avatar';
import { ApprovalBadge } from './ApprovalBadge';
import { ItemCard } from '../../shared/ItemCard/ItemCard';
import { getAgeInfo, formatTime } from '../../utils/format';
import styles from './MergeRequestRow.module.css';

// index.html:2645-2647 -- set as inline style properties on the button
// directly in the source, not a CSS class; reproduced the same way.
const DONE_STYLE: CSSProperties = {
  color: 'var(--accent-green)',
  borderColor: 'var(--accent-green)',
  borderStyle: 'solid',
};

/** index.html:2644 -- the checkmark + "Done" replacement content for a
 * just-completed assign/reviewer action. */
function DoneContent() {
  return (
    <>
      <svg viewBox="0 0 24 24" style={{ width: 12, height: 12, fill: 'var(--accent-green)' }}>
        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
      </svg>{' '}
      Done
    </>
  );
}

/** index.html:1326-1346 -- the age tier drives BOTH the left accent bar's
 * color and whether it is permanently visible (see the module CSS for why
 * this is a real element here rather than an override of ItemCard's own
 * `::before`). */
function ageBarClass(itemClass: string): string | undefined {
  switch (itemClass) {
    case 'mr-age-fresh':
      return styles.ageFresh;
    case 'mr-age-warning':
      return styles.ageWarning;
    case 'mr-age-alert':
      return styles.ageAlert;
    case 'mr-age-danger':
      return styles.ageDanger;
    case 'mr-age-critical':
      return styles.ageCritical;
    default:
      return undefined;
  }
}

/** index.html:1360-1385 -- the `.item-time-badge` color tier. */
function badgeClass(badge: string): string | undefined {
  switch (badge) {
    case 'fresh':
      return styles.badgeFresh;
    case 'warning':
      return styles.badgeWarning;
    case 'alert':
      return styles.badgeAlert;
    case 'danger':
      return styles.badgeDanger;
    case 'critical':
      return styles.badgeCritical;
    default:
      return undefined;
  }
}

/**
 * index.html:2786-2799 / :2801-2814 -- one assignee/reviewer mini-avatar
 * stack, capped at 3 with a "+N" overflow chip. Identical markup for both
 * "Assigned" and "Reviewers" groups aside from the label, so both call
 * sites in MergeRequestRow below share this.
 */
function PeopleGroup({ label, people }: { label: string; people: MergeRequestAuthor[] | undefined }) {
  if (!people || people.length === 0) return null;
  return (
    <div className={styles.peopleGroup}>
      <span className={styles.peopleLabel}>{label}</span>
      <div className={styles.peopleAvatars}>
        {people.slice(0, 3).map((person) => (
          <Avatar key={person.id} src={person.avatar_url} name={person.name} size="mini" />
        ))}
        {people.length > 3 && <AvatarOverflow count={people.length - 3} />}
      </div>
    </div>
  );
}

export interface MergeRequestRowProps {
  mr: MergeRequest;
  /** index.html:2530-2539 -- click anywhere on the item except an
   * interactive child opens `mr.webUrl` via `app.openExternal`. */
  onOpen: () => void;
  /** index.html:2542-2553 */
  onDismiss: (event: MouseEvent) => void;
  /** index.html:2666-2743 -- toggles the notes panel for this MR. */
  onToggleNotes: (event: MouseEvent) => void;
  /** index.html:2556-2663 -- opens the assign/reviewer member dropdown. */
  onAction: (kind: 'assign' | 'reviewer', event: MouseEvent) => void;
  /**
   * index.html:2644-2647 -- which of this row's assign/reviewer buttons
   * (if any) just had a member successfully attached and should show the
   * transient green "Done" state instead of "+ Assign"/"+ Reviewer" until
   * the ~1s-later `refresh()` (index.html:2649-2651) repopulates
   * `assignees`/`reviewers` and the button stops rendering at all.
   */
  doneKinds: Set<'assign' | 'reviewer'>;
}

/**
 * index.html:2780-2877 (the `.map` body inside `renderSection`) -- one MR
 * row. `renderSection` itself (the `.section` wrapper + header + this map)
 * is composed by MergeRequestsTab using `SectionHeader`, not duplicated
 * here.
 */
export function MergeRequestRow({ mr, onOpen, onDismiss, onToggleNotes, onAction, doneKinds }: MergeRequestRowProps) {
  // index.html:2821
  const ageInfo = getAgeInfo(mr.createdAt);
  const ageBar = ageBarClass(ageInfo.itemClass);

  // index.html:2858,2860,2866 -- the whole `.mr-actions` block renders
  // when EITHER list is empty; each button independently gates on its own
  // list being empty.
  const showAssignBtn = !mr.assignees || mr.assignees.length === 0;
  const showReviewerBtn = !mr.reviewers || mr.reviewers.length === 0;
  const showActions = showAssignBtn || showReviewerBtn;
  const showPeopleRow = (mr.assignees && mr.assignees.length > 0) || (mr.reviewers && mr.reviewers.length > 0);

  // index.html:2824-2827
  const mentioned = mr.userMentionedInNotes;

  return (
    <ItemCard onClick={onOpen}>
      {/* index.html:1326-1346 -- see the module CSS doc comment for why
          this is a real element, not an override of ItemCard's `::before`. */}
      {ageBar && <span className={`${styles.ageBar} ${ageBar}`} />}
      <div className={styles.itemContent} style={{ width: '100%' }}>
        <div className={styles.itemHeader}>
          {/* index.html:2782-2784 */}
          <Avatar src={mr.author?.avatar_url} name={mr.author?.name} size="item" />
          <div className={styles.itemAuthorInfo}>
            <span className={styles.itemAuthorName}>{mr.author?.name || 'Unknown'}</span>
            <span className={styles.itemAuthorUsername}>@{mr.author?.username || ''}</span>
          </div>
          <div className={styles.headerRight}>
            {/* index.html:2825-2827 */}
            {mr.userNotesCount > 0 && (
              <span
                className={mentioned ? `${styles.notesBadge} ${styles.notesBadgeMentioned}` : styles.notesBadge}
                title={mentioned ? 'You are mentioned - click to view' : 'Click to view comments'}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  onToggleNotes(e);
                }}
              >
                <svg viewBox="0 0 24 24">
                  <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z" />
                </svg>
                {mr.userNotesCount}
                {mentioned ? ' @' : ''}
              </span>
            )}
            <span className={`${styles.itemTimeBadge} ${badgeClass(ageInfo.badgeClass) ?? ''}`}>
              {formatTime(mr.createdAt)}
            </span>
            {/* index.html:2841 -- opacity: 0.5 is an inline style in the
                source, overriding both the default 0 and the :hover 1 rule
                on `.item-dismiss`. Reproduced literally (see Avatar.module.css
                / task-15-report.md for why the CSS class rule that would
                normally reveal this on hover is intentionally not written
                here -- it would never win against this inline style anyway). */}
            <button
              className={styles.itemDismiss}
              title="Hide this MR"
              style={{ opacity: 0.5 }}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onDismiss(e);
              }}
            >
              <svg viewBox="0 0 24 24">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
              </svg>
            </button>
          </div>
        </div>
        {/* index.html:2846 */}
        <div className={styles.itemTitle}>
          {mr.draft && <span className={styles.draftBadge}>Draft</span>} {mr.title}
        </div>
        {/* index.html:2847-2851 */}
        <div className={styles.itemSubtitle}>
          {mr.projectPath || mr.projectName}
          <code>!{mr.iid}</code>
          {mr.hasConflicts && <span className={styles.conflictBadge}>Conflicts</span>}
          <ApprovalBadge approvedBy={mr.approvedBy} approvalsRequired={mr.approvalsRequired} />
        </div>
        {/* index.html:2852-2856 */}
        <div className={styles.branchInfo}>
          <span className={`${styles.branchTag} ${styles.branchTagSource}`} title={mr.sourceBranch}>
            {mr.sourceBranch}
          </span>
          <span className={styles.branchArrow}>{'→'}</span>
          <span className={`${styles.branchTag} ${styles.branchTagTarget}`} title={mr.targetBranch}>
            {mr.targetBranch}
          </span>
        </div>
        {/* index.html:2857 */}
        {showPeopleRow && (
          <div className={styles.peopleRow}>
            <PeopleGroup label="Assigned" people={mr.assignees} />
            <PeopleGroup label="Reviewers" people={mr.reviewers} />
          </div>
        )}
        {/* index.html:2858-2873 */}
        {showActions && (
          <div className={styles.mrActions}>
            {showAssignBtn && (
              <button
                className={styles.mrActionBtn}
                style={doneKinds.has('assign') ? DONE_STYLE : undefined}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  onAction('assign', e);
                }}
              >
                {doneKinds.has('assign') ? (
                  <DoneContent />
                ) : (
                  <>
                    <svg viewBox="0 0 24 24">
                      <path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                    </svg>
                    + Assign
                  </>
                )}
              </button>
            )}
            {showReviewerBtn && (
              <button
                className={styles.mrActionBtn}
                style={doneKinds.has('reviewer') ? DONE_STYLE : undefined}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  onAction('reviewer', e);
                }}
              >
                {doneKinds.has('reviewer') ? (
                  <DoneContent />
                ) : (
                  <>
                    <svg viewBox="0 0 24 24">
                      <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />
                    </svg>
                    + Reviewer
                  </>
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </ItemCard>
  );
}
