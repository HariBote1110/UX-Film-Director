import { beforeEach, describe, expect, it } from 'vitest';
import type { ShapeObject } from '../types';
import { useStore } from './useStore';

const shape = (id: string): ShapeObject => ({
  id,
  type: 'shape',
  name: 'Copy Source',
  layer: 1,
  startTime: 2,
  duration: 3,
  x: 200,
  y: 180,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  enableAnimation: false,
  endX: 200,
  endY: 180,
  easing: 'linear',
  shapeType: 'rect',
  width: 120,
  height: 80,
  fill: '#ffffff'
});

describe('ObjectCopyEXT store action', () => {
  beforeEach(() => {
    useStore.getState().initializeProject({
      width: 1920,
      height: 1080,
      fps: 60,
      sampleRate: 48_000,
    });
  });

  it('adds three 93 ObjectCopyEXT clone-strip copies for the selected object', () => {
    useStore.getState().addObject(shape('source-1'));
    useStore.getState().selectObject('source-1');

    useStore.getState().duplicateSelectedObjectsWithObjectCopyExt();

    const objects = useStore.getState().objects;
    expect(objects).toHaveLength(4);
    expect(objects.slice(1).map((object) => ({
      name: object.name,
      layer: object.layer,
      startTime: object.startTime,
      x: object.x,
      y: object.y
    }))).toEqual([
      { name: 'Copy Source ObjectCopyEXT 1', layer: 2, startTime: 2.1, x: 216, y: 196 },
      { name: 'Copy Source ObjectCopyEXT 2', layer: 3, startTime: 2.2, x: 232, y: 212 },
      { name: 'Copy Source ObjectCopyEXT 3', layer: 4, startTime: 2.3, x: 248, y: 228 }
    ]);
    expect(useStore.getState().selectedIds).toEqual(objects.slice(1).map((object) => object.id));
  });
});
