export type VideoExportQualityPreset = 'compact' | 'speed' | 'balanced' | 'quality';

export interface VideoExportEncodeSettings {
  qualityPreset: VideoExportQualityPreset;
  videoBitrateKbps: number;
  label: string;
  description: string;
}

export const VIDEO_EXPORT_ENCODE_PRESETS: readonly VideoExportEncodeSettings[] = [
  {
    qualityPreset: 'compact',
    videoBitrateKbps: 4000,
    label: 'Compact',
    description: '容量を抑える',
  },
  {
    qualityPreset: 'speed',
    videoBitrateKbps: 6000,
    label: 'Speed',
    description: '速度を優先する',
  },
  {
    qualityPreset: 'balanced',
    videoBitrateKbps: 8000,
    label: 'Balanced',
    description: '速度と画質と容量を均衡させる',
  },
  {
    qualityPreset: 'quality',
    videoBitrateKbps: 14000,
    label: 'Quality',
    description: '画質を優先する',
  },
];

const presetByName = new Map(
  VIDEO_EXPORT_ENCODE_PRESETS.map((preset) => [preset.qualityPreset, preset])
);

const normaliseBitrateKbps = (value: unknown): number | null => {
  const bitrate = Number(value);
  if (!Number.isFinite(bitrate) || bitrate <= 0) return null;
  return Math.round(Math.max(500, Math.min(80_000, bitrate)));
};

export const isVideoExportQualityPreset = (value: unknown): value is VideoExportQualityPreset =>
  typeof value === 'string' && presetByName.has(value as VideoExportQualityPreset);

export const resolveVideoExportEncodeSettings = ({
  preset,
  videoBitrateKbps,
}: {
  preset?: unknown;
  videoBitrateKbps?: unknown;
} = {}): VideoExportEncodeSettings => {
  const base = presetByName.get(
    isVideoExportQualityPreset(preset) ? preset : 'balanced'
  ) ?? VIDEO_EXPORT_ENCODE_PRESETS[2];
  return {
    ...base,
    videoBitrateKbps: normaliseBitrateKbps(videoBitrateKbps) ?? base.videoBitrateKbps,
  };
};
