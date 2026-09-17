import type { StoreApi } from 'zustand';
import type { AppState } from '../storeTypes';
import {
  collectExportDiagnostics,
  normaliseExportProgressDiagnostics,
} from '../storeHelpers';
import type { VideoExportCodec } from '../../utils/videoExportEncodeSettings';

const EXPORT_VIDEO_CODEC_STORAGE_KEY = 'uxfd-export-video-codec';

const loadExportVideoCodec = (): VideoExportCodec => {
  try {
    const savedCodec = localStorage.getItem(EXPORT_VIDEO_CODEC_STORAGE_KEY);
    return savedCodec === 'hevc' || savedCodec === 'prores' ? savedCodec : 'h264';
  } catch {
    return 'h264';
  }
};

type ExportSlice = Pick<
  AppState,
  | 'isExporting'
  | 'exportProgress'
  | 'lastExportDiagnostics'
  | 'exportCancelRequested'
  | 'exportVideoCodec'
  | 'setExporting'
  | 'setExportProgress'
  | 'requestExportCancel'
  | 'setExportVideoCodec'
>;

type SetState = StoreApi<AppState>['setState'];

export const createExportSlice = (set: SetState): ExportSlice => ({
  isExporting: false,
  exportProgress: null,
  lastExportDiagnostics: null,
  exportCancelRequested: false,
  exportVideoCodec: loadExportVideoCodec(),

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

  setExportVideoCodec: (codec) => {
    try {
      localStorage.setItem(EXPORT_VIDEO_CODEC_STORAGE_KEY, codec);
    } catch {
      // Keep the value in memory when localStorage is unavailable.
    }
    set({ exportVideoCodec: codec });
  },
});
