import type { PositionKeyframe, TimelineObject } from '../../types';
import type { EasingType } from '../easings';

export type AviUtlMotionPresetId =
  | 'entrance-slide-left'
  | 'entrance-pop-up'
  | 'random-wiggle'
  | 'repeat-side-to-side'
  | 'motion-path-arc'
  | 'motion-path-s-curve'
  | 'wind-sway-soft'
  | 'delay-move-individual'
  | 'coordinate-plus-snap-move'
  | 'ta-easing-overshoot-arrive'
  | 'bezier-orbit-t-plus'
  | 'individual-coordinate-rearrange-circle';

export interface AviUtlMotionPreset {
  id: AviUtlMotionPresetId;
  labelJa: string;
  sourceCandidateId:
    | 'ymm4-entrance-exit'
    | 'ymm4-random-motion'
    | 'ymm4-repeat-motion'
    | 'tim-motion-path'
    | 'tim-wind-sway'
    | '93-delay-move'
    | '93-coordinate-plus'
    | '93-ta-easing'
    | '93-bezier-orbit-t-plus'
    | '93-individual-coordinate-rearrange';
  defaultDistancePx: number;
  defaultSpanSeconds: number;
  defaultIntervalSeconds: number;
}

export interface AviUtlMotionPresetOptions {
  distancePx?: number;
  spanSeconds?: number;
  intervalSeconds?: number;
  sequenceIndex?: number;
  sequenceTotal?: number;
  reverseOrder?: boolean;
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
  },
  {
    id: 'motion-path-arc',
    labelJa: 'パス: 弧を描く',
    sourceCandidateId: 'tim-motion-path',
    defaultDistancePx: 160,
    defaultSpanSeconds: 1,
    defaultIntervalSeconds: 0.5
  },
  {
    id: 'motion-path-s-curve',
    labelJa: 'パス: S字',
    sourceCandidateId: 'tim-motion-path',
    defaultDistancePx: 160,
    defaultSpanSeconds: 1,
    defaultIntervalSeconds: 0.5
  },
  {
    id: 'wind-sway-soft',
    labelJa: '風揺れ: やわらか',
    sourceCandidateId: 'tim-wind-sway',
    defaultDistancePx: 16,
    defaultSpanSeconds: 1,
    defaultIntervalSeconds: 1
  },
  {
    id: 'delay-move-individual',
    labelJa: '93: Delay個別',
    sourceCandidateId: '93-delay-move',
    defaultDistancePx: 96,
    defaultSpanSeconds: 0.5,
    defaultIntervalSeconds: 1
  },
  {
    id: 'coordinate-plus-snap-move',
    labelJa: '93: 座標plus スナップ移動',
    sourceCandidateId: '93-coordinate-plus',
    defaultDistancePx: 96,
    defaultSpanSeconds: 0.5,
    defaultIntervalSeconds: 32
  },
  {
    id: 'ta-easing-overshoot-arrive',
    labelJa: '93: TA-Easing 跳ね戻り登場',
    sourceCandidateId: '93-ta-easing',
    defaultDistancePx: 120,
    defaultSpanSeconds: 0.8,
    defaultIntervalSeconds: 0.25
  },
  {
    id: 'bezier-orbit-t-plus',
    labelJa: '93: ベジエ軌道T+',
    sourceCandidateId: '93-bezier-orbit-t-plus',
    defaultDistancePx: 160,
    defaultSpanSeconds: 1,
    defaultIntervalSeconds: 0.25
  },
  {
    id: 'individual-coordinate-rearrange-circle',
    labelJa: '93: 個別座標再配置2 円形',
    sourceCandidateId: '93-individual-coordinate-rearrange',
    defaultDistancePx: 120,
    defaultSpanSeconds: 0.5,
    defaultIntervalSeconds: 1
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
  let baseX = x;
  let baseY = y;

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
    case 'motion-path-arc':
      easing = 'easeInOutSine';
      keyframes = buildMotionPathArcKeyframes({
        startTime,
        endTime,
        x,
        y,
        distancePx,
        easing
      });
      break;
    case 'motion-path-s-curve':
      easing = 'easeInOutSine';
      keyframes = buildMotionPathSCurveKeyframes({
        startTime,
        endTime,
        x,
        y,
        distancePx,
        easing
      });
      break;
    case 'wind-sway-soft':
      easing = 'easeInOutSine';
      keyframes = buildWindSwayKeyframes({
        startTime,
        endTime,
        intervalSeconds,
        x,
        y,
        distancePx,
        easing
      });
      break;
    case 'delay-move-individual':
      easing = 'easeInOutSine';
      keyframes = buildDelayMoveIndividualKeyframes({
        startTime,
        endTime,
        x,
        y,
        distancePx,
        spanSeconds,
        totalDelaySeconds: intervalSeconds,
        sequenceIndex: nonNegativeIntegerOr(options.sequenceIndex, 0),
        sequenceTotal: positiveIntegerOr(options.sequenceTotal, 1),
        reverseOrder: options.reverseOrder === true,
        easing
      });
      break;
    case 'coordinate-plus-snap-move': {
      easing = 'easeInOutSine';
      const gridSize = positiveNumberOr(options.intervalSeconds, preset.defaultIntervalSeconds);
      const snappedX = snapCoordinate(x, gridSize);
      const snappedY = snapCoordinate(y, gridSize);
      baseX = snappedX;
      baseY = snappedY;
      keyframes = buildCoordinatePlusSnapMoveKeyframes({
        startTime,
        endTime,
        spanSeconds,
        x: snappedX,
        y: snappedY,
        distancePx,
        easing
      });
      break;
    }
    case 'ta-easing-overshoot-arrive':
      easing = 'easeOutBack';
      keyframes = buildTaEasingOvershootArriveKeyframes({
        startTime,
        endTime,
        spanSeconds,
        x,
        y,
        distancePx
      });
      break;
    case 'bezier-orbit-t-plus':
      easing = 'easeInOutSine';
      keyframes = buildBezierOrbitTPlusKeyframes({
        startTime,
        endTime,
        x,
        y,
        distancePx,
        easing
      });
      break;
    case 'individual-coordinate-rearrange-circle':
      easing = 'easeInOutSine';
      keyframes = buildIndividualCoordinateRearrangeCircleKeyframes({
        startTime,
        endTime,
        x,
        y,
        radiusPx: distancePx,
        spanSeconds,
        sequenceIndex: nonNegativeIntegerOr(options.sequenceIndex, 0),
        sequenceTotal: positiveIntegerOr(options.sequenceTotal, 1),
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
    x: baseX,
    y: baseY,
    endX: keyframes[keyframes.length - 1]?.x ?? x,
    endY: keyframes[keyframes.length - 1]?.y ?? y,
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

const buildMotionPathArcKeyframes = ({
  startTime,
  endTime,
  x,
  y,
  distancePx,
  easing
}: {
  startTime: number;
  endTime: number;
  x: number;
  y: number;
  distancePx: number;
  easing: EasingType;
}): PositionKeyframe[] => {
  const midTime = startTime + (endTime - startTime) / 2;
  return [
    makeKeyframe('motion-path-arc-start', startTime, x, y, easing),
    makeKeyframe('motion-path-arc-peak', midTime, x + distancePx / 2, y - distancePx / 2, easing),
    makeKeyframe('motion-path-arc-end', endTime, x + distancePx, y, 'linear')
  ];
};

const buildMotionPathSCurveKeyframes = ({
  startTime,
  endTime,
  x,
  y,
  distancePx,
  easing
}: {
  startTime: number;
  endTime: number;
  x: number;
  y: number;
  distancePx: number;
  easing: EasingType;
}): PositionKeyframe[] => {
  const step = (endTime - startTime) / 4;
  return [
    makeKeyframe('motion-path-s-start', startTime, x, y, easing),
    makeKeyframe('motion-path-s-control-a', startTime + step, x + distancePx * 0.25, y - distancePx / 2, easing),
    makeKeyframe('motion-path-s-control-b', startTime + step * 2, x + distancePx * 0.5, y + distancePx / 2, easing),
    makeKeyframe('motion-path-s-control-c', startTime + step * 3, x + distancePx * 0.75, y - distancePx / 2, easing),
    makeKeyframe('motion-path-s-end', endTime, x + distancePx, y, 'linear')
  ];
};

const buildWindSwayKeyframes = ({
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
  const interval = Math.max(0.05, intervalSeconds);
  const count = Math.max(1, Math.floor((endTime - startTime) / interval));
  const keyframes: PositionKeyframe[] = [
    makeKeyframe('wind-sway-start', startTime, x, y, easing)
  ];
  for (let index = 1; index < count; index += 1) {
    const direction = index % 2 === 1 ? 1 : -1;
    keyframes.push(makeKeyframe(
      `wind-sway-${index}`,
      startTime + interval * index,
      x + direction * distancePx * 0.5,
      y - direction * distancePx * 0.25,
      easing
    ));
  }
  keyframes.push(makeKeyframe('wind-sway-return', endTime, x, y, 'linear'));
  return keyframes;
};

const buildDelayMoveIndividualKeyframes = ({
  startTime,
  endTime,
  x,
  y,
  distancePx,
  spanSeconds,
  totalDelaySeconds,
  sequenceIndex,
  sequenceTotal,
  reverseOrder,
  easing
}: {
  startTime: number;
  endTime: number;
  x: number;
  y: number;
  distancePx: number;
  spanSeconds: number;
  totalDelaySeconds: number;
  sequenceIndex: number;
  sequenceTotal: number;
  reverseOrder: boolean;
  easing: EasingType;
}): PositionKeyframe[] => {
  const lastIndex = Math.max(0, sequenceTotal - 1);
  const clampedIndex = Math.min(lastIndex, sequenceIndex);
  const orderIndex = reverseOrder ? lastIndex - clampedIndex : clampedIndex;
  const orderRatio = lastIndex === 0 ? 0 : orderIndex / lastIndex;
  const delaySeconds = Math.max(0, totalDelaySeconds) * orderRatio;
  const motionStart = Math.min(endTime, startTime + delaySeconds);
  const motionEnd = Math.min(endTime, motionStart + Math.max(0.01, spanSeconds));
  const endX = x + distancePx;
  const keyframes: PositionKeyframe[] = [
    makeKeyframe('delay-move-hold-start', startTime, x, y, 'linear')
  ];

  if (motionStart > startTime + 0.0001) {
    keyframes.push(makeKeyframe('delay-move-start', motionStart, x, y, easing));
  }

  keyframes.push(makeKeyframe('delay-move-end', motionEnd, endX, y, 'linear'));

  if (endTime > motionEnd + 0.0001) {
    keyframes.push(makeKeyframe('delay-move-hold-end', endTime, endX, y, 'linear'));
  }

  return keyframes;
};

const buildCoordinatePlusSnapMoveKeyframes = ({
  startTime,
  endTime,
  spanSeconds,
  x,
  y,
  distancePx,
  easing
}: {
  startTime: number;
  endTime: number;
  spanSeconds: number;
  x: number;
  y: number;
  distancePx: number;
  easing: EasingType;
}): PositionKeyframe[] => {
  const settleTime = Math.min(endTime, startTime + Math.max(0.01, spanSeconds));
  const endX = x + distancePx;
  const keyframes = [
    makeKeyframe('coordinate-plus-snap-start', startTime, x, y, easing),
    makeKeyframe('coordinate-plus-snap-end', settleTime, endX, y, 'linear')
  ];
  if (endTime > settleTime + 0.0001) {
    keyframes.push(makeKeyframe('coordinate-plus-snap-hold', endTime, endX, y, 'linear'));
  }
  return keyframes;
};

const buildTaEasingOvershootArriveKeyframes = ({
  startTime,
  endTime,
  spanSeconds,
  x,
  y,
  distancePx
}: {
  startTime: number;
  endTime: number;
  spanSeconds: number;
  x: number;
  y: number;
  distancePx: number;
}): PositionKeyframe[] => {
  const settleTime = Math.min(endTime, startTime + Math.max(0.01, spanSeconds));
  const overshootTime = Math.min(settleTime, startTime + Math.max(0.01, spanSeconds * 0.7));
  const overshootDistance = Math.max(2, distancePx * 0.15);
  const keyframes = [
    makeKeyframe('ta-easing-arrive-start', startTime, x, y + distancePx, 'easeOutBack'),
    makeKeyframe('ta-easing-arrive-overshoot', overshootTime, x, y - overshootDistance, 'easeInOutSine'),
    makeKeyframe('ta-easing-arrive-settle', settleTime, x, y, 'linear')
  ];
  if (endTime > settleTime + 0.0001) {
    keyframes.push(makeKeyframe('ta-easing-arrive-hold', endTime, x, y, 'linear'));
  }
  return keyframes;
};

const buildBezierOrbitTPlusKeyframes = ({
  startTime,
  endTime,
  x,
  y,
  distancePx,
  easing
}: {
  startTime: number;
  endTime: number;
  x: number;
  y: number;
  distancePx: number;
  easing: EasingType;
}): PositionKeyframe[] => {
  const controlA = { x: x + distancePx * 0.25, y: y - distancePx * 0.5 };
  const controlB = { x: x + distancePx * 0.75, y: y + distancePx * 0.25 };
  const end = { x: x + distancePx, y };
  return [0, 0.25, 0.5, 0.75, 1].map((progress, index) => {
    const point = cubicBezierPoint(
      { x, y },
      controlA,
      controlB,
      end,
      progress
    );
    return makeKeyframe(
      `bezier-orbit-t-plus-${index}`,
      startTime + (endTime - startTime) * progress,
      point.x,
      point.y,
      progress >= 1 ? 'linear' : easing
    );
  });
};

const cubicBezierPoint = (
  start: { x: number; y: number },
  controlA: { x: number; y: number },
  controlB: { x: number; y: number },
  end: { x: number; y: number },
  progress: number
): { x: number; y: number } => {
  const inverse = 1 - progress;
  const startWeight = inverse * inverse * inverse;
  const controlAWeight = 3 * inverse * inverse * progress;
  const controlBWeight = 3 * inverse * progress * progress;
  const endWeight = progress * progress * progress;
  return {
    x: start.x * startWeight + controlA.x * controlAWeight + controlB.x * controlBWeight + end.x * endWeight,
    y: start.y * startWeight + controlA.y * controlAWeight + controlB.y * controlBWeight + end.y * endWeight
  };
};

const buildIndividualCoordinateRearrangeCircleKeyframes = ({
  startTime,
  endTime,
  x,
  y,
  radiusPx,
  spanSeconds,
  sequenceIndex,
  sequenceTotal,
  easing
}: {
  startTime: number;
  endTime: number;
  x: number;
  y: number;
  radiusPx: number;
  spanSeconds: number;
  sequenceIndex: number;
  sequenceTotal: number;
  easing: EasingType;
}): PositionKeyframe[] => {
  const total = Math.max(1, sequenceTotal);
  const index = Math.min(total - 1, sequenceIndex);
  const angle = -Math.PI / 2 + (Math.PI * 2 * index) / total;
  const targetX = x + Math.cos(angle) * radiusPx;
  const targetY = y + Math.sin(angle) * radiusPx;
  const settleTime = Math.min(endTime, startTime + Math.max(0.01, spanSeconds));
  const keyframes = [
    makeKeyframe('individual-coordinate-rearrange-start', startTime, x, y, easing),
    makeKeyframe('individual-coordinate-rearrange-slot', settleTime, targetX, targetY, 'linear')
  ];
  if (endTime > settleTime + 0.0001) {
    keyframes.push(makeKeyframe('individual-coordinate-rearrange-hold', endTime, targetX, targetY, 'linear'));
  }
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

const positiveIntegerOr = (value: unknown, fallback: number): number => {
  const parsed = finiteNumberOr(value, fallback);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const snapCoordinate = (value: number, gridSize: number): number =>
  Math.floor(value / gridSize) * gridSize;

const nonNegativeIntegerOr = (value: unknown, fallback: number): number => {
  const parsed = finiteNumberOr(value, fallback);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
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
