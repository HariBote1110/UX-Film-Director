import type { ExportPhase, ExportProgress } from '../store/useStore';
import { normaliseRustFrameSourceBlockedFallback } from './rustFrameSourceBlockedFallback';

export interface ExportProgressPhasePatch {
  phase: ExportPhase;
  currentFrame: number;
  totalFrames: number;
}

export const updateExportProgressPhase = (
  progress: ExportProgress | null,
  patch: ExportProgressPhasePatch
): ExportProgress => {
  const next = {
    ...(progress ?? {}),
    ...patch,
  };
  return {
    ...next,
    ...(next.rustFrameSourceBlocked ? {
      rustFrameSourceBlocked: normaliseRustFrameSourceBlockedFallback(next.rustFrameSourceBlocked),
    } : {}),
  };
};
