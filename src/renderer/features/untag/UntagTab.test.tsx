import userEvent from '@testing-library/user-event';
import { act, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { UntagCommit, UntagProject } from '@/shared/types';
// Relative imports: eslint's import/no-unresolved has no TS-aware resolver
// for the `@/*` alias on value imports (see src/test/renderWithApi.tsx and
// src/renderer/api/FakeApi.ts for the same pre-existing gap).
import { renderWithApi } from '../../../test/renderWithApi';
import { DataProvider } from '../../windows/menubar/DataProvider';
import { UntagTab } from './UntagTab';

function renderTab(overrides?: Parameters<typeof renderWithApi>[1]) {
  return renderWithApi(
    <DataProvider>
      <UntagTab />
    </DataProvider>,
    overrides
  );
}

let nextId = 1000;

function makeCommit(overrides: Partial<UntagCommit> = {}): UntagCommit {
  const id = nextId++;
  return {
    id: `sha-${id}`,
    shortId: `abc${id}`,
    title: `Commit ${id}`,
    authorName: 'Cyril',
    committedDate: new Date().toISOString(),
    ...overrides,
  };
}

function makeProject(overrides: Partial<UntagProject> = {}): UntagProject {
  const id = nextId++;
  const base: UntagProject = {
    projectId: id,
    projectName: `project-${id}`,
    projectPath: `group/project-${id}`,
    projectWebUrl: `https://gitlab.example.com/group/project-${id}`,
    defaultBranch: 'main',
    lastTagName: `v${id}.0.0`,
    lastTagDate: new Date().toISOString(),
    commitsAhead: 1,
    lastCommitDate: new Date().toISOString(),
    commits: [],
    accountId: 'acc-1',
    ...overrides,
  };
  // The untag row renders projectPath (#3 fix). Default it to projectName so
  // tests that set only a name still find the row by that name; an explicit
  // projectPath override still wins.
  if (overrides.projectPath === undefined) base.projectPath = base.projectName;
  return base;
}

async function pushUntag(
  emit: ReturnType<typeof renderTab>['emit'],
  untagProjects: UntagProject[],
  excludedCount = 0
) {
  await act(async () => {
    emit.untagDataUpdated({ untagProjects, excludedCount, lastUpdated: new Date() });
  });
}

describe('UntagTab', () => {
  // index.html:3719-3721,3735,3788 -- ported markup keeps its source ids.
  it('keeps the source ids on the loading, empty and list containers', async () => {
    const { container, emit } = renderTab();
    expect(container.querySelector('#untag-loading')).not.toBeNull();

    await screen.findByText('All Tagged');
    expect(container.querySelector('#untag-empty')).not.toBeNull();

    await pushUntag(emit, [makeProject({ projectName: 'has-list' })]);
    await screen.findByText('has-list');
    expect(container.querySelector('#untag-list')).not.toBeNull();
  });

  // index.html:3726-3731 -- a SEPARATE loading flag from the other three
  // tabs (DataProvider.tsx's `isUntagLoading`); shown while
  // getUntagProjects() is still in flight, with its own wording.
  it('shows the untag-specific loading text while getUntagProjects is in flight', async () => {
    renderTab({ overrides: { gitlab: { getUntagProjects: () => new Promise(() => {}) } } });
    expect(await screen.findByText('Scanning unreleased commits...')).toBeInTheDocument();
  });

  it('shows the empty state title and description when there are no projects and nothing excluded', async () => {
    renderTab();
    expect(await screen.findByText('All Tagged')).toBeInTheDocument();
    expect(screen.getByText('All watched projects are up to date with their latest tags')).toBeInTheDocument();
  });

  // index.html:3735 -- the empty gate requires BOTH untagProjects.length===0
  // AND untagExcludedCount===0; with projects===0 but excludedCount>0 it
  // falls through to the list branch instead (just the exclusion notice,
  // no rows).
  it('does not show the empty state when there are zero projects but some are excluded', async () => {
    const { container, emit } = renderTab();
    await pushUntag(emit, [], 2);
    expect(await screen.findByText('2 projects excluded (no tags)')).toBeInTheDocument();
    expect(screen.queryByText('All Tagged')).not.toBeInTheDocument();
    expect(container.querySelector('#untag-list')).not.toBeNull();
  });

  // Bug-lot fix (#3): the untag row now shows the full `projectPath`, not just
  // the short `projectName`, so two same-named projects in different groups are
  // distinguishable (matches the search-result behaviour).
  it('shows the full projectPath, not just the short projectName (bug-lot fix #3)', async () => {
    const { emit } = renderTab();
    await pushUntag(emit, [
      makeProject({ projectName: 'short-name', projectPath: 'some-group/some-subgroup/short-name' }),
    ]);

    expect(await screen.findByText('some-group/some-subgroup/short-name')).toBeInTheDocument();
    expect(screen.queryByText('short-name')).not.toBeInTheDocument();
  });

  // index.html:3768 -- `+${commitsAhead} ${commitsLabel}`.
  it('singularizes "commit" for exactly one commit ahead', async () => {
    const { emit } = renderTab();
    await pushUntag(emit, [makeProject({ projectName: 'one-commit', commitsAhead: 1 })]);
    expect(await screen.findByText('+1 commit')).toBeInTheDocument();
  });

  it('pluralizes "commits" for more than one commit ahead', async () => {
    const { emit } = renderTab();
    await pushUntag(emit, [makeProject({ projectName: 'many-commits', commitsAhead: 5 })]);
    expect(await screen.findByText('+5 commits')).toBeInTheDocument();
  });

  // index.html:3767 -- the last tag name badge.
  it('shows the last tag name', async () => {
    const { emit } = renderTab();
    await pushUntag(emit, [makeProject({ projectName: 'tagged-project', lastTagName: 'v9.9.9' })]);
    await screen.findByText('tagged-project');
    expect(screen.getByText('v9.9.9')).toBeInTheDocument();
  });

  // index.html:3790-3798
  it('opens the project externally with its projectWebUrl when the item is clicked', async () => {
    const openExternal = vi.fn().mockResolvedValue(undefined);
    const { emit } = renderTab({ overrides: { app: { openExternal } } });
    await pushUntag(emit, [
      makeProject({ projectName: 'click-me', projectWebUrl: 'https://gitlab.example.com/click-me' }),
    ]);
    await userEvent.click(await screen.findByText('click-me'));

    expect(openExternal).toHaveBeenCalledWith('https://gitlab.example.com/click-me');
  });

  // index.html:3795 -- `if (url && ...)`. `projectWebUrl` is typed
  // non-optional, but that's a compile-time claim, not a runtime
  // guarantee -- guarded literally in UntagProjectRow.tsx rather than
  // trusted.
  it('does not call openExternal when projectWebUrl is empty', async () => {
    const openExternal = vi.fn().mockResolvedValue(undefined);
    const { emit } = renderTab({ overrides: { app: { openExternal } } });
    await pushUntag(emit, [makeProject({ projectName: 'no-url', projectWebUrl: '' })]);
    await userEvent.click(await screen.findByText('no-url'));

    expect(openExternal).not.toHaveBeenCalled();
  });

  // index.html:3770,3772 -- no expand button/detail panel at all when a
  // project has no commits.
  it('does not render an expand button when there are no commits', async () => {
    const { emit } = renderTab();
    await pushUntag(emit, [makeProject({ projectName: 'no-commits', commits: [] })]);
    await screen.findByText('no-commits');
    expect(screen.queryByText('Show commits')).not.toBeInTheDocument();
  });

  // index.html:3802-3812 -- toggling shows the commit list and flips the
  // button label; clicking again hides it and flips back.
  it('expands and collapses the commit list on click, flipping the button label', async () => {
    const { emit } = renderTab();
    await pushUntag(emit, [
      makeProject({
        projectName: 'expandable',
        commits: [makeCommit({ shortId: 'deadbee', title: 'Fix thing', authorName: 'Alice' })],
      }),
    ]);
    await screen.findByText('expandable');

    // index.html:3772-3782 -- the detail panel (and its commit rows) is
    // ALWAYS present in the rendered markup; only a CSS class
    // (`.untag-detail-panel.expanded`) controls whether it's visually
    // shown. The button label is the one piece of content that actually
    // differs by state, and the only thing this test can observe in jsdom
    // (which doesn't apply the CSS Modules stylesheet) -- see
    // UntagProjectRow.tsx's `detailPanelExpanded` doc comment and this
    // file's other test asserting the commit fields render at all.
    expect(screen.getByText('Show commits')).toBeInTheDocument();
    await userEvent.click(screen.getByText('Show commits'));
    expect(screen.getByText('Hide commits')).toBeInTheDocument();
    expect(screen.queryByText('Show commits')).not.toBeInTheDocument();

    await userEvent.click(screen.getByText('Hide commits'));
    expect(screen.getByText('Show commits')).toBeInTheDocument();
    expect(screen.queryByText('Hide commits')).not.toBeInTheDocument();
  });

  // index.html:3774-3780 -- the commit sha/title/author fields, independent
  // of collapsed/expanded state (see the test above for why that state
  // isn't DOM-presence-observable here).
  it("renders each commit's sha, title and author for a project with commits", async () => {
    const { emit } = renderTab();
    await pushUntag(emit, [
      makeProject({
        projectName: 'has-commit-details',
        commits: [makeCommit({ shortId: 'deadbee', title: 'Fix thing', authorName: 'Alice' })],
      }),
    ]);
    await screen.findByText('has-commit-details');

    expect(screen.getByText('deadbee')).toBeInTheDocument();
    expect(screen.getByText('Fix thing')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  // index.html:3793 -- `if (e.target.closest('.untag-expand-btn')) return;`,
  // reproduced via stopPropagation in UntagProjectRow.tsx.
  it('does not open the project externally when the expand button is clicked', async () => {
    const openExternal = vi.fn().mockResolvedValue(undefined);
    const { emit } = renderTab({ overrides: { app: { openExternal } } });
    await pushUntag(emit, [
      makeProject({
        projectName: 'expand-not-open',
        projectWebUrl: 'https://gitlab.example.com/expand-not-open',
        commits: [makeCommit()],
      }),
    ]);
    await screen.findByText('expand-not-open');

    await userEvent.click(screen.getByText('Show commits'));
    expect(openExternal).not.toHaveBeenCalled();
  });

  // index.html:3788 -- `list.innerHTML = html` rebuilds the whole list on
  // EVERY renderUntag() call, including a plain re-poll push, which throws
  // away any `.expanded` class a row previously had (there is no `expanded`
  // class anywhere in the template itself). Reproduced via UntagTab.tsx's
  // `expandedIndices` reset effect -- this proves it actually collapses a
  // currently-expanded row when a fresh untag:dataUpdated push arrives, not
  // just that a freshly mounted row starts collapsed.
  it('collapses an expanded commit list when a new untag:dataUpdated push arrives (index.html:3788 full rebuild)', async () => {
    const { emit } = renderTab();
    const project = makeProject({
      projectName: 'collapses-on-refresh',
      commits: [makeCommit({ title: 'Will be hidden again' })],
    });
    await pushUntag(emit, [project]);
    await screen.findByText('collapses-on-refresh');

    await userEvent.click(screen.getByText('Show commits'));
    // See the button-label test above for why this (not commit-text
    // presence, which never changes) is the observable proof of expansion.
    expect(screen.getByText('Hide commits')).toBeInTheDocument();

    // A fresh push for the SAME project (a new array/object, exactly what a
    // real 5-minute auto-poll produces even when nothing actually changed).
    await pushUntag(emit, [{ ...project, commits: [{ ...project.commits[0] }] }]);

    expect(screen.queryByText('Hide commits')).not.toBeInTheDocument();
    expect(screen.getByText('Show commits')).toBeInTheDocument();
  });

  // index.html:3746-3753,3819-3821
  it('shows the exclusion notice with a "Reset exclusions" button that calls clearUntagExclusions', async () => {
    const clearUntagExclusions = vi.fn().mockResolvedValue(undefined);
    const { emit } = renderTab({ overrides: { gitlab: { clearUntagExclusions } } });
    await pushUntag(emit, [makeProject({ projectName: 'has-exclusions' })], 3);

    expect(await screen.findByText('3 projects excluded (no tags)')).toBeInTheDocument();
    const resetBtn = screen.getByText('Reset exclusions');
    expect(resetBtn.closest('#untag-list')).not.toBeNull();

    await userEvent.click(resetBtn);
    expect(clearUntagExclusions).toHaveBeenCalled();
  });

  it('singularizes the exclusion notice for exactly one excluded project', async () => {
    const { emit } = renderTab();
    await pushUntag(emit, [makeProject()], 1);
    expect(await screen.findByText('1 project excluded (no tags)')).toBeInTheDocument();
  });

  it('does not show the exclusion notice when nothing is excluded', async () => {
    const { emit } = renderTab();
    await pushUntag(emit, [makeProject({ projectName: 'no-exclusions' })], 0);
    await screen.findByText('no-exclusions');
    expect(screen.queryByText(/excluded \(no tags\)/)).not.toBeInTheDocument();
  });

  // The `resetUntagExclusionsBtn` id is preserved from the source
  // (index.html:3750).
  it('keeps the source id on the reset-exclusions button', async () => {
    const { container, emit } = renderTab();
    await pushUntag(emit, [makeProject()], 1);
    await screen.findByText('1 project excluded (no tags)');
    expect(container.querySelector('#resetUntagExclusionsBtn')).not.toBeNull();
  });

  // Discrepancy from the task brief, confirmed by grep against the source:
  // `gitlab.refreshUntag` (src/shared/api/channels.ts:28,
  // src/main/ipc/handlers.ts:336-338) has NO call site anywhere in
  // index.html -- renderUntag() (:3717-3824) never invokes it, and neither
  // does anything else in the vanilla renderer. The header's `#refreshBtn`
  // only calls `gitlab.refresh()` (mrs/pipelines/releases), never
  // `refreshUntag()`. There is therefore no manual refresh control for
  // Untag to port, and none is wired up here -- see task-18-report.md. This
  // guards against a later "helpful" addition inventing one.
  it('never calls gitlab.refreshUntag -- no manual refresh control exists for Untag in the source', async () => {
    const refreshUntag = vi.fn().mockResolvedValue(undefined);
    const clearUntagExclusions = vi.fn().mockResolvedValue(undefined);
    const { emit } = renderTab({ overrides: { gitlab: { refreshUntag, clearUntagExclusions } } });
    await pushUntag(emit, [makeProject({ projectName: 'no-refresh-call' })], 1);
    await screen.findByText('no-refresh-call');

    await userEvent.click(screen.getByText('Reset exclusions'));
    expect(clearUntagExclusions).toHaveBeenCalled();
    expect(refreshUntag).not.toHaveBeenCalled();
  });

  // Multiple rows can be expanded independently (index.html:3802-3812
  // toggles only the ONE panel matching the clicked button's `data-idx`).
  it('expands one row without affecting a sibling row', async () => {
    const { emit } = renderTab();
    await pushUntag(emit, [
      makeProject({ projectName: 'row-a', commits: [makeCommit({ title: 'commit-a' })] }),
      makeProject({ projectName: 'row-b', commits: [makeCommit({ title: 'commit-b' })] }),
    ]);
    await screen.findByText('row-a');

    // row-a is first in the pushed array (idx 0), so its "Show commits"
    // button is the first one in document order.
    expect(screen.getAllByText('Show commits')).toHaveLength(2);
    const [showCommitsA] = screen.getAllByText('Show commits');
    await userEvent.click(showCommitsA);

    // Only row-a's button flips -- row-b's stays "Show commits" (see the
    // earlier button-label test for why label, not commit-text presence,
    // is what this port can observe in jsdom).
    expect(screen.getByText('Hide commits')).toBeInTheDocument();
    expect(screen.getAllByText('Show commits')).toHaveLength(1);
  });
});
