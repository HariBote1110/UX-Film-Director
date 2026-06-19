import { describe, expect, it } from 'vitest';
import {
  buildSharedRendererSolidColourOwnership,
  buildSharedRendererSolidColourStackSafety,
} from './sharedRendererSolidColourOwnership';
import type { RustSceneMediaReference, RustSceneSnapshot } from './rustSceneSnapshot';

const snapshot: RustSceneSnapshot = {
  frame_index: 12,
  colour: {
    profile: 'rec709-sdr',
    working_space: 'linear-light',
    alpha: 'premultiplied',
  },
  clips: [
    {
      clip_id: 'shape-back',
      track_id: 'layer-0',
      media_id: 'shape-back',
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
      clip_id: 'image-front',
      track_id: 'layer-1',
      media_id: 'image-front',
      source_frame: 0,
      z_index: 1,
      transform: {
        translation_x: 0,
        translation_y: 0,
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

const media: RustSceneMediaReference[] = [
  {
    id: 'shape-back',
    kind: 'SolidColour',
    source: '#ff0000',
    width: 200,
    height: 100,
  },
  {
    id: 'image-front',
    kind: 'Image',
    source: '/tmp/image.png',
    width: 640,
    height: 360,
  },
];

describe('buildSharedRendererSolidColourStackSafety', () => {
  it('blocks SolidColour cutover when a Pixi-only plane is above it', () => {
    expect(buildSharedRendererSolidColourStackSafety({
      snapshot,
      media,
      candidateSolidColourObjectIds: ['shape-back'],
      sharedRendererVideoObjectIds: [],
    })).toEqual({
      safeSolidColourObjectIds: [],
      blockedSolidColourObjectIds: [{
        solidColourObjectId: 'shape-back',
        blockingObjectId: 'image-front',
        blockingKind: 'Image',
        reason: 'pixiOnlyObjectAboveSolidColour',
      }],
    });
  });

  it('allows SolidColour cutover when Pixi-only planes are behind it', () => {
    expect(buildSharedRendererSolidColourStackSafety({
      snapshot: {
        ...snapshot,
        clips: snapshot.clips.map((clip) => (
          clip.clip_id === 'image-front'
            ? { ...clip, z_index: -1 }
            : clip
        )),
      },
      media,
      candidateSolidColourObjectIds: ['shape-back'],
      sharedRendererVideoObjectIds: [],
    })).toMatchObject({
      safeSolidColourObjectIds: ['shape-back'],
      blockedSolidColourObjectIds: [],
    });
  });
});

describe('buildSharedRendererSolidColourOwnership', () => {
  it('hands ownership to the shared renderer when a Rust native rendered frame already contains the solid colour scene', () => {
    expect(buildSharedRendererSolidColourOwnership({
      cutoverEnabled: false,
      hasSolidColourScene: true,
      geometrySource: undefined,
      solidColourObjectIds: ['shape-native'],
      nativeRenderFrameReady: true,
      nativeRenderSolidColourObjectIds: ['shape-native'],
    })).toEqual({
      owner: 'sharedRenderer',
      reason: 'nativeRenderFrameReady',
      solidColourObjectIds: ['shape-native'],
    });
  });

  it('hands ownership to the shared renderer only for Rust/WASM solid colour geometry', () => {
    expect(buildSharedRendererSolidColourOwnership({
      cutoverEnabled: true,
      hasSolidColourScene: true,
      geometrySource: 'rust-wasm',
      solidColourObjectIds: ['shape-1'],
      stackSafeSolidColourObjectIds: new Set(['shape-1']),
    })).toEqual({
      owner: 'sharedRenderer',
      reason: 'rustSolidColourReady',
      solidColourObjectIds: ['shape-1'],
    });
  });

  it('keeps Pixi as owner when SolidColour geometry falls back to TypeScript', () => {
    expect(buildSharedRendererSolidColourOwnership({
      cutoverEnabled: true,
      hasSolidColourScene: true,
      geometrySource: 'typescript',
      solidColourObjectIds: ['shape-1'],
      stackSafeSolidColourObjectIds: new Set(['shape-1']),
    })).toEqual({
      owner: 'pixi',
      reason: 'rustGeometryUnavailable',
      solidColourObjectIds: [],
    });
  });
});
