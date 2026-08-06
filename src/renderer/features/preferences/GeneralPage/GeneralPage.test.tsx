import userEvent from '@testing-library/user-event';
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithApi } from '../../../../test/renderWithApi';
import { GeneralPage } from './GeneralPage';

describe('GeneralPage', () => {
  it('renders the page title and description verbatim (preferences.html:873-874)', async () => {
    renderWithApi(<GeneralPage />);
    expect(await screen.findByText('Settings')).toBeInTheDocument();
    expect(
      screen.getByText("Customize GitLabRadar's behavior according to your preferences.")
    ).toBeInTheDocument();
  });

  it('loads launchAtStartup from config.getAll() and writes it back as a boolean on change', async () => {
    const { api, container } = renderWithApi(<GeneralPage />, {
      overrides: { config: { getAll: async () => ({ ...(await realDefaultConfig()), launchAtStartup: true }) } },
    });

    const checkbox = await waitFor(() => {
      const el = container.querySelector<HTMLInputElement>('#launchAtStartup');
      expect(el).not.toBeNull();
      expect(el?.checked).toBe(true);
      return el as HTMLInputElement;
    });

    await userEvent.click(checkbox);
    expect(checkbox.checked).toBe(false);
    await waitFor(async () => {
      expect(await api.config.get('launchAtStartup')).toBe(false);
    });
  });

  it('loads showUnassignedMRs from config.getAll() and writes it back as a boolean on change', async () => {
    const { api, container } = renderWithApi(<GeneralPage />, {
      overrides: { config: { getAll: async () => ({ ...(await realDefaultConfig()), showUnassignedMRs: false }) } },
    });

    const checkbox = await waitFor(() => {
      const el = container.querySelector<HTMLInputElement>('#showUnassignedMRs');
      expect(el).not.toBeNull();
      expect(el?.checked).toBe(false);
      return el as HTMLInputElement;
    });

    await userEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);
    await waitFor(async () => {
      expect(await api.config.get('showUnassignedMRs')).toBe(true);
    });
  });

  it('loads showCommentedMRs from config.getAll() and writes it back on change', async () => {
    const { api, container } = renderWithApi(<GeneralPage />, {
      overrides: { config: { getAll: async () => ({ ...(await realDefaultConfig()), showCommentedMRs: false }) } },
    });

    const checkbox = await waitFor(() => {
      const el = container.querySelector<HTMLInputElement>('#showCommentedMRs');
      expect(el).not.toBeNull();
      expect(el?.checked).toBe(false);
      return el as HTMLInputElement;
    });

    await userEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);
    await waitFor(async () => {
      expect(await api.config.get('showCommentedMRs')).toBe(true);
    });
  });

  it('loads viewMode from config.getAll() and writes it back as a string on change (preferences.html:895-898)', async () => {
    const { api, container } = renderWithApi(<GeneralPage />, {
      overrides: { config: { getAll: async () => ({ ...(await realDefaultConfig()), viewMode: 'developer' }) } },
    });

    const select = await waitFor(() => {
      const el = container.querySelector<HTMLSelectElement>('#viewMode');
      expect(el?.value).toBe('developer');
      return el as HTMLSelectElement;
    });

    await userEvent.selectOptions(select, 'productOwner');
    await waitFor(async () => {
      const stored = await api.config.get('viewMode');
      expect(stored).toBe('productOwner');
      expect(typeof stored).toBe('string');
    });
  });

  it('exposes the exact viewMode options from preferences.html:896-897', async () => {
    const { container } = renderWithApi(<GeneralPage />);
    const select = await waitFor(() => container.querySelector<HTMLSelectElement>('#viewMode') as HTMLSelectElement);
    const options = Array.from(select.options).map((o) => ({ value: o.value, label: o.textContent }));
    expect(options).toEqual([
      { value: 'developer', label: 'Developer' },
      { value: 'productOwner', label: 'Product Owner' },
    ]);
  });

  it('loads refreshInterval from config.getAll() and writes it back as a number on change (preferences.html:906-911)', async () => {
    const { api, container } = renderWithApi(<GeneralPage />, {
      overrides: { config: { getAll: async () => ({ ...(await realDefaultConfig()), refreshInterval: 60000 }) } },
    });

    const select = await waitFor(() => {
      const el = container.querySelector<HTMLSelectElement>('#refreshInterval');
      expect(el?.value).toBe('60000');
      return el as HTMLSelectElement;
    });

    await userEvent.selectOptions(select, '300000');
    await waitFor(async () => {
      const stored = await api.config.get('refreshInterval');
      expect(stored).toBe(300000);
      expect(typeof stored).toBe('number');
    });
  });

  it('exposes the exact refreshInterval options from preferences.html:907-910', async () => {
    const { container } = renderWithApi(<GeneralPage />);
    const select = await waitFor(
      () => container.querySelector<HTMLSelectElement>('#refreshInterval') as HTMLSelectElement
    );
    const options = Array.from(select.options).map((o) => ({ value: o.value, label: o.textContent }));
    expect(options).toEqual([
      { value: '30000', label: '30 seconds' },
      { value: '60000', label: '1 minute' },
      { value: '120000', label: '2 minutes' },
      { value: '300000', label: '5 minutes' },
    ]);
  });

  it('loads failedPipelineMaxAge from config.getAll() and writes it back as a number on change (preferences.html:918-928)', async () => {
    const { api, container } = renderWithApi(<GeneralPage />, {
      overrides: {
        config: { getAll: async () => ({ ...(await realDefaultConfig()), failedPipelineMaxAge: 24 }) },
      },
    });

    const select = await waitFor(() => {
      const el = container.querySelector<HTMLSelectElement>('#failedPipelineMaxAge');
      expect(el?.value).toBe('24');
      return el as HTMLSelectElement;
    });

    await userEvent.selectOptions(select, '72');
    await waitFor(async () => {
      const stored = await api.config.get('failedPipelineMaxAge');
      expect(stored).toBe(72);
      expect(typeof stored).toBe('number');
    });
  });

  it('exposes the exact failedPipelineMaxAge options from preferences.html:919-927, including 0 = "Never hide"', async () => {
    const { container } = renderWithApi(<GeneralPage />);
    const select = await waitFor(
      () => container.querySelector<HTMLSelectElement>('#failedPipelineMaxAge') as HTMLSelectElement
    );
    const options = Array.from(select.options).map((o) => ({ value: o.value, label: o.textContent }));
    expect(options).toEqual([
      { value: '1', label: '1 hour' },
      { value: '2', label: '2 hours' },
      { value: '6', label: '6 hours' },
      { value: '12', label: '12 hours' },
      { value: '24', label: '24 hours' },
      { value: '48', label: '48 hours' },
      { value: '72', label: '72 hours (3 days)' },
      { value: '168', label: '168 hours (1 week)' },
      { value: '0', label: 'Never hide' },
    ]);
  });

  // Fix (bug lot, was preferences.html:1112): a stored `0` ("Never hide")
  // must survive a reload. The source used `config.failedPipelineMaxAge || 24`,
  // treating the legitimate `0` as falsy and reverting the display to 24;
  // fixed to `?? 24` so only null/undefined falls back to the default.
  it('displays a stored failedPipelineMaxAge of 0 as "Never hide" (0), not 24', async () => {
    const { container } = renderWithApi(<GeneralPage />, {
      overrides: {
        config: { getAll: async () => ({ ...(await realDefaultConfig()), failedPipelineMaxAge: 0 }) },
      },
    });

    await waitFor(() => {
      const el = container.querySelector<HTMLSelectElement>('#failedPipelineMaxAge');
      expect(el?.value).toBe('0');
    });
  });

  // Fix (bug lot, was preferences.html:947-971): the two notification toggles
  // were dead (uncontrolled `defaultChecked`, no config I/O). They now load
  // from `notifications.newMRAssigned` / `notifications.pipelineFailed` and
  // persist changes via `config.set('notifications', ...)`.
  it('loads the notification toggles from config.notifications and writes them back on change', async () => {
    const { api, container } = renderWithApi(<GeneralPage />, {
      overrides: {
        config: {
          getAll: async () => ({
            ...(await realDefaultConfig()),
            notifications: {
              enabled: true,
              newMRAssigned: false,
              mrMentioned: true,
              pipelineStarted: false,
              pipelineFailed: true,
              pipelineSuccess: false,
              mrApproved: true,
            },
          }),
        },
      },
    });

    const newMR = await waitFor(() => {
      const el = container.querySelector<HTMLInputElement>('#notifyNewMR');
      expect(el).not.toBeNull();
      // Reflects config.notifications.newMRAssigned (false), not a hardcoded default.
      expect(el?.checked).toBe(false);
      return el as HTMLInputElement;
    });
    const failedPipeline = container.querySelector<HTMLInputElement>('#notifyFailedPipeline') as HTMLInputElement;
    // Reflects config.notifications.pipelineFailed (true).
    expect(failedPipeline.checked).toBe(true);

    await userEvent.click(newMR);
    expect(newMR.checked).toBe(true);
    await waitFor(async () => {
      expect((await api.config.get('notifications')).newMRAssigned).toBe(true);
    });

    await userEvent.click(failedPipeline);
    expect(failedPipeline.checked).toBe(false);
    await waitFor(async () => {
      expect((await api.config.get('notifications')).pipelineFailed).toBe(false);
    });
  });

  it('loads and persists the "MR approved" notification toggle', async () => {
    const { api, container } = renderWithApi(<GeneralPage />, {
      overrides: {
        config: {
          getAll: async () => ({
            ...(await realDefaultConfig()),
            notifications: {
              enabled: true,
              newMRAssigned: true,
              mrMentioned: true,
              pipelineStarted: false,
              pipelineFailed: true,
              pipelineSuccess: false,
              mrApproved: false,
            },
          }),
        },
      },
    });
    const toggle = await waitFor(() => {
      const el = container.querySelector<HTMLInputElement>('#notifyMRApproved');
      expect(el).not.toBeNull();
      expect(el?.checked).toBe(false);
      return el as HTMLInputElement;
    });
    await userEvent.click(toggle);
    await waitFor(async () => {
      expect((await api.config.get('notifications')).mrApproved).toBe(true);
    });
  });

  it('fires a test notification when the "Send a test notification" button is clicked', async () => {
    const sendTestNotification = vi.fn(async () => {});
    renderWithApi(<GeneralPage />, { overrides: { app: { sendTestNotification } } });

    const button = await screen.findByRole('button', { name: /send a test notification/i });
    await userEvent.click(button);

    expect(sendTestNotification).toHaveBeenCalledTimes(1);
  });
});

// Minimal stand-in for DEFAULT_CONFIG, spelled out locally (rather than
// imported) so each test above can override exactly the one field under
// test via a spread without depending on shared/types/config's internals
// changing shape silently.
async function realDefaultConfig() {
  return {
    refreshInterval: 60000,
    launchAtStartup: false,
    notifications: {
      enabled: true,
      newMRAssigned: true,
      mrMentioned: true,
      pipelineStarted: false,
      pipelineFailed: true,
      pipelineSuccess: false,
      mrApproved: true,
    },
    watchedProjectIds: [],
    watchedProjectsData: [],
    theme: 'system' as const,
    failedPipelineMaxAge: 24,
    showUnassignedMRs: false,
    showCommentedMRs: false,
    dismissedPipelines: [],
    dismissedMRs: [],
    dismissedReleases: [],
    viewMode: 'developer' as const,
    untagExcludedProjectIds: [],
  };
}
