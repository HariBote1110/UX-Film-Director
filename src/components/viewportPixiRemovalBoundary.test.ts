import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * PixiJS 排除計画 Phase 4 の境界テスト。
 * Viewport.tsx から PIXI.Application・Pixi 描画・Pixi 依存 import が
 * 排除されていること、および置き換え先（SVG vision 枠・Canvas2D テキスト
 * 計測・sceneTransforms 直参照）が配線されていることを固定する。
 */
const viewportSource = () =>
  readFileSync(new URL('./Viewport.tsx', import.meta.url), 'utf8');

describe('Viewport Pixi removal boundary', () => {
  it('Viewport.tsx は pixi.js とPixi依存モジュールを import しない', () => {
    const code = viewportSource();
    expect(code).not.toContain("from 'pixi.js'");
    expect(code).not.toContain('PIXI.');
    expect(code).not.toContain('pixiRenderHelper');
    expect(code).not.toContain('usePixiInteraction');
    expect(code).not.toContain("from '../utils/pixiUtils'");
    expect(code).not.toContain('pixiAppRef');
    expect(code).not.toContain('updatePixiContent');
  });

  it('グループ変形・振動は sceneTransforms から直接 import する', () => {
    const code = viewportSource();
    expect(code).toContain("from '../utils/sceneTransforms'");
  });

  it('vision 検出枠は Pixi ではなく SVG ジオメトリ（visionDetectionOverlayGeometry）で描く', () => {
    const code = viewportSource();
    expect(code).toContain('buildVisionDetectionOverlayBoxes');
  });

  it('テキスト実測は PIXI.Text ではなく Canvas2D 計測（textBoxMeasurement）で書き戻す', () => {
    const code = viewportSource();
    expect(code).toContain('measureTextBoxSize');
    expect(code).toContain('measuredWidth');
  });

  it('Pixi 非依存のインタラクション（useSceneInteraction / SceneSelectionOverlay）は維持する', () => {
    const code = viewportSource();
    expect(code).toContain('useSceneInteraction');
    expect(code).toContain('SceneSelectionOverlay');
  });
});
