import type { SharedRendererPreviewSession } from './sharedRendererPreviewSession';
import { buildSharedRendererSolidColourDrawList } from './sharedRendererSolidColourScene';
import {
  createSharedRendererWebGpuPresenter,
  type SharedRendererSolidSrgbSwatch,
  type SharedRendererWebGpuLike,
} from './sharedRendererWebGpuPresenter';
import {
  writeSharedRendererPresenterDiagnostics,
  type SharedRendererPresenterDiagnosticState,
} from './sharedRendererPresenterDiagnostics';

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

  const presenter = await createSharedRendererWebGpuPresenter({
    canvas,
    surfaceGate: session.surfaceGate,
    presentationContract: session.presentationContract,
    gpu,
    textureUsageRenderAttachment,
    bufferUsageVertex,
    bufferUsageCopyDst,
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

  const solidColourDrawList = buildSharedRendererSolidColourDrawList({
    snapshot: session.surfaceGate.snapshot,
    media: session.surfaceGate.media,
    canvas: session.surfaceGate.canvas,
  });
  if (!solidColourDrawList.ok) {
    writeDiagnostics({
      status: 'fallback',
      reason: solidColourDrawList.reason,
    });
    return {
      ok: false,
      reason: solidColourDrawList.reason,
      dispose: presenter.dispose,
    };
  }

  const hasSolidColourScene = solidColourDrawList.rects.length > 0;
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
    swatch: hasSolidColourScene
      ? 'solid-colour-scene'
      : diagnosticSwatchEnabled
        ? 'solid-srgb'
        : 'pixi-passthrough',
  });

  return {
    ok: true,
    format: presenter.format,
    dispose: presenter.dispose,
  };
};

const noop = () => undefined;
