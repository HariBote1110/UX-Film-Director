import { describe, expect, it } from 'vitest';
import { formatNativeOverlayDiagnosticLog } from '../../electron/nativeOverlayDiagnosticLog';

describe('formatNativeOverlayDiagnosticLog', () => {
  it('prints presentSharedFrameTrace as a compact single line JSON payload', () => {
    const line = formatNativeOverlayDiagnosticLog('presentSharedFrameTrace', {
      mediaId: 'steady-video-1',
      presentMs: 4.7,
      success: true,
      attached: true,
    });

    expect(line).toBe('[NativeOverlay] presentSharedFrameTrace {"mediaId":"steady-video-1","presentMs":4.7,"success":true,"attached":true}');
    expect(line).not.toContain('\n');
  });

  it('keeps non-present diagnostics readable without forcing JSON parsing', () => {
    expect(formatNativeOverlayDiagnosticLog('attach', { success: true, attached: true }))
      .toBe('[NativeOverlay] attach {"success":true,"attached":true}');
  });
});
