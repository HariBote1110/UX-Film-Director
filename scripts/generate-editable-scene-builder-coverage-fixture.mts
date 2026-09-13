/** 42 kind の editable scene builder parity fixture を生成する。 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { TimelineObject } from '../src/types';
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
].map((object) => ({ ...object, x: object.x + 13, opacity: 0.73 }));

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
const objects = baseObjects.map((object) => object as TimelineObject);
const graph = { settings, layers, objects };
const tsMedia = objects
  .filter((object) => object.type !== 'audio' && object.type !== 'group_control')
  .sort((left, right) => left.layer - right.layer)
  .map((object) => mediaReferenceForEditableRustScene(object as never, settings.fps, objects));
const clipKind = (type: string): string => ({
  image: 'ImagePlane', psd: 'ImagePlane', video: 'VideoPlane', text: 'TextPlane', shape: 'GeneratedShapePlane',
  audio_visualization: 'GeneratedAudioWaveformPlane', audio_sphere: 'GeneratedAudioSpherePlane', getcolor_dot_field: 'GeneratedGetColorDotsPlane',
}[type] ?? `Generated${type.split('_').map((part) => part[0].toUpperCase() + part.slice(1)).join('')}Plane`);
const tsProject = {
  id: 'editable-scene', version: 1, size: { width: settings.width, height: settings.height },
  fps: { numerator: settings.fps, denominator: 1 }, colour: { profile: 'rec709-sdr', working_space: 'linear-light', alpha: 'premultiplied' },
  media: tsMedia.map(({ id, kind, source }) => ({ id, kind, source })),
  tracks: objects.filter((object) => object.type !== 'audio' && object.type !== 'group_control').sort((left, right) => left.layer - right.layer).map((object) => ({
    id: `layer-${object.layer}`, clips: [{ id: object.id, media_id: object.id, kind: clipKind(object.type), start_frame: 0, duration_frames: 300,
      source_frame_offset: object.type === 'video' ? 15 : 0,
      transform: { translation_x: object.x, translation_y: object.y, scale_x: object.scaleX * (object.type === 'psd' ? (object as any).scale : 1), scale_y: object.scaleY * (object.type === 'psd' ? (object as any).scale : 1), rotation_degrees: object.rotation, sampling: object.type === 'shape' && (object as any).gradient?.enabled !== true ? 'nearest' : 'bilinear' },
      opacity: object.opacity, opacity_keyframes: [], position_keyframes: [], wipe_animations: [], effects: [] }],
  })),
  group_controls: [{ id: 'group_control', start_frame: 0, duration_frames: 300, transform: { translation_x: 23, translation_y: 29, scale_x: 1.1, scale_y: 0.9, rotation_degrees: 7, sampling: 'bilinear' }, opacity: 0.73, position_keyframes: [], target_track_ids: objects.filter((object) => object.layer > 6 && object.type !== 'audio' && object.type !== 'group_control').sort((left, right) => left.layer - right.layer).map((object) => `layer-${object.layer}`) }],
};
const fixture = {
  version: 1,
  scene_id: 'all-object-types',
  graph,
  ts_result: { project: tsProject, media: tsMedia },
};
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');
console.log(`42 kind coverage fixture を出力: ${outputPath}`);
