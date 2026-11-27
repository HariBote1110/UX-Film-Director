import type { EditorMode, LayerState, ProjectSettings, TimelineObject } from '../types';
import type { SharedRendererPreviewPlan } from './sharedRendererPreviewBridge';
import {
  type SharedRendererPreviewSurfaceGate,
} from './sharedRendererPreviewSurface';
import {
  type SharedRendererPresentationContract,
} from './sharedRendererPresentationContract';

export interface SharedRendererPreviewSessionInput {
  enabled: boolean;
  projectSettings: ProjectSettings;
  layers: LayerState[];
  objects: TimelineObject[];
  time: number;
  editorMode: EditorMode;
  isExporting: boolean;
  webGpuAvailable: boolean;
  fallbackAdapter: boolean;
}

export interface SharedRendererPreviewSession {
  plan: SharedRendererPreviewPlan;
  surfaceGate: SharedRendererPreviewSurfaceGate;
  presentationContract: SharedRendererPresentationContract;
}
