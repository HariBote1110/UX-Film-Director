import type {
  GroupControlObject,
  LayerState,
  ObjectFilter,
  PositionKeyframe,
  SubjectCropNormKeyframe,
  TimelineObject,
  VideoObject,
} from '../types';
import { normaliseKeyframesForObject } from './keyframes';
import type { EasingType } from './easings';
import { easingFunctions } from './easingEvaluationReference';
import { getEnabledObjectFiltersInOrder } from './filterStack';

const EPSILON = 0.0001;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const areKeyframesSortedByTime = (keyframes: PositionKeyframe[]): boolean => {
  for (let i = 1; i < keyframes.length; i += 1) {
    if (keyframes[i - 1].time > keyframes[i].time + EPSILON) return false;
  }
  return true;
};

const sortKeyframesByTimeStable = (keyframes: PositionKeyframe[]): PositionKeyframe[] => (
  keyframes.slice().sort((a, b) => {
    if (Math.abs(a.time - b.time) > EPSILON) return a.time - b.time;
    return a.id.localeCompare(b.id);
  })
);

const resolveSortedKeyframesForEvaluation = (keyframes: PositionKeyframe[]): PositionKeyframe[] => (
  areKeyframesSortedByTime(keyframes) ? keyframes : sortKeyframesByTimeStable(keyframes)
);

const largestIndexWithTimeAtMost = (sorted: PositionKeyframe[], time: number): number => {
  let lo = 0;
  let hi = sorted.length - 1;
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    if (sorted[mid].time <= time) lo = mid;
    else hi = mid - 1;
  }
  return lo;
};

export const evaluateKeyframesPositionAtTime = (
  keyframes: PositionKeyframe[] | undefined,
  time: number,
  defaultEasing: EasingType = 'linear'
): { x: number; y: number } | null => {
  if (!Array.isArray(keyframes) || keyframes.length < 2) return null;

  const sorted = resolveSortedKeyframesForEvaluation(keyframes);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (time <= first.time) return { x: first.x, y: first.y };
  if (time >= last.time) return { x: last.x, y: last.y };

  const segmentLeft = largestIndexWithTimeAtMost(sorted, time);
  if (segmentLeft >= sorted.length - 1) return { x: last.x, y: last.y };

  const left = sorted[segmentLeft];
  const right = sorted[segmentLeft + 1];
  const duration = right.time - left.time;
  if (duration <= EPSILON) return { x: right.x, y: right.y };

  const rawProgress = (time - left.time) / duration;
  const easingName = left.easing ?? defaultEasing;
  const easing = easingFunctions[easingName] ?? easingFunctions.linear;
  const progress = clamp(easing(rawProgress), 0, 1);
  return {
    x: left.x + (right.x - left.x) * progress,
    y: left.y + (right.y - left.y) * progress,
  };
};

export const evaluateObjectPositionAtTime = (
  object: Pick<TimelineObject, 'x' | 'y' | 'keyframes' | 'enableAnimation' | 'startTime' | 'duration' | 'endX' | 'endY' | 'easing'>,
  time: number
): { x: number; y: number } => {
  const clampedKeyframes = normaliseKeyframesForObject(object, object.keyframes);
  const keyed = evaluateKeyframesPositionAtTime(clampedKeyframes, time, object.easing);
  if (keyed) return keyed;

  if (object.enableAnimation && object.duration > EPSILON) {
    const rawProgress = (time - object.startTime) / object.duration;
    const progress = clamp(rawProgress, 0, 1);
    const easing = easingFunctions[object.easing] ?? easingFunctions.linear;
    const eased = easing(progress);
    return {
      x: object.x + (object.endX - object.x) * eased,
      y: object.y + (object.endY - object.y) * eased,
    };
  }

  return { x: object.x, y: object.y };
};

const clampNormRect = (rect: { x: number; y: number; width: number; height: number }) => {
  const x = clamp(rect.x, 0, 1);
  const y = clamp(rect.y, 0, 1);
  const width = clamp(rect.width, 0, 1);
  const height = clamp(rect.height, 0, 1);
  const x2 = Math.min(1, x + width);
  const y2 = Math.min(1, y + height);
  return {
    x,
    y,
    width: Math.max(0, x2 - x),
    height: Math.max(0, y2 - y),
  };
};

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const evaluateSubjectCropNormRectAtTime = (
  video: Pick<VideoObject, 'startTime' | 'duration' | 'subjectCropKeyframes'>,
  timelineTime: number
): { x: number; y: number; width: number; height: number } | null => {
  const sorted = video.subjectCropKeyframes;
  if (!Array.isArray(sorted) || sorted.length === 0) return null;

  const start = video.startTime;
  const end = video.startTime + video.duration;
  const time = clamp(timelineTime, start, end);
  if (sorted.length === 1) {
    const keyframe = sorted[0];
    return clampNormRect({ x: keyframe.x, y: keyframe.y, width: keyframe.width, height: keyframe.height });
  }

  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (time <= first.time) return clampNormRect({ x: first.x, y: first.y, width: first.width, height: first.height });
  if (time >= last.time) return clampNormRect({ x: last.x, y: last.y, width: last.width, height: last.height });

  let left = 0;
  while (left < sorted.length - 1 && sorted[left + 1].time <= time + EPSILON) left += 1;
  const a = sorted[left];
  const b = sorted[Math.min(left + 1, sorted.length - 1)];
  const span = b.time - a.time;
  const progress = span <= EPSILON ? 0 : (time - a.time) / span;
  return clampNormRect({
    x: lerp(a.x, b.x, progress),
    y: lerp(a.y, b.y, progress),
    width: lerp(a.width, b.width, progress),
    height: lerp(a.height, b.height, progress),
  });
};

export interface GroupTransformResult {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  alpha: number;
}

export const getGroupTransforms = (
  object: TimelineObject,
  time: number,
  allObjects: TimelineObject[]
): GroupTransformResult => {
  let x = 0;
  let y = 0;
  let rotation = 0;
  let scaleX = 1;
  let scaleY = 1;
  let alpha = 1;
  const groups = allObjects.filter((candidate) => (
    candidate.type === 'group_control'
    && candidate.layer < object.layer
    && time >= candidate.startTime
    && time < candidate.startTime + candidate.duration
  )) as GroupControlObject[];
  groups.forEach((group) => {
    if (group.targetLayerCount === 0 || object.layer <= group.layer + group.targetLayerCount) {
      const position = evaluateObjectPositionAtTime(group, time);
      x += position.x;
      y += position.y;
      rotation += group.rotation || 0;
      scaleX *= group.scaleX ?? 1;
      scaleY *= group.scaleY ?? 1;
      alpha *= group.opacity ?? 1;
    }
  });
  return { x, y, rotation, scaleX, scaleY, alpha };
};

const isVibrationFilter = (filter: ObjectFilter): filter is Extract<ObjectFilter, { type: 'vibration' }> => (
  filter.type === 'vibration'
);

export const getVibrationOffset = (object: TimelineObject, time: number): { x: number; y: number } => {
  const vibrationFilters = getEnabledObjectFiltersInOrder(object).filter(isVibrationFilter);
  if (vibrationFilters.length === 0) return { x: 0, y: 0 };

  return vibrationFilters.reduce((acc, filter, index) => {
    const { strength, speed } = filter.params;
    if (strength === 0) return acc;
    const phase = index * 1.618;
    const t = time * speed + phase;
    return {
      x: acc.x + (Math.sin(t * 12.9898) * strength + Math.cos(t * 78.233) * strength * 0.5),
      y: acc.y + (Math.cos(t * 12.9898) * strength + Math.sin(t * 78.233) * strength * 0.5),
    };
  }, { x: 0, y: 0 });
};

export const isObjectVisibleAtTime = (
  object: TimelineObject,
  time: number,
  layers?: LayerState[]
): boolean => {
  if (layers && layers[object.layer]?.visible === false) return false;
  return time >= object.startTime && time < object.startTime + object.duration;
};
