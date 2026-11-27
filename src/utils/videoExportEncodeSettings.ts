export type VideoExportQualityPreset = 'compact' | 'speed' | 'balanced' | 'quality';
export type VideoExportCodec = 'h264' | 'hevc' | 'prores';

export interface VideoExportCodecDescriptor {
  codec: VideoExportCodec;
  label: string;
  description: string;
  fileExtension: 'mp4' | 'mov';
  compatibilityNote: string;
}

export const VIDEO_EXPORT_CODECS: readonly VideoExportCodecDescriptor[] = [
  {
    codec: 'h264',
    label: 'H.264',
    description: '幅広い環境で再生できる標準的な形式です。',
    fileExtension: 'mp4',
    compatibilityNote: '互換性を優先する場合に適しています。',
  },
  {
    codec: 'hevc',
    label: 'HEVC (H.265)',
    description: 'H.264 より高い圧縮効率を目指す形式です。',
    fileExtension: 'mp4',
    compatibilityNote: '再生には HEVC 対応のOS・プレーヤーが必要です。',
  },
  {
    codec: 'prores',
    label: 'Apple ProRes',
    description: '編集用途向けの高品質な中間コーデックです。',
    fileExtension: 'mov',
    compatibilityNote: 'MOV形式専用で、ファイルサイズが大きくなります。',
  },
];

const codecByName = new Map(VIDEO_EXPORT_CODECS.map((descriptor) => [descriptor.codec, descriptor]));

export const getVideoExportCodecDescriptor = (codec: VideoExportCodec): VideoExportCodecDescriptor =>
  codecByName.get(codec) ?? VIDEO_EXPORT_CODECS[0];

export const resolveVideoExportSaveDialogOptions = (codec: VideoExportCodec) => {
  const descriptor = getVideoExportCodecDescriptor(codec);
  const isMov = descriptor.fileExtension === 'mov';
  return {
    defaultPath: `output.${descriptor.fileExtension}`,
    filters: [{ name: isMov ? 'MOV Video' : 'MP4 Video', extensions: [descriptor.fileExtension] }],
  };
};

export const validateVideoExportOutputPath = (
  filePath: string,
  codec: VideoExportCodec,
): string | null => {
  const descriptor = getVideoExportCodecDescriptor(codec);
  const extension = filePath.match(/\.([^.\\/]+)$/)?.[1]?.toLowerCase();
  if (extension === descriptor.fileExtension) return null;
  return `${descriptor.label} では .${descriptor.fileExtension} 形式の保存先を選択してください。`;
};

export const buildVideoExportCodecPayload = (
  codec: VideoExportCodec,
): { videoCodec?: VideoExportCodec } => codec === 'h264' ? {} : { videoCodec: codec };

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
