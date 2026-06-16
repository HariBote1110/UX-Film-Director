import { describe, expect, it } from 'vitest';
import { createSharedRendererRustSolidColourVertexSceneBuilder } from './sharedRendererRustSolidColourScene';
import type { RustSceneMediaReference, RustSceneSnapshot } from './rustSceneSnapshot';

const snapshot: RustSceneSnapshot = {
  frame_index: 0,
  colour: {
    profile: 'rec709-sdr',
    working_space: 'linear-light',
    alpha: 'premultiplied',
  },
  clips: [],
};

const media: RustSceneMediaReference[] = [
  {
    id: 'shape-1',
    kind: 'SolidColour',
    source: '#ff0000',
    width: 200,
    height: 100,
  },
];

describe('createSharedRendererRustSolidColourVertexSceneBuilder', () => {
  it('normalises the Rust/WASM solid colour vertex scene result for the WebGPU presenter', () => {
    const builder = createSharedRendererRustSolidColourVertexSceneBuilder({
      build_solid_colour_vertex_scene: (receivedSnapshot, receivedMedia, canvasWidth, canvasHeight) => {
        expect(receivedSnapshot).toBe(snapshot);
        expect(receivedMedia).toBe(media);
        expect(canvasWidth).toBe(1920);
        expect(canvasHeight).toBe(1080);
        return {
          ok: true,
          rect_count: 1,
          vertices: [-0.5, 0.5, 0.25, 0.125, 0, 0.75],
        };
      },
    });

    const result = builder({
      snapshot,
      media,
      canvas: { width: 1920, height: 1080 },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected Rust solid colour scene to pass');
    expect(result.rectCount).toBe(1);
    expect(Array.from(result.vertices)).toEqual([-0.5, 0.5, 0.25, 0.125, 0, 0.75]);
  });

  it('maps Rust/WASM unsupported colour failures into the presenter result contract', () => {
    const builder = createSharedRendererRustSolidColourVertexSceneBuilder({
      build_solid_colour_vertex_scene: () => ({
        ok: false,
        reason: 'unsupportedColourSource',
        detail: 'SolidColour media source must be a #rrggbb hex colour.',
        media_id: 'shape-1',
      }),
    });

    expect(builder({
      snapshot,
      media,
      canvas: { width: 1920, height: 1080 },
    })).toEqual({
      ok: false,
      reason: 'unsupportedColourSource',
      detail: 'SolidColour media source must be a #rrggbb hex colour.',
      mediaId: 'shape-1',
    });
  });
});
