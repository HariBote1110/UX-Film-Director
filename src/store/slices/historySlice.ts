import type { StoreApi } from 'zustand';
import {
  sanitiseCamera,
  sanitiseStageCamera3D,
} from '../../utils/sceneState';
import type { AppState } from '../storeTypes';
import { calculateAutoDuration } from '../storeHelpers';
import type { Command } from '../../generated/rustCore/Command';
import type { SceneData } from '../../generated/rustCore/SceneData';
import type { TimelineObject } from '../../types';
import { getCommandBridge } from '../../utils/rustBackendCommandBridge';
import { invertCommand } from '../../utils/invertCommand';

type HistorySlice = Pick<
  AppState,
  | 'pastStates'
  | 'futureStates'
  | 'pushHistory'
  | 'undo'
  | 'redo'
  | 'pastCommands'
  | 'futureCommands'
  | 'isCommandHistoryPending'
  | 'pushHistoryCommand'
  | 'undoCommand'
  | 'redoCommand'
>;

type SetState = StoreApi<AppState>['setState'];
type GetState = StoreApi<AppState>['getState'];

/**
 * 現在の store 状態からアクティブシーンの `SceneData` を組み立てる。
 * `state.scenes.find(s => s.id === activeSceneId)` から `id`/`name` を
 * 取得し、`objects`/`layers`/`duration`/`camera`/`stageCamera3D` は
 * store のトップレベル状態（アクティブシーンの生値）を使う
 * （`src/utils/sceneState.ts` の `flushActiveIntoScenes` と同じ構造。
 * progress/rust-source-of-truth-r4-8-command-ipc.md 参照）。
 */
const buildActiveSceneData = (state: AppState): SceneData | null => {
  const activeScene = state.scenes.find((scene) => scene.id === state.activeSceneId);
  if (!activeScene) return null;
  return {
    id: activeScene.id,
    name: activeScene.name,
    // `src/types.ts` の `TimelineObject`（`groupId?: string`）と
    // ts-rs 生成の `TimelineObject`（`groupId?: string | null`）は
    // ワイヤ表現の差（serde `Option<String>` → `string | null`）のみで
    // 実データは互換なため、IPC 境界でここだけ横断キャストする。
    objects: state.objects as unknown as SceneData['objects'],
    layers: state.layers.map((layer) => ({ ...layer })),
    duration: state.duration,
    camera: { ...state.camera },
    stageCamera3D: {
      position: { ...state.stageCamera3D.position },
      target: { ...state.stageCamera3D.target },
    },
  };
};

/**
 * command apply の成功結果（`SceneData`）を store のトップレベル状態へ
 * 反映する。`objects`/`layers`/`camera`/`stageCamera3D`/`duration` のみ
 * （`id`/`name` は scenes 配列側の責務で、command 層は触れない）。
 */
const applySceneResult = (scene: SceneData) => {
  const objects = scene.objects as unknown as TimelineObject[];
  return {
    objects,
    layers: scene.layers.map((layer) => ({ ...layer })),
    camera: sanitiseCamera(scene.camera),
    stageCamera3D: sanitiseStageCamera3D(scene.stageCamera3D),
    duration: calculateAutoDuration(objects),
    selectedId: null,
    selectedIds: [],
  };
};
export const createHistorySlice = (set: SetState, get: GetState): HistorySlice => ({
  pastStates: [],
  futureStates: [],

  pastCommands: [],
  futureCommands: [],
  isCommandHistoryPending: false,

  pushHistoryCommand: (command: Command) => set((state) => ({
    pastCommands: [...state.pastCommands, command],
    futureCommands: [],
  })),

  undoCommand: async () => {
    const state = get();
    if (state.isCommandHistoryPending) return;
    if (state.pastCommands.length === 0) return;
    const bridge = getCommandBridge();
    if (!bridge) return;

    const command = state.pastCommands[state.pastCommands.length - 1];
    const scene = buildActiveSceneData(state);
    if (!scene) return;

    set({ isCommandHistoryPending: true });
    try {
      const response = await bridge.applyCommand({ scene, command: invertCommand(command) });
      if (!response.success || !response.result) {
        console.error('undoCommand: command.apply failed', response.error, response.errorCode);
        return;
      }
      set((current) => ({
        ...applySceneResult(response.result!.scene),
        pastCommands: current.pastCommands.slice(0, -1),
        futureCommands: [command, ...current.futureCommands],
      }));
    } finally {
      set({ isCommandHistoryPending: false });
    }
  },

  redoCommand: async () => {
    const state = get();
    if (state.isCommandHistoryPending) return;
    if (state.futureCommands.length === 0) return;
    const bridge = getCommandBridge();
    if (!bridge) return;

    const command = state.futureCommands[0];
    const scene = buildActiveSceneData(state);
    if (!scene) return;

    set({ isCommandHistoryPending: true });
    try {
      const response = await bridge.applyCommand({ scene, command });
      if (!response.success || !response.result) {
        console.error('redoCommand: command.apply failed', response.error, response.errorCode);
        return;
      }
      set((current) => ({
        ...applySceneResult(response.result!.scene),
        pastCommands: [...current.pastCommands, command],
        futureCommands: current.futureCommands.slice(1),
      }));
    } finally {
      set({ isCommandHistoryPending: false });
    }
  },

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
