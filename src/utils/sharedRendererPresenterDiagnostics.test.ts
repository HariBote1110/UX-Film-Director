import { describe, expect, it } from 'vitest';
import {
  recordSharedRendererPresenterTransientSkip,
  writeSharedRendererPresenterDiagnostics,
} from './sharedRendererPresenterDiagnostics';

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
      videoPresentationSource: 'external-video-source',
      videoFrameUploadReady: false,
      videoOwner: 'sharedRenderer',
      videoCutoverReason: 'rustDecodedFrameUploadReady',
      sharedVideoObjectCount: 2,
      nativeRenderDecodePaths: 'inprocess',
      nativeRenderPath: 'webgpu',
      nativeRenderNv12ZeroCopyMediaIds: 'video-1,video-2',
    });

    expect(dataset).toMatchObject({
      uxfdSharedRendererPresenterStatus: 'ready',
      uxfdSharedRendererPresenterFormat: 'bgra8unorm',
      uxfdSharedRendererPresenterSwatch: 'solid-srgb',
      uxfdSharedRendererPresenterGeometrySource: 'rust-wasm',
      uxfdSharedRendererPresenterVideoGeometrySource: 'rust-wasm',
      uxfdSharedRendererPresenterVideoDecodeRequestSource: 'rust-wasm',
      uxfdSharedRendererPresenterVideoDecodeRequestCount: '2',
      uxfdSharedRendererPresenterVideoPresentationSource: 'external-video-source',
      uxfdSharedRendererPresenterVideoFrameUploadReady: 'false',
      uxfdSharedRendererPresenterVideoOwner: 'sharedRenderer',
      uxfdSharedRendererPresenterVideoCutoverReason: 'rustDecodedFrameUploadReady',
      uxfdSharedRendererPresenterSharedVideoObjectCount: '2',
      uxfdSharedRendererPresenterNativeRenderDecodePaths: 'inprocess',
      uxfdSharedRendererPresenterNativeRenderPath: 'webgpu',
      uxfdSharedRendererPresenterNativeRenderNv12ZeroCopyMediaIds: 'video-1,video-2',
    });
    expect(dataset).not.toHaveProperty('uxfdSharedRendererPresenterFailureReason');
    expect(dataset).not.toHaveProperty('uxfdSharedRendererPresenterStaleSharedFrameAllowed');
  });

  it('publishes native render failure details while the presenter remains ready', () => {
    const dataset: Record<string, string | undefined> = {};

    writeSharedRendererPresenterDiagnostics(dataset, {
      status: 'ready',
      format: 'bgra8unorm',
      swatch: 'no-presentation',
      nativeRenderFailureReason: 'nativeRenderFailed',
      nativeRenderFailureDetail: 'Rust backend rejected unsupported PSD media',
    });

    expect(dataset).toMatchObject({
      uxfdSharedRendererPresenterStatus: 'ready',
      uxfdSharedRendererPresenterFormat: 'bgra8unorm',
      uxfdSharedRendererPresenterSwatch: 'no-presentation',
      uxfdSharedRendererPresenterNativeRenderFailureReason: 'nativeRenderFailed',
      uxfdSharedRendererPresenterNativeRenderFailureLabel: 'native render failed',
      uxfdSharedRendererPresenterNativeRenderFailureDetail: 'Rust backend rejected unsupported PSD media',
    });
  });

  it('publishes video upload failure details while the presenter remains ready', () => {
    const dataset: Record<string, string | undefined> = {};

    writeSharedRendererPresenterDiagnostics(dataset, {
      status: 'ready',
      format: 'bgra8unorm',
      swatch: 'no-presentation',
      videoFrameUploadReady: false,
      videoUploadFailureReason: 'copyReportChecksumMismatch',
      videoUploadFailureDetail: 'Shared video frame copy report checksum verification failed.',
      videoUploadFailureClipId: 'clip-video-2',
      videoUploadFailureMediaId: 'video-2',
    });

    expect(dataset).toMatchObject({
      uxfdSharedRendererPresenterStatus: 'ready',
      uxfdSharedRendererPresenterVideoFrameUploadReady: 'false',
      uxfdSharedRendererPresenterVideoUploadFailureReason: 'copyReportChecksumMismatch',
      uxfdSharedRendererPresenterVideoUploadFailureDetail: 'Shared video frame copy report checksum verification failed.',
      uxfdSharedRendererPresenterVideoUploadFailureClipId: 'clip-video-2',
      uxfdSharedRendererPresenterVideoUploadFailureMediaId: 'video-2',
    });
  });

  it('publishes a readable native render output release failure label', () => {
    const dataset: Record<string, string | undefined> = {};

    writeSharedRendererPresenterDiagnostics(dataset, {
      status: 'fallback',
      reason: 'requiredVideoOwnershipUnavailable',
      nativeRenderFailureReason: 'nativeRenderOutputReleaseFailed',
      nativeRenderFailureDetail: 'preview native output release failed',
    });

    expect(dataset).toMatchObject({
      uxfdSharedRendererPresenterStatus: 'fallback',
      uxfdSharedRendererPresenterFailureReason: 'requiredVideoOwnershipUnavailable',
      uxfdSharedRendererPresenterNativeRenderFailureReason: 'nativeRenderOutputReleaseFailed',
      uxfdSharedRendererPresenterNativeRenderFailureLabel: 'native render output release failed',
      uxfdSharedRendererPresenterNativeRenderFailureDetail: 'preview native output release failed',
    });
  });

  it('publishes video upload failure details while the presenter falls back', () => {
    const dataset: Record<string, string | undefined> = {};

    writeSharedRendererPresenterDiagnostics(dataset, {
      status: 'fallback',
      reason: 'requiredVideoOwnershipUnavailable',
      videoUploadFailureReason: 'videoUploadClipScopeUnavailable',
      videoUploadFailureDetail: 'A single decoded upload cannot cover multiple video clips.',
      videoUploadFailureClipId: 'video-2',
      videoUploadFailureMediaId: 'video-2',
      videoOwner: 'pixi',
      videoCutoverReason: 'videoFrameUploadUnavailable',
      sharedVideoObjectCount: 0,
    });

    expect(dataset).toMatchObject({
      uxfdSharedRendererPresenterStatus: 'fallback',
      uxfdSharedRendererPresenterFailureReason: 'requiredVideoOwnershipUnavailable',
      uxfdSharedRendererPresenterVideoUploadFailureReason: 'videoUploadClipScopeUnavailable',
      uxfdSharedRendererPresenterVideoUploadFailureDetail: 'A single decoded upload cannot cover multiple video clips.',
      uxfdSharedRendererPresenterVideoUploadFailureClipId: 'video-2',
      uxfdSharedRendererPresenterVideoUploadFailureMediaId: 'video-2',
      uxfdSharedRendererPresenterVideoOwner: 'pixi',
      uxfdSharedRendererPresenterVideoCutoverReason: 'videoFrameUploadUnavailable',
      uxfdSharedRendererPresenterSharedVideoObjectCount: '0',
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
    expect(dataset).not.toHaveProperty('uxfdSharedRendererPresenterVideoPresentationSource');
    expect(dataset).not.toHaveProperty('uxfdSharedRendererPresenterVideoOwner');
    expect(dataset).not.toHaveProperty('uxfdSharedRendererPresenterVideoCutoverReason');
    expect(dataset).not.toHaveProperty('uxfdSharedRendererPresenterSharedVideoObjectCount');
    expect(dataset).not.toHaveProperty('uxfdSharedRendererPresenterStaleSharedFrameAllowed');
    expect(dataset).not.toHaveProperty('uxfdSharedRendererPresenterNativeRenderFailureLabel');
  });

  it('keeps native render failure details when publishing a fail-loud fallback', () => {
    const dataset: Record<string, string | undefined> = {};

    writeSharedRendererPresenterDiagnostics(dataset, {
      status: 'fallback',
      reason: 'requiredVideoOwnershipUnavailable',
      nativeRenderFailureReason: 'nativeRenderFailed',
      nativeRenderFailureDetail: 'Rust backend rejected unsupported PSD media',
      videoOwner: 'pixi',
      videoCutoverReason: 'videoFrameUploadUnavailable',
      sharedVideoObjectCount: 0,
    });

    expect(dataset).toMatchObject({
      uxfdSharedRendererPresenterStatus: 'fallback',
      uxfdSharedRendererPresenterFailureReason: 'requiredVideoOwnershipUnavailable',
      uxfdSharedRendererPresenterNativeRenderFailureReason: 'nativeRenderFailed',
      uxfdSharedRendererPresenterNativeRenderFailureDetail: 'Rust backend rejected unsupported PSD media',
      uxfdSharedRendererPresenterVideoOwner: 'pixi',
      uxfdSharedRendererPresenterVideoCutoverReason: 'videoFrameUploadUnavailable',
      uxfdSharedRendererPresenterSharedVideoObjectCount: '0',
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

  it('publishes a readable prepared native render source abort release failure label', () => {
    const dataset: Record<string, string | undefined> = {};

    writeSharedRendererPresenterDiagnostics(dataset, {
      status: 'fallback',
      reason: 'requiredVideoOwnershipUnavailable',
      nativeRenderFailureReason: 'preparedNativeRenderSourceAbortReleaseFailed',
      nativeRenderFailureDetail: 'prepared native render source abort release failed',
    });

    expect(dataset).toMatchObject({
      uxfdSharedRendererPresenterStatus: 'fallback',
      uxfdSharedRendererPresenterFailureReason: 'requiredVideoOwnershipUnavailable',
      uxfdSharedRendererPresenterNativeRenderFailureReason: 'preparedNativeRenderSourceAbortReleaseFailed',
      uxfdSharedRendererPresenterNativeRenderFailureLabel: 'prepared native render source abort release failed',
      uxfdSharedRendererPresenterNativeRenderFailureDetail: 'prepared native render source abort release failed',
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

describe('recordSharedRendererPresenterTransientSkip', () => {
  it('increments a monotonic counter without touching the persistent status fields', () => {
    const dataset: Record<string, string | undefined> = {
      uxfdSharedRendererPresenterStatus: 'ready',
      uxfdSharedRendererPresenterFormat: 'bgra8unorm',
    };

    recordSharedRendererPresenterTransientSkip(dataset, 'videoTextureViewUnavailable');

    expect(dataset).toMatchObject({
      uxfdSharedRendererPresenterStatus: 'ready',
      uxfdSharedRendererPresenterFormat: 'bgra8unorm',
      uxfdSharedRendererPresenterTransientSkips: '1',
      uxfdSharedRendererPresenterLastTransientSkipReason: 'videoTextureViewUnavailable',
    });
  });

  it('keeps accumulating across calls instead of resetting', () => {
    const dataset: Record<string, string | undefined> = {};

    recordSharedRendererPresenterTransientSkip(dataset, 'videoTextureViewUnavailable');
    recordSharedRendererPresenterTransientSkip(dataset, 'videoTextureViewUnavailable');
    recordSharedRendererPresenterTransientSkip(dataset, 'videoTextureViewUnavailable');

    expect(dataset.uxfdSharedRendererPresenterTransientSkips).toBe('3');
  });

  it('does not reset when a normal ready/fallback diagnostics write happens afterwards', () => {
    const dataset: Record<string, string | undefined> = {};

    recordSharedRendererPresenterTransientSkip(dataset, 'videoTextureViewUnavailable');
    writeSharedRendererPresenterDiagnostics(dataset, {
      status: 'ready',
      format: 'bgra8unorm',
      swatch: 'no-presentation',
    });

    expect(dataset.uxfdSharedRendererPresenterTransientSkips).toBe('1');
  });
});
