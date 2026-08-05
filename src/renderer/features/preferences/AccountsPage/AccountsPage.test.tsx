import userEvent from '@testing-library/user-event';
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithApi } from '../../../../test/renderWithApi';
import { AccountsPage } from './AccountsPage';

const account = {
  id: 'a1',
  name: 'Work',
  instanceUrl: 'https://gitlab.example.com',
  username: 'cyril',
  isActive: true,
};

describe('AccountsPage', () => {
  it('lists existing accounts', async () => {
    renderWithApi(<AccountsPage />, {
      overrides: { accounts: { getAll: async () => [account] } },
    });
    expect(await screen.findByText('Work')).toBeInTheDocument();
  });

  it('shows an initial-letter avatar and never an <img> element (preferences.html:1026 has no avatarUrl/onerror handling)', async () => {
    renderWithApi(<AccountsPage />, {
      overrides: { accounts: { getAll: async () => [{ ...account, avatarUrl: 'https://example.com/broken.png' }] } },
    });
    expect(await screen.findByText('W')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('shows the empty state when there are no accounts', async () => {
    renderWithApi(<AccountsPage />, {
      overrides: { accounts: { getAll: async () => [] } },
    });
    expect(await screen.findByText('No accounts configured')).toBeInTheDocument();
  });

  it('validates the token before adding an account', async () => {
    const validateToken = vi.fn().mockResolvedValue({
      valid: true,
      user: { username: 'cyril', name: 'Cyril', avatarUrl: '' },
    });
    const add = vi.fn().mockResolvedValue({ success: true, account });
    renderWithApi(<AccountsPage />, {
      overrides: { accounts: { getAll: async () => [], validateToken, add } },
    });
    await userEvent.type(screen.getByPlaceholderText('E.g.: Personal GitLab'), 'Work');
    await userEvent.type(screen.getByPlaceholderText('glpat-xxxxxxxxxxxx'), 'glpat-secret');
    await userEvent.click(screen.getByRole('button', { name: 'Add account' }));

    await waitFor(() => expect(validateToken).toHaveBeenCalledWith('https://gitlab.com', 'glpat-secret'));
    expect(add).toHaveBeenCalledWith({ name: 'Work', instanceUrl: 'https://gitlab.com', token: 'glpat-secret' });
    expect(await screen.findByText('Account added successfully!')).toBeInTheDocument();
  });

  // Bug-lot fix (#4): the vanilla gate checked the truthiness of the whole
  // validateToken() result object (`{valid, user?}`), which is never falsy, so
  // an invalid token was added anyway (preferences.html:1080-1084). It now
  // gates on `.valid` and blocks the add.
  it('blocks adding the account when the token is invalid', async () => {
    const validateToken = vi.fn().mockResolvedValue({ valid: false });
    const add = vi.fn().mockResolvedValue({ success: true, account });
    renderWithApi(<AccountsPage />, {
      overrides: { accounts: { getAll: async () => [], validateToken, add } },
    });
    await userEvent.type(screen.getByPlaceholderText('E.g.: Personal GitLab'), 'Work');
    await userEvent.type(screen.getByPlaceholderText('glpat-xxxxxxxxxxxx'), 'bad');
    await userEvent.click(screen.getByRole('button', { name: 'Add account' }));

    await waitFor(() => expect(validateToken).toHaveBeenCalledWith('https://gitlab.com', 'bad'));
    expect(await screen.findByText('Invalid token or incorrect URL')).toBeInTheDocument();
    expect(add).not.toHaveBeenCalled();
    expect(screen.queryByText('Account added successfully!')).not.toBeInTheDocument();
  });

  it('shows a status message and blocks submission when a field is missing', async () => {
    const validateToken = vi.fn();
    renderWithApi(<AccountsPage />, {
      overrides: { accounts: { getAll: async () => [], validateToken } },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Add account' }));

    // Exact string from preferences.html:1071.
    expect(await screen.findByText('Please fill in all fields')).toBeInTheDocument();
    expect(validateToken).not.toHaveBeenCalled();
  });

  it('deletes an account after confirmation and reloads the list', async () => {
    const remove = vi.fn().mockResolvedValue({ success: true });
    let getAllCallCount = 0;
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderWithApi(<AccountsPage />, {
      overrides: {
        accounts: {
          getAll: async () => {
            getAllCallCount += 1;
            return getAllCallCount === 1 ? [account] : [];
          },
          remove,
        },
      },
    });

    await screen.findByText('Work');
    await userEvent.click(screen.getByTitle('Delete'));

    expect(confirmSpy).toHaveBeenCalledWith('Delete this account?');
    await waitFor(() => expect(remove).toHaveBeenCalledWith('a1'));
    // Exact string from preferences.html:1044.
    expect(await screen.findByText('Account deleted')).toBeInTheDocument();

    confirmSpy.mockRestore();
  });
});
