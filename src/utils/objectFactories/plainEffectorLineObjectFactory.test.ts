import { describe, expect, it } from 'vitest';
import { buildAviUtlPlainEffectorLineObject } from './plainEffectorLineObjectFactory';

describe('plainEffectorLineObjectFactory', () => {
  it('builds a 93 PlainEffector Line object for timeline insertion', () => {
    const object = buildAviUtlPlainEffectorLineObject({
      id: 'plain-effector-line-1',
      projectWidth: 1920,
      projectHeight: 1080,
      startTime: 3,
      layer: 26,
    });

    expect(object).toMatchObject({
      id: 'plain-effector-line-1',
      type: 'plain_effector_line',
      name: '93 PlainEffector Line',
      layer: 26,
      startTime: 3,
      duration: 5,
      x: 560,
      y: 315,
      width: 800,
      height: 450,
      radius: 100,
      strength: 1,
      randomness: 0,
      zoom: 1,
      invert: false,
      lineCount: 24,
      lineWidth: 2,
      colour: '#f74d52',
      colourAmount: 1,
      seed: 93,
    });
  });
});
