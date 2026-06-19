import { describe, expect, it } from 'vitest';
import {
  formatNativeRenderOutputReleaseDiagnostic,
  formatRustFrameSourceBlockedDiagnostic,
} from './ExportProgressModal';

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
    }, 'en')).toBe('Native render output: release failed (/uxfd-native-render-output)');
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
});
