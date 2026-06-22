import { MAX_LAYERS } from '../components/timelineConstants';
import type { LayerState, TimelineObject } from '../types';
import { createDefaultLayers } from '../utils/sceneState';
import { syncLegacyEffectsWithFilters } from '../utils/filterStack';
import { normaliseKeyframesForObject } from '../utils/keyframes';
import { normaliseRustFrameSourceBlockedFallback } from '../utils/rustFrameSourceBlockedFallback';
import type { AppState, ClipboardState, ExportDiagnostics, ExportProgress } from './storeTypes';

export const collectExportDiagnostics = (progress: ExportProgress | null): ExportDiagnostics | null => {
  if (!progress) return null;
  const diagnostics: ExportDiagnostics = {};
  if (progress.exportFrameSourcePlanFailure) {
    diagnostics.exportFrameSourcePlanFailure = progress.exportFrameSourcePlanFailure;
  }
  if (progress.rustFrameSourceBlocked) {
    diagnostics.rustFrameSourceBlocked = progress.rustFrameSourceBlocked;
  }
  if (progress.nativeRenderOutputRelease) {
    diagnostics.nativeRenderOutputRelease = progress.nativeRenderOutputRelease;
  }
  return diagnostics.exportFrameSourcePlanFailure
    || diagnostics.rustFrameSourceBlocked
    || diagnostics.nativeRenderOutputRelease
    ? diagnostics
    : null;
};

export const normaliseExportProgressDiagnostics = (progress: ExportProgress): ExportProgress => ({
  ...progress,
  ...(progress.rustFrameSourceBlocked ? {
    rustFrameSourceBlocked: normaliseRustFrameSourceBlockedFallback(progress.rustFrameSourceBlocked),
  } : {}),
});

export const calculateAutoDuration = (objects: TimelineObject[]) => {
  if (objects.length === 0) return 30;
  const maxEndTime = Math.max(...objects.map(o => o.startTime + o.duration));
  return Math.max(maxEndTime, 10);
};

export const needsDurationRecalculation = (newProps: Partial<TimelineObject>) => {
  return Object.prototype.hasOwnProperty.call(newProps, 'startTime')
    || Object.prototype.hasOwnProperty.call(newProps, 'duration');
};

export const KEYFRAME_TIME_EPSILON = 0.0001;

export const clampLayerIndex = (value: number): number => {
  return Math.max(0, Math.min(MAX_LAYERS - 1, Math.round(value)));
};

export const normaliseLayers = (layers?: LayerState[]): LayerState[] => {
  const defaults = createDefaultLayers();
  if (!Array.isArray(layers)) return defaults;

  return defaults.map((defaultLayer, index) => {
    const candidate = layers[index];
    if (!candidate || typeof candidate !== 'object') {
      return defaultLayer;
    }
    const normalisedName = typeof candidate.name === 'string' && candidate.name.trim() !== ''
      ? candidate.name
      : defaultLayer.name;
    return {
      name: normalisedName,
      visible: candidate.visible !== false,
      locked: candidate.locked === true
    };
  });
};

export const normaliseObjectLayer = (object: TimelineObject): TimelineObject => {
  const nextLayer = clampLayerIndex(object.layer);
  if (nextLayer === object.layer) return object;
  return { ...object, layer: nextLayer };
};

export const isLayerLocked = (layers: LayerState[], layer: number): boolean => {
  if (layer < 0 || layer >= layers.length) return false;
  return layers[layer].locked;
};

export const cloneTimelineObject = (object: TimelineObject): TimelineObject => {
  return JSON.parse(JSON.stringify(object)) as TimelineObject;
};

export const buildClipboardState = (objects: TimelineObject[]): ClipboardState => {
  const sorted = objects
    .slice()
    .sort((a, b) => a.startTime - b.startTime || a.layer - b.layer);
  return {
    objects: sorted.map(cloneTimelineObject),
    anchorStartTime: Math.min(...sorted.map((obj) => obj.startTime)),
    anchorLayer: Math.min(...sorted.map((obj) => obj.layer)),
    anchorX: Math.min(...sorted.map((obj) => obj.x)),
    anchorY: Math.min(...sorted.map((obj) => obj.y))
  };
};

export const getCurrentSelection = (state: AppState): string[] => {
  if (state.selectedIds.length > 0) {
    return state.selectedIds.filter((id, index, list) => list.indexOf(id) === index);
  }
  if (state.selectedId) {
    return [state.selectedId];
  }
  return [];
};

export const getSelectedObjects = (state: AppState): TimelineObject[] => {
  const selectedIds = getCurrentSelection(state);
  if (selectedIds.length === 0) return [];
  const selectedSet = new Set(selectedIds);
  return state.objects.filter((obj) => selectedSet.has(obj.id));
};

export const syncObjectKeyframes = (object: TimelineObject): TimelineObject => {
  const keyframes = normaliseKeyframesForObject(object, object.keyframes);
  if (keyframes.length === 0) {
    if (!object.keyframes || object.keyframes.length === 0) return object;
    return { ...object, keyframes: undefined };
  }

  const first = keyframes[0];
  const last = keyframes[keyframes.length - 1];
  return {
    ...object,
    keyframes,
    enableAnimation: keyframes.length >= 2,
    x: first.x,
    y: first.y,
    endX: last.x,
    endY: last.y,
    easing: first.easing ?? object.easing ?? 'linear'
  };
};

export const normaliseSceneObjectList = (objects: TimelineObject[]): TimelineObject[] => {
  return objects
    .map(cloneTimelineObject)
    .map(normaliseObjectLayer)
    .map(syncLegacyEffectsWithFilters)
    .map(syncObjectKeyframes);
};

export const PREVIEW_MODE_STORAGE_KEY = 'uxfd-preview-display-mode';

export const readStoredPreviewMode = (): AppState['previewDisplayMode'] => {
  try {
    const raw = localStorage.getItem(PREVIEW_MODE_STORAGE_KEY);
    if (raw === 'autoFit' || raw === 'pixelPerfect') return raw;
  } catch {
    /* ignore */
  }
  return 'autoFit';
};
