import { describe, expect, it } from 'vitest';

describe('native overlay bench trace parser', () => {
  it('summarises decode, present, and release generation timings from real bench trace text', async () => {
    const {
      assertNativeOverlayBenchTraceBudgets,
      createNativeOverlayBenchTraceSummary,
      ingestNativeOverlayBenchTraceText,
    } = await import('../../scripts/native-overlay-bench-trace.mjs');

    const summary = createNativeOverlayBenchTraceSummary();
    ingestNativeOverlayBenchTraceText(summary, `
[decode.trace] job=shared-renderer-video-video-1-1920x1080-60over1 frame=1 reason=sequential restarted=false skipped=0 decodeMs=7.4
[NativeOverlay] presentSharedFrameTrace {
  mediaId: 'shared-renderer-video-video-1',
  presentMs: 8.25,
  success: true,
  attached: true,
  slotIndex: 0,
  generation: 12,
  ptsFrame: 1,
  releaseGeneration: 12,
  releasePtsFrame: 1
}
`);

    expect(summary.decode.count).toBe(1);
    expect(summary.decode.maxMs).toBe(7.4);
    expect(summary.present.count).toBe(1);
    expect(summary.present.maxMs).toBe(8.25);
    expect(summary.releaseGenerationViolationCount).toBe(0);
    expect(() => assertNativeOverlayBenchTraceBudgets(summary, {
      decodeMaxMs: 16,
      presentMaxMs: 16,
      minimumDecodeSamples: 1,
      minimumPresentSamples: 1,
    })).not.toThrow();
  });

  it('rejects traces that exceed Phase 3a timing or release generation budgets', async () => {
    const {
      assertNativeOverlayBenchTraceBudgets,
      createNativeOverlayBenchTraceSummary,
      ingestNativeOverlayBenchTraceText,
    } = await import('../../scripts/native-overlay-bench-trace.mjs');

    const summary = createNativeOverlayBenchTraceSummary();
    ingestNativeOverlayBenchTraceText(summary, `
[decode.trace] job=shared-renderer-video-video-1-1920x1080-60over1 frame=2 reason=sequential restarted=false skipped=0 decodeMs=16.1
[NativeOverlay] presentSharedFrameTrace {
  mediaId: 'shared-renderer-video-video-1',
  presentMs: 18.5,
  success: true,
  attached: true,
  slotIndex: 0,
  generation: 21,
  ptsFrame: 2,
  releaseGeneration: 20,
  releasePtsFrame: 2
}
`);

    expect(summary.releaseGenerationViolationCount).toBe(1);
    expect(() => assertNativeOverlayBenchTraceBudgets(summary, {
      decodeMaxMs: 16,
      presentMaxMs: 16,
      minimumDecodeSamples: 1,
      minimumPresentSamples: 1,
    })).toThrow(/decodeMs.*presentMs.*release generation/u);
  });
});
