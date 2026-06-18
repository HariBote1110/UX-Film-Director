import { describe, expect, it } from 'vitest';
import { renderProjectExportRustEncodeFrame } from './projectExportRustEncodeFrame';
import type { ProjectExportRustFrameSource } from './projectExportFrameCanvas';
import type { RustBackendVideoEncodeWriteFramePayload } from './rustBackendVideoEncodeControl';

const encodePayload = (
  sessionId: string,
  frameIndex: number,
  timestampUs: number
): RustBackendVideoEncodeWriteFramePayload => ({
  sessionId,
  frameIndex,
  timestampUs,
  slotCount: 2,
  frame: {
    descriptor: {
      memoryId: '/uxfd-direct-export-ring',
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

const request = {
  frameIndex: 3,
  timestampUs: 50_000,
  time: 0.05,
  width: 4,
  height: 2,
  objects: [],
};

describe('renderProjectExportRustEncodeFrame', () => {
  it('uses the frame source shared-frame encode path when Rust encoding prefers direct payloads', async () => {
    const calls: unknown[] = [];
    const payload = encodePayload('encode-session-1', 3, 50_000);
    const frameSource: ProjectExportRustFrameSource = {
      renderEncodeFrame: async (input) => {
        calls.push(input);
        return {
          timestamp: input.timestampUs,
          sharedFramePayload: payload,
        };
      },
    };

    await expect(renderProjectExportRustEncodeFrame({
      frameSource,
      request,
      encodeSessionId: 'encode-session-1',
      preferSharedFrame: true,
    })).resolves.toEqual({
      timestamp: 50_000,
      sharedFramePayload: payload,
    });

    expect(calls).toEqual([{
      ...request,
      encodeSessionId: 'encode-session-1',
    }]);
  });

  it('uses ImageBitmap rendering only when shared-frame payloads are not required', async () => {
    const bitmap = { close: () => undefined } as ImageBitmap;
    const calls: unknown[] = [];
    const frameSource: ProjectExportRustFrameSource = {
      renderFrame: async (input) => {
        calls.push(input);
        return bitmap;
      },
    };

    await expect(renderProjectExportRustEncodeFrame({
      frameSource,
      request,
      encodeSessionId: 'encode-session-1',
      preferSharedFrame: false,
    })).resolves.toEqual({
      timestamp: 50_000,
      bitmap,
    });

    expect(calls).toEqual([request]);
  });

  it('fails when Rust encoding requires shared-frame payloads but the source has no direct encode path', async () => {
    const frameSource: ProjectExportRustFrameSource = {
      renderFrame: async () => {
        throw new Error('ImageBitmap fallback must not run for Rust direct encoding');
      },
    };

    await expect(renderProjectExportRustEncodeFrame({
      frameSource,
      request,
      encodeSessionId: 'encode-session-1',
      preferSharedFrame: true,
    })).rejects.toThrow('Rust backend encoding requires a shared-frame export source.');
  });
});
