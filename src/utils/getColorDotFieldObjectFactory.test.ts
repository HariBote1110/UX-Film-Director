import { describe, expect, it } from 'vitest';
import { buildGetColorDotFieldObject } from './getColorDotFieldObjectFactory';

describe('getColorDotFieldObjectFactory', () => {
  it('builds a GetColor V2R dot field object for timeline insertion', () => {
    const object = buildGetColorDotFieldObject({
      id: 'getcolor-dot-field-1',
      projectWidth: 1920,
      projectHeight: 1080,
      startTime: 1.5,
      layer: 29,
    });

    expect(object).toMatchObject({
      id: 'getcolor-dot-field-1',
      type: 'getcolor_dot_field',
      name: 'GetColor V2R ドットフィールド',
      layer: 29,
      startTime: 1.5,
      duration: 5,
      x: 560,
      y: 315,
      width: 800,
      height: 450,
      columns: 32,
      rows: 18,
      dotSize: 14,
      sizeInfluence: 0.65,
      luminanceInfluence: 0.7,
      hueShiftDegrees: 0,
      alternateRows: true,
      foregroundColour: '#ffffff',
      secondaryColour: '#36c2ff',
      backgroundColour: '#000000',
      seed: 93,
    });
  });
});
