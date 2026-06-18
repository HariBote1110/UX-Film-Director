import { describe, expect, it } from 'vitest';
import { buildSharedRendererVideoCutoverStackSafety } from './sharedRendererVideoCutoverStack';
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
      clip_id: 'video-back',
      track_id: 'layer-0',
      media_id: 'video-back',
      source_frame: 12,
      z_index: 0,
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
    {
      clip_id: 'shape-front',
      track_id: 'layer-2',
      media_id: 'shape-front',
      source_frame: 0,
      z_index: 2,
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
  ],
};

const media: RustSceneMediaReference[] = [
  {
    id: 'video-back',
    kind: 'Video',
    source: '/tmp/video.mp4',
    width: 1280,
    height: 720,
    source_rate: { numerator: 30, denominator: 1 },
  },
  {
    id: 'image-front',
    kind: 'Image',
    source: '/tmp/image.png',
    width: 640,
    height: 360,
  },
  {
    id: 'shape-front',
    kind: 'SolidColour',
    source: '#ff0000',
    width: 200,
    height: 100,
  },
];

describe('buildSharedRendererVideoCutoverStackSafety', () => {
  it('keeps video cutover when a PNG image and SolidColour plane are above it', () => {
    expect(buildSharedRendererVideoCutoverStackSafety({
      snapshot,
      media,
      candidateVideoObjectIds: ['video-back'],
    })).toEqual({
      safeVideoObjectIds: ['video-back'],
      blockedVideoObjectIds: [],
    });
  });

  it('blocks video cutover when an unsupported image is above the video plane', () => {
    expect(buildSharedRendererVideoCutoverStackSafety({
      snapshot,
      media: media.map((reference) => (
        reference.id === 'image-front'
          ? { ...reference, source: '/tmp/image.jpg' }
          : reference
      )),
      candidateVideoObjectIds: ['video-back'],
    })).toEqual({
      safeVideoObjectIds: [],
      blockedVideoObjectIds: [{
        videoObjectId: 'video-back',
        blockingObjectId: 'image-front',
        blockingKind: 'Image',
        reason: 'pixiOnlyObjectAboveVideo',
      }],
    });
  });

  it('keeps video cutover when only shared-renderer-supported planes are above it', () => {
    expect(buildSharedRendererVideoCutoverStackSafety({
      snapshot: {
        ...snapshot,
        clips: snapshot.clips.filter((clip) => clip.clip_id !== 'image-front'),
      },
      media,
      candidateVideoObjectIds: ['video-back'],
    })).toEqual({
      safeVideoObjectIds: ['video-back'],
      blockedVideoObjectIds: [],
    });
  });

  it('keeps video cutover when Pixi-only planes are behind the video', () => {
    expect(buildSharedRendererVideoCutoverStackSafety({
      snapshot: {
        ...snapshot,
        clips: snapshot.clips.map((clip) => (
          clip.clip_id === 'image-front'
            ? { ...clip, z_index: -1 }
            : clip
        )),
      },
      media,
      candidateVideoObjectIds: ['video-back'],
    })).toMatchObject({
      safeVideoObjectIds: ['video-back'],
      blockedVideoObjectIds: [],
    });
  });
});
