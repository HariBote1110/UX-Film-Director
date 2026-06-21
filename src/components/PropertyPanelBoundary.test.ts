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

describe('PropertyPanel standard particle controls', () => {
  it('exposes editable controls for Rust-native standard particle parameters', () => {
    const code = source();

    expect(code).toContain('ParticleObject');
    expect(code).toContain("selectedObject.type === 'particle'");
    expect(code).toContain('Particle Settings');
    expect(code).toContain('Particle Count');
    expect(code).toContain('Seed');
    expect(code).toContain('Spread');
    expect(code).toContain('Speed');
    expect(code).toContain('Particle Size');
    expect(code).toContain('Lifetime');
    expect(code).toContain("(selectedObject as ParticleObject).colour");
  });
});

describe('PropertyPanel GetColor sampling controls', () => {
  it('exposes editable controls for Rust-native GetColor image sampling', () => {
    const code = source();

    expect(code).toContain('GetColorDotFieldObject');
    expect(code).toContain("selectedObject.type === 'getcolor_dot_field'");
    expect(code).toContain('GetColor Sampling');
    expect(code).toContain('Sample Layer');
    expect(code).toContain('Sample Object');
    expect(code).toContain('Sample Strength');
    expect(code).toContain('sampleSourceLayer');
    expect(code).toContain('sampleSourceObjectId');
    expect(code).toContain('sampleStrength');
    expect(code).toContain('getColorSampleCandidates');
    expect(code).toContain("object.type !== 'image' && object.type !== 'psd'");
    expect(code).toContain('PNG/JPEG画像またはPSD');
  });
});
