import { describe, expect, it } from 'vitest';
import {
  createSharedRendererWebGpuPresenter,
  type SharedRendererWebGpuAdapterLike,
  type SharedRendererWebGpuLike,
} from './sharedRendererWebGpuPresenter';
import { buildSharedRendererPresentationContract } from './sharedRendererPresentationContract';
import type { RustBackendVideoFrameDescriptor } from './rustBackendVideoDecodeControl';
import type { RustBackendVideoEncodeWriteFramePayload } from './rustBackendVideoEncodeControl';
import type { RustSceneMediaReference, RustSceneSnapshot } from './rustSceneSnapshot';
import type { SharedRendererPreviewSurfaceGate } from './sharedRendererPreviewSurface';

const snapshot: RustSceneSnapshot = {
  frame_index: 12,
  colour: {
    profile: 'rec709-sdr',
    working_space: 'linear-light',
    alpha: 'premultiplied',
  },
  clips: [],
};

const okSurfaceGate: SharedRendererPreviewSurfaceGate = {
  ok: true,
  canvas: { width: 1920, height: 1080 },
  snapshot,
  media: [],
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
      opacity: 0.5,
      effects: [],
    },
  ],
};

const solidShapeMedia: RustSceneMediaReference[] = [
  {
    id: 'shape-1',
    kind: 'SolidColour',
    source: '#ff0000',
    width: 200,
    height: 100,
  },
];

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

const multiVideoSnapshot: RustSceneSnapshot = {
  ...snapshot,
  clips: [
    {
      clip_id: 'video-back',
      track_id: 'layer-0',
      media_id: 'video-back',
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
    {
      clip_id: 'video-front',
      track_id: 'layer-1',
      media_id: 'video-front',
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
  {
    id: 'video-back',
    kind: 'Video',
    source: '/tmp/back.mp4',
    width: 1280,
    height: 720,
  },
  {
    id: 'video-front',
    kind: 'Video',
    source: '/tmp/front.mp4',
    width: 640,
    height: 360,
  },
];

const decodedVideoDescriptor: RustBackendVideoFrameDescriptor = {
  memoryId: '/uxfd-test-video-ring',
  slotIndex: 1,
  generation: 7,
  byteOffset: 512,
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

describe('createSharedRendererWebGpuPresenter', () => {
  it('does not touch WebGPU when the surface gate is blocked', async () => {
    const calls: string[] = [];
    const result = await createSharedRendererWebGpuPresenter({
      canvas: fakeCanvas(() => {
        calls.push('getContext');
        return null;
      }),
      surfaceGate: {
        ok: false,
        reason: 'fallbackAdapter',
        detail: 'Shared renderer preview requires a non-fallback WebGPU adapter.',
      },
      presentationContract: buildSharedRendererPresentationContract(),
      gpu: fakeGpu({
        onRequestAdapter: () => {
          calls.push('requestAdapter');
          return fakeAdapter();
        },
      }),
      textureUsageRenderAttachment: 16,
    });

    expect(result).toEqual({
      ok: false,
      reason: 'surfaceGateBlocked',
      detail: 'Shared renderer preview requires a non-fallback WebGPU adapter.',
      surfaceGateReason: 'fallbackAdapter',
    });
    expect(calls).toEqual([]);
  });

  it('configures the canvas with the presentation contract and project backing size', async () => {
    const configurations: unknown[] = [];
    const context = fakeContext((configuration) => {
      configurations.push(configuration);
    });
    const adapter = fakeAdapter();
    const gpu = fakeGpu({
      format: 'bgra8unorm',
      onRequestAdapter: () => adapter,
    });
    const result = await createSharedRendererWebGpuPresenter({
      canvas: fakeCanvas(() => context),
      surfaceGate: okSurfaceGate,
      presentationContract: buildSharedRendererPresentationContract(),
      gpu,
      textureUsageRenderAttachment: 16,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected presenter creation to pass');
    expect(result.format).toBe('bgra8unorm');
    expect(result.canvasSize).toEqual({ width: 1920, height: 1080 });
    expect(configurations).toEqual([
      {
        device: adapter.device,
        format: 'bgra8unorm',
        usage: 17,
        colorSpace: 'srgb',
        alphaMode: 'premultiplied',
      },
    ]);
  });

  it('reads the last presented frame through a WebGPU copy buffer with aligned row pitch', async () => {
    const copyOperations: unknown[] = [];
    const bufferDescriptors: unknown[] = [];
    const bufferBytes = Uint8Array.from([
      1, 2, 3, 4, 5, 6, 7, 8,
      ...Array.from({ length: 248 }, () => 0),
      9, 10, 11, 12, 13, 14, 15, 16,
      ...Array.from({ length: 248 }, () => 0),
    ]);
    const device = fakeDevice({
      onCreateBuffer: (descriptor) => {
        bufferDescriptors.push(descriptor);
      },
      onCopyTextureToBuffer: (...args) => {
        copyOperations.push(args);
      },
      readbackBytes: bufferBytes,
    });

    const result = await createSharedRendererWebGpuPresenter({
      canvas: fakeCanvas(() => fakeContext()),
      surfaceGate: {
        ...okSurfaceGate,
        canvas: { width: 2, height: 2 },
      },
      presentationContract: buildSharedRendererPresentationContract(),
      gpu: fakeGpu({
        onRequestAdapter: () => fakeAdapter({ device }),
      }),
      textureUsageRenderAttachment: 16,
      textureUsageCopySrc: 1,
      bufferUsageCopyDst: 8,
      bufferUsageMapRead: 1,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected presenter creation to pass');

    result.presentSolidSrgbSwatch({
      red: 0,
      green: 0,
      blue: 0,
      alpha: 1,
    });

    await expect(result.readPresentedFrameRgbaBytes({
      width: 2,
      height: 2,
    })).resolves.toEqual({
      rgbaBytes: bufferBytes,
      strideBytes: 256,
      byteLen: 512,
      width: 2,
      height: 2,
    });
    expect(bufferDescriptors).toContainEqual({
      label: 'shared-renderer-presented-frame-readback',
      size: 512,
      usage: 9,
    });
    expect(copyOperations).toEqual([
      [
        { texture: 'current-texture' },
        { buffer: 'readback-buffer', bytesPerRow: 256, rowsPerImage: 2 },
        { width: 2, height: 2, depthOrArrayLayers: 1 },
      ],
    ]);
  });

  it('requires a native presented-frame handoff instead of falling back to WebGPU readback writing', async () => {
    const copyOperations: unknown[] = [];
    const writerCalls: unknown[] = [];
    const result = await createSharedRendererWebGpuPresenter({
      canvas: fakeCanvas(() => fakeContext()),
      surfaceGate: {
        ...okSurfaceGate,
        canvas: { width: 2, height: 2 },
      },
      presentationContract: buildSharedRendererPresentationContract(),
      gpu: fakeGpu({
        onRequestAdapter: () => fakeAdapter({
          device: fakeDevice({
            onCopyTextureToBuffer: (...args) => {
              copyOperations.push(args);
            },
          }),
        }),
      }),
      textureUsageRenderAttachment: 16,
      textureUsageCopySrc: 1,
      bufferUsageCopyDst: 8,
      bufferUsageMapRead: 1,
      createEncodeFrameWriter: async () => {
        writerCalls.push(['createEncodeFrameWriter']);
        throw new Error('JS shared-frame writer must not run for presented-frame handoff.');
      },
    } as Parameters<typeof createSharedRendererWebGpuPresenter>[0] & {
      createEncodeFrameWriter: unknown;
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected presenter creation to pass');

    result.presentSolidSrgbSwatch({
      red: 0,
      green: 0,
      blue: 0,
      alpha: 1,
    });

    await expect(result.takePresentedFrameSharedFrame({
      encodeSessionId: 'presenter-direct-session',
      memoryId: '/uxfd-export-source-presenter-direct-session',
      frameIndex: 4,
      timestampUs: 66_667,
      width: 2,
      height: 2,
      fps: 60,
    })).rejects.toThrow('Native presented-frame handoff is required for shared-frame export encoding.');

    await result.dispose();

    expect(copyOperations).toEqual([]);
    expect(writerCalls).toEqual([]);
  });

  it('uses a native presented-frame handoff without WebGPU readback and JS shared-frame writing', async () => {
    const payload: RustBackendVideoEncodeWriteFramePayload = {
      sessionId: 'native-handoff-session',
      frameIndex: 7,
      timestampUs: 116_667,
      slotCount: 1,
      frame: {
        descriptor: {
          memoryId: '/uxfd-export-source-native-handoff-session',
          slotIndex: 0,
          generation: 8,
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
        ptsFrame: 7,
      },
    };
    const copyOperations: unknown[] = [];
    const handoffCalls: unknown[] = [];
    const device = fakeDevice({
      onCopyTextureToBuffer: (...args) => {
        copyOperations.push(args);
      },
    });
    const result = await createSharedRendererWebGpuPresenter({
      canvas: fakeCanvas(() => fakeContext()),
      surfaceGate: {
        ...okSurfaceGate,
        canvas: { width: 2, height: 2 },
      },
      presentationContract: buildSharedRendererPresentationContract(),
      gpu: fakeGpu({
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
      createEncodeFrameWriter: async () => {
        throw new Error('JS shared-frame writer must not run when native handoff returns a payload.');
      },
    } as Parameters<typeof createSharedRendererWebGpuPresenter>[0] & {
      presentedFrameSharedFrameTaker: unknown;
      createEncodeFrameWriter: unknown;
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected presenter creation to pass');

    result.presentSolidSrgbSwatch({
      red: 0,
      green: 0,
      blue: 0,
      alpha: 1,
    });

    await expect(result.takePresentedFrameSharedFrame({
      encodeSessionId: 'native-handoff-session',
      memoryId: '/uxfd-export-source-native-handoff-session',
      frameIndex: 7,
      timestampUs: 116_667,
      width: 2,
      height: 2,
      fps: 60,
    })).resolves.toBe(payload);

    expect(copyOperations).toEqual([]);
    expect(handoffCalls).toEqual([{
      encodeSessionId: 'native-handoff-session',
      memoryId: '/uxfd-export-source-native-handoff-session',
      frameIndex: 7,
      timestampUs: 116_667,
      width: 2,
      height: 2,
      fps: 60,
      format: 'rgba8unorm',
      texture: 'current-texture',
      deviceMatches: true,
    }]);
  });

  it('rejects srgb canvas formats because the renderer owns the sRGB encode step', async () => {
    const configurations: unknown[] = [];
    const result = await createSharedRendererWebGpuPresenter({
      canvas: fakeCanvas(() => fakeContext((configuration) => {
        configurations.push(configuration);
      })),
      surfaceGate: okSurfaceGate,
      presentationContract: buildSharedRendererPresentationContract(),
      gpu: fakeGpu({
        format: 'bgra8unorm-srgb',
        onRequestAdapter: () => fakeAdapter(),
      }),
      textureUsageRenderAttachment: 16,
    });

    expect(result).toEqual({
      ok: false,
      reason: 'srgbCanvasFormat',
      detail: 'Shared renderer canvas format must be non-srgb because the renderer performs sRGB encode explicitly.',
      format: 'bgra8unorm-srgb',
    });
    expect(configurations).toEqual([]);
  });

  it('reports device loss as a Pixi fallback and rejects stale shared frames', async () => {
    let resolveLost!: (value: unknown) => void;
    const lost = new Promise((resolve) => {
      resolveLost = resolve;
    });
    const fallbackEvents: unknown[] = [];
    const adapter = fakeAdapter({ lost });

    const result = await createSharedRendererWebGpuPresenter({
      canvas: fakeCanvas(() => fakeContext()),
      surfaceGate: okSurfaceGate,
      presentationContract: buildSharedRendererPresentationContract(),
      gpu: fakeGpu({
        onRequestAdapter: () => adapter,
      }),
      textureUsageRenderAttachment: 16,
      onDeviceLost: (event) => {
        fallbackEvents.push(event);
      },
    });

    expect(result.ok).toBe(true);
    resolveLost({ reason: 'destroyed', message: 'test device lost' });
    await Promise.resolve();

    expect(fallbackEvents).toEqual([
      {
        reason: 'deviceLost',
        fallback: 'pixi',
        staleSharedFrameAllowed: false,
        message: 'test device lost',
      },
    ]);
  });

  it('suppresses device-lost callbacks after dispose', async () => {
    let resolveLost!: (value: unknown) => void;
    const lost = new Promise((resolve) => {
      resolveLost = resolve;
    });
    const fallbackEvents: unknown[] = [];

    const result = await createSharedRendererWebGpuPresenter({
      canvas: fakeCanvas(() => fakeContext()),
      surfaceGate: okSurfaceGate,
      presentationContract: buildSharedRendererPresentationContract(),
      gpu: fakeGpu({
        onRequestAdapter: () => fakeAdapter({ lost }),
      }),
      textureUsageRenderAttachment: 16,
      onDeviceLost: (event) => {
        fallbackEvents.push(event);
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected presenter creation to pass');
    result.dispose();
    resolveLost({ reason: 'destroyed', message: 'late device lost' });
    await Promise.resolve();

    expect(fallbackEvents).toEqual([]);
  });

  it('presents a solid sRGB swatch with a clear pass and no shader pipeline', async () => {
    const submittedCommandBuffers: unknown[] = [];
    const renderPasses: unknown[] = [];
    const device = fakeDevice({
      onSubmit: (commandBuffers) => {
        submittedCommandBuffers.push(...commandBuffers);
      },
      onRenderPass: (descriptor) => {
        renderPasses.push(descriptor);
      },
    });
    const forbiddenDevice = {
      ...device,
      createShaderModule: () => {
        throw new Error('presenter must not create a shader module for solid swatch presentation');
      },
      createRenderPipeline: () => {
        throw new Error('presenter must not create a render pipeline for solid swatch presentation');
      },
    };

    const result = await createSharedRendererWebGpuPresenter({
      canvas: fakeCanvas(() => fakeContext()),
      surfaceGate: okSurfaceGate,
      presentationContract: buildSharedRendererPresentationContract(),
      gpu: fakeGpu({
        onRequestAdapter: () => fakeAdapter({ device: forbiddenDevice }),
      }),
      textureUsageRenderAttachment: 16,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected presenter creation to pass');

    result.presentSolidSrgbSwatch({
      red: 0.25,
      green: 0.5,
      blue: 0.75,
      alpha: 1,
    });

    expect(renderPasses).toEqual([
      {
        colorAttachments: [
          {
            view: 'current-texture-view',
            clearValue: { r: 0.25, g: 0.5, b: 0.75, a: 1 },
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
      },
    ]);
    expect(submittedCommandBuffers).toEqual(['finished-command-buffer']);
  });

  it('presents SolidColour rectangle clips with a vertex pipeline over a transparent clear', async () => {
    const submittedCommandBuffers: unknown[] = [];
    const renderPasses: unknown[] = [];
    const renderPassOperations: string[] = [];
    const writtenBuffers: Array<{ buffer: unknown; offset: number; data: Float32Array }> = [];
    const buffers: unknown[] = [];
    const pipelines: unknown[] = [];
    const shaderModules: unknown[] = [];
    const device = fakeDevice({
      onSubmit: (commandBuffers) => {
        submittedCommandBuffers.push(...commandBuffers);
      },
      onRenderPass: (descriptor) => {
        renderPasses.push(descriptor);
      },
      onRenderPassOperation: (operation) => {
        renderPassOperations.push(operation);
      },
      onWriteBuffer: (buffer, offset, data) => {
        writtenBuffers.push({ buffer, offset, data });
      },
      onCreateBuffer: (descriptor) => {
        buffers.push(descriptor);
      },
      onCreateRenderPipeline: (descriptor) => {
        pipelines.push(descriptor);
      },
      onCreateShaderModule: (descriptor) => {
        shaderModules.push(descriptor);
      },
    });

    const result = await createSharedRendererWebGpuPresenter({
      canvas: fakeCanvas(() => fakeContext()),
      surfaceGate: {
        ...okSurfaceGate,
        snapshot: solidShapeSnapshot,
        media: solidShapeMedia,
      },
      presentationContract: buildSharedRendererPresentationContract(),
      gpu: fakeGpu({
        onRequestAdapter: () => fakeAdapter({ device }),
      }),
      textureUsageRenderAttachment: 16,
      bufferUsageVertex: 1,
      bufferUsageCopyDst: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected presenter creation to pass');

    expect(result.presentSolidColourScene({
      snapshot: solidShapeSnapshot,
      media: solidShapeMedia,
    })).toEqual({
      ok: true,
      rectCount: 1,
    });

    expect(shaderModules).toHaveLength(1);
    expect(pipelines).toHaveLength(1);
    expect(buffers).toEqual([
      {
        size: 144,
        usage: 3,
      },
    ]);
    expect(writtenBuffers).toHaveLength(1);
    expect(writtenBuffers[0].offset).toBe(0);
    expect(Array.from(writtenBuffers[0].data.slice(0, 6))).toEqual([
      -0.6875,
      0.7777777910232544,
      0.5,
      0,
      0,
      0.5,
    ]);
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
    expect(renderPassOperations).toEqual([
      'setPipeline:solid-colour-pipeline',
      'setVertexBuffer:0:solid-colour-vertex-buffer',
      'draw:6',
      'end',
    ]);
    expect(submittedCommandBuffers).toEqual(['finished-command-buffer']);
  });

  it('accepts prebuilt SolidColour vertices so Rust/WASM can own shape geometry', async () => {
    const writtenBuffers: Array<{ buffer: unknown; offset: number; data: Float32Array }> = [];
    const rustVertices = new Float32Array([
      -0.5, 0.5, 0.25, 0.125, 0.0, 0.75,
      0.5, 0.5, 0.25, 0.125, 0.0, 0.75,
      -0.5, -0.5, 0.25, 0.125, 0.0, 0.75,
      -0.5, -0.5, 0.25, 0.125, 0.0, 0.75,
      0.5, 0.5, 0.25, 0.125, 0.0, 0.75,
      0.5, -0.5, 0.25, 0.125, 0.0, 0.75,
    ]);
    const builderCalls: unknown[] = [];
    const device = fakeDevice({
      onWriteBuffer: (buffer, offset, data) => {
        writtenBuffers.push({ buffer, offset, data });
      },
    });

    const result = await createSharedRendererWebGpuPresenter({
      canvas: fakeCanvas(() => fakeContext()),
      surfaceGate: {
        ...okSurfaceGate,
        snapshot: solidShapeSnapshot,
        media: solidShapeMedia,
      },
      presentationContract: buildSharedRendererPresentationContract(),
      gpu: fakeGpu({
        onRequestAdapter: () => fakeAdapter({ device }),
      }),
      textureUsageRenderAttachment: 16,
      solidColourVertexSceneBuilder: (input) => {
        builderCalls.push(input);
        return {
          ok: true,
          rectCount: 1,
          vertices: rustVertices,
        };
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected presenter creation to pass');

    expect(result.presentSolidColourScene({
      snapshot: solidShapeSnapshot,
      media: solidShapeMedia,
    })).toEqual({
      ok: true,
      rectCount: 1,
    });

    expect(builderCalls).toEqual([
      {
        snapshot: solidShapeSnapshot,
        media: solidShapeMedia,
        canvas: { width: 1920, height: 1080 },
      },
    ]);
    expect(writtenBuffers).toHaveLength(1);
    expect(writtenBuffers[0].data).toBe(rustVertices);
  });

  it('clears transparently for an empty SolidColour scene so Pixi can show through', async () => {
    const renderPasses: unknown[] = [];
    const renderPassOperations: string[] = [];
    const submittedCommandBuffers: unknown[] = [];

    const result = await createSharedRendererWebGpuPresenter({
      canvas: fakeCanvas(() => fakeContext()),
      surfaceGate: okSurfaceGate,
      presentationContract: buildSharedRendererPresentationContract(),
      gpu: fakeGpu({
        onRequestAdapter: () => fakeAdapter({
          device: fakeDevice({
            onRenderPass: (descriptor) => {
              renderPasses.push(descriptor);
            },
            onRenderPassOperation: (operation) => {
              renderPassOperations.push(operation);
            },
            onSubmit: (commandBuffers) => {
              submittedCommandBuffers.push(...commandBuffers);
            },
          }),
        }),
      }),
      textureUsageRenderAttachment: 16,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected presenter creation to pass');

    expect(result.presentSolidColourScene({
      snapshot,
      media: [],
    })).toEqual({
      ok: true,
      rectCount: 0,
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
    expect(submittedCommandBuffers).toEqual(['finished-command-buffer']);
  });

  it('uploads a Rust decoded RGBA frame into an sRGB video texture using descriptor stride', async () => {
    const createdTextures: unknown[] = [];
    const writtenTextures: Array<{
      destination: unknown;
      data: Uint8Array;
      dataLayout: unknown;
      size: unknown;
    }> = [];
    const rgbaBytes = new Uint8Array(decodedVideoDescriptor.byteLen);
    rgbaBytes[0] = 0x12;
    rgbaBytes[decodedVideoDescriptor.strideBytes] = 0x34;

    const result = await createSharedRendererWebGpuPresenter({
      canvas: fakeCanvas(() => fakeContext()),
      surfaceGate: okSurfaceGate,
      presentationContract: buildSharedRendererPresentationContract(),
      gpu: fakeGpu({
        onRequestAdapter: () => fakeAdapter({
          device: fakeDevice({
            onCreateTexture: (descriptor) => {
              createdTextures.push(descriptor);
            },
            onWriteTexture: (destination, data, dataLayout, size) => {
              writtenTextures.push({ destination, data, dataLayout, size });
            },
          }),
        }),
      }),
      textureUsageRenderAttachment: 16,
      textureUsageTextureBinding: 4,
      textureUsageTextureCopyDst: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected presenter creation to pass');

    expect(result.uploadVideoFrameTexture({
      descriptor: decodedVideoDescriptor,
      rgbaBytes,
    })).toEqual({
      ok: true,
      texture: 'video-frame-texture',
      textureFormat: 'rgba8unorm-srgb',
      width: 34,
      height: 2,
      strideBytes: 256,
    });
    expect(createdTextures).toEqual([
      {
        size: {
          width: 34,
          height: 2,
          depthOrArrayLayers: 1,
        },
        format: 'rgba8unorm-srgb',
        usage: 6,
      },
    ]);
    expect(writtenTextures).toEqual([
      {
        destination: { texture: 'video-frame-texture' },
        data: rgbaBytes,
        dataLayout: {
          offset: 0,
          bytesPerRow: 256,
          rowsPerImage: 2,
        },
        size: {
          width: 34,
          height: 2,
          depthOrArrayLayers: 1,
        },
      },
    ]);
  });

  it('rejects a Rust decoded RGBA upload when byte length does not match the descriptor', async () => {
    const writtenTextures: unknown[] = [];
    const result = await createSharedRendererWebGpuPresenter({
      canvas: fakeCanvas(() => fakeContext()),
      surfaceGate: okSurfaceGate,
      presentationContract: buildSharedRendererPresentationContract(),
      gpu: fakeGpu({
        onRequestAdapter: () => fakeAdapter({
          device: fakeDevice({
            onWriteTexture: (...args) => {
              writtenTextures.push(args);
            },
          }),
        }),
      }),
      textureUsageRenderAttachment: 16,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected presenter creation to pass');

    expect(result.uploadVideoFrameTexture({
      descriptor: decodedVideoDescriptor,
      rgbaBytes: new Uint8Array(decodedVideoDescriptor.byteLen - 1),
    })).toEqual({
      ok: false,
      reason: 'frameByteLengthMismatch',
      detail: 'Decoded RGBA byte length must match the shared frame descriptor.',
      expectedByteLength: decodedVideoDescriptor.byteLen,
      actualByteLength: decodedVideoDescriptor.byteLen - 1,
    });
    expect(writtenTextures).toEqual([]);
  });

  it('presents uploaded video frame textures with the video plane vertex scene', async () => {
    const writtenBuffers: Array<{ buffer: unknown; offset: number; data: Float32Array }> = [];
    const renderPasses: unknown[] = [];
    const renderPassOperations: string[] = [];
    const bindGroups: unknown[] = [];
    const samplers: unknown[] = [];
    const uploadedTexture = {
      createView: () => 'video-frame-texture-view',
    };

    const result = await createSharedRendererWebGpuPresenter({
      canvas: fakeCanvas(() => fakeContext()),
      surfaceGate: {
        ...okSurfaceGate,
        snapshot: videoSnapshot,
        media: videoMedia,
      },
      presentationContract: buildSharedRendererPresentationContract(),
      gpu: fakeGpu({
        onRequestAdapter: () => fakeAdapter({
          device: fakeDevice({
            onWriteBuffer: (buffer, offset, data) => {
              writtenBuffers.push({ buffer, offset, data });
            },
            onRenderPass: (descriptor) => {
              renderPasses.push(descriptor);
            },
            onRenderPassOperation: (operation) => {
              renderPassOperations.push(operation);
            },
            onCreateBindGroup: (descriptor) => {
              bindGroups.push(descriptor);
            },
            onCreateSampler: (descriptor) => {
              samplers.push(descriptor);
            },
          }),
        }),
      }),
      textureUsageRenderAttachment: 16,
      bufferUsageVertex: 1,
      bufferUsageCopyDst: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected presenter creation to pass');

    expect(result.presentVideoFrameScene({
      snapshot: videoSnapshot,
      media: videoMedia,
      texture: uploadedTexture,
    })).toEqual({
      ok: true,
      planeCount: 1,
    });
    expect(writtenBuffers).toHaveLength(1);
    expect(writtenBuffers[0].buffer).toBe('video-plane-vertex-buffer');
    expect(writtenBuffers[0].offset).toBe(0);
    expect(Array.from(writtenBuffers[0].data.slice(0, 8))).toEqual([
      -0.9895833134651184,
      0.9629629850387573,
      0,
      0,
      0.75,
      1,
      0,
      1,
    ]);
    expect(samplers).toEqual([
      {
        magFilter: 'linear',
        minFilter: 'linear',
        mipmapFilter: 'nearest',
      },
    ]);
    expect(bindGroups).toEqual([
      {
        layout: 'video-frame-bind-group-layout',
        entries: [
          { binding: 0, resource: 'video-frame-sampler' },
          { binding: 1, resource: 'video-frame-texture-view' },
        ],
      },
    ]);
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
    expect(renderPassOperations).toEqual([
      'setPipeline:video-frame-pipeline',
      'setBindGroup:0:video-frame-bind-group',
      'setVertexBuffer:0:video-plane-vertex-buffer',
      'draw:6',
      'end',
    ]);
  });

  it('draws multiple uploaded video frame textures with one bind group per video plane', async () => {
    const renderPassOperations: string[] = [];
    const bindGroups: unknown[] = [];
    const uploadedTextures = new Map<string, unknown>([
      ['video-back', { createView: () => 'video-back-texture-view' }],
      ['video-front', { createView: () => 'video-front-texture-view' }],
    ]);

    const result = await createSharedRendererWebGpuPresenter({
      canvas: fakeCanvas(() => fakeContext()),
      surfaceGate: {
        ...okSurfaceGate,
        snapshot: multiVideoSnapshot,
        media: multiVideoMedia,
      },
      presentationContract: buildSharedRendererPresentationContract(),
      gpu: fakeGpu({
        onRequestAdapter: () => fakeAdapter({
          device: fakeDevice({
            onRenderPassOperation: (operation) => {
              renderPassOperations.push(operation);
            },
            onCreateBindGroup: (descriptor) => {
              bindGroups.push(descriptor);
            },
          }),
        }),
      }),
      textureUsageRenderAttachment: 16,
      bufferUsageVertex: 1,
      bufferUsageCopyDst: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected presenter creation to pass');

    expect(result.presentVideoFrameScene({
      snapshot: multiVideoSnapshot,
      media: multiVideoMedia,
      texturesByClipId: uploadedTextures,
    } as any)).toEqual({
      ok: true,
      planeCount: 2,
    });
    expect(bindGroups).toEqual([
      {
        layout: 'video-frame-bind-group-layout',
        entries: [
          { binding: 0, resource: 'video-frame-sampler' },
          { binding: 1, resource: 'video-back-texture-view' },
        ],
      },
      {
        layout: 'video-frame-bind-group-layout',
        entries: [
          { binding: 0, resource: 'video-frame-sampler' },
          { binding: 1, resource: 'video-front-texture-view' },
        ],
      },
    ]);
    expect(renderPassOperations).toEqual([
      'setPipeline:video-frame-pipeline',
      'setVertexBuffer:0:video-plane-vertex-buffer',
      'setBindGroup:0:video-frame-bind-group',
      'draw:6',
      'setBindGroup:0:video-frame-bind-group',
      'draw:6',
      'end',
    ]);
  });
});

const fakeCanvas = (getContext: () => unknown) =>
  ({
    width: 0,
    height: 0,
    getContext,
  }) as unknown as HTMLCanvasElement;

const fakeContext = (configure: (configuration: unknown) => void = () => undefined) => ({
  configure,
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
  device = fakeDevice({ lost }),
}: {
  lost?: Promise<unknown>;
  device?: ReturnType<typeof fakeDevice>;
} = {}) => ({
  device,
  requestDevice: async () => device,
});

const fakeDevice = ({
  lost = new Promise(() => undefined),
  onSubmit = () => undefined,
  onRenderPass = () => undefined,
  onRenderPassOperation = () => undefined,
  onWriteBuffer = () => undefined,
  onWriteTexture = () => undefined,
  onCopyTextureToBuffer = () => undefined,
  onCreateBuffer = () => undefined,
  onCreateTexture = () => undefined,
  onCreateSampler = () => undefined,
  onCreateBindGroup = () => undefined,
  onCreateShaderModule = () => undefined,
  onCreateRenderPipeline = () => undefined,
  readbackBytes = new Uint8Array(),
}: {
  lost?: Promise<unknown>;
  onSubmit?: (commandBuffers: unknown[]) => void;
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
  onCreateBuffer?: (descriptor: unknown) => void;
  onCreateTexture?: (descriptor: unknown) => void;
  onCreateSampler?: (descriptor: unknown) => void;
  onCreateBindGroup?: (descriptor: unknown) => void;
  onCreateShaderModule?: (descriptor: unknown) => void;
  onCreateRenderPipeline?: (descriptor: unknown) => void;
  readbackBytes?: Uint8Array;
} = {}) => ({
  lost,
  queue: {
    submit: onSubmit,
    onSubmittedWorkDone: async () => undefined,
    writeBuffer: onWriteBuffer,
    writeTexture: onWriteTexture,
  },
  createTexture: (descriptor: unknown) => {
    onCreateTexture(descriptor);
    return 'video-frame-texture';
  },
  createSampler: (descriptor: unknown) => {
    onCreateSampler(descriptor);
    return 'video-frame-sampler';
  },
  createBindGroup: (descriptor: unknown) => {
    onCreateBindGroup(descriptor);
    return 'video-frame-bind-group';
  },
  createShaderModule: (descriptor: unknown) => {
    onCreateShaderModule(descriptor);
    return 'solid-colour-shader-module';
  },
  createRenderPipeline: (descriptor: unknown) => {
    onCreateRenderPipeline(descriptor);
    const pipelineLabel = typeof descriptor === 'object'
      && descriptor !== null
      && 'label' in descriptor
      && descriptor.label === 'video-frame-pipeline'
      ? 'video-frame-pipeline'
      : 'solid-colour-pipeline';
    return pipelineLabel === 'video-frame-pipeline'
      ? {
        toString: () => 'video-frame-pipeline',
        getBindGroupLayout: () => 'video-frame-bind-group-layout',
      }
      : 'solid-colour-pipeline';
  },
  createBuffer: (descriptor: unknown) => {
    onCreateBuffer(descriptor);
    if (
      typeof descriptor === 'object'
      && descriptor !== null
      && 'label' in descriptor
      && descriptor.label === 'shared-renderer-presented-frame-readback'
    ) {
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
    return typeof descriptor === 'object'
      && descriptor !== null
      && 'label' in descriptor
      && descriptor.label === 'video-plane-vertex-buffer'
      ? 'video-plane-vertex-buffer'
      : 'solid-colour-vertex-buffer';
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
        setBindGroup: (index: number, bindGroup: unknown) => {
          onRenderPassOperation(`setBindGroup:${index}:${String(bindGroup)}`);
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
