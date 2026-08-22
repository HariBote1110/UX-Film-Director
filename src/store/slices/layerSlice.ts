import type { StoreApi } from 'zustand';
import {
  deleteLayerTrack as applyDeleteLayerTrack,
  insertLayerTrack as applyInsertLayerTrack,
  swapLayerTracks as applySwapLayerTracks
} from '../../utils/layerTrackOps';
import { createDefaultLayers } from '../../utils/sceneState';
import type { AppState } from '../storeTypes';
import {
  calculateAutoDuration,
  normaliseLayers,
} from '../storeHelpers';
import { buildReorderLayersCommand } from '../commandBuilders';

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
    if (!Number.isInteger(indexA) || !Number.isInteger(indexB)) return;
    if (indexA < 0 || indexA >= state.layers.length || indexB < 0 || indexB >= state.layers.length) return;
    if (indexA === indexB) return;
    if (state.layers[indexA]?.locked || state.layers[indexB]?.locked) return;

    const { layers, objects } = applySwapLayerTracks(state.layers, state.objects, indexA, indexB);
    const nextLayers = normaliseLayers(layers);
    get().pushHistoryCommand(buildReorderLayersCommand(state.layers, nextLayers, state.objects, objects));
    set({
      layers: nextLayers,
      objects,
      duration: calculateAutoDuration(objects),
      selectedId: null,
      selectedIds: []
    });
  },

  insertLayerTrackAt: (insertAt) => {
    const state = get();
    if (!Number.isInteger(insertAt) || insertAt < 0 || insertAt >= state.layers.length) return;

    const { layers, objects } = applyInsertLayerTrack(state.layers, state.objects, insertAt);
    const nextLayers = normaliseLayers(layers);
    get().pushHistoryCommand(buildReorderLayersCommand(state.layers, nextLayers, state.objects, objects));
    set({
      layers: nextLayers,
      objects,
      duration: calculateAutoDuration(objects),
      selectedId: null,
      selectedIds: []
    });
  },

  deleteLayerTrackAt: (layerIndex) => {
    const state = get();
    if (!Number.isInteger(layerIndex) || layerIndex < 0 || layerIndex >= state.layers.length) return;
    if (state.layers[layerIndex]?.locked) return;

    const { layers, objects } = applyDeleteLayerTrack(state.layers, state.objects, layerIndex);
    const nextLayers = normaliseLayers(layers);
    get().pushHistoryCommand(buildReorderLayersCommand(state.layers, nextLayers, state.objects, objects));
    set({
      layers: nextLayers,
      objects,
      duration: calculateAutoDuration(objects),
      selectedId: null,
      selectedIds: []
    });
  },
});
