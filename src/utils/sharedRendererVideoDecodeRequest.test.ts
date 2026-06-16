import { describe, expect, it } from 'vitest';
import { buildSharedRendererVideoFrameDecodeRequests } from './sharedRendererVideoDecodeRequest';
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
    source_rate: {
      numerator: 60,
      denominator: 1,
    },
  },
];

describe('buildSharedRendererVideoFrameDecodeRequests', () => {
  it('builds frame-indexed video decode requests without frame bytes', () => {
    expect(buildSharedRendererVideoFrameDecodeRequests({
      snapshot,
      media,
    })).toEqual({
      ok: true,
      requestCount: 1,
      requests: [
        {
          clipId: 'video-1',
          mediaId: 'video-1',
          source: '/tmp/video.mp4',
          sourceFrame: 90,
          sourceRate: {
            numerator: 60,
            denominator: 1,
          },
          timelineFrame: 210,
          width: 1280,
          height: 720,
          format: 'rgba8Srgb',
          colour: 'rec709SrgbFullRange',
        },
      ],
    });
  });
});
