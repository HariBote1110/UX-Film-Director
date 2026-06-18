import { describe, expect, it } from 'vitest';
import { shouldMountSharedRendererSurfaceCanvas } from './sharedRendererSurfaceMount';

describe('shouldMountSharedRendererSurfaceCanvas', () => {
  it('mounts the shared renderer surface for preview or export use', () => {
    expect(shouldMountSharedRendererSurfaceCanvas({
      previewEnabled: true,
      exportEnabled: false,
    })).toBe(true);
    expect(shouldMountSharedRendererSurfaceCanvas({
      previewEnabled: false,
      exportEnabled: true,
    })).toBe(true);
  });

  it('keeps the shared renderer surface unmounted when both gates are closed', () => {
    expect(shouldMountSharedRendererSurfaceCanvas({
      previewEnabled: false,
      exportEnabled: false,
    })).toBe(false);
  });
});
