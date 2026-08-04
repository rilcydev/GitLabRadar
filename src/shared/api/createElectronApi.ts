import { COMMAND_CHANNELS, EVENT_CHANNELS } from './channels';
import type { GitLabBarApi, Unsubscribe } from './contract';

export interface IpcLike {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  on(channel: string, handler: (event: unknown, ...args: unknown[]) => void): void;
  removeListener(channel: string, handler: (event: unknown, ...args: unknown[]) => void): void;
}

export function createElectronApi(ipc: IpcLike): GitLabBarApi {
  const namespace = (channels: Record<string, string>) =>
    Object.fromEntries(
      Object.entries(channels).map(([method, channel]) => [
        method,
        (...args: unknown[]) => ipc.invoke(channel, ...args),
      ])
    );

  const subscribe = (channel: string) => (cb: (payload: never) => void): Unsubscribe => {
    const handler = (_event: unknown, payload: unknown) => cb(payload as never);
    ipc.on(channel, handler);
    return () => ipc.removeListener(channel, handler);
  };

  return {
    accounts: namespace(COMMAND_CHANNELS.accounts),
    gitlab: namespace(COMMAND_CHANNELS.gitlab),
    config: namespace(COMMAND_CHANNELS.config),
    app: namespace(COMMAND_CHANNELS.app),
    on: {
      dataUpdated: subscribe(EVENT_CHANNELS.dataUpdated),
      refreshStatus: subscribe(EVENT_CHANNELS.refreshStatus),
      error: subscribe(EVENT_CHANNELS.error),
      untagDataUpdated: subscribe(EVENT_CHANNELS.untagDataUpdated),
    },
  } as unknown as GitLabBarApi;
}
