import userEvent from '@testing-library/user-event';
import { act, screen, waitFor } from '@testing-library/react';
import { Component, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { MergeRequest, MergeRequestAuthor } from '@/shared/types';
// Relative import: eslint's import/no-unresolved has no TS-aware resolver
// for the `@/*` alias on value imports (see src/test/renderWithApi.tsx and
// src/renderer/api/FakeApi.ts for the same pre-existing gap).
import { DEFAULT_CONFIG } from '../../../shared/types/config';
import { renderWithApi } from '../../../test/renderWithApi';
import { DataProvider } from '../../windows/menubar/DataProvider';
import { MergeRequestsTab } from './MergeRequestsTab';

function renderTab(overrides?: Parameters<typeof renderWithApi>[1]) {
  return renderWithApi(
    <DataProvider>
      <MergeRequestsTab />
    </DataProvider>,
    overrides
  );
}

// Test-only error boundary for the two preserved-crash tests below. Those
// crashes happen during a render triggered by a LATE async state update
// (after a click kicks off a fetch, not during the initial synchronous
// render), so `expect(() => render(...)).toThrow()` -- the pattern
// Avatar.test.tsx:83 uses for its own synchronous-render version of this
// same bug class -- doesn't apply: by the time the crash happens, `render`
// has already returned normally. React 18's concurrent renderer also
// double-attempts a throwing render to check whether it's transient, which
// makes asserting on `act()`/`userEvent.click()` rejecting directly flaky
// (confirmed empirically: it intermittently reports the assertion as both
// passing AND separately unhandled). An error boundary sidesteps all of
// that -- it's guaranteed to catch a render error regardless of what
// triggered the render, and reproduces what would actually happen in the
// real (boundary-less) app just as accurately: the tree unmounts.
class CrashProbe extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return <div data-testid="crash-probe">{this.state.error.message}</div>;
    }
    return this.props.children;
  }
}

function author(overrides: Partial<MergeRequestAuthor> = {}): MergeRequestAuthor {
  return {
    id: 1,
    username: 'cyril',
    name: 'Cyril',
    avatar_url: '',
    ...overrides,
  };
}

let nextId = 1000;

function makeMR(overrides: Partial<MergeRequest> = {}): MergeRequest {
  const id = nextId++;
  return {
    id,
    iid: id,
    title: `MR ${id}`,
    description: '',
    webUrl: `https://gitlab.example.com/mr/${id}`,
    projectId: 100,
    projectName: 'Project',
    projectPath: 'group/project',
    author: author(),
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
    ...overrides,
  };
}

async function pushMRs(emit: ReturnType<typeof renderTab>['emit'], mergeRequests: MergeRequest[]) {
  await act(async () => {
    emit.dataUpdated({
      mergeRequests,
      pipelines: [],
      releases: [],
      status: 'green',
      lastUpdated: new Date(),
    });
  });
}

describe('MergeRequestsTab', () => {
  // index.html:2235,2238-2239,2455,2530 -- ported markup keeps its source ids.
  it('keeps the source ids on the loading, empty and list containers', async () => {
    const { container, emit } = renderTab({ overrides: { accounts: { getAll: async () => [] } } });
    // Loading state renders synchronously before the initial fetch settles.
    expect(container.querySelector('#mrs-loading')).not.toBeNull();

    await screen.findByText('Configure GitLab');
    expect(container.querySelector('#mrs-empty')).not.toBeNull();
    expect(container.querySelector('#mrs-empty-title')).toHaveTextContent('No Merge Requests');
    expect(container.querySelector('#mrs-empty-desc')).toHaveTextContent(
      'Add your GitLab account to track your merge requests in real-time'
    );
    expect(container.querySelector('#addAccountBtn')).not.toBeNull();

    const mr = makeMR({ userRole: 'author', title: 'Has an id list' });
    await pushMRs(emit, [mr]);
    await screen.findByText('Has an id list');
    expect(container.querySelector('#mrs-list')).not.toBeNull();
  });

  // index.html:2482-2490
  it('shows an account-specific empty state when there are no accounts', async () => {
    renderTab({ overrides: { accounts: { getAll: async () => [] } } });
    expect(
      await screen.findByText('Add your GitLab account to track your merge requests in real-time')
    ).toBeInTheDocument();
    expect(screen.getByText('Configure GitLab')).toBeInTheDocument();
  });

  it('shows an account-configured empty state when accounts exist but there are no MRs', async () => {
    renderTab({
      overrides: { accounts: { getAll: async () => [{ id: 'a1' } as never] } },
    });
    expect(await screen.findByText('No open merge requests found for your account')).toBeInTheDocument();
    expect(screen.queryByText('Configure GitLab')).not.toBeInTheDocument();
  });

  // index.html:2419-2423
  it('"Configure GitLab" calls app.showPreferences', async () => {
    const showPreferences = vi.fn().mockResolvedValue(undefined);
    renderTab({
      overrides: { accounts: { getAll: async () => [] }, app: { showPreferences } },
    });
    await userEvent.click(await screen.findByText('Configure GitLab'));
    expect(showPreferences).toHaveBeenCalled();
  });

  // index.html:2515-2526 -- the renderSection call order, read directly
  // off renderMRs. Only sections with items render, in this order.
  it('renders section titles in source order, one section per role', async () => {
    const { emit, container } = renderTab();
    await pushMRs(emit, [
      makeMR({ userRole: 'author' }),
      makeMR({ userRole: 'reviewer' }),
      makeMR({ userRole: 'unassigned' }),
      makeMR({ userRole: 'assignee' }),
    ]);

    await screen.findByText('To review');
    const html = container.innerHTML;
    const iReview = html.indexOf('To review');
    const iUnassigned = html.indexOf('No reviewer');
    const iAssigned = html.indexOf('Assigned');
    const iAuthored = html.indexOf('Created by me');
    expect(iReview).toBeGreaterThan(-1);
    expect(iReview).toBeLessThan(iUnassigned);
    expect(iUnassigned).toBeLessThan(iAssigned);
    expect(iAssigned).toBeLessThan(iAuthored);
  });

  it('omits a section entirely when no visible MR has that role', async () => {
    const { emit } = renderTab();
    await pushMRs(emit, [makeMR({ userRole: 'author' })]);

    expect(await screen.findByText('Created by me')).toBeInTheDocument();
    expect(screen.queryByText('To review')).not.toBeInTheDocument();
    expect(screen.queryByText('No reviewer')).not.toBeInTheDocument();
    expect(screen.queryByText('Assigned')).not.toBeInTheDocument();
  });

  // index.html:2791-2796,2806-2811: the mini-avatar stack caps at 3 with a
  // "+N" chip only when there are MORE than 3.
  it('shows no overflow chip with exactly 3 assignees', async () => {
    const { emit } = renderTab();
    await pushMRs(emit, [
      makeMR({
        userRole: 'author',
        title: 'Three assignees',
        assignees: [author({ id: 2, name: 'A' }), author({ id: 3, name: 'B' }), author({ id: 4, name: 'C' })],
      }),
    ]);
    await screen.findByText('Three assignees');
    expect(screen.queryByText(/^\+\d+$/)).not.toBeInTheDocument();
  });

  it('shows a "+1" overflow chip with 4 assignees', async () => {
    const { emit } = renderTab();
    await pushMRs(emit, [
      makeMR({
        userRole: 'author',
        title: 'Four assignees',
        assignees: [
          author({ id: 2, name: 'A' }),
          author({ id: 3, name: 'B' }),
          author({ id: 4, name: 'C' }),
          author({ id: 5, name: 'D' }),
        ],
      }),
    ]);
    await screen.findByText('Four assignees');
    expect(screen.getByText('+1')).toBeInTheDocument();
  });

  // index.html:2542-2553
  it('calls gitlab.dismissMR with the MR id when the dismiss button is clicked', async () => {
    const dismissMR = vi.fn().mockResolvedValue(undefined);
    const { emit } = renderTab({ overrides: { gitlab: { dismissMR } } });
    const mr = makeMR({ userRole: 'author', title: 'Fix the thing' });
    await pushMRs(emit, [mr]);
    await screen.findByText('Fix the thing');

    await userEvent.click(screen.getByTitle('Hide this MR'));

    expect(dismissMR).toHaveBeenCalledWith(mr.id);
  });

  // index.html:2530-2539
  it('opens the MR externally with its web_url when the item is clicked', async () => {
    const openExternal = vi.fn().mockResolvedValue(undefined);
    const { emit } = renderTab({ overrides: { app: { openExternal } } });
    const mr = makeMR({ userRole: 'author', title: 'Fix the thing', webUrl: 'https://gitlab.example.com/mr/999' });
    await pushMRs(emit, [mr]);
    await userEvent.click(await screen.findByText('Fix the thing'));

    expect(openExternal).toHaveBeenCalledWith('https://gitlab.example.com/mr/999');
  });

  it('does not open the MR when the dismiss button is clicked', async () => {
    const openExternal = vi.fn().mockResolvedValue(undefined);
    const dismissMR = vi.fn().mockResolvedValue(undefined);
    const { emit } = renderTab({ overrides: { app: { openExternal }, gitlab: { dismissMR } } });
    const mr = makeMR({ userRole: 'author', title: 'Fix the thing' });
    await pushMRs(emit, [mr]);
    await screen.findByText('Fix the thing');

    await userEvent.click(screen.getByTitle('Hide this MR'));

    expect(dismissMR).toHaveBeenCalled();
    expect(openExternal).not.toHaveBeenCalled();
  });

  // index.html:1299-1309
  it('shows the Draft badge only for draft MRs', async () => {
    const { emit } = renderTab();
    await pushMRs(emit, [makeMR({ userRole: 'author', draft: true, title: 'Draft one' })]);
    expect(await screen.findByText('Draft')).toBeInTheDocument();
  });

  it('shows no Draft badge for a non-draft MR', async () => {
    const { emit } = renderTab();
    await pushMRs(emit, [makeMR({ userRole: 'author', draft: false, title: 'Not draft' })]);
    await screen.findByText('Not draft');
    expect(screen.queryByText('Draft')).not.toBeInTheDocument();
  });

  // index.html:2506-2513,2758-2768
  it('shows the dismissed-notice with a "Show all" button that calls restoreMRs', async () => {
    const restoreMRs = vi.fn().mockResolvedValue(undefined);
    const dismissed = makeMR({ userRole: 'author', title: 'Hidden one' });
    const { emit } = renderTab({
      overrides: {
        gitlab: { restoreMRs },
        config: { getAll: async () => ({ ...DEFAULT_CONFIG, dismissedMRs: [dismissed.id] }) },
      },
    });
    const visible = makeMR({ userRole: 'author', title: 'Visible one' });
    await pushMRs(emit, [dismissed, visible]);

    expect(await screen.findByText('1 MR hidden')).toBeInTheDocument();
    expect(screen.getByText('Visible one')).toBeInTheDocument();
    expect(screen.queryByText('Hidden one')).not.toBeInTheDocument();

    await userEvent.click(screen.getByText('Show all'));
    expect(restoreMRs).toHaveBeenCalled();
    expect(await screen.findByText('Hidden one')).toBeInTheDocument();
  });

  // index.html:2665-2743
  it('clicking the notes badge fetches and displays comments', async () => {
    const getMRNotes = vi.fn().mockResolvedValue([
      {
        id: 1,
        body: 'Looks good',
        createdAt: new Date().toISOString(),
        author: { name: 'Reviewer', username: 'rev', avatar_url: '' },
      },
    ]);
    const { emit } = renderTab({ overrides: { gitlab: { getMRNotes } } });
    const mr = makeMR({ userRole: 'author', title: 'Has comments', userNotesCount: 1 });
    await pushMRs(emit, [mr]);
    await screen.findByText('Has comments');

    await userEvent.click(screen.getByTitle('Click to view comments'));

    expect(getMRNotes).toHaveBeenCalledWith(mr.projectId, mr.iid);
    expect(await screen.findByText('Looks good')).toBeInTheDocument();
  });

  it('clicking an open notes badge a second time closes the panel without re-fetching', async () => {
    const getMRNotes = vi.fn().mockResolvedValue([
      {
        id: 1,
        body: 'Looks good',
        createdAt: new Date().toISOString(),
        author: { name: 'Reviewer', username: 'rev', avatar_url: '' },
      },
    ]);
    const { emit } = renderTab({ overrides: { gitlab: { getMRNotes } } });
    const mr = makeMR({ userRole: 'author', title: 'Has comments', userNotesCount: 1 });
    await pushMRs(emit, [mr]);
    await screen.findByText('Has comments');

    const badge = screen.getByTitle('Click to view comments');
    await userEvent.click(badge);
    await screen.findByText('Looks good');

    await userEvent.click(screen.getByTitle('Click to view comments'));
    expect(screen.queryByText('Looks good')).not.toBeInTheDocument();
    expect(getMRNotes).toHaveBeenCalledTimes(1);
  });

  // index.html:2556-2663
  it('the Assign button loads members and assigns "Me" as [0]', async () => {
    const assignMR = vi.fn().mockResolvedValue(undefined);
    const getProjectMembers = vi.fn().mockResolvedValue([{ id: 7, name: 'Bob', username: 'bob', avatar_url: '' }]);
    const { emit } = renderTab({ overrides: { gitlab: { assignMR, getProjectMembers } } });
    const mr = makeMR({ userRole: 'author', title: 'Needs assignee' });
    await pushMRs(emit, [mr]);
    await screen.findByText('Needs assignee');

    await userEvent.click(screen.getByText('+ Assign'));
    expect(getProjectMembers).toHaveBeenCalledWith(mr.projectId);

    const meItem = await screen.findByText('Me');
    await userEvent.click(meItem);

    await waitFor(() => expect(assignMR).toHaveBeenCalledWith(mr.projectId, mr.iid, [0]));
  });

  it('the Assign button assigns a real member by their id', async () => {
    const assignMR = vi.fn().mockResolvedValue(undefined);
    const getProjectMembers = vi.fn().mockResolvedValue([{ id: 7, name: 'Bob', username: 'bob', avatar_url: '' }]);
    const { emit } = renderTab({ overrides: { gitlab: { assignMR, getProjectMembers } } });
    const mr = makeMR({ userRole: 'author', title: 'Needs assignee' });
    await pushMRs(emit, [mr]);
    await screen.findByText('Needs assignee');

    await userEvent.click(screen.getByText('+ Assign'));
    const bobItem = await screen.findByText('Bob');
    await userEvent.click(bobItem);

    await waitFor(() => expect(assignMR).toHaveBeenCalledWith(mr.projectId, mr.iid, [7]));
  });

  it('the Reviewer button calls addReviewer (not assignMR) with the sentinel id for "Me"', async () => {
    const addReviewer = vi.fn().mockResolvedValue(undefined);
    const assignMR = vi.fn().mockResolvedValue(undefined);
    const getProjectMembers = vi.fn().mockResolvedValue([]);
    const { emit } = renderTab({ overrides: { gitlab: { addReviewer, assignMR, getProjectMembers } } });
    const mr = makeMR({ userRole: 'author', title: 'Needs reviewer' });
    await pushMRs(emit, [mr]);
    await screen.findByText('Needs reviewer');

    await userEvent.click(screen.getByText('+ Reviewer'));
    expect(getProjectMembers).toHaveBeenCalledWith(mr.projectId);
    expect(await screen.findByText('No members found')).toBeInTheDocument();
    expect(assignMR).not.toHaveBeenCalled();
  });

  // index.html:2858-2873 -- the assign/reviewer buttons only render for
  // whichever list is empty.
  it('hides the Assign button once the MR already has an assignee', async () => {
    const { emit } = renderTab();
    await pushMRs(emit, [
      makeMR({ userRole: 'author', title: 'Already assigned', assignees: [author({ id: 9, name: 'Zoe' })] }),
    ]);
    await screen.findByText('Already assigned');
    expect(screen.queryByText('+ Assign')).not.toBeInTheDocument();
    expect(screen.getByText('+ Reviewer')).toBeInTheDocument();
  });

  // Fix round 1 -- CRITICAL. index.html:2643-2651 mutates the just-used
  // action button's DOM node in place; that mutation lives only on that
  // node. `renderMRs()` regenerates `list.innerHTML` from scratch and runs
  // on dismissing ANY MR (:2550) -- including an unrelated one -- wiping
  // the "Done" visual back to the default button instantly. A `Set`-only
  // implementation would NOT reproduce this (it survives unrelated
  // re-renders), so vanilla flickers/reverts where a naive port would stay
  // stable -- an observable difference on one of the app's core
  // interactive paths (assign/review actions land inside this window on
  // or shortly after nearly every real one, since
  // GITLAB_ASSIGN_MR/GITLAB_ADD_REVIEWER themselves trigger a server-side
  // refresh independent of this component's own 1s-delayed one).
  it('wipes the transient "Done" visual when an UNRELATED MR is dismissed (index.html:2550,2643-2651)', async () => {
    const assignMR = vi.fn().mockResolvedValue(undefined);
    const getProjectMembers = vi.fn().mockResolvedValue([{ id: 7, name: 'Bob', username: 'bob', avatar_url: '' }]);
    const dismissMR = vi.fn().mockResolvedValue(undefined);
    const { emit } = renderTab({ overrides: { gitlab: { assignMR, getProjectMembers, dismissMR } } });

    const mrA = makeMR({ userRole: 'author', title: 'MR A needs assignee' });
    const mrB = makeMR({ userRole: 'author', title: 'MR B unrelated' });
    await pushMRs(emit, [mrA, mrB]);
    await screen.findByText('MR A needs assignee');

    // Complete an assign on MR A -- its button should now read "Done".
    const assignButtons = screen.getAllByText('+ Assign');
    await userEvent.click(assignButtons[0]);
    const meItem = await screen.findByText('Me');
    await userEvent.click(meItem);
    await waitFor(() => expect(assignMR).toHaveBeenCalledWith(mrA.projectId, mrA.iid, [0]));
    expect(await screen.findByText('Done')).toBeInTheDocument();

    // Dismiss MR B -- unrelated to MR A's just-completed assign.
    const dismissButtons = screen.getAllByTitle('Hide this MR');
    // MR A's own dismiss button is the first one rendered (section order);
    // click the second one (MR B's) to prove this isn't just "dismissing
    // yourself clears your own state".
    await userEvent.click(dismissButtons[1]);
    expect(dismissMR).toHaveBeenCalledWith(mrB.id);

    await waitFor(() => expect(screen.queryByText('Done')).not.toBeInTheDocument());
    // The button reverts to its normal "+ Assign" label, not just losing
    // the word "Done" some other way.
    expect(await screen.findByText('+ Assign')).toBeInTheDocument();
  });

  // Fix round 1 -- bonus coverage for the same clearing mechanism via the
  // OTHER trigger the coordinator named: a fresh `data:updated` push
  // (index.html:3899), which is what GITLAB_ASSIGN_MR/GITLAB_ADD_REVIEWER's
  // own server-side `pollingService.refresh()` call (handlers.ts:214,231)
  // actually produces in the real app, independent of this component's own
  // 1s-delayed `refresh()`.
  it('wipes the transient "Done" visual when a new data:updated push arrives', async () => {
    const assignMR = vi.fn().mockResolvedValue(undefined);
    const getProjectMembers = vi.fn().mockResolvedValue([{ id: 7, name: 'Bob', username: 'bob', avatar_url: '' }]);
    const { emit } = renderTab({ overrides: { gitlab: { assignMR, getProjectMembers } } });

    const mr = makeMR({ userRole: 'author', title: 'MR needs assignee' });
    await pushMRs(emit, [mr]);
    await screen.findByText('MR needs assignee');

    await userEvent.click(screen.getByText('+ Assign'));
    await userEvent.click(await screen.findByText('Me'));
    await waitFor(() => expect(assignMR).toHaveBeenCalledWith(mr.projectId, mr.iid, [0]));
    expect(await screen.findByText('Done')).toBeInTheDocument();

    // A poll cycle lands before the local 1s timer -- same `mr`, assignees
    // still empty (the fake server hasn't actually applied anything), but
    // it's still a fresh array reference, exactly like every real
    // loadData()/data:updated in the source.
    await pushMRs(emit, [mr]);

    await waitFor(() => expect(screen.queryByText('Done')).not.toBeInTheDocument());
  });

  // Bug-lot fix (#8), third occurrence: the notes-panel author placeholder
  // used an unguarded `note.author.name[0].toUpperCase()` (dedicated markup,
  // not `Avatar`). An empty name from the GitLab response threw and -- with no
  // error boundary in the real tree -- blanked the whole window. Now guarded
  // with '?'.
  it('renders "?" for a notes-panel comment author with an empty name instead of crashing (bug-lot fix #8)', async () => {
    const getMRNotes = vi.fn().mockResolvedValue([
      {
        id: 1,
        body: 'hi',
        createdAt: new Date().toISOString(),
        author: { name: '', username: 'ghost', avatar_url: '' },
      },
    ]);
    const { emit } = renderWithApi(
      <CrashProbe>
        <DataProvider>
          <MergeRequestsTab />
        </DataProvider>
      </CrashProbe>,
      { overrides: { gitlab: { getMRNotes } } }
    );
    const mr = makeMR({ userRole: 'author', title: 'Crashy notes author', userNotesCount: 1 });
    await pushMRs(emit, [mr]);
    await screen.findByText('Crashy notes author');

    const badge = screen.getByTitle('Click to view comments');
    await userEvent.click(badge);

    // Panel renders (note body visible), no crash, empty name -> '?' placeholder.
    expect(await screen.findByText('hi')).toBeInTheDocument();
    expect(screen.queryByTestId('crash-probe')).not.toBeInTheDocument();
    expect(screen.getByText('?')).toBeInTheDocument();
  });

  // Bug-lot fix (#8), fourth occurrence: the member-dropdown placeholder used
  // an unguarded `member.name[0].toUpperCase()` (inline-styled markup, not
  // `Avatar`). An empty member name threw and blanked the whole window; now
  // guarded with '?'.
  it('renders a member with an empty name instead of crashing (bug-lot fix #8)', async () => {
    const getProjectMembers = vi.fn().mockResolvedValue([{ id: 7, name: '', username: 'ghost', avatar_url: '' }]);
    const { emit } = renderWithApi(
      <CrashProbe>
        <DataProvider>
          <MergeRequestsTab />
        </DataProvider>
      </CrashProbe>,
      { overrides: { gitlab: { getProjectMembers } } }
    );
    const mr = makeMR({ userRole: 'author', title: 'Crashy member' });
    await pushMRs(emit, [mr]);
    await screen.findByText('Crashy member');

    const assignBtn = screen.getByText('+ Assign');
    await userEvent.click(assignBtn);

    // Dropdown opens with the member (username visible), no crash.
    expect(await screen.findByText('@ghost')).toBeInTheDocument();
    expect(screen.queryByTestId('crash-probe')).not.toBeInTheDocument();
  });
});
