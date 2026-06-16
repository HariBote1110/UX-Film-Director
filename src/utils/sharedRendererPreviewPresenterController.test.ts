import { describe, expect, it } from 'vitest';
import { buildSharedRendererPresentationContract } from './sharedRendererPresentationContract';
import {
  getSharedRendererSolidSwatchCssColour,
  SHARED_RENDERER_SOLID_SWATCH,
  startSharedRendererPreviewPresenter,
} from './sharedRendererPreviewPresenterController';
import type { RustSceneSnapshot } from './rustSceneSnapshot';
import type { SharedRendererPreviewSession } from './sharedRendererPreviewSession';
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
  onSubmit = () => undefined,
  lost = new Promise(() => undefined),
}: {
  onRenderPass?: (descriptor: unknown) => void;
  onRenderPassOperation?: (operation: string) => void;
  onWriteBuffer?: (buffer: unknown, offset: number, data: Float32Array) => void;
  onSubmit?: (commandBuffers: unknown[]) => void;
  lost?: Promise<unknown>;
} = {}) => ({
  lost,
  queue: {
    submit: onSubmit,
    writeBuffer: onWriteBuffer,
  },
  createShaderModule: () => 'solid-colour-shader-module',
  createRenderPipeline: () => 'solid-colour-pipeline',
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
