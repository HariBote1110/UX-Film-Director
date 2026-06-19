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
      geometrySource: 'rust-wasm',
      videoGeometrySource: 'rust-wasm',
      videoDecodeRequestSource: 'rust-wasm',
      videoDecodeRequestCount: 2,
      videoFrameUploadReady: false,
      videoOwner: 'sharedRenderer',
      videoCutoverReason: 'rustDecodedFrameUploadReady',
      sharedVideoObjectCount: 2,
    });

    expect(dataset).toMatchObject({
      uxfdSharedRendererPresenterStatus: 'ready',
      uxfdSharedRendererPresenterFormat: 'bgra8unorm',
      uxfdSharedRendererPresenterSwatch: 'solid-srgb',
      uxfdSharedRendererPresenterGeometrySource: 'rust-wasm',
      uxfdSharedRendererPresenterVideoGeometrySource: 'rust-wasm',
      uxfdSharedRendererPresenterVideoDecodeRequestSource: 'rust-wasm',
      uxfdSharedRendererPresenterVideoDecodeRequestCount: '2',
      uxfdSharedRendererPresenterVideoFrameUploadReady: 'false',
      uxfdSharedRendererPresenterVideoOwner: 'sharedRenderer',
      uxfdSharedRendererPresenterVideoCutoverReason: 'rustDecodedFrameUploadReady',
      uxfdSharedRendererPresenterSharedVideoObjectCount: '2',
    });
    expect(dataset).not.toHaveProperty('uxfdSharedRendererPresenterFailureReason');
    expect(dataset).not.toHaveProperty('uxfdSharedRendererPresenterStaleSharedFrameAllowed');
  });

  it('publishes native render failure details while the presenter remains ready', () => {
    const dataset: Record<string, string | undefined> = {};

    writeSharedRendererPresenterDiagnostics(dataset, {
      status: 'ready',
      format: 'bgra8unorm',
      swatch: 'pixi-passthrough',
      nativeRenderFailureReason: 'nativeRenderFailed',
      nativeRenderFailureDetail: 'Rust backend rejected unsupported PSD media',
    });

    expect(dataset).toMatchObject({
      uxfdSharedRendererPresenterStatus: 'ready',
      uxfdSharedRendererPresenterFormat: 'bgra8unorm',
      uxfdSharedRendererPresenterSwatch: 'pixi-passthrough',
      uxfdSharedRendererPresenterNativeRenderFailureReason: 'nativeRenderFailed',
      uxfdSharedRendererPresenterNativeRenderFailureDetail: 'Rust backend rejected unsupported PSD media',
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

    expect(dataset).toMatchObject({
      uxfdSharedRendererPresenterStatus: 'fallback',
      uxfdSharedRendererPresenterFailureReason: 'srgbCanvasFormat',
    });
    expect(dataset).not.toHaveProperty('uxfdSharedRendererPresenterFormat');
    expect(dataset).not.toHaveProperty('uxfdSharedRendererPresenterSwatch');
    expect(dataset).not.toHaveProperty('uxfdSharedRendererPresenterGeometrySource');
    expect(dataset).not.toHaveProperty('uxfdSharedRendererPresenterVideoGeometrySource');
    expect(dataset).not.toHaveProperty('uxfdSharedRendererPresenterVideoDecodeRequestSource');
    expect(dataset).not.toHaveProperty('uxfdSharedRendererPresenterVideoDecodeRequestCount');
    expect(dataset).not.toHaveProperty('uxfdSharedRendererPresenterVideoOwner');
    expect(dataset).not.toHaveProperty('uxfdSharedRendererPresenterVideoCutoverReason');
    expect(dataset).not.toHaveProperty('uxfdSharedRendererPresenterSharedVideoObjectCount');
    expect(dataset).not.toHaveProperty('uxfdSharedRendererPresenterStaleSharedFrameAllowed');
  });

  it('keeps native render failure details when publishing a fail-loud fallback', () => {
    const dataset: Record<string, string | undefined> = {};

    writeSharedRendererPresenterDiagnostics(dataset, {
      status: 'fallback',
      reason: 'requiredVideoOwnershipUnavailable',
      nativeRenderFailureReason: 'nativeRenderFailed',
      nativeRenderFailureDetail: 'Rust backend rejected unsupported PSD media',
    });

    expect(dataset).toMatchObject({
      uxfdSharedRendererPresenterStatus: 'fallback',
      uxfdSharedRendererPresenterFailureReason: 'requiredVideoOwnershipUnavailable',
      uxfdSharedRendererPresenterNativeRenderFailureReason: 'nativeRenderFailed',
      uxfdSharedRendererPresenterNativeRenderFailureDetail: 'Rust backend rejected unsupported PSD media',
    });
  });

  it('marks native render source release ownership failures explicitly', () => {
    const dataset: Record<string, string | undefined> = {};

    writeSharedRendererPresenterDiagnostics(dataset, {
      status: 'fallback',
      reason: 'requiredVideoOwnershipUnavailable',
      nativeRenderFailureReason: 'nativeRenderSourceReleaseUnavailable',
      nativeRenderFailureDetail: "Rust native render source 'video-1' is missing decoded frame release callbacks.",
    });

    expect(dataset).toMatchObject({
      uxfdSharedRendererPresenterStatus: 'fallback',
      uxfdSharedRendererPresenterFailureReason: 'requiredVideoOwnershipUnavailable',
      uxfdSharedRendererPresenterNativeRenderFailureReason: 'nativeRenderSourceReleaseUnavailable',
      uxfdSharedRendererPresenterNativeRenderFailureDetail: "Rust native render source 'video-1' is missing decoded frame release callbacks.",
      uxfdSharedRendererPresenterNativeRenderSourceReleaseRequired: 'true',
    });
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
    expect(dataset).not.toHaveProperty('uxfdSharedRendererPresenterGeometrySource');
    expect(dataset).not.toHaveProperty('uxfdSharedRendererPresenterVideoGeometrySource');
    expect(dataset).not.toHaveProperty('uxfdSharedRendererPresenterVideoDecodeRequestSource');
    expect(dataset).not.toHaveProperty('uxfdSharedRendererPresenterVideoDecodeRequestCount');
    expect(dataset).not.toHaveProperty('uxfdSharedRendererPresenterVideoOwner');
    expect(dataset).not.toHaveProperty('uxfdSharedRendererPresenterVideoCutoverReason');
    expect(dataset).not.toHaveProperty('uxfdSharedRendererPresenterSharedVideoObjectCount');
  });
});
