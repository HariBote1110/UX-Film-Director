import { describe, expect, it } from 'vitest';
import {
  requestRustBackendAudioWaveformSamples,
  type RustBackendAudioWaveformBridge,
} from './rustBackendAudioWaveformControl';

const bridge = (): {
  calls: unknown[];
  bridge: RustBackendAudioWaveformBridge;
} => {
  const calls: unknown[] = [];
  return {
    calls,
    bridge: {
      requestAudioWaveformSamples: async (payload) => {
        calls.push(['requestAudioWaveformSamples', payload]);
        return {
          success: true,
          result: {
            source: payload.source,
            sampleRate: payload.sampleRate,
            sampleCount: 4,
            samples: [0, 0.5, -0.5, 0],
          },
        };
      },
    },
  };
};

describe('rustBackendAudioWaveformControl', () => {
  it('requests waveform PCM samples through the Rust backend bridge', async () => {
    const mocked = bridge();

    const response = await requestRustBackendAudioWaveformSamples({
      source: '/tmp/dialogue.wav',
      sampleRate: 8000,
      maxSamples: 4,
      startSeconds: 1.25,
      durationSeconds: 0.5,
    }, mocked.bridge);

    expect(response).toEqual({
      success: true,
      result: {
        source: '/tmp/dialogue.wav',
        sampleRate: 8000,
        sampleCount: 4,
        samples: [0, 0.5, -0.5, 0],
      },
    });
    expect(mocked.calls).toEqual([[
      'requestAudioWaveformSamples',
      {
        source: '/tmp/dialogue.wav',
        sampleRate: 8000,
        maxSamples: 4,
        startSeconds: 1.25,
        durationSeconds: 0.5,
      },
    ]]);
    expect(JSON.stringify(mocked.calls)).not.toContain('wavBuffer');
  });
});

