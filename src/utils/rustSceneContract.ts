import type { LayerState, ProjectSettings, TimelineObject } from '../types';
import type {
  ColourPipeline as RustColourPipeline,
  Effect as RustEffect,
  EvaluatedClip as GeneratedRustEvaluatedClip,
  Fps as RustFrameRate,
  SamplingMode as RustSamplingMode,
  SceneSnapshot as GeneratedRustSceneSnapshot,
  Transform as RustTransform,
} from '../generated/rustCore';

export type RustEvaluatedClip = Omit<GeneratedRustEvaluatedClip, 'effects'> & {
  effects: readonly RustEffect[];
};

export type RustSceneSnapshot = Omit<GeneratedRustSceneSnapshot, 'clips'> & {
  clips: readonly RustEvaluatedClip[];
};

export type {
  RustColourPipeline,
  RustEffect,
  RustFrameRate,
  RustSamplingMode,
  RustTransform,
};

export interface RustSceneMediaReference {
  id: string;
  kind: 'Image' | 'Video' | 'SolidColour' | 'GeneratedGradient' | 'GeneratedAudioWaveform' | 'GeneratedAudioSphere' | 'GeneratedParticle' | 'GeneratedBarcode' | 'GeneratedPuzzlePiece' | 'GeneratedColourWheel' | 'GeneratedGourd' | 'GeneratedGear' | 'GeneratedTrackBar' | 'GeneratedPieChart' | 'GeneratedHistogram' | 'GeneratedToneCurve' | 'GeneratedGetColorDots' | 'GeneratedHksyCheckerGrid' | 'GeneratedRegionFrame' | 'GeneratedSimpleTube' | 'GeneratedSphereDots' | 'GeneratedSphericalField' | 'GeneratedSunburst' | 'GeneratedCircularArrow' | 'GeneratedTriangleBracket' | 'GeneratedTartanCheck' | 'GeneratedHoundstooth' | 'GeneratedYagasuri' | 'GeneratedPaperAirplane' | 'GeneratedAsanohaPattern' | 'GeneratedFocusLinesPlus' | 'GeneratedRandomLineEx' | 'GeneratedContourTrace' | 'GeneratedDisplacementPoly' | 'GeneratedPlainEffectorLine' | 'GeneratedHologram' | 'GeneratedProtractor' | 'GeneratedShakingPolygon' | 'GeneratedShatteredSphere' | 'GeneratedShape' | 'Psd' | 'Text';
  source: string;
  width: number;
  height: number;
  source_rate?: RustFrameRate;
  active_layer_ids?: string[];
}

export type RustSceneSnapshotBuildIssueCode =
  | 'unsupportedObjectType'
  | 'unsupportedFilter'
  | 'unsupportedRotation'
  | 'unsupportedTransform'
  | 'unsupportedVideoMode'
  | 'unsupportedGroupComposition'
  | 'unsupportedMask'
  | 'missingMediaSource';

export interface RustSceneSnapshotBuildIssue {
  code: RustSceneSnapshotBuildIssueCode;
  objectId: string;
  detail: string;
}

export type RustSceneSnapshotBuildResult =
  | {
      ok: true;
      snapshot: RustSceneSnapshot;
      media: RustSceneMediaReference[];
    }
  | {
      ok: false;
      issues: RustSceneSnapshotBuildIssue[];
    };

export type RustSceneSnapshotBoundaryIssueCode =
  | 'schemaMismatch'
  | 'nonFiniteNumber'
  | 'unsafeInteger'
  | 'unsupportedEnum'
  | 'outOfRange'
  | 'mediaMismatch';

export interface RustSceneSnapshotBoundaryIssue {
  code: RustSceneSnapshotBoundaryIssueCode;
  path: string;
  detail: string;
}

export type RustSceneSnapshotBoundaryValidation =
  | { ok: true }
  | {
      ok: false;
      issues: RustSceneSnapshotBoundaryIssue[];
    };

export interface RustSceneSnapshotBoundaryPayload {
  snapshot: unknown;
  media: unknown;
}

export interface RustSceneSnapshotBuildInput {
  projectSettings: Pick<ProjectSettings, 'fps'>;
  layers: LayerState[];
  objects: TimelineObject[];
  time: number;
  videoSourceMode?: RustSceneVideoSourceMode;
}

export type RustSceneVideoSourceMode = 'previewProxy' | 'exportOriginal';

export const rustColourPipeline = (): RustColourPipeline => ({
  profile: 'rec709-sdr',
  working_space: 'linear-light',
  alpha: 'premultiplied',
});

