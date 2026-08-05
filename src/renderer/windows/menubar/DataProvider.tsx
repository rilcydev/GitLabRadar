import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { TrayStatus } from '@/shared/api/contract';
import type { MergeRequest, Pipeline, Release, UntagProject } from '@/shared/types';
// Relative import: eslint's import/no-unresolved has no TS-aware resolver
// for the `@/*` alias on value imports (see src/test/renderWithApi.tsx and
// src/renderer/api/FakeApi.ts for the same pre-existing gap).
import { useApi } from '../../api/ApiContext';
import { createDismissalContext } from './createDismissalContext';

export interface Data {
  mergeRequests: MergeRequest[];
  pipelines: Pipeline[];
  releases: Release[];
  untagProjects: UntagProject[];
  // index.html:3735,3746-3749: gates the untag empty state and drives the
  // "N projects excluded (no tags)" notice. Not derivable from
  // `untagProjects.length` -- it's a disjoint count of projects excluded
  // from that list entirely, so it has to be carried alongside it.
  untagExcludedCount: number;
  // Set only by `data:updated` -- see index.html:3886-3903. The vanilla app
  // never keeps these as persistent top-level state (they only ever exist
  // inside that one event handler's closure), so there is no source
  // variable to mirror for the initial value; `null`/`undefined` are the
  // only sensible defaults before the first `data:updated` arrives.
  status: TrayStatus | null;
  error: string | undefined;
  lastUpdated: Date | null;
  // Added in Task 15 -- not in the task-13 brief, but required to port
  // renderMRs()'s loading gate (index.html:2470-2475) faithfully. Mirrors
  // the vanilla `isLoading` module-level variable (index.html:2331): starts
  // `true`, flips to `false` once the FIRST loadData() settles (success OR
  // failure -- index.html:3855 and :3875) or once the first `data:updated`
  // push arrives (index.html:3892), and never flips back. See
  // task-15-report.md for why this belongs on `Data` rather than being
  // reinvented locally inside MergeRequestsTab: pipelines/releases (Tasks
  // 16-17) gate on the exact same flag (index.html:2909, :3137).
  isLoading: boolean;
  // Added in Task 15 -- mirrors the vanilla `hasAccounts` module-level
  // variable (index.html:2332), set by `checkAccounts()`
  // (index.html:3914-3923) at startup (index.html:3960) and again on every
  // `data:updated` push (index.html:3894). Only the MRs empty-state text
  // depends on it today (index.html:2482-2490), but it is app-wide account
  // state, not MR-specific, so it lives here beside `isLoading` rather than
  // being duplicated inside MergeRequestsTab.
  hasAccounts: boolean;
}

const initialData: Data = {
  mergeRequests: [],
  pipelines: [],
  releases: [],
  untagProjects: [],
  untagExcludedCount: 0,
  status: null,
  error: undefined,
  lastUpdated: null,
  isLoading: true,
  hasAccounts: false,
};

const DataContext = createContext<Data | null>(null);

// Added in Task 15, generalized in Task 16 onto `createDismissalContext`.
// index.html keeps `dismissedMRIds` as a single module-level array
// (index.html:2334, loaded by loadDismissedMRs at :2443-2452) that BOTH the
// mrCount badge computation (index.html:2463-2466) and renderMRs' own
// filtering/list (index.html:2463,2542-2553,2758-2768) read and mutate
// directly, since they are the same script scope. In React, MenubarApp (the
// badge) and MergeRequestsTab (the list) are siblings, not parent/child, so
// that shared mutable array has to live somewhere both can reach --
// DataProvider, the nearest common ancestor already wrapping both in
// main.tsx, is that place. Deliberately a SEPARATE context from
// `DataContext` (not folded into `Data`) so `useData()`'s contract stays
// pure data with no mutator functions mixed in. Task 16 adds the pipeline
// equivalent right below, both built on the same factory; Task 17 will add
// a third for releases.
const mrDismissalContext = createDismissalContext({
  configKey: 'dismissedMRs',
  errorLabel: 'MRs',
  hookName: 'useMRDismissal',
  // index.html:2542-2553 (dismiss) -- awaits the IPC call, then appends the
  // id locally, matching `dismissedMRIds.push(mrId)` exactly (not a re-fetch
  // of config).
  dismiss: (api, id) => api.gitlab.dismissMR(id),
  // index.html:2758-2768 ("Show all") -- awaits the IPC call, then resets
  // the local list to empty, matching `dismissedMRIds = []`.
  restore: (api) => api.gitlab.restoreMRs(),
});

/**
 * `dismissedMRIds`/`dismissMR`/`restoreMRs` are the factory's generic
 * `dismissedIds`/`dismiss`/`restore` under MR-specific names -- kept
 * identical to Task 15's original hand-written shape so
 * `MergeRequestsTab.tsx` (and its tests) don't have to change at all.
 */
export function useMRDismissal(): { dismissedMRIds: number[]; dismissMR: (id: number) => Promise<void>; restoreMRs: () => Promise<void> } {
  const { dismissedIds, dismiss, restore } = mrDismissalContext.useDismissal();
  return { dismissedMRIds: dismissedIds, dismissMR: dismiss, restoreMRs: restore };
}

// index.html:2883, loaded by loadDismissedPipelines at :2885-2894. Same
// reasoning as `mrDismissalContext` above -- MenubarApp's `#pipelineCount`
// badge and PipelinesTab's list both need it (see task-16-report.md for the
// badge fix this mirrors from task-15-report.md's mrCount one).
const pipelineDismissalContext = createDismissalContext({
  configKey: 'dismissedPipelines',
  errorLabel: 'pipelines',
  hookName: 'usePipelineDismissal',
  // index.html:3070-3080 (dismiss) -- `await gitlab.dismissPipeline(id);
  // dismissedPipelineIds.push(id);`.
  dismiss: (api, id) => api.gitlab.dismissPipeline(id),
  // index.html:3082-3092 ("Show all") -- `await gitlab.restorePipelines();
  // dismissedPipelineIds = [];`.
  restore: (api) => api.gitlab.restorePipelines(),
});

export function usePipelineDismissal(): { dismissedPipelineIds: number[]; dismissPipeline: (id: number) => Promise<void>; restorePipelines: () => Promise<void> } {
  const { dismissedIds, dismiss, restore } = pipelineDismissalContext.useDismissal();
  return { dismissedPipelineIds: dismissedIds, dismissPipeline: dismiss, restorePipelines: restore };
}

export function DataProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const [data, setData] = useState<Data>(initialData);

  useEffect(() => {
    let cancelled = false;
    // A pushed event is always more current than the in-flight initial
    // fetch that seeded it (the fetch was issued at mount; a push can only
    // arrive after that). Without this guard, an initial `getMRs`/etc. or
    // `getUntagProjects` call that is still in flight when a push arrives
    // would resolve afterwards and clobber the fresher pushed data with
    // stale data of its own -- not a behaviour index.html exhibits by
    // design, just an artifact of loadData() and the two event handlers all
    // writing the same state without any ordering guarantee. Not present in
    // the vanilla script's own (rare) exposure to the same race.
    let receivedDataPush = false;
    let receivedUntagPush = false;

    // Seeds the initial state the way index.html's loadData() does
    // (index.html:3845-3883 -- the brief's citation of :3795 lands inside
    // the untag-item click handler instead; see task-13-report.md). loadData
    // awaits getMRs/getPipelines/getReleases SEQUENTIALLY (not
    // Promise.all -- that would be a timing/behaviour change), applies them,
    // and only THEN fetches untag data in its own nested try/catch so a
    // failure there doesn't blank the first three lists.
    async function loadData() {
      try {
        const mrs = await api.gitlab.getMRs();
        const pipes = await api.gitlab.getPipelines();
        const rels = await api.gitlab.getReleases();
        if (cancelled || receivedDataPush) return;
        setData((prev) => ({
          ...prev,
          mergeRequests: mrs || [],
          pipelines: pipes || [],
          releases: rels || [],
          lastUpdated: new Date(),
          // index.html:3855 -- flips false in the same synchronous stretch
          // as the three arrays above, before the untag fetch below starts.
          isLoading: false,
        }));

        try {
          const untagData = await api.gitlab.getUntagProjects();
          if (cancelled || receivedUntagPush) return;
          setData((prev) => ({
            ...prev,
            untagProjects: untagData?.untagProjects || [],
            untagExcludedCount: untagData?.excludedCount || 0,
          }));
        } catch (e) {
          // index.html:3867-3869
          console.error('Untag load error:', e);
        }
      } catch (err) {
        // index.html:3873-3875. The source's catch also leaves
        // mergeRequests/pipelines/releases untouched, but it DOES still flip
        // isLoading false (index.html:3875) -- reproduced here; a permanent
        // spinner after a failed initial load would be a behaviour change,
        // not a port.
        console.error('Load error:', err);
        if (cancelled || receivedDataPush) return;
        setData((prev) => ({ ...prev, isLoading: false }));
      }
    }

    // index.html:3914-3923 (checkAccounts), called at startup
    // (index.html:3960) and again on every data:updated push
    // (index.html:3894).
    async function checkAccounts() {
      try {
        const accounts = await api.accounts.getAll();
        if (cancelled) return;
        setData((prev) => ({ ...prev, hasAccounts: !!(accounts && accounts.length > 0) }));
      } catch (err) {
        // index.html:3920-3922
        console.error('Error checking accounts:', err);
        if (cancelled) return;
        setData((prev) => ({ ...prev, hasAccounts: false }));
      }
    }

    void loadData();
    void checkAccounts();

    // Subscribes to all four pushed events per the task-13 brief. Only
    // `dataUpdated` and `untagDataUpdated` have a real consumer in
    // index.html (:3887, :3905) -- `refreshStatus` and `error` are never
    // listened to anywhere in the vanilla app. They are still subscribed
    // here (for correct 4-way subscribe/unsubscribe lifecycle symmetry, per
    // the brief), but intentionally left as no-ops: giving them a made-up
    // effect on `Data` would be a new behaviour, not a port of one, and
    // would break "strict parity, no behaviour changes."
    const unsubDataUpdated = api.on.dataUpdated((payload) => {
      receivedDataPush = true;
      setData((prev) => ({
        ...prev,
        mergeRequests: payload.mergeRequests || [],
        pipelines: payload.pipelines || [],
        releases: payload.releases || [],
        status: payload.status,
        error: payload.error,
        lastUpdated: payload.lastUpdated,
        // index.html:3892
        isLoading: false,
      }));
      // index.html:3894
      void checkAccounts();
    });

    const unsubRefreshStatus = api.on.refreshStatus(() => {
      // Intentional no-op -- see comment above.
    });

    const unsubError = api.on.error(() => {
      // Intentional no-op -- see comment above.
    });

    const unsubUntagDataUpdated = api.on.untagDataUpdated((payload) => {
      receivedUntagPush = true;
      setData((prev) => ({
        ...prev,
        untagProjects: payload?.untagProjects || [],
        untagExcludedCount: payload?.excludedCount || 0,
      }));
    });

    return () => {
      cancelled = true;
      unsubDataUpdated();
      unsubRefreshStatus();
      unsubError();
      unsubUntagDataUpdated();
    };
  }, [api]);

  return (
    <mrDismissalContext.DismissalProvider>
      <pipelineDismissalContext.DismissalProvider>
        <DataContext.Provider value={data}>{children}</DataContext.Provider>
      </pipelineDismissalContext.DismissalProvider>
    </mrDismissalContext.DismissalProvider>
  );
}

export function useData(): Data {
  const data = useContext(DataContext);
  if (!data) throw new Error('useData must be used within a DataProvider');
  return data;
}
