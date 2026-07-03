import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const pixiRenderHelperSource = () =>
  readFileSync(new URL('./pixiRenderHelper.ts', import.meta.url), 'utf8');

describe('pixiRenderHelper text cutover boundary', () => {
  it('imports shouldSkipPixiTextForSharedRenderer alongside the other media cutover predicates', () => {
    const code = pixiRenderHelperSource();
    expect(code).toContain("import { shouldSkipPixiTextForSharedRenderer } from './pixiTextCutover';");
  });

  it('skips Pixi text rendering when the shared renderer owns the text object, keeping a hitArea', () => {
    const code = pixiRenderHelperSource();
    const start = code.indexOf("} else if (obj.type === 'text') {");
    expect(start).toBeGreaterThan(-1);
    const end = code.indexOf("} else if (obj.type === 'image') {", start);
    const textBlock = code.slice(start, end);

    expect(textBlock).toContain('shouldSkipPixiTextForSharedRenderer({');
    expect(textBlock).toContain('sharedRendererTextObjectIds');
    expect(textBlock).toContain('container.hitArea = new PIXI.Rectangle(');
  });

  it('writes the Pixi-measured text size back onto the object when it is not shared-renderer owned', () => {
    const code = pixiRenderHelperSource();
    const start = code.indexOf("} else if (obj.type === 'text') {");
    const end = code.indexOf("} else if (obj.type === 'image') {", start);
    const textBlock = code.slice(start, end);

    expect(textBlock).toContain('onTextMeasured');
  });
});
