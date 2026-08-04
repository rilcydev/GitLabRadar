import userEvent from '@testing-library/user-event';
import { act, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithApi } from '../../../../test/renderWithApi';
import { ProjectsPage } from './ProjectsPage';

const apiProject = {
  id: 1,
  name: 'gitlab-bar',
  name_with_namespace: 'Cyril / gitlab-bar',
  path_with_namespace: 'cyril/gitlab-bar',
  web_url: 'https://gitlab.com/cyril/gitlab-bar',
  default_branch: 'main',
};

// userEvent.type() under fake timers awaits its own internal per-keystroke
// delays via `wait()`, which resolves fine using the `advanceTimers` option
// -- but the underlying `act()`/React-scheduler flush after the last
// dispatched event needs at least one more event-loop turn than
// userEvent's own internal advances provide, and hangs indefinitely without
// it (reproduced independently of this component with a bare <input>).
// Racing the typed promise against zero-duration fake-timer pumps
// (`vi.advanceTimersByTimeAsync(0)`) flushes that pending turn without
// moving the virtual clock, so debounce-timing assertions right after stay
// exact (unlike `vi.useFakeTimers({ shouldAdvanceTime: true })`, which
// fixes the hang but also lets real wall-clock time leak into the virtual
// clock and made the 299ms/300ms boundary assertion below flaky).
async function typeWithFakeTimers(element: HTMLElement, text: string) {
  let done = false;
  const pending = userEvent.type(element, text, { advanceTimers: vi.advanceTimersByTime }).then(() => {
    done = true;
  });
  for (let i = 0; i < 50 && !done; i++) {
    await vi.advanceTimersByTimeAsync(0);
  }
  await pending;
}

describe('ProjectsPage', () => {
  it('shows the initial hint before any search', async () => {
    renderWithApi(<ProjectsPage />);
    expect(await screen.findByText('Load your projects by typing in the search...')).toBeInTheDocument();
  });

  // preferences.html:1157-1160: below 2 trimmed characters, no debounce
  // timer is even scheduled -- the "type at least 2 characters" hint
  // replaces the search results immediately.
  it('shows a hint and does not search below 2 characters', async () => {
    const searchProjects = vi.fn().mockResolvedValue([]);
    renderWithApi(<ProjectsPage />, { overrides: { gitlab: { searchProjects } } });

    await userEvent.type(screen.getByPlaceholderText('Search for a project...'), 'a');
    expect(screen.getByText('Type at least 2 characters...')).toBeInTheDocument();
    expect(searchProjects).not.toHaveBeenCalled();
  });

  it('debounces the search by 300ms', async () => {
    const searchProjects = vi.fn().mockResolvedValue([]);
    renderWithApi(<ProjectsPage />, { overrides: { gitlab: { searchProjects } } });
    // Let the mount effect (loadWatchedProjects) settle under real timers
    // before switching to fake timers -- otherwise the pending findBy*
    // polling below never gets a real macrotask to run on.
    await screen.findByPlaceholderText('Search for a project...');

    vi.useFakeTimers();
    await typeWithFakeTimers(screen.getByPlaceholderText('Search for a project...'), 'api');
    vi.advanceTimersByTime(299);
    expect(searchProjects).not.toHaveBeenCalled();
    // `await act(...)` (rather than a bare `vi.advanceTimersByTime(1)`) so the
    // state update from the search promise settling is flushed and captured
    // by React before the test ends, instead of leaking into the next test
    // as an "update not wrapped in act(...)" warning.
    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });
    expect(searchProjects).toHaveBeenCalledWith('api');
    vi.useRealTimers();
  });

  it('shows "Searching..." while a search is in flight', async () => {
    vi.useFakeTimers();
    let resolveSearch: (value: (typeof apiProject)[]) => void = () => {};
    const searchProjects = vi.fn(
      () =>
        new Promise<(typeof apiProject)[]>((resolve) => {
          resolveSearch = resolve;
        })
    );
    renderWithApi(<ProjectsPage />, { overrides: { gitlab: { searchProjects } } });

    await typeWithFakeTimers(screen.getByPlaceholderText('Search for a project...'), 'api');
    vi.advanceTimersByTime(300);
    expect(screen.getByText('Searching...')).toBeInTheDocument();

    resolveSearch([apiProject]);
    vi.useRealTimers();
    expect(await screen.findByText('gitlab-bar')).toBeInTheDocument();
  });

  it('shows "No projects found" on empty results', async () => {
    vi.useFakeTimers();
    const searchProjects = vi.fn().mockResolvedValue([]);
    renderWithApi(<ProjectsPage />, { overrides: { gitlab: { searchProjects } } });

    await typeWithFakeTimers(screen.getByPlaceholderText('Search for a project...'), 'api');
    vi.advanceTimersByTime(300);
    vi.useRealTimers();

    expect(await screen.findByText('No projects found')).toBeInTheDocument();
  });

  it('shows "Error during search" on rejection', async () => {
    vi.useFakeTimers();
    const searchProjects = vi.fn().mockRejectedValue(new Error('boom'));
    renderWithApi(<ProjectsPage />, { overrides: { gitlab: { searchProjects } } });

    await typeWithFakeTimers(screen.getByPlaceholderText('Search for a project...'), 'api');
    vi.advanceTimersByTime(300);
    vi.useRealTimers();

    expect(await screen.findByText('Error during search')).toBeInTheDocument();
  });

  // Parity trap: search results show name + path_with_namespace, chips show
  // name only. See ProjectsPage.tsx's parity notes and task-9-report.md.
  it('shows name and path_with_namespace in search results', async () => {
    vi.useFakeTimers();
    const searchProjects = vi.fn().mockResolvedValue([apiProject]);
    renderWithApi(<ProjectsPage />, { overrides: { gitlab: { searchProjects } } });

    await typeWithFakeTimers(screen.getByPlaceholderText('Search for a project...'), 'api');
    vi.advanceTimersByTime(300);
    vi.useRealTimers();

    expect(await screen.findByText('gitlab-bar')).toBeInTheDocument();
    expect(screen.getByText('cyril/gitlab-bar')).toBeInTheDocument();
  });

  it('toggling a project persists both watchedProjectIds and watchedProjectsData, and shows a chip with only the name', async () => {
    vi.useFakeTimers();
    const searchProjects = vi.fn().mockResolvedValue([apiProject]);
    const { api } = renderWithApi(<ProjectsPage />, { overrides: { gitlab: { searchProjects } } });

    await typeWithFakeTimers(screen.getByPlaceholderText('Search for a project...'), 'api');
    vi.advanceTimersByTime(300);
    vi.useRealTimers();

    await screen.findByText('gitlab-bar');
    await userEvent.click(screen.getByText('gitlab-bar'));

    await waitFor(async () => {
      expect(await api.config.get('watchedProjectIds')).toEqual([1]);
    });
    expect(await api.config.get('watchedProjectsData')).toEqual([
      { id: 1, name: 'gitlab-bar', path: 'cyril/gitlab-bar' },
    ]);

    // Chip shows the project name only, never the namespace path.
    const chipTitle = screen.getByText('Watched projects', { selector: 'div' });
    const chipsSection = chipTitle.parentElement;
    expect(chipsSection).not.toBeNull();
    expect(within(chipsSection as HTMLElement).getByText('gitlab-bar')).toBeInTheDocument();
    expect(within(chipsSection as HTMLElement).queryByText('cyril/gitlab-bar')).not.toBeInTheDocument();
  });

  it('removing a chip persists the reduced list', async () => {
    const { api } = renderWithApi(<ProjectsPage />, {
      overrides: {
        config: {
          getAll: async () => ({
            refreshInterval: 60000,
            launchAtStartup: false,
            notifications: {
              enabled: true,
              newMRAssigned: true,
              mrMentioned: true,
              pipelineStarted: false,
              pipelineFailed: true,
              pipelineSuccess: false,
            },
            watchedProjectIds: [1, 2],
            watchedProjectsData: [
              { id: 1, name: 'gitlab-bar', path: 'cyril/gitlab-bar' },
              { id: 2, name: 'other-project', path: 'cyril/other-project' },
            ],
            theme: 'system',
            failedPipelineMaxAge: 24,
            showUnassignedMRs: false,
            dismissedPipelines: [],
            dismissedMRs: [],
            dismissedReleases: [],
            viewMode: 'developer',
            untagExcludedProjectIds: [],
          }),
        },
      },
    });

    await screen.findByText('gitlab-bar');
    expect(screen.getByText('other-project')).toBeInTheDocument();

    const chip = screen.getByText('gitlab-bar').closest('span');
    expect(chip).not.toBeNull();
    const removeButton = (chip as HTMLElement).querySelector('svg');
    expect(removeButton).not.toBeNull();
    await userEvent.click(removeButton as SVGElement);

    await waitFor(() => expect(screen.queryByText('gitlab-bar')).not.toBeInTheDocument());
    expect(screen.getByText('other-project')).toBeInTheDocument();

    await waitFor(async () => {
      expect(await api.config.get('watchedProjectIds')).toEqual([2]);
    });
    expect(await api.config.get('watchedProjectsData')).toEqual([
      { id: 2, name: 'other-project', path: 'cyril/other-project' },
    ]);
  });
});
