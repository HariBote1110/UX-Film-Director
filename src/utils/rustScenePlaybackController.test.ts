import { describe, expect, it, vi } from 'vitest';
import { createRustScenePlaybackController } from '../../electron/rustScenePlaybackController';

const evaluation = (frameIndex: number, kind = 'GeneratedSimpleTube') => ({
  sceneId: 'scene-1',
  revision: 7,
  frameIndex,
  canvas: {
    width: 1920,
    height: 1080,
  },
  snapshot: {
    frame_index: frameIndex,
    colour: {
      profile: 'rec709-sdr',
      working_space: 'linear-light',
      alpha: 'premultiplied',
    },
    clips: [{
      clip_id: 'clip-1',
      track_id: 'track-1',
      media_id: 'media-1',
      source_frame: frameIndex,
      z_index: 0,
      transform: {
        translation_x: 10,
        translation_y: 20,
        scale_x: 1,
        scale_y: 1,
        rotation_degrees: 0,
        sampling: 'linear',
      },
      opacity: 1,
      effects: [],
    }],
  },
  media: [{
    id: 'media-1',
    kind,
    source: '{}',
    width: 320,
    height: 180,
    ...(kind === 'Video'
      ? { source_rate: { numerator: 60, denominator: 1 } }
      : {}),
  }],
});

describe('RustScenePlaybackController', () => {
  it('単調時計からframeを求め、Rust評価からnative presentまでrendererを経由せず実行する', async () => {
    let nowMs = 1_000;
    let scheduled: (() => void) | null = null;
    const evaluateScene = vi.fn(async ({ frameIndex }: { frameIndex: number }) =>
      evaluation(frameIndex));
    const presentScene = vi.fn(async () => ({ success: true, attached: true }));
    const emit = vi.fn();
    const controller = createRustScenePlaybackController({
      evaluateScene,
      presentScene,
      emit,
      nowMs: () => nowMs,
      schedule: (callback) => {
        scheduled = callback;
        return 1;
      },
      cancel: vi.fn(),
    });

    await expect(controller.start({
      windowId: 4,
      sceneId: 'scene-1',
      revision: 7,
      fps: 60,
      startTimeSeconds: 0.5,
      durationSeconds: 2,
    })).resolves.toMatchObject({ active: true, frameIndex: 30 });
    expect(evaluateScene).toHaveBeenCalledWith({
      sceneId: 'scene-1',
      revision: 7,
      frameIndex: 30,
    });
    expect(presentScene).toHaveBeenCalledWith(expect.objectContaining({
      windowId: 4,
      snapshot: expect.objectContaining({
        frameIndex: 30,
        canvasWidth: 1920,
        canvasHeight: 1080,
        colour: {
          profile: 'rec709-sdr',
          workingSpace: 'linear-light',
          alpha: 'premultiplied',
        },
        clips: [expect.objectContaining({
          clipId: 'clip-1',
          mediaId: 'media-1',
          sourceFrame: 30,
          effectsJson: '[]',
        })],
      }),
    }));

    nowMs = 1_100;
    const runNext = scheduled as (() => void) | null;
    expect(runNext).not.toBeNull();
    runNext?.();
    await vi.waitFor(() => expect(evaluateScene).toHaveBeenLastCalledWith({
      sceneId: 'scene-1',
      revision: 7,
      frameIndex: 36,
    }));
    await vi.waitFor(() => expect(controller.diagnostics.skippedFrames).toBe(5));
  });

  it('UI時刻通知を低頻度に制限し、終端ではdurationを一度だけ通知する', async () => {
    let nowMs = 0;
    let scheduled: (() => void) | null = null;
    const emit = vi.fn();
    const controller = createRustScenePlaybackController({
      evaluateScene: async ({ frameIndex }) => evaluation(frameIndex),
      presentScene: async () => ({ success: true, attached: true }),
      emit,
      nowMs: () => nowMs,
      schedule: (callback) => {
        scheduled = callback;
        return 1;
      },
      cancel: vi.fn(),
      uiIntervalMs: 200,
    });

    await controller.start({
      windowId: 4,
      sceneId: 'scene-1',
      revision: 7,
      fps: 60,
      startTimeSeconds: 0,
      durationSeconds: 0.5,
    });
    expect(emit).toHaveBeenCalledTimes(1);

    nowMs = 100;
    (scheduled as unknown as (() => void))();
    await vi.waitFor(() => expect(controller.diagnostics.presentedFrames).toBe(2));
    expect(emit).toHaveBeenCalledTimes(1);

    nowMs = 500;
    (scheduled as unknown as (() => void))();
    await vi.waitFor(() => expect(emit).toHaveBeenCalledWith(expect.objectContaining({
      status: 'ended',
      currentTimeSeconds: 0.5,
      isPlaying: false,
    })));
    expect(emit.mock.calls.filter(([payload]) => payload.status === 'ended')).toHaveLength(1);
  });

  it('resident Videoをmain所有のnative scene presentへ渡す', async () => {
    const presentScene = vi.fn(async () => ({ success: true, attached: true }));
    const controller = createRustScenePlaybackController({
      evaluateScene: async ({ frameIndex }) => ({
        ...evaluation(frameIndex, 'Video'),
        media: [{
          ...evaluation(frameIndex, 'Video').media[0],
          source: '/tmp/video.mov',
        }],
      }),
      presentScene,
      emit: vi.fn(),
    });

    await expect(controller.start({
      windowId: 4,
      sceneId: 'scene-1',
      revision: 7,
      fps: 60,
      startTimeSeconds: 0,
      durationSeconds: 1,
    })).resolves.toMatchObject({ active: true, frameIndex: 0 });
    expect(presentScene).toHaveBeenCalledWith(expect.objectContaining({
      media: [expect.objectContaining({
        id: 'media-1',
        kind: 'Video',
        source: '/tmp/video.mov',
        sourceRate: {
          numerator: 60,
          denominator: 1,
        },
      })],
    }));
  });

  it('PSD・音声生成物・PNG以外の画像はdirect presentせず既存時計へ戻す', async () => {
    for (const [kind, source] of [
      ['Psd', '/tmp/design.psd'],
      ['GeneratedAudioWaveform', '{}'],
      ['Image', '/tmp/photo.jpg'],
    ]) {
      const presentScene = vi.fn();
      const controller = createRustScenePlaybackController({
        evaluateScene: async ({ frameIndex }) => ({
          ...evaluation(frameIndex, kind),
          media: [{ ...evaluation(frameIndex, kind).media[0], source }],
        }),
        presentScene,
        emit: vi.fn(),
      });

      await expect(controller.start({
        windowId: 4,
        sceneId: 'scene-1',
        revision: 7,
        fps: 60,
        startTimeSeconds: 0,
        durationSeconds: 1,
      })).resolves.toMatchObject({ active: false, reason: 'unsupportedDirectMedia' });
      expect(presentScene).not.toHaveBeenCalled();
    }
  });

  it('native overlay の失敗理由を診断情報として呼び出し元へ返す', async () => {
    const controller = createRustScenePlaybackController({
      evaluateScene: async ({ frameIndex }) => evaluation(frameIndex),
      presentScene: async () => ({
        success: false,
        attached: false,
        fallback: 'webgpuPresenter',
        reason: 'diagnostic presentation failure',
      }),
      emit: vi.fn(),
    });

    await expect(controller.start({
      windowId: 4,
      sceneId: 'scene-1',
      revision: 7,
      fps: 60,
      startTimeSeconds: 0,
      durationSeconds: 1,
    })).resolves.toEqual({
      active: false,
      reason: 'presentFailed',
      detail: 'diagnostic presentation failure',
    });
  });
});
