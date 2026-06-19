import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { encodeProjectExportCompatibilityVideo } from './projectExportCompatibilityEncoder';

const source = () =>
  readFileSync(new URL('./projectExportCompatibilityEncoder.ts', import.meta.url), 'utf8');

const emptyFrames = async function* (): AsyncGenerator<{ timestamp: number; bitmap: ImageBitmap }> {
  return;
};

describe('encodeProjectExportCompatibilityVideo', () => {
  it('requires callers to pass the video object sentinel explicitly', () => {
    const code = source();

    expect(code).toContain('hasVideoObjects: boolean');
    expect(code).not.toContain('hasVideoObjects?: boolean');
  });

  it('does not statically import the WebCodecs mp4-muxer pipeline', () => {
    const code = source();

    expect(code).not.toMatch(/import\s+type\s+[^;]+['"]\.\/videoExportPipeline['"]/);
    expect(code).not.toMatch(/import\s+[^('"][^;]+['"]\.\/videoExportPipeline['"]/);
  });

  it('refuses video object exports before loading the WebCodecs compatibility encoder', async () => {
    await expect(encodeProjectExportCompatibilityVideo({
      width: 1920,
      height: 1080,
      fps: 30,
      frames: emptyFrames(),
      hasVideoObjects: true,
    })).rejects.toThrow('Video export requires the Rust backend encoder; WebCodecs compatibility export is non-video only.');
  });
});
