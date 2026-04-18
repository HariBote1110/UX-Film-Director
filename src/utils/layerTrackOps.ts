import { LayerState, LipSyncSetting, TimelineObject } from '../types';
import { MAX_LAYERS } from '../components/timelineConstants';

const clampLayerIndex = (value: number): number => {
  return Math.max(0, Math.min(MAX_LAYERS - 1, Math.round(value)));
};

const defaultLayerState = (index: number): LayerState => ({
  name: `Layer ${index + 1}`,
  visible: true,
  locked: false,
});

const remapLipSyncTargetAfterSwap = (lipSync: LipSyncSetting, lo: number, hi: number) => {
  let targetLayer = lipSync.targetLayer;
  if (targetLayer === lo) targetLayer = hi;
  else if (targetLayer === hi) targetLayer = lo;
  return { ...lipSync, targetLayer: clampLayerIndex(targetLayer) };
};

const remapAudioVizTargetAfterSwap = (targetLayer: number, lo: number, hi: number) => {
  let next = targetLayer;
  if (next === lo) next = hi;
  else if (next === hi) next = lo;
  return clampLayerIndex(next);
};

const patchObjectLayerRefsForSwap = (
  obj: TimelineObject,
  lo: number,
  hi: number
): TimelineObject => {
  let layer = obj.layer;
  if (layer === lo) layer = hi;
  else if (layer === hi) layer = lo;
  let next: TimelineObject = { ...obj, layer: clampLayerIndex(layer) };

  if (obj.type === 'psd' && obj.lipSync?.sourceMode === 'layer') {
    next = {
      ...next,
      lipSync: remapLipSyncTargetAfterSwap(obj.lipSync, lo, hi)
    } as TimelineObject;
  }
  if (obj.type === 'audio_visualization' && typeof obj.targetLayer === 'number') {
    next = {
      ...next,
      targetLayer: remapAudioVizTargetAfterSwap(obj.targetLayer, lo, hi)
    } as TimelineObject;
  }
  return next;
};

/**
 * Swap two timeline layer tracks (metadata + all object.layer indices + lipSync / audio viz targets).
 */
export const swapLayerTracks = (
  layers: LayerState[],
  objects: TimelineObject[],
  indexA: number,
  indexB: number
): { layers: LayerState[]; objects: TimelineObject[] } => {
  const a = clampLayerIndex(indexA);
  const b = clampLayerIndex(indexB);
  if (a === b) {
    return { layers: layers.slice(), objects: objects.map((o) => ({ ...o })) };
  }
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const nextLayers = layers.slice();
  if (nextLayers.length < MAX_LAYERS) {
    while (nextLayers.length < MAX_LAYERS) {
      nextLayers.push(defaultLayerState(nextLayers.length));
    }
  }
  [nextLayers[lo], nextLayers[hi]] = [nextLayers[hi], nextLayers[lo]];
  const nextObjects = objects.map((obj) => patchObjectLayerRefsForSwap(obj, lo, hi));
  return { layers: nextLayers, objects: nextObjects };
};

const patchObjectForInsert = (obj: TimelineObject, insertAt: number): TimelineObject | null => {
  let layer = obj.layer;
  if (layer >= insertAt) layer += 1;
  if (layer > MAX_LAYERS - 1) return null;

  let next: TimelineObject = { ...obj, layer: clampLayerIndex(layer) };

  if (obj.type === 'psd' && obj.lipSync?.sourceMode === 'layer') {
    let tl = obj.lipSync.targetLayer;
    if (tl >= insertAt) tl += 1;
    next = {
      ...next,
      lipSync: { ...obj.lipSync, targetLayer: clampLayerIndex(tl) }
    } as TimelineObject;
  }
  if (obj.type === 'audio_visualization' && typeof obj.targetLayer === 'number') {
    let tl = obj.targetLayer;
    if (tl >= insertAt) tl += 1;
    next = {
      ...next,
      targetLayer: clampLayerIndex(tl)
    } as TimelineObject;
  }
  return next;
};

/**
 * Insert an empty layer track at `insertAt` (0..MAX_LAYERS-1). Drops the previous bottom track metadata;
 * objects that would exceed MAX_LAYERS-1 are removed.
 */
export const insertLayerTrack = (
  layers: LayerState[],
  objects: TimelineObject[],
  insertAt: number
): { layers: LayerState[]; objects: TimelineObject[] } => {
  const k = clampLayerIndex(insertAt);
  const base = layers.length >= MAX_LAYERS ? layers.slice() : [
    ...layers,
    ...Array.from({ length: MAX_LAYERS - layers.length }, (_, i) =>
      defaultLayerState(layers.length + i))
  ];
  const inserted = defaultLayerState(k);
  const nextLayers = [...base.slice(0, k), inserted, ...base.slice(k)].slice(0, MAX_LAYERS);

  const nextObjects: TimelineObject[] = [];
  for (const obj of objects) {
    const patched = patchObjectForInsert(obj, k);
    if (patched) nextObjects.push(patched);
  }
  return { layers: nextLayers, objects: nextObjects };
};

const patchObjectForDelete = (
  obj: TimelineObject,
  deleteAt: number
): TimelineObject | null => {
  if (obj.layer === deleteAt) return null;
  let layer = obj.layer;
  if (layer > deleteAt) layer -= 1;
  let next: TimelineObject = { ...obj, layer: clampLayerIndex(layer) };

  if (obj.type === 'psd' && obj.lipSync?.sourceMode === 'layer') {
    let tl = obj.lipSync.targetLayer;
    if (tl === deleteAt) {
      next = {
        ...next,
        lipSync: { ...obj.lipSync, enabled: false, targetLayer: 0 }
      } as TimelineObject;
    } else {
      if (tl > deleteAt) tl -= 1;
      next = {
        ...next,
        lipSync: { ...obj.lipSync, targetLayer: clampLayerIndex(tl) }
      } as TimelineObject;
    }
  }
  if (obj.type === 'audio_visualization' && typeof obj.targetLayer === 'number') {
    let tl = obj.targetLayer;
    if (tl === deleteAt) {
      next = { ...next, targetLayer: 0 } as TimelineObject;
    } else {
      if (tl > deleteAt) tl -= 1;
      next = { ...next, targetLayer: clampLayerIndex(tl) } as TimelineObject;
    }
  }
  return next;
};

/**
 * Remove layer track `deleteAt`, delete all clips on that row, shift higher indices down,
 * append a fresh default track at the bottom. lipSync / audio viz pointing at deleted row are reset.
 */
export const deleteLayerTrack = (
  layers: LayerState[],
  objects: TimelineObject[],
  deleteAt: number
): { layers: LayerState[]; objects: TimelineObject[] } => {
  const k = clampLayerIndex(deleteAt);
  const base = layers.length >= MAX_LAYERS ? layers.slice() : [
    ...layers,
    ...Array.from({ length: MAX_LAYERS - layers.length }, (_, i) =>
      defaultLayerState(layers.length + i))
  ];
  const nextLayers = [...base.slice(0, k), ...base.slice(k + 1), defaultLayerState(MAX_LAYERS - 1)];
  const nextObjects = objects
    .map((obj) => patchObjectForDelete(obj, k))
    .filter((obj): obj is TimelineObject => obj !== null);
  return { layers: nextLayers, objects: nextObjects };
};
