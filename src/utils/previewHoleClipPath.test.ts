import { describe, expect, it } from 'vitest';
import { buildPreviewHoleClipPath } from './previewHoleClipPath';

describe('buildPreviewHoleClipPath', () => {
  it('holeがnullのときはクリップしない（none）', () => {
    expect(buildPreviewHoleClipPath(null, { width: 1280, height: 720 })).toBe('none');
  });

  it('holeが指定されたとき、viewport外周とhole矩形からなるevenoddポリゴンを返す', () => {
    const result = buildPreviewHoleClipPath(
      { x: 100, y: 50, width: 400, height: 300 },
      { width: 1280, height: 720 }
    );

    expect(result).toBe(
      'polygon(evenodd, 0px 0px, 1280px 0px, 1280px 720px, 0px 720px, 0px 0px, ' +
      '100px 50px, 100px 350px, 500px 350px, 500px 50px, 100px 50px)'
    );
  });

  it('holeがviewportから部分的にはみ出していてもNaNを含まない', () => {
    const result = buildPreviewHoleClipPath(
      { x: -50, y: -20, width: 300, height: 200 },
      { width: 200, height: 150 }
    );

    expect(result).not.toContain('NaN');
    expect(result.startsWith('polygon(evenodd, ')).toBe(true);
  });

  it('非整数座標は四捨五入して丸められる', () => {
    const result = buildPreviewHoleClipPath(
      { x: 100.4, y: 50.6, width: 400.2, height: 300.5 },
      { width: 1280.9, height: 720.1 }
    );

    expect(result).toContain('1281px 0px');
    expect(result).toContain('100px 51px');
  });
});
