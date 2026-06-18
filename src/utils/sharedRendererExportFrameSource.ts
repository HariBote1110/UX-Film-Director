import type { EditorMode, LayerState, ProjectSettings } from '../types';
import type {
  ProjectExportRustFrameSource,
} from './projectExportFrameCanvas';
import {
  buildSharedRendererExportSession,
} from './sharedRendererExportSession';
import {
  startSharedRendererViewportPresenter,
  type StartSharedRendererViewportPresenterInput,
  type StartSharedRendererViewportPresenterResult,
} from './sharedRendererViewportPresenterOrchestration';
import type { SharedRendererViewportVideoDecodeJob } from './sharedRendererViewportVideoUpload';

type PresenterDataset = Record<string, string | undefined>;

export type SharedRendererExportFrameBitmapFactory = (
  canvas: HTMLCanvasElement,
  sx: number,
  sy: number,
  sw: number,
  sh: number
) => Promise<ImageBitmap>;

export type SharedRendererExportSessionBuilder = typeof buildSharedRendererExportSession;

export type SharedRendererExportViewportPresenterStarter = (
  input: StartSharedRendererViewportPresenterInput
) => Promise<StartSharedRendererViewportPresenterResult>;

export interface CreateSharedRendererExportFrameSourceInput {
  canvas: HTMLCanvasElement;
  projectSettings: ProjectSettings;
  layers: LayerState[];
  editorMode: EditorMode;
  webGpuAvailable: boolean;
  fallbackAdapter: boolean;
  videoCutoverEnabled: boolean;
  datasets?: PresenterDataset[];
  buildExportSession?: SharedRendererExportSessionBuilder;
  startViewportPresenter?: SharedRendererExportViewportPresenterStarter;
  createFrameBitmap?: SharedRendererExportFrameBitmapFactory;
}

export const createSharedRendererExportFrameSource = ({
  canvas,
  projectSettings,
  layers,
  editorMode,
  webGpuAvailable,
  fallbackAdapter,
  videoCutoverEnabled,
  datasets = [canvas.dataset as unknown as PresenterDataset],
  buildExportSession = buildSharedRendererExportSession,
  startViewportPresenter = startSharedRendererViewportPresenter,
  createFrameBitmap = defaultCreateFrameBitmap,
}: CreateSharedRendererExportFrameSourceInput): ProjectExportRustFrameSource => {
  let activeVideoDecodeJobs: SharedRendererViewportVideoDecodeJob[] = [];
  let requestId = 0;

  return {
    renderFrame: async (request) => {
      const session = buildExportSession({
        enabled: true,
        projectSettings,
        layers,
        objects: [...request.objects],
        time: request.time,
        editorMode,
        webGpuAvailable,
        fallbackAdapter,
      });
      const surfaceGate = session.surfaceGate;
      if (!surfaceGate.ok) {
        throw new Error(surfaceGate.detail);
      }

      if (canvas.width !== surfaceGate.canvas.width) {
        canvas.width = surfaceGate.canvas.width;
      }
      if (canvas.height !== surfaceGate.canvas.height) {
        canvas.height = surfaceGate.canvas.height;
      }

      const presenterResult = await startViewportPresenter({
        canvas,
        session,
        datasets,
        diagnosticSwatchEnabled: false,
        videoCutoverEnabled,
        activeVideoDecodeJob: activeVideoDecodeJobs[0] ?? null,
        activeVideoDecodeJobs,
        requestId: (requestId += 1),
        onVideoDecodeJobsResolved: (jobs) => {
          activeVideoDecodeJobs = jobs;
        },
        onVideoDecodeJobResolved: (job) => {
          activeVideoDecodeJobs = job ? [job] : [];
        },
      });
      activeVideoDecodeJobs = presenterResult.activeVideoDecodeJobs;

      try {
        return await createFrameBitmap(
          canvas,
          0,
          0,
          request.width,
          request.height
        );
      } finally {
        presenterResult.control.dispose();
      }
    },
  };
};

const defaultCreateFrameBitmap: SharedRendererExportFrameBitmapFactory = (
  canvas,
  sx,
  sy,
  sw,
  sh
) => createImageBitmap(canvas, sx, sy, sw, sh);
