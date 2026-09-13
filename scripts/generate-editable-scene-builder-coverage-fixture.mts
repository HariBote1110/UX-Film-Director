/** 42 kind の editable scene builder parity fixture を生成する。 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { TimelineObject } from '../src/types';
import { buildEditableRustScene } from '../src/utils/editableRustScene';
import { mediaReferenceForEditableRustScene } from '../src/utils/rustSceneSnapshot';
import { buildDefaultStandardParticleObject } from '../src/utils/objectFactories/particleObjectFactory';
import { buildAviUtlBarcodeObject } from '../src/utils/objectFactories/barcodeObjectFactory';
import { buildAviUtlPuzzlePieceObject } from '../src/utils/objectFactories/puzzlePieceObjectFactory';
import { buildAviUtlColourWheelObject } from '../src/utils/objectFactories/colourWheelObjectFactory';
import { buildAviUtlGourdObject } from '../src/utils/objectFactories/gourdObjectFactory';
import { buildAviUtlGearObject } from '../src/utils/objectFactories/gearObjectFactory';
import { buildAviUtlTrackBarObject } from '../src/utils/objectFactories/trackBarObjectFactory';
import { buildAviUtlPieChartObject } from '../src/utils/objectFactories/pieChartObjectFactory';
import { buildAviUtlHistogramObject } from '../src/utils/objectFactories/histogramObjectFactory';
import { buildAviUtlToneCurveObject } from '../src/utils/objectFactories/toneCurveObjectFactory';
import { buildAviUtlSphereDotsObject } from '../src/utils/objectFactories/sphereDotsObjectFactory';
import { buildAviUtlSphericalFieldObject } from '../src/utils/objectFactories/sphericalFieldObjectFactory';
import { buildAviUtlSunburstObject } from '../src/utils/objectFactories/sunburstObjectFactory';
import { buildAviUtlCircularArrowObject } from '../src/utils/objectFactories/circularArrowObjectFactory';
import { buildAviUtlTriangleBracketObject } from '../src/utils/objectFactories/triangleBracketObjectFactory';
import { buildAviUtlTartanCheckObject } from '../src/utils/objectFactories/tartanCheckObjectFactory';
import { buildAviUtlHoundstoothObject } from '../src/utils/objectFactories/houndstoothObjectFactory';
import { buildAviUtlYagasuriObject } from '../src/utils/objectFactories/yagasuriObjectFactory';
import { buildAviUtlPaperAirplaneObject } from '../src/utils/objectFactories/paperAirplaneObjectFactory';
import { buildAviUtlAsanohaPatternObject } from '../src/utils/objectFactories/asanohaPatternObjectFactory';
import { buildAviUtlFocusLinesPlusObject } from '../src/utils/objectFactories/focusLinesPlusObjectFactory';
import { buildAviUtlRandomLineExObject } from '../src/utils/objectFactories/randomLineExObjectFactory';
import { buildAviUtlContourTraceObject } from '../src/utils/objectFactories/contourTraceObjectFactory';
import { buildAviUtlDisplacementPolyObject } from '../src/utils/objectFactories/displacementPolyObjectFactory';
import { buildAviUtlPlainEffectorLineObject } from '../src/utils/objectFactories/plainEffectorLineObjectFactory';
import { buildAviUtlHologramObject } from '../src/utils/objectFactories/hologramObjectFactory';
import { buildAviUtlProtractorObject } from '../src/utils/objectFactories/protractorObjectFactory';

const here = dirname(fileURLToPath(import.meta.url));
const outputPath = join(here, '..', 'rust-core', 'tests', 'fixtures', 'editable-scene-builder', 'all-object-types.json');
const settings = { width: 1920, height: 1080, fps: 60, sampleRate: 48000 };
const layers = Array.from({ length: 42 }, (_, index) => ({ id: `layer-${index}`, name: `Coverage ${index}`, visible: true, locked: false }));
const input = (id: string, layer: number) => ({ id, projectWidth: settings.width, projectHeight: settings.height, startTime: 0, layer });

const common = (id: string, layer: number, type: string): Record<string, unknown> => ({
  id, type, name: `coverage-${type}`, layer, startTime: 0, duration: 5,
  x: 17 + layer, y: 23 + layer, rotation: 7, scaleX: 1.1, scaleY: 0.9,
  opacity: 0.73, enableAnimation: false, endX: 17 + layer, endY: 23 + layer, easing: 'linear',
});

const coverageOverrides: Record<string, Record<string, unknown>> = {
  particle: { particleCount: 1, spread: 0, lifetimeSeconds: 0.01 }, barcode: { minimumBarWidth: 0.1, horizontalMargin: 0, verticalMargin: 7 },
  puzzle_piece: { size: 1, shapeVariant: 0, connectorMode: 'convex' }, colour_wheel: { radius: 1, saturation: 0, segmentCount: 3 },
  gourd: { bodyRadius: 1, squashPercent: 0, repeatCount: 1 }, gear: { outerRadius: 1, innerRadiusPercent: 0, toothCount: 3 },
  track_bar: { trackValues: [], trackRanges: [], labels: [] }, pie_chart: { values: [0, 1], sortMode: 'none', normaliseToHundred: false, progressPercent: 0 },
  histogram: { binValues: [], heightScalePercent: 0, lineWidth: 1, showLuminance: true }, tone_curve: { points: [], channel: 'red', lineWidth: 1 },
  sphere_dots: { radius: 1, dotSize: 0, latitudeCount: 2, longitudeCount: 3 }, spherical_field: { radius: 1, pointCount: 1, pointSize: 0, randomAmount: 0 },
  sunburst: { rayCount: 1, rayCoveragePercent: 0, motifSize: 1, centreXPercent: 0 }, circular_arrow: { radius: 1, lineWidth: 0, headSize: 1, angleDegrees: 0 },
  triangle_bracket: { bracketWidth: 1, angleDegrees: -180, armLength: 1, offsetDistance: 0 }, tartan_check: { tileSize: 1, blurRadius: 0 }, houndstooth: { patternSize: 1 },
  yagasuri: { arrowWidth: 1, arrowHeight: 1, lineWidth: 0, staggered: false }, paper_airplane: { bodyLength: 1, wingWidth: 1, foldHeight: 0, gap: 0, followMotionDirection: false },
  asanoha_pattern: { patternSize: 1, lineWidth: 0 }, focus_lines_plus: { rayWidth: 0, gap: 0, centreRadius: 0, centreJitterPercent: 0, keyframeInterval: 1 },
  random_line_ex: { lineCount: 1, lineWidth: 0, threshold: 0, noiseCellSize: 1, widthVariance: 0 }, contour_trace: { lineWidth: 0, contourCount: 1, jitterAmount: 0, backgroundOpacity: 0 },
  displacement_poly: { columns: 1, rows: 1, displacementScale: 0, depthScale: 0, meshOpacity: 0, fillOpacity: 0 },
  plain_effector_line: { radius: -1, strength: 10, randomness: -1000, zoom: -2, lineCount: 0, lineWidth: 0, colour: 'invalid', colourAmount: 0 },
  hologram: { tileSize: 9, rotationDegrees: -720, gradientAngleDegrees: 720, colourMode: 0, tintColour: 'invalid' },
  protractor: { radius: 0, measuredAngleDegrees: 0, tickStepDegrees: 1, majorTickStepDegrees: 1, decimalPlaces: 0, lineColour: 'invalid' },
};

const factoryObjects = [
  buildDefaultStandardParticleObject(input('particle', 9)), buildAviUtlBarcodeObject(input('barcode', 10)),
  buildAviUtlPuzzlePieceObject(input('puzzle_piece', 11)), buildAviUtlColourWheelObject(input('colour_wheel', 12)),
  buildAviUtlGourdObject(input('gourd', 13)), buildAviUtlGearObject(input('gear', 14)),
  buildAviUtlTrackBarObject(input('track_bar', 15)), buildAviUtlPieChartObject(input('pie_chart', 16)),
  buildAviUtlHistogramObject(input('histogram', 17)), buildAviUtlToneCurveObject(input('tone_curve', 18)),
  buildAviUtlSphereDotsObject(input('sphere_dots', 22)), buildAviUtlSphericalFieldObject(input('spherical_field', 23)),
  buildAviUtlSunburstObject(input('sunburst', 24)), buildAviUtlCircularArrowObject(input('circular_arrow', 25)),
  buildAviUtlTriangleBracketObject(input('triangle_bracket', 26)), buildAviUtlTartanCheckObject(input('tartan_check', 27)),
  buildAviUtlHoundstoothObject(input('houndstooth', 28)), buildAviUtlYagasuriObject(input('yagasuri', 29)),
  buildAviUtlPaperAirplaneObject(input('paper_airplane', 30)), buildAviUtlAsanohaPatternObject(input('asanoha_pattern', 31)),
  buildAviUtlFocusLinesPlusObject(input('focus_lines_plus', 32)), buildAviUtlRandomLineExObject(input('random_line_ex', 33)),
  buildAviUtlContourTraceObject(input('contour_trace', 34)), buildAviUtlDisplacementPolyObject(input('displacement_poly', 35)),
  buildAviUtlPlainEffectorLineObject(input('plain_effector_line', 36)), buildAviUtlHologramObject(input('hologram', 37)),
  buildAviUtlProtractorObject(input('protractor', 38)),
].map((object) => ({ ...object, ...coverageOverrides[object.type], x: object.x + 13, opacity: 0.73 }));

const baseObjects: Record<string, unknown>[] = [
  { ...common('text', 0, 'text'), text: 'Coverage', fontSize: 42, fontFamily: 'sans-serif', fill: '#f0c', measuredWidth: 320, measuredHeight: 60, textAlignment: 'centre', letterSpacing: 2 },
  { ...common('shape', 1, 'shape'), shapeType: 'ellipse', width: 320, height: 180, fill: '#123456', cornerRadius: 9 },
  { ...common('image', 2, 'image'), src: '/fixtures/coverage.png', filePath: '/fixtures/coverage.png', width: 320, height: 180 },
  { ...common('video', 3, 'video'), src: '/fixtures/coverage.mp4', filePath: '/fixtures/coverage.mp4', width: 320, height: 180, volume: 0.65, muted: false, offset: 0.25 },
  { ...common('audio', 4, 'audio'), src: 'blob:coverage-audio', filePath: '/fixtures/coverage.wav', volume: 0.7, muted: false },
  { ...common('psd', 5, 'psd'), src: '/fixtures/coverage.psd', filePath: '/fixtures/coverage.psd', width: 320, height: 180, scale: 1.2, activeLayerIds: { 'z-layer': true, 'a-layer': true, 'off-layer': false } },
  { ...common('group_control', 6, 'group_control'), targetLayerCount: 0 },
  { ...common('audio_visualization', 7, 'audio_visualization'), targetAudioId: 'audio', targetLayer: 4, visualizationType: 'waveform', color: '#f00', thickness: 3, width: 320, height: 120, amplitude: 1.4 },
  { ...common('audio_sphere', 8, 'audio_sphere'), targetAudioId: 'audio', targetLayer: 4, width: 320, height: 320, sampleWindowSeconds: 0.2, columns: 20, rows: 14, baseRadius: 120, audioInfluence: 0.8, pointSize: 6, polygonSize: 0.4, randomAmount: 0.1, colour: '#36c2ff', seed: 17 },
  ...factoryObjects,
  { ...common('hksy_checker_grid', 19, 'hksy_checker_grid'), width: 320, height: 180, pattern: 'grid', cellSize: 24, lineWidth: 3, checkerEnabled: true, gridEnabled: false, foregroundColour: '#ffffff', secondaryColour: '#00ffff', backgroundColour: '#111111' },
  { ...common('getcolor_dot_field', 20, 'getcolor_dot_field'), width: 320, height: 180, columns: 24, rows: 12, dotSize: 8, sizeInfluence: 0.4, luminanceInfluence: 0.8, hueShiftDegrees: 12, alternateRows: false, foregroundColour: '#ffffff', secondaryColour: '#00ffff', backgroundColour: '#111111', seed: 17 },
  { ...common('region_frame', 21, 'region_frame'), width: 320, height: 180, lineWidth: 8, extraWidth: 4, extraHeight: 5, backgroundOpacity: 0.3, frameColour: '#fff', backgroundColour: '#ccf', shape: 'ellipse' },
  { ...common('simple_tube', 40, 'simple_tube'), width: 320, height: 180, radius: 120, depth: 240, segments: 20, rings: 12, twistDegrees: 15, randomAmount: 0.2, strokeWidth: 4, colour: '#0e769f', secondaryColour: '#fff', seed: 17, torus: true },
  { ...common('shaking_polygon', 41, 'shaking_polygon'), width: 320, height: 320, lineWidth: 12, vertexCount: 5, fixedDiameter: 300, verticalDistortionPercent: 8, repeatCount: 2, repeatFrequency: 3, fill: true, jitterRange: 25, jitterInterval: 11, stepped: true, colour: '#fff', seed: 17 },
  { ...common('shattered_sphere', 42, 'shattered_sphere'), width: 320, height: 320, fractureAmount: 120, delay: 90, radius: 150, limitDistance: 140, thickness: 18, fragmentSize: 35, randomShape: 80, speed: 90, impact: 80, gravityX: 1, gravityY: 90, gravityZ: -1, spin: 80, directionDiffusion: 70, colour: '#fff', seed: 17 },
];

// group_control の対象を含めるため、layer-42 まで生成する。
layers.push({ id: 'layer-42', name: 'Coverage 42', visible: true, locked: false });
const objects = baseObjects.map((object) => object as unknown as TimelineObject);
const graph = { settings, layers, objects };
const tsMedia = objects
  .filter((object) => object.type !== 'audio' && object.type !== 'group_control')
  .sort((left, right) => left.layer - right.layer)
  .map((object) => mediaReferenceForEditableRustScene(object as never, settings.fps, objects));
// TS の editable builder が現在受理する V1 対象だけで Project を生成する。
// 42 種全体の media は上の canonical serializer で引き続き coverage する。
const editableProjectObjects = objects.filter((object) => [
  'group_control',
  'shape', 'image', 'video', 'psd', 'text', 'particle', 'audio_visualization', 'audio_sphere',
  'getcolor_dot_field', 'hksy_checker_grid', 'region_frame', 'simple_tube', 'hologram',
  'shaking_polygon', 'shattered_sphere',
].includes(object.type));
const tsResult = buildEditableRustScene({ sceneId: 'all-object-types', projectSettings: settings, layers, objects: editableProjectObjects });
if (!tsResult.ok) throw new Error(`coverage fixture の TS builder が失敗: ${JSON.stringify(tsResult.issues)}`);
export const buildEditableSceneBuilderCoverageFixture = () => ({
  version: 1,
  scene_id: 'all-object-types',
  graph,
  ts_result: { project: tsResult.project, media: tsMedia },
});
const fixture = buildEditableSceneBuilderCoverageFixture();

if (process.env.UXFD_SKIP_COVERAGE_FIXTURE_WRITE !== '1') {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');
  console.log(`42 kind coverage fixture を出力: ${outputPath}`);
}
