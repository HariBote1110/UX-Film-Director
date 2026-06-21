import { describe, expect, it } from 'vitest';
import type { ShapeObject, TimelineObject } from '../types';
import {
  addFilterToObject,
  createDefaultFilter,
  getEnabledObjectFiltersInOrder,
  getFadeOpacityMultiplier,
  getObjectFiltersInOrder,
  getPrimaryWipeFilter,
  moveFilterInObject,
  normaliseObjectFilters,
  removeFilterFromObject,
  syncFiltersFromLegacyValues,
  syncLegacyEffectsWithFilters,
  toggleFilterEnabledInObject,
  updateFilterParamsInObject
} from './filterStack';

const minimalShape = (): ShapeObject => ({
  id: 'shape-1',
  type: 'shape',
  name: 'Rect',
  layer: 0,
  startTime: 0,
  duration: 10,
  x: 0,
  y: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  enableAnimation: false,
  endX: 0,
  endY: 0,
  easing: 'linear',
  shapeType: 'rect',
  width: 10,
  height: 10,
  fill: '#000000'
});

describe('createDefaultFilter', () => {
  it('creates enabled filters with stable param shapes', () => {
    const blur = createDefaultFilter('blur');
    expect(blur.type).toBe('blur');
    expect(blur.enabled).toBe(true);
    expect(blur.params.quality).toBeGreaterThanOrEqual(1);

    const wipe = createDefaultFilter('wipe');
    expect(wipe.type).toBe('wipe');
    expect(['left', 'right', 'top', 'bottom']).toContain(wipe.params.edge);

    const colourAberration = createDefaultFilter('colour_aberration');
    expect(colourAberration.type).toBe('colour_aberration');
    expect(colourAberration.params.offsetX).toBeGreaterThan(0);
    expect(colourAberration.params.offsetY).toBe(0);
  });
});

describe('normaliseObjectFilters', () => {
  it('drops invalid entries and coerces params', () => {
    const result = normaliseObjectFilters([
      { id: 'x', type: 'fade' as const, enabled: true, params: { opacity: 2 } },
      { id: 'ca', type: 'colour_aberration' as const, enabled: true, params: { offsetX: -5, offsetY: 3 } },
      { id: '', type: 'not-a-filter' as never, enabled: true, params: {} }
    ]);
    expect(result).toHaveLength(2);
    if (result[0].type !== 'fade') throw new Error('expected fade');
    expect(result[0].params.opacity).toBe(1);
    if (result[1].type !== 'colour_aberration') throw new Error('expected colour aberration');
    expect(result[1].params.offsetX).toBe(0);
    expect(result[1].params.offsetY).toBe(3);
  });
});

describe('getObjectFiltersInOrder and legacy migration', () => {
  it('reads explicit filters array when present', () => {
    const shape = minimalShape();
    const fade = createDefaultFilter('fade');
    const next = { ...shape, filters: [fade] };
    const ordered = getObjectFiltersInOrder(next);
    expect(ordered).toHaveLength(1);
    expect(ordered[0].id).toBe(fade.id);
  });

  it('builds filters from legacy fields when filters missing', () => {
    const shape: ShapeObject = {
      ...minimalShape(),
      colorCorrection: {
        enabled: true,
        brightness: 2,
        contrast: 1,
        saturation: 1,
        hue: 0
      }
    };
    const ordered = getObjectFiltersInOrder(shape);
    const colour = ordered.find((f) => f.type === 'color_correction');
    expect(colour?.type).toBe('color_correction');
    if (colour && colour.type === 'color_correction') {
      expect(colour.params.brightness).toBe(2);
    }
  });
});

describe('getFadeOpacityMultiplier', () => {
  it('multiplies enabled fade opacities', () => {
    const shape = minimalShape();
    const a = createDefaultFilter('fade');
    const b = createDefaultFilter('fade');
    const filters = [
      { ...a, id: 'fade-a', params: { opacity: 0.5 } },
      { ...b, id: 'fade-b', enabled: false, params: { opacity: 0.1 } },
      { ...createDefaultFilter('blur'), id: 'blur-1' }
    ];
    const object = { ...shape, filters };
    expect(getFadeOpacityMultiplier(object)).toBeCloseTo(0.5, 5);
  });
});

describe('getPrimaryWipeFilter', () => {
  it('returns first enabled wipe filter', () => {
    const wipe = createDefaultFilter('wipe');
    const object = { ...minimalShape(), filters: [wipe] };
    const primary = getPrimaryWipeFilter(object);
    expect(primary?.id).toBe(wipe.id);
  });

  it('returns null when wipe disabled', () => {
    const wipe = { ...createDefaultFilter('wipe'), enabled: false };
    expect(getPrimaryWipeFilter({ ...minimalShape(), filters: [wipe] })).toBeNull();
  });
});

describe('syncLegacyEffectsWithFilters', () => {
  it('writes last matching filter back to legacy shape fields', () => {
    const shape = minimalShape();
    const first = { ...createDefaultFilter('color_correction'), params: { brightness: 1, contrast: 1, saturation: 1, hue: 0 } };
    const second = {
      ...createDefaultFilter('color_correction'),
      id: 'cc-2',
      params: { brightness: 1.5, contrast: 1, saturation: 1, hue: 0 }
    };
    const synced = syncLegacyEffectsWithFilters({ ...shape, filters: [first, second] });
    expect(synced.colorCorrection?.brightness).toBe(1.5);
  });
});

describe('syncFiltersFromLegacyValues', () => {
  it('merges legacy gradient into filters for shapes', () => {
    const shape: ShapeObject = {
      ...minimalShape(),
      gradient: {
        enabled: true,
        type: 'linear',
        colours: ['#ff0000'],
        stops: [],
        direction: 90
      }
    };
    const synced = syncFiltersFromLegacyValues(shape);
    const gradient = getEnabledObjectFiltersInOrder(synced).find((f) => f.type === 'gradient');
    expect(gradient?.type).toBe('gradient');
  });
});

describe('filter mutations on object', () => {
  it('adds a new filter to the end', () => {
    const shape = minimalShape();
    const next = addFilterToObject(shape, 'blur');
    expect(getObjectFiltersInOrder(next).some((f) => f.type === 'blur')).toBe(true);
  });

  it('toggles enabled flag for matching id', () => {
    const fade = createDefaultFilter('fade');
    const shape = { ...minimalShape(), filters: [fade] };
    const toggled = toggleFilterEnabledInObject(shape, fade.id);
    const updated = getObjectFiltersInOrder(toggled)[0];
    expect(updated.enabled).toBe(false);
  });

  it('removes filter by id', () => {
    const fade = createDefaultFilter('fade');
    const shape = { ...minimalShape(), filters: [fade] };
    const next = removeFilterFromObject(shape, fade.id);
    expect(getObjectFiltersInOrder(next)).toHaveLength(0);
  });

  it('moves filter up and down', () => {
    const a = { ...createDefaultFilter('fade'), id: 'fa' };
    const b = { ...createDefaultFilter('blur'), id: 'fb' };
    const shape: TimelineObject = { ...minimalShape(), filters: [a, b] };
    const movedUp = moveFilterInObject(shape, 'fb', 'up');
    expect(getObjectFiltersInOrder(movedUp).map((f) => f.id)).toEqual(['fb', 'fa']);
    const movedDown = moveFilterInObject(movedUp, 'fb', 'down');
    expect(getObjectFiltersInOrder(movedDown).map((f) => f.id)).toEqual(['fa', 'fb']);
  });

  it('no-ops move when already at boundary', () => {
    const a = { ...createDefaultFilter('fade'), id: 'fa' };
    const shape: TimelineObject = { ...minimalShape(), filters: [a] };
    const same = moveFilterInObject(shape, 'fa', 'up');
    expect(getObjectFiltersInOrder(same).map((f) => f.id)).toEqual(['fa']);
  });

  it('patches filter params with normalisation', () => {
    const fade = createDefaultFilter('fade');
    const shape: TimelineObject = { ...minimalShape(), filters: [fade] };
    const next = updateFilterParamsInObject(shape, fade.id, { opacity: -1 });
    const updated = getObjectFiltersInOrder(next)[0];
    if (updated.type !== 'fade') throw new Error('expected fade');
    expect(updated.params.opacity).toBe(0);
  });
});
