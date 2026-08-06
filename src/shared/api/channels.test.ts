import { describe, expect, it } from 'vitest';
import { COMMAND_CHANNELS, EVENT_CHANNELS } from './channels';
import { IPC_CHANNELS } from '../constants';

const flatten = (o: Record<string, Record<string, string>>) =>
  Object.values(o).flatMap((ns) => Object.values(ns));

describe('channel manifest', () => {
  it('declares 34 commands', () => {
    expect(flatten(COMMAND_CHANNELS)).toHaveLength(34);
  });

  it('declares 4 events', () => {
    expect(Object.values(EVENT_CHANNELS)).toHaveLength(4);
  });

  it('covers every IPC_CHANNELS entry exactly once', () => {
    const declared = [...flatten(COMMAND_CHANNELS), ...Object.values(EVENT_CHANNELS)].sort();
    const expected = Object.values(IPC_CHANNELS).sort();
    expect(declared).toEqual(expected);
  });
});
