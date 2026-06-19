import { describe, expect, it } from 'vitest';
import {
  createSharedRendererRustVideoPlaneVertexSceneBuilder,
  loadSharedRendererRustVideoPlaneVertexSceneBuilder,
} from './sharedRendererRustVideoPlaneScene';
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
  },
];

describe('createSharedRendererRustVideoPlaneVertexSceneBuilder', () => {
  it('normalises the Rust/WASM video plane vertex scene result', () => {
    const builder = createSharedRendererRustVideoPlaneVertexSceneBuilder({
      build_video_plane_vertex_scene: (receivedSnapshot, receivedMedia, canvasWidth, canvasHeight) => {
        expect(receivedSnapshot).toBe(snapshot);
        expect(receivedMedia).toBe(media);
        expect(canvasWidth).toBe(1920);
        expect(canvasHeight).toBe(1080);
        return {
          ok: true,
          plane_count: 1,
          planes: [{
            clip_id: 'video-1',
            media_id: 'video-1',
            source_frame: 90,
            z_index: 1,
            opacity: 0.75,
          }],
          vertices: [-0.5, 0.5, 0, 0, 0.75, 1, 0, 1],
        };
      },
    });

    const result = builder({
      snapshot,
      media,
      canvas: { width: 1920, height: 1080 },
    });

    expect(result).toEqual({
      ok: true,
      planeCount: 1,
      planes: [{
        clipId: 'video-1',
        mediaId: 'video-1',
        sourceFrame: 90,
        zIndex: 1,
        opacity: 0.75,
      }],
      vertices: expect.any(Float32Array),
    });
    expect(Array.from(result.vertices)).toEqual([-0.5, 0.5, 0, 0, 0.75, 1, 0, 1]);
  });

  it('loads and initialises the Rust/WASM module before returning a video vertex scene builder', async () => {
    let initCount = 0;
    const builder = await loadSharedRendererRustVideoPlaneVertexSceneBuilder({
      importWasmModule: async () => ({
        default: async () => {
          initCount += 1;
        },
        build_video_plane_vertex_scene: () => ({
          ok: true,
          plane_count: 0,
          planes: [],
          vertices: [],
        }),
      }),
    });

    expect(initCount).toBe(1);
    expect(builder).not.toBeNull();
    if (!builder) throw new Error('expected Rust video builder to load');

    expect(builder({
      snapshot,
      media,
      canvas: { width: 1920, height: 1080 },
    })).toEqual({
      ok: true,
      planeCount: 0,
      planes: [],
      vertices: new Float32Array(),
    });
  });

  it('does not describe TypeScript fallback when the Rust video plane control is required', async () => {
    const warnings: string[] = [];

    const builder = await loadSharedRendererRustVideoPlaneVertexSceneBuilder({
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
      'Rust/WASM video plane scene builder could not be loaded; Rust video control plane is required.',
    ]);
    expect(warnings[0]).not.toContain('falling back to TypeScript');
  });
});
