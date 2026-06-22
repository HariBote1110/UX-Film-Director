import { describe, expect, it } from 'vitest';
import type { TimelineObject } from '../../types';
import { extractAviUtlBackgroundColourPalette } from './aviutlBackgroundColourEyedropper';

const baseObject = {
  groupId: undefined,
  layer: 1,
  startTime: 0,
  duration: 5,
  x: 0,
  y: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  enableAnimation: false,
  endX: 0,
  endY: 0,
  easing: 'linear' as const
};

describe('93 背景色スポイト palette extraction', () => {
  it('extracts a de-duplicated colour table from visible timeline objects', () => {
    const objects = [
      {
        ...baseObject,
        id: 'shape-1',
        type: 'shape',
        name: 'Shape fill',
        fill: '#FFAA00',
        width: 120,
        height: 90,
        shapeType: 'rect'
      },
      {
        ...baseObject,
        id: 'getcolor-1',
        type: 'getcolor_dot_field',
        name: 'GetColor source',
        foregroundColour: '#ffaa00',
        secondaryColour: 'rgb(16, 32, 48)',
        backgroundColour: '#102030',
        width: 320,
        height: 180,
        columns: 8,
        rows: 6,
        dotSize: 8,
        sizeInfluence: 1,
        luminanceInfluence: 1,
        hueShiftDegrees: 0,
        alternateRows: false,
        seed: 93
      },
      {
        ...baseObject,
        id: 'field-1',
        type: 'spherical_field',
        name: 'SPfield colours',
        fieldColour: '#44CCFF',
        secondaryColour: '#0f172a',
        width: 320,
        height: 240,
        radius: 120,
        strength: 1,
        colourAmount: 1,
        alphaAmount: 1,
        lineWidth: 2,
        ringCount: 5,
        vectorCount: 12,
        backgroundOpacity: 0.35,
        container: false,
        seed: 7
      }
    ] as TimelineObject[];

    expect(extractAviUtlBackgroundColourPalette(objects, { maxColours: 4 })).toEqual([
      { colour: '#ffaa00', sourceObjectId: 'shape-1', sourceField: 'fill' },
      { colour: '#102030', sourceObjectId: 'getcolor-1', sourceField: 'secondaryColour' },
      { colour: '#44ccff', sourceObjectId: 'field-1', sourceField: 'fieldColour' },
      { colour: '#0f172a', sourceObjectId: 'field-1', sourceField: 'secondaryColour' }
    ]);
  });

  it('uses fallback colours when the timeline has no usable colour fields', () => {
    const objects = [
      {
        ...baseObject,
        id: 'image-1',
        type: 'image',
        name: 'Image without sampled pixels',
        src: 'blob:test',
        width: 64,
        height: 64
      }
    ] as TimelineObject[];

    expect(extractAviUtlBackgroundColourPalette(objects, {
      fallbackColours: ['#123456', 'rgb(1, 2, 3)']
    })).toEqual([
      { colour: '#123456', sourceObjectId: null, sourceField: 'fallbackColours' },
      { colour: '#010203', sourceObjectId: null, sourceField: 'fallbackColours' }
    ]);
  });
});
