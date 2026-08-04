import { describe, expect, it, vi } from 'vitest';
import { createElectronApi } from './createElectronApi';
import { COMMAND_CHANNELS, EVENT_CHANNELS } from './channels';

const makeIpc = () => ({
  invoke: vi.fn().mockResolvedValue('result'),
  on: vi.fn(),
  removeListener: vi.fn(),
});

// Loose view of the built api used only to call it by dynamic (string) key in
// the table-driven tests below -- production code never does this.
type LooseApi = Record<string, Record<string, (...args: unknown[]) => unknown>>;

// One row per command: e.g. ['accounts.add', 'accounts', 'add', 'accounts:add'].
const commands = Object.entries(COMMAND_CHANNELS).flatMap(([ns, methods]) =>
  Object.entries(methods).map(([method, channel]) => [`${ns}.${method}`, ns, method, channel] as const)
);

describe('createElectronApi', () => {
  it('exposes every namespace', () => {
    const api = createElectronApi(makeIpc());
    expect(Object.keys(api).sort()).toEqual(['accounts', 'app', 'config', 'gitlab', 'on']);
  });

  // Covers all 32 commands: fails on the specific command whose wiring drifts.
  it.each(commands)('%s invokes its own channel', async (_label, ns, method, channel) => {
    const ipc = makeIpc();
    await (createElectronApi(ipc) as unknown as LooseApi)[ns][method](1, 2, 3);
    expect(ipc.invoke).toHaveBeenCalledWith(channel, 1, 2, 3);
  });

  // Covers all 4 events: fails on the specific event whose wiring drifts.
  it.each(Object.entries(EVENT_CHANNELS))('on.%s subscribes and unsubscribes on its own channel', (name, channel) => {
    const ipc = makeIpc();
    const cb = vi.fn();
    const api = createElectronApi(ipc) as unknown as LooseApi;
    const unsubscribe = api.on[name](cb) as unknown as () => void;

    expect(ipc.on).toHaveBeenCalledWith(channel, expect.any(Function));
    const handler = ipc.on.mock.calls[0][1];
    handler({}, 'payload');
    expect(cb).toHaveBeenCalledWith('payload');

    unsubscribe();
    expect(ipc.removeListener).toHaveBeenCalledWith(channel, handler);
  });
});
