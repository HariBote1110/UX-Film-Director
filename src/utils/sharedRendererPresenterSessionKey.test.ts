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
    mode: 'parallelCompare',
    primary: 'pixi',
    candidate: 'sharedRenderer',
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
        detail: 'Shared renderer surface requires a parallelCompare plan.',
      },
    };

    expect(buildSharedRendererPresenterSessionKey(session)).toBe('blocked:planNotComparable');
  });
});
