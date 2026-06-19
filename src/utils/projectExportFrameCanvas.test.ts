import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildProjectExportFrameSourcePlan,
  resolveProjectExportRustFrameSourceContext,
  resolveProjectExportFrameSourcePolicyForEncode,
  resolveProjectExportFrameRuntimePlan,
  resolveProjectExportFrameCanvas,
  type ProjectExportRustFrameSource,
} from './projectExportFrameCanvas';
import type { TimelineObject, VideoObject } from '../types';

const source = () =>
  readFileSync(new URL('./projectExportFrameCanvas.ts', import.meta.url), 'utf8');

const video = (patch: Partial<VideoObject> = {}): VideoObject => ({
  id: 'video-1',
  type: 'video',
  name: 'GoPro.mp4',
  layer: 1,
  startTime: 0,
  duration: 5,
  x: 0,
  y: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  enableAnimation: false,
  endX: 0,
  endY: 0,
  easing: 'linear',
  src: 'blob:video',
  filePath: '/tmp/GoPro.mp4',
  width: 1920,
  height: 1080,
  volume: 1,
  muted: false,
  ...patch,
});

describe('resolveProjectExportFrameCanvas', () => {
  it('uses the explicit export canvas without requiring a Pixi canvas', () => {
    const sharedRendererCanvas = { id: 'shared-renderer-export' } as unknown as HTMLCanvasElement;

    expect(resolveProjectExportFrameCanvas({
      getExportCanvas: () => sharedRendererCanvas,
      pixiCanvas: null,
    })).toEqual({
      ok: true,
      canvas: sharedRendererCanvas,
      source: 'explicitExportCanvas',
    });
  });

  it('falls back to the Pixi canvas while export is still migrating', () => {
    const pixiCanvas = { id: 'pixi-export' } as unknown as HTMLCanvasElement;

    expect(resolveProjectExportFrameCanvas({
      pixiCanvas,
    })).toEqual({
      ok: true,
      canvas: pixiCanvas,
      source: 'pixiCanvas',
    });
  });

  it('fails loud when no export frame canvas is available', () => {
    expect(resolveProjectExportFrameCanvas({
      getExportCanvas: () => null,
      pixiCanvas: null,
    })).toEqual({
      ok: false,
      reason: 'exportCanvasUnavailable',
      detail: 'Export requires a frame canvas from the shared renderer export path or the legacy Pixi fallback.',
    });
  });
});

describe('buildProjectExportFrameSourcePlan', () => {
  const rustFrameSource: ProjectExportRustFrameSource = {
    renderFrame: async () => ({ close: () => undefined }) as ImageBitmap,
  };

  it('uses the shared renderer Rust frame source before Pixi canvas capture', () => {
    const pixiCanvas = { id: 'pixi-export' } as unknown as HTMLCanvasElement;

    expect(buildProjectExportFrameSourcePlan({
      rustFrameSource,
      pixiCanvas,
    })).toEqual({
      ok: true,
      source: 'sharedRendererRustFrameSource',
      frameSource: rustFrameSource,
      captureCanvas: false,
      requiresRenderScene: false,
      usesExportFrameOverrides: false,
      rustFrameSourceBlockedFallback: 'legacyCanvas',
    });
  });

  it('fails video exports instead of restoring legacy canvas after the Rust frame source is blocked', () => {
    const plan = buildProjectExportFrameSourcePlan({
      rustFrameSource,
      hasVideoObjects: true,
    });
    if (!plan.ok) throw new Error('expected Rust export source plan');
    if (plan.source !== 'sharedRendererRustFrameSource') throw new Error('expected shared renderer Rust export source plan');

    expect(plan.rustFrameSourceBlockedFallback).toBe('failExport');
    expect(resolveProjectExportFrameRuntimePlan({
      frameSourcePlan: plan,
      rustFrameSourceBlocked: true,
    })).toEqual({
      source: 'sharedRendererRustFrameSourceBlocked',
      captureCanvas: false,
      requiresRenderScene: false,
      usesExportFrameOverrides: false,
      shouldCloseRustFrameSource: true,
      shouldFailOnRustFrameSourceBlocked: true,
    });
  });

  it('falls back to the explicit export canvas while the Rust frame source is unavailable', () => {
    const exportCanvas = { id: 'shared-renderer-export-canvas' } as unknown as HTMLCanvasElement;

    expect(buildProjectExportFrameSourcePlan({
      rustFrameSource: null,
      getExportCanvas: () => exportCanvas,
    })).toEqual({
      ok: true,
      source: 'explicitExportCanvas',
      canvas: exportCanvas,
      captureCanvas: true,
      requiresRenderScene: true,
      usesExportFrameOverrides: true,
    });
  });

  it('refuses legacy canvas capture when the Rust frame source is required', () => {
    const pixiCanvas = { id: 'pixi-export' } as unknown as HTMLCanvasElement;

    expect(buildProjectExportFrameSourcePlan({
      rustFrameSource: null,
      pixiCanvas,
      rustFrameSourcePolicy: 'requireRustFrameSource',
    })).toEqual({
      ok: false,
      reason: 'rustFrameSourceRequired',
      detail: 'Rust-only export requires a shared renderer Rust frame source.',
    });
  });

  it('refuses legacy canvas capture for video exports even when the caller omits the Rust-required policy', () => {
    const pixiCanvas = { id: 'pixi-export' } as unknown as HTMLCanvasElement;

    expect(buildProjectExportFrameSourcePlan({
      rustFrameSource: null,
      pixiCanvas,
      hasVideoObjects: true,
    })).toEqual({
      ok: false,
      reason: 'rustFrameSourceRequired',
      detail: 'Video export requires a shared renderer Rust frame source.',
    });
  });

  it('falls back to the Pixi canvas only as legacy export capture', () => {
    const pixiCanvas = { id: 'pixi-export' } as unknown as HTMLCanvasElement;

    expect(buildProjectExportFrameSourcePlan({
      rustFrameSource: null,
      pixiCanvas,
    })).toEqual({
      ok: true,
      source: 'pixiCanvas',
      canvas: pixiCanvas,
      captureCanvas: true,
      requiresRenderScene: true,
      usesExportFrameOverrides: true,
    });
  });

  it('fails loud when no export frame source is available', () => {
    expect(buildProjectExportFrameSourcePlan({
      rustFrameSource: null,
      getExportCanvas: () => null,
      pixiCanvas: null,
    })).toEqual({
      ok: false,
      reason: 'exportFrameSourceUnavailable',
      detail: 'Export requires a Rust frame source, shared renderer export canvas, or legacy Pixi canvas.',
    });
  });
});

describe('projectExportFrameCanvas browser video boundary', () => {
  it('does not expose Pixi-specific canvas API names from the export frame source boundary', () => {
    const code = source();

    expect(code).not.toContain('pixiCanvas');
    expect(code).not.toContain("'pixiCanvas'");
  });

  it('does not expose legacy browser video pause helpers', () => {
    const code = source();

    expect(code).not.toContain('pauseLegacyBrowserVideosForExport');
    expect(code).not.toContain('ProjectExportBrowserVideoElement');
    expect(code).not.toContain("Pick<HTMLVideoElement, 'pause'>");
    expect(code).not.toContain('requiresLegacyBrowserVideoProviders');
    expect(code).not.toContain('requiresHtmlVideoElementSeekFallback');
  });
});

describe('resolveProjectExportFrameSourcePolicyForEncode', () => {
  it('requires a Rust frame source whenever the Rust backend encoder is selected', () => {
    expect(resolveProjectExportFrameSourcePolicyForEncode({
      rustExportOnly: false,
      encodeEngine: 'rustBackendVideoEncoder',
    })).toEqual({
      rustFrameSourcePolicy: 'requireRustFrameSource',
      rustFrameSourceBlockedFallback: 'failExport',
    });
  });

  it('keeps legacy canvas fallback only for the WebCodecs compatibility encoder', () => {
    expect(resolveProjectExportFrameSourcePolicyForEncode({
      rustExportOnly: false,
      encodeEngine: 'webCodecsMp4Muxer',
    })).toEqual({
      rustFrameSourcePolicy: 'allowLegacyCanvas',
      rustFrameSourceBlockedFallback: 'legacyCanvas',
    });
  });

  it('requires a Rust frame source for video exports even when the WebCodecs compatibility encoder is selected', () => {
    expect(resolveProjectExportFrameSourcePolicyForEncode({
      rustExportOnly: false,
      hasVideoObjects: true,
      encodeEngine: 'webCodecsMp4Muxer',
    })).toEqual({
      rustFrameSourcePolicy: 'requireRustFrameSource',
      rustFrameSourceBlockedFallback: 'failExport',
    });
  });

  it('requires a Rust frame source when Rust-only export is enabled', () => {
    expect(resolveProjectExportFrameSourcePolicyForEncode({
      rustExportOnly: true,
      encodeEngine: 'webCodecsMp4Muxer',
    })).toEqual({
      rustFrameSourcePolicy: 'requireRustFrameSource',
      rustFrameSourceBlockedFallback: 'failExport',
    });
  });

  it('requires a Rust frame source for video objects when Rust video-only mode is enabled', () => {
    expect(resolveProjectExportFrameSourcePolicyForEncode({
      rustExportOnly: false,
      rustVideoOnly: true,
      hasVideoObjects: true,
      encodeEngine: 'webCodecsMp4Muxer',
    })).toEqual({
      rustFrameSourcePolicy: 'requireRustFrameSource',
      rustFrameSourceBlockedFallback: 'failExport',
    });
  });
});

describe('resolveProjectExportRustFrameSourceContext', () => {
  it('requests encode-only Rust frame sources for video exports regardless of the compatibility encoder hint', () => {
    const objects: TimelineObject[] = [video()];
    const presentedFrameSharedFrameTaker = async () => null;

    expect(resolveProjectExportRustFrameSourceContext({
      objects,
      time: 0,
      encodeEngine: 'webCodecsMp4Muxer',
      presentedFrameSharedFrameTaker,
    })).toEqual({
      objects,
      time: 0,
      preferEncodeOnly: true,
      presentedFrameSharedFrameTaker,
    });
  });

  it('keeps bitmap-capable Rust frame sources for non-video compatibility exports', () => {
    expect(resolveProjectExportRustFrameSourceContext({
      objects: [],
      time: 0,
      encodeEngine: 'webCodecsMp4Muxer',
      presentedFrameSharedFrameTaker: undefined,
    })).toEqual({
      objects: [],
      time: 0,
      preferEncodeOnly: false,
      presentedFrameSharedFrameTaker: undefined,
    });
  });
});

describe('resolveProjectExportFrameRuntimePlan', () => {
  const rustFrameSource: ProjectExportRustFrameSource = {
    renderFrame: async () => ({ close: () => undefined }) as ImageBitmap,
  };

  it('keeps browser video side effects disabled while the Rust frame source is active', () => {
    const plan = buildProjectExportFrameSourcePlan({
      rustFrameSource,
    });
    if (!plan.ok) throw new Error('expected Rust export source plan');

    expect(resolveProjectExportFrameRuntimePlan({
      frameSourcePlan: plan,
      rustFrameSourceBlocked: false,
    })).toEqual({
      source: 'sharedRendererRustFrameSource',
      captureCanvas: false,
      requiresRenderScene: false,
      usesExportFrameOverrides: false,
      shouldCloseRustFrameSource: false,
      shouldFailOnRustFrameSourceBlocked: false,
    });
  });

  it('enables only legacy canvas capture after the Rust frame source is blocked', () => {
    const plan = buildProjectExportFrameSourcePlan({
      rustFrameSource,
    });
    if (!plan.ok) throw new Error('expected Rust export source plan');

    expect(resolveProjectExportFrameRuntimePlan({
      frameSourcePlan: plan,
      rustFrameSourceBlocked: true,
    })).toEqual({
      source: 'legacyCanvasAfterRustBlocked',
      captureCanvas: true,
      requiresRenderScene: true,
      usesExportFrameOverrides: false,
      shouldCloseRustFrameSource: true,
      shouldFailOnRustFrameSourceBlocked: false,
    });
  });

  it('fails the export instead of restoring legacy canvas after a required Rust frame source is blocked', () => {
    const plan = buildProjectExportFrameSourcePlan({
      rustFrameSource,
      rustFrameSourceBlockedFallback: 'failExport',
    });
    if (!plan.ok) throw new Error('expected Rust export source plan');

    expect(resolveProjectExportFrameRuntimePlan({
      frameSourcePlan: plan,
      rustFrameSourceBlocked: true,
    })).toEqual({
      source: 'sharedRendererRustFrameSourceBlocked',
      captureCanvas: false,
      requiresRenderScene: false,
      usesExportFrameOverrides: false,
      shouldCloseRustFrameSource: true,
      shouldFailOnRustFrameSourceBlocked: true,
    });
  });

  it('keeps canvas fallback side effects enabled for legacy frame sources', () => {
    const canvas = { id: 'pixi-export' } as unknown as HTMLCanvasElement;
    const plan = buildProjectExportFrameSourcePlan({
      pixiCanvas: canvas,
    });
    if (!plan.ok) throw new Error('expected canvas export source plan');

    expect(resolveProjectExportFrameRuntimePlan({
      frameSourcePlan: plan,
      rustFrameSourceBlocked: false,
    })).toEqual({
      source: 'pixiCanvas',
      captureCanvas: true,
      requiresRenderScene: true,
      usesExportFrameOverrides: true,
      shouldCloseRustFrameSource: false,
      shouldFailOnRustFrameSourceBlocked: false,
    });
  });
});
