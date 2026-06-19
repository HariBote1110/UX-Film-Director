import { describe, expect, it } from 'vitest';
import { formatNativeRenderOutputReleaseDiagnostic } from './ExportProgressModal';

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
});
