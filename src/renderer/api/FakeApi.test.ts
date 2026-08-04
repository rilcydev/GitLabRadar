import { describe, expect, it, vi } from 'vitest';
import { createFakeApi } from './FakeApi';

describe('createFakeApi', () => {
  it('returns empty collections by default', async () => {
    const { api } = createFakeApi();
    await expect(api.gitlab.getMRs()).resolves.toEqual([]);
    await expect(api.accounts.getAll()).resolves.toEqual([]);
  });

  it('honours overrides', async () => {
    const { api } = createFakeApi({
      accounts: { getAll: async () => [
        { id: 'a1', name: 'Work', instanceUrl: 'https://gitlab.example.com',
          username: 'cyril', isActive: true },
      ] },
    });
    await expect(api.accounts.getAll()).resolves.toHaveLength(1);
  });

  it('delivers pushed events to subscribers', () => {
    const { api, emit } = createFakeApi();
    const cb = vi.fn();
    const unsubscribe = api.on.refreshStatus(cb);

    emit.refreshStatus('refreshing');
    expect(cb).toHaveBeenCalledWith('refreshing');

    unsubscribe();
    emit.refreshStatus('idle');
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('persists config writes within a single fake', async () => {
    const { api } = createFakeApi();
    await api.config.set('viewMode', 'productOwner');
    await expect(api.config.get('viewMode')).resolves.toBe('productOwner');
  });
});
