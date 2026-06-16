import { describe, expect, it } from 'vitest';
import { writeSharedRendererPresenterDiagnostics } from './sharedRendererPresenterDiagnostics';

describe('writeSharedRendererPresenterDiagnostics', () => {
  it('publishes ready presenter details and clears stale fallback reasons', () => {
    const dataset: Record<string, string | undefined> = {
      uxfdSharedRendererPresenterFailureReason: 'adapterUnavailable',
    };

    writeSharedRendererPresenterDiagnostics(dataset, {
      status: 'ready',
      format: 'bgra8unorm',
      swatch: 'solid-srgb',
    });

    expect(dataset).toEqual({
      uxfdSharedRendererPresenterStatus: 'ready',
      uxfdSharedRendererPresenterFormat: 'bgra8unorm',
      uxfdSharedRendererPresenterSwatch: 'solid-srgb',
      uxfdSharedRendererPresenterFailureReason: undefined,
    });
  });

  it('publishes fallback reasons and clears ready-only fields', () => {
    const dataset: Record<string, string | undefined> = {
      uxfdSharedRendererPresenterFormat: 'bgra8unorm',
      uxfdSharedRendererPresenterSwatch: 'solid-srgb',
    };

    writeSharedRendererPresenterDiagnostics(dataset, {
      status: 'fallback',
      reason: 'srgbCanvasFormat',
    });

    expect(dataset).toEqual({
      uxfdSharedRendererPresenterFormat: undefined,
      uxfdSharedRendererPresenterSwatch: undefined,
      uxfdSharedRendererPresenterStatus: 'fallback',
      uxfdSharedRendererPresenterFailureReason: 'srgbCanvasFormat',
    });
  });

  it('marks device loss as a Pixi fallback without allowing stale shared frames', () => {
    const dataset: Record<string, string | undefined> = {};

    writeSharedRendererPresenterDiagnostics(dataset, {
      status: 'deviceLost',
      reason: 'deviceLost',
      staleSharedFrameAllowed: false,
    });

    expect(dataset).toEqual({
      uxfdSharedRendererPresenterStatus: 'deviceLost',
      uxfdSharedRendererPresenterFormat: undefined,
      uxfdSharedRendererPresenterSwatch: undefined,
      uxfdSharedRendererPresenterFailureReason: 'deviceLost',
      uxfdSharedRendererPresenterStaleSharedFrameAllowed: 'false',
    });
  });
});
