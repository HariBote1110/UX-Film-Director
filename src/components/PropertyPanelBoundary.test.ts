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
    expect(code).toContain('captureSelectedCoordinatesWithAviUtlStore');
    expect(code).toContain('applyAviUtlStoredCoordinatesToSelection');
    expect(code).toContain('aviUtlCoordinateStoreSnapshot');
    expect(code).toContain('AviUtl Motion');
    expect(code).toContain('93 座標格納');
    expect(code).toContain('93 座標の取得');
  });

  it('passes selection order into individual 93 motion presets', () => {
    const code = source();

    expect(code).toContain("const sequenceAwareMotionPresets = new Set<AviUtlMotionPresetId>([");
    expect(code).toContain("'delay-move-individual'");
    expect(code).toContain("'individual-coordinate-rearrange-circle'");
    expect(code).toContain('sequenceAwareMotionPresets.has(presetId) && selectedObjects.length > 1');
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

describe('PropertyPanel AviUtl camera target controls', () => {
  it('exposes the 93 camera target helper through the 3D stage camera panel', () => {
    const code = source();

    expect(code).toContain("import { buildAviUtlCameraTargetPatch, getAviUtlPackCameraPresets");
    expect(code).toContain('const aviUtlCameraPresets = getAviUtlPackCameraPresets()');
    expect(code).toContain('handleApplyAviUtlCameraTargetPreset');
    expect(code).toContain('AviUtl Camera');
    expect(code).toContain('93: 選択オブジェクトを目標にする');
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
    expect(code).toContain('GetColor Dot Field');
    expect(code).toContain('Columns');
    expect(code).toContain('Rows');
    expect(code).toContain('Dot Size');
    expect(code).toContain('Dot Shape');
    expect(code).toContain('Stroke Width');
    expect(code).toContain('Size Influence');
    expect(code).toContain('Luminance Influence');
    expect(code).toContain('Hue Shift');
    expect(code).toContain('Alternate Rows');
    expect(code).toContain("(selectedObject as GetColorDotFieldObject).foregroundColour");
    expect(code).toContain("(selectedObject as GetColorDotFieldObject).secondaryColour");
    expect(code).toContain("(selectedObject as GetColorDotFieldObject).backgroundColour");
    expect(code).toContain('GetColor Sampling');
    expect(code).toContain('Sample Layer');
    expect(code).toContain('Sample Object');
    expect(code).toContain('Sample Strength');
    expect(code).toContain('sampleSourceLayer');
    expect(code).toContain('sampleSourceObjectId');
    expect(code).toContain('sampleStrength');
    expect(code).toContain('sampleHueShiftDegrees');
    expect(code).toContain('Sample Hue Shift');
    expect(code).toContain('getColorSampleCandidates');
    expect(code).toContain("object.type !== 'image' && object.type !== 'psd'");
    expect(code).toContain('PNG/JPEG画像またはPSD');
    expect(code).toContain("import { buildAviUtlBackgroundColourPalettePatch, extractAviUtlBackgroundColourPalette");
    expect(code).toContain('getColorBackgroundColourPalette');
    expect(code).toContain('handleApplyAviUtlBackgroundColourPalette');
    expect(code).toContain('93 Background Colour Eyedropper');
    expect(code).toContain('背景色スポイトpaletteを適用');
  });
});

describe('PropertyPanel hksy palette controls', () => {
  it('exposes 93 background colour eyedropper palette controls for Rust-native hksy objects', () => {
    const code = source();

    expect(code).toContain('HksyCheckerGridObject');
    expect(code).toContain("selectedObject.type === 'hksy_checker_grid'");
    expect(code).toContain('hksy Checker/Grid');
    expect(code).toContain('hksyBackgroundColourPalette');
    expect(code).toContain('handleApplyAviUtlHksyBackgroundColourPalette');
    expect(code).toContain('buildAviUtlHksyPalettePatch');
    expect(code).toContain('93 Background Colour Eyedropper');
    expect(code).toContain('背景色スポイトpaletteをhksyへ適用');
  });
});

describe('PropertyPanel 93 PlainEffector Line controls', () => {
  it('exposes editable controls for Rust-native PlainEffector Line parameters', () => {
    const code = source();

    expect(code).toContain('PlainEffectorLineObject');
    expect(code).toContain("selectedObject.type === 'plain_effector_line'");
    expect(code).toContain('PlainEffector Line Settings');
    expect(code).toContain('Radius');
    expect(code).toContain('Strength');
    expect(code).toContain('Randomness');
    expect(code).toContain('Zoom');
    expect(code).toContain('Invert');
    expect(code).toContain('Line Count');
    expect(code).toContain('Line Width');
    expect(code).toContain("(selectedObject as PlainEffectorLineObject).colour");
    expect(code).toContain('Colour Amount');
  });
});

describe('PropertyPanel 93 Shattered Sphere controls', () => {
  it('exposes editable controls for Rust-native shattered sphere parameters', () => {
    const code = source();

    expect(code).toContain('ShatteredSphereObject');
    expect(code).toContain("selectedObject.type === 'shattered_sphere'");
    expect(code).toContain('Shattered Sphere Settings');
    expect(code).toContain('Fracture Amount');
    expect(code).toContain('Delay');
    expect(code).toContain('Radius');
    expect(code).toContain('Limit Distance');
    expect(code).toContain('Thickness');
    expect(code).toContain('Fragment Size');
    expect(code).toContain('Random Shape');
    expect(code).toContain('Speed');
    expect(code).toContain('Impact');
    expect(code).toContain('Gravity Y');
    expect(code).toContain('Spin');
    expect(code).toContain('Direction Diffusion');
    expect(code).toContain("(selectedObject as ShatteredSphereObject).colour");
    expect(code).toContain('Seed');
  });
});

describe('PropertyPanel 93 Sphere generated object controls', () => {
  it('exposes editable controls for Rust-native Sphere(DrawPixel) and SphericalField parameters', () => {
    const code = source();

    expect(code).toContain('SphereDotsObject');
    expect(code).toContain("selectedObject.type === 'sphere_dots'");
    expect(code).toContain('Sphere(DrawPixel) Settings');
    expect(code).toContain('Columns');
    expect(code).toContain('Rows');
    expect(code).toContain('Rotation Degrees');
    expect(code).toContain('Offset Degrees');
    expect(code).toContain('Luminance Influence');
    expect(code).toContain('Point Size');
    expect(code).toContain('Latitude Line Width');
    expect(code).toContain("(selectedObject as SphereDotsObject).secondaryColour");
    expect(code).toContain('Plane Mode');

    expect(code).toContain('SphericalFieldObject');
    expect(code).toContain("selectedObject.type === 'spherical_field'");
    expect(code).toContain('SphericalField Settings');
    expect(code).toContain('Strength');
    expect(code).toContain('Colour Amount');
    expect(code).toContain('Alpha Amount');
    expect(code).toContain('Ring Count');
    expect(code).toContain('Vector Count');
    expect(code).toContain("(selectedObject as SphericalFieldObject).fieldColour");
    expect(code).toContain('Background Opacity');
    expect(code).toContain('Container');
  });
});
