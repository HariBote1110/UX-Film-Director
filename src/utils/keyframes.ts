import { TimelineObject, PositionKeyframe } from '../types';
import { easingFunctions, EasingType } from './easings';

const EPSILON = 0.0001;

const toFiniteNumber = (value: unknown, fallback: number): number => {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
};

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(max, Math.max(min, value));
};

export const normaliseKeyframesForObject = (
  object: Pick<TimelineObject, 'startTime' | 'duration' | 'easing'>,
  keyframes: PositionKeyframe[] | undefined
): PositionKeyframe[] => {
  if (!Array.isArray(keyframes) || keyframes.length === 0) return [];

  const start = object.startTime;
  const end = object.startTime + object.duration;
  const defaultEasing = object.easing ?? 'linear';

  const normalised = keyframes.map((keyframe) => {
    const id = typeof keyframe.id === 'string' && keyframe.id.trim() !== ''
      ? keyframe.id
      : crypto.randomUUID();
    const time = clamp(toFiniteNumber(keyframe.time, start), start, end);
    const x = toFiniteNumber(keyframe.x, 0);
    const y = toFiniteNumber(keyframe.y, 0);
    const easing = keyframe.easing ?? defaultEasing;
    return { id, time, x, y, easing };
  });

  normalised.sort((a, b) => {
    if (Math.abs(a.time - b.time) > EPSILON) return a.time - b.time;
    return a.id.localeCompare(b.id);
  });

  return normalised;
};

export const evaluateKeyframesPositionAtTime = (
  keyframes: PositionKeyframe[] | undefined,
  time: number,
  defaultEasing: EasingType = 'linear'
): { x: number; y: number } | null => {
  if (!Array.isArray(keyframes) || keyframes.length < 2) return null;

  const sorted = keyframes.slice().sort((a, b) => a.time - b.time);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (time <= first.time) {
    return { x: first.x, y: first.y };
  }
  if (time >= last.time) {
    return { x: last.x, y: last.y };
  }

  for (let index = 0; index < sorted.length - 1; index += 1) {
    const left = sorted[index];
    const right = sorted[index + 1];
    if (time < left.time || time > right.time) continue;

    const duration = right.time - left.time;
    if (duration <= EPSILON) {
      return { x: right.x, y: right.y };
    }

    const rawProgress = (time - left.time) / duration;
    const easingName = left.easing ?? defaultEasing;
    const easing = easingFunctions[easingName] ?? easingFunctions.linear;
    const progress = clamp(easing(rawProgress), 0, 1);

    return {
      x: left.x + (right.x - left.x) * progress,
      y: left.y + (right.y - left.y) * progress
    };
  }

  return null;
};

export const evaluateObjectPositionAtTime = (
  object: Pick<TimelineObject, 'x' | 'y' | 'keyframes' | 'enableAnimation' | 'startTime' | 'duration' | 'endX' | 'endY' | 'easing'>,
  time: number
): { x: number; y: number } => {
  const keyed = evaluateKeyframesPositionAtTime(object.keyframes, time, object.easing);
  if (keyed) return keyed;

  if (object.enableAnimation && object.duration > EPSILON) {
    const rawProgress = (time - object.startTime) / object.duration;
    const progress = clamp(rawProgress, 0, 1);
    const easing = easingFunctions[object.easing] ?? easingFunctions.linear;
    const eased = easing(progress);
    return {
      x: object.x + (object.endX - object.x) * eased,
      y: object.y + (object.endY - object.y) * eased
    };
  }

  return { x: object.x, y: object.y };
};

export const shiftKeyframesForObject = (
  object: Pick<TimelineObject, 'startTime' | 'duration' | 'easing'>,
  keyframes: PositionKeyframe[] | undefined,
  deltaTime: number,
  deltaX: number,
  deltaY: number
): PositionKeyframe[] => {
  if (!Array.isArray(keyframes) || keyframes.length === 0) return [];

  const shifted = keyframes.map((keyframe) => ({
    ...keyframe,
    time: keyframe.time + deltaTime,
    x: keyframe.x + deltaX,
    y: keyframe.y + deltaY
  }));
  return normaliseKeyframesForObject(object, shifted);
};

export const buildEndpointKeyframes = (
  object: Pick<TimelineObject, 'startTime' | 'duration' | 'x' | 'y' | 'endX' | 'endY' | 'easing'>
): PositionKeyframe[] => {
  const endTime = object.startTime + object.duration;
  return [
    {
      id: crypto.randomUUID(),
      time: object.startTime,
      x: object.x,
      y: object.y,
      easing: object.easing
    },
    {
      id: crypto.randomUUID(),
      time: endTime,
      x: object.endX,
      y: object.endY,
      easing: object.easing
    }
  ];
};
