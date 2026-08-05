import userEvent from '@testing-library/user-event';
import { act, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Pipeline, PipelineJob } from '@/shared/types';
// Relative imports: eslint's import/no-unresolved has no TS-aware resolver
// for the `@/*` alias on value imports (see src/test/renderWithApi.tsx and
// src/renderer/api/FakeApi.ts for the same pre-existing gap).
import { DEFAULT_CONFIG } from '../../../shared/types/config';
import { renderWithApi } from '../../../test/renderWithApi';
import { DataProvider } from '../../windows/menubar/DataProvider';
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

    // index.html:3062-3064 -- `if (url && ...)`. A falsy `webUrl` must be a
    // no-op, not a call to `openExternal('')`. Pairs with the test above,
    // which proves the truthy side of the same branch -- together they pin
    // both sides.
    it('does not call openExternal when a job chip with an empty webUrl is clicked', async () => {
      const openExternal = vi.fn().mockResolvedValue(undefined);
      const { emit } = renderTab({ overrides: { app: { openExternal } } });
      const pipeline = makePipeline({
        projectPath: 'group/job-no-url',
        jobs: [makeJob({ name: 'no-url-job', stage: 'deploy', webUrl: '' })],
      });
      await pushPipelines(emit, [pipeline]);
      await userEvent.click(await screen.findByText('no-url-job'));

      expect(openExternal).not.toHaveBeenCalled();
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
