import { describe, expect, it } from 'vitest';
import {
  releaseRustBackendVideoDecodeFrame,
  requestRustBackendVideoDecodeFrame,
  startRustBackendVideoDecode,
  type RustBackendVideoDecodeBridge,
} from './rustBackendVideoDecodeControl';

const bridge = (): {
  calls: unknown[];
  bridge: RustBackendVideoDecodeBridge;
} => {
  const calls: unknown[] = [];
  return {
    calls,
    bridge: {
      startVideoDecode: async (payload) => {
        calls.push(['startVideoDecode', payload]);
        return { success: true, result: { jobId: payload.jobId } };
      },
      requestVideoDecodeFrame: async (payload) => {
        calls.push(['requestVideoDecodeFrame', payload]);
        return { success: true, result: { accepted: true, frameIndex: payload.frameIndex } };
      },
      releaseVideoDecodeFrame: async (payload) => {
        calls.push(['releaseVideoDecodeFrame', payload]);
        return { success: true, result: { released: true, slotIndex: payload.slotIndex } };
      },
    },
  };
};

describe('rustBackendVideoDecodeControl', () => {
  it('starts a Rust video decode session with a shared-ring control payload only', async () => {
    const mocked = bridge();

    const response = await startRustBackendVideoDecode({
      jobId: 'decode-1',
      source: '/media/input.mp4',
      slotCount: 3,
      width: 1280,
      height: 720,
      sourceRate: {
        numerator: 60,
        denominator: 1,
      },
      format: 'rgba8Srgb',
      colour: {
        primaries: 'bt709',
        transfer: 'srgb',
        matrix: 'rgb',
        range: 'full',
      },
    }, mocked.bridge);

    expect(response).toEqual({ success: true, result: { jobId: 'decode-1' } });
    expect(mocked.calls).toEqual([[
      'startVideoDecode',
      {
        jobId: 'decode-1',
        source: '/media/input.mp4',
        slotCount: 3,
        width: 1280,
        height: 720,
        sourceRate: {
          numerator: 60,
          denominator: 1,
        },
        format: 'rgba8Srgb',
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

  it('requests and releases frames by frame index and slot lease token', async () => {
    const mocked = bridge();

    await requestRustBackendVideoDecodeFrame({
      jobId: 'decode-1',
      frameIndex: 42,
    }, mocked.bridge);
    await releaseRustBackendVideoDecodeFrame({
      jobId: 'decode-1',
      slotIndex: 2,
      generation: 5,
      copyOutState: 'gpuUploadFenceSignalled',
    }, mocked.bridge);

    expect(mocked.calls).toEqual([
      ['requestVideoDecodeFrame', {
        jobId: 'decode-1',
        frameIndex: 42,
      }],
      ['releaseVideoDecodeFrame', {
        jobId: 'decode-1',
        slotIndex: 2,
        generation: 5,
        copyOutState: 'gpuUploadFenceSignalled',
      }],
    ]);
  });
});
