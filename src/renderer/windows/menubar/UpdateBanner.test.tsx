import userEvent from '@testing-library/user-event';
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithApi } from '../../../test/renderWithApi';
import { UpdateBanner } from './UpdateBanner';

describe('UpdateBanner', () => {
  it('renders nothing when no update is available', async () => {
    const { container } = renderWithApi(<UpdateBanner />, {
      overrides: { app: { getAvailableUpdate: async () => null } },
    });
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('shows the available version and opens the release page on click', async () => {
    const openExternal = vi.fn(async () => {});
    renderWithApi(<UpdateBanner />, {
      overrides: {
        app: {
          getAvailableUpdate: async () => ({ version: '0.2.4', url: 'https://gh/releases/v0.2.4' }),
          openExternal,
        },
      },
    });

    const banner = await screen.findByRole('button', { name: /update available/i });
    expect(banner).toHaveTextContent('v0.2.4');

    await userEvent.click(banner);
    expect(openExternal).toHaveBeenCalledWith('https://gh/releases/v0.2.4');
  });
});
