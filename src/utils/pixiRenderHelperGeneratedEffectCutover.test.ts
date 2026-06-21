import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const helperSource = () => readFileSync(new URL('./pixiRenderHelper.ts', import.meta.url), 'utf8');

describe('pixiRenderHelper generated effect cutover', () => {
  it('does not destroy Pixi Graphics GPU context while cutting Rust-owned generated effects over', () => {
    const code = helperSource();
    const start = code.indexOf('if (shouldSkipPixiGeneratedEffectForSharedRenderer({');
    const end = code.indexOf("if (obj.type === 'shape')", start);
    const cutoverBlock = code.slice(start, end);

    expect(cutoverBlock).toContain('hidePixiChildrenForSharedRendererCutover(container.children)');
    expect(cutoverBlock).not.toContain('removeChildren()');
    expect(cutoverBlock).not.toContain('context: true');
  });

  it('does not destroy Pixi Graphics GPU context while cutting Rust-owned solid colours over', () => {
    const code = helperSource();
    const start = code.indexOf('if (shouldSkipPixiSolidColourForSharedRenderer({');
    const end = code.indexOf('container.hitArea = null;', start);
    const cutoverBlock = code.slice(start, end);

    expect(cutoverBlock).toContain('hidePixiChildrenForSharedRendererCutover(container.children)');
    expect(cutoverBlock).not.toContain('removeChildren()');
    expect(cutoverBlock).not.toContain('context: true');
  });
});
