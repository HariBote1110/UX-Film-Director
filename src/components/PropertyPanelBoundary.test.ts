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

  it('exposes editable hksy checker/grid geometry controls for Rust-native hksy objects', () => {
    const code = source();

    expect(code).toContain('Pattern');
    expect(code).toContain('Cell Size');
    expect(code).toContain('Line Width');
    expect(code).toContain('Checker');
    expect(code).toContain('Grid');
    expect(code).toContain("(selectedObject as HksyCheckerGridObject).pattern");
    expect(code).toContain("(selectedObject as HksyCheckerGridObject).cellSize");
    expect(code).toContain("(selectedObject as HksyCheckerGridObject).lineWidth");
    expect(code).toContain("(selectedObject as HksyCheckerGridObject).checkerEnabled");
    expect(code).toContain("(selectedObject as HksyCheckerGridObject).gridEnabled");
    expect(code).toContain('checker-grid');
    expect(code).toContain('diamond');
    expect(code).toContain('measured-grid');
    expect(code).toContain('anchor-line');
  });

  it('exposes detailed measured-grid and anchor-line hksy controls for Rust-native hksy objects', () => {
    const code = source();

    expect(code).toContain('Separate Interval');
    expect(code).toContain('Separate Line Width');
    expect(code).toContain('Anchor A X');
    expect(code).toContain('Anchor A Y');
    expect(code).toContain('Anchor B X');
    expect(code).toContain('Anchor B Y');
    expect(code).toContain('Round Caps');
    expect(code).toContain('Max Join Distance');
    expect(code).toContain("(selectedObject as HksyCheckerGridObject).separateInterval");
    expect(code).toContain("(selectedObject as HksyCheckerGridObject).separateLineWidth");
    expect(code).toContain("(selectedObject as HksyCheckerGridObject).anchorPoints");
    expect(code).toContain("(selectedObject as HksyCheckerGridObject).roundCaps");
    expect(code).toContain("(selectedObject as HksyCheckerGridObject).maxJoinDistance");
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

  it('makes shattered sphere parameters practical to tune from the property panel', () => {
    const code = source();

    expect(code).toContain('ShatteredSphereNumberControl');
    expect(code).toContain('data-testid="shattered-sphere-settings"');
    expect(code).toContain('data-shattered-sphere-control={controlKey}');
    expect(code).toContain('controlKey="fractureAmount"');
    expect(code).toContain('controlKey="speed"');
    expect(code).toContain('controlKey="gravityY"');
    expect(code).toContain('shatteredSpherePresetPatches');
    expect(code).toContain('Soft Burst');
    expect(code).toContain('Fast Burst');
    expect(code).toContain('Gravity Drop');
    expect(code).toContain('Reset 93');
    expect(code).toContain('applyShatteredSpherePatch');
    expect(code).toContain('aria-label="93 shattered sphere colour hex"');
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

describe('PropertyPanel generated object coverage', () => {
  it('exposes core AviUtl generated object parameters that already feed Rust snapshot sources', () => {
    const code = source();

    expect(code).toContain('BarcodeObject');
    expect(code).toContain("selectedObject.type === 'barcode'");
    expect(code).toContain('Barcode Settings');
    expect(code).toContain('Minimum Bar Width');
    expect(code).toContain('Horizontal Margin');

    expect(code).toContain('PuzzlePieceObject');
    expect(code).toContain("selectedObject.type === 'puzzle_piece'");
    expect(code).toContain('Puzzle Piece Settings');
    expect(code).toContain('Connector Mode');

    expect(code).toContain('ColourWheelObject');
    expect(code).toContain("selectedObject.type === 'colour_wheel'");
    expect(code).toContain('Colour Wheel Settings');
    expect(code).toContain('Ring Width %');

    expect(code).toContain('GourdObject');
    expect(code).toContain("selectedObject.type === 'gourd'");
    expect(code).toContain('Gourd Settings');

    expect(code).toContain('GearObject');
    expect(code).toContain("selectedObject.type === 'gear'");
    expect(code).toContain('Gear Settings');
    expect(code).toContain('Tooth Skew %');
  });

  it('exposes chart and curve generated object parameters from Rust snapshot sources', () => {
    const code = source();

    expect(code).toContain('TrackBarObject');
    expect(code).toContain("selectedObject.type === 'track_bar'");
    expect(code).toContain('Track Bar Settings');
    expect(code).toContain('Track Values');
    expect(code).toContain('Track Ranges');

    expect(code).toContain('PieChartObject');
    expect(code).toContain("selectedObject.type === 'pie_chart'");
    expect(code).toContain('Pie Chart Settings');
    expect(code).toContain('Sort Mode');
    expect(code).toContain('Slice Colours');

    expect(code).toContain('HistogramObject');
    expect(code).toContain("selectedObject.type === 'histogram'");
    expect(code).toContain('Histogram Settings');
    expect(code).toContain('Bin Values');
    expect(code).toContain('Show Luminance');

    expect(code).toContain('ToneCurveObject');
    expect(code).toContain("selectedObject.type === 'tone_curve'");
    expect(code).toContain('Tone Curve Settings');
    expect(code).toContain('Curve Points');
  });

  it('exposes pattern and motion-utility generated object parameters from Rust snapshot sources', () => {
    const code = source();

    expect(code).toContain('SunburstObject');
    expect(code).toContain("selectedObject.type === 'sunburst'");
    expect(code).toContain('Sunburst Settings');
    expect(code).toContain('Ray Coverage %');

    expect(code).toContain('CircularArrowObject');
    expect(code).toContain("selectedObject.type === 'circular_arrow'");
    expect(code).toContain('Circular Arrow Settings');
    expect(code).toContain('Tail Head');

    expect(code).toContain('TriangleBracketObject');
    expect(code).toContain("selectedObject.type === 'triangle_bracket'");
    expect(code).toContain('Triangle Bracket Settings');

    expect(code).toContain('TartanCheckObject');
    expect(code).toContain("selectedObject.type === 'tartan_check'");
    expect(code).toContain('Tartan Check Settings');

    expect(code).toContain('HoundstoothObject');
    expect(code).toContain("selectedObject.type === 'houndstooth'");
    expect(code).toContain('Houndstooth Settings');

    expect(code).toContain('YagasuriObject');
    expect(code).toContain("selectedObject.type === 'yagasuri'");
    expect(code).toContain('Yagasuri Settings');

    expect(code).toContain('PaperAirplaneObject');
    expect(code).toContain("selectedObject.type === 'paper_airplane'");
    expect(code).toContain('Paper Airplane Settings');

    expect(code).toContain('AsanohaPatternObject');
    expect(code).toContain("selectedObject.type === 'asanoha_pattern'");
    expect(code).toContain('Asanoha Pattern Settings');

    expect(code).toContain('FocusLinesPlusObject');
    expect(code).toContain("selectedObject.type === 'focus_lines_plus'");
    expect(code).toContain('Focus Lines Plus Settings');

    expect(code).toContain('RandomLineExObject');
    expect(code).toContain("selectedObject.type === 'random_line_ex'");
    expect(code).toContain('Random Line EX Settings');
  });

  it('exposes 93 generated object parameters from Rust snapshot sources', () => {
    const code = source();

    expect(code).toContain('AudioSphereObject');
    expect(code).toContain("selectedObject.type === 'audio_sphere'");
    expect(code).toContain('Audio Sphere Settings');
    expect(code).toContain('Sample Window');

    expect(code).toContain('RegionFrameObject');
    expect(code).toContain("selectedObject.type === 'region_frame'");
    expect(code).toContain('Region Frame Settings');
    expect(code).toContain('Background Opacity');

    expect(code).toContain('SimpleTubeObject');
    expect(code).toContain("selectedObject.type === 'simple_tube'");
    expect(code).toContain('SimpleTube Settings');
    expect(code).toContain('Colour Pattern');

    expect(code).toContain('ContourTraceObject');
    expect(code).toContain("selectedObject.type === 'contour_trace'");
    expect(code).toContain('Contour Trace Settings');

    expect(code).toContain('DisplacementPolyObject');
    expect(code).toContain("selectedObject.type === 'displacement_poly'");
    expect(code).toContain('Displacement Poly Settings');

    expect(code).toContain('HologramObject');
    expect(code).toContain("selectedObject.type === 'hologram'");
    expect(code).toContain('Hologram Settings');

    expect(code).toContain('ProtractorObject');
    expect(code).toContain("selectedObject.type === 'protractor'");
    expect(code).toContain('Protractor Settings');
    expect(code).toContain('Measured Angle');

    expect(code).toContain('ShakingPolygonObject');
    expect(code).toContain("selectedObject.type === 'shaking_polygon'");
    expect(code).toContain('Shaking Polygon Settings');
    expect(code).toContain('Jitter Interval');
  });
});
