import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getSharedVideoFrameUploadPathDiagnostics,
  markSharedUploadWriteTextureRejected,
  prepareSharedRendererDecodedVideoFrameUpload,
  resetSharedVideoFrameUploadPathForTest,
  type SharedVideoFrameCopyBridge,
} from './sharedVideoFrameUploadBridge';
import type { RustBackendSharedVideoFrame } from './rustBackendVideoDecodeControl';

const sharedFrame: RustBackendSharedVideoFrame = {
  descriptor: {
    memoryId: '/uxfd-test-ring',
    slotIndex: 1,
    generation: 9,
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
};

describe('sharedVideoFrameUploadBridge', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    resetSharedVideoFrameUploadPathForTest();
  });


  it('copies a shared Rust frame into a renderer-owned upload buffer without putting bytes in the control payload', async () => {
    const calls: unknown[] = [];
    const bridge: SharedVideoFrameCopyBridge = {
      copyIntoUploadBuffer: async (payload, target) => {
        calls.push(['copyIntoUploadBuffer', payload, target.byteLength]);
        target.fill(0x5a);
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

    const releaseCalls: string[] = [];
    const upload = await prepareSharedRendererDecodedVideoFrameUpload({
      sharedFrame,
      slotCount: 2,
      bridge,
      releaseAfterGpuUpload: async () => {
        releaseCalls.push('release');
      },
    });

    expect(upload).toMatchObject({
      ok: true,
      descriptor: sharedFrame.descriptor,
      ptsFrame: sharedFrame.ptsFrame,
      copyReport: {
        sequence: 42,
        slotIndex: 1,
        generation: 9,
        byteLen: 512,
        expectedChecksum: 0x1234,
        actualChecksum: 0x1234,
      },
    });
    if (!upload.ok) throw new Error('expected upload preparation to succeed');
    expect(upload.rgbaBytes).toBeInstanceOf(Uint8Array);
    expect(upload.rgbaBytes.byteLength).toBe(sharedFrame.descriptor.byteLen);
    expect(upload.rgbaBytes[0]).toBe(0x5a);
    await upload.releaseAfterGpuUpload?.();
    expect(releaseCalls).toEqual(['release']);
    expect(calls).toEqual([[
      'copyIntoUploadBuffer',
      {
        memoryId: '/uxfd-test-ring',
        slotCount: 2,
        slotByteLen: 512,
        slotIndex: 1,
        generation: 9,
        ptsFrame: 42,
      },
      512,
    ]]);
    expect(JSON.stringify(calls[0])).not.toContain('rgbaBytes');
    expect(JSON.stringify(calls[0])).not.toContain('pixels');
    expect(JSON.stringify(calls[0])).not.toContain('frameBase64');
  });

  it('reuses the same renderer-owned upload buffer across successive copies of the same byte length', async () => {
    // move毎の `new Uint8Array(8.3MB)` 割当てはGCがサンプルの約13%を占める要因
    // だった（実測）。WebGPU `device.queue.writeTexture` はbytesを同期的に
    // GPUへ書き込み終えてから戻る（sharedRendererWebGpuPresenter.ts）ため、
    // uploadVideoFrameTexture呼び出しが終わった時点でrgbaBytesはもう参照され
    // ない。presenter再起動はsingle-flightで直列に呼ばれる経路のため、同じ
    // byteLenが続く限り前回のバッファを再利用しても安全。
    const bridge: SharedVideoFrameCopyBridge = {
      copyIntoUploadBuffer: async (_payload, target) => ({
        success: true,
        result: {
          sequence: 42,
          slotIndex: 1,
          generation: 9,
          byteLen: target.byteLength,
          expectedChecksum: 0x1234,
          actualChecksum: 0x1234,
        },
      }),
    };

    const first = await prepareSharedRendererDecodedVideoFrameUpload({
      sharedFrame,
      slotCount: 2,
      bridge,
    });
    const second = await prepareSharedRendererDecodedVideoFrameUpload({
      sharedFrame,
      slotCount: 2,
      bridge,
    });

    if (!first.ok || !second.ok) throw new Error('expected both uploads to succeed');
    expect(second.rgbaBytes).toBe(first.rgbaBytes);
  });

  it('allocates a fresh upload buffer when the descriptor byte length changes', async () => {
    const bridge: SharedVideoFrameCopyBridge = {
      copyIntoUploadBuffer: async (payload, target) => ({
        success: true,
        result: {
          sequence: payload.ptsFrame,
          slotIndex: payload.slotIndex,
          generation: payload.generation,
          byteLen: target.byteLength,
          expectedChecksum: 0x1234,
          actualChecksum: 0x1234,
        },
      }),
    };

    const first = await prepareSharedRendererDecodedVideoFrameUpload({
      sharedFrame,
      slotCount: 2,
      bridge,
    });
    const largerSharedFrame: RustBackendSharedVideoFrame = {
      ...sharedFrame,
      descriptor: {
        ...sharedFrame.descriptor,
        slotIndex: 0,
        byteOffset: 0,
        byteLen: 1024,
      },
    };
    const second = await prepareSharedRendererDecodedVideoFrameUpload({
      sharedFrame: largerSharedFrame,
      slotCount: 2,
      bridge,
    });

    if (!first.ok || !second.ok) throw new Error('expected both uploads to succeed');
    expect(second.rgbaBytes).not.toBe(first.rgbaBytes);
    expect(second.rgbaBytes.byteLength).toBe(1024);
  });

  it('rejects bridge copy reports that do not match the descriptor byte length', async () => {
    const bridge: SharedVideoFrameCopyBridge = {
      copyIntoUploadBuffer: async () => ({
        success: true,
        result: {
          sequence: 42,
          slotIndex: 1,
          generation: 9,
          byteLen: 511,
          expectedChecksum: 0x1234,
          actualChecksum: 0x1234,
        },
      }),
    };

    await expect(prepareSharedRendererDecodedVideoFrameUpload({
      sharedFrame,
      slotCount: 2,
      bridge,
    })).resolves.toEqual({
      ok: false,
      reason: 'copyReportByteLengthMismatch',
      detail: 'Shared video frame copy report must match the decoded frame descriptor.',
      expectedByteLength: 512,
      actualByteLength: 511,
    });
  });

  it('rejects bridge copy reports that do not match the descriptor slot lease', async () => {
    const bridge: SharedVideoFrameCopyBridge = {
      copyIntoUploadBuffer: async () => ({
        success: true,
        result: {
          sequence: 42,
          slotIndex: 0,
          generation: 8,
          byteLen: 512,
          expectedChecksum: 0x1234,
          actualChecksum: 0x1234,
        },
      }),
    };

    await expect(prepareSharedRendererDecodedVideoFrameUpload({
      sharedFrame,
      slotCount: 2,
      bridge,
    })).resolves.toEqual({
      ok: false,
      reason: 'copyReportSlotLeaseMismatch',
      detail: 'Shared video frame copy report must match the decoded frame descriptor slot lease.',
      expectedSlotIndex: 1,
      actualSlotIndex: 0,
      expectedGeneration: 9,
      actualGeneration: 8,
    });
  });

  it('rejects bridge copy reports that do not match the decoded frame sequence', async () => {
    const bridge: SharedVideoFrameCopyBridge = {
      copyIntoUploadBuffer: async () => ({
        success: true,
        result: {
          sequence: 41,
          slotIndex: 1,
          generation: 9,
          byteLen: 512,
          expectedChecksum: 0x1234,
          actualChecksum: 0x1234,
        },
      }),
    };

    await expect(prepareSharedRendererDecodedVideoFrameUpload({
      sharedFrame,
      slotCount: 2,
      bridge,
    })).resolves.toEqual({
      ok: false,
      reason: 'copyReportSequenceMismatch',
      detail: 'Shared video frame copy report must match the decoded frame pts.',
      expectedSequence: 42,
      actualSequence: 41,
    });
  });

  it('rejects bridge copy reports whose checksum verification failed', async () => {
    const bridge: SharedVideoFrameCopyBridge = {
      copyIntoUploadBuffer: async () => ({
        success: true,
        result: {
          sequence: 42,
          slotIndex: 1,
          generation: 9,
          byteLen: 512,
          expectedChecksum: 0x1234,
          actualChecksum: 0x5678,
        },
      }),
    };

    await expect(prepareSharedRendererDecodedVideoFrameUpload({
      sharedFrame,
      slotCount: 2,
      bridge,
    })).resolves.toEqual({
      ok: false,
      reason: 'copyReportChecksumMismatch',
      detail: 'Shared video frame copy report checksum verification failed.',
      expectedChecksum: 0x1234,
      actualChecksum: 0x5678,
    });
  });

  it('rejects crc32 copy reports when the renderer upload buffer checksum does not match, but only when JS-side CRC verification is explicitly opted in', async () => {
    // JS側の全画素CRC32再計算は、move毎に8.3MB(1920x1080x4)を舐める重い処理で
    // ドラッグ中プレビューのCPU self timeの47%を占めていた（実測）。
    // Rust側(shared-video-frame-bridge-node/src/lib.rs)がcopy report生成時に
    // 既にexpected/actual checksumを計算・照合済みで、その結果は
    // `copyReportChecksumMismatch`（response.result.expectedChecksum vs
    // actualChecksum の比較のみ、再計算なし）で軽量にfail-loud化されている。
    // このJS再計算は「native bridgeが返したbytesをrendererが実際に受け取れたか」
    // を疑う三重目の診断であり、通常運用では不要。デフォルトでは走らせず、
    // 診断が必要な時だけ VITE_UXFD_UPLOAD_CRC_VERIFY=1 でopt-inする。
    vi.stubEnv('VITE_UXFD_UPLOAD_CRC_VERIFY', '1');
    const bridge: SharedVideoFrameCopyBridge = {
      copyIntoUploadBuffer: async (_payload, target) => {
        target.fill(0x7e);
        return {
          success: true,
          result: {
            sequence: 42,
            slotIndex: 1,
            generation: 9,
            byteLen: 512,
            checksumAlgorithm: 'crc32',
            expectedChecksum: 0x1234,
            actualChecksum: 0x1234,
          },
        };
      },
    };

    await expect(prepareSharedRendererDecodedVideoFrameUpload({
      sharedFrame,
      slotCount: 2,
      bridge,
    })).resolves.toMatchObject({
      ok: false,
      reason: 'copyReportTargetChecksumMismatch',
      detail: 'Shared video frame upload buffer checksum must match the copy report.',
      expectedChecksum: 0x1234,
      actualChecksum: expect.any(Number),
    });
  });

  it('skips the JS-side CRC32 recompute by default even when the copy report checksum would not match the buffer', async () => {
    const bridge: SharedVideoFrameCopyBridge = {
      copyIntoUploadBuffer: async (_payload, target) => {
        target.fill(0x7e);
        return {
          success: true,
          result: {
            sequence: 42,
            slotIndex: 1,
            generation: 9,
            byteLen: 512,
            checksumAlgorithm: 'crc32',
            expectedChecksum: 0x1234,
            actualChecksum: 0x1234,
          },
        };
      },
    };

    const upload = await prepareSharedRendererDecodedVideoFrameUpload({
      sharedFrame,
      slotCount: 2,
      bridge,
    });

    expect(upload.ok).toBe(true);
  });

  it('does not recompute the JS-side CRC32 when the flag is off (opt-in diagnostic stays cold by default)', async () => {
    const crc32Spy = vi.fn();
    const bridge: SharedVideoFrameCopyBridge = {
      copyIntoUploadBuffer: async (_payload, target) => {
        // 呼び出し毎に全画素を書き換えて、CRC計算が行われれば毎回異なる値に
        // なるようにしておく。デフォルト(flag off)ではこの値は一切参照されない。
        target.fill(0x01);
        crc32Spy();
        return {
          success: true,
          result: {
            sequence: 42,
            slotIndex: 1,
            generation: 9,
            byteLen: 512,
            checksumAlgorithm: 'crc32',
            expectedChecksum: 0x1234,
            actualChecksum: 0x1234,
          },
        };
      },
    };

    const upload = await prepareSharedRendererDecodedVideoFrameUpload({
      sharedFrame,
      slotCount: 2,
      bridge,
    });

    expect(upload.ok).toBe(true);
    expect(crc32Spy).toHaveBeenCalledTimes(1);
  });

  it('accepts a context-bridge copied upload buffer outside the copy report payload', async () => {
    const copiedBytes = new Uint8Array(sharedFrame.descriptor.byteLen);
    copiedBytes.fill(0x7e);
    const checksum = crc32ForTest(copiedBytes);
    const bridge: SharedVideoFrameCopyBridge = {
      copyIntoUploadBuffer: async () => ({
        success: true,
        copiedBytes,
        result: {
          sequence: 42,
          slotIndex: 1,
          generation: 9,
          byteLen: sharedFrame.descriptor.byteLen,
          checksumAlgorithm: 'crc32',
          expectedChecksum: checksum,
          actualChecksum: checksum,
        },
      } as any),
    };

    const upload = await prepareSharedRendererDecodedVideoFrameUpload({
      sharedFrame,
      slotCount: 2,
      bridge,
    });

    expect(upload).toMatchObject({
      ok: true,
      copyReport: {
        checksumAlgorithm: 'crc32',
        expectedChecksum: checksum,
        actualChecksum: checksum,
      },
    });
    if (!upload.ok) throw new Error('expected upload preparation to succeed');
    expect(upload.rgbaBytes[0]).toBe(0x7e);
    expect(JSON.stringify(upload.copyReport)).not.toContain('copiedBytes');
    expect(JSON.stringify(upload.copyReport)).not.toContain('rgbaBytes');
  });

  it('rejects bridge copy reports that use an unsupported checksum algorithm', async () => {
    const bridge: SharedVideoFrameCopyBridge = {
      copyIntoUploadBuffer: async () => ({
        success: true,
        result: {
          sequence: 42,
          slotIndex: 1,
          generation: 9,
          byteLen: 512,
          checksumAlgorithm: 'adler32',
          expectedChecksum: 0x1234,
          actualChecksum: 0x1234,
        } as any,
      }),
    };

    await expect(prepareSharedRendererDecodedVideoFrameUpload({
      sharedFrame,
      slotCount: 2,
      bridge,
    })).resolves.toEqual({
      ok: false,
      reason: 'copyReportChecksumAlgorithmUnsupported',
      detail: 'Shared video frame copy report checksum algorithm must be crc32.',
      checksumAlgorithm: 'adler32',
    });
  });

  it('rejects descriptors outside the declared shared ring before copying bytes', async () => {
    const calls: unknown[] = [];
    const bridge: SharedVideoFrameCopyBridge = {
      copyIntoUploadBuffer: async () => {
        calls.push('copyIntoUploadBuffer');
        return {
          success: true,
          result: {
            sequence: 42,
            slotIndex: 2,
            generation: 9,
            byteLen: sharedFrame.descriptor.byteLen,
            expectedChecksum: 0x1234,
            actualChecksum: 0x1234,
          },
        };
      },
    };

    await expect(prepareSharedRendererDecodedVideoFrameUpload({
      sharedFrame: {
        ...sharedFrame,
        descriptor: {
          ...sharedFrame.descriptor,
          slotIndex: 2,
          byteOffset: sharedFrame.descriptor.byteLen * 2,
        },
      },
      slotCount: 2,
      bridge,
    })).resolves.toEqual({
      ok: false,
      reason: 'descriptorOutsideSharedRingLayout',
      detail: 'Shared video frame descriptor points outside the declared ring layout.',
    });
    expect(calls).toEqual([]);
  });

  it('rejects copy reports that return pixel bytes instead of mutating the renderer target', async () => {
    const returnedBytes = new Uint8Array(sharedFrame.descriptor.byteLen);
    returnedBytes.fill(0x7e);
    const bridge: SharedVideoFrameCopyBridge = {
      copyIntoUploadBuffer: async () => ({
        success: true,
        result: {
          sequence: 42,
          slotIndex: 1,
          generation: 9,
          byteLen: sharedFrame.descriptor.byteLen,
          expectedChecksum: 0x1234,
          actualChecksum: 0x1234,
          rgbaBytes: returnedBytes,
        } as any,
      }),
    };

    const upload = await prepareSharedRendererDecodedVideoFrameUpload({
      sharedFrame,
      slotCount: 2,
      bridge,
    });

    expect(upload).toEqual({
      ok: false,
      reason: 'copyReportContainsPixelPayload',
      detail: 'Shared video frame copy report must not return pixel bytes through the control plane.',
    });
  });

  describe('SharedArrayBuffer zero-copy upload path', () => {
    // ElectronのcontextBridgeはSAB（およびSABバックのview）を引数として
    // クローンできない（"An object could not be cloned." — 実機確認済み）。
    // そのためSAB本体はwindow.postMessage（本物の構造化クローン、バッキング
    // メモリ共有）で一回だけpreloadへ登録し、以後のcopy呼び出しはbufferIdの
    // 文字列参照だけをcontextBridge越しに渡す。この登録+参照プロトコルを
    // bridge interfaceとして固定する。
    const successReport = (payload: { ptsFrame: number; slotIndex: number; generation: number }, byteLen: number) => ({
      success: true as const,
      result: {
        sequence: payload.ptsFrame,
        slotIndex: payload.slotIndex,
        generation: payload.generation,
        byteLen,
        checksumAlgorithm: 'crc32' as const,
        expectedChecksum: 0x1234,
        actualChecksum: 0x1234,
      },
    });

    // preload側のSAB登録簿を模したモック。registerで受けたSABのviewを保持し、
    // copyはbufferId参照でそのviewへ書き込む（実preloadと同じ動き）。
    const buildSharedBridge = ({
      fillValue = 0x5a,
      onRegister,
      onSharedCopy,
      onLegacyCopy,
    }: {
      fillValue?: number;
      onRegister?: () => void;
      onSharedCopy?: (payload: unknown) => void;
      onLegacyCopy?: () => void;
    } = {}) => {
      const registered = new Map<string, Uint8Array>();
      const bridge: SharedVideoFrameCopyBridge = {
        copyIntoUploadBuffer: async (payload, target) => {
          onLegacyCopy?.();
          target.fill(0x7c);
          return successReport(payload, target.byteLength);
        },
        registerSharedUploadBuffer: async ({ bufferId, buffer }) => {
          onRegister?.();
          registered.set(bufferId, new Uint8Array(buffer));
          return { success: true };
        },
        copyIntoSharedUploadBuffer: async (payload) => {
          onSharedCopy?.(payload);
          const view = registered.get(payload.sharedUploadBufferId);
          if (!view) {
            return {
              success: false,
              sharedUploadUnavailable: true,
              error: 'Shared upload buffer is not registered.',
            };
          }
          view.fill(fillValue);
          return successReport(payload, view.byteLength);
        },
      };
      return { bridge, registered };
    };

    it('copies through a registered SharedArrayBuffer without passing pixel bytes or views across the bridge', async () => {
      const sharedCalls: unknown[] = [];
      let legacyCalls = 0;
      const { bridge } = buildSharedBridge({
        onSharedCopy: (payload) => sharedCalls.push(payload),
        onLegacyCopy: () => { legacyCalls += 1; },
      });

      const upload = await prepareSharedRendererDecodedVideoFrameUpload({
        sharedFrame,
        slotCount: 2,
        bridge,
      });

      if (!upload.ok) throw new Error('expected shared upload preparation to succeed');
      expect(legacyCalls).toBe(0);
      expect(sharedCalls).toHaveLength(1);
      expect(sharedCalls[0]).toMatchObject({
        memoryId: '/uxfd-test-ring',
        slotCount: 2,
        slotByteLen: 512,
        slotIndex: 1,
        generation: 9,
        ptsFrame: 42,
        sharedUploadBufferId: expect.any(String),
      });
      // copy呼び出しのpayloadに画素・viewが乗らない（control planeは参照のみ）
      const payloadJson = JSON.stringify(sharedCalls[0]);
      expect(payloadJson).not.toContain('rgbaBytes');
      expect(payloadJson).not.toContain('pixels');
      // SABバッキングのviewがそのままrendererへ返る＝zero-copy
      expect(upload.rgbaBytes.buffer).toBeInstanceOf(SharedArrayBuffer);
      expect(upload.rgbaBytes[0]).toBe(0x5a);
      expect(upload.rgbaBytes.byteLength).toBe(sharedFrame.descriptor.byteLen);
      expect(getSharedVideoFrameUploadPathDiagnostics()).toMatchObject({
        lastMode: 'sharedArrayBufferZeroCopy',
        sharedCopyCount: 1,
        legacyCopyCount: 0,
        sharedUploadFallbackReason: null,
      });
    });

    it('registers each ring buffer once and alternates between two SharedArrayBuffers', async () => {
      let registerCount = 0;
      const { bridge } = buildSharedBridge({
        onRegister: () => { registerCount += 1; },
      });

      const first = await prepareSharedRendererDecodedVideoFrameUpload({ sharedFrame, slotCount: 2, bridge });
      const second = await prepareSharedRendererDecodedVideoFrameUpload({ sharedFrame, slotCount: 2, bridge });
      const third = await prepareSharedRendererDecodedVideoFrameUpload({ sharedFrame, slotCount: 2, bridge });

      if (!first.ok || !second.ok || !third.ok) throw new Error('expected all shared uploads to succeed');
      // ring=2: 前フレームのwriteTextureが遅延しても次のコピーが同じバッファを
      // 上書きしないよう交互に使う。登録はSAB確保時の一回きり。
      expect(second.rgbaBytes).not.toBe(first.rgbaBytes);
      expect(third.rgbaBytes).toBe(first.rgbaBytes);
      expect(registerCount).toBe(2);
    });

    it('falls back to the legacy copy path and latches when the shared entry reports sharedUploadUnavailable', async () => {
      let sharedCallCount = 0;
      let legacyCallCount = 0;
      const bridge: SharedVideoFrameCopyBridge = {
        copyIntoUploadBuffer: async (payload, target) => {
          legacyCallCount += 1;
          target.fill(0x7c);
          return successReport(payload, target.byteLength);
        },
        registerSharedUploadBuffer: async () => ({ success: true }),
        copyIntoSharedUploadBuffer: async () => {
          sharedCallCount += 1;
          return {
            success: false,
            sharedUploadUnavailable: true,
            error: 'Shared video frame native bridge shared-upload entry is unavailable.',
          };
        },
      };

      const first = await prepareSharedRendererDecodedVideoFrameUpload({ sharedFrame, slotCount: 2, bridge });
      const second = await prepareSharedRendererDecodedVideoFrameUpload({ sharedFrame, slotCount: 2, bridge });

      if (!first.ok || !second.ok) throw new Error('expected both uploads to succeed via the legacy path');
      expect(first.rgbaBytes[0]).toBe(0x7c);
      expect(sharedCallCount).toBe(1);
      expect(legacyCallCount).toBe(2);
      expect(getSharedVideoFrameUploadPathDiagnostics()).toMatchObject({
        lastMode: 'legacyCopy',
        sharedUploadFallbackReason: expect.stringContaining('unavailable'),
      });
    });

    it('falls back to the legacy copy path and latches when the shared entry throws', async () => {
      let sharedCallCount = 0;
      let legacyCallCount = 0;
      const bridge: SharedVideoFrameCopyBridge = {
        copyIntoUploadBuffer: async (payload, target) => {
          legacyCallCount += 1;
          return successReport(payload, target.byteLength);
        },
        registerSharedUploadBuffer: async () => ({ success: true }),
        copyIntoSharedUploadBuffer: async () => {
          sharedCallCount += 1;
          throw new Error('An object could not be cloned.');
        },
      };

      const first = await prepareSharedRendererDecodedVideoFrameUpload({ sharedFrame, slotCount: 2, bridge });
      const second = await prepareSharedRendererDecodedVideoFrameUpload({ sharedFrame, slotCount: 2, bridge });

      if (!first.ok || !second.ok) throw new Error('expected both uploads to succeed via the legacy path');
      expect(sharedCallCount).toBe(1);
      expect(legacyCallCount).toBe(2);
      expect(getSharedVideoFrameUploadPathDiagnostics()).toMatchObject({
        lastMode: 'legacyCopy',
        sharedUploadFallbackReason: expect.stringContaining('cloned'),
      });
    });

    it('falls back to the legacy copy path and latches when the buffer registration fails', async () => {
      let registerCount = 0;
      let legacyCallCount = 0;
      const bridge: SharedVideoFrameCopyBridge = {
        copyIntoUploadBuffer: async (payload, target) => {
          legacyCallCount += 1;
          return successReport(payload, target.byteLength);
        },
        registerSharedUploadBuffer: async () => {
          registerCount += 1;
          return { success: false, error: 'registration ack timed out' };
        },
        copyIntoSharedUploadBuffer: async () => {
          throw new Error('copy must not be attempted without a registered buffer');
        },
      };

      const first = await prepareSharedRendererDecodedVideoFrameUpload({ sharedFrame, slotCount: 2, bridge });
      const second = await prepareSharedRendererDecodedVideoFrameUpload({ sharedFrame, slotCount: 2, bridge });

      if (!first.ok || !second.ok) throw new Error('expected both uploads to succeed via the legacy path');
      expect(registerCount).toBe(1);
      expect(legacyCallCount).toBe(2);
      expect(getSharedVideoFrameUploadPathDiagnostics()).toMatchObject({
        lastMode: 'legacyCopy',
        sharedUploadFallbackReason: expect.stringContaining('registration'),
      });
    });

    it('keeps the copy report contract on the shared path without falling back on genuine copy errors', async () => {
      let legacyCallCount = 0;
      const bridge: SharedVideoFrameCopyBridge = {
        copyIntoUploadBuffer: async (payload, target) => {
          legacyCallCount += 1;
          return successReport(payload, target.byteLength);
        },
        registerSharedUploadBuffer: async () => ({ success: true }),
        copyIntoSharedUploadBuffer: async () => ({
          success: true,
          result: {
            sequence: 42,
            slotIndex: 1,
            generation: 9,
            byteLen: 512,
            expectedChecksum: 0x1234,
            actualChecksum: 0x5678,
          },
        }),
      };

      await expect(prepareSharedRendererDecodedVideoFrameUpload({
        sharedFrame,
        slotCount: 2,
        bridge,
      })).resolves.toEqual({
        ok: false,
        reason: 'copyReportChecksumMismatch',
        detail: 'Shared video frame copy report checksum verification failed.',
        expectedChecksum: 0x1234,
        actualChecksum: 0x5678,
      });
      expect(legacyCallCount).toBe(0);
    });

    it('uses the legacy copy path when the SharedArrayBuffer constructor is unavailable', async () => {
      vi.stubGlobal('SharedArrayBuffer', undefined);
      let sharedCallCount = 0;
      let legacyCallCount = 0;
      const { bridge } = buildSharedBridge({
        onSharedCopy: () => { sharedCallCount += 1; },
        onLegacyCopy: () => { legacyCallCount += 1; },
      });

      const upload = await prepareSharedRendererDecodedVideoFrameUpload({ sharedFrame, slotCount: 2, bridge });

      expect(upload.ok).toBe(true);
      expect(sharedCallCount).toBe(0);
      expect(legacyCallCount).toBe(1);
    });

    it('stages the SharedArrayBuffer bytes into a pooled non-shared buffer once writeTexture rejected shared views', async () => {
      markSharedUploadWriteTextureRejected('writeTexture rejected a SharedArrayBuffer-backed view.');
      const { bridge } = buildSharedBridge({ fillValue: 0x3d });

      const first = await prepareSharedRendererDecodedVideoFrameUpload({ sharedFrame, slotCount: 2, bridge });
      const second = await prepareSharedRendererDecodedVideoFrameUpload({ sharedFrame, slotCount: 2, bridge });

      if (!first.ok || !second.ok) throw new Error('expected staged shared uploads to succeed');
      // writeTextureへ渡すviewは非共有バッファ（SAB→staging 1回の.setは許容コスト）
      expect(first.rgbaBytes.buffer).not.toBeInstanceOf(SharedArrayBuffer);
      expect(first.rgbaBytes[0]).toBe(0x3d);
      expect(first.rgbaBytes.byteLength).toBe(sharedFrame.descriptor.byteLen);
      // stagingバッファはプールされ、move毎の新規割当てを発生させない
      expect(second.rgbaBytes).toBe(first.rgbaBytes);
      expect(getSharedVideoFrameUploadPathDiagnostics()).toMatchObject({
        lastMode: 'sharedArrayBufferStaged',
        writeTextureRejectedDetail: expect.stringContaining('writeTexture'),
      });
    });
  });
});

const crc32ForTest = (bytes: Uint8Array): number => {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = crc32TableForTest[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const crc32TableForTest = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let crc = i;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
    }
    table[i] = crc >>> 0;
  }
  return table;
})();
