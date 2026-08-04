import { act, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { GitLabAccount, MergeRequest, Pipeline, Release, UntagProject } from '@/shared/types';
import { renderWithApi } from '../../../test/renderWithApi';
import { createFakeApi } from '../../api/FakeApi';
import { DataProvider, useData } from './DataProvider';

// Reads the whole useData() shape into the DOM so tests can assert on it
// without reaching into React internals. Mirrors the badge ids the source
// app uses (index.html:2212,2216,2220,2224) plus lastUpdated/status/error,
// which have no DOM element in the vanilla app but are part of the
// DataProvider contract this task adds.
function Probe() {
  const data = useData();
  return (
    <div>
      <span data-testid="mr-count">{data.mergeRequests.length}</span>
      <span data-testid="pipeline-count">{data.pipelines.length}</span>
      <span data-testid="release-count">{data.releases.length}</span>
      <span data-testid="untag-count">{data.untagProjects.length}</span>
      <span data-testid="untag-excluded-count">{data.untagExcludedCount}</span>
      <span data-testid="status">{data.status ?? 'null'}</span>
      <span data-testid="error">{data.error ?? 'none'}</span>
      <span data-testid="last-updated">
        {data.lastUpdated ? data.lastUpdated.toISOString() : 'null'}
      </span>
      <span data-testid="is-loading">{String(data.isLoading)}</span>
      <span data-testid="has-accounts">{String(data.hasAccounts)}</span>
    </div>
  );
}

describe('DataProvider', () => {
  it('seeds initial state from gitlab.getMRs/getPipelines/getReleases/getUntagProjects', async () => {
    const mr = { id: 1 } as unknown as MergeRequest;
    const pipeline = { id: 2 } as unknown as Pipeline;
    const release = { id: 3 } as unknown as Release;
    const untagProject = { projectId: 4 } as unknown as UntagProject;

    renderWithApi(
      <DataProvider>
        <Probe />
      </DataProvider>,
      {
        overrides: {
          gitlab: {
            getMRs: async () => [mr],
            getPipelines: async () => [pipeline],
            getReleases: async () => [release],
            getUntagProjects: async () => ({
              untagProjects: [untagProject],
              excludedCount: 5,
              lastUpdated: new Date('2026-08-04T10:00:00Z'),
            }),
          },
        },
      }
    );

    expect(await screen.findByTestId('mr-count')).toHaveTextContent('1');
    expect(screen.getByTestId('pipeline-count')).toHaveTextContent('1');
    expect(screen.getByTestId('release-count')).toHaveTextContent('1');
    // Untag data is fetched in a second, nested step after the first three
    // resolve (index.html:3845-3871) -- wait for it separately.
    expect(await screen.findByTestId('untag-count')).toHaveTextContent('1');
    // Fix round 1: untagExcludedCount must be populated on the initial-load
    // path exactly like untagProjects is, not just on the push path.
    expect(screen.getByTestId('untag-excluded-count')).toHaveTextContent('5');
  });

  it('starts with empty collections and a null lastUpdated before anything resolves', async () => {
    renderWithApi(
      <DataProvider>
        <Probe />
      </DataProvider>,
      { overrides: { gitlab: { getMRs: () => new Promise(() => {}) } } }
    );

    expect(screen.getByTestId('mr-count')).toHaveTextContent('0');
    expect(screen.getByTestId('pipeline-count')).toHaveTextContent('0');
    expect(screen.getByTestId('release-count')).toHaveTextContent('0');
    expect(screen.getByTestId('untag-count')).toHaveTextContent('0');
    expect(screen.getByTestId('untag-excluded-count')).toHaveTextContent('0');
    expect(screen.getByTestId('last-updated')).toHaveTextContent('null');
    // index.html:2331 -- `isLoading` only flips false once loadData()
    // settles; here getMRs() never resolves, so the whole sequential
    // await chain (getMRs -> getPipelines -> getReleases) never proceeds.
    expect(screen.getByTestId('is-loading')).toHaveTextContent('true');

    // Drains checkAccounts()'s independent (non-blocked) fetch so its
    // setState doesn't leak an act() warning into the next test.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  });

  it('replaces its data when data:updated arrives', async () => {
    const { emit } = renderWithApi(
      <DataProvider>
        <Probe />
      </DataProvider>
    );

    // lastUpdated is a Date, NOT a string. Electron delivers PolledData by
    // structured clone, so the renderer receives a live Date object. Typing
    // or faking it as a string makes the test pass against a shape the app
    // never actually sees.
    act(() =>
      emit.dataUpdated({
        mergeRequests: [{ id: 1 } as unknown as MergeRequest],
        pipelines: [],
        releases: [],
        status: 'green',
        lastUpdated: new Date('2026-08-04T12:00:00Z'),
      })
    );

    expect(await screen.findByTestId('mr-count')).toHaveTextContent('1');
    expect(screen.getByTestId('status')).toHaveTextContent('green');
    expect(screen.getByTestId('last-updated')).toHaveTextContent('2026-08-04T12:00:00.000Z');
  });

  it('carries the optional error field from data:updated', async () => {
    const { emit } = renderWithApi(
      <DataProvider>
        <Probe />
      </DataProvider>
    );

    act(() =>
      emit.dataUpdated({
        mergeRequests: [],
        pipelines: [],
        releases: [],
        status: 'red',
        lastUpdated: new Date('2026-08-04T12:00:00Z'),
        error: 'Network error',
      })
    );

    // Awaited (see the untag:dataUpdated test above) so the in-flight
    // initial loadData() fetch settles before the test ends.
    expect(await screen.findByTestId('error')).toHaveTextContent('Network error');
  });

  it('replaces untagProjects when untag:dataUpdated arrives', async () => {
    const { emit } = renderWithApi(
      <DataProvider>
        <Probe />
      </DataProvider>
    );

    act(() =>
      emit.untagDataUpdated({
        untagProjects: [{ projectId: 1 } as unknown as UntagProject, { projectId: 2 } as unknown as UntagProject],
        excludedCount: 3,
        lastUpdated: new Date('2026-08-04T12:00:00Z'),
      })
    );

    // Awaiting here (rather than a synchronous getByTestId) also lets the
    // in-flight initial loadData() fetch settle before the test ends, so its
    // background setData doesn't leak an act() warning into the next test.
    expect(await screen.findByTestId('untag-count')).toHaveTextContent('2');
    // Fix round 1: untagExcludedCount must be populated on the push path
    // exactly like untagProjects is, not just on the initial-load path.
    expect(screen.getByTestId('untag-excluded-count')).toHaveTextContent('3');
  });

  it('unsubscribes all four events on unmount: no throw, no leaked state update', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { emit, unmount } = renderWithApi(
      <DataProvider>
        <Probe />
      </DataProvider>
    );

    unmount();

    // Firing every one of the four pushed events at an unmounted provider
    // must be a silent no-op: no throw, and -- because React 18 logs an
    // act() warning via console.error when a fiber outside the current tree
    // is updated from a leaked subscription -- no console.error either.
    expect(() => {
      emit.dataUpdated({
        mergeRequests: [{ id: 1 } as unknown as MergeRequest],
        pipelines: [],
        releases: [],
        status: 'green',
        lastUpdated: new Date(),
      });
      emit.refreshStatus('refreshing');
      emit.error('boom');
      emit.untagDataUpdated({
        untagProjects: [{ projectId: 1 } as unknown as UntagProject],
        excludedCount: 0,
        lastUpdated: new Date(),
      });
    }).not.toThrow();

    // Also drains the initial (pre-unmount) checkAccounts()/loadData()
    // calls, whose `cancelled` guard should make their eventual resolution
    // a no-op -- draining here (before restoring the spy / ending the
    // test) is what actually proves that, rather than letting them resolve
    // silently after the mock is restored and misattributing any leak to
    // whichever test happens to be running next.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('leaves the shared event bus clean for a fresh mount after unmount', async () => {
    // Reuses ONE fake (and therefore one underlying event bus) across two
    // mount/unmount cycles. If the first DataProvider's subscription had
    // leaked, the bus would carry two live listeners into the second
    // mount, and the console.error spy below (React's act() warning fires
    // for updates to fibers outside the currently rendered tree) would
    // catch the leaked listener reacting to the second mount's own events.
    const { api, emit } = createFakeApi();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const first = renderWithApi(
      <DataProvider>
        <Probe />
      </DataProvider>,
      { fake: { api, emit } }
    );
    first.unmount();

    renderWithApi(
      <DataProvider>
        <Probe />
      </DataProvider>,
      { fake: { api, emit } }
    );

    // Drains both mounts' independent checkAccounts() fetches (the first
    // one's is cancelled and a no-op; the second one's is not) before
    // asserting on `consoleError`, so neither leaks an act() warning here.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    act(() => {
      emit.dataUpdated({
        mergeRequests: [{ id: 1 } as unknown as MergeRequest],
        pipelines: [],
        releases: [],
        status: 'green',
        lastUpdated: new Date('2026-08-04T12:00:00Z'),
      });
    });

    // index.html:3894: the `data:updated` handler itself kicks off ANOTHER
    // (unawaited) checkAccounts() call -- drain that one too before
    // asserting, for the same reason as above.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(screen.getByTestId('mr-count')).toHaveTextContent('1');
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  // Added in Task 15 -- see DataProvider.tsx's `isLoading`/`hasAccounts`
  // doc comments for why these exist.
  it('isLoading flips false once the initial load resolves', async () => {
    renderWithApi(
      <DataProvider>
        <Probe />
      </DataProvider>
    );

    expect(screen.getByTestId('is-loading')).toHaveTextContent('true');
    await waitFor(() => expect(screen.getByTestId('is-loading')).toHaveTextContent('false'));
  });

  // index.html:3873-3875 -- the source flips `isLoading` false in BOTH the
  // success and failure branches of loadData(); a permanently-stuck
  // loading spinner after a failed initial fetch would be a behaviour
  // change, not a port.
  it('isLoading flips false even when the initial load fails', async () => {
    renderWithApi(
      <DataProvider>
        <Probe />
      </DataProvider>,
      { overrides: { gitlab: { getMRs: async () => { throw new Error('boom'); } } } }
    );

    await waitFor(() => expect(screen.getByTestId('is-loading')).toHaveTextContent('false'));
    // index.html:3873-3874: mergeRequests/pipelines/releases are left
    // untouched by the failure path.
    expect(screen.getByTestId('mr-count')).toHaveTextContent('0');
  });

  // index.html:3914-3923,3960
  it('hasAccounts follows accounts.getAll() at startup', async () => {
    renderWithApi(
      <DataProvider>
        <Probe />
      </DataProvider>,
      { overrides: { accounts: { getAll: async () => [{ id: 'a1' } as never] } } }
    );

    expect(screen.getByTestId('has-accounts')).toHaveTextContent('false');
    expect(await screen.findByTestId('has-accounts')).toHaveTextContent('true');
  });

  // index.html:3894 -- checkAccounts() re-runs on every data:updated push.
  it('hasAccounts re-checks accounts.getAll() on every data:updated push', async () => {
    let accounts: GitLabAccount[] = [];
    const { emit } = renderWithApi(
      <DataProvider>
        <Probe />
      </DataProvider>,
      { overrides: { accounts: { getAll: async () => accounts } } }
    );

    expect(await screen.findByTestId('has-accounts')).toHaveTextContent('false');

    accounts = [{ id: 'a1' } as GitLabAccount];
    act(() =>
      emit.dataUpdated({
        mergeRequests: [],
        pipelines: [],
        releases: [],
        status: 'green',
        lastUpdated: new Date('2026-08-04T12:00:00Z'),
      })
    );

    expect(await screen.findByTestId('has-accounts')).toHaveTextContent('true');
  });
});
