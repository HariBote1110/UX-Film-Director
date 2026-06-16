import { describe, expect, it } from 'vitest';
import {
  buildSharedRendererSolidColourDrawList,
  parseSharedRendererSolidColour,
} from './sharedRendererSolidColourScene';
import type { RustSceneMediaReference, RustSceneSnapshot } from './rustSceneSnapshot';

const snapshot: RustSceneSnapshot = {
  frame_index: 0,
  colour: {
    profile: 'rec709-sdr',
    working_space: 'linear-light',
    alpha: 'premultiplied',
  },
  clips: [
    {
      clip_id: 'image-1',
      track_id: 'layer-0',
      media_id: 'image-1',
      source_frame: 0,
      z_index: 0,
      transform: {
        translation_x: 0,
        translation_y: 0,
        scale_x: 1,
        scale_y: 1,
        rotation_degrees: 0,
        sampling: 'bilinear',
      },
      opacity: 1,
      effects: [],
    },
    {
      clip_id: 'shape-1',
      track_id: 'layer-1',
      media_id: 'shape-1',
      source_frame: 0,
      z_index: 1,
      transform: {
        translation_x: 300,
        translation_y: 120,
        scale_x: 1,
        scale_y: 1,
        rotation_degrees: 0,
        sampling: 'nearest',
      },
      opacity: 0.5,
      effects: [],
    },
  ],
};

const media: RustSceneMediaReference[] = [
  {
    id: 'image-1',
    kind: 'Image',
    source: '/tmp/image.png',
    width: 640,
    height: 360,
  },
  {
    id: 'shape-1',
    kind: 'SolidColour',
    source: '#ff0000',
    width: 200,
    height: 100,
  },
];

describe('shared renderer solid colour scene', () => {
  it('parses hex colours into normalised sRGB values', () => {
    expect(parseSharedRendererSolidColour('#3366cc')).toEqual({
      ok: true,
      colour: {
        red: 0.2,
        green: 0.4,
        blue: 0.8,
        alpha: 1,
      },
    });
  });

  it('builds premultiplied rectangle draw commands from SolidColour media only', () => {
    expect(buildSharedRendererSolidColourDrawList({
      snapshot,
      media,
      canvas: { width: 1920, height: 1080 },
    })).toEqual({
      ok: true,
      rects: [
        {
          clipId: 'shape-1',
          zIndex: 1,
          x: 300,
          y: 120,
          width: 200,
          height: 100,
          colour: {
            red: 0.5,
            green: 0,
            blue: 0,
            alpha: 0.5,
          },
        },
      ],
    });
  });

  it('fails loud for invalid solid colour sources', () => {
    expect(parseSharedRendererSolidColour('red')).toEqual({
      ok: false,
      reason: 'unsupportedColourSource',
      detail: 'SolidColour media source must be a #rrggbb hex colour.',
    });
  });
});
