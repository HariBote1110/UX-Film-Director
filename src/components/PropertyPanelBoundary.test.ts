import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = () => readFileSync(new URL('./PropertyPanel.tsx', import.meta.url), 'utf8');

describe('PropertyPanel aspect ratio controls', () => {
  it('keeps transform scale edits aspect-locked by default with an explicit unlock control', () => {
    const code = source();

    expect(code).toContain("import { buildAspectLockedScalePatch } from '../utils/aspectRatioScale'");
    expect(code).toContain('const [scaleAspectLocked, setScaleAspectLocked] = useState(true)');
    expect(code).toContain("key === 'scaleX' || key === 'scaleY'");
    expect(code).toContain('lockAspectRatio: scaleAspectLocked');
    expect(code).toContain('比率を固定');
  });
});
