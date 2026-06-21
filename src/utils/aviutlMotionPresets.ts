import type { PositionKeyframe, TimelineObject } from '../types';
import type { EasingType } from './easings';

export type AviUtlMotionPresetId =
  | 'entrance-slide-left'
  | 'entrance-pop-up'
  | 'random-wiggle'
  | 'repeat-side-to-side';

export interface AviUtlMotionPreset {
  id: AviUtlMotionPresetId;
  labelJa: string;
  sourceCandidateId:
    | 'ymm4-entrance-exit'
    | 'ymm4-random-motion'
    | 'ymm4-repeat-motion';
  defaultDistancePx: number;
  defaultSpanSeconds: number;
  defaultIntervalSeconds: number;
}

export interface AviUtlMotionPresetOptions {
  distancePx?: number;
  spanSeconds?: number;
  intervalSeconds?: number;
}

export type AviUtlMotionPresetPatch = Pick<
  TimelineObject,
  'x' | 'y' | 'endX' | 'endY' | 'easing' | 'enableAnimation'
> & {
  keyframes: PositionKeyframe[];
};

const presets: AviUtlMotionPreset[] = [
  {
    id: 'entrance-slide-left',
    labelJa: '登場: 左からスライド',
    sourceCandidateId: 'ymm4-entrance-exit',
    defaultDistancePx: 240,
    defaultSpanSeconds: 0.45,
    defaultIntervalSeconds: 0.25
  },
  {
    id: 'entrance-pop-up',
    labelJa: '登場: 下からポップ',
    sourceCandidateId: 'ymm4-entrance-exit',
    defaultDistancePx: 80,
    defaultSpanSeconds: 0.35,
    defaultIntervalSeconds: 0.25
  },
  {
    id: 'random-wiggle',
    labelJa: 'ランダム: 小刻み揺れ',
    sourceCandidateId: 'ymm4-random-motion',
    defaultDistancePx: 8,
    defaultSpanSeconds: 0.45,
    defaultIntervalSeconds: 0.2
  },
  {
    id: 'repeat-side-to-side',
    labelJa: '反復: 左右往復',
    sourceCandidateId: 'ymm4-repeat-motion',
    defaultDistancePx: 24,
    defaultSpanSeconds: 0.45,
    defaultIntervalSeconds: 0.5
  }
];

export const getAviUtlPackMotionPresets = (): AviUtlMotionPreset[] =>
  presets.map((preset) => ({ ...preset }));

export const buildAviUtlMotionPresetPatch = (
  object: Pick<TimelineObject, 'id' | 'startTime' | 'duration' | 'x' | 'y'>,
  presetId: AviUtlMotionPresetId,
  options: AviUtlMotionPresetOptions = {}
): AviUtlMotionPresetPatch => {
  const preset = presets.find((entry) => entry.id === presetId) ?? presets[0];
  const distancePx = positiveNumberOr(options.distancePx, preset.defaultDistancePx);
  const spanSeconds = positiveNumberOr(options.spanSeconds, preset.defaultSpanSeconds);
  const intervalSeconds = positiveNumberOr(options.intervalSeconds, preset.defaultIntervalSeconds);
  const startTime = finiteNumberOr(object.startTime, 0);
  const duration = Math.max(0, finiteNumberOr(object.duration, 0));
  const endTime = startTime + duration;
  const x = finiteNumberOr(object.x, 0);
  const y = finiteNumberOr(object.y, 0);

  let keyframes: PositionKeyframe[];
  let easing: EasingType;

  switch (preset.id) {
    case 'entrance-pop-up':
      easing = 'easeOutBack';
      keyframes = buildEntranceKeyframes({
        startTime,
        endTime,
        spanSeconds,
        x,
        y,
        fromX: x,
        fromY: y + distancePx,
        easing
      });
      break;
    case 'random-wiggle':
      easing = 'linear';
      keyframes = buildRandomWiggleKeyframes({
        seedText: `${object.id}:random-wiggle`,
        startTime,
        endTime,
        intervalSeconds,
        x,
        y,
        distancePx
      });
      break;
    case 'repeat-side-to-side':
      easing = 'easeInOutSine';
      keyframes = buildRepeatSideToSideKeyframes({
        startTime,
        endTime,
        intervalSeconds,
        x,
        y,
        distancePx,
        easing
      });
      break;
    case 'entrance-slide-left':
    default:
      easing = 'easeOutCubic';
      keyframes = buildEntranceKeyframes({
        startTime,
        endTime,
        spanSeconds,
        x,
        y,
        fromX: x - distancePx,
        fromY: y,
        easing
      });
      break;
  }

  return {
    keyframes,
    enableAnimation: keyframes.length >= 2,
    x,
    y,
    endX: x,
    endY: y,
    easing
  };
};

const buildEntranceKeyframes = ({
  startTime,
  endTime,
  spanSeconds,
  x,
  y,
  fromX,
  fromY,
  easing
}: {
  startTime: number;
  endTime: number;
  spanSeconds: number;
  x: number;
  y: number;
  fromX: number;
  fromY: number;
  easing: EasingType;
}): PositionKeyframe[] => {
  const settleTime = Math.min(endTime, startTime + Math.max(0.01, spanSeconds));
  const keyframes = [
    makeKeyframe('entrance-start', startTime, fromX, fromY, easing),
    makeKeyframe('entrance-settle', settleTime, x, y, 'linear')
  ];
  if (endTime > settleTime + 0.0001) {
    keyframes.push(makeKeyframe('entrance-hold', endTime, x, y, 'linear'));
  }
  return keyframes;
};

const buildRandomWiggleKeyframes = ({
  seedText,
  startTime,
  endTime,
  intervalSeconds,
  x,
  y,
  distancePx
}: {
  seedText: string;
  startTime: number;
  endTime: number;
  intervalSeconds: number;
  x: number;
  y: number;
  distancePx: number;
}): PositionKeyframe[] => {
  const random = createSeededRandom(seedText);
  const keyframes: PositionKeyframe[] = [];
  const interval = Math.max(0.05, intervalSeconds);
  const count = Math.max(1, Math.floor((endTime - startTime) / interval));
  for (let index = 0; index <= count; index += 1) {
    const time = index === count ? endTime : startTime + interval * index;
    const offsetX = (random() * 2 - 1) * distancePx;
    const offsetY = (random() * 2 - 1) * distancePx;
    keyframes.push(makeKeyframe(`random-${index}`, time, x + offsetX, y + offsetY, 'linear'));
  }
  return keyframes;
};

const buildRepeatSideToSideKeyframes = ({
  startTime,
  endTime,
  intervalSeconds,
  x,
  y,
  distancePx,
  easing
}: {
  startTime: number;
  endTime: number;
  intervalSeconds: number;
  x: number;
  y: number;
  distancePx: number;
  easing: EasingType;
}): PositionKeyframe[] => {
  const keyframes: PositionKeyframe[] = [];
  const interval = Math.max(0.05, intervalSeconds);
  const count = Math.max(1, Math.floor((endTime - startTime) / interval));
  for (let index = 0; index < count; index += 1) {
    const direction = index % 2 === 0 ? -1 : 1;
    keyframes.push(makeKeyframe(
      `repeat-${index}`,
      startTime + interval * index,
      x + distancePx * direction,
      y,
      easing
    ));
  }
  keyframes.push(makeKeyframe('repeat-return', endTime, x, y, 'linear'));
  return keyframes;
};

const makeKeyframe = (
  suffix: string,
  time: number,
  x: number,
  y: number,
  easing: EasingType
): PositionKeyframe => ({
  id: `aviutl-${suffix}`,
  time: roundTime(time),
  x: roundCoordinate(x),
  y: roundCoordinate(y),
  easing
});

const finiteNumberOr = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const positiveNumberOr = (value: unknown, fallback: number): number => {
  const parsed = finiteNumberOr(value, fallback);
  return parsed > 0 ? parsed : fallback;
};

const roundTime = (value: number): number =>
  Math.round(value * 1000) / 1000;

const roundCoordinate = (value: number): number =>
  Math.round(value * 1000000) / 1000000;

const createSeededRandom = (seedText: string): (() => number) => {
  let state = 2166136261;
  for (let i = 0; i < seedText.length; i += 1) {
    state ^= seedText.charCodeAt(i);
    state = Math.imul(state, 16777619);
  }
  return () => {
    state = Math.imul(state ^ (state >>> 15), 2246822507);
    state = Math.imul(state ^ (state >>> 13), 3266489909);
    state ^= state >>> 16;
    return (state >>> 0) / 4294967296;
  };
};
