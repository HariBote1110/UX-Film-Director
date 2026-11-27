import { TimelineObject, PositionKeyframe } from '../types';

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
