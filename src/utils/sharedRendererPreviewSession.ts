import type { EditorMode, LayerState, ProjectSettings, TimelineObject } from '../types';
import {
  buildSharedRendererPreviewPlan,
  type SharedRendererPreviewPlan,
} from './sharedRendererPreviewBridge';
import {
  buildSharedRendererPreviewSurfaceGate,
  type SharedRendererPreviewSurfaceGate,
} from './sharedRendererPreviewSurface';
import {
  buildSharedRendererPresentationContract,
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

export const buildSharedRendererPreviewSession = ({
  enabled,
  projectSettings,
  layers,
  objects,
  time,
  editorMode,
  isExporting,
  webGpuAvailable,
  fallbackAdapter,
}: SharedRendererPreviewSessionInput): SharedRendererPreviewSession => {
  const plan = buildSharedRendererPreviewPlan({
    enabled,
    projectSettings,
    layers,
    objects,
    time,
  });
  const surfaceGate = buildSharedRendererPreviewSurfaceGate({
    plan,
    projectSettings,
    editorMode,
    isExporting,
    webGpuAvailable,
    fallbackAdapter,
  });

  return {
    plan,
    surfaceGate,
    presentationContract: buildSharedRendererPresentationContract(),
  };
};

export const collectSharedRendererGeneratedEffectObjectIdsFromSession = (
  session: SharedRendererPreviewSession,
): string[] => collectSharedRendererObjectIdsByMediaKind(session, ['GeneratedAudioWaveform', 'GeneratedAudioSphere', 'GeneratedParticle', 'GeneratedBarcode', 'GeneratedPuzzlePiece', 'GeneratedColourWheel', 'GeneratedGourd', 'GeneratedGear', 'GeneratedTrackBar', 'GeneratedPieChart', 'GeneratedHistogram', 'GeneratedToneCurve', 'GeneratedGetColorDots', 'GeneratedHksyCheckerGrid', 'GeneratedRegionFrame', 'GeneratedSimpleTube', 'GeneratedSphereDots', 'GeneratedSphericalField', 'GeneratedSunburst', 'GeneratedCircularArrow', 'GeneratedTriangleBracket', 'GeneratedTartanCheck', 'GeneratedHoundstooth', 'GeneratedYagasuri', 'GeneratedPaperAirplane', 'GeneratedAsanohaPattern', 'GeneratedFocusLinesPlus', 'GeneratedRandomLineEx', 'GeneratedContourTrace', 'GeneratedDisplacementPoly', 'GeneratedHologram', 'GeneratedProtractor', 'GeneratedShakingPolygon', 'GeneratedShatteredSphere']);

const collectSharedRendererObjectIdsByMediaKind = (
  session: SharedRendererPreviewSession,
  targetKinds: ReadonlyArray<'GeneratedAudioWaveform' | 'GeneratedAudioSphere' | 'GeneratedParticle' | 'GeneratedBarcode' | 'GeneratedPuzzlePiece' | 'GeneratedColourWheel' | 'GeneratedGourd' | 'GeneratedGear' | 'GeneratedTrackBar' | 'GeneratedPieChart' | 'GeneratedHistogram' | 'GeneratedToneCurve' | 'GeneratedGetColorDots' | 'GeneratedHksyCheckerGrid' | 'GeneratedRegionFrame' | 'GeneratedSimpleTube' | 'GeneratedSphereDots' | 'GeneratedSphericalField' | 'GeneratedSunburst' | 'GeneratedCircularArrow' | 'GeneratedTriangleBracket' | 'GeneratedTartanCheck' | 'GeneratedHoundstooth' | 'GeneratedYagasuri' | 'GeneratedPaperAirplane' | 'GeneratedAsanohaPattern' | 'GeneratedFocusLinesPlus' | 'GeneratedRandomLineEx' | 'GeneratedContourTrace' | 'GeneratedDisplacementPoly' | 'GeneratedHologram' | 'GeneratedProtractor' | 'GeneratedShakingPolygon' | 'GeneratedShatteredSphere'>,
): string[] => {
  if (!session.surfaceGate.ok) return [];

  const targetKindSet = new Set(targetKinds);
  const mediaKindById = new Map(session.surfaceGate.media.map((reference) => [reference.id, reference.kind]));
  return session.surfaceGate.snapshot.clips
    .filter((clip) => targetKindSet.has(mediaKindById.get(clip.media_id) as 'GeneratedAudioWaveform' | 'GeneratedAudioSphere' | 'GeneratedParticle' | 'GeneratedBarcode' | 'GeneratedPuzzlePiece' | 'GeneratedColourWheel' | 'GeneratedGourd' | 'GeneratedGear' | 'GeneratedTrackBar' | 'GeneratedPieChart' | 'GeneratedHistogram' | 'GeneratedToneCurve' | 'GeneratedGetColorDots' | 'GeneratedHksyCheckerGrid' | 'GeneratedRegionFrame' | 'GeneratedSimpleTube' | 'GeneratedSphereDots' | 'GeneratedSphericalField' | 'GeneratedSunburst' | 'GeneratedCircularArrow' | 'GeneratedTriangleBracket' | 'GeneratedTartanCheck' | 'GeneratedHoundstooth' | 'GeneratedYagasuri' | 'GeneratedPaperAirplane' | 'GeneratedAsanohaPattern' | 'GeneratedFocusLinesPlus' | 'GeneratedRandomLineEx' | 'GeneratedContourTrace' | 'GeneratedDisplacementPoly' | 'GeneratedHologram' | 'GeneratedProtractor' | 'GeneratedShakingPolygon' | 'GeneratedShatteredSphere'))
    .sort((left, right) => left.z_index - right.z_index)
    .map((clip) => clip.clip_id);
};
