import userEvent from '@testing-library/user-event';
import { act, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
    expect(screen.getByText('GitLabBar')).toBeInTheDocument();
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

    const refreshBtn = container.querySelector('button[title="Refresh"]');
    expect(refreshBtn).not.toBeNull();
    await userEvent.click(refreshBtn as HTMLElement);

    expect(refreshCalled).toBe(true);
  });

  it('replaces the tab strip with the po-content pane in product-owner view mode, without adding a fifth tab', async () => {
    const { container } = renderMenubar({
      overrides: { config: { get: async () => 'productOwner' as never } },
    });

    await screen.findByText('GitLabBar');
    expect(container.querySelector('#po-content')).not.toBeNull();
    expect(screen.queryByText('MRs')).not.toBeInTheDocument();
    expect(screen.queryByText('Pipelines')).not.toBeInTheDocument();
  });
});
