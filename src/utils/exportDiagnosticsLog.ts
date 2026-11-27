import type { ExportDiagnostics } from '../store/useStore';
import { isRustFrameSourceLegacyCanvasFallbackAllowed } from './rustFrameSourceBlockedFallback';

export interface ExportDiagnosticsLogger {
  warn: (message: string) => void;
}

export const formatLastExportDiagnosticsLog = (
  diagnostics: ExportDiagnostics | null
): string | null => {
  if (!diagnostics) return null;
  const parts: string[] = [];

  if (diagnostics.exportFrameSourcePlanFailure) {
    const failure = diagnostics.exportFrameSourcePlanFailure;
    parts.push(`frameSourcePlanFailure reason=${failure.reason} detail=${failure.detail}`);
  }

  if (diagnostics.rustFrameSourceBlocked) {
    const blocked = diagnostics.rustFrameSourceBlocked;
    const blockedParts = [
      `reason=${blocked.reason}`,
      `frame=${blocked.frameIndex}`,
      `legacyFallback=${isRustFrameSourceLegacyCanvasFallbackAllowed(blocked)}`,
      blocked.detail ? `detail=${blocked.detail}` : undefined,
    ].filter(Boolean);
    parts.push(`frameSourceBlocked ${blockedParts.join(' ')}`);
  }

  if (diagnostics.nativeRenderOutputRelease) {
    const release = diagnostics.nativeRenderOutputRelease;
    const releaseParts = [
      `status=${release.status}`,
      'memoryId' in release && release.memoryId ? `memory=${release.memoryId}` : undefined,
      `reason=${release.reason}`,
      'error' in release && release.error ? `error=${release.error}` : undefined,
    ].filter(Boolean);
    parts.push(`nativeRenderOutputRelease ${releaseParts.join(' ')}`);
  }

  return parts.length > 0
    ? `Rust export diagnostics: ${parts.join(' | ')}`
    : null;
};

export const logLastExportDiagnostics = (
  diagnostics: ExportDiagnostics | null,
  logger: ExportDiagnosticsLogger = console
): void => {
  const message = formatLastExportDiagnosticsLog(diagnostics);
  if (message) {
    logger.warn(message);
  }
};
