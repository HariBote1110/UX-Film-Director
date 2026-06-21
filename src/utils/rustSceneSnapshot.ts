import type {
  AudioObject,
  AudioVisualizationObject,
  BarcodeObject,
  GradientFill,
  ImageObject,
  LayerState,
  ParticleObject,
  ProjectSettings,
  PsdObject,
  ShapeObject,
  TimelineObject,
  VideoObject,
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
  | { Clipping: { top: number; bottom: number; left: number; right: number; angle_degrees: number } };

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
  kind: 'Image' | 'Video' | 'SolidColour' | 'GeneratedGradient' | 'GeneratedAudioWaveform' | 'GeneratedParticle' | 'GeneratedBarcode' | 'Psd';
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
type SupportedGeneratedObject = AudioVisualizationObject | ParticleObject | BarcodeObject;
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
  || object.type === 'particle'
  || object.type === 'barcode';

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
  const targetAudio = findTargetAudioForWaveform(object, objects, time);
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

const findTargetAudioForWaveform = (
  object: AudioVisualizationObject,
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
  if (object.type === 'particle') return secondsToFrameIndex(Math.max(0, time - object.startTime), fps);
  if (object.type === 'barcode') return 0;
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
    validateEnum(reference.kind, `${path}.kind`, ['Image', 'Video', 'SolidColour', 'GeneratedGradient', 'GeneratedAudioWaveform', 'GeneratedParticle', 'GeneratedBarcode', 'Psd'], issues);
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
