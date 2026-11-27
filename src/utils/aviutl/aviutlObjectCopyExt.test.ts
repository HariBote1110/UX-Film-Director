import { describe, expect, it } from 'vitest';
import type { ShapeObject } from '../../types';
import { buildAviUtlObjectCopyExtClones } from './aviutlObjectCopyExt';

const baseShape = (patch: Partial<ShapeObject> = {}): ShapeObject => ({
  id: 'shape-1',
  type: 'shape',
  name: 'Source Shape',
  layer: 2,
  startTime: 1,
  duration: 4,
  x: 100,
  y: 120,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 0.8,
  enableAnimation: true,
  endX: 180,
  endY: 180,
  easing: 'linear',
  keyframes: [
    { id: 'kf-1', time: 1, x: 100, y: 120, easing: 'linear' },
    { id: 'kf-2', time: 5, x: 180, y: 180, easing: 'easeInOutSine' }
  ],
  shapeType: 'rect',
  width: 64,
  height: 64,
  fill: '#ffffff',
  ...patch
});

describe('AviUtl ObjectCopyEXT clone builder', () => {
  it('builds deterministic offset clones while preserving the source object', () => {
    const clones = buildAviUtlObjectCopyExtClones([baseShape()], {
      copies: 3,
      offsetX: 16,
      offsetY: 8,
      timeOffsetSeconds: 0.1,
      layerOffset: 1,
      idFactory: (sourceId, copyIndex) => `${sourceId}-copy-${copyIndex}`
    });

    expect(clones.map((clone) => ({
      id: clone.id,
      name: clone.name,
      layer: clone.layer,
      startTime: clone.startTime,
      x: clone.x,
      y: clone.y,
      endX: clone.endX,
      endY: clone.endY
    }))).toEqual([
      { id: 'shape-1-copy-1', name: 'Source Shape ObjectCopyEXT 1', layer: 3, startTime: 1.1, x: 116, y: 128, endX: 196, endY: 188 },
      { id: 'shape-1-copy-2', name: 'Source Shape ObjectCopyEXT 2', layer: 4, startTime: 1.2, x: 132, y: 136, endX: 212, endY: 196 },
      { id: 'shape-1-copy-3', name: 'Source Shape ObjectCopyEXT 3', layer: 5, startTime: 1.3, x: 148, y: 144, endX: 228, endY: 204 }
    ]);

    expect(clones[0].keyframes).toEqual([
      { id: 'shape-1-copy-1-kf-1-1', time: 1.1, x: 116, y: 128, easing: 'linear' },
      { id: 'shape-1-copy-1-kf-2-2', time: 5.1, x: 196, y: 188, easing: 'easeInOutSine' }
    ]);
  });
});
