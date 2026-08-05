// Relative imports: eslint's import/no-unresolved has no TS-aware resolver
// for the `@/*` alias on value imports (see src/test/renderWithApi.tsx and
// src/renderer/api/FakeApi.ts for the same pre-existing gap).
import { useApi } from '../../api/ApiContext';
import { useData, usePipelineDismissal } from '../../windows/menubar/DataProvider';
import { EmptyState } from '../../shared/EmptyState/EmptyState';
import { PipelineRow } from './PipelineRow';
import styles from './PipelinesTab.module.css';

/**
 * index.html:2885-3093 (`loadDismissedPipelines`, `renderPipelines`) ported
 * to React. Mounted once at startup inside `#pipelines-content`
 * (MenubarApp.tsx) and stays mounted regardless of which tab is active --
 * see the "all panes stay mounted" comment there.
 *
 * `failedPipelineMaxAge` (mentioned in the task-16 brief) is NOT filtered
 * here, or anywhere in this tree: it is applied server-side, in
 * src/main/services/polling.ts:164-176, BEFORE a failed pipeline is ever
 * included in `getPipelines()`'s result or a `data:updated` push. Neither
 * `renderPipelines` (index.html:2896-3093) nor any other function in
 * index.html re-filters by age -- by the time a pipeline array reaches the
 * renderer (vanilla or React), it has already been filtered. Adding a
 * second, client-side age filter here would be new behaviour, not a port.
 * See task-16-report.md for the discrepancy this corrects from the brief.
 */
export function PipelinesTab() {
  const api = useApi();
  const data = useData();
  const { dismissedPipelineIds, dismissPipeline, restorePipelines } = usePipelineDismissal();

  // index.html:2902-2903
  const visiblePipelines = data.pipelines.filter((p) => !dismissedPipelineIds.includes(p.id));
  const dismissedCount = data.pipelines.length - visiblePipelines.length;

  // index.html:2909-2914
  if (data.isLoading) {
    return (
      <div className={styles.loadingState} id="pipelines-loading">
        <div className={styles.loadingSpinner} />
        <div className={styles.loadingText}>Loading pipelines...</div>
      </div>
    );
  }

  // index.html:2918-2922
  if (visiblePipelines.length === 0 && dismissedCount === 0) {
    return (
      <EmptyState
        id="pipelines-empty"
        title="No Pipelines"
        message="Active pipelines from your projects will appear here automatically"
        icon={
          <svg viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
          </svg>
        }
      />
    );
  }

  return (
    <div id="pipelines-list">
      {/* index.html:2929-2936 */}
      {dismissedCount > 0 && (
        <div className={styles.dismissedNotice}>
          <span>
            {dismissedCount} pipeline{dismissedCount > 1 ? 's' : ''} hidden
          </span>
          <button
            id="restorePipelinesBtn"
            onClick={() => {
              void restorePipelines();
            }}
          >
            Show all
          </button>
        </div>
      )}

      {visiblePipelines.map((pipeline) => (
        <PipelineRow
          key={pipeline.id}
          pipeline={pipeline}
          onOpen={() => {
            void api.app.openExternal(pipeline.webUrl);
          }}
          onDismiss={() => {
            void dismissPipeline(pipeline.id);
          }}
          onOpenJob={(url) => {
            void api.app.openExternal(url);
          }}
        />
      ))}
    </div>
  );
}
