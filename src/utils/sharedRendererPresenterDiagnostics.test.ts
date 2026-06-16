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

    expect(dataset).toMatchObject({
      uxfdSharedRendererPresenterStatus: 'ready',
      uxfdSharedRendererPresenterFormat: 'bgra8unorm',
      uxfdSharedRendererPresenterSwatch: 'solid-srgb',
    });
    expect(dataset).not.toHaveProperty('uxfdSharedRendererPresenterFailureReason');
    expect(dataset).not.toHaveProperty('uxfdSharedRendererPresenterStaleSharedFrameAllowed');
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

    expect(dataset).toMatchObject({
      uxfdSharedRendererPresenterStatus: 'fallback',
      uxfdSharedRendererPresenterFailureReason: 'srgbCanvasFormat',
    });
    expect(dataset).not.toHaveProperty('uxfdSharedRendererPresenterFormat');
    expect(dataset).not.toHaveProperty('uxfdSharedRendererPresenterSwatch');
    expect(dataset).not.toHaveProperty('uxfdSharedRendererPresenterStaleSharedFrameAllowed');
  });

  it('marks device loss as a Pixi fallback without allowing stale shared frames', () => {
    const dataset: Record<string, string | undefined> = {};

    writeSharedRendererPresenterDiagnostics(dataset, {
      status: 'deviceLost',
      reason: 'deviceLost',
      staleSharedFrameAllowed: false,
    });

    expect(dataset).toMatchObject({
      uxfdSharedRendererPresenterStatus: 'deviceLost',
      uxfdSharedRendererPresenterFailureReason: 'deviceLost',
      uxfdSharedRendererPresenterStaleSharedFrameAllowed: 'false',
    });
    expect(dataset).not.toHaveProperty('uxfdSharedRendererPresenterFormat');
    expect(dataset).not.toHaveProperty('uxfdSharedRendererPresenterSwatch');
  });
});
