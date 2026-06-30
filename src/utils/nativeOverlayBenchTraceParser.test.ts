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
    })).toThrow(/decodeMs max 16.1ms > 16ms[\s\S]*frame=2[\s\S]*reason=sequential[\s\S]*presentMs[\s\S]*release generation/u);
  });

  it('uses steady playback markers to ignore warmup and later scenarios', async () => {
    const {
      assertNativeOverlayBenchTraceBudgets,
      createNativeOverlayBenchTraceSummary,
      ingestNativeOverlayBenchTraceText,
    } = await import('../../scripts/native-overlay-bench-trace.mjs');

    const summary = createNativeOverlayBenchTraceSummary();
    ingestNativeOverlayBenchTraceText(summary, `
[decode.trace] job=shared-renderer-video-warmup-1920x1080-60over1 frame=0 reason=firstFrame restarted=true skipped=0 decodeMs=440.0
UXFD_NATIVE_OVERLAY_STEADY_TRACE_BEGIN mediaId=steady-video-1
[decode.trace] job=shared-renderer-video-steady-video-1-1920x1080-60over1 frame=120 reason=sequential restarted=false skipped=0 decodeMs=5.2
[NativeOverlay] presentSharedFrameTrace {
  mediaId: 'steady-video-1',
  presentMs: 7.5,
  success: true,
  attached: true,
  slotIndex: 0,
  generation: 31,
  ptsFrame: 120,
  releaseGeneration: 31,
  releasePtsFrame: 120
}
UXFD_NATIVE_OVERLAY_STEADY_TRACE_END mediaId=steady-video-1
[NativeOverlay] presentSharedFrameTrace {
  mediaId: 'scrub-video-1',
  presentMs: 42.0,
  success: false,
  attached: false,
  slotIndex: 0,
  generation: 1,
  ptsFrame: 0,
  releaseGeneration: undefined,
  releasePtsFrame: undefined
}
`);

    expect(summary.decode.count).toBe(1);
    expect(summary.decode.maxMs).toBe(5.2);
    expect(summary.present.count).toBe(1);
    expect(summary.present.maxMs).toBe(7.5);
    expect(() => assertNativeOverlayBenchTraceBudgets(summary, {
      decodeMaxMs: 16,
      presentMaxMs: 16,
      minimumDecodeSamples: 1,
      minimumPresentSamples: 1,
    })).not.toThrow();
  });

  it('continues a split RustBackend steady decodeMs value onto the next log line', async () => {
    const {
      createNativeOverlayBenchTraceSummary,
      ingestNativeOverlayBenchTraceText,
    } = await import('../../scripts/native-overlay-bench-trace.mjs');

    const summary = createNativeOverlayBenchTraceSummary();
    ingestNativeOverlayBenchTraceText(summary, `
UXFD_NATIVE_OVERLAY_STEADY_TRACE_BEGIN mediaId=steady-video-1
[RustBackend] [decode.trace] job=shared-renderer-video-steady-video-1-720x405-60over1 frame=95 reason=cacheHit restarted=false skipped=0 decodeMs=
[RustBackend] 0.0
[RustBackend] [decode.trace] job=shared-renderer-video-steady-video-1-720x405-60over1 frame=231 reason=forwardGapExceeded restarted=true skipped=0 decodeMs=575.1
UXFD_NATIVE_OVERLAY_STEADY_TRACE_END mediaId=steady-video-1
`);

    expect(summary.decode.count).toBe(1);
    expect(summary.decode.maxMs).toBe(0.0);
  });

  it('ignores failed or detached Native Overlay presents for live surface timing budgets', async () => {
    const {
      createNativeOverlayBenchTraceSummary,
      ingestNativeOverlayBenchTraceText,
    } = await import('../../scripts/native-overlay-bench-trace.mjs');

    const summary = createNativeOverlayBenchTraceSummary();
    ingestNativeOverlayBenchTraceText(summary, `
UXFD_NATIVE_OVERLAY_STEADY_TRACE_BEGIN mediaId=steady-video-1
[NativeOverlay] presentSharedFrameTrace {
  mediaId: 'steady-video-1',
  presentMs: 1.0,
  success: false,
  attached: false,
  slotIndex: 1,
  generation: 2,
  ptsFrame: 62
}
[NativeOverlay] presentSharedFrameTrace {
  mediaId: 'steady-video-1',
  presentMs: 4.7,
  success: true,
  attached: true,
  slotIndex: 0,
  generation: 38,
  ptsFrame: 62,
  releaseGeneration: 38,
  releasePtsFrame: 62
}
UXFD_NATIVE_OVERLAY_STEADY_TRACE_END mediaId=steady-video-1
`);

    expect(summary.present.count).toBe(1);
    expect(summary.present.maxMs).toBe(4.7);
  });

  it('summarises compact JSON Native Overlay present traces from Electron stdout', async () => {
    const {
      assertNativeOverlayBenchTraceBudgets,
      createNativeOverlayBenchTraceSummary,
      ingestNativeOverlayBenchTraceText,
    } = await import('../../scripts/native-overlay-bench-trace.mjs');

    const summary = createNativeOverlayBenchTraceSummary();
    ingestNativeOverlayBenchTraceText(summary, `
UXFD_NATIVE_OVERLAY_STEADY_TRACE_BEGIN mediaId=steady-video-1
[RustBackend] [decode.trace] job=shared-renderer-video-steady-video-1-720x405-60over1 frame=68 reason=sequential restarted=false skipped=0 decodeMs=1.6
[NativeOverlay] presentSharedFrameTrace {"mediaId":"steady-video-1","presentMs":2.255,"success":true,"attached":true,"slotIndex":0,"generation":68,"ptsFrame":68,"releaseGeneration":68,"releasePtsFrame":68}
UXFD_NATIVE_OVERLAY_STEADY_TRACE_END mediaId=steady-video-1
`);

    expect(summary.decode.count).toBe(1);
    expect(summary.present.count).toBe(1);
    expect(summary.present.maxMs).toBe(2.255);
    expect(summary.releaseGenerationViolationCount).toBe(0);
    expect(() => assertNativeOverlayBenchTraceBudgets(summary, {
      decodeMaxMs: 16,
      presentMaxMs: 16,
      minimumDecodeSamples: 1,
      minimumPresentSamples: 1,
    })).not.toThrow();
  });

  it('excludes warmup and seek decode traces from steady Phase 3a budgets', async () => {
    const {
      assertNativeOverlayBenchTraceBudgets,
      createNativeOverlayBenchTraceSummary,
      ingestNativeOverlayBenchTraceText,
    } = await import('../../scripts/native-overlay-bench-trace.mjs');

    const summary = createNativeOverlayBenchTraceSummary();
    ingestNativeOverlayBenchTraceText(summary, `
UXFD_NATIVE_OVERLAY_STEADY_TRACE_BEGIN mediaId=steady-video-1
[RustBackend] [decode.trace] job=shared-renderer-video-steady-video-1-720x405-60over1 frame=0 reason=firstFrame restarted=true skipped=0 decodeMs=285.6
[RustBackend] [decode.trace] job=shared-renderer-video-steady-video-1-720x405-60over1 frame=30 reason=sequential restarted=false skipped=29 decodeMs=88.9
[RustBackend] [decode.trace] job=shared-renderer-video-steady-video-1-720x405-60over1 frame=0 reason=backwardSeek restarted=true skipped=0 decodeMs=301.8
[RustBackend] [decode.trace] job=shared-renderer-video-steady-video-1-720x405-60over1 frame=66 reason=sequential restarted=false skipped=0 decodeMs=0.5
[RustBackend] [decode.trace] job=shared-renderer-video-steady-video-1-720x405-60over1 frame=67 reason=sequential restarted=false skipped=0 decodeMs=0.4
[NativeOverlay] presentSharedFrameTrace {"mediaId":"steady-video-1","presentMs":2.2,"success":true,"attached":true,"slotIndex":0,"generation":66,"ptsFrame":66,"releaseGeneration":66,"releasePtsFrame":66}
UXFD_NATIVE_OVERLAY_STEADY_TRACE_END mediaId=steady-video-1
`);

    expect(summary.decode.count).toBe(1);
    expect(summary.decode.maxMs).toBe(0.4);
    expect(summary.present.count).toBe(1);
    expect(() => assertNativeOverlayBenchTraceBudgets(summary, {
      decodeMaxMs: 16,
      presentMaxMs: 16,
      minimumDecodeSamples: 1,
      minimumPresentSamples: 1,
    })).not.toThrow();
  });

  it('waits for a stable steady decode streak after skip or seek warmup', async () => {
    const {
      assertNativeOverlayBenchTraceBudgets,
      createNativeOverlayBenchTraceSummary,
      ingestNativeOverlayBenchTraceText,
    } = await import('../../scripts/native-overlay-bench-trace.mjs');

    const summary = createNativeOverlayBenchTraceSummary();
    ingestNativeOverlayBenchTraceText(summary, `
UXFD_NATIVE_OVERLAY_STEADY_TRACE_BEGIN mediaId=steady-video-1
[RustBackend] [decode.trace] job=shared-renderer-video-steady-video-1-720x405-60over1 frame=30 reason=sequential restarted=false skipped=29 decodeMs=64.5
[RustBackend] [decode.trace] job=shared-renderer-video-steady-video-1-720x405-60over1 frame=0 reason=backwardSeek restarted=true skipped=0 decodeMs=362.6
[RustBackend] [decode.trace] job=shared-renderer-video-steady-video-1-720x405-60over1 frame=31 reason=sequential restarted=false skipped=30 decodeMs=88.4
[RustBackend] [decode.trace] job=shared-renderer-video-steady-video-1-720x405-60over1 frame=32 reason=sequential restarted=false skipped=0 decodeMs=18.3
[RustBackend] [decode.trace] job=shared-renderer-video-steady-video-1-720x405-60over1 frame=33 reason=sequential restarted=false skipped=0 decodeMs=0.6
[NativeOverlay] presentSharedFrameTrace {"mediaId":"steady-video-1","presentMs":2.2,"success":true,"attached":true,"slotIndex":0,"generation":66,"ptsFrame":66,"releaseGeneration":66,"releasePtsFrame":66}
UXFD_NATIVE_OVERLAY_STEADY_TRACE_END mediaId=steady-video-1
`);

    expect(summary.decode.count).toBe(1);
    expect(summary.decode.maxMs).toBe(0.6);
    expect(() => assertNativeOverlayBenchTraceBudgets(summary, {
      decodeMaxMs: 16,
      presentMaxMs: 16,
      minimumDecodeSamples: 1,
      minimumPresentSamples: 1,
    })).not.toThrow();
  });
});
