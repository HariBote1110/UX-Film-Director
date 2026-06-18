import { describe, expect, it } from 'vitest';
import {
  buildProjectExportFrameSourcePlan,
  resolveProjectExportFrameRuntimePlan,
  resolveProjectExportFrameCanvas,
  type ProjectExportRustFrameSource,
} from './projectExportFrameCanvas';

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
      requiresLegacyBrowserVideoProviders: false,
      requiresHtmlVideoElementSeekFallback: false,
      usesExportFrameOverrides: false,
      rustFrameSourceBlockedFallback: 'legacyCanvas',
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
      requiresLegacyBrowserVideoProviders: true,
      requiresHtmlVideoElementSeekFallback: true,
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
      requiresLegacyBrowserVideoProviders: true,
      requiresHtmlVideoElementSeekFallback: true,
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
      requiresHtmlVideoElementSeekFallback: false,
      shouldCloseRustFrameSource: false,
      shouldFailOnRustFrameSourceBlocked: false,
    });
  });

  it('enables legacy canvas and HTMLVideoElement seek after the Rust frame source is blocked', () => {
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
      requiresHtmlVideoElementSeekFallback: true,
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
      requiresHtmlVideoElementSeekFallback: false,
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
      requiresHtmlVideoElementSeekFallback: true,
      shouldCloseRustFrameSource: false,
      shouldFailOnRustFrameSourceBlocked: false,
    });
  });
});
