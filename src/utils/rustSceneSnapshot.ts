import type {
  AudioObject,
  AudioSphereObject,
  AudioVisualizationObject,
  AsanohaPatternObject,
  BarcodeObject,
  CircularArrowObject,
  ColourWheelObject,
  ContourTraceObject,
  DisplacementPolyObject,
  FocusLinesPlusObject,
  GearObject,
  GetColorDotFieldObject,
  GourdObject,
  HistogramObject,
  HologramObject,
  HoundstoothObject,
  HksyCheckerGridObject,
  GradientFill,
  ImageObject,
  LayerState,
  PaperAirplaneObject,
  ParticleObject,
  PieChartObject,
  ProjectSettings,
  ProtractorObject,
  PsdObject,
  PuzzlePieceObject,
  RandomLineExObject,
  RegionFrameObject,
  ShakingPolygonObject,
  ShapeObject,
  SimpleTubeObject,
  SphereDotsObject,
  SphericalFieldObject,
  SunburstObject,
  TartanCheckObject,
  TimelineObject,
  ToneCurveObject,
  TrackBarObject,
  TriangleBracketObject,
  VideoObject,
  YagasuriObject,
} from '../types';
import { getEnabledObjectFiltersInOrder, getFadeOpacityMultiplier } from './filterStack';
import { evaluateObjectPositionAtTime } from './keyframes';

export type RustSamplingMode = 'nearest' | 'bilinear';

export interface RustFrameRate {
  numerator: number;
  denominator: number;
}

export interface RustColourPipeline {
  profile: 'rec709-sdr';
  working_space: 'linear-light';
  alpha: 'premultiplied';
}

export interface RustTransform {
  translation_x: number;
  translation_y: number;
  scale_x: number;
  scale_y: number;
  rotation_degrees: number;
  sampling: RustSamplingMode;
}

export type RustEffect =
  | { LinearGain: { gain: number } }
  | { ColourAberration: { offset_x: number; offset_y: number } }
  | { Outline: { colour: [number, number, number]; thickness: number; opacity: number } }
  | { Wipe: { edge: 'left' | 'right' | 'top' | 'bottom'; progress: number } }
  | { Clipping: { top: number; bottom: number; left: number; right: number; angle_degrees: number } }
  | { SpotLight: { centre_x: number; centre_y: number; radius: number; intensity: number; colour: [number, number, number] } }
  | { DisplacementMap: { amount_x: number; amount_y: number; size: number; strength: number } }
  | { FakeDof: { focus_x: number; focus_y: number; focus_radius: number; blur: number; strength: number } }
  | { AutoBlur: { angle_degrees: number; radius: number; strength: number; colour_shift: number } }
  | { Stretch: { angle_degrees: number; amount: number; strength: number } }
  | { MultiSlicer: { angle_degrees: number; offset: number; slices: number; expansion: number; strength: number } }
  | { OctTransform: { scale: number; rotation_degrees: number; vertex_count: number; warp: number; strength: number } };

export interface RustEvaluatedClip {
  clip_id: string;
  track_id: string;
  media_id: string;
  source_frame: number;
  z_index: number;
  transform: RustTransform;
  opacity: number;
  effects: readonly RustEffect[];
}

export interface RustSceneSnapshot {
  frame_index: number;
  colour: RustColourPipeline;
  clips: readonly RustEvaluatedClip[];
}

export interface RustSceneMediaReference {
  id: string;
  kind: 'Image' | 'Video' | 'SolidColour' | 'GeneratedGradient' | 'GeneratedAudioWaveform' | 'GeneratedAudioSphere' | 'GeneratedParticle' | 'GeneratedBarcode' | 'GeneratedPuzzlePiece' | 'GeneratedColourWheel' | 'GeneratedGourd' | 'GeneratedGear' | 'GeneratedTrackBar' | 'GeneratedPieChart' | 'GeneratedHistogram' | 'GeneratedToneCurve' | 'GeneratedGetColorDots' | 'GeneratedHksyCheckerGrid' | 'GeneratedRegionFrame' | 'GeneratedSimpleTube' | 'GeneratedSphereDots' | 'GeneratedSphericalField' | 'GeneratedSunburst' | 'GeneratedCircularArrow' | 'GeneratedTriangleBracket' | 'GeneratedTartanCheck' | 'GeneratedHoundstooth' | 'GeneratedYagasuri' | 'GeneratedPaperAirplane' | 'GeneratedAsanohaPattern' | 'GeneratedFocusLinesPlus' | 'GeneratedRandomLineEx' | 'GeneratedContourTrace' | 'GeneratedDisplacementPoly' | 'GeneratedHologram' | 'GeneratedProtractor' | 'GeneratedShakingPolygon' | 'Psd';
  source: string;
  width: number;
  height: number;
  source_rate?: RustFrameRate;
  active_layer_ids?: string[];
}

export type RustSceneSnapshotBuildIssueCode =
  | 'unsupportedObjectType'
  | 'unsupportedFilter'
  | 'unsupportedShapeGeometry'
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

type SupportedMediaObject = ImageObject | VideoObject | PsdObject;
type SupportedGeneratedObject = AudioVisualizationObject | AudioSphereObject | ParticleObject | BarcodeObject | PuzzlePieceObject | ColourWheelObject | GourdObject | GearObject | TrackBarObject | PieChartObject | HistogramObject | ToneCurveObject | GetColorDotFieldObject | HksyCheckerGridObject | RegionFrameObject | SimpleTubeObject | SphereDotsObject | SphericalFieldObject | SunburstObject | CircularArrowObject | TriangleBracketObject | TartanCheckObject | HoundstoothObject | YagasuriObject | PaperAirplaneObject | AsanohaPatternObject | FocusLinesPlusObject | RandomLineExObject | ContourTraceObject | DisplacementPolyObject | HologramObject | ProtractorObject | ShakingPolygonObject;
type SupportedSceneObject = SupportedMediaObject | ShapeObject | SupportedGeneratedObject;

const rustColourPipeline = (): RustColourPipeline => ({
  profile: 'rec709-sdr',
  working_space: 'linear-light',
  alpha: 'premultiplied',
});

export const buildRustSceneSnapshotForTimeline = ({
  projectSettings,
  layers,
  objects,
  time,
  videoSourceMode = 'previewProxy',
}: RustSceneSnapshotBuildInput): RustSceneSnapshotBuildResult => {
  const frameIndex = secondsToFrameIndex(time, projectSettings.fps);
  const visibleObjects = collectVisibleObjects(objects, layers, time);
  const visualObjects = visibleObjects.filter(isVisualSceneObject);
  const issues = collectBuildIssues(visualObjects, time, videoSourceMode);

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  const supportedObjects = visualObjects
    .filter(isSupportedSceneObject)
    .map((object, index) => ({ object, index }))
    .sort((left, right) => {
      if (left.object.layer !== right.object.layer) return left.object.layer - right.object.layer;
      return left.index - right.index;
    })
    .map(({ object }) => object);

  const clips = supportedObjects.map((object, zIndex): RustEvaluatedClip => {
    const position = evaluateObjectPositionAtTime(object, time);
    const opacity = clamp01((object.opacity ?? 1) * getFadeOpacityMultiplier(object));
    const transformScale = mediaSourceScaleForObject(object, videoSourceMode);
    return {
      clip_id: object.id,
      track_id: `layer-${object.layer}`,
      media_id: object.id,
      source_frame: sourceFrameForObject(object, time, projectSettings.fps),
      z_index: zIndex,
      transform: {
        translation_x: position.x,
        translation_y: position.y,
        scale_x: object.scaleX * transformScale.x,
        scale_y: object.scaleY * transformScale.y,
        rotation_degrees: normaliseRotationDegrees(object.rotation),
        sampling: object.type === 'shape' && object.gradient?.enabled !== true ? 'nearest' : 'bilinear',
      },
      opacity,
      effects: rustEffectsForObject(object, time),
    };
  });

  return {
    ok: true,
    snapshot: {
      frame_index: frameIndex,
      colour: rustColourPipeline(),
      clips,
    },
    media: supportedObjects.map((object) => mediaReferenceForObject(object, projectSettings.fps, videoSourceMode, objects, time)),
  };
};

export const validateRustSceneSnapshotBoundary = ({
  snapshot,
  media,
}: RustSceneSnapshotBoundaryPayload): RustSceneSnapshotBoundaryValidation => {
  const issues: RustSceneSnapshotBoundaryIssue[] = [];
  validateSnapshot(snapshot, issues);
  validateMediaReferences(media, snapshot, issues);

  return issues.length === 0 ? { ok: true } : { ok: false, issues };
};

const collectVisibleObjects = (
  objects: TimelineObject[],
  layers: LayerState[],
  time: number
): TimelineObject[] =>
  objects.filter((object) => {
    if (layers[object.layer]?.visible === false) return false;
    return time >= object.startTime && time < object.startTime + object.duration;
  });

const collectBuildIssues = (
  objects: TimelineObject[],
  time: number,
  videoSourceMode: RustSceneVideoSourceMode
): RustSceneSnapshotBuildIssue[] => {
  const issues: RustSceneSnapshotBuildIssue[] = [];

  objects.forEach((object) => {
    if (!isSupportedSceneObject(object)) {
      issues.push({
        code: 'unsupportedObjectType',
        objectId: object.id,
        detail: `Object type '${object.type}' is not representable by the shared renderer yet.`,
      });
      return;
    }

    if (object.type === 'shape' && !isSupportedRectangleShape(object)) {
      issues.push({
        code: 'unsupportedShapeGeometry',
        objectId: object.id,
        detail: 'Only solid rectangle shapes are enabled in the first shared renderer shape bridge.',
      });
    }

    if (isSupportedMediaObject(object) && !mediaSourceForObject(object, videoSourceMode)) {
      issues.push({
        code: 'missingMediaSource',
        objectId: object.id,
        detail: 'Image/video object has neither filePath nor src.',
      });
    }

    if (object.groupId || object.groupGradient?.enabled) {
      issues.push({
        code: 'unsupportedGroupComposition',
        objectId: object.id,
        detail: 'Group composition and group gradients are not enabled in the shared renderer bridge yet.',
      });
    }

    if (object.clipping) {
      issues.push({
        code: 'unsupportedMask',
        objectId: object.id,
        detail: 'Layer clipping masks are not enabled in the shared renderer bridge yet.',
      });
    }

    const position = evaluateObjectPositionAtTime(object, time);
    if (hasUnsupportedSharedRendererTransform(object, position)) {
      issues.push({
        code: 'unsupportedTransform',
        objectId: object.id,
        detail: 'Phase5 bridge currently allows finite translation, positive finite scale, and finite rotation.',
      });
    }

    if (object.type === 'video' && (object.reversed || object.subjectCropEnabled)) {
      issues.push({
        code: 'unsupportedVideoMode',
        objectId: object.id,
        detail: 'Reversed playback and subject crop are not enabled in the shared renderer bridge yet.',
      });
    }

    const unsupportedFilter = getEnabledObjectFiltersInOrder(object).find((filter) => (
      filter.type !== 'fade'
      && filter.type !== 'colour_aberration'
      && filter.type !== 'outline'
      && filter.type !== 'wipe'
      && filter.type !== 'clipping'
      && filter.type !== 'spot_light'
      && filter.type !== 'displacement_map'
      && filter.type !== 'fake_dof'
      && filter.type !== 'auto_blur'
      && filter.type !== 'stretch'
      && filter.type !== 'multi_slicer'
      && filter.type !== 'oct_transform'
      && !(object.type === 'shape' && filter.type === 'gradient')
    ));
    if (unsupportedFilter) {
      issues.push({
        code: 'unsupportedFilter',
        objectId: object.id,
        detail: `Filter '${unsupportedFilter.type}' is not representable by rust-core effects yet.`,
      });
    }
  });

  return issues;
};

const rustEffectsForObject = (object: TimelineObject, time: number): RustEffect[] => {
  const effects: RustEffect[] = [];
  getEnabledObjectFiltersInOrder(object).forEach((filter) => {
    if (filter.type === 'colour_aberration') {
      effects.push({
        ColourAberration: {
          offset_x: Math.max(0, finiteNumberOr(filter.params.offsetX, 0)),
          offset_y: Math.max(0, finiteNumberOr(filter.params.offsetY, 0)),
        },
      });
    }
    if (filter.type === 'outline') {
      effects.push({
        Outline: {
          colour: parseHexColourToLinearTriplet(filter.params.colour),
          thickness: Math.max(0, finiteNumberOr(filter.params.thickness, 0)),
          opacity: Math.max(0, Math.min(1, finiteNumberOr(filter.params.opacity, 1))),
        },
      });
    }
    if (filter.type === 'wipe') {
      let progress = Math.max(0, Math.min(1, (time - object.startTime) / object.duration));
      if (filter.params.reverse) progress = 1 - progress;
      effects.push({
        Wipe: {
          edge: filter.params.edge,
          progress,
        },
      });
    }
    if (filter.type === 'clipping') {
      effects.push({
        Clipping: {
          top: Math.max(0, finiteNumberOr(filter.params.top, 0)),
          bottom: Math.max(0, finiteNumberOr(filter.params.bottom, 0)),
          left: Math.max(0, finiteNumberOr(filter.params.left, 0)),
          right: Math.max(0, finiteNumberOr(filter.params.right, 0)),
          angle_degrees: finiteNumberOr(filter.params.angle, 0),
        },
      });
    }
    if (filter.type === 'spot_light') {
      effects.push({
        SpotLight: {
          centre_x: Math.max(0, Math.min(1, finiteNumberOr(filter.params.centreX, 0.5))),
          centre_y: Math.max(0, Math.min(1, finiteNumberOr(filter.params.centreY, 0.5))),
          radius: Math.max(0, finiteNumberOr(filter.params.radius, 0.65)),
          intensity: Math.max(0, finiteNumberOr(filter.params.intensity, 0.75)),
          colour: parseHexColourToLinearTriplet(filter.params.colour),
        },
      });
    }
    if (filter.type === 'displacement_map') {
      effects.push({
        DisplacementMap: {
          amount_x: Math.max(0, finiteNumberOr(filter.params.amountX, 24)),
          amount_y: Math.max(0, finiteNumberOr(filter.params.amountY, 12)),
          size: Math.max(1, finiteNumberOr(filter.params.size, 128)),
          strength: Math.max(0, Math.min(1, finiteNumberOr(filter.params.strength, 1))),
        },
      });
    }
    if (filter.type === 'fake_dof') {
      effects.push({
        FakeDof: {
          focus_x: Math.max(0, Math.min(1, finiteNumberOr(filter.params.focusX, 0.5))),
          focus_y: Math.max(0, Math.min(1, finiteNumberOr(filter.params.focusY, 0.5))),
          focus_radius: Math.max(0.01, Math.min(1, finiteNumberOr(filter.params.focusRadius, 0.25))),
          blur: Math.max(0, finiteNumberOr(filter.params.blur, 8)),
          strength: Math.max(0, Math.min(1, finiteNumberOr(filter.params.strength, 1))),
        },
      });
    }
    if (filter.type === 'auto_blur') {
      const movementX = finiteNumberOr(object.endX, object.x) - finiteNumberOr(object.x, 0);
      const movementY = finiteNumberOr(object.endY, object.y) - finiteNumberOr(object.y, 0);
      const duration = Math.max(1 / 60, finiteNumberOr(object.duration, 1));
      const pixelsPerFrame = Math.hypot(movementX, movementY) / Math.max(1, duration * 60);
      const blur = Math.max(0, finiteNumberOr(filter.params.blur, 10));
      const speed = Math.max(0, finiteNumberOr(filter.params.speed, 1));
      const radius = Math.min(blur * 2, pixelsPerFrame * speed * blur * 0.1);
      effects.push({
        AutoBlur: {
          angle_degrees: Math.atan2(movementY, movementX) * 180 / Math.PI,
          radius,
          strength: Math.max(0, Math.min(1, finiteNumberOr(filter.params.strength, 1))),
          colour_shift: Math.max(0, Math.min(1, finiteNumberOr(filter.params.colourShift, 0))),
        },
      });
    }
    if (filter.type === 'stretch') {
      effects.push({
        Stretch: {
          angle_degrees: finiteNumberOr(filter.params.angle, 0),
          amount: Math.max(0, finiteNumberOr(filter.params.amount, 1)),
          strength: Math.max(0, Math.min(1, finiteNumberOr(filter.params.strength, 1))),
        },
      });
    }
    if (filter.type === 'multi_slicer') {
      effects.push({
        MultiSlicer: {
          angle_degrees: finiteNumberOr(filter.params.angle, 45),
          offset: Math.max(0, finiteNumberOr(filter.params.offset, 16)),
          slices: Math.max(2, Math.round(finiteNumberOr(filter.params.slices, 18))),
          expansion: Math.max(0, finiteNumberOr(filter.params.expansion, 0)),
          strength: Math.max(0, Math.min(1, finiteNumberOr(filter.params.strength, 1))),
        },
      });
    }
    if (filter.type === 'oct_transform') {
      effects.push({
        OctTransform: {
          scale: Math.max(0.01, finiteNumberOr(filter.params.scale, 1)),
          rotation_degrees: finiteNumberOr(filter.params.rotation, 0),
          vertex_count: Math.max(3, Math.round(finiteNumberOr(filter.params.vertexCount, 8))),
          warp: Math.max(0, finiteNumberOr(filter.params.warp, 0.2)),
          strength: Math.max(0, Math.min(1, finiteNumberOr(filter.params.strength, 1))),
        },
      });
    }
  });
  return effects;
};

const parseHexColourToLinearTriplet = (value: string): [number, number, number] => {
  const match = /^#?([0-9a-f]{6})$/i.exec(value.trim());
  if (!match) return [0, 0, 0];
  const raw = match[1];
  return [
    parseInt(raw.slice(0, 2), 16) / 255,
    parseInt(raw.slice(2, 4), 16) / 255,
    parseInt(raw.slice(4, 6), 16) / 255,
  ];
};

const isSupportedMediaObject = (object: TimelineObject): object is SupportedMediaObject =>
  object.type === 'image' || object.type === 'video' || object.type === 'psd';

const isSupportedSceneObject = (object: TimelineObject): object is SupportedSceneObject =>
  isSupportedMediaObject(object)
  || object.type === 'shape'
  || object.type === 'audio_visualization'
  || object.type === 'audio_sphere'
  || object.type === 'particle'
  || object.type === 'barcode'
  || object.type === 'puzzle_piece'
  || object.type === 'colour_wheel'
  || object.type === 'gourd'
  || object.type === 'gear'
  || object.type === 'track_bar'
  || object.type === 'pie_chart'
  || object.type === 'histogram'
  || object.type === 'tone_curve'
  || object.type === 'getcolor_dot_field'
  || object.type === 'hksy_checker_grid'
  || object.type === 'region_frame'
  || object.type === 'simple_tube'
  || object.type === 'sphere_dots'
  || object.type === 'spherical_field'
  || object.type === 'sunburst'
  || object.type === 'circular_arrow'
  || object.type === 'triangle_bracket'
  || object.type === 'tartan_check'
  || object.type === 'houndstooth'
  || object.type === 'yagasuri'
  || object.type === 'paper_airplane'
  || object.type === 'asanoha_pattern'
  || object.type === 'focus_lines_plus'
  || object.type === 'random_line_ex'
  || object.type === 'contour_trace'
  || object.type === 'displacement_poly'
  || object.type === 'hologram'
  || object.type === 'protractor'
  || object.type === 'shaking_polygon';

const isVisualSceneObject = (object: TimelineObject): boolean =>
  object.type !== 'audio';

const isSupportedRectangleShape = (object: ShapeObject): boolean =>
  object.shapeType === 'rect';

const hasUnsupportedSharedRendererTransform = (
  object: SupportedSceneObject,
  position: { x: number; y: number }
): boolean => {
  if (!Number.isFinite(object.scaleX) || !Number.isFinite(object.scaleY)) return true;
  if (object.scaleX <= 0 || object.scaleY <= 0) return true;
  if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) return true;
  if (!Number.isFinite(object.rotation)) return true;
  return false;
};

const mediaReferenceForObject = (
  object: SupportedSceneObject,
  projectFps: number,
  videoSourceMode: RustSceneVideoSourceMode,
  objects: TimelineObject[],
  time: number
): RustSceneMediaReference => {
  if (object.type === 'shape') {
    if (object.gradient?.enabled === true) {
      return {
        id: object.id,
        kind: 'GeneratedGradient',
        source: serialiseGeneratedGradientSource(object.gradient),
        width: object.width,
        height: object.height,
      };
    }

    return {
      id: object.id,
      kind: 'SolidColour',
      source: object.fill,
      width: object.width,
      height: object.height,
    };
  }

  if (object.type === 'audio_visualization') {
    return {
      id: object.id,
      kind: 'GeneratedAudioWaveform',
      source: serialiseGeneratedAudioWaveformSource(object, objects, time),
      width: object.width,
      height: object.height,
    };
  }

  if (object.type === 'audio_sphere') {
    return {
      id: object.id,
      kind: 'GeneratedAudioSphere',
      source: serialiseGeneratedAudioSphereSource(object, objects, time),
      width: object.width,
      height: object.height,
    };
  }

  if (object.type === 'particle') {
    return {
      id: object.id,
      kind: 'GeneratedParticle',
      source: serialiseGeneratedParticleSource(object),
      width: object.width,
      height: object.height,
    };
  }

  if (object.type === 'barcode') {
    return {
      id: object.id,
      kind: 'GeneratedBarcode',
      source: serialiseGeneratedBarcodeSource(object),
      width: object.width,
      height: object.height,
    };
  }

  if (object.type === 'puzzle_piece') {
    return {
      id: object.id,
      kind: 'GeneratedPuzzlePiece',
      source: serialiseGeneratedPuzzlePieceSource(object),
      width: object.width,
      height: object.height,
    };
  }

  if (object.type === 'colour_wheel') {
    return {
      id: object.id,
      kind: 'GeneratedColourWheel',
      source: serialiseGeneratedColourWheelSource(object),
      width: object.width,
      height: object.height,
    };
  }

  if (object.type === 'gourd') {
    return {
      id: object.id,
      kind: 'GeneratedGourd',
      source: serialiseGeneratedGourdSource(object),
      width: object.width,
      height: object.height,
    };
  }

  if (object.type === 'gear') {
    return {
      id: object.id,
      kind: 'GeneratedGear',
      source: serialiseGeneratedGearSource(object),
      width: object.width,
      height: object.height,
    };
  }

  if (object.type === 'track_bar') {
    return {
      id: object.id,
      kind: 'GeneratedTrackBar',
      source: serialiseGeneratedTrackBarSource(object),
      width: object.width,
      height: object.height,
    };
  }

  if (object.type === 'pie_chart') {
    return {
      id: object.id,
      kind: 'GeneratedPieChart',
      source: serialiseGeneratedPieChartSource(object),
      width: object.width,
      height: object.height,
    };
  }

  if (object.type === 'histogram') {
    return {
      id: object.id,
      kind: 'GeneratedHistogram',
      source: serialiseGeneratedHistogramSource(object),
      width: object.width,
      height: object.height,
    };
  }

  if (object.type === 'hksy_checker_grid') {
    return {
      id: object.id,
      kind: 'GeneratedHksyCheckerGrid',
      source: serialiseGeneratedHksyCheckerGridSource(object),
      width: object.width,
      height: object.height,
    };
  }

  if (object.type === 'region_frame') {
    return {
      id: object.id,
      kind: 'GeneratedRegionFrame',
      source: serialiseGeneratedRegionFrameSource(object),
      width: object.width,
      height: object.height,
    };
  }

  if (object.type === 'simple_tube') {
    return {
      id: object.id,
      kind: 'GeneratedSimpleTube',
      source: serialiseGeneratedSimpleTubeSource(object),
      width: object.width,
      height: object.height,
    };
  }

  if (object.type === 'sphere_dots') {
    return {
      id: object.id,
      kind: 'GeneratedSphereDots',
      source: serialiseGeneratedSphereDotsSource(object),
      width: object.width,
      height: object.height,
    };
  }

  if (object.type === 'spherical_field') {
    return {
      id: object.id,
      kind: 'GeneratedSphericalField',
      source: serialiseGeneratedSphericalFieldSource(object),
      width: object.width,
      height: object.height,
    };
  }

  if (object.type === 'getcolor_dot_field') {
    return {
      id: object.id,
      kind: 'GeneratedGetColorDots',
      source: serialiseGeneratedGetColorDotsSource(object, objects, time),
      width: object.width,
      height: object.height,
    };
  }

  if (object.type === 'sunburst') {
    return {
      id: object.id,
      kind: 'GeneratedSunburst',
      source: serialiseGeneratedSunburstSource(object),
      width: object.width,
      height: object.height,
    };
  }

  if (object.type === 'circular_arrow') {
    return {
      id: object.id,
      kind: 'GeneratedCircularArrow',
      source: serialiseGeneratedCircularArrowSource(object),
      width: object.width,
      height: object.height,
    };
  }

  if (object.type === 'triangle_bracket') {
    return {
      id: object.id,
      kind: 'GeneratedTriangleBracket',
      source: serialiseGeneratedTriangleBracketSource(object),
      width: object.width,
      height: object.height,
    };
  }

  if (object.type === 'tartan_check') {
    return {
      id: object.id,
      kind: 'GeneratedTartanCheck',
      source: serialiseGeneratedTartanCheckSource(object),
      width: object.width,
      height: object.height,
    };
  }

  if (object.type === 'houndstooth') {
    return {
      id: object.id,
      kind: 'GeneratedHoundstooth',
      source: serialiseGeneratedHoundstoothSource(object),
      width: object.width,
      height: object.height,
    };
  }

  if (object.type === 'yagasuri') {
    return {
      id: object.id,
      kind: 'GeneratedYagasuri',
      source: serialiseGeneratedYagasuriSource(object),
      width: object.width,
      height: object.height,
    };
  }

  if (object.type === 'paper_airplane') {
    return {
      id: object.id,
      kind: 'GeneratedPaperAirplane',
      source: serialiseGeneratedPaperAirplaneSource(object),
      width: object.width,
      height: object.height,
    };
  }

  if (object.type === 'asanoha_pattern') {
    return {
      id: object.id,
      kind: 'GeneratedAsanohaPattern',
      source: serialiseGeneratedAsanohaPatternSource(object),
      width: object.width,
      height: object.height,
    };
  }

  if (object.type === 'focus_lines_plus') {
    return {
      id: object.id,
      kind: 'GeneratedFocusLinesPlus',
      source: serialiseGeneratedFocusLinesPlusSource(object),
      width: object.width,
      height: object.height,
    };
  }

  if (object.type === 'random_line_ex') {
    return {
      id: object.id,
      kind: 'GeneratedRandomLineEx',
      source: serialiseGeneratedRandomLineExSource(object),
      width: object.width,
      height: object.height,
    };
  }

  if (object.type === 'contour_trace') {
    return {
      id: object.id,
      kind: 'GeneratedContourTrace',
      source: serialiseGeneratedContourTraceSource(object),
      width: object.width,
      height: object.height,
    };
  }

  if (object.type === 'displacement_poly') {
    return {
      id: object.id,
      kind: 'GeneratedDisplacementPoly',
      source: serialiseGeneratedDisplacementPolySource(object),
      width: object.width,
      height: object.height,
    };
  }

  if (object.type === 'hologram') {
    return {
      id: object.id,
      kind: 'GeneratedHologram',
      source: serialiseGeneratedHologramSource(object),
      width: object.width,
      height: object.height,
    };
  }

  if (object.type === 'protractor') {
    return {
      id: object.id,
      kind: 'GeneratedProtractor',
      source: serialiseGeneratedProtractorSource(object),
      width: object.width,
      height: object.height,
    };
  }

  if (object.type === 'shaking_polygon') {
    return {
      id: object.id,
      kind: 'GeneratedShakingPolygon',
      source: serialiseGeneratedShakingPolygonSource(object),
      width: object.width,
      height: object.height,
    };
  }

  if (object.type === 'tone_curve') {
    return {
      id: object.id,
      kind: 'GeneratedToneCurve',
      source: serialiseGeneratedToneCurveSource(object),
      width: object.width,
      height: object.height,
    };
  }

  const dimensions = mediaDimensionsForObject(object, videoSourceMode);
  const reference: RustSceneMediaReference = {
    id: object.id,
    kind: mediaKindForObject(object),
    source: mediaSourceForObject(object, videoSourceMode),
    width: dimensions.width,
    height: dimensions.height,
    ...(object.type === 'video' ? { source_rate: fpsToFrameRate(projectFps) } : {}),
  };
  if (object.type === 'psd') {
    reference.active_layer_ids = activeLayerIdsForPsd(object);
  }
  return reference;
};

const activeLayerIdsForPsd = (object: PsdObject): string[] =>
  Object.entries(object.activeLayerIds ?? {})
    .filter(([, active]) => active)
    .map(([layerId]) => layerId)
    .sort((left, right) => left.localeCompare(right));

const serialiseGeneratedGradientSource = (gradient: GradientFill): string =>
  JSON.stringify({
    type: gradient.type === 'radial' ? 'radial' : 'linear',
    colours: Array.isArray(gradient.colours) && gradient.colours.length > 0
      ? gradient.colours
      : ['#ffffff', '#000000'],
    stops: Array.isArray(gradient.stops) ? gradient.stops : [],
    direction: Number.isFinite(gradient.direction) ? gradient.direction : 0,
  });

const serialiseGeneratedAudioWaveformSource = (
  object: AudioVisualizationObject,
  objects: TimelineObject[],
  time: number
): string => {
  const targetAudio = findTargetAudioForGeneratedAudio(object, objects, time);
  return JSON.stringify({
    generator: 'audio-waveform-r',
    target_audio_id: targetAudio?.id ?? '',
    target_source: targetAudio ? mediaSourceForObject(targetAudio) : '',
    sample_window_seconds: 0.05,
    colour: object.color || '#00ff00',
    thickness: Math.max(1, finiteNumberOr(object.thickness, 2)),
    amplitude: Math.max(0, finiteNumberOr(object.amplitude, 1)),
  });
};

const serialiseGeneratedAudioSphereSource = (
  object: AudioSphereObject,
  objects: TimelineObject[],
  time: number
): string => {
  const targetAudio = findTargetAudioForGeneratedAudio(object, objects, time);
  return JSON.stringify({
    generator: 'audio-sphere-93',
    target_audio_id: targetAudio?.id ?? '',
    target_source: targetAudio ? mediaSourceForObject(targetAudio) : '',
    sample_window_seconds: Math.min(10, Math.max(0.001, finiteNumberOr(object.sampleWindowSeconds, 0.1))),
    columns: Math.min(64, Math.max(2, Math.trunc(finiteNumberOr(object.columns, 16)))),
    rows: Math.min(64, Math.max(2, Math.trunc(finiteNumberOr(object.rows, 12)))),
    base_radius: Math.min(2000, Math.max(1, finiteNumberOr(object.baseRadius, 170))),
    audio_influence: Math.min(4, Math.max(0, finiteNumberOr(object.audioInfluence, 0.6))),
    point_size: Math.min(200, Math.max(0, finiteNumberOr(object.pointSize, 5))),
    polygon_size: Math.min(4, Math.max(0, finiteNumberOr(object.polygonSize, 0.35))),
    random_amount: Math.min(4, Math.max(0, finiteNumberOr(object.randomAmount, 0.05))),
    colour: /^#[0-9a-f]{6}$/i.test(object.colour) ? object.colour : '#36c2ff',
    seed: Math.trunc(finiteNumberOr(object.seed, 93)),
  });
};

const serialiseGeneratedParticleSource = (object: ParticleObject): string =>
  JSON.stringify({
    generator: 'standard-particle',
    seed: Math.trunc(finiteNumberOr(object.seed, 0)),
    particle_count: Math.max(1, Math.trunc(finiteNumberOr(object.particleCount, 1))),
    spread: Math.max(0, finiteNumberOr(object.spread, 0)),
    speed: Math.max(0, finiteNumberOr(object.speed, 0)),
    size: Math.max(1, finiteNumberOr(object.size, 1)),
    colour: /^#[0-9a-f]{6}$/i.test(object.colour) ? object.colour : '#ffffff',
    lifetime_seconds: Math.max(1 / 60, finiteNumberOr(object.lifetimeSeconds, 1)),
  });

const serialiseGeneratedBarcodeSource = (object: BarcodeObject): string =>
  JSON.stringify({
    generator: 'barcode-t',
    data: object.data || 'AviUtl',
    minimum_bar_width: Math.max(1, Math.trunc(finiteNumberOr(object.minimumBarWidth, 2))),
    horizontal_margin: Math.max(0, Math.trunc(finiteNumberOr(object.horizontalMargin, 30))),
    vertical_margin: Math.max(0, Math.trunc(finiteNumberOr(object.verticalMargin, 20))),
    foreground_colour: /^#[0-9a-f]{6}$/i.test(object.foregroundColour) ? object.foregroundColour : '#000000',
    background_colour: /^#[0-9a-f]{6}$/i.test(object.backgroundColour) ? object.backgroundColour : '#ffffff',
  });

const serialiseGeneratedPuzzlePieceSource = (object: PuzzlePieceObject): string =>
  JSON.stringify({
    generator: 'puzzle-piece',
    size: Math.max(1, Math.trunc(finiteNumberOr(object.size, Math.min(object.width, object.height) / 2))),
    shape_variant: Math.min(22, Math.max(1, Math.trunc(finiteNumberOr(object.shapeVariant, 1)))),
    connector_mode: object.connectorMode === 'concave' ? 'concave' : 'convex',
    fill_colour: /^#[0-9a-f]{6}$/i.test(object.fillColour) ? object.fillColour : '#ffffff',
  });

const serialiseGeneratedColourWheelSource = (object: ColourWheelObject): string =>
  JSON.stringify({
    generator: 'colour-wheel',
    radius: Math.max(1, Math.trunc(finiteNumberOr(object.radius, Math.min(object.width, object.height) / 2))),
    saturation: Math.min(100, Math.max(0, finiteNumberOr(object.saturation, 100))),
    brightness: Math.min(100, Math.max(0, finiteNumberOr(object.brightness, 100))),
    ring_width_percent: Math.min(100, Math.max(1, finiteNumberOr(object.ringWidthPercent, 25))),
    segment_count: Math.min(360, Math.max(3, Math.trunc(finiteNumberOr(object.segmentCount, 24)))),
  });

const serialiseGeneratedGourdSource = (object: GourdObject): string =>
  JSON.stringify({
    generator: 'gourd-tm',
    body_radius: Math.max(1, Math.trunc(finiteNumberOr(object.bodyRadius, 80))),
    body_width: Math.max(1, Math.trunc(finiteNumberOr(object.bodyWidth, 250))),
    waist_radius: Math.max(0, Math.trunc(finiteNumberOr(object.waistRadius, 10))),
    squash_percent: Math.min(100, Math.max(0, finiteNumberOr(object.squashPercent, 40))),
    repeat_count: Math.min(36, Math.max(1, Math.trunc(finiteNumberOr(object.repeatCount, 1)))),
    fill_colour: /^#[0-9a-f]{6}$/i.test(object.fillColour) ? object.fillColour : '#ffffff',
  });

const serialiseGeneratedGearSource = (object: GearObject): string =>
  JSON.stringify({
    generator: 'gear-t',
    outer_radius: Math.max(1, Math.trunc(finiteNumberOr(object.outerRadius, Math.min(object.width, object.height) / 2))),
    inner_radius_percent: Math.min(99, Math.max(0, finiteNumberOr(object.innerRadiusPercent, 45))),
    tooth_count: Math.min(240, Math.max(3, Math.trunc(finiteNumberOr(object.toothCount, 20)))),
    tooth_depth_percent: Math.min(95, Math.max(1, finiteNumberOr(object.toothDepthPercent, 18))),
    tooth_skew_percent: Math.min(100, Math.max(-100, finiteNumberOr(object.toothSkewPercent, 0))),
    fill_colour: /^#[0-9a-f]{6}$/i.test(object.fillColour) ? object.fillColour : '#ffffff',
  });

const serialiseGeneratedTrackBarSource = (object: TrackBarObject): string =>
  JSON.stringify({
    generator: 'custom-track-bar',
    track_values: normaliseTrackBarValues(object.trackValues),
    track_ranges: normaliseTrackBarRanges(object.trackRanges),
    labels: normaliseTrackBarLabels(object.labels),
    bar_colour: /^#[0-9a-f]{6}$/i.test(object.barColour) ? object.barColour : '#ffffff',
    background_opacity: Math.min(1, Math.max(0, finiteNumberOr(object.backgroundOpacity, 0.05))),
  });

const serialiseGeneratedPieChartSource = (object: PieChartObject): string =>
  JSON.stringify({
    generator: 'pie-sheet-graph',
    values: normalisePieChartValues(object.values),
    sort_mode: normalisePieChartSortMode(object.sortMode),
    normalise_to_hundred: object.normaliseToHundred === true,
    label_mode: normalisePieChartLabelMode(object.labelMode),
    progress_percent: Math.min(100, Math.max(0, finiteNumberOr(object.progressPercent, 100))),
    stroke_width: Math.max(1, Math.trunc(finiteNumberOr(object.strokeWidth, 20))),
    slice_colours: normalisePieChartColours(object.sliceColours),
  });

const serialiseGeneratedHistogramSource = (object: HistogramObject): string =>
  JSON.stringify({
    generator: 'simple-histogram',
    bin_values: normaliseHistogramBins(object.binValues),
    height_scale_percent: Math.min(1000, Math.max(1, finiteNumberOr(object.heightScalePercent, 100))),
    line_width: Math.max(1, Math.trunc(finiteNumberOr(object.lineWidth, 1))),
    show_luminance: object.showLuminance === true,
    show_red: object.showRed === true,
    show_green: object.showGreen === true,
    show_blue: object.showBlue === true,
    channel_colours: normaliseHistogramColours(object.channelColours),
    background_colour: /^#[0-9a-f]{6}$/i.test(object.backgroundColour) ? object.backgroundColour : '#000000',
  });

const serialiseGeneratedSunburstSource = (object: SunburstObject): string =>
  JSON.stringify({
    generator: 'sunrise',
    ray_count: Math.min(360, Math.max(1, Math.trunc(finiteNumberOr(object.rayCount, 10)))),
    ray_coverage_percent: Math.min(100, Math.max(0, finiteNumberOr(object.rayCoveragePercent, 50))),
    rotation_offset_degrees: finiteNumberOr(object.rotationOffsetDegrees, 0),
    centre_x_percent: Math.min(200, Math.max(-100, finiteNumberOr(object.centreXPercent, 50))),
    centre_y_percent: Math.min(200, Math.max(-100, finiteNumberOr(object.centreYPercent, 50))),
    motif_size: Math.max(0, Math.trunc(finiteNumberOr(object.motifSize, 200))),
    motif_shape: object.motifShape === 'rect' ? 'rect' : 'circle',
    ray_colour: /^#[0-9a-f]{6}$/i.test(object.rayColour) ? object.rayColour : '#ff0000',
    background_colour: /^#[0-9a-f]{6}$/i.test(object.backgroundColour) ? object.backgroundColour : '#ffff00',
  });

const serialiseGeneratedCircularArrowSource = (object: CircularArrowObject): string =>
  JSON.stringify({
    generator: 'circular-arrow',
    radius: Math.max(1, Math.trunc(finiteNumberOr(object.radius, Math.min(object.width, object.height) / 2))),
    line_width: Math.max(1, Math.trunc(finiteNumberOr(object.lineWidth, 20))),
    head_size: Math.max(0, Math.trunc(finiteNumberOr(object.headSize, 50))),
    angle_degrees: Math.min(360, Math.max(0, finiteNumberOr(object.angleDegrees, 260))),
    centre_angle_degrees: finiteNumberOr(object.centreAngleDegrees, 0),
    head_shape: object.headShape === 'circle' ? 'circle' : 'triangle',
    show_tail_head: object.showTailHead === true,
    flip_vertical: object.flipVertical === true,
    flip_horizontal: object.flipHorizontal === true,
    arrow_colour: /^#[0-9a-f]{6}$/i.test(object.arrowColour) ? object.arrowColour : '#ffff00',
  });

const serialiseGeneratedTriangleBracketSource = (object: TriangleBracketObject): string =>
  JSON.stringify({
    generator: 'triangle-bracket',
    bracket_width: Math.max(1, Math.trunc(finiteNumberOr(object.bracketWidth, 100))),
    angle_degrees: Math.min(180, Math.max(1, finiteNumberOr(object.angleDegrees, 120))),
    arm_length: Math.max(0, Math.trunc(finiteNumberOr(object.armLength, 50))),
    offset_distance: Math.trunc(finiteNumberOr(object.offsetDistance, 0)),
    bracket_colour: /^#[0-9a-f]{6}$/i.test(object.bracketColour) ? object.bracketColour : '#ffffff',
  });

const serialiseGeneratedTartanCheckSource = (object: TartanCheckObject): string =>
  JSON.stringify({
    generator: 'tartan-check',
    tile_size: Math.min(800, Math.max(10, Math.trunc(finiteNumberOr(object.tileSize, 100)))),
    blur_radius: Math.min(300, Math.max(0, Math.trunc(finiteNumberOr(object.blurRadius, 1)))),
    base_colour: /^#[0-9a-f]{6}$/i.test(object.baseColour) ? object.baseColour : '#143e10',
    stripe_colour_a: /^#[0-9a-f]{6}$/i.test(object.stripeColourA) ? object.stripeColourA : '#a81616',
    stripe_colour_b: /^#[0-9a-f]{6}$/i.test(object.stripeColourB) ? object.stripeColourB : '#c9c526',
    line_colour: /^#[0-9a-f]{6}$/i.test(object.lineColour) ? object.lineColour : '#000000',
  });

const serialiseGeneratedHoundstoothSource = (object: HoundstoothObject): string =>
  JSON.stringify({
    generator: 'houndstooth',
    pattern_size: Math.min(200, Math.max(10, Math.trunc(finiteNumberOr(object.patternSize, 50)))),
    foreground_colour: /^#[0-9a-f]{6}$/i.test(object.foregroundColour) ? object.foregroundColour : '#000000',
    background_colour: /^#[0-9a-f]{6}$/i.test(object.backgroundColour) ? object.backgroundColour : '#ffffff',
  });

const serialiseGeneratedYagasuriSource = (object: YagasuriObject): string =>
  JSON.stringify({
    generator: 'yagasuri',
    arrow_width: Math.min(500, Math.max(1, Math.trunc(finiteNumberOr(object.arrowWidth, 15)))),
    arrow_height: Math.min(500, Math.max(1, Math.trunc(finiteNumberOr(object.arrowHeight, 65)))),
    line_width: Math.min(100, Math.max(0, Math.trunc(finiteNumberOr(object.lineWidth, 2)))),
    staggered: object.staggered === true,
    foreground_colour: /^#[0-9a-f]{6}$/i.test(object.foregroundColour) ? object.foregroundColour : '#000000',
    background_colour: /^#[0-9a-f]{6}$/i.test(object.backgroundColour) ? object.backgroundColour : '#ffffff',
  });

const serialiseGeneratedPaperAirplaneSource = (object: PaperAirplaneObject): string =>
  JSON.stringify({
    generator: 'paper-airplane',
    body_length: Math.min(2000, Math.max(1, Math.trunc(finiteNumberOr(object.bodyLength, 200)))),
    wing_width: Math.min(1000, Math.max(0, Math.trunc(finiteNumberOr(object.wingWidth, 80)))),
    fold_height: Math.min(1000, Math.max(0, Math.trunc(finiteNumberOr(object.foldHeight, 50)))),
    gap: Math.min(1000, Math.max(0, Math.trunc(finiteNumberOr(object.gap, 50)))),
    follow_motion_direction: object.followMotionDirection === true,
    axis_mode: Math.trunc(finiteNumberOr(object.axisMode, 0)) === 1 ? 1 : 0,
    fill_colour: /^#[0-9a-f]{6}$/i.test(object.fillColour) ? object.fillColour : '#ffffff',
  });

const serialiseGeneratedAsanohaPatternSource = (object: AsanohaPatternObject): string =>
  JSON.stringify({
    generator: 'asanoha-pattern',
    pattern_size: Math.min(500, Math.max(10, Math.trunc(finiteNumberOr(object.patternSize, 50)))),
    line_width: Math.min(50, Math.max(0, Math.trunc(finiteNumberOr(object.lineWidth, 2)))),
    foreground_colour: /^#[0-9a-f]{6}$/i.test(object.foregroundColour) ? object.foregroundColour : '#000000',
    background_colour: /^#[0-9a-f]{6}$/i.test(object.backgroundColour) ? object.backgroundColour : '#ffffff',
  });

const serialiseGeneratedFocusLinesPlusSource = (object: FocusLinesPlusObject): string =>
  JSON.stringify({
    generator: 'focus-lines-plus',
    ray_width: Math.min(10, Math.max(0.1, finiteNumberOr(object.rayWidth, 1))),
    gap: Math.min(20, Math.max(1, finiteNumberOr(object.gap, 5))),
    centre_radius: Math.min(800, Math.max(0, finiteNumberOr(object.centreRadius, 100))),
    rotation_degrees: Math.min(720, Math.max(-720, finiteNumberOr(object.rotationDegrees, 0))),
    centre_x: finiteNumberOr(object.centreX, object.width / 2),
    centre_y: finiteNumberOr(object.centreY, object.height / 2),
    centre_jitter_percent: Math.min(100, Math.max(0, finiteNumberOr(object.centreJitterPercent, 20))),
    seed: Math.trunc(finiteNumberOr(object.seed, 0)),
    keyframe_interval: Math.max(0, Math.trunc(finiteNumberOr(object.keyframeInterval, 0))),
    line_colour: /^#[0-9a-f]{6}$/i.test(object.lineColour) ? object.lineColour : '#ffffff',
  });

const serialiseGeneratedRandomLineExSource = (object: RandomLineExObject): string =>
  JSON.stringify({
    generator: 'random-line-ex',
    line_count: Math.min(100, Math.max(1, Math.trunc(finiteNumberOr(object.lineCount, 3)))),
    line_width: Math.min(2000, Math.max(0, finiteNumberOr(object.lineWidth, 6))),
    threshold: Math.min(255, Math.max(0, Math.trunc(finiteNumberOr(object.threshold, 128)))),
    noise_cell_size: Math.min(50, Math.max(0, Math.trunc(finiteNumberOr(object.noiseCellSize, 12)))),
    width_variance: Math.min(2000, Math.max(0, finiteNumberOr(object.widthVariance, 0))),
    seed: Math.trunc(finiteNumberOr(object.seed, 0)),
    line_colour: /^#[0-9a-f]{6}$/i.test(object.lineColour) ? object.lineColour : '#ffffff',
  });

const serialiseGeneratedContourTraceSource = (object: ContourTraceObject): string =>
  JSON.stringify({
    generator: 'contour-trace-93',
    line_width: Math.min(200, Math.max(1, finiteNumberOr(object.lineWidth, 3))),
    contour_count: Math.min(64, Math.max(1, Math.trunc(finiteNumberOr(object.contourCount, 5)))),
    jitter_amount: Math.min(100, Math.max(0, finiteNumberOr(object.jitterAmount, 1.5))),
    trace_colour: /^#[0-9a-f]{6}$/i.test(object.traceColour) ? object.traceColour : '#ffffff',
    background_opacity: Math.min(1, Math.max(0, finiteNumberOr(object.backgroundOpacity, 0))),
    seed: Math.trunc(finiteNumberOr(object.seed, 93)),
  });

const serialiseGeneratedDisplacementPolySource = (object: DisplacementPolyObject): string =>
  JSON.stringify({
    generator: 'displacement-poly-93',
    columns: Math.min(128, Math.max(1, Math.trunc(finiteNumberOr(object.columns, 14)))),
    rows: Math.min(128, Math.max(1, Math.trunc(finiteNumberOr(object.rows, 8)))),
    displacement_scale: Math.min(1000, Math.max(0, finiteNumberOr(object.displacementScale, 42))),
    depth_scale: Math.min(1000, Math.max(0, finiteNumberOr(object.depthScale, 18))),
    mesh_opacity: Math.min(1, Math.max(0, finiteNumberOr(object.meshOpacity, 0.85))),
    fill_opacity: Math.min(1, Math.max(0, finiteNumberOr(object.fillOpacity, 0.18))),
    line_colour: /^#[0-9a-f]{6}$/i.test(object.lineColour) ? object.lineColour : '#36c2ff',
    fill_colour: /^#[0-9a-f]{6}$/i.test(object.fillColour) ? object.fillColour : '#0b1020',
    seed: Math.trunc(finiteNumberOr(object.seed, 93)),
  });

const serialiseGeneratedHologramSource = (object: HologramObject): string =>
  JSON.stringify({
    generator: 'hologram',
    tile_size: Math.min(1000, Math.max(10, Math.trunc(finiteNumberOr(object.tileSize, 80)))),
    rotation_degrees: Math.min(720, Math.max(-720, finiteNumberOr(object.rotationDegrees, 0))),
    gradient_angle_degrees: Math.min(720, Math.max(-720, finiteNumberOr(object.gradientAngleDegrees, -60))),
    colour_mode: Math.min(2, Math.max(0, Math.trunc(finiteNumberOr(object.colourMode, 1)))),
    tint_colour: /^#[0-9a-f]{6}$/i.test(object.tintColour) ? object.tintColour : '#ffffff',
  });

const serialiseGeneratedProtractorSource = (object: ProtractorObject): string =>
  JSON.stringify({
    generator: 'protractor',
    radius: Math.min(2000, Math.max(1, Math.trunc(finiteNumberOr(object.radius, 180)))),
    measured_angle_degrees: Math.min(180, Math.max(0, finiteNumberOr(object.measuredAngleDegrees, 90))),
    tick_step_degrees: Math.min(90, Math.max(1, Math.trunc(finiteNumberOr(object.tickStepDegrees, 10)))),
    major_tick_step_degrees: Math.min(180, Math.max(1, Math.trunc(finiteNumberOr(object.majorTickStepDegrees, 30)))),
    decimal_places: Math.min(5, Math.max(0, Math.trunc(finiteNumberOr(object.decimalPlaces, 1)))),
    line_colour: /^#[0-9a-f]{6}$/i.test(object.lineColour) ? object.lineColour : '#ffffff',
    text_colour: /^#[0-9a-f]{6}$/i.test(object.textColour) ? object.textColour : '#ffffff',
    shadow_colour: /^#[0-9a-f]{6}$/i.test(object.shadowColour) ? object.shadowColour : '#000000',
  });

const serialiseGeneratedShakingPolygonSource = (object: ShakingPolygonObject): string =>
  JSON.stringify({
    generator: 'shaking-polygon',
    line_width: Math.min(100, Math.max(1, Math.trunc(finiteNumberOr(object.lineWidth, 20)))),
    vertex_count: Math.min(16, Math.max(2, Math.trunc(finiteNumberOr(object.vertexCount, 3)))),
    fixed_diameter: Math.min(2000, Math.max(0, Math.trunc(finiteNumberOr(object.fixedDiameter, 260)))),
    vertical_distortion_percent: Math.min(100, Math.max(-100, finiteNumberOr(object.verticalDistortionPercent, 0))),
    repeat_count: Math.min(100, Math.max(1, Math.trunc(finiteNumberOr(object.repeatCount, 1)))),
    repeat_frequency: Math.max(1, Math.trunc(finiteNumberOr(object.repeatFrequency, 1))),
    fill: object.fill === true,
    jitter_range: Math.min(2000, Math.max(0, finiteNumberOr(object.jitterRange, 20))),
    jitter_interval: Math.max(1, Math.trunc(finiteNumberOr(object.jitterInterval, 10))),
    stepped: object.stepped === true,
    colour: /^#[0-9a-f]{6}$/i.test(object.colour) ? object.colour : '#ffffff',
    seed: Math.trunc(finiteNumberOr(object.seed, 0)),
  });

const serialiseGeneratedToneCurveSource = (object: ToneCurveObject): string =>
  JSON.stringify({
    generator: 'simple-tone-curve',
    grid_divisions: Math.min(16, Math.max(1, Math.trunc(finiteNumberOr(object.gridDivisions, 4)))),
    line_width: Math.min(100, Math.max(1, Math.trunc(finiteNumberOr(object.lineWidth, 3)))),
    curve_points: normaliseToneCurvePoints(object.curvePoints),
    curve_colour: /^#[0-9a-f]{6}$/i.test(object.curveColour) ? object.curveColour : '#ffffff',
    grid_colour: /^#[0-9a-f]{6}$/i.test(object.gridColour) ? object.gridColour : '#333333',
    background_colour: /^#[0-9a-f]{6}$/i.test(object.backgroundColour) ? object.backgroundColour : '#000000',
  });

const normaliseHksyPaletteColours = (colours: readonly string[] | undefined): string[] => {
  if (!Array.isArray(colours)) return [];
  return colours
    .filter((colour) => /^#[0-9a-f]{6}$/i.test(colour))
    .slice(0, 16);
};

const defaultHksyAnchorPoints = [
  { x: -88, y: 50 },
  { x: 0, y: -100 },
  { x: 88, y: 50 },
];

const normaliseHksyAnchorPoints = (points: HksyCheckerGridObject['anchorPoints']): Array<{ x: number; y: number }> => {
  if (!Array.isArray(points)) return defaultHksyAnchorPoints;
  const normalised = points
    .filter((point) => Number.isFinite(point?.x) && Number.isFinite(point?.y))
    .map((point) => ({
      x: Math.min(1000, Math.max(-1000, point.x)),
      y: Math.min(1000, Math.max(-1000, point.y)),
    }))
    .slice(0, 16);
  return normalised.length >= 2 ? normalised : defaultHksyAnchorPoints;
};

const serialiseGeneratedHksyCheckerGridSource = (object: HksyCheckerGridObject): string => {
  const paletteColours = normaliseHksyPaletteColours(object.paletteColours);
  const pattern = object.pattern === 'diamond' || object.pattern === 'measured-grid' || object.pattern === 'anchor-line' ? object.pattern : undefined;
  return JSON.stringify({
    generator: 'hksy-checker-grid',
    ...(pattern ? { pattern } : {}),
    cell_size: Math.min(1000, Math.max(1, Math.trunc(finiteNumberOr(object.cellSize, 50)))),
    line_width: Math.min(100, Math.max(0, Math.trunc(finiteNumberOr(object.lineWidth, 2)))),
    checker_enabled: object.checkerEnabled === true,
    grid_enabled: object.gridEnabled === true,
    foreground_colour: /^#[0-9a-f]{6}$/i.test(object.foregroundColour) ? object.foregroundColour : '#ffffff',
    secondary_colour: /^#[0-9a-f]{6}$/i.test(object.secondaryColour) ? object.secondaryColour : '#333333',
    background_colour: /^#[0-9a-f]{6}$/i.test(object.backgroundColour) ? object.backgroundColour : '#000000',
    ...(paletteColours.length >= 2 ? { palette_colours: paletteColours } : {}),
    ...(pattern === 'measured-grid' ? {
      separate_interval: Math.min(1000, Math.max(1, Math.trunc(finiteNumberOr(object.separateInterval, 5)))),
      separate_line_width: Math.min(100, Math.max(0, Math.trunc(finiteNumberOr(object.separateLineWidth, 3)))),
    } : {}),
    ...(pattern === 'anchor-line' ? {
      anchor_points: normaliseHksyAnchorPoints(object.anchorPoints),
      round_caps: object.roundCaps !== false,
      max_join_distance: Math.min(300, Math.max(0, finiteNumberOr(object.maxJoinDistance, 50))),
    } : {}),
  });
};

const serialiseGeneratedGetColorDotsSource = (
  object: GetColorDotFieldObject,
  objects: TimelineObject[] = [],
  time = object.startTime
): string => {
  const sampleSource = resolveGetColorSampleSource(object, objects, time);
  return JSON.stringify({
    generator: 'getcolor-v2r-dot-field',
    columns: Math.min(512, Math.max(1, Math.trunc(finiteNumberOr(object.columns, 32)))),
    rows: Math.min(512, Math.max(1, Math.trunc(finiteNumberOr(object.rows, 18)))),
    dot_size: Math.min(2000, Math.max(0, finiteNumberOr(object.dotSize, 14))),
    size_influence: Math.min(4, Math.max(0, finiteNumberOr(object.sizeInfluence, 0.65))),
    luminance_influence: Math.min(4, Math.max(0, finiteNumberOr(object.luminanceInfluence, 0.7))),
    hue_shift_degrees: Math.min(720, Math.max(-720, finiteNumberOr(object.hueShiftDegrees, 0))),
    alternate_rows: object.alternateRows === true,
    foreground_colour: /^#[0-9a-f]{6}$/i.test(object.foregroundColour) ? object.foregroundColour : '#ffffff',
    secondary_colour: /^#[0-9a-f]{6}$/i.test(object.secondaryColour) ? object.secondaryColour : '#36c2ff',
    background_colour: /^#[0-9a-f]{6}$/i.test(object.backgroundColour) ? object.backgroundColour : '#000000',
    seed: Math.trunc(finiteNumberOr(object.seed, 93)),
    ...(object.dotShape === 'circle' || object.dotShape === 'square' || object.dotShape === 'diamond' ? {
      dot_shape: object.dotShape,
      stroke_width: Math.min(200, Math.max(0, finiteNumberOr(object.strokeWidth, 0))),
    } : {}),
    ...(sampleSource ? {
      source_image: sampleSource.source,
      ...(sampleSource.activeLayerIds ? { source_active_layer_ids: sampleSource.activeLayerIds } : {}),
      sample_strength: Math.min(1, Math.max(0, finiteNumberOr(object.sampleStrength, 1))),
      sample_hue_shift_degrees: Math.min(720, Math.max(-720, finiteNumberOr(object.sampleHueShiftDegrees, 0))),
    } : {}),
  });
};

const resolveGetColorSampleSource = (
  object: GetColorDotFieldObject,
  objects: TimelineObject[],
  time: number
): { source: string; activeLayerIds?: string[] } | undefined => {
  if (typeof object.sampleSourcePath === 'string' && object.sampleSourcePath.length > 0) {
    return { source: object.sampleSourcePath };
  }

  const candidates = objects
    .filter(isGetColorSampleSourceObject)
    .filter((candidate) => time >= candidate.startTime && time < candidate.startTime + candidate.duration);

  if (typeof object.sampleSourceObjectId === 'string' && object.sampleSourceObjectId.length > 0) {
    const matched = candidates.find((candidate) => candidate.id === object.sampleSourceObjectId);
    return getColorSampleSourceForObject(matched);
  }

  if (typeof object.sampleSourceLayer === 'number' && Number.isFinite(object.sampleSourceLayer)) {
    const matched = candidates.find((candidate) => candidate.layer === object.sampleSourceLayer);
    return getColorSampleSourceForObject(matched);
  }

  return undefined;
};

const isGetColorSampleSourceObject = (object: TimelineObject): object is ImageObject | PsdObject =>
  object.type === 'image' || object.type === 'psd';

const getColorSampleSourceForObject = (
  object: ImageObject | PsdObject | undefined
): { source: string; activeLayerIds?: string[] } | undefined => {
  if (!object) return undefined;
  const source = mediaSourceForObject(object);
  if (!source) return undefined;
  if (object.type === 'psd') {
    return {
      source,
      activeLayerIds: activeLayerIdsForPsd(object),
    };
  }
  return { source };
};

const serialiseGeneratedRegionFrameSource = (object: RegionFrameObject): string =>
  JSON.stringify({
    generator: 'region-frame-93',
    line_width: Math.min(5000, Math.max(0, finiteNumberOr(object.lineWidth, 10))),
    shape: object.shape === 'ellipse' || object.shape === 'cut_corner' ? object.shape : 'rectangle',
    ...(object.shape === 'cut_corner' ? {
      corner_cut: Math.min(5000, Math.max(0, finiteNumberOr(object.cornerCut, 20))),
    } : {}),
    extra_width: Math.min(5000, Math.max(-5000, finiteNumberOr(object.extraWidth, 0))),
    extra_height: Math.min(5000, Math.max(-5000, finiteNumberOr(object.extraHeight, 0))),
    background_opacity: Math.min(1, Math.max(0, finiteNumberOr(object.backgroundOpacity, 0.2))),
    frame_colour: /^#[0-9a-f]{6}$/i.test(object.frameColour) ? object.frameColour : '#ffffff',
    background_colour: /^#[0-9a-f]{6}$/i.test(object.backgroundColour) ? object.backgroundColour : '#ccccff',
  });

const serialiseGeneratedSimpleTubeSource = (object: SimpleTubeObject): string =>
  JSON.stringify({
    generator: 'simple-tube-93',
    radius: Math.min(9000, Math.max(0, finiteNumberOr(object.radius, 150))),
    depth: Math.min(12000, Math.max(-12000, finiteNumberOr(object.depth, 280))),
    segments: Math.min(128, Math.max(3, Math.trunc(finiteNumberOr(object.segments, 16)))),
    rings: Math.min(128, Math.max(2, Math.trunc(finiteNumberOr(object.rings, 10)))),
    twist_degrees: Math.min(1800, Math.max(-1800, finiteNumberOr(object.twistDegrees, 0))),
    random_amount: Math.min(300, Math.max(-300, finiteNumberOr(object.randomAmount, 0))),
    stroke_width: Math.min(200, Math.max(0, finiteNumberOr(object.strokeWidth, 3))),
    colour: /^#[0-9a-f]{6}$/i.test(object.colour) ? object.colour : '#0e769f',
    secondary_colour: /^#[0-9a-f]{6}$/i.test(object.secondaryColour) ? object.secondaryColour : '#ffffff',
    colour_pattern: object.colourPattern === 'ring' || object.colourPattern === 'depth' ? object.colourPattern : 'single',
    fog_strength: Math.min(1, Math.max(0, finiteNumberOr(object.fogStrength, 0))),
    fog_colour: object.fogColour && /^#[0-9a-f]{6}$/i.test(object.fogColour) ? object.fogColour : '#ffffff',
    seed: Math.trunc(finiteNumberOr(object.seed, 93)),
    torus: object.torus === true,
  });

const serialiseGeneratedSphereDotsSource = (object: SphereDotsObject): string =>
  JSON.stringify({
    generator: 'sphere-drawpixel-93',
    radius: Math.min(5000, Math.max(1, finiteNumberOr(object.radius, 170))),
    columns: Math.min(256, Math.max(3, Math.trunc(finiteNumberOr(object.columns, 16)))),
    rows: Math.min(256, Math.max(2, Math.trunc(finiteNumberOr(object.rows, 12)))),
    rotation_degrees: Math.min(1000, Math.max(-1000, finiteNumberOr(object.rotationDegrees, 10))),
    offset_degrees: Math.min(360, Math.max(-360, finiteNumberOr(object.offsetDegrees, 0))),
    luminance_influence: Math.min(5000, Math.max(-5000, finiteNumberOr(object.luminanceInfluence, 0))),
    point_size: Math.min(200, Math.max(0, finiteNumberOr(object.pointSize, 6))),
    latitude_line_width: Math.min(100, Math.max(0, finiteNumberOr(object.latitudeLineWidth, 2))),
    colour: /^#[0-9a-f]{6}$/i.test(object.colour) ? object.colour : '#ffffff',
    secondary_colour: /^#[0-9a-f]{6}$/i.test(object.secondaryColour) ? object.secondaryColour : '#36c2ff',
    seed: Math.trunc(finiteNumberOr(object.seed, 93)),
    plane_mode: object.planeMode === true,
  });

const serialiseGeneratedSphericalFieldSource = (object: SphericalFieldObject): string =>
  JSON.stringify({
    generator: 'spherical-field-93',
    radius: Math.min(5000, Math.max(0, finiteNumberOr(object.radius, 160))),
    strength: Math.min(200, Math.max(-200, finiteNumberOr(object.strength, 100))),
    colour_amount: Math.min(100, Math.max(-100, finiteNumberOr(object.colourAmount, 100))),
    alpha_amount: Math.min(100, Math.max(-100, finiteNumberOr(object.alphaAmount, 0))),
    line_width: Math.min(100, Math.max(0, finiteNumberOr(object.lineWidth, 3))),
    ring_count: Math.min(64, Math.max(1, Math.trunc(finiteNumberOr(object.ringCount, 4)))),
    vector_count: Math.min(256, Math.max(0, Math.trunc(finiteNumberOr(object.vectorCount, 16)))),
    field_colour: /^#[0-9a-f]{6}$/i.test(object.fieldColour) ? object.fieldColour : '#ff3b30',
    secondary_colour: /^#[0-9a-f]{6}$/i.test(object.secondaryColour) ? object.secondaryColour : '#36c2ff',
    background_opacity: Math.min(1, Math.max(0, finiteNumberOr(object.backgroundOpacity, 0.08))),
    container: object.container === true,
    seed: Math.trunc(finiteNumberOr(object.seed, 93)),
  });

const normaliseToneCurvePoints = (points: readonly number[]): number[] => {
  const validPoints = points
    .filter((point) => Number.isFinite(point))
    .map((point) => Math.max(0, Math.min(1, point)))
    .slice(0, 64);
  return validPoints.length >= 2 ? validPoints : [0, 1];
};

const normaliseTrackBarValues = (values: readonly number[]): number[] =>
  Array.from({ length: 4 }, (_, index) => finiteNumberOr(values[index], 0));

const normaliseTrackBarRanges = (ranges: readonly [number, number][]): [number, number][] =>
  Array.from({ length: 4 }, (_, index) => {
    const range = ranges[index] ?? [0, 100];
    const min = finiteNumberOr(range[0], 0);
    const max = finiteNumberOr(range[1], 100);
    return min === max ? [min, min + 1] : [min, max];
  });

const normaliseTrackBarLabels = (labels: readonly string[]): string[] =>
  Array.from({ length: 4 }, (_, index) => labels[index] || `Track${String.fromCharCode(65 + index)}`);

const normalisePieChartValues = (values: readonly number[]): number[] =>
  values
    .map((value) => Math.max(0, finiteNumberOr(value, 0)))
    .filter((value) => value > 0)
    .slice(0, 64);

const normalisePieChartSortMode = (sortMode: PieChartObject['sortMode']): PieChartObject['sortMode'] =>
  sortMode === 'ascending' || sortMode === 'descending' ? sortMode : 'none';

const normalisePieChartLabelMode = (labelMode: PieChartObject['labelMode']): PieChartObject['labelMode'] =>
  labelMode === 'none' || labelMode === 'input' ? labelMode : 'percentage';

const normalisePieChartColours = (colours: readonly string[]): string[] => {
  const validColours = colours.filter((colour) => /^#[0-9a-f]{6}$/i.test(colour)).slice(0, 64);
  return validColours.length > 0 ? validColours : ['#389ba6', '#f2e2c4', '#f29422', '#f27830', '#f24b0f'];
};

const normaliseHistogramBins = (values: readonly number[]): number[] => {
  const bins = values
    .map((value) => Math.min(1, Math.max(0, finiteNumberOr(value, 0))))
    .slice(0, 256);
  return bins.length > 0 ? bins : [0];
};

const normaliseHistogramColours = (colours: readonly string[]): string[] =>
  Array.from({ length: 4 }, (_, index) => {
    const fallback = ['#ffffff', '#ff4b4b', '#4bff6a', '#4b8cff'][index];
    const colour = colours[index];
    return /^#[0-9a-f]{6}$/i.test(colour) ? colour : fallback;
  });


const findTargetAudioForGeneratedAudio = (
  object: Pick<AudioVisualizationObject | AudioSphereObject, 'targetAudioId' | 'targetLayer'>,
  objects: TimelineObject[],
  time: number
): AudioObject | null => {
  if (object.targetAudioId) {
    const direct = objects.find((candidate): candidate is AudioObject => (
      candidate.type === 'audio' && candidate.id === object.targetAudioId
    ));
    if (direct) return direct;
  }
  if (typeof object.targetLayer === 'number' && object.targetLayer >= 0) {
    const layerTarget = objects.find((candidate): candidate is AudioObject => (
      candidate.type === 'audio'
      && candidate.layer === object.targetLayer
      && time >= candidate.startTime
      && time < candidate.startTime + candidate.duration
    ));
    if (layerTarget) return layerTarget;
  }
  return null;
};

const mediaSourceForObject = (
  object: SupportedMediaObject | AudioObject,
  videoSourceMode: RustSceneVideoSourceMode = 'previewProxy'
): string => {
  if (object.type === 'video' && videoSourceMode === 'previewProxy' && object.proxyFilePath) {
    return object.proxyFilePath;
  }
  return object.filePath || object.src || '';
};

const mediaDimensionsForObject = (
  object: SupportedSceneObject,
  videoSourceMode: RustSceneVideoSourceMode
): { width: number; height: number } => {
  if (object.type === 'video' && videoSourceMode === 'exportOriginal') {
    return {
      width: positiveNumberOrFallback(object.width, 1),
      height: positiveNumberOrFallback(object.height, 1),
    };
  }
  return {
    width: object.width,
    height: object.height,
  };
};

const mediaSourceScaleForObject = (
  object: SupportedSceneObject,
  videoSourceMode: RustSceneVideoSourceMode
): { x: number; y: number } => {
  if (object.type !== 'video' || videoSourceMode !== 'exportOriginal') {
    return { x: 1, y: 1 };
  }
  const dimensions = mediaDimensionsForObject(object, videoSourceMode);
  return {
    x: safeScaleRatio(object.width, dimensions.width),
    y: safeScaleRatio(object.height, dimensions.height),
  };
};

const positiveNumberOrFallback = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;

const finiteNumberOr = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const safeScaleRatio = (displaySize: number, sourceSize: number): number => {
  if (!Number.isFinite(displaySize) || !Number.isFinite(sourceSize) || sourceSize <= 0) {
    return 1;
  }
  return displaySize / sourceSize;
};

const mediaKindForObject = (object: SupportedMediaObject): RustSceneMediaReference['kind'] => {
  if (object.type === 'video') return 'Video';
  if (object.type === 'psd') return 'Psd';
  return 'Image';
};

const sourceFrameForObject = (
  object: SupportedSceneObject,
  time: number,
  fps: number
): number => {
  if (object.type === 'shape') return 0;
  if (object.type === 'image') return 0;
  if (object.type === 'psd') return 0;
  if (object.type === 'audio_visualization') return secondsToFrameIndex(Math.max(0, time - object.startTime), fps);
  if (object.type === 'audio_sphere') return secondsToFrameIndex(Math.max(0, time - object.startTime), fps);
  if (object.type === 'particle') return secondsToFrameIndex(Math.max(0, time - object.startTime), fps);
  if (object.type === 'barcode') return 0;
  if (object.type === 'puzzle_piece') return 0;
  if (object.type === 'colour_wheel') return 0;
  if (object.type === 'gourd') return 0;
  if (object.type === 'gear') return 0;
  if (object.type === 'track_bar') return 0;
  if (object.type === 'pie_chart') return 0;
  if (object.type === 'histogram') return 0;
  if (object.type === 'sunburst') return 0;
  if (object.type === 'circular_arrow') return 0;
  if (object.type === 'triangle_bracket') return 0;
  if (object.type === 'tartan_check') return 0;
  if (object.type === 'houndstooth') return 0;
  if (object.type === 'yagasuri') return 0;
  if (object.type === 'paper_airplane') return 0;
  if (object.type === 'asanoha_pattern') return 0;
  if (object.type === 'focus_lines_plus') {
    const interval = Math.max(0, Math.trunc(finiteNumberOr(object.keyframeInterval, 0)));
    if (interval === 0) return 0;
    const localFrame = secondsToFrameIndex(Math.max(0, time - object.startTime), fps);
    return Math.floor(localFrame / interval) * interval;
  }
  if (object.type === 'random_line_ex') return 0;
  if (object.type === 'contour_trace') return 0;
  if (object.type === 'displacement_poly') return 0;
  if (object.type === 'hologram') return 0;
  if (object.type === 'protractor') return 0;
  if (object.type === 'shaking_polygon') return secondsToFrameIndex(Math.max(0, time - object.startTime), fps);
  if (object.type === 'tone_curve') return 0;
  if (object.type === 'getcolor_dot_field') return 0;
  if (object.type === 'hksy_checker_grid') return 0;
  if (object.type === 'region_frame') return 0;
  if (object.type === 'simple_tube') return 0;
  const localTime = Math.max(0, time - object.startTime);
  const mediaTime = localTime + (object.offset ?? 0);
  return secondsToFrameIndex(mediaTime, fps);
};

const secondsToFrameIndex = (seconds: number, fps: number): number => {
  const safeSeconds = Number.isFinite(seconds) ? seconds : 0;
  const safeFps = Number.isFinite(fps) && fps > 0 ? fps : 60;
  return Math.max(0, Math.round(safeSeconds * safeFps));
};

const fpsToFrameRate = (fps: number): RustFrameRate => {
  const safeFps = Number.isFinite(fps) && fps > 0 ? fps : 60;
  const rounded = Math.round(safeFps);
  if (Math.abs(safeFps - rounded) < 1e-6) {
    return {
      numerator: rounded,
      denominator: 1,
    };
  }

  const denominator = 1000;
  const numerator = Math.max(1, Math.round(safeFps * denominator));
  const divisor = greatestCommonDivisor(numerator, denominator);
  return {
    numerator: numerator / divisor,
    denominator: denominator / divisor,
  };
};

const greatestCommonDivisor = (left: number, right: number): number => {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b !== 0) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a || 1;
};

const clamp01 = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
};

const normaliseRotationDegrees = (value: number): number =>
  Number.isFinite(value) ? value : 0;

const validateSnapshot = (
  snapshot: unknown,
  issues: RustSceneSnapshotBoundaryIssue[]
) => {
  if (!isRecord(snapshot)) {
    addIssue(issues, 'schemaMismatch', 'snapshot', 'SceneSnapshot must be a JSON object.');
    return;
  }

  validateKnownKeys(snapshot, 'snapshot', ['frame_index', 'colour', 'clips'], issues);
  validateInteger(snapshot.frame_index, 'snapshot.frame_index', issues);
  validateColourPipeline(snapshot.colour, 'snapshot.colour', issues);

  if (!Array.isArray(snapshot.clips)) {
    addIssue(issues, 'schemaMismatch', 'snapshot.clips', 'clips must be an array.');
    return;
  }

  snapshot.clips.forEach((clip, index) => {
    validateClip(clip, `snapshot.clips[${index}]`, issues);
  });
};

const validateColourPipeline = (
  colour: unknown,
  path: string,
  issues: RustSceneSnapshotBoundaryIssue[]
) => {
  if (!isRecord(colour)) {
    addIssue(issues, 'schemaMismatch', path, 'colour must be a JSON object.');
    return;
  }

  validateKnownKeys(colour, path, ['profile', 'working_space', 'alpha'], issues);
  validateEnum(colour.profile, `${path}.profile`, ['rec709-sdr'], issues);
  validateEnum(colour.working_space, `${path}.working_space`, ['linear-light'], issues);
  validateEnum(colour.alpha, `${path}.alpha`, ['premultiplied'], issues);
};

const validateClip = (
  clip: unknown,
  path: string,
  issues: RustSceneSnapshotBoundaryIssue[]
) => {
  if (!isRecord(clip)) {
    addIssue(issues, 'schemaMismatch', path, 'clip must be a JSON object.');
    return;
  }

  validateKnownKeys(
    clip,
    path,
    ['clip_id', 'track_id', 'media_id', 'source_frame', 'z_index', 'transform', 'opacity', 'effects'],
    issues
  );
  validateString(clip.clip_id, `${path}.clip_id`, issues);
  validateString(clip.track_id, `${path}.track_id`, issues);
  validateString(clip.media_id, `${path}.media_id`, issues);
  validateInteger(clip.source_frame, `${path}.source_frame`, issues);
  validateInteger(clip.z_index, `${path}.z_index`, issues);
  validateTransform(clip.transform, `${path}.transform`, issues);
  validateUnitInterval(clip.opacity, `${path}.opacity`, issues);
  validateEffects(clip.effects, `${path}.effects`, issues);
};

const validateTransform = (
  transform: unknown,
  path: string,
  issues: RustSceneSnapshotBoundaryIssue[]
) => {
  if (!isRecord(transform)) {
    addIssue(issues, 'schemaMismatch', path, 'transform must be a JSON object.');
    return;
  }

  validateKnownKeys(
    transform,
    path,
    ['translation_x', 'translation_y', 'scale_x', 'scale_y', 'rotation_degrees', 'sampling'],
    issues
  );
  validateFiniteNumber(transform.translation_x, `${path}.translation_x`, issues);
  validateFiniteNumber(transform.translation_y, `${path}.translation_y`, issues);
  validateFiniteNumber(transform.scale_x, `${path}.scale_x`, issues);
  validateFiniteNumber(transform.scale_y, `${path}.scale_y`, issues);
  validateFiniteNumber(transform.rotation_degrees, `${path}.rotation_degrees`, issues);
  validateEnum(transform.sampling, `${path}.sampling`, ['nearest', 'bilinear'], issues);
};

const validateEffects = (
  effects: unknown,
  path: string,
  issues: RustSceneSnapshotBoundaryIssue[]
) => {
  if (!Array.isArray(effects)) {
    addIssue(issues, 'schemaMismatch', path, 'effects must be an array.');
    return;
  }

  effects.forEach((effect, index) => {
    const effectPath = `${path}[${index}]`;
    if (!isRecord(effect) || Object.keys(effect).length !== 1) {
      addIssue(issues, 'schemaMismatch', effectPath, 'Only known Rust effects are supported at the Rust boundary.');
      return;
    }
    if (isRecord(effect.LinearGain)) {
      validateFiniteNumber(effect.LinearGain.gain, `${effectPath}.LinearGain.gain`, issues);
      return;
    }
    if (isRecord(effect.ColourAberration)) {
      validateFiniteNumber(effect.ColourAberration.offset_x, `${effectPath}.ColourAberration.offset_x`, issues);
      validateFiniteNumber(effect.ColourAberration.offset_y, `${effectPath}.ColourAberration.offset_y`, issues);
      return;
    }
    if (isRecord(effect.Outline)) {
      validateNumberArray(effect.Outline.colour, `${effectPath}.Outline.colour`, 3, issues);
      validateFiniteNumber(effect.Outline.thickness, `${effectPath}.Outline.thickness`, issues);
      validateUnitInterval(effect.Outline.opacity, `${effectPath}.Outline.opacity`, issues);
      return;
    }
    if (isRecord(effect.Wipe)) {
      validateEnum(effect.Wipe.edge, `${effectPath}.Wipe.edge`, ['left', 'right', 'top', 'bottom'], issues);
      validateUnitInterval(effect.Wipe.progress, `${effectPath}.Wipe.progress`, issues);
      return;
    }
    if (isRecord(effect.Clipping)) {
      validateFiniteNumber(effect.Clipping.top, `${effectPath}.Clipping.top`, issues);
      validateFiniteNumber(effect.Clipping.bottom, `${effectPath}.Clipping.bottom`, issues);
      validateFiniteNumber(effect.Clipping.left, `${effectPath}.Clipping.left`, issues);
      validateFiniteNumber(effect.Clipping.right, `${effectPath}.Clipping.right`, issues);
      validateFiniteNumber(effect.Clipping.angle_degrees, `${effectPath}.Clipping.angle_degrees`, issues);
      return;
    }
    if (isRecord(effect.SpotLight)) {
      validateUnitInterval(effect.SpotLight.centre_x, `${effectPath}.SpotLight.centre_x`, issues);
      validateUnitInterval(effect.SpotLight.centre_y, `${effectPath}.SpotLight.centre_y`, issues);
      validateFiniteNumber(effect.SpotLight.radius, `${effectPath}.SpotLight.radius`, issues);
      validateFiniteNumber(effect.SpotLight.intensity, `${effectPath}.SpotLight.intensity`, issues);
      validateNumberArray(effect.SpotLight.colour, `${effectPath}.SpotLight.colour`, 3, issues);
      return;
    }
    if (isRecord(effect.DisplacementMap)) {
      validateFiniteNumber(effect.DisplacementMap.amount_x, `${effectPath}.DisplacementMap.amount_x`, issues);
      validateFiniteNumber(effect.DisplacementMap.amount_y, `${effectPath}.DisplacementMap.amount_y`, issues);
      validateFiniteNumber(effect.DisplacementMap.size, `${effectPath}.DisplacementMap.size`, issues);
      validateUnitInterval(effect.DisplacementMap.strength, `${effectPath}.DisplacementMap.strength`, issues);
      return;
    }
    if (isRecord(effect.FakeDof)) {
      validateUnitInterval(effect.FakeDof.focus_x, `${effectPath}.FakeDof.focus_x`, issues);
      validateUnitInterval(effect.FakeDof.focus_y, `${effectPath}.FakeDof.focus_y`, issues);
      validateFiniteNumber(effect.FakeDof.focus_radius, `${effectPath}.FakeDof.focus_radius`, issues);
      validateFiniteNumber(effect.FakeDof.blur, `${effectPath}.FakeDof.blur`, issues);
      validateUnitInterval(effect.FakeDof.strength, `${effectPath}.FakeDof.strength`, issues);
      return;
    }
    if (isRecord(effect.AutoBlur)) {
      validateFiniteNumber(effect.AutoBlur.angle_degrees, `${effectPath}.AutoBlur.angle_degrees`, issues);
      validateFiniteNumber(effect.AutoBlur.radius, `${effectPath}.AutoBlur.radius`, issues);
      validateUnitInterval(effect.AutoBlur.strength, `${effectPath}.AutoBlur.strength`, issues);
      validateUnitInterval(effect.AutoBlur.colour_shift, `${effectPath}.AutoBlur.colour_shift`, issues);
      return;
    }
    if (isRecord(effect.Stretch)) {
      validateFiniteNumber(effect.Stretch.angle_degrees, `${effectPath}.Stretch.angle_degrees`, issues);
      validateFiniteNumber(effect.Stretch.amount, `${effectPath}.Stretch.amount`, issues);
      validateUnitInterval(effect.Stretch.strength, `${effectPath}.Stretch.strength`, issues);
      return;
    }
    if (isRecord(effect.MultiSlicer)) {
      validateFiniteNumber(effect.MultiSlicer.angle_degrees, `${effectPath}.MultiSlicer.angle_degrees`, issues);
      validateFiniteNumber(effect.MultiSlicer.offset, `${effectPath}.MultiSlicer.offset`, issues);
      validateFiniteNumber(effect.MultiSlicer.slices, `${effectPath}.MultiSlicer.slices`, issues);
      validateFiniteNumber(effect.MultiSlicer.expansion, `${effectPath}.MultiSlicer.expansion`, issues);
      validateUnitInterval(effect.MultiSlicer.strength, `${effectPath}.MultiSlicer.strength`, issues);
      return;
    }
    addIssue(issues, 'schemaMismatch', effectPath, 'Unknown Rust effect.');
  });
};

const validateMediaReferences = (
  media: unknown,
  snapshot: unknown,
  issues: RustSceneSnapshotBoundaryIssue[]
) => {
  if (!Array.isArray(media)) {
    addIssue(issues, 'schemaMismatch', 'media', 'media must be an array.');
    return;
  }

  const mediaIds = new Set<string>();
  const mediaIndexById = new Map<string, number>();
  media.forEach((reference, index) => {
    const path = `media[${index}]`;
    if (!isRecord(reference)) {
      addIssue(issues, 'schemaMismatch', path, 'media reference must be a JSON object.');
      return;
    }
    validateKnownKeys(reference, path, ['id', 'kind', 'source', 'width', 'height', 'source_rate', 'active_layer_ids'], issues);
    validateString(reference.id, `${path}.id`, issues);
    validateEnum(reference.kind, `${path}.kind`, ['Image', 'Video', 'SolidColour', 'GeneratedGradient', 'GeneratedAudioWaveform', 'GeneratedAudioSphere', 'GeneratedParticle', 'GeneratedBarcode', 'GeneratedPuzzlePiece', 'GeneratedColourWheel', 'GeneratedGourd', 'GeneratedGear', 'GeneratedTrackBar', 'GeneratedPieChart', 'GeneratedHistogram', 'GeneratedToneCurve', 'GeneratedGetColorDots', 'GeneratedHksyCheckerGrid', 'GeneratedRegionFrame', 'GeneratedSimpleTube', 'GeneratedSphereDots', 'GeneratedSphericalField', 'GeneratedSunburst', 'GeneratedCircularArrow', 'GeneratedTriangleBracket', 'GeneratedTartanCheck', 'GeneratedHoundstooth', 'GeneratedYagasuri', 'GeneratedPaperAirplane', 'GeneratedAsanohaPattern', 'GeneratedFocusLinesPlus', 'GeneratedRandomLineEx', 'GeneratedContourTrace', 'GeneratedDisplacementPoly', 'GeneratedHologram', 'GeneratedProtractor', 'GeneratedShakingPolygon', 'Psd'], issues);
    validateString(reference.source, `${path}.source`, issues);
    validatePositiveInteger(reference.width, `${path}.width`, issues);
    validatePositiveInteger(reference.height, `${path}.height`, issues);
    if (reference.source_rate !== undefined) {
      validateFrameRate(reference.source_rate, `${path}.source_rate`, issues);
    }
    if (reference.active_layer_ids !== undefined) {
      validateStringArray(reference.active_layer_ids, `${path}.active_layer_ids`, issues);
    }
    if (typeof reference.id === 'string' && reference.id.trim() !== '') {
      if (mediaIds.has(reference.id)) {
        addIssue(issues, 'mediaMismatch', `${path}.id`, `Duplicate media reference '${reference.id}'.`);
      }
      mediaIds.add(reference.id);
      mediaIndexById.set(reference.id, index);
    }
  });

  if (!isRecord(snapshot) || !Array.isArray(snapshot.clips)) return;
  const referencedMediaIds = new Set<string>();
  snapshot.clips.forEach((clip, index) => {
    if (!isRecord(clip) || typeof clip.media_id !== 'string') return;
    referencedMediaIds.add(clip.media_id);
    if (!mediaIds.has(clip.media_id)) {
      addIssue(
        issues,
        'mediaMismatch',
        `snapshot.clips[${index}].media_id`,
        `No media reference exists for '${clip.media_id}'.`
      );
    }
  });

  mediaIndexById.forEach((index, mediaId) => {
    if (!referencedMediaIds.has(mediaId)) {
      addIssue(issues, 'mediaMismatch', `media[${index}].id`, `Media reference '${mediaId}' is not used by any clip.`);
    }
  });
};

const validateStringArray = (
  value: unknown,
  path: string,
  issues: RustSceneSnapshotBoundaryIssue[]
) => {
  if (!Array.isArray(value)) {
    addIssue(issues, 'schemaMismatch', path, 'Expected an array of strings.');
    return;
  }
  value.forEach((item, index) => validateString(item, `${path}[${index}]`, issues));
};

const validateNumberArray = (
  value: unknown,
  path: string,
  expectedLength: number,
  issues: RustSceneSnapshotBoundaryIssue[]
) => {
  if (!Array.isArray(value)) {
    addIssue(issues, 'schemaMismatch', path, 'Expected an array of numbers.');
    return;
  }
  if (value.length !== expectedLength) {
    addIssue(issues, 'schemaMismatch', path, `Expected ${expectedLength} numbers.`);
    return;
  }
  value.forEach((item, index) => validateFiniteNumber(item, `${path}[${index}]`, issues));
};

const validateFrameRate = (
  frameRate: unknown,
  path: string,
  issues: RustSceneSnapshotBoundaryIssue[]
) => {
  if (!isRecord(frameRate)) {
    addIssue(issues, 'schemaMismatch', path, 'source_rate must be a JSON object when provided.');
    return;
  }
  validateKnownKeys(frameRate, path, ['numerator', 'denominator'], issues);
  validatePositiveInteger(frameRate.numerator, `${path}.numerator`, issues);
  validatePositiveInteger(frameRate.denominator, `${path}.denominator`, issues);
};

const validateString = (
  value: unknown,
  path: string,
  issues: RustSceneSnapshotBoundaryIssue[]
) => {
  if (typeof value !== 'string' || value.trim() === '') {
    addIssue(issues, 'schemaMismatch', path, 'Expected a non-empty string.');
  }
};

const validateInteger = (
  value: unknown,
  path: string,
  issues: RustSceneSnapshotBoundaryIssue[]
) => {
  if (typeof value !== 'number') {
    addIssue(issues, 'schemaMismatch', path, 'Expected a number.');
    return;
  }
  if (!Number.isFinite(value)) {
    addIssue(issues, 'nonFiniteNumber', path, 'Expected a finite number.');
    return;
  }
  if (!Number.isSafeInteger(value) || value < 0) {
    addIssue(issues, 'unsafeInteger', path, 'Expected a non-negative safe integer.');
  }
};

const validatePositiveInteger = (
  value: unknown,
  path: string,
  issues: RustSceneSnapshotBoundaryIssue[]
) => {
  const issueCount = issues.length;
  validateInteger(value, path, issues);
  if (issues.length !== issueCount || typeof value !== 'number') return;
  if (value <= 0) {
    addIssue(issues, 'outOfRange', path, 'Expected a positive integer.');
  }
};

const validateFiniteNumber = (
  value: unknown,
  path: string,
  issues: RustSceneSnapshotBoundaryIssue[]
) => {
  if (typeof value !== 'number') {
    addIssue(issues, 'schemaMismatch', path, 'Expected a number.');
    return;
  }
  if (!Number.isFinite(value)) {
    addIssue(issues, 'nonFiniteNumber', path, 'Expected a finite number.');
  }
};

const validateUnitInterval = (
  value: unknown,
  path: string,
  issues: RustSceneSnapshotBoundaryIssue[]
) => {
  const issueCount = issues.length;
  validateFiniteNumber(value, path, issues);
  if (issues.length !== issueCount || typeof value !== 'number') return;
  if (value < 0 || value > 1) {
    addIssue(issues, 'outOfRange', path, 'Expected a value in the 0..1 range.');
  }
};

const validateEnum = (
  value: unknown,
  path: string,
  allowed: readonly string[],
  issues: RustSceneSnapshotBoundaryIssue[]
) => {
  if (typeof value !== 'string') {
    addIssue(issues, 'schemaMismatch', path, `Expected one of: ${allowed.join(', ')}.`);
    return;
  }
  if (!allowed.includes(value)) {
    addIssue(issues, 'unsupportedEnum', path, `Unsupported value '${value}'.`);
  }
};

const validateKnownKeys = (
  record: Record<string, unknown>,
  path: string,
  allowedKeys: readonly string[],
  issues: RustSceneSnapshotBoundaryIssue[]
) => {
  const allowed = new Set(allowedKeys);
  Object.keys(record).forEach((key) => {
    if (!allowed.has(key)) {
      addIssue(issues, 'schemaMismatch', `${path}.${key}`, `Unexpected field '${key}'.`);
    }
  });
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const addIssue = (
  issues: RustSceneSnapshotBoundaryIssue[],
  code: RustSceneSnapshotBoundaryIssueCode,
  path: string,
  detail: string
) => {
  issues.push({ code, path, detail });
};
