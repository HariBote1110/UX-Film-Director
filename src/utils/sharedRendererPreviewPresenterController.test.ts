import { describe, expect, it } from 'vitest';
import { buildSharedRendererPresentationContract } from './sharedRendererPresentationContract';
import {
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

describe('startSharedRendererPreviewPresenter', () => {
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
  onSubmit = () => undefined,
  lost = new Promise(() => undefined),
}: {
  onRenderPass?: (descriptor: unknown) => void;
  onSubmit?: (commandBuffers: unknown[]) => void;
  lost?: Promise<unknown>;
} = {}) => ({
  lost,
  queue: {
    submit: onSubmit,
  },
  createCommandEncoder: () => ({
    beginRenderPass: (descriptor: unknown) => {
      onRenderPass(descriptor);
      return {
        end: () => undefined,
      };
    },
    finish: () => 'finished-command-buffer',
  }),
});
