import userEvent from '@testing-library/user-event';
import { act, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Deployment, Release } from '@/shared/types';
// Relative imports: eslint's import/no-unresolved has no TS-aware resolver
// for the `@/*` alias on value imports (see src/test/renderWithApi.tsx and
// src/renderer/api/FakeApi.ts for the same pre-existing gap).
import { DEFAULT_CONFIG } from '../../../shared/types/config';
import { renderWithApi } from '../../../test/renderWithApi';
import { DataProvider } from '../../windows/menubar/DataProvider';
import { ReleasesTab } from './ReleasesTab';

function renderTab(overrides?: Parameters<typeof renderWithApi>[1]) {
  return renderWithApi(
    <DataProvider>
      <ReleasesTab />
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

function makeDeployment(overrides: Partial<Deployment> = {}): Deployment {
  return {
    id: nextId++,
    status: 'success',
    environment: 'production',
    webUrl: 'https://gitlab.example.com/deployments/1',
    ...overrides,
  };
}

async function pushReleases(emit: ReturnType<typeof renderTab>['emit'], releases: Release[]) {
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

describe('ReleasesTab', () => {
  // index.html:3125,3126,3125(list) -- ported markup keeps its source ids.
  it('keeps the source ids on the loading, empty and list containers', async () => {
    const { container, emit } = renderTab();
    expect(container.querySelector('#releases-loading')).not.toBeNull();

    await screen.findByText('No Releases');
    expect(container.querySelector('#releases-empty')).not.toBeNull();

    const release = makeRelease({ projectPath: 'group/has-list' });
    await pushReleases(emit, [release]);
    await screen.findByText('group/has-list');
    expect(container.querySelector('#releases-list')).not.toBeNull();
  });

  it('shows the empty state title and description when there are no releases', async () => {
    renderTab();
    expect(await screen.findByText('No Releases')).toBeInTheDocument();
    expect(screen.getByText('Configure projects to follow in preferences to see their releases')).toBeInTheDocument();
  });

  it('calls app.showPreferences() from the empty-state "Configure projects" button', async () => {
    const showPreferences = vi.fn().mockResolvedValue(undefined);
    renderTab({ overrides: { app: { showPreferences } } });
    await userEvent.click(await screen.findByText('Configure projects'));
    expect(showPreferences).toHaveBeenCalled();
  });

  // index.html:3157 -- `release.projectPath || release.projectName || 'Unknown'`.
  describe('grouping key fallback chain (index.html:3157)', () => {
    it('groups under projectPath when present', async () => {
      const { emit } = renderTab();
      await pushReleases(emit, [makeRelease({ projectPath: 'group/has-path', projectName: 'Has Name' })]);
      expect(await screen.findByText('group/has-path')).toBeInTheDocument();
      expect(screen.queryByText('Has Name')).not.toBeInTheDocument();
    });

    it('falls back to projectName when projectPath is empty', async () => {
      const { emit } = renderTab();
      await pushReleases(emit, [makeRelease({ projectPath: '', projectName: 'Fallback Name' })]);
      expect(await screen.findByText('Fallback Name')).toBeInTheDocument();
    });

    it("falls back to the literal 'Unknown' when neither projectPath nor projectName is set", async () => {
      const { emit } = renderTab();
      await pushReleases(emit, [makeRelease({ projectPath: '', projectName: '', tagName: 'unique-tag-for-this-test' })]);
      await screen.findByText('unique-tag-for-this-test');
      expect(screen.getByText('Unknown')).toBeInTheDocument();
    });
  });

  // index.html:3154-3162 -- NOT sorted, unlike POView's grouping
  // (index.html:3376). Grouped in first-seen order.
  it('does not sort project groups -- preserves first-seen order', async () => {
    const { container, emit } = renderTab();
    await pushReleases(emit, [
      makeRelease({ projectPath: 'zzz/last-alphabetically', tagName: 'v-z' }),
      makeRelease({ projectPath: 'aaa/first-alphabetically', tagName: 'v-a' }),
    ]);
    await screen.findByText('v-z');
    const headings = [...container.querySelectorAll('span')]
      .map((el) => el.textContent)
      .filter((t) => t === 'zzz/last-alphabetically' || t === 'aaa/first-alphabetically');
    expect(headings).toEqual(['zzz/last-alphabetically', 'aaa/first-alphabetically']);
  });

  it('shows the tagName when name is empty', async () => {
    const { emit } = renderTab();
    await pushReleases(emit, [makeRelease({ name: '', tagName: 'v9.9.9', projectPath: 'group/name-fallback' })]);
    await screen.findByText('group/name-fallback');
    // The tag name appears both as the title fallback and the release-tag badge.
    expect(screen.getAllByText('v9.9.9').length).toBeGreaterThanOrEqual(1);
  });

  // index.html:3204-3211 -- no deployments at all.
  it('shows "Not deployed" when a release has no deployments', async () => {
    const { emit } = renderTab();
    await pushReleases(emit, [makeRelease({ projectPath: 'group/no-deploys', deployments: [] })]);
    await screen.findByText('group/no-deploys');
    expect(screen.getByText('Not deployed')).toBeInTheDocument();
  });

  // index.html:3188-3231 -- deployment status text/env/trigger/time.
  it('shows deployment status text, environment, trigger and time for each deployment', async () => {
    const { emit } = renderTab();
    await pushReleases(emit, [
      makeRelease({
        projectPath: 'group/has-deploys',
        deployments: [
          makeDeployment({
            status: 'success',
            environment: 'production',
            deployedAt: '2026-01-01T10:00:00Z',
            triggeredBy: { name: 'Alice', username: 'alice', avatar_url: '' },
          }),
        ],
      }),
    ]);
    await screen.findByText('group/has-deploys');
    expect(screen.getByText('Deployed')).toBeInTheDocument();
    expect(screen.getByText('production')).toBeInTheDocument();
    expect(screen.getByText('by Alice')).toBeInTheDocument();
  });

  it('does not show a trigger line when a deployment has no triggeredBy', async () => {
    const { emit } = renderTab();
    await pushReleases(emit, [
      makeRelease({
        projectPath: 'group/no-trigger',
        deployments: [makeDeployment({ status: 'running', environment: 'staging', triggeredBy: undefined })],
      }),
    ]);
    await screen.findByText('group/no-trigger');
    expect(screen.getByText('Deploying...')).toBeInTheDocument();
    expect(screen.queryByText(/^by /)).not.toBeInTheDocument();
  });

  // index.html:3046-3055-equivalent for releases (:3260-3269).
  it('opens the release externally with its webUrl when the item is clicked', async () => {
    const openExternal = vi.fn().mockResolvedValue(undefined);
    const { emit } = renderTab({ overrides: { app: { openExternal } } });
    const release = makeRelease({
      projectPath: 'group/click-me',
      name: 'Click Target Release',
      webUrl: 'https://gitlab.example.com/release/42',
    });
    await pushReleases(emit, [release]);
    // The clickable item's own content (its title), not the section header
    // (the project path) -- those are two different elements.
    await userEvent.click(await screen.findByText('Click Target Release'));

    expect(openExternal).toHaveBeenCalledWith('https://gitlab.example.com/release/42');
  });

  // index.html:3272-3283
  it('calls gitlab.dismissRelease with the release id when the dismiss button is clicked', async () => {
    const dismissRelease = vi.fn().mockResolvedValue(undefined);
    const { emit } = renderTab({ overrides: { gitlab: { dismissRelease } } });
    const release = makeRelease({ projectPath: 'group/to-dismiss' });
    await pushReleases(emit, [release]);
    await screen.findByText('group/to-dismiss');

    await userEvent.click(screen.getByTitle('Hide this release'));

    expect(dismissRelease).toHaveBeenCalledWith(release.id);
  });

  it('does not open the release when the dismiss button is clicked', async () => {
    const openExternal = vi.fn().mockResolvedValue(undefined);
    const dismissRelease = vi.fn().mockResolvedValue(undefined);
    const { emit } = renderTab({ overrides: { app: { openExternal }, gitlab: { dismissRelease } } });
    const release = makeRelease({ projectPath: 'group/no-open-on-dismiss' });
    await pushReleases(emit, [release]);
    await screen.findByText('group/no-open-on-dismiss');

    await userEvent.click(screen.getByTitle('Hide this release'));

    expect(dismissRelease).toHaveBeenCalled();
    expect(openExternal).not.toHaveBeenCalled();
  });

  // index.html:3167-3174,3285-3295
  it('shows the dismissed-notice with a "Show all" button that calls restoreReleases', async () => {
    const restoreReleases = vi.fn().mockResolvedValue(undefined);
    const dismissed = makeRelease({ projectPath: 'group/hidden-one' });
    const { emit } = renderTab({
      overrides: {
        gitlab: { restoreReleases },
        config: { getAll: async () => ({ ...DEFAULT_CONFIG, dismissedReleases: [dismissed.id] }) },
      },
    });
    const visible = makeRelease({ projectPath: 'group/visible-one' });
    await pushReleases(emit, [dismissed, visible]);

    expect(await screen.findByText('1 release hidden')).toBeInTheDocument();
    expect(screen.getByText('group/visible-one')).toBeInTheDocument();
    expect(screen.queryByText('group/hidden-one')).not.toBeInTheDocument();

    await userEvent.click(screen.getByText('Show all'));
    expect(restoreReleases).toHaveBeenCalled();
    expect(await screen.findByText('group/hidden-one')).toBeInTheDocument();
  });

  it('pluralizes the dismissed-notice count for more than one hidden release', async () => {
    const a = makeRelease({ projectPath: 'group/a' });
    const b = makeRelease({ projectPath: 'group/b' });
    const { emit } = renderTab({
      overrides: {
        config: { getAll: async () => ({ ...DEFAULT_CONFIG, dismissedReleases: [a.id, b.id] }) },
      },
    });
    await pushReleases(emit, [a, b]);
    expect(await screen.findByText('2 releases hidden')).toBeInTheDocument();
  });

  // Preserved bug pin (Task 17 brief): unlike MR's/pipeline's dismiss
  // button (index.html:2841,3027 -- `style="opacity: 0.5;"`, an inline
  // style that always wins over the CSS `:hover` rule), the release dismiss
  // button (index.html:3248-3250) carries NO such inline style. Reproduced
  // literally, not harmonised: the pattern this repo pins deliberate
  // porting decisions with (see Avatar.test.tsx:83) applied here to a
  // cross-tab INCONSISTENCY rather than a single crash risk.
  it('does NOT set an inline opacity style on the dismiss button (unlike MR/pipeline rows)', async () => {
    const { emit } = renderTab();
    await pushReleases(emit, [makeRelease({ projectPath: 'group/no-inline-opacity' })]);
    await screen.findByText('group/no-inline-opacity');

    const dismissBtn = screen.getByTitle('Hide this release');
    expect(dismissBtn.style.opacity).toBe('');
  });
});
