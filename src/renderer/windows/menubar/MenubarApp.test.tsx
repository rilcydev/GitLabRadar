import userEvent from '@testing-library/user-event';
import { act, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MergeRequest, Pipeline, Release, UntagProject } from '@/shared/types';
import { renderWithApi } from '../../../test/renderWithApi';
import { DataProvider } from './DataProvider';
import { MenubarApp } from './MenubarApp';
import styles from './MenubarApp.module.css';

// MenubarApp reads useData() via a DataProvider ancestor -- there is no
// standalone default, so every render here goes through the same
// <DataProvider><MenubarApp /></DataProvider> composition Task 19 will wire
// up in main.tsx.
function renderMenubar(overrides?: Parameters<typeof renderWithApi>[1]) {
  return renderWithApi(
    <DataProvider>
      <MenubarApp />
    </DataProvider>,
    overrides
  );
}

describe('MenubarApp', () => {
  it('renders the header title verbatim', async () => {
    renderMenubar();
    expect(screen.getByText('GitLabRadar')).toBeInTheDocument();
    // See the note in 'opens on the MRs tab' below.
    await screen.findByTestId('mr-count');
  });

  it('renders the four tabs with their verbatim labels', async () => {
    renderMenubar();
    expect(screen.getByText('MRs')).toBeInTheDocument();
    expect(screen.getByText('Pipelines')).toBeInTheDocument();
    expect(screen.getByText('Releases')).toBeInTheDocument();
    expect(screen.getByText('Untag')).toBeInTheDocument();
    await screen.findByTestId('mr-count');
  });

  // index.html:376-383 keeps all four `.tab-content` panes mounted at all
  // times and toggles only the `.active` class (`display: none` <->
  // `block`) -- see the comment above the four #…-content divs in
  // MenubarApp.tsx. All four ids must therefore always be present; only
  // which one carries `tabContentActive` should change.
  it('opens on the MRs tab: all four panes mounted, only #mrs-content active', async () => {
    const { container } = renderMenubar();
    expect(container.querySelector('#mrs-content')).not.toBeNull();
    expect(container.querySelector('#pipelines-content')).not.toBeNull();
    expect(container.querySelector('#releases-content')).not.toBeNull();
    expect(container.querySelector('#untag-content')).not.toBeNull();

    expect(container.querySelector('#mrs-content')).toHaveClass(styles.tabContentActive);
    expect(container.querySelector('#pipelines-content')).not.toHaveClass(styles.tabContentActive);

    // Awaited so DataProvider's in-flight initial loadData() fetch settles
    // before the test ends, rather than leaking an act() warning into
    // whichever test runs next.
    await screen.findByTestId('mr-count');
  });

  it('switches the active pane on tab click without unmounting the others', async () => {
    const { container } = renderMenubar();
    await userEvent.click(screen.getByText('Pipelines'));

    expect(container.querySelector('#pipelines-content')).toHaveClass(styles.tabContentActive);
    expect(container.querySelector('#mrs-content')).not.toHaveClass(styles.tabContentActive);
    // Still mounted, just inactive -- this is the whole point of the guard.
    expect(container.querySelector('#mrs-content')).not.toBeNull();
  });

  // Fix round 1: the badge/refresh-button/header-subtitle ids
  // (index.html:2212,2216,2220,2224,2197,2195) were dropped in favor of
  // data-testid-only lookups. Ported markup keeps its identity attributes;
  // data-testid is additive, not a replacement.
  it('keeps the literal source ids on the badges, refresh button, and header subtitle', async () => {
    const { container } = renderMenubar();
    expect(container.querySelector('#mrCount')).not.toBeNull();
    expect(container.querySelector('#pipelineCount')).not.toBeNull();
    expect(container.querySelector('#releaseCount')).not.toBeNull();
    expect(container.querySelector('#untagCount')).not.toBeNull();
    expect(container.querySelector('#refreshBtn')).not.toBeNull();
    expect(container.querySelector('#headerSubtitle')).not.toBeNull();
    await screen.findByTestId('mr-count');
  });

  it('badge counts follow useData(), all starting at 0', async () => {
    renderMenubar();
    expect(screen.getByTestId('mr-count')).toHaveTextContent('0');
    expect(screen.getByTestId('pipeline-count')).toHaveTextContent('0');
    expect(screen.getByTestId('release-count')).toHaveTextContent('0');
    expect(screen.getByTestId('untag-count')).toHaveTextContent('0');
    // See the note in 'opens on the MRs tab' above.
    await screen.findByTestId('mr-count');
  });

  it('badge counts update when data:updated and untag:dataUpdated arrive', async () => {
    const { emit } = renderMenubar();

    act(() =>
      emit.dataUpdated({
        mergeRequests: [{ id: 1 } as unknown as MergeRequest, { id: 2 } as unknown as MergeRequest],
        pipelines: [{ id: 1 } as unknown as Pipeline],
        releases: [{ id: 1 } as unknown as Release],
        status: 'green',
        lastUpdated: new Date('2026-08-04T12:00:00Z'),
      })
    );
    act(() =>
      emit.untagDataUpdated({
        untagProjects: [{ projectId: 1 } as unknown as UntagProject],
        excludedCount: 0,
        lastUpdated: new Date('2026-08-04T12:00:00Z'),
      })
    );

    expect(await screen.findByTestId('mr-count')).toHaveTextContent('2');
    expect(screen.getByTestId('pipeline-count')).toHaveTextContent('1');
    expect(screen.getByTestId('release-count')).toHaveTextContent('1');
    expect(screen.getByTestId('untag-count')).toHaveTextContent('1');
  });

  // Fix (Task 15): index.html:2463-2466 computes `#mrCount` from
  // `visibleMRs.length` (dismissed ids filtered out), not the raw
  // `mergeRequests` collection -- this badge used to use the raw length.
  // Proven end-to-end here (not just by reading DataProvider's state)
  // because the badge and the MRs tab share the same `dismissedMRIds` via
  // `useMRDismissal`, and this is the only place both are visible at once.
  it('the mrCount badge excludes a dismissed MR immediately after dismissal', async () => {
    const mr = (id: number) =>
      ({
        id,
        iid: id,
        title: `MR ${id}`,
        description: '',
        webUrl: `https://gitlab.example.com/mr/${id}`,
        projectId: 100,
        projectName: 'Project',
        projectPath: 'group/project',
        author: { id: 1, username: 'cyril', name: 'Cyril', avatar_url: '' },
        userRole: 'author',
        accountId: 'acc-1',
        state: 'opened',
        draft: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        sourceBranch: 'feature/x',
        targetBranch: 'main',
        mergeStatus: 'can_be_merged',
        hasConflicts: false,
        reviewers: [],
        assignees: [],
        userNotesCount: 0,
        userMentionedInNotes: false,
      }) as unknown as MergeRequest;

    const dismissMR = vi.fn().mockResolvedValue(undefined);
    const { emit } = renderMenubar({ overrides: { gitlab: { dismissMR } } });

    act(() =>
      emit.dataUpdated({
        mergeRequests: [mr(1), mr(2)],
        pipelines: [],
        releases: [],
        status: 'green',
        lastUpdated: new Date('2026-08-04T12:00:00Z'),
      })
    );

    expect(await screen.findByTestId('mr-count')).toHaveTextContent('2');

    await userEvent.click(screen.getAllByTitle('Hide this MR')[0]);

    expect(dismissMR).toHaveBeenCalledWith(1);
    await waitFor(() => expect(screen.getByTestId('mr-count')).toHaveTextContent('1'));
  });

  // Fix (Task 16, mirroring Task 15's mrCount fix): index.html:2902-2905
  // computes `#pipelineCount` from `visiblePipelines.length` (dismissed ids
  // filtered out), not the raw `pipelines` collection -- this badge used to
  // use the raw length. Proven end-to-end here for the same reason as the
  // mrCount test above: the badge and the Pipelines tab share
  // `dismissedPipelineIds` via `usePipelineDismissal`.
  it('the pipelineCount badge excludes a dismissed pipeline immediately after dismissal', async () => {
    const pipeline = (id: number) =>
      ({
        id,
        status: 'success',
        ref: 'main',
        sha: 'abc123',
        webUrl: `https://gitlab.example.com/pipelines/${id}`,
        projectId: 100,
        projectName: 'Project',
        projectPath: 'group/project',
        accountId: 'acc-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        source: 'push',
      }) as unknown as Pipeline;

    const dismissPipeline = vi.fn().mockResolvedValue(undefined);
    const { emit } = renderMenubar({ overrides: { gitlab: { dismissPipeline } } });

    act(() =>
      emit.dataUpdated({
        mergeRequests: [],
        pipelines: [pipeline(1), pipeline(2)],
        releases: [],
        status: 'green',
        lastUpdated: new Date('2026-08-04T12:00:00Z'),
      })
    );

    expect(await screen.findByTestId('pipeline-count')).toHaveTextContent('2');

    await userEvent.click(screen.getByText('Pipelines'));
    await userEvent.click(screen.getAllByTitle('Hide this pipeline')[0]);

    expect(dismissPipeline).toHaveBeenCalledWith(1);
    await waitFor(() => expect(screen.getByTestId('pipeline-count')).toHaveTextContent('1'));
  });

  it('shows "No activity" in the header subtitle when every dataset is empty', async () => {
    renderMenubar();
    expect(screen.getByText('No activity')).toBeInTheDocument();
    // See the note in 'opens on the MRs tab' above.
    await screen.findByTestId('mr-count');
  });

  it('summarizes non-empty datasets in the header subtitle, singular vs plural', async () => {
    const { emit } = renderMenubar();

    act(() =>
      emit.dataUpdated({
        mergeRequests: [{ id: 1 } as unknown as MergeRequest],
        pipelines: [{ id: 1 } as unknown as Pipeline, { id: 2 } as unknown as Pipeline],
        releases: [],
        status: 'green',
        lastUpdated: new Date('2026-08-04T12:00:00Z'),
      })
    );

    // index.html:2432-2436: "1 MR • 2 pipelines" -- singular MR, plural
    // pipelines, no releases/untag segment since both are 0.
    expect(await screen.findByText('1 MR • 2 pipelines')).toBeInTheDocument();
  });

  it('calls gitlab.refresh() when the refresh button is clicked', async () => {
    let refreshCalled = false;
    const { container } = renderMenubar({
      overrides: { gitlab: { refresh: async () => { refreshCalled = true; } } },
    });

    const refreshBtn = container.querySelector('#refreshBtn');
    expect(refreshBtn).not.toBeNull();
    await userEvent.click(refreshBtn as HTMLElement);

    expect(refreshCalled).toBe(true);
  });

  // Fix round 1 (Task 17): the tabs bar used to be entirely UNMOUNTED in
  // product-owner mode (a JSX conditional wrapping tabs + panes together).
  // index.html:3305 only ever toggles `tabsBar.style.display`, never
  // removes it from the DOM -- so the ported version keeps it mounted too
  // (MenubarApp.tsx's `tabsDisplay`) and this test now asserts the
  // observable (hidden via `display: none`, not absent) outcome instead of
  // absence from the document.
  it('hides (but keeps mounted) the tab strip and activates the po-content pane in product-owner view mode, without adding a fifth tab', async () => {
    const { container } = renderMenubar({
      overrides: { config: { get: async () => 'productOwner' as never } },
    });

    await screen.findByText('GitLabRadar');
    const poContent = container.querySelector('#po-content');
    expect(poContent).not.toBeNull();
    expect(poContent).toHaveClass(styles.tabContentActive);
    expect(container.querySelector('#mrs-content')).not.toHaveClass(styles.tabContentActive);

    // The tab buttons are still IN the document (index.html:3305 never
    // removes `.tabs` from the DOM), just visually hidden.
    const tabsBar = screen.getByText('MRs').closest('button')!.parentElement!;
    expect(tabsBar).toHaveStyle({ display: 'none' });
  });

  // index.html:2204-2208,2383-2396 -- the profile-nav toggle. Gated on
  // `hasAccounts` (index.html:3301) regardless of the current view mode.
  describe('profile nav (Developer / Product Owner toggle)', () => {
    it('hides the profile nav entirely when no account is configured', async () => {
      const { container } = renderMenubar({ overrides: { accounts: { getAll: async () => [] } } });
      await screen.findByText('GitLabRadar');
      expect(container.querySelector('#profileNav')).toHaveStyle({ display: 'none' });
    });

    it('shows the profile nav, defaulting to Developer active, when an account is configured', async () => {
      const { container } = renderMenubar({
        overrides: { accounts: { getAll: async () => [{ id: 'a1' } as never] } },
      });
      await screen.findByText('GitLabRadar');
      expect(container.querySelector('#profileNav')).toHaveStyle({ display: 'flex' });
      expect(container.querySelector('#profileDeveloper')).toHaveClass(styles.profileNavItemActive);
      expect(container.querySelector('#profileProductOwner')).not.toHaveClass(styles.profileNavItemActive);
    });

    it('switches to product-owner mode, persists it, and activates po-content when "Product Owner" is clicked', async () => {
      const configSet = vi.fn().mockResolvedValue(undefined);
      const { container } = renderMenubar({
        overrides: {
          accounts: { getAll: async () => [{ id: 'a1' } as never] },
          config: { set: configSet },
        },
      });
      await screen.findByText('GitLabRadar');

      await userEvent.click(screen.getByText('Product Owner'));

      expect(configSet).toHaveBeenCalledWith('viewMode', 'productOwner');
      expect(container.querySelector('#profileProductOwner')).toHaveClass(styles.profileNavItemActive);
      expect(container.querySelector('#po-content')).toHaveClass(styles.tabContentActive);
      const tabsBar = screen.getByText('MRs').closest('button')!.parentElement!;
      expect(tabsBar).toHaveStyle({ display: 'none' });
    });

    it('is a no-op (does not call config.set) when clicking the already-active mode', async () => {
      const configSet = vi.fn().mockResolvedValue(undefined);
      renderMenubar({
        overrides: { accounts: { getAll: async () => [{ id: 'a1' } as never] }, config: { set: configSet } },
      });
      await screen.findByText('GitLabRadar');

      await userEvent.click(screen.getByText('Developer'));

      expect(configSet).not.toHaveBeenCalled();
    });
  });

  // Part 4 of the task-17 brief: proves the restructure from a JSX
  // conditional to class-only visibility actually holds, by checking DOM
  // NODE IDENTITY (not just visible content) survives a view-mode toggle --
  // an unmount/remount would create a brand-new node, failing this
  // reference-equality check even though the visible markup looks the same.
  it('does not unmount/remount the developer panes when toggling view mode', async () => {
    const { container } = renderMenubar({
      overrides: { accounts: { getAll: async () => [{ id: 'a1' } as never] } },
    });
    await screen.findByText('GitLabRadar');

    const mrsContentBefore = container.querySelector('#mrs-content');
    const pipelinesContentBefore = container.querySelector('#pipelines-content');
    const releasesContentBefore = container.querySelector('#releases-content');
    expect(mrsContentBefore).not.toBeNull();

    await userEvent.click(screen.getByText('Product Owner'));
    expect(container.querySelector('#mrs-content')).toBe(mrsContentBefore);
    expect(container.querySelector('#pipelines-content')).toBe(pipelinesContentBefore);
    expect(container.querySelector('#releases-content')).toBe(releasesContentBefore);

    await userEvent.click(screen.getByText('Developer'));
    expect(container.querySelector('#mrs-content')).toBe(mrsContentBefore);
    expect(container.querySelector('#pipelines-content')).toBe(pipelinesContentBefore);
    expect(container.querySelector('#releases-content')).toBe(releasesContentBefore);
  });

  // index.html:2313-2321, updateStatus() at :3826-3832.
  describe('footer', () => {
    it('shows "Not connected" and the offline dot before the first successful load/push', async () => {
      const { container } = renderMenubar();
      expect(screen.getByText('Not connected')).toBeInTheDocument();
      expect(container.querySelector('#statusDot')).toHaveClass(styles.statusDotOffline);
      await screen.findByTestId('mr-count');
    });

    it('shows "Updated at HH:MM" and the connected dot after data:updated arrives with no error', async () => {
      const { container, emit } = renderMenubar();
      act(() =>
        emit.dataUpdated({
          mergeRequests: [],
          pipelines: [],
          releases: [],
          status: 'green',
          lastUpdated: new Date('2026-08-04T12:34:00Z'),
        })
      );

      expect(await screen.findByText(/^Updated at /)).toBeInTheDocument();
      expect(container.querySelector('#statusDot')).toHaveClass(styles.statusDotConnected);
    });

    it('shows the error dot when data:updated arrives with an error', async () => {
      const { container, emit } = renderMenubar();
      act(() =>
        emit.dataUpdated({
          mergeRequests: [],
          pipelines: [],
          releases: [],
          status: 'red',
          error: 'boom',
          lastUpdated: new Date('2026-08-04T12:34:00Z'),
        })
      );

      await screen.findByText(/^Updated at /);
      expect(container.querySelector('#statusDot')).toHaveClass(styles.statusDotError);
    });

    it('calls app.showPreferences() when the Preferences link is clicked', async () => {
      const showPreferences = vi.fn().mockResolvedValue(undefined);
      renderMenubar({ overrides: { app: { showPreferences } } });
      await screen.findByText('GitLabRadar');

      await userEvent.click(screen.getByText('Preferences'));

      expect(showPreferences).toHaveBeenCalled();
    });
  });

  // Fix (Task 17, mirroring Tasks 15/16's mrCount/pipelineCount fixes):
  // index.html:3130-3133 computes `#releaseCount` from `visibleReleases.length`
  // (dismissed ids filtered out), not the raw `releases` collection.
  it('the releaseCount badge excludes a dismissed release immediately after dismissal', async () => {
    const release = (id: number) =>
      ({
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
      }) as unknown as Release;

    const dismissRelease = vi.fn().mockResolvedValue(undefined);
    const { emit } = renderMenubar({ overrides: { gitlab: { dismissRelease } } });

    act(() =>
      emit.dataUpdated({
        mergeRequests: [],
        pipelines: [],
        releases: [release(1), release(2)],
        status: 'green',
        lastUpdated: new Date('2026-08-04T12:00:00Z'),
      })
    );

    expect(await screen.findByTestId('release-count')).toHaveTextContent('2');

    await userEvent.click(screen.getByText('Releases'));
    await userEvent.click(screen.getAllByTitle('Hide this release')[0]);

    expect(dismissRelease).toHaveBeenCalledWith(1);
    await waitFor(() => expect(screen.getByTestId('release-count')).toHaveTextContent('1'));
  });
});
