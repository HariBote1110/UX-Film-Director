import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SHARED_RENDERER_PLAYBACK_DECODE_EDGE_CAP,
  SHARED_RENDERER_PLAYBACK_DECODE_FALLBACK_EDGE,
  SHARED_RENDERER_PLAYBACK_DECODE_MIN_EDGE,
  SHARED_RENDERER_PLAYBACK_DECODE_SLOT_COUNT,
  SHARED_RENDERER_PLAYBACK_PREVIEW_FPS,
  quantiseSharedRendererPlaybackPreviewTime,
  resolveSharedRendererPlaybackDecodeMaxEdge,
} from './sharedRendererPlaybackPreviewSettings';

describe('sharedRendererPlaybackPreviewSettings', () => {
  it('keeps Rust video playback preview cadence high enough for visual continuity', () => {
    expect(SHARED_RENDERER_PLAYBACK_PREVIEW_FPS).toBe(60);
    expect(SHARED_RENDERER_PLAYBACK_DECODE_FALLBACK_EDGE).toBeGreaterThanOrEqual(320);
    expect(SHARED_RENDERER_PLAYBACK_DECODE_SLOT_COUNT).toBeGreaterThanOrEqual(4);
  });

  // 実機報告: preview decode が固定 720 edge のままだと、720x405 のフレームを
  // drawable（実測 1564x880、フルスクリーン相当 2588x1456）へ引き伸ばすことになり
  // preview が顕著にボケる。decode 解像度は「そのときの preview drawable の長辺」に
  // 追従させ、media 宣言解像度の長辺は resolveViewportVideoDecodeSize が source 寸法
  // との min で自然にキャップする（decode がソースを超えるアップスケールになることはない）。
  describe('resolveSharedRendererPlaybackDecodeMaxEdge', () => {
    it('follows the preview drawable long edge so the decode matches the presented pixels', () => {
      expect(resolveSharedRendererPlaybackDecodeMaxEdge({ width: 1564, height: 880 })).toBe(1564);
      // 縦長 drawable でも長辺を採用する。
      expect(resolveSharedRendererPlaybackDecodeMaxEdge({ width: 880, height: 1564 })).toBe(1564);
    });

    it('caps the decode edge at the pipeline maximum for oversized drawables', () => {
      // フルスクリーン相当（2588x1456）は decode パイプラインの上限 1920 でキャップし、
      // media 宣言解像度の長辺（例 1920）を超える無駄なデコードを要求しない。
      expect(resolveSharedRendererPlaybackDecodeMaxEdge({ width: 2588, height: 1456 }))
        .toBe(SHARED_RENDERER_PLAYBACK_DECODE_EDGE_CAP);
      expect(SHARED_RENDERER_PLAYBACK_DECODE_EDGE_CAP).toBe(1920);
    });

    it('keeps a legibility floor for tiny panes', () => {
      // 320 は canvas へ引き伸ばした時点で明確にブロックノイズが見えた実績値
      // （SHARED_RENDERER_PLAYBACK_DECODE_FALLBACK_EDGE のコメント参照）なので、
      // それを上回る下限を保つ。
      expect(resolveSharedRendererPlaybackDecodeMaxEdge({ width: 200, height: 100 }))
        .toBe(SHARED_RENDERER_PLAYBACK_DECODE_MIN_EDGE);
      expect(SHARED_RENDERER_PLAYBACK_DECODE_MIN_EDGE).toBeGreaterThan(320);
    });

    it('falls back to the legacy fixed edge when the drawable is unknown or invalid', () => {
      expect(resolveSharedRendererPlaybackDecodeMaxEdge(null)).toBe(SHARED_RENDERER_PLAYBACK_DECODE_FALLBACK_EDGE);
      expect(resolveSharedRendererPlaybackDecodeMaxEdge(undefined)).toBe(SHARED_RENDERER_PLAYBACK_DECODE_FALLBACK_EDGE);
      expect(resolveSharedRendererPlaybackDecodeMaxEdge({ width: 0, height: 0 }))
        .toBe(SHARED_RENDERER_PLAYBACK_DECODE_FALLBACK_EDGE);
      expect(resolveSharedRendererPlaybackDecodeMaxEdge({ width: Number.NaN, height: 880 }))
        .toBe(SHARED_RENDERER_PLAYBACK_DECODE_FALLBACK_EDGE);
      expect(SHARED_RENDERER_PLAYBACK_DECODE_FALLBACK_EDGE).toBe(720);
    });

    it('rounds fractional drawable sizes to integer decode edges', () => {
      expect(resolveSharedRendererPlaybackDecodeMaxEdge({ width: 1563.3, height: 879.4 })).toBe(1563);
    });
  });

  it('wires the drawable-aware decode edge into the Viewport native overlay present path', () => {
    // Viewport.tsx が固定定数ではなく drawable 追従のヘルパを decode edge として
    // 渡していることをソース境界で固定する。固定 720 に戻すとぼやけ報告が再発する。
    const viewport = readFileSync(
      resolve(__dirname, '../components/Viewport.tsx'),
      'utf8'
    );
    expect(viewport).toContain('resolveSharedRendererPlaybackDecodeMaxEdge(');
    expect(viewport).not.toContain('maxDecodeEdge: SHARED_RENDERER_PLAYBACK_DECODE_MAX_EDGE');
    expect(viewport).not.toContain('videoDecodeMaxEdge: SHARED_RENDERER_PLAYBACK_DECODE_MAX_EDGE');
  });

  it('quantises playback time to the configured Rust preview cadence', () => {
    const first = quantiseSharedRendererPlaybackPreviewTime(1.016);
    const second = quantiseSharedRendererPlaybackPreviewTime(1.017);

    expect(first).toBe(1);
    expect(second).toBeCloseTo(1 + (1 / SHARED_RENDERER_PLAYBACK_PREVIEW_FPS), 6);
  });
});
