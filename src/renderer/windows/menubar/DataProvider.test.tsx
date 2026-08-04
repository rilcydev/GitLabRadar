import { act, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MergeRequest, Pipeline, Release, UntagProject } from '@/shared/types';
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
      <span data-testid="status">{data.status ?? 'null'}</span>
      <span data-testid="error">{data.error ?? 'none'}</span>
      <span data-testid="last-updated">
        {data.lastUpdated ? data.lastUpdated.toISOString() : 'null'}
      </span>
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
              excludedCount: 0,
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
  });

  it('starts with empty collections and a null lastUpdated before anything resolves', () => {
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
    expect(screen.getByTestId('last-updated')).toHaveTextContent('null');
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
  });

  it('unsubscribes all four events on unmount: no throw, no leaked state update', () => {
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

    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('leaves the shared event bus clean for a fresh mount after unmount', () => {
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

    act(() => {
      emit.dataUpdated({
        mergeRequests: [{ id: 1 } as unknown as MergeRequest],
        pipelines: [],
        releases: [],
        status: 'green',
        lastUpdated: new Date('2026-08-04T12:00:00Z'),
      });
    });

    expect(screen.getByTestId('mr-count')).toHaveTextContent('1');
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
