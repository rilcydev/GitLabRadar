import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProjectSearchResult } from '@/shared/api/contract';
import type { WatchedProject } from '@/shared/types';
// Relative import: eslint's import/no-unresolved has no TS-aware resolver
// for the `@/*` alias on value imports (see src/test/renderWithApi.tsx and
// src/renderer/api/FakeApi.ts for the same pre-existing gap).
import { useApi } from '../../../api/ApiContext';
import styles from './ProjectsPage.module.css';

// Ported verbatim from src/renderer/preferences.html:853-871 (markup) and
// the projectSearch/watchedProjects handlers at :1152-1288 (script).
//
// Parity notes:
// - preferences.html:1157-1160: the debounce gate is on `query.length < 2`,
//   not merely "empty". Typing 1 character (after clearing any pending
//   timeout) shows "Type at least 2 characters..." immediately and schedules
//   no search -- reproduced below. This condition is present in the source
//   but is NOT called out in the task-9 brief's behaviour list (which only
//   mentions "Searching...", "No projects found" and "Error during search").
//   The source wins per the task instructions; see task-9-report.md.
// - preferences.html:1197-1198 / :1248: search results show
//   `project.name` on one line and `project.path_with_namespace` on the
//   next; watched-project chips show `project.name` only, never the full
//   namespace path. This is a known scoped-out feature (bug #3 in the
//   plan's Global Constraints) -- reproduced literally, not "fixed" here.
// - preferences.html:1229-1230 always writes both `watchedProjectIds` and
//   `watchedProjectsData` on every toggle/remove -- reproduced as two
//   `api.config.set` calls per change, exactly like the source (not merged
//   into one derived write).
type ListState =
  | { kind: 'initial' }
  | { kind: 'tooShort' }
  | { kind: 'searching' }
  | { kind: 'error' }
  | { kind: 'empty' }
  | { kind: 'results'; projects: ProjectSearchResult[] };

export function ProjectsPage() {
  const api = useApi();
  const [watchedProjects, setWatchedProjects] = useState<WatchedProject[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [listState, setListState] = useState<ListState>({ kind: 'initial' });
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // preferences.html:1271-1281
  const loadWatchedProjects = useCallback(async () => {
    try {
      const config = await api.config.getAll();
      setWatchedProjects(config.watchedProjectsData || []);
    } catch (err) {
      console.error('Error loading watched projects:', err);
    }
  }, [api]);

  useEffect(() => {
    void loadWatchedProjects();
  }, [loadWatchedProjects]);

  // preferences.html:1227-1232
  const saveWatchedProjects = useCallback(
    async (list: WatchedProject[]) => {
      await api.config.set(
        'watchedProjectIds',
        list.map((p) => p.id)
      );
      await api.config.set('watchedProjectsData', list);
    },
    [api]
  );

  // preferences.html:1169-1179
  const performSearch = useCallback(
    async (query: string) => {
      try {
        const projects = await api.gitlab.searchProjects(query);
        if (!projects || projects.length === 0) {
          setListState({ kind: 'empty' });
        } else {
          setListState({ kind: 'results', projects });
        }
      } catch (err) {
        console.error('Error searching projects:', err);
        setListState({ kind: 'error' });
      }
    },
    [api]
  );

  // preferences.html:1153-1167
  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setSearchQuery(value);

      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
      const query = value.trim();

      if (query.length < 2) {
        setListState({ kind: 'tooShort' });
        return;
      }

      // preferences.html:1162: this runs synchronously on every keystroke,
      // *before* `setTimeout` below is even called -- deliberate and
      // source-faithful, not a bug to "optimize" by moving it into the
      // debounced callback. Despite the name, "Searching..." is a typing
      // indicator (shown the instant 2+ characters are present), not an
      // in-flight indicator (there is no separate state for "debounce timer
      // pending" vs. "request actually in flight"); it happens to also
      // cover the in-flight period because nothing changes listState again
      // until the request settles. The task-9 brief described it as
      // in-flight-only and was wrong -- see task-9-report.md fix round 1.
      setListState({ kind: 'searching' });

      searchTimeoutRef.current = setTimeout(() => {
        void performSearch(query);
      }, 300);
    },
    [performSearch]
  );

  // preferences.html:1209-1225 (toggleProject) -- the source derives
  // `isSelected` from the clicked DOM element's own `selected` class; here
  // it's derived from `watchedProjects` at render time instead (see the
  // `results` render branch below), which produces the identical toggle
  // outcome without needing to mutate a DOM node directly.
  const toggleProject = useCallback(
    async (project: ProjectSearchResult) => {
      const isSelected = watchedProjects.some((p) => p.id === project.id);
      const next = isSelected
        ? watchedProjects.filter((p) => p.id !== project.id)
        : [...watchedProjects, { id: project.id, name: project.name, path: project.path_with_namespace }];
      setWatchedProjects(next);
      await saveWatchedProjects(next);
    },
    [watchedProjects, saveWatchedProjects]
  );

  // preferences.html:1257-1268
  const removeWatchedProject = useCallback(
    async (id: number) => {
      const next = watchedProjects.filter((p) => p.id !== id);
      setWatchedProjects(next);
      await saveWatchedProjects(next);
    },
    [watchedProjects, saveWatchedProjects]
  );

  let listContent: React.ReactNode;
  switch (listState.kind) {
    case 'initial':
      // preferences.html:867
      listContent = <div className={styles.projectLoading}>Load your projects by typing in the search...</div>;
      break;
    case 'tooShort':
      // preferences.html:1158
      listContent = <div className={styles.projectLoading}>Type at least 2 characters...</div>;
      break;
    case 'searching':
      // preferences.html:1162
      listContent = <div className={styles.projectLoading}>Searching...</div>;
      break;
    case 'error':
      // preferences.html:1177
      listContent = <div className={styles.projectEmpty}>Error during search</div>;
      break;
    case 'empty':
      // preferences.html:1183
      listContent = <div className={styles.projectEmpty}>No projects found</div>;
      break;
    case 'results':
      // preferences.html:1189-1202
      listContent = listState.projects.map((project) => {
        const isSelected = watchedProjects.some((p) => p.id === project.id);
        return (
          <div
            key={project.id}
            className={isSelected ? `${styles.projectItem} ${styles.selected}` : styles.projectItem}
            onClick={() => void toggleProject(project)}
          >
            <div className={styles.projectCheckbox}>
              <svg viewBox="0 0 24 24">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
              </svg>
            </div>
            <div className={styles.projectInfo}>
              <div className={styles.projectName}>{project.name}</div>
              <div className={styles.projectPath}>{project.path_with_namespace}</div>
            </div>
          </div>
        );
      });
      break;
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.pageTitle}>Watched projects</h1>
      <p className={styles.pageDesc}>Select projects whose pipelines you want to follow.</p>

      <div className={styles.watchedProjects}>
        {watchedProjects.length > 0 && (
          <>
            {/* preferences.html:1241-1244 */}
            <div className={styles.watchedProjectsTitle}>
              Watched projects
              <span className={styles.watchedProjectsCount}>{watchedProjects.length}</span>
            </div>
            <div>
              {/* preferences.html:1246-1253. Chips show `project.name`
                  only -- see the parity note above. */}
              {watchedProjects.map((project) => (
                <span key={project.id} className={styles.watchedProjectChip}>
                  {project.name}
                  <svg
                    className={styles.watchedProjectRemove}
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    onClick={(e) => {
                      e.stopPropagation();
                      void removeWatchedProject(project.id);
                    }}
                  >
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                  </svg>
                </span>
              ))}
            </div>
          </>
        )}
      </div>

      <div className={styles.sectionTitle}>Search for a project</div>

      <div className={styles.projectSearch}>
        <svg className={styles.projectSearchIcon} viewBox="0 0 24 24">
          <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
        </svg>
        <input type="text" placeholder="Search for a project..." value={searchQuery} onChange={handleSearchChange} />
      </div>

      <div className={styles.projectListContainer}>{listContent}</div>
    </div>
  );
}
