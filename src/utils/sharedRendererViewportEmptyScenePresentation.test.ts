import { describe, expect, it } from 'vitest';
import type { SharedRendererPreviewSession } from './sharedRendererPreviewSession';
import { shouldPresentSharedRendererEmptyScenePresentation } from './sharedRendererViewportEmptyScenePresentation';

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

const buildBlockedSession = (): SharedRendererPreviewSession => ({
  plan: { mode: 'sharedRenderer', snapshot: null, media: [] },
  surfaceGate: {
    ok: false,
    reason: 'exporting',
    detail: 'exporting in progress',
  },
} as unknown as SharedRendererPreviewSession);

describe('shouldPresentSharedRendererEmptyScenePresentation', () => {
  it('requires a clear when clips are empty and native overlay preview is enabled', () => {
    expect(shouldPresentSharedRendererEmptyScenePresentation({
      session: buildSession([]),
      nativeOverlayPreviewEnabled: true,
    })).toBe(true);
  });

  it('does not require a clear when clips are non-empty', () => {
    expect(shouldPresentSharedRendererEmptyScenePresentation({
      session: buildSession([{ id: 'shape', kind: 'GeneratedGetColorDots', source: '{}' }]),
      nativeOverlayPreviewEnabled: true,
    })).toBe(false);
  });

  it('does not require a clear when native overlay preview is disabled', () => {
    expect(shouldPresentSharedRendererEmptyScenePresentation({
      session: buildSession([]),
      nativeOverlayPreviewEnabled: false,
    })).toBe(false);
  });

  it('does not require a clear when surfaceGate is blocked (handled by another path)', () => {
    expect(shouldPresentSharedRendererEmptyScenePresentation({
      session: buildBlockedSession(),
      nativeOverlayPreviewEnabled: true,
    })).toBe(false);
  });

  it('is idempotent across repeated empty ticks (always returns true, letting the caller supersede requestId every call)', () => {
    const session = buildSession([]);
    expect(shouldPresentSharedRendererEmptyScenePresentation({
      session,
      nativeOverlayPreviewEnabled: true,
    })).toBe(true);
    expect(shouldPresentSharedRendererEmptyScenePresentation({
      session,
      nativeOverlayPreviewEnabled: true,
    })).toBe(true);
  });
});
