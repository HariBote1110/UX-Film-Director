import { remoteDeckIpcChannels } from '../../shared/remoteDeckProtocol';
import type { AppState } from '../store/storeTypes';
import {
  deriveRemoteDeckContext,
  type RemoteDeckSelectionContext,
} from './remoteDeckSelectionContext';

interface StoreLike {
  getState: () => AppState;
  subscribe: (listener: (state: AppState) => void) => () => void;
}

/**
 * Pushes the selection context to the main process whenever it actually
 * changes (serialised comparison, so unrelated store updates are ignored).
 * The initial context is pushed immediately so freshly connected deck
 * clients receive it via the server broadcast. Returns an unsubscribe fn.
 */
export const subscribeStoreToRemoteDeckState = (
  store: StoreLike,
  send: (channel: string, context: RemoteDeckSelectionContext) => void,
): (() => void) => {
  let lastSerialised = '';

  const push = (state: AppState) => {
    const context = deriveRemoteDeckContext(state);
    const serialised = JSON.stringify(context);
    if (serialised === lastSerialised) return;
    lastSerialised = serialised;
    send(remoteDeckIpcChannels.state, context);
  };

  push(store.getState());
  return store.subscribe(push);
};
