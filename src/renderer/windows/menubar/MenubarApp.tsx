import { useCallback, useEffect, useState } from 'react';
// Relative import: eslint's import/no-unresolved has no TS-aware resolver
// for the `@/*` alias on value imports (see src/renderer/windows/preferences
// components for the same pre-existing gap).
import { useApi } from '../../api/ApiContext';
import { MergeRequestsTab } from '../../features/merge-requests/MergeRequestsTab';
import { PipelinesTab } from '../../features/pipelines/PipelinesTab';
import { POView } from '../../features/releases/POView';
import { ReleasesTab } from '../../features/releases/ReleasesTab';
import { useData, useMRDismissal, usePipelineDismissal, useReleaseDismissal } from './DataProvider';
import styles from './MenubarApp.module.css';

export type ViewMode = 'developer' | 'productOwner';

export interface ViewModeControls {
  viewMode: ViewMode;
  /**
   * index.html:2383-2396. No-op if `mode` already matches the current
   * value; otherwise updates local state FIRST (synchronously, like the
   * source's `viewMode = mode;`), then persists via `config.set`. The
   * source's `updateProfileNavUI()`/`applyViewMode()` calls that follow are
   * both imperative re-renders of exactly the state this setter already
   * just changed -- in React, whatever reads `viewMode` (MenubarApp's own
   * JSX below) re-renders automatically, so there is nothing further to
   * call.
   */
  setViewMode: (mode: ViewMode) => Promise<void>;
}

// index.html:2333, :3927-3937 (loadViewMode).
export function useViewMode(): ViewModeControls {
  const api = useApi();
  const [viewMode, setViewModeState] = useState<ViewMode>('developer');

  useEffect(() => {
    let cancelled = false;
    async function loadViewMode() {
      try {
        const vm = await api.config.get('viewMode');
        if (!cancelled) setViewModeState(vm || 'developer');
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

  const setViewMode = useCallback(
    async (mode: ViewMode) => {
      if (viewMode === mode) return; // index.html:2384
      setViewModeState(mode); // index.html:2385
      try {
        await api.config.set('viewMode', mode); // index.html:2387-2389
      } catch (err) {
        console.error('Error saving viewMode:', err); // index.html:2390-2391
      }
    },
    [api, viewMode]
  );

  return { viewMode, setViewMode };
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

// index.html:3826-3832 (`updateStatus`). `status` is only ever set to
// 'connected'/'error' by an explicit call (on loadData/data:updated
// settling, mirrored by `Data.isLoading` flipping false); before that first
// settle it stays at the static markup's default, 'offline'
// (index.html:2316) -- `Data.isLoading` starts `true` for exactly that
// window, so it stands in for "no updateStatus call has landed yet".
function statusDotState(isLoading: boolean, error: string | undefined): 'offline' | 'connected' | 'error' {
  if (isLoading) return 'offline';
  return error ? 'error' : 'connected';
}

// index.html:3829 -- `new Date(lastUpdated).toLocaleTimeString('en-US', {
// hour: '2-digit', minute: '2-digit' })`.
function formatUpdatedAt(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

const STATUS_DOT_CLASS: Record<'offline' | 'connected' | 'error', string> = {
  offline: styles.statusDotOffline,
  connected: styles.statusDotConnected,
  error: styles.statusDotError,
};

export function MenubarApp() {
  const api = useApi();
  const data = useData();
  const { dismissedMRIds } = useMRDismissal();
  const { dismissedPipelineIds } = usePipelineDismissal();
  const { dismissedReleaseIds } = useReleaseDismissal();
  const { viewMode, setViewMode } = useViewMode();
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
  // Fix (Task 17, mirroring Tasks 15/16's mrCount/pipelineCount fixes):
  // index.html:3130-3133 computes `#releaseCount` from
  // `visibleReleases.length` -- `releases` filtered to exclude dismissed
  // ids -- not the raw collection. See task-17-report.md.
  const releaseCount = data.releases.filter((r) => !dismissedReleaseIds.includes(r.id)).length;
  const untagCount = data.untagProjects.length;

  const badgeCounts: Record<TabId, number> = {
    mrs: mrCount,
    pipelines: pipelineCount,
    releases: releaseCount,
    untag: untagCount,
  };

  // index.html:3301. Applies unconditionally, regardless of the current
  // view mode.
  const profileNavDisplay = data.hasAccounts ? 'flex' : 'none';
  // index.html:3305,3314.
  const tabsDisplay = viewMode === 'productOwner' ? 'none' : data.hasAccounts ? 'flex' : 'none';
  // index.html:376-383,3306-3318. A developer pane is active only in
  // developer mode AND when it is the selected tab.
  const isDevPaneActive = (id: TabId) => viewMode === 'developer' && activeTab === id;
  const paneClass = (active: boolean) => (active ? `${styles.tabContent} ${styles.tabContentActive}` : styles.tabContent);

  const status = statusDotState(data.isLoading, data.error);

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

      {/* index.html:2204-2208. Always mounted -- applyViewMode
          (index.html:3301) only ever toggles `style.display`, never removes
          this from the DOM -- visible whenever an account is configured,
          regardless of the current view mode. */}
      <div className={styles.profileNav} id="profileNav" style={{ display: profileNavDisplay }}>
        <button
          type="button"
          className={
            viewMode === 'developer' ? `${styles.profileNavItem} ${styles.profileNavItemActive}` : styles.profileNavItem
          }
          data-profile="developer"
          id="profileDeveloper"
          aria-pressed={viewMode === 'developer'}
          onClick={() => {
            void setViewMode('developer');
          }}
        >
          Developer
        </button>
        <button
          type="button"
          className={
            viewMode === 'productOwner'
              ? `${styles.profileNavItem} ${styles.profileNavItemActive}`
              : styles.profileNavItem
          }
          data-profile="productOwner"
          id="profileProductOwner"
          aria-pressed={viewMode === 'productOwner'}
          onClick={() => {
            void setViewMode('productOwner');
          }}
        >
          Product Owner
        </button>
      </div>

      {/* index.html:2209-2226. Same "always mounted, display toggled"
          treatment as profileNav above (index.html:3305,3314) -- not a JSX
          conditional, so switching modes never unmounts these stateless tab
          buttons either (though, unlike the panes below, that would be
          harmless either way since they hold no state of their own). */}
      <div className={styles.tabs} style={{ display: tabsDisplay }}>
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

      {/* index.html:2228-2311. All FIVE panes (four developer tabs plus
          po-content) are permanent DOM siblings; `applyViewMode`/`render*()`
          only ever move the `active` class (index.html:376-383,3306-3318),
          never unmount. Switching `viewMode` or `activeTab` therefore only
          ever changes which pane carries `tabContentActive` -- it can no
          longer tear down and remount any of Tasks 15-18's per-tab state
          (scroll position, expanded rows, in-flight requests) the way an
          earlier `{viewMode === 'developer' && <>...</>}` JSX conditional
          would have. See MenubarApp.test.tsx's node-identity test, which
          proves this directly. */}
      <div className={styles.content}>
        <div id="mrs-content" className={paneClass(isDevPaneActive('mrs'))}>
          <MergeRequestsTab />
        </div>
        <div id="pipelines-content" className={paneClass(isDevPaneActive('pipelines'))}>
          <PipelinesTab />
        </div>
        <div id="releases-content" className={paneClass(isDevPaneActive('releases'))}>
          <ReleasesTab />
        </div>
        <div id="untag-content" className={paneClass(isDevPaneActive('untag'))} />
        <div id="po-content" className={paneClass(viewMode === 'productOwner')}>
          <POView viewMode={viewMode} />
        </div>
      </div>

      {/* index.html:2313-2321, behaviour in `updateStatus()` at
          :3826-3832. */}
      <div className={styles.footer}>
        <div className={styles.footerStatus}>
          <div className={styles.statusIndicator}>
            <span className={`${styles.statusDot} ${STATUS_DOT_CLASS[status]}`} id="statusDot" />
            <span className={styles.statusText} id="lastUpdate">
              {data.lastUpdated ? `Updated at ${formatUpdatedAt(data.lastUpdated)}` : 'Not connected'}
            </span>
          </div>
        </div>
        <span
          className={styles.footerLink}
          id="prefsLink"
          onClick={() => {
            void api.app.showPreferences();
          }}
        >
          Preferences
        </span>
      </div>
    </div>
  );
}
