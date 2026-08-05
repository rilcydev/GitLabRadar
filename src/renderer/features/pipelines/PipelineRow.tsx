import type { MouseEvent } from 'react';
import type { Pipeline, PipelineJob } from '@/shared/types';
// Relative imports: eslint's import/no-unresolved has no TS-aware resolver
// for the `@/*` alias on value imports (see src/test/renderWithApi.tsx and
// src/renderer/api/FakeApi.ts for the same pre-existing gap).
import { ItemCard } from '../../shared/ItemCard/ItemCard';
import { formatTime } from '../../utils/format';
import styles from './PipelineRow.module.css';

// index.html:2940-2946
const STATUS_TEXT: Record<string, string> = {
  running: 'Running',
  failed: 'Failed',
  success: 'Success',
  pending: 'Pending',
  canceled: 'Canceled',
};

// index.html:2997-3007
const SOURCE_TEXT: Record<string, string> = {
  push: 'Push',
  web: 'Web',
  schedule: 'Schedule',
  api: 'API',
  trigger: 'Trigger',
  merge_request_event: 'MR',
  pipeline: 'Pipeline',
  parent_pipeline: 'Parent',
  external: 'External',
};

// index.html:3012 -- the item-icon's inner SVG path is built by
// concatenating a fixed circle outline with a status-dependent fragment:
// a "pause bars" glyph when running, otherwise a "minus" glyph. Every other
// status (pending, canceled, anything else) gets the same minus glyph --
// there is no THIRD path variant in the source.
const RUNNING_ICON_PATH =
  'M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0zm-.5 4.75a.75.75 0 0 1 1.5 0v3.5a.75.75 0 0 1-1.5 0v-3.5zM8 12a1 1 0 1 1 0-2 1 1 0 0 1 0 2z';
const DEFAULT_STATUS_ICON_PATH = 'M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0zm3.5 7.5a.5.5 0 0 1 0 1h-7a.5.5 0 0 1 0-1h7z';

// index.html:494-513 -- `.item-icon.pipeline` (blue) is the base for every
// status; `.item-icon.pipeline.running/.failed/.success` are the only three
// that override it. Anything else (pending, canceled, ...) stays blue.
function itemIconStatusClass(status: string): string | undefined {
  switch (status) {
    case 'running':
      return styles.itemIconRunning;
    case 'failed':
      return styles.itemIconFailed;
    case 'success':
      return styles.itemIconSuccess;
    default:
      return undefined;
  }
}

// index.html:596-618 -- NO `.item-tag.canceled` rule exists in the source
// (see PipelineRow.module.css's doc comment); canceled and anything else
// fall back to the unstyled base `.item-tag`.
function itemTagStatusClass(status: string): string | undefined {
  switch (status) {
    case 'running':
      return styles.itemTagRunning;
    case 'failed':
      return styles.itemTagFailed;
    case 'success':
      return styles.itemTagSuccess;
    case 'pending':
      return styles.itemTagPending;
    default:
      return undefined;
  }
}

// index.html:954-982,999-1027 -- `.job-chip.<status>` modifiers.
function jobChipStatusClass(status: string): string | undefined {
  switch (status) {
    case 'running':
      return styles.jobChipRunning;
    case 'success':
      return styles.jobChipSuccess;
    case 'failed':
      return styles.jobChipFailed;
    case 'pending':
      return styles.jobChipPending;
    case 'skipped':
      return styles.jobChipSkipped;
    case 'canceled':
      return styles.jobChipCanceled;
    case 'manual':
      return styles.jobChipManual;
    case 'created':
      return styles.jobChipCreated;
    default:
      return undefined;
  }
}

/** index.html:2948-2957 -- groups jobs by stage, preserving first-seen
 * stage order (an object literal populated in job order, like the source's
 * `jobsByStage`, iterates in that same insertion order). */
function groupJobsByStage(jobs: PipelineJob[] | undefined): Map<string, PipelineJob[]> {
  const byStage = new Map<string, PipelineJob[]>();
  for (const job of jobs || []) {
    const stageJobs = byStage.get(job.stage);
    if (stageJobs) {
      stageJobs.push(job);
    } else {
      byStage.set(job.stage, [job]);
    }
  }
  return byStage;
}

export interface PipelineRowProps {
  pipeline: Pipeline;
  /** index.html:3046-3055 -- click anywhere on the item except a job chip or the dismiss button opens `pipeline.webUrl`. */
  onOpen: () => void;
  /** index.html:3069-3080 */
  onDismiss: () => void;
  /** index.html:3058-3066 -- click on an individual job chip opens ITS `webUrl`, not the pipeline's. */
  onOpenJob: (url: string) => void;
}

/**
 * index.html:2938-3041 (the `.map` body inside `renderPipelines`) -- one
 * pipeline row.
 */
export function PipelineRow({ pipeline, onOpen, onDismiss, onOpenJob }: PipelineRowProps) {
  // index.html:3017 -- reproduce the fallback chain exactly: projectPath,
  // then projectName, then the literal string 'Pipeline'.
  const title = pipeline.projectPath || pipeline.projectName || 'Pipeline';
  const statusText = STATUS_TEXT[pipeline.status] || pipeline.status;
  const sourceText = SOURCE_TEXT[pipeline.source] || pipeline.source;
  const jobsByStage = groupJobsByStage(pipeline.jobs);

  function stopClick(e: MouseEvent) {
    e.stopPropagation();
  }

  return (
    <ItemCard onClick={onOpen}>
      {/* index.html:3011-3013 */}
      <div className={`${styles.itemIcon} ${styles.itemIconPipeline} ${itemIconStatusClass(pipeline.status) ?? ''}`}>
        <svg viewBox="0 0 16 16">
          <path d={pipeline.status === 'running' ? RUNNING_ICON_PATH : DEFAULT_STATUS_ICON_PATH} />
        </svg>
      </div>
      <div className={styles.itemContent}>
        {/* index.html:3015 -- `.item-header` overrides its own 8px margin-bottom to 6px inline. */}
        <div className={styles.itemHeader} style={{ marginBottom: 6 }}>
          <div className={styles.titleColumn}>
            {/* index.html:3017 */}
            <div className={styles.itemTitle}>{title}</div>
            {/* index.html:3018-3023 */}
            <div className={styles.itemSubtitle}>
              <span className={styles.pipelineBranch} title={pipeline.ref}>
                <svg viewBox="0 0 16 16">
                  <path d="M9.5 3.25a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.492 2.492 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25zm-6 0a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0zm8.25-.75a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5z" />
                </svg>
                {pipeline.ref}
              </span>
            </div>
          </div>
          <div className={styles.headerRight}>
            {/* index.html:3026 */}
            <span className={styles.itemTime}>{formatTime(pipeline.createdAt)}</span>
            {/* index.html:3027-3029 -- `opacity: 0.5` is an inline style in
                the source, overriding both the default and any `:hover`
                rule -- reproduced literally (see PipelineRow.module.css's
                `.itemDismiss` doc comment). */}
            <button
              className={styles.itemDismiss}
              title="Hide this pipeline"
              style={{ opacity: 0.5 }}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onDismiss();
              }}
            >
              <svg viewBox="0 0 24 24">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
              </svg>
            </button>
          </div>
        </div>
        {/* index.html:3032-3035 -- base `.item-meta` is `margin-top: 8px`
            only; the source also adds `margin-bottom: 8px` inline. */}
        <div className={styles.itemMeta} style={{ marginBottom: 8 }}>
          <span className={`${styles.itemTag} ${itemTagStatusClass(pipeline.status) ?? ''}`}>{statusText}</span>
          {/* index.html:3034 -- entirely inline-styled in the source, no modifier class. */}
          <span
            className={styles.itemTag}
            style={{ background: 'var(--bg-base-menubar)', color: 'var(--text-tertiary)', border: '1px solid var(--glass-border)' }}
          >
            {sourceText}
          </span>
        </div>
        {/* index.html:2984-2994 -- only rendered when there's a triggering
            user; the avatar itself only when that user has an avatar_url,
            with NO placeholder fallback either way (see PipelineRow.module.css's
            `.pipelineTriggerUser*` doc comment for why this isn't `Avatar`). */}
        {pipeline.user && (
          <div className={styles.pipelineTrigger}>
            <span className={styles.pipelineTriggerLabel}>Triggered by</span>
            <div className={styles.pipelineTriggerUser}>
              {pipeline.user.avatar_url && (
                <img className={styles.pipelineTriggerUserImg} src={pipeline.user.avatar_url} alt={pipeline.user.name} />
              )}
              <span className={styles.pipelineTriggerUserName}>{pipeline.user.name || pipeline.user.username}</span>
            </div>
          </div>
        )}
        {/* index.html:2959-2981 -- only rendered when there are jobs. */}
        {jobsByStage.size > 0 && (
          <div className={styles.pipelineJobs}>
            {[...jobsByStage.entries()].map(([stage, jobs]) => (
              <div className={styles.pipelineStage} key={stage}>
                <div className={styles.stageHeader}>
                  <div className={styles.stageIcon}>
                    <svg viewBox="0 0 16 16">
                      <path d="M8 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8z" />
                    </svg>
                  </div>
                  <span className={styles.stageLabel}>{stage}</span>
                </div>
                <div className={styles.stageJobs}>
                  {jobs.map((job) => (
                    <span
                      key={job.id}
                      className={`${styles.jobChip} ${jobChipStatusClass(job.status) ?? ''}`}
                      title={job.name}
                      onClick={(e) => {
                        stopClick(e);
                        // index.html:3061-3063 -- `if (url && ...)`. `PipelineJob.webUrl`
                        // is typed non-optional, but that's a compile-time claim, not a
                        // runtime guarantee (see Avatar.tsx's doc comment for the same
                        // reasoning applied elsewhere in this codebase) -- guard literally
                        // rather than trust the type.
                        if (job.webUrl) onOpenJob(job.webUrl);
                      }}
                    >
                      <span className={styles.jobStatusDot} />
                      {/* index.html:2973 */}
                      {job.status === 'manual' && <span className={styles.jobManualIcon}>{'▶'}</span>}
                      <span className={styles.jobName}>{job.name}</span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </ItemCard>
  );
}
