import userEvent from '@testing-library/user-event';
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { TestNotificationOutcome } from '@/shared/api/contract';
import { renderWithApi } from '../../../../test/renderWithApi';
import { GeneralPage } from './GeneralPage';

describe('GeneralPage', () => {
  it('renders the page title and description verbatim (preferences.html:873-874)', async () => {
    renderWithApi(<GeneralPage />);
    expect(await screen.findByText('Settings')).toBeInTheDocument();
    expect(
      screen.getByText("Customize GitLabBar's behavior according to your preferences.")
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

  // Pre-existing bug reproduced from preferences.html:1112:
  // `failedPipelineMaxAge.value = config.failedPipelineMaxAge || 24` treats
  // a stored `0` ("Never hide") as falsy and displays 24 instead. Strict
  // parity: reproduced, not fixed. See task-10-report.md.
  it('BUG (reproduced from source): a stored failedPipelineMaxAge of 0 displays as 24, not "Never hide"', async () => {
    const { container } = renderWithApi(<GeneralPage />, {
      overrides: {
        config: { getAll: async () => ({ ...(await realDefaultConfig()), failedPipelineMaxAge: 0 }) },
      },
    });

    await waitFor(() => {
      const el = container.querySelector<HTMLSelectElement>('#failedPipelineMaxAge');
      expect(el?.value).toBe('24');
    });
  });

  // preferences.html:947-971 markup + the absence of any script wiring for
  // these two ids anywhere in the file (grepped). Dead checkboxes: always
  // rendered checked regardless of `notifications.newMRAssigned` /
  // `notifications.pipelineFailed`, and clicking them never calls
  // `config.set`. The task-10 brief describes these as bound to config --
  // the real source contradicts that; reproduced as-is per the source-wins
  // rule. See task-10-report.md.
  it('BUG (reproduced from source): notifyNewMR and notifyFailedPipeline are dead checkboxes with no config I/O', async () => {
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
              pipelineFailed: false,
              pipelineSuccess: false,
            },
          }),
        },
      },
    });

    const newMR = await waitFor(() => {
      const el = container.querySelector<HTMLInputElement>('#notifyNewMR');
      expect(el).not.toBeNull();
      return el as HTMLInputElement;
    });
    const failedPipeline = container.querySelector<HTMLInputElement>('#notifyFailedPipeline') as HTMLInputElement;

    // Rendered checked even though the *displayed* config (via the
    // overridden config.getAll above) says both are false -- proves these
    // two checkboxes never read from config at all.
    expect(newMR.checked).toBe(true);
    expect(failedPipeline.checked).toBe(true);

    // Snapshot the real underlying store (untouched by the getAll override
    // above, which only changes what getAll() *returns* -- config.get()
    // still reads the real FakeApi store, seeded from DEFAULT_CONFIG).
    const notificationsBeforeClick = await api.config.get('notifications');

    await userEvent.click(newMR);
    await userEvent.click(failedPipeline);
    // Native checkbox behaviour still toggles the DOM node itself...
    expect(newMR.checked).toBe(false);
    expect(failedPipeline.checked).toBe(false);
    // ...but nothing was ever persisted: the store is bit-for-bit the same
    // object it was before either click, proving no `config.set` call for
    // `notifications` ever happened.
    const notificationsAfterClick = await api.config.get('notifications');
    expect(notificationsAfterClick).toEqual(notificationsBeforeClick);
  });

  // New feature, not ported from preferences.html -- see the module doc
  // comment on GeneralPage.tsx and test-notification-button-report.md. The
  // button must call the real command (not just render) and, per the task,
  // report what api.app.sendTestNotification() actually resolves rather
  // than assuming success.
  it('calls api.app.sendTestNotification when the button is clicked', async () => {
    let calls = 0;
    renderWithApi(<GeneralPage />, {
      overrides: {
        app: {
          sendTestNotification: async () => {
            calls += 1;
            return { status: 'shown' };
          },
        },
      },
    });

    await userEvent.click(screen.getByRole('button', { name: 'Send a test notification' }));
    await waitFor(() => expect(calls).toBe(1));
  });

  it('shows a distinct "displayed" message for the shown outcome', async () => {
    renderWithApi(<GeneralPage />, {
      overrides: { app: { sendTestNotification: async () => ({ status: 'shown' }) } },
    });

    await userEvent.click(screen.getByRole('button', { name: 'Send a test notification' }));

    expect(await screen.findByText(/^Notification displayed\./)).toBeInTheDocument();
  });

  it('shows the failure reason distinctly for the failed outcome', async () => {
    renderWithApi(<GeneralPage />, {
      overrides: {
        app: {
          sendTestNotification: async () => ({ status: 'failed', error: 'not code-signed' }),
        },
      },
    });

    await userEvent.click(screen.getByRole('button', { name: 'Send a test notification' }));

    expect(
      await screen.findByText('Notification failed to display: not code-signed')
    ).toBeInTheDocument();
  });

  it('shows a distinct "no response" message for the timeout outcome, never claiming success', async () => {
    renderWithApi(<GeneralPage />, {
      overrides: { app: { sendTestNotification: async () => ({ status: 'timeout' }) } },
    });

    await userEvent.click(screen.getByRole('button', { name: 'Send a test notification' }));

    const message = await screen.findByText(/^No response from macOS after 5 seconds\./);
    expect(message).toBeInTheDocument();
    expect(message.textContent).not.toMatch(/displayed/i);
  });

  it('renders no test-notification status message before the button is clicked', () => {
    renderWithApi(<GeneralPage />);
    expect(screen.queryByText(/Notification displayed/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Notification failed/)).not.toBeInTheDocument();
    expect(screen.queryByText(/No response from macOS/)).not.toBeInTheDocument();
  });

  it('gives each of the three outcomes its own message and its own status class, none shared', async () => {
    const outcomes: TestNotificationOutcome[] = [
      { status: 'shown' },
      { status: 'failed', error: 'boom' },
      { status: 'timeout' },
    ];

    const seenTexts = new Set<string>();
    const seenClassNames = new Set<string>();

    for (const outcome of outcomes) {
      const { container, unmount } = renderWithApi(<GeneralPage />, {
        overrides: { app: { sendTestNotification: async () => outcome } },
      });

      await userEvent.click(screen.getByRole('button', { name: 'Send a test notification' }));

      const messageEl = await waitFor(() => {
        const el = container.querySelector('[class*="testNotificationStatus"]');
        expect(el).not.toBeNull();
        return el as HTMLElement;
      });

      seenTexts.add(messageEl.textContent ?? '');
      seenClassNames.add(messageEl.className);

      unmount();
    }

    expect(seenTexts.size).toBe(3);
    expect(seenClassNames.size).toBe(3);
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
    },
    watchedProjectIds: [],
    watchedProjectsData: [],
    theme: 'system' as const,
    failedPipelineMaxAge: 24,
    showUnassignedMRs: false,
    dismissedPipelines: [],
    dismissedMRs: [],
    dismissedReleases: [],
    viewMode: 'developer' as const,
    untagExcludedProjectIds: [],
  };
}
