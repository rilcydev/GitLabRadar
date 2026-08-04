import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { TrayStatus } from '@/shared/api/contract';
import type { MergeRequest, Pipeline, Release, UntagProject } from '@/shared/types';
// Relative import: eslint's import/no-unresolved has no TS-aware resolver
// for the `@/*` alias on value imports (see src/test/renderWithApi.tsx and
// src/renderer/api/FakeApi.ts for the same pre-existing gap).
import { useApi } from '../../api/ApiContext';

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

// Added in Task 15. index.html keeps `dismissedMRIds` as a single
// module-level array (index.html:2334, loaded by loadDismissedMRs at
// :2443-2452) that BOTH the mrCount badge computation (index.html:2463-2466)
// and renderMRs' own filtering/list (index.html:2463,2542-2553,2758-2768)
// read and mutate directly, since they are the same script scope. In React,
// MenubarApp (the badge) and MergeRequestsTab (the list) are siblings, not
// parent/child, so that shared mutable array has to live somewhere both can
// reach -- DataProvider, the nearest common ancestor already wrapping both
// in main.tsx, is that place. Deliberately a SEPARATE context from
// `DataContext` (not folded into `Data`) so `useData()`'s contract stays
// pure data with no mutator functions mixed in.
interface MRDismissalContextValue {
  dismissedMRIds: number[];
  // index.html:2542-2553 (dismiss) -- awaits the IPC call, then appends
  // the id locally, matching `dismissedMRIds.push(mrId)` exactly (not a
  // re-fetch of config).
  dismissMR: (id: number) => Promise<void>;
  // index.html:2758-2768 ("Show all") -- awaits the IPC call, then resets
  // the local list to empty, matching `dismissedMRIds = []`.
  restoreMRs: () => Promise<void>;
}

const MRDismissalContext = createContext<MRDismissalContextValue | null>(null);

export function useMRDismissal(): MRDismissalContextValue {
  const ctx = useContext(MRDismissalContext);
  if (!ctx) throw new Error('useMRDismissal must be used within a DataProvider');
  return ctx;
}

export function DataProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const [data, setData] = useState<Data>(initialData);
  const [dismissedMRIds, setDismissedMRIds] = useState<number[]>([]);

  // index.html:2443-2452 (loadDismissedMRs), invoked as part of init()'s
  // Promise.all (index.html:3961-3967) -- independent of loadData's own
  // fetch, so it gets its own effect rather than being folded into the one
  // below.
  useEffect(() => {
    let cancelled = false;
    async function loadDismissedMRs() {
      try {
        const config = await api.config.getAll();
        if (cancelled) return;
        setDismissedMRIds(config.dismissedMRs || []);
      } catch (err) {
        // index.html:2449-2450
        console.error('Error loading dismissed MRs:', err);
      }
    }
    void loadDismissedMRs();
    return () => {
      cancelled = true;
    };
  }, [api]);

  const dismissMR = useCallback(
    async (id: number) => {
      await api.gitlab.dismissMR(id);
      setDismissedMRIds((prev) => [...prev, id]);
    },
    [api]
  );

  const restoreMRs = useCallback(async () => {
    await api.gitlab.restoreMRs();
    setDismissedMRIds([]);
  }, [api]);

  const mrDismissal = useMemo<MRDismissalContextValue>(
    () => ({ dismissedMRIds, dismissMR, restoreMRs }),
    [dismissedMRIds, dismissMR, restoreMRs]
  );

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
    <MRDismissalContext.Provider value={mrDismissal}>
      <DataContext.Provider value={data}>{children}</DataContext.Provider>
    </MRDismissalContext.Provider>
  );
}

export function useData(): Data {
  const data = useContext(DataContext);
  if (!data) throw new Error('useData must be used within a DataProvider');
  return data;
}
