import { useState, type ReactNode } from 'react';
import type { Release } from '@/shared/types';
import { formatDateTime, simpleMarkdown } from '../../utils/format';
import styles from './POView.module.css';

// index.html:3533 -- `renderPORelease(release, deploymentStatusTexts,
// deploymentIcons)` is called with a `deploymentStatusTexts` argument
// (the same object ReleasesTab.tsx's `DEPLOYMENT_STATUS_TEXT` mirrors), but
// the function body (index.html:3536-3548) never actually reads that
// parameter -- only `deploymentIcons`. So, UNLIKE ReleasesTab's deployment
// rows, a PO release's badge shows only the icon, environment name and
// (optional) time -- no "Deployed"/"Deploying..."/etc. status word at all.
// Verified directly against the source rather than assumed from the brief's
// "releases have their own deploymentIcons map" framing, which reads as
// though the two views render the same fields (see task-17-report.md's
// discrepancy note, and POView.test.tsx's pinning test). This port only
// defines `DEPLOYMENT_ICONS` below, deliberately with NO status-text
// counterpart -- adding one back would be new behaviour, not a port.

// index.html:3399-3405.
const DEPLOYMENT_ICONS: Record<string, ReactNode> = {
  success: (
    <svg viewBox="0 0 16 16">
      <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 1 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z" />
    </svg>
  ),
  running: (
    <svg viewBox="0 0 16 16">
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="20" strokeDashoffset="10" />
    </svg>
  ),
  failed: (
    <svg viewBox="0 0 16 16">
      <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06z" />
    </svg>
  ),
  created: (
    <svg viewBox="0 0 16 16">
      <circle cx="8" cy="8" r="3" />
    </svg>
  ),
  canceled: (
    <svg viewBox="0 0 16 16">
      <path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0zM5.5 5.5h5v5h-5v-5z" />
    </svg>
  ),
};

// index.html:3538 -- POView's own "not deployed" icon: a BARE circle
// outline, without the plus-sign second path ReleasesTab's equivalent
// (index.html:3208-3209) has. Reproduced literally as its own distinct
// icon, not harmonised with ReleasesTab's.
const NOT_DEPLOYED_ICON = (
  <svg viewBox="0 0 16 16">
    <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8z" />
  </svg>
);

// Same reasoning/omissions as ReleasesTab.tsx's `deploymentBadgeClass`: only
// success/running/failed/created have a modifier rule; `canceled` and
// anything else fall back to the unstyled base badge.
function deploymentBadgeClass(status: string): string | undefined {
  switch (status) {
    case 'success':
      return styles.deploymentBadgeSuccess;
    case 'running':
      return styles.deploymentBadgeRunning;
    case 'failed':
      return styles.deploymentBadgeFailed;
    case 'created':
      return styles.deploymentBadgeCreated;
    default:
      return undefined;
  }
}

export interface POReleaseRowProps {
  release: Release;
  /** index.html:3443-3447 -- click anywhere on the item except the description toggle opens `release.webUrl`. */
  onOpen: () => void;
}

/**
 * index.html:3533-3571 (`renderPORelease`) -- one release row inside a
 * project's PO section. Also the target of "Load more" pagination
 * (POView.tsx appends additional rows of this same component).
 */
export function POReleaseRow({ release, onOpen }: POReleaseRowProps) {
  // index.html:3456-3457 -- per-item expand/collapse, local to this DOM
  // node in the source (a class toggle on that specific element). A local
  // `useState` here reproduces the same "only THIS row's description
  // expands" behaviour without it leaking into sibling rows or surviving a
  // re-render that replaces this release with a different one (a fresh
  // mount for a different `release.id` starts collapsed again, same as a
  // freshly-rendered DOM node would).
  const [expanded, setExpanded] = useState(false);

  const deployments = release.deployments || [];
  const hasDescription = !!(release.description && release.description.trim().length > 0);
  const releaseDate = formatDateTime(release.releasedAt || release.createdAt);

  return (
    <div
      className={styles.poReleaseItem}
      onClick={() => {
        // index.html:3443-3447 -- `if (url && ...)`. `release.webUrl` is
        // typed non-optional, but that's a compile-time claim, not a
        // runtime guarantee (see PipelineRow.tsx's identical reasoning for
        // `job.webUrl`) -- guarded literally rather than trusted.
        if (release.webUrl) onOpen();
      }}
    >
      <div className={styles.poReleaseHeader}>
        <span className={styles.releaseTag}>{release.tagName}</span>
        {/* index.html:3562 -- `release.name || release.tagName`. */}
        <span className={styles.poReleaseTitle}>{release.name || release.tagName}</span>
        <span className={styles.poReleaseTime}>{releaseDate}</span>
      </div>
      <div className={styles.poEnvGrid}>
        {deployments.length === 0 ? (
          <span className={`${styles.deploymentBadge} ${styles.deploymentBadgeNone}`}>
            {NOT_DEPLOYED_ICON}
            Not deployed
          </span>
        ) : (
          deployments.map((dep) => (
            <span
              key={dep.id}
              className={`${styles.deploymentBadge} ${deploymentBadgeClass(dep.status) ?? ''}`}
              title={dep.deployedAt ? formatDateTime(dep.deployedAt) : ''}
            >
              {DEPLOYMENT_ICONS[dep.status] ?? null}
              {dep.environment}
              {dep.deployedAt && <span className={styles.deploymentTime}>{formatDateTime(dep.deployedAt)}</span>}
            </span>
          ))
        )}
      </div>
      {hasDescription && (
        <>
          {/* index.html:3552,80-95 (simpleMarkdown) -- the description
              supports the same constrained markdown subset MR notes don't
              (bold/italic/headers/links/code/lists), rendered via
              `dangerouslySetInnerHTML` since `format.ts`'s `simpleMarkdown`
              already HTML-escapes its input before applying those
              transforms. */}
          <div
            className={expanded ? `${styles.poReleaseDescription} ${styles.expanded}` : styles.poReleaseDescription}
            dangerouslySetInnerHTML={{ __html: simpleMarkdown(release.description) }}
          />
          <span
            className={styles.poToggleDesc}
            onClick={(e) => {
              // index.html:3452-3453
              e.stopPropagation();
              setExpanded((v) => !v);
            }}
          >
            {expanded ? 'Show less' : 'Show more'}
          </span>
        </>
      )}
    </div>
  );
}
