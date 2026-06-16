import { describe, expect, it } from 'vitest';
import { buildSharedRendererVideoOwnership } from './sharedRendererVideoOwnership';

describe('buildSharedRendererVideoOwnership', () => {
  it('keeps Pixi as the video owner until the Rust decoded frame upload path is ready', () => {
    expect(buildSharedRendererVideoOwnership({
      cutoverEnabled: true,
      hasVideoScene: true,
      videoDecodeRequestSource: 'rust-wasm',
      videoDecodeRequestResult: {
        ok: true,
        requestCount: 1,
        requests: [{
          clipId: 'video-1',
          mediaId: 'video-1',
          source: '/tmp/video.mp4',
          sourceFrame: 90,
          sourceRate: { numerator: 60, denominator: 1 },
          timelineFrame: 12,
          width: 1280,
          height: 720,
          format: 'rgba8Srgb',
          colour: 'rec709SrgbFullRange',
        }],
      },
      videoFrameUploadReady: false,
    })).toEqual({
      owner: 'pixi',
      reason: 'videoFrameUploadUnavailable',
      videoObjectIds: [],
    });
  });

  it('hands video ownership to the shared renderer only for Rust decode requests with ready frame upload', () => {
    expect(buildSharedRendererVideoOwnership({
      cutoverEnabled: true,
      hasVideoScene: true,
      videoDecodeRequestSource: 'rust-wasm',
      videoDecodeRequestResult: {
        ok: true,
        requestCount: 2,
        requests: [
          {
            clipId: 'video-back',
            mediaId: 'video-back',
            source: '/tmp/back.mp4',
            sourceFrame: 12,
            sourceRate: { numerator: 30, denominator: 1 },
            timelineFrame: 24,
            width: 1280,
            height: 720,
            format: 'rgba8Srgb',
            colour: 'rec709SrgbFullRange',
          },
          {
            clipId: 'video-front',
            mediaId: 'video-front',
            source: '/tmp/front.mp4',
            sourceFrame: 18,
            sourceRate: { numerator: 30, denominator: 1 },
            timelineFrame: 24,
            width: 1280,
            height: 720,
            format: 'rgba8Srgb',
            colour: 'rec709SrgbFullRange',
          },
        ],
      },
      videoFrameUploadReady: true,
    })).toEqual({
      owner: 'sharedRenderer',
      reason: 'rustDecodedFrameUploadReady',
      videoObjectIds: ['video-back', 'video-front'],
    });
  });

  it('keeps Pixi as owner when the video decode request path falls back to TypeScript', () => {
    expect(buildSharedRendererVideoOwnership({
      cutoverEnabled: true,
      hasVideoScene: true,
      videoDecodeRequestSource: 'typescript',
      videoDecodeRequestResult: {
        ok: true,
        requestCount: 0,
        requests: [],
      },
      videoFrameUploadReady: true,
    })).toMatchObject({
      owner: 'pixi',
      reason: 'rustDecodeRequestUnavailable',
    });
  });
});
