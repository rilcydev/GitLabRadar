import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useApi } from '../renderer/api/ApiContext';
import { createFakeApi } from '../renderer/api/FakeApi';
import { renderWithApi } from './renderWithApi';

function Probe() {
  const api = useApi();
  return <span>{typeof api.gitlab.refresh}</span>;
}

describe('renderWithApi', () => {
  it('supplies a default api when none is passed', () => {
    renderWithApi(<Probe />);
    expect(screen.getByText('function')).toBeInTheDocument();
  });

  it('returns the api it rendered with', () => {
    const { api } = renderWithApi(<Probe />);
    expect(api).toBeDefined();
    expect(typeof api.gitlab.refresh).toBe('function');
  });

  it('gives two default calls independent fakes', async () => {
    const first = renderWithApi(<Probe />);
    const second = renderWithApi(<Probe />);
    expect(first.api).not.toBe(second.api);

    await first.api.config.set('theme', 'dark');
    const firstTheme = await first.api.config.get('theme');
    const secondTheme = await second.api.config.get('theme');
    expect(firstTheme).toBe('dark');
    expect(secondTheme).not.toBe('dark');
  });

  it('returns a working emit paired with the default fake', () => {
    const { emit } = renderWithApi(<Probe />);
    expect(emit).toBeDefined();
    expect(() => emit?.error('boom')).not.toThrow();
  });

  it('returns undefined emit when a caller-supplied api is used', () => {
    const { api } = createFakeApi();
    const { emit } = renderWithApi(<Probe />, { api });
    expect(emit).toBeUndefined();
  });
});
