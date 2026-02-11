import { create } from 'zustand';
import { TimelineObject, ProjectSettings, LayerState, FilterType } from '../types';
import { MAX_LAYERS } from '../components/timelineConstants';
import {
  addFilterToObject,
  moveFilterInObject,
  removeFilterFromObject,
  syncFiltersFromLegacyValues,
  syncLegacyEffectsWithFilters,
  toggleFilterEnabledInObject,
  updateFilterParamsInObject
} from '../utils/filterStack';
import {
  evaluateObjectPositionAtTime,
  normaliseKeyframesForObject,
  shiftKeyframesForObject
} from '../utils/keyframes';

interface ClipboardState {
  objects: TimelineObject[];
  anchorStartTime: number;
  anchorLayer: number;
  anchorX: number;
  anchorY: number;
}

interface AppState {
  // Project State
  isProjectLoaded: boolean;
  projectSettings: ProjectSettings;
  
  // Export State
  isExporting: boolean;
  
  // Snapshot State
  isSnapshotRequested: boolean;

  // Editor State
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  layers: LayerState[];
  objects: TimelineObject[];
  selectedId: string | null;
  selectedIds: string[];
  clipboard: ClipboardState | null;
  
  // History State for Undo/Redo
  pastStates: TimelineObject[][];
  futureStates: TimelineObject[][];

  // Actions
  initializeProject: (settings: ProjectSettings) => void;
  loadProject: (settings: ProjectSettings, objects: TimelineObject[], duration?: number, layers?: LayerState[]) => void;
  setLayerName: (layer: number, name: string) => void;
  toggleLayerVisibility: (layer: number) => void;
  toggleLayerLock: (layer: number) => void;
  setTime: (time: number) => void;
  setDuration: (duration: number) => void;
  advanceTime: (deltaTime: number) => void;
  togglePlay: () => void;
  setIsPlaying: (isPlaying: boolean) => void;
  setExporting: (isExporting: boolean) => void;
  
  // Snapshot Actions
  requestSnapshot: () => void;
  finishSnapshot: () => void;
  
  // History Actions
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;

  addObject: (obj: TimelineObject) => void;
  updateObject: (id: string, newProps: Partial<TimelineObject>) => void;
  addObjectFilter: (objectId: string, filterType: FilterType) => void;
  toggleObjectFilter: (objectId: string, filterId: string) => void;
  moveObjectFilter: (objectId: string, filterId: string, direction: 'up' | 'down') => void;
  removeObjectFilter: (objectId: string, filterId: string) => void;
  updateObjectFilterParams: (objectId: string, filterId: string, params: Record<string, unknown>) => void;
  deleteObject: (id: string) => void;
  deleteSelectedObjects: () => void;
  splitObject: () => void;
  copySelectedObjects: () => void;
  cutSelectedObjects: () => void;
  pasteClipboardObjects: () => void;
  duplicateSelectedObjects: () => void;
  groupSelectedObjects: () => void;
  ungroupSelectedObjects: () => void;
  selectObject: (id: string | null) => void;
  toggleObjectSelection: (id: string) => void;
  selectObjects: (ids: string[], primaryId?: string | null) => void;
  clearSelection: () => void;
}

// 期間計算ヘルパー
const calculateAutoDuration = (objects: TimelineObject[]) => {
  if (objects.length === 0) return 30;
  const maxEndTime = Math.max(...objects.map(o => o.startTime + o.duration));
  return Math.max(maxEndTime, 10);
};

const needsDurationRecalculation = (newProps: Partial<TimelineObject>) => {
  return Object.prototype.hasOwnProperty.call(newProps, 'startTime')
    || Object.prototype.hasOwnProperty.call(newProps, 'duration');
};

const KEYFRAME_TIME_EPSILON = 0.0001;

const clampLayerIndex = (value: number): number => {
  return Math.max(0, Math.min(MAX_LAYERS - 1, Math.round(value)));
};

const createDefaultLayers = (): LayerState[] => {
  return Array.from({ length: MAX_LAYERS }, (_, index) => ({
    name: `Layer ${index + 1}`,
    visible: true,
    locked: false
  }));
};

const normaliseLayers = (layers?: LayerState[]): LayerState[] => {
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

const normaliseObjectLayer = (object: TimelineObject): TimelineObject => {
  const nextLayer = clampLayerIndex(object.layer);
  if (nextLayer === object.layer) return object;
  return { ...object, layer: nextLayer };
};

const isLayerLocked = (layers: LayerState[], layer: number): boolean => {
  if (layer < 0 || layer >= layers.length) return false;
  return layers[layer].locked;
};

const cloneTimelineObject = (object: TimelineObject): TimelineObject => {
  return JSON.parse(JSON.stringify(object)) as TimelineObject;
};

const buildClipboardState = (objects: TimelineObject[]): ClipboardState => {
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

const getCurrentSelection = (state: AppState): string[] => {
  if (state.selectedIds.length > 0) {
    return state.selectedIds.filter((id, index, list) => list.indexOf(id) === index);
  }
  if (state.selectedId) {
    return [state.selectedId];
  }
  return [];
};

const getSelectedObjects = (state: AppState): TimelineObject[] => {
  const selectedIds = getCurrentSelection(state);
  if (selectedIds.length === 0) return [];
  const selectedSet = new Set(selectedIds);
  return state.objects.filter((obj) => selectedSet.has(obj.id));
};

const syncObjectKeyframes = (object: TimelineObject): TimelineObject => {
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

export const useStore = create<AppState>((set, get) => ({
  isProjectLoaded: false,
  projectSettings: { width: 1920, height: 1080, fps: 60, sampleRate: 44100 },
  isExporting: false,
  isSnapshotRequested: false,

  currentTime: 0,
  duration: 30,
  isPlaying: false,
  layers: createDefaultLayers(),
  objects: [],
  selectedId: null,
  selectedIds: [],
  clipboard: null,

  pastStates: [],
  futureStates: [],

  initializeProject: (settings) => set({ 
    projectSettings: settings,
    isProjectLoaded: true,
    currentTime: 0,
    duration: 30,
    isPlaying: false,
    layers: createDefaultLayers(),
    objects: [],
    selectedId: null,
    selectedIds: [],
    clipboard: null,
    pastStates: [],
    futureStates: []
  }),

  loadProject: (settings, objects, duration, layers) => {
    const normalisedObjects = objects
      .map(normaliseObjectLayer)
      .map(syncLegacyEffectsWithFilters)
      .map(syncObjectKeyframes);
    set({
      projectSettings: settings,
      isProjectLoaded: true,
      currentTime: 0,
      duration: Math.max(1, duration ?? calculateAutoDuration(normalisedObjects)),
      isPlaying: false,
      layers: normaliseLayers(layers),
      objects: normalisedObjects,
      selectedId: null,
      selectedIds: [],
      clipboard: null,
      pastStates: [],
      futureStates: []
    });
  },

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

  setTime: (time) => set((state) => {
    const nextTime = Math.max(0, time);
    if (Math.abs(state.currentTime - nextTime) < 0.0001) return {};
    return { currentTime: nextTime };
  }),
  setDuration: (duration) => set((state) => {
    const nextDuration = Math.max(1, duration);
    if (Math.abs(state.duration - nextDuration) < 0.0001) return {};
    return { duration: nextDuration };
  }),

  advanceTime: (deltaTime) => {
    const { currentTime, duration, isPlaying } = get();
    if (!isPlaying) return;
    let nextTime = currentTime + deltaTime;
    if (nextTime >= duration) {
      nextTime = duration;
      set({ isPlaying: false });
    }
    if (Math.abs(nextTime - currentTime) >= 0.0001) {
      set({ currentTime: nextTime });
    }
  },

  togglePlay: () => set((state) => {
    if (!state.isPlaying && state.currentTime >= state.duration) {
      return { isPlaying: true, currentTime: 0 };
    }
    return { isPlaying: !state.isPlaying };
  }),

  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setExporting: (isExporting) => set({ isExporting }),
  
  requestSnapshot: () => set({ isSnapshotRequested: true }),
  finishSnapshot: () => set({ isSnapshotRequested: false }),
  
  // 変更前の状態を履歴に保存する
  pushHistory: () => set((state) => ({
    pastStates: [...state.pastStates, state.objects],
    futureStates: [] // 新しい操作をしたらRedoスタックはクリア
  })),

  undo: () => set((state) => {
    if (state.pastStates.length === 0) return {};
    const previous = state.pastStates[state.pastStates.length - 1];
    const newPast = state.pastStates.slice(0, -1);
    return {
      objects: previous,
      pastStates: newPast,
      futureStates: [state.objects, ...state.futureStates],
      duration: calculateAutoDuration(previous),
      selectedId: null,
      selectedIds: []
    };
  }),

  redo: () => set((state) => {
    if (state.futureStates.length === 0) return {};
    const next = state.futureStates[0];
    const newFuture = state.futureStates.slice(1);
    return {
      objects: next,
      pastStates: [...state.pastStates, state.objects],
      futureStates: newFuture,
      duration: calculateAutoDuration(next),
      selectedId: null,
      selectedIds: []
    };
  }),

  addObject: (obj) => {
    const targetLayer = clampLayerIndex(obj.layer);
    const state = get();
    if (isLayerLocked(state.layers, targetLayer)) return;

    const objectWithDefaults = {
      ...obj,
      layer: targetLayer,
      enableAnimation: obj.enableAnimation ?? false,
      endX: obj.endX ?? obj.x,
      endY: obj.endY ?? obj.y,
      easing: obj.easing ?? 'linear',
      offset: obj.offset ?? 0
    } as TimelineObject;
    const syncedObject = syncObjectKeyframes(syncLegacyEffectsWithFilters(objectWithDefaults));

    get().pushHistory();
    set((state) => {
      const newObjects = [...state.objects, syncedObject];
      return { 
        objects: newObjects,
        selectedId: syncedObject.id,
        selectedIds: [syncedObject.id],
        duration: calculateAutoDuration(newObjects)
      };
    });
  },
  
  updateObject: (id, newProps) => set((state) => {
    const targetIndex = state.objects.findIndex((obj) => obj.id === id);
    if (targetIndex < 0) return {};

    const currentObject = state.objects[targetIndex];
    const currentLayer = clampLayerIndex(currentObject.layer);
    if (isLayerLocked(state.layers, currentLayer)) return {};

    const hasLayerUpdate = Object.prototype.hasOwnProperty.call(newProps, 'layer');
    const parsedLayer = Number(newProps.layer);
    const nextLayer = hasLayerUpdate && Number.isFinite(parsedLayer)
      ? clampLayerIndex(parsedLayer)
      : currentLayer;
    if (isLayerLocked(state.layers, nextLayer)) return {};

    const normalisedNewProps = hasLayerUpdate
      ? { ...newProps, layer: nextLayer } as Partial<TimelineObject>
      : newProps;

    const hasStartUpdate = Object.prototype.hasOwnProperty.call(normalisedNewProps, 'startTime');
    const hasDurationUpdate = Object.prototype.hasOwnProperty.call(normalisedNewProps, 'duration');
    const hasXUpdate = Object.prototype.hasOwnProperty.call(normalisedNewProps, 'x');
    const hasYUpdate = Object.prototype.hasOwnProperty.call(normalisedNewProps, 'y');
    const hasExplicitKeyframesUpdate = Object.prototype.hasOwnProperty.call(normalisedNewProps, 'keyframes');

    let adjustedNewProps = normalisedNewProps;
    const nextStartTime = hasStartUpdate && typeof normalisedNewProps.startTime === 'number' && Number.isFinite(normalisedNewProps.startTime)
      ? Math.max(0, normalisedNewProps.startTime)
      : currentObject.startTime;
    const nextDuration = hasDurationUpdate && typeof normalisedNewProps.duration === 'number' && Number.isFinite(normalisedNewProps.duration)
      ? Math.max(0.1, normalisedNewProps.duration)
      : currentObject.duration;

    if (hasExplicitKeyframesUpdate) {
      const keyframesRaw = Array.isArray(normalisedNewProps.keyframes) ? normalisedNewProps.keyframes : [];
      adjustedNewProps = {
        ...adjustedNewProps,
        keyframes: normaliseKeyframesForObject(
          { ...currentObject, ...adjustedNewProps, startTime: nextStartTime, duration: nextDuration },
          keyframesRaw
        )
      };
    } else if (currentObject.keyframes && currentObject.keyframes.length > 0) {
      const nextX = hasXUpdate && typeof normalisedNewProps.x === 'number' && Number.isFinite(normalisedNewProps.x)
        ? normalisedNewProps.x
        : currentObject.x;
      const nextY = hasYUpdate && typeof normalisedNewProps.y === 'number' && Number.isFinite(normalisedNewProps.y)
        ? normalisedNewProps.y
        : currentObject.y;
      const deltaTime = hasStartUpdate ? nextStartTime - currentObject.startTime : 0;
      const deltaX = hasXUpdate ? nextX - currentObject.x : 0;
      const deltaY = hasYUpdate ? nextY - currentObject.y : 0;
      const needsKeyframeShift = Math.abs(deltaTime) > 0.0001
        || Math.abs(deltaX) > 0.0001
        || Math.abs(deltaY) > 0.0001
        || hasDurationUpdate;
      if (needsKeyframeShift) {
        const shiftedKeyframes = shiftKeyframesForObject(
          { ...currentObject, startTime: nextStartTime, duration: nextDuration },
          currentObject.keyframes,
          deltaTime,
          deltaX,
          deltaY
        );
        adjustedNewProps = {
          ...adjustedNewProps,
          keyframes: shiftedKeyframes
        };
      }
    }

    const changedKeys = Object.keys(adjustedNewProps) as (keyof TimelineObject)[];
    const hasAnyDiff = changedKeys.some((key) => {
      return !Object.is(currentObject[key], adjustedNewProps[key]);
    });

    if (!hasAnyDiff) return {};

    const hasFilterUpdate = Object.prototype.hasOwnProperty.call(adjustedNewProps, 'filters');
    const hasLegacyEffectUpdate = Object.prototype.hasOwnProperty.call(adjustedNewProps, 'colorCorrection')
      || Object.prototype.hasOwnProperty.call(adjustedNewProps, 'customClipping')
      || Object.prototype.hasOwnProperty.call(adjustedNewProps, 'vibration')
      || Object.prototype.hasOwnProperty.call(adjustedNewProps, 'shadow');

    const mergedObject = { ...currentObject, ...adjustedNewProps } as TimelineObject;
    const updatedObject = syncObjectKeyframes(hasFilterUpdate
      ? syncLegacyEffectsWithFilters(mergedObject)
      : (hasLegacyEffectUpdate
        ? syncFiltersFromLegacyValues(mergedObject)
        : syncLegacyEffectsWithFilters(mergedObject)));
    const newObjects = state.objects.slice();
    newObjects[targetIndex] = updatedObject;

    if (!needsDurationRecalculation(adjustedNewProps)) {
      return { objects: newObjects };
    }

    return {
      objects: newObjects,
      duration: calculateAutoDuration(newObjects)
    };
  }),

  addObjectFilter: (objectId, filterType) => {
    const targetObject = get().objects.find((obj) => obj.id === objectId);
    if (!targetObject) return;
    if (isLayerLocked(get().layers, clampLayerIndex(targetObject.layer))) return;

    get().pushHistory();
    set((state) => {
      const targetIndex = state.objects.findIndex((obj) => obj.id === objectId);
      if (targetIndex < 0) return {};
      const nextObjects = state.objects.slice();
      nextObjects[targetIndex] = addFilterToObject(nextObjects[targetIndex], filterType);
      return { objects: nextObjects };
    });
  },

  toggleObjectFilter: (objectId, filterId) => {
    const targetObject = get().objects.find((obj) => obj.id === objectId);
    if (!targetObject) return;
    if (isLayerLocked(get().layers, clampLayerIndex(targetObject.layer))) return;

    get().pushHistory();
    set((state) => {
      const targetIndex = state.objects.findIndex((obj) => obj.id === objectId);
      if (targetIndex < 0) return {};
      const nextObjects = state.objects.slice();
      nextObjects[targetIndex] = toggleFilterEnabledInObject(nextObjects[targetIndex], filterId);
      return { objects: nextObjects };
    });
  },

  moveObjectFilter: (objectId, filterId, direction) => {
    const targetObject = get().objects.find((obj) => obj.id === objectId);
    if (!targetObject) return;
    if (isLayerLocked(get().layers, clampLayerIndex(targetObject.layer))) return;

    get().pushHistory();
    set((state) => {
      const targetIndex = state.objects.findIndex((obj) => obj.id === objectId);
      if (targetIndex < 0) return {};
      const nextObjects = state.objects.slice();
      nextObjects[targetIndex] = moveFilterInObject(nextObjects[targetIndex], filterId, direction);
      return { objects: nextObjects };
    });
  },

  removeObjectFilter: (objectId, filterId) => {
    const targetObject = get().objects.find((obj) => obj.id === objectId);
    if (!targetObject) return;
    if (isLayerLocked(get().layers, clampLayerIndex(targetObject.layer))) return;

    get().pushHistory();
    set((state) => {
      const targetIndex = state.objects.findIndex((obj) => obj.id === objectId);
      if (targetIndex < 0) return {};
      const nextObjects = state.objects.slice();
      nextObjects[targetIndex] = removeFilterFromObject(nextObjects[targetIndex], filterId);
      return { objects: nextObjects };
    });
  },

  updateObjectFilterParams: (objectId, filterId, params) => set((state) => {
    const targetIndex = state.objects.findIndex((obj) => obj.id === objectId);
    if (targetIndex < 0) return {};
    const targetObject = state.objects[targetIndex];
    if (isLayerLocked(state.layers, clampLayerIndex(targetObject.layer))) return {};

    const nextObjects = state.objects.slice();
    nextObjects[targetIndex] = updateFilterParamsInObject(nextObjects[targetIndex], filterId, params);
    return { objects: nextObjects };
  }),

  deleteObject: (id) => {
    const currentObject = get().objects.find((obj) => obj.id === id);
    if (!currentObject) return;

    const layer = clampLayerIndex(currentObject.layer);
    if (isLayerLocked(get().layers, layer)) return;

    get().pushHistory();
    set((state) => {
      const newObjects = state.objects.filter(obj => obj.id !== id);
      const nextSelectedIds = state.selectedIds.filter((selectedId) => selectedId !== id);
      const lastSelectedId = nextSelectedIds.length > 0 ? nextSelectedIds[nextSelectedIds.length - 1] : null;
      return {
        objects: newObjects,
        selectedId: state.selectedId === id ? lastSelectedId : state.selectedId,
        selectedIds: nextSelectedIds,
        duration: calculateAutoDuration(newObjects)
      };
    });
  },

  deleteSelectedObjects: () => {
    const state = get();
    const selectedObjects = getSelectedObjects(state);
    if (selectedObjects.length === 0) return;

    const deletableIds = selectedObjects
      .filter((obj) => !isLayerLocked(state.layers, clampLayerIndex(obj.layer)))
      .map((obj) => obj.id);
    if (deletableIds.length === 0) return;

    const deletableSet = new Set(deletableIds);
    get().pushHistory();
    set((currentState) => {
      const newObjects = currentState.objects.filter((obj) => !deletableSet.has(obj.id));
      return {
        objects: newObjects,
        selectedId: null,
        selectedIds: [],
        duration: calculateAutoDuration(newObjects)
      };
    });
  },

  splitObject: () => {
    const { objects, selectedId, currentTime, layers } = get();
    const target = objects.find(o => o.id === selectedId);

    if (!target || currentTime <= target.startTime || currentTime >= target.startTime + target.duration) {
        return;
    }

    if (isLayerLocked(layers, clampLayerIndex(target.layer))) {
        return;
    }

    get().pushHistory();

    const splitPoint = currentTime - target.startTime;
    const splitTime = currentTime;
    const splitPosition = evaluateObjectPositionAtTime(target, splitTime);

    const firstPart = {
        ...target,
        duration: splitPoint,
        endX: splitPosition.x,
        endY: splitPosition.y
    };

    const secondPart: TimelineObject = {
        ...target,
        id: crypto.randomUUID(),
        startTime: splitTime,
        duration: target.duration - splitPoint,
        offset: (target.offset || 0) + splitPoint,
        x: splitPosition.x,
        y: splitPosition.y,
    };

    if (target.keyframes && target.keyframes.length > 0) {
        const normalisedKeyframes = normaliseKeyframesForObject(target, target.keyframes);
        const firstKeyframes = normalisedKeyframes.filter((keyframe) => keyframe.time <= splitTime + KEYFRAME_TIME_EPSILON);
        const secondKeyframes = normalisedKeyframes.filter((keyframe) => keyframe.time >= splitTime - KEYFRAME_TIME_EPSILON);
        const hasBoundaryKeyframe = normalisedKeyframes.some((keyframe) => (
          Math.abs(keyframe.time - splitTime) <= KEYFRAME_TIME_EPSILON
        ));

        if (!hasBoundaryKeyframe) {
          const leftKeyframe = normalisedKeyframes
            .slice()
            .reverse()
            .find((keyframe) => keyframe.time < splitTime);
          const boundaryKeyframe = {
            id: crypto.randomUUID(),
            time: splitTime,
            x: splitPosition.x,
            y: splitPosition.y,
            easing: leftKeyframe?.easing ?? target.easing
          };
          firstKeyframes.push(boundaryKeyframe);
          secondKeyframes.unshift(boundaryKeyframe);
        }

        firstPart.keyframes = firstKeyframes;
        secondPart.keyframes = secondKeyframes
          .map((keyframe) => ({ ...keyframe, id: crypto.randomUUID() }));
    }

    const newObjects = objects.map(o => o.id === target.id ? firstPart : o);
    newObjects.push(secondPart);

    const syncedObjects = newObjects.map(syncObjectKeyframes);

    set({
        objects: syncedObjects,
        selectedId: secondPart.id,
        selectedIds: [secondPart.id],
        duration: calculateAutoDuration(syncedObjects)
    });
  },

  copySelectedObjects: () => set((state) => {
    const selectedObjects = getSelectedObjects(state);
    if (selectedObjects.length === 0) return {};

    return {
      clipboard: buildClipboardState(selectedObjects)
    };
  }),

  cutSelectedObjects: () => {
    const state = get();
    const selectedObjects = getSelectedObjects(state);
    if (selectedObjects.length === 0) return;

    const cutObjects = selectedObjects.filter((obj) => !isLayerLocked(state.layers, clampLayerIndex(obj.layer)));
    if (cutObjects.length === 0) return;

    const cutObjectIdSet = new Set(cutObjects.map((obj) => obj.id));
    const clipboard = buildClipboardState(cutObjects);

    get().pushHistory();
    set((currentState) => {
      const newObjects = currentState.objects.filter((obj) => !cutObjectIdSet.has(obj.id));
      return {
        clipboard,
        objects: newObjects,
        selectedId: null,
        selectedIds: [],
        duration: calculateAutoDuration(newObjects)
      };
    });
  },

  pasteClipboardObjects: () => {
    const state = get();
    const clipboard = state.clipboard;
    if (!clipboard || clipboard.objects.length === 0) return;

    const groupIdMap = new Map<string, string>();
    const pastedObjects: TimelineObject[] = [];

    clipboard.objects.forEach((template) => {
      const targetLayer = clampLayerIndex(template.layer);
      if (isLayerLocked(state.layers, targetLayer)) return;

      const cloned = cloneTimelineObject(template);
      const xOffset = template.x - clipboard.anchorX;
      const yOffset = template.y - clipboard.anchorY;

      cloned.id = crypto.randomUUID();
      cloned.startTime = Math.max(0, state.currentTime + (template.startTime - clipboard.anchorStartTime));
      const startTimeDelta = cloned.startTime - template.startTime;
      cloned.layer = targetLayer;
      cloned.x = clipboard.anchorX + xOffset + 16;
      cloned.y = clipboard.anchorY + yOffset + 16;
      cloned.endX = cloned.endX + 16;
      cloned.endY = cloned.endY + 16;
      if (cloned.motionPath) {
        cloned.motionPath = cloned.motionPath.map((point) => ({
          ...point,
          x: point.x + 16,
          y: point.y + 16
        }));
      }
      if (cloned.keyframes) {
        cloned.keyframes = cloned.keyframes.map((keyframe) => ({
          ...keyframe,
          id: crypto.randomUUID(),
          time: keyframe.time + startTimeDelta,
          x: keyframe.x + 16,
          y: keyframe.y + 16
        }));
      }

      if (cloned.groupId) {
        if (!groupIdMap.has(cloned.groupId)) {
          groupIdMap.set(cloned.groupId, crypto.randomUUID());
        }
        cloned.groupId = groupIdMap.get(cloned.groupId);
      }

      pastedObjects.push(syncObjectKeyframes(syncLegacyEffectsWithFilters(cloned)));
    });

    if (pastedObjects.length === 0) return;

    get().pushHistory();
    set((currentState) => {
      const newObjects = [...currentState.objects, ...pastedObjects];
      return {
        objects: newObjects,
        selectedId: pastedObjects[pastedObjects.length - 1].id,
        selectedIds: pastedObjects.map((obj) => obj.id),
        duration: calculateAutoDuration(newObjects)
      };
    });
  },

  duplicateSelectedObjects: () => {
    const state = get();
    const selectedObjects = getSelectedObjects(state);
    if (selectedObjects.length === 0) return;

    const sorted = selectedObjects
      .slice()
      .sort((a, b) => a.startTime - b.startTime || a.layer - b.layer);
    const groupIdMap = new Map<string, string>();
    const duplicatedObjects: TimelineObject[] = [];

    sorted.forEach((template) => {
      const targetLayer = clampLayerIndex(template.layer + 1);
      if (isLayerLocked(state.layers, targetLayer)) return;

      const cloned = cloneTimelineObject(template);
      cloned.id = crypto.randomUUID();
      cloned.startTime = template.startTime + 0.2;
      const startTimeDelta = cloned.startTime - template.startTime;
      cloned.layer = targetLayer;
      cloned.x = template.x + 20;
      cloned.y = template.y + 20;
      cloned.endX = cloned.endX + 20;
      cloned.endY = cloned.endY + 20;
      if (cloned.motionPath) {
        cloned.motionPath = cloned.motionPath.map((point) => ({
          ...point,
          x: point.x + 20,
          y: point.y + 20
        }));
      }
      if (cloned.keyframes) {
        cloned.keyframes = cloned.keyframes.map((keyframe) => ({
          ...keyframe,
          id: crypto.randomUUID(),
          time: keyframe.time + startTimeDelta,
          x: keyframe.x + 20,
          y: keyframe.y + 20
        }));
      }

      if (cloned.groupId) {
        if (!groupIdMap.has(cloned.groupId)) {
          groupIdMap.set(cloned.groupId, crypto.randomUUID());
        }
        cloned.groupId = groupIdMap.get(cloned.groupId);
      }

      duplicatedObjects.push(syncObjectKeyframes(syncLegacyEffectsWithFilters(cloned)));
    });

    if (duplicatedObjects.length === 0) return;

    get().pushHistory();
    set((currentState) => {
      const newObjects = [...currentState.objects, ...duplicatedObjects];
      return {
        objects: newObjects,
        selectedId: duplicatedObjects[duplicatedObjects.length - 1].id,
        selectedIds: duplicatedObjects.map((obj) => obj.id),
        duration: calculateAutoDuration(newObjects)
      };
    });
  },

  groupSelectedObjects: () => {
    const state = get();
    const selectedObjects = getSelectedObjects(state);
    if (selectedObjects.length < 2) return;

    const editableIds = selectedObjects
      .filter((obj) => !isLayerLocked(state.layers, clampLayerIndex(obj.layer)))
      .map((obj) => obj.id);
    if (editableIds.length < 2) return;

    const editableSet = new Set(editableIds);
    const newGroupId = crypto.randomUUID();
    get().pushHistory();
    set((currentState) => {
      const newObjects = currentState.objects.map((obj) => {
        if (!editableSet.has(obj.id)) return obj;
        return { ...obj, groupId: newGroupId };
      });
      return { objects: newObjects };
    });
  },

  ungroupSelectedObjects: () => {
    const state = get();
    const selectedObjects = getSelectedObjects(state);
    if (selectedObjects.length === 0) return;

    const groupIds = new Set(
      selectedObjects
        .map((obj) => obj.groupId)
        .filter((groupId): groupId is string => typeof groupId === 'string' && groupId.trim() !== '')
    );
    if (groupIds.size === 0) return;

    get().pushHistory();
    set((currentState) => {
      const newObjects = currentState.objects.map((obj) => {
        if (!obj.groupId || !groupIds.has(obj.groupId)) return obj;
        if (isLayerLocked(currentState.layers, clampLayerIndex(obj.layer))) return obj;
        return { ...obj, groupId: undefined };
      });
      return { objects: newObjects };
    });
  },

  selectObject: (id) => set((state) => {
    if (id === null) {
      if (state.selectedId === null && state.selectedIds.length === 0) return {};
      return { selectedId: null, selectedIds: [] };
    }

    if (state.selectedId === id && state.selectedIds.length === 1 && state.selectedIds[0] === id) {
      return {};
    }

    return { selectedId: id, selectedIds: [id] };
  }),

  toggleObjectSelection: (id) => set((state) => {
    const exists = state.selectedIds.includes(id);
    if (exists) {
      const nextSelectedIds = state.selectedIds.filter((selectedId) => selectedId !== id);
      const lastSelectedId = nextSelectedIds.length > 0 ? nextSelectedIds[nextSelectedIds.length - 1] : null;
      return {
        selectedIds: nextSelectedIds,
        selectedId: state.selectedId === id ? lastSelectedId : state.selectedId
      };
    }

    return {
      selectedIds: [...state.selectedIds, id],
      selectedId: id
    };
  }),

  selectObjects: (ids, primaryId = null) => set((state) => {
    const uniqueIds = ids.filter((id, index, array) => array.indexOf(id) === index);
    const existingIdSet = new Set(state.objects.map((obj) => obj.id));
    const nextSelectedIds = uniqueIds.filter((id) => existingIdSet.has(id));

    if (nextSelectedIds.length === 0) {
      return { selectedId: null, selectedIds: [] };
    }

    const fallbackSelectedId = nextSelectedIds[nextSelectedIds.length - 1];
    const nextSelectedId = primaryId && nextSelectedIds.includes(primaryId)
      ? primaryId
      : fallbackSelectedId;

    return {
      selectedId: nextSelectedId,
      selectedIds: nextSelectedIds
    };
  }),

  clearSelection: () => set((state) => {
    if (state.selectedId === null && state.selectedIds.length === 0) return {};
    return { selectedId: null, selectedIds: [] };
  }),
}));
