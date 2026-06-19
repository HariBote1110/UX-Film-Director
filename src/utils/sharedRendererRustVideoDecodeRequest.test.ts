import { describe, expect, it } from 'vitest';
import {
  createSharedRendererRustVideoFrameDecodeRequestBuilder,
  loadSharedRendererRustVideoFrameDecodeRequestBuilder,
} from './sharedRendererRustVideoDecodeRequest';
import type { RustSceneMediaReference, RustSceneSnapshot } from './rustSceneSnapshot';

const snapshot: RustSceneSnapshot = {
  frame_index: 210,
  colour: {
    profile: 'rec709-sdr',
    working_space: 'linear-light',
    alpha: 'premultiplied',
  },
  clips: [],
};

const media: RustSceneMediaReference[] = [
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

describe('createSharedRendererRustVideoFrameDecodeRequestBuilder', () => {
  it('normalises the Rust/WASM video frame decode request set', () => {
    const builder = createSharedRendererRustVideoFrameDecodeRequestBuilder({
      build_video_frame_decode_requests: (receivedSnapshot, receivedMedia) => {
        expect(receivedSnapshot).toBe(snapshot);
        expect(receivedMedia).toBe(media);
        return {
          ok: true,
          request_count: 1,
          requests: [{
            clip_id: 'video-1',
            media_id: 'video-1',
            source: '/tmp/video.mp4',
            source_frame: 90,
            source_rate: {
              numerator: 60,
              denominator: 1,
            },
            timeline_frame: 210,
            width: 1280,
            height: 720,
            format: 'rgba8Srgb',
            colour: 'rec709SrgbFullRange',
          }],
        };
      },
    });

    expect(builder({ snapshot, media })).toEqual({
      ok: true,
      requestCount: 1,
      requests: [{
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
      }],
    });
  });

  it('loads and initialises the Rust/WASM module before returning a decode request builder', async () => {
    let initCount = 0;
    const builder = await loadSharedRendererRustVideoFrameDecodeRequestBuilder({
      importWasmModule: async () => ({
        default: async () => {
          initCount += 1;
        },
        build_video_frame_decode_requests: () => ({
          ok: true,
          request_count: 0,
          requests: [],
        }),
      }),
    });

    expect(initCount).toBe(1);
    expect(builder).not.toBeNull();
    if (!builder) throw new Error('expected Rust video decode request builder to load');

    expect(builder({ snapshot, media })).toEqual({
      ok: true,
      requestCount: 0,
      requests: [],
    });
  });

  it('does not describe TypeScript fallback when the Rust control plane is required', async () => {
    const warnings: string[] = [];

    const builder = await loadSharedRendererRustVideoFrameDecodeRequestBuilder({
      fallbackAllowed: false,
      importWasmModule: async () => {
        throw new Error('missing wasm');
      },
      warn: (message) => {
        warnings.push(message);
      },
    });

    expect(builder).toBeNull();
    expect(warnings).toEqual([
      'Rust/WASM video frame decode request builder could not be loaded; Rust video control plane is required.',
    ]);
    expect(warnings[0]).not.toContain('falling back to TypeScript');
  });
});
