import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureProjectExportLegacyCanvasFrame } from './projectExportLegacyCanvasCapture';

describe('captureProjectExportLegacyCanvasFrame', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('forwards the explicit capture rectangle into createImageBitmap', async () => {
    const bitmap = { close: () => undefined } as ImageBitmap;
    const createImageBitmapMock = vi.fn(async () => bitmap);
    vi.stubGlobal('createImageBitmap', createImageBitmapMock);

    const canvas = { width: 1920, height: 1080 } as unknown as HTMLCanvasElement;
    await expect(captureProjectExportLegacyCanvasFrame({
      canvas,
      sx: 10,
      sy: 20,
      width: 640,
      height: 360,
      timestamp: 123_456,
    })).resolves.toEqual({
      timestamp: 123_456,
      bitmap,
    });

    expect(createImageBitmapMock).toHaveBeenCalledWith(canvas, 10, 20, 640, 360);
  });
});
