import { describe, expect, it } from 'vitest';
import { buildAviUtlCircularArrowObject } from './circularArrowObjectFactory';

describe('circularArrowObjectFactory', () => {
  it('builds an AviUtlPackV4 circular arrow object for timeline insertion', () => {
    const object = buildAviUtlCircularArrowObject({
      id: 'circular-arrow-1',
      projectWidth: 1920,
      projectHeight: 1080,
      startTime: 2.25,
      layer: 16,
    });

    expect(object).toMatchObject({
      id: 'circular-arrow-1',
      type: 'circular_arrow',
      name: '円矢印',
      layer: 16,
      startTime: 2.25,
      duration: 5,
      x: 860,
      y: 440,
      width: 200,
      height: 200,
      radius: 100,
      lineWidth: 20,
      headSize: 50,
      angleDegrees: 260,
      centreAngleDegrees: 0,
      headShape: 'triangle',
      showTailHead: false,
      flipVertical: false,
      flipHorizontal: false,
      arrowColour: '#ffff00',
    });
  });
});
