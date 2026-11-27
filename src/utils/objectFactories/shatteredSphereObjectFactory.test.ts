import { describe, expect, it } from 'vitest';
import { buildAviUtlShatteredSphereObject } from './shatteredSphereObjectFactory';

describe('shatteredSphereObjectFactory', () => {
  it('builds a 93 shattered sphere object for timeline insertion', () => {
    const object = buildAviUtlShatteredSphereObject({
      id: 'shattered-sphere-1',
      projectWidth: 1920,
      projectHeight: 1080,
      startTime: 3,
      layer: 27,
    });

    expect(object).toMatchObject({
      id: 'shattered-sphere-1',
      type: 'shattered_sphere',
      name: '93 砕け散る球',
      layer: 27,
      startTime: 3,
      duration: 5,
      x: 780,
      y: 360,
      width: 360,
      height: 360,
      fractureAmount: 100,
      delay: 100,
      radius: 160,
      limitDistance: 150,
      thickness: 20,
      fragmentSize: 40,
      randomShape: 100,
      speed: 100,
      impact: 100,
      gravityX: 0,
      gravityY: 100,
      gravityZ: 0,
      spin: 100,
      directionDiffusion: 100,
      colour: '#ffffff',
      seed: 93,
    });
  });
});
