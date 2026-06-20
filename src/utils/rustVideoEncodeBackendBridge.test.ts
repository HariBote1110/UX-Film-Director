import { describe, expect, it } from 'vitest';
import {
  finishRustVideoEncodeViaBackend,
  abortRustVideoEncodeViaBackend,
  startRustVideoEncodeViaBackend,
  writeRustVideoEncodeFrameViaBackend,
  writeRustVideoEncodeNativeFrameViaBackend,
  type RustBackendCaller,
} from '../../electron/rustVideoEncodeBackendBridge';

const startPayload = {
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
} as const;

const sharedFramePayload = {
  sessionId: 'encode-1',
  frameIndex: 42,
  timestampUs: 700_000,
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
} as const;

const finishPayload = {
  sessionId: 'encode-1',
} as const;

const nativeFramePayload = {
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

const abortPayload = {
  sessionId: 'encode-1',
} as const;

const createBackendCaller = (result: unknown = { accepted: true }): {
  calls: Array<{ method: string; params: unknown; timeoutMs: number | undefined }>;
  callRustBackend: RustBackendCaller;
} => {
  const calls: Array<{ method: string; params: unknown; timeoutMs: number | undefined }> = [];
  return {
    calls,
    callRustBackend: async (method, params, timeoutMs) => {
      calls.push({ method, params, timeoutMs });
      return result;
    },
  };
};

describe('rustVideoEncodeBackendBridge', () => {
  it('routes encode start metadata to the Rust backend encode.start RPC', async () => {
    const backend = createBackendCaller({ sessionId: 'encode-1' });

    const response = await startRustVideoEncodeViaBackend(startPayload, backend.callRustBackend);

    expect(response).toEqual({ success: true, result: { sessionId: 'encode-1' } });
    expect(backend.calls).toEqual([{
      method: 'encode.start',
      params: startPayload,
      timeoutMs: 120_000,
    }]);
    expect(JSON.stringify(backend.calls)).not.toContain('start-export');
  });

  it('routes frame writes by shared memory descriptor rather than legacy frame bytes', async () => {
    const backend = createBackendCaller({ written: true, frameIndex: 42 });

    const response = await writeRustVideoEncodeFrameViaBackend(
      sharedFramePayload,
      backend.callRustBackend
    );

    expect(response).toEqual({ success: true, result: { written: true, frameIndex: 42 } });
    expect(backend.calls).toEqual([{
      method: 'encode.writeFrame',
      params: sharedFramePayload,
      timeoutMs: 20_000,
    }]);
    const serialisedCalls = JSON.stringify(backend.calls);
    expect(serialisedCalls).not.toContain('write-frame');
    expect(serialisedCalls).not.toContain('export.write_frame');
    expect(serialisedCalls).not.toContain('frameBase64');
    expect(serialisedCalls).not.toContain('rgbaBytes');
  });

  it('routes native render frame writes directly to encode.writeNativeFrame', async () => {
    const backend = createBackendCaller({ written: true, writtenNativeFrame: true, frameIndex: 42 });

    const response = await writeRustVideoEncodeNativeFrameViaBackend(
      nativeFramePayload,
      backend.callRustBackend
    );

    expect(response).toEqual({
      success: true,
      result: { written: true, writtenNativeFrame: true, frameIndex: 42 },
    });
    expect(backend.calls).toEqual([{
      method: 'encode.writeNativeFrame',
      params: nativeFramePayload,
      timeoutMs: 20_000,
    }]);
    const serialisedCalls = JSON.stringify(backend.calls);
    expect(serialisedCalls).not.toContain('render.nativeSharedFrame');
    expect(serialisedCalls).not.toContain('memoryId');
    expect(serialisedCalls).not.toContain('frameBase64');
    expect(serialisedCalls).not.toContain('rgbaBytes');
  });

  it('routes finish to the Rust backend encode.finish RPC', async () => {
    const backend = createBackendCaller({ filePath: '/tmp/output.mp4' });

    const response = await finishRustVideoEncodeViaBackend(finishPayload, backend.callRustBackend);

    expect(response).toEqual({ success: true, result: { filePath: '/tmp/output.mp4' } });
    expect(backend.calls).toEqual([{
      method: 'encode.finish',
      params: finishPayload,
      timeoutMs: 60_000,
    }]);
    expect(JSON.stringify(backend.calls)).not.toContain('end-export');
  });

  it('routes abort to the Rust backend encode.abort RPC', async () => {
    const backend = createBackendCaller({ aborted: true });

    const response = await abortRustVideoEncodeViaBackend(abortPayload, backend.callRustBackend);

    expect(response).toEqual({ success: true, result: { aborted: true } });
    expect(backend.calls).toEqual([{
      method: 'encode.abort',
      params: abortPayload,
      timeoutMs: 10_000,
    }]);
    expect(JSON.stringify(backend.calls)).not.toContain('end-export');
  });

  it('maps Rust backend failures into the renderer bridge result shape', async () => {
    const callRustBackend: RustBackendCaller = async () => {
      throw new Error('Rust shared-frame video encoder backend is not connected yet.');
    };

    await expect(
      startRustVideoEncodeViaBackend(startPayload, callRustBackend)
    ).resolves.toEqual({
      success: false,
      error: 'Rust shared-frame video encoder backend is not connected yet.',
    });
  });
});
