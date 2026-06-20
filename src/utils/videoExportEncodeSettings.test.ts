import { describe, expect, it } from 'vitest';
import {
  resolveVideoExportEncodeSettings,
  VIDEO_EXPORT_ENCODE_PRESETS,
} from './videoExportEncodeSettings';

describe('video export encode settings', () => {
  it('keeps balanced as the current direct transcode quality baseline', () => {
    expect(resolveVideoExportEncodeSettings({ preset: 'balanced' })).toEqual({
      qualityPreset: 'balanced',
      videoBitrateKbps: 8000,
      label: 'Balanced',
      description: '速度と画質と容量を均衡させる',
    });
  });

  it('orders presets by the intended quality and size trade-off', () => {
    expect(VIDEO_EXPORT_ENCODE_PRESETS.map((preset) => preset.qualityPreset)).toEqual([
      'compact',
      'speed',
      'balanced',
      'quality',
    ]);

    const compact = resolveVideoExportEncodeSettings({ preset: 'compact' });
    const speed = resolveVideoExportEncodeSettings({ preset: 'speed' });
    const balanced = resolveVideoExportEncodeSettings({ preset: 'balanced' });
    const quality = resolveVideoExportEncodeSettings({ preset: 'quality' });

    expect(compact.videoBitrateKbps).toBeLessThan(speed.videoBitrateKbps);
    expect(speed.videoBitrateKbps).toBeLessThan(balanced.videoBitrateKbps);
    expect(balanced.videoBitrateKbps).toBeLessThan(quality.videoBitrateKbps);
  });

  it('allows explicit bitrate to be used for benchmarking custom speed/quality/size points', () => {
    expect(resolveVideoExportEncodeSettings({
      preset: 'quality',
      videoBitrateKbps: 10_500,
    })).toMatchObject({
      qualityPreset: 'quality',
      videoBitrateKbps: 10_500,
    });
  });

  it('falls back to balanced when an environment value is unknown', () => {
    expect(resolveVideoExportEncodeSettings({ preset: 'future-perfect' })).toMatchObject({
      qualityPreset: 'balanced',
      videoBitrateKbps: 8000,
    });
  });
});
