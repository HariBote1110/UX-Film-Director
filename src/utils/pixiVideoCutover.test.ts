import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  resolvePixiVideoRenderPath,
  shouldSkipPixiVideoForSharedRenderer,
} from './pixiVideoCutover';

const source = () =>
  readFileSync(new URL('./pixiVideoCutover.ts', import.meta.url), 'utf8');

describe('shouldSkipPixiVideoForSharedRenderer', () => {
  it('skips preview video objects by default so Pixi cannot own HTMLVideoElement rendering', () => {
    const sharedRendererVideoObjectIds = new Set(['video-1']);

    expect(shouldSkipPixiVideoForSharedRenderer({
      objectId: 'video-1',
      objectType: 'video',
      isExporting: false,
      sharedRendererVideoObjectIds,
    })).toBe(true);
    expect(shouldSkipPixiVideoForSharedRenderer({
      objectId: 'image-1',
      objectType: 'image',
      isExporting: false,
      sharedRendererVideoObjectIds,
    })).toBe(false);
    expect(shouldSkipPixiVideoForSharedRenderer({
      objectId: 'video-2',
      objectType: 'video',
      isExporting: false,
      sharedRendererVideoObjectIds,
    })).toBe(true);
  });

  it('skips export video objects so Pixi cannot regain video ownership', () => {
    expect(shouldSkipPixiVideoForSharedRenderer({
      objectId: 'video-1',
      objectType: 'video',
      isExporting: true,
      sharedRendererVideoObjectIds: new Set(['video-1']),
    })).toBe(true);
  });

  it('skips Pixi video fallback when shared renderer video is required', () => {
    expect(shouldSkipPixiVideoForSharedRenderer({
      objectId: 'video-2',
      objectType: 'video',
      isExporting: false,
      sharedRendererVideoObjectIds: new Set(['video-1']),
      requireSharedRendererVideo: true,
    })).toBe(true);
    expect(shouldSkipPixiVideoForSharedRenderer({
      objectId: 'image-1',
      objectType: 'image',
      isExporting: false,
      requireSharedRendererVideo: true,
    })).toBe(false);
    expect(shouldSkipPixiVideoForSharedRenderer({
      objectId: 'video-2',
      objectType: 'video',
      isExporting: true,
      requireSharedRendererVideo: true,
    })).toBe(true);
  });

});

describe('resolvePixiVideoRenderPath', () => {
  it('requires shared renderer video for ordinary preview clips by default', () => {
    expect(resolvePixiVideoRenderPath({
      objectId: 'video-1',
      objectType: 'video',
      isExporting: false,
      requireSharedRendererVideo: false,
    })).toBe('sharedRendererOnly');
  });

  it('prioritises shared renderer video over export overrides and Pixi video elements when Rust video is required', () => {
    expect(resolvePixiVideoRenderPath({
      objectId: 'video-1',
      objectType: 'video',
      isExporting: true,
      requireSharedRendererVideo: true,
    })).toBe('sharedRendererOnly');
  });

  it('does not expose the stale export frame override render path', () => {
    const code = source();

    expect(code).not.toContain('exportFrameOverride');
    expect(code).not.toContain('hasExportFrameOverride');
  });

  it('keeps export video on the shared renderer path instead of restoring Pixi bitmap overrides', () => {
    expect(resolvePixiVideoRenderPath({
      objectId: 'video-1',
      objectType: 'video',
      isExporting: true,
      requireSharedRendererVideo: false,
    })).toBe('sharedRendererOnly');
  });

  it('rejects the legacy Pixi video element path for export compatibility unless explicitly opted in', () => {
    expect(resolvePixiVideoRenderPath({
      objectId: 'video-1',
      objectType: 'video',
      isExporting: true,
      requireSharedRendererVideo: false,
    })).toBe('sharedRendererOnly');
  });

  it('rejects the stale legacy Pixi video element opt-in after the Rust cutover', () => {
    expect(resolvePixiVideoRenderPath({
      objectId: 'video-1',
      objectType: 'video',
      isExporting: true,
      requireSharedRendererVideo: false,
      allowLegacyPixiVideo: true,
    } as Parameters<typeof resolvePixiVideoRenderPath>[0] & {
      allowLegacyPixiVideo: true;
    })).toBe('sharedRendererOnly');
  });
});
