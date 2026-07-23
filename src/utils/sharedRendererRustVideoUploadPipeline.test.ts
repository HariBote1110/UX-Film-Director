import { describe, expect, it } from 'vitest';
import {
  presentNativeOverlayRustDecodedVideoFrame,
  prepareSharedRendererRustDecodedVideoUpload,
  resetNativeOverlayVisualFrameCache,
  type PresentNativeOverlayRustDecodedVideoFrameInput,
} from './sharedRendererRustVideoUploadPipeline';
import type {
  RustBackendResult,
  RustBackendVideoDecodeBridge,
  RustBackendVideoDecodeFrameResult,
} from './rustBackendVideoDecodeControl';
import type { SharedVideoFrameCopyBridge } from './sharedVideoFrameUploadBridge';

const decodedFrameResponse: RustBackendResult<RustBackendVideoDecodeFrameResult> = {
  success: true,
  result: {
    accepted: true,
    jobId: 'decode-job-1',
    requestId: 99,
    frameIndex: 42,
    mode: 'latestWins',
    frame: {
      descriptor: {
        memoryId: '/uxfd-video-ring',
        slotIndex: 1,
        generation: 5,
        byteOffset: 512,
        byteLen: 512,
        width: 34,
        height: 2,
        strideBytes: 256,
        format: 'rgba8Srgb',
        colour: {
          primaries: 'bt709',
          transfer: 'srgb',
          matrix: 'rgb',
          range: 'full',
        },
      },
      ptsFrame: 42,
    },
    verification: {
      frameIndex: 42,
      checksum: {
        algorithm: 'crc32',
        valueHex: '12345678',
        byteLen: 512,
      },
      status: 'withinTolerance',
    },
    decodeInvocationCount: 1,
  },
};

describe('sharedRendererRustVideoUploadPipeline', () => {
  it('presents a verified Rust decoded frame through Native Overlay and releases the backend slot after present', async () => {
    const calls: unknown[] = [];
    const rustBackendBridge: RustBackendVideoDecodeBridge = {
      startVideoDecode: async () => ({ success: true }),
      requestVideoDecodeFrame: async () => ({ success: true, result: decodedFrameResponse.result! }),
      releaseVideoDecodeFrame: async (payload) => {
        calls.push(['releaseVideoDecodeFrame', payload]);
        return { success: true, result: { released: true } };
      },
      stopVideoDecode: async () => ({ success: true }),
    };

    const result = await presentNativeOverlayRustDecodedVideoFrame({
      windowId: 7,
      decodeResponse: decodedFrameResponse,
      snapshot: {
        frame_index: 42,
        colour: {
          profile: 'rec709-sdr',
          working_space: 'linear-light',
          alpha: 'premultiplied',
        },
        clips: [{
          clip_id: 'clip-video-1',
          track_id: 'track-1',
          media_id: 'decode-job-1',
          source_frame: 42,
          z_index: 0,
          transform: {
            translation_x: 10,
            translation_y: 20,
            scale_x: 1,
            scale_y: 1,
            rotation_degrees: 0,
            sampling: 'bilinear',
          },
          opacity: 1,
          effects: [],
        }],
      },
      canvas: { width: 1920, height: 1080 },
      slotCount: 2,
      nativeOverlayBridge: {
        presentSharedFrame: async (payload) => {
          calls.push(['presentSharedFrame', payload]);
          return {
            success: true,
            attached: true,
            releaseFrame: {
              memoryId: payload.frame.descriptor.memoryId,
              slotIndex: payload.frame.descriptor.slotIndex,
              generation: payload.frame.descriptor.generation,
              ptsFrame: payload.frame.ptsFrame,
              copyOutState: 'gpuUploadFenceSignalled',
            },
          };
        },
      },
      rustBackendBridge,
    });

    expect(result).toEqual({ ok: true });
    expect(calls).toEqual([
      ['presentSharedFrame', {
        windowId: 7,
        mediaId: 'decode-job-1',
        snapshot: {
          frameIndex: 42,
          colour: {
            profile: 'rec709-sdr',
            workingSpace: 'linear-light',
            alpha: 'premultiplied',
          },
          clips: [{
            clipId: 'clip-video-1',
            trackId: 'track-1',
            mediaId: 'decode-job-1',
            sourceFrame: 42,
            zIndex: 0,
            transform: {
              translationX: 10,
              translationY: 20,
              scaleX: 1,
              scaleY: 1,
              rotationDegrees: 0,
              sampling: 'bilinear',
            },
            opacity: 1,
          }],
          canvasWidth: 1920,
          canvasHeight: 1080,
        },
        slotCount: 2,
        frame: decodedFrameResponse.result!.frame,
      }],
      ['releaseVideoDecodeFrame', {
        jobId: 'decode-job-1',
        slotIndex: 1,
        generation: 5,
        copyOutState: 'gpuUploadFenceSignalled',
      }],
    ]);
  });

  it('returns a Native Overlay release failure instead of throwing when the backend rejects the lease', async () => {
    const result = await presentNativeOverlayRustDecodedVideoFrame({
      windowId: 7,
      decodeResponse: decodedFrameResponse,
      slotCount: 2,
      nativeOverlayBridge: {
        presentSharedFrame: async (payload) => ({
          success: true,
          attached: true,
          releaseFrame: {
            memoryId: payload.frame.descriptor.memoryId,
            slotIndex: payload.frame.descriptor.slotIndex,
            generation: payload.frame.descriptor.generation,
            ptsFrame: payload.frame.ptsFrame,
            copyOutState: 'gpuUploadFenceSignalled',
          },
        }),
      },
      rustBackendBridge: {
        startVideoDecode: async () => ({ success: true }),
        requestVideoDecodeFrame: async () => ({ success: true, result: decodedFrameResponse.result! }),
        releaseVideoDecodeFrame: async () => ({
          success: false,
          error: 'Failed to release decoded shared memory slot: UnexpectedState { expected: 3, actual: 2 }',
        }),
        stopVideoDecode: async () => ({ success: true }),
      },
    });

    expect(result).toEqual({
      ok: false,
      reason: 'nativeOverlayReleaseFailed',
      detail: 'Failed to release decoded shared memory slot: UnexpectedState { expected: 3, actual: 2 }',
    });
  });

  // 症状B（本体フレームと選択枠 present が独立2チャネルのためズレる不具合）
  // 対策 — body present の呼び出し元（prepareSharedRendererViewportNativeOverlayPresent）
  // が同じ (objects, time) から計算した decoration を渡した場合、
  // presentSharedFrame の payload にそのまま同梱する。
  it('embeds the provided selectionDecoration in the presentSharedFrame payload (Bug B対策: body co-delivery)', async () => {
    resetNativeOverlayVisualFrameCache();
    const calls: unknown[] = [];
    const selectionDecoration = {
      canvasWidth: 1920,
      canvasHeight: 1080,
      quads: [{
        topLeftX: 10, topLeftY: 20,
        topRightX: 110, topRightY: 20,
        bottomRightX: 110, bottomRightY: 70,
        bottomLeftX: 10, bottomLeftY: 70,
      }],
    };

    const result = await presentNativeOverlayRustDecodedVideoFrame({
      windowId: 7,
      decodeResponse: decodedFrameResponse,
      slotCount: 2,
      selectionDecoration,
      nativeOverlayBridge: {
        presentSharedFrame: async (payload) => {
          calls.push(payload.selectionDecoration);
          return {
            success: true,
            attached: true,
            releaseFrame: {
              memoryId: payload.frame.descriptor.memoryId,
              slotIndex: payload.frame.descriptor.slotIndex,
              generation: payload.frame.descriptor.generation,
              ptsFrame: payload.frame.ptsFrame,
              copyOutState: 'gpuUploadFenceSignalled',
            },
          };
        },
      },
      rustBackendBridge: {
        startVideoDecode: async () => ({ success: true }),
        requestVideoDecodeFrame: async () => ({ success: true, result: decodedFrameResponse.result! }),
        releaseVideoDecodeFrame: async () => ({ success: true, result: { released: true } }),
        stopVideoDecode: async () => ({ success: true }),
      },
    });

    expect(result).toEqual({ ok: true });
    expect(calls).toEqual([selectionDecoration]);
  });

  it('omits selectionDecoration from the presentSharedFrame payload when the caller does not provide one', async () => {
    resetNativeOverlayVisualFrameCache();
    const calls: unknown[] = [];

    await presentNativeOverlayRustDecodedVideoFrame({
      windowId: 7,
      decodeResponse: decodedFrameResponse,
      slotCount: 2,
      nativeOverlayBridge: {
        presentSharedFrame: async (payload) => {
          calls.push('selectionDecoration' in payload);
          return {
            success: true,
            attached: true,
            releaseFrame: {
              memoryId: payload.frame.descriptor.memoryId,
              slotIndex: payload.frame.descriptor.slotIndex,
              generation: payload.frame.descriptor.generation,
              ptsFrame: payload.frame.ptsFrame,
              copyOutState: 'gpuUploadFenceSignalled',
            },
          };
        },
      },
      rustBackendBridge: {
        startVideoDecode: async () => ({ success: true }),
        requestVideoDecodeFrame: async () => ({ success: true, result: decodedFrameResponse.result! }),
        releaseVideoDecodeFrame: async () => ({ success: true, result: { released: true } }),
        stopVideoDecode: async () => ({ success: true }),
      },
    });

    expect(calls).toEqual([false]);
  });

  // 元コミット 19cbb966 の dedup 契約。実機 trace で同一 ptsFrame の cacheHit が連続して
  // 16ms 超の surface 待ちを作っていた退行を抑止する。Bug C 修正後は dedup の判定条件に
  // snapshot.frame_index を含めるため、本テストでも 2 回目の入力で frame_index を変えず
  // 「playhead が同じ時刻に張り付いた状態（停止中の再描画など）」を表現する。
  it('releases but skips duplicate Native Overlay presents for an unchanged visual frame', async () => {
    resetNativeOverlayVisualFrameCache();
    const calls: unknown[] = [];
    const secondFrameResponse: RustBackendResult<RustBackendVideoDecodeFrameResult> = {
      ...decodedFrameResponse,
      result: {
        ...decodedFrameResponse.result!,
        frame: {
          ...decodedFrameResponse.result!.frame!,
          descriptor: {
            ...decodedFrameResponse.result!.frame!.descriptor,
            generation: 6,
          },
        },
      },
    };
    const rustBackendBridge: RustBackendVideoDecodeBridge = {
      startVideoDecode: async () => ({ success: true }),
      requestVideoDecodeFrame: async () => ({ success: true, result: decodedFrameResponse.result! }),
      releaseVideoDecodeFrame: async (payload) => {
        calls.push(['releaseVideoDecodeFrame', payload]);
        return { success: true, result: { released: true } };
      },
      stopVideoDecode: async () => ({ success: true }),
    };
    const nativeOverlayBridge = {
      presentSharedFrame: async (payload: Parameters<import('./sharedRendererRustVideoUploadPipeline').NativeOverlayDecodedFrameBridge['presentSharedFrame']>[0]) => {
        calls.push(['presentSharedFrame', payload.frame.descriptor.generation]);
        return {
          success: true,
          attached: true,
          releaseFrame: {
            memoryId: payload.frame.descriptor.memoryId,
            slotIndex: payload.frame.descriptor.slotIndex,
            generation: payload.frame.descriptor.generation,
            ptsFrame: payload.frame.ptsFrame,
            copyOutState: 'gpuUploadFenceSignalled' as const,
          },
        };
      },
    };

    const baseInput: Omit<PresentNativeOverlayRustDecodedVideoFrameInput, 'decodeResponse'> = {
      windowId: 77,
      mediaId: 'steady-video-duplicate',
      snapshot: {
        frame_index: 100,
        colour: {
          profile: 'rec709-sdr',
          working_space: 'linear-light',
          alpha: 'premultiplied',
        },
        clips: [{
          clip_id: 'clip-video-duplicate',
          track_id: 'track-1',
          media_id: 'steady-video-duplicate',
          source_frame: 42,
          z_index: 0,
          transform: {
            translation_x: 10,
            translation_y: 20,
            scale_x: 1,
            scale_y: 1,
            rotation_degrees: 0,
            sampling: 'bilinear',
          },
          opacity: 1,
          effects: [],
        }],
      },
      canvas: { width: 1920, height: 1080 },
      slotCount: 2,
      nativeOverlayBridge,
      rustBackendBridge,
    };

    await expect(presentNativeOverlayRustDecodedVideoFrame({
      ...baseInput,
      decodeResponse: decodedFrameResponse,
    })).resolves.toEqual({ ok: true });
    // 同じ playhead 時刻（frame_index 不変）での重複 present は dedup される。
    // 元コミット 19cbb966 の意図そのまま: 同一 ptsFrame の cacheHit 連続による surface 待ちを抑止する。
    await expect(presentNativeOverlayRustDecodedVideoFrame({
      ...baseInput,
      decodeResponse: secondFrameResponse,
    })).resolves.toEqual({ ok: true });

    expect(calls).toEqual([
      ['presentSharedFrame', 5],
      ['releaseVideoDecodeFrame', {
        jobId: 'decode-job-1',
        slotIndex: 1,
        generation: 5,
        copyOutState: 'gpuUploadFenceSignalled',
      }],
      ['releaseVideoDecodeFrame', {
        jobId: 'decode-job-1',
        slotIndex: 1,
        generation: 6,
        copyOutState: 'gpuUploadFenceSignalled',
      }],
    ]);
  });

  it('presents the next frame again after resetting the Native Overlay visual frame cache', async () => {
    const calls: unknown[] = [];
    const rustBackendBridge: RustBackendVideoDecodeBridge = {
      startVideoDecode: async () => ({ success: true }),
      requestVideoDecodeFrame: async () => ({ success: true, result: decodedFrameResponse.result! }),
      releaseVideoDecodeFrame: async (payload) => {
        calls.push(['releaseVideoDecodeFrame', payload]);
        return { success: true, result: { released: true } };
      },
      stopVideoDecode: async () => ({ success: true }),
    };
    const nativeOverlayBridge = {
      presentSharedFrame: async (payload: Parameters<import('./sharedRendererRustVideoUploadPipeline').NativeOverlayDecodedFrameBridge['presentSharedFrame']>[0]) => {
        calls.push(['presentSharedFrame', payload.frame.descriptor.generation]);
        return {
          success: true,
          attached: true,
          releaseFrame: {
            memoryId: payload.frame.descriptor.memoryId,
            slotIndex: payload.frame.descriptor.slotIndex,
            generation: payload.frame.descriptor.generation,
            ptsFrame: payload.frame.ptsFrame,
            copyOutState: 'gpuUploadFenceSignalled' as const,
          },
        };
      },
    };

    const input = {
      windowId: 78,
      mediaId: 'steady-video-reset',
      decodeResponse: decodedFrameResponse,
      slotCount: 2,
      nativeOverlayBridge,
      rustBackendBridge,
    };

    await presentNativeOverlayRustDecodedVideoFrame(input);
    resetNativeOverlayVisualFrameCache(78, 'steady-video-reset');
    await presentNativeOverlayRustDecodedVideoFrame(input);

    expect(calls.filter((call) =>
      Array.isArray(call) && call[0] === 'presentSharedFrame')).toEqual([
      ['presentSharedFrame', 5],
      ['presentSharedFrame', 5],
    ]);
  });

  it('resets a media visual frame cache across every Native Overlay window when windowId is omitted', async () => {
    const calls: unknown[] = [];
    const rustBackendBridge: RustBackendVideoDecodeBridge = {
      startVideoDecode: async () => ({ success: true }),
      requestVideoDecodeFrame: async () => ({ success: true, result: decodedFrameResponse.result! }),
      releaseVideoDecodeFrame: async () => ({ success: true, result: { released: true } }),
      stopVideoDecode: async () => ({ success: true }),
    };
    const nativeOverlayBridge = {
      presentSharedFrame: async (payload: Parameters<import('./sharedRendererRustVideoUploadPipeline').NativeOverlayDecodedFrameBridge['presentSharedFrame']>[0]) => {
        calls.push(['presentSharedFrame', payload.windowId, payload.mediaId]);
        return {
          success: true,
          attached: true,
          releaseFrame: {
            memoryId: payload.frame.descriptor.memoryId,
            slotIndex: payload.frame.descriptor.slotIndex,
            generation: payload.frame.descriptor.generation,
            ptsFrame: payload.frame.ptsFrame,
            copyOutState: 'gpuUploadFenceSignalled' as const,
          },
        };
      },
    };

    const input = {
      windowId: 79,
      mediaId: 'steady-video-reset-all-windows',
      decodeResponse: decodedFrameResponse,
      slotCount: 2,
      nativeOverlayBridge,
      rustBackendBridge,
    };

    await presentNativeOverlayRustDecodedVideoFrame(input);
    resetNativeOverlayVisualFrameCache(undefined, 'steady-video-reset-all-windows');
    await presentNativeOverlayRustDecodedVideoFrame(input);

    expect(calls).toEqual([
      ['presentSharedFrame', 79, 'steady-video-reset-all-windows'],
      ['presentSharedFrame', 79, 'steady-video-reset-all-windows'],
    ]);
  });

  // Bug C (a) — playhead 進行で snapshot.frame_index が前進したのに、source_frame と ptsFrame が
  // 量子化や latestWins で同値に張り付くケース。live overlay が再生中に静止する現象（Bug C）の
  // 主犯候補。原コミット 19cbb966 の dedup は「同一 ptsFrame の cacheHit を抑止する」意図だが、
  // 「タイムライン上の異なる playhead 時刻に張り付いた同一 source ptsFrame」は別物として
  // 扱わなければならない。snapshot.frame_index は再生時刻の正本識別子なので key に含めるべき。
  it('re-presents when the timeline frame_index advances even if ptsFrame stays the same', async () => {
    resetNativeOverlayVisualFrameCache();
    const calls: unknown[] = [];
    const rustBackendBridge: RustBackendVideoDecodeBridge = {
      startVideoDecode: async () => ({ success: true }),
      requestVideoDecodeFrame: async () => ({ success: true, result: decodedFrameResponse.result! }),
      releaseVideoDecodeFrame: async (payload) => {
        calls.push(['releaseVideoDecodeFrame', payload]);
        return { success: true, result: { released: true } };
      },
      stopVideoDecode: async () => ({ success: true }),
    };
    const nativeOverlayBridge = {
      presentSharedFrame: async (payload: Parameters<import('./sharedRendererRustVideoUploadPipeline').NativeOverlayDecodedFrameBridge['presentSharedFrame']>[0]) => {
        calls.push(['presentSharedFrame', payload.snapshot?.frameIndex]);
        return {
          success: true,
          attached: true,
          releaseFrame: {
            memoryId: payload.frame.descriptor.memoryId,
            slotIndex: payload.frame.descriptor.slotIndex,
            generation: payload.frame.descriptor.generation,
            ptsFrame: payload.frame.ptsFrame,
            copyOutState: 'gpuUploadFenceSignalled' as const,
          },
        };
      },
    };

    const baseInput: Omit<PresentNativeOverlayRustDecodedVideoFrameInput, 'snapshot'> = {
      windowId: 81,
      mediaId: 'playhead-advance',
      decodeResponse: decodedFrameResponse,
      slotCount: 2,
      nativeOverlayBridge,
      rustBackendBridge,
      media: [],
      canvas: { width: 1920, height: 1080 },
    };

    const snapshotAt = (
      frameIndex: number
    ): NonNullable<PresentNativeOverlayRustDecodedVideoFrameInput['snapshot']> => ({
      frame_index: frameIndex,
      colour: {
        profile: 'rec709-sdr',
        working_space: 'linear-light',
        alpha: 'premultiplied',
      },
      clips: [{
        clip_id: 'clip-playhead',
        track_id: 'track-1',
        media_id: 'playhead-advance',
        source_frame: 42,
        z_index: 0,
        transform: {
          translation_x: 0,
          translation_y: 0,
          scale_x: 1,
          scale_y: 1,
          rotation_degrees: 0,
          sampling: 'bilinear' as const,
        },
        opacity: 1,
        effects: [],
      }],
    });

    await expect(presentNativeOverlayRustDecodedVideoFrame({
      ...baseInput,
      snapshot: snapshotAt(100),
    })).resolves.toEqual({ ok: true });
    await expect(presentNativeOverlayRustDecodedVideoFrame({
      ...baseInput,
      snapshot: snapshotAt(101),
    })).resolves.toEqual({ ok: true });

    // playhead が 100 → 101 へ前進したので、source ptsFrame が同じでも別の visual frame として
    // 必ず2回 present が走る。これが満たされないと再生中の overlay が静止する（Bug C）。
    expect(calls.filter((call) =>
      Array.isArray(call) && call[0] === 'presentSharedFrame')).toEqual([
      ['presentSharedFrame', 100],
      ['presentSharedFrame', 101],
    ]);
  });

  // Bug C (b) — clip 削除イベント。再生中に video clip を削除すると activeJob=null になり
  // presentNativeOverlayRustDecodedVideoFrame 自体が呼ばれなくなる。その間に上位経路が
  // visual frame cache を invalidate しないと、同じ mediaId の clip を再度配置したとき
  // 「全く同じ snapshot を再構築できる」可能性があり（例: undo 直後）、誤って dedup される。
  // Red 期待: clip 削除を契機に「当該 window の全 mediaId cache」だけを消す API
  // resetNativeOverlayVisualFrameCacheForWindow(windowId) が存在し、他 window の cache は
  // 維持される。これにより multi-window 環境での独立性が担保される。
  it('clears only the target window media caches when the clip removal hook fires', async () => {
    resetNativeOverlayVisualFrameCache();
    const calls: unknown[] = [];
    const rustBackendBridge: RustBackendVideoDecodeBridge = {
      startVideoDecode: async () => ({ success: true }),
      requestVideoDecodeFrame: async () => ({ success: true, result: decodedFrameResponse.result! }),
      releaseVideoDecodeFrame: async () => ({ success: true, result: { released: true } }),
      stopVideoDecode: async () => ({ success: true }),
    };
    const nativeOverlayBridge = {
      presentSharedFrame: async (payload: Parameters<import('./sharedRendererRustVideoUploadPipeline').NativeOverlayDecodedFrameBridge['presentSharedFrame']>[0]) => {
        calls.push(['presentSharedFrame', payload.windowId, payload.mediaId]);
        return {
          success: true,
          attached: true,
          releaseFrame: {
            memoryId: payload.frame.descriptor.memoryId,
            slotIndex: payload.frame.descriptor.slotIndex,
            generation: payload.frame.descriptor.generation,
            ptsFrame: payload.frame.ptsFrame,
            copyOutState: 'gpuUploadFenceSignalled' as const,
          },
        };
      },
    };

    const inputAlphaWindow91 = {
      windowId: 91,
      mediaId: 'video-alpha',
      decodeResponse: decodedFrameResponse,
      slotCount: 2,
      nativeOverlayBridge,
      rustBackendBridge,
    };
    const inputBetaWindow91 = {
      windowId: 91,
      mediaId: 'video-beta',
      decodeResponse: decodedFrameResponse,
      slotCount: 2,
      nativeOverlayBridge,
      rustBackendBridge,
    };
    const inputAlphaWindow92 = {
      windowId: 92,
      mediaId: 'video-alpha',
      decodeResponse: decodedFrameResponse,
      slotCount: 2,
      nativeOverlayBridge,
      rustBackendBridge,
    };

    // window 91 に 2 つの video clip、window 92 に 1 つの video clip を present して cache を埋める
    await presentNativeOverlayRustDecodedVideoFrame(inputAlphaWindow91);
    await presentNativeOverlayRustDecodedVideoFrame(inputBetaWindow91);
    await presentNativeOverlayRustDecodedVideoFrame(inputAlphaWindow92);

    // 上位経路（Viewport の clip 削除 effect）から呼ばれることを期待する dedicated invalidation。
    // 関数名で「window 単位で消す」という意図を明示し、他 window への副作用を起こさない。
    const pipeline = await import('./sharedRendererRustVideoUploadPipeline');
    expect(typeof pipeline.resetNativeOverlayVisualFrameCacheForWindow).toBe('function');
    pipeline.resetNativeOverlayVisualFrameCacheForWindow(91);

    // 削除後、同じ scene を再構築して再度 present したら…
    // window 91 では両 mediaId で present が再発行される（cache が消えている）。
    // window 92 は cache が残っているので2回目は dedup される。
    await presentNativeOverlayRustDecodedVideoFrame(inputAlphaWindow91);
    await presentNativeOverlayRustDecodedVideoFrame(inputBetaWindow91);
    await presentNativeOverlayRustDecodedVideoFrame(inputAlphaWindow92);

    expect(calls).toEqual([
      ['presentSharedFrame', 91, 'video-alpha'],
      ['presentSharedFrame', 91, 'video-beta'],
      ['presentSharedFrame', 92, 'video-alpha'],
      ['presentSharedFrame', 91, 'video-alpha'],
      ['presentSharedFrame', 91, 'video-beta'],
    ]);
  });

  // Bug C (c) — scene 空集合遷移。clips が空に遷移したことを上位経路から伝えるための
  // dedicated API。presentNativeOverlayRustDecodedVideoFrame は video 用なので、scene が空に
  // なったときは別経路で「全 mediaId cache を消す + transparent clear present の起点を作る」必要が
  // ある。Red 期待: notifyNativeOverlaySceneCleared(windowId) を呼ぶと、当該 window の全 mediaId
  // cache が消える。
  it('exposes a dedicated scene-cleared notifier that drops every media cache for the window', async () => {
    resetNativeOverlayVisualFrameCache();
    const calls: unknown[] = [];
    const rustBackendBridge: RustBackendVideoDecodeBridge = {
      startVideoDecode: async () => ({ success: true }),
      requestVideoDecodeFrame: async () => ({ success: true, result: decodedFrameResponse.result! }),
      releaseVideoDecodeFrame: async () => ({ success: true, result: { released: true } }),
      stopVideoDecode: async () => ({ success: true }),
    };
    const nativeOverlayBridge = {
      presentSharedFrame: async (payload: Parameters<import('./sharedRendererRustVideoUploadPipeline').NativeOverlayDecodedFrameBridge['presentSharedFrame']>[0]) => {
        calls.push(['presentSharedFrame', payload.windowId, payload.mediaId]);
        return {
          success: true,
          attached: true,
          releaseFrame: {
            memoryId: payload.frame.descriptor.memoryId,
            slotIndex: payload.frame.descriptor.slotIndex,
            generation: payload.frame.descriptor.generation,
            ptsFrame: payload.frame.ptsFrame,
            copyOutState: 'gpuUploadFenceSignalled' as const,
          },
        };
      },
    };

    const baseInput = {
      windowId: 95,
      mediaId: 'video-scene-cleared',
      decodeResponse: decodedFrameResponse,
      slotCount: 2,
      nativeOverlayBridge,
      rustBackendBridge,
    };

    await presentNativeOverlayRustDecodedVideoFrame(baseInput);

    // 上位経路（Viewport の scene 空集合 effect）から呼ばれる dedicated 通知。
    // 関数名で「scene が空になった」という意図を明示する。
    const pipeline = await import('./sharedRendererRustVideoUploadPipeline');
    expect(typeof pipeline.notifyNativeOverlaySceneCleared).toBe('function');
    pipeline.notifyNativeOverlaySceneCleared(95);

    await presentNativeOverlayRustDecodedVideoFrame(baseInput);

    expect(calls).toEqual([
      ['presentSharedFrame', 95, 'video-scene-cleared'],
      ['presentSharedFrame', 95, 'video-scene-cleared'],
    ]);
  });

  it('copies a verified Rust decoded frame and releases the backend slot after GPU upload', async () => {
    const calls: unknown[] = [];
    const copyBridge: SharedVideoFrameCopyBridge = {
      copyIntoUploadBuffer: async (payload, target) => {
        calls.push(['copyIntoUploadBuffer', payload, target.byteLength]);
        target.fill(0x44);
        return {
          success: true,
          result: {
            sequence: payload.ptsFrame,
            slotIndex: payload.slotIndex,
            generation: payload.generation,
            byteLen: target.byteLength,
            expectedChecksum: 0x1234,
            actualChecksum: 0x1234,
          },
        };
      },
    };
    const rustBackendBridge: RustBackendVideoDecodeBridge = {
      startVideoDecode: async () => ({ success: true }),
      requestVideoDecodeFrame: async () => ({ success: true, result: decodedFrameResponse.result! }),
      releaseVideoDecodeFrame: async (payload) => {
        calls.push(['releaseVideoDecodeFrame', payload]);
        return { success: true, result: { released: true } };
      },
      stopVideoDecode: async () => ({ success: true }),
    };

    const upload = await prepareSharedRendererRustDecodedVideoUpload({
      decodeResponse: decodedFrameResponse,
      slotCount: 2,
      copyBridge,
      rustBackendBridge,
    });

    expect(upload.ok).toBe(true);
    if (!upload.ok) throw new Error('expected upload preparation to succeed');
    expect(upload.descriptor).toBe(decodedFrameResponse.result!.frame!.descriptor);
    expect(upload.ptsFrame).toBe(42);
    expect(upload.rgbaBytes.byteLength).toBe(512);
    expect(upload.rgbaBytes[0]).toBe(0x44);

    await upload.releaseAfterGpuUpload?.();

    expect(calls).toEqual([
      ['copyIntoUploadBuffer', {
        memoryId: '/uxfd-video-ring',
        slotCount: 2,
        slotByteLen: 512,
        slotIndex: 1,
        generation: 5,
        ptsFrame: 42,
      }, 512],
      ['releaseVideoDecodeFrame', {
        jobId: 'decode-job-1',
        slotIndex: 1,
        generation: 5,
        copyOutState: 'gpuUploadFenceSignalled',
      }],
    ]);
  });

  it('keeps Pixi fallback when Rust decode response is not a verified decoded frame', async () => {
    const upload = await prepareSharedRendererRustDecodedVideoUpload({
      decodeResponse: {
        success: true,
        result: {
          accepted: true,
          jobId: 'decode-job-1',
          requestId: 1,
          frameIndex: 42,
          mode: 'latestWins',
        },
      },
      slotCount: 2,
      copyBridge: {
        copyIntoUploadBuffer: async () => {
          throw new Error('copy must not run for unavailable decoded frames');
        },
      },
      rustBackendBridge: {
        startVideoDecode: async () => ({ success: true }),
        requestVideoDecodeFrame: async () => ({ success: true }),
        releaseVideoDecodeFrame: async () => ({ success: true }),
        stopVideoDecode: async () => ({ success: true }),
      },
    });

    expect(upload).toEqual({
      ok: false,
      reason: 'decodedFrameUnavailable',
      detail: 'Rust backend did not return a verified decoded video frame.',
    });
  });

  it('releases the decoded backend slot as aborted when shared memory copy fails', async () => {
    const calls: unknown[] = [];
    const upload = await prepareSharedRendererRustDecodedVideoUpload({
      decodeResponse: decodedFrameResponse,
      slotCount: 2,
      copyBridge: {
        copyIntoUploadBuffer: async () => ({
          success: false,
          error: 'copy failed',
        }),
      },
      rustBackendBridge: {
        startVideoDecode: async () => ({ success: true }),
        requestVideoDecodeFrame: async () => ({ success: true, result: decodedFrameResponse.result! }),
        releaseVideoDecodeFrame: async (payload) => {
          calls.push(['releaseVideoDecodeFrame', payload]);
          return { success: true };
        },
        stopVideoDecode: async () => ({ success: true }),
      },
    });

    expect(upload).toEqual({
      ok: false,
      reason: 'copyFailed',
      detail: 'copy failed',
    });
    expect(calls).toEqual([[
      'releaseVideoDecodeFrame',
      {
        jobId: 'decode-job-1',
        slotIndex: 1,
        generation: 5,
        copyOutState: 'rendererUploadAborted',
      },
    ]]);
  });

  it('uses Rust inline decoded RGBA as an MVP preview path when the native copy bridge is unavailable', async () => {
    const calls: unknown[] = [];
    const inlineBytes = new Uint8Array(512);
    inlineBytes.fill(0x77);
    const rustBackendBridge: RustBackendVideoDecodeBridge = {
      startVideoDecode: async () => ({ success: true }),
      requestVideoDecodeFrame: async () => ({ success: true, result: decodedFrameResponse.result! }),
      requestVideoDecodeFrameInline: async (payload) => {
        calls.push(['requestVideoDecodeFrameInline', payload]);
        return {
          success: true,
          result: {
            ...decodedFrameResponse.result!,
            frame: {
              ...decodedFrameResponse.result!.frame!,
              rgbaBytes: inlineBytes,
            },
          },
        };
      },
      releaseVideoDecodeFrame: async (payload) => {
        calls.push(['releaseVideoDecodeFrame', payload]);
        return { success: true, result: { released: true } };
      },
      stopVideoDecode: async () => ({ success: true }),
    };

    const upload = await prepareSharedRendererRustDecodedVideoUpload({
      decodeResponse: decodedFrameResponse,
      slotCount: 2,
      copyBridge: {
        copyIntoUploadBuffer: async () => ({
          success: false,
          error: 'Shared video frame native bridge is unavailable.',
        }),
      },
      rustBackendBridge,
    });

    expect(upload.ok).toBe(true);
    if (!upload.ok) throw new Error('expected upload preparation to succeed');
    expect(upload.rgbaBytes.byteLength).toBe(512);
    expect(upload.rgbaBytes[0]).toBe(0x77);

    await upload.releaseAfterGpuUpload?.();

    expect(calls).toEqual([
      ['requestVideoDecodeFrameInline', {
        jobId: 'decode-job-1',
        requestId: 99,
        frameIndex: 42,
        mode: 'latestWins',
      }],
      ['releaseVideoDecodeFrame', {
        jobId: 'decode-job-1',
        slotIndex: 1,
        generation: 5,
        copyOutState: 'gpuUploadFenceSignalled',
      }],
    ]);
  });

  it('uses Rust inline decoded RGBA when the native copy report checksum does not match the upload buffer', async () => {
    const calls: unknown[] = [];
    const inlineBytes = new Uint8Array(512);
    inlineBytes.fill(0x55);
    const rustBackendBridge: RustBackendVideoDecodeBridge = {
      startVideoDecode: async () => ({ success: true }),
      requestVideoDecodeFrame: async () => ({ success: true, result: decodedFrameResponse.result! }),
      requestVideoDecodeFrameInline: async (payload) => {
        calls.push(['requestVideoDecodeFrameInline', payload]);
        return {
          success: true,
          result: {
            ...decodedFrameResponse.result!,
            frame: {
              ...decodedFrameResponse.result!.frame!,
              rgbaBytes: inlineBytes,
            },
          },
        };
      },
      releaseVideoDecodeFrame: async (payload) => {
        calls.push(['releaseVideoDecodeFrame', payload]);
        return { success: true, result: { released: true } };
      },
      stopVideoDecode: async () => ({ success: true }),
    };

    const upload = await prepareSharedRendererRustDecodedVideoUpload({
      decodeResponse: decodedFrameResponse,
      slotCount: 2,
      copyBridge: {
        copyIntoUploadBuffer: async () => ({
          success: true,
          result: {
            sequence: 42,
            slotIndex: 1,
            generation: 5,
            byteLen: 512,
            checksumAlgorithm: 'crc32',
            expectedChecksum: 0x1234,
            actualChecksum: 0x5678,
          },
        }),
      },
      rustBackendBridge,
    });

    expect(upload.ok).toBe(true);
    if (!upload.ok) throw new Error('expected upload preparation to succeed');
    expect(upload.rgbaBytes[0]).toBe(0x55);

    await upload.releaseAfterGpuUpload?.();

    expect(calls).toEqual([
      ['requestVideoDecodeFrameInline', {
        jobId: 'decode-job-1',
        requestId: 99,
        frameIndex: 42,
        mode: 'latestWins',
      }],
      ['releaseVideoDecodeFrame', {
        jobId: 'decode-job-1',
        slotIndex: 1,
        generation: 5,
        copyOutState: 'gpuUploadFenceSignalled',
      }],
    ]);
  });

  it('releases the decoded backend slot as aborted when shared memory copy throws', async () => {
    const calls: unknown[] = [];

    await expect(prepareSharedRendererRustDecodedVideoUpload({
      decodeResponse: decodedFrameResponse,
      slotCount: 2,
      copyBridge: {
        copyIntoUploadBuffer: async () => {
          throw new Error('native copy exploded');
        },
      },
      rustBackendBridge: {
        startVideoDecode: async () => ({ success: true }),
        requestVideoDecodeFrame: async () => ({ success: true, result: decodedFrameResponse.result! }),
        releaseVideoDecodeFrame: async (payload) => {
          calls.push(['releaseVideoDecodeFrame', payload]);
          return { success: true };
        },
        stopVideoDecode: async () => ({ success: true }),
      },
    })).rejects.toThrow('native copy exploded');

    expect(calls).toEqual([[
      'releaseVideoDecodeFrame',
      {
        jobId: 'decode-job-1',
        slotIndex: 1,
        generation: 5,
        copyOutState: 'rendererUploadAborted',
      },
    ]]);
  });

  it('releases a decoded backend slot only once when GPU success and abort callbacks both run', async () => {
    const calls: unknown[] = [];
    const copyBridge: SharedVideoFrameCopyBridge = {
      copyIntoUploadBuffer: async (payload, target) => {
        calls.push(['copyIntoUploadBuffer', payload, target.byteLength]);
        target.fill(0x44);
        return {
          success: true,
          result: {
            sequence: payload.ptsFrame,
            slotIndex: payload.slotIndex,
            generation: payload.generation,
            byteLen: target.byteLength,
            expectedChecksum: 0x1234,
            actualChecksum: 0x1234,
          },
        };
      },
    };
    const rustBackendBridge: RustBackendVideoDecodeBridge = {
      startVideoDecode: async () => ({ success: true }),
      requestVideoDecodeFrame: async () => ({ success: true, result: decodedFrameResponse.result! }),
      releaseVideoDecodeFrame: async (payload) => {
        calls.push(['releaseVideoDecodeFrame', payload]);
        return { success: true, result: { released: true } };
      },
      stopVideoDecode: async () => ({ success: true }),
    };

    const upload = await prepareSharedRendererRustDecodedVideoUpload({
      decodeResponse: decodedFrameResponse,
      slotCount: 2,
      copyBridge,
      rustBackendBridge,
    });

    expect(upload.ok).toBe(true);
    if (!upload.ok) throw new Error('expected upload preparation to succeed');

    await upload.releaseAfterGpuUpload?.();
    await upload.releaseAfterUploadAbort?.();
    await upload.releaseAfterGpuUpload?.();

    const releaseCalls = calls.filter((call) =>
      Array.isArray(call) && call[0] === 'releaseVideoDecodeFrame');

    expect(releaseCalls).toEqual([[
      'releaseVideoDecodeFrame',
      {
        jobId: 'decode-job-1',
        slotIndex: 1,
        generation: 5,
        copyOutState: 'gpuUploadFenceSignalled',
      },
    ]]);
  });

  it('rejects the release callback when Rust decode slot release returns success false', async () => {
    const calls: unknown[] = [];
    const upload = await prepareSharedRendererRustDecodedVideoUpload({
      decodeResponse: decodedFrameResponse,
      slotCount: 2,
      copyBridge: {
        copyIntoUploadBuffer: async (_payload, target) => {
          target.fill(0x44);
          return {
            success: true,
            result: {
              sequence: 42,
              slotIndex: 1,
              generation: 5,
              byteLen: target.byteLength,
              expectedChecksum: 0x1234,
              actualChecksum: 0x1234,
            },
          };
        },
      },
      rustBackendBridge: {
        startVideoDecode: async () => ({ success: true }),
        requestVideoDecodeFrame: async () => ({ success: true, result: decodedFrameResponse.result! }),
        releaseVideoDecodeFrame: async (payload) => {
          calls.push(['releaseVideoDecodeFrame', payload]);
          return { success: false, error: 'decode slot release returned false' };
        },
        stopVideoDecode: async () => ({ success: true }),
      },
    });

    expect(upload.ok).toBe(true);
    if (!upload.ok) throw new Error('expected upload preparation to succeed');

    await expect(upload.releaseAfterGpuUpload?.()).rejects.toThrow('decode slot release returned false');
    expect(calls).toEqual([[
      'releaseVideoDecodeFrame',
      {
        jobId: 'decode-job-1',
        slotIndex: 1,
        generation: 5,
        copyOutState: 'gpuUploadFenceSignalled',
      },
    ]]);
  });
});
