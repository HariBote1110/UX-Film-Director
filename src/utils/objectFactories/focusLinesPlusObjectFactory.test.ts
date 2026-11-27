import { describe, expect, it } from 'vitest';
import { buildAviUtlFocusLinesPlusObject } from './focusLinesPlusObjectFactory';

describe('focusLinesPlusObjectFactory', () => {
  it('builds an AviUtlPackV4 focus lines plus object for timeline insertion', () => {
    const object = buildAviUtlFocusLinesPlusObject({
      id: 'focus-lines-plus-1',
      projectWidth: 1920,
      projectHeight: 1080,
      startTime: 3,
      layer: 23,
    });

    expect(object).toMatchObject({
      id: 'focus-lines-plus-1',
      type: 'focus_lines_plus',
      name: '集中線plus',
      layer: 23,
      startTime: 3,
      duration: 5,
      x: 560,
      y: 315,
      width: 800,
      height: 450,
      rayWidth: 1,
      gap: 5,
      centreRadius: 100,
      rotationDegrees: 0,
      centreX: 400,
      centreY: 225,
      centreJitterPercent: 20,
      seed: 0,
      keyframeInterval: 0,
      lineColour: '#ffffff',
    });
  });
});
