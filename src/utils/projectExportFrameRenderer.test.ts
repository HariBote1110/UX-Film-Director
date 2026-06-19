import { describe, expect, it, vi } from 'vitest';
import { renderProjectExportFrame } from './projectExportFrameRenderer';
import type { ProjectExportFrameSourcePlanResult } from './projectExportFrameCanvas';
import type { RustBackendVideoEncodeFrame } from './rustBackendVideoEncodeExport';
import { SharedRendererExportFrameSourceBlockedError } from './sharedRendererExportFrameSource';

const sharedFrame = (frameIndex: number, timestampUs: number): RustBackendVideoEncodeFrame => ({
  timestamp: timestampUs,
  sharedFramePayload: {
    sessionId: 'session-rust-ready',
    frameIndex,
    timestampUs,
    slotCount: 2,
    frame: {
      descriptor: {
        memoryId: '/uxfd-direct-shared-frame-ring',
        slotIndex: frameIndex % 2,
        generation: frameIndex + 1,
        byteOffset: frameIndex * 512,
        byteLen: 512,
        width: 4,
        height: 2,
        strideBytes: 256,
        format: 'rgba8Srgb',
        colour: {
          primaries: 'bt709',
          transfer: 'srgb',
          matrix: 'rgb',
          range: 'full',
        },
      },
      ptsFrame: frameIndex,
    },
  },
});

describe('renderProjectExportFrame', () => {
  it('renders a ready Rust shared-frame source without touching legacy canvas capture', async () => {
    const rustFrame = sharedFrame(0, 0);
    const renderEncodeFrame = vi.fn(async () => rustFrame);
    const renderScene = vi.fn();
    const getExportCanvas = vi.fn();
    const captureLegacyCanvasFrame = vi.fn();
    const frameSourcePlan: Extract<ProjectExportFrameSourcePlanResult, { ok: true }> = {
      ok: true,
      source: 'sharedRendererRustFrameSource',
      frameSource: {
        renderEncodeFrame,
      },
      captureCanvas: false,
      requiresRenderScene: false,
      usesExportFrameOverrides: false,
      rustFrameSourceBlockedFallback: 'failExport',
    };

    const result = await renderProjectExportFrame({
      frameSourcePlan,
      rustFrameSourceBlocked: false,
      frameIndex: 0,
      fps: 30,
      width: 4,
      height: 2,
      objects: [],
      encodeSessionId: 'session-rust-ready',
      preferSharedFrame: true,
      renderScene,
      getExportCanvas,
      captureLegacyCanvasFrame,
    });

    expect(result).toEqual({
      frame: rustFrame,
      rustFrameSourceBlocked: false,
    });
    expect(renderEncodeFrame).toHaveBeenCalledWith({
      encodeSessionId: 'session-rust-ready',
      frameIndex: 0,
      timestampUs: 0,
      time: 0,
      width: 4,
      height: 2,
      objects: [],
    });
    expect(renderScene).not.toHaveBeenCalled();
    expect(getExportCanvas).not.toHaveBeenCalled();
    expect(captureLegacyCanvasFrame).not.toHaveBeenCalled();
  });

  it('publishes blocked diagnostics before failing a required Rust frame source', async () => {
    const error = new SharedRendererExportFrameSourceBlockedError(
      'Shared renderer export is missing uploaded video clips: video-2.',
      'videoOwnershipUnavailable',
      5,
      false
    );
    const closeRustFrameSource = vi.fn();
    const onRustFrameSourceBlocked = vi.fn();
    const onRustFrameSourceFallback = vi.fn();
    const renderScene = vi.fn();
    const getExportCanvas = vi.fn();
    const frameSourcePlan: Extract<ProjectExportFrameSourcePlanResult, { ok: true }> = {
      ok: true,
      source: 'sharedRendererRustFrameSource',
      frameSource: {
        renderEncodeFrame: vi.fn(async () => {
          throw error;
        }),
      },
      captureCanvas: false,
      requiresRenderScene: false,
      usesExportFrameOverrides: false,
      rustFrameSourceBlockedFallback: 'failExport',
    };

    await expect(renderProjectExportFrame({
      frameSourcePlan,
      rustFrameSourceBlocked: false,
      frameIndex: 5,
      fps: 30,
      width: 4,
      height: 2,
      objects: [],
      encodeSessionId: 'session-rust-required',
      preferSharedFrame: true,
      renderScene,
      getExportCanvas,
      closeRustFrameSource,
      onRustFrameSourceBlocked,
      onRustFrameSourceFallback,
    })).rejects.toThrow(error);

    expect(onRustFrameSourceBlocked).toHaveBeenCalledWith({
      reason: 'videoOwnershipUnavailable',
      frameIndex: 5,
      legacyCanvasFallbackAllowed: false,
      detail: 'Shared renderer export is missing uploaded video clips: video-2.',
    });
    expect(onRustFrameSourceFallback).not.toHaveBeenCalled();
    expect(closeRustFrameSource).toHaveBeenCalledTimes(1);
    expect(renderScene).not.toHaveBeenCalled();
    expect(getExportCanvas).not.toHaveBeenCalled();
  });

  it('fails an already blocked required Rust frame source without restoring legacy canvas capture', async () => {
    const renderScene = vi.fn();
    const getExportCanvas = vi.fn(() => ({ id: 'legacy-canvas' }) as unknown as HTMLCanvasElement);
    const captureLegacyCanvasFrame = vi.fn(async () => ({
      timestamp: 166_667,
      bitmap: { close: vi.fn() } as unknown as ImageBitmap,
    }));
    const frameSourcePlan: Extract<ProjectExportFrameSourcePlanResult, { ok: true }> = {
      ok: true,
      source: 'sharedRendererRustFrameSource',
      frameSource: {
        renderEncodeFrame: vi.fn(async () => sharedFrame(5, 166_667)),
      },
      captureCanvas: false,
      requiresRenderScene: false,
      usesExportFrameOverrides: false,
      rustFrameSourceBlockedFallback: 'failExport',
    };

    await expect(renderProjectExportFrame({
      frameSourcePlan,
      rustFrameSourceBlocked: true,
      frameIndex: 5,
      fps: 30,
      width: 4,
      height: 2,
      objects: [],
      encodeSessionId: 'session-rust-required',
      preferSharedFrame: true,
      renderScene,
      getExportCanvas,
      captureLegacyCanvasFrame,
    })).rejects.toThrow('Rust frame source is blocked and legacy canvas fallback is disabled.');

    expect(renderScene).not.toHaveBeenCalled();
    expect(getExportCanvas).not.toHaveBeenCalled();
    expect(captureLegacyCanvasFrame).not.toHaveBeenCalled();
  });
});
