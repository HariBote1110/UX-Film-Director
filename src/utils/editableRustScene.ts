import type {
  GetColorDotFieldObject,
  HksyCheckerGridObject,
  ImageObject,
  LayerState,
  ParticleObject,
  ProjectSettings,
  PsdObject,
  ShapeObject,
  SimpleTubeObject,
  TextObject,
  TimelineObject,
  VideoObject,
} from '../types';
import { getEnabledObjectFiltersInOrder } from './filterStack';
import { normaliseKeyframesForObject } from './keyframes';
import {
  fpsToFrameRate,
  mediaReferenceForEditableRustScene,
  rustColourPipeline,
  rustEffectsForObject,
  secondsToFrameIndex,
  type RustEffect,
  type RustFrameRate,
  type RustSceneMediaReference,
  type RustTransform,
} from './rustSceneSnapshot';

type EditableRustSceneObject = ShapeObject | ImageObject | VideoObject | PsdObject | TextObject | ParticleObject | GetColorDotFieldObject | HksyCheckerGridObject | SimpleTubeObject;

export interface EditableRustPositionKeyframe {
  frame_offset: number;
  x: number;
  y: number;
  easing: TimelineObject['easing'];
}

export interface EditableRustClip {
  id: string;
  media_id: string;
  kind: 'VideoPlane' | 'ImagePlane' | 'SolidColourPlane' | 'GeneratedShapePlane' | 'TextPlane' | 'GeneratedParticlePlane' | 'GeneratedGetColorDotsPlane' | 'GeneratedHksyCheckerGridPlane' | 'GeneratedSimpleTubePlane';
  start_frame: number;
  duration_frames: number;
  source_frame_offset: number;
  transform: RustTransform;
  opacity: number;
  opacity_keyframes: readonly [];
  position_keyframes: readonly EditableRustPositionKeyframe[];
  effects: readonly RustEffect[];
}

export interface EditableRustTrack {
  id: string;
  clips: EditableRustClip[];
}

export interface EditableRustProject {
  id: string;
  version: 1;
  size: { width: number; height: number };
  fps: RustFrameRate;
  colour: ReturnType<typeof rustColourPipeline>;
  media: RustSceneMediaReference[];
  tracks: EditableRustTrack[];
}

export type EditableRustSceneIssueCode =
  | 'unsupportedObjectType'
  | 'unsupportedGroup'
  | 'unsupportedVideoMode'
  | 'unsupportedSubjectCrop'
  | 'unsupportedMask'
  | 'unsupportedFilter'
  | 'unsupportedGetColorSampleSource';

export interface EditableRustSceneIssue {
  objectId: string;
  code: EditableRustSceneIssueCode;
  detail: string;
}

export type EditableRustSceneBuildResult =
  | { ok: true; project: EditableRustProject; media: RustSceneMediaReference[] }
  | { ok: false; issues: EditableRustSceneIssue[] };

export interface EditableRustSceneBuildInput {
  sceneId: string;
  projectSettings: Pick<ProjectSettings, 'width' | 'height' | 'fps'>;
  layers: LayerState[];
  objects: TimelineObject[];
}

const isEditableRustSceneObject = (object: TimelineObject): object is EditableRustSceneObject => (
  object.type === 'shape'
  || object.type === 'image'
  || object.type === 'video'
  || object.type === 'psd'
  || object.type === 'text'
  || object.type === 'particle'
  || object.type === 'getcolor_dot_field'
  || object.type === 'hksy_checker_grid'
  || object.type === 'simple_tube'
);

const clipKindForObject = (object: EditableRustSceneObject): EditableRustClip['kind'] => {
  if (object.type === 'video') return 'VideoPlane';
  if (object.type === 'text') return 'TextPlane';
  if (object.type === 'particle') return 'GeneratedParticlePlane';
  if (object.type === 'getcolor_dot_field') return 'GeneratedGetColorDotsPlane';
  if (object.type === 'hksy_checker_grid') return 'GeneratedHksyCheckerGridPlane';
  if (object.type === 'simple_tube') return 'GeneratedSimpleTubePlane';
  if (object.type === 'shape') {
    return object.shapeType === 'rect' && object.gradient?.enabled !== true
      ? 'SolidColourPlane'
      : 'GeneratedShapePlane';
  }
  return 'ImagePlane';
};

const positionKeyframesForObject = (
  object: EditableRustSceneObject,
  fps: number
): EditableRustPositionKeyframe[] => {
  const keyframes = normaliseKeyframesForObject(object, object.keyframes);
  if (keyframes.length >= 2) {
    return keyframes.map((keyframe) => ({
      frame_offset: secondsToFrameIndex(keyframe.time - object.startTime, fps),
      x: keyframe.x,
      y: keyframe.y,
      easing: keyframe.easing ?? object.easing,
    }));
  }

  if (!object.enableAnimation) return [];
  return [
    { frame_offset: 0, x: object.x, y: object.y, easing: object.easing },
    {
      frame_offset: secondsToFrameIndex(object.duration, fps),
      x: object.endX,
      y: object.endY,
      easing: 'linear',
    },
  ];
};

const initialPositionForObject = (object: EditableRustSceneObject): { x: number; y: number } => {
  const keyframes = normaliseKeyframesForObject(object, object.keyframes);
  return keyframes.length >= 2 ? { x: keyframes[0].x, y: keyframes[0].y } : { x: object.x, y: object.y };
};

const transformForObject = (object: EditableRustSceneObject): RustTransform => {
  const position = initialPositionForObject(object);
  const psdScale = object.type === 'psd' && Number.isFinite(object.scale) && object.scale > 0
    ? object.scale
    : 1;
  return {
    translation_x: position.x,
    translation_y: position.y,
    scale_x: object.scaleX * psdScale,
    scale_y: object.scaleY * psdScale,
    rotation_degrees: object.rotation,
    sampling: object.type === 'shape' && object.gradient?.enabled !== true ? 'nearest' : 'bilinear',
  };
};

const hasGetColorSampleReference = (object: GetColorDotFieldObject): boolean => (
  (typeof object.sampleSourcePath === 'string' && object.sampleSourcePath.length > 0)
  || (typeof object.sampleSourceObjectId === 'string' && object.sampleSourceObjectId.length > 0)
  || (typeof object.sampleSourceLayer === 'number' && Number.isFinite(object.sampleSourceLayer))
);

const isNativeReadableGetColorSampleSource = (source: string): boolean => {
  const withoutQueryOrFragment = source.split(/[?#]/, 1)[0];
  const isFileUrl = withoutQueryOrFragment.startsWith('file:///')
    || withoutQueryOrFragment.startsWith('file://localhost/');
  const hasUnsupportedUrlScheme = /^[a-z][a-z0-9+.-]*:/i.test(withoutQueryOrFragment) && !isFileUrl;
  if (!withoutQueryOrFragment || hasUnsupportedUrlScheme) return false;
  return /\.(png|jpe?g|psd)$/i.test(withoutQueryOrFragment);
};

const getColorSampleIssue = (
  object: GetColorDotFieldObject,
  objects: TimelineObject[],
  fps: number
): EditableRustSceneIssue | null => {
  if (!hasGetColorSampleReference(object)) return null;
  const reference = mediaReferenceForEditableRustScene(object, fps, objects);
  const sourceImage = JSON.parse(reference.source).source_image;
  if (typeof sourceImage !== 'string' || !isNativeReadableGetColorSampleSource(sourceImage)) {
    return {
      objectId: object.id,
      code: 'unsupportedGetColorSampleSource',
      detail: 'GetColorの参照画像/PSDは、表示開始時点で有効なローカルPNG・JPEG・PSDである必要があります',
    };
  }
  return null;
};

const issueForObject = (
  object: TimelineObject,
  objects: TimelineObject[],
  fps: number
): EditableRustSceneIssue | null => {
  if (!isEditableRustSceneObject(object)) {
    return { objectId: object.id, code: 'unsupportedObjectType', detail: `${object.type} はV1対象外です` };
  }
  if (object.groupId) {
    return { objectId: object.id, code: 'unsupportedGroup', detail: 'グループ合成はV1対象外です' };
  }
  if (object.type === 'video' && object.reversed) {
    return { objectId: object.id, code: 'unsupportedVideoMode', detail: '逆再生はV1対象外です' };
  }
  if (object.type === 'video' && (object.subjectCropEnabled || (object.subjectCropKeyframes?.length ?? 0) > 0)) {
    return { objectId: object.id, code: 'unsupportedSubjectCrop', detail: 'subject cropはV1対象外です' };
  }
  if (object.clipping) {
    return { objectId: object.id, code: 'unsupportedMask', detail: 'クリッピングマスクはV1対象外です' };
  }
  if (getEnabledObjectFiltersInOrder(object).some((filter) => filter.type !== 'spot_light')) {
    return { objectId: object.id, code: 'unsupportedFilter', detail: '有効なfilterはV1対象外です' };
  }
  if (object.type === 'getcolor_dot_field') {
    return getColorSampleIssue(object, objects, fps);
  }
  return null;
};

export const buildEditableRustScene = ({
  sceneId,
  projectSettings,
  layers,
  objects,
}: EditableRustSceneBuildInput): EditableRustSceneBuildResult => {
  const visibleObjects = objects.filter((object) => layers[object.layer]?.visible !== false);
  const issues = visibleObjects
    .map((object) => issueForObject(object, objects, projectSettings.fps))
    .filter((issue): issue is EditableRustSceneIssue => issue !== null);
  if (issues.length > 0) return { ok: false, issues };

  const orderedObjects = visibleObjects
    .filter(isEditableRustSceneObject)
    .map((object, insertionIndex) => ({ object, insertionIndex }))
    .sort((left, right) => left.object.layer - right.object.layer || left.insertionIndex - right.insertionIndex);

  const media = orderedObjects.map(({ object }) => mediaReferenceForEditableRustScene(object, projectSettings.fps, objects));
  const tracksByLayer = new Map<number, EditableRustTrack>();
  for (const { object } of orderedObjects) {
    const track = tracksByLayer.get(object.layer) ?? { id: `layer-${object.layer}`, clips: [] };
    const startFrame = secondsToFrameIndex(object.startTime, projectSettings.fps);
    track.clips.push({
      id: object.id,
      media_id: object.id,
      kind: clipKindForObject(object),
      start_frame: startFrame,
      duration_frames: Math.max(1, secondsToFrameIndex(object.duration, projectSettings.fps)),
      source_frame_offset: object.type === 'video'
        ? secondsToFrameIndex(object.offset ?? 0, projectSettings.fps)
        : 0,
      transform: transformForObject(object),
      opacity: object.opacity,
      opacity_keyframes: [],
      position_keyframes: positionKeyframesForObject(object, projectSettings.fps),
      effects: rustEffectsForObject(object, object.startTime),
    });
    tracksByLayer.set(object.layer, track);
  }

  const project: EditableRustProject = {
    id: sceneId,
    version: 1,
    size: { width: projectSettings.width, height: projectSettings.height },
    fps: fpsToFrameRate(projectSettings.fps),
    colour: rustColourPipeline(),
    media,
    tracks: [...tracksByLayer.entries()].sort(([left], [right]) => left - right).map(([, track]) => track),
  };
  return { ok: true, project, media };
};
