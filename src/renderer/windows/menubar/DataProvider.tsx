import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
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
};

const DataContext = createContext<Data | null>(null);

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
        // index.html:3873-3874. The source's catch also leaves
        // mergeRequests/pipelines/releases untouched -- it only flips local
        // loading flags that have no equivalent field on `Data`.
        console.error('Load error:', err);
      }
    }

    void loadData();

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
      }));
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

  return <DataContext.Provider value={data}>{children}</DataContext.Provider>;
}

export function useData(): Data {
  const data = useContext(DataContext);
  if (!data) throw new Error('useData must be used within a DataProvider');
  return data;
}
