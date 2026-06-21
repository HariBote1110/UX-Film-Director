import { describe, expect, it } from 'vitest';
import { buildAviUtlProtractorObject } from './protractorObjectFactory';

describe('protractorObjectFactory', () => {
  it('builds an AviUtlPackV4 protractor object for timeline insertion', () => {
    const object = buildAviUtlProtractorObject({
      id: 'protractor-1',
      projectWidth: 1920,
      projectHeight: 1080,
      startTime: 3,
      layer: 24,
    });

    expect(object).toMatchObject({
      id: 'protractor-1',
      type: 'protractor',
      name: '分度器',
      layer: 24,
      startTime: 3,
      duration: 5,
      x: 750,
      y: 420,
      width: 420,
      height: 240,
      radius: 180,
      measuredAngleDegrees: 90,
      tickStepDegrees: 10,
      majorTickStepDegrees: 30,
      decimalPlaces: 1,
      lineColour: '#ffffff',
      textColour: '#ffffff',
      shadowColour: '#000000',
    });
  });
});
