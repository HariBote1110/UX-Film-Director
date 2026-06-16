import type {
  ImageObject,
  LayerState,
  ProjectSettings,
  TimelineObject,
  VideoObject,
} from '../types';
import { getEnabledObjectFiltersInOrder, getFadeOpacityMultiplier } from './filterStack';
import { evaluateObjectPositionAtTime } from './keyframes';

export type RustSamplingMode = 'nearest' | 'bilinear';

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

export type RustEffect = { LinearGain: { gain: number } };

export interface RustEvaluatedClip {
  clip_id: string;
  track_id: string;
  media_id: string;
  source_frame: number;
  z_index: number;
  transform: RustTransform;
  opacity: number;
  effects: RustEffect[];
}

export interface RustSceneSnapshot {
  frame_index: number;
  colour: RustColourPipeline;
  clips: RustEvaluatedClip[];
}

export interface RustSceneMediaReference {
  id: string;
  kind: 'Image' | 'Video';
  source: string;
  width: number;
  height: number;
}

export type RustSceneSnapshotBuildIssueCode =
  | 'unsupportedObjectType'
  | 'unsupportedFilter'
  | 'unsupportedRotation'
  | 'unsupportedTransform'
  | 'unsupportedVideoMode'
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

export interface RustSceneSnapshotBuildInput {
  projectSettings: Pick<ProjectSettings, 'fps'>;
  layers: LayerState[];
  objects: TimelineObject[];
  time: number;
}

type SupportedMediaObject = ImageObject | VideoObject;

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
}: RustSceneSnapshotBuildInput): RustSceneSnapshotBuildResult => {
  const frameIndex = secondsToFrameIndex(time, projectSettings.fps);
  const visibleObjects = collectVisibleObjects(objects, layers, time);
  const issues = collectBuildIssues(visibleObjects);

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  const supportedObjects = visibleObjects
    .filter(isSupportedMediaObject)
    .map((object, index) => ({ object, index }))
    .sort((left, right) => {
      if (left.object.layer !== right.object.layer) return left.object.layer - right.object.layer;
      return left.index - right.index;
    })
    .map(({ object }) => object);

  const clips = supportedObjects.map((object, zIndex): RustEvaluatedClip => {
    const position = evaluateObjectPositionAtTime(object, time);
    const opacity = clamp01((object.opacity ?? 1) * getFadeOpacityMultiplier(object));
    return {
      clip_id: object.id,
      track_id: `layer-${object.layer}`,
      media_id: object.id,
      source_frame: sourceFrameForObject(object, time, projectSettings.fps),
      z_index: zIndex,
      transform: {
        translation_x: position.x,
        translation_y: position.y,
        scale_x: object.scaleX,
        scale_y: object.scaleY,
        rotation_degrees: 0,
        sampling: 'bilinear',
      },
      opacity,
      effects: [],
    };
  });

  return {
    ok: true,
    snapshot: {
      frame_index: frameIndex,
      colour: rustColourPipeline(),
      clips,
    },
    media: supportedObjects.map(mediaReferenceForObject),
  };
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

const collectBuildIssues = (objects: TimelineObject[]): RustSceneSnapshotBuildIssue[] => {
  const issues: RustSceneSnapshotBuildIssue[] = [];

  objects.forEach((object) => {
    if (!isSupportedMediaObject(object)) {
      issues.push({
        code: 'unsupportedObjectType',
        objectId: object.id,
        detail: `Object type '${object.type}' is not representable by the shared renderer yet.`,
      });
      return;
    }

    if (!mediaSourceForObject(object)) {
      issues.push({
        code: 'missingMediaSource',
        objectId: object.id,
        detail: 'Image/video object has neither filePath nor src.',
      });
    }

    if (object.rotation !== 0) {
      issues.push({
        code: 'unsupportedRotation',
        objectId: object.id,
        detail: 'Rotation is not enabled in the shared renderer bridge yet.',
      });
    }

    if (!Number.isFinite(object.scaleX) || !Number.isFinite(object.scaleY) || object.scaleX <= 0 || object.scaleY <= 0) {
      issues.push({
        code: 'unsupportedTransform',
        objectId: object.id,
        detail: 'Scale must be finite and greater than zero.',
      });
    }

    if (object.type === 'video' && (object.reversed || object.subjectCropEnabled)) {
      issues.push({
        code: 'unsupportedVideoMode',
        objectId: object.id,
        detail: 'Reversed playback and subject crop are not enabled in the shared renderer bridge yet.',
      });
    }

    const unsupportedFilter = getEnabledObjectFiltersInOrder(object).find((filter) => filter.type !== 'fade');
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

const isSupportedMediaObject = (object: TimelineObject): object is SupportedMediaObject =>
  object.type === 'image' || object.type === 'video';

const mediaReferenceForObject = (object: SupportedMediaObject): RustSceneMediaReference => ({
  id: object.id,
  kind: object.type === 'video' ? 'Video' : 'Image',
  source: mediaSourceForObject(object),
  width: object.width,
  height: object.height,
});

const mediaSourceForObject = (object: SupportedMediaObject): string =>
  object.filePath || object.src || '';

const sourceFrameForObject = (
  object: SupportedMediaObject,
  time: number,
  fps: number
): number => {
  if (object.type === 'image') return 0;
  const localTime = Math.max(0, time - object.startTime);
  const mediaTime = localTime + (object.offset ?? 0);
  return secondsToFrameIndex(mediaTime, fps);
};

const secondsToFrameIndex = (seconds: number, fps: number): number => {
  const safeSeconds = Number.isFinite(seconds) ? seconds : 0;
  const safeFps = Number.isFinite(fps) && fps > 0 ? fps : 60;
  return Math.max(0, Math.round(safeSeconds * safeFps));
};

const clamp01 = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
};
