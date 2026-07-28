import { describe, expect, it } from 'vitest';
import type { SharedRendererPreviewSession } from './sharedRendererPreviewSession';
import { isNativeOverlayDirectSceneSession } from './nativeOverlayDirectSceneEligibility';

const buildSession = (
  media: Array<{ id: string; kind: string; source: string }>
): SharedRendererPreviewSession => ({
  plan: { mode: 'sharedRenderer', snapshot: null, media: [] },
  surfaceGate: {
    ok: true,
    canvas: { width: 1920, height: 1080 },
    snapshot: {
      frame_index: 0,
      colour: {
        profile: 'rec709-sdr',
        working_space: 'linear-light',
        alpha: 'premultiplied',
      },
      clips: media.map((reference, index) => ({
        clip_id: `clip-${index}`,
        track_id: `track-${index}`,
        media_id: reference.id,
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
    },
    media: media.map((reference) => ({
      ...reference,
      width: 1920,
      height: 1080,
    })) as never,
  },
} as unknown as SharedRendererPreviewSession);

describe('isNativeOverlayDirectSceneSession', () => {
  it('accepts one decoded video mixed with a generated GetColor source', () => {
    expect(isNativeOverlayDirectSceneSession(buildSession([
      { id: 'video', kind: 'Video', source: '/tmp/video.mov' },
      { id: 'getcolor', kind: 'GeneratedGetColorDots', source: '{}' },
    ]))).toBe(true);
  });

  it('rejects multiple visible video clips because one present currently supplies one decoded source', () => {
    expect(isNativeOverlayDirectSceneSession(buildSession([
      { id: 'video-a', kind: 'Video', source: '/tmp/a.mov' },
      { id: 'video-b', kind: 'Video', source: '/tmp/b.mov' },
    ]))).toBe(false);
  });

  it('rejects non-video sources that the direct overlay source loader cannot build', () => {
    expect(isNativeOverlayDirectSceneSession(buildSession([
      { id: 'video', kind: 'Video', source: '/tmp/video.mov' },
      { id: 'psd', kind: 'Psd', source: '/tmp/layers.psd' },
    ]))).toBe(false);
  });

  it.each([
    ['GeneratedAudioWaveform', '{"generator":"audio-waveform-r"}'],
    ['GeneratedAudioSphere', '{"generator":"audio-sphere-93"}'],
  ])('accepts a video-free %s scene backed by the native resident PCM path', (kind, source) => {
    expect(isNativeOverlayDirectSceneSession(buildSession([
      { id: 'audio-reactive', kind, source },
    ]))).toBe(true);
  });

  it.each([
    ['GeneratedAudioWaveform', '{"generator":"audio-waveform-r"}'],
    ['GeneratedAudioSphere', '{"generator":"audio-sphere-93"}'],
  ])(
    'rejects a decoded-video injection mixed with %s until that path supplies resident PCM',
    (kind, source) => {
      expect(isNativeOverlayDirectSceneSession(buildSession([
        { id: 'video', kind: 'Video', source: '/tmp/video.mov' },
        { id: 'audio-reactive', kind, source },
      ]))).toBe(false);
    }
  );
});
