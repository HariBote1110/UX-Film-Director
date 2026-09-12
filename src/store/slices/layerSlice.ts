import type { StoreApi } from 'zustand';
import { createDefaultLayers } from '../../utils/sceneState';
import type { AppState } from '../storeTypes';
import {
  calculateAutoDuration,
} from '../storeHelpers';
import {
  buildDeleteLayerTrackCommand,
  buildInsertLayerTrackCommand,
  buildSwapLayerTracksCommand,
  type LayerTrackCommand,
} from '../commandBuilders';
import { getCommandBridge } from '../../utils/rustBackendCommandBridge';
import type { SceneData } from '../../generated/rustCore/SceneData';
import type { TimelineObject } from '../../types';

type LayerSlice = Pick<
  AppState,
  | 'layers'
  | 'setLayerName'
  | 'toggleLayerVisibility'
  | 'toggleLayerLock'
  | 'swapLayerTracks'
  | 'insertLayerTrackAt'
  | 'deleteLayerTrackAt'
>;

type SetState = StoreApi<AppState>['setState'];
type GetState = StoreApi<AppState>['getState'];

const applyLayerTrackCommand = async (
  set: SetState,
  get: GetState,
  command: LayerTrackCommand,
): Promise<void> => {
  const bridge = getCommandBridge();
  const state = get();
  if (!bridge || state.isCommandHistoryPending) return;
  const activeScene = state.scenes.find((scene) => scene.id === state.activeSceneId);
  if (!activeScene) return;

  // この操作は layer と全 object の参照を変えるため、縮約できる SceneData はない。
  // 応答前にこの2集合が変わった場合は、古い全体結果を上書きせず破棄する。
  const layersAtRequest = JSON.stringify(state.layers);
  const objectsAtRequest = JSON.stringify(state.objects);
  const scene: SceneData = {
    id: activeScene.id,
    name: activeScene.name,
    objects: state.objects as unknown as SceneData['objects'],
    layers: state.layers.map((layer) => ({ ...layer })),
    duration: state.duration,
    camera: { ...state.camera },
    stageCamera3D: {
      position: { ...state.stageCamera3D.position },
      target: { ...state.stageCamera3D.target },
    },
  };

  set({ isCommandHistoryPending: true });
  try {
    const response = await bridge.applyCommand({ scene, command });
    if (!response.success || !response.result) {
      console.error('layer track command.apply failed', response.error, response.errorCode);
      return;
    }
    let applied = false;
    set((current) => {
      if (JSON.stringify(current.layers) !== layersAtRequest
        || JSON.stringify(current.objects) !== objectsAtRequest) return {};
      const objects = response.result!.scene.objects as unknown as TimelineObject[];
      applied = true;
      return {
        layers: response.result!.scene.layers.map((layer) => ({ ...layer })),
        objects,
        duration: calculateAutoDuration(objects),
        selectedId: null,
        selectedIds: [],
      };
    });
    if (applied) get().pushHistoryCommand(command);
  } catch (error) {
    console.error('layer track command.apply failed', error);
  } finally {
    set({ isCommandHistoryPending: false });
  }
};

export const createLayerSlice = (set: SetState, get: GetState): LayerSlice => ({
  layers: createDefaultLayers(),

  setLayerName: (layer, name) => set((state) => {
    if (!Number.isInteger(layer) || layer < 0 || layer >= state.layers.length) return {};
    const trimmedName = name.trim();
    const nextName = trimmedName === '' ? `Layer ${layer + 1}` : trimmedName;
    if (state.layers[layer].name === nextName) return {};
    const nextLayers = state.layers.slice();
    nextLayers[layer] = { ...nextLayers[layer], name: nextName };
    return { layers: nextLayers };
  }),

  toggleLayerVisibility: (layer) => set((state) => {
    if (!Number.isInteger(layer) || layer < 0 || layer >= state.layers.length) return {};
    const nextLayers = state.layers.slice();
    nextLayers[layer] = { ...nextLayers[layer], visible: !nextLayers[layer].visible };
    return { layers: nextLayers };
  }),

  toggleLayerLock: (layer) => set((state) => {
    if (!Number.isInteger(layer) || layer < 0 || layer >= state.layers.length) return {};
    const nextLayers = state.layers.slice();
    nextLayers[layer] = { ...nextLayers[layer], locked: !nextLayers[layer].locked };
    return { layers: nextLayers };
  }),

  swapLayerTracks: (indexA, indexB) => {
    const state = get();
    if (state.isCommandHistoryPending) return;
    if (!Number.isInteger(indexA) || !Number.isInteger(indexB)) return;
    if (indexA < 0 || indexA >= state.layers.length || indexB < 0 || indexB >= state.layers.length) return;
    if (indexA === indexB) return;
    if (state.layers[indexA]?.locked || state.layers[indexB]?.locked) return;

    void applyLayerTrackCommand(set, get, buildSwapLayerTracksCommand(indexA, indexB, state.layers, state.objects));
  },

  insertLayerTrackAt: (insertAt) => {
    const state = get();
    if (state.isCommandHistoryPending) return;
    if (!Number.isInteger(insertAt) || insertAt < 0 || insertAt >= state.layers.length) return;

    void applyLayerTrackCommand(set, get, buildInsertLayerTrackCommand(insertAt, state.layers, state.objects));
  },

  deleteLayerTrackAt: (layerIndex) => {
    const state = get();
    if (state.isCommandHistoryPending) return;
    if (!Number.isInteger(layerIndex) || layerIndex < 0 || layerIndex >= state.layers.length) return;
    if (state.layers[layerIndex]?.locked) return;

    void applyLayerTrackCommand(set, get, buildDeleteLayerTrackCommand(layerIndex, state.layers, state.objects));
  },
});
