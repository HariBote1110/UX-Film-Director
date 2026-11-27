import { describe, expect, it, vi } from 'vitest';
import {
  formatLastExportDiagnosticsLog,
  logLastExportDiagnostics,
} from './exportDiagnosticsLog';
import type { ExportDiagnostics } from '../store/useStore';

describe('formatLastExportDiagnosticsLog', () => {
  it('returns null when there are no Rust export diagnostics', () => {
    expect(formatLastExportDiagnosticsLog(null)).toBeNull();
    expect(formatLastExportDiagnosticsLog({})).toBeNull();
  });

  it('formats Rust export diagnostics for DevTools logs', () => {
    const diagnostics: ExportDiagnostics = {
      exportFrameSourcePlanFailure: {
        reason: 'rustFrameSourceRequired',
        detail: 'Video export requires a shared-frame Rust export source.',
      },
      rustFrameSourceBlocked: {
        reason: 'videoOwnershipUnavailable',
        frameIndex: 5,
        legacyCanvasFallbackAllowed: true,
        detail: 'Shared renderer export is missing uploaded video clips: video-2.',
      },
      nativeRenderOutputRelease: {
        status: 'failed',
        memoryId: '/uxfd-native-render-output',
        reason: 'encodeWriteFailed',
        error: 'release rejected',
      },
    };

    expect(formatLastExportDiagnosticsLog(diagnostics)).toBe(
      'Rust export diagnostics: frameSourcePlanFailure reason=rustFrameSourceRequired detail=Video export requires a shared-frame Rust export source. | frameSourceBlocked reason=videoOwnershipUnavailable frame=5 legacyFallback=false detail=Shared renderer export is missing uploaded video clips: video-2. | nativeRenderOutputRelease status=failed memory=/uxfd-native-render-output reason=encodeWriteFailed error=release rejected'
    );
  });
});

describe('logLastExportDiagnostics', () => {
  it('logs formatted diagnostics only when they exist', () => {
    const logger = { warn: vi.fn() };

    logLastExportDiagnostics(null, logger);
    expect(logger.warn).not.toHaveBeenCalled();

    logLastExportDiagnostics({
      rustFrameSourceBlocked: {
        reason: 'videoUploadFailed',
        frameIndex: 8,
        legacyCanvasFallbackAllowed: false,
      },
    }, logger);

    expect(logger.warn).toHaveBeenCalledWith(
      'Rust export diagnostics: frameSourceBlocked reason=videoUploadFailed frame=8 legacyFallback=false'
    );
  });
});
