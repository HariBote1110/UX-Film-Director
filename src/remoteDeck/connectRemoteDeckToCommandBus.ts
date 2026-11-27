import type { CommandBus } from '../commands/commandBus';
import {
  isRemoteDeckCommandMessage,
  remoteDeckIpcChannels,
} from '../../shared/remoteDeckProtocol';

/** Minimal ipcRenderer surface as exposed by the preload bridge. */
export interface RemoteDeckIpcRendererLike {
  on: (channel: string, listener: (event: unknown, ...args: unknown[]) => void) => unknown;
  off: (channel: string, listener: (event: unknown, ...args: unknown[]) => void) => unknown;
}

/**
 * Subscribes to remote-deck:command IPC messages forwarded by the main
 * process and executes them on the CommandBus. Malformed messages are
 * ignored. Returns an unsubscribe function.
 */
export const connectRemoteDeckToCommandBus = (
  ipcRenderer: RemoteDeckIpcRendererLike,
  bus: CommandBus,
): (() => void) => {
  const listener = (_event: unknown, message: unknown) => {
    if (!isRemoteDeckCommandMessage(message)) return;
    bus.execute(message.id, message.payload);
  };
  ipcRenderer.on(remoteDeckIpcChannels.command, listener);
  return () => {
    ipcRenderer.off(remoteDeckIpcChannels.command, listener);
  };
};
