import { create } from 'zustand';
import { TimelineObject, ProjectSettings } from '../types';

interface AppState {
  // Project State
  isProjectLoaded: boolean;
  projectSettings: ProjectSettings;
  
  // Export State
  isExporting: boolean;

  // Editor State
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  objects: TimelineObject[];
  selectedId: string | null;
  
  // Actions
  initializeProject: (settings: ProjectSettings) => void;
  setTime: (time: number) => void;
  setDuration: (duration: number) => void;
  advanceTime: (deltaTime: number) => void;
  togglePlay: () => void;
  setIsPlaying: (isPlaying: boolean) => void;
  setExporting: (isExporting: boolean) => void;
  
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

export const useStore = create<AppState>((set, get) => ({
  isProjectLoaded: false,
  projectSettings: { width: 1920, height: 1080, fps: 60, sampleRate: 44100 },
  isExporting: false,

  currentTime: 0,
  duration: 30,
  isPlaying: false,
  objects: [],
  selectedId: null,

  initializeProject: (settings) => set({ 
    projectSettings: settings,
    isProjectLoaded: true,
    currentTime: 0,
    isPlaying: false
  }),

  setTime: (time) => set({ currentTime: Math.max(0, time) }),
  setDuration: (duration) => set({ duration: Math.max(1, duration) }),

  advanceTime: (deltaTime) => {
    const { currentTime, duration, isPlaying } = get();
    if (!isPlaying) return;
    let nextTime = currentTime + deltaTime;
    if (nextTime >= duration) {
      nextTime = duration;
      set({ isPlaying: false });
    }
    set({ currentTime: nextTime });
  },

  togglePlay: () => set((state) => {
    if (!state.isPlaying && state.currentTime >= state.duration) {
      return { isPlaying: true, currentTime: 0 };
    }
    return { isPlaying: !state.isPlaying };
  }),

  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setExporting: (isExporting) => set({ isExporting }),
  
  addObject: (obj) => set((state) => {
    const newObjects = [...state.objects, { 
      ...obj, 
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
  }),
  
  updateObject: (id, newProps) => set((state) => {
    const newObjects = state.objects.map((obj) => 
      obj.id === id ? { ...obj, ...newProps } : obj
    );
    return {
      objects: newObjects,
      duration: calculateAutoDuration(newObjects)
    };
  }),

  deleteObject: (id) => set((state) => {
    const newObjects = state.objects.filter(obj => obj.id !== id);
    return {
      objects: newObjects,
      selectedId: state.selectedId === id ? null : state.selectedId,
      duration: calculateAutoDuration(newObjects)
    };
  }),

  splitObject: () => set((state) => {
    const { objects, selectedId, currentTime } = state;
    const target = objects.find(o => o.id === selectedId);

    if (!target || currentTime <= target.startTime || currentTime >= target.startTime + target.duration) {
        return {};
    }

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

    return {
        objects: newObjects,
        selectedId: secondPart.id,
        duration: calculateAutoDuration(newObjects)
    };
  }),

  selectObject: (id) => set({ selectedId: id }),
}));