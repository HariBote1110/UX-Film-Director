import { describe, expect, it } from 'vitest';
import {
  formatLastExportDiagnosticsSummary,
  formatNativeRenderOutputReleaseDiagnostic,
  formatRustFrameSourceBlockedDiagnostic,
} from './ExportProgressModal';
import type { ExportDiagnostics } from '../store/useStore';

describe('formatNativeRenderOutputReleaseDiagnostic', () => {
  it('formats released native render output diagnostics in Japanese', () => {
    expect(formatNativeRenderOutputReleaseDiagnostic({
      status: 'released',
      memoryId: '/uxfd-native-render-output',
      reason: 'encodeWriteFailed',
    }, 'ja')).toBe('Native render output: 解放済み (/uxfd-native-render-output)');
  });

  it('formats missing bridge diagnostics in English', () => {
    expect(formatNativeRenderOutputReleaseDiagnostic({
      status: 'missingBridge',
      memoryId: '/uxfd-native-render-output',
      reason: 'encodeWriteFailed',
    }, 'en')).toBe('Native render output: missing release bridge (/uxfd-native-render-output)');
  });

  it('formats skipped diagnostics without a memory id', () => {
    expect(formatNativeRenderOutputReleaseDiagnostic({
      status: 'skipped',
      reason: 'encodeWriteFailed',
    }, 'en')).toBe('Native render output: skipped');
  });

  it('formats release failure diagnostics without hiding the memory id', () => {
    expect(formatNativeRenderOutputReleaseDiagnostic({
      status: 'failed',
      memoryId: '/uxfd-native-render-output',
      reason: 'encodeWriteFailed',
      error: 'native render output release rejected',
    }, 'en')).toBe('Native render output: release failed (/uxfd-native-render-output) native render output release rejected');
  });
});

describe('formatRustFrameSourceBlockedDiagnostic', () => {
  it('formats blocked Rust frame source diagnostics in Japanese', () => {
    expect(formatRustFrameSourceBlockedDiagnostic({
      reason: 'videoBitmapCaptureDisabled',
      frameIndex: 13,
      legacyCanvasFallbackAllowed: false,
    }, 'ja')).toBe('Rust frame source: 停止 videoBitmapCaptureDisabled frame=13 legacy fallback不可');
  });

  it('formats legacy fallback allowed diagnostics in English', () => {
    expect(formatRustFrameSourceBlockedDiagnostic({
      reason: 'nativeRenderUnavailable',
      frameIndex: 4,
      legacyCanvasFallbackAllowed: true,
    }, 'en')).toBe('Rust frame source: blocked nativeRenderUnavailable frame=4 legacy fallback allowed');
  });

  it('formats native render failed diagnostics with a readable Japanese label', () => {
    expect(formatRustFrameSourceBlockedDiagnostic({
      reason: 'nativeRenderFailed',
      frameIndex: 7,
      legacyCanvasFallbackAllowed: false,
    }, 'ja')).toBe('Rust frame source: 停止 Rust native render失敗 frame=7 legacy fallback不可');
  });

  it('formats native render output release failure diagnostics with a readable English label', () => {
    expect(formatRustFrameSourceBlockedDiagnostic({
      reason: 'nativeRenderOutputReleaseFailed',
      frameIndex: 12,
      legacyCanvasFallbackAllowed: false,
    }, 'en')).toBe('Rust frame source: blocked native render output release failed frame=12 legacy fallback disabled');
  });

  it('formats native render source release failure diagnostics with a readable Japanese label', () => {
    expect(formatRustFrameSourceBlockedDiagnostic({
      reason: 'nativeRenderSourceReleaseFailed',
      frameIndex: 14,
      legacyCanvasFallbackAllowed: false,
      detail: 'Rust native render source release rejected.',
    }, 'ja')).toBe('Rust frame source: 停止 native render source解放失敗 frame=14 legacy fallback不可: Rust native render source release rejected.');
  });

  it('formats presented shared-frame handoff failure diagnostics with a readable English label', () => {
    expect(formatRustFrameSourceBlockedDiagnostic({
      reason: 'presentedSharedFrameHandoffFailed',
      frameIndex: 21,
      legacyCanvasFallbackAllowed: false,
      detail: 'presented shared frame taker rejected the frame',
    }, 'en')).toBe('Rust frame source: blocked presented shared-frame handoff failed frame=21 legacy fallback disabled: presented shared frame taker rejected the frame');
  });

  it('formats video ownership blocked diagnostics with the Rust detail', () => {
    expect(formatRustFrameSourceBlockedDiagnostic({
      reason: 'videoOwnershipUnavailable',
      frameIndex: 5,
      legacyCanvasFallbackAllowed: true,
      detail: 'Shared renderer export is missing uploaded video clips: video-2.',
    }, 'ja')).toBe('Rust frame source: 停止 動画所有権未移管 frame=5 legacy fallback不可: Shared renderer export is missing uploaded video clips: video-2.');
  });

  it('formats shared renderer output blocked diagnostics with a readable label', () => {
    expect(formatRustFrameSourceBlockedDiagnostic({
      reason: 'sharedRendererOutputUnavailable',
      frameIndex: 4,
      legacyCanvasFallbackAllowed: false,
      detail: 'Shared renderer export output is unavailable (webGpuUploadUnavailable: WebGPU device does not expose the texture upload APIs needed for decoded video frames.).',
    }, 'ja')).toBe('Rust frame source: 停止 shared renderer実出力なし frame=4 legacy fallback不可: Shared renderer export output is unavailable (webGpuUploadUnavailable: WebGPU device does not expose the texture upload APIs needed for decoded video frames.).');

    expect(formatRustFrameSourceBlockedDiagnostic({
      reason: 'sharedRendererOutputUnavailable',
      frameIndex: 4,
      legacyCanvasFallbackAllowed: false,
    }, 'en')).toBe('Rust frame source: blocked shared renderer output unavailable frame=4 legacy fallback disabled');
  });

  it('formats WebGPU draw unavailable diagnostics with a readable label', () => {
    expect(formatRustFrameSourceBlockedDiagnostic({
      reason: 'webGpuDrawUnavailable',
      frameIndex: 6,
      legacyCanvasFallbackAllowed: false,
      detail: 'Shared renderer WebGPU presentation is unavailable.',
    }, 'ja')).toBe('Rust frame source: 停止 WebGPU描画不可 frame=6 legacy fallback不可: Shared renderer WebGPU presentation is unavailable.');

    expect(formatRustFrameSourceBlockedDiagnostic({
      reason: 'webGpuDrawUnavailable',
      frameIndex: 6,
      legacyCanvasFallbackAllowed: false,
    }, 'en')).toBe('Rust frame source: blocked WebGPU draw unavailable frame=6 legacy fallback disabled');
  });

  it('formats native render texture view unavailable diagnostics with a readable label', () => {
    expect(formatRustFrameSourceBlockedDiagnostic({
      reason: 'nativeRenderTextureViewUnavailable',
      frameIndex: 7,
      legacyCanvasFallbackAllowed: false,
      detail: 'Native render texture view is unavailable for shared renderer presentation.',
    }, 'ja')).toBe('Rust frame source: 停止 native render texture viewなし frame=7 legacy fallback不可: Native render texture view is unavailable for shared renderer presentation.');

    expect(formatRustFrameSourceBlockedDiagnostic({
      reason: 'nativeRenderTextureViewUnavailable',
      frameIndex: 7,
      legacyCanvasFallbackAllowed: false,
    }, 'en')).toBe('Rust frame source: blocked native render texture view unavailable frame=7 legacy fallback disabled');
  });
});

describe('formatLastExportDiagnosticsSummary', () => {
  it('returns no lines when the last export has no Rust diagnostics', () => {
    expect(formatLastExportDiagnosticsSummary(null, 'ja')).toEqual([]);
    expect(formatLastExportDiagnosticsSummary({}, 'en')).toEqual([]);
  });

  it('formats retained Rust export diagnostics for the post-export panel', () => {
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

    expect(formatLastExportDiagnosticsSummary(diagnostics, 'ja')).toEqual([
      'Rust frame source plan: Rust frame source必須: Video export requires a shared-frame Rust export source.',
      'Rust frame source: 停止 動画所有権未移管 frame=5 legacy fallback不可: Shared renderer export is missing uploaded video clips: video-2.',
      'Native render output: 解放失敗 (/uxfd-native-render-output) release rejected',
    ]);
  });

  it('formats Image and PSD Rust frame source plan failures with a readable English label', () => {
    const diagnostics: ExportDiagnostics = {
      exportFrameSourcePlanFailure: {
        reason: 'rustFrameSourceRequired',
        detail: 'Image/PSD export requires a shared renderer Rust frame source. Shared renderer surface requires a parallelCompare plan.',
      },
    };

    expect(formatLastExportDiagnosticsSummary(diagnostics, 'en')).toEqual([
      'Rust frame source plan: Rust frame source required: Image/PSD export requires a shared renderer Rust frame source. Shared renderer surface requires a parallelCompare plan.',
    ]);
  });
});
