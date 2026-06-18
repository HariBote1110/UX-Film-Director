import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const viewportSource = () =>
  readFileSync(new URL('../components/Viewport.tsx', import.meta.url), 'utf8');

describe('Viewport Rust video-only boundary', () => {
  it('passes Rust video-only mode into shared renderer video readiness diagnostics', () => {
    const code = viewportSource();
    const start = code.indexOf('const videoReadiness = session.surfaceGate.ok');
    const end = code.indexOf(
      'diagnosticsWindow.__UXFD_SHARED_RENDERER_VIDEO_MEDIA_READINESS__',
      start
    );
    const readinessBlock = code.slice(start, end);

    expect(readinessBlock).toContain('buildSharedRendererVideoMediaReadiness({');
    expect(readinessBlock).toContain('requireSharedRendererVideo: rustVideoOnlyEnabled');
  });
});
