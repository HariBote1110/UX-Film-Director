import React from 'react';
import { useStore } from '../store/useStore';
import { VIDEO_EXPORT_CODECS, VideoExportCodec } from '../utils/videoExportEncodeSettings';

// English UI uses short equivalents rather than the Japanese compatibilityNote copy.
const ENGLISH_CODEC_HINTS: Record<VideoExportCodec, string> = {
  h264: 'Most compatible',
  hevc: 'Smaller files, needs HEVC support',
  prores: 'Editing intermediate, .mov, large files',
};

export const getExportCodecHint = (codec: VideoExportCodec, language: 'ja' | 'en'): string => {
  if (language === 'en') {
    return ENGLISH_CODEC_HINTS[codec] ?? '';
  }
  const descriptor = VIDEO_EXPORT_CODECS.find((item) => item.codec === codec);
  return descriptor ? `${descriptor.description} ${descriptor.compatibilityNote}` : '';
};

export const getExportCodecSelectLabel = (language: 'ja' | 'en'): string =>
  language === 'ja' ? '書き出しコーデック' : 'Export codec';

interface ExportCodecSelectProps {
  language: 'ja' | 'en';
  disabled?: boolean;
}

const ExportCodecSelect: React.FC<ExportCodecSelectProps> = ({ language, disabled = false }) => {
  const exportVideoCodec = useStore((state) => state.exportVideoCodec);
  const setExportVideoCodec = useStore((state) => state.setExportVideoCodec);

  const accessibleLabel = getExportCodecSelectLabel(language);

  return (
    <select
      value={exportVideoCodec}
      onChange={(e) => setExportVideoCodec(e.target.value as VideoExportCodec)}
      disabled={disabled}
      aria-label={accessibleLabel}
      title={getExportCodecHint(exportVideoCodec, language)}
      style={{ border: 'none', background: 'transparent', fontSize: '10px', padding: '0 4px', color: 'var(--text-muted)' }}
    >
      {VIDEO_EXPORT_CODECS.map((descriptor) => (
        <option
          key={descriptor.codec}
          value={descriptor.codec}
          title={getExportCodecHint(descriptor.codec, language)}
        >
          {descriptor.label}
        </option>
      ))}
    </select>
  );
};

export default ExportCodecSelect;
