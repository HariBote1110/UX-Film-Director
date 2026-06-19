import type { ExportPhase, ExportProgress } from '../store/useStore';

export interface ExportProgressPhasePatch {
  phase: ExportPhase;
  currentFrame: number;
  totalFrames: number;
}

export const updateExportProgressPhase = (
  progress: ExportProgress | null,
  patch: ExportProgressPhasePatch
): ExportProgress => ({
  ...(progress ?? {}),
  ...patch,
});
