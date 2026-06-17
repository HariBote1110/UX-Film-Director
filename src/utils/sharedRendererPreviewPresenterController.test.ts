import { describe, expect, it } from 'vitest';
import { buildSharedRendererPresentationContract } from './sharedRendererPresentationContract';
import {
  getSharedRendererSolidSwatchCssColour,
  SHARED_RENDERER_SOLID_SWATCH,
  startSharedRendererPreviewPresenter,
} from './sharedRendererPreviewPresenterController';
import type { RustSceneSnapshot } from './rustSceneSnapshot';
import type { SharedRendererPreviewSession } from './sharedRendererPreviewSession';
import type { RustBackendVideoFrameDescriptor } from './rustBackendVideoDecodeControl';
import type {
  SharedRendererWebGpuAdapterLike,
  SharedRendererWebGpuLike,
} from './sharedRendererWebGpuPresenter';

const snapshot: RustSceneSnapshot = {
  frame_index: 12,
  colour: {
    profile: 'rec709-sdr',
    working_space: 'linear-light',
    alpha: 'premultiplied',
  },
  clips: [],
};

const okSession: SharedRendererPreviewSession = {
  plan: {
    mode: 'parallelCompare',
    primary: 'pixi',
    candidate: 'sharedRenderer',
    snapshot,
    media: [],
  },
  surfaceGate: {
    ok: true,
    canvas: { width: 1920, height: 1080 },
    snapshot,
    media: [],
  },
  presentationContract: buildSharedRendererPresentationContract(),
};

const solidShapeSnapshot: RustSceneSnapshot = {
  ...snapshot,
  clips: [
    {
      clip_id: 'shape-1',
      track_id: 'layer-0',
      media_id: 'shape-1',
      source_frame: 0,
      z_index: 0,
      transform: {
        translation_x: 300,
        translation_y: 120,
        scale_x: 1,
        scale_y: 1,
        rotation_degrees: 0,
        sampling: 'nearest',
      },
      opacity: 1,
      effects: [],
    },
  ],
};

const solidShapeSession: SharedRendererPreviewSession = {
  plan: {
    mode: 'parallelCompare',
    primary: 'pixi',
    candidate: 'sharedRenderer',
    snapshot: solidShapeSnapshot,
    media: [
      {
        id: 'shape-1',
        kind: 'SolidColour',
        source: '#ff0000',
        width: 200,
        height: 100,
      },
    ],
  },
  surfaceGate: {
    ok: true,
    canvas: { width: 1920, height: 1080 },
    snapshot: solidShapeSnapshot,
    media: [
      {
        id: 'shape-1',
        kind: 'SolidColour',
        source: '#ff0000',
        width: 200,
        height: 100,
      },
    ],
  },
  presentationContract: buildSharedRendererPresentationContract(),
};

const videoSnapshot: RustSceneSnapshot = {
  ...snapshot,
  clips: [
    {
      clip_id: 'video-1',
      track_id: 'layer-0',
      media_id: 'video-1',
      source_frame: 90,
      z_index: 0,
      transform: {
        translation_x: 10,
        translation_y: 20,
        scale_x: 1,
        scale_y: 1,
        rotation_degrees: 0,
        sampling: 'bilinear',
      },
      opacity: 0.75,
      effects: [],
    },
  ],
};

const videoSession: SharedRendererPreviewSession = {
  plan: {
    mode: 'parallelCompare',
    primary: 'pixi',
    candidate: 'sharedRenderer',
    snapshot: videoSnapshot,
    media: [
      {
        id: 'video-1',
        kind: 'Video',
        source: '/tmp/video.mp4',
        width: 1280,
        height: 720,
      },
    ],
  },
  surfaceGate: {
    ok: true,
    canvas: { width: 1920, height: 1080 },
    snapshot: videoSnapshot,
    media: [
      {
        id: 'video-1',
        kind: 'Video',
        source: '/tmp/video.mp4',
        width: 1280,
        height: 720,
      },
    ],
  },
  presentationContract: buildSharedRendererPresentationContract(),
};

const multiVideoSnapshot: RustSceneSnapshot = {
  ...snapshot,
  clips: [
    ...videoSnapshot.clips,
    {
      clip_id: 'video-2',
      track_id: 'layer-1',
      media_id: 'video-2',
      source_frame: 120,
      z_index: 1,
      transform: {
        translation_x: 120,
        translation_y: 80,
        scale_x: 1,
        scale_y: 1,
        rotation_degrees: 0,
        sampling: 'bilinear',
      },
      opacity: 1,
      effects: [],
    },
  ],
};

const multiVideoSession: SharedRendererPreviewSession = {
  ...videoSession,
  plan: {
    ...videoSession.plan,
    snapshot: multiVideoSnapshot,
    media: [
      ...videoSession.plan.media,
      {
        id: 'video-2',
        kind: 'Video',
        source: '/tmp/video-2.mp4',
        width: 640,
        height: 360,
      },
    ],
  },
  surfaceGate: {
    ...videoSession.surfaceGate,
    snapshot: multiVideoSnapshot,
    media: [
      ...videoSession.surfaceGate.media,
      {
        id: 'video-2',
        kind: 'Video',
        source: '/tmp/video-2.mp4',
        width: 640,
        height: 360,
      },
    ],
  },
};

const decodedVideoDescriptor: RustBackendVideoFrameDescriptor = {
  memoryId: '/uxfd-controller-video-ring',
  slotIndex: 0,
  generation: 3,
  byteOffset: 0,
  byteLen: 512,
  width: 34,
  height: 2,
  strideBytes: 256,
  format: 'rgba8Srgb',
  colour: {
    primaries: 'bt709',
    transfer: 'srgb',
    matrix: 'rgb',
    range: 'full',
  },
};

describe('startSharedRendererPreviewPresenter', () => {
  it('exposes a CSS reference colour from the same solid swatch constants', () => {
    expect(getSharedRendererSolidSwatchCssColour()).toBe('rgb(64, 128, 191)');
  });

  it('creates the WebGPU presenter, presents the solid swatch, and publishes ready diagnostics', async () => {
    const dataset: Record<string, string | undefined> = {};
    const renderPasses: unknown[] = [];
    const submittedCommandBuffers: unknown[] = [];

    const control = await startSharedRendererPreviewPresenter({
      canvas: fakeCanvas(() => fakeContext()),
      session: okSession,
      datasets: [dataset],
      gpu: fakeGpu({
        format: 'bgra8unorm',
        onRequestAdapter: () => fakeAdapter({
          device: fakeDevice({
            onRenderPass: (descriptor) => {
              renderPasses.push(descriptor);
            },
            onSubmit: (commandBuffers) => {
              submittedCommandBuffers.push(...commandBuffers);
            },
          }),
        }),
      }),
      textureUsageRenderAttachment: 16,
    });

    expect(control).toMatchObject({
      ok: true,
      format: 'bgra8unorm',
    });
    expect(renderPasses).toEqual([
      {
        colorAttachments: [
          {
            view: 'current-texture-view',
            clearValue: {
              r: SHARED_RENDERER_SOLID_SWATCH.red,
              g: SHARED_RENDERER_SOLID_SWATCH.green,
              b: SHARED_RENDERER_SOLID_SWATCH.blue,
              a: SHARED_RENDERER_SOLID_SWATCH.alpha,
            },
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
      },
    ]);
    expect(submittedCommandBuffers).toEqual(['finished-command-buffer']);
    expect(dataset).toEqual({
      uxfdSharedRendererPresenterStatus: 'ready',
      uxfdSharedRendererPresenterFormat: 'bgra8unorm',
      uxfdSharedRendererPresenterSwatch: 'solid-srgb',
      uxfdSharedRendererPresenterFailureReason: undefined,
      uxfdSharedRendererPresenterStaleSharedFrameAllowed: undefined,
    });
  });

  it('keeps Pixi visible with a transparent shared-renderer pass when diagnostic swatch is disabled', async () => {
    const dataset: Record<string, string | undefined> = {};
    const renderPasses: unknown[] = [];
    const renderPassOperations: string[] = [];

    const control = await startSharedRendererPreviewPresenter({
      canvas: fakeCanvas(() => fakeContext()),
      session: okSession,
      datasets: [dataset],
      diagnosticSwatchEnabled: false,
      gpu: fakeGpu({
        format: 'bgra8unorm',
        onRequestAdapter: () => fakeAdapter({
          device: fakeDevice({
            onRenderPass: (descriptor) => {
              renderPasses.push(descriptor);
            },
            onRenderPassOperation: (operation) => {
              renderPassOperations.push(operation);
            },
          }),
        }),
      }),
      textureUsageRenderAttachment: 16,
    });

    expect(control).toMatchObject({
      ok: true,
      format: 'bgra8unorm',
    });
    expect(renderPasses).toEqual([
      {
        colorAttachments: [
          {
            view: 'current-texture-view',
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
      },
    ]);
    expect(renderPassOperations).toEqual(['end']);
    expect(dataset).toMatchObject({
      uxfdSharedRendererPresenterStatus: 'ready',
      uxfdSharedRendererPresenterFormat: 'bgra8unorm',
      uxfdSharedRendererPresenterSwatch: 'pixi-passthrough',
    });
  });

  it('presents SolidColour scene content instead of the diagnostic swatch when rectangle clips exist', async () => {
    const dataset: Record<string, string | undefined> = {};
    const renderPasses: unknown[] = [];
    const renderPassOperations: string[] = [];

    const control = await startSharedRendererPreviewPresenter({
      canvas: fakeCanvas(() => fakeContext()),
      session: solidShapeSession,
      datasets: [dataset],
      gpu: fakeGpu({
        format: 'bgra8unorm',
        onRequestAdapter: () => fakeAdapter({
          device: fakeDevice({
            onRenderPass: (descriptor) => {
              renderPasses.push(descriptor);
            },
            onRenderPassOperation: (operation) => {
              renderPassOperations.push(operation);
            },
          }),
        }),
      }),
      textureUsageRenderAttachment: 16,
      bufferUsageVertex: 1,
      bufferUsageCopyDst: 2,
      rustSolidColourWasmEnabled: false,
    });

    expect(control).toMatchObject({
      ok: true,
      format: 'bgra8unorm',
    });
    expect(renderPasses).toEqual([
      {
        colorAttachments: [
          {
            view: 'current-texture-view',
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
      },
    ]);
    expect(renderPassOperations).toContain('draw:6');
    expect(dataset).toMatchObject({
      uxfdSharedRendererPresenterStatus: 'ready',
      uxfdSharedRendererPresenterFormat: 'bgra8unorm',
      uxfdSharedRendererPresenterSwatch: 'solid-colour-scene',
      uxfdSharedRendererPresenterGeometrySource: 'typescript',
    });
  });

  it('uses the Rust/WASM SolidColour vertex builder when it is available', async () => {
    const dataset: Record<string, string | undefined> = {};
    const writtenBuffers: Float32Array[] = [];
    const rustVertices = new Float32Array([
      -0.5, 0.5, 0.25, 0.125, 0.0, 0.75,
      0.5, 0.5, 0.25, 0.125, 0.0, 0.75,
      -0.5, -0.5, 0.25, 0.125, 0.0, 0.75,
      -0.5, -0.5, 0.25, 0.125, 0.0, 0.75,
      0.5, 0.5, 0.25, 0.125, 0.0, 0.75,
      0.5, -0.5, 0.25, 0.125, 0.0, 0.75,
    ]);

    const control = await startSharedRendererPreviewPresenter({
      canvas: fakeCanvas(() => fakeContext()),
      session: solidShapeSession,
      datasets: [dataset],
      rustSolidColourVertexSceneBuilder: () => ({
        ok: true,
        rectCount: 1,
        vertices: rustVertices,
      }),
      gpu: fakeGpu({
        format: 'bgra8unorm',
        onRequestAdapter: () => fakeAdapter({
          device: fakeDevice({
            onWriteBuffer: (_buffer, _offset, data) => {
              writtenBuffers.push(data);
            },
          }),
        }),
      }),
      textureUsageRenderAttachment: 16,
    });

    expect(control).toMatchObject({
      ok: true,
      format: 'bgra8unorm',
      solidColourOwnership: {
        owner: 'sharedRenderer',
        reason: 'rustSolidColourReady',
        solidColourObjectIds: ['shape-1'],
      },
    });
    expect(writtenBuffers).toEqual([rustVertices]);
    expect(dataset).toMatchObject({
      uxfdSharedRendererPresenterGeometrySource: 'rust-wasm',
      uxfdSharedRendererPresenterSolidColourOwner: 'sharedRenderer',
      uxfdSharedRendererPresenterSharedSolidColourObjectCount: '1',
    });
  });

  it('uses the Rust/WASM VideoPlane vertex builder when video clips exist', async () => {
    const dataset: Record<string, string | undefined> = {};
    const builderCalls: unknown[] = [];

    const control = await startSharedRendererPreviewPresenter({
      canvas: fakeCanvas(() => fakeContext()),
      session: videoSession,
      datasets: [dataset],
      diagnosticSwatchEnabled: false,
      rustVideoFrameDecodeRequestWasmEnabled: false,
      rustVideoPlaneVertexSceneBuilder: (input) => {
        builderCalls.push(input);
        return {
          ok: true,
          planeCount: 1,
          planes: [{
            clipId: 'video-1',
            mediaId: 'video-1',
            sourceFrame: 90,
            zIndex: 0,
            opacity: 0.75,
          }],
          vertices: new Float32Array([-0.5, 0.5, 0, 0, 0.75, 1, 0, 1]),
        };
      },
      gpu: fakeGpu({
        format: 'bgra8unorm',
        onRequestAdapter: () => fakeAdapter(),
      }),
      textureUsageRenderAttachment: 16,
    });

    expect(control).toMatchObject({
      ok: true,
      format: 'bgra8unorm',
    });
    expect(builderCalls).toHaveLength(1);
    expect(dataset).toMatchObject({
      uxfdSharedRendererPresenterVideoGeometrySource: 'rust-wasm',
    });
  });

  it('uses the Rust/WASM video frame decode request builder when video clips exist', async () => {
    const dataset: Record<string, string | undefined> = {};
    const builderCalls: unknown[] = [];

    const control = await startSharedRendererPreviewPresenter({
      canvas: fakeCanvas(() => fakeContext()),
      session: videoSession,
      datasets: [dataset],
      diagnosticSwatchEnabled: false,
      rustVideoPlaneWasmEnabled: false,
      rustVideoFrameDecodeRequestBuilder: (input) => {
        builderCalls.push(input);
        return {
          ok: true,
          requestCount: 1,
          requests: [{
            clipId: 'video-1',
            mediaId: 'video-1',
            source: '/tmp/video.mp4',
            sourceFrame: 90,
            sourceRate: {
              numerator: 60,
              denominator: 1,
            },
            timelineFrame: 12,
            width: 1280,
            height: 720,
            format: 'rgba8Srgb',
            colour: 'rec709SrgbFullRange',
          }],
        };
      },
      gpu: fakeGpu({
        format: 'bgra8unorm',
        onRequestAdapter: () => fakeAdapter(),
      }),
      textureUsageRenderAttachment: 16,
    });

    expect(control).toMatchObject({
      ok: true,
      format: 'bgra8unorm',
    });
    expect(builderCalls).toEqual([{
      snapshot: videoSession.surfaceGate.ok ? videoSession.surfaceGate.snapshot : null,
      media: videoSession.surfaceGate.ok ? videoSession.surfaceGate.media : null,
    }]);
    expect(dataset).toMatchObject({
      uxfdSharedRendererPresenterVideoDecodeRequestSource: 'rust-wasm',
      uxfdSharedRendererPresenterVideoDecodeRequestCount: '1',
    });
  });

  it('publishes shared renderer video ownership when Rust decode and frame upload are ready', async () => {
    const dataset: Record<string, string | undefined> = {};

    const control = await startSharedRendererPreviewPresenter({
      canvas: fakeCanvas(() => fakeContext()),
      session: videoSession,
      datasets: [dataset],
      diagnosticSwatchEnabled: false,
      rustVideoPlaneWasmEnabled: false,
      sharedRendererVideoCutoverEnabled: true,
      sharedRendererVideoFrameUploadReady: true,
      rustVideoFrameDecodeRequestBuilder: () => ({
        ok: true,
        requestCount: 1,
        requests: [{
          clipId: 'video-1',
          mediaId: 'video-1',
          source: '/tmp/video.mp4',
          sourceFrame: 90,
          sourceRate: {
            numerator: 60,
            denominator: 1,
          },
          timelineFrame: 12,
          width: 1280,
          height: 720,
          format: 'rgba8Srgb',
          colour: 'rec709SrgbFullRange',
        }],
      }),
      gpu: fakeGpu({
        format: 'bgra8unorm',
        onRequestAdapter: () => fakeAdapter(),
      }),
      textureUsageRenderAttachment: 16,
    });

    expect(control).toMatchObject({
      ok: true,
      videoOwnership: {
        owner: 'sharedRenderer',
        reason: 'rustDecodedFrameUploadReady',
        videoObjectIds: ['video-1'],
      },
    });
    expect(dataset).toMatchObject({
      uxfdSharedRendererPresenterVideoOwner: 'sharedRenderer',
      uxfdSharedRendererPresenterVideoCutoverReason: 'rustDecodedFrameUploadReady',
      uxfdSharedRendererPresenterSharedVideoObjectCount: '1',
    });
  });

  it('uploads a decoded Rust video frame before publishing upload readiness and releasing the slot', async () => {
    const dataset: Record<string, string | undefined> = {};
    const events: string[] = [];
    const renderPassOperations: string[] = [];
    const rgbaBytes = new Uint8Array(decodedVideoDescriptor.byteLen);

    const control = await startSharedRendererPreviewPresenter({
      canvas: fakeCanvas(() => fakeContext()),
      session: videoSession,
      datasets: [dataset],
      diagnosticSwatchEnabled: false,
      rustVideoPlaneWasmEnabled: false,
      sharedRendererVideoCutoverEnabled: true,
      sharedRendererDecodedVideoFrameUpload: {
        descriptor: decodedVideoDescriptor,
        ptsFrame: 90,
        rgbaBytes,
        releaseAfterGpuUpload: async () => {
          events.push('release');
        },
      },
      rustVideoFrameDecodeRequestBuilder: () => ({
        ok: true,
        requestCount: 1,
        requests: [{
          clipId: 'video-1',
          mediaId: 'video-1',
          source: '/tmp/video.mp4',
          sourceFrame: 90,
          sourceRate: {
            numerator: 60,
            denominator: 1,
          },
          timelineFrame: 12,
          width: 1280,
          height: 720,
          format: 'rgba8Srgb',
          colour: 'rec709SrgbFullRange',
        }],
      }),
      gpu: fakeGpu({
        format: 'bgra8unorm',
        onRequestAdapter: () => fakeAdapter({
          device: fakeDevice({
            onRenderPassOperation: (operation) => {
              renderPassOperations.push(operation);
            },
            onWriteTexture: () => {
              events.push('writeTexture');
            },
            onSubmittedWorkDone: async () => {
              events.push('gpuUploadDone');
            },
          }),
        }),
      }),
      textureUsageRenderAttachment: 16,
    });

    expect(control).toMatchObject({
      ok: true,
      videoOwnership: {
        owner: 'sharedRenderer',
        reason: 'rustDecodedFrameUploadReady',
        videoObjectIds: ['video-1'],
      },
    });
    expect(events).toEqual(['writeTexture', 'gpuUploadDone', 'release']);
    expect(renderPassOperations).toContain('setPipeline:video-frame-pipeline');
    expect(renderPassOperations).toContain('setBindGroup:0:video-frame-bind-group');
    expect(renderPassOperations).toContain('draw:6');
    expect(dataset).toMatchObject({
      uxfdSharedRendererPresenterVideoFrameUploadReady: 'true',
      uxfdSharedRendererPresenterVideoOwner: 'sharedRenderer',
      uxfdSharedRendererPresenterVideoCutoverReason: 'rustDecodedFrameUploadReady',
    });
  });

  it('publishes shared video ownership only for clips with uploaded Rust frames', async () => {
    const dataset: Record<string, string | undefined> = {};
    const events: string[] = [];
    const renderPassOperations: string[] = [];
    const rgbaBytes = new Uint8Array(decodedVideoDescriptor.byteLen);

    const control = await startSharedRendererPreviewPresenter({
      canvas: fakeCanvas(() => fakeContext()),
      session: multiVideoSession,
      datasets: [dataset],
      diagnosticSwatchEnabled: false,
      rustVideoPlaneWasmEnabled: false,
      sharedRendererVideoCutoverEnabled: true,
      sharedRendererDecodedVideoFrameUploads: [{
        clipId: 'video-1',
        descriptor: decodedVideoDescriptor,
        ptsFrame: 90,
        rgbaBytes,
        releaseAfterGpuUpload: async () => {
          events.push('release:video-1');
        },
      }],
      rustVideoFrameDecodeRequestBuilder: () => ({
        ok: true,
        requestCount: 2,
        requests: [
          {
            clipId: 'video-1',
            mediaId: 'video-1',
            source: '/tmp/video.mp4',
            sourceFrame: 90,
            sourceRate: {
              numerator: 60,
              denominator: 1,
            },
            timelineFrame: 12,
            width: 1280,
            height: 720,
            format: 'rgba8Srgb',
            colour: 'rec709SrgbFullRange',
          },
          {
            clipId: 'video-2',
            mediaId: 'video-2',
            source: '/tmp/video-2.mp4',
            sourceFrame: 120,
            sourceRate: {
              numerator: 30,
              denominator: 1,
            },
            timelineFrame: 12,
            width: 640,
            height: 360,
            format: 'rgba8Srgb',
            colour: 'rec709SrgbFullRange',
          },
        ],
      }),
      gpu: fakeGpu({
        format: 'bgra8unorm',
        onRequestAdapter: () => fakeAdapter({
          device: fakeDevice({
            onWriteTexture: () => {
              events.push('writeTexture:video-1');
            },
            onRenderPassOperation: (operation) => {
              renderPassOperations.push(operation);
            },
            onSubmittedWorkDone: async () => {
              events.push('gpuUploadDone');
            },
          }),
        }),
      }),
      textureUsageRenderAttachment: 16,
    } as any);

    expect(control).toMatchObject({
      ok: true,
      videoOwnership: {
        owner: 'sharedRenderer',
        reason: 'rustDecodedFrameUploadReady',
        videoObjectIds: ['video-1'],
      },
    });
    expect(events).toEqual(['writeTexture:video-1', 'gpuUploadDone', 'release:video-1']);
    expect(renderPassOperations).toContain('draw:6');
    expect(renderPassOperations).not.toContain('draw:12');
    expect(dataset).toMatchObject({
      uxfdSharedRendererPresenterVideoFrameUploadReady: 'true',
      uxfdSharedRendererPresenterVideoOwner: 'sharedRenderer',
      uxfdSharedRendererPresenterSharedVideoObjectCount: '1',
    });
  });

  it('aborts the decoded Rust video slot when WebGPU texture upload is unavailable', async () => {
    const dataset: Record<string, string | undefined> = {};
    const events: string[] = [];
    const rgbaBytes = new Uint8Array(decodedVideoDescriptor.byteLen);

    const control = await startSharedRendererPreviewPresenter({
      canvas: fakeCanvas(() => fakeContext()),
      session: videoSession,
      datasets: [dataset],
      diagnosticSwatchEnabled: false,
      rustVideoPlaneWasmEnabled: false,
      sharedRendererVideoCutoverEnabled: true,
      sharedRendererDecodedVideoFrameUpload: {
        descriptor: decodedVideoDescriptor,
        ptsFrame: 90,
        rgbaBytes,
        releaseAfterGpuUpload: async () => {
          events.push('release-after-upload');
        },
        releaseAfterUploadAbort: async () => {
          events.push('release-abort');
        },
      },
      rustVideoFrameDecodeRequestBuilder: () => ({
        ok: true,
        requestCount: 1,
        requests: [{
          clipId: 'video-1',
          mediaId: 'video-1',
          source: '/tmp/video.mp4',
          sourceFrame: 90,
          sourceRate: {
            numerator: 60,
            denominator: 1,
          },
          timelineFrame: 12,
          width: 1280,
          height: 720,
          format: 'rgba8Srgb',
          colour: 'rec709SrgbFullRange',
        }],
      }),
      gpu: fakeGpu({
        format: 'bgra8unorm',
        onRequestAdapter: () => fakeAdapter({
          device: fakeDevice({
            exposeWriteTexture: false,
          }),
        }),
      }),
      textureUsageRenderAttachment: 16,
    });

    expect(control).toMatchObject({
      ok: true,
      videoOwnership: {
        owner: 'pixi',
        reason: 'videoFrameUploadUnavailable',
      },
    });
    expect(events).toEqual(['release-abort']);
    expect(dataset).toMatchObject({
      uxfdSharedRendererPresenterVideoFrameUploadReady: 'false',
      uxfdSharedRendererPresenterVideoOwner: 'pixi',
      uxfdSharedRendererPresenterVideoCutoverReason: 'videoFrameUploadUnavailable',
    });
  });

  it('publishes Pixi fallback diagnostics without touching WebGPU when the surface gate is blocked', async () => {
    const dataset: Record<string, string | undefined> = {};
    const calls: string[] = [];

    const control = await startSharedRendererPreviewPresenter({
      canvas: fakeCanvas(() => {
        calls.push('getContext');
        return null;
      }),
      session: {
        ...okSession,
        surfaceGate: {
          ok: false,
          reason: 'planNotComparable',
          detail: 'Shared renderer surface requires a parallelCompare plan.',
        },
      },
      datasets: [dataset],
      gpu: fakeGpu({
        onRequestAdapter: () => {
          calls.push('requestAdapter');
          return fakeAdapter();
        },
      }),
      textureUsageRenderAttachment: 16,
    });

    expect(control).toEqual({
      ok: false,
      reason: 'planNotComparable',
      dispose: expect.any(Function),
    });
    expect(calls).toEqual([]);
    expect(dataset).toEqual({
      uxfdSharedRendererPresenterStatus: 'fallback',
      uxfdSharedRendererPresenterFormat: undefined,
      uxfdSharedRendererPresenterSwatch: undefined,
      uxfdSharedRendererPresenterFailureReason: 'planNotComparable',
      uxfdSharedRendererPresenterStaleSharedFrameAllowed: undefined,
    });
  });

  it('publishes device-lost diagnostics and keeps stale shared frames forbidden', async () => {
    let resolveLost!: (value: unknown) => void;
    const lost = new Promise((resolve) => {
      resolveLost = resolve;
    });
    const dataset: Record<string, string | undefined> = {};

    const control = await startSharedRendererPreviewPresenter({
      canvas: fakeCanvas(() => fakeContext()),
      session: okSession,
      datasets: [dataset],
      gpu: fakeGpu({
        onRequestAdapter: () => fakeAdapter({ lost }),
      }),
      textureUsageRenderAttachment: 16,
    });

    expect(control.ok).toBe(true);
    resolveLost({ message: 'test device lost' });
    await Promise.resolve();

    expect(dataset).toEqual({
      uxfdSharedRendererPresenterStatus: 'deviceLost',
      uxfdSharedRendererPresenterFormat: undefined,
      uxfdSharedRendererPresenterSwatch: undefined,
      uxfdSharedRendererPresenterFailureReason: 'deviceLost',
      uxfdSharedRendererPresenterStaleSharedFrameAllowed: 'false',
    });
  });
});

const fakeCanvas = (getContext: () => unknown) =>
  ({
    width: 0,
    height: 0,
    getContext,
  }) as unknown as HTMLCanvasElement;

const fakeContext = () => ({
  configure: () => undefined,
  getCurrentTexture: () => ({
    createView: () => 'current-texture-view',
  }),
});

const fakeGpu = ({
  format = 'rgba8unorm',
  onRequestAdapter,
}: {
  format?: string;
  onRequestAdapter: () => SharedRendererWebGpuAdapterLike;
}): SharedRendererWebGpuLike => ({
  getPreferredCanvasFormat: () => format,
  requestAdapter: async (options: { powerPreference: 'high-performance' }) => {
    expect(options).toEqual({ powerPreference: 'high-performance' });
    return onRequestAdapter();
  },
});

const fakeAdapter = ({
  lost = new Promise(() => undefined),
  device,
}: {
  lost?: Promise<unknown>;
  device?: ReturnType<typeof fakeDevice>;
} = {}): SharedRendererWebGpuAdapterLike => {
  const resolvedDevice = device ?? fakeDevice({ lost });
  return {
    requestDevice: async () => resolvedDevice,
    device: resolvedDevice,
    lost,
  } as SharedRendererWebGpuAdapterLike & { device: ReturnType<typeof fakeDevice>; lost: Promise<unknown> };
};

const fakeDevice = ({
  onRenderPass = () => undefined,
  onRenderPassOperation = () => undefined,
  onWriteBuffer = () => undefined,
  onWriteTexture = () => undefined,
  onSubmittedWorkDone = async () => undefined,
  onSubmit = () => undefined,
  exposeWriteTexture = true,
  lost = new Promise(() => undefined),
}: {
  onRenderPass?: (descriptor: unknown) => void;
  onRenderPassOperation?: (operation: string) => void;
  onWriteBuffer?: (buffer: unknown, offset: number, data: Float32Array) => void;
  onWriteTexture?: (
    destination: unknown,
    data: Uint8Array,
    dataLayout: unknown,
    size: unknown
  ) => void;
  onSubmittedWorkDone?: () => Promise<void>;
  onSubmit?: (commandBuffers: unknown[]) => void;
  exposeWriteTexture?: boolean;
  lost?: Promise<unknown>;
} = {}) => ({
  lost,
  queue: {
    submit: onSubmit,
    writeBuffer: onWriteBuffer,
    ...(exposeWriteTexture ? { writeTexture: onWriteTexture } : {}),
    onSubmittedWorkDone,
  },
  createTexture: () => ({
    createView: () => 'video-frame-texture-view',
  }),
  createShaderModule: () => 'solid-colour-shader-module',
  createRenderPipeline: (descriptor?: { label?: string }) => ({
    toString: () => descriptor?.label ?? 'solid-colour-pipeline',
    getBindGroupLayout: (index: number) => `bind-group-layout-${index}`,
  }),
  createSampler: () => 'video-frame-sampler',
  createBindGroup: () => 'video-frame-bind-group',
  createBuffer: () => 'solid-colour-vertex-buffer',
  createCommandEncoder: () => ({
    beginRenderPass: (descriptor: unknown) => {
      onRenderPass(descriptor);
      return {
        setPipeline: (pipeline: unknown) => {
          onRenderPassOperation(`setPipeline:${String(pipeline)}`);
        },
        setVertexBuffer: (slot: number, buffer: unknown) => {
          onRenderPassOperation(`setVertexBuffer:${slot}:${String(buffer)}`);
        },
        setBindGroup: (slot: number, bindGroup: unknown) => {
          onRenderPassOperation(`setBindGroup:${slot}:${String(bindGroup)}`);
        },
        draw: (vertexCount: number) => {
          onRenderPassOperation(`draw:${vertexCount}`);
        },
        end: () => {
          onRenderPassOperation('end');
        },
      };
    },
    finish: () => 'finished-command-buffer',
  }),
});
