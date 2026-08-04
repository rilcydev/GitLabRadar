import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useApi } from '../renderer/api/ApiContext';
import { createFakeApi } from '../renderer/api/FakeApi';
import { renderWithApi } from './renderWithApi';
import type { GitLabAccount } from '../shared/types/account';

function Probe() {
  const api = useApi();
  return <span>{typeof api.gitlab.refresh}</span>;
}

describe('renderWithApi', () => {
  it('supplies a default fake when neither overrides nor fake is passed', () => {
    const { api, emit } = renderWithApi(<Probe />);
    expect(screen.getByText('function')).toBeInTheDocument();
    expect(api).toBeDefined();
    expect(emit).toBeDefined();
  });

  it('gives two default calls independent fakes (config and event bus)', async () => {
    const first = renderWithApi(<Probe />);
    const second = renderWithApi(<Probe />);
    expect(first.api).not.toBe(second.api);
    expect(first.emit).not.toBe(second.emit);

    await first.api.config.set('theme', 'dark');
    const firstTheme = await first.api.config.get('theme');
    const secondTheme = await second.api.config.get('theme');
    expect(firstTheme).toBe('dark');
    expect(secondTheme).not.toBe('dark');

    let firstHits = 0;
    let secondHits = 0;
    first.api.on.error(() => {
      firstHits += 1;
    });
    second.api.on.error(() => {
      secondHits += 1;
    });
    first.emit.error('boom');
    expect(firstHits).toBe(1);
    expect(secondHits).toBe(0);
  });

  it('builds the fake from `overrides` without the caller touching createFakeApi', async () => {
    const stubbedAccount: GitLabAccount = {
      id: 'acc-1',
      name: 'Stub',
      instanceUrl: 'https://gitlab.example.com',
      username: 'stub-user',
      isActive: true,
    };
    const { api } = renderWithApi(<Probe />, {
      overrides: { accounts: { getAll: async () => [stubbedAccount] } },
    });
    await expect(api.accounts.getAll()).resolves.toEqual([stubbedAccount]);
  });

  it('reuses a caller-supplied `fake` pair as-is', () => {
    const built = createFakeApi();
    const { api, emit } = renderWithApi(<Probe />, { fake: built });
    expect(api).toBe(built.api);
    expect(emit).toBe(built.emit);

    let hits = 0;
    api.on.error(() => {
      hits += 1;
    });
    emit.error('boom');
    expect(hits).toBe(1);
  });

  it('throws when both overrides and fake are given', () => {
    const built = createFakeApi();
    expect(() =>
      renderWithApi(<Probe />, {
        overrides: { app: {} },
        fake: built,
      })
    ).toThrow(/pass either `overrides` or `fake`, not both/);
  });
});
