import { describe, expect, it } from 'vitest';
import {
  createRustBackendVideoEncodeSharedFrameWriter,
  type RustBackendVideoEncodeSharedFrameWritableBridge,
} from './rustBackendVideoEncodeSharedFrameWriter';

describe('rustBackendVideoEncodeSharedFrameWriter', () => {
  it('pads tight RGBA rows into a writable shared frame ring and returns Rust encode payload metadata only', async () => {
    const calls: unknown[] = [];
    const bridge: RustBackendVideoEncodeSharedFrameWritableBridge = {
      createWritableSharedFrameRing: async (payload) => {
        calls.push(['createWritableSharedFrameRing', payload]);
        return { success: true, result: payload };
      },
      writeIntoSharedFrameRing: async (payload, source) => {
        calls.push([
          'writeIntoSharedFrameRing',
          payload,
          source.byteLength,
          Array.from(source.slice(0, 14)),
          Array.from(source.slice(256, 270)),
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

    const writer = await createRustBackendVideoEncodeSharedFrameWriter({
      sessionId: 'encode-1',
      memoryId: '/uxfd-export-ring',
      width: 3,
      height: 2,
      fps: 60,
      bridge,
    });

    const rgba = Uint8Array.from([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
      13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24,
    ]);
    const payload = await writer.writeFrame({
      frameIndex: 7,
      timestampUs: 116_667,
      rgbaBytes: rgba,
    });
    await writer.close();

    expect(payload).toEqual({
      sessionId: 'encode-1',
      frameIndex: 7,
      timestampUs: 116_667,
      slotCount: 1,
      frame: {
        descriptor: {
          memoryId: '/uxfd-export-ring',
          slotIndex: 0,
          generation: 8,
          byteOffset: 0,
          byteLen: 512,
          width: 3,
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
        ptsFrame: 7,
      },
    });
    expect(calls).toEqual([
      ['createWritableSharedFrameRing', {
        memoryId: '/uxfd-export-ring',
        slotCount: 1,
        slotByteLen: 512,
      }],
      ['writeIntoSharedFrameRing', {
        memoryId: '/uxfd-export-ring',
        ptsFrame: 7,
      }, 512, [
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 0, 0,
      ], [
        13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 0, 0,
      ]],
      ['closeWritableSharedFrameRing', {
        memoryId: '/uxfd-export-ring',
      }],
    ]);
    expect(JSON.stringify(calls)).not.toContain('frameBase64');
    expect(JSON.stringify(calls)).not.toContain('pixels');
  });

  it('writes already padded RGBA rows without repacking for WebGPU readback frames', async () => {
    const calls: unknown[] = [];
    const bridge: RustBackendVideoEncodeSharedFrameWritableBridge = {
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
          Array.from(source.slice(256, 266)),
        ]);
        return {
          success: true,
          result: {
            sequence: payload.ptsFrame,
            byteLen: source.byteLength,
            checksum: 0x5678,
          },
        };
      },
      closeWritableSharedFrameRing: async (payload) => {
        calls.push(['closeWritableSharedFrameRing', payload]);
        return { success: true, result: payload };
      },
    };
    const writer = await createRustBackendVideoEncodeSharedFrameWriter({
      sessionId: 'encode-webgpu-readback',
      memoryId: '/uxfd-export-readback-ring',
      width: 2,
      height: 2,
      fps: 60,
      bridge,
    });

    const padded = new Uint8Array(512);
    padded.set([1, 2, 3, 4, 5, 6, 7, 8], 0);
    padded.set([9, 10, 11, 12, 13, 14, 15, 16], 256);
    const payload = await writer.writePaddedFrame({
      frameIndex: 4,
      timestampUs: 66_667,
      paddedRgbaBytes: padded,
      strideBytes: 256,
    });
    await writer.close();

    expect(payload).toEqual({
      sessionId: 'encode-webgpu-readback',
      frameIndex: 4,
      timestampUs: 66_667,
      slotCount: 1,
      frame: {
        descriptor: {
          memoryId: '/uxfd-export-readback-ring',
          slotIndex: 0,
          generation: 5,
          byteOffset: 0,
          byteLen: 512,
          width: 2,
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
        ptsFrame: 4,
      },
    });
    expect(calls).toEqual([
      ['createWritableSharedFrameRing', {
        memoryId: '/uxfd-export-readback-ring',
        slotCount: 1,
        slotByteLen: 512,
      }],
      ['writeIntoSharedFrameRing', {
        memoryId: '/uxfd-export-readback-ring',
        ptsFrame: 4,
      }, 512, [1, 2, 3, 4, 5, 6, 7, 8, 0, 0], [9, 10, 11, 12, 13, 14, 15, 16, 0, 0]],
      ['closeWritableSharedFrameRing', {
        memoryId: '/uxfd-export-readback-ring',
      }],
    ]);
  });
});
