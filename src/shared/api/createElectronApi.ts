import { COMMAND_CHANNELS, EVENT_CHANNELS } from './channels';
import type { GitLabRadarApi, Unsubscribe } from './contract';

export interface IpcLike {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  on(channel: string, handler: (event: unknown, ...args: unknown[]) => void): void;
  removeListener(channel: string, handler: (event: unknown, ...args: unknown[]) => void): void;
}

// Builds one command namespace (accounts/gitlab/config/app) from its channel
// map. The generic ties the requested namespace `NS` to its return type
// `GitLabRadarApi[NS]`, so a call site that names the wrong namespace fails to
// typecheck (see createElectronApi.test.ts / task-3-report.md fix-round-1 for
// the deliberate-miswiring proof). The `as` cast here is narrow and local: it
// only asserts that *this one* reflectively-built namespace object has the
// shape `GitLabRadarApi[NS]`, not that the whole API does.
function namespace<NS extends keyof typeof COMMAND_CHANNELS>(ns: NS, ipc: IpcLike): GitLabRadarApi[NS] {
  const channels = COMMAND_CHANNELS[ns];
  return Object.fromEntries(
    Object.entries(channels).map(([method, channel]) => [
      method,
      (...args: unknown[]) => ipc.invoke(channel, ...args),
    ])
  ) as GitLabRadarApi[NS];
}

// Builds one event subscription (on.dataUpdated, on.error, ...). The channel
// is looked up from `name` internally rather than passed separately, so
// there is only one identifier to get right, not two. The generic ties the
// requested event `E` to its return type `GitLabRadarApi['on'][E]`.
//
// Deliberately not `Object.fromEntries(Object.keys(EVENT_CHANNELS).map(...))`:
// prototyping showed a fully reflective loop-based build cannot catch a
// single miswired entry at compile time (the loop variable's type stays the
// union `keyof typeof EVENT_CHANNELS` for every iteration, so TS can't tell
// which iteration is which). Explicit per-key call sites below, by contrast,
// bind each literal name to its own generic instantiation and so do get
// checked -- see task-3-report.md fix-round-1 for the empirical proof of
// both.
function event<E extends keyof typeof EVENT_CHANNELS>(name: E, ipc: IpcLike): GitLabRadarApi['on'][E] {
  const channel = EVENT_CHANNELS[name];
  const subscribe = (cb: (payload: never) => void): Unsubscribe => {
    const handler = (_event: unknown, payload: unknown) => cb(payload as never);
    ipc.on(channel, handler);
    return () => ipc.removeListener(channel, handler);
  };
  return subscribe as GitLabRadarApi['on'][E];
}

export function createElectronApi(ipc: IpcLike): GitLabRadarApi {
  return {
    accounts: namespace('accounts', ipc),
    gitlab: namespace('gitlab', ipc),
    config: namespace('config', ipc),
    app: namespace('app', ipc),
    on: {
      dataUpdated: event('dataUpdated', ipc),
      refreshStatus: event('refreshStatus', ipc),
      error: event('error', ipc),
      untagDataUpdated: event('untagDataUpdated', ipc),
    },
  };
}
