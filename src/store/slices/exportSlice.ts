import type { StoreApi } from 'zustand';
import type { AppState } from '../storeTypes';
import {
  collectExportDiagnostics,
  normaliseExportProgressDiagnostics,
} from '../storeHelpers';

type ExportSlice = Pick<
  AppState,
  | 'isExporting'
  | 'exportProgress'
  | 'lastExportDiagnostics'
  | 'exportCancelRequested'
  | 'setExporting'
  | 'setExportProgress'
  | 'requestExportCancel'
>;

type SetState = StoreApi<AppState>['setState'];

export const createExportSlice = (set: SetState): ExportSlice => ({
  isExporting: false,
  exportProgress: null,
  lastExportDiagnostics: null,
  exportCancelRequested: false,

  setExporting: (isExporting) => set((state) => (
    isExporting
      ? {
          isExporting: true,
          exportProgress: { phase: 'preparing', currentFrame: 0, totalFrames: 0 },
          lastExportDiagnostics: null,
          exportCancelRequested: false,
        }
      : {
          isExporting: false,
          exportProgress: null,
          lastExportDiagnostics: collectExportDiagnostics(state.exportProgress),
          exportCancelRequested: false,
        }
  )),

  setExportProgress: (exportProgress) => set({
    exportProgress: exportProgress
      ? normaliseExportProgressDiagnostics(exportProgress)
      : null,
  }),

  requestExportCancel: () => set((state) => (
    state.isExporting
      ? {
          exportCancelRequested: true,
          exportProgress: state.exportProgress
            ? { ...state.exportProgress, phase: 'cancelling' }
            : { phase: 'cancelling', currentFrame: 0, totalFrames: 0 },
        }
      : {}
  )),
});
