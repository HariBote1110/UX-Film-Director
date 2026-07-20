import { describe, expect, it } from 'vitest';
import { buildSharedRendererPresentationContract } from './sharedRendererPresentationContract';
import {
  EXTERNAL_VIDEO_TRANSIENT_SKIP_ESCALATION_THRESHOLD,
  getSharedRendererSolidSwatchCssColour,
  isTransientExternalVideoPresentationFailure,
  SHARED_RENDERER_SOLID_SWATCH,
  startSharedRendererPreviewPresenter,
} from './sharedRendererPreviewPresenterController';
import type { RustSceneMediaReference, RustSceneSnapshot } from './rustSceneSnapshot';
import type { SharedRendererPreviewSession } from './sharedRendererPreviewSession';
import type { RustBackendVideoFrameDescriptor } from './rustBackendVideoDecodeControl';
import type { RustBackendVideoEncodeWriteFramePayload } from './rustBackendVideoEncodeControl';
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
    mode: 'sharedRenderer',
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
    mode: 'sharedRenderer',
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

const generatedGradientSnapshot: RustSceneSnapshot = {
  ...snapshot,
  clips: [
    {
      clip_id: 'gradient-1',
      track_id: 'layer-0',
      media_id: 'gradient-1',
      source_frame: 0,
      z_index: 0,
      transform: {
        translation_x: 300,
        translation_y: 120,
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

const generatedGradientSession: SharedRendererPreviewSession = {
  plan: {
    mode: 'sharedRenderer',
    snapshot: generatedGradientSnapshot,
    media: [
      {
        id: 'gradient-1',
        kind: 'GeneratedGradient',
        source: '{"type":"linear","colours":["#ff0000","#0000ff"],"stops":[0,1],"direction":90}',
        width: 200,
        height: 100,
      },
    ],
  },
  surfaceGate: {
    ok: true,
    canvas: { width: 1920, height: 1080 },
    snapshot: generatedGradientSnapshot,
    media: [
      {
        id: 'gradient-1',
        kind: 'GeneratedGradient',
        source: '{"type":"linear","colours":["#ff0000","#0000ff"],"stops":[0,1],"direction":90}',
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

const videoMedia: RustSceneMediaReference[] = [
  {
    id: 'video-1',
    kind: 'Video',
    source: '/tmp/video.mp4',
    width: 1280,
    height: 720,
  },
];

const videoSession: SharedRendererPreviewSession = {
  plan: {
    mode: 'sharedRenderer',
    snapshot: videoSnapshot,
    media: videoMedia,
  },
  surfaceGate: {
    ok: true,
    canvas: { width: 1920, height: 1080 },
    snapshot: videoSnapshot,
    media: videoMedia,
  },
  presentationContract: buildSharedRendererPresentationContract(),
};

const imageSnapshot: RustSceneSnapshot = {
  ...snapshot,
  clips: [
    {
      clip_id: 'image-1',
      track_id: 'layer-0',
      media_id: 'image-1',
      source_frame: 0,
      z_index: 0,
      transform: {
        translation_x: 32,
        translation_y: 48,
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

const imageSession: SharedRendererPreviewSession = {
  plan: {
    mode: 'sharedRenderer',
    snapshot: imageSnapshot,
    media: [
      {
        id: 'image-1',
        kind: 'Image',
        source: '/tmp/overlay.png',
        width: 320,
        height: 180,
      },
    ],
  },
  surfaceGate: {
    ok: true,
    canvas: { width: 1920, height: 1080 },
    snapshot: imageSnapshot,
    media: [
      {
        id: 'image-1',
        kind: 'Image',
        source: '/tmp/overlay.png',
        width: 320,
        height: 180,
      },
    ],
  },
  presentationContract: buildSharedRendererPresentationContract(),
};

const psdSnapshot: RustSceneSnapshot = {
  ...snapshot,
  clips: [
    {
      clip_id: 'psd-1',
      track_id: 'layer-0',
      media_id: 'psd-1',
      source_frame: 0,
      z_index: 0,
      transform: {
        translation_x: 64,
        translation_y: 96,
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

const psdSession: SharedRendererPreviewSession = {
  plan: {
    mode: 'sharedRenderer',
    snapshot: psdSnapshot,
    media: [
      {
        id: 'psd-1',
        kind: 'Psd',
        source: '/tmp/standing.psd',
        width: 512,
        height: 768,
      },
    ],
  },
  surfaceGate: {
    ok: true,
    canvas: { width: 1920, height: 1080 },
    snapshot: psdSnapshot,
    media: [
      {
        id: 'psd-1',
        kind: 'Psd',
        source: '/tmp/standing.psd',
        width: 512,
        height: 768,
      },
    ],
  },
  presentationContract: buildSharedRendererPresentationContract(),
};

const textSnapshot: RustSceneSnapshot = {
  ...snapshot,
  clips: [
    {
      clip_id: 'text-1',
      track_id: 'layer-0',
      media_id: 'text-1',
      source_frame: 0,
      z_index: 0,
      transform: {
        translation_x: 16,
        translation_y: 24,
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

const textSession: SharedRendererPreviewSession = {
  plan: {
    mode: 'sharedRenderer',
    snapshot: textSnapshot,
    media: [
      {
        id: 'text-1',
        kind: 'Text',
        source: JSON.stringify({ text: 'こんにちは', font_family: 'Arial', font_size: 24, colour: '#ffffff' }),
        width: 240,
        height: 48,
      },
    ],
  },
  surfaceGate: {
    ok: true,
    canvas: { width: 1920, height: 1080 },
    snapshot: textSnapshot,
    media: [
      {
        id: 'text-1',
        kind: 'Text',
        source: JSON.stringify({ text: 'こんにちは', font_family: 'Arial', font_size: 24, colour: '#ffffff' }),
        width: 240,
        height: 48,
      },
    ],
  },
  presentationContract: buildSharedRendererPresentationContract(),
};

const videoPsdSnapshot: RustSceneSnapshot = {
  ...snapshot,
  clips: [
    {
      ...videoSnapshot.clips[0],
      z_index: 0,
    },
    {
      ...psdSnapshot.clips[0],
      z_index: 1,
    },
  ],
};

const videoPsdMedia: RustSceneMediaReference[] = [
  videoMedia[0],
  {
    id: 'psd-1',
    kind: 'Psd',
    source: '/tmp/standing.psd',
    width: 512,
    height: 768,
  },
];

const videoPsdSession: SharedRendererPreviewSession = {
  plan: {
    mode: 'sharedRenderer',
    snapshot: videoPsdSnapshot,
    media: videoPsdMedia,
  },
  surfaceGate: {
    ok: true,
    canvas: { width: 1920, height: 1080 },
    snapshot: videoPsdSnapshot,
    media: videoPsdMedia,
  },
  presentationContract: buildSharedRendererPresentationContract(),
};

const videoGeneratedGradientSnapshot: RustSceneSnapshot = {
  ...snapshot,
  clips: [
    {
      ...videoSnapshot.clips[0],
      z_index: 0,
    },
    {
      ...generatedGradientSnapshot.clips[0],
      z_index: 1,
    },
  ],
};

const videoGeneratedGradientMedia: RustSceneMediaReference[] = [
  videoMedia[0],
  {
    id: 'gradient-1',
    kind: 'GeneratedGradient',
    source: '{"type":"linear","colours":["#ff0000","#0000ff"],"stops":[0,1],"direction":90}',
    width: 200,
    height: 100,
  },
];

const videoGeneratedGradientSession: SharedRendererPreviewSession = {
  plan: {
    mode: 'sharedRenderer',
    snapshot: videoGeneratedGradientSnapshot,
    media: videoGeneratedGradientMedia,
  },
  surfaceGate: {
    ok: true,
    canvas: { width: 1920, height: 1080 },
    snapshot: videoGeneratedGradientSnapshot,
    media: videoGeneratedGradientMedia,
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

const multiVideoMedia: RustSceneMediaReference[] = [
  ...videoMedia,
  {
    id: 'video-2',
    kind: 'Video',
    source: '/tmp/video-2.mp4',
    width: 640,
    height: 360,
  },
];

const multiVideoSession: SharedRendererPreviewSession = {
  plan: {
    mode: 'sharedRenderer',
    snapshot: multiVideoSnapshot,
    media: multiVideoMedia,
  },
  surfaceGate: {
    ok: true,
    canvas: { width: 1920, height: 1080 },
    snapshot: multiVideoSnapshot,
    media: multiVideoMedia,
  },
  presentationContract: buildSharedRendererPresentationContract(),
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

const nativeRenderDescriptor: RustBackendVideoFrameDescriptor = {
  memoryId: '/uxfd-controller-native-render-ring',
  slotIndex: 0,
  generation: 7,
  byteOffset: 0,
  byteLen: 1024,
  width: 4,
  height: 4,
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

  it('does not expose WebGPU presented frame readback on ready presenter controls', async () => {
    const copyOperations: unknown[] = [];

    const control = await startSharedRendererPreviewPresenter({
      canvas: fakeCanvas(() => fakeContext()),
      session: {
        ...okSession,
        surfaceGate: {
          ok: true,
          canvas: { width: 2, height: 2 },
          snapshot,
          media: [],
        },
      },
      datasets: [{}],
      gpu: fakeGpu({
        format: 'bgra8unorm',
        onRequestAdapter: () => fakeAdapter({
          device: fakeDevice({
            onCopyTextureToBuffer: (...args) => {
              copyOperations.push(args);
            },
          }),
        }),
      }),
      textureUsageRenderAttachment: 16,
      bufferUsageCopyDst: 8,
      bufferUsageMapRead: 1,
    });

    expect(control.ok).toBe(true);
    if (!control.ok) throw new Error('expected ready control');
    expect('readPresentedFrameRgbaBytes' in control).toBe(false);
    expect(copyOperations).toEqual([]);
  });

  it('does not expose WebGPU readback on video preview presenter controls', async () => {
    const control = await startSharedRendererPreviewPresenter({
      canvas: fakeCanvas(() => fakeContext()),
      session: videoSession,
      datasets: [{}],
      gpu: fakeGpu({
        format: 'bgra8unorm',
        onRequestAdapter: () => fakeAdapter(),
      }),
      textureUsageRenderAttachment: 16,
      bufferUsageCopyDst: 8,
      bufferUsageMapRead: 1,
    });

    expect(control.ok).toBe(true);
    if (!control.ok) throw new Error('expected ready control');
    expect('readPresentedFrameRgbaBytes' in control).toBe(false);
  });

  it('does not expose WebGPU readback on export-required presenter controls', async () => {
    const control = await startSharedRendererPreviewPresenter({
      canvas: fakeCanvas(() => fakeContext()),
      session: {
        ...okSession,
        surfaceGate: {
          ok: true,
          canvas: { width: 2, height: 2 },
          snapshot,
          media: [],
        },
      },
      datasets: [{}],
      requireSharedRendererOutput: true,
      gpu: fakeGpu({
        format: 'bgra8unorm',
        onRequestAdapter: () => fakeAdapter(),
      }),
      textureUsageRenderAttachment: 16,
      bufferUsageCopyDst: 8,
      bufferUsageMapRead: 1,
    });

    expect(control.ok).toBe(true);
    if (!control.ok) throw new Error('expected ready control');
    expect('readPresentedFrameRgbaBytes' in control).toBe(false);
    expect(typeof control.takePresentedFrameSharedFrame).toBe('function');
  });

  it('passes native/Rust frame handoff into the ready presenter control', async () => {
    const payload: RustBackendVideoEncodeWriteFramePayload = {
      sessionId: 'controller-handoff-session',
      frameIndex: 3,
      timestampUs: 50_000,
      slotCount: 1,
      frame: {
        descriptor: {
          memoryId: '/uxfd-export-source-controller-handoff-session',
          slotIndex: 0,
          generation: 4,
          byteOffset: 0,
          byteLen: 512,
          width: 2,
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
        ptsFrame: 3,
      },
    };
    const copyOperations: unknown[] = [];
    const handoffCalls: unknown[] = [];
    const device = fakeDevice({
      onCopyTextureToBuffer: (...args) => {
        copyOperations.push(args);
      },
    });

    const control = await startSharedRendererPreviewPresenter({
      canvas: fakeCanvas(() => fakeContext()),
      session: {
        ...okSession,
        surfaceGate: {
          ok: true,
          canvas: { width: 2, height: 2 },
          snapshot,
          media: [],
        },
      },
      datasets: [{}],
      gpu: fakeGpu({
        format: 'bgra8unorm',
        onRequestAdapter: () => fakeAdapter({ device }),
      }),
      textureUsageRenderAttachment: 16,
      textureUsageCopySrc: 1,
      bufferUsageCopyDst: 8,
      bufferUsageMapRead: 1,
      presentedFrameSharedFrameTaker: async (input) => {
        handoffCalls.push({
          encodeSessionId: input.encodeSessionId,
          memoryId: input.memoryId,
          frameIndex: input.frameIndex,
          timestampUs: input.timestampUs,
          width: input.width,
          height: input.height,
          fps: input.fps,
          format: input.format,
          texture: String(input.texture),
          deviceMatches: input.device === device,
        });
        return payload;
      },
    } as Parameters<typeof startSharedRendererPreviewPresenter>[0] & {
      presentedFrameSharedFrameTaker: unknown;
    });

    expect(control.ok).toBe(true);
    if (!control.ok) throw new Error('expected ready control');
    await expect(control.takePresentedFrameSharedFrame?.({
      encodeSessionId: 'controller-handoff-session',
      memoryId: '/uxfd-export-source-controller-handoff-session',
      frameIndex: 3,
      timestampUs: 50_000,
      width: 2,
      height: 2,
      fps: 60,
    })).resolves.toBe(payload);

    expect(copyOperations).toEqual([]);
    expect(handoffCalls).toEqual([{
      encodeSessionId: 'controller-handoff-session',
      memoryId: '/uxfd-export-source-controller-handoff-session',
      frameIndex: 3,
      timestampUs: 50_000,
      width: 2,
      height: 2,
      fps: 60,
      format: 'bgra8unorm',
      texture: 'current-texture',
      deviceMatches: true,
    }]);
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
      uxfdSharedRendererPresenterSwatch: 'no-presentation',
    });
  });

  it('blocks Pixi passthrough when a real shared renderer output is required', async () => {
    const dataset: Record<string, string | undefined> = {};
    const renderPasses: unknown[] = [];

    const control = await startSharedRendererPreviewPresenter({
      canvas: fakeCanvas(() => fakeContext()),
      session: okSession,
      datasets: [dataset],
      diagnosticSwatchEnabled: false,
      requireSharedRendererOutput: true,
      gpu: fakeGpu({
        format: 'bgra8unorm',
        onRequestAdapter: () => fakeAdapter({
          device: fakeDevice({
            onRenderPass: (descriptor) => {
              renderPasses.push(descriptor);
            },
          }),
        }),
      }),
      textureUsageRenderAttachment: 16,
    } as Parameters<typeof startSharedRendererPreviewPresenter>[0] & {
      requireSharedRendererOutput: true;
    });

    expect(control).toMatchObject({
      ok: false,
      reason: 'sharedRendererOutputUnavailable',
    });
    expect(renderPasses).toEqual([]);
    expect(dataset).toMatchObject({
      uxfdSharedRendererPresenterStatus: 'blocked',
      uxfdSharedRendererPresenterFailureReason: 'sharedRendererOutputUnavailable',
      uxfdSharedRendererPresenterSwatch: 'no-presentation',
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

  it('blocks SolidColour presentation failures when shared renderer output is required', async () => {
    const dataset: Record<string, string | undefined> = {};

    const control = await startSharedRendererPreviewPresenter({
      canvas: fakeCanvas(() => fakeContext()),
      session: solidShapeSession,
      datasets: [dataset],
      diagnosticSwatchEnabled: false,
      requireSharedRendererOutput: true,
      rustSolidColourVertexSceneBuilder: () => ({
        ok: true,
        rectCount: 1,
        vertices: new Float32Array([
          -0.5, 0.5, 1, 0, 0, 1,
          0.5, 0.5, 1, 0, 0, 1,
          -0.5, -0.5, 1, 0, 0, 1,
          -0.5, -0.5, 1, 0, 0, 1,
          0.5, 0.5, 1, 0, 0, 1,
          0.5, -0.5, 1, 0, 0, 1,
        ]),
      }),
      gpu: fakeGpu({
        format: 'bgra8unorm',
        onRequestAdapter: () => fakeAdapter({
          device: fakeDevice({
            exposeCreateRenderPipeline: false,
          }),
        }),
      }),
      textureUsageRenderAttachment: 16,
      bufferUsageVertex: 1,
      bufferUsageCopyDst: 2,
    });

    expect(control).toMatchObject({
      ok: false,
      reason: 'webGpuDrawUnavailable',
    });
    expect(dataset).toMatchObject({
      uxfdSharedRendererPresenterStatus: 'blocked',
      uxfdSharedRendererPresenterFailureReason: 'webGpuDrawUnavailable',
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

  it('keeps decoded video upload release semantics when writeTexture no-op benchmarking is enabled', async () => {
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
      sharedRendererWriteTextureNoOpEnabled: true,
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
    } as Parameters<typeof startSharedRendererPreviewPresenter>[0] & {
      sharedRendererWriteTextureNoOpEnabled: true;
    });

    expect(control).toMatchObject({
      ok: true,
      videoOwnership: {
        owner: 'sharedRenderer',
        reason: 'rustDecodedFrameUploadReady',
      },
    });
    expect(events).toEqual(['gpuUploadDone', 'release']);
    expect(dataset).toMatchObject({
      uxfdSharedRendererPresenterVideoFrameUploadReady: 'true',
      uxfdSharedRendererPresenterVideoOwner: 'sharedRenderer',
      uxfdSharedRendererPresenterVideoCutoverReason: 'rustDecodedFrameUploadReady',
    });
  });

  it('does not publish native render upload failure details when the Rust video frame path owns a video-only preview', async () => {
    const dataset: Record<string, string | undefined> = {};
    const rgbaBytes = new Uint8Array(decodedVideoDescriptor.byteLen);

    const control = await startSharedRendererPreviewPresenter({
      canvas: fakeCanvas(() => fakeContext()),
      session: videoSession,
      datasets: [dataset],
      diagnosticSwatchEnabled: false,
      rustVideoPlaneWasmEnabled: false,
      sharedRendererVideoCutoverEnabled: true,
      sharedRendererNativeRenderFailure: {
        reason: 'uploadFailed',
        detail: 'Shared video frame upload buffer checksum must match the copy report.',
      },
      sharedRendererDecodedVideoFrameUpload: {
        descriptor: decodedVideoDescriptor,
        ptsFrame: 90,
        rgbaBytes,
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
        onRequestAdapter: () => fakeAdapter(),
      }),
      textureUsageRenderAttachment: 16,
    });

    expect(control).toMatchObject({
      ok: true,
      videoOwnership: {
        owner: 'sharedRenderer',
        reason: 'rustDecodedFrameUploadReady',
      },
    });
    expect(dataset).toMatchObject({
      uxfdSharedRendererPresenterStatus: 'ready',
      uxfdSharedRendererPresenterVideoFrameUploadReady: 'true',
      uxfdSharedRendererPresenterVideoOwner: 'sharedRenderer',
      uxfdSharedRendererPresenterVideoCutoverReason: 'rustDecodedFrameUploadReady',
    });
    expect(dataset).not.toHaveProperty('uxfdSharedRendererPresenterNativeRenderFailureReason');
    expect(dataset).not.toHaveProperty('uxfdSharedRendererPresenterNativeRenderFailureDetail');
  });

  it('presents external video sources without using the Rust RGBA upload path', async () => {
    const dataset: Record<string, string | undefined> = {};
    const events: string[] = [];
    const externalVideoSource = { tagName: 'VIDEO' };

    const control = await startSharedRendererPreviewPresenter({
      canvas: fakeCanvas(() => fakeContext()),
      session: videoSession,
      datasets: [dataset],
      diagnosticSwatchEnabled: false,
      rustVideoPlaneWasmEnabled: false,
      sharedRendererVideoCutoverEnabled: true,
      sharedRendererExternalVideoSourcesByClipId: new Map([
        ['video-1', externalVideoSource],
      ]),
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
            onImportExternalTexture: (descriptor) => {
              events.push(`external:${(descriptor as { source: unknown }).source === externalVideoSource}`);
              return 'external-video-texture';
            },
            onWriteTexture: () => {
              events.push('writeTexture');
            },
            createRenderPipeline: (descriptor?: { label?: string }) => ({
              toString: () => descriptor?.label ?? 'solid-colour-pipeline',
              getBindGroupLayout: (index: number) => `bind-group-layout-${index}`,
            }),
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
    expect(events).toContain('external:true');
    expect(events).not.toContain('writeTexture');
    expect(dataset).toMatchObject({
      uxfdSharedRendererPresenterVideoFrameUploadReady: 'true',
      uxfdSharedRendererPresenterVideoOwner: 'sharedRenderer',
      uxfdSharedRendererPresenterVideoPresentationSource: 'external-video-source',
      uxfdSharedRendererPresenterVideoPresentedSourceFrame: '90',
    });
  });

  it('re-presents external video sources on an existing presenter for playback ticks', async () => {
    const dataset: Record<string, string | undefined> = {};
    const events: string[] = [];
    const externalVideoSource = { tagName: 'VIDEO' };
    const nextVideoSnapshot: RustSceneSnapshot = {
      ...videoSnapshot,
      frame_index: 24,
      clips: videoSnapshot.clips.map((clip) => ({
        ...clip,
        source_frame: 120,
      })),
    };
    const nextVideoSession: SharedRendererPreviewSession = {
      ...videoSession,
      plan: {
        mode: 'sharedRenderer',
        snapshot: nextVideoSnapshot,
        media: videoMedia,
      },
      surfaceGate: {
        ok: true,
        canvas: { width: 1920, height: 1080 },
        snapshot: nextVideoSnapshot,
        media: videoMedia,
      },
    };

    const control = await startSharedRendererPreviewPresenter({
      canvas: fakeCanvas(() => fakeContext()),
      session: videoSession,
      datasets: [dataset],
      diagnosticSwatchEnabled: false,
      rustVideoPlaneWasmEnabled: false,
      sharedRendererVideoCutoverEnabled: true,
      sharedRendererExternalVideoSourcesByClipId: new Map([
        ['video-1', externalVideoSource],
      ]),
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
            onImportExternalTexture: (descriptor) => {
              events.push(`external:${(descriptor as { source: unknown }).source === externalVideoSource}`);
              return 'external-video-texture';
            },
            onWriteTexture: () => {
              events.push('writeTexture');
            },
            createRenderPipeline: (descriptor?: { label?: string }) => ({
              toString: () => descriptor?.label ?? 'solid-colour-pipeline',
              getBindGroupLayout: (index: number) => `bind-group-layout-${index}`,
            }),
          }),
        }),
      }),
      textureUsageRenderAttachment: 16,
    });

    expect(control).toMatchObject({ ok: true });
    if (!control.ok) throw new Error('expected ready control');

    expect(control.presentExternalVideoFrameScene).toEqual(expect.any(Function));
    const presentation = control.presentExternalVideoFrameScene?.({
      session: nextVideoSession,
    });

    expect(presentation).toMatchObject({ ok: true });
    expect(events.filter((event) => event === 'external:true')).toHaveLength(2);
    expect(events).not.toContain('writeTexture');
    expect(dataset).toMatchObject({
      uxfdSharedRendererPresenterVideoPresentationSource: 'external-video-source',
      uxfdSharedRendererPresenterVideoPresentedSourceFrame: '120',
      uxfdSharedRendererPresenterVideoPresentedFrameIndex: '24',
    });
  });

  it('keeps the persistent ready status and only records a transient skip counter when a repaint tick has no presentable external video frame', async () => {
    const dataset: Record<string, string | undefined> = {};
    const externalVideoSource = { tagName: 'VIDEO' };

    const control = await startSharedRendererPreviewPresenter({
      canvas: fakeCanvas(() => fakeContext()),
      session: videoSession,
      datasets: [dataset],
      diagnosticSwatchEnabled: false,
      rustVideoPlaneWasmEnabled: false,
      sharedRendererVideoCutoverEnabled: true,
      sharedRendererExternalVideoSourcesByClipId: new Map([
        ['video-1', externalVideoSource],
      ]),
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
            onImportExternalTexture: () => 'external-video-texture',
          }),
        }),
      }),
      textureUsageRenderAttachment: 16,
    });

    expect(control).toMatchObject({ ok: true });
    if (!control.ok) throw new Error('expected ready control');
    expect(dataset.uxfdSharedRendererPresenterStatus).toBe('ready');

    // A mid-seek element momentarily has no source registered for its clip,
    // which is exactly what makes the presenter report videoTextureViewUnavailable.
    const presentation = control.presentExternalVideoFrameScene?.({
      session: videoSession,
      sourcesByClipId: new Map(),
    });

    expect(presentation).toMatchObject({ ok: false, reason: 'videoTextureViewUnavailable' });
    expect(isTransientExternalVideoPresentationFailure(presentation)).toBe(true);
    expect(dataset.uxfdSharedRendererPresenterStatus).toBe('ready');
    expect(dataset.uxfdSharedRendererPresenterFailureReason).toBeUndefined();
    expect(dataset.uxfdSharedRendererPresenterTransientSkips).toBe('1');
  });

  it('escalates repeated transient external video presentation skips to a persistent fallback status', async () => {
    const dataset: Record<string, string | undefined> = {};
    const externalVideoSource = { tagName: 'VIDEO' };

    const control = await startSharedRendererPreviewPresenter({
      canvas: fakeCanvas(() => fakeContext()),
      session: videoSession,
      datasets: [dataset],
      diagnosticSwatchEnabled: false,
      rustVideoPlaneWasmEnabled: false,
      sharedRendererVideoCutoverEnabled: true,
      sharedRendererExternalVideoSourcesByClipId: new Map([
        ['video-1', externalVideoSource],
      ]),
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
            onImportExternalTexture: () => 'external-video-texture',
          }),
        }),
      }),
      textureUsageRenderAttachment: 16,
    });

    expect(control).toMatchObject({ ok: true });
    if (!control.ok) throw new Error('expected ready control');

    let lastPresentation;
    for (let tick = 0; tick <= EXTERNAL_VIDEO_TRANSIENT_SKIP_ESCALATION_THRESHOLD; tick += 1) {
      lastPresentation = control.presentExternalVideoFrameScene?.({
        session: videoSession,
        sourcesByClipId: new Map(),
      });
    }

    expect(lastPresentation).toMatchObject({ ok: false, reason: 'videoTextureViewUnavailable' });
    expect(dataset.uxfdSharedRendererPresenterStatus).toBe('fallback');
    expect(dataset.uxfdSharedRendererPresenterFailureReason).toBe('videoTextureViewUnavailable');
  });

  it('does not claim multi-video ownership from a legacy single decoded upload without clip scope', async () => {
    const dataset: Record<string, string | undefined> = {};
    const events: string[] = [];
    const rgbaBytes = new Uint8Array(decodedVideoDescriptor.byteLen);

    const control = await startSharedRendererPreviewPresenter({
      canvas: fakeCanvas(() => fakeContext()),
      session: multiVideoSession,
      datasets: [dataset],
      diagnosticSwatchEnabled: false,
      rustVideoPlaneWasmEnabled: false,
      sharedRendererVideoCutoverEnabled: true,
      requireSharedRendererVideo: true,
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
      ok: false,
      reason: 'requiredVideoOwnershipUnavailable',
    });
    expect(events).toEqual([]);
    expect(dataset).toMatchObject({
      uxfdSharedRendererPresenterStatus: 'blocked',
      uxfdSharedRendererPresenterFailureReason: 'requiredVideoOwnershipUnavailable',
      uxfdSharedRendererPresenterVideoOwner: 'pixi',
      uxfdSharedRendererPresenterVideoCutoverReason: 'videoFrameUploadUnavailable',
      uxfdSharedRendererPresenterSharedVideoObjectCount: '0',
    });
  });

  it('publishes decoded Rust video GPU release failures instead of throwing out of the presenter', async () => {
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
          throw new Error('decoded slot GPU release failed');
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
      },
    });
    expect(events).toEqual(['writeTexture', 'gpuUploadDone']);
    expect(dataset).toMatchObject({
      uxfdSharedRendererPresenterVideoFrameUploadReady: 'true',
      uxfdSharedRendererPresenterVideoUploadFailureReason: 'videoUploadGpuReleaseFailed',
      uxfdSharedRendererPresenterVideoUploadFailureDetail: 'decoded slot GPU release failed',
      uxfdSharedRendererPresenterVideoUploadFailureClipId: 'video-1',
      uxfdSharedRendererPresenterVideoUploadFailureMediaId: 'video-1',
      uxfdSharedRendererPresenterVideoOwner: 'sharedRenderer',
    });
  });

  it('presents a native rendered shared frame directly to the preview canvas and releases it after the GPU fence', async () => {
    const dataset: Record<string, string | undefined> = {};
    const events: string[] = [];
    const renderPassOperations: string[] = [];
    const rgbaBytes = new Uint8Array(nativeRenderDescriptor.byteLen);

    const control = await startSharedRendererPreviewPresenter({
      canvas: fakeCanvas(() => fakeContext()),
      session: {
        ...okSession,
        surfaceGate: {
          ...okSession.surfaceGate,
          canvas: { width: 4, height: 4 },
        },
      },
      datasets: [dataset],
      diagnosticSwatchEnabled: false,
      sharedRendererNativeRenderFrameUpload: {
        descriptor: nativeRenderDescriptor,
        ptsFrame: 12,
        rgbaBytes,
        releaseAfterGpuUpload: async () => {
          events.push('release-native');
        },
      },
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
    } as any);

    expect(control).toMatchObject({
      ok: true,
      solidColourOwnership: {
        owner: 'pixi',
        reason: 'noSolidColourScene',
      },
      videoOwnership: {
        owner: 'pixi',
        reason: 'noVideoScene',
      },
    });
    expect(events).toEqual(['writeTexture', 'gpuUploadDone', 'release-native']);
    expect(renderPassOperations).toContain('setPipeline:native-render-frame-pipeline');
    expect(renderPassOperations).toContain('setBindGroup:0:video-frame-bind-group');
    expect(renderPassOperations).toContain('draw:6');
    expect(dataset).toMatchObject({
      uxfdSharedRendererPresenterNativeRenderFrameReady: 'true',
    });
  });

  it('re-presents a fresh native rendered frame on the existing presenter without restarting it', async () => {
    const dataset: Record<string, string | undefined> = {};
    const events: string[] = [];
    const session = {
      ...okSession,
      surfaceGate: {
        ...okSession.surfaceGate,
        canvas: { width: 4, height: 4 },
      },
    };

    const control = await startSharedRendererPreviewPresenter({
      canvas: fakeCanvas(() => fakeContext()),
      session,
      datasets: [dataset],
      diagnosticSwatchEnabled: false,
      sharedRendererNativeRenderFrameUpload: {
        descriptor: nativeRenderDescriptor,
        ptsFrame: 12,
        rgbaBytes: new Uint8Array(nativeRenderDescriptor.byteLen),
        releaseAfterGpuUpload: async () => {
          events.push('release-initial');
        },
      },
      gpu: fakeGpu({
        format: 'bgra8unorm',
        onRequestAdapter: () => fakeAdapter({
          device: fakeDevice({
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
    } as any);

    expect(control.ok).toBe(true);
    if (!control.ok) throw new Error('expected ok control');
    expect(typeof control.presentPreparedNativeRenderFrame).toBe('function');

    events.length = 0;
    const presentation = await control.presentPreparedNativeRenderFrame!({
      descriptor: nativeRenderDescriptor,
      ptsFrame: 13,
      rgbaBytes: new Uint8Array(nativeRenderDescriptor.byteLen),
      releaseAfterGpuUpload: async () => {
        events.push('release-reused');
      },
    } as any);

    expect(presentation.ok).toBe(true);
    // The fresh frame is uploaded, fenced and released on the SAME presenter
    // (no new adapter/device/pipeline creation).
    expect(events).toEqual(['writeTexture', 'gpuUploadDone', 'release-reused']);
  });

  it('republishes presenter diagnostics with the new frame after re-presenting a native rendered frame', async () => {
    // Regression: the rust-only playback reuse path (Viewport.tsx) calls
    // presentPreparedNativeRenderFrame on every tick instead of restarting the
    // presenter, precisely so the preview does not flicker. But the presenter
    // only ever wrote diagnostics once, at start-of-playback — so
    // VideoPresentedFrameIndex/VideoFrameUploadReady/VideoOwner froze at
    // whatever the very first frame looked like and never advanced, even
    // though every subsequent frame rendered and presented successfully.
    const dataset: Record<string, string | undefined> = {};
    const events: string[] = [];
    const initialSession = {
      ...videoSession,
      surfaceGate: {
        ...videoSession.surfaceGate,
        canvas: { width: 4, height: 4 },
      },
    };

    const control = await startSharedRendererPreviewPresenter({
      canvas: fakeCanvas(() => fakeContext()),
      session: initialSession,
      datasets: [dataset],
      diagnosticSwatchEnabled: false,
      sharedRendererVideoCutoverEnabled: true,
      sharedRendererNativeRenderFrameUpload: {
        descriptor: nativeRenderDescriptor,
        ptsFrame: 12,
        rgbaBytes: new Uint8Array(nativeRenderDescriptor.byteLen),
        releaseAfterGpuUpload: async () => {
          events.push('release-initial');
        },
      },
      gpu: fakeGpu({
        format: 'bgra8unorm',
        onRequestAdapter: () => fakeAdapter({
          device: fakeDevice({
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
    } as any);

    expect(control.ok).toBe(true);
    if (!control.ok) throw new Error('expected ok control');
    expect(dataset).toMatchObject({
      uxfdSharedRendererPresenterVideoPresentedFrameIndex: '12',
      uxfdSharedRendererPresenterVideoOwner: 'sharedRenderer',
      uxfdSharedRendererPresenterVideoCutoverReason: 'nativeRenderFrameReady',
    });

    events.length = 0;
    const nextSnapshot: RustSceneSnapshot = { ...videoSnapshot, frame_index: 999 };
    const nextSession: SharedRendererPreviewSession = {
      plan: {
        mode: 'sharedRenderer',
        snapshot: nextSnapshot,
        media: videoMedia,
      },
      surfaceGate: {
        ok: true,
        canvas: { width: 4, height: 4 },
        snapshot: nextSnapshot,
        media: videoMedia,
      },
      presentationContract: videoSession.presentationContract,
    };
    const presentation = await control.presentPreparedNativeRenderFrame!({
      descriptor: nativeRenderDescriptor,
      ptsFrame: 999,
      rgbaBytes: new Uint8Array(nativeRenderDescriptor.byteLen),
      releaseAfterGpuUpload: async () => {
        events.push('release-reused');
      },
    } as any, { session: nextSession });

    expect(presentation.ok).toBe(true);
    expect(dataset).toMatchObject({
      uxfdSharedRendererPresenterVideoPresentedFrameIndex: '999',
      uxfdSharedRendererPresenterVideoOwner: 'sharedRenderer',
      uxfdSharedRendererPresenterVideoCutoverReason: 'nativeRenderFrameReady',
    });
  });

  it('publishes native render GPU release failures instead of throwing out of the presenter', async () => {
    const dataset: Record<string, string | undefined> = {};
    const events: string[] = [];
    const rgbaBytes = new Uint8Array(nativeRenderDescriptor.byteLen);

    const control = await startSharedRendererPreviewPresenter({
      canvas: fakeCanvas(() => fakeContext()),
      session: {
        ...okSession,
        surfaceGate: {
          ...okSession.surfaceGate,
          canvas: { width: 4, height: 4 },
        },
      },
      datasets: [dataset],
      diagnosticSwatchEnabled: false,
      sharedRendererNativeRenderFrameUpload: {
        descriptor: nativeRenderDescriptor,
        ptsFrame: 12,
        rgbaBytes,
        releaseAfterGpuUpload: async () => {
          throw new Error('native render output GPU release failed');
        },
      },
      gpu: fakeGpu({
        format: 'bgra8unorm',
        onRequestAdapter: () => fakeAdapter({
          device: fakeDevice({
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
    } as any);

    expect(control).toMatchObject({
      ok: true,
    });
    expect(events).toEqual(['writeTexture', 'gpuUploadDone']);
    expect(dataset).toMatchObject({
      uxfdSharedRendererPresenterStatus: 'ready',
      uxfdSharedRendererPresenterNativeRenderFrameReady: 'true',
      uxfdSharedRendererPresenterNativeRenderFailureReason: 'nativeRenderOutputReleaseFailed',
      uxfdSharedRendererPresenterNativeRenderFailureDetail: 'native render output GPU release failed',
      uxfdSharedRendererPresenterNativeRenderFailureLabel: 'native render output release failed',
    });
  });

  it('publishes native render frame upload failure details while falling back to Pixi presentation', async () => {
    const dataset: Record<string, string | undefined> = {};
    const events: string[] = [];
    const rgbaBytes = new Uint8Array(nativeRenderDescriptor.byteLen);

    const control = await startSharedRendererPreviewPresenter({
      canvas: fakeCanvas(() => fakeContext()),
      session: {
        ...okSession,
        surfaceGate: {
          ...okSession.surfaceGate,
          canvas: { width: 4, height: 4 },
        },
      },
      datasets: [dataset],
      diagnosticSwatchEnabled: false,
      sharedRendererNativeRenderFrameUpload: {
        descriptor: nativeRenderDescriptor,
        ptsFrame: 12,
        rgbaBytes,
        releaseAfterGpuUpload: async () => {
          events.push('release-after-upload');
        },
        releaseAfterUploadAbort: async () => {
          events.push('release-abort');
        },
      },
      gpu: fakeGpu({
        format: 'bgra8unorm',
        onRequestAdapter: () => fakeAdapter({
          device: fakeDevice({
            exposeWriteTexture: false,
          }),
        }),
      }),
      textureUsageRenderAttachment: 16,
    } as any);

    expect(control).toMatchObject({
      ok: true,
    });
    expect(events).toEqual(['release-abort']);
    expect(dataset).toMatchObject({
      uxfdSharedRendererPresenterStatus: 'ready',
      uxfdSharedRendererPresenterNativeRenderFailureReason: 'webGpuUploadUnavailable',
      uxfdSharedRendererPresenterNativeRenderFailureDetail: 'WebGPU device does not expose the texture upload APIs needed for decoded video frames.',
    });
    expect(dataset).not.toHaveProperty('uxfdSharedRendererPresenterNativeRenderFrameReady');
  });

  it('keeps native render upload failure details when required shared renderer output is blocked', async () => {
    const dataset: Record<string, string | undefined> = {};
    const events: string[] = [];
    const rgbaBytes = new Uint8Array(nativeRenderDescriptor.byteLen);

    const control = await startSharedRendererPreviewPresenter({
      canvas: fakeCanvas(() => fakeContext()),
      session: {
        ...okSession,
        surfaceGate: {
          ...okSession.surfaceGate,
          canvas: { width: 4, height: 4 },
        },
      },
      datasets: [dataset],
      diagnosticSwatchEnabled: false,
      requireSharedRendererOutput: true,
      sharedRendererNativeRenderFrameUpload: {
        descriptor: nativeRenderDescriptor,
        ptsFrame: 12,
        rgbaBytes,
        releaseAfterGpuUpload: async () => {
          events.push('release-after-upload');
        },
        releaseAfterUploadAbort: async () => {
          events.push('release-abort');
        },
      },
      gpu: fakeGpu({
        format: 'bgra8unorm',
        onRequestAdapter: () => fakeAdapter({
          device: fakeDevice({
            exposeWriteTexture: false,
          }),
        }),
      }),
      textureUsageRenderAttachment: 16,
    } as any);

    expect(control).toMatchObject({
      ok: false,
      reason: 'sharedRendererOutputUnavailable',
    });
    expect(events).toEqual(['release-abort']);
    expect(dataset).toMatchObject({
      uxfdSharedRendererPresenterStatus: 'blocked',
      uxfdSharedRendererPresenterFailureReason: 'sharedRendererOutputUnavailable',
      uxfdSharedRendererPresenterNativeRenderFailureReason: 'webGpuUploadUnavailable',
      uxfdSharedRendererPresenterNativeRenderFailureDetail: 'WebGPU device does not expose the texture upload APIs needed for decoded video frames.',
    });
    expect(dataset).not.toHaveProperty('uxfdSharedRendererPresenterNativeRenderFrameReady');
  });

  it('blocks native render frame presentation failures when shared renderer output is required', async () => {
    const dataset: Record<string, string | undefined> = {};
    const events: string[] = [];
    const rgbaBytes = new Uint8Array(nativeRenderDescriptor.byteLen);

    const control = await startSharedRendererPreviewPresenter({
      canvas: fakeCanvas(() => fakeContext()),
      session: {
        ...okSession,
        surfaceGate: {
          ...okSession.surfaceGate,
          canvas: { width: 4, height: 4 },
        },
      },
      datasets: [dataset],
      diagnosticSwatchEnabled: false,
      requireSharedRendererOutput: true,
      sharedRendererNativeRenderFrameUpload: {
        descriptor: nativeRenderDescriptor,
        ptsFrame: 12,
        rgbaBytes,
        releaseAfterGpuUpload: async () => {
          events.push('release-after-upload');
        },
        releaseAfterUploadAbort: async () => {
          events.push('release-abort');
        },
      },
      gpu: fakeGpu({
        format: 'bgra8unorm',
        onRequestAdapter: () => fakeAdapter({
          device: fakeDevice({
            createTexture: () => 'native-render-texture-without-view',
            onWriteTexture: () => {
              events.push('writeTexture');
            },
          }),
        }),
      }),
      textureUsageRenderAttachment: 16,
    } as any);

    expect(control).toMatchObject({
      ok: false,
      reason: 'nativeRenderTextureViewUnavailable',
    });
    expect(events).toEqual(['writeTexture', 'release-abort']);
    expect(dataset).toMatchObject({
      uxfdSharedRendererPresenterStatus: 'blocked',
      uxfdSharedRendererPresenterFailureReason: 'nativeRenderTextureViewUnavailable',
    });
    expect(dataset).not.toHaveProperty('uxfdSharedRendererPresenterNativeRenderFrameReady');
  });

  it('publishes native render frame abort release failures instead of throwing out of the presenter', async () => {
    const dataset: Record<string, string | undefined> = {};
    const rgbaBytes = new Uint8Array(nativeRenderDescriptor.byteLen);

    const control = await startSharedRendererPreviewPresenter({
      canvas: fakeCanvas(() => fakeContext()),
      session: {
        ...okSession,
        surfaceGate: {
          ...okSession.surfaceGate,
          canvas: { width: 4, height: 4 },
        },
      },
      datasets: [dataset],
      diagnosticSwatchEnabled: false,
      sharedRendererNativeRenderFrameUpload: {
        descriptor: nativeRenderDescriptor,
        ptsFrame: 12,
        rgbaBytes,
        releaseAfterUploadAbort: async () => {
          throw new Error('native render output abort release failed');
        },
      },
      gpu: fakeGpu({
        format: 'bgra8unorm',
        onRequestAdapter: () => fakeAdapter({
          device: fakeDevice({
            exposeWriteTexture: false,
          }),
        }),
      }),
      textureUsageRenderAttachment: 16,
    } as any);

    expect(control).toMatchObject({
      ok: true,
    });
    expect(dataset).toMatchObject({
      uxfdSharedRendererPresenterStatus: 'ready',
      uxfdSharedRendererPresenterNativeRenderFailureReason: 'nativeRenderOutputReleaseFailed',
      uxfdSharedRendererPresenterNativeRenderFailureDetail: 'native render output abort release failed',
      uxfdSharedRendererPresenterNativeRenderFailureLabel: 'native render output release failed',
    });
    expect(dataset).not.toHaveProperty('uxfdSharedRendererPresenterNativeRenderFrameReady');
  });

  it('publishes video ownership when a native rendered preview frame already contains the composited video scene', async () => {
    const dataset: Record<string, string | undefined> = {};
    const rgbaBytes = new Uint8Array(nativeRenderDescriptor.byteLen);

    const control = await startSharedRendererPreviewPresenter({
      canvas: fakeCanvas(() => fakeContext()),
      session: videoSession,
      datasets: [dataset],
      diagnosticSwatchEnabled: false,
      rustVideoPlaneWasmEnabled: false,
      sharedRendererVideoCutoverEnabled: true,
      sharedRendererNativeRenderFrameUpload: {
        descriptor: nativeRenderDescriptor,
        ptsFrame: 12,
        rgbaBytes,
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
        onRequestAdapter: () => fakeAdapter(),
      }),
      textureUsageRenderAttachment: 16,
    });

    expect(control).toMatchObject({
      ok: true,
      videoOwnership: {
        owner: 'sharedRenderer',
        reason: 'nativeRenderFrameReady',
        videoObjectIds: ['video-1'],
      },
    });
    expect(dataset).toMatchObject({
      uxfdSharedRendererPresenterNativeRenderFrameReady: 'true',
      uxfdSharedRendererPresenterVideoOwner: 'sharedRenderer',
      uxfdSharedRendererPresenterVideoCutoverReason: 'nativeRenderFrameReady',
      uxfdSharedRendererPresenterSharedVideoObjectCount: '1',
    });
  });

  it('publishes solid colour ownership when a native rendered preview frame already contains the composited solid scene', async () => {
    const dataset: Record<string, string | undefined> = {};
    const rgbaBytes = new Uint8Array(nativeRenderDescriptor.byteLen);

    const control = await startSharedRendererPreviewPresenter({
      canvas: fakeCanvas(() => fakeContext()),
      session: solidShapeSession,
      datasets: [dataset],
      diagnosticSwatchEnabled: false,
      rustSolidColourWasmEnabled: false,
      sharedRendererSolidColourCutoverEnabled: true,
      sharedRendererNativeRenderFrameUpload: {
        descriptor: nativeRenderDescriptor,
        ptsFrame: 12,
        rgbaBytes,
      },
      gpu: fakeGpu({
        format: 'bgra8unorm',
        onRequestAdapter: () => fakeAdapter(),
      }),
      textureUsageRenderAttachment: 16,
    });

    expect(control).toMatchObject({
      ok: true,
      solidColourOwnership: {
        owner: 'sharedRenderer',
        reason: 'nativeRenderFrameReady',
        solidColourObjectIds: ['shape-1'],
      },
    });
    expect(dataset).toMatchObject({
      uxfdSharedRendererPresenterNativeRenderFrameReady: 'true',
      uxfdSharedRendererPresenterSolidColourOwner: 'sharedRenderer',
      uxfdSharedRendererPresenterSolidColourCutoverReason: 'nativeRenderFrameReady',
      uxfdSharedRendererPresenterSharedSolidColourObjectCount: '1',
    });
  });

  it('publishes generated gradient shape ownership when a native rendered preview frame already contains it', async () => {
    const dataset: Record<string, string | undefined> = {};
    const rgbaBytes = new Uint8Array(nativeRenderDescriptor.byteLen);

    const control = await startSharedRendererPreviewPresenter({
      canvas: fakeCanvas(() => fakeContext()),
      session: generatedGradientSession,
      datasets: [dataset],
      diagnosticSwatchEnabled: false,
      rustSolidColourWasmEnabled: false,
      sharedRendererSolidColourCutoverEnabled: true,
      sharedRendererNativeRenderFrameUpload: {
        descriptor: nativeRenderDescriptor,
        ptsFrame: 12,
        rgbaBytes,
      },
      gpu: fakeGpu({
        format: 'bgra8unorm',
        onRequestAdapter: () => fakeAdapter(),
      }),
      textureUsageRenderAttachment: 16,
    });

    expect(control).toMatchObject({
      ok: true,
      solidColourOwnership: {
        owner: 'sharedRenderer',
        reason: 'nativeRenderFrameReady',
        solidColourObjectIds: ['gradient-1'],
      },
    });
    expect(dataset).toMatchObject({
      uxfdSharedRendererPresenterNativeRenderFrameReady: 'true',
      uxfdSharedRendererPresenterSolidColourOwner: 'sharedRenderer',
      uxfdSharedRendererPresenterSolidColourCutoverReason: 'nativeRenderFrameReady',
      uxfdSharedRendererPresenterSharedSolidColourObjectCount: '1',
    });
  });

  it('publishes image ownership when a native rendered preview frame already contains the composited image scene', async () => {
    const dataset: Record<string, string | undefined> = {};
    const rgbaBytes = new Uint8Array(nativeRenderDescriptor.byteLen);

    const control = await startSharedRendererPreviewPresenter({
      canvas: fakeCanvas(() => fakeContext()),
      session: imageSession,
      datasets: [dataset],
      diagnosticSwatchEnabled: false,
      sharedRendererNativeRenderFrameUpload: {
        descriptor: nativeRenderDescriptor,
        ptsFrame: 12,
        rgbaBytes,
      },
      gpu: fakeGpu({
        format: 'bgra8unorm',
        onRequestAdapter: () => fakeAdapter(),
      }),
      textureUsageRenderAttachment: 16,
    });

    expect(control).toMatchObject({
      ok: true,
      imageOwnership: {
        owner: 'sharedRenderer',
        reason: 'nativeRenderFrameReady',
        imageObjectIds: ['image-1'],
      },
    });
    expect(dataset).toMatchObject({
      uxfdSharedRendererPresenterNativeRenderFrameReady: 'true',
      uxfdSharedRendererPresenterImageOwner: 'sharedRenderer',
      uxfdSharedRendererPresenterImageCutoverReason: 'nativeRenderFrameReady',
      uxfdSharedRendererPresenterSharedImageObjectCount: '1',
    });
  });

  it('publishes PSD ownership when a native rendered preview frame already contains the composited PSD scene', async () => {
    const dataset: Record<string, string | undefined> = {};
    const rgbaBytes = new Uint8Array(nativeRenderDescriptor.byteLen);

    const control = await startSharedRendererPreviewPresenter({
      canvas: fakeCanvas(() => fakeContext()),
      session: psdSession,
      datasets: [dataset],
      diagnosticSwatchEnabled: false,
      sharedRendererNativeRenderFrameUpload: {
        descriptor: nativeRenderDescriptor,
        ptsFrame: 12,
        rgbaBytes,
      },
      gpu: fakeGpu({
        format: 'bgra8unorm',
        onRequestAdapter: () => fakeAdapter(),
      }),
      textureUsageRenderAttachment: 16,
    } as any);

    expect(control).toMatchObject({
      ok: true,
      psdOwnership: {
        owner: 'sharedRenderer',
        reason: 'nativeRenderFrameReady',
        psdObjectIds: ['psd-1'],
      },
    });
    expect(dataset).toMatchObject({
      uxfdSharedRendererPresenterNativeRenderFrameReady: 'true',
      uxfdSharedRendererPresenterPsdOwner: 'sharedRenderer',
      uxfdSharedRendererPresenterPsdCutoverReason: 'nativeRenderFrameReady',
      uxfdSharedRendererPresenterSharedPsdObjectCount: '1',
    });
  });

  it('publishes text ownership when a native rendered preview frame already contains the composited text scene', async () => {
    const dataset: Record<string, string | undefined> = {};
    const rgbaBytes = new Uint8Array(nativeRenderDescriptor.byteLen);

    const control = await startSharedRendererPreviewPresenter({
      canvas: fakeCanvas(() => fakeContext()),
      session: textSession,
      datasets: [dataset],
      diagnosticSwatchEnabled: false,
      sharedRendererNativeRenderFrameUpload: {
        descriptor: nativeRenderDescriptor,
        ptsFrame: 12,
        rgbaBytes,
      },
      gpu: fakeGpu({
        format: 'bgra8unorm',
        onRequestAdapter: () => fakeAdapter(),
      }),
      textureUsageRenderAttachment: 16,
    } as any);

    expect(control).toMatchObject({
      ok: true,
      textOwnership: {
        owner: 'sharedRenderer',
        reason: 'nativeRenderFrameReady',
        textObjectIds: ['text-1'],
      },
    });
    expect(dataset).toMatchObject({
      uxfdSharedRendererPresenterNativeRenderFrameReady: 'true',
      uxfdSharedRendererPresenterTextOwner: 'sharedRenderer',
      uxfdSharedRendererPresenterTextCutoverReason: 'nativeRenderFrameReady',
      uxfdSharedRendererPresenterSharedTextObjectCount: '1',
    });
  });

  it('blocks required shared renderer output when image ownership remains in Pixi', async () => {
    const dataset: Record<string, string | undefined> = {};

    const control = await startSharedRendererPreviewPresenter({
      canvas: fakeCanvas(() => fakeContext()),
      session: imageSession,
      datasets: [dataset],
      requireSharedRendererOutput: true,
      gpu: fakeGpu({
        format: 'bgra8unorm',
        onRequestAdapter: () => fakeAdapter(),
      }),
    });

    expect(control).toMatchObject({
      ok: false,
      reason: 'sharedRendererOutputUnavailable',
    });
    expect(dataset).toMatchObject({
      uxfdSharedRendererPresenterStatus: 'blocked',
      uxfdSharedRendererPresenterFailureReason: 'sharedRendererOutputUnavailable',
      uxfdSharedRendererPresenterImageOwner: 'pixi',
      uxfdSharedRendererPresenterImageCutoverReason: 'nativeRenderFrameUnavailable',
      uxfdSharedRendererPresenterSharedImageObjectCount: '0',
    });
    expect(dataset).not.toHaveProperty('uxfdSharedRendererPresenterSwatch');
  });

  it('blocks required shared renderer output when PSD ownership remains in Pixi', async () => {
    const dataset: Record<string, string | undefined> = {};

    const control = await startSharedRendererPreviewPresenter({
      canvas: fakeCanvas(() => fakeContext()),
      session: psdSession,
      datasets: [dataset],
      requireSharedRendererOutput: true,
      gpu: fakeGpu({
        format: 'bgra8unorm',
        onRequestAdapter: () => fakeAdapter(),
      }),
    } as any);

    expect(control).toMatchObject({
      ok: false,
      reason: 'sharedRendererOutputUnavailable',
    });
    expect(dataset).toMatchObject({
      uxfdSharedRendererPresenterStatus: 'blocked',
      uxfdSharedRendererPresenterFailureReason: 'sharedRendererOutputUnavailable',
      uxfdSharedRendererPresenterPsdOwner: 'pixi',
      uxfdSharedRendererPresenterPsdCutoverReason: 'nativeRenderFrameUnavailable',
      uxfdSharedRendererPresenterSharedPsdObjectCount: '0',
    });
    expect(dataset).not.toHaveProperty('uxfdSharedRendererPresenterSwatch');
  });

  it('records native render diagnostics when video and PSD share the preview render pass', async () => {
    const dataset: Record<string, string | undefined> = {};
    const rgbaBytes = new Uint8Array(nativeRenderDescriptor.byteLen);

    const control = await startSharedRendererPreviewPresenter({
      canvas: fakeCanvas(() => fakeContext()),
      session: videoPsdSession,
      datasets: [dataset],
      diagnosticSwatchEnabled: false,
      rustVideoPlaneWasmEnabled: false,
      sharedRendererVideoCutoverEnabled: true,
      sharedRendererNativeRenderFrameUpload: {
        descriptor: nativeRenderDescriptor,
        ptsFrame: 12,
        rgbaBytes,
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
        onRequestAdapter: () => fakeAdapter(),
      }),
      textureUsageRenderAttachment: 16,
    });

    expect(control).toMatchObject({
      ok: true,
      videoOwnership: {
        owner: 'sharedRenderer',
        reason: 'nativeRenderFrameReady',
        videoObjectIds: ['video-1'],
      },
      psdOwnership: {
        owner: 'sharedRenderer',
        reason: 'nativeRenderFrameReady',
        psdObjectIds: ['psd-1'],
      },
    });
    expect(dataset).toMatchObject({
      uxfdSharedRendererPresenterNativeRenderFrameReady: 'true',
      uxfdSharedRendererPresenterNativeRenderMediaCount: '2',
      uxfdSharedRendererPresenterNativeRenderMediaKinds: 'Video,Psd',
      uxfdSharedRendererPresenterNativeRenderSourceCount: '1',
      uxfdSharedRendererPresenterNativeRenderSourceMediaIds: 'video-1',
      uxfdSharedRendererPresenterVideoOwner: 'sharedRenderer',
      uxfdSharedRendererPresenterPsdOwner: 'sharedRenderer',
    });
  });

  it('records native render diagnostics when video and generated gradient share the preview render pass', async () => {
    const dataset: Record<string, string | undefined> = {};
    const rgbaBytes = new Uint8Array(nativeRenderDescriptor.byteLen);

    const control = await startSharedRendererPreviewPresenter({
      canvas: fakeCanvas(() => fakeContext()),
      session: videoGeneratedGradientSession,
      datasets: [dataset],
      diagnosticSwatchEnabled: false,
      rustSolidColourWasmEnabled: false,
      rustVideoPlaneWasmEnabled: false,
      sharedRendererSolidColourCutoverEnabled: true,
      sharedRendererVideoCutoverEnabled: true,
      sharedRendererNativeRenderFrameUpload: {
        descriptor: nativeRenderDescriptor,
        ptsFrame: 12,
        rgbaBytes,
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
        onRequestAdapter: () => fakeAdapter(),
      }),
      textureUsageRenderAttachment: 16,
    });

    expect(control).toMatchObject({
      ok: true,
      videoOwnership: {
        owner: 'sharedRenderer',
        reason: 'nativeRenderFrameReady',
        videoObjectIds: ['video-1'],
      },
      solidColourOwnership: {
        owner: 'sharedRenderer',
        reason: 'nativeRenderFrameReady',
        solidColourObjectIds: ['gradient-1'],
      },
    });
    expect(dataset).toMatchObject({
      uxfdSharedRendererPresenterNativeRenderFrameReady: 'true',
      uxfdSharedRendererPresenterNativeRenderMediaCount: '2',
      uxfdSharedRendererPresenterNativeRenderMediaKinds: 'Video,GeneratedGradient',
      uxfdSharedRendererPresenterNativeRenderSourceCount: '1',
      uxfdSharedRendererPresenterNativeRenderSourceMediaIds: 'video-1',
      uxfdSharedRendererPresenterVideoOwner: 'sharedRenderer',
      uxfdSharedRendererPresenterSolidColourOwner: 'sharedRenderer',
      uxfdSharedRendererPresenterSolidColourCutoverReason: 'nativeRenderFrameReady',
      uxfdSharedRendererPresenterSharedSolidColourObjectCount: '1',
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
      uxfdSharedRendererPresenterVideoUploadFailureReason: 'videoUploadMissingClip',
      uxfdSharedRendererPresenterVideoUploadFailureDetail: 'Rust decoded upload is missing for video clips: video-2',
      uxfdSharedRendererPresenterVideoUploadMissingClipIds: 'video-2',
      uxfdSharedRendererPresenterVideoOwner: 'sharedRenderer',
      uxfdSharedRendererPresenterSharedVideoObjectCount: '1',
    });
  });

  it('blocks video frame presentation failures when shared renderer output is required', async () => {
    const dataset: Record<string, string | undefined> = {};
    const events: string[] = [];
    const rgbaBytes = new Uint8Array(decodedVideoDescriptor.byteLen);

    const control = await startSharedRendererPreviewPresenter({
      canvas: fakeCanvas(() => fakeContext()),
      session: videoSession,
      datasets: [dataset],
      diagnosticSwatchEnabled: false,
      requireSharedRendererOutput: true,
      rustVideoPlaneWasmEnabled: false,
      sharedRendererVideoCutoverEnabled: true,
      sharedRendererDecodedVideoFrameUpload: {
        descriptor: decodedVideoDescriptor,
        ptsFrame: 90,
        rgbaBytes,
        releaseAfterGpuUpload: async () => {
          events.push('release-after-upload');
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
            exposeCreateSampler: false,
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
    } as any);

    expect(control).toMatchObject({
      ok: false,
      reason: 'webGpuDrawUnavailable',
    });
    expect(events).toEqual(['writeTexture', 'gpuUploadDone', 'release-after-upload']);
    expect(dataset).toMatchObject({
      uxfdSharedRendererPresenterStatus: 'blocked',
      uxfdSharedRendererPresenterFailureReason: 'webGpuDrawUnavailable',
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
      uxfdSharedRendererPresenterVideoUploadFailureReason: 'webGpuUploadUnavailable',
      uxfdSharedRendererPresenterVideoUploadFailureDetail: 'WebGPU device does not expose the texture upload APIs needed for decoded video frames.',
      uxfdSharedRendererPresenterVideoUploadFailureClipId: 'video-1',
      uxfdSharedRendererPresenterVideoUploadFailureMediaId: 'video-1',
      uxfdSharedRendererPresenterVideoOwner: 'pixi',
      uxfdSharedRendererPresenterVideoCutoverReason: 'videoFrameUploadUnavailable',
    });
  });

  it('keeps a superseded decoded-video-upload failure out of the persistent ready diagnostics when the external video source path presents instead', async () => {
    const dataset: Record<string, string | undefined> = {};
    const events: string[] = [];
    const rgbaBytes = new Uint8Array(decodedVideoDescriptor.byteLen);
    const externalVideoSource = { tagName: 'VIDEO' };

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
        releaseAfterUploadAbort: async () => {
          events.push('release-abort');
        },
      },
      sharedRendererExternalVideoSourcesByClipId: new Map([
        ['video-1', externalVideoSource],
      ]),
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
            onImportExternalTexture: () => 'external-video-texture',
          }),
        }),
      }),
      textureUsageRenderAttachment: 16,
    });

    // The decoded upload fails (no writeTexture), but the external video
    // source path still owns and presents the clip, so the upload failure is
    // a superseded event, not a persistent problem with what is on screen.
    expect(control).toMatchObject({
      ok: true,
      videoOwnership: { owner: 'sharedRenderer' },
    });
    expect(events).toEqual(['release-abort']);
    expect(dataset.uxfdSharedRendererPresenterStatus).toBe('ready');
    expect(dataset.uxfdSharedRendererPresenterVideoPresentationSource).toBe('external-video-source');
    expect(dataset.uxfdSharedRendererPresenterVideoUploadFailureReason).toBeUndefined();
    expect(dataset.uxfdSharedRendererPresenterVideoUploadFailureDetail).toBeUndefined();
  });

  it('publishes decoded Rust video abort release failures instead of throwing out of the presenter', async () => {
    const dataset: Record<string, string | undefined> = {};
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
        releaseAfterUploadAbort: async () => {
          throw new Error('decoded slot abort release failed');
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
    expect(dataset).toMatchObject({
      uxfdSharedRendererPresenterVideoUploadFailureReason: 'videoUploadAbortReleaseFailed',
      uxfdSharedRendererPresenterVideoUploadFailureDetail: 'decoded slot abort release failed',
      uxfdSharedRendererPresenterVideoUploadFailureClipId: 'video-1',
      uxfdSharedRendererPresenterVideoUploadFailureMediaId: 'video-1',
    });
  });

  it('fails loud when Rust video is required but the shared renderer cannot own the video', async () => {
    const dataset: Record<string, string | undefined> = {};

    const control = await startSharedRendererPreviewPresenter({
      canvas: fakeCanvas(() => fakeContext()),
      session: videoSession,
      datasets: [dataset],
      diagnosticSwatchEnabled: false,
      rustVideoPlaneWasmEnabled: false,
      sharedRendererVideoCutoverEnabled: true,
      requireSharedRendererVideo: true,
      sharedRendererVideoFrameUploadReady: false,
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
      ok: false,
      reason: 'requiredVideoOwnershipUnavailable',
    });
    expect(dataset).toMatchObject({
      uxfdSharedRendererPresenterStatus: 'blocked',
      uxfdSharedRendererPresenterFailureReason: 'requiredVideoOwnershipUnavailable',
      uxfdSharedRendererPresenterVideoOwner: 'pixi',
      uxfdSharedRendererPresenterVideoCutoverReason: 'videoFrameUploadUnavailable',
      uxfdSharedRendererPresenterSharedVideoObjectCount: '0',
    });
  });

  it('fails loud when Rust video-only mode cannot load the Rust video control plane', async () => {
    const dataset: Record<string, string | undefined> = {};

    const control = await startSharedRendererPreviewPresenter({
      canvas: fakeCanvas(() => fakeContext()),
      session: videoSession,
      datasets: [dataset],
      diagnosticSwatchEnabled: false,
      rustVideoPlaneWasmEnabled: false,
      rustVideoFrameDecodeRequestWasmEnabled: false,
      sharedRendererVideoCutoverEnabled: true,
      requireSharedRendererVideo: true,
      requireRustVideoControlPlane: true,
      sharedRendererVideoFrameUploadReady: true,
      gpu: fakeGpu({
        format: 'bgra8unorm',
        onRequestAdapter: () => fakeAdapter(),
      }),
      textureUsageRenderAttachment: 16,
    });

    expect(control).toMatchObject({
      ok: false,
      reason: 'requiredRustVideoControlPlaneUnavailable',
    });
    expect(dataset).toMatchObject({
      uxfdSharedRendererPresenterStatus: 'blocked',
      uxfdSharedRendererPresenterFailureReason: 'requiredRustVideoControlPlaneUnavailable',
    });
    expect(dataset).not.toMatchObject({
      uxfdSharedRendererPresenterVideoGeometrySource: 'typescript',
      uxfdSharedRendererPresenterVideoDecodeRequestSource: 'typescript',
    });
  });

  it('keeps native render failure details when required Rust video ownership fails loud', async () => {
    const dataset: Record<string, string | undefined> = {};

    const control = await startSharedRendererPreviewPresenter({
      canvas: fakeCanvas(() => fakeContext()),
      session: videoSession,
      datasets: [dataset],
      diagnosticSwatchEnabled: false,
      rustVideoPlaneWasmEnabled: false,
      sharedRendererVideoCutoverEnabled: true,
      requireSharedRendererVideo: true,
      sharedRendererVideoFrameUploadReady: false,
      sharedRendererNativeRenderFailure: {
        reason: 'nativeRenderFailed',
        detail: 'Rust backend rejected unsupported PSD media',
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
        onRequestAdapter: () => fakeAdapter(),
      }),
      textureUsageRenderAttachment: 16,
    });

    expect(control).toMatchObject({
      ok: false,
      reason: 'requiredVideoOwnershipUnavailable',
    });
    expect(dataset).toMatchObject({
      uxfdSharedRendererPresenterStatus: 'blocked',
      uxfdSharedRendererPresenterFailureReason: 'requiredVideoOwnershipUnavailable',
      uxfdSharedRendererPresenterNativeRenderFailureReason: 'nativeRenderFailed',
      uxfdSharedRendererPresenterNativeRenderFailureDetail: 'Rust backend rejected unsupported PSD media',
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
          detail: 'Shared renderer surface requires a sharedRenderer plan.',
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
    toString: () => 'current-texture',
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
  onCopyTextureToBuffer = () => undefined,
  onSubmittedWorkDone = async () => undefined,
  onSubmit = () => undefined,
  onImportExternalTexture = () => 'external-video-texture',
  createRenderPipeline,
  createTexture,
  exposeWriteTexture = true,
  exposeCreateRenderPipeline = true,
  exposeCreateSampler = true,
  exposeCreateBindGroup = true,
  readbackBytes = new Uint8Array(),
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
  onCopyTextureToBuffer?: (
    source: unknown,
    destination: unknown,
    size: unknown
  ) => void;
  onSubmittedWorkDone?: () => Promise<void>;
  onSubmit?: (commandBuffers: unknown[]) => void;
  onImportExternalTexture?: (descriptor: unknown) => unknown;
  createRenderPipeline?: (descriptor?: { label?: string }) => unknown;
  createTexture?: () => unknown;
  exposeWriteTexture?: boolean;
  exposeCreateRenderPipeline?: boolean;
  exposeCreateSampler?: boolean;
  exposeCreateBindGroup?: boolean;
  readbackBytes?: Uint8Array;
  lost?: Promise<unknown>;
} = {}) => ({
  lost,
  queue: {
    submit: onSubmit,
    writeBuffer: onWriteBuffer,
    ...(exposeWriteTexture ? { writeTexture: onWriteTexture } : {}),
    onSubmittedWorkDone,
  },
  createTexture: createTexture ?? (() => ({
    createView: () => 'video-frame-texture-view',
  })),
  importExternalTexture: (descriptor: unknown) => onImportExternalTexture(descriptor),
  createShaderModule: () => 'solid-colour-shader-module',
  ...(exposeCreateRenderPipeline ? {
    createRenderPipeline: createRenderPipeline ?? ((descriptor?: { label?: string }) => ({
      toString: () => descriptor?.label ?? 'solid-colour-pipeline',
      getBindGroupLayout: (index: number) => `bind-group-layout-${index}`,
    })),
  } : {}),
  ...(exposeCreateSampler ? { createSampler: () => 'video-frame-sampler' } : {}),
  ...(exposeCreateBindGroup ? { createBindGroup: () => 'video-frame-bind-group' } : {}),
  createBuffer: (descriptor?: { label?: string }) => {
    if (descriptor?.label === 'shared-renderer-presented-frame-readback') {
      return {
        toString: () => 'readback-buffer',
        mapAsync: async () => undefined,
        getMappedRange: () => readbackBytes.buffer.slice(
          readbackBytes.byteOffset,
          readbackBytes.byteOffset + readbackBytes.byteLength
        ),
        unmap: () => undefined,
        destroy: () => undefined,
      };
    }
    return 'solid-colour-vertex-buffer';
  },
  createCommandEncoder: () => ({
    copyTextureToBuffer: (source: unknown, destination: unknown, size: unknown) => {
      const normalisedSource = typeof source === 'object'
        && source !== null
        && 'texture' in source
        ? { texture: String(source.texture) }
        : source;
      const normalisedDestination = typeof destination === 'object'
        && destination !== null
        && 'buffer' in destination
        ? {
          ...destination,
          buffer: String(destination.buffer),
        }
        : destination;
      onCopyTextureToBuffer(normalisedSource, normalisedDestination, size);
    },
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
