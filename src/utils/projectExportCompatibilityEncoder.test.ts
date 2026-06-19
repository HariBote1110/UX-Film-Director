import { describe, expect, it } from 'vitest';
import { encodeProjectExportCompatibilityVideo } from './projectExportCompatibilityEncoder';

const emptyFrames = async function* (): AsyncGenerator<{ timestamp: number; bitmap: ImageBitmap }> {
  return;
};

describe('encodeProjectExportCompatibilityVideo', () => {
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
