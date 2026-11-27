import { describe, expect, it } from 'vitest';
import { buildAviUtlSimpleTubeObject, buildAviUtlSimpleTubeTorusObject } from './simpleTubeObjectFactory';

describe('simpleTubeObjectFactory', () => {
  it('builds a 93 SimpleTube generated object for timeline insertion', () => {
    const object = buildAviUtlSimpleTubeObject({
      id: 'simple-tube-1',
      projectWidth: 1920,
      projectHeight: 1080,
      startTime: 6,
      layer: 35,
    });

    expect(object).toMatchObject({
      id: 'simple-tube-1',
      type: 'simple_tube',
      name: '93 SimpleTube',
      layer: 35,
      startTime: 6,
      duration: 5,
      x: 560,
      y: 315,
      width: 800,
      height: 450,
      radius: 150,
      depth: 280,
      segments: 16,
      rings: 10,
      twistDegrees: 0,
      randomAmount: 0,
      strokeWidth: 3,
      colour: '#0e769f',
      secondaryColour: '#ffffff',
      colourPattern: 'single',
      fogStrength: 0,
      fogColour: '#ffffff',
      seed: 93,
      torus: false,
    });
  });

  it('builds a 93 SimpleTube torus generated object for timeline insertion', () => {
    const object = buildAviUtlSimpleTubeTorusObject({
      id: 'simple-tube-torus-1',
      projectWidth: 1920,
      projectHeight: 1080,
      startTime: 7,
      layer: 36,
    });

    expect(object).toMatchObject({
      id: 'simple-tube-torus-1',
      type: 'simple_tube',
      name: '93 SimpleTube トーラス',
      layer: 36,
      startTime: 7,
      width: 800,
      height: 450,
      radius: 170,
      depth: 260,
      segments: 24,
      rings: 16,
      twistDegrees: 120,
      randomAmount: 0,
      strokeWidth: 3,
      colour: '#0e769f',
      secondaryColour: '#f9f9f9',
      colourPattern: 'ring',
      fogStrength: 0.35,
      fogColour: '#ffffff',
      seed: 93,
      torus: true,
    });
  });
});
