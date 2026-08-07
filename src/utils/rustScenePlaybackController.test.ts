import { describe, expect, it, vi } from 'vitest';
import {
  computeRustScenePlaybackStartTimingDiagnostics,
  createRustScenePlaybackController,
} from '../../electron/rustScenePlaybackController';

const audioWaveformSource =
  '{"generator":"audio-waveform-r","target_audio_id":"audio-1","target_source":"/tmp/dialogue.wav","sample_window_seconds":1,"colour":"#00ff00","thickness":1,"amplitude":1}';
const audioSphereSource =
  '{"generator":"audio-sphere-93","target_audio_id":"audio-1","target_source":"/tmp/dialogue.wav","sample_window_seconds":0.1,"columns":16,"rows":12,"base_radius":170,"audio_influence":0.6,"point_size":5,"polygon_size":0.35,"random_amount":0.05,"colour":"#36c2ff","seed":93}';
const simpleTubeSource =
  '{"generator":"simple-tube-93","radius":150,"depth":280,"segments":16,"rings":10,"twist_degrees":0,"random_amount":0,"stroke_width":3,"colour":"#0e769f","secondary_colour":"#ffffff","colour_pattern":"single","fog_strength":0,"fog_colour":"#ffffff","seed":93,"torus":false}';

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
    source: kind === 'GeneratedSimpleTube' ? simpleTubeSource : '{}',
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

  it('複数Videoと音声生成物を同じresident sceneとして一括提示する', async () => {
    const presentScene = vi.fn(async () => ({ success: true, attached: true }));
    const controller = createRustScenePlaybackController({
      evaluateScene: async ({ frameIndex }) => {
        const base = evaluation(frameIndex, 'Video');
        return {
          ...base,
          snapshot: {
            ...base.snapshot,
            clips: [
              {
                ...base.snapshot.clips[0],
                clip_id: 'video-clip-1',
                media_id: 'video-1',
                source_frame: frameIndex,
                z_index: 0,
              },
              {
                ...base.snapshot.clips[0],
                clip_id: 'video-clip-2',
                media_id: 'video-2',
                source_frame: frameIndex + 12,
                z_index: 1,
              },
              {
                ...base.snapshot.clips[0],
                clip_id: 'audio-sphere-clip',
                media_id: 'audio-sphere-1',
                source_frame: frameIndex,
                z_index: 2,
              },
            ],
          },
          media: [
            {
              ...base.media[0],
              id: 'video-1',
              source: '/tmp/video-1.mov',
            },
            {
              ...base.media[0],
              id: 'video-2',
              source: '/tmp/video-2.mov',
            },
            {
              id: 'audio-sphere-1',
              kind: 'GeneratedAudioSphere',
              source: audioSphereSource,
              width: 320,
              height: 180,
            },
          ],
        };
      },
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
    expect(presentScene).toHaveBeenCalledTimes(1);
    expect(presentScene).toHaveBeenCalledWith(expect.objectContaining({
      snapshot: expect.objectContaining({
        clips: expect.arrayContaining([
          expect.objectContaining({ mediaId: 'video-1', sourceFrame: 0 }),
          expect.objectContaining({ mediaId: 'video-2', sourceFrame: 12 }),
          expect.objectContaining({ mediaId: 'audio-sphere-1', sourceFrame: 0 }),
        ]),
      }),
      media: [
        expect.objectContaining({ id: 'video-1', kind: 'Video' }),
        expect.objectContaining({ id: 'video-2', kind: 'Video' }),
        expect.objectContaining({ id: 'audio-sphere-1', kind: 'GeneratedAudioSphere' }),
      ],
    }));
  });

  it('同じresident mediaを異なるsource frameで要求するsceneは提示前に拒否する', async () => {
    const presentScene = vi.fn(async () => ({ success: true, attached: true }));
    const controller = createRustScenePlaybackController({
      evaluateScene: async ({ frameIndex }) => {
        const base = evaluation(frameIndex, 'Video');
        return {
          ...base,
          snapshot: {
            ...base.snapshot,
            clips: [
              {
                ...base.snapshot.clips[0],
                clip_id: 'video-clip-1',
                media_id: 'video-1',
                source_frame: frameIndex,
              },
              {
                ...base.snapshot.clips[0],
                clip_id: 'video-clip-2',
                media_id: 'video-1',
                source_frame: frameIndex + 1,
              },
            ],
          },
          media: [{
            ...base.media[0],
            id: 'video-1',
            source: '/tmp/video.mov',
          }],
        };
      },
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
    })).resolves.toEqual({
      active: false,
      reason: 'unsupportedDirectMedia',
      detail: 'Native overlay media video-1 is requested at multiple source frames (0 and 1).',
    });
    expect(presentScene).not.toHaveBeenCalled();
  });

  it('同じmedia IDの異なる定義が重複するsceneは提示前に拒否する', async () => {
    const presentScene = vi.fn(async () => ({ success: true, attached: true }));
    const controller = createRustScenePlaybackController({
      evaluateScene: async ({ frameIndex }) => {
        const base = evaluation(frameIndex, 'Video');
        return {
          ...base,
          media: [
            {
              ...base.media[0],
              id: 'video-1',
              source: '/tmp/video-a.mov',
            },
            {
              ...base.media[0],
              id: 'video-1',
              source: '/tmp/video-b.mov',
            },
          ],
        };
      },
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
    })).resolves.toEqual({
      active: false,
      reason: 'unsupportedDirectMedia',
      detail: 'Native overlay scene contains duplicate media ID video-1.',
    });
    expect(presentScene).not.toHaveBeenCalled();
  });

  it('再生途中で同じresident mediaのsource frameが競合したら次の提示前に停止する', async () => {
    let nowMs = 0;
    let scheduled: (() => void) | null = null;
    let evaluationCount = 0;
    const presentScene = vi.fn(async () => ({ success: true, attached: true }));
    const emit = vi.fn();
    const controller = createRustScenePlaybackController({
      evaluateScene: async ({ frameIndex }) => {
        const base = evaluation(frameIndex, 'Video');
        evaluationCount += 1;
        if (evaluationCount === 1) {
          return {
            ...base,
            media: [{ ...base.media[0], id: 'video-1', source: '/tmp/video.mov' }],
          };
        }
        return {
          ...base,
          snapshot: {
            ...base.snapshot,
            clips: [
              {
                ...base.snapshot.clips[0],
                clip_id: 'video-clip-1',
                media_id: 'video-1',
                source_frame: frameIndex,
              },
              {
                ...base.snapshot.clips[0],
                clip_id: 'video-clip-2',
                media_id: 'video-1',
                source_frame: frameIndex + 1,
              },
            ],
          },
          media: [{ ...base.media[0], id: 'video-1', source: '/tmp/video.mov' }],
        };
      },
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
      startTimeSeconds: 0,
      durationSeconds: 1,
    })).resolves.toMatchObject({ active: true, frameIndex: 0 });
    expect(presentScene).toHaveBeenCalledTimes(1);

    nowMs = 20;
    (scheduled as unknown as (() => void))();

    await vi.waitFor(() => expect(emit).toHaveBeenCalledWith(expect.objectContaining({
      status: 'failed',
      isPlaying: false,
      reason: 'Native overlay media video-1 is requested at multiple source frames (1 and 2).',
    })));
    expect(presentScene).toHaveBeenCalledTimes(1);
  });

  it('sourceRateが欠落または0のVideoはnative decoderへ渡さない', async () => {
    for (const source_rate of [
      undefined,
      { numerator: 0, denominator: 1 },
      { numerator: 60, denominator: 0 },
    ]) {
      const presentScene = vi.fn();
      const controller = createRustScenePlaybackController({
        evaluateScene: async ({ frameIndex }) => ({
          ...evaluation(frameIndex, 'Video'),
          media: [{
            ...evaluation(frameIndex, 'Video').media[0],
            source: '/tmp/video.mov',
            source_rate,
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
      })).resolves.toMatchObject({ active: false, reason: 'unsupportedDirectMedia' });
      expect(presentScene).not.toHaveBeenCalled();
    }
  });

  it.each([
    ['GeneratedAudioWaveform', audioWaveformSource],
    ['GeneratedAudioSphere', audioSphereSource],
  ])('%sをmain所有のresident PCM direct presentへ渡す', async (kind, source) => {
    const presentScene = vi.fn(async () => ({ success: true, attached: true }));
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
    })).resolves.toMatchObject({ active: true, frameIndex: 0 });
    expect(presentScene).toHaveBeenCalledWith(expect.objectContaining({
      media: [expect.objectContaining({ kind, source })],
    }));
  });

  it.each([
    [
      'GeneratedAudioWaveform',
      '{"generator":"audio-waveform-r","target_audio_id":"","target_source":"","sample_window_seconds":1,"colour":"#00ff00","thickness":1,"amplitude":1}',
    ],
    [
      'GeneratedAudioSphere',
      '{"generator":"audio-sphere-93","target_audio_id":"","target_source":"","sample_window_seconds":0.1,"columns":16,"rows":12,"base_radius":170,"audio_influence":0.6,"point_size":5,"polygon_size":0.35,"random_amount":0.05,"colour":"#36c2ff","seed":93}',
    ],
  ])('%sのresident PCM targetが未設定ならaddonへ渡さない', async (kind, source) => {
    const presentScene = vi.fn(async () => ({ success: true, attached: true }));
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
  });

  it('JPEG画像をmain所有のdirect presentへ渡す', async () => {
    const source = '/tmp/photo.jpg';
    const presentScene = vi.fn(async () => ({ success: true, attached: true }));
    const controller = createRustScenePlaybackController({
      evaluateScene: async ({ frameIndex }) => ({
        ...evaluation(frameIndex, 'Image'),
        media: [{ ...evaluation(frameIndex, 'Image').media[0], source }],
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
      media: [expect.objectContaining({ kind: 'Image', source })],
    }));
  });

  it('PSDのactive layer IDをmain所有のdirect presentへ渡す', async () => {
    const source = '/tmp/character.psd';
    const activeLayerIds = ['psd-group-0', 'psd-layer-2'];
    const presentScene = vi.fn(async () => ({ success: true, attached: true }));
    const controller = createRustScenePlaybackController({
      evaluateScene: async ({ frameIndex }) => ({
        ...evaluation(frameIndex, 'Psd'),
        media: [{
          ...evaluation(frameIndex, 'Psd').media[0],
          source,
          active_layer_ids: activeLayerIds,
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
        kind: 'Psd',
        source,
        activeLayerIds,
      })],
    }));
  });

  it('PNG/JPEG/PSD以外の画像はdirect presentせず既存時計へ戻す', async () => {
    for (const [kind, source] of [
      ['Image', '/tmp/photo.webp'],
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

  it('start()成功時にengage遅延内訳（計測専用診断）をevaluate/presentの区間ごとに返す', async () => {
    let clock = 500;
    const evaluateScene = vi.fn(async ({ frameIndex }: { frameIndex: number }) => {
      clock += 100;
      return evaluation(frameIndex);
    });
    const presentScene = vi.fn(async () => {
      clock += 50;
      return { success: true, attached: true };
    });
    const controller = createRustScenePlaybackController({
      evaluateScene,
      presentScene,
      emit: vi.fn(),
      nowMs: () => clock,
      schedule: vi.fn(() => 1),
      cancel: vi.fn(),
    });

    const result = await controller.start({
      windowId: 4,
      sceneId: 'scene-1',
      revision: 7,
      fps: 60,
      startTimeSeconds: 0,
      durationSeconds: 1,
    });

    expect(result.active).toBe(true);
    if (!result.active) throw new Error('unreachable');
    expect(result.startTimingDiagnostics).toEqual({
      totalMs: 150,
      evaluateSceneMs: 100,
      presentSceneMs: 50,
      otherMs: 0,
      isFirstStartSinceLaunch: true,
    });
  });

  it('2回目以降のstart()ではisFirstStartSinceLaunchをfalseにする（コールドパス切り分け用）', async () => {
    let clock = 0;
    const controller = createRustScenePlaybackController({
      evaluateScene: async ({ frameIndex }) => {
        clock += 10;
        return evaluation(frameIndex);
      },
      presentScene: async () => {
        clock += 10;
        return { success: true, attached: true };
      },
      emit: vi.fn(),
      nowMs: () => clock,
      schedule: vi.fn(() => 1),
      cancel: vi.fn(),
    });

    const firstResult = await controller.start({
      windowId: 4,
      sceneId: 'scene-1',
      revision: 7,
      fps: 60,
      startTimeSeconds: 0,
      durationSeconds: 1,
    });
    const secondResult = await controller.start({
      windowId: 4,
      sceneId: 'scene-1',
      revision: 7,
      fps: 60,
      startTimeSeconds: 0,
      durationSeconds: 1,
    });

    if (!firstResult.active || !secondResult.active) throw new Error('unreachable');
    expect(firstResult.startTimingDiagnostics.isFirstStartSinceLaunch).toBe(true);
    expect(secondResult.startTimingDiagnostics.isFirstStartSinceLaunch).toBe(false);
  });

  it('failed（active: false）の結果には診断フィールドを含めず既存契約を保つ', async () => {
    const controller = createRustScenePlaybackController({
      evaluateScene: async () => {
        throw new Error('rust backend unreachable');
      },
      presentScene: vi.fn(),
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
      reason: 'evaluationFailed',
      detail: 'rust backend unreachable',
    });
  });
});

describe('computeRustScenePlaybackStartTimingDiagnostics（純粋関数）', () => {
  it('evaluate/presentの区間からotherMsを差分計算する', () => {
    expect(computeRustScenePlaybackStartTimingDiagnostics({
      totalMs: 370,
      evaluateSceneMs: 300,
      presentSceneMs: 50,
      isFirstStartSinceLaunch: false,
    })).toEqual({
      totalMs: 370,
      evaluateSceneMs: 300,
      presentSceneMs: 50,
      otherMs: 20,
      isFirstStartSinceLaunch: false,
    });
  });

  it('evaluate/presentの区間が未計測（undefined）ならotherMsもnullにする', () => {
    expect(computeRustScenePlaybackStartTimingDiagnostics({
      totalMs: 10,
      evaluateSceneMs: undefined,
      presentSceneMs: undefined,
      isFirstStartSinceLaunch: true,
    })).toEqual({
      totalMs: 10,
      evaluateSceneMs: null,
      presentSceneMs: null,
      otherMs: null,
      isFirstStartSinceLaunch: true,
    });
  });

  it('計測誤差でsub区間合計がtotalMsをわずかに超えてもotherMsは0未満にしない', () => {
    expect(computeRustScenePlaybackStartTimingDiagnostics({
      totalMs: 100,
      evaluateSceneMs: 60,
      presentSceneMs: 45,
      isFirstStartSinceLaunch: false,
    }).otherMs).toBe(0);
  });
});
