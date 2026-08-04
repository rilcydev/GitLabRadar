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

  it('does not expose live references from config.get/getAll into the store', async () => {
    const { api } = createFakeApi();

    const notifications = await api.config.get('notifications');
    notifications.enabled = false;
    notifications.pipelineFailed = false;

    const dismissedMRs = await api.config.get('dismissedMRs');
    dismissedMRs.push(999);

    const all = await api.config.getAll();
    all.watchedProjectIds.push(123);

    expect((await api.config.get('notifications')).enabled).toBe(true);
    expect((await api.config.get('notifications')).pipelineFailed).toBe(true);
    expect(await api.config.get('dismissedMRs')).toEqual([]);
    expect((await api.config.getAll()).watchedProjectIds).toEqual([]);
  });
});
