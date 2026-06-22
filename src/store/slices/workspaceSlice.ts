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
  | 'previewDisplayMode'
  | 'visionDetectionPreviewEnabled'
  | 'visionDetectionRealtimeEnabled'
  | 'visionDetectionOverlay'
  | 'setLanguage'
  | 'requestSnapshot'
  | 'finishSnapshot'
  | 'setPreviewDisplayMode'
  | 'setVisionDetectionPreviewEnabled'
  | 'setVisionDetectionRealtimeEnabled'
  | 'setVisionDetectionOverlay'
>;

type SetState = StoreApi<AppState>['setState'];

export const createWorkspaceSlice = (set: SetState): WorkspaceSlice => ({
  language: 'ja',
  isSnapshotRequested: false,
  previewDisplayMode: readStoredPreviewMode(),
  visionDetectionPreviewEnabled: false,
  visionDetectionRealtimeEnabled: false,
  visionDetectionOverlay: null,

  setLanguage: (lang) => set({ language: lang }),

  requestSnapshot: () => set({ isSnapshotRequested: true }),
  finishSnapshot: () => set({ isSnapshotRequested: false }),

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
});
