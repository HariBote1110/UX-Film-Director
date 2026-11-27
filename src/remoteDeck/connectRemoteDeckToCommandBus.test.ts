import { describe, expect, it, vi } from 'vitest';
import { createCommandBus } from '../commands/commandBus';
import { connectRemoteDeckToCommandBus } from './connectRemoteDeckToCommandBus';

type Listener = (event: unknown, ...args: unknown[]) => void;

const createIpcRendererStub = () => {
  const listeners = new Map<string, Set<Listener>>();
  return {
    on: vi.fn((channel: string, listener: Listener) => {
      if (!listeners.has(channel)) listeners.set(channel, new Set());
      listeners.get(channel)!.add(listener);
    }),
    off: vi.fn((channel: string, listener: Listener) => {
      listeners.get(channel)?.delete(listener);
    }),
    emit: (channel: string, ...args: unknown[]) => {
      listeners.get(channel)?.forEach((listener) => listener({}, ...args));
    },
    listenerCount: (channel: string) => listeners.get(channel)?.size ?? 0,
  };
};

describe('connectRemoteDeckToCommandBus', () => {
  it('executes the command bus when a remote-deck:command message arrives', () => {
    const bus = createCommandBus();
    const handler = vi.fn();
    bus.register('playback.toggle', handler);
    const ipc = createIpcRendererStub();

    connectRemoteDeckToCommandBus(ipc, bus);
    ipc.emit('remote-deck:command', { type: 'command', id: 'playback.toggle' });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('passes the payload through to the command handler', () => {
    const bus = createCommandBus();
    const handler = vi.fn();
    bus.register('playback.seekRelative', handler);
    const ipc = createIpcRendererStub();

    connectRemoteDeckToCommandBus(ipc, bus);
    ipc.emit('remote-deck:command', { type: 'command', id: 'playback.seekRelative', payload: 30 });

    expect(handler).toHaveBeenCalledWith(30);
  });

  it('ignores malformed messages without throwing', () => {
    const bus = createCommandBus();
    const ipc = createIpcRendererStub();

    connectRemoteDeckToCommandBus(ipc, bus);

    expect(() => {
      ipc.emit('remote-deck:command', null);
      ipc.emit('remote-deck:command', { type: 'state', payload: {} });
      ipc.emit('remote-deck:command', { type: 'command' });
    }).not.toThrow();
  });

  it('returns an unsubscribe function that removes the listener', () => {
    const bus = createCommandBus();
    const handler = vi.fn();
    bus.register('edit.undo', handler);
    const ipc = createIpcRendererStub();

    const unsubscribe = connectRemoteDeckToCommandBus(ipc, bus);
    unsubscribe();
    ipc.emit('remote-deck:command', { type: 'command', id: 'edit.undo' });

    expect(handler).not.toHaveBeenCalled();
    expect(ipc.listenerCount('remote-deck:command')).toBe(0);
  });
});
