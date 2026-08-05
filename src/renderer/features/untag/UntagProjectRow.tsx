import type { UntagProject } from '@/shared/types';
import { formatTime, getUntagAgeInfo } from '../../utils/format';
import styles from './UntagTab.module.css';

// index.html:3762 -- also reused as the empty-state icon in UntagTab.tsx
// (index.html:2283 uses the exact same `<path>`).
const ITEM_ICON = (
  <svg viewBox="0 0 24 24">
    <path d="M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58.55 0 1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41 0-.55-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z" />
  </svg>
);

// index.html:1360-1385 -- the `.item-time-badge` color tier. Same mapping
// as MergeRequestRow.tsx's `badgeClass`, duplicated (not shared) because
// the source itself duplicates the underlying CSS rule set rather than
// factoring it out (see UntagTab.module.css's doc comment).
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

export interface UntagProjectRowProps {
  project: UntagProject;
  /**
   * index.html:3755 -- the array index from `untagProjects.forEach((project,
   * idx) => ...)`, NOT a stable project identity. The source keys both the
   * expand button's `data-idx` and the detail panel's `id` off this
   * position, and `renderUntag()` rebuilds the whole list from scratch on
   * every call anyway (see UntagTab.tsx's `expandedIndices` reset), so
   * positional identity is exactly what the source uses and what this port
   * reproduces -- not `project.projectId`.
   */
  idx: number;
  /** index.html:3806-3810 -- `panel.classList.contains('expanded')`. */
  expanded: boolean;
  /** index.html:3802-3812 -- toggles this row's own detail panel only. */
  onToggleExpand: () => void;
  /** index.html:3790-3798 -- click anywhere on the item except the expand button opens `project.projectWebUrl`. */
  onOpen: () => void;
}

/**
 * index.html:3755-3786 (the `.forEach` body inside `renderUntag`) -- one
 * untag project row.
 *
 * Deliberately does NOT reuse the shared `ItemCard` -- see
 * UntagTab.module.css's doc comment for why `.untag-item` is a distinct
 * shell, not `.item`.
 */
export function UntagProjectRow({ project, idx, expanded, onToggleExpand, onOpen }: UntagProjectRowProps) {
  // index.html:3756
  const ageInfo = getUntagAgeInfo(project.lastTagDate);
  // index.html:3757
  const commitsLabel = project.commitsAhead === 1 ? 'commit' : 'commits';
  // index.html:3770,3772 -- `project.commits && project.commits.length > 0`,
  // guarded literally rather than trusting `UntagProject.commits: UntagCommit[]`'s
  // non-optional type (see this file's other guards / Avatar.tsx's identical
  // reasoning for why a compile-time type isn't a runtime guarantee).
  const hasCommits = !!(project.commits && project.commits.length > 0);

  // Note: `ageInfo.itemClass` ('mr-age-fresh' etc., index.html:3696-3715) is
  // NOT applied to this row anywhere below. In the source it IS added to
  // the item's class list (index.html:3760, `class="untag-item
  // ${ageInfo.itemClass}"`), but it has ZERO visual effect there: the only
  // rule that reads an `mr-age-*` class (index.html:1326-1346,
  // `.item.mr-age-fresh::before` etc.) requires the `.item` class to ALSO be
  // present, and untag rows only ever carry `.untag-item` (verified by grep
  // -- no `.untag-item.mr-age-*` rule exists anywhere in the source).
  // Reproducing an inert class here would just be dead code with an extra
  // step; only `ageInfo.badgeClass` (which DOES have effect via
  // `.item-time-badge.<tier>`) is used below. See task-18-report.md.

  return (
    <div
      className={styles.untagItem}
      onClick={() => {
        // index.html:3794-3796 -- `if (url && ...)`. `project.projectWebUrl`
        // is typed non-optional, but that's a compile-time claim, not a
        // runtime guarantee -- guarded literally rather than trusted.
        if (project.projectWebUrl) onOpen();
      }}
    >
      <div className={styles.itemIcon}>{ITEM_ICON}</div>
      <div className={styles.itemContent}>
        {/* index.html:3765,3715 -- Bug-lot fix (#3): show the full
            `project.projectPath` instead of the short `projectName`, so
            same-named projects in different groups are distinguishable. */}
        <div className={styles.itemTitle}>{project.projectPath}</div>
        <div className={styles.itemSubtitle}>
          <span className={styles.tagName}>{project.lastTagName}</span>
          <span className={styles.commitsCount}>
            +{project.commitsAhead} {commitsLabel}
          </span>
          <span className={`${styles.itemTimeBadge} ${badgeClass(ageInfo.badgeClass) ?? ''}`}>
            {formatTime(project.lastTagDate)}
          </span>
          {hasCommits && (
            <button
              className={styles.expandBtn}
              data-idx={idx}
              onClick={(e) => {
                // index.html:3804 -- `e.stopPropagation()`.
                e.stopPropagation();
                onToggleExpand();
              }}
            >
              {expanded ? 'Hide commits' : 'Show commits'}
            </button>
          )}
        </div>
        {hasCommits && (
          <div
            className={expanded ? `${styles.detailPanel} ${styles.detailPanelExpanded}` : styles.detailPanel}
            id={`untag-detail-${idx}`}
          >
            {project.commits.map((commit) => (
              <div className={styles.commitItem} key={commit.id}>
                <span className={styles.commitSha}>{commit.shortId}</span>
                <span className={styles.commitTitle}>{commit.title}</span>
                <span className={styles.commitAuthor}>{commit.authorName}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
