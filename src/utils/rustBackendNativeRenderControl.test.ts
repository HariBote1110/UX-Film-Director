import { describe, expect, it } from 'vitest';
import type { RustSceneSnapshot } from './rustSceneSnapshot';
import {
  releaseRustBackendNativeSharedFrame,
  renderRustBackendNativeSharedFrame,
  type RustBackendNativeRenderSharedFrameBridge,
  type RustBackendNativeRenderSharedFramePayload,
} from './rustBackendNativeRenderControl';

const snapshot: RustSceneSnapshot = {
  frame_index: 0,
  colour: {
    profile: 'rec709-sdr',
    working_space: 'linear-light',
    alpha: 'premultiplied',
  },
  clips: [{
    clip_id: 'clip-1',
    track_id: 'track-1',
    media_id: 'source-1',
    source_frame: 0,
    z_index: 0,
    transform: {
      translation_x: 0,
      translation_y: 0,
      scale_x: 1,
      scale_y: 1,
      rotation_degrees: 0,
      sampling: 'nearest',
    },
    opacity: 1,
    effects: [],
  }],
};

const payload: RustBackendNativeRenderSharedFramePayload = {
  renderId: 'native-render-1',
  memoryId: '/uxfd-native-render-output',
  slotCount: 2,
  ptsFrame: 0,
  width: 4,
  height: 4,
  snapshot,
  media: [{
    id: 'source-1',
    kind: 'Video',
    source: '/tmp/source-1.mp4',
    width: 4,
    height: 4,
    source_rate: {
      numerator: 60,
      denominator: 1,
    },
  }],
  sources: [{
    mediaId: 'source-1',
    slotCount: 1,
    frame: {
      descriptor: {
        memoryId: '/uxfd-native-render-source',
        slotIndex: 0,
        generation: 1,
        byteOffset: 0,
        byteLen: 1024,
        width: 4,
        height: 4,
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
  audioWaveforms: [{
    mediaId: 'waveform-1',
    source: '{"generator":"audio-waveform-r","target_audio_id":"audio-1","target_source":"/tmp/dialogue.wav","sample_window_seconds":1,"colour":"#00ff00","thickness":1,"amplitude":1}',
    samples: [0, 0.25, -0.25, 0],
    sampleRate: 8000,
    width: 4,
    height: 2,
  }],
};

describe('rustBackendNativeRenderControl', () => {
  it('forwards native shared-frame render payloads to the Rust backend bridge', async () => {
    const calls: unknown[] = [];
    const bridge: RustBackendNativeRenderSharedFrameBridge = {
      renderNativeSharedFrame: async (input) => {
        calls.push(input);
        return {
          success: true,
          result: {
            rendered: true,
            renderId: 'native-render-1',
            memoryId: '/uxfd-native-render-output',
            slotCount: 2,
            slotByteLen: 1024,
            frame: payload.sources[0].frame,
          },
        };
      },
      releaseNativeSharedFrame: async () => {
        throw new Error('release must not run during render.');
      },
    };

    await expect(renderRustBackendNativeSharedFrame(payload, bridge)).resolves.toEqual({
      success: true,
      result: {
        rendered: true,
        renderId: 'native-render-1',
        memoryId: '/uxfd-native-render-output',
        slotCount: 2,
        slotByteLen: 1024,
        frame: payload.sources[0].frame,
      },
    });
    expect(calls).toEqual([payload]);
  });

  it('forwards native shared-frame release payloads to the Rust backend bridge', async () => {
    const calls: unknown[] = [];
    const bridge: RustBackendNativeRenderSharedFrameBridge = {
      renderNativeSharedFrame: async () => {
        throw new Error('render must not run during release.');
      },
      releaseNativeSharedFrame: async (input) => {
        calls.push(input);
        return {
          success: true,
          result: {
            released: true,
            memoryId: '/uxfd-native-render-output',
          },
        };
      },
    };

    await expect(releaseRustBackendNativeSharedFrame({
      memoryId: '/uxfd-native-render-output',
    }, bridge)).resolves.toEqual({
      success: true,
      result: {
        released: true,
        memoryId: '/uxfd-native-render-output',
      },
    });
    expect(calls).toEqual([{ memoryId: '/uxfd-native-render-output' }]);
  });
});
