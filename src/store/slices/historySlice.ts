import type { StoreApi } from 'zustand';
import {
  sanitiseCamera,
  sanitiseStageCamera3D,
} from '../../utils/sceneState';
import type { AppState } from '../storeTypes';
import { calculateAutoDuration } from '../storeHelpers';

type HistorySlice = Pick<
  AppState,
  | 'pastStates'
  | 'futureStates'
  | 'pushHistory'
  | 'undo'
  | 'redo'
>;

type SetState = StoreApi<AppState>['setState'];

export const createHistorySlice = (set: SetState): HistorySlice => ({
  pastStates: [],
  futureStates: [],

  pushHistory: () => set((state) => ({
    pastStates: [
      ...state.pastStates,
      {
        objects: state.objects,
        layers: state.layers.map((layer) => ({ ...layer })),
        camera: { ...state.camera },
        stageCamera3D: {
          position: { ...state.stageCamera3D.position },
          target: { ...state.stageCamera3D.target }
        }
      }
    ],
    futureStates: []
  })),

  undo: () => set((state) => {
    if (state.pastStates.length === 0) return {};
    const previous = state.pastStates[state.pastStates.length - 1];
    const newPast = state.pastStates.slice(0, -1);
    return {
      objects: previous.objects,
      layers: previous.layers.map((layer) => ({ ...layer })),
      camera: sanitiseCamera(previous.camera),
      stageCamera3D: sanitiseStageCamera3D(previous.stageCamera3D),
      pastStates: newPast,
      futureStates: [
        {
          objects: state.objects,
          layers: state.layers.map((layer) => ({ ...layer })),
          camera: { ...state.camera },
          stageCamera3D: {
            position: { ...state.stageCamera3D.position },
            target: { ...state.stageCamera3D.target }
          }
        },
        ...state.futureStates
      ],
      duration: calculateAutoDuration(previous.objects),
      selectedId: null,
      selectedIds: []
    };
  }),

  redo: () => set((state) => {
    if (state.futureStates.length === 0) return {};
    const next = state.futureStates[0];
    const newFuture = state.futureStates.slice(1);
    return {
      objects: next.objects,
      layers: next.layers.map((layer) => ({ ...layer })),
      camera: sanitiseCamera(next.camera),
      stageCamera3D: sanitiseStageCamera3D(next.stageCamera3D),
      pastStates: [
        ...state.pastStates,
        {
          objects: state.objects,
          layers: state.layers.map((layer) => ({ ...layer })),
          camera: { ...state.camera },
          stageCamera3D: {
            position: { ...state.stageCamera3D.position },
            target: { ...state.stageCamera3D.target }
          }
        }
      ],
      futureStates: newFuture,
      duration: calculateAutoDuration(next.objects),
      selectedId: null,
      selectedIds: []
    };
  }),
});
