import { describe, expect, it } from 'vitest';
import { buildSharedRendererPresentationContract } from './sharedRendererPresentationContract';
import { buildSharedRendererPresenterSessionKey } from './sharedRendererPresenterSessionKey';
import type { RustSceneSnapshot } from './rustSceneSnapshot';
import type { SharedRendererPreviewSession } from './sharedRendererPreviewSession';

const emptySnapshot: RustSceneSnapshot = {
  frame_index: 0,
  colour: {
    profile: 'rec709-sdr',
    working_space: 'linear-light',
    alpha: 'premultiplied',
  },
  clips: [],
};

const baseSession = (snapshot: RustSceneSnapshot): SharedRendererPreviewSession => ({
  plan: {
    mode: 'sharedRenderer',
    snapshot,
    media: snapshot.clips.map((clip) => ({
      id: clip.media_id,
      kind: 'SolidColour' as const,
      source: '#ff0000',
      width: 200,
      height: 100,
    })),
  },
  surfaceGate: {
    ok: true,
    canvas: { width: 1920, height: 1080 },
    snapshot,
    media: snapshot.clips.map((clip) => ({
      id: clip.media_id,
      kind: 'SolidColour' as const,
      source: '#ff0000',
      width: 200,
      height: 100,
    })),
  },
  presentationContract: buildSharedRendererPresentationContract(),
});

describe('buildSharedRendererPresenterSessionKey', () => {
  it('changes when scene content changes even if the canvas contract is unchanged', () => {
    const shapeSnapshot: RustSceneSnapshot = {
      ...emptySnapshot,
      clips: [
        {
          clip_id: 'shape-1',
          track_id: 'layer-0',
          media_id: 'shape-1',
          source_frame: 0,
          z_index: 0,
          transform: {
            translation_x: 300,
            translation_y: 120,
            scale_x: 1,
            scale_y: 1,
            rotation_degrees: 0,
            sampling: 'nearest',
          },
          opacity: 1,
          effects: [],
        },
      ],
    };

    expect(buildSharedRendererPresenterSessionKey(baseSession(emptySnapshot))).not.toBe(
      buildSharedRendererPresenterSessionKey(baseSession(shapeSnapshot))
    );
  });

  it('keeps blocked sessions keyed by their blocked reason', () => {
    const session: SharedRendererPreviewSession = {
      ...baseSession(emptySnapshot),
      surfaceGate: {
        ok: false,
        reason: 'planNotComparable',
        detail: 'Shared renderer surface requires a sharedRenderer plan.',
      },
    };

    expect(buildSharedRendererPresenterSessionKey(session)).toBe('blocked:planNotComparable');
  });

  it('can keep playback-only frame changes out of the presenter lifecycle key', () => {
    const firstSnapshot: RustSceneSnapshot = {
      ...emptySnapshot,
      frame_index: 10,
      clips: [
        {
          clip_id: 'video-1',
          track_id: 'layer-0',
          media_id: 'video-1',
          source_frame: 100,
          z_index: 0,
          transform: {
            translation_x: 300,
            translation_y: 120,
            scale_x: 1,
            scale_y: 1,
            rotation_degrees: 0,
            sampling: 'bilinear',
          },
          opacity: 1,
          effects: [],
        },
      ],
    };
    const secondSnapshot: RustSceneSnapshot = {
      ...firstSnapshot,
      frame_index: 11,
      clips: firstSnapshot.clips.map((clip) => ({
        ...clip,
        source_frame: 101,
      })),
    };

    expect(buildSharedRendererPresenterSessionKey(baseSession(firstSnapshot))).not.toBe(
      buildSharedRendererPresenterSessionKey(baseSession(secondSnapshot))
    );
    expect(
      buildSharedRendererPresenterSessionKey(baseSession(firstSnapshot), {
        includePlaybackFrame: false,
      })
    ).toBe(
      buildSharedRendererPresenterSessionKey(baseSession(secondSnapshot), {
        includePlaybackFrame: false,
      })
    );
  });

  it('still changes the reusable playback key when transform or media structure changes', () => {
    const firstSnapshot: RustSceneSnapshot = {
      ...emptySnapshot,
      frame_index: 10,
      clips: [
        {
          clip_id: 'video-1',
          track_id: 'layer-0',
          media_id: 'video-1',
          source_frame: 100,
          z_index: 0,
          transform: {
            translation_x: 300,
            translation_y: 120,
            scale_x: 1,
            scale_y: 1,
            rotation_degrees: 0,
            sampling: 'bilinear',
          },
          opacity: 1,
          effects: [],
        },
      ],
    };
    const movedSnapshot: RustSceneSnapshot = {
      ...firstSnapshot,
      frame_index: 11,
      clips: firstSnapshot.clips.map((clip) => ({
        ...clip,
        source_frame: 101,
        transform: {
          ...clip.transform,
          translation_x: 301,
        },
      })),
    };

    expect(
      buildSharedRendererPresenterSessionKey(baseSession(firstSnapshot), {
        includePlaybackFrame: false,
      })
    ).not.toBe(
      buildSharedRendererPresenterSessionKey(baseSession(movedSnapshot), {
        includePlaybackFrame: false,
      })
    );
  });

  it('keeps animated transform/opacity/effects out of the native-reuse key so the presenter is not restarted every frame', () => {
    const firstSnapshot: RustSceneSnapshot = {
      ...emptySnapshot,
      frame_index: 10,
      clips: [
        {
          clip_id: 'video-1',
          track_id: 'layer-0',
          media_id: 'video-1',
          source_frame: 100,
          z_index: 0,
          transform: {
            translation_x: 300,
            translation_y: 120,
            scale_x: 1,
            scale_y: 1,
            rotation_degrees: 0,
            sampling: 'bilinear',
          },
          opacity: 1,
          effects: [],
        },
      ],
    };
    // Same clip/media structure, but every per-frame animated value differs
    // (fade, position keyframe, effect param) — the native render path bakes
    // these into the Rust-composited frame, so they must not churn the key.
    const animatedSnapshot: RustSceneSnapshot = {
      ...firstSnapshot,
      frame_index: 11,
      clips: firstSnapshot.clips.map((clip) => ({
        ...clip,
        source_frame: 101,
        z_index: 0,
        opacity: 0.5,
        transform: { ...clip.transform, translation_x: 301, rotation_degrees: 4 },
        effects: [{ kind: 'mosaic', strength: 0.3 } as never],
      })),
    };

    const options = { includePlaybackFrame: false, includeAnimatedSceneContent: false } as const;
    expect(buildSharedRendererPresenterSessionKey(baseSession(firstSnapshot), options)).toBe(
      buildSharedRendererPresenterSessionKey(baseSession(animatedSnapshot), options)
    );

    // Structural changes (a different media source) must still rebuild the presenter.
    const restructuredSnapshot: RustSceneSnapshot = {
      ...firstSnapshot,
      clips: firstSnapshot.clips.map((clip) => ({ ...clip, media_id: 'video-2' })),
      // media reference list is keyed off clips in baseSession; force a structural diff
    };
    expect(buildSharedRendererPresenterSessionKey(baseSession(firstSnapshot), options)).not.toBe(
      buildSharedRendererPresenterSessionKey(baseSession(restructuredSnapshot), options)
    );
  });
});
