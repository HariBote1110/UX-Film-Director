import { describe, expect, it } from 'vitest';
import {
  createSharedRendererWebGpuPresenter,
  type SharedRendererWebGpuAdapterLike,
  type SharedRendererWebGpuLike,
} from './sharedRendererWebGpuPresenter';
import { buildSharedRendererPresentationContract } from './sharedRendererPresentationContract';
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
        usage: 16,
        colorSpace: 'srgb',
        alphaMode: 'premultiplied',
      },
    ]);
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
  onCreateBuffer = () => undefined,
  onCreateShaderModule = () => undefined,
  onCreateRenderPipeline = () => undefined,
}: {
  lost?: Promise<unknown>;
  onSubmit?: (commandBuffers: unknown[]) => void;
  onRenderPass?: (descriptor: unknown) => void;
  onRenderPassOperation?: (operation: string) => void;
  onWriteBuffer?: (buffer: unknown, offset: number, data: Float32Array) => void;
  onCreateBuffer?: (descriptor: unknown) => void;
  onCreateShaderModule?: (descriptor: unknown) => void;
  onCreateRenderPipeline?: (descriptor: unknown) => void;
} = {}) => ({
  lost,
  queue: {
    submit: onSubmit,
    writeBuffer: onWriteBuffer,
  },
  createShaderModule: (descriptor: unknown) => {
    onCreateShaderModule(descriptor);
    return 'solid-colour-shader-module';
  },
  createRenderPipeline: (descriptor: unknown) => {
    onCreateRenderPipeline(descriptor);
    return 'solid-colour-pipeline';
  },
  createBuffer: (descriptor: unknown) => {
    onCreateBuffer(descriptor);
    return 'solid-colour-vertex-buffer';
  },
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
