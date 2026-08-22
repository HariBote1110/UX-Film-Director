import { beforeEach, describe, expect, it } from 'vitest';
import type { FilterType, PositionKeyframe, ShapeObject } from '../types';
import { useStore } from '../store/useStore';
import { easingFunctions, type EasingType } from '../utils/easings';
import {
  addFilterToObject,
  createDefaultFilter,
  getEnabledObjectFiltersInOrder,
  getFadeOpacityMultiplier,
  getObjectFiltersInOrder,
  getPrimaryWipeFilter,
  moveFilterInObject,
  removeFilterFromObject,
  syncFiltersFromLegacyValues,
  syncLegacyEffectsWithFilters,
  toggleFilterEnabledInObject,
  updateFilterParamsInObject,
} from '../utils/filterStack';
import {
  evaluateObjectPositionAtTime,
  normaliseKeyframesForObject,
  shiftKeyframesForObject,
} from '../utils/keyframes';

const ALL_FILTER_TYPES: FilterType[] = [
  'color_correction',
  'clipping',
  'vibration',
  'shadow',
  'gradient',
  'blur',
  'fade',
  'wipe',
];

const easingNames = Object.keys(easingFunctions) as EasingType[];

const baseShape = (suffix: string): ShapeObject => ({
  id: `shape-${suffix}`,
  type: 'shape',
  name: 'Stress rect',
  layer: 0,
  startTime: 0,
  duration: 24,
  x: 12,
  y: 18,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  enableAnimation: true,
  endX: 520,
  endY: 280,
  easing: 'easeInOutQuad',
  shapeType: 'rect',
  width: 128,
  height: 96,
  fill: '#2a4b6f',
});

const buildRichKeyframes = (start: number, end: number, count: number): PositionKeyframe[] => {
  const keys: PositionKeyframe[] = [];
  for (let i = 0; i < count; i += 1) {
    const t = start + ((end - start) * i) / Math.max(1, count - 1);
    keys.push({
      id: `kf-${i}`,
      time: t,
      x: Math.cos(i * 0.37) * 220 + 420,
      y: Math.sin(i * 0.37) * 160 + 320,
      easing: easingNames[i % easingNames.length] ?? 'linear',
    });
  }
  return keys;
};

const stackFilters = (object: ShapeObject, rounds: number): ShapeObject => {
  let next: ShapeObject = object;
  for (let r = 0; r < rounds; r += 1) {
    const type = ALL_FILTER_TYPES[r % ALL_FILTER_TYPES.length];
    next = addFilterToObject(next, type) as ShapeObject;
  }
  return syncLegacyEffectsWithFilters(next) as ShapeObject;
};

describe('heavy effects stress (filter stack + keyframes)', () => {
  it('evaluates many keyed shapes across a dense time raster without NaN or Infinity', () => {
    const objectCount = 72;
    const timeSteps = 320;
    const keyframeCount = 36;
    const start = 0.5;
    const end = 22.5;

    for (let o = 0; o < objectCount; o += 1) {
      const shape = baseShape(`k-${o}`);
      shape.startTime = (o % 5) * 0.02;
      shape.duration = 24 - shape.startTime;
      const keyframes = buildRichKeyframes(
        shape.startTime,
        shape.startTime + shape.duration,
        keyframeCount
      );
      shape.keyframes = normaliseKeyframesForObject(shape, keyframes);
      shape.enableAnimation = false;

      for (let t = 0; t < timeSteps; t += 1) {
        const time = start + ((end - start) * t) / (timeSteps - 1);
        const { x, y } = evaluateObjectPositionAtTime(shape, time);
        expect(Number.isFinite(x)).toBe(true);
        expect(Number.isFinite(y)).toBe(true);
      }
    }
  });

  it('chains dozens of heterogeneous filters and keeps query helpers coherent', () => {
    let object: ShapeObject = baseShape('fat-filters');
    object = stackFilters(object, 64);

    expect(getObjectFiltersInOrder(object)).toHaveLength(64);

    for (let i = 0; i < 120; i += 1) {
      const filters = getObjectFiltersInOrder(object);
      const id = filters[i % filters.length].id;
      object = toggleFilterEnabledInObject(object, id) as ShapeObject;
    }

    const enabled = getEnabledObjectFiltersInOrder(object);
    expect(enabled.length).toBeGreaterThan(0);
    expect(getFadeOpacityMultiplier(object)).toBeGreaterThanOrEqual(0);
    expect(getFadeOpacityMultiplier(object)).toBeLessThanOrEqual(1);

    const wipe = getPrimaryWipeFilter(object);
    if (wipe) {
      expect(wipe.type).toBe('wipe');
    }

    for (let m = 0; m < 80; m += 1) {
      const filters = getObjectFiltersInOrder(object);
      const idx = (m * 3) % Math.max(1, filters.length - 1);
      const id = filters[idx].id;
      object = moveFilterInObject(object, id, m % 2 === 0 ? 'down' : 'up') as ShapeObject;
    }

    const blur = getObjectFiltersInOrder(object).find((f) => f.type === 'blur');
    expect(blur).toBeDefined();
    if (blur) {
      object = updateFilterParamsInObject(object, blur.id, { strength: 12, quality: 4 }) as ShapeObject;
      const updated = getObjectFiltersInOrder(object).find((f) => f.id === blur.id);
      expect(updated && updated.type === 'blur' ? updated.params.strength : 0).toBeGreaterThanOrEqual(0);
    }

    for (let r = 0; r < 24; r += 1) {
      const filters = getObjectFiltersInOrder(object);
      if (filters.length <= 8) break;
      const victim = filters[r % filters.length];
      object = removeFilterFromObject(object, victim.id) as ShapeObject;
    }

    expect(getObjectFiltersInOrder(object).length).toBeGreaterThan(10);
  });

  it('normalises and shifts very large keyframe lists repeatedly', () => {
    const shape = baseShape('kf-bulk');
    const raw = buildRichKeyframes(shape.startTime, shape.startTime + shape.duration, 420);
    let keyframes = normaliseKeyframesForObject(shape, raw);
    expect(keyframes.length).toBeGreaterThan(200);

    for (let round = 0; round < 60; round += 1) {
      keyframes = shiftKeyframesForObject(
        { ...shape, startTime: shape.startTime + round * 0.001, duration: shape.duration },
        keyframes,
        0.0005,
        0.2,
        -0.15
      );
      keyframes = normaliseKeyframesForObject(
        { ...shape, startTime: shape.startTime + round * 0.001, duration: shape.duration },
        keyframes
      );
    }

    expect(keyframes.length).toBeGreaterThan(200);
    const probe = evaluateObjectPositionAtTime({ ...shape, keyframes, enableAnimation: false }, shape.startTime + 11);
    expect(Number.isFinite(probe.x)).toBe(true);
  });

  it('merges legacy colour / shadow / gradient fields into filters at scale', () => {
    const batch = 80;
    for (let i = 0; i < batch; i += 1) {
      const legacy: ShapeObject = {
        ...baseShape(`legacy-${i}`),
        colorCorrection: {
          enabled: i % 2 === 0,
          brightness: 0.8 + (i % 7) * 0.05,
          contrast: 1.05,
          saturation: 0.95,
          hue: (i % 20) - 10,
        },
        shadow: {
          enabled: i % 3 !== 0,
          colour: '#101018',
          blur: 6 + (i % 5),
          offsetX: 3,
          offsetY: 4,
          opacity: 0.35,
        },
        gradient: {
          enabled: i % 4 === 0,
          type: 'linear',
          colours: ['#ffeedd', '#223344'],
          stops: [0, 1],
          direction: i % 90,
        },
        filters: [
          createDefaultFilter('blur'),
          createDefaultFilter('fade'),
        ],
      };

      const merged = syncFiltersFromLegacyValues(legacy);
      const ordered = getObjectFiltersInOrder(merged);
      expect(ordered.length).toBeGreaterThanOrEqual(2);
      const synced = syncLegacyEffectsWithFilters(merged) as ShapeObject;
      expect(synced.filters?.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('heavy effects stress (Zustand store)', () => {
  beforeEach(() => {
    useStore.getState().initializeProject({
      width: 1920,
      height: 1080,
      fps: 60,
      sampleRate: 48_000,
    });
  });

  it('applies thousands of filter param patches on a pre-stacked object without corrupting state', () => {
    const { addObject, updateObjectFilterParams, setTime } = useStore.getState();

    let fat: ShapeObject = stackFilters(baseShape('store-fat'), 40);
    fat = syncLegacyEffectsWithFilters(fat) as ShapeObject;
    addObject(fat);

    const live = useStore.getState().objects[0];
    expect(live).toBeDefined();
    const filters = getObjectFiltersInOrder(live);
    expect(filters.length).toBe(40);

    const blurIds = filters.filter((f) => f.type === 'blur').map((f) => f.id);
    const fadeIds = filters.filter((f) => f.type === 'fade').map((f) => f.id);
    expect(blurIds.length).toBeGreaterThan(0);

    for (let i = 0; i < 2_800; i += 1) {
      const blurId = blurIds[i % blurIds.length];
      updateObjectFilterParams(live.id, blurId, {
        strength: 1 + (i % 18),
        quality: 1 + (i % 4),
      });
      const fadeId = fadeIds[i % fadeIds.length];
      updateObjectFilterParams(live.id, fadeId, {
        opacity: 0.35 + ((i % 50) / 100),
      });
      if (i % 200 === 0) {
        setTime((i % 1_000) / 1_000 * Math.min(20, useStore.getState().duration));
      }
    }

    const finalObject = useStore.getState().objects.find((o) => o.id === live.id);
    expect(finalObject).toBeDefined();
    const finalFilters = getObjectFiltersInOrder(finalObject!);
    expect(finalFilters).toHaveLength(40);
    const fadeMult = getFadeOpacityMultiplier(finalObject!);
    expect(fadeMult).toBeGreaterThanOrEqual(0);
    expect(fadeMult).toBeLessThanOrEqual(1);
    // R4-8 group f: 履歴は command stack(`pastCommands`)へ移行した。
    // `addObject`のみが1件積み(`updateObjectFilterParams`は履歴を積まない)、
    // 2,800回のパラメータ更新で肥大化しないことを確認する。
    expect(useStore.getState().pastCommands.length).toBeLessThanOrEqual(2);
  });
});
