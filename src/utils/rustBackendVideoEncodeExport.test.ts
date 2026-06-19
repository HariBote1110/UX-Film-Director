import { describe, expect, it } from 'vitest';
import {
  runRustBackendVideoEncodeExport,
} from './rustBackendVideoEncodeExport';
import type {
  RustBackendVideoEncodeBridge,
  RustBackendVideoEncodeWriteFramePayload,
} from './rustBackendVideoEncodeControl';
import type { RustBackendNativeRenderSharedFrameBridge } from './rustBackendNativeRenderControl';

const fakeBitmap = (label: string): ImageBitmap => ({ label }) as unknown as ImageBitmap;

async function* frames() {
  yield { timestamp: 0, bitmap: fakeBitmap('first') };
  yield { timestamp: 16_667, bitmap: fakeBitmap('second') };
}

const sharedFramePayload = (
  frameIndex: number,
  timestampUs: number,
  sessionId = 'session-shared'
): RustBackendVideoEncodeWriteFramePayload => ({
  sessionId,
  frameIndex,
  timestampUs,
  slotCount: 2,
  frame: {
    descriptor: {
      memoryId: '/uxfd-direct-shared-frame-ring',
      slotIndex: frameIndex % 2,
      generation: frameIndex + 1,
      byteOffset: frameIndex % 2 === 0 ? 0 : 512,
      byteLen: 512,
      width: 4,
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
    ptsFrame: frameIndex,
  },
});

describe('runRustBackendVideoEncodeExport', () => {
  it('rejects rendered bitmap frames instead of copying them through a writable ring', async () => {
    const calls: unknown[] = [];
    const encoderBridge: RustBackendVideoEncodeBridge = {
      startVideoEncode: async (payload) => {
        calls.push(['startVideoEncode', payload]);
        return { success: true, result: { accepted: true } };
      },
      writeVideoEncodeFrame: async (payload) => {
        calls.push(['writeVideoEncodeFrame', payload]);
        return { success: true, result: { accepted: true } };
      },
      finishVideoEncode: async (payload) => {
        calls.push(['finishVideoEncode', payload]);
        return { success: true, result: { outputFile: '/tmp/out.mp4' } };
      },
    };

    await expect(runRustBackendVideoEncodeExport({
      sessionId: 'session-1',
      filePath: '/tmp/out.mp4',
      width: 2,
      height: 1,
      fps: 60,
      // @ts-expect-error Rust backend encode runner must reject browser ImageBitmap frames at the type boundary.
      frames: frames(),
      encoderBridge,
    })).rejects.toThrow('Rust backend video encode export requires shared-frame payloads.');

    expect(calls).toEqual([
      ['startVideoEncode', {
        sessionId: 'session-1',
        filePath: '/tmp/out.mp4',
        width: 2,
        height: 1,
        fps: 60,
        pixelFormat: 'rgba8Srgb',
        colour: {
          primaries: 'bt709',
          transfer: 'srgb',
          matrix: 'rgb',
          range: 'full',
        },
      }],
    ]);
    expect(JSON.stringify(calls)).not.toContain('frameBase64');
    expect(JSON.stringify(calls)).not.toContain('createWritableSharedFrameRing');
    expect(JSON.stringify(calls)).not.toContain('writeIntoSharedFrameRing');
    expect(JSON.stringify(calls)).not.toContain('pixels');
  });

  it('passes a prepared mixed audio file path to Rust encode start', async () => {
    const calls: unknown[] = [];
    const encoderBridge: RustBackendVideoEncodeBridge = {
      startVideoEncode: async (payload) => {
        calls.push(['startVideoEncode', payload]);
        return { success: true, result: { accepted: true } };
      },
      writeVideoEncodeFrame: async (payload) => {
        calls.push(['writeVideoEncodeFrame', payload]);
        return { success: true, result: { accepted: true } };
      },
      finishVideoEncode: async (payload) => {
        calls.push(['finishVideoEncode', payload]);
        return { success: true, result: { outputFile: '/tmp/out.mp4' } };
      },
    };
    async function* audioSharedFrames() {
      yield { timestamp: 0, sharedFramePayload: sharedFramePayload(0, 0, 'session-audio') };
    }

    await runRustBackendVideoEncodeExport({
      sessionId: 'session-audio',
      filePath: '/tmp/out.mp4',
      audioPath: '/tmp/mixed-audio.wav',
      width: 2,
      height: 1,
      fps: 30,
      frames: audioSharedFrames(),
      encoderBridge,
    });

    expect(calls).toEqual([
      ['startVideoEncode', {
        sessionId: 'session-audio',
        filePath: '/tmp/out.mp4',
        audioPath: '/tmp/mixed-audio.wav',
        width: 2,
        height: 1,
        fps: 30,
        pixelFormat: 'rgba8Srgb',
        colour: {
          primaries: 'bt709',
          transfer: 'srgb',
          matrix: 'rgb',
          range: 'full',
        },
      }],
      ['writeVideoEncodeFrame', sharedFramePayload(0, 0, 'session-audio')],
      ['finishVideoEncode', {
        sessionId: 'session-audio',
      }],
    ]);
  });

  it('forwards prepacked shared-frame encode payloads without bitmap readback or writable-ring copy', async () => {
    const calls: unknown[] = [];
    const encoderBridge: RustBackendVideoEncodeBridge = {
      startVideoEncode: async (payload) => {
        calls.push(['startVideoEncode', payload]);
        return { success: true, result: { accepted: true } };
      },
      writeVideoEncodeFrame: async (payload) => {
        calls.push(['writeVideoEncodeFrame', payload]);
        return { success: true, result: { accepted: true } };
      },
      finishVideoEncode: async (payload) => {
        calls.push(['finishVideoEncode', payload]);
        return { success: true, result: { outputFile: '/tmp/out.mp4' } };
      },
    };
    async function* directSharedFrames() {
      yield { timestamp: 0, sharedFramePayload: sharedFramePayload(0, 0) };
      yield { timestamp: 16_667, sharedFramePayload: sharedFramePayload(1, 16_667) };
    }

    await expect(runRustBackendVideoEncodeExport({
      sessionId: 'session-shared',
      filePath: '/tmp/direct-shared.mp4',
      width: 4,
      height: 2,
      fps: 60,
      frames: directSharedFrames(),
      encoderBridge,
    })).resolves.toEqual({
      frameCount: 2,
      sessionId: 'session-shared',
      filePath: '/tmp/direct-shared.mp4',
    });

    expect(calls).toEqual([
      ['startVideoEncode', {
        sessionId: 'session-shared',
        filePath: '/tmp/direct-shared.mp4',
        width: 4,
        height: 2,
        fps: 60,
        pixelFormat: 'rgba8Srgb',
        colour: {
          primaries: 'bt709',
          transfer: 'srgb',
          matrix: 'rgb',
          range: 'full',
        },
      }],
      ['writeVideoEncodeFrame', sharedFramePayload(0, 0)],
      ['writeVideoEncodeFrame', sharedFramePayload(1, 16_667)],
      ['finishVideoEncode', {
        sessionId: 'session-shared',
      }],
    ]);
    const serialisedCalls = JSON.stringify(calls);
    expect(serialisedCalls).not.toContain('createWritableSharedFrameRing');
    expect(serialisedCalls).not.toContain('writeIntoSharedFrameRing');
    expect(serialisedCalls).not.toContain('frameBase64');
    expect(serialisedCalls).not.toContain('rgbaBytes');
    expect(serialisedCalls).not.toContain('pixels');
  });

  it('uses the Rust backend finish result as the authoritative export summary', async () => {
    const encoderBridge: RustBackendVideoEncodeBridge = {
      startVideoEncode: async () => ({ success: true, result: { started: true } }),
      writeVideoEncodeFrame: async () => ({ success: true, result: { written: true } }),
      finishVideoEncode: async () => ({
        success: true,
        result: {
          finished: true,
          sessionId: 'session-authoritative',
          filePath: '/tmp/backend-authoritative.mp4',
          frameCount: 7,
        },
      }),
    };
    async function* directSharedFrames() {
      yield { timestamp: 0, sharedFramePayload: sharedFramePayload(0, 0, 'session-authoritative') };
      yield { timestamp: 16_667, sharedFramePayload: sharedFramePayload(1, 16_667, 'session-authoritative') };
    }

    await expect(runRustBackendVideoEncodeExport({
      sessionId: 'session-authoritative',
      filePath: '/tmp/requested.mp4',
      width: 4,
      height: 2,
      fps: 60,
      frames: directSharedFrames(),
      encoderBridge,
    })).resolves.toEqual({
      frameCount: 7,
      sessionId: 'session-authoritative',
      filePath: '/tmp/backend-authoritative.mp4',
    });
  });

  it('releases native render output when encode write fails before Rust consumes it', async () => {
    const calls: unknown[] = [];
    const releaseEvents: unknown[] = [];
    const payload = sharedFramePayload(0, 0, 'session-native-failure');
    const encoderBridge: RustBackendVideoEncodeBridge = {
      startVideoEncode: async (input) => {
        calls.push(['startVideoEncode', input]);
        return { success: true, result: { accepted: true } };
      },
      writeVideoEncodeFrame: async (input) => {
        calls.push(['writeVideoEncodeFrame', input]);
        return { success: false, error: 'encode write failed before consuming native output' };
      },
      finishVideoEncode: async (input) => {
        calls.push(['finishVideoEncode', input]);
        return { success: true, result: { outputFile: '/tmp/out.mp4' } };
      },
    };
    const nativeRenderBridge: RustBackendNativeRenderSharedFrameBridge = {
      renderNativeSharedFrame: async () => {
        throw new Error('render must not run during encode cleanup.');
      },
      releaseNativeSharedFrame: async (input) => {
        calls.push(['releaseNativeSharedFrame', input]);
        return { success: true, result: { released: true, memoryId: input.memoryId } };
      },
    };

    async function* failingSharedFrames() {
      yield {
        timestamp: 0,
        sharedFramePayload: payload,
        releaseAfterEncodeFailure: {
          kind: 'nativeRenderOutput' as const,
          memoryId: payload.frame.descriptor.memoryId,
        },
      };
    }

    await expect(runRustBackendVideoEncodeExport({
      sessionId: 'session-native-failure',
      filePath: '/tmp/direct-shared.mp4',
      width: 4,
      height: 2,
      fps: 60,
      frames: failingSharedFrames(),
      encoderBridge,
      nativeRenderBridge,
      onNativeRenderOutputRelease: (event) => {
        releaseEvents.push(event);
      },
    })).rejects.toThrow('encode write failed before consuming native output');

    expect(calls).toEqual([
      ['startVideoEncode', {
        sessionId: 'session-native-failure',
        filePath: '/tmp/direct-shared.mp4',
        width: 4,
        height: 2,
        fps: 60,
        pixelFormat: 'rgba8Srgb',
        colour: {
          primaries: 'bt709',
          transfer: 'srgb',
          matrix: 'rgb',
          range: 'full',
        },
      }],
      ['writeVideoEncodeFrame', payload],
      ['releaseNativeSharedFrame', {
        memoryId: payload.frame.descriptor.memoryId,
      }],
    ]);
    expect(releaseEvents).toEqual([{
      status: 'released',
      memoryId: payload.frame.descriptor.memoryId,
      reason: 'encodeWriteFailed',
    }]);
  });

  it('reports missing native render release bridge when encode write fails before Rust consumes output', async () => {
    const calls: unknown[] = [];
    const releaseEvents: unknown[] = [];
    const payload = sharedFramePayload(0, 0, 'session-native-missing-release-bridge');
    const encoderBridge: RustBackendVideoEncodeBridge = {
      startVideoEncode: async (input) => {
        calls.push(['startVideoEncode', input]);
        return { success: true, result: { accepted: true } };
      },
      writeVideoEncodeFrame: async (input) => {
        calls.push(['writeVideoEncodeFrame', input]);
        return { success: false, error: 'encode write failed without release bridge' };
      },
      finishVideoEncode: async (input) => {
        calls.push(['finishVideoEncode', input]);
        return { success: true, result: { outputFile: '/tmp/out.mp4' } };
      },
    };

    async function* failingNativeFrames() {
      yield {
        timestamp: 0,
        sharedFramePayload: payload,
        releaseAfterEncodeFailure: {
          kind: 'nativeRenderOutput' as const,
          memoryId: payload.frame.descriptor.memoryId,
        },
      };
    }

    await expect(runRustBackendVideoEncodeExport({
      sessionId: 'session-native-missing-release-bridge',
      filePath: '/tmp/direct-shared.mp4',
      width: 4,
      height: 2,
      fps: 60,
      frames: failingNativeFrames(),
      encoderBridge,
      nativeRenderBridge: undefined,
      onNativeRenderOutputRelease: (event) => {
        releaseEvents.push(event);
      },
    })).rejects.toThrow('encode write failed without release bridge');

    expect(calls).toEqual([
      ['startVideoEncode', {
        sessionId: 'session-native-missing-release-bridge',
        filePath: '/tmp/direct-shared.mp4',
        width: 4,
        height: 2,
        fps: 60,
        pixelFormat: 'rgba8Srgb',
        colour: {
          primaries: 'bt709',
          transfer: 'srgb',
          matrix: 'rgb',
          range: 'full',
        },
      }],
      ['writeVideoEncodeFrame', payload],
    ]);
    expect(releaseEvents).toEqual([{
      status: 'missingBridge',
      memoryId: payload.frame.descriptor.memoryId,
      reason: 'encodeWriteFailed',
    }]);
  });

  it('reports native render output release failures without masking the encode write failure', async () => {
    const calls: unknown[] = [];
    const releaseEvents: unknown[] = [];
    const payload = sharedFramePayload(0, 0, 'session-native-release-failure');
    const encoderBridge: RustBackendVideoEncodeBridge = {
      startVideoEncode: async (input) => {
        calls.push(['startVideoEncode', input]);
        return { success: true, result: { accepted: true } };
      },
      writeVideoEncodeFrame: async (input) => {
        calls.push(['writeVideoEncodeFrame', input]);
        return { success: false, error: 'encode write failed before release failure' };
      },
      finishVideoEncode: async (input) => {
        calls.push(['finishVideoEncode', input]);
        return { success: true, result: { outputFile: '/tmp/out.mp4' } };
      },
    };
    const nativeRenderBridge: RustBackendNativeRenderSharedFrameBridge = {
      renderNativeSharedFrame: async () => {
        throw new Error('render must not run during encode cleanup.');
      },
      releaseNativeSharedFrame: async (input) => {
        calls.push(['releaseNativeSharedFrame', input]);
        throw new Error('native render output release rejected');
      },
    };

    async function* failingNativeFrames() {
      yield {
        timestamp: 0,
        sharedFramePayload: payload,
        releaseAfterEncodeFailure: {
          kind: 'nativeRenderOutput' as const,
          memoryId: payload.frame.descriptor.memoryId,
        },
      };
    }

    await expect(runRustBackendVideoEncodeExport({
      sessionId: 'session-native-release-failure',
      filePath: '/tmp/direct-shared.mp4',
      width: 4,
      height: 2,
      fps: 60,
      frames: failingNativeFrames(),
      encoderBridge,
      nativeRenderBridge,
      onNativeRenderOutputRelease: (event) => {
        releaseEvents.push(event);
      },
    })).rejects.toThrow('encode write failed before release failure');

    expect(calls).toEqual([
      ['startVideoEncode', {
        sessionId: 'session-native-release-failure',
        filePath: '/tmp/direct-shared.mp4',
        width: 4,
        height: 2,
        fps: 60,
        pixelFormat: 'rgba8Srgb',
        colour: {
          primaries: 'bt709',
          transfer: 'srgb',
          matrix: 'rgb',
          range: 'full',
        },
      }],
      ['writeVideoEncodeFrame', payload],
      ['releaseNativeSharedFrame', {
        memoryId: payload.frame.descriptor.memoryId,
      }],
    ]);
    expect(releaseEvents).toEqual([{
      status: 'failed',
      memoryId: payload.frame.descriptor.memoryId,
      reason: 'encodeWriteFailed',
      error: 'native render output release rejected',
    }]);
  });

  it('reports unsuccessful native render output release results as failures', async () => {
    const calls: unknown[] = [];
    const releaseEvents: unknown[] = [];
    const payload = sharedFramePayload(0, 0, 'session-native-release-unsuccessful');
    const encoderBridge: RustBackendVideoEncodeBridge = {
      startVideoEncode: async (input) => {
        calls.push(['startVideoEncode', input]);
        return { success: true, result: { accepted: true } };
      },
      writeVideoEncodeFrame: async (input) => {
        calls.push(['writeVideoEncodeFrame', input]);
        return { success: false, error: 'encode write failed before unsuccessful release' };
      },
      finishVideoEncode: async (input) => {
        calls.push(['finishVideoEncode', input]);
        return { success: true, result: { outputFile: '/tmp/out.mp4' } };
      },
    };
    const nativeRenderBridge: RustBackendNativeRenderSharedFrameBridge = {
      renderNativeSharedFrame: async () => {
        throw new Error('render must not run during encode cleanup.');
      },
      releaseNativeSharedFrame: async (input) => {
        calls.push(['releaseNativeSharedFrame', input]);
        return { success: false, error: 'native render output release returned false' };
      },
    };

    async function* failingNativeFrames() {
      yield {
        timestamp: 0,
        sharedFramePayload: payload,
        releaseAfterEncodeFailure: {
          kind: 'nativeRenderOutput' as const,
          memoryId: payload.frame.descriptor.memoryId,
        },
      };
    }

    await expect(runRustBackendVideoEncodeExport({
      sessionId: 'session-native-release-unsuccessful',
      filePath: '/tmp/direct-shared.mp4',
      width: 4,
      height: 2,
      fps: 60,
      frames: failingNativeFrames(),
      encoderBridge,
      nativeRenderBridge,
      onNativeRenderOutputRelease: (event) => {
        releaseEvents.push(event);
      },
    })).rejects.toThrow('encode write failed before unsuccessful release');

    expect(calls).toEqual([
      ['startVideoEncode', {
        sessionId: 'session-native-release-unsuccessful',
        filePath: '/tmp/direct-shared.mp4',
        width: 4,
        height: 2,
        fps: 60,
        pixelFormat: 'rgba8Srgb',
        colour: {
          primaries: 'bt709',
          transfer: 'srgb',
          matrix: 'rgb',
          range: 'full',
        },
      }],
      ['writeVideoEncodeFrame', payload],
      ['releaseNativeSharedFrame', {
        memoryId: payload.frame.descriptor.memoryId,
      }],
    ]);
    expect(releaseEvents).toEqual([{
      status: 'failed',
      memoryId: payload.frame.descriptor.memoryId,
      reason: 'encodeWriteFailed',
      error: 'native render output release returned false',
    }]);
  });

  it('does not release non-native shared frames through the native render release bridge when encode write fails', async () => {
    const calls: unknown[] = [];
    const payload = sharedFramePayload(0, 0, 'session-readback-failure');
    const encoderBridge: RustBackendVideoEncodeBridge = {
      startVideoEncode: async (input) => {
        calls.push(['startVideoEncode', input]);
        return { success: true, result: { accepted: true } };
      },
      writeVideoEncodeFrame: async (input) => {
        calls.push(['writeVideoEncodeFrame', input]);
        return { success: false, error: 'readback shared frame encode write failed' };
      },
      finishVideoEncode: async (input) => {
        calls.push(['finishVideoEncode', input]);
        return { success: true, result: { outputFile: '/tmp/out.mp4' } };
      },
    };
    const nativeRenderBridge: RustBackendNativeRenderSharedFrameBridge = {
      renderNativeSharedFrame: async () => {
        throw new Error('render must not run during encode cleanup.');
      },
      releaseNativeSharedFrame: async (input) => {
        calls.push(['releaseNativeSharedFrame', input]);
        return { success: true, result: { released: true, memoryId: input.memoryId } };
      },
    };

    async function* failingReadbackSharedFrames() {
      yield { timestamp: 0, sharedFramePayload: payload };
    }

    await expect(runRustBackendVideoEncodeExport({
      sessionId: 'session-readback-failure',
      filePath: '/tmp/direct-shared.mp4',
      width: 4,
      height: 2,
      fps: 60,
      frames: failingReadbackSharedFrames(),
      encoderBridge,
      nativeRenderBridge,
    })).rejects.toThrow('readback shared frame encode write failed');

    expect(calls).toEqual([
      ['startVideoEncode', {
        sessionId: 'session-readback-failure',
        filePath: '/tmp/direct-shared.mp4',
        width: 4,
        height: 2,
        fps: 60,
        pixelFormat: 'rgba8Srgb',
        colour: {
          primaries: 'bt709',
          transfer: 'srgb',
          matrix: 'rgb',
          range: 'full',
        },
      }],
      ['writeVideoEncodeFrame', payload],
    ]);
  });

  it('releases native render output when encode write rejects before Rust consumes it', async () => {
    const calls: unknown[] = [];
    const payload = sharedFramePayload(0, 0, 'session-native-reject');
    const encoderBridge: RustBackendVideoEncodeBridge = {
      startVideoEncode: async (input) => {
        calls.push(['startVideoEncode', input]);
        return { success: true, result: { accepted: true } };
      },
      writeVideoEncodeFrame: async (input) => {
        calls.push(['writeVideoEncodeFrame', input]);
        throw new Error('encode write rejected before consuming native output');
      },
      finishVideoEncode: async (input) => {
        calls.push(['finishVideoEncode', input]);
        return { success: true, result: { outputFile: '/tmp/out.mp4' } };
      },
    };
    const nativeRenderBridge: RustBackendNativeRenderSharedFrameBridge = {
      renderNativeSharedFrame: async () => {
        throw new Error('render must not run during encode cleanup.');
      },
      releaseNativeSharedFrame: async (input) => {
        calls.push(['releaseNativeSharedFrame', input]);
        return { success: true, result: { released: true, memoryId: input.memoryId } };
      },
    };

    async function* rejectingNativeFrames() {
      yield {
        timestamp: 0,
        sharedFramePayload: payload,
        releaseAfterEncodeFailure: {
          kind: 'nativeRenderOutput' as const,
          memoryId: payload.frame.descriptor.memoryId,
        },
      };
    }

    await expect(runRustBackendVideoEncodeExport({
      sessionId: 'session-native-reject',
      filePath: '/tmp/direct-shared.mp4',
      width: 4,
      height: 2,
      fps: 60,
      frames: rejectingNativeFrames(),
      encoderBridge,
      nativeRenderBridge,
    })).rejects.toThrow('encode write rejected before consuming native output');

    expect(calls).toEqual([
      ['startVideoEncode', {
        sessionId: 'session-native-reject',
        filePath: '/tmp/direct-shared.mp4',
        width: 4,
        height: 2,
        fps: 60,
        pixelFormat: 'rgba8Srgb',
        colour: {
          primaries: 'bt709',
          transfer: 'srgb',
          matrix: 'rgb',
          range: 'full',
        },
      }],
      ['writeVideoEncodeFrame', payload],
      ['releaseNativeSharedFrame', {
        memoryId: payload.frame.descriptor.memoryId,
      }],
    ]);
  });
});
