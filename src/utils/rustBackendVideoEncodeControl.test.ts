import { describe, expect, it } from 'vitest';
import {
  isRustBackendVideoEncodeBridgeAvailable,
  startRustBackendVideoEncode,
  writeRustBackendVideoEncodeFrame,
  writeRustBackendVideoEncodeNativeFrame,
  finishRustBackendVideoEncode,
  abortRustBackendVideoEncode,
  type RustBackendVideoEncodeBridge,
} from './rustBackendVideoEncodeControl';

const bridge = (): {
  calls: unknown[];
  bridge: RustBackendVideoEncodeBridge;
} => {
  const calls: unknown[] = [];
  return {
    calls,
    bridge: {
      startVideoEncode: async (payload) => {
        calls.push(['startVideoEncode', payload]);
        return { success: true, result: { sessionId: payload.sessionId } };
      },
      writeVideoEncodeFrame: async (payload) => {
        calls.push(['writeVideoEncodeFrame', payload]);
        return { success: true, result: { written: true, frameIndex: payload.frameIndex } };
      },
      writeNativeEncodeFrame: async (payload) => {
        calls.push(['writeNativeEncodeFrame', payload]);
        return { success: true, result: { written: true, writtenNativeFrame: true, frameIndex: payload.frameIndex } };
      },
      finishVideoEncode: async (payload) => {
        calls.push(['finishVideoEncode', payload]);
        return { success: true, result: { filePath: '/tmp/output.mp4' } };
      },
      abortVideoEncode: async (payload) => {
        calls.push(['abortVideoEncode', payload]);
        return { success: true, result: { aborted: true } };
      },
    },
  };
};

describe('rustBackendVideoEncodeControl', () => {
  it('detects whether the Rust video encode bridge is available', () => {
    expect(isRustBackendVideoEncodeBridgeAvailable(bridge().bridge)).toBe(true);
    expect(isRustBackendVideoEncodeBridgeAvailable(undefined)).toBe(false);
    expect(isRustBackendVideoEncodeBridgeAvailable({
      startVideoEncode: async () => ({ success: true }),
    })).toBe(false);
    expect(isRustBackendVideoEncodeBridgeAvailable({
      startVideoEncode: async () => ({ success: true }),
      writeVideoEncodeFrame: async () => ({ success: true }),
      finishVideoEncode: async () => ({ success: true }),
      abortVideoEncode: async () => ({ success: true }),
    })).toBe(true);
  });

  it('starts a Rust video encode session with metadata only', async () => {
    const mocked = bridge();

    const response = await startRustBackendVideoEncode({
      sessionId: 'encode-1',
      filePath: '/tmp/output.mp4',
      width: 1920,
      height: 1080,
      fps: 60,
      pixelFormat: 'rgba8Srgb',
      colour: {
        primaries: 'bt709',
        transfer: 'srgb',
        matrix: 'rgb',
        range: 'full',
      },
    }, mocked.bridge);

    expect(response).toEqual({ success: true, result: { sessionId: 'encode-1' } });
    expect(mocked.calls).toEqual([[
      'startVideoEncode',
      {
        sessionId: 'encode-1',
        filePath: '/tmp/output.mp4',
        width: 1920,
        height: 1080,
        fps: 60,
        pixelFormat: 'rgba8Srgb',
        colour: {
          primaries: 'bt709',
          transfer: 'srgb',
          matrix: 'rgb',
          range: 'full',
        },
      },
    ]]);
    expect(JSON.stringify(mocked.calls)).not.toContain('frameBase64');
  });

  it('writes encoded frames by shared memory descriptor rather than JSON pixel payloads', async () => {
    const mocked = bridge();

    await writeRustBackendVideoEncodeFrame({
      sessionId: 'encode-1',
      frameIndex: 42,
      timestampUs: 700_000,
      slotCount: 2,
      frame: {
        descriptor: {
          memoryId: '/uxfd-export-frame-ring',
          slotIndex: 1,
          generation: 3,
          byteOffset: 4096,
          byteLen: 8192,
          width: 1920,
          height: 1080,
          strideBytes: 7680,
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
    }, mocked.bridge);

    expect(mocked.calls).toEqual([[
      'writeVideoEncodeFrame',
      {
        sessionId: 'encode-1',
        frameIndex: 42,
        timestampUs: 700_000,
        slotCount: 2,
        frame: {
          descriptor: {
            memoryId: '/uxfd-export-frame-ring',
            slotIndex: 1,
            generation: 3,
            byteOffset: 4096,
            byteLen: 8192,
            width: 1920,
            height: 1080,
            strideBytes: 7680,
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
      },
    ]]);
    expect(JSON.stringify(mocked.calls)).not.toContain('rgbaBytes');
  });

  it('writes native render frames directly without an output shared memory descriptor', async () => {
    const mocked = bridge();
    const payload = {
      sessionId: 'encode-1',
      renderId: 'encode-1-frame-42',
      frameIndex: 42,
      timestampUs: 700_000,
      width: 1920,
      height: 1080,
      snapshot: {
        frame_index: 42,
        colour: {
          profile: 'rec709-sdr',
          working_space: 'linear-light',
          alpha: 'premultiplied',
        },
        clips: [],
      },
      media: [],
      sources: [],
    } as const;

    await writeRustBackendVideoEncodeNativeFrame(payload, mocked.bridge);

    expect(mocked.calls).toEqual([[
      'writeNativeEncodeFrame',
      payload,
    ]]);
    expect(JSON.stringify(mocked.calls)).not.toContain('memoryId');
    expect(JSON.stringify(mocked.calls)).not.toContain('rgbaBytes');
  });

  it('finishes the Rust video encode session by session id', async () => {
    const mocked = bridge();

    const response = await finishRustBackendVideoEncode({
      sessionId: 'encode-1',
    }, mocked.bridge);

    expect(response).toEqual({ success: true, result: { filePath: '/tmp/output.mp4' } });
    expect(mocked.calls).toEqual([[
      'finishVideoEncode',
      {
        sessionId: 'encode-1',
      },
    ]]);
  });

  it('aborts the Rust video encode session by session id', async () => {
    const mocked = bridge();

    const response = await abortRustBackendVideoEncode({
      sessionId: 'encode-1',
    }, mocked.bridge);

    expect(response).toEqual({ success: true, result: { aborted: true } });
    expect(mocked.calls).toEqual([[
      'abortVideoEncode',
      {
        sessionId: 'encode-1',
      },
    ]]);
  });
});
