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

  it('rejects crc32 copy reports when the renderer upload buffer checksum does not match', async () => {
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
