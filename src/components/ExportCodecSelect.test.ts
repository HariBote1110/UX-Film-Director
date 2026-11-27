import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getExportCodecHint, getExportCodecSelectLabel } from './ExportCodecSelect';
import { VIDEO_EXPORT_CODECS } from '../utils/videoExportEncodeSettings';

describe('getExportCodecSelectLabel', () => {
  it('returns the Japanese accessible label', () => {
    expect(getExportCodecSelectLabel('ja')).toBe('書き出しコーデック');
  });

  it('returns the English accessible label', () => {
    expect(getExportCodecSelectLabel('en')).toBe('Export codec');
  });
});

describe('getExportCodecHint', () => {
  it('combines description and compatibilityNote for Japanese UI', () => {
    expect(getExportCodecHint('h264', 'ja')).toBe(
      '幅広い環境で再生できる標準的な形式です。 互換性を優先する場合に適しています。'
    );
  });

  it('provides short English equivalents for every codec', () => {
    expect(getExportCodecHint('h264', 'en')).toBe('Most compatible');
    expect(getExportCodecHint('hevc', 'en')).toBe('Smaller files, needs HEVC support');
    expect(getExportCodecHint('prores', 'en')).toBe('Editing intermediate, .mov, large files');
  });

  it('has an English hint for every entry in VIDEO_EXPORT_CODECS', () => {
    for (const descriptor of VIDEO_EXPORT_CODECS) {
      expect(getExportCodecHint(descriptor.codec, 'en')).not.toBe('');
    }
  });
});

describe('ExportCodecSelect source', () => {
  const source = readFileSync(new URL('./ExportCodecSelect.tsx', import.meta.url), 'utf8');

  it('consumes the existing store state and action rather than re-implementing them', () => {
    expect(source).toContain('state.exportVideoCodec');
    expect(source).toContain('state.setExportVideoCodec');
    expect(source).toContain("import { VIDEO_EXPORT_CODECS, VideoExportCodec } from '../utils/videoExportEncodeSettings'");
  });

  it('renders one option per VIDEO_EXPORT_CODECS descriptor', () => {
    expect(source).toContain('VIDEO_EXPORT_CODECS.map((descriptor)');
  });

  it('is disabled while exporting via the disabled prop', () => {
    expect(source).toContain('disabled={disabled}');
  });

  it('exposes an accessible label for the control', () => {
    expect(source).toContain('aria-label={accessibleLabel}');
  });
});

describe('App export toolbar wiring', () => {
  it('places ExportCodecSelect immediately before the export button', () => {
    const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
    const codecSelectIndex = appSource.indexOf('<ExportCodecSelect');
    const exportButtonIndex = appSource.indexOf('onClick={handleExport}');

    expect(codecSelectIndex).toBeGreaterThan(-1);
    expect(exportButtonIndex).toBeGreaterThan(-1);
    expect(codecSelectIndex).toBeLessThan(exportButtonIndex);
    expect(appSource).toContain('<ExportCodecSelect language={language} disabled={isUiBusy} />');
  });
});
