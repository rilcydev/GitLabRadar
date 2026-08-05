import { useEffect, useState, type ReactNode } from 'react';
import type { Release } from '@/shared/types';
// Relative imports: eslint's import/no-unresolved has no TS-aware resolver
// for the `@/*` alias on value imports (see src/test/renderWithApi.tsx and
// src/renderer/api/FakeApi.ts for the same pre-existing gap).
import { useApi } from '../../api/ApiContext';
import { useData } from '../../windows/menubar/DataProvider';
import { EmptyState } from '../../shared/EmptyState/EmptyState';
import { POReleaseRow } from './POReleaseRow';
import styles from './POView.module.css';

// index.html:3417 -- also reused for the empty-state icon (:2303) and,
// mirroring ReleasesTab.tsx's SECTION_ICON, the section header's own icon.
const SECTION_ICON: ReactNode = (
  <svg viewBox="0 0 24 24">
    <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
  </svg>
);

// index.html:3474 -- hardcoded page size for "Load more releases".
const PER_PAGE = 5;

/**
 * index.html:2334,3939-3950 (`hasWatchedProjects`, `loadWatchedProjects`) --
 * loaded once at mount and again on every `data:updated` push
 * (index.html:3897). `setViewMode` (MenubarApp.tsx) ALSO calls
 * `loadWatchedProjects()` directly (index.html:2394) before `applyViewMode`,
 * but since `POView` stays mounted at all times (see MenubarApp.tsx's "all
 * panes stay mounted" comment) rather than being freshly created when the
 * user switches into product-owner mode, reproducing that second call site
 * would mean keying this effect on `viewMode` too -- an activation-trigger
 * this codebase deliberately avoids elsewhere (effects run on every
 * `data:updated`, not on tab/mode activation). Reloading on every data
 * refresh (below) already covers the overwhelmingly common case (changing
 * watched projects in Preferences triggers a polling refresh, which pushes
 * `data:updated` shortly after); the narrow gap -- toggling into PO view
 * between a Preferences change and the next refresh -- is a difference from
 * vanilla, called out in task-17-report.md.
 *
 * Local to `POView` (not lifted into `DataProvider` alongside `hasAccounts`)
 * because this is its only consumer.
 */
function useHasWatchedProjects(): boolean {
  const api = useApi();
  const data = useData();
  const [hasWatchedProjects, setHasWatchedProjects] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const ids = await api.config.get('watchedProjectIds');
        if (!cancelled) setHasWatchedProjects(Array.isArray(ids) && ids.length > 0);
      } catch (err) {
        // index.html:3946-3948
        console.error('Error loading watched projects:', err);
        if (!cancelled) setHasWatchedProjects(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [api, data.lastUpdated]);

  return hasWatchedProjects;
}

/**
 * index.html:3323-3571 (`renderPOView`, `renderPORelease`) ported to React.
 * Mounted once at startup inside `#po-content` (MenubarApp.tsx) and stays
 * mounted regardless of view mode -- see the "all panes stay mounted"
 * comment there. Unlike ReleasesTab, this view reads `data.releases`
 * directly, with NO dismissal filtering -- `renderPOView` never references
 * `dismissedReleaseIds` anywhere in the source.
 */
export function POView() {
  const api = useApi();
  const data = useData();
  const hasWatchedProjects = useHasWatchedProjects();

  // index.html:2336 `poFilterProject`.
  const [filterProject, setFilterProject] = useState('all');
  // index.html:3472-3516's per-project extra pages fetched via "Load more".
  // Vanilla appends these directly into the DOM (:3504-3506) rather than
  // into the `releases` array, so the next FULL `renderPOView()` call
  // (triggered by any data refresh) silently discards them, rebuilding
  // purely from `releases` again. React's own re-render from new `data`
  // already does that rebuild; this effect is what actually drops the
  // stale extra pages to match, the same way MergeRequestsTab.tsx's
  // `doneActions` is cleared on `data.mergeRequests` changing.
  const [extraReleases, setExtraReleases] = useState<Record<number, Release[]>>({});
  // index.html:3518-3519 -- `if (newReleases.length < 5) { btn.style.display = 'none'; }`.
  const [exhausted, setExhausted] = useState<Set<number>>(new Set());
  const [loadingProjects, setLoadingProjects] = useState<Set<number>>(new Set());
  // index.html:2335 `poReleasesPages` -- a page counter per project id
  // that, UNLIKE the two pieces of state above, is never reset by a data
  // refresh anywhere in the source (no reassignment after its initial
  // declaration; only ever incremented). Preserved quirk, deliberately NOT
  // reset here either: after "Load more" advances a project to (say) page
  // 3, an unrelated data refresh wipes the two extra pages of VISIBLE items
  // back to page 1's worth (via the effect above) but this counter stays at
  // 3, so the next "Load more" click fetches page 4 -- silently skipping
  // pages 2 and 3 the refresh just discarded. See POView.test.tsx's pinning
  // test.
  const [pages, setPages] = useState<Record<number, number>>({});

  useEffect(() => {
    setExtraReleases({});
    setExhausted(new Set());
  }, [data.releases]);

  // index.html:3330-3336
  if (data.isLoading) {
    return (
      <div className={styles.loadingState} id="po-loading">
        <div className={styles.loadingSpinner} />
        <div className={styles.loadingText}>Loading releases...</div>
      </div>
    );
  }

  // index.html:3340-3357
  if (data.releases.length === 0) {
    return (
      <EmptyState
        id="po-empty"
        titleId="po-empty-title"
        messageId="po-empty-desc"
        title={hasWatchedProjects ? 'No releases yet' : 'No projects configured'}
        message={
          hasWatchedProjects
            ? "Your followed projects don't have any releases yet, or none have been fetched."
            : 'Add projects in Preferences → Projects to see their releases here.'
        }
        icon={SECTION_ICON}
        action={
          <button
            className={styles.btn}
            id="configPOBtn"
            onClick={() => {
              void api.app.showPreferences();
            }}
          >
            {hasWatchedProjects ? 'Manage projects' : 'Configure projects'}
          </button>
        }
      />
    );
  }

  // index.html:3362-3373 -- grouped by `projectPath || projectName ||
  // 'Unknown'` (same fallback chain as ReleasesTab, index.html:3157/3365),
  // over ALL releases (not filtered by dismissal).
  const releasesByProject = new Map<string, Release[]>();
  const projectIdByPath = new Map<string, number>();
  for (const release of data.releases) {
    const key = release.projectPath || release.projectName || 'Unknown';
    const group = releasesByProject.get(key);
    if (group) {
      group.push(release);
    } else {
      releasesByProject.set(key, [release]);
    }
    // index.html:3370-3372 -- `if (release.projectId)`. Typed non-optional,
    // guarded literally anyway for the same "type is a claim, not a
    // runtime guarantee" reason as elsewhere in this port.
    if (release.projectId) {
      projectIdByPath.set(key, release.projectId);
    }
  }

  // index.html:3376 -- SORTED, unlike ReleasesTab's own (unsorted)
  // grouping.
  const projectPaths = [...releasesByProject.keys()].sort();
  // index.html:3388-3390
  const filteredProjects = filterProject === 'all' ? projectPaths : projectPaths.filter((p) => p === filterProject);

  async function handleLoadMore(projectId: number) {
    setLoadingProjects((prev) => new Set(prev).add(projectId));
    const nextPage = (pages[projectId] ?? 1) + 1;
    try {
      const newReleases = await api.gitlab.getPOReleases(projectId, nextPage, PER_PAGE);
      setPages((prev) => ({ ...prev, [projectId]: nextPage }));
      if (newReleases.length > 0) {
        setExtraReleases((prev) => ({ ...prev, [projectId]: [...(prev[projectId] ?? []), ...newReleases] }));
      }
      if (newReleases.length < PER_PAGE) {
        setExhausted((prev) => new Set(prev).add(projectId));
      }
    } catch (err) {
      // index.html:3524-3527
      console.error('Error loading more releases:', err);
    } finally {
      setLoadingProjects((prev) => {
        const next = new Set(prev);
        next.delete(projectId);
        return next;
      });
    }
  }

  return (
    <div id="po-list">
      {/* index.html:3375-3385 */}
      <div className={styles.poFilter} id="po-filter">
        <select
          id="po-project-filter"
          value={filterProject}
          onChange={(e) => setFilterProject(e.target.value)}
        >
          <option value="all">All projects</option>
          {projectPaths.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      {filteredProjects.map((projectPath) => {
        const baseReleases = releasesByProject.get(projectPath) ?? [];
        const projectId = projectIdByPath.get(projectPath);
        const allReleases = projectId ? [...baseReleases, ...(extraReleases[projectId] ?? [])] : baseReleases;
        const count = allReleases.length;

        return (
          <div className={styles.section} data-project-id={projectId} data-project-path={projectPath} key={projectPath}>
            {/* index.html:3415-3421 */}
            <div className={styles.poProjectHeader}>
              <div className={styles.poProjectIcon}>{SECTION_ICON}</div>
              <span className={styles.poProjectName}>{projectPath}</span>
              <span className={styles.poProjectCount}>
                {count} release{count > 1 ? 's' : ''}
              </span>
            </div>
            <div className={styles.poReleasesContainer} data-project-id={projectId}>
              {allReleases.map((release) => (
                <POReleaseRow
                  key={release.id}
                  release={release}
                  onOpen={() => {
                    void api.app.openExternal(release.webUrl);
                  }}
                />
              ))}
            </div>
            {/* index.html:3425 -- rendered whenever `projectId` is truthy;
                hidden (here: unmounted, holding no state of its own) once
                a fetch returns fewer than `PER_PAGE` results. */}
            {projectId !== undefined && !exhausted.has(projectId) && (
              <button
                className={styles.poLoadMore}
                data-project-id={projectId}
                disabled={loadingProjects.has(projectId)}
                onClick={(e) => {
                  // index.html:3465
                  e.stopPropagation();
                  void handleLoadMore(projectId);
                }}
              >
                {loadingProjects.has(projectId) ? 'Loading...' : 'Load more releases'}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
