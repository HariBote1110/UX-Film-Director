import { create } from 'zustand';
import { TimelineObject, ProjectSettings, LayerState } from '../types';
import { MAX_LAYERS } from '../components/timelineConstants';

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
  deleteObject: (id: string) => void;
  splitObject: () => void;
  selectObject: (id: string | null) => void;
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
    pastStates: [],
    futureStates: []
  }),

  loadProject: (settings, objects, duration, layers) => {
    const normalisedObjects = objects.map(normaliseObjectLayer);
    set({
      projectSettings: settings,
      isProjectLoaded: true,
      currentTime: 0,
      duration: Math.max(1, duration ?? calculateAutoDuration(normalisedObjects)),
      isPlaying: false,
      layers: normaliseLayers(layers),
      objects: normalisedObjects,
      selectedId: null,
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
      duration: calculateAutoDuration(previous)
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
      duration: calculateAutoDuration(next)
    };
  }),

  addObject: (obj) => {
    const targetLayer = clampLayerIndex(obj.layer);
    const state = get();
    if (isLayerLocked(state.layers, targetLayer)) return;

    get().pushHistory();
    set((state) => {
      const newObjects = [...state.objects, { 
        ...obj, 
        layer: targetLayer,
        enableAnimation: obj.enableAnimation ?? false,
        endX: obj.endX ?? obj.x,
        endY: obj.endY ?? obj.y,
        easing: obj.easing ?? 'linear',
        offset: obj.offset ?? 0
      }];
      return { 
        objects: newObjects,
        selectedId: obj.id,
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

    const changedKeys = Object.keys(normalisedNewProps) as (keyof TimelineObject)[];
    const hasAnyDiff = changedKeys.some((key) => {
      return !Object.is(currentObject[key], normalisedNewProps[key]);
    });

    if (!hasAnyDiff) return {};

    const updatedObject = { ...currentObject, ...normalisedNewProps } as TimelineObject;
    const newObjects = state.objects.slice();
    newObjects[targetIndex] = updatedObject;

    if (!needsDurationRecalculation(normalisedNewProps)) {
      return { objects: newObjects };
    }

    return {
      objects: newObjects,
      duration: calculateAutoDuration(newObjects)
    };
  }),

  deleteObject: (id) => {
    const currentObject = get().objects.find((obj) => obj.id === id);
    if (!currentObject) return;

    const layer = clampLayerIndex(currentObject.layer);
    if (isLayerLocked(get().layers, layer)) return;

    get().pushHistory();
    set((state) => {
      const newObjects = state.objects.filter(obj => obj.id !== id);
      return {
        objects: newObjects,
        selectedId: state.selectedId === id ? null : state.selectedId,
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

    const firstPart = {
        ...target,
        duration: splitPoint
    };

    const secondPart: TimelineObject = {
        ...target,
        id: crypto.randomUUID(),
        startTime: currentTime,
        duration: target.duration - splitPoint,
        offset: (target.offset || 0) + splitPoint,
    };

    const newObjects = objects.map(o => o.id === target.id ? firstPart : o);
    newObjects.push(secondPart);

    set({
        objects: newObjects,
        selectedId: secondPart.id,
        duration: calculateAutoDuration(newObjects)
    });
  },

  selectObject: (id) => set({ selectedId: id }),
}));
