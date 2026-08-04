import type {
  GitLabBarApi,
  PolledData,
  RefreshStatus,
  Unsubscribe,
} from '@/shared/api/contract';
import type { AppConfig, UntagProject } from '@/shared/types';
// Value import (unlike the `import type`s above): eslint's import/no-unresolved
// can't follow the `@/*` alias for runtime imports (no TS-aware resolver is
// configured -- see src/test/harness.test.ts's identical pre-existing gap),
// even though tsc/Vite/Vitest all resolve it fine. Relative path sidesteps it.
import { DEFAULT_CONFIG } from '../../shared/types/config';

// A deep-partial-by-namespace view of GitLabBarApi: a test overriding
// `accounts.getAll` doesn't have to restate the other 31 methods across the
// other three command namespaces, nor the 4 event subscriptions. Each
// namespace's members are functions, not further-nestable objects, so one
// level of `Partial` per namespace is as "deep" as this contract gets.
export type FakeApiOverrides = {
  [K in keyof GitLabBarApi]?: Partial<GitLabBarApi[K]>;
};

// Mirrors GitLabBarApi['on']'s shape: one emit method per pushed event, so
// `emit.dataUpdated(data)` etc. drive the same subscribers `api.on.dataUpdated`
// registered, synchronously and without needing IPC or fake timers.
export interface FakeEmitter {
  dataUpdated(data: PolledData): void;
  refreshStatus(status: RefreshStatus): void;
  error(message: string): void;
  untagDataUpdated(data: UntagProject[]): void;
}

// A minimal synchronous pub/sub used to back each of the 4 pushed events.
// `on` returns an Unsubscribe that removes exactly the listener it added;
// calling it twice is a no-op (Set#delete on an absent value doesn't throw).
function createEventBus<T>() {
  const listeners = new Set<(payload: T) => void>();
  return {
    on(cb: (payload: T) => void): Unsubscribe {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    emit(payload: T): void {
      for (const cb of listeners) cb(payload);
    },
  };
}

export function createFakeApi(overrides: FakeApiOverrides = {}): {
  api: GitLabBarApi;
  emit: FakeEmitter;
} {
  // Mutable copy of DEFAULT_CONFIG -- structuredClone (not a shallow spread)
  // so nested objects/arrays (e.g. `notifications`, `dismissedMRs`) aren't
  // shared with DEFAULT_CONFIG or with other createFakeApi() instances.
  const configStore: AppConfig = structuredClone(DEFAULT_CONFIG);
  let nextAccountId = 1;

  const dataUpdatedBus = createEventBus<PolledData>();
  const refreshStatusBus = createEventBus<RefreshStatus>();
  const errorBus = createEventBus<string>();
  const untagDataUpdatedBus = createEventBus<UntagProject[]>();

  const accounts: GitLabBarApi['accounts'] = {
    getAll: async () => [],
    add: async (input) => ({
      success: true,
      account: {
        id: `fake-account-${nextAccountId++}`,
        name: input.name,
        instanceUrl: input.instanceUrl,
        username: 'fake-user',
        isActive: true,
      },
    }),
    remove: async () => ({ success: true }),
    update: async (accountId, updates) => ({
      success: true,
      account: {
        id: accountId,
        name: 'Fake Account',
        instanceUrl: 'https://gitlab.example.com',
        username: 'fake-user',
        isActive: true,
        ...updates,
      },
    }),
    validateToken: async () => ({
      valid: true,
      user: { username: 'fake-user', name: 'Fake User', avatarUrl: '' },
    }),
    ...overrides.accounts,
  };

  const gitlab: GitLabBarApi['gitlab'] = {
    getMRs: async () => [],
    getPipelines: async () => [],
    getReleases: async () => [],
    refresh: async () => {},
    searchProjects: async () => [],
    getGroups: async () => [],
    dismissPipeline: async () => {},
    restorePipelines: async () => {},
    getMRNotes: async () => [],
    getProjectMembers: async () => [],
    assignMR: async () => {},
    addReviewer: async () => {},
    dismissMR: async () => {},
    restoreMRs: async () => {},
    dismissRelease: async () => {},
    restoreReleases: async () => {},
    getPOReleases: async () => [],
    getUntagProjects: async () => [],
    refreshUntag: async () => {},
    clearUntagExclusions: async () => {},
    ...overrides.gitlab,
  };

  const config: GitLabBarApi['config'] = {
    get: async (key) => configStore[key],
    set: async (key, value) => {
      configStore[key] = value;
    },
    getAll: async () => ({ ...configStore }),
    ...overrides.config,
  };

  const app: GitLabBarApi['app'] = {
    openExternal: async () => {},
    showPreferences: async () => {},
    quit: async () => {},
    hideMenu: async () => {},
    ...overrides.app,
  };

  const on: GitLabBarApi['on'] = {
    dataUpdated: dataUpdatedBus.on,
    refreshStatus: refreshStatusBus.on,
    error: errorBus.on,
    untagDataUpdated: untagDataUpdatedBus.on,
    ...overrides.on,
  };

  const api: GitLabBarApi = { accounts, gitlab, config, app, on };

  const emit: FakeEmitter = {
    dataUpdated: dataUpdatedBus.emit,
    refreshStatus: refreshStatusBus.emit,
    error: errorBus.emit,
    untagDataUpdated: untagDataUpdatedBus.emit,
  };

  return { api, emit };
}
