import { describe, expect, it } from 'vitest';
import type { ShapeObject, TimelineObject } from '../../types';
import {
  buildAviUtlCoordinateRecallPatches,
  captureAviUtlCoordinateStoreSnapshot
} from './aviutlCoordinateStore';

const shape = (id: string, patch: Partial<ShapeObject> = {}): ShapeObject => ({
  id,
  type: 'shape',
  name: id,
  layer: 0,
  startTime: 0,
  duration: 5,
  x: 100,
  y: 120,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  enableAnimation: false,
  endX: 100,
  endY: 120,
  easing: 'linear',
  shapeType: 'rect',
  width: 80,
  height: 60,
  fill: '#ffffff',
  ...patch
});

describe('93 座標格納 native coordinate store', () => {
  it('captures selected object coordinates as an indexed snapshot', () => {
    const objects: TimelineObject[] = [
      shape('a', { x: 120.25, y: 80.5, layer: 3, rotation: 15, scaleX: 1.2, scaleY: 0.8, opacity: 0.75 }),
      shape('b', { x: -20, y: 240, layer: 4, rotation: -10, scaleX: 0.9, scaleY: 0.9, opacity: 0.5 })
    ];

    expect(captureAviUtlCoordinateStoreSnapshot(objects, { name: 'poseA' })).toEqual({
      name: 'poseA',
      entries: [
        { objectId: 'a', index: 0, x: 120.25, y: 80.5, z: 0, layer: 3, rotation: 15, scaleX: 1.2, scaleY: 0.8, opacity: 0.75 },
        { objectId: 'b', index: 1, x: -20, y: 240, z: 0, layer: 4, rotation: -10, scaleX: 0.9, scaleY: 0.9, opacity: 0.5 }
      ]
    });
  });

  it('recalls stored coordinates onto target objects by selection order', () => {
    const snapshot = captureAviUtlCoordinateStoreSnapshot([
      shape('source-a', { x: 10, y: 20, rotation: 5, scaleX: 1.5, scaleY: 1.25, opacity: 0.8 }),
      shape('source-b', { x: 300, y: 220, rotation: -15, scaleX: 0.75, scaleY: 0.5, opacity: 0.6 })
    ], { name: 'poseB' });

    expect(buildAviUtlCoordinateRecallPatches([
      shape('target-a', { x: 900, y: 900 }),
      shape('target-b', { x: 800, y: 800 }),
      shape('target-c', { x: 700, y: 700 })
    ], snapshot)).toEqual([
      { id: 'target-a', patch: { x: 10, y: 20, endX: 10, endY: 20, rotation: 5, scaleX: 1.5, scaleY: 1.25, opacity: 0.8 } },
      { id: 'target-b', patch: { x: 300, y: 220, endX: 300, endY: 220, rotation: -15, scaleX: 0.75, scaleY: 0.5, opacity: 0.6 } }
    ]);
  });
});
