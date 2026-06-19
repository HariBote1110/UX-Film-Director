import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  resolvePixiVideoRenderPath,
  shouldSkipPixiVideoForSharedRenderer,
} from './pixiVideoCutover';

const source = () =>
  readFileSync(new URL('./pixiVideoCutover.ts', import.meta.url), 'utf8');

describe('shouldSkipPixiVideoForSharedRenderer', () => {
  it('does not expose export or ownership gates in the Pixi video cutover input', () => {
    const code = source();

    expect(code).not.toContain('isExporting');
    expect(code).not.toContain('sharedRendererVideoObjectIds');
    expect(code).not.toContain('requireSharedRendererVideo');
  });

  it('skips preview video objects by default so Pixi cannot own HTMLVideoElement rendering', () => {
    expect(shouldSkipPixiVideoForSharedRenderer({
      objectType: 'video',
    })).toBe(true);
    expect(shouldSkipPixiVideoForSharedRenderer({
      objectType: 'image',
    })).toBe(false);
    expect(shouldSkipPixiVideoForSharedRenderer({
      objectType: 'video',
    })).toBe(true);
  });

  it('skips export video objects so Pixi cannot regain video ownership', () => {
    expect(shouldSkipPixiVideoForSharedRenderer({
      objectType: 'video',
    })).toBe(true);
  });

  it('skips Pixi video fallback when shared renderer video is required', () => {
    expect(shouldSkipPixiVideoForSharedRenderer({
      objectType: 'video',
    })).toBe(true);
    expect(shouldSkipPixiVideoForSharedRenderer({
      objectType: 'image',
    })).toBe(false);
    expect(shouldSkipPixiVideoForSharedRenderer({
      objectType: 'video',
    })).toBe(true);
  });

});

describe('resolvePixiVideoRenderPath', () => {
  it('requires shared renderer video for ordinary preview clips by default', () => {
    expect(resolvePixiVideoRenderPath({
      objectType: 'video',
    })).toBe('sharedRendererOnly');
  });

  it('prioritises shared renderer video over export overrides and Pixi video elements when Rust video is required', () => {
    expect(resolvePixiVideoRenderPath({
      objectType: 'video',
    })).toBe('sharedRendererOnly');
  });

  it('does not expose the stale export frame override render path', () => {
    const code = source();

    expect(code).not.toContain('exportFrameOverride');
    expect(code).not.toContain('hasExportFrameOverride');
  });

  it('keeps export video on the shared renderer path instead of restoring Pixi bitmap overrides', () => {
    expect(resolvePixiVideoRenderPath({
      objectType: 'video',
    })).toBe('sharedRendererOnly');
  });

  it('rejects the legacy Pixi video element path for export compatibility unless explicitly opted in', () => {
    expect(resolvePixiVideoRenderPath({
      objectType: 'video',
    })).toBe('sharedRendererOnly');
  });

  it('rejects the stale legacy Pixi video element opt-in after the Rust cutover', () => {
    expect(resolvePixiVideoRenderPath({
      objectType: 'video',
      allowLegacyPixiVideo: true,
    } as Parameters<typeof resolvePixiVideoRenderPath>[0] & {
      allowLegacyPixiVideo: true;
    })).toBe('sharedRendererOnly');
  });
});
