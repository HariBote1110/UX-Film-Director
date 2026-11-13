/**
 * `SetObjectField` で表現できるフィールドの許可リスト（型ごと）。
 * 正本は `schema/rust-core/*.schema.json`（schemars 生成）で、このファイルはその写し。
 * `objectFieldAllowlist.test.ts` の契約テストが両者の一致を固定するので、
 * スキーマにフィールドが増えたらここも更新すること（テストが落ちて知らせる）。
 * BaseObject 由来フィールドは全型共通として各型へ合成済み。
 */
import type { TimelineObject } from '../types';
import type { Command } from '../generated/rustCore/Command';

export interface ObjectFieldGuard {
  allowed: ReadonlySet<string>;
  required: ReadonlySet<string>;
}

const guard = (allowed: string[], required: string[]): ObjectFieldGuard => ({
  allowed: new Set(allowed),
  required: new Set(required),
});

export const BASE_OBJECT_FIELDS: readonly string[] = ["clipping", "colorCorrection", "customClipping", "duration", "easing", "enableAnimation", "endX", "endY", "filters", "groupGradient", "groupId", "id", "keyframes", "layer", "motionPath", "name", "offset", "opacity", "rotation", "scaleX", "scaleY", "shadow", "startTime", "vibration", "x", "y"];

/** 型判別子 → その型の Fields スキーマ名（契約テストが正本照合に使う）。 */
export const OBJECT_FIELD_SCHEMA_TITLES: Record<string, string> = {
  asanoha_pattern: 'AsanohaPatternObjectFields',
  audio: 'AudioObjectFields',
  audio_sphere: 'AudioSphereObjectFields',
  audio_visualization: 'AudioVisualizationObjectFields',
  barcode: 'BarcodeObjectFields',
  circular_arrow: 'CircularArrowObjectFields',
  colour_wheel: 'ColourWheelObjectFields',
  contour_trace: 'ContourTraceObjectFields',
  displacement_poly: 'DisplacementPolyObjectFields',
  focus_lines_plus: 'FocusLinesPlusObjectFields',
  gear: 'GearObjectFields',
  getcolor_dot_field: 'GetColorDotFieldObjectFields',
  gourd: 'GourdObjectFields',
  group_control: 'GroupControlObjectFields',
  histogram: 'HistogramObjectFields',
  hksy_checker_grid: 'HksyCheckerGridObjectFields',
  hologram: 'HologramObjectFields',
  houndstooth: 'HoundstoothObjectFields',
  image: 'ImageObjectFields',
  paper_airplane: 'PaperAirplaneObjectFields',
  particle: 'ParticleObjectFields',
  pie_chart: 'PieChartObjectFields',
  plain_effector_line: 'PlainEffectorLineObjectFields',
  protractor: 'ProtractorObjectFields',
  psd: 'PsdObjectFields',
  puzzle_piece: 'PuzzlePieceObjectFields',
  random_line_ex: 'RandomLineExObjectFields',
  region_frame: 'RegionFrameObjectFields',
  shaking_polygon: 'ShakingPolygonObjectFields',
  shape: 'ShapeObjectFields',
  shattered_sphere: 'ShatteredSphereObjectFields',
  simple_tube: 'SimpleTubeObjectFields',
  sphere_dots: 'SphereDotsObjectFields',
  spherical_field: 'SphericalFieldObjectFields',
  sunburst: 'SunburstObjectFields',
  tartan_check: 'TartanCheckObjectFields',
  text: 'TextObjectFields',
  tone_curve: 'ToneCurveObjectFields',
  track_bar: 'TrackBarObjectFields',
  triangle_bracket: 'TriangleBracketObjectFields',
  video: 'VideoObjectFields',
  yagasuri: 'YagasuriObjectFields',
};

export const OBJECT_FIELD_GUARDS: Record<string, ObjectFieldGuard> = {
  asanoha_pattern: guard(
    ["backgroundColour", "clipping", "colorCorrection", "customClipping", "duration", "easing", "enableAnimation", "endX", "endY", "filters", "foregroundColour", "groupGradient", "groupId", "height", "id", "keyframes", "layer", "lineWidth", "motionPath", "name", "offset", "opacity", "patternSize", "rotation", "scaleX", "scaleY", "shadow", "startTime", "vibration", "width", "x", "y"],
    ["backgroundColour", "duration", "easing", "enableAnimation", "endX", "endY", "foregroundColour", "height", "id", "layer", "lineWidth", "name", "opacity", "patternSize", "rotation", "scaleX", "scaleY", "startTime", "width", "x", "y"]),
  audio: guard(
    ["clipping", "colorCorrection", "customClipping", "duration", "easing", "enableAnimation", "endX", "endY", "filePath", "filters", "groupGradient", "groupId", "id", "keyframes", "labData", "layer", "motionPath", "muted", "name", "offset", "opacity", "rotation", "scaleX", "scaleY", "shadow", "src", "startTime", "vibration", "volume", "x", "y"],
    ["duration", "easing", "enableAnimation", "endX", "endY", "id", "layer", "muted", "name", "opacity", "rotation", "scaleX", "scaleY", "src", "startTime", "volume", "x", "y"]),
  audio_sphere: guard(
    ["audioInfluence", "baseRadius", "clipping", "colorCorrection", "colour", "columns", "customClipping", "duration", "easing", "enableAnimation", "endX", "endY", "filters", "groupGradient", "groupId", "height", "id", "keyframes", "layer", "motionPath", "name", "offset", "opacity", "pointSize", "polygonSize", "randomAmount", "rotation", "rows", "sampleWindowSeconds", "scaleX", "scaleY", "seed", "shadow", "startTime", "targetAudioId", "targetLayer", "vibration", "width", "x", "y"],
    ["audioInfluence", "baseRadius", "colour", "columns", "duration", "easing", "enableAnimation", "endX", "endY", "height", "id", "layer", "name", "opacity", "pointSize", "polygonSize", "randomAmount", "rotation", "rows", "sampleWindowSeconds", "scaleX", "scaleY", "seed", "startTime", "width", "x", "y"]),
  audio_visualization: guard(
    ["amplitude", "clipping", "color", "colorCorrection", "customClipping", "duration", "easing", "enableAnimation", "endX", "endY", "filters", "groupGradient", "groupId", "height", "id", "keyframes", "layer", "motionPath", "name", "offset", "opacity", "rotation", "scaleX", "scaleY", "shadow", "startTime", "targetAudioId", "targetLayer", "thickness", "vibration", "visualizationType", "width", "x", "y"],
    ["amplitude", "color", "duration", "easing", "enableAnimation", "endX", "endY", "height", "id", "layer", "name", "opacity", "rotation", "scaleX", "scaleY", "startTime", "thickness", "width", "x", "y"]),
  barcode: guard(
    ["backgroundColour", "clipping", "colorCorrection", "customClipping", "data", "duration", "easing", "enableAnimation", "endX", "endY", "filters", "foregroundColour", "groupGradient", "groupId", "height", "horizontalMargin", "id", "keyframes", "layer", "minimumBarWidth", "motionPath", "name", "offset", "opacity", "rotation", "scaleX", "scaleY", "shadow", "startTime", "verticalMargin", "vibration", "width", "x", "y"],
    ["backgroundColour", "data", "duration", "easing", "enableAnimation", "endX", "endY", "foregroundColour", "height", "horizontalMargin", "id", "layer", "minimumBarWidth", "name", "opacity", "rotation", "scaleX", "scaleY", "startTime", "verticalMargin", "width", "x", "y"]),
  circular_arrow: guard(
    ["angleDegrees", "arrowColour", "centreAngleDegrees", "clipping", "colorCorrection", "customClipping", "duration", "easing", "enableAnimation", "endX", "endY", "filters", "flipHorizontal", "flipVertical", "groupGradient", "groupId", "headShape", "headSize", "height", "id", "keyframes", "layer", "lineWidth", "motionPath", "name", "offset", "opacity", "radius", "rotation", "scaleX", "scaleY", "shadow", "showTailHead", "startTime", "vibration", "width", "x", "y"],
    ["angleDegrees", "arrowColour", "centreAngleDegrees", "duration", "easing", "enableAnimation", "endX", "endY", "flipHorizontal", "flipVertical", "headShape", "headSize", "height", "id", "layer", "lineWidth", "name", "opacity", "radius", "rotation", "scaleX", "scaleY", "showTailHead", "startTime", "width", "x", "y"]),
  colour_wheel: guard(
    ["brightness", "clipping", "colorCorrection", "customClipping", "duration", "easing", "enableAnimation", "endX", "endY", "filters", "groupGradient", "groupId", "height", "id", "keyframes", "layer", "motionPath", "name", "offset", "opacity", "radius", "ringWidthPercent", "rotation", "saturation", "scaleX", "scaleY", "segmentCount", "shadow", "startTime", "vibration", "width", "x", "y"],
    ["brightness", "duration", "easing", "enableAnimation", "endX", "endY", "height", "id", "layer", "name", "opacity", "radius", "ringWidthPercent", "rotation", "saturation", "scaleX", "scaleY", "segmentCount", "startTime", "width", "x", "y"]),
  contour_trace: guard(
    ["backgroundOpacity", "clipping", "colorCorrection", "contourCount", "customClipping", "duration", "easing", "enableAnimation", "endX", "endY", "filters", "groupGradient", "groupId", "height", "id", "jitterAmount", "keyframes", "layer", "lineWidth", "motionPath", "name", "offset", "opacity", "rotation", "scaleX", "scaleY", "seed", "shadow", "startTime", "traceColour", "vibration", "width", "x", "y"],
    ["backgroundOpacity", "contourCount", "duration", "easing", "enableAnimation", "endX", "endY", "height", "id", "jitterAmount", "layer", "lineWidth", "name", "opacity", "rotation", "scaleX", "scaleY", "seed", "startTime", "traceColour", "width", "x", "y"]),
  displacement_poly: guard(
    ["clipping", "colorCorrection", "columns", "customClipping", "depthScale", "displacementScale", "duration", "easing", "enableAnimation", "endX", "endY", "fillColour", "fillOpacity", "filters", "groupGradient", "groupId", "height", "id", "keyframes", "layer", "lineColour", "meshOpacity", "motionPath", "name", "offset", "opacity", "rotation", "rows", "scaleX", "scaleY", "seed", "shadow", "startTime", "vibration", "width", "x", "y"],
    ["columns", "depthScale", "displacementScale", "duration", "easing", "enableAnimation", "endX", "endY", "fillColour", "fillOpacity", "height", "id", "layer", "lineColour", "meshOpacity", "name", "opacity", "rotation", "rows", "scaleX", "scaleY", "seed", "startTime", "width", "x", "y"]),
  focus_lines_plus: guard(
    ["centreJitterPercent", "centreRadius", "centreX", "centreY", "clipping", "colorCorrection", "customClipping", "duration", "easing", "enableAnimation", "endX", "endY", "filters", "gap", "groupGradient", "groupId", "height", "id", "keyframeInterval", "keyframes", "layer", "lineColour", "motionPath", "name", "offset", "opacity", "rayWidth", "rotation", "rotationDegrees", "scaleX", "scaleY", "seed", "shadow", "startTime", "vibration", "width", "x", "y"],
    ["centreJitterPercent", "centreRadius", "centreX", "centreY", "duration", "easing", "enableAnimation", "endX", "endY", "gap", "height", "id", "keyframeInterval", "layer", "lineColour", "name", "opacity", "rayWidth", "rotation", "rotationDegrees", "scaleX", "scaleY", "seed", "startTime", "width", "x", "y"]),
  gear: guard(
    ["clipping", "colorCorrection", "customClipping", "duration", "easing", "enableAnimation", "endX", "endY", "fillColour", "filters", "groupGradient", "groupId", "height", "id", "innerRadiusPercent", "keyframes", "layer", "motionPath", "name", "offset", "opacity", "outerRadius", "rotation", "scaleX", "scaleY", "shadow", "startTime", "toothCount", "toothDepthPercent", "toothSkewPercent", "vibration", "width", "x", "y"],
    ["duration", "easing", "enableAnimation", "endX", "endY", "fillColour", "height", "id", "innerRadiusPercent", "layer", "name", "opacity", "outerRadius", "rotation", "scaleX", "scaleY", "startTime", "toothCount", "toothDepthPercent", "toothSkewPercent", "width", "x", "y"]),
  getcolor_dot_field: guard(
    ["alternateRows", "backgroundColour", "clipping", "colorCorrection", "columns", "customClipping", "dotShape", "dotSize", "duration", "easing", "enableAnimation", "endX", "endY", "filters", "foregroundColour", "groupGradient", "groupId", "height", "hueShiftDegrees", "id", "keyframes", "layer", "luminanceInfluence", "motionPath", "name", "offset", "opacity", "rotation", "rows", "sampleHueShiftDegrees", "sampleSourceLayer", "sampleSourceObjectId", "sampleSourcePath", "sampleStrength", "scaleX", "scaleY", "secondaryColour", "seed", "shadow", "sizeInfluence", "startTime", "strokeWidth", "vibration", "width", "x", "y"],
    ["alternateRows", "backgroundColour", "columns", "dotSize", "duration", "easing", "enableAnimation", "endX", "endY", "foregroundColour", "height", "hueShiftDegrees", "id", "layer", "luminanceInfluence", "name", "opacity", "rotation", "rows", "scaleX", "scaleY", "secondaryColour", "seed", "sizeInfluence", "startTime", "width", "x", "y"]),
  gourd: guard(
    ["bodyRadius", "bodyWidth", "clipping", "colorCorrection", "customClipping", "duration", "easing", "enableAnimation", "endX", "endY", "fillColour", "filters", "groupGradient", "groupId", "height", "id", "keyframes", "layer", "motionPath", "name", "offset", "opacity", "repeatCount", "rotation", "scaleX", "scaleY", "shadow", "squashPercent", "startTime", "vibration", "waistRadius", "width", "x", "y"],
    ["bodyRadius", "bodyWidth", "duration", "easing", "enableAnimation", "endX", "endY", "fillColour", "height", "id", "layer", "name", "opacity", "repeatCount", "rotation", "scaleX", "scaleY", "squashPercent", "startTime", "waistRadius", "width", "x", "y"]),
  group_control: guard(
    ["clipping", "colorCorrection", "customClipping", "duration", "easing", "enableAnimation", "endX", "endY", "filters", "groupGradient", "groupId", "id", "keyframes", "layer", "motionPath", "name", "offset", "opacity", "rotation", "scaleX", "scaleY", "shadow", "startTime", "targetLayerCount", "vibration", "x", "y"],
    ["duration", "easing", "enableAnimation", "endX", "endY", "id", "layer", "name", "opacity", "rotation", "scaleX", "scaleY", "startTime", "targetLayerCount", "x", "y"]),
  histogram: guard(
    ["backgroundColour", "binValues", "channelColours", "clipping", "colorCorrection", "customClipping", "duration", "easing", "enableAnimation", "endX", "endY", "filters", "groupGradient", "groupId", "height", "heightScalePercent", "id", "keyframes", "layer", "lineWidth", "motionPath", "name", "offset", "opacity", "rotation", "scaleX", "scaleY", "shadow", "showBlue", "showGreen", "showLuminance", "showRed", "startTime", "vibration", "width", "x", "y"],
    ["backgroundColour", "binValues", "channelColours", "duration", "easing", "enableAnimation", "endX", "endY", "height", "heightScalePercent", "id", "layer", "lineWidth", "name", "opacity", "rotation", "scaleX", "scaleY", "showBlue", "showGreen", "showLuminance", "showRed", "startTime", "width", "x", "y"]),
  hksy_checker_grid: guard(
    ["anchorPoints", "backgroundColour", "cellSize", "checkerEnabled", "clipping", "colorCorrection", "customClipping", "duration", "easing", "enableAnimation", "endX", "endY", "filters", "foregroundColour", "gridEnabled", "groupGradient", "groupId", "height", "id", "keyframes", "layer", "lineWidth", "maxJoinDistance", "motionPath", "name", "offset", "opacity", "paletteColours", "pattern", "rotation", "roundCaps", "scaleX", "scaleY", "secondaryColour", "separateInterval", "separateLineWidth", "shadow", "startTime", "vibration", "width", "x", "y"],
    ["backgroundColour", "cellSize", "checkerEnabled", "duration", "easing", "enableAnimation", "endX", "endY", "foregroundColour", "gridEnabled", "height", "id", "layer", "lineWidth", "name", "opacity", "rotation", "scaleX", "scaleY", "secondaryColour", "startTime", "width", "x", "y"]),
  hologram: guard(
    ["clipping", "colorCorrection", "colourMode", "customClipping", "duration", "easing", "enableAnimation", "endX", "endY", "filters", "gradientAngleDegrees", "groupGradient", "groupId", "height", "id", "keyframes", "layer", "motionPath", "name", "offset", "opacity", "rotation", "rotationDegrees", "scaleX", "scaleY", "shadow", "startTime", "tileSize", "tintColour", "vibration", "width", "x", "y"],
    ["colourMode", "duration", "easing", "enableAnimation", "endX", "endY", "gradientAngleDegrees", "height", "id", "layer", "name", "opacity", "rotation", "rotationDegrees", "scaleX", "scaleY", "startTime", "tileSize", "tintColour", "width", "x", "y"]),
  houndstooth: guard(
    ["backgroundColour", "clipping", "colorCorrection", "customClipping", "duration", "easing", "enableAnimation", "endX", "endY", "filters", "foregroundColour", "groupGradient", "groupId", "height", "id", "keyframes", "layer", "motionPath", "name", "offset", "opacity", "patternSize", "rotation", "scaleX", "scaleY", "shadow", "startTime", "vibration", "width", "x", "y"],
    ["backgroundColour", "duration", "easing", "enableAnimation", "endX", "endY", "foregroundColour", "height", "id", "layer", "name", "opacity", "patternSize", "rotation", "scaleX", "scaleY", "startTime", "width", "x", "y"]),
  image: guard(
    ["clipping", "colorCorrection", "customClipping", "duration", "easing", "enableAnimation", "endX", "endY", "filePath", "filters", "groupGradient", "groupId", "height", "id", "keyframes", "layer", "motionPath", "name", "offset", "opacity", "rotation", "scaleX", "scaleY", "shadow", "src", "startTime", "vibration", "width", "x", "y"],
    ["duration", "easing", "enableAnimation", "endX", "endY", "height", "id", "layer", "name", "opacity", "rotation", "scaleX", "scaleY", "src", "startTime", "width", "x", "y"]),
  paper_airplane: guard(
    ["axisMode", "bodyLength", "clipping", "colorCorrection", "customClipping", "duration", "easing", "enableAnimation", "endX", "endY", "fillColour", "filters", "foldHeight", "followMotionDirection", "gap", "groupGradient", "groupId", "height", "id", "keyframes", "layer", "motionPath", "name", "offset", "opacity", "rotation", "scaleX", "scaleY", "shadow", "startTime", "vibration", "width", "wingWidth", "x", "y"],
    ["axisMode", "bodyLength", "duration", "easing", "enableAnimation", "endX", "endY", "fillColour", "foldHeight", "followMotionDirection", "gap", "height", "id", "layer", "name", "opacity", "rotation", "scaleX", "scaleY", "startTime", "width", "wingWidth", "x", "y"]),
  particle: guard(
    ["clipping", "colorCorrection", "colour", "customClipping", "duration", "easing", "enableAnimation", "endX", "endY", "filters", "groupGradient", "groupId", "height", "id", "keyframes", "layer", "lifetimeSeconds", "motionPath", "name", "offset", "opacity", "particleCount", "rotation", "scaleX", "scaleY", "seed", "shadow", "size", "speed", "spread", "startTime", "vibration", "width", "x", "y"],
    ["colour", "duration", "easing", "enableAnimation", "endX", "endY", "height", "id", "layer", "lifetimeSeconds", "name", "opacity", "particleCount", "rotation", "scaleX", "scaleY", "seed", "size", "speed", "spread", "startTime", "width", "x", "y"]),
  pie_chart: guard(
    ["clipping", "colorCorrection", "customClipping", "duration", "easing", "enableAnimation", "endX", "endY", "filters", "groupGradient", "groupId", "height", "id", "keyframes", "labelMode", "layer", "motionPath", "name", "normaliseToHundred", "offset", "opacity", "progressPercent", "rotation", "scaleX", "scaleY", "shadow", "sliceColours", "sortMode", "startTime", "strokeWidth", "values", "vibration", "width", "x", "y"],
    ["duration", "easing", "enableAnimation", "endX", "endY", "height", "id", "labelMode", "layer", "name", "normaliseToHundred", "opacity", "progressPercent", "rotation", "scaleX", "scaleY", "sliceColours", "sortMode", "startTime", "strokeWidth", "values", "width", "x", "y"]),
  plain_effector_line: guard(
    ["clipping", "colorCorrection", "colour", "colourAmount", "customClipping", "duration", "easing", "enableAnimation", "endX", "endY", "filters", "groupGradient", "groupId", "height", "id", "invert", "keyframes", "layer", "lineCount", "lineWidth", "motionPath", "name", "offset", "opacity", "radius", "randomness", "rotation", "scaleX", "scaleY", "seed", "shadow", "startTime", "strength", "vibration", "width", "x", "y", "zoom"],
    ["colour", "colourAmount", "duration", "easing", "enableAnimation", "endX", "endY", "height", "id", "invert", "layer", "lineCount", "lineWidth", "name", "opacity", "radius", "randomness", "rotation", "scaleX", "scaleY", "seed", "startTime", "strength", "width", "x", "y", "zoom"]),
  protractor: guard(
    ["clipping", "colorCorrection", "customClipping", "decimalPlaces", "duration", "easing", "enableAnimation", "endX", "endY", "filters", "groupGradient", "groupId", "height", "id", "keyframes", "layer", "lineColour", "majorTickStepDegrees", "measuredAngleDegrees", "motionPath", "name", "offset", "opacity", "radius", "rotation", "scaleX", "scaleY", "shadow", "shadowColour", "startTime", "textColour", "tickStepDegrees", "vibration", "width", "x", "y"],
    ["decimalPlaces", "duration", "easing", "enableAnimation", "endX", "endY", "height", "id", "layer", "lineColour", "majorTickStepDegrees", "measuredAngleDegrees", "name", "opacity", "radius", "rotation", "scaleX", "scaleY", "shadowColour", "startTime", "textColour", "tickStepDegrees", "width", "x", "y"]),
  // psd は合成が特殊（types.ts の PsdObject 参照）: rootLayer は Rust 側の
  // 保持専用で TS には現れず、PsdRuntimeFields は JSON を往復しない
  // ランタイム専用フィールド。後者は許可リストに無いため、それが変わる
  // 編集は isFieldDiffRepresentable で記録対象外になる（設計どおり）。
  psd: guard(
    ["activeLayerIds", "clipping", "colorCorrection", "customClipping", "duration", "easing", "enableAnimation", "endX", "endY", "filePath", "filters", "groupGradient", "groupId", "height", "id", "keyframes", "layer", "layerTree", "lipSync", "motionPath", "name", "offset", "opacity", "rotation", "scale", "scaleX", "scaleY", "shadow", "src", "startTime", "vibration", "width", "worldPlacement", "x", "y"],
    ["duration", "easing", "enableAnimation", "endX", "endY", "height", "id", "layer", "name", "opacity", "rotation", "scale", "scaleX", "scaleY", "src", "startTime", "width", "x", "y"]),
  puzzle_piece: guard(
    ["clipping", "colorCorrection", "connectorMode", "customClipping", "duration", "easing", "enableAnimation", "endX", "endY", "fillColour", "filters", "groupGradient", "groupId", "height", "id", "keyframes", "layer", "motionPath", "name", "offset", "opacity", "rotation", "scaleX", "scaleY", "shadow", "shapeVariant", "size", "startTime", "vibration", "width", "x", "y"],
    ["connectorMode", "duration", "easing", "enableAnimation", "endX", "endY", "fillColour", "height", "id", "layer", "name", "opacity", "rotation", "scaleX", "scaleY", "shapeVariant", "size", "startTime", "width", "x", "y"]),
  random_line_ex: guard(
    ["clipping", "colorCorrection", "customClipping", "duration", "easing", "enableAnimation", "endX", "endY", "filters", "groupGradient", "groupId", "height", "id", "keyframes", "layer", "lineColour", "lineCount", "lineWidth", "motionPath", "name", "noiseCellSize", "offset", "opacity", "rotation", "scaleX", "scaleY", "seed", "shadow", "startTime", "threshold", "vibration", "width", "widthVariance", "x", "y"],
    ["duration", "easing", "enableAnimation", "endX", "endY", "height", "id", "layer", "lineColour", "lineCount", "lineWidth", "name", "noiseCellSize", "opacity", "rotation", "scaleX", "scaleY", "seed", "startTime", "threshold", "width", "widthVariance", "x", "y"]),
  region_frame: guard(
    ["backgroundColour", "backgroundOpacity", "clipping", "colorCorrection", "cornerCut", "customClipping", "duration", "easing", "enableAnimation", "endX", "endY", "extraHeight", "extraWidth", "filters", "frameColour", "groupGradient", "groupId", "height", "id", "keyframes", "layer", "lineWidth", "motionPath", "name", "offset", "opacity", "rotation", "scaleX", "scaleY", "shadow", "shape", "startTime", "vibration", "width", "x", "y"],
    ["backgroundColour", "backgroundOpacity", "duration", "easing", "enableAnimation", "endX", "endY", "extraHeight", "extraWidth", "frameColour", "height", "id", "layer", "lineWidth", "name", "opacity", "rotation", "scaleX", "scaleY", "startTime", "width", "x", "y"]),
  shaking_polygon: guard(
    ["clipping", "colorCorrection", "colour", "customClipping", "duration", "easing", "enableAnimation", "endX", "endY", "fill", "filters", "fixedDiameter", "groupGradient", "groupId", "height", "id", "jitterInterval", "jitterRange", "keyframes", "layer", "lineWidth", "motionPath", "name", "offset", "opacity", "repeatCount", "repeatFrequency", "rotation", "scaleX", "scaleY", "seed", "shadow", "startTime", "stepped", "vertexCount", "verticalDistortionPercent", "vibration", "width", "x", "y"],
    ["colour", "duration", "easing", "enableAnimation", "endX", "endY", "fill", "fixedDiameter", "height", "id", "jitterInterval", "jitterRange", "layer", "lineWidth", "name", "opacity", "repeatCount", "repeatFrequency", "rotation", "scaleX", "scaleY", "seed", "startTime", "stepped", "vertexCount", "verticalDistortionPercent", "width", "x", "y"]),
  shape: guard(
    ["clipping", "colorCorrection", "cornerRadius", "customClipping", "duration", "easing", "enableAnimation", "endX", "endY", "fill", "filters", "gradient", "groupGradient", "groupId", "height", "id", "keyframes", "layer", "motionPath", "name", "offset", "opacity", "rotation", "scaleX", "scaleY", "shadow", "shapeType", "startTime", "vibration", "width", "x", "y"],
    ["duration", "easing", "enableAnimation", "endX", "endY", "fill", "height", "id", "layer", "name", "opacity", "rotation", "scaleX", "scaleY", "startTime", "width", "x", "y"]),
  shattered_sphere: guard(
    ["clipping", "colorCorrection", "colour", "customClipping", "delay", "directionDiffusion", "duration", "easing", "enableAnimation", "endX", "endY", "filters", "fractureAmount", "fragmentSize", "gravityX", "gravityY", "gravityZ", "groupGradient", "groupId", "height", "id", "impact", "keyframes", "layer", "limitDistance", "motionPath", "name", "offset", "opacity", "radius", "randomShape", "rotation", "scaleX", "scaleY", "seed", "shadow", "speed", "spin", "startTime", "thickness", "vibration", "width", "x", "y"],
    ["colour", "delay", "directionDiffusion", "duration", "easing", "enableAnimation", "endX", "endY", "fractureAmount", "fragmentSize", "gravityX", "gravityY", "gravityZ", "height", "id", "impact", "layer", "limitDistance", "name", "opacity", "radius", "randomShape", "rotation", "scaleX", "scaleY", "seed", "speed", "spin", "startTime", "thickness", "width", "x", "y"]),
  simple_tube: guard(
    ["clipping", "colorCorrection", "colour", "colourPattern", "customClipping", "depth", "duration", "easing", "enableAnimation", "endX", "endY", "filters", "fogColour", "fogStrength", "groupGradient", "groupId", "height", "id", "keyframes", "layer", "motionPath", "name", "offset", "opacity", "radius", "randomAmount", "rings", "rotation", "scaleX", "scaleY", "secondaryColour", "seed", "segments", "shadow", "startTime", "strokeWidth", "torus", "twistDegrees", "vibration", "width", "x", "y"],
    ["colour", "depth", "duration", "easing", "enableAnimation", "endX", "endY", "height", "id", "layer", "name", "opacity", "radius", "randomAmount", "rings", "rotation", "scaleX", "scaleY", "secondaryColour", "seed", "segments", "startTime", "strokeWidth", "torus", "twistDegrees", "width", "x", "y"]),
  sphere_dots: guard(
    ["clipping", "colorCorrection", "colour", "columns", "customClipping", "duration", "easing", "enableAnimation", "endX", "endY", "filters", "groupGradient", "groupId", "height", "id", "keyframes", "latitudeLineWidth", "layer", "luminanceInfluence", "motionPath", "name", "offset", "offsetDegrees", "opacity", "planeMode", "pointSize", "radius", "rotation", "rotationDegrees", "rows", "scaleX", "scaleY", "secondaryColour", "seed", "shadow", "startTime", "vibration", "width", "x", "y"],
    ["colour", "columns", "duration", "easing", "enableAnimation", "endX", "endY", "height", "id", "latitudeLineWidth", "layer", "luminanceInfluence", "name", "offsetDegrees", "opacity", "planeMode", "pointSize", "radius", "rotation", "rotationDegrees", "rows", "scaleX", "scaleY", "secondaryColour", "seed", "startTime", "width", "x", "y"]),
  spherical_field: guard(
    ["alphaAmount", "backgroundOpacity", "clipping", "colorCorrection", "colourAmount", "container", "customClipping", "duration", "easing", "enableAnimation", "endX", "endY", "fieldColour", "filters", "groupGradient", "groupId", "height", "id", "keyframes", "layer", "lineWidth", "motionPath", "name", "offset", "opacity", "radius", "ringCount", "rotation", "scaleX", "scaleY", "secondaryColour", "seed", "shadow", "startTime", "strength", "vectorCount", "vibration", "width", "x", "y"],
    ["alphaAmount", "backgroundOpacity", "colourAmount", "container", "duration", "easing", "enableAnimation", "endX", "endY", "fieldColour", "height", "id", "layer", "lineWidth", "name", "opacity", "radius", "ringCount", "rotation", "scaleX", "scaleY", "secondaryColour", "seed", "startTime", "strength", "vectorCount", "width", "x", "y"]),
  sunburst: guard(
    ["backgroundColour", "centreXPercent", "centreYPercent", "clipping", "colorCorrection", "customClipping", "duration", "easing", "enableAnimation", "endX", "endY", "filters", "groupGradient", "groupId", "height", "id", "keyframes", "layer", "motifShape", "motifSize", "motionPath", "name", "offset", "opacity", "rayColour", "rayCount", "rayCoveragePercent", "rotation", "rotationOffsetDegrees", "scaleX", "scaleY", "shadow", "startTime", "vibration", "width", "x", "y"],
    ["backgroundColour", "centreXPercent", "centreYPercent", "duration", "easing", "enableAnimation", "endX", "endY", "height", "id", "layer", "motifShape", "motifSize", "name", "opacity", "rayColour", "rayCount", "rayCoveragePercent", "rotation", "rotationOffsetDegrees", "scaleX", "scaleY", "startTime", "width", "x", "y"]),
  tartan_check: guard(
    ["baseColour", "blurRadius", "clipping", "colorCorrection", "customClipping", "duration", "easing", "enableAnimation", "endX", "endY", "filters", "groupGradient", "groupId", "height", "id", "keyframes", "layer", "lineColour", "motionPath", "name", "offset", "opacity", "rotation", "scaleX", "scaleY", "shadow", "startTime", "stripeColourA", "stripeColourB", "tileSize", "vibration", "width", "x", "y"],
    ["baseColour", "blurRadius", "duration", "easing", "enableAnimation", "endX", "endY", "height", "id", "layer", "lineColour", "name", "opacity", "rotation", "scaleX", "scaleY", "startTime", "stripeColourA", "stripeColourB", "tileSize", "width", "x", "y"]),
  text: guard(
    ["clipping", "colorCorrection", "customClipping", "duration", "easing", "enableAnimation", "endX", "endY", "fill", "filters", "fontFamily", "fontSize", "groupGradient", "groupId", "id", "keyframes", "layer", "letterSpacing", "measuredHeight", "measuredWidth", "motionPath", "name", "offset", "opacity", "rotation", "scaleX", "scaleY", "shadow", "startTime", "text", "textAlignment", "textShadow", "textStroke", "vibration", "x", "y"],
    ["duration", "easing", "enableAnimation", "endX", "endY", "fill", "fontFamily", "fontSize", "id", "layer", "name", "opacity", "rotation", "scaleX", "scaleY", "startTime", "text", "x", "y"]),
  tone_curve: guard(
    ["backgroundColour", "clipping", "colorCorrection", "curveColour", "curvePoints", "customClipping", "duration", "easing", "enableAnimation", "endX", "endY", "filters", "gridColour", "gridDivisions", "groupGradient", "groupId", "height", "id", "keyframes", "layer", "lineWidth", "motionPath", "name", "offset", "opacity", "rotation", "scaleX", "scaleY", "shadow", "startTime", "vibration", "width", "x", "y"],
    ["backgroundColour", "curveColour", "curvePoints", "duration", "easing", "enableAnimation", "endX", "endY", "gridColour", "gridDivisions", "height", "id", "layer", "lineWidth", "name", "opacity", "rotation", "scaleX", "scaleY", "startTime", "width", "x", "y"]),
  track_bar: guard(
    ["backgroundOpacity", "barColour", "clipping", "colorCorrection", "customClipping", "duration", "easing", "enableAnimation", "endX", "endY", "filters", "groupGradient", "groupId", "height", "id", "keyframes", "labels", "layer", "motionPath", "name", "offset", "opacity", "rotation", "scaleX", "scaleY", "shadow", "startTime", "trackRanges", "trackValues", "vibration", "width", "x", "y"],
    ["backgroundOpacity", "barColour", "duration", "easing", "enableAnimation", "endX", "endY", "height", "id", "labels", "layer", "name", "opacity", "rotation", "scaleX", "scaleY", "startTime", "trackRanges", "trackValues", "width", "x", "y"]),
  triangle_bracket: guard(
    ["angleDegrees", "armLength", "bracketColour", "bracketWidth", "clipping", "colorCorrection", "customClipping", "duration", "easing", "enableAnimation", "endX", "endY", "filters", "groupGradient", "groupId", "height", "id", "keyframes", "layer", "motionPath", "name", "offset", "offsetDistance", "opacity", "rotation", "scaleX", "scaleY", "shadow", "startTime", "vibration", "width", "x", "y"],
    ["angleDegrees", "armLength", "bracketColour", "bracketWidth", "duration", "easing", "enableAnimation", "endX", "endY", "height", "id", "layer", "name", "offsetDistance", "opacity", "rotation", "scaleX", "scaleY", "startTime", "width", "x", "y"]),
  video: guard(
    ["clipping", "colorCorrection", "customClipping", "duration", "easing", "enableAnimation", "endX", "endY", "filePath", "filters", "groupGradient", "groupId", "height", "id", "keyframes", "layer", "motionPath", "muted", "name", "offset", "opacity", "proxyFilePath", "reversed", "rotation", "scaleX", "scaleY", "shadow", "sourceHeight", "sourceWidth", "src", "startTime", "subjectCropEnabled", "subjectCropKeyframes", "vibration", "volume", "width", "x", "y"],
    ["duration", "easing", "enableAnimation", "endX", "endY", "height", "id", "layer", "muted", "name", "opacity", "rotation", "scaleX", "scaleY", "src", "startTime", "volume", "width", "x", "y"]),
  yagasuri: guard(
    ["arrowHeight", "arrowWidth", "backgroundColour", "clipping", "colorCorrection", "customClipping", "duration", "easing", "enableAnimation", "endX", "endY", "filters", "foregroundColour", "groupGradient", "groupId", "height", "id", "keyframes", "layer", "lineWidth", "motionPath", "name", "offset", "opacity", "rotation", "scaleX", "scaleY", "shadow", "staggered", "startTime", "vibration", "width", "x", "y"],
    ["arrowHeight", "arrowWidth", "backgroundColour", "duration", "easing", "enableAnimation", "endX", "endY", "foregroundColour", "height", "id", "layer", "lineWidth", "name", "opacity", "rotation", "scaleX", "scaleY", "staggered", "startTime", "width", "x", "y"]),
};

export const getObjectFieldGuard = (objectType: string): ObjectFieldGuard | undefined =>
  OBJECT_FIELD_GUARDS[objectType];

/**
 * 差分コマンド列が `SetObjectField` で表現可能か。1件でも表現できない
 * フィールドがあれば全体を false にする（部分的に積むと undo で一部だけ
 * 戻る最悪の挙動になるため、記録ごと諦める設計。設計書
 * markdown/UpdateObject_History_Design.md §7）。
 * 必須フィールドへの null 適用も Rust 側の再 deserialize が失敗するため不可。
 */
export const isFieldDiffRepresentable = (
  object: TimelineObject,
  commands: readonly Command[],
): boolean => {
  const objectGuard = getObjectFieldGuard(object.type);
  if (!objectGuard) return false;
  return commands.every((command) => {
    if (command.kind !== 'setObjectField') return false;
    if (!objectGuard.allowed.has(command.field)) return false;
    if (objectGuard.required.has(command.field)
      && (command.previous === null || command.next === null)) return false;
    return true;
  });
};
