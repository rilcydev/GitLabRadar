import type { ReactNode } from 'react';
import type { Deployment, Release } from '@/shared/types';
// Relative imports: eslint's import/no-unresolved has no TS-aware resolver
// for the `@/*` alias on value imports (see src/test/renderWithApi.tsx and
// src/renderer/api/FakeApi.ts for the same pre-existing gap).
import { useApi } from '../../api/ApiContext';
import { useData, useReleaseDismissal } from '../../windows/menubar/DataProvider';
import { EmptyState } from '../../shared/EmptyState/EmptyState';
import { SectionHeader } from '../../shared/SectionHeader/SectionHeader';
import { ItemCard } from '../../shared/ItemCard/ItemCard';
import { formatDateTime, formatTime } from '../../utils/format';
import styles from './ReleasesTab.module.css';

// index.html:3188-3193. Duplicated (not shared) in POReleaseRow.tsx --
// vanilla itself redefines this SAME literal object a second time inside
// renderPOView (index.html:3392-3397) rather than sharing it with
// renderReleases, so this port keeps that duplication rather than inventing
// a shared module the source doesn't have.
const DEPLOYMENT_STATUS_TEXT: Record<string, string> = {
  success: 'Deployed',
  running: 'Deploying...',
  failed: 'Failed',
  created: 'Pending',
  canceled: 'Canceled',
};

// index.html:3195-3201.
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

// index.html:3208-3209 -- ReleasesTab's own "not deployed" icon: a circle
// outline PLUS a centered plus-sign. POReleaseRow's equivalent
// (index.html:3538) is a bare circle with no plus sign -- a genuine
// difference between the two views' icon sets, reproduced literally rather
// than harmonised (see the task brief: releases have their own
// `deploymentIcons` vocabulary, distinct even between ReleasesTab and
// POView themselves).
const NOT_DEPLOYED_ICON = (
  <svg viewBox="0 0 16 16">
    <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8z" />
    <path d="M8 4a.75.75 0 0 1 .75.75v2.5h2.5a.75.75 0 0 1 0 1.5h-2.5v2.5a.75.75 0 0 1-1.5 0v-2.5h-2.5a.75.75 0 0 1 0-1.5h2.5v-2.5A.75.75 0 0 1 8 4z" />
  </svg>
);

// index.html:3181 -- the section header's icon (a download-tray glyph),
// also reused for the empty-state icon and (POView.tsx) the PO project
// header/empty-state icons. Distinct from ITEM_ICON below.
const SECTION_ICON: ReactNode = (
  <svg viewBox="0 0 24 24">
    <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
  </svg>
);

// index.html:3236 -- the per-item `.item-icon.release` glyph (a check
// circle), NOT the same icon as SECTION_ICON above.
const ITEM_ICON: ReactNode = (
  <svg viewBox="0 0 24 24">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10c.69 0 1.36-.08 2-.21v-2.01c-.64.14-1.31.22-2 .22-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8c0 .69-.08 1.36-.22 2h2.01c.13-.64.21-1.31.21-2 0-5.52-4.48-10-10-10zm-2 13l-4-4 1.41-1.41L10 12.17l6.59-6.59L18 7l-8 8z" />
  </svg>
);

const DISMISS_ICON = (
  <svg viewBox="0 0 24 24">
    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
  </svg>
);

// index.html:1084-1123 -- only success/running/failed/created have a
// `.deployment-badge.<status>` modifier rule; `canceled` has NO rule at all
// (verified directly against the source) and falls back to the unstyled
// base `.deploymentBadge`, same as `default` below -- reproduced by simply
// not having a `deploymentBadgeCanceled` case, not by adding one (see
// ReleasesTab.module.css's matching note).
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

// index.html:3203-3231 -- one release's deployment rows.
function DeploymentRows({ deployments }: { deployments: Deployment[] | undefined }) {
  const list = deployments || [];

  if (list.length === 0) {
    return (
      <div className={styles.releaseDeploymentRow}>
        <span className={`${styles.deploymentBadge} ${styles.deploymentBadgeNone}`}>
          {NOT_DEPLOYED_ICON}
          Not deployed
        </span>
      </div>
    );
  }

  return (
    <>
      {list.map((dep) => (
        <div className={styles.releaseDeploymentRow} key={dep.id}>
          <span className={`${styles.deploymentBadge} ${deploymentBadgeClass(dep.status) ?? ''}`}>
            {DEPLOYMENT_ICONS[dep.status] ?? null}
            {DEPLOYMENT_STATUS_TEXT[dep.status] || 'Unknown'}
          </span>
          {/* index.html:3226 */}
          <span className={styles.deploymentEnv}>{dep.environment}</span>
          {/* index.html:3214-3216 */}
          {dep.triggeredBy && <span className={styles.deploymentTrigger}>by {dep.triggeredBy.name}</span>}
          {/* index.html:3217-3219 */}
          {dep.deployedAt && <span className={styles.deploymentTime}>{formatDateTime(dep.deployedAt)}</span>}
        </div>
      ))}
    </>
  );
}

interface ReleaseRowProps {
  release: Release;
  onOpen: () => void;
  onDismiss: () => void;
}

// index.html:3233-3252 -- one release item. Unlike MergeRequestRow/
// PipelineRow, `.item-time` and `.item-dismiss` are DIRECT children of
// `.item` here (siblings of `.item-content`), not nested inside an
// `.item-header` row -- reproduced with that same flat structure, not the
// MR/pipeline header-row layout.
function ReleaseRow({ release, onOpen, onDismiss }: ReleaseRowProps) {
  return (
    <ItemCard
      // `releaseItem` carries no visual rules of its own -- it exists only
      // so ReleasesTab.module.css's `.releaseItem:hover .itemDismiss` rule
      // below has a hover anchor it actually owns. `ItemCard`'s own `.item`
      // class is a hashed CSS-Modules name scoped to ItemCard.module.css; a
      // literal `.item` selector written here would never match it (see
      // this file's `.itemDismiss` doc comment for why that rule matters).
      className={styles.releaseItem}
      onClick={() => {
        // index.html:3264 -- `if (url && ...)`. `release.webUrl` is typed
        // non-optional, but that's a compile-time claim, not a runtime
        // guarantee (see PipelineRow.tsx's identical reasoning for
        // `job.webUrl`) -- guarded literally rather than trusted.
        if (release.webUrl) onOpen();
      }}
    >
      <div className={`${styles.itemIcon} ${styles.itemIconRelease}`}>{ITEM_ICON}</div>
      <div className={styles.itemContent}>
        {/* index.html:3239 -- `release.name || release.tagName`. */}
        <div className={styles.itemTitle}>{release.name || release.tagName}</div>
        <div className={styles.itemSubtitle}>
          <span className={styles.releaseTag}>{release.tagName}</span>
        </div>
        <div className={styles.releaseDeployment}>
          <DeploymentRows deployments={release.deployments} />
        </div>
      </div>
      {/* index.html:3247 -- `release.releasedAt || release.createdAt`. */}
      <span className={styles.itemTime}>{formatTime(release.releasedAt || release.createdAt)}</span>
      {/* index.html:3248-3250 -- unlike MR's/pipeline's dismiss button
          (index.html:2841,3027), this one carries NO inline
          `style="opacity: 0.5"`. Reproduced literally: no `style` prop here
          at all, so it falls back to the base `.item-dismiss` rule (opacity
          0, fading to 1 only on `.item:hover` -- ReleasesTab.module.css's
          `.itemDismiss`/`:hover` rules), unlike MR/pipeline where the inline
          style permanently overrides that hover rule. See
          ReleaseRow.test.tsx's pinning test. */}
      <button
        className={styles.itemDismiss}
        title="Hide this release"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onDismiss();
        }}
      >
        {DISMISS_ICON}
      </button>
    </ItemCard>
  );
}

/**
 * index.html:3113-3296 (`loadDismissedReleases`, `renderReleases`) ported to
 * React. Mounted once at startup inside `#releases-content` (MenubarApp.tsx)
 * and stays mounted regardless of which tab is active -- see the "all panes
 * stay mounted" comment there.
 */
export function ReleasesTab() {
  const api = useApi();
  const data = useData();
  const { dismissedReleaseIds, dismissRelease, restoreReleases } = useReleaseDismissal();

  // index.html:3130-3131
  const visibleReleases = data.releases.filter((r) => !dismissedReleaseIds.includes(r.id));
  const dismissedCount = data.releases.length - visibleReleases.length;

  // index.html:3137-3142
  if (data.isLoading) {
    return (
      <div className={styles.loadingState} id="releases-loading">
        <div className={styles.loadingSpinner} />
        <div className={styles.loadingText}>Loading releases...</div>
      </div>
    );
  }

  // index.html:3146-3150
  if (visibleReleases.length === 0 && dismissedCount === 0) {
    return (
      <EmptyState
        id="releases-empty"
        title="No Releases"
        message="Configure projects to follow in preferences to see their releases"
        icon={SECTION_ICON}
        action={
          <button
            className={styles.btn}
            id="configReleasesBtn"
            onClick={() => {
              void api.app.showPreferences();
            }}
          >
            Configure projects
          </button>
        }
      />
    );
  }

  // index.html:3154-3162 -- grouped by `projectPath || projectName ||
  // 'Unknown'` (:3157), in first-seen order (a `Map`, like
  // PipelineRow.tsx's `groupJobsByStage`, preserves insertion order the
  // same way the source's plain object literal does). Deliberately NOT
  // sorted -- that's only POView's behaviour (index.html:3376), not this
  // tab's.
  const releasesByProject = new Map<string, Release[]>();
  for (const release of visibleReleases) {
    const key = release.projectPath || release.projectName || 'Unknown';
    const group = releasesByProject.get(key);
    if (group) {
      group.push(release);
    } else {
      releasesByProject.set(key, [release]);
    }
  }

  return (
    <div id="releases-list">
      {/* index.html:3167-3174 */}
      {dismissedCount > 0 && (
        <div className={styles.dismissedNotice}>
          <span>
            {dismissedCount} release{dismissedCount > 1 ? 's' : ''} hidden
          </span>
          <button
            id="restoreReleasesBtn"
            onClick={() => {
              void restoreReleases();
            }}
          >
            Show all
          </button>
        </div>
      )}

      {[...releasesByProject.entries()].map(([projectPath, projectReleases]) => (
        <div className={styles.section} key={projectPath}>
          {/* index.html:3178-3185 -- no `.section-icon.release` class exists
              in the source; `iconBackground` reproduces its inline
              `style="background: var(--gradient-green)"` instead. */}
          <SectionHeader
            title={projectPath}
            count={projectReleases.length}
            icon={SECTION_ICON}
            iconBackground="var(--gradient-green)"
          />
          {projectReleases.map((release) => (
            <ReleaseRow
              key={release.id}
              release={release}
              onOpen={() => {
                void api.app.openExternal(release.webUrl);
              }}
              onDismiss={() => {
                void dismissRelease(release.id);
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
