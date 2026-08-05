import { useEffect, useState } from 'react';
// Relative imports: eslint's import/no-unresolved has no TS-aware resolver
// for the `@/*` alias on value imports (see src/test/renderWithApi.tsx and
// src/renderer/api/FakeApi.ts for the same pre-existing gap).
import { useApi } from '../../api/ApiContext';
import { useData } from '../../windows/menubar/DataProvider';
import { EmptyState } from '../../shared/EmptyState/EmptyState';
import { UntagProjectRow } from './UntagProjectRow';
import styles from './UntagTab.module.css';

// index.html:2283 -- same `<path>` as UntagProjectRow.tsx's per-item icon
// (index.html:3762).
const ICON = (
  <svg viewBox="0 0 24 24">
    <path d="M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58.55 0 1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41 0-.55-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z" />
  </svg>
);

/**
 * index.html:3717-3824 (`renderUntag`) ported to React. Mounted once at
 * startup inside `#untag-content` (MenubarApp.tsx) and stays mounted
 * regardless of which tab is active -- see the "all panes stay mounted"
 * comment there.
 *
 * Untag has NO dismiss concept (`createDismissalContext` is not used here --
 * MRs, pipelines and releases are the only three dismissible collections in
 * the source). What it has instead is *exclusion*: `untagExcludedCount`
 * counts projects the MAIN process auto-excludes because they have no tags
 * at all (src/main/services/untagPolling.ts's `autoExcludeProject`,
 * triggered from `refresh()` when `client.getLatestTag()` returns nothing)
 * -- there is no per-project "exclude this" control anywhere in the
 * renderer, only the bulk "Reset exclusions" button below
 * (index.html:3750, `resetUntagExclusionsBtn`) that clears ALL exclusions
 * and lets the next poll re-evaluate every watched project from scratch.
 * See task-18-report.md for the full trace.
 */
export function UntagTab() {
  const api = useApi();
  const data = useData();

  // index.html:3802-3812 -- `.untag-detail-panel.expanded` is a class
  // toggled on a specific DOM node by the click handler `renderUntag()`
  // wires up AFTER building the list's innerHTML. Every call to
  // `renderUntag()` -- on the initial load, AND on every subsequent
  // `untag:dataUpdated` push (the 5-minute auto-poll in
  // src/main/services/untagPolling.ts, or the exclusions-reset-triggered
  // refresh) -- replaces `list.innerHTML` wholesale (index.html:3788),
  // which throws away that class along with the rest of the previous DOM:
  // there is no `expanded` class anywhere in the template string itself
  // (index.html:3759-3785), so a freshly rebuilt list is ALWAYS collapsed,
  // even if the exact same projects/commits are pushed again. A plain
  // `useState` here would NOT reproduce that -- React would keep the set
  // across re-renders indefinitely, surviving a poll the vanilla app does
  // not survive. The effect below forces the same collapse-on-every-push
  // behaviour by resetting to empty whenever `data.untagProjects` gets a
  // new array reference (which DataProvider only ever creates on the
  // initial load settling or a fresh `untag:dataUpdated` payload -- never
  // on an unrelated re-render, e.g. switching tabs).
  const [expandedIndices, setExpandedIndices] = useState<Set<number>>(new Set());
  useEffect(() => {
    setExpandedIndices(new Set());
  }, [data.untagProjects]);

  function toggleExpanded(idx: number) {
    setExpandedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  }

  // index.html:3726-3731. A SEPARATE flag from `data.isLoading` -- see
  // DataProvider.tsx's `isUntagLoading` doc comment for why reusing
  // `isLoading` here would be wrong.
  if (data.isUntagLoading) {
    return (
      <div className={styles.loadingState} id="untag-loading">
        <div className={styles.loadingSpinner} />
        <div className={styles.loadingText}>Scanning unreleased commits...</div>
      </div>
    );
  }

  // index.html:3735-3739
  if (data.untagProjects.length === 0 && data.untagExcludedCount === 0) {
    return (
      <EmptyState
        id="untag-empty"
        title="All Tagged"
        message="All watched projects are up to date with their latest tags"
        icon={ICON}
      />
    );
  }

  return (
    <div id="untag-list">
      {/* index.html:3746-3753 -- rendered even when `untagProjects` is
          itself empty, as long as `untagExcludedCount > 0` (the gate above
          only bails out when BOTH are zero). */}
      {data.untagExcludedCount > 0 && (
        <div className={styles.exclusionNotice}>
          <span>
            {data.untagExcludedCount} project{data.untagExcludedCount > 1 ? 's' : ''} excluded (no tags)
          </span>
          {/* index.html:3750 -- no className in the source either; styled
              purely via UntagTab.module.css's `.exclusionNotice button`
              descendant selector. */}
          <button
            id="resetUntagExclusionsBtn"
            onClick={() => {
              // index.html:3819-3821. The updated `untagProjects`/
              // `untagExcludedCount` arrive back via the `untag:dataUpdated`
              // push this triggers server-side (untagPollingService.
              // clearExclusions() followed by refresh(),
              // src/main/ipc/handlers.ts:340-344) -- not from this call's
              // own return value, so nothing further is done with it here.
              void api.gitlab.clearUntagExclusions();
            }}
          >
            Reset exclusions
          </button>
        </div>
      )}

      {data.untagProjects.map((project, idx) => (
        <UntagProjectRow
          key={project.projectId}
          project={project}
          idx={idx}
          expanded={expandedIndices.has(idx)}
          onToggleExpand={() => toggleExpanded(idx)}
          onOpen={() => {
            void api.app.openExternal(project.projectWebUrl);
          }}
        />
      ))}
    </div>
  );
}
