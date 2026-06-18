import type { EditorMode, LayerState, ProjectSettings } from '../types';
import {
  createSharedRendererExportFrameSource,
  type CreateSharedRendererExportFrameSourceInput,
} from './sharedRendererExportFrameSource';
import type { ProjectExportRustFrameSource } from './projectExportFrameCanvas';

export interface BuildViewportRustExportFrameSourceInput {
  exportEnabled: boolean;
  canvas: HTMLCanvasElement | null;
  projectSettings: ProjectSettings;
  layers: LayerState[];
  editorMode: EditorMode;
  webGpuAvailable: boolean;
  fallbackAdapter: boolean;
  videoCutoverEnabled: boolean;
  createFrameSource?: (
    input: CreateSharedRendererExportFrameSourceInput
  ) => ProjectExportRustFrameSource;
}

export const buildViewportRustExportFrameSource = ({
  exportEnabled,
  canvas,
  projectSettings,
  layers,
  editorMode,
  webGpuAvailable,
  fallbackAdapter,
  videoCutoverEnabled,
  createFrameSource = createSharedRendererExportFrameSource,
}: BuildViewportRustExportFrameSourceInput): ProjectExportRustFrameSource | null => {
  if (!exportEnabled) return null;
  if (!canvas) return null;
  if (editorMode !== '2d') return null;
  if (!webGpuAvailable) return null;
  if (fallbackAdapter) return null;
  if (!videoCutoverEnabled) return null;

  return createFrameSource({
    canvas,
    projectSettings,
    layers,
    editorMode,
    webGpuAvailable,
    fallbackAdapter,
    videoCutoverEnabled,
  });
};
