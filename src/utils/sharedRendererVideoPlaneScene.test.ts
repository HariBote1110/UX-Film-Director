import { describe, expect, it } from 'vitest';
import { buildSharedRendererVideoPlaneVertexScene } from './sharedRendererVideoPlaneScene';
import type { RustSceneMediaReference, RustSceneSnapshot } from './rustSceneSnapshot';

const snapshot: RustSceneSnapshot = {
  frame_index: 210,
  colour: {
    profile: 'rec709-sdr',
    working_space: 'linear-light',
    alpha: 'premultiplied',
  },
  clips: [
    {
      clip_id: 'shape-1',
      track_id: 'layer-0',
      media_id: 'shape-1',
      source_frame: 0,
      z_index: 0,
      transform: {
        translation_x: 0,
        translation_y: 0,
        scale_x: 1,
        scale_y: 1,
        rotation_degrees: 0,
        sampling: 'nearest',
      },
      opacity: 1,
      effects: [],
    },
    {
      clip_id: 'video-1',
      track_id: 'layer-1',
      media_id: 'video-1',
      source_frame: 90,
      z_index: 1,
      transform: {
        translation_x: 10,
        translation_y: 20,
        scale_x: 1,
        scale_y: 1,
        rotation_degrees: 0,
        sampling: 'bilinear',
      },
      opacity: 0.75,
      effects: [],
    },
  ],
};

const media: RustSceneMediaReference[] = [
  {
    id: 'shape-1',
    kind: 'SolidColour',
    source: '#ff0000',
    width: 200,
    height: 100,
  },
  {
    id: 'video-1',
    kind: 'Video',
    source: '/tmp/video.mp4',
    width: 1280,
    height: 720,
  },
];

describe('buildSharedRendererVideoPlaneVertexScene', () => {
  it('builds video plane metadata and vertices from Video media only', () => {
    const result = buildSharedRendererVideoPlaneVertexScene({
      snapshot,
      media,
      canvas: { width: 1920, height: 1080 },
    });

    expect(result).toEqual({
      ok: true,
      planeCount: 1,
      planes: [
        {
          clipId: 'video-1',
          mediaId: 'video-1',
          sourceFrame: 90,
          zIndex: 1,
          opacity: 0.75,
        },
      ],
      vertices: expect.any(Float32Array),
    });
    expect(Array.from(result.ok ? result.vertices.slice(0, 8) : [])).toEqual([
      -0.9895833134651184,
      0.9629629850387573,
      0,
      0,
      0.75,
      1,
      0,
      1,
    ]);
  });
});
