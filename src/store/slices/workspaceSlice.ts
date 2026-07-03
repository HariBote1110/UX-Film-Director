import type { StoreApi } from 'zustand';
import type { AppState } from '../storeTypes';
import {
  PREVIEW_MODE_STORAGE_KEY,
  readStoredPreviewMode,
} from '../storeHelpers';

type WorkspaceSlice = Pick<
  AppState,
  | 'language'
  | 'isSnapshotRequested'
  | 'proxyGenerationCount'
  | 'previewDisplayMode'
  | 'visionDetectionPreviewEnabled'
  | 'visionDetectionRealtimeEnabled'
  | 'visionDetectionOverlay'
  | 'previewObstructed'
  | 'setLanguage'
  | 'requestSnapshot'
  | 'finishSnapshot'
  | 'beginProxyGeneration'
  | 'endProxyGeneration'
  | 'setPreviewDisplayMode'
  | 'setVisionDetectionPreviewEnabled'
  | 'setVisionDetectionRealtimeEnabled'
  | 'setVisionDetectionOverlay'
  | 'setPreviewObstructed'
  | 'clearPreviewObstructed'
>;

type SetState = StoreApi<AppState>['setState'];

export const createWorkspaceSlice = (set: SetState): WorkspaceSlice => ({
  language: 'ja',
  isSnapshotRequested: false,
  proxyGenerationCount: 0,
  previewDisplayMode: readStoredPreviewMode(),
  visionDetectionPreviewEnabled: false,
  visionDetectionRealtimeEnabled: false,
  visionDetectionOverlay: null,
  previewObstructed: { obstructed: false, reason: null, rect: null },

  setLanguage: (lang) => set({ language: lang }),

  requestSnapshot: () => set({ isSnapshotRequested: true }),
  finishSnapshot: () => set({ isSnapshotRequested: false }),

  beginProxyGeneration: () => set((state) => ({
    proxyGenerationCount: state.proxyGenerationCount + 1,
  })),
  endProxyGeneration: () => set((state) => ({
    proxyGenerationCount: Math.max(0, state.proxyGenerationCount - 1),
  })),

  setPreviewDisplayMode: (mode) => {
    try {
      localStorage.setItem(PREVIEW_MODE_STORAGE_KEY, mode);
    } catch {
      /* ignore */
    }
    set({ previewDisplayMode: mode });
  },

  setVisionDetectionPreviewEnabled: (enabled) => set((state) => ({
    visionDetectionPreviewEnabled: enabled,
    ...(enabled ? {} : { visionDetectionRealtimeEnabled: false })
  })),

  setVisionDetectionRealtimeEnabled: (enabled) => set({ visionDetectionRealtimeEnabled: enabled }),

  setVisionDetectionOverlay: (overlay) => set({ visionDetectionOverlay: overlay }),

  // Bug E（Native_Overlay_Bug_E_Plan.md §3・Phase E1）— preview に重なる
  // HTML 駆動 UI が開いたことを記録する正本 action。
  setPreviewObstructed: (reason, rect) => set({
    previewObstructed: { obstructed: true, reason, rect },
  }),
  clearPreviewObstructed: (reason) => set((state) => (
    state.previewObstructed.reason === reason
      ? { previewObstructed: { obstructed: false, reason: null, rect: null } }
      : {}
  )),
});
