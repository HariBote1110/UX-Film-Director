import type { RustBackendResult } from './rustBackendVideoDecodeControl';

export interface RustBackendAudioWaveformSamplesPayload {
  source: string;
  sampleRate: number;
  maxSamples: number;
  startSeconds?: number;
  durationSeconds?: number;
}

export interface RustBackendAudioWaveformSamplesResult {
  source: string;
  sampleRate: number;
  sampleCount: number;
  samples: number[];
}

export interface RustBackendAudioWaveformBridge {
  requestAudioWaveformSamples: (
    payload: RustBackendAudioWaveformSamplesPayload
  ) => Promise<RustBackendResult<RustBackendAudioWaveformSamplesResult>>;
}

const defaultRustBackendAudioWaveformBridge = (): RustBackendAudioWaveformBridge => ({
  requestAudioWaveformSamples: (payload) =>
    window.rustBackend.requestAudioWaveformSamples(payload) as Promise<
      RustBackendResult<RustBackendAudioWaveformSamplesResult>
    >,
});

export const requestRustBackendAudioWaveformSamples = (
  payload: RustBackendAudioWaveformSamplesPayload,
  bridge: RustBackendAudioWaveformBridge = defaultRustBackendAudioWaveformBridge()
): Promise<RustBackendResult<RustBackendAudioWaveformSamplesResult>> =>
  bridge.requestAudioWaveformSamples(payload);

