import { describe, expect, it } from 'vitest';
import { buildSharedRendererPresentationContract } from './sharedRendererPresentationContract';
import { buildSharedRendererPreviewSessionFromEvaluatedScene } from './sharedRendererEvaluatedScenePreviewSession';

const validEvaluation = {
  snapshot: {
    frame_index: 120,
    colour: {
      profile: 'rec709-sdr',
      working_space: 'linear-light',
      alpha: 'premultiplied',
    },
    clips: [
      {
        clip_id: 'image-1',
        track_id: 'layer-1',
        media_id: 'image-1',
        source_frame: 0,
        z_index: 0,
        transform: {
          translation_x: 32,
          translation_y: 48,
          scale_x: 1,
          scale_y: 1,
          rotation_degrees: 0,
          sampling: 'bilinear',
        },
        opacity: 1,
        effects: [],
      },
    ],
  },
  media: [
    {
      id: 'image-1',
      kind: 'Image',
      source: '/tmp/image.png',
      width: 640,
      height: 360,
    },
  ],
} as const;

const input = (evaluation: { snapshot: unknown; media: readonly unknown[] }) => ({
  evaluation,
  projectSettings: { width: 1920, height: 1080 },
  editorMode: '2d' as const,
  isExporting: false,
  webGpuAvailable: true,
  fallbackAdapter: false,
});

describe('buildSharedRendererPreviewSessionFromEvaluatedScene', () => {
  it('Rust scene.evaluate の境界を検証して既存のpresentation契約とsurface gateを持つsessionへ変換する', () => {
    const session = buildSharedRendererPreviewSessionFromEvaluatedScene(input(validEvaluation));

    expect(session.plan).toEqual({
      mode: 'sharedRenderer',
      snapshot: validEvaluation.snapshot,
      media: validEvaluation.media,
    });
    expect(session.presentationContract).toEqual(buildSharedRendererPresentationContract());
    expect(session.surfaceGate).toEqual({
      ok: true,
      canvas: { width: 1920, height: 1080 },
      snapshot: validEvaluation.snapshot,
      media: validEvaluation.media,
    });
  });

  it('無効なRust payloadをrendererへ渡さずinvalidBoundaryPayloadとしてblockedにする', () => {
    const session = buildSharedRendererPreviewSessionFromEvaluatedScene(input({
      snapshot: { frame_index: Number.NaN, clips: [] },
      media: [],
    }));

    expect(session.plan.mode).toBe('sharedRenderer');
    expect(session.surfaceGate.ok).toBe(false);
    if (session.surfaceGate.ok) throw new Error('expected an invalid Rust boundary payload to be blocked');
    expect(session.surfaceGate.reason).toBe('invalidBoundaryPayload');
    if (session.surfaceGate.reason !== 'invalidBoundaryPayload') throw new Error('expected boundary failure');
    expect(session.surfaceGate.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'snapshot.frame_index', code: 'nonFiniteNumber' }),
    ]));
  });

  it('既存surface gateの実行時制約をそのまま適用する', () => {
    const session = buildSharedRendererPreviewSessionFromEvaluatedScene({
      ...input(validEvaluation),
      isExporting: true,
    });

    expect(session.surfaceGate).toEqual({
      ok: false,
      reason: 'exporting',
      detail: 'Shared renderer preview surface is disabled during export.',
    });
  });
});
