import { describe, expect, it } from 'vitest';
import {
  buildVideoExportCodecPayload,
  resolveVideoExportSaveDialogOptions,
  validateVideoExportOutputPath,
  resolveVideoExportEncodeSettings,
  VIDEO_EXPORT_CODECS,
  VIDEO_EXPORT_ENCODE_PRESETS,
} from './videoExportEncodeSettings';

describe('video export encode settings', () => {
  it('describes every selectable export codec and its container compatibility', () => {
    expect(VIDEO_EXPORT_CODECS).toEqual([
      expect.objectContaining({ codec: 'h264', fileExtension: 'mp4' }),
      expect.objectContaining({ codec: 'hevc', fileExtension: 'mp4' }),
      expect.objectContaining({ codec: 'prores', fileExtension: 'mov' }),
    ]);
  });

  it('resolves the save-dialog name and filter for the selected codec', () => {
    expect(resolveVideoExportSaveDialogOptions('h264')).toEqual({
      defaultPath: 'output.mp4',
      filters: [{ name: 'MP4 Video', extensions: ['mp4'] }],
    });
    expect(resolveVideoExportSaveDialogOptions('prores')).toEqual({
      defaultPath: 'output.mov',
      filters: [{ name: 'MOV Video', extensions: ['mov'] }],
    });
  });

  it('rejects a path whose extension is incompatible with the selected codec', () => {
    expect(validateVideoExportOutputPath('/tmp/output.mp4', 'prores')).toBe(
      'Apple ProRes では .mov 形式の保存先を選択してください。'
    );
    expect(validateVideoExportOutputPath('/tmp/output.MOV', 'prores')).toBeNull();
  });

  it('keeps H.264 Rust payloads byte-compatible by omitting videoCodec', () => {
    expect(buildVideoExportCodecPayload('h264')).toEqual({});
    expect(buildVideoExportCodecPayload('hevc')).toEqual({ videoCodec: 'hevc' });
    expect(buildVideoExportCodecPayload('prores')).toEqual({ videoCodec: 'prores' });
  });

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
