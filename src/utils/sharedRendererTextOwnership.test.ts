import { describe, expect, it } from 'vitest';
import { buildSharedRendererTextOwnership } from './sharedRendererTextOwnership';

describe('sharedRendererTextOwnership', () => {
  it('keeps Pixi ownership when the scene has no text objects', () => {
    const ownership = buildSharedRendererTextOwnership({
      hasTextScene: false,
      nativeRenderFrameReady: true,
      textObjectIds: ['text-1'],
    });

    expect(ownership).toEqual({
      owner: 'pixi',
      reason: 'noTextScene',
      textObjectIds: [],
    });
  });

  it('keeps Pixi ownership when the native render frame is not ready yet', () => {
    const ownership = buildSharedRendererTextOwnership({
      hasTextScene: true,
      nativeRenderFrameReady: false,
      textObjectIds: ['text-1'],
    });

    expect(ownership).toEqual({
      owner: 'pixi',
      reason: 'nativeRenderFrameUnavailable',
      textObjectIds: [],
    });
  });

  it('hands ownership to the shared renderer once the native render frame is ready', () => {
    const ownership = buildSharedRendererTextOwnership({
      hasTextScene: true,
      nativeRenderFrameReady: true,
      textObjectIds: ['text-1', 'text-2'],
    });

    expect(ownership).toEqual({
      owner: 'sharedRenderer',
      reason: 'nativeRenderFrameReady',
      textObjectIds: ['text-1', 'text-2'],
    });
  });
});
