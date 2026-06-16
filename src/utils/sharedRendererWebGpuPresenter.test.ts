import { describe, expect, it } from 'vitest';
import {
  createSharedRendererWebGpuPresenter,
  type SharedRendererWebGpuAdapterLike,
  type SharedRendererWebGpuLike,
} from './sharedRendererWebGpuPresenter';
import { buildSharedRendererPresentationContract } from './sharedRendererPresentationContract';
import type { RustSceneSnapshot } from './rustSceneSnapshot';
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
});

const fakeCanvas = (getContext: () => unknown) =>
  ({
    width: 0,
    height: 0,
    getContext,
  }) as unknown as HTMLCanvasElement;

const fakeContext = (configure: (configuration: unknown) => void = () => undefined) => ({
  configure,
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
}: {
  lost?: Promise<unknown>;
} = {}) => ({
  device: {
    lost,
  },
  requestDevice: async () => ({
    lost,
  }),
});
