import { describe, expect, it, vi } from 'vitest';
import { createElectronApi } from './createElectronApi';

const makeIpc = () => ({
  invoke: vi.fn().mockResolvedValue('result'),
  on: vi.fn(),
  removeListener: vi.fn(),
});

describe('createElectronApi', () => {
  it('routes a command to its channel with its arguments', async () => {
    const ipc = makeIpc();
    const api = createElectronApi(ipc);

    await api.gitlab.assignMR(7, 42, [1, 2]);

    expect(ipc.invoke).toHaveBeenCalledWith('gitlab:assignMR', 7, 42, [1, 2]);
  });

  it('exposes every namespace', () => {
    const api = createElectronApi(makeIpc());
    expect(Object.keys(api).sort()).toEqual(['accounts', 'app', 'config', 'gitlab', 'on']);
  });

  it('subscribes to an event and unsubscribes cleanly', () => {
    const ipc = makeIpc();
    const api = createElectronApi(ipc);
    const cb = vi.fn();

    const unsubscribe = api.on.dataUpdated(cb);
    expect(ipc.on).toHaveBeenCalledWith('data:updated', expect.any(Function));

    const handler = ipc.on.mock.calls[0][1];
    handler({}, { mergeRequests: [] });
    expect(cb).toHaveBeenCalledWith({ mergeRequests: [] });

    unsubscribe();
    expect(ipc.removeListener).toHaveBeenCalledWith('data:updated', handler);
  });
});
