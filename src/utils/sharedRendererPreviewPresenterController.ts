import type { SharedRendererPreviewSession } from './sharedRendererPreviewSession';
import type { SharedRendererSolidColourVertexSceneBuilder } from './sharedRendererSolidColourScene';
import {
  buildSharedRendererVideoPlaneVertexScene,
  type SharedRendererVideoPlaneVertexSceneBuilder,
} from './sharedRendererVideoPlaneScene';
import {
  buildSharedRendererVideoFrameDecodeRequests,
  type SharedRendererVideoFrameDecodeRequestBuilder,
} from './sharedRendererVideoDecodeRequest';
import {
  createSharedRendererWebGpuPresenter,
  type SharedRendererSolidSrgbSwatch,
  type SharedRendererWebGpuLike,
} from './sharedRendererWebGpuPresenter';
import { loadSharedRendererRustSolidColourVertexSceneBuilder } from './sharedRendererRustSolidColourScene';
import { loadSharedRendererRustVideoFrameDecodeRequestBuilder } from './sharedRendererRustVideoDecodeRequest';
import { loadSharedRendererRustVideoPlaneVertexSceneBuilder } from './sharedRendererRustVideoPlaneScene';
import {
  writeSharedRendererPresenterDiagnostics,
  type SharedRendererPresenterDiagnosticState,
} from './sharedRendererPresenterDiagnostics';
import {
  buildSharedRendererVideoOwnership,
  type SharedRendererVideoOwnership,
} from './sharedRendererVideoOwnership';

export const SHARED_RENDERER_SOLID_SWATCH: SharedRendererSolidSrgbSwatch = {
  red: 0.25,
  green: 0.5,
  blue: 0.75,
  alpha: 1,
};

export const getSharedRendererSolidSwatchCssColour = (): string => {
  const red = Math.round(SHARED_RENDERER_SOLID_SWATCH.red * 255);
  const green = Math.round(SHARED_RENDERER_SOLID_SWATCH.green * 255);
  const blue = Math.round(SHARED_RENDERER_SOLID_SWATCH.blue * 255);
  return `rgb(${red}, ${green}, ${blue})`;
};

type PresenterDataset = Record<string, string | undefined>;

export type SharedRendererPreviewPresenterControl =
  | {
      ok: true;
      format: string;
      videoOwnership: SharedRendererVideoOwnership;
      dispose: () => void;
    }
  | {
      ok: false;
      reason: string;
      dispose: () => void;
    };

export interface StartSharedRendererPreviewPresenterInput {
  canvas: HTMLCanvasElement;
  session: SharedRendererPreviewSession;
  datasets: PresenterDataset[];
  gpu?: SharedRendererWebGpuLike;
  textureUsageRenderAttachment?: number;
  bufferUsageVertex?: number;
  bufferUsageCopyDst?: number;
  diagnosticSwatchEnabled?: boolean;
  rustSolidColourWasmEnabled?: boolean;
  rustSolidColourVertexSceneBuilder?: SharedRendererSolidColourVertexSceneBuilder;
  rustVideoPlaneWasmEnabled?: boolean;
  rustVideoPlaneVertexSceneBuilder?: SharedRendererVideoPlaneVertexSceneBuilder;
  rustVideoFrameDecodeRequestWasmEnabled?: boolean;
  rustVideoFrameDecodeRequestBuilder?: SharedRendererVideoFrameDecodeRequestBuilder;
  sharedRendererVideoCutoverEnabled?: boolean;
  sharedRendererVideoFrameUploadReady?: boolean;
}

export const startSharedRendererPreviewPresenter = async ({
  canvas,
  session,
  datasets,
  gpu,
  textureUsageRenderAttachment,
  bufferUsageVertex,
  bufferUsageCopyDst,
  diagnosticSwatchEnabled = true,
  rustSolidColourWasmEnabled = defaultRustSolidColourWasmEnabled(),
  rustSolidColourVertexSceneBuilder,
  rustVideoPlaneWasmEnabled = defaultRustVideoPlaneWasmEnabled(),
  rustVideoPlaneVertexSceneBuilder,
  rustVideoFrameDecodeRequestWasmEnabled = defaultRustVideoFrameDecodeRequestWasmEnabled(),
  rustVideoFrameDecodeRequestBuilder,
  sharedRendererVideoCutoverEnabled = defaultSharedRendererVideoCutoverEnabled(),
  sharedRendererVideoFrameUploadReady = false,
}: StartSharedRendererPreviewPresenterInput): Promise<SharedRendererPreviewPresenterControl> => {
  const writeDiagnostics = (state: SharedRendererPresenterDiagnosticState) => {
    datasets.forEach((dataset) => {
      writeSharedRendererPresenterDiagnostics(dataset, state);
    });
  };

  if (!session.surfaceGate.ok) {
    writeDiagnostics({
      status: 'fallback',
      reason: session.surfaceGate.reason,
    });
    return {
      ok: false,
      reason: session.surfaceGate.reason,
      dispose: noop,
    };
  }

  const hasSolidColourScene = hasSolidColourClip(session);
  const resolvedRustSolidColourVertexSceneBuilder = hasSolidColourScene
    ? rustSolidColourVertexSceneBuilder
      ?? await loadSharedRendererRustSolidColourVertexSceneBuilder({
        enabled: rustSolidColourWasmEnabled,
      })
    : null;
  const solidColourGeometrySource = hasSolidColourScene
    ? resolvedRustSolidColourVertexSceneBuilder
      ? 'rust-wasm'
      : 'typescript'
    : undefined;
  const hasVideoScene = hasVideoClip(session);
  const resolvedRustVideoPlaneVertexSceneBuilder = hasVideoScene
    ? rustVideoPlaneVertexSceneBuilder
      ?? await loadSharedRendererRustVideoPlaneVertexSceneBuilder({
        enabled: rustVideoPlaneWasmEnabled,
      })
    : null;
  if (hasVideoScene) {
    const videoPlaneVertexSceneBuilder = resolvedRustVideoPlaneVertexSceneBuilder
      ?? buildSharedRendererVideoPlaneVertexScene;
    videoPlaneVertexSceneBuilder({
      snapshot: session.surfaceGate.snapshot,
      media: session.surfaceGate.media,
      canvas: session.surfaceGate.canvas,
    });
  }
  const videoGeometrySource = hasVideoScene
    ? resolvedRustVideoPlaneVertexSceneBuilder
      ? 'rust-wasm'
      : 'typescript'
    : undefined;
  const resolvedRustVideoFrameDecodeRequestBuilder = hasVideoScene
    ? rustVideoFrameDecodeRequestBuilder
      ?? await loadSharedRendererRustVideoFrameDecodeRequestBuilder({
        enabled: rustVideoFrameDecodeRequestWasmEnabled,
      })
    : null;
  const videoFrameDecodeRequestBuilder = hasVideoScene
    ? resolvedRustVideoFrameDecodeRequestBuilder
      ?? buildSharedRendererVideoFrameDecodeRequests
    : null;
  const videoDecodeRequestResult = videoFrameDecodeRequestBuilder
    ? videoFrameDecodeRequestBuilder({
      snapshot: session.surfaceGate.snapshot,
      media: session.surfaceGate.media,
    })
    : null;
  const videoDecodeRequestSource = hasVideoScene
    ? resolvedRustVideoFrameDecodeRequestBuilder
      ? 'rust-wasm'
      : 'typescript'
    : undefined;
  const videoDecodeRequestCount = videoDecodeRequestResult?.ok
    ? videoDecodeRequestResult.requestCount
    : undefined;
  const videoOwnership = buildSharedRendererVideoOwnership({
    cutoverEnabled: sharedRendererVideoCutoverEnabled,
    hasVideoScene,
    videoDecodeRequestSource,
    videoDecodeRequestResult,
    videoFrameUploadReady: sharedRendererVideoFrameUploadReady,
  });

  const presenter = await createSharedRendererWebGpuPresenter({
    canvas,
    surfaceGate: session.surfaceGate,
    presentationContract: session.presentationContract,
    gpu,
    textureUsageRenderAttachment,
    bufferUsageVertex,
    bufferUsageCopyDst,
    solidColourVertexSceneBuilder: resolvedRustSolidColourVertexSceneBuilder ?? undefined,
    onDeviceLost: (event) => {
      writeDiagnostics({
        status: 'deviceLost',
        reason: 'deviceLost',
        staleSharedFrameAllowed: event.staleSharedFrameAllowed,
      });
    },
  });

  if (!presenter.ok) {
    writeDiagnostics({
      status: 'fallback',
      reason: presenter.reason,
    });
    return {
      ok: false,
      reason: presenter.reason,
      dispose: noop,
    };
  }

  const shouldPassThroughToPixi = !hasSolidColourScene && !diagnosticSwatchEnabled;
  if (hasSolidColourScene || shouldPassThroughToPixi) {
    const presentation = presenter.presentSolidColourScene({
      snapshot: session.surfaceGate.snapshot,
      media: session.surfaceGate.media,
    });
    if (!presentation.ok) {
      writeDiagnostics({
        status: 'fallback',
        reason: presentation.reason,
      });
      return {
        ok: false,
        reason: presentation.reason,
        dispose: presenter.dispose,
      };
    }
  } else {
    presenter.presentSolidSrgbSwatch(SHARED_RENDERER_SOLID_SWATCH);
  }

  writeDiagnostics({
    status: 'ready',
    format: presenter.format,
    geometrySource: solidColourGeometrySource,
    videoGeometrySource,
    videoDecodeRequestSource,
    videoDecodeRequestCount,
    videoOwner: hasVideoScene ? videoOwnership.owner : undefined,
    videoCutoverReason: hasVideoScene ? videoOwnership.reason : undefined,
    sharedVideoObjectCount: hasVideoScene ? videoOwnership.videoObjectIds.length : undefined,
    swatch: hasSolidColourScene
      ? 'solid-colour-scene'
      : diagnosticSwatchEnabled
        ? 'solid-srgb'
        : 'pixi-passthrough',
  });

  return {
    ok: true,
    format: presenter.format,
    videoOwnership,
    dispose: presenter.dispose,
  };
};

const noop = () => undefined;

const defaultRustSolidColourWasmEnabled = (): boolean =>
  import.meta.env.VITE_UXFD_SHARED_RENDERER_RUST_SHAPES !== '0';

const defaultRustVideoPlaneWasmEnabled = (): boolean =>
  import.meta.env.VITE_UXFD_SHARED_RENDERER_RUST_VIDEO !== '0';

const defaultRustVideoFrameDecodeRequestWasmEnabled = (): boolean =>
  import.meta.env.VITE_UXFD_SHARED_RENDERER_RUST_VIDEO !== '0';

const defaultSharedRendererVideoCutoverEnabled = (): boolean =>
  import.meta.env.VITE_UXFD_SHARED_RENDERER_VIDEO_CUTOVER === '1';

const hasSolidColourClip = (session: SharedRendererPreviewSession): boolean => {
  if (!session.surfaceGate.ok) return false;

  const mediaKindById = new Map(session.surfaceGate.media.map((reference) => [reference.id, reference.kind]));
  return session.surfaceGate.snapshot.clips.some((clip) => mediaKindById.get(clip.media_id) === 'SolidColour');
};

const hasVideoClip = (session: SharedRendererPreviewSession): boolean => {
  if (!session.surfaceGate.ok) return false;

  const mediaKindById = new Map(session.surfaceGate.media.map((reference) => [reference.id, reference.kind]));
  return session.surfaceGate.snapshot.clips.some((clip) => mediaKindById.get(clip.media_id) === 'Video');
};
