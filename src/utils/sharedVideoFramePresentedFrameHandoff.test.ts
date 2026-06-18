import { describe, expect, it } from 'vitest';
import type { RustBackendVideoEncodeWriteFramePayload } from './rustBackendVideoEncodeControl';
import {
  createSharedVideoFramePresentedFrameTaker,
  isSharedVideoFramePresentedFrameBridgeAvailable,
} from './sharedVideoFramePresentedFrameHandoff';

const payload: RustBackendVideoEncodeWriteFramePayload = {
  sessionId: 'native-handoff-session',
  frameIndex: 12,
  timestampUs: 200_000,
  slotCount: 1,
  frame: {
    descriptor: {
      memoryId: '/uxfd-export-source-native-handoff-session',
      slotIndex: 0,
      generation: 13,
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
    ptsFrame: 12,
  },
};

describe('sharedVideoFramePresentedFrameHandoff', () => {
  it('creates no handoff taker when the native bridge method is unavailable', () => {
    expect(isSharedVideoFramePresentedFrameBridgeAvailable({})).toBe(false);
    expect(createSharedVideoFramePresentedFrameTaker({})).toBeNull();
  });

  it('creates no handoff taker when the native bridge capability declines presented-frame handoff', () => {
    const bridge = {
      getPresentedFrameHandoffCapabilities: () => ({
        available: false,
        reason: 'WebGPU texture handoff is not implemented.',
      }),
      takePresentedFrameSharedFrame: async () => ({
        success: true,
        result: payload,
      }),
    };

    expect(isSharedVideoFramePresentedFrameBridgeAvailable(bridge)).toBe(false);
    expect(createSharedVideoFramePresentedFrameTaker(bridge)).toBeNull();
  });

  it('uses the native bridge presented-frame method when available', async () => {
    const calls: unknown[] = [];
    const bridge = {
      getPresentedFrameHandoffCapabilities: () => ({
        available: true,
      }),
      takePresentedFrameSharedFrame: async (input: unknown) => {
        calls.push(input);
        return {
          success: true,
          result: payload,
        };
      },
    };
    const taker = createSharedVideoFramePresentedFrameTaker(bridge);

    expect(isSharedVideoFramePresentedFrameBridgeAvailable(bridge)).toBe(true);
    expect(taker).not.toBeNull();
    await expect(taker?.({
      encodeSessionId: 'native-handoff-session',
      memoryId: '/uxfd-export-source-native-handoff-session',
      frameIndex: 12,
      timestampUs: 200_000,
      width: 2,
      height: 2,
      fps: 60,
      device: 'gpu-device',
      texture: 'presented-texture',
      format: 'bgra8unorm',
      canvasSize: {
        width: 2,
        height: 2,
      },
    })).resolves.toBe(payload);

    expect(calls).toEqual([{
      encodeSessionId: 'native-handoff-session',
      memoryId: '/uxfd-export-source-native-handoff-session',
      frameIndex: 12,
      timestampUs: 200_000,
      width: 2,
      height: 2,
      fps: 60,
      device: 'gpu-device',
      texture: 'presented-texture',
      format: 'bgra8unorm',
      canvasSize: {
        width: 2,
        height: 2,
      },
    }]);
  });

  it('returns null from the taker when the native bridge declines the handoff', async () => {
    const taker = createSharedVideoFramePresentedFrameTaker({
      takePresentedFrameSharedFrame: async () => ({
        success: false,
        error: 'Native WebGPU frame handoff is unavailable.',
      }),
    });

    await expect(taker?.({
      encodeSessionId: 'native-handoff-session',
      memoryId: '/uxfd-export-source-native-handoff-session',
      frameIndex: 12,
      timestampUs: 200_000,
      width: 2,
      height: 2,
      fps: 60,
      device: 'gpu-device',
      texture: 'presented-texture',
      format: 'bgra8unorm',
      canvasSize: {
        width: 2,
        height: 2,
      },
    })).resolves.toBeNull();
  });
});
