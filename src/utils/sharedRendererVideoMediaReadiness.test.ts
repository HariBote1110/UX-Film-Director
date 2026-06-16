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
  it('reports ready video elements with current frame data', () => {
    const readiness = buildSharedRendererVideoMediaReadiness({
      media,
      videoElements: new Map([
        ['video-ready', fakeVideo({ readyState: 2, videoWidth: 1280, videoHeight: 720, currentTime: 1.25 })],
        ['video-pending', fakeVideo({ readyState: 1, videoWidth: 640, videoHeight: 360, currentTime: 0 })],
      ]),
    });

    expect(readiness).toEqual({
      readyCount: 1,
      pendingCount: 1,
      missingCount: 0,
      videos: [
        {
          id: 'video-ready',
          status: 'ready',
          readyState: 2,
          currentTime: 1.25,
          width: 1280,
          height: 720,
        },
        {
          id: 'video-pending',
          status: 'pending',
          readyState: 1,
          currentTime: 0,
          width: 640,
          height: 360,
        },
      ],
    });
  });

  it('reports missing video elements before the preview loader has created them', () => {
    expect(buildSharedRendererVideoMediaReadiness({
      media,
      videoElements: new Map(),
    })).toEqual({
      readyCount: 0,
      pendingCount: 0,
      missingCount: 2,
      videos: [
        {
          id: 'video-ready',
          status: 'missingElement',
          readyState: 0,
          currentTime: 0,
          width: 1280,
          height: 720,
        },
        {
          id: 'video-pending',
          status: 'missingElement',
          readyState: 0,
          currentTime: 0,
          width: 640,
          height: 360,
        },
      ],
    });
  });
});

const fakeVideo = ({
  readyState,
  videoWidth,
  videoHeight,
  currentTime,
}: {
  readyState: number;
  videoWidth: number;
  videoHeight: number;
  currentTime: number;
}) => ({
  readyState,
  videoWidth,
  videoHeight,
  currentTime,
}) as HTMLVideoElement;
