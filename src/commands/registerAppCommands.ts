import type { AppState } from '../store/storeTypes';
import type { PsdObject, TimelineObject } from '../types';
import { buildPsdLayerTree, togglePsdLayer } from '../utils/psdParser';
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

  bus.register('property.set', (payload) => {
    const { objectId, propertyKey, value } =
      (payload as PropertySetPayload | undefined) ?? ({} as PropertySetPayload);
    if (typeof objectId !== 'string' || typeof propertyKey !== 'string') return;

    const state = store.getState();
    const target = state.objects.find((object) => object.id === objectId);
    if (!target) return;

    if (propertyKey === 'scale' && typeof value === 'number') {
      // Same clamp range as PropertyPanel's scale control.
      state.updateObject(objectId, { scale: clamp(value, 0.1, 10) } as Partial<TimelineObject>);
      return;
    }

    if (propertyKey === 'volume' && typeof value === 'number') {
      // Same clamp range as PropertyPanel's volume control.
      state.updateObject(objectId, { volume: clamp(value, 0, 1) } as Partial<TimelineObject>);
      return;
    }

    if (propertyKey.startsWith('psdRadio:') && typeof value === 'string') {
      // Expression (差分) switching: same path as PropertyPanel's
      // handlePsdLayerToggle — togglePsdLayer resolves radio-group exclusivity.
      if (target.type !== 'psd') return;
      const psdObject = target as PsdObject;
      if (!psdObject.rootLayer || !psdObject.activeLayerIds) return;
      const nextActiveLayerIds = togglePsdLayer(psdObject.rootLayer, psdObject.activeLayerIds, value);
      const nextLayerTree = buildPsdLayerTree(psdObject.rootLayer, nextActiveLayerIds);
      state.updateObject(objectId, {
        activeLayerIds: nextActiveLayerIds,
        layerTree: nextLayerTree,
      } as Partial<TimelineObject>);
    }
  });
};

export interface PropertySetPayload {
  objectId: string;
  propertyKey: string;
  value: unknown;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));
