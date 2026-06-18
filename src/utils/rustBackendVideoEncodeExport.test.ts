import { describe, expect, it } from 'vitest';
import {
  runRustBackendVideoEncodeExport,
  type RustBackendVideoEncodeBitmapToRgbaBytes,
} from './rustBackendVideoEncodeExport';
import type { RustBackendVideoEncodeBridge } from './rustBackendVideoEncodeControl';
import type { SharedVideoFrameWritableBridge } from './sharedVideoFrameWritableBridge';

const fakeBitmap = (label: string): ImageBitmap => ({ label }) as unknown as ImageBitmap;

async function* frames() {
  yield { timestamp: 0, bitmap: fakeBitmap('first') };
  yield { timestamp: 16_667, bitmap: fakeBitmap('second') };
}

describe('runRustBackendVideoEncodeExport', () => {
  it('streams rendered bitmaps through writable shared frames into the Rust backend encoder', async () => {
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
    const sharedFrameBridge: SharedVideoFrameWritableBridge = {
      createWritableSharedFrameRing: async (payload) => {
        calls.push(['createWritableSharedFrameRing', payload]);
        return { success: true, result: payload };
      },
      writeIntoSharedFrameRing: async (payload, source) => {
        calls.push([
          'writeIntoSharedFrameRing',
          payload,
          source.byteLength,
          Array.from(source.slice(0, 10)),
        ]);
        return {
          success: true,
          result: {
            sequence: payload.ptsFrame,
            byteLen: source.byteLength,
            checksum: 0x1234,
          },
        };
      },
      closeWritableSharedFrameRing: async (payload) => {
        calls.push(['closeWritableSharedFrameRing', payload]);
        return { success: true, result: payload };
      },
    };
    const extractRgbaBytes: RustBackendVideoEncodeBitmapToRgbaBytes = async (bitmap) => {
      calls.push(['extractRgbaBytes', (bitmap as unknown as { label: string }).label]);
      return Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]);
    };

    await expect(runRustBackendVideoEncodeExport({
      sessionId: 'session-1',
      memoryId: '/uxfd-export-ring',
      filePath: '/tmp/out.mp4',
      width: 2,
      height: 1,
      fps: 60,
      frames: frames(),
      encoderBridge,
      sharedFrameBridge,
      extractRgbaBytes,
    })).resolves.toEqual({
      frameCount: 2,
      sessionId: 'session-1',
      filePath: '/tmp/out.mp4',
    });

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
      ['createWritableSharedFrameRing', {
        memoryId: '/uxfd-export-ring',
        slotCount: 1,
        slotByteLen: 256,
      }],
      ['extractRgbaBytes', 'first'],
      ['writeIntoSharedFrameRing', {
        memoryId: '/uxfd-export-ring',
        ptsFrame: 0,
      }, 256, [1, 2, 3, 4, 5, 6, 7, 8, 0, 0]],
      ['writeVideoEncodeFrame', {
        sessionId: 'session-1',
        frameIndex: 0,
        timestampUs: 0,
        slotCount: 1,
        frame: {
          descriptor: {
            memoryId: '/uxfd-export-ring',
            slotIndex: 0,
            generation: 1,
            byteOffset: 0,
            byteLen: 256,
            width: 2,
            height: 1,
            strideBytes: 256,
            format: 'rgba8Srgb',
            colour: {
              primaries: 'bt709',
              transfer: 'srgb',
              matrix: 'rgb',
              range: 'full',
            },
          },
          ptsFrame: 0,
        },
      }],
      ['extractRgbaBytes', 'second'],
      ['writeIntoSharedFrameRing', {
        memoryId: '/uxfd-export-ring',
        ptsFrame: 1,
      }, 256, [1, 2, 3, 4, 5, 6, 7, 8, 0, 0]],
      ['writeVideoEncodeFrame', {
        sessionId: 'session-1',
        frameIndex: 1,
        timestampUs: 16_667,
        slotCount: 1,
        frame: {
          descriptor: {
            memoryId: '/uxfd-export-ring',
            slotIndex: 0,
            generation: 2,
            byteOffset: 0,
            byteLen: 256,
            width: 2,
            height: 1,
            strideBytes: 256,
            format: 'rgba8Srgb',
            colour: {
              primaries: 'bt709',
              transfer: 'srgb',
              matrix: 'rgb',
              range: 'full',
            },
          },
          ptsFrame: 1,
        },
      }],
      ['closeWritableSharedFrameRing', {
        memoryId: '/uxfd-export-ring',
      }],
      ['finishVideoEncode', {
        sessionId: 'session-1',
      }],
    ]);
    expect(JSON.stringify(calls)).not.toContain('frameBase64');
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
    const sharedFrameBridge: SharedVideoFrameWritableBridge = {
      createWritableSharedFrameRing: async (payload) => {
        calls.push(['createWritableSharedFrameRing', payload]);
        return { success: true, result: payload };
      },
      writeIntoSharedFrameRing: async (payload, source) => {
        calls.push(['writeIntoSharedFrameRing', payload, source.byteLength]);
        return {
          success: true,
          result: {
            sequence: payload.ptsFrame,
            byteLen: source.byteLength,
            checksum: 0x1234,
          },
        };
      },
      closeWritableSharedFrameRing: async (payload) => {
        calls.push(['closeWritableSharedFrameRing', payload]);
        return { success: true, result: payload };
      },
    };

    await runRustBackendVideoEncodeExport({
      sessionId: 'session-audio',
      memoryId: '/uxfd-export-audio-ring',
      filePath: '/tmp/out.mp4',
      audioPath: '/tmp/mixed-audio.wav',
      width: 2,
      height: 1,
      fps: 30,
      frames: frames(),
      encoderBridge,
      sharedFrameBridge,
      extractRgbaBytes: async () => Uint8Array.from([9, 8, 7, 6, 5, 4, 3, 2]),
    });

    expect(calls[0]).toEqual(['startVideoEncode', {
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
    }]);
  });
});
