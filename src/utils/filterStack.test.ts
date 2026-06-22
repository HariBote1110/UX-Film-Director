import { describe, expect, it } from 'vitest';
import type { ObjectFilter, ShapeObject, TimelineObject } from '../types';
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
    if (blur.type !== 'blur') throw new Error('expected blur');
    expect(blur.params.quality).toBeGreaterThanOrEqual(1);

    const wipe = createDefaultFilter('wipe');
    expect(wipe.type).toBe('wipe');
    if (wipe.type !== 'wipe') throw new Error('expected wipe');
    expect(['left', 'right', 'top', 'bottom']).toContain(wipe.params.edge);

    const colourAberration = createDefaultFilter('colour_aberration');
    expect(colourAberration.type).toBe('colour_aberration');
    if (colourAberration.type !== 'colour_aberration') throw new Error('expected colour aberration');
    expect(colourAberration.params.offsetX).toBeGreaterThan(0);
    expect(colourAberration.params.offsetY).toBe(0);

    const outline = createDefaultFilter('outline');
    expect(outline.type).toBe('outline');
    if (outline.type !== 'outline') throw new Error('expected outline');
    expect(outline.params.thickness).toBeGreaterThan(0);
    expect(outline.params.colour).toBe('#000000');

    const displacement = createDefaultFilter('displacement_map');
    expect(displacement.type).toBe('displacement_map');
    if (displacement.type !== 'displacement_map') throw new Error('expected displacement map');
    expect(displacement.params.amountX).toBe(24);
    expect(displacement.params.amountY).toBe(12);
    expect(displacement.params.size).toBe(128);
    expect(displacement.params.strength).toBe(1);

    const fakeDof = createDefaultFilter('fake_dof' as any);
    expect(fakeDof.type).toBe('fake_dof');
    if (fakeDof.type !== 'fake_dof') throw new Error('expected fake DOF');
    expect(fakeDof.params.focusX).toBe(0.5);
    expect(fakeDof.params.focusY).toBe(0.5);
    expect(fakeDof.params.focusRadius).toBe(0.25);
    expect(fakeDof.params.blur).toBe(8);
    expect(fakeDof.params.strength).toBe(1);

    const autoBlur = createDefaultFilter('auto_blur' as any);
    expect(autoBlur.type).toBe('auto_blur');
    if (autoBlur.type !== 'auto_blur') throw new Error('expected auto blur');
    expect(autoBlur.params.blur).toBe(10);
    expect(autoBlur.params.speed).toBe(1);
    expect(autoBlur.params.strength).toBe(1);
    expect(autoBlur.params.colourShift).toBe(0);

    const stretch = createDefaultFilter('stretch' as any);
    expect(stretch.type).toBe('stretch');
    if (stretch.type !== 'stretch') throw new Error('expected stretch');
    expect(stretch.params.angle).toBe(0);
    expect(stretch.params.amount).toBe(1);
    expect(stretch.params.strength).toBe(1);

    const multiSlicer = createDefaultFilter('multi_slicer' as any);
    expect(multiSlicer.type).toBe('multi_slicer');
    if (multiSlicer.type !== 'multi_slicer') throw new Error('expected multi slicer');
    expect(multiSlicer.params.angle).toBe(45);
    expect(multiSlicer.params.offset).toBe(16);
    expect(multiSlicer.params.slices).toBe(18);
    expect(multiSlicer.params.expansion).toBe(0);
    expect(multiSlicer.params.strength).toBe(1);

    const octTransform = createDefaultFilter('oct_transform' as any);
    expect(octTransform.type).toBe('oct_transform');
    if (octTransform.type !== 'oct_transform') throw new Error('expected oct transform');
    expect(octTransform.params.scale).toBe(1);
    expect(octTransform.params.rotation).toBe(0);
    expect(octTransform.params.vertexCount).toBe(8);
    expect(octTransform.params.warp).toBe(0.2);
    expect(octTransform.params.strength).toBe(1);

    const areaExpand = createDefaultFilter('area_expand' as any);
    expect(areaExpand.type).toBe('area_expand');
    if (areaExpand.type !== 'area_expand') throw new Error('expected area expand');
    expect(areaExpand.params.top).toBe(0);
    expect(areaExpand.params.bottom).toBe(0);
    expect(areaExpand.params.left).toBe(0);
    expect(areaExpand.params.right).toBe(32);
    expect(areaExpand.params.fill).toBe(true);

    const smartClipping = createDefaultFilter('smart_clipping' as any);
    expect(smartClipping.type).toBe('smart_clipping');
    if (smartClipping.type !== 'smart_clipping') throw new Error('expected smart clipping');
    expect(smartClipping.params.top).toBe(0);
    expect(smartClipping.params.bottom).toBe(0);
    expect(smartClipping.params.left).toBe(0);
    expect(smartClipping.params.right).toBe(0);
    expect(smartClipping.params.linkAxes).toBe(false);
    expect(smartClipping.params.mode).toBe(0);
    expect(smartClipping.params.amount).toBe(1);
    expect(smartClipping.params.seed).toBe(1);
    expect(smartClipping.params.reverse).toBe(false);
  });
});

describe('normaliseObjectFilters', () => {
  it('drops invalid entries and coerces params', () => {
    const result = normaliseObjectFilters([
      { id: 'x', type: 'fade' as const, enabled: true, params: { opacity: 2 } },
      { id: 'ca', type: 'colour_aberration' as const, enabled: true, params: { offsetX: -5, offsetY: 3 } },
      { id: 'ol', type: 'outline' as const, enabled: true, params: { thickness: -3, colour: '', opacity: 2 } },
      { id: 'dm', type: 'displacement_map' as const, enabled: true, params: { amountX: -10, amountY: Number.POSITIVE_INFINITY, size: 0, strength: 2 } },
      { id: 'dof', type: 'fake_dof' as any, enabled: true, params: { focusX: 2, focusY: -1, focusRadius: 0, blur: -8, strength: 2 } },
      { id: 'ab', type: 'auto_blur' as any, enabled: true, params: { blur: -5, speed: Number.POSITIVE_INFINITY, strength: 2, colourShift: -1 } },
      { id: 'st', type: 'stretch' as any, enabled: true, params: { angle: Number.POSITIVE_INFINITY, amount: -2, strength: 2 } },
      { id: 'ms', type: 'multi_slicer' as any, enabled: true, params: { angle: Number.POSITIVE_INFINITY, offset: -20, slices: 1, expansion: -4, strength: 2 } },
      { id: 'oct', type: 'oct_transform' as any, enabled: true, params: { scale: 0, rotation: Number.POSITIVE_INFINITY, vertexCount: 2, warp: -1, strength: 2 } },
      { id: 'ae', type: 'area_expand' as any, enabled: true, params: { top: -1, bottom: Number.POSITIVE_INFINITY, left: -2, right: 3, fill: 'yes' } },
      { id: 'sc', type: 'smart_clipping' as any, enabled: true, params: { top: -1, bottom: 2, left: -3, right: 4, linkAxes: 'no', mode: 8, amount: -1, seed: Number.POSITIVE_INFINITY, reverse: 'no' } },
      { id: '', type: 'not-a-filter' as never, enabled: true, params: {} as never }
    ] as ObjectFilter[]);
    expect(result).toHaveLength(11);
    if (result[0].type !== 'fade') throw new Error('expected fade');
    expect(result[0].params.opacity).toBe(1);
    if (result[1].type !== 'colour_aberration') throw new Error('expected colour aberration');
    expect(result[1].params.offsetX).toBe(0);
    expect(result[1].params.offsetY).toBe(3);
    if (result[2].type !== 'outline') throw new Error('expected outline');
    expect(result[2].params.thickness).toBe(0);
    expect(result[2].params.colour).toBe('#000000');
    expect(result[2].params.opacity).toBe(1);
    if (result[3].type !== 'displacement_map') throw new Error('expected displacement map');
    expect(result[3].params).toEqual({ amountX: 0, amountY: 12, size: 1, strength: 1 });
    if (result[4].type !== 'fake_dof') throw new Error('expected fake DOF');
    expect(result[4].params).toEqual({ focusX: 1, focusY: 0, focusRadius: 0.01, blur: 0, strength: 1 });
    if (result[5].type !== 'auto_blur') throw new Error('expected auto blur');
    expect(result[5].params).toEqual({ blur: 0, speed: 1, strength: 1, colourShift: 0 });
    if (result[6].type !== 'stretch') throw new Error('expected stretch');
    expect(result[6].params).toEqual({ angle: 0, amount: 0, strength: 1 });
    if (result[7].type !== 'multi_slicer') throw new Error('expected multi slicer');
    expect(result[7].params).toEqual({ angle: 45, offset: 0, slices: 2, expansion: 0, strength: 1 });
    if (result[8].type !== 'oct_transform') throw new Error('expected oct transform');
    expect(result[8].params).toEqual({ scale: 0.01, rotation: 0, vertexCount: 3, warp: 0, strength: 1 });
    if (result[9].type !== 'area_expand') throw new Error('expected area expand');
    expect(result[9].params).toEqual({ top: 0, bottom: 0, left: 0, right: 3, fill: true });
    if (result[10].type !== 'smart_clipping') throw new Error('expected smart clipping');
    expect(result[10].params).toEqual({ top: 0, bottom: 2, left: 0, right: 4, linkAxes: false, mode: 5, amount: 0, seed: 1, reverse: false });
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
    if (a.type !== 'fade' || b.type !== 'fade') throw new Error('expected fade filters');
    const filters: ObjectFilter[] = [
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
    const first: ObjectFilter = { ...createDefaultFilter('color_correction'), params: { brightness: 1, contrast: 1, saturation: 1, hue: 0 } } as ObjectFilter;
    const second = {
      ...createDefaultFilter('color_correction'),
      id: 'cc-2',
      params: { brightness: 1.5, contrast: 1, saturation: 1, hue: 0 }
    } as ObjectFilter;
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
