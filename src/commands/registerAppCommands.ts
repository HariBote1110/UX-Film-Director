import type { AppState } from '../store/storeTypes';
import type { CommandBus } from './commandBus';

/** Minimal shape required from the store: a synchronous getState(). */
export interface AppCommandStore {
  getState: () => AppState;
}

export interface EditDeletePayload {
  ripple?: boolean;
}

/**
 * Registers the initial set of application-wide commands on the given
 * CommandBus, wiring each commandId to the corresponding Zustand store
 * action. Both keyboard shortcuts (useAppLogic) and, later, the Remote
 * Control Deck server share this single mapping.
 */
export const registerAppCommands = (bus: CommandBus, store: AppCommandStore): void => {
  bus.register('playback.toggle', () => {
    store.getState().togglePlay();
  });

  bus.register('playback.seekRelative', (payload) => {
    const frames = typeof payload === 'number' ? payload : 0;
    if (frames === 0) return;
    const { currentTime, setTime, projectSettings } = store.getState();
    const fps = projectSettings.fps > 0 ? projectSettings.fps : 60;
    setTime(currentTime + frames / fps);
  });

  bus.register('edit.undo', () => {
    store.getState().undo();
  });

  bus.register('edit.redo', () => {
    store.getState().redo();
  });

  bus.register('edit.delete', (payload) => {
    const { ripple } = (payload as EditDeletePayload | undefined) ?? {};
    const { selectedIds, deleteSelectedObjects, rippleDeleteSelectedObjects } = store.getState();
    if (selectedIds.length === 0) return;
    if (ripple) {
      rippleDeleteSelectedObjects();
    } else {
      deleteSelectedObjects();
    }
  });

  bus.register('selection.escape', () => {
    store.getState().clearSelection();
  });
};
