import { describe, expect, it } from 'vitest';
import { buildSharedRendererVideoMediaReadiness } from './sharedRendererVideoMediaReadiness';
import type { RustSceneMediaReference } from './rustSceneSnapshot';

const media: RustSceneMediaReference[] = [
  {
    id: 'video-ready',
    kind: 'Video',
    source: 'blob:ready',
    width: 1280,
    height: 720,
  },
  {
    id: 'video-pending',
    kind: 'Video',
    source: 'blob:pending',
    width: 640,
    height: 360,
  },
  {
    id: 'image-ignored',
    kind: 'Image',
    source: '/tmp/image.png',
    width: 100,
    height: 100,
  },
];

describe('buildSharedRendererVideoMediaReadiness', () => {
  it('reports video media as Rust/shared renderer required without DOM element readiness', () => {
    expect(buildSharedRendererVideoMediaReadiness({
      media,
    })).toEqual({
      readyCount: 0,
      pendingCount: 0,
      missingCount: 0,
      rustRequiredCount: 2,
      videos: [
        {
          id: 'video-ready',
          status: 'rustRendererRequired',
          readyState: 0,
          currentTime: 0,
          width: 1280,
          height: 720,
        },
        {
          id: 'video-pending',
          status: 'rustRendererRequired',
          readyState: 0,
          currentTime: 0,
          width: 640,
          height: 360,
        },
      ],
    });
  });

  it('does not expose HTMLVideoElement readiness inputs in the diagnostic source', () => {
    expect(buildSharedRendererVideoMediaReadiness.toString()).not.toContain('videoElements');
    expect(buildSharedRendererVideoMediaReadiness.toString()).not.toContain('HTMLVideoElement');
  });
});
