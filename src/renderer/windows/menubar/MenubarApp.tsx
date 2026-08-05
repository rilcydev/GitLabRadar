import { useCallback, useEffect, useState } from 'react';
// Relative import: eslint's import/no-unresolved has no TS-aware resolver
// for the `@/*` alias on value imports (see src/renderer/windows/preferences
// components for the same pre-existing gap).
import { useApi } from '../../api/ApiContext';
import { MergeRequestsTab } from '../../features/merge-requests/MergeRequestsTab';
import { PipelinesTab } from '../../features/pipelines/PipelinesTab';
import { useData, useMRDismissal, usePipelineDismissal } from './DataProvider';
import styles from './MenubarApp.module.css';

export type ViewMode = 'developer' | 'productOwner';

// index.html:2333, :3927-3937 (loadViewMode). The vanilla app reads this
// once from config at startup and again inside the data:updated handler (in
// case it changed from the preferences window) -- Task 13 only needs the
// read side; there is no setter here because nothing in this task's scope
// (the profile-nav Developer/Product Owner toggle) writes it yet. See
// task-13-report.md for why the toggle itself is out of scope.
export function useViewMode(): ViewMode {
  const api = useApi();
  const [viewMode, setViewMode] = useState<ViewMode>('developer');

  useEffect(() => {
    let cancelled = false;
    async function loadViewMode() {
      try {
        const vm = await api.config.get('viewMode');
        if (!cancelled) setViewMode(vm || 'developer');
      } catch (err) {
        // index.html:3933-3934
        console.error('Error loading viewMode:', err);
      }
    }
    void loadViewMode();
    return () => {
      cancelled = true;
    };
  }, [api]);

  return viewMode;
}

type TabId = 'mrs' | 'pipelines' | 'releases' | 'untag';

interface TabDef {
  id: TabId;
  label: string;
  // Literal badge element id from the source (index.html:2212,2216,2220,2224:
  // #mrCount/#pipelineCount/#releaseCount/#untagCount) -- ported markup keeps
  // its identity attribute.
  badgeId: string;
  // Fix round 1: `data-testid` is a convention this task introduced that
  // exists nowhere else in the codebase. Kept ALONGSIDE `badgeId` (not
  // instead of it) purely so the existing tests don't have to be rewritten
  // to query by DOM id; the source id is what actually ships.
  testId: string;
}

// Verbatim labels and badge element ids from index.html:2209-2226.
const TABS: TabDef[] = [
  { id: 'mrs', label: 'MRs', badgeId: 'mrCount', testId: 'mr-count' },
  { id: 'pipelines', label: 'Pipelines', badgeId: 'pipelineCount', testId: 'pipeline-count' },
  { id: 'releases', label: 'Releases', badgeId: 'releaseCount', testId: 'release-count' },
  { id: 'untag', label: 'Untag', badgeId: 'untagCount', testId: 'untag-count' },
];

// index.html:2426-2438. Pure function of the four datasets -- the source
// calls this from the tail of each render*() function, but since it never
// reads anything besides the counts, recomputing it on every MenubarApp
// render is equivalent without needing four separate call sites.
function headerSubtitle(mrCount: number, pipelineCount: number, releaseCount: number, untagCount: number): string {
  const total = mrCount + pipelineCount + releaseCount + untagCount;
  if (total === 0) return 'No activity';
  const parts: string[] = [];
  if (mrCount > 0) parts.push(`${mrCount} MR${mrCount > 1 ? 's' : ''}`);
  if (pipelineCount > 0) parts.push(`${pipelineCount} pipeline${pipelineCount > 1 ? 's' : ''}`);
  if (releaseCount > 0) parts.push(`${releaseCount} release${releaseCount > 1 ? 's' : ''}`);
  if (untagCount > 0) parts.push(`${untagCount} untag`);
  return parts.join(' • ');
}

export function MenubarApp() {
  const api = useApi();
  const data = useData();
  const { dismissedMRIds } = useMRDismissal();
  const { dismissedPipelineIds } = usePipelineDismissal();
  const viewMode = useViewMode();
  const [activeTab, setActiveTab] = useState<TabId>('mrs');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // index.html:2406-2411. `refresh()` runs, and only once it settles does a
  // 500ms timer start before the spin stops -- not a 500ms MINIMUM spin
  // overlapping the request, a 500ms spin AFTER it, reproduced verbatim.
  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    void api.gitlab.refresh().finally(() => {
      setTimeout(() => setIsRefreshing(false), 500);
    });
  }, [api]);

  // Fix (Task 15): this badge used to be raw `data.mergeRequests.length`,
  // but index.html:2463-2466 computes `mrCount.textContent` from
  // `visibleMRs.length` -- `mergeRequests` filtered to exclude dismissed
  // ids -- not the raw collection. Task 15 is what first wires up MR
  // dismissal (`useMRDismissal`), so this is the first point the mismatch
  // was reachable; fixed here rather than left to drift further. See
  // task-15-report.md.
  const mrCount = data.mergeRequests.filter((mr) => !dismissedMRIds.includes(mr.id)).length;
  // Fix (Task 16, mirroring Task 15's mrCount fix): this badge used to be
  // raw `data.pipelines.length`, but index.html:2902-2905 computes
  // `pipelineCount.textContent` from `visiblePipelines.length` --
  // `pipelines` filtered to exclude dismissed ids -- not the raw
  // collection. See task-16-report.md.
  const pipelineCount = data.pipelines.filter((p) => !dismissedPipelineIds.includes(p.id)).length;
  const releaseCount = data.releases.length;
  const untagCount = data.untagProjects.length;

  const badgeCounts: Record<TabId, number> = {
    mrs: mrCount,
    pipelines: pipelineCount,
    releases: releaseCount,
    untag: untagCount,
  };

  return (
    <div className={styles.app}>
      <div className={styles.header}>
        <div className={styles.logo}>
          <svg viewBox="0 0 24 24">
            <path d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 0 1-.3-.94l1.22-3.78 2.44-7.51A.42.42 0 0 1 4.82 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.49h8.1l2.44-7.51A.42.42 0 0 1 18.6 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.51L23 13.45a.84.84 0 0 1-.35.94z" />
          </svg>
        </div>
        <div className={styles.headerContent}>
          <div className={styles.headerTitle}>GitLabBar</div>
          <div className={styles.headerSubtitle} id="headerSubtitle">
            {headerSubtitle(mrCount, pipelineCount, releaseCount, untagCount)}
          </div>
        </div>
        <button
          type="button"
          id="refreshBtn"
          className={isRefreshing ? `${styles.refreshBtn} ${styles.refreshBtnSpinning}` : styles.refreshBtn}
          title="Refresh"
          onClick={handleRefresh}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M13.65 2.35A8 8 0 1 0 16 8h-2a6 6 0 1 1-1.76-4.24L10 6h6V0l-2.35 2.35z" />
          </svg>
        </button>
      </div>

      {viewMode === 'developer' && (
        <>
          <div className={styles.tabs}>
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={tab.id === activeTab ? `${styles.tab} ${styles.tabActive}` : styles.tab}
                onClick={() => setActiveTab(tab.id)}
              >
                <span>{tab.label}</span>
                <span className={styles.tabBadge} id={tab.badgeId} data-testid={tab.testId}>
                  {badgeCounts[tab.id]}
                </span>
              </button>
            ))}
          </div>

          <div className={styles.content}>
            {/* index.html:376-383: `.tab-content` is `display: none` and
                `.tab-content.active` is `display: block` -- ALL FOUR panes
                stay mounted at all times and only visibility toggles. Tasks
                15-18 fill these in; conditionally unmounting the inactive
                ones here would lose whatever local state those tasks give
                each pane (scroll position, in-progress input, expanded
                items, etc.) every time the user switches tabs, which the
                source never does. */}
            <div
              id="mrs-content"
              className={activeTab === 'mrs' ? `${styles.tabContent} ${styles.tabContentActive}` : styles.tabContent}
            >
              <MergeRequestsTab />
            </div>
            <div
              id="pipelines-content"
              className={
                activeTab === 'pipelines' ? `${styles.tabContent} ${styles.tabContentActive}` : styles.tabContent
              }
            >
              <PipelinesTab />
            </div>
            <div
              id="releases-content"
              className={
                activeTab === 'releases' ? `${styles.tabContent} ${styles.tabContentActive}` : styles.tabContent
              }
            />
            <div
              id="untag-content"
              className={activeTab === 'untag' ? `${styles.tabContent} ${styles.tabContentActive}` : styles.tabContent}
            />
          </div>
        </>
      )}
      {/* Product-owner view mode replaces the tab strip entirely rather
          than adding a fifth tab -- index.html:2291's po-content pane.
          Built in Task 17; this shell only needs to make room for it. */}
      {viewMode === 'productOwner' && <div className={styles.content} id="po-content" />}
    </div>
  );
}
