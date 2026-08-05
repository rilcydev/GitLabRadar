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
  // Added in Task 18 (not in the task-13 brief -- found while implementing
  // UntagTab's loading gate, index.html:3726-3731). The vanilla app keeps a
  // SEPARATE `isUntagLoading` module-level variable (index.html:2338) from
  // `isLoading` above: `loadData()` (index.html:3845-3883) resolves
  // getMRs/getPipelines/getReleases FIRST and flips `isLoading` false in
  // that same synchronous stretch, THEN starts a nested fetch for
  // getUntagProjects() and only flips `isUntagLoading` false once THAT
  // settles (success at :3866 or failure at :3869) -- and again on every
  // `untag:dataUpdated` push (:3908), mirroring `isLoading`'s
  // `data:updated` handling at :3892. Reusing the shared `isLoading` flag
  // for UntagTab would flip its spinner off as soon as the first three
  // fetches settle, while `untagProjects` is still the initial `[]` and
  // `untagExcludedCount` is still `0` -- rendering the "All Tagged" empty
  // state for one render (or one whole poll interval, if getUntagProjects
  // is slow) instead of the loading spinner index.html actually shows
  // during that window. See task-18-report.md.
  isUntagLoading: boolean;
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
  isUntagLoading: true,
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
// equivalent right below; Task 17 adds the release one further down (also
// used to fix MenubarApp's `#releaseCount` badge, which mirrors the same
// mrCount/pipelineCount fix Tasks 15/16 made), all three built on the same
// factory.
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

// index.html:3111, loaded by loadDismissedReleases at :3113-3122. The third
// (and last) of the three structurally identical dismissal collections --
// see createDismissalContext.tsx's doc comment. This is the one Task 16's
// comments above flagged as still owed to Task 17.
const releaseDismissalContext = createDismissalContext({
  configKey: 'dismissedReleases',
  errorLabel: 'releases',
  hookName: 'useReleaseDismissal',
  // index.html:3272-3283 (dismiss) -- `await gitlab.dismissRelease(releaseId);
  // dismissedReleaseIds.push(releaseId);`.
  dismiss: (api, id) => api.gitlab.dismissRelease(id),
  // index.html:3285-3295 ("Show all") -- `await gitlab.restoreReleases();
  // dismissedReleaseIds = [];`.
  restore: (api) => api.gitlab.restoreReleases(),
});

export function useReleaseDismissal(): { dismissedReleaseIds: number[]; dismissRelease: (id: number) => Promise<void>; restoreReleases: () => Promise<void> } {
  const { dismissedIds, dismiss, restore } = releaseDismissalContext.useDismissal();
  return { dismissedReleaseIds: dismissedIds, dismissRelease: dismiss, restoreReleases: restore };
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
            // index.html:3866
            isUntagLoading: false,
          }));
        } catch (e) {
          // index.html:3867-3869. The source's catch also flips
          // isUntagLoading false (:3869) even though untagProjects/
          // untagExcludedCount are left untouched -- reproduced here for
          // the same reason the outer catch below still flips isLoading:
          // a permanent untag spinner after a failed fetch would be a
          // behaviour change, not a port.
          console.error('Untag load error:', e);
          if (cancelled || receivedUntagPush) return;
          setData((prev) => ({ ...prev, isUntagLoading: false }));
        }
      } catch (err) {
        // index.html:3873-3876. The source's catch also leaves
        // mergeRequests/pipelines/releases/untagProjects untouched, but it
        // DOES still flip BOTH isLoading (:3875) and isUntagLoading (:3876)
        // -- the untag fetch above is never even reached when getMRs/etc.
        // itself throws, so nothing else would ever clear isUntagLoading in
        // that case. Reproduced here; a permanent spinner after a failed
        // initial load would be a behaviour change, not a port.
        console.error('Load error:', err);
        if (cancelled || receivedDataPush) return;
        setData((prev) => ({
          ...prev,
          isLoading: false,
          // Guarded independently of receivedDataPush: an untag:dataUpdated
          // push (a distinct event) may have already landed and set this
          // false on its own -- this write is then a harmless no-op, not a
          // stale overwrite, since it never touches untagProjects/
          // untagExcludedCount themselves.
          isUntagLoading: receivedUntagPush ? prev.isUntagLoading : false,
        }));
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
        // index.html:3908
        isUntagLoading: false,
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
        <releaseDismissalContext.DismissalProvider>
          <DataContext.Provider value={data}>{children}</DataContext.Provider>
        </releaseDismissalContext.DismissalProvider>
      </pipelineDismissalContext.DismissalProvider>
    </mrDismissalContext.DismissalProvider>
  );
}

export function useData(): Data {
  const data = useContext(DataContext);
  if (!data) throw new Error('useData must be used within a DataProvider');
  return data;
}
