import { describe, expect, it } from 'vitest';
import {
  canRenderSharedRendererNativeMediaOnlyFrame,
  isSharedRendererNativeImageSourceSupported,
  isSharedRendererNativeMediaReferenceSupported,
} from './sharedRendererNativeMediaSupport';
import type { RustSceneMediaReference, RustSceneSnapshot } from './rustSceneSnapshot';

const snapshotWithMedia = (...mediaIds: string[]): RustSceneSnapshot => ({
  frame_index: 12,
  colour: {
    profile: 'rec709-sdr',
    working_space: 'linear-light',
    alpha: 'premultiplied',
  },
  clips: mediaIds.map((mediaId, index) => ({
    clip_id: `clip-${mediaId}`,
    track_id: `layer-${index}`,
    media_id: mediaId,
    source_frame: 0,
    z_index: index,
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
  })),
});

const media: RustSceneMediaReference[] = [{
  id: 'solid-1',
  kind: 'SolidColour',
  source: '#ff0000',
  width: 2,
  height: 2,
}, {
  id: 'png-1',
  kind: 'Image',
  source: '/tmp/overlay.PNG',
  width: 4,
  height: 4,
}, {
  id: 'jpg-1',
  kind: 'Image',
  source: '/tmp/overlay.jpg',
  width: 4,
  height: 4,
}, {
  id: 'webp-1',
  kind: 'Image',
  source: '/tmp/overlay.webp',
  width: 4,
  height: 4,
}, {
  id: 'video-1',
  kind: 'Video',
  source: '/tmp/video.mp4',
  width: 4,
  height: 4,
  source_rate: { numerator: 60, denominator: 1 },
}];

describe('sharedRendererNativeMediaSupport', () => {
  it('accepts local image paths and file URLs with query strings for native Rust loading', () => {
    expect(isSharedRendererNativeImageSourceSupported('/tmp/overlay.PNG')).toBe(true);
    expect(isSharedRendererNativeImageSourceSupported('file:///tmp/native%20overlay.JPG')).toBe(true);
    expect(isSharedRendererNativeImageSourceSupported('file:///tmp/native-overlay.jpeg?cache=12#frame')).toBe(true);
    expect(isSharedRendererNativeImageSourceSupported('https://example.com/native-overlay.jpg')).toBe(false);
    expect(isSharedRendererNativeImageSourceSupported('blob:file:///tmp/native-overlay.jpg')).toBe(false);
    expect(isSharedRendererNativeImageSourceSupported('data:image/png;base64,abcd')).toBe(false);
  });

  it('matches the Rust backend native media source support contract', () => {
    expect(isSharedRendererNativeMediaReferenceSupported(media[0])).toBe(true);
    expect(isSharedRendererNativeMediaReferenceSupported(media[1])).toBe(true);
    expect(isSharedRendererNativeMediaReferenceSupported(media[2])).toBe(true);
    expect(isSharedRendererNativeMediaReferenceSupported(media[3])).toBe(false);
    expect(isSharedRendererNativeMediaReferenceSupported(media[4])).toBe(false);
  });

  it('allows media-only native render only when every visible clip has a Rust-generated source', () => {
    expect(canRenderSharedRendererNativeMediaOnlyFrame({
      snapshot: snapshotWithMedia('solid-1', 'png-1'),
      media,
    })).toBe(true);
    expect(canRenderSharedRendererNativeMediaOnlyFrame({
      snapshot: snapshotWithMedia('solid-1', 'jpg-1'),
      media,
    })).toBe(true);
    expect(canRenderSharedRendererNativeMediaOnlyFrame({
      snapshot: snapshotWithMedia('solid-1', 'webp-1'),
      media,
    })).toBe(false);
    expect(canRenderSharedRendererNativeMediaOnlyFrame({
      snapshot: snapshotWithMedia('solid-1', 'video-1'),
      media,
    })).toBe(false);
    expect(canRenderSharedRendererNativeMediaOnlyFrame({
      snapshot: snapshotWithMedia('solid-1', 'missing-1'),
      media,
    })).toBe(false);
    expect(canRenderSharedRendererNativeMediaOnlyFrame({
      snapshot: snapshotWithMedia(),
      media,
    })).toBe(false);
  });
});
