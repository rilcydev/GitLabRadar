import userEvent from '@testing-library/user-event';
import { act, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Release } from '@/shared/types';
// Relative imports: eslint's import/no-unresolved has no TS-aware resolver
// for the `@/*` alias on value imports (see src/test/renderWithApi.tsx and
// src/renderer/api/FakeApi.ts for the same pre-existing gap).
import { renderWithApi } from '../../../test/renderWithApi';
import { DataProvider } from '../../windows/menubar/DataProvider';
import { POView } from './POView';

function renderView(overrides?: Parameters<typeof renderWithApi>[1]) {
  return renderWithApi(
    <DataProvider>
      <POView />
    </DataProvider>,
    overrides
  );
}

let nextId = 1000;

function makeRelease(overrides: Partial<Release> = {}): Release {
  const id = nextId++;
  return {
    id,
    tagName: `v${id}`,
    name: `Release ${id}`,
    description: '',
    releasedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    webUrl: `https://gitlab.example.com/release/${id}`,
    projectId: 100,
    projectName: 'Project',
    projectPath: 'group/project',
    author: { id: 1, username: 'cyril', name: 'Cyril', avatar_url: '' },
    accountId: 'acc-1',
    ...overrides,
  };
}

async function pushReleases(emit: ReturnType<typeof renderView>['emit'], releases: Release[]) {
  await act(async () => {
    emit.dataUpdated({
      mergeRequests: [],
      pipelines: [],
      releases,
      status: 'green',
      lastUpdated: new Date(),
    });
  });
}

describe('POView', () => {
  // index.html:3326,3325,3324/3327 -- ported markup keeps its source ids.
  it('keeps the source ids on the loading, empty, filter and list containers', async () => {
    const { container, emit } = renderView();
    expect(container.querySelector('#po-loading')).not.toBeNull();

    await screen.findByText('No projects configured');
    expect(container.querySelector('#po-empty')).not.toBeNull();

    const release = makeRelease({ projectPath: 'group/has-list' });
    await pushReleases(emit, [release]);
    // Not `screen.findByText('group/has-list')`: that string is ambiguous
    // once the filter `<select>` renders (it appears both as an `<option>`
    // and as the section header `<span>`) -- the release's own tag is
    // unique.
    await screen.findByText(release.tagName);
    expect(container.querySelector('#po-list')).not.toBeNull();
    expect(container.querySelector('#po-filter')).not.toBeNull();
    expect(container.querySelector('#po-project-filter')).not.toBeNull();
  });

  // index.html:3347-3355 -- empty-state copy depends on hasWatchedProjects.
  describe('empty state copy (index.html:3340-3357)', () => {
    it('shows "No projects configured" / "Configure projects" when there are no watched projects', async () => {
      renderView();
      expect(await screen.findByText('No projects configured')).toBeInTheDocument();
      expect(screen.getByText('Add projects in Preferences → Projects to see their releases here.')).toBeInTheDocument();
      expect(screen.getByText('Configure projects')).toBeInTheDocument();
    });

    it('shows "No releases yet" / "Manage projects" when projects are watched but none have releases', async () => {
      renderView({ overrides: { config: { get: async () => [1, 2] as never } } });
      expect(await screen.findByText('No releases yet')).toBeInTheDocument();
      expect(
        screen.getByText("Your followed projects don't have any releases yet, or none have been fetched.")
      ).toBeInTheDocument();
      expect(screen.getByText('Manage projects')).toBeInTheDocument();
    });

    it('calls app.showPreferences() from the empty-state button', async () => {
      const showPreferences = vi.fn().mockResolvedValue(undefined);
      renderView({ overrides: { app: { showPreferences } } });
      await userEvent.click(await screen.findByText('Configure projects'));
      expect(showPreferences).toHaveBeenCalled();
    });
  });

  // index.html:3365 -- same fallback chain as ReleasesTab (:3157).
  // Project path/name text is ambiguous once the filter `<select>` renders
  // (it appears both as an `<option>` and as the section-header `<span>`),
  // so these assertions pass `{ selector: 'span' }` to match only the
  // header, not the option.
  describe('grouping key fallback chain (index.html:3365)', () => {
    it('groups under projectPath when present', async () => {
      const { emit } = renderView();
      await pushReleases(emit, [makeRelease({ projectPath: 'group/has-path', projectName: 'Has Name' })]);
      expect(await screen.findByText('group/has-path', { selector: 'span' })).toBeInTheDocument();
      expect(screen.queryByText('Has Name')).not.toBeInTheDocument();
    });

    it('falls back to projectName when projectPath is empty', async () => {
      const { emit } = renderView();
      await pushReleases(emit, [makeRelease({ projectPath: '', projectName: 'Fallback Name' })]);
      expect(await screen.findByText('Fallback Name', { selector: 'span' })).toBeInTheDocument();
    });

    it("falls back to the literal 'Unknown' when neither projectPath nor projectName is set", async () => {
      const { emit } = renderView();
      await pushReleases(emit, [makeRelease({ projectPath: '', projectName: '', tagName: 'unique-tag-for-po-test' })]);
      await screen.findByText('unique-tag-for-po-test');
      expect(screen.getByText('Unknown', { selector: 'span' })).toBeInTheDocument();
    });
  });

  // index.html:3376 -- sorted, unlike ReleasesTab's own (unsorted) grouping.
  it('sorts project sections alphabetically by path', async () => {
    const { container, emit } = renderView();
    await pushReleases(emit, [
      makeRelease({ projectPath: 'zzz/last-alphabetically', tagName: 'v-z' }),
      makeRelease({ projectPath: 'aaa/first-alphabetically', tagName: 'v-a' }),
    ]);
    await screen.findByText('v-z');
    const names = [...container.querySelectorAll('span')]
      .map((el) => el.textContent)
      .filter((t) => t === 'zzz/last-alphabetically' || t === 'aaa/first-alphabetically');
    expect(names).toEqual(['aaa/first-alphabetically', 'zzz/last-alphabetically']);
  });

  // index.html:renderPOView never references dismissedReleaseIds anywhere.
  it('does NOT filter out dismissed releases (unlike ReleasesTab)', async () => {
    const { emit } = renderView({
      overrides: { config: { getAll: async () => ({ dismissedReleases: [999] }) as never } },
    });
    await pushReleases(emit, [makeRelease({ id: 999, projectPath: 'group/still-shown', tagName: 'v-still-shown' })]);
    expect(await screen.findByText('v-still-shown')).toBeInTheDocument();
  });

  // index.html:3382-3390
  it('narrows sections to the selected project when the filter changes', async () => {
    const { emit } = renderView();
    await pushReleases(emit, [
      makeRelease({ projectPath: 'group/alpha', tagName: 'v-alpha' }),
      makeRelease({ projectPath: 'group/beta', tagName: 'v-beta' }),
    ]);
    await screen.findByText('v-alpha');
    expect(screen.getByText('group/beta', { selector: 'span' })).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByRole('combobox'), 'group/alpha');

    expect(screen.getByText('group/alpha', { selector: 'span' })).toBeInTheDocument();
    expect(screen.queryByText('group/beta', { selector: 'span' })).not.toBeInTheDocument();
  });

  // index.html:3533-3548 -- `renderPORelease` is called with a
  // `deploymentStatusTexts` argument but never actually reads it; only
  // `deploymentIcons` is used. Discrepancy from the brief's framing (which
  // reads as though PO release badges show the same status word ReleasesTab's
  // do) -- pinned here so a "helpful" fix doesn't silently add one back.
  it('does NOT show a deployment status word (e.g. "Deployed") on PO release badges, unlike ReleasesTab', async () => {
    const { emit } = renderView();
    await pushReleases(emit, [
      makeRelease({
        projectPath: 'group/no-status-word',
        tagName: 'v-no-status-word',
        deployments: [{ id: 1, status: 'success', environment: 'production', webUrl: '' }],
      }),
    ]);
    await screen.findByText('v-no-status-word');
    expect(screen.getByText('production')).toBeInTheDocument();
    expect(screen.queryByText('Deployed')).not.toBeInTheDocument();
  });

  // index.html:3443-3447
  it('opens the release externally with its webUrl when the item is clicked', async () => {
    const openExternal = vi.fn().mockResolvedValue(undefined);
    const { emit } = renderView({ overrides: { app: { openExternal } } });
    const release = makeRelease({
      projectPath: 'group/click-me',
      tagName: 'v-click',
      webUrl: 'https://gitlab.example.com/release/42',
    });
    await pushReleases(emit, [release]);
    await userEvent.click(await screen.findByText('v-click'));

    expect(openExternal).toHaveBeenCalledWith('https://gitlab.example.com/release/42');
  });

  // index.html:3550-3554,3452-3453 -- per-row expand/collapse.
  describe('description expand/collapse', () => {
    it('shows no toggle when the release has no description', async () => {
      const { emit } = renderView();
      const release = makeRelease({ projectPath: 'group/no-desc', description: '' });
      await pushReleases(emit, [release]);
      await screen.findByText(release.tagName);
      expect(screen.queryByText('Show more')).not.toBeInTheDocument();
    });

    it('toggles "Show more"/"Show less" without opening the release', async () => {
      const openExternal = vi.fn().mockResolvedValue(undefined);
      const { emit } = renderView({ overrides: { app: { openExternal } } });
      await pushReleases(emit, [
        makeRelease({ projectPath: 'group/desc', tagName: 'v-desc', description: 'Hello world' }),
      ]);
      await screen.findByText('v-desc');

      await userEvent.click(screen.getByText('Show more'));
      expect(screen.getByText('Show less')).toBeInTheDocument();
      expect(openExternal).not.toHaveBeenCalled();

      await userEvent.click(screen.getByText('Show less'));
      expect(screen.getByText('Show more')).toBeInTheDocument();
    });

    it('expands/collapses each release independently', async () => {
      const { emit } = renderView();
      await pushReleases(emit, [
        makeRelease({ projectPath: 'group/multi', tagName: 'v-multi-a', description: 'Description A' }),
        makeRelease({ projectPath: 'group/multi', tagName: 'v-multi-b', description: 'Description B' }),
      ]);
      await screen.findByText('v-multi-a');
      const toggles = screen.getAllByText('Show more');
      expect(toggles).toHaveLength(2);

      await userEvent.click(toggles[0]);
      expect(screen.getAllByText('Show more')).toHaveLength(1);
      expect(screen.getByText('Show less')).toBeInTheDocument();
    });
  });

  // index.html:3462-3530 -- pagination.
  describe('pagination ("Load more releases")', () => {
    function pageOfReleases(count: number, prefix: string): Release[] {
      return Array.from({ length: count }, (_, i) => makeRelease({ tagName: `${prefix}-${i}` }));
    }

    it('calls getPOReleases with the project id, page 2, and perPage 5 on the first click, and appends results', async () => {
      const getPOReleases = vi.fn().mockResolvedValueOnce(pageOfReleases(5, 'page2'));
      const { emit } = renderView({ overrides: { gitlab: { getPOReleases } } });
      const release = makeRelease({ projectId: 55, projectPath: 'group/paginated', tagName: 'v-page1' });
      await pushReleases(emit, [release]);
      await screen.findByText('v-page1');

      await userEvent.click(screen.getByText('Load more releases'));

      expect(getPOReleases).toHaveBeenCalledWith(55, 2, 5);
      await screen.findByText('page2-0');
      expect(screen.getByText('page2-4')).toBeInTheDocument();
      // index.html:3508-3514 -- the count updates to include the loaded items.
      expect(screen.getByText('6 releases')).toBeInTheDocument();
    });

    it('disables the button and shows "Loading..." while a page is in flight', async () => {
      let resolveFetch!: (v: Release[]) => void;
      const getPOReleases = vi.fn(
        () =>
          new Promise<Release[]>((resolve) => {
            resolveFetch = resolve;
          })
      );
      const { emit } = renderView({ overrides: { gitlab: { getPOReleases } } });
      await pushReleases(emit, [makeRelease({ projectId: 1, projectPath: 'group/loading', tagName: 'v1' })]);
      await screen.findByText('v1');

      await userEvent.click(screen.getByText('Load more releases'));

      const btn = screen.getByText('Loading...');
      expect(btn.closest('button')).toBeDisabled();

      await act(async () => {
        resolveFetch([]);
      });
    });

    it('hides "Load more releases" once fewer than perPage results are returned', async () => {
      const getPOReleases = vi.fn().mockResolvedValueOnce(pageOfReleases(2, 'tail'));
      const { emit } = renderView({ overrides: { gitlab: { getPOReleases } } });
      await pushReleases(emit, [makeRelease({ projectId: 9, projectPath: 'group/exhausted', tagName: 'v-exh' })]);
      await screen.findByText('v-exh');

      await userEvent.click(screen.getByText('Load more releases'));
      await screen.findByText('tail-0');

      expect(screen.queryByText('Load more releases')).not.toBeInTheDocument();
    });

    it('re-enables the button with its default text after a failed fetch', async () => {
      const getPOReleases = vi.fn().mockRejectedValueOnce(new Error('network error'));
      const { emit } = renderView({ overrides: { gitlab: { getPOReleases } } });
      await pushReleases(emit, [makeRelease({ projectId: 3, projectPath: 'group/fails', tagName: 'v-fails' })]);
      await screen.findByText('v-fails');

      await userEvent.click(screen.getByText('Load more releases'));

      await waitFor(() => {
        const btn = screen.getByText('Load more releases').closest('button');
        expect(btn).not.toBeDisabled();
      });
    });

    // Preserved-bug pin: index.html appends "Load more" results directly
    // into the DOM (:3504-3506), never into the `releases` array, so the
    // NEXT full renderPOView() (any data refresh) silently discards them,
    // rebuilding purely from `releases` again -- but `poReleasesPages`
    // (:2335) is a module-level counter that is NEVER reset anywhere in the
    // source. The visible list reverts to page 1's worth of items, but the
    // counter itself does not: the NEXT "Load more" click resumes from
    // wherever it left off and silently skips the page(s) the refresh just
    // discarded. Reproduced deliberately, not fixed -- see POView.tsx's
    // `pages` state doc comment.
    it('preserved bug: a data refresh after "Load more" discards the extra page visually but not the page counter, so the next click skips a page', async () => {
      const getPOReleases = vi.fn().mockResolvedValueOnce(pageOfReleases(5, 'page2'));
      const { emit } = renderView({ overrides: { gitlab: { getPOReleases } } });
      const release = makeRelease({ projectId: 77, projectPath: 'group/quirk', tagName: 'v-quirk-1' });
      await pushReleases(emit, [release]);
      await screen.findByText('v-quirk-1');

      await userEvent.click(screen.getByText('Load more releases'));
      expect(getPOReleases).toHaveBeenCalledWith(77, 2, 5);
      await screen.findByText('page2-0');

      // An unrelated data refresh (same release, new array reference) wipes
      // the loaded page-2 items back out of the visible list.
      await pushReleases(emit, [release]);
      await waitFor(() => expect(screen.queryByText('page2-0')).not.toBeInTheDocument());

      // The next "Load more" click resumes from page 3, not page 2 -- the
      // counter never rewound even though the visible list did.
      getPOReleases.mockResolvedValueOnce([]);
      await userEvent.click(screen.getByText('Load more releases'));
      expect(getPOReleases).toHaveBeenLastCalledWith(77, 3, 5);
    });
  });
});
