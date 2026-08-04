import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithApi } from '../../../test/renderWithApi';
import { PreferencesApp } from './PreferencesApp';

describe('PreferencesApp', () => {
  it('renders the three navigation items with their exact labels', () => {
    renderWithApi(<PreferencesApp />);
    expect(screen.getByText('Accounts')).toBeInTheDocument();
    expect(screen.getByText('Projects')).toBeInTheDocument();
    expect(screen.getByText('General')).toBeInTheDocument();
  });

  it('opens on the accounts page', () => {
    renderWithApi(<PreferencesApp />);
    expect(screen.getByRole('heading', { name: 'GitLab Accounts' })).toBeInTheDocument();
  });

  it('switches page on navigation click', async () => {
    renderWithApi(<PreferencesApp />);
    await userEvent.click(screen.getByText('Projects'));
    expect(screen.queryByRole('heading', { name: 'GitLab Accounts' })).not.toBeInTheDocument();
  });
});
