import { describe, expect, it } from 'vitest';
import { buildGetColorDiamondDotFieldObject, buildGetColorDotFieldObject, buildGetColorOutlinedSquareDotFieldObject, buildGetColorSampledDotFieldObject } from './getColorDotFieldObjectFactory';

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

  it('builds a GetColor V2R diamond dot field object for the figure preset', () => {
    const object = buildGetColorDiamondDotFieldObject({
      id: 'getcolor-diamond-dot-field-1',
      projectWidth: 1920,
      projectHeight: 1080,
      startTime: 2,
      layer: 30,
    });

    expect(object).toMatchObject({
      id: 'getcolor-diamond-dot-field-1',
      type: 'getcolor_dot_field',
      name: 'GetColor V2R 菱形ドットフィールド',
      layer: 30,
      startTime: 2,
      duration: 5,
      x: 560,
      y: 315,
      width: 800,
      height: 450,
      columns: 32,
      rows: 18,
      dotSize: 18,
      dotShape: 'diamond',
      strokeWidth: 0,
      foregroundColour: '#ffffff',
      secondaryColour: '#36c2ff',
      backgroundColour: '#000000',
      seed: 93,
    });
  });

  it('builds a GetColor V2R outlined square dot field object for the line width preset', () => {
    const object = buildGetColorOutlinedSquareDotFieldObject({
      id: 'getcolor-outlined-square-dot-field-1',
      projectWidth: 1920,
      projectHeight: 1080,
      startTime: 2.5,
      layer: 31,
    });

    expect(object).toMatchObject({
      id: 'getcolor-outlined-square-dot-field-1',
      type: 'getcolor_dot_field',
      name: 'GetColor V2R 枠線四角ドットフィールド',
      layer: 31,
      startTime: 2.5,
      duration: 5,
      x: 560,
      y: 315,
      width: 800,
      height: 450,
      columns: 28,
      rows: 16,
      dotSize: 22,
      dotShape: 'square',
      strokeWidth: 5,
      foregroundColour: '#ffffff',
      secondaryColour: '#36c2ff',
      backgroundColour: '#000000',
      seed: 93,
    });
  });

  it('builds a GetColor V2R sampled dot field object for image colour pickup', () => {
    const object = buildGetColorSampledDotFieldObject({
      id: 'getcolor-sampled-dot-field-1',
      projectWidth: 1920,
      projectHeight: 1080,
      startTime: 3,
      layer: 32,
      sampleSourcePath: '/tmp/source-colours.png',
    });

    expect(object).toMatchObject({
      id: 'getcolor-sampled-dot-field-1',
      type: 'getcolor_dot_field',
      name: 'GetColor V2R 画像サンプリングドット',
      layer: 32,
      startTime: 3,
      duration: 5,
      x: 560,
      y: 315,
      width: 800,
      height: 450,
      columns: 32,
      rows: 18,
      dotSize: 16,
      dotShape: 'circle',
      strokeWidth: 0,
      sampleSourcePath: '/tmp/source-colours.png',
      sampleStrength: 1,
      foregroundColour: '#ffffff',
      secondaryColour: '#36c2ff',
      backgroundColour: '#000000',
      seed: 93,
    });
  });
});
