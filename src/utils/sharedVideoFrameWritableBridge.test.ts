import { describe, expect, it } from 'vitest';
import {
  closeWritableSharedFrameRing,
  createWritableSharedFrameRing,
  writeIntoSharedFrameRing,
  type SharedVideoFrameWritableBridge,
} from './sharedVideoFrameWritableBridge';

describe('sharedVideoFrameWritableBridge', () => {
  it('creates, writes, and closes writable shared frame rings without JSON frame payloads', async () => {
    const calls: unknown[] = [];
    const bridge: SharedVideoFrameWritableBridge = {
      createWritableSharedFrameRing: async (payload) => {
        calls.push(['createWritableSharedFrameRing', payload]);
        return {
          success: true,
          result: payload,
        };
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
        return {
          success: true,
          result: payload,
        };
      },
    };

    await expect(createWritableSharedFrameRing({
      memoryId: '/uxfd-export-ring',
      slotCount: 2,
      slotByteLen: 4096,
    }, bridge)).resolves.toEqual({
      success: true,
      result: {
        memoryId: '/uxfd-export-ring',
        slotCount: 2,
        slotByteLen: 4096,
      },
    });

    const source = new Uint8Array(4096);
    source.fill(0x7a);
    await expect(writeIntoSharedFrameRing({
      memoryId: '/uxfd-export-ring',
      ptsFrame: 12,
    }, source, bridge)).resolves.toEqual({
      success: true,
      result: {
        sequence: 12,
        byteLen: 4096,
        checksum: 0x1234,
      },
    });

    await expect(closeWritableSharedFrameRing({
      memoryId: '/uxfd-export-ring',
    }, bridge)).resolves.toEqual({
      success: true,
      result: {
        memoryId: '/uxfd-export-ring',
      },
    });

    expect(calls).toEqual([
      ['createWritableSharedFrameRing', {
        memoryId: '/uxfd-export-ring',
        slotCount: 2,
        slotByteLen: 4096,
      }],
      ['writeIntoSharedFrameRing', {
        memoryId: '/uxfd-export-ring',
        ptsFrame: 12,
      }, 4096],
      ['closeWritableSharedFrameRing', {
        memoryId: '/uxfd-export-ring',
      }],
    ]);
    expect(JSON.stringify(calls)).not.toContain('frameBase64');
    expect(JSON.stringify(calls)).not.toContain('rgbaBytes');
    expect(JSON.stringify(calls)).not.toContain('pixels');
  });
});
