import type { SharedRendererPresentationContract } from './sharedRendererPresentationContract';
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
}

export interface SharedRendererWebGpuCanvasContextLike {
  configure: (configuration: {
    device: SharedRendererWebGpuDeviceLike;
    format: string;
    usage: number;
    colorSpace: 'srgb';
    alphaMode: 'premultiplied';
  }) => void;
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

export interface SharedRendererWebGpuPresenterInput {
  canvas: WebGpuCanvasLike;
  surfaceGate: SharedRendererPreviewSurfaceGate;
  presentationContract: SharedRendererPresentationContract;
  gpu?: SharedRendererWebGpuLike;
  textureUsageRenderAttachment?: number;
  onDeviceLost?: (event: SharedRendererDeviceLostEvent) => void;
}

export const createSharedRendererWebGpuPresenter = async ({
  canvas,
  surfaceGate,
  presentationContract,
  gpu = defaultGpu(),
  textureUsageRenderAttachment = defaultRenderAttachmentUsage(),
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
  };
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

const deviceLostMessage = (info: unknown): string => {
  if (typeof info === 'object' && info !== null && 'message' in info) {
    const message = (info as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return 'WebGPU device was lost.';
};
