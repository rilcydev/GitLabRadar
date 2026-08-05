# MR Approval Tracking — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show an approval badge on every displayed MR (approver avatar stack + "N / M"), and fire a macOS notification when someone approves one of *my* MRs.

**Architecture:** The main-process poller enriches each `MergeRequest` with `approvedBy` / `approvalsRequired` via the REST `/approvals` endpoint (best-effort). Those fields ride the existing `data:updated` event to the renderer, where a new `ApprovalBadge` renders them. A `checkNewApprovals` diff (mirroring `checkNewMRs`) notifies for author MRs only. Pure logic lives in a new `src/main/api/approvals.ts` so it is unit-testable without an axios/electron harness.

**Tech Stack:** Electron 43 (main, TypeScript), React 18 renderer, Vitest 4 + Testing Library (jsdom), axios (GitLab REST), electron-store (config). pnpm.

## Global Constraints

- **TDD.** Every task: write the failing test, watch it fail, minimal code, watch it pass, commit. Each task ends with `pnpm typecheck` clean and the touched test file green.
- **Best-effort fetch.** A failed `/approvals` call must leave `approvedBy: []`, `approvalsRequired: 0` and never reject or block the poll or other MRs (instances without approvals return 403/404).
- **Badge rule.** `approvalsRequired > 0` → `"N / M"`; `approvalsRequired === 0` → `"N"`; `approvedBy` empty → render nothing.
- **Notification rule.** Only MRs with `userRole === 'author'`; one per newly-added approver; deduped; gated by `notifications.enabled && notifications.mrApproved`. Strings in **English**.
- **Reuse** `Avatar` (`size="mini"`) + `AvatarOverflow` (cap 3 + "+N"), exactly like `PeopleGroup`.
- Test a file: `pnpm exec vitest run <path>`. Typecheck: `pnpm typecheck`.

## File Structure

- **Create** `src/main/api/approvals.ts` — pure helpers: `mapApprovals`, `diffApprovers`, `enrichApprovals` + types `GitLabApprovalsResponse`, `ApprovalState`.
- **Create** `src/main/api/approvals.test.ts`
- **Create** `src/main/services/notifications.test.ts` — establishes the electron/config mock pattern.
- **Create** `src/renderer/features/merge-requests/ApprovalBadge.tsx` + `ApprovalBadge.module.css` + `ApprovalBadge.test.tsx`
- **Modify** `src/shared/types/mergeRequest.ts` — `MergeRequest.approvedBy`, `.approvalsRequired`.
- **Modify** `src/shared/types/config.ts` — `NotificationConfig.mrApproved` + `DEFAULT_CONFIG`.
- **Modify** `src/main/api/gitlab.ts` — `transformMergeRequest` defaults + `getMergeRequestApprovals`.
- **Modify** `src/main/services/polling.ts` — enrich MRs + `checkNewApprovals` call.
- **Modify** `src/main/services/notifications.ts` — `notifyMRApproved`, `checkNewApprovals`, cache plumbing.
- **Modify** `src/renderer/features/merge-requests/MergeRequestRow.tsx` — render `ApprovalBadge`.
- **Modify** `src/renderer/features/preferences/GeneralPage/GeneralPage.tsx` (+ `.test.tsx`) — "MR approved" toggle.
- **Modify** `src/renderer/features/merge-requests/MergeRequestsTab.test.tsx` — `makeMR` defaults.

---

### Task 1: Model & config foundation

Adds the two `MergeRequest` fields and the `mrApproved` config flag as **required** fields, so `pnpm typecheck` enumerates every construction site. "Green typecheck" is this task's test.

**Files:**
- Modify: `src/shared/types/mergeRequest.ts`
- Modify: `src/shared/types/config.ts`
- Modify: `src/main/api/gitlab.ts:205-232` (`transformMergeRequest`)
- Modify: `src/renderer/features/merge-requests/MergeRequestsTab.test.tsx:62` (`makeMR`)
- Modify: any other `notifications: {…}` / `MergeRequest` literal typecheck flags (GeneralPage state init, test fixtures)

**Interfaces:**
- Produces: `MergeRequest.approvedBy: MergeRequestAuthor[]`, `MergeRequest.approvalsRequired: number`; `NotificationConfig.mrApproved: boolean`.

- [ ] **Step 1: Add the MR fields.** In `src/shared/types/mergeRequest.ts`, inside `interface MergeRequest`, after `userMentionedInNotes: boolean;` add:

```ts
  approvedBy: MergeRequestAuthor[];
  approvalsRequired: number;
```

- [ ] **Step 2: Add the config flag.** In `src/shared/types/config.ts`, inside `interface NotificationConfig` after `pipelineSuccess: boolean;` add `mrApproved: boolean;`, and in `DEFAULT_CONFIG.notifications` after `pipelineSuccess: false,` add `mrApproved: true,`.

- [ ] **Step 3: Default them at construction.** In `src/main/api/gitlab.ts` `transformMergeRequest`, after `userMentionedInNotes: false,` add:

```ts
      approvedBy: [],
      approvalsRequired: 0,
```

- [ ] **Step 4: Fix the test factory.** In `src/renderer/features/merge-requests/MergeRequestsTab.test.tsx` `makeMR`, add to the returned object (before `...overrides` if present, else with the other fields):

```ts
    approvedBy: [],
    approvalsRequired: 0,
```

- [ ] **Step 5: Run typecheck; fix every remaining flagged literal.**

Run: `pnpm typecheck`
Expected initially: FAIL, listing each `MergeRequest`/`NotificationConfig` object literal missing the new fields (e.g. `GeneralPage.tsx`'s `useState` notifications default → add `mrApproved: true`; `GeneralPage.test.tsx` / `ProjectsPage.test.tsx` `notifications: {…}` fixtures → add `mrApproved: true`).
Add `approvedBy: []`, `approvalsRequired: 0` to MR literals and `mrApproved: true` to notification literals until:
Expected: PASS (no output).

- [ ] **Step 6: Run the full suite** (fixtures changed).

Run: `pnpm exec vitest run`
Expected: PASS (same count as before, still green).

- [ ] **Step 7: Commit.**

```bash
git add -A
git commit -m "feat(approvals): add MergeRequest approval fields and mrApproved config"
```

---

### Task 2: Pure approval helpers (`approvals.ts`)

**Files:**
- Create: `src/main/api/approvals.ts`
- Test: `src/main/api/approvals.test.ts`

**Interfaces:**
- Consumes: `MergeRequest`, `MergeRequestAuthor` from `../../shared/types`.
- Produces: `mapApprovals(res) => ApprovalState`, `diffApprovers(prev, next) => MergeRequestAuthor[]`, `enrichApprovals(mrs, fetchApprovals, batchSize?) => Promise<void>`; types `GitLabApprovalsResponse`, `ApprovalState { approvedBy: MergeRequestAuthor[]; approvalsRequired: number }`.

- [ ] **Step 1: Write the failing test.** Create `src/main/api/approvals.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mapApprovals, diffApprovers, enrichApprovals } from './approvals';
import type { MergeRequest, MergeRequestAuthor } from '../../shared/types';

const u = (id: number, name: string): MergeRequestAuthor => ({
  id, username: name.toLowerCase(), name, avatar_url: '',
});

describe('mapApprovals', () => {
  it('maps approved_by[].user and approvals_required', () => {
    expect(mapApprovals({
      approved_by: [{ user: u(1, 'Alice') }, { user: u(2, 'Bob') }],
      approvals_required: 3, approvals_left: 1,
    })).toEqual({ approvedBy: [u(1, 'Alice'), u(2, 'Bob')], approvalsRequired: 3 });
  });
  it('defaults to empty/0 when fields are missing', () => {
    // @ts-expect-error intentionally partial to model a stripped API response
    expect(mapApprovals({})).toEqual({ approvedBy: [], approvalsRequired: 0 });
  });
});

describe('diffApprovers', () => {
  it('returns approvers present in next but not prev (by id)', () => {
    expect(diffApprovers([u(1, 'Alice')], [u(1, 'Alice'), u(2, 'Bob')])).toEqual([u(2, 'Bob')]);
  });
  it('returns nothing when no one new approved', () => {
    expect(diffApprovers([u(1, 'Alice')], [u(1, 'Alice')])).toEqual([]);
  });
});

describe('enrichApprovals', () => {
  const mr = (id: number): MergeRequest => ({
    id, iid: id, title: 't', description: '', webUrl: '', projectId: 100, projectName: '',
    projectPath: '', author: u(9, 'Me'), userRole: 'author', accountId: 'a', state: 'opened',
    draft: false, createdAt: '', updatedAt: '', sourceBranch: 's', targetBranch: 'main',
    mergeStatus: '', hasConflicts: false, reviewers: [], assignees: [], userNotesCount: 0,
    userMentionedInNotes: false, approvedBy: [], approvalsRequired: 0,
  });
  it('fills approvedBy/approvalsRequired from the fetcher', async () => {
    const mrs = [mr(1)];
    await enrichApprovals(mrs, async () => ({ approvedBy: [u(1, 'Alice')], approvalsRequired: 2 }));
    expect(mrs[0].approvedBy).toEqual([u(1, 'Alice')]);
    expect(mrs[0].approvalsRequired).toBe(2);
  });
  it('leaves defaults when the fetcher throws (best-effort)', async () => {
    const mrs = [mr(1)];
    await enrichApprovals(mrs, async () => { throw new Error('403'); });
    expect(mrs[0].approvedBy).toEqual([]);
    expect(mrs[0].approvalsRequired).toBe(0);
  });
});
```

- [ ] **Step 2: Run it — verify it fails.**

Run: `pnpm exec vitest run src/main/api/approvals.test.ts`
Expected: FAIL ("Failed to resolve import './approvals'").

- [ ] **Step 3: Write the implementation.** Create `src/main/api/approvals.ts`:

```ts
import type { MergeRequest, MergeRequestAuthor } from '../../shared/types';

export interface GitLabApprovalsResponse {
  approved_by: { user: MergeRequestAuthor }[];
  approvals_required: number;
  approvals_left: number;
}

export interface ApprovalState {
  approvedBy: MergeRequestAuthor[];
  approvalsRequired: number;
}

export function mapApprovals(res: GitLabApprovalsResponse): ApprovalState {
  return {
    approvedBy: (res.approved_by ?? []).map((a) => a.user),
    approvalsRequired: res.approvals_required ?? 0,
  };
}

/** Approvers present in `next` but not `prev`, compared by user id. */
export function diffApprovers(
  prev: MergeRequestAuthor[],
  next: MergeRequestAuthor[]
): MergeRequestAuthor[] {
  const prevIds = new Set(prev.map((a) => a.id));
  return next.filter((a) => !prevIds.has(a.id));
}

/**
 * Enrich each MR in place with its approval state. Best-effort: a failed
 * fetch leaves the MR's defaults and never rejects. Batched to limit
 * concurrency, mirroring the mention-detection loop in polling.ts.
 */
export async function enrichApprovals(
  mrs: MergeRequest[],
  fetchApprovals: (projectId: number, iid: number) => Promise<ApprovalState>,
  batchSize = 5
): Promise<void> {
  for (let i = 0; i < mrs.length; i += batchSize) {
    const batch = mrs.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (mr) => {
        try {
          const state = await fetchApprovals(mr.projectId, mr.iid);
          mr.approvedBy = state.approvedBy;
          mr.approvalsRequired = state.approvalsRequired;
        } catch {
          // best-effort: keep defaults
        }
      })
    );
  }
}
```

- [ ] **Step 4: Run it — verify it passes.**

Run: `pnpm exec vitest run src/main/api/approvals.test.ts`
Expected: PASS (6 tests). Then `pnpm typecheck` → PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/main/api/approvals.ts src/main/api/approvals.test.ts
git commit -m "feat(approvals): pure mapApprovals/diffApprovers/enrichApprovals helpers"
```

---

### Task 3: Fetch + poll enrichment

Thin wiring (the logic is already tested in Task 2); verified by typecheck.

**Files:**
- Modify: `src/main/api/gitlab.ts` (add `getMergeRequestApprovals`)
- Modify: `src/main/services/polling.ts:124` area (call `enrichApprovals`)

**Interfaces:**
- Consumes: `mapApprovals`, `enrichApprovals`, `ApprovalState`, `GitLabApprovalsResponse` from `../api/approvals` / `./approvals`.
- Produces: `GitLabClient.getMergeRequestApprovals(projectId, iid) => Promise<ApprovalState>`.

- [ ] **Step 1: Add the client method.** In `src/main/api/gitlab.ts`, add the import near the top (with the other imports): `import { mapApprovals, GitLabApprovalsResponse, ApprovalState } from './approvals';`. Then add a method inside `class GitLabClient` (next to `getProject`, ~line 300):

```ts
  async getMergeRequestApprovals(projectId: number, iid: number): Promise<ApprovalState> {
    const response = await this.client.get<GitLabApprovalsResponse>(
      `/projects/${projectId}/merge_requests/${iid}/approvals`
    );
    return mapApprovals(response.data);
  }
```

- [ ] **Step 2: Wire enrichment into the poll.** In `src/main/services/polling.ts`, add the import: `import { enrichApprovals } from '../api/approvals';`. Then, immediately **before** `allMergeRequests.push(...mrs);` (~line 124, right after the mention-detection block), add:

```ts
          // Enrich every MR with approval state for the approval badge.
          await enrichApprovals(mrs, (projectId, iid) =>
            client.getMergeRequestApprovals(projectId, iid)
          );
```

- [ ] **Step 3: Verify typecheck + suite.**

Run: `pnpm typecheck` → PASS. `pnpm exec vitest run` → PASS (unchanged count).

- [ ] **Step 4: Commit.**

```bash
git add src/main/api/gitlab.ts src/main/services/polling.ts
git commit -m "feat(approvals): fetch /approvals per MR and enrich in the poller"
```

---

### Task 4: Approval notifications

**Files:**
- Modify: `src/main/services/notifications.ts`
- Modify: `src/main/services/polling.ts:209` (call `checkNewApprovals`)
- Test: `src/main/services/notifications.test.ts` (new — mocks `electron` + `../store/config`)

**Interfaces:**
- Consumes: `diffApprovers` from `../api/approvals`; `MergeRequest`, `MergeRequestAuthor` from `../../shared/types`.
- Produces: `checkNewApprovals(oldMRs, newMRs): void`, `notifyMRApproved(mr, approver): void`.

- [ ] **Step 1: Write the failing test.** Create `src/main/services/notifications.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  shown: [] as { title: string; body: string }[],
  notif: {
    value: {
      enabled: true, newMRAssigned: true, mrMentioned: true, pipelineStarted: false,
      pipelineFailed: true, pipelineSuccess: false, mrApproved: true,
    },
  },
}));

vi.mock('electron', () => ({
  Notification: class {
    constructor(public opts: { title: string; body: string }) {}
    on() { return this; }
    show() { h.shown.push({ title: this.opts.title, body: this.opts.body }); }
    static isSupported() { return true; }
  },
  shell: { openExternal: vi.fn() },
}));
vi.mock('../store/config', () => ({
  config: { get: (k: string) => (k === 'notifications' ? h.notif.value : undefined) },
}));

import { checkNewApprovals, resetNotificationCache } from './notifications';
import type { MergeRequest, MergeRequestAuthor } from '../../shared/types';

const u = (id: number, name: string): MergeRequestAuthor => ({
  id, username: name.toLowerCase(), name, avatar_url: '',
});
const mr = (o: Partial<MergeRequest> = {}): MergeRequest => ({
  id: 1, iid: 1, title: 'My MR', description: '', webUrl: 'http://x', projectId: 100,
  projectName: '', projectPath: '', author: u(9, 'Me'), userRole: 'author', accountId: 'a',
  state: 'opened', draft: false, createdAt: '', updatedAt: '', sourceBranch: 's',
  targetBranch: 'main', mergeStatus: '', hasConflicts: false, reviewers: [], assignees: [],
  userNotesCount: 0, userMentionedInNotes: false, approvedBy: [], approvalsRequired: 0, ...o,
});

beforeEach(() => { h.shown.length = 0; resetNotificationCache();
  h.notif.value = { enabled: true, newMRAssigned: true, mrMentioned: true, pipelineStarted: false,
    pipelineFailed: true, pipelineSuccess: false, mrApproved: true }; });

describe('checkNewApprovals', () => {
  it('notifies once for a new approver on my MR', () => {
    checkNewApprovals([mr({ approvedBy: [] })], [mr({ approvedBy: [u(1, 'Alice')] })]);
    expect(h.shown).toEqual([{ title: 'MR approved', body: 'Alice approved: My MR' }]);
  });
  it('does not notify for MRs I do not author', () => {
    checkNewApprovals([mr({ userRole: 'reviewer', approvedBy: [] })],
      [mr({ userRole: 'reviewer', approvedBy: [u(1, 'Alice')] })]);
    expect(h.shown).toEqual([]);
  });
  it('does not re-notify the same approver (dedupe)', () => {
    const before = [mr({ approvedBy: [] })];
    const after = [mr({ approvedBy: [u(1, 'Alice')] })];
    checkNewApprovals(before, after);
    checkNewApprovals(before, after);
    expect(h.shown).toHaveLength(1);
  });
  it('respects the mrApproved toggle', () => {
    h.notif.value.mrApproved = false;
    checkNewApprovals([mr({ approvedBy: [] })], [mr({ approvedBy: [u(1, 'Alice')] })]);
    expect(h.shown).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it — verify it fails.**

Run: `pnpm exec vitest run src/main/services/notifications.test.ts`
Expected: FAIL (`checkNewApprovals` is not exported).

- [ ] **Step 3: Implement.** In `src/main/services/notifications.ts`:
  - Add to the type import: `import { MergeRequest, Pipeline, MergeRequestAuthor } from '../../shared/types';`
  - Add near the top: `import { diffApprovers } from '../api/approvals';`
  - Add a cache Set next to the others: `const notifiedApprovals = new Set<string>();`
  - Add these two functions (near `checkNewMRs`):

```ts
export function notifyMRApproved(mr: MergeRequest, approver: MergeRequestAuthor): void {
  const notifConfig = getNotificationConfig();
  if (!notifConfig.enabled || !notifConfig.mrApproved) return;

  const key = `mr-approved-${mr.id}-${approver.id}`;
  if (notifiedApprovals.has(key)) return;

  const notification = new Notification({
    title: 'MR approved',
    body: `${approver.name} approved: ${mr.title}`,
    silent: false,
  });
  notification.on('click', () => {
    shell.openExternal(mr.webUrl);
  });

  showNotification(notification, 'MR approved');
  notifiedApprovals.add(key);
}

export function checkNewApprovals(oldMRs: MergeRequest[], newMRs: MergeRequest[]): void {
  const oldMap = new Map(oldMRs.map((mr) => [mr.id, mr]));
  for (const mr of newMRs) {
    if (mr.userRole !== 'author') continue;
    const prev = oldMap.get(mr.id);
    for (const approver of diffApprovers(prev?.approvedBy ?? [], mr.approvedBy)) {
      notifyMRApproved(mr, approver);
    }
  }
}
```

  - In `cleanNotificationCache()`, add the same size-trim block for `notifiedApprovals` as the existing ones.
  - In `resetNotificationCache()`, add `notifiedApprovals.clear();`.

- [ ] **Step 4: Run it — verify it passes.**

Run: `pnpm exec vitest run src/main/services/notifications.test.ts`
Expected: PASS (4 tests). Then `pnpm typecheck` → PASS.

- [ ] **Step 5: Wire it into the poll.** In `src/main/services/polling.ts`, add to the notifications import (line 6): `checkNewApprovals`. Then immediately after `checkNewMRs(this.lastData.mergeRequests, allMergeRequests);` (line 209) add:

```ts
      checkNewApprovals(this.lastData.mergeRequests, allMergeRequests);
```

- [ ] **Step 6: Verify + commit.**

Run: `pnpm typecheck` → PASS. `pnpm exec vitest run` → PASS.

```bash
git add src/main/services/notifications.ts src/main/services/notifications.test.ts src/main/services/polling.ts
git commit -m "feat(approvals): notify on new approvals of my MRs"
```

---

### Task 5: ApprovalBadge component

**Files:**
- Create: `src/renderer/features/merge-requests/ApprovalBadge.tsx`, `ApprovalBadge.module.css`
- Test: `src/renderer/features/merge-requests/ApprovalBadge.test.tsx`
- Modify: `src/renderer/features/merge-requests/MergeRequestRow.tsx` (render it)

**Interfaces:**
- Consumes: `Avatar`, `AvatarOverflow` from `../../shared/Avatar/Avatar`; `MergeRequestAuthor` from `@/shared/types`.
- Produces: `ApprovalBadge({ approvedBy, approvalsRequired })`.

- [ ] **Step 1: Write the failing test.** Create `src/renderer/features/merge-requests/ApprovalBadge.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ApprovalBadge } from './ApprovalBadge';

const u = (id: number, name: string) => ({ id, username: name.toLowerCase(), name, avatar_url: '' });

describe('ApprovalBadge', () => {
  it('renders nothing when there are no approvers', () => {
    const { container } = render(<ApprovalBadge approvedBy={[]} approvalsRequired={2} />);
    expect(container).toBeEmptyDOMElement();
  });
  it('shows "N / M" when a required count is set', () => {
    render(<ApprovalBadge approvedBy={[u(1, 'Alice'), u(2, 'Bob')]} approvalsRequired={3} />);
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
  });
  it('shows just the count when there is no required count', () => {
    render(<ApprovalBadge approvedBy={[u(1, 'Alice')]} approvalsRequired={0} />);
    expect(screen.getByText('1')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it — verify it fails.**

Run: `pnpm exec vitest run src/renderer/features/merge-requests/ApprovalBadge.test.tsx`
Expected: FAIL (cannot resolve `./ApprovalBadge`).

- [ ] **Step 3: Implement.** Create `src/renderer/features/merge-requests/ApprovalBadge.tsx`:

```tsx
import type { MergeRequestAuthor } from '@/shared/types';
import { Avatar, AvatarOverflow } from '../../shared/Avatar/Avatar';
import styles from './ApprovalBadge.module.css';

export interface ApprovalBadgeProps {
  approvedBy: MergeRequestAuthor[];
  approvalsRequired: number;
}

export function ApprovalBadge({ approvedBy, approvalsRequired }: ApprovalBadgeProps) {
  if (approvedBy.length === 0) return null;

  const progress = approvalsRequired > 0 ? `${approvedBy.length} / ${approvalsRequired}` : String(approvedBy.length);
  const title = `Approved by ${approvedBy.map((a) => a.name).join(', ')}`;

  return (
    <span className={styles.approvalBadge} title={title}>
      <svg viewBox="0 0 24 24" className={styles.approvalCheck}>
        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
      </svg>
      <span className={styles.approvalAvatars}>
        {approvedBy.slice(0, 3).map((a) => (
          <Avatar key={a.id} src={a.avatar_url} name={a.name} size="mini" />
        ))}
        {approvedBy.length > 3 && <AvatarOverflow count={approvedBy.length - 3} />}
      </span>
      <span className={styles.approvalCount}>{progress}</span>
    </span>
  );
}
```

And `src/renderer/features/merge-requests/ApprovalBadge.module.css` (uses only declared tokens):

```css
.approvalBadge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  background: var(--bg-card-menubar);
  color: var(--accent-green);
  font-size: 11px;
  font-weight: 600;
}
.approvalCheck { width: 14px; height: 14px; fill: var(--accent-green); }
.approvalAvatars { display: inline-flex; }
.approvalCount { color: var(--text-muted); }
```

> If `pnpm exec vitest run src/test/cssTokenUsage.test.ts` flags any `var(--…)` above as undeclared, swap it for a token that exists in `src/renderer/styles/tokens.css` (e.g. `--radius-sm`, `--accent-green`, `--text-muted`, `--bg-card-menubar` are expected to exist; verify).

- [ ] **Step 4: Run it — verify it passes.**

Run: `pnpm exec vitest run src/renderer/features/merge-requests/ApprovalBadge.test.tsx src/test/cssTokenUsage.test.ts`
Expected: PASS.

- [ ] **Step 5: Render it in the row.** In `src/renderer/features/merge-requests/MergeRequestRow.tsx`, add `import { ApprovalBadge } from './ApprovalBadge';`, then inside the `itemSubtitle` div (after the `conflictBadge` line ~200) add:

```tsx
          <ApprovalBadge approvedBy={mr.approvedBy} approvalsRequired={mr.approvalsRequired} />
```

- [ ] **Step 6: Verify + commit.**

Run: `pnpm typecheck` → PASS. `pnpm exec vitest run src/renderer/features/merge-requests` → PASS.

```bash
git add src/renderer/features/merge-requests/ApprovalBadge.tsx src/renderer/features/merge-requests/ApprovalBadge.module.css src/renderer/features/merge-requests/ApprovalBadge.test.tsx src/renderer/features/merge-requests/MergeRequestRow.tsx
git commit -m "feat(approvals): approval badge (avatar stack + N/M) on MR rows"
```

---

### Task 6: "MR approved" notification toggle

`GeneralPage` already holds a controlled `notifications` state (from the bug-lot fix). Add a third toggle mirroring the two existing ones.

**Files:**
- Modify: `src/renderer/features/preferences/GeneralPage/GeneralPage.tsx`
- Test: `src/renderer/features/preferences/GeneralPage/GeneralPage.test.tsx`

- [ ] **Step 1: Write the failing test.** Add to `GeneralPage.test.tsx` (inside `describe('GeneralPage', …)`):

```tsx
  it('loads and persists the "MR approved" notification toggle', async () => {
    const { api, container } = renderWithApi(<GeneralPage />, {
      overrides: {
        config: {
          getAll: async () => ({
            ...(await realDefaultConfig()),
            notifications: {
              enabled: true, newMRAssigned: true, mrMentioned: true, pipelineStarted: false,
              pipelineFailed: true, pipelineSuccess: false, mrApproved: false,
            },
          }),
        },
      },
    });
    const toggle = await waitFor(() => {
      const el = container.querySelector<HTMLInputElement>('#notifyMRApproved');
      expect(el).not.toBeNull();
      expect(el?.checked).toBe(false);
      return el as HTMLInputElement;
    });
    await userEvent.click(toggle);
    await waitFor(async () => {
      expect((await api.config.get('notifications')).mrApproved).toBe(true);
    });
  });
```

(Also add `mrApproved: true` to the `realDefaultConfig()` helper's `notifications` object at the bottom of the file if Task 1 didn't already.)

- [ ] **Step 2: Run it — verify it fails.**

Run: `pnpm exec vitest run src/renderer/features/preferences/GeneralPage/GeneralPage.test.tsx -t "MR approved"`
Expected: FAIL (`#notifyMRApproved` is null).

- [ ] **Step 3: Implement.** In `GeneralPage.tsx`, after `handleNotifyFailedPipelineChange`, add:

```tsx
  const handleNotifyApprovedChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const next = { ...notifications, mrApproved: e.target.checked };
      setNotifications(next);
      await api.config.set('notifications', next);
    },
    [api, notifications]
  );
```

Then, in the Notifications `settingsCard`, after the "Failed pipelines" `toggleRow`, add a third row:

```tsx
        <div className={styles.toggleRow}>
          <div className={styles.toggleInfo}>
            <div className={styles.toggleLabel}>MR approved</div>
            <div className={styles.toggleDesc}>Receive a notification when someone approves your MR</div>
          </div>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              id="notifyMRApproved"
              checked={notifications.mrApproved}
              onChange={(e) => void handleNotifyApprovedChange(e)}
            />
            <span className={styles.toggleSlider} />
          </label>
        </div>
```

- [ ] **Step 4: Run it — verify it passes.**

Run: `pnpm exec vitest run src/renderer/features/preferences/GeneralPage/GeneralPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Full verification + commit.**

Run: `pnpm typecheck` → PASS. `pnpm exec vitest run` → PASS. `pnpm exec oxlint` → 0 errors.

```bash
git add src/renderer/features/preferences/GeneralPage/GeneralPage.tsx src/renderer/features/preferences/GeneralPage/GeneralPage.test.tsx
git commit -m "feat(approvals): add MR-approved notification toggle to General settings"
```

---

## Notes for the implementer

- **No renderer IPC change.** `approvedBy`/`approvalsRequired` ride the existing `data:updated` event on the `MergeRequest`; the badge reads them from `DataProvider`. Do not add a contract/channel method.
- **Live check (optional, after Task 6):** on a real instance with approvals, watch the tray window — a badge should appear on approved MRs, and approving your own MR should notify (needs the packaged/signed app for the notification to actually display, per the notification/signing finding).
