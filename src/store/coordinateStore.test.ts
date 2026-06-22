import { beforeEach, describe, expect, it } from 'vitest';
import type { ShapeObject } from '../types';
import { useStore } from './useStore';

const shape = (id: string, x: number, y: number): ShapeObject => ({
  id,
  type: 'shape',
  name: id,
  layer: 1,
  startTime: 0,
  duration: 5,
  x,
  y,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  enableAnimation: false,
  endX: x,
  endY: y,
  easing: 'linear',
  shapeType: 'rect',
  width: 80,
  height: 60,
  fill: '#ffffff'
});

describe('93 coordinate store actions', () => {
  beforeEach(() => {
    useStore.getState().initializeProject({
      width: 1920,
      height: 1080,
      fps: 60,
      sampleRate: 48_000,
    });
  });

  it('captures selected coordinates and reapplies them to another selection by order', () => {
    useStore.getState().addObject(shape('source-a', 100, 120));
    useStore.getState().addObject(shape('source-b', 220, 260));
    useStore.getState().selectObjects(['source-a', 'source-b'], 'source-a');

    useStore.getState().captureSelectedCoordinatesWithAviUtlStore('poseA');

    useStore.getState().addObject(shape('target-a', 700, 720));
    useStore.getState().addObject(shape('target-b', 820, 860));
    useStore.getState().selectObjects(['target-a', 'target-b'], 'target-a');

    useStore.getState().applyAviUtlStoredCoordinatesToSelection();

    expect(useStore.getState().aviUtlCoordinateStoreSnapshot?.name).toBe('poseA');
    expect(useStore.getState().objects.filter((object) => object.id.startsWith('target')).map((object) => ({
      id: object.id,
      x: object.x,
      y: object.y,
      endX: object.endX,
      endY: object.endY
    }))).toEqual([
      { id: 'target-a', x: 100, y: 120, endX: 100, endY: 120 },
      { id: 'target-b', x: 220, y: 260, endX: 220, endY: 260 }
    ]);
  });
});
