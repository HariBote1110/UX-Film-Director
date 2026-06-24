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
import type { RustBackendVideoEncodeWriteFramePayload } from './rustBackendVideoEncodeControl';

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
  importExternalTexture?: (descriptor: { source: unknown }) => unknown;
  createSampler?: (descriptor: SharedRendererVideoSamplerDescriptor) => unknown;
  createBindGroup?: (descriptor: SharedRendererVideoBindGroupDescriptor) => unknown;
  createCommandEncoder?: () => {
    copyTextureToBuffer?: (
      source: { texture: unknown },
      destination: { buffer: unknown; bytesPerRow: number; rowsPerImage: number },
      size: SharedRendererVideoTextureSize
    ) => void;
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

interface CachedWebGpuDevice {
  device: SharedRendererWebGpuDeviceLike;
}

const webGpuDeviceCache = new WeakMap<SharedRendererWebGpuLike, Promise<CachedWebGpuDevice | null>>();

const resolveCachedWebGpuDevice = (
  gpu: SharedRendererWebGpuLike
): Promise<CachedWebGpuDevice | null> => {
  const cached = webGpuDeviceCache.get(gpu);
  if (cached) return cached;

  const pending = (async () => {
    const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) return null;

    try {
      const device = await adapter.requestDevice();
      return { device };
    } catch (error) {
      webGpuDeviceCache.delete(gpu);
      throw error;
    }
  })();
  webGpuDeviceCache.set(gpu, pending);
  return pending;
};

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
      presentNativeRenderFrame: (frame: SharedRendererNativeRenderFrameInput) => SharedRendererNativeRenderFramePresentationResult;
      presentVideoFrameScene: (scene: SharedRendererVideoFrameSceneInput) => SharedRendererVideoFrameScenePresentationResult;
      presentExternalVideoFrameScene: (scene: SharedRendererExternalVideoFrameSceneInput) => SharedRendererVideoFrameScenePresentationResult;
      readPresentedFrameRgbaBytes: (input: SharedRendererPresentedFrameReadbackInput) => Promise<SharedRendererPresentedFrameReadbackResult>;
      takePresentedFrameSharedFrame: (input: SharedRendererPresentedFrameSharedFrameInput) => Promise<RustBackendVideoEncodeWriteFramePayload>;
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
  bufferUsageMapRead?: number;
  textureUsageCopySrc?: number;
  textureUsageTextureBinding?: number;
  textureUsageTextureCopyDst?: number;
  solidColourVertexSceneBuilder?: SharedRendererSolidColourVertexSceneBuilder;
  videoPlaneVertexSceneBuilder?: SharedRendererVideoPlaneVertexSceneBuilder;
  presentedFrameSharedFrameTaker?: SharedRendererPresentedFrameSharedFrameTaker;
  onDeviceLost?: (event: SharedRendererDeviceLostEvent) => void;
  isStartCurrent?: () => boolean;
}

export type SharedRendererPresentedFrameSharedFrameTaker = (
  input: SharedRendererPresentedFrameNativeHandoffInput
) => Promise<RustBackendVideoEncodeWriteFramePayload | null>;

export interface SharedRendererPresentedFrameReadbackInput {
  width: number;
  height: number;
}

export interface SharedRendererPresentedFrameReadbackResult {
  rgbaBytes: Uint8Array;
  strideBytes: number;
  byteLen: number;
  width: number;
  height: number;
}

export interface SharedRendererPresentedFrameSharedFrameInput {
  encodeSessionId: string;
  memoryId: string;
  frameIndex: number;
  timestampUs: number;
  width: number;
  height: number;
  fps: number;
}

export interface SharedRendererPresentedFrameNativeHandoffInput extends SharedRendererPresentedFrameSharedFrameInput {
  device: unknown;
  texture: unknown;
  format: string;
  canvasSize: {
    width: number;
    height: number;
  };
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

export interface SharedRendererNativeRenderFrameInput {
  texture: unknown;
}

export type SharedRendererNativeRenderFramePresentationResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      reason: 'nativeRenderTextureViewUnavailable' | 'webGpuDrawUnavailable';
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

export interface SharedRendererExternalVideoFrameSceneInput {
  snapshot: RustSceneSnapshot;
  media: RustSceneMediaReference[];
  source?: unknown;
  sourcesByClipId?: ReadonlyMap<string, unknown>;
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
  bufferUsageMapRead = defaultMapReadBufferUsage(),
  textureUsageCopySrc = defaultTextureCopySrcUsage(),
  textureUsageTextureBinding = defaultTextureBindingUsage(),
  textureUsageTextureCopyDst = defaultTextureCopyDstUsage(),
  solidColourVertexSceneBuilder = buildSharedRendererSolidColourVertexScene,
  videoPlaneVertexSceneBuilder = buildSharedRendererVideoPlaneVertexScene,
  presentedFrameSharedFrameTaker,
  onDeviceLost,
  isStartCurrent,
}: SharedRendererWebGpuPresenterInput): Promise<SharedRendererWebGpuPresenterResult> => {
  assertPresenterStartCurrent(isStartCurrent);

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

  let cachedDevice: CachedWebGpuDevice | null;
  try {
    cachedDevice = await resolveCachedWebGpuDevice(gpu);
  } catch {
    return {
      ok: false,
      reason: 'deviceRequestFailed',
      detail: 'WebGPU device request failed for the shared renderer presenter.',
    };
  }
  assertPresenterStartCurrent(isStartCurrent);
  if (!cachedDevice) {
    return {
      ok: false,
      reason: 'adapterUnavailable',
      detail: 'WebGPU adapter is unavailable for the shared renderer presenter.',
    };
  }

  const device = cachedDevice.device;

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
    usage: textureUsageRenderAttachment | textureUsageCopySrc,
    colorSpace: presentationContract.canvas.colorSpace,
    alphaMode: presentationContract.canvas.alphaMode,
  });

  let disposed = false;

  const dispose = async () => {
    disposed = true;
  };

  const canUsePresenter = (): boolean =>
    !disposed && isPresenterStartCurrent(isStartCurrent);

  const disposedDrawUnavailable = (surface: string) => ({
    ok: false as const,
    reason: 'webGpuDrawUnavailable' as const,
    detail: `Shared renderer ${surface} presentation was skipped because the presenter is no longer current.`,
  });

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

  let lastPresentedTexture: unknown | null = null;
  const presentSolidSrgbSwatch = (swatch: SharedRendererSolidSrgbSwatch) => {
    if (!canUsePresenter()) return;
    if (!context.getCurrentTexture || !device.createCommandEncoder || !device.queue) return;

    const encoder = device.createCommandEncoder();
    const targetTexture = context.getCurrentTexture();
    lastPresentedTexture = targetTexture;
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: targetTexture.createView(),
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
  let externalVideoFramePipeline: unknown | null = null;
  let nativeRenderFramePipeline: unknown | null = null;
  const presentSolidColourScene = ({
    snapshot,
    media,
    solidColourObjectIds,
  }: SharedRendererSolidColourSceneInput): SharedRendererSolidColourScenePresentationResult => {
    if (!canUsePresenter()) return disposedDrawUnavailable('solid colour');

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
      const targetTexture = context.getCurrentTexture();
      lastPresentedTexture = targetTexture;
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: targetTexture.createView(),
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
    const targetTexture = context.getCurrentTexture();
    lastPresentedTexture = targetTexture;
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: targetTexture.createView(),
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
    if (!canUsePresenter()) {
      return {
        ok: false,
        reason: 'webGpuUploadUnavailable',
        detail: 'Shared renderer video texture upload was skipped because the presenter is no longer current.',
      };
    }
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
    if (!canUsePresenter()) return disposedDrawUnavailable('video frame');

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
    const createVideoBindGroup = device.createBindGroup.bind(device);
    const bindGroups = drawablePlanes.map((plane) => createVideoBindGroup({
      layout: pipelineBindGroupLayout(videoFramePipeline, 0),
      entries: [
        { binding: 0, resource: sampler },
        { binding: 1, resource: plane.textureView },
      ],
    }));

    const encoder = device.createCommandEncoder();
    const targetTexture = context.getCurrentTexture();
    lastPresentedTexture = targetTexture;
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: targetTexture.createView(),
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

  const presentExternalVideoFrameScene = ({
    snapshot,
    media,
    source,
    sourcesByClipId,
    videoObjectIds,
  }: SharedRendererExternalVideoFrameSceneInput): SharedRendererVideoFrameScenePresentationResult => {
    if (!canUsePresenter()) return disposedDrawUnavailable('external video frame');

    const vertexScene = videoPlaneVertexSceneBuilder({
      snapshot,
      media,
      canvas: { width: canvas.width, height: canvas.height },
    });
    if (!vertexScene.ok) {
      return {
        ok: false,
        reason: 'unsupportedVideoScene',
        detail: 'Shared renderer could not build an external video plane scene.',
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
      || !device.importExternalTexture
    ) {
      return {
        ok: false,
        reason: 'webGpuDrawUnavailable',
        detail: 'WebGPU device does not expose the external texture APIs needed for low-copy video presentation.',
      };
    }

    if (!externalVideoFramePipeline) {
      const shader = device.createShaderModule({
        code: externalVideoFrameShaderCode,
      });
      externalVideoFramePipeline = device.createRenderPipeline({
        label: 'external-video-frame-pipeline',
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

    const drawablePlanes: Array<{
      index: number;
      externalTexture: unknown;
    }> = [];
    for (const [index, plane] of vertexScene.planes.entries()) {
      if (videoObjectIds && !videoObjectIds.has(plane.clipId)) {
        continue;
      }
      const planeSource = sourcesByClipId
        ? sourcesByClipId.get(plane.clipId)
        : source;
      if (!planeSource) continue;
      // A freshly loaded or just-sought HTMLVideoElement may not yet hold a
      // decoded current frame ("back resource"); importExternalTexture throws
      // synchronously in that case. Treat it as a not-ready plane and skip it so
      // the presenter never throws — the next repaint recovers once the frame is
      // available.
      let externalTexture: unknown;
      try {
        externalTexture = device.importExternalTexture({ source: planeSource });
      } catch {
        continue;
      }
      drawablePlanes.push({
        index,
        externalTexture,
      });
    }
    if (drawablePlanes.length === 0) {
      return {
        ok: false,
        reason: 'videoTextureViewUnavailable',
        detail: 'No ready external video source was available for the video plane scene.',
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
    const createVideoBindGroup = device.createBindGroup.bind(device);
    const bindGroups = drawablePlanes.map((plane) => createVideoBindGroup({
      layout: pipelineBindGroupLayout(externalVideoFramePipeline, 0),
      entries: [
        { binding: 0, resource: sampler },
        { binding: 1, resource: plane.externalTexture },
      ],
    }));

    const encoder = device.createCommandEncoder();
    const targetTexture = context.getCurrentTexture();
    lastPresentedTexture = targetTexture;
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: targetTexture.createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });
    pass.setPipeline?.(externalVideoFramePipeline);
    if (sourcesByClipId || videoObjectIds) {
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

  const presentNativeRenderFrame = ({
    texture,
  }: SharedRendererNativeRenderFrameInput): SharedRendererNativeRenderFramePresentationResult => {
    if (!canUsePresenter()) return disposedDrawUnavailable('native render frame');

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
        detail: 'WebGPU device does not expose the draw APIs needed for native render frame presentation.',
      };
    }

    const textureView = createTextureView(texture);
    if (!textureView.ok) {
      return {
        ok: false,
        reason: 'nativeRenderTextureViewUnavailable',
        detail: 'Uploaded native render texture does not expose createView().',
      };
    }

    if (!nativeRenderFramePipeline) {
      const shader = device.createShaderModule({
        code: videoFrameShaderCode,
      });
      nativeRenderFramePipeline = device.createRenderPipeline({
        label: 'native-render-frame-pipeline',
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

    const vertices = fullscreenTextureVertices();
    const vertexBuffer = device.createBuffer({
      label: 'native-render-frame-vertex-buffer',
      size: vertices.byteLength,
      usage: bufferUsageVertex | bufferUsageCopyDst,
    });
    device.queue.writeBuffer(vertexBuffer, 0, vertices);

    const sampler = device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      mipmapFilter: 'nearest',
    });
    const bindGroup = device.createBindGroup({
      layout: pipelineBindGroupLayout(nativeRenderFramePipeline, 0),
      entries: [
        { binding: 0, resource: sampler },
        { binding: 1, resource: textureView.value },
      ],
    });

    const encoder = device.createCommandEncoder();
    const targetTexture = context.getCurrentTexture();
    lastPresentedTexture = targetTexture;
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: targetTexture.createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });
    pass.setPipeline?.(nativeRenderFramePipeline);
    pass.setBindGroup?.(0, bindGroup);
    pass.setVertexBuffer?.(0, vertexBuffer);
    pass.draw?.(6);
    pass.end();
    device.queue.submit([encoder.finish()]);

    return {
      ok: true,
    };
  };

  const readPresentedFrameRgbaBytes = async ({
    width,
    height,
  }: SharedRendererPresentedFrameReadbackInput): Promise<SharedRendererPresentedFrameReadbackResult> => {
    if (!canUsePresenter()) {
      throw new Error('Shared renderer frame readback was skipped because the presenter is no longer current.');
    }
    if (!lastPresentedTexture) {
      throw new Error('No shared renderer frame has been presented for WebGPU readback.');
    }
    if (!device.createBuffer || !device.createCommandEncoder || !device.queue) {
      throw new Error('WebGPU device does not expose the buffer copy APIs needed for presented frame readback.');
    }
    const encoder = device.createCommandEncoder();
    if (!encoder.copyTextureToBuffer) {
      throw new Error('WebGPU command encoder does not expose copyTextureToBuffer for presented frame readback.');
    }

    const rowBytes = width * 4;
    const strideBytes = alignTo(rowBytes, 256);
    const byteLen = strideBytes * height;
    const readbackBuffer = device.createBuffer({
      label: 'shared-renderer-presented-frame-readback',
      size: byteLen,
      usage: bufferUsageMapRead | bufferUsageCopyDst,
    });
    encoder.copyTextureToBuffer(
      { texture: lastPresentedTexture },
      {
        buffer: readbackBuffer,
        bytesPerRow: strideBytes,
        rowsPerImage: height,
      },
      {
        width,
        height,
        depthOrArrayLayers: 1,
      }
    );
    device.queue.submit([encoder.finish()]);
    await device.queue.onSubmittedWorkDone?.();

    const readableBuffer = asReadableGpuBuffer(readbackBuffer);
    if (!readableBuffer) {
      throw new Error('WebGPU readback buffer does not expose mapAsync/getMappedRange.');
    }
    await readableBuffer.mapAsync(defaultMapReadMode());
    const mappedRange = readableBuffer.getMappedRange();
    const rgbaBytes = new Uint8Array(mappedRange.slice(0));
    readableBuffer.unmap();
    readableBuffer.destroy?.();

    return {
      rgbaBytes,
      strideBytes,
      byteLen,
      width,
      height,
    };
  };

  const takePresentedFrameSharedFrame = async (
    input: SharedRendererPresentedFrameSharedFrameInput
  ): Promise<RustBackendVideoEncodeWriteFramePayload> => {
    if (!canUsePresenter()) {
      throw new Error('Shared renderer native frame handoff was skipped because the presenter is no longer current.');
    }
    if (presentedFrameSharedFrameTaker) {
      if (!lastPresentedTexture) {
        throw new Error('No shared renderer frame has been presented for native frame handoff.');
      }
      const payload = await presentedFrameSharedFrameTaker({
        ...input,
        device,
        texture: lastPresentedTexture,
        format,
        canvasSize: {
          width: surfaceGate.canvas.width,
          height: surfaceGate.canvas.height,
        },
      });
      if (payload) {
        return payload;
      }
    }

    throw new Error('Native presented-frame handoff is required for shared-frame export encoding.');
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
    presentNativeRenderFrame,
    presentVideoFrameScene,
    presentExternalVideoFrameScene,
    readPresentedFrameRgbaBytes,
    takePresentedFrameSharedFrame,
  };
};

const externalVideoFrameShaderCode = `
struct VertexOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) opacity: f32,
};

@group(0) @binding(0) var videoSampler: sampler;
@group(0) @binding(1) var videoTexture: texture_external;

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
  let colour = textureSampleBaseClampToEdge(videoTexture, videoSampler, in.uv);
  return vec4<f32>(colour.rgb, in.opacity);
}
`;

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
  return vec4<f32>(colour.rgb, in.opacity);
}
`;

const fullscreenTextureVertices = (): Float32Array => new Float32Array([
  -1, -1, 0, 1, 1, 0, 0, 0,
  1, -1, 1, 1, 1, 0, 0, 0,
  -1, 1, 0, 0, 1, 0, 0, 0,
  -1, 1, 0, 0, 1, 0, 0, 0,
  1, -1, 1, 1, 1, 0, 0, 0,
  1, 1, 1, 0, 1, 0, 0, 0,
]);

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
  return {
    getPreferredCanvasFormat: gpu.getPreferredCanvasFormat.bind(gpu),
    requestAdapter: gpu.requestAdapter.bind(gpu) as SharedRendererWebGpuLike['requestAdapter'],
  };
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

const defaultMapReadBufferUsage = (): number => {
  const bufferUsage = (globalThis as unknown as { GPUBufferUsage?: { MAP_READ?: number } }).GPUBufferUsage;
  return bufferUsage?.MAP_READ ?? 0x1;
};

const defaultTextureCopySrcUsage = (): number => {
  const textureUsage = (globalThis as unknown as { GPUTextureUsage?: { COPY_SRC?: number } }).GPUTextureUsage;
  return textureUsage?.COPY_SRC ?? 0x1;
};

const defaultTextureBindingUsage = (): number => {
  const textureUsage = (globalThis as unknown as { GPUTextureUsage?: { TEXTURE_BINDING?: number } }).GPUTextureUsage;
  return textureUsage?.TEXTURE_BINDING ?? 0x4;
};

const defaultTextureCopyDstUsage = (): number => {
  const textureUsage = (globalThis as unknown as { GPUTextureUsage?: { COPY_DST?: number } }).GPUTextureUsage;
  return textureUsage?.COPY_DST ?? 0x2;
};

const defaultMapReadMode = (): number => {
  const mapMode = (globalThis as unknown as { GPUMapMode?: { READ?: number } }).GPUMapMode;
  return mapMode?.READ ?? 0x1;
};

const isPresenterStartCurrent = (isStartCurrent: (() => boolean) | undefined): boolean =>
  isStartCurrent ? isStartCurrent() : true;

const assertPresenterStartCurrent = (isStartCurrent: (() => boolean) | undefined): void => {
  if (!isPresenterStartCurrent(isStartCurrent)) {
    throw new Error('Shared renderer presenter start was cancelled.');
  }
};

const alignTo = (value: number, alignment: number): number =>
  Math.ceil(value / alignment) * alignment;

interface ReadableGpuBuffer {
  mapAsync: (mode: number) => Promise<void>;
  getMappedRange: () => ArrayBuffer;
  unmap: () => void;
  destroy?: () => void;
}

const asReadableGpuBuffer = (buffer: unknown): ReadableGpuBuffer | null => {
  if (
    typeof buffer === 'object'
    && buffer !== null
    && 'mapAsync' in buffer
    && typeof buffer.mapAsync === 'function'
    && 'getMappedRange' in buffer
    && typeof buffer.getMappedRange === 'function'
    && 'unmap' in buffer
    && typeof buffer.unmap === 'function'
  ) {
    return buffer as ReadableGpuBuffer;
  }

  return null;
};

const deviceLostMessage = (info: unknown): string => {
  if (typeof info === 'object' && info !== null && 'message' in info) {
    const message = (info as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return 'WebGPU device was lost.';
};
