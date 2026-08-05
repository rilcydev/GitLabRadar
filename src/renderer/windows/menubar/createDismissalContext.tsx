import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { GitLabBarApi } from '@/shared/api/contract';
// Relative import: eslint's import/no-unresolved has no TS-aware resolver
// for the `@/*` alias on value imports (see src/test/renderWithApi.tsx and
// src/renderer/api/FakeApi.ts for the same pre-existing gap).
import { useApi } from '../../api/ApiContext';

/**
 * index.html keeps THREE structurally identical dismissible collections as
 * module-level state: `dismissedMRIds` (:2334, loaded by `loadDismissedMRs`
 * at :2443-2452), `dismissedPipelineIds` (:2883, `loadDismissedPipelines`
 * at :2885-2894) and `dismissedReleaseIds` (:3111, `loadDismissedReleases`
 * at :3113-...). Each one is read/written by exactly two operations --
 * "dismiss one" (`await gitlab.dismiss*(id); dismissed*Ids.push(id);`) and
 * "restore all" (`await gitlab.restore*(); dismissed*Ids = [];`) -- and
 * loaded once at startup from `config.getAll()`. Task 15 wrote this pattern
 * out by hand for MRs (`useMRDismissal`, ~40 lines including the provider);
 * this factory is that pattern generalized so Tasks 16 (pipelines) and 17
 * (releases) don't each duplicate it a third and fourth time.
 *
 * Each of the three call sites differs only in:
 *   - which `AppConfig` key it persists to (`dismissedMRs` / `dismissedPipelines`
 *     / `dismissedReleases` -- src/shared/types/config.ts:25-27),
 *   - which `gitlab.*` IPC commands it calls to dismiss/restore
 *     (`dismissMR`/`restoreMRs`, `dismissPipeline`/`restorePipelines`,
 *     `dismissRelease`/`restoreReleases` -- src/shared/api/contract.ts:137-146),
 *   - the exact `console.error` text on a failed initial load (index.html:2450,
 *     :2892, :3120 -- "Error loading dismissed MRs/pipelines/releases:"),
 *   - the error thrown by the `use*` hook when called outside its provider.
 * Everything else -- the `useState<number[]>`, the mount-time load effect
 * with its `cancelled` guard, the two `useCallback`s, the `useMemo`d context
 * value -- is identical, so it lives here once.
 */
export interface DismissalContextValue {
  dismissedIds: number[];
  dismiss: (id: number) => Promise<void>;
  restore: () => Promise<void>;
}

export interface CreateDismissalContextOptions {
  /** The `AppConfig` key this collection persists to, e.g. `'dismissedMRs'`. */
  configKey: 'dismissedMRs' | 'dismissedPipelines' | 'dismissedReleases';
  /** Human label used in the load-failure `console.error` message, e.g. `'MRs'` -> "Error loading dismissed MRs:". */
  errorLabel: string;
  /** Name of the `use*Dismissal` hook this produces, used only in its own "must be used within a DataProvider" error message. */
  hookName: string;
  /** Mirrors `await gitlab.dismiss*(id); dismissed*Ids.push(id);`. */
  dismiss: (api: GitLabBarApi, id: number) => Promise<void>;
  /** Mirrors `await gitlab.restore*(); dismissed*Ids = [];`. */
  restore: (api: GitLabBarApi) => Promise<void>;
}

export interface DismissalContext {
  /** Wraps `children` with the context provider. Mount once, near `DataProvider`'s own state. */
  DismissalProvider: (props: { children: ReactNode }) => ReactNode;
  /** Reads `{ dismissedIds, dismiss, restore }` for this collection. Throws outside its provider. */
  useDismissal: () => DismissalContextValue;
}

export function createDismissalContext(options: CreateDismissalContextOptions): DismissalContext {
  const { configKey, errorLabel, hookName, dismiss: dismissOne, restore: restoreAll } = options;

  const Context = createContext<DismissalContextValue | null>(null);

  function useDismissal(): DismissalContextValue {
    const ctx = useContext(Context);
    if (!ctx) throw new Error(`${hookName} must be used within a DataProvider`);
    return ctx;
  }

  function DismissalProvider({ children }: { children: ReactNode }) {
    const api = useApi();
    const [dismissedIds, setDismissedIds] = useState<number[]>([]);

    // loadDismissed*() -- invoked as part of init()'s Promise.all
    // (index.html:3961-3967) -- independent of loadData's own fetch, so it
    // gets its own effect rather than being folded into DataProvider's.
    useEffect(() => {
      let cancelled = false;
      async function loadDismissed() {
        try {
          const config = await api.config.getAll();
          if (cancelled) return;
          setDismissedIds(config[configKey] || []);
        } catch (err) {
          console.error(`Error loading dismissed ${errorLabel}:`, err);
        }
      }
      void loadDismissed();
      return () => {
        cancelled = true;
      };
    }, [api]);

    const dismiss = useCallback(
      async (id: number) => {
        await dismissOne(api, id);
        setDismissedIds((prev) => [...prev, id]);
      },
      [api]
    );

    const restore = useCallback(async () => {
      await restoreAll(api);
      setDismissedIds([]);
    }, [api]);

    const value = useMemo<DismissalContextValue>(
      () => ({ dismissedIds, dismiss, restore }),
      [dismissedIds, dismiss, restore]
    );

    return <Context.Provider value={value}>{children}</Context.Provider>;
  }

  return { DismissalProvider, useDismissal };
}
