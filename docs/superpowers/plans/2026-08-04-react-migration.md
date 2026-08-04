# React UI Migration — Implementation Plan (Phase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace GitLabBar's two vanilla HTML/JS windows with a React application, behind a typed API boundary that a later phase can re-implement on Tauri without touching a single component.

**Architecture:** A `GitLabBarApi` TypeScript interface describes the entire renderer↔main boundary (32 commands, 4 pushed events). Two implementations exist: `createElectronApi` (over `ipcRenderer`, exposed by `preload.ts`) and `FakeApi` (in-memory, for tests). React reaches it only through a `useApi()` hook fed by a context — never `window.gitlabbar`. The two windows migrate one at a time (preferences first, then menubar) so the app stays runnable throughout.

**Tech Stack:** React 19.2.4, TypeScript 5, Vite (via `@electron-forge/plugin-vite`), CSS Modules, Vitest + Testing Library + jsdom, Electron 38.

---

## Global Constraints

- **Strict parity.** No bug fixes, no behaviour changes, no visual redesign. Four known bugs are explicitly **out of scope** and must be ported as-is, then corrected together in a follow-up lot:
  1. self-hosted avatar 401 — the renderer fetches the image with no `PRIVATE-TOKEN`
  2. missing `onerror` fallback — a broken image stays broken instead of showing initials
  3. truncated project tree in watched projects and search
  4. `validateToken`'s gate is dead code (`preferences.html:1080-1084`): it tests the truthiness of an always-truthy object, so an invalid token adds the account anyway
  Where a task's test would otherwise assert the *corrected* behaviour, the test is inverted to document the bug instead. Never "fix" one of those tests.
- **UI copy is English and must be reproduced verbatim.** "Watched projects", "Search for a project...", "Add account", "No projects found", "Error during search", "Searching...". Never translate, never reword.
- **No component may reference `window.gitlabbar`.** Access is via `useApi()`. A grep for `window.gitlabbar` outside `src/preload.ts` and `src/renderer/api/` must return nothing.
- **No new runtime dependencies.** Only devDependencies may be added (test tooling, `@vitejs/plugin-react`).
- **Existing types are authoritative.** Use `src/shared/types/*` (`GitLabAccount`, `GitLabAccountInput`, `MergeRequest`, `Pipeline`, `Release`, `Deployment`, `UntagProject`, `AppConfig`, `WatchedProject`, `NotificationConfig`). Do not redefine them.
- **The dead React scaffold is reference material only.** `src/renderer.ts`, `src/renderer/App.tsx`, `src/renderer/components/`, `src/renderer/hooks/` were never executed. Read them for hints; never copy them wholesale; they are deleted in Task 19.
- **Commit after every task.**
- **Verification limits.** This development machine is Linux. `npm test`, `npx tsc --noEmit`, `npm run lint` and `npx vite build` are runnable. **Launching the app and judging visual parity are not.** Any task step that says "verify visually" is a handoff to the human on macOS — an agent must never mark it done, and must say so in its report.

---

## File Structure

**New — API boundary**
- `src/shared/api/channels.ts` — channel manifest (single source of truth for channel strings)
- `src/shared/api/contract.ts` — `GitLabBarApi` interface + compile-time completeness assertions
- `src/shared/api/createElectronApi.ts` — builds the API from an injected `ipcRenderer`-like object
- `src/renderer/api/FakeApi.ts` — deterministic in-memory implementation
- `src/renderer/api/ApiContext.tsx` — `ApiProvider`, `useApi`

**New — styles**
- `src/renderer/styles/tokens.css` — consolidated design tokens (both themes)

**New — menubar window**
- `src/renderer/windows/menubar/main.tsx`, `MenubarApp.tsx`, `DataProvider.tsx`
- `src/renderer/features/merge-requests/`, `pipelines/`, `releases/`, `untag/`
- `src/renderer/shared/` — `Avatar`, `ItemCard`, `SectionHeader`, `EmptyState`
- `src/renderer/utils/format.ts`

**New — preferences window**
- `src/renderer/windows/preferences/main.tsx`, `PreferencesApp.tsx`
- `src/renderer/features/preferences/AccountsPage/`, `ProjectsPage/`, `GeneralPage/`

**Modified**
- `src/preload.ts` — thin wiring over `createElectronApi`
- `forge.config.ts:31-34` — `extraResource` stops shipping renderer sources
- `src/main/tray.ts:20-22,172,255` — load the Vite bundle
- `vite.renderer.config.ts` — two entry points, React plugin
- `package.json` — devDependencies and scripts

**Deleted (Task 19)**
- `src/renderer/index.html`, `src/renderer/preferences.html`, `index.html` (root)
- `src/renderer.ts`, `src/renderer/App.tsx`, `src/renderer/components/`, `src/renderer/hooks/`

---

## Source Map — where the vanilla code lives

Line ranges an implementer must port from. These are the specification for the feature tasks; the existing source is more precise than any prose restatement of it.

**`src/renderer/index.html`** (3924 lines) — CSS `6-2185`, markup `2187-2323`, script `2324-3922`

| Concern | Lines |
|---|---|
| Header, profile nav, view mode | `2374-2442` |
| Merge requests | `2443-2884` (`loadDismissedMRs`, `renderMRs`, `renderSection`) |
| Pipelines | `2885-3112` (`loadDismissedPipelines`, `renderPipelines`, `getJobIcon`) |
| Releases | `3113-3298` (`loadDismissedReleases`, `renderReleases`) |
| Product-owner view | `3299-3573` (`applyViewMode`, `renderPOView`, `renderPORelease`) |
| Formatting helpers | `3574-3667` (`escapeHtml`, `simpleMarkdown`, `formatDateTime`, `formatTime`, `getAgeInfo`, `getUntagAgeInfo`) |
| Untag | `3668-3775` (`renderUntag`) |
| App shell / data | `3776-3921` (`updateStatus`, `refresh`, `loadData`, `checkAccounts`, `loadViewMode`, `loadWatchedProjects`, `init`) |
| Tab markup | `2209-2323` |

**`src/renderer/preferences.html`** (1296 lines) — CSS `6-781`, markup `783-974`, script `975-1294`

| Concern | Lines |
|---|---|
| Sidebar nav (3 items) | `784-812` |
| Accounts page | `813-852` markup, `~1000-1100` script |
| Projects page | `853-871` markup, `1150-1290` script |
| General page (incl. notifications) | `872-974` markup, remainder of script |

---

## Task 1: Test harness

**Files:**
- Create: `vitest.config.mts` — the `.mts` extension is required, not cosmetic. The root
  `package.json` has no `"type": "module"`, so with a `.ts` name Vite's config loader
  `require()`s the ESM-only `@vitejs/plugin-react` and the run fails outright. Adding
  `"type": "module"` instead would break `scripts/generate-icons.js`, which uses `require()`.
- Create: `src/test/setup.ts`
- Create: `src/test/harness.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: nothing
- Produces: `npm test`, `npm run test:run`, `npm run typecheck`. Every later task depends on these three commands existing.

- [ ] **Step 1: Install dev dependencies**

```bash
npm install --save-dev vitest@^3 @vitejs/plugin-react@^5 @testing-library/react@^16 @testing-library/jest-dom@^6 @testing-library/user-event@^14 jsdom@^26
```

- [ ] **Step 2: Write the config**

`vitest.config.mts`:

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
  resolve: {
    alias: { '@': '/src' },
  },
});
```

`src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});
```

- [ ] **Step 3: Write the failing harness test**

`src/test/harness.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

describe('test harness', () => {
  it('runs in a DOM environment', () => {
    const el = document.createElement('div');
    el.textContent = 'ok';
    document.body.appendChild(el);
    expect(document.body.textContent).toBe('ok');
  });
});
```

- [ ] **Step 4: Add scripts to `package.json`**

Add to the `scripts` object:

```json
"test": "vitest",
"test:run": "vitest run",
"typecheck": "tsc --noEmit"
```

- [ ] **Step 5: Run and verify**

Run: `npm run test:run`
Expected: PASS, 1 test.

Run: `npm run typecheck`
Expected: exit 0. If pre-existing errors appear in untouched files, record them verbatim in the commit message — do not fix them, they are outside this plan's scope.

- [ ] **Step 6: Commit**

```bash
git add vitest.config.mts src/test package.json package-lock.json tsconfig.json
git commit -m "test: add vitest + testing-library harness"
```

---

## Task 2: Channel manifest and API contract

**Files:**
- Create: `src/shared/api/channels.ts`
- Create: `src/shared/api/contract.ts`
- Create: `src/shared/api/channels.test.ts`

**Interfaces:**
- Consumes: `src/shared/types/*`, `src/shared/constants` (`IPC_CHANNELS`)
- Produces: `COMMAND_CHANNELS`, `EVENT_CHANNELS`, `GitLabBarApi`, `Unsubscribe`. Tasks 3, 4, 5 and every feature task consume `GitLabBarApi`.

- [ ] **Step 1: Write the failing test**

`src/shared/api/channels.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { COMMAND_CHANNELS, EVENT_CHANNELS } from './channels';
import { IPC_CHANNELS } from '../constants';

const flatten = (o: Record<string, Record<string, string>>) =>
  Object.values(o).flatMap((ns) => Object.values(ns));

describe('channel manifest', () => {
  it('declares 32 commands', () => {
    expect(flatten(COMMAND_CHANNELS)).toHaveLength(32);
  });

  it('declares 4 events', () => {
    expect(Object.values(EVENT_CHANNELS)).toHaveLength(4);
  });

  it('covers every IPC_CHANNELS entry exactly once', () => {
    const declared = [...flatten(COMMAND_CHANNELS), ...Object.values(EVENT_CHANNELS)].sort();
    const expected = Object.values(IPC_CHANNELS).sort();
    expect(declared).toEqual(expected);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm run test:run -- src/shared/api/channels.test.ts`
Expected: FAIL — cannot resolve `./channels`.

- [ ] **Step 3: Write `channels.ts`**

```ts
export const COMMAND_CHANNELS = {
  accounts: {
    getAll: 'accounts:getAll',
    add: 'accounts:add',
    remove: 'accounts:remove',
    update: 'accounts:update',
    validateToken: 'accounts:validateToken',
  },
  gitlab: {
    getMRs: 'gitlab:getMRs',
    getPipelines: 'gitlab:getPipelines',
    getReleases: 'gitlab:getReleases',
    refresh: 'gitlab:refresh',
    searchProjects: 'gitlab:searchProjects',
    getGroups: 'gitlab:getGroups',
    dismissPipeline: 'gitlab:dismissPipeline',
    restorePipelines: 'gitlab:restorePipelines',
    getMRNotes: 'gitlab:getMRNotes',
    getProjectMembers: 'gitlab:getProjectMembers',
    assignMR: 'gitlab:assignMR',
    addReviewer: 'gitlab:addReviewer',
    dismissMR: 'gitlab:dismissMR',
    restoreMRs: 'gitlab:restoreMRs',
    dismissRelease: 'gitlab:dismissRelease',
    restoreReleases: 'gitlab:restoreReleases',
    getPOReleases: 'gitlab:getPOReleases',
    getUntagProjects: 'gitlab:getUntagProjects',
    refreshUntag: 'gitlab:refreshUntag',
    clearUntagExclusions: 'gitlab:clearUntagExclusions',
  },
  config: {
    get: 'config:get',
    set: 'config:set',
    getAll: 'config:getAll',
  },
  app: {
    openExternal: 'app:openExternal',
    showPreferences: 'app:showPreferences',
    quit: 'app:quit',
    hideMenu: 'app:hideMenu',
  },
} as const;

export const EVENT_CHANNELS = {
  dataUpdated: 'data:updated',
  refreshStatus: 'refresh:status',
  error: 'error:occurred',
  untagDataUpdated: 'untag:dataUpdated',
} as const;

export type CommandNamespace = keyof typeof COMMAND_CHANNELS;
export type EventName = keyof typeof EVENT_CHANNELS;
```

- [ ] **Step 4: Write `contract.ts`**

Argument lists are transcribed from `src/preload.ts:42-108`. **Return types must NOT be
taken from `preload.ts`** — it is `Promise<any>` throughout and carries no ground truth.
The authoritative source for what each command actually resolves is
`src/main/ipc/handlers.ts`. The first draft of this plan guessed the return shapes from
the command names and got several of them wrong, including three that already break
existing callers in `src/renderer/hooks/useAccounts.ts`. Read the handler before typing
a return value.

```ts
import type {
  AppConfig,
  GitLabAccount,
  GitLabAccountInput,
  MergeRequest,
  Pipeline,
  Release,
  UntagProject,
} from '../types';
import { COMMAND_CHANNELS } from './channels';

export type Unsubscribe = () => void;

export type RefreshStatus = 'idle' | 'refreshing' | 'error';

export interface ValidatedUser {
  username: string;
  name: string;
  avatarUrl: string;
}

export interface TokenValidation {
  valid: boolean;
  user?: ValidatedUser;
}

export interface ProjectSearchResult {
  id: number;
  name: string;
  name_with_namespace: string;
  path_with_namespace: string;
  web_url: string;
  default_branch: string;
}

export interface ProjectMember {
  id: number;
  username: string;
  name: string;
  avatar_url: string;
}

// handlers.ts:169-180 emits camelCase `createdAt` and an author WITHOUT an id.
// The live legacy consumer at src/renderer/index.html:2723 reads note.createdAt.
export interface MRNote {
  id: number;
  body: string;
  createdAt: string;
  author: { username: string; name: string; avatar_url: string };
}

export interface AccountMutationResult {
  success: boolean;
  account?: GitLabAccount;
  error?: string;
}

export interface AccountRemovalResult {
  success: boolean;
  error?: string;
}

export interface GitLabGroupSummary {
  id: number;
  name: string;
  path: string;
  full_name: string;
  full_path: string;
  web_url: string;
  parent_id: number | null;
}

export type TrayStatus = 'green' | 'orange' | 'red' | 'gray';

// Shape per src/main/services/polling.ts:8-16. `lastUpdated` really is a Date:
// the payload crosses webContents.send by structured clone, not JSON, so it
// arrives as a live Date object. Phase 2 must revisit this — the Tauri boundary
// serialises differently and will deliver a string.
export interface PolledData {
  mergeRequests: MergeRequest[];
  pipelines: Pipeline[];
  releases: Release[];
  status: TrayStatus;
  lastUpdated: Date;
  error?: string;
}

export interface GitLabBarApi {
  // Return shapes below come from src/main/ipc/handlers.ts, not from preload.ts.
  accounts: {
    getAll(): Promise<GitLabAccount[]>;
    add(input: GitLabAccountInput): Promise<AccountMutationResult>;
    remove(accountId: string): Promise<AccountRemovalResult>;
    update(accountId: string, updates: Partial<GitLabAccount>): Promise<AccountMutationResult>;
    validateToken(instanceUrl: string, token: string): Promise<TokenValidation>;
  };
  gitlab: {
    getMRs(): Promise<MergeRequest[]>;
    getPipelines(): Promise<Pipeline[]>;
    getReleases(): Promise<Release[]>;
    refresh(): Promise<void>;
    searchProjects(query: string): Promise<ProjectSearchResult[]>;
    getGroups(accountId: string): Promise<GitLabGroupSummary[]>;
    dismissPipeline(pipelineId: number): Promise<void>;
    restorePipelines(): Promise<void>;
    getMRNotes(projectId: number, mrIid: number): Promise<MRNote[]>;
    getProjectMembers(projectId: number): Promise<ProjectMember[]>;
    assignMR(projectId: number, mrIid: number, assigneeIds: number[]): Promise<void>;
    addReviewer(projectId: number, mrIid: number, reviewerIds: number[]): Promise<void>;
    dismissMR(mrId: number): Promise<void>;
    restoreMRs(): Promise<void>;
    dismissRelease(releaseId: number): Promise<void>;
    restoreReleases(): Promise<void>;
    getPOReleases(projectId: number, page: number, perPage: number): Promise<Release[]>;
    getUntagProjects(): Promise<UntagProject[]>;
    refreshUntag(): Promise<void>;
    clearUntagExclusions(): Promise<void>;
  };
  config: {
    get<K extends keyof AppConfig>(key: K): Promise<AppConfig[K]>;
    set<K extends keyof AppConfig>(key: K, value: AppConfig[K]): Promise<void>;
    getAll(): Promise<AppConfig>;
  };
  app: {
    openExternal(url: string): Promise<void>;
    showPreferences(): Promise<void>;
    quit(): Promise<void>;
    hideMenu(): Promise<void>;
  };
  on: {
    dataUpdated(cb: (data: PolledData) => void): Unsubscribe;
    refreshStatus(cb: (status: RefreshStatus) => void): Unsubscribe;
    error(cb: (message: string) => void): Unsubscribe;
    untagDataUpdated(cb: (data: UntagProject[]) => void): Unsubscribe;
  };
}

// Compile-time guarantee that the manifest and the interface cannot drift.
// If a command is added to one and not the other, `npm run typecheck` fails.
//
// The mismatch branches MUST resolve to `false`, never to `never`. `never` is
// TypeScript's bottom type and is assignable to every constraint, so
// `AssertExact<never>` silently succeeds and the whole guarantee evaporates.
// `false extends true` genuinely fails. This exact bug shipped in the first
// draft of this plan and was caught only because the reviewer was asked to
// prove the assertion bites, in both directions, rather than read it.
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type AssertExact<T extends true> = T;

export type _AccountsMatch = AssertExact<
  Exact<keyof typeof COMMAND_CHANNELS.accounts, keyof GitLabBarApi['accounts']>
>;
export type _GitlabMatch = AssertExact<
  Exact<keyof typeof COMMAND_CHANNELS.gitlab, keyof GitLabBarApi['gitlab']>
>;
export type _ConfigMatch = AssertExact<
  Exact<keyof typeof COMMAND_CHANNELS.config, keyof GitLabBarApi['config']>
>;
export type _AppMatch = AssertExact<
  Exact<keyof typeof COMMAND_CHANNELS.app, keyof GitLabBarApi['app']>
>;
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npm run test:run -- src/shared/api/channels.test.ts`
Expected: PASS, 3 tests.

Run: `npm run typecheck`
Expected: exit 0. A failure here means the manifest and the interface disagree — fix the mismatch, do not weaken `Exact`.

- [ ] **Step 6: Commit**

```bash
git add src/shared/api
git commit -m "feat: add typed GitLabBarApi contract and channel manifest"
```

---

## Task 3: Electron implementation and typed preload

**Files:**
- Create: `src/shared/api/createElectronApi.ts`
- Create: `src/shared/api/createElectronApi.test.ts`
- Modify: `src/preload.ts` (full rewrite, 111 lines → ~12)

**Interfaces:**
- Consumes: `COMMAND_CHANNELS`, `EVENT_CHANNELS`, `GitLabBarApi` (Task 2)
- Produces: `createElectronApi(ipc: IpcLike): GitLabBarApi`, and `window.gitlabbar` typed as `GitLabBarApi`

- [ ] **Step 1: Write the failing test**

`src/shared/api/createElectronApi.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createElectronApi } from './createElectronApi';

const makeIpc = () => ({
  invoke: vi.fn().mockResolvedValue('result'),
  on: vi.fn(),
  removeListener: vi.fn(),
});

describe('createElectronApi', () => {
  it('routes a command to its channel with its arguments', async () => {
    const ipc = makeIpc();
    const api = createElectronApi(ipc);

    await api.gitlab.assignMR(7, 42, [1, 2]);

    expect(ipc.invoke).toHaveBeenCalledWith('gitlab:assignMR', 7, 42, [1, 2]);
  });

  it('exposes every namespace', () => {
    const api = createElectronApi(makeIpc());
    expect(Object.keys(api).sort()).toEqual(['accounts', 'app', 'config', 'gitlab', 'on']);
  });

  it('subscribes to an event and unsubscribes cleanly', () => {
    const ipc = makeIpc();
    const api = createElectronApi(ipc);
    const cb = vi.fn();

    const unsubscribe = api.on.dataUpdated(cb);
    expect(ipc.on).toHaveBeenCalledWith('data:updated', expect.any(Function));

    const handler = ipc.on.mock.calls[0][1];
    handler({}, { mergeRequests: [] });
    expect(cb).toHaveBeenCalledWith({ mergeRequests: [] });

    unsubscribe();
    expect(ipc.removeListener).toHaveBeenCalledWith('data:updated', handler);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm run test:run -- src/shared/api/createElectronApi.test.ts`
Expected: FAIL — cannot resolve `./createElectronApi`.

- [ ] **Step 3: Implement it**

`src/shared/api/createElectronApi.ts`:

```ts
import { COMMAND_CHANNELS, EVENT_CHANNELS } from './channels';
import type { GitLabBarApi, Unsubscribe } from './contract';

export interface IpcLike {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  on(channel: string, handler: (event: unknown, ...args: unknown[]) => void): void;
  removeListener(channel: string, handler: (event: unknown, ...args: unknown[]) => void): void;
}

export function createElectronApi(ipc: IpcLike): GitLabBarApi {
  const namespace = (channels: Record<string, string>) =>
    Object.fromEntries(
      Object.entries(channels).map(([method, channel]) => [
        method,
        (...args: unknown[]) => ipc.invoke(channel, ...args),
      ])
    );

  const subscribe = (channel: string) => (cb: (payload: never) => void): Unsubscribe => {
    const handler = (_event: unknown, payload: unknown) => cb(payload as never);
    ipc.on(channel, handler);
    return () => ipc.removeListener(channel, handler);
  };

  return {
    accounts: namespace(COMMAND_CHANNELS.accounts),
    gitlab: namespace(COMMAND_CHANNELS.gitlab),
    config: namespace(COMMAND_CHANNELS.config),
    app: namespace(COMMAND_CHANNELS.app),
    on: {
      dataUpdated: subscribe(EVENT_CHANNELS.dataUpdated),
      refreshStatus: subscribe(EVENT_CHANNELS.refreshStatus),
      error: subscribe(EVENT_CHANNELS.error),
      untagDataUpdated: subscribe(EVENT_CHANNELS.untagDataUpdated),
    },
  } as GitLabBarApi;
}
```

Note on the two `as` casts: building namespaces reflectively cannot be proved sound to the compiler. They are confined to this one file, and Task 2's `Exact` assertions plus this task's tests are what actually guarantee correctness. Do not spread casts into consumers.

- [ ] **Step 4: Rewrite `src/preload.ts`**

Replace the entire file:

```ts
import { contextBridge, ipcRenderer } from 'electron';
import { createElectronApi } from './shared/api/createElectronApi';

contextBridge.exposeInMainWorld('gitlabbar', createElectronApi(ipcRenderer));
```

- [ ] **Step 5: Update the global declaration**

In `src/global.d.ts`, replace the `gitlabbar` declaration with:

```ts
import type { GitLabBarApi } from './shared/api/contract';

declare global {
  interface Window {
    gitlabbar: GitLabBarApi;
  }
}

export {};
```

- [ ] **Step 6: Run tests and typecheck**

Run: `npm run test:run`
Expected: PASS, all tests.

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/shared/api src/preload.ts src/global.d.ts
git commit -m "feat: build preload bridge from the typed contract"
```

---

## Task 4: FakeApi

**Files:**
- Create: `src/renderer/api/FakeApi.ts`
- Create: `src/renderer/api/FakeApi.test.ts`

**Interfaces:**
- Consumes: `GitLabBarApi` (Task 2)
- Produces: `createFakeApi(overrides?: FakeApiOverrides): { api: GitLabBarApi; emit: FakeEmitter }`. Every component test in Tasks 8-18 uses this.

`FakeApiOverrides` is a deep-partial of `GitLabBarApi` merged over the defaults. `FakeEmitter` exposes `emit.dataUpdated(data)`, `emit.refreshStatus(status)`, `emit.error(message)`, `emit.untagDataUpdated(projects)` so tests can drive pushed events synchronously.

- [ ] **Step 1: Write the failing test**

`src/renderer/api/FakeApi.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createFakeApi } from './FakeApi';

describe('createFakeApi', () => {
  it('returns empty collections by default', async () => {
    const { api } = createFakeApi();
    await expect(api.gitlab.getMRs()).resolves.toEqual([]);
    await expect(api.accounts.getAll()).resolves.toEqual([]);
  });

  it('honours overrides', async () => {
    const { api } = createFakeApi({
      accounts: { getAll: async () => [
        { id: 'a1', name: 'Work', instanceUrl: 'https://gitlab.example.com',
          username: 'cyril', isActive: true },
      ] },
    });
    await expect(api.accounts.getAll()).resolves.toHaveLength(1);
  });

  it('delivers pushed events to subscribers', () => {
    const { api, emit } = createFakeApi();
    const cb = vi.fn();
    const unsubscribe = api.on.refreshStatus(cb);

    emit.refreshStatus('refreshing');
    expect(cb).toHaveBeenCalledWith('refreshing');

    unsubscribe();
    emit.refreshStatus('idle');
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('persists config writes within a single fake', async () => {
    const { api } = createFakeApi();
    await api.config.set('viewMode', 'productOwner');
    await expect(api.config.get('viewMode')).resolves.toBe('productOwner');
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm run test:run -- src/renderer/api/FakeApi.test.ts`
Expected: FAIL — cannot resolve `./FakeApi`.

- [ ] **Step 3: Implement it**

Requirements the tests above pin down:
- every command resolves (never rejects, never returns `undefined` where an array is typed)
- collections default to `[]`
- `config` is backed by a mutable copy of `DEFAULT_CONFIG` from `src/shared/types/config.ts`
- `on.*` keeps a listener set per event; the returned `Unsubscribe` removes exactly that listener
- `emit.*` invokes listeners synchronously
- overrides are merged per namespace, so a test can replace one method without restating the rest

- [ ] **Step 4: Run the tests**

Run: `npm run test:run -- src/renderer/api/FakeApi.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/api
git commit -m "test: add in-memory FakeApi implementing GitLabBarApi"
```

---

## Task 5: ApiProvider and useApi

**Files:**
- Create: `src/renderer/api/ApiContext.tsx`
- Create: `src/renderer/api/ApiContext.test.tsx`

**Interfaces:**
- Consumes: `GitLabBarApi` (Task 2), `createFakeApi` (Task 4)
- Produces: `<ApiProvider api={…}>`, `useApi(): GitLabBarApi`, `renderWithApi(ui, { api })` test helper exported from `src/test/renderWithApi.tsx`

- [ ] **Step 1: Write the failing test**

`src/renderer/api/ApiContext.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApiProvider, useApi } from './ApiContext';
import { createFakeApi } from './FakeApi';

function Probe() {
  const api = useApi();
  return <span>{typeof api.gitlab.refresh}</span>;
}

describe('ApiProvider', () => {
  it('supplies the api to descendants', () => {
    const { api } = createFakeApi();
    render(
      <ApiProvider api={api}>
        <Probe />
      </ApiProvider>
    );
    expect(screen.getByText('function')).toBeInTheDocument();
  });

  it('throws a clear error when used outside a provider', () => {
    expect(() => render(<Probe />)).toThrow(/useApi must be used within an ApiProvider/);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm run test:run -- src/renderer/api/ApiContext.test.tsx`
Expected: FAIL — cannot resolve `./ApiContext`.

- [ ] **Step 3: Implement `ApiContext.tsx`**

```tsx
import { createContext, useContext, type ReactNode } from 'react';
import type { GitLabBarApi } from '../../shared/api/contract';

const ApiContext = createContext<GitLabBarApi | null>(null);

export function ApiProvider({ api, children }: { api: GitLabBarApi; children: ReactNode }) {
  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>;
}

export function useApi(): GitLabBarApi {
  const api = useContext(ApiContext);
  if (!api) throw new Error('useApi must be used within an ApiProvider');
  return api;
}
```

- [ ] **Step 4: Add the test helper**

`src/test/renderWithApi.tsx`:

Both `api` and `emit` in the return type are **non-optional**. An earlier draft returned
`emit` only when the helper built the fake itself, which forced every call site onto
`emit?.` and made a test that needed both an override and an event bypass the helper
entirely. With ~13 event-driven component tasks downstream, that friction compounds.

```tsx
import { render, type RenderOptions } from '@testing-library/react';
import type { ReactElement } from 'react';
import { ApiProvider } from '../renderer/api/ApiContext';
import { createFakeApi, type FakeApiOverrides, type FakeEmitter } from '../renderer/api/FakeApi';
import type { GitLabBarApi } from '../shared/api/contract';

type RenderWithApiOptions = RenderOptions & {
  overrides?: FakeApiOverrides;                    // helper builds the fake — the common path
  fake?: { api: GitLabBarApi; emit: FakeEmitter }; // caller supplies both halves together
};

// Passing both `overrides` and `fake` throws: it is a programming error in the test,
// and failing loudly beats silently preferring one.
export function renderWithApi(ui: ReactElement, options: RenderWithApiOptions = {}) { … }
```

Usage in later tasks — a test that stubs a method never touches `createFakeApi` itself:

```tsx
const { emit } = renderWithApi(<MergeRequestsTab />, {
  overrides: { gitlab: { getMRs: async () => [] } },
});
emit.dataUpdated({ … });
```

- [ ] **Step 5: Run the tests**

Run: `npm run test:run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/api src/test
git commit -m "feat: add ApiProvider, useApi and renderWithApi helper"
```

---

## Task 6: Consolidated design tokens

**Files:**
- Create: `src/renderer/styles/tokens.css`
- Create: `docs/superpowers/plans/token-reconciliation.md`

**Interfaces:**
- Consumes: nothing
- Produces: `tokens.css`, imported once per window entry. Every CSS Module in Tasks 8-18 uses `var(--…)` and must not hardcode colours, radii or shadows.

Source: `src/renderer/index.html:7-56` and `src/renderer/preferences.html:7-39` (dark), plus the `@media (prefers-color-scheme: light)` block at `index.html:57` and `preferences.html:40`.

**The two windows genuinely disagree.** Reconciling them is the only visual change permitted in this phase, and every reconciliation must be written down.

Known divergences, to be resolved as stated:

| Token | index.html | preferences.html | Resolution |
|---|---|---|---|
| `--bg-elevated` | `rgba(18,18,20,0.85)` | `rgba(18,18,20,0.95)` | keep both as `--bg-elevated` (0.85) and `--bg-elevated-opaque` (0.95) — the preferences window is not vibrancy-backed, flattening it would visibly change it |
| `--accent-green-glow` | `rgba(16,185,129,0.4)` | `rgba(16,185,129,0.3)` | unify to `0.4` |
| `--accent-red-glow` | `rgba(239,68,68,0.4)` | `rgba(239,68,68,0.3)` | unify to `0.4` |
| `--bg-input` | absent | present | promote to shared |
| `--bg-card-active`, `--text-muted`, `--accent-cyan`, `--accent-orange*`, `--gradient-{blue,green,orange,red}`, `--shadow-{sm,lg,glow}` | present | absent | promote to shared |
| `--gradient-mesh` | 3 radial stops | 2 radial stops | keep per-window: `--gradient-mesh-menubar`, `--gradient-mesh-preferences` |

- [ ] **Step 1: Extract both `:root` blocks verbatim into a scratch file and diff them**

```bash
sed -n '6,120p' src/renderer/index.html > /tmp/tokens-menubar.css
sed -n '6,80p' src/renderer/preferences.html > /tmp/tokens-prefs.css
diff /tmp/tokens-menubar.css /tmp/tokens-prefs.css || true
```

- [ ] **Step 2: Write `tokens.css`**

Both themes. Dark under `:root`, light under `@media (prefers-color-scheme: light)`, mirroring the existing structure exactly. Apply the resolutions from the table above. Every other token keeps its current value **byte for byte** — copy, do not retype.

- [ ] **Step 3: Record the reconciliation**

Write `docs/superpowers/plans/token-reconciliation.md` listing every token whose value changed for either window, with old value, new value, and which window is affected. This document is the allow-list of acceptable visual differences during the parity review; anything not on it is a regression.

- [ ] **Step 4: Verify no token was dropped**

```bash
grep -o '^\s*--[a-z-]*' /tmp/tokens-menubar.css /tmp/tokens-prefs.css | sed 's/.*--/--/' | sort -u > /tmp/tokens-before.txt
grep -o '^\s*--[a-z-]*' src/renderer/styles/tokens.css | sed 's/.*--/--/' | sort -u > /tmp/tokens-after.txt
comm -23 /tmp/tokens-before.txt /tmp/tokens-after.txt
```

Expected: empty output, except `--gradient-mesh` (renamed per the table). Any other line is a dropped token — add it.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/styles/tokens.css docs/superpowers/plans/token-reconciliation.md
git commit -m "feat: consolidate design tokens from both windows"
```

---

## Task 7: Preferences window — Vite entry and React shell

**Files:**
- Modify: `vite.renderer.config.ts`
- Create: `src/renderer/windows/preferences/index.html`
- Create: `src/renderer/windows/preferences/main.tsx`
- Create: `src/renderer/windows/preferences/PreferencesApp.tsx`
- Create: `src/renderer/windows/preferences/PreferencesApp.module.css`
- Create: `src/renderer/windows/preferences/PreferencesApp.test.tsx`

**Interfaces:**
- Consumes: `ApiProvider`, `createElectronApi` (Tasks 3, 5), `tokens.css` (Task 6)
- Produces: `<PreferencesApp />` with sidebar navigation and a `page` state of `'accounts' | 'projects' | 'general'`. Tasks 8-10 mount their page inside it.

This task ships the sidebar and empty page bodies only. Pages arrive in Tasks 8-10. `preferences.html` stays live and untouched until Task 11 — nothing is switched over yet.

- [ ] **Step 1: Write the failing test**

`src/renderer/windows/preferences/PreferencesApp.test.tsx`:

```tsx
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithApi } from '../../../test/renderWithApi';
import { PreferencesApp } from './PreferencesApp';

describe('PreferencesApp', () => {
  it('renders the three navigation items with their exact labels', () => {
    renderWithApi(<PreferencesApp />);
    expect(screen.getByText('Accounts')).toBeInTheDocument();
    expect(screen.getByText('Projects')).toBeInTheDocument();
    expect(screen.getByText('General')).toBeInTheDocument();
  });

  it('opens on the accounts page', () => {
    renderWithApi(<PreferencesApp />);
    expect(screen.getByRole('heading', { name: 'GitLab Accounts' })).toBeInTheDocument();
  });

  it('switches page on navigation click', async () => {
    renderWithApi(<PreferencesApp />);
    await userEvent.click(screen.getByText('Projects'));
    expect(screen.queryByRole('heading', { name: 'GitLab Accounts' })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm run test:run -- src/renderer/windows/preferences`
Expected: FAIL — cannot resolve `./PreferencesApp`.

- [ ] **Step 3: Build the shell**

Port the sidebar markup from `preferences.html:784-812` — logo SVG, title "GitLabBar", subtitle "Preferences", three nav items with their SVG icons, all copied verbatim. Port the sidebar CSS from the `.sidebar*` rules in `preferences.html:6-781` into `PreferencesApp.module.css`, replacing literal values with `var(--…)`.

Page bodies render only their `<h1 class="page-title">` and `<p class="page-desc">`, copied verbatim from `preferences.html:814-815` (Accounts), and the equivalent lines for Projects and General.

- [ ] **Step 4: Add the entry point**

`src/renderer/windows/preferences/main.tsx`:

```tsx
import { createRoot } from 'react-dom/client';
import { createElectronApi } from '../../../shared/api/createElectronApi';
import { ApiProvider } from '../../api/ApiContext';
import { PreferencesApp } from './PreferencesApp';
import '../../styles/tokens.css';

const container = document.getElementById('root');
if (!container) throw new Error('#root not found');

createRoot(container).render(
  <ApiProvider api={window.gitlabbar ?? createElectronApi((window as never)['require']('electron').ipcRenderer)}>
    <PreferencesApp />
  </ApiProvider>
);
```

Use `window.gitlabbar` — the preload already exposes it. The fallback exists only to fail loudly; if `window.gitlabbar` is undefined the preload is misconfigured.

- [ ] **Step 5: Configure two Vite entries**

`vite.renderer.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': '/src' } },
  build: {
    rollupOptions: {
      input: {
        menubar: resolve(__dirname, 'src/renderer/windows/menubar/index.html'),
        preferences: resolve(__dirname, 'src/renderer/windows/preferences/index.html'),
      },
    },
  },
});
```

The `menubar` entry does not exist yet. Create `src/renderer/windows/menubar/index.html` and a `main.tsx` rendering the single line `Menubar placeholder` so the build resolves. Task 13 replaces it.

- [ ] **Step 6: Verify build and tests**

Run: `npx vite build --config vite.renderer.config.ts`
Expected: exit 0, two HTML files emitted under the build output directory. Record the exact output paths in the commit message — Task 11 needs them for `RENDERER_PATH`.

Run: `npm run test:run`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add vite.renderer.config.ts src/renderer/windows
git commit -m "feat: add preferences React shell and dual Vite entries"
```

---

## Task 8: Accounts page

**Files:**
- Create: `src/renderer/features/preferences/AccountsPage/AccountsPage.tsx`
- Create: `src/renderer/features/preferences/AccountsPage/AccountsPage.module.css`
- Create: `src/renderer/features/preferences/AccountsPage/AccountsPage.test.tsx`
- Modify: `src/renderer/windows/preferences/PreferencesApp.tsx` (mount the page)

**Interfaces:**
- Consumes: `useApi()`, `renderWithApi`
- Produces: `<AccountsPage />`, no props

**Source to port:** markup `preferences.html:813-852`, script — the account list render and add/delete handlers around `preferences.html:1000-1100`. Behaviour to reproduce exactly: the account list with avatar (or initial fallback when `avatarUrl` is absent), the three inputs with their verbatim placeholders (`E.g.: Personal GitLab`, `https://gitlab.com` with that same default value, `glpat-xxxxxxxxxxxx`), the "Add account" button, the `#statusMessage` banner, and token validation before adding.

**Correction — an earlier draft of this plan was wrong here.** It claimed the account avatar
is an `<img>` with no `onerror` handler. It is not. `preferences.html:1026` renders the
initial-letter `<div>` **unconditionally**; there is no `<img>` on this page and `avatarUrl`
is never read. That claim was written from the dead, never-executed scaffold
`src/renderer/components/preferences/AccountsTab.tsx:89-95`, which does have the
conditional. The avatar/`onerror` trap is real, but it belongs to the **menubar** window
(Tasks 14-15), not here. Port what `preferences.html` actually does.

**Parity trap that IS real here — `validateToken`'s gate is dead code.**
`preferences.html:1080-1084` reads:

```js
const isValid = await window.gitlabbar.accounts.validateToken(url, token);
if (!isValid) { showStatus('Invalid token or incorrect URL', 'error'); return; }
```

`validateToken` always resolves an **object** (`{valid: true, user}` or `{valid: false}`),
never a boolean, so `isValid` is always truthy, the error branch is unreachable, and an
invalid token adds the account anyway. Reproduce this control flow exactly, including the
call to `validateToken` itself, which the vanilla code does make. Fixing it is a
user-visible behaviour change and belongs to the post-migration fix lot.

- [ ] **Step 1: Write the failing tests**

```tsx
import userEvent from '@testing-library/user-event';
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithApi } from '../../../../test/renderWithApi';
import { createFakeApi } from '../../../api/FakeApi';
import { AccountsPage } from './AccountsPage';

const account = {
  id: 'a1', name: 'Work', instanceUrl: 'https://gitlab.example.com',
  username: 'cyril', isActive: true,
};

describe('AccountsPage', () => {
  it('lists existing accounts', async () => {
    renderWithApi(<AccountsPage />, {
      overrides: { accounts: { getAll: async () => [account] } },
    });
    expect(await screen.findByText('Work')).toBeInTheDocument();
  });

  it('validates the token before adding an account', async () => {
    const validateToken = vi.fn().mockResolvedValue({ valid: true, user: {
      username: 'cyril', name: 'Cyril', avatarUrl: '',
    } });
    const add = vi.fn().mockResolvedValue(account);
    renderWithApi(<AccountsPage />, {
      overrides: { accounts: { getAll: async () => [], validateToken, add } },
    });
    await userEvent.type(screen.getByPlaceholderText('E.g.: Personal GitLab'), 'Work');
    await userEvent.type(screen.getByPlaceholderText('glpat-xxxxxxxxxxxx'), 'glpat-secret');
    await userEvent.click(screen.getByRole('button', { name: 'Add account' }));

    await waitFor(() => expect(validateToken).toHaveBeenCalledWith('https://gitlab.com', 'glpat-secret'));
    expect(add).toHaveBeenCalled();
  });

  // Documents a known pre-existing bug, deliberately preserved. The vanilla gate is
  // dead code (see the parity trap above), so an invalid token still adds the account.
  // Scheduled for the post-migration fix lot. Do not "fix" this test.
  it('adds the account even when the token is invalid (parity: the gate is dead code)', async () => {
    const add = vi.fn();
    renderWithApi(<AccountsPage />, {
      overrides: {
        accounts: {
          getAll: async () => [],
          validateToken: async () => ({ valid: false }),
          add,
        },
      },
    });
    await userEvent.type(screen.getByPlaceholderText('E.g.: Personal GitLab'), 'Work');
    await userEvent.type(screen.getByPlaceholderText('glpat-xxxxxxxxxxxx'), 'bad');
    await userEvent.click(screen.getByRole('button', { name: 'Add account' }));

    await waitFor(() => expect(add).toHaveBeenCalled());
    expect(screen.queryByText('Invalid token or incorrect URL')).not.toBeInTheDocument();
  });
});
```

`'Invalid token or incorrect URL'` is the real string at `preferences.html:1082`. It exists
in the source but can never be displayed, which is precisely what this test pins down.

- [ ] **Step 2: Run to confirm failure** — `npm run test:run -- AccountsPage`
- [ ] **Step 3: Implement the component and its CSS Module**
- [ ] **Step 4: Mount it in `PreferencesApp` for `page === 'accounts'`**
- [ ] **Step 5: Run tests** — `npm run test:run` → PASS
- [ ] **Step 6: Commit** — `git commit -m "feat: port accounts preferences page to React"`

---

## Task 9: Projects page

**Files:**
- Create: `src/renderer/features/preferences/ProjectsPage/{ProjectsPage.tsx,ProjectsPage.module.css,ProjectsPage.test.tsx}`
- Modify: `src/renderer/windows/preferences/PreferencesApp.tsx`

**Interfaces:**
- Consumes: `useApi()`, `renderWithApi`
- Produces: `<ProjectsPage />`, no props

**Source to port:** markup `preferences.html:853-871`, script `preferences.html:1150-1290`.

Behaviour to reproduce exactly: 300 ms debounce on the search input, `Searching...` while in flight, `No projects found` on empty results, `Error during search` on rejection, checkbox toggle writing both `watchedProjectIds` and `watchedProjectsData`, and the watched-project chips with their remove button.

**Parity trap:** chips show `project.name` only, and search results show `project.name` on line 1 with `path_with_namespace` on line 2. Reproduce that. Showing the full tree is a scoped feature for the follow-up lot — not this task.

- [ ] **Step 1: Write the failing tests**

Cover: debounce (advance fake timers by 299 ms → no call, 300 ms → one call), the three status strings verbatim, toggling a project persists both config keys, removing a chip persists the reduced list.

```tsx
it('debounces the search by 300ms', async () => {
  vi.useFakeTimers();
  const searchProjects = vi.fn().mockResolvedValue([]);
  renderWithApi(<ProjectsPage />, { overrides: { gitlab: { searchProjects } } });

  await userEvent.type(screen.getByPlaceholderText('Search for a project...'), 'api', {
    advanceTimers: vi.advanceTimersByTime,
  });
  vi.advanceTimersByTime(299);
  expect(searchProjects).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(searchProjects).toHaveBeenCalledWith('api');
  vi.useRealTimers();
});
```

- [ ] **Step 2: Run to confirm failure** — `npm run test:run -- ProjectsPage`
- [ ] **Step 3: Implement the component and its CSS Module**
- [ ] **Step 4: Mount it in `PreferencesApp` for `page === 'projects'`**
- [ ] **Step 5: Run tests** — `npm run test:run` → PASS
- [ ] **Step 6: Commit** — `git commit -m "feat: port projects preferences page to React"`

---

## Task 10: General page

**Files:**
- Create: `src/renderer/features/preferences/GeneralPage/{GeneralPage.tsx,GeneralPage.module.css,GeneralPage.test.tsx}`
- Modify: `src/renderer/windows/preferences/PreferencesApp.tsx`

**Interfaces:**
- Consumes: `useApi()`, `renderWithApi`
- Produces: `<GeneralPage />`, no props

**Source to port:** markup `preferences.html:872-974` and its script handlers.

Controls, each bound to its `AppConfig` key: `launchAtStartup` (checkbox), `viewMode` (select, `developer` | `productOwner`), `refreshInterval` (select, milliseconds), `failedPipelineMaxAge` (select, hours, `0` = no limit), `showUnassignedMRs` (checkbox), `notifyNewMR` and `notifyFailedPipeline` (checkboxes, both `checked` by default in the markup, mapping to `notifications.newMRAssigned` and `notifications.pipelineFailed`).

Read the `<option>` values and labels from the source and reproduce them verbatim — do not invent intervals.

- [ ] **Step 1: Write the failing tests**

One test per control: it loads its value from `config.getAll()` and writes back via `config.set()` with the correct key and coerced type (selects yield strings; `refreshInterval` and `failedPipelineMaxAge` must be written as numbers).

- [ ] **Step 2: Run to confirm failure** — `npm run test:run -- GeneralPage`
- [ ] **Step 3: Implement the component and its CSS Module**
- [ ] **Step 4: Mount it in `PreferencesApp` for `page === 'general'`**
- [ ] **Step 5: Run tests** — `npm run test:run` → PASS
- [ ] **Step 6: Commit** — `git commit -m "feat: port general preferences page to React"`

---

## Task 11: Switch the preferences window to React

**Files:**
- Modify: `src/main/tray.ts:20-22,255`
- Modify: `forge.config.ts:31-34`
- Delete: `src/renderer/preferences.html`

**Interfaces:**
- Consumes: the Vite build output paths recorded in Task 7
- Produces: a running preferences window backed by React. The menubar window still loads `src/renderer/index.html` and must keep working.

- [ ] **Step 1: Introduce a build-output path helper in `tray.ts`**

Replace `RENDERER_PATH` (lines 20-22) with a resolver that returns, for a given window name, the packaged path when `app.isPackaged` and the Vite dev/build output otherwise. Keep the existing `console.log` of the resolved path — it is the only diagnostic available when this breaks on macOS.

- [ ] **Step 2: Point the preferences window at the React bundle**

`tray.ts:255` — load the built `preferences` entry instead of `src/renderer/preferences.html`.

- [ ] **Step 3: Keep the menubar on vanilla**

`tray.ts:172` still resolves `src/renderer/index.html`. `forge.config.ts` `extraResource` must therefore keep shipping the renderer sources for now; only remove `preferences.html` from what is shipped if that can be done without touching the menubar. If it cannot, leave `extraResource` alone and note it — Task 19 cleans it up.

- [ ] **Step 4: Verify what is verifiable here**

Run: `npx vite build --config vite.renderer.config.ts` → exit 0
Run: `npm run typecheck` → exit 0
Run: `npm run test:run` → PASS

- [ ] **Step 5: HUMAN VERIFICATION — macOS required**

This step cannot be completed by an agent. On a Mac:

```bash
npm start
```

Open preferences from the tray menu. Check: the three pages render, accounts can be added and removed, project search works, general settings persist across a restart.

An agent reaching this step must stop, commit the work, and report that Task 11 is **blocked pending human verification** — never mark it done.

- [ ] **Step 6: Commit**

```bash
git add src/main/tray.ts forge.config.ts
git commit -m "feat: load the preferences window from the React bundle"
```

---

## Task 12: Formatting utilities

**Files:**
- Create: `src/renderer/utils/format.ts`
- Create: `src/renderer/utils/format.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `simpleMarkdown(text: string): string`, `formatDateTime(iso: string): string`, `formatTime(iso: string): string`, `getAgeInfo(createdAt: string): AgeInfo`, `getUntagAgeInfo(lastTagDate: string): AgeInfo`. Tasks 14-18 import these.

**Source to port:** `index.html:3574-3667`.

`escapeHtml` is **not** ported — React escapes by default. Every call site that wrapped a value in `escapeHtml` becomes a plain `{value}` interpolation. Where the vanilla code built HTML strings and injected them, React renders elements; `simpleMarkdown` is the one exception and must return sanitised HTML for `dangerouslySetInnerHTML`, preserving exactly the transformations the original performs.

`AgeInfo` is whatever shape `getAgeInfo` returns at `index.html:3624` — read it and type it; do not invent fields.

These are pure functions, so this task is real TDD with exact expected values.

- [ ] **Step 1: Write the failing tests**

Pin dates so results are deterministic:

```ts
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { formatDateTime, formatTime, getAgeInfo } from './format';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-04T12:00:00Z'));
});
afterEach(() => vi.useRealTimers());

describe('getAgeInfo', () => {
  it('reports hours for a recent item', () => {
    expect(getAgeInfo('2026-08-04T09:00:00Z')).toMatchObject({ /* fields read from source */ });
  });
  it('reports days for an older item', () => {
    expect(getAgeInfo('2026-07-28T12:00:00Z')).toMatchObject({ /* fields read from source */ });
  });
});
```

Before writing assertions, read `index.html:3624-3667` and derive the expected values from the actual branches. The test must encode the current behaviour, including any rounding quirk — this is a parity port, quirks included.

- [ ] **Step 2: Run to confirm failure** — `npm run test:run -- format`
- [ ] **Step 3: Port the functions**
- [ ] **Step 4: Run tests** — PASS
- [ ] **Step 5: Commit** — `git commit -m "feat: port formatting helpers with tests"`

---

## Task 13: Menubar shell and DataProvider

**Files:**
- Create: `src/renderer/windows/menubar/{main.tsx,MenubarApp.tsx,MenubarApp.module.css,MenubarApp.test.tsx}`
- Create: `src/renderer/windows/menubar/DataProvider.tsx`
- Create: `src/renderer/windows/menubar/DataProvider.test.tsx`
- Modify: `src/renderer/windows/menubar/index.html` (replace the Task 7 placeholder)

**Interfaces:**
- Consumes: `useApi()`, `useApi().on.*`
- Produces:
  - `<DataProvider>` + `useData(): { mergeRequests, pipelines, releases, untagProjects, status, error, lastUpdated }`
  - `<MenubarApp />` rendering header, the four tabs with their badge counts, and the active tab's content
  - `useViewMode(): 'developer' | 'productOwner'`

**Source to port:** tab markup `index.html:2209-2323`, header and view mode `index.html:2374-2442`, data loading `index.html:3776-3921`.

Tabs, with verbatim labels and badge element ids from the source: `mrs` (`#mrCount`), `pipelines` (`#pipelineCount`), `releases` (`#releaseCount`), `untag` (`#untagCount`). The `po-content` pane (`index.html:2291`) is not a tab — it is the product-owner view mode, handled in Task 17.

- [ ] **Step 1: Write the failing DataProvider test**

```tsx
it('replaces its data when data:updated arrives', async () => {
  const { emit } = renderWithApi(<DataProvider><Probe /></DataProvider>);

  // lastUpdated is a Date, NOT a string. Electron delivers PolledData by structured
  // clone, so the renderer receives a live Date object. Typing or faking it as a
  // string makes the test pass against a shape the app never actually sees.
  act(() => emit.dataUpdated({
    mergeRequests: [{ id: 1 } as never], pipelines: [], releases: [],
    status: 'green', lastUpdated: new Date('2026-08-04T12:00:00Z'),
  }));

  expect(await screen.findByTestId('mr-count')).toHaveTextContent('1');
});

it('unsubscribes on unmount', () => {
  const { unmount } = renderWithApi(<DataProvider><Probe /></DataProvider>);
  unmount();
  // emitting after unmount must not throw
});
```

- [ ] **Step 2: Run to confirm failure** — `npm run test:run -- DataProvider`
- [ ] **Step 3: Implement `DataProvider`** — subscribe to all four events on mount, return the unsubscribers from the effect cleanup, seed initial state from `gitlab.getMRs/getPipelines/getReleases` as `index.html:3795` does
- [ ] **Step 4: Implement `MenubarApp`** — header, tabs, badges, empty tab panes
- [ ] **Step 5: Write and pass the `MenubarApp` tests** — tab labels present, clicking a tab switches the active pane, badge counts follow `useData()`
- [ ] **Step 6: Run tests and build** — `npm run test:run` → PASS; `npx vite build --config vite.renderer.config.ts` → exit 0
- [ ] **Step 7: Commit** — `git commit -m "feat: add menubar React shell and DataProvider"`

---

## Task 14: Shared presentational components

**Files:**
- Create: `src/renderer/shared/{Avatar,ItemCard,SectionHeader,EmptyState}/` each with `.tsx`, `.module.css`, `.test.tsx`

**Interfaces:**
- Consumes: `tokens.css`
- Produces:
  - `<Avatar src={string | undefined} name={string} size="item" | "mini" />` — renders `<img>` when `src` is truthy, otherwise the initial-letter placeholder. **No `onerror` handler** — parity.
  - `<ItemCard>` — the `.item` shell used by MR, pipeline and release rows
  - `<SectionHeader title={string} count={number} />`
  - `<EmptyState message={string} />`

**Source to port:** CSS `.item-avatar`, `.item-avatar-placeholder` (`index.html:1158-1180`), `.people-avatars .mini-avatar*` (`index.html:1262-1300`), `.item*`, `.section*`, and the empty-state rules from `index.html:6-2185`.

- [ ] **Step 1: Write the failing Avatar test**

```tsx
it('renders an image when a url is given', () => {
  render(<Avatar src="https://example.com/a.png" name="Cyril" size="item" />);
  expect(screen.getByRole('img', { name: 'Cyril' })).toHaveAttribute('src', 'https://example.com/a.png');
});

it('falls back to the initial when no url is given', () => {
  render(<Avatar src={undefined} name="cyril" size="item" />);
  expect(screen.getByText('C')).toBeInTheDocument();
});

it('does not install an error handler (parity: broken images stay broken)', () => {
  render(<Avatar src="https://example.com/a.png" name="Cyril" size="item" />);
  expect(screen.getByRole('img')).not.toHaveAttribute('onerror');
});
```

The third test looks perverse. It is deliberate: it documents that the missing fallback is known and intentional for this phase, so a later agent does not "helpfully" add one and silently break parity.

- [ ] **Step 2: Run to confirm failure** — `npm run test:run -- Avatar`
- [ ] **Step 3: Implement the four components with their CSS Modules**
- [ ] **Step 4: Write and pass tests for the other three**
- [ ] **Step 5: Run tests** — PASS
- [ ] **Step 6: Commit** — `git commit -m "feat: add shared menubar presentational components"`

---

## Task 15: Merge requests tab

**Files:**
- Create: `src/renderer/features/merge-requests/{MergeRequestsTab.tsx,MergeRequestsTab.module.css,MergeRequestsTab.test.tsx,MergeRequestRow.tsx,MergeRequestRow.module.css}`
- Modify: `src/renderer/windows/menubar/MenubarApp.tsx`

**Interfaces:**
- Consumes: `useData()`, `useApi()`, `Avatar`, `ItemCard`, `SectionHeader`, `EmptyState`, `format.ts`
- Produces: `<MergeRequestsTab />`, no props

**Source to port:** `index.html:2443-2884` — `loadDismissedMRs`, `renderMRs`, `renderSection`.

Behaviour: grouping into sections by role (the `renderSection` calls in `renderMRs` define the sections and their order — read them, do not guess), author avatar, assignee and reviewer mini-avatar stacks capped at 3 with a `+N` chip, draft badge, age info, dismiss action calling `gitlab.dismissMR`, notes expansion via `gitlab.getMRNotes`, assignee/reviewer editing via `gitlab.getProjectMembers` + `gitlab.assignMR` / `gitlab.addReviewer`, opening the MR through `app.openExternal`.

- [ ] **Step 1: Write the failing tests** — render with `emit.dataUpdated({ mergeRequests: [...] })` and assert: section titles and order, the `+N` chip appears only above 3 assignees, `dismissMR` is called with the MR id on dismiss, `openExternal` is called with `web_url` on click, `EmptyState` shows when the list is empty
- [ ] **Step 2: Run to confirm failure** — `npm run test:run -- MergeRequests`
- [ ] **Step 3: Implement `MergeRequestRow` then `MergeRequestsTab`**
- [ ] **Step 4: Mount in `MenubarApp` for the `mrs` tab**
- [ ] **Step 5: Run tests** — PASS
- [ ] **Step 6: Commit** — `git commit -m "feat: port merge requests tab to React"`

---

## Task 16: Pipelines tab

**Files:**
- Create: `src/renderer/features/pipelines/{PipelinesTab.tsx,PipelinesTab.module.css,PipelinesTab.test.tsx,PipelineRow.tsx,PipelineRow.module.css,jobIcon.tsx}`
- Modify: `src/renderer/windows/menubar/MenubarApp.tsx`

**Interfaces:**
- Consumes: `useData()`, `useApi()`, shared components, `format.ts`
- Produces: `<PipelinesTab />`, `getJobIcon(status: string): ReactNode`

**Source to port:** `index.html:2885-3112`.

`getJobIcon` (`index.html:3096-3112`) returns markup per job status — port it to a component returning JSX, keeping the exact status→icon mapping.

Behaviour: project path as title (`pipeline.projectPath || pipeline.projectName || 'Pipeline'`, `index.html:3017` — reproduce the fallback chain exactly), triggering user avatar, job list with status icons, dismiss via `gitlab.dismissPipeline`, `failedPipelineMaxAge` filtering.

- [ ] **Step 1: Write the failing tests** — one per status in the `getJobIcon` mapping, plus the title fallback chain (all three branches), plus dismiss
- [ ] **Step 2: Run to confirm failure** — `npm run test:run -- Pipelines`
- [ ] **Step 3: Implement**
- [ ] **Step 4: Mount in `MenubarApp` for the `pipelines` tab**
- [ ] **Step 5: Run tests** — PASS
- [ ] **Step 6: Commit** — `git commit -m "feat: port pipelines tab to React"`

---

## Task 17: Releases tab and product-owner view

**Files:**
- Create: `src/renderer/features/releases/{ReleasesTab.tsx,ReleasesTab.module.css,ReleasesTab.test.tsx,POView.tsx,POView.module.css,POView.test.tsx,POReleaseRow.tsx}`
- Modify: `src/renderer/windows/menubar/MenubarApp.tsx`

**Interfaces:**
- Consumes: `useData()`, `useApi()`, `useViewMode()`, shared components, `format.ts`
- Produces: `<ReleasesTab />`, `<POView />`

**Source to port:** `index.html:3113-3298` (releases), `index.html:3299-3573` (`applyViewMode`, `renderPOView`, `renderPORelease`).

This is the largest single task — two related but distinct views. Behaviour: releases grouped by project path (`release.projectPath || release.projectName || 'Unknown'`, `index.html:3157`), dismiss via `gitlab.dismissRelease`, and in PO mode a project filter `<select>`, per-project sections sorted by path, pagination through `gitlab.getPOReleases(projectId, page, perPage)`, deployment status texts and icons.

If this task proves too large in practice, split it at the file boundary — `ReleasesTab` and `POView` share only `format.ts` and the shared components.

- [ ] **Step 1: Write the failing tests** — grouping key fallback chain, sorted project order, filter narrowing to one project, pagination calling `getPOReleases` with incrementing pages, dismiss
- [ ] **Step 2: Run to confirm failure** — `npm run test:run -- Releases POView`
- [ ] **Step 3: Implement `ReleasesTab`**
- [ ] **Step 4: Implement `POView`**
- [ ] **Step 5: Wire view-mode switching in `MenubarApp`** — `developer` shows the four tabs, `productOwner` shows `POView`, matching `applyViewMode` at `index.html:3299`
- [ ] **Step 6: Run tests** — PASS
- [ ] **Step 7: Commit** — `git commit -m "feat: port releases tab and product-owner view to React"`

---

## Task 18: Untag tab

**Files:**
- Create: `src/renderer/features/untag/{UntagTab.tsx,UntagTab.module.css,UntagTab.test.tsx,UntagProjectRow.tsx}`
- Modify: `src/renderer/windows/menubar/MenubarApp.tsx`

**Interfaces:**
- Consumes: `useData()`, `useApi()`, shared components, `getUntagAgeInfo`
- Produces: `<UntagTab />`

**Source to port:** `index.html:3668-3775` (`renderUntag`).

Behaviour: one row per `UntagProject` showing `projectName` (**not** `projectPath` — `index.html:3715`; the full-path change is a scoped feature for the follow-up lot, not this task), last tag name and date, commits-ahead count, expandable commit list, exclusion handling, refresh via `gitlab.refreshUntag`, and `gitlab.clearUntagExclusions`.

Data arrives on the `untag:dataUpdated` event, not `data:updated`.

- [ ] **Step 1: Write the failing tests** — rows render from `emit.untagDataUpdated([...])`, commits-ahead count shown, exclusion and clear-exclusions call the right commands, empty state
- [ ] **Step 2: Run to confirm failure** — `npm run test:run -- Untag`
- [ ] **Step 3: Implement**
- [ ] **Step 4: Mount in `MenubarApp` for the `untag` tab**
- [ ] **Step 5: Run tests** — PASS
- [ ] **Step 6: Commit** — `git commit -m "feat: port untag tab to React"`

---

## Task 19: Switch the menubar window and delete the vanilla UI

**Files:**
- Modify: `src/main/tray.ts:172`
- Modify: `forge.config.ts:31-34`
- Delete: `src/renderer/index.html`, `index.html` (root), `src/renderer.ts`, `src/renderer/App.tsx`, `src/renderer/components/`, `src/renderer/hooks/`

**Interfaces:**
- Consumes: everything above
- Produces: an application whose UI is entirely React

- [ ] **Step 1: Point the menubar window at the React bundle** (`tray.ts:172`)
- [ ] **Step 2: Remove `'./src/renderer'` from `extraResource`** in `forge.config.ts:31-34`, keeping `'./assets'`
- [ ] **Step 3: Delete the dead files listed above**
- [ ] **Step 4: Prove nothing references them**

```bash
grep -rn "window.gitlabbar" src/ --include=*.ts --include=*.tsx | grep -v "src/preload.ts" | grep -v "src/renderer/windows"
grep -rn "renderer/index.html\|preferences.html\|src/renderer.ts" src/ forge.config.ts
```

Expected: no output from either command.

- [ ] **Step 5: Verify what is verifiable** — `npm run test:run` PASS, `npm run typecheck` exit 0, `npm run lint` exit 0, `npx vite build --config vite.renderer.config.ts` exit 0
- [ ] **Step 6: HUMAN VERIFICATION — macOS required.** Agent must stop here and report blocked, exactly as in Task 11 Step 5.
- [ ] **Step 7: Commit** — `git commit -m "feat: switch menubar to React and remove the vanilla UI"`

---

## Task 20: Parity checklist

**Files:**
- Create: `docs/superpowers/plans/parity-checklist.md`

**Interfaces:**
- Consumes: `token-reconciliation.md` (Task 6)
- Produces: the acceptance document for phase 1

- [ ] **Step 1: Write the checklist**

One unchecked line per screen and interaction, grouped by window and tab, derived from the Source Map at the top of this plan. Each line names what to look at and what to compare against.

- [ ] **Step 2: Add the known-differences section**

Copy the reconciled tokens from `token-reconciliation.md`. These are the **only** permitted visual differences. State plainly that the **four** known bugs listed in Global Constraints are still present by design, and name each one with the file and line where it lives, so the human checking parity on macOS knows which misbehaviours to expect rather than report.

- [ ] **Step 3: Mark the verification owner**

State at the top that every line requires macOS and can only be checked by the human, and that no agent may tick a box in this file.

- [ ] **Step 4: Commit** — `git commit -m "docs: add phase 1 parity checklist"`

---

## Self-Review

**Spec coverage.** Contract → Tasks 2-3. Component decomposition → Tasks 7-18. Tokens → Task 6. Build wiring → Tasks 7, 11, 19. Tests → Task 1 plus every task. Verification limits → Tasks 11, 19, 20. Strict parity → Global Constraints plus explicit traps in Tasks 8, 9, 14, 18. Deleting the dead scaffold → Task 19. Spec sections all map to at least one task.

**Type consistency.** `GitLabBarApi` (Task 2) is consumed under that exact name in Tasks 3, 4, 5. `createFakeApi` returns `{ api, emit }` in Task 4 and is destructured that way in Tasks 7-18. `renderWithApi(ui, { api })` defined in Task 5, used with that signature throughout. `useData()` defined in Task 13, consumed in Tasks 15-18. `getJobIcon` named identically in Task 16's interface and steps.

**Known softness, stated rather than hidden.** Tasks 8-10 and 15-18 give exact source line ranges, exact component interfaces and exact test intent, but not literal finished component code. Transcribing 5200 lines of transformed markup into a plan document would be writing the implementation twice, and the second copy would be the one that drifts. The source file is the specification, and it is pinned by line number. Where a specific string, fallback chain or quirk matters, it is called out inline. Implementers must read the referenced lines before writing — a task done without opening the source will not reach parity.
