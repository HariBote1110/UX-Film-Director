import { describe, expect, it } from 'vitest';
import {
  prepareSharedRendererDecodedVideoFrameUpload,
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
        ptsFrame: 42,
      },
      512,
    ]]);
    expect(JSON.stringify(calls[0])).not.toContain('rgbaBytes');
    expect(JSON.stringify(calls[0])).not.toContain('pixels');
    expect(JSON.stringify(calls[0])).not.toContain('frameBase64');
  });

  it('rejects bridge copy reports that do not match the descriptor byte length', async () => {
    const bridge: SharedVideoFrameCopyBridge = {
      copyIntoUploadBuffer: async () => ({
        success: true,
        result: {
          sequence: 42,
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

  it('rejects descriptors outside the declared shared ring before copying bytes', async () => {
    const calls: unknown[] = [];
    const bridge: SharedVideoFrameCopyBridge = {
      copyIntoUploadBuffer: async () => {
        calls.push('copyIntoUploadBuffer');
        return {
          success: true,
          result: {
            sequence: 42,
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
});
