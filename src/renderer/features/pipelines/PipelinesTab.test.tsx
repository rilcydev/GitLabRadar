import userEvent from '@testing-library/user-event';
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Pipeline, PipelineJob } from '@/shared/types';
// Relative imports: eslint's import/no-unresolved has no TS-aware resolver
// for the `@/*` alias on value imports (see src/test/renderWithApi.tsx and
// src/renderer/api/FakeApi.ts for the same pre-existing gap).
import { DEFAULT_CONFIG } from '../../../shared/types/config';
import { renderWithApi } from '../../../test/renderWithApi';
import { DataProvider } from '../../windows/menubar/DataProvider';
import { getJobIcon } from './jobIcon';
import { PipelinesTab } from './PipelinesTab';

function renderTab(overrides?: Parameters<typeof renderWithApi>[1]) {
  return renderWithApi(
    <DataProvider>
      <PipelinesTab />
    </DataProvider>,
    overrides
  );
}

let nextId = 1000;

function makePipeline(overrides: Partial<Pipeline> = {}): Pipeline {
  const id = nextId++;
  return {
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
    ...overrides,
  };
}

function makeJob(overrides: Partial<PipelineJob> = {}): PipelineJob {
  return {
    id: nextId++,
    name: 'build',
    stage: 'build',
    status: 'success',
    webUrl: 'https://gitlab.example.com/jobs/1',
    ...overrides,
  };
}

async function pushPipelines(emit: ReturnType<typeof renderTab>['emit'], pipelines: Pipeline[]) {
  await act(async () => {
    emit.dataUpdated({
      mergeRequests: [],
      pipelines,
      releases: [],
      status: 'green',
      lastUpdated: new Date(),
    });
  });
}

describe('PipelinesTab', () => {
  // index.html:2246,2250,2257 -- ported markup keeps its source ids.
  it('keeps the source ids on the loading, empty and list containers', async () => {
    const { container, emit } = renderTab();
    // Loading state renders synchronously before the initial fetch settles.
    expect(container.querySelector('#pipelines-loading')).not.toBeNull();

    await screen.findByText('No Pipelines');
    expect(container.querySelector('#pipelines-empty')).not.toBeNull();

    const pipeline = makePipeline({ projectPath: 'group/has-list' });
    await pushPipelines(emit, [pipeline]);
    await screen.findByText('group/has-list');
    expect(container.querySelector('#pipelines-list')).not.toBeNull();
  });

  // index.html:2254-2255
  it('shows the empty state title and description when there are no pipelines', async () => {
    renderTab();
    expect(await screen.findByText('No Pipelines')).toBeInTheDocument();
    expect(
      screen.getByText('Active pipelines from your projects will appear here automatically')
    ).toBeInTheDocument();
  });

  // index.html:3017 -- `pipeline.projectPath || pipeline.projectName || 'Pipeline'`.
  describe('title fallback chain (index.html:3017)', () => {
    it('uses projectPath when present', async () => {
      const { emit } = renderTab();
      await pushPipelines(emit, [makePipeline({ projectPath: 'group/has-path', projectName: 'Has Name' })]);
      expect(await screen.findByText('group/has-path')).toBeInTheDocument();
      expect(screen.queryByText('Has Name')).not.toBeInTheDocument();
    });

    it('falls back to projectName when projectPath is empty', async () => {
      const { emit } = renderTab();
      await pushPipelines(emit, [makePipeline({ projectPath: '', projectName: 'Fallback Name' })]);
      expect(await screen.findByText('Fallback Name')).toBeInTheDocument();
    });

    it("falls back to the literal 'Pipeline' when neither projectPath nor projectName is set", async () => {
      const { emit } = renderTab();
      await pushPipelines(emit, [makePipeline({ projectPath: '', projectName: '', ref: 'unique-ref-for-this-test' })]);
      await screen.findByText('unique-ref-for-this-test');
      expect(screen.getByText('Pipeline')).toBeInTheDocument();
    });
  });

  // index.html:2984-2994 -- the triggering user.
  describe('triggering user', () => {
    it('shows the avatar image and name when the user has an avatar_url', async () => {
      const { emit } = renderTab();
      await pushPipelines(emit, [
        makePipeline({
          user: { id: 1, username: 'cyril', name: 'Cyril', avatar_url: 'https://example.com/a.png' },
        }),
      ]);
      const img = await screen.findByRole('img', { name: 'Cyril' });
      expect(img).toHaveAttribute('src', 'https://example.com/a.png');
      expect(screen.getByText('Cyril')).toBeInTheDocument();
      expect(screen.getByText('Triggered by')).toBeInTheDocument();
    });

    // index.html:2988-2990 -- unlike `Avatar`, no placeholder is rendered
    // when there's no avatar_url; the source shows nothing at all in its
    // place, not an initial-letter circle.
    it('renders no image at all (and no placeholder) when the user has no avatar_url', async () => {
      const { emit } = renderTab();
      await pushPipelines(emit, [
        makePipeline({ user: { id: 1, username: 'cyril', name: 'Cyril', avatar_url: '' } }),
      ]);
      await screen.findByText('Cyril');
      expect(screen.queryByRole('img')).not.toBeInTheDocument();
    });

    // index.html:2991 -- `pipeline.user.name || pipeline.user.username`.
    it('falls back to username when the user has no name', async () => {
      const { emit } = renderTab();
      await pushPipelines(emit, [
        makePipeline({ user: { id: 1, username: 'cyril-username', name: '', avatar_url: '' } }),
      ]);
      expect(await screen.findByText('cyril-username')).toBeInTheDocument();
    });

    it('renders no trigger section at all when there is no user', async () => {
      const { emit } = renderTab();
      await pushPipelines(emit, [makePipeline({ user: undefined, projectPath: 'group/no-user' })]);
      await screen.findByText('group/no-user');
      expect(screen.queryByText('Triggered by')).not.toBeInTheDocument();
    });
  });

  // index.html:2938-3041 -- job list with status icons/dots, grouped by stage.
  describe('job list', () => {
    it('shows one stage group with a job chip carrying the job name', async () => {
      const { emit } = renderTab();
      await pushPipelines(emit, [
        makePipeline({
          projectPath: 'group/has-jobs',
          jobs: [makeJob({ name: 'unit-tests', stage: 'test', status: 'success' })],
        }),
      ]);
      await screen.findByText('group/has-jobs');
      expect(screen.getByText('test')).toBeInTheDocument();
      expect(screen.getByText('unit-tests')).toBeInTheDocument();
    });

    // index.html:2973 -- the manual-only "▶" glyph.
    it('shows the manual-run glyph only for a manual job', async () => {
      const { emit } = renderTab();
      await pushPipelines(emit, [
        makePipeline({
          projectPath: 'group/has-manual',
          jobs: [
            makeJob({ name: 'deploy-to-prod', stage: 'deploy', status: 'manual' }),
            makeJob({ name: 'run-tests', stage: 'test', status: 'success' }),
          ],
        }),
      ]);
      await screen.findByText('deploy-to-prod');
      expect(screen.getByText('▶')).toBeInTheDocument();
    });

    it('renders no jobs section when the pipeline has no jobs', async () => {
      const { emit } = renderTab();
      await pushPipelines(emit, [makePipeline({ projectPath: 'group/no-jobs', jobs: [] })]);
      await screen.findByText('group/no-jobs');
      expect(screen.queryByText('build')).not.toBeInTheDocument();
    });

    // index.html:3058-3066 -- a job chip click opens the JOB's webUrl, not
    // the pipeline's, and doesn't also open the pipeline.
    it('opens the job webUrl (not the pipeline webUrl) when a job chip is clicked, without opening the pipeline', async () => {
      const openExternal = vi.fn().mockResolvedValue(undefined);
      const { emit } = renderTab({ overrides: { app: { openExternal } } });
      const pipeline = makePipeline({
        projectPath: 'group/job-click',
        webUrl: 'https://gitlab.example.com/pipelines/999',
        jobs: [makeJob({ name: 'deploy-job', stage: 'deploy', webUrl: 'https://gitlab.example.com/jobs/555' })],
      });
      await pushPipelines(emit, [pipeline]);
      await userEvent.click(await screen.findByText('deploy-job'));

      expect(openExternal).toHaveBeenCalledWith('https://gitlab.example.com/jobs/555');
      expect(openExternal).not.toHaveBeenCalledWith('https://gitlab.example.com/pipelines/999');
    });
  });

  // index.html:3046-3055
  it('opens the pipeline externally with its webUrl when the item is clicked', async () => {
    const openExternal = vi.fn().mockResolvedValue(undefined);
    const { emit } = renderTab({ overrides: { app: { openExternal } } });
    const pipeline = makePipeline({ projectPath: 'group/click-me', webUrl: 'https://gitlab.example.com/pipelines/42' });
    await pushPipelines(emit, [pipeline]);
    await userEvent.click(await screen.findByText('group/click-me'));

    expect(openExternal).toHaveBeenCalledWith('https://gitlab.example.com/pipelines/42');
  });

  // index.html:3069-3080
  it('calls gitlab.dismissPipeline with the pipeline id when the dismiss button is clicked', async () => {
    const dismissPipeline = vi.fn().mockResolvedValue(undefined);
    const { emit } = renderTab({ overrides: { gitlab: { dismissPipeline } } });
    const pipeline = makePipeline({ projectPath: 'group/to-dismiss' });
    await pushPipelines(emit, [pipeline]);
    await screen.findByText('group/to-dismiss');

    await userEvent.click(screen.getByTitle('Hide this pipeline'));

    expect(dismissPipeline).toHaveBeenCalledWith(pipeline.id);
  });

  it('does not open the pipeline when the dismiss button is clicked', async () => {
    const openExternal = vi.fn().mockResolvedValue(undefined);
    const dismissPipeline = vi.fn().mockResolvedValue(undefined);
    const { emit } = renderTab({ overrides: { app: { openExternal }, gitlab: { dismissPipeline } } });
    const pipeline = makePipeline({ projectPath: 'group/no-open-on-dismiss' });
    await pushPipelines(emit, [pipeline]);
    await screen.findByText('group/no-open-on-dismiss');

    await userEvent.click(screen.getByTitle('Hide this pipeline'));

    expect(dismissPipeline).toHaveBeenCalled();
    expect(openExternal).not.toHaveBeenCalled();
  });

  // index.html:2929-2936,3082-3092
  it('shows the dismissed-notice with a "Show all" button that calls restorePipelines', async () => {
    const restorePipelines = vi.fn().mockResolvedValue(undefined);
    const dismissed = makePipeline({ projectPath: 'group/hidden-one' });
    const { emit } = renderTab({
      overrides: {
        gitlab: { restorePipelines },
        config: { getAll: async () => ({ ...DEFAULT_CONFIG, dismissedPipelines: [dismissed.id] }) },
      },
    });
    const visible = makePipeline({ projectPath: 'group/visible-one' });
    await pushPipelines(emit, [dismissed, visible]);

    expect(await screen.findByText('1 pipeline hidden')).toBeInTheDocument();
    expect(screen.getByText('group/visible-one')).toBeInTheDocument();
    expect(screen.queryByText('group/hidden-one')).not.toBeInTheDocument();

    await userEvent.click(screen.getByText('Show all'));
    expect(restorePipelines).toHaveBeenCalled();
    expect(await screen.findByText('group/hidden-one')).toBeInTheDocument();
  });

  it('pluralizes the dismissed-notice count for more than one hidden pipeline', async () => {
    const a = makePipeline({ projectPath: 'group/a' });
    const b = makePipeline({ projectPath: 'group/b' });
    const { emit } = renderTab({
      overrides: {
        config: { getAll: async () => ({ ...DEFAULT_CONFIG, dismissedPipelines: [a.id, b.id] }) },
      },
    });
    await pushPipelines(emit, [a, b]);
    expect(await screen.findByText('2 pipelines hidden')).toBeInTheDocument();
  });
});

// index.html:3096-3108 -- `getJobIcon`'s exact status -> icon mapping.
// Ported per the task-16 brief even though it's dead code in the source
// (see jobIcon.tsx's doc comment for the grep evidence); tested directly
// here since it's never invoked from `PipelineRow`.
describe('getJobIcon', () => {
  function pathsOf(node: ReturnType<typeof getJobIcon>): string[] {
    const { container } = render(<>{node}</>);
    return [...container.querySelectorAll('path')].map((p) => p.getAttribute('d') ?? '');
  }

  it('running: pulses a partial-ring pause icon with the "running" class', () => {
    const { container } = render(<>{getJobIcon('running')}</>);
    const svg = container.querySelector('svg');
    expect(svg).toHaveClass('job-icon', 'running');
    expect(pathsOf(getJobIcon('running'))).toEqual([
      'M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0zM1.5 8a6.5 6.5 0 1 1 13 0 6.5 6.5 0 0 1-13 0z',
      'M8 3a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 3z',
    ]);
  });

  it('success: renders the checkmark path', () => {
    expect(pathsOf(getJobIcon('success'))).toEqual([
      'M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 1 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z',
    ]);
  });

  it('failed: renders the X path', () => {
    expect(pathsOf(getJobIcon('failed'))).toEqual([
      'M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06z',
    ]);
  });

  it('pending: renders a filled circle', () => {
    const { container } = render(<>{getJobIcon('pending')}</>);
    const circle = container.querySelector('circle');
    expect(circle).toHaveAttribute('r', '3');
  });

  it('skipped: renders the double-bar path', () => {
    expect(pathsOf(getJobIcon('skipped'))).toEqual([
      'M6.5 3.5a.5.5 0 0 1 .5.5v8a.5.5 0 0 1-1 0V4a.5.5 0 0 1 .5-.5zm3 0a.5.5 0 0 1 .5.5v8a.5.5 0 0 1-1 0V4a.5.5 0 0 1 .5-.5z',
    ]);
  });

  it('canceled: renders the ring-with-square path', () => {
    expect(pathsOf(getJobIcon('canceled'))).toEqual([
      'M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0zM5.5 5.5h5v5h-5v-5z',
    ]);
  });

  it('manual: renders the plus path', () => {
    expect(pathsOf(getJobIcon('manual'))).toEqual([
      'M8 4a.75.75 0 0 1 .75.75v6.5a.75.75 0 0 1-1.5 0v-6.5A.75.75 0 0 1 8 4z',
      'M4.75 7.25a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5z',
    ]);
  });

  it('created: renders a small filled circle', () => {
    const { container } = render(<>{getJobIcon('created')}</>);
    const circle = container.querySelector('circle');
    expect(circle).toHaveAttribute('r', '2');
  });

  // index.html:3107 -- `icons[status] || icons.created`.
  it('falls back to the created icon for an unrecognized status', () => {
    const { container: createdContainer } = render(<>{getJobIcon('created')}</>);
    const { container: unknownContainer } = render(<>{getJobIcon('some-unknown-status')}</>);
    expect(unknownContainer.querySelector('svg')?.outerHTML).toEqual(createdContainer.querySelector('svg')?.outerHTML);
  });
});
