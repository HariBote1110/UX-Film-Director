import { describe, expect, it } from 'vitest';
import type { ShapeObject } from '../types';
import {
  applyAviUtlEffectPresetToObject,
  buildAviUtlEffectPresetFilter,
  getAviUtlPackEffectPresets
} from './aviutlEffectPresets';

const baseShape = (): ShapeObject => ({
  id: 'shape-1',
  type: 'shape',
  name: 'Rect',
  layer: 0,
  startTime: 0,
  duration: 4,
  x: 100,
  y: 100,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  enableAnimation: false,
  endX: 100,
  endY: 100,
  easing: 'linear',
  shapeType: 'rect',
  width: 120,
  height: 80,
  fill: '#ffffff'
});

describe('AviUtlPackV4 effect presets', () => {
  it('exposes P1 Pack visual effects as UXFD filter presets', () => {
    expect(getAviUtlPackEffectPresets().map((preset) => ({
      id: preset.id,
      sourceCandidateId: preset.sourceCandidateId,
      filterType: preset.filterType
    }))).toEqual([
      { id: 'luminance-wipe-basic', sourceCandidateId: 'tim-luminance-wipe', filterType: 'wipe' },
      { id: 'edge-outline-soft', sourceCandidateId: 'tim-edge-outline', filterType: 'shadow' },
      { id: 'colour-aberration-rgb', sourceCandidateId: 'tim-colour-aberration', filterType: 'colour_aberration' },
      { id: 'fan-clipping-diagonal', sourceCandidateId: 'fan-clipping-r', filterType: 'clipping' }
    ]);
  });

  it('builds tuned filter defaults for each preset', () => {
    expect(buildAviUtlEffectPresetFilter('luminance-wipe-basic')).toMatchObject({
      type: 'wipe',
      enabled: true,
      params: { edge: 'left', reverse: false }
    });
    expect(buildAviUtlEffectPresetFilter('edge-outline-soft')).toMatchObject({
      type: 'shadow',
      enabled: true,
      params: { colour: '#000000', blur: 0, offsetX: 0, offsetY: 0, opacity: 0.85 }
    });
    expect(buildAviUtlEffectPresetFilter('colour-aberration-rgb')).toMatchObject({
      type: 'colour_aberration',
      enabled: true,
      params: { offsetX: 3, offsetY: 0 }
    });
    expect(buildAviUtlEffectPresetFilter('fan-clipping-diagonal')).toMatchObject({
      type: 'clipping',
      enabled: true,
      params: { top: 0, bottom: 0, left: 0, right: 0, angle: 45, radius: 0 }
    });
  });

  it('appends presets to the existing filter stack without discarding old filters', () => {
    const object = {
      ...baseShape(),
      filters: [buildAviUtlEffectPresetFilter('edge-outline-soft')]
    };
    const next = applyAviUtlEffectPresetToObject(object, 'colour-aberration-rgb');

    expect(next.filters?.map((filter) => filter.type)).toEqual(['shadow', 'colour_aberration']);
    expect(next.filters?.[1]).toMatchObject({
      type: 'colour_aberration',
      params: { offsetX: 3, offsetY: 0 }
    });
  });

  it('continues to sync legacy clipping when adding the fan clipping preset', () => {
    const object = {
      ...baseShape(),
      filters: [buildAviUtlEffectPresetFilter('edge-outline-soft')]
    };
    const next = applyAviUtlEffectPresetToObject(object, 'fan-clipping-diagonal');

    expect(next.filters?.map((filter) => filter.type)).toEqual(['shadow', 'clipping']);
    expect(next.customClipping).toMatchObject({
      enabled: true,
      angle: 45
    });
  });
});
