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

describe('PropertyPanel AviUtl motion preset controls', () => {
  it('exposes AviUtlPackV4 motion presets through the keyframe panel', () => {
    const code = source();

    expect(code).toContain("import { buildAviUtlMotionPresetPatch, getAviUtlPackMotionPresets");
    expect(code).toContain('const aviUtlMotionPresets = getAviUtlPackMotionPresets()');
    expect(code).toContain('handleApplyAviUtlMotionPreset');
    expect(code).toContain('AviUtl Motion');
  });
});

describe('PropertyPanel AviUtl effect preset controls', () => {
  it('exposes AviUtlPackV4 effect presets through the filter stack panel', () => {
    const code = source();

    expect(code).toContain("import { applyAviUtlEffectPresetToObject, getAviUtlPackEffectPresets");
    expect(code).toContain('const aviUtlEffectPresets = getAviUtlPackEffectPresets()');
    expect(code).toContain('handleApplyAviUtlEffectPreset');
    expect(code).toContain('AviUtl Effects');
  });
});
