import type { SharedRendererPresentationContract } from './sharedRendererPresentationContract';
import type { RustBackendVideoFrameDescriptor } from './rustBackendVideoDecodeControl';
import {
  buildSharedRendererSolidColourVertexScene,
  type SharedRendererSolidColourVertexSceneBuilder,
} from './sharedRendererSolidColourScene';
import {
  buildSharedRendererVideoPlaneVertexScene,
  type SharedRendererVideoPlaneVertexSceneBuilder,
} from './sharedRendererVideoPlaneScene';
import type {
  RustSceneMediaReference,
  RustSceneSnapshot,
} from './rustSceneSnapshot';
import type {
  SharedRendererPreviewSurfaceBlockedReason,
  SharedRendererPreviewSurfaceGate,
} from './sharedRendererPreviewSurface';

export interface SharedRendererWebGpuLike {
  getPreferredCanvasFormat: () => string;
  requestAdapter: (options: { powerPreference: 'high-performance' }) => Promise<SharedRendererWebGpuAdapterLike | null>;
}

export interface SharedRendererWebGpuAdapterLike {
  requestDevice: () => Promise<SharedRendererWebGpuDeviceLike>;
}

export interface SharedRendererWebGpuDeviceLike {
  lost?: Promise<unknown>;
  queue?: {
    submit: (commandBuffers: unknown[]) => void;
    onSubmittedWorkDone?: () => Promise<void>;
    writeBuffer?: (buffer: unknown, offset: number, data: Float32Array) => void;
    writeTexture?: (
      destination: { texture: unknown },
      data: Uint8Array,
      dataLayout: {
        offset: number;
        bytesPerRow: number;
        rowsPerImage: number;
      },
      size: SharedRendererVideoTextureSize
    ) => void;
  };
  createShaderModule?: (descriptor: { code: string }) => unknown;
  createRenderPipeline?: (descriptor: unknown) => unknown;
  createBuffer?: (descriptor: { label?: string; size: number; usage: number }) => unknown;
  createTexture?: (descriptor: SharedRendererVideoTextureDescriptor) => unknown;
  createSampler?: (descriptor: SharedRendererVideoSamplerDescriptor) => unknown;
  createBindGroup?: (descriptor: SharedRendererVideoBindGroupDescriptor) => unknown;
  createCommandEncoder?: () => {
    beginRenderPass: (descriptor: {
      colorAttachments: Array<{
        view: unknown;
        clearValue: { r: number; g: number; b: number; a: number };
        loadOp: 'clear';
        storeOp: 'store';
      }>;
    }) => {
      setPipeline?: (pipeline: unknown) => void;
      setBindGroup?: (index: number, bindGroup: unknown) => void;
      setVertexBuffer?: (slot: number, buffer: unknown) => void;
      draw?: (vertexCount: number, instanceCount?: number, firstVertex?: number) => void;
      end: () => void;
    };
    finish: () => unknown;
  };
}

export interface SharedRendererWebGpuCanvasContextLike {
  configure: (configuration: {
    device: SharedRendererWebGpuDeviceLike;
    format: string;
    usage: number;
    colorSpace: 'srgb';
    alphaMode: 'premultiplied';
  }) => void;
  getCurrentTexture?: () => {
    createView: () => unknown;
  };
}

type WebGpuCanvasLike = Pick<HTMLCanvasElement, 'width' | 'height' | 'getContext'>;

export type SharedRendererPresenterBlockedReason =
  | 'surfaceGateBlocked'
  | 'webGpuContextUnavailable'
  | 'adapterUnavailable'
  | 'deviceRequestFailed'
  | 'srgbCanvasFormat';

export type SharedRendererWebGpuPresenterResult =
  | {
      ok: true;
      device: SharedRendererWebGpuDeviceLike;
      context: SharedRendererWebGpuCanvasContextLike;
      format: string;
      canvasSize: {
        width: number;
        height: number;
      };
      presentationContract: SharedRendererPresentationContract;
      dispose: () => void;
      presentSolidSrgbSwatch: (swatch: SharedRendererSolidSrgbSwatch) => void;
      presentSolidColourScene: (scene: SharedRendererSolidColourSceneInput) => SharedRendererSolidColourScenePresentationResult;
      uploadVideoFrameTexture: (input: SharedRendererVideoFrameTextureUploadInput) => SharedRendererVideoFrameTextureUploadResult;
      presentVideoFrameScene: (scene: SharedRendererVideoFrameSceneInput) => SharedRendererVideoFrameScenePresentationResult;
    }
  | {
      ok: false;
      reason: 'surfaceGateBlocked';
      detail: string;
      surfaceGateReason: SharedRendererPreviewSurfaceBlockedReason;
    }
  | {
      ok: false;
      reason: Exclude<SharedRendererPresenterBlockedReason, 'surfaceGateBlocked'>;
      detail: string;
      format?: string;
    };

export interface SharedRendererDeviceLostEvent {
  reason: 'deviceLost';
  fallback: 'pixi';
  staleSharedFrameAllowed: false;
  message: string;
}

export interface SharedRendererSolidSrgbSwatch {
  red: number;
  green: number;
  blue: number;
  alpha: number;
}

export interface SharedRendererSolidColourSceneInput {
  snapshot: RustSceneSnapshot;
  media: RustSceneMediaReference[];
  solidColourObjectIds?: ReadonlySet<string>;
}

export type SharedRendererSolidColourScenePresentationResult =
  | {
      ok: true;
      rectCount: number;
    }
  | {
      ok: false;
      reason: 'unsupportedColourSource' | 'webGpuDrawUnavailable';
      detail: string;
    };

export interface SharedRendererWebGpuPresenterInput {
  canvas: WebGpuCanvasLike;
  surfaceGate: SharedRendererPreviewSurfaceGate;
  presentationContract: SharedRendererPresentationContract;
  gpu?: SharedRendererWebGpuLike;
  textureUsageRenderAttachment?: number;
  bufferUsageVertex?: number;
  bufferUsageCopyDst?: number;
  textureUsageTextureBinding?: number;
  textureUsageTextureCopyDst?: number;
  solidColourVertexSceneBuilder?: SharedRendererSolidColourVertexSceneBuilder;
  videoPlaneVertexSceneBuilder?: SharedRendererVideoPlaneVertexSceneBuilder;
  onDeviceLost?: (event: SharedRendererDeviceLostEvent) => void;
}

export interface SharedRendererVideoFrameTextureUploadInput {
  descriptor: RustBackendVideoFrameDescriptor;
  rgbaBytes: Uint8Array;
}

export type SharedRendererVideoFrameTextureUploadResult =
  | {
      ok: true;
      texture: unknown;
      textureFormat: 'rgba8unorm-srgb';
      width: number;
      height: number;
      strideBytes: number;
    }
  | {
      ok: false;
      reason: 'unsupportedVideoFrameFormat';
      detail: string;
      format: string;
    }
  | {
      ok: false;
      reason: 'frameByteLengthMismatch';
      detail: string;
      expectedByteLength: number;
      actualByteLength: number;
    }
  | {
      ok: false;
      reason: 'webGpuUploadUnavailable';
      detail: string;
    };

interface SharedRendererVideoTextureSize {
  width: number;
  height: number;
  depthOrArrayLayers: 1;
}

interface SharedRendererVideoTextureDescriptor {
  size: SharedRendererVideoTextureSize;
  format: 'rgba8unorm-srgb';
  usage: number;
}

interface SharedRendererVideoSamplerDescriptor {
  magFilter: 'linear';
  minFilter: 'linear';
  mipmapFilter: 'nearest';
}

interface SharedRendererVideoBindGroupDescriptor {
  layout: unknown;
  entries: Array<{
    binding: number;
    resource: unknown;
  }>;
}

export interface SharedRendererVideoFrameSceneInput {
  snapshot: RustSceneSnapshot;
  media: RustSceneMediaReference[];
  texture?: unknown;
  texturesByClipId?: ReadonlyMap<string, unknown>;
  videoObjectIds?: ReadonlySet<string>;
}

export type SharedRendererVideoFrameScenePresentationResult =
  | {
      ok: true;
      planeCount: number;
    }
  | {
      ok: false;
      reason: 'unsupportedVideoScene' | 'webGpuDrawUnavailable' | 'videoTextureViewUnavailable';
      detail: string;
    };

export const createSharedRendererWebGpuPresenter = async ({
  canvas,
  surfaceGate,
  presentationContract,
  gpu = defaultGpu(),
  textureUsageRenderAttachment = defaultRenderAttachmentUsage(),
  bufferUsageVertex = defaultVertexBufferUsage(),
  bufferUsageCopyDst = defaultCopyDstBufferUsage(),
  textureUsageTextureBinding = defaultTextureBindingUsage(),
  textureUsageTextureCopyDst = defaultTextureCopyDstUsage(),
  solidColourVertexSceneBuilder = buildSharedRendererSolidColourVertexScene,
  videoPlaneVertexSceneBuilder = buildSharedRendererVideoPlaneVertexScene,
  onDeviceLost,
}: SharedRendererWebGpuPresenterInput): Promise<SharedRendererWebGpuPresenterResult> => {
  if (!surfaceGate.ok) {
    return {
      ok: false,
      reason: 'surfaceGateBlocked',
      detail: surfaceGate.detail,
      surfaceGateReason: surfaceGate.reason,
    };
  }

  if (!gpu) {
    return {
      ok: false,
      reason: 'adapterUnavailable',
      detail: 'WebGPU is unavailable for the shared renderer presenter.',
    };
  }

  const context = canvas.getContext('webgpu') as SharedRendererWebGpuCanvasContextLike | null;
  if (!context) {
    return {
      ok: false,
      reason: 'webGpuContextUnavailable',
      detail: 'Canvas does not expose a WebGPU context.',
    };
  }

  const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) {
    return {
      ok: false,
      reason: 'adapterUnavailable',
      detail: 'WebGPU adapter is unavailable for the shared renderer presenter.',
    };
  }

  let device: SharedRendererWebGpuDeviceLike;
  try {
    device = await adapter.requestDevice();
  } catch {
    return {
      ok: false,
      reason: 'deviceRequestFailed',
      detail: 'WebGPU device request failed for the shared renderer presenter.',
    };
  }

  const format = gpu.getPreferredCanvasFormat();
  if (format.endsWith('-srgb')) {
    return {
      ok: false,
      reason: 'srgbCanvasFormat',
      detail: 'Shared renderer canvas format must be non-srgb because the renderer performs sRGB encode explicitly.',
      format,
    };
  }

  canvas.width = surfaceGate.canvas.width;
  canvas.height = surfaceGate.canvas.height;
  // Keep the canvas format non-srgb: shared renderer/export paths perform the linear -> sRGB encode explicitly.
  context.configure({
    device,
    format,
    usage: textureUsageRenderAttachment,
    colorSpace: presentationContract.canvas.colorSpace,
    alphaMode: presentationContract.canvas.alphaMode,
  });

  let disposed = false;
  const dispose = () => {
    disposed = true;
  };

  if (device.lost && onDeviceLost) {
    void device.lost.then((info) => {
      if (disposed) return;
      onDeviceLost({
        reason: 'deviceLost',
        fallback: presentationContract.deviceLost.fallback,
        staleSharedFrameAllowed: presentationContract.deviceLost.staleSharedFrameAllowed,
        message: deviceLostMessage(info),
      });
    });
  }

  const presentSolidSrgbSwatch = (swatch: SharedRendererSolidSrgbSwatch) => {
    if (!context.getCurrentTexture || !device.createCommandEncoder || !device.queue) return;

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: context.getCurrentTexture().createView(),
          clearValue: {
            r: swatch.red,
            g: swatch.green,
            b: swatch.blue,
            a: swatch.alpha,
          },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });
    pass.end();
    device.queue.submit([encoder.finish()]);
  };

  let solidColourPipeline: unknown | null = null;
  let videoFramePipeline: unknown | null = null;
  const presentSolidColourScene = ({
    snapshot,
    media,
    solidColourObjectIds,
  }: SharedRendererSolidColourSceneInput): SharedRendererSolidColourScenePresentationResult => {
    const vertexScene = solidColourVertexSceneBuilder({
      snapshot,
      media,
      solidColourObjectIds,
      canvas: { width: canvas.width, height: canvas.height },
    });
    if (!vertexScene.ok) {
      return {
        ok: false,
        reason: vertexScene.reason,
        detail: vertexScene.detail,
      };
    }

    if (
      !context.getCurrentTexture
      || !device.createCommandEncoder
      || !device.queue
    ) {
      return {
        ok: false,
        reason: 'webGpuDrawUnavailable',
        detail: 'WebGPU device does not expose the clear APIs needed for SolidColour scene presentation.',
      };
    }

    if (vertexScene.rectCount === 0) {
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: context.getCurrentTexture().createView(),
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
      });
      pass.end();
      device.queue.submit([encoder.finish()]);
      return {
        ok: true,
        rectCount: 0,
      };
    }

    if (
      !device.queue.writeBuffer
      || !device.createBuffer
      || !device.createShaderModule
      || !device.createRenderPipeline
    ) {
      return {
        ok: false,
        reason: 'webGpuDrawUnavailable',
        detail: 'WebGPU device does not expose the draw APIs needed for SolidColour scene presentation.',
      };
    }

    if (!solidColourPipeline) {
      const shader = device.createShaderModule({
        code: solidColourShaderCode,
      });
      solidColourPipeline = device.createRenderPipeline({
        layout: 'auto',
        vertex: {
          module: shader,
          entryPoint: 'vs_main',
          buffers: [
            {
              arrayStride: 24,
              attributes: [
                { shaderLocation: 0, offset: 0, format: 'float32x2' },
                { shaderLocation: 1, offset: 8, format: 'float32x4' },
              ],
            },
          ],
        },
        fragment: {
          module: shader,
          entryPoint: 'fs_main',
          targets: [{ format }],
        },
        primitive: {
          topology: 'triangle-list',
        },
      });
    }

    const vertices = vertexScene.vertices;
    const vertexBuffer = device.createBuffer({
      size: vertices.byteLength,
      usage: bufferUsageVertex | bufferUsageCopyDst,
    });
    device.queue.writeBuffer(vertexBuffer, 0, vertices);

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: context.getCurrentTexture().createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });
    pass.setPipeline?.(solidColourPipeline);
    pass.setVertexBuffer?.(0, vertexBuffer);
    pass.draw?.(vertices.length / 6);
    pass.end();
    device.queue.submit([encoder.finish()]);

    return {
      ok: true,
      rectCount: vertexScene.rectCount,
    };
  };

  const uploadVideoFrameTexture = ({
    descriptor,
    rgbaBytes,
  }: SharedRendererVideoFrameTextureUploadInput): SharedRendererVideoFrameTextureUploadResult => {
    if (descriptor.format !== 'rgba8Srgb') {
      return {
        ok: false,
        reason: 'unsupportedVideoFrameFormat',
        detail: 'Shared renderer video texture upload only supports Rust rgba8Srgb decoded frames.',
        format: descriptor.format,
      };
    }
    if (rgbaBytes.byteLength !== descriptor.byteLen) {
      return {
        ok: false,
        reason: 'frameByteLengthMismatch',
        detail: 'Decoded RGBA byte length must match the shared frame descriptor.',
        expectedByteLength: descriptor.byteLen,
        actualByteLength: rgbaBytes.byteLength,
      };
    }
    if (!device.createTexture || !device.queue?.writeTexture) {
      return {
        ok: false,
        reason: 'webGpuUploadUnavailable',
        detail: 'WebGPU device does not expose the texture upload APIs needed for decoded video frames.',
      };
    }

    const textureFormat = 'rgba8unorm-srgb' as const;
    const size = {
      width: descriptor.width,
      height: descriptor.height,
      depthOrArrayLayers: 1 as const,
    };
    const texture = device.createTexture({
      size,
      format: textureFormat,
      usage: textureUsageTextureBinding | textureUsageTextureCopyDst,
    });
    device.queue.writeTexture(
      { texture },
      rgbaBytes,
      {
        offset: 0,
        bytesPerRow: descriptor.strideBytes,
        rowsPerImage: descriptor.height,
      },
      size
    );

    return {
      ok: true,
      texture,
      textureFormat,
      width: descriptor.width,
      height: descriptor.height,
      strideBytes: descriptor.strideBytes,
    };
  };

  const presentVideoFrameScene = ({
    snapshot,
    media,
    texture,
    texturesByClipId,
    videoObjectIds,
  }: SharedRendererVideoFrameSceneInput): SharedRendererVideoFrameScenePresentationResult => {
    const vertexScene = videoPlaneVertexSceneBuilder({
      snapshot,
      media,
      canvas: { width: canvas.width, height: canvas.height },
    });
    if (!vertexScene.ok) {
      return {
        ok: false,
        reason: 'unsupportedVideoScene',
        detail: 'Shared renderer could not build a video plane scene.',
      };
    }

    if (
      !context.getCurrentTexture
      || !device.createCommandEncoder
      || !device.queue
      || !device.queue.writeBuffer
      || !device.createBuffer
      || !device.createShaderModule
      || !device.createRenderPipeline
      || !device.createSampler
      || !device.createBindGroup
    ) {
      return {
        ok: false,
        reason: 'webGpuDrawUnavailable',
        detail: 'WebGPU device does not expose the draw APIs needed for video frame scene presentation.',
      };
    }

    if (!videoFramePipeline) {
      const shader = device.createShaderModule({
        code: videoFrameShaderCode,
      });
      videoFramePipeline = device.createRenderPipeline({
        label: 'video-frame-pipeline',
        layout: 'auto',
        vertex: {
          module: shader,
          entryPoint: 'vs_main',
          buffers: [
            {
              arrayStride: 32,
              attributes: [
                { shaderLocation: 0, offset: 0, format: 'float32x2' },
                { shaderLocation: 1, offset: 8, format: 'float32x2' },
                { shaderLocation: 2, offset: 16, format: 'float32' },
              ],
            },
          ],
        },
        fragment: {
          module: shader,
          entryPoint: 'fs_main',
          targets: [{ format }],
        },
        primitive: {
          topology: 'triangle-list',
        },
      });
    }

    const createBindGroup = device.createBindGroup;
    const drawablePlanes: Array<{
      index: number;
      textureView: unknown;
    }> = [];
    for (const [index, plane] of vertexScene.planes.entries()) {
      if (videoObjectIds && !videoObjectIds.has(plane.clipId)) {
        continue;
      }
      const planeTexture = texturesByClipId
        ? texturesByClipId.get(plane.clipId)
        : texture;
      const textureView = createTextureView(planeTexture);
      if (!textureView.ok) {
        if (texturesByClipId || videoObjectIds) {
          continue;
        }
        return textureView;
      }
      drawablePlanes.push({
        index,
        textureView: textureView.value,
      });
    }
    if (drawablePlanes.length === 0) {
      return {
        ok: false,
        reason: 'videoTextureViewUnavailable',
        detail: 'No uploaded video texture was available for the video plane scene.',
      };
    }

    const vertices = vertexScene.vertices;
    const vertexBuffer = device.createBuffer({
      label: 'video-plane-vertex-buffer',
      size: vertices.byteLength,
      usage: bufferUsageVertex | bufferUsageCopyDst,
    });
    device.queue.writeBuffer(vertexBuffer, 0, vertices);

    const sampler = device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      mipmapFilter: 'nearest',
    });
    const bindGroups = drawablePlanes.map((plane) => createBindGroup({
      layout: pipelineBindGroupLayout(videoFramePipeline, 0),
      entries: [
        { binding: 0, resource: sampler },
        { binding: 1, resource: plane.textureView },
      ],
    }));

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: context.getCurrentTexture().createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });
    pass.setPipeline?.(videoFramePipeline);
    if (texturesByClipId || videoObjectIds) {
      pass.setVertexBuffer?.(0, vertexBuffer);
      bindGroups.forEach((bindGroup, drawIndex) => {
        pass.setBindGroup?.(0, bindGroup);
        pass.draw?.(6, 1, drawablePlanes[drawIndex].index * 6);
      });
    } else {
      pass.setBindGroup?.(0, bindGroups[0]);
      pass.setVertexBuffer?.(0, vertexBuffer);
      pass.draw?.(vertices.length / 8);
    }
    pass.end();
    device.queue.submit([encoder.finish()]);

    return {
      ok: true,
      planeCount: drawablePlanes.length,
    };
  };

  return {
    ok: true,
    device,
    context,
    format,
    canvasSize: {
      width: surfaceGate.canvas.width,
      height: surfaceGate.canvas.height,
    },
    presentationContract,
    dispose,
    presentSolidSrgbSwatch,
    presentSolidColourScene,
    uploadVideoFrameTexture,
    presentVideoFrameScene,
  };
};

const videoFrameShaderCode = `
struct VertexOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) opacity: f32,
};

@group(0) @binding(0) var videoSampler: sampler;
@group(0) @binding(1) var videoTexture: texture_2d<f32>;

@vertex
fn vs_main(
  @location(0) position: vec2<f32>,
  @location(1) uv: vec2<f32>,
  @location(2) opacity: f32
) -> VertexOut {
  var out: VertexOut;
  out.position = vec4<f32>(position, 0.0, 1.0);
  out.uv = uv;
  out.opacity = opacity;
  return out;
}

@fragment
fn fs_main(in: VertexOut) -> @location(0) vec4<f32> {
  let colour = textureSample(videoTexture, videoSampler, in.uv);
  return vec4<f32>(colour.rgb, colour.a * in.opacity);
}
`;

const solidColourShaderCode = `
struct VertexOut {
  @builtin(position) position: vec4<f32>,
  @location(0) colour: vec4<f32>,
};

@vertex
fn vs_main(
  @location(0) position: vec2<f32>,
  @location(1) colour: vec4<f32>
) -> VertexOut {
  var out: VertexOut;
  out.position = vec4<f32>(position, 0.0, 1.0);
  out.colour = colour;
  return out;
}

@fragment
fn fs_main(in: VertexOut) -> @location(0) vec4<f32> {
  return in.colour;
}
`;

const createTextureView = (texture: unknown):
  | { ok: true; value: unknown }
  | { ok: false; reason: 'videoTextureViewUnavailable'; detail: string } => {
  if (
    typeof texture === 'object'
    && texture !== null
    && 'createView' in texture
    && typeof texture.createView === 'function'
  ) {
    return {
      ok: true,
      value: texture.createView(),
    };
  }

  return {
    ok: false,
    reason: 'videoTextureViewUnavailable',
    detail: 'Uploaded video texture does not expose createView().',
  };
};

const pipelineBindGroupLayout = (pipeline: unknown, index: number): unknown => {
  if (
    typeof pipeline === 'object'
    && pipeline !== null
    && 'getBindGroupLayout' in pipeline
    && typeof pipeline.getBindGroupLayout === 'function'
  ) {
    return pipeline.getBindGroupLayout(index);
  }

  return 'auto';
};

const defaultGpu = (): SharedRendererWebGpuLike | undefined => {
  const gpu = navigator.gpu;
  if (!gpu) return undefined;
  return gpu as unknown as SharedRendererWebGpuLike;
};

const defaultRenderAttachmentUsage = (): number => {
  const textureUsage = (globalThis as unknown as { GPUTextureUsage?: { RENDER_ATTACHMENT?: number } }).GPUTextureUsage;
  return textureUsage?.RENDER_ATTACHMENT ?? 0x10;
};

const defaultVertexBufferUsage = (): number => {
  const bufferUsage = (globalThis as unknown as { GPUBufferUsage?: { VERTEX?: number } }).GPUBufferUsage;
  return bufferUsage?.VERTEX ?? 0x20;
};

const defaultCopyDstBufferUsage = (): number => {
  const bufferUsage = (globalThis as unknown as { GPUBufferUsage?: { COPY_DST?: number } }).GPUBufferUsage;
  return bufferUsage?.COPY_DST ?? 0x8;
};

const defaultTextureBindingUsage = (): number => {
  const textureUsage = (globalThis as unknown as { GPUTextureUsage?: { TEXTURE_BINDING?: number } }).GPUTextureUsage;
  return textureUsage?.TEXTURE_BINDING ?? 0x4;
};

const defaultTextureCopyDstUsage = (): number => {
  const textureUsage = (globalThis as unknown as { GPUTextureUsage?: { COPY_DST?: number } }).GPUTextureUsage;
  return textureUsage?.COPY_DST ?? 0x2;
};

const deviceLostMessage = (info: unknown): string => {
  if (typeof info === 'object' && info !== null && 'message' in info) {
    const message = (info as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return 'WebGPU device was lost.';
};
