import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type {
  AudioObject,
  AudioVisualizationObject,
  ImageObject,
  GetColorDotFieldObject,
  GroupControlObject,
  HksyCheckerGridObject,
  LayerState,
  PsdObject,
  ProjectSettings,
  RegionFrameObject,
  ShakingPolygonObject,
  ShatteredSphereObject,
  ShapeObject,
  SimpleTubeObject,
  TextObject,
  TimelineObject,
  VideoObject,
} from '../types';
import { buildEditableRustScene } from './editableRustSceneReference';
import { buildAviUtlHologramObject } from './objectFactories/hologramObjectFactory';

const generatedResidentTypes = [
  ['barcode', 'GeneratedBarcode', 'GeneratedBarcodePlane'],
  ['puzzle_piece', 'GeneratedPuzzlePiece', 'GeneratedPuzzlePiecePlane'],
  ['colour_wheel', 'GeneratedColourWheel', 'GeneratedColourWheelPlane'],
  ['gourd', 'GeneratedGourd', 'GeneratedGourdPlane'],
  ['gear', 'GeneratedGear', 'GeneratedGearPlane'],
  ['track_bar', 'GeneratedTrackBar', 'GeneratedTrackBarPlane'],
  ['pie_chart', 'GeneratedPieChart', 'GeneratedPieChartPlane'],
  ['histogram', 'GeneratedHistogram', 'GeneratedHistogramPlane'],
  ['tone_curve', 'GeneratedToneCurve', 'GeneratedToneCurvePlane'],
  ['sphere_dots', 'GeneratedSphereDots', 'GeneratedSphereDotsPlane'],
  ['spherical_field', 'GeneratedSphericalField', 'GeneratedSphericalFieldPlane'],
  ['sunburst', 'GeneratedSunburst', 'GeneratedSunburstPlane'],
  ['circular_arrow', 'GeneratedCircularArrow', 'GeneratedCircularArrowPlane'],
  ['triangle_bracket', 'GeneratedTriangleBracket', 'GeneratedTriangleBracketPlane'],
  ['tartan_check', 'GeneratedTartanCheck', 'GeneratedTartanCheckPlane'],
  ['houndstooth', 'GeneratedHoundstooth', 'GeneratedHoundstoothPlane'],
  ['yagasuri', 'GeneratedYagasuri', 'GeneratedYagasuriPlane'],
  ['paper_airplane', 'GeneratedPaperAirplane', 'GeneratedPaperAirplanePlane'],
  ['asanoha_pattern', 'GeneratedAsanohaPattern', 'GeneratedAsanohaPatternPlane'],
  ['focus_lines_plus', 'GeneratedFocusLinesPlus', 'GeneratedFocusLinesPlusPlane'],
  ['random_line_ex', 'GeneratedRandomLineEx', 'GeneratedRandomLineExPlane'],
  ['contour_trace', 'GeneratedContourTrace', 'GeneratedContourTracePlane'],
  ['displacement_poly', 'GeneratedDisplacementPoly', 'GeneratedDisplacementPolyPlane'],
  ['plain_effector_line', 'GeneratedPlainEffectorLine', 'GeneratedPlainEffectorLinePlane'],
  ['protractor', 'GeneratedProtractor', 'GeneratedProtractorPlane'],
] as const;

const coverageFixturePath = join(
  __dirname,
  '..',
  '..',
  'rust-core',
  'tests',
  'fixtures',
  'editable-scene-builder',
  'all-object-types.json'
);

const projectSettings: ProjectSettings = {
  width: 1920,
  height: 1080,
  fps: 60,
  sampleRate: 48_000,
};

const layers: LayerState[] = Array.from({ length: 8 }, (_, index) => ({
  id: `layer-${index}`,
  name: `Layer ${index}`,
  visible: index !== 7,
  locked: false,
}));

const base = {
  name: 'Object',
  startTime: 1,
  duration: 4,
  x: 10,
  y: 20,
  rotation: 15,
  scaleX: 1,
  scaleY: 1,
  opacity: 0.75,
  enableAnimation: false,
  endX: 10,
  endY: 20,
  easing: 'linear' as const,
};

const image = (patch: Partial<ImageObject> = {}): ImageObject => ({
  ...base,
  id: 'image',
  type: 'image',
  layer: 2,
  src: 'blob:image',
  filePath: '/tmp/image.png',
  width: 640,
  height: 360,
  ...patch,
});

const video = (patch: Partial<VideoObject> = {}): VideoObject => ({
  ...base,
  id: 'video',
  type: 'video',
  layer: 1,
  offset: 3,
  src: 'blob:video',
  filePath: '/tmp/video.mp4',
  proxyFilePath: '/tmp/video.proxy.mp4',
  width: 1280,
  height: 720,
  volume: 1,
  muted: false,
  ...patch,
});

const audio = (patch: Partial<AudioObject> = {}): AudioObject => ({
  ...base,
  id: 'audio',
  type: 'audio',
  layer: 2,
  src: 'blob:audio',
  filePath: '/tmp/audio.wav',
  volume: 1,
  muted: false,
  ...patch,
});

const audioVisualization = (
  patch: Partial<AudioVisualizationObject> = {}
): AudioVisualizationObject => ({
  ...base,
  id: 'audio-waveform',
  type: 'audio_visualization',
  layer: 4,
  targetAudioId: 'audio',
  visualizationType: 'waveform',
  color: '#00ff00',
  thickness: 2,
  width: 640,
  height: 180,
  amplitude: 0.75,
  ...patch,
});

const shape = (patch: Partial<ShapeObject> = {}): ShapeObject => ({
  ...base,
  id: 'shape',
  type: 'shape',
  layer: 0,
  width: 200,
  height: 100,
  shapeType: 'rect',
  fill: '#ff0000',
  ...patch,
});

const text = (patch: Partial<TextObject> = {}): TextObject => ({
  ...base,
  id: 'text',
  type: 'text',
  layer: 3,
  text: 'Hello',
  fontSize: 48,
  fontFamily: 'Arial',
  fill: '#ffffff',
  measuredWidth: 200,
  measuredHeight: 60,
  ...patch,
});

const psd = (patch: Partial<PsdObject> = {}): PsdObject => ({
  ...base,
  id: 'psd',
  type: 'psd',
  layer: 4,
  src: 'blob:psd',
  filePath: '/tmp/design.psd',
  width: 800,
  height: 600,
  ...patch,
  scale: patch.scale ?? 1,
  activeLayerIds: patch.activeLayerIds ?? { title: true, hidden: false },
});

const getColor = (patch: Partial<GetColorDotFieldObject> = {}): GetColorDotFieldObject => ({
  ...base,
  id: 'getcolor',
  type: 'getcolor_dot_field',
  layer: 5,
  width: 320,
  height: 180,
  columns: 32,
  rows: 18,
  dotSize: 14,
  sizeInfluence: 0.65,
  luminanceInfluence: 0.7,
  hueShiftDegrees: 0,
  alternateRows: true,
  foregroundColour: '#ffffff',
  secondaryColour: '#36c2ff',
  backgroundColour: '#000000',
  seed: 93,
  ...patch,
});

const hksy = (patch: Partial<HksyCheckerGridObject> = {}): HksyCheckerGridObject => ({
  ...base,
  id: 'hksy',
  type: 'hksy_checker_grid',
  layer: 5,
  width: 320,
  height: 180,
  cellSize: 50,
  lineWidth: 2,
  checkerEnabled: true,
  gridEnabled: true,
  foregroundColour: '#ffffff',
  secondaryColour: '#333333',
  backgroundColour: '#000000',
  ...patch,
});

const simpleTube = (patch: Partial<SimpleTubeObject> = {}): SimpleTubeObject => ({
  ...base,
  id: 'tube',
  type: 'simple_tube',
  layer: 6,
  width: 320,
  height: 180,
  radius: 150,
  depth: 280,
  segments: 16,
  rings: 10,
  twistDegrees: 0,
  randomAmount: 0,
  strokeWidth: 3,
  colour: '#0e769f',
  secondaryColour: '#ffffff',
  seed: 93,
  torus: false,
  ...patch,
});

const shakingPolygon = (
  patch: Partial<ShakingPolygonObject> = {}
): ShakingPolygonObject => ({
  ...base,
  id: 'shaking-polygon',
  type: 'shaking_polygon',
  layer: 6,
  width: 320,
  height: 180,
  lineWidth: 6,
  vertexCount: 5,
  fixedDiameter: 120,
  verticalDistortionPercent: 20,
  repeatCount: 3,
  repeatFrequency: 2,
  fill: true,
  jitterRange: 14,
  jitterInterval: 4,
  stepped: false,
  colour: '#ff8800',
  seed: 93,
  ...patch,
});

const shatteredSphere = (
  patch: Partial<ShatteredSphereObject> = {}
): ShatteredSphereObject => ({
  ...base,
  id: 'shattered-sphere',
  type: 'shattered_sphere',
  layer: 6,
  width: 320,
  height: 180,
  fractureAmount: 100,
  delay: 20,
  radius: 72,
  limitDistance: 120,
  thickness: 20,
  fragmentSize: 12,
  randomShape: 80,
  speed: 100,
  impact: 80,
  gravityX: 0,
  gravityY: 100,
  gravityZ: 0,
  spin: 100,
  directionDiffusion: 90,
  colour: '#80d8ff',
  seed: 93,
  ...patch,
});

const regionFrame = (patch: Partial<RegionFrameObject> = {}): RegionFrameObject => ({
  ...base,
  id: 'region-frame',
  type: 'region_frame',
  layer: 6,
  width: 800,
  height: 450,
  lineWidth: 10,
  shape: 'rectangle',
  extraWidth: 0,
  extraHeight: 0,
  backgroundOpacity: 0.2,
  frameColour: '#ffffff',
  backgroundColour: '#ccccff',
  ...patch,
});

describe('buildEditableRustScene', () => {
  it('有効なvibration filterを常駐clipへ動的effectとして順序付きで保持する', () => {
    const vibrating = shape({
      id: 'vibrating',
      filters: [
        { id: 'colour-correction', type: 'color_correction', enabled: true, params: { brightness: 1.1, contrast: 0.1, saturation: 0.2, hue: 5 } },
        { id: 'vibration-first', type: 'vibration', enabled: true, params: { strength: 5, speed: 2 } },
        { id: 'wipe', type: 'wipe', enabled: true, params: { edge: 'left', reverse: false } },
        { id: 'vibration-disabled', type: 'vibration', enabled: false, params: { strength: 99, speed: 8 } },
        { id: 'blur', type: 'blur', enabled: true, params: { strength: 3, quality: 2 } },
        { id: 'vibration-second', type: 'vibration', enabled: true, params: { strength: 0, speed: 0 } },
      ],
    });

    const result = buildEditableRustScene({
      sceneId: 'scene-vibration',
      projectSettings,
      layers,
      objects: [vibrating],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const clip = result.project.tracks.flatMap((track) => track.clips).find(({ id }) => id === 'vibrating');
    expect(clip?.effects.map((effect) => Object.keys(effect)[0])).toEqual([
      'ColourCorrection',
      'Vibration',
      'Blur',
      'Vibration',
    ]);
    expect(clip?.wipe_animations).toEqual([{ effect_index: 2, edge: 'left', reverse: false }]);
  });

  it('fixtureのgenerated視覚型25種をmediaと評価clipごとresident Projectへ保持する', () => {
    const fixture = JSON.parse(readFileSync(coverageFixturePath, 'utf8')) as {
      graph: {
        settings: ProjectSettings;
        layers: LayerState[];
        objects: TimelineObject[];
      };
      resident_result: {
        project: { tracks: { clips: Record<string, unknown>[] }[] };
        media: Record<string, unknown>[];
      };
    };
    const targetTypes = new Set<string>(generatedResidentTypes.map(([type]) => type));
    const objects = fixture.graph.objects.filter((object) => targetTypes.has(object.type));
    expect(objects).toHaveLength(25);

    const result = buildEditableRustScene({
      sceneId: 'all-object-types',
      projectSettings: fixture.graph.settings,
      layers: fixture.graph.layers,
      objects,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`expected all generated types to be resident eligible: ${JSON.stringify(result.issues)}`);

    const actualClips = result.project.tracks.flatMap((track) => track.clips);
    const expectedClips = fixture.resident_result.project.tracks.flatMap((track) => track.clips);
    const expectedMedia = fixture.resident_result.media;
    expect(actualClips).toHaveLength(generatedResidentTypes.length);
    for (const [type, mediaKind, clipKind] of generatedResidentTypes) {
      const expectedClip = expectedClips.find((clip) => clip.id === type);
      const actualClip = actualClips.find((clip) => clip.id === type);
      expect(expectedClip, `${type} fixture clip`).toBeDefined();
      expect(actualClip, `${type} resident clip`).toEqual(expectedClip);
      expect(actualClip?.kind).toBe(clipKind);

      const expectedReference = expectedMedia.find((media) => media.id === type);
      const actualReference = result.media.find((media) => media.id === type);
      expect(expectedReference, `${type} fixture media`).toBeDefined();
      expect(actualReference, `${type} resident media`).toEqual(expectedReference);
      expect(actualReference?.kind).toBe(mediaKind);
    }
  });

  it('編集時にV1 Projectとnative mediaを一度だけ組み立て、layer/insertion順と動画offsetを保持する', () => {
    const result = buildEditableRustScene({
      sceneId: 'scene-1',
      projectSettings,
      layers,
      objects: [text(), psd(), image(), video(), shape(), image({ id: 'hidden', layer: 7 })],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected editable scene conversion to succeed');

    expect(result.project).toMatchObject({
      id: 'scene-1',
      version: 1,
      size: { width: 1920, height: 1080 },
      fps: { numerator: 60, denominator: 1 },
      colour: { profile: 'rec709-sdr', working_space: 'linear-light', alpha: 'premultiplied' },
      tracks: [
        { id: 'layer-0', clips: [{ id: 'shape', media_id: 'shape', kind: 'SolidColourPlane', start_frame: 60, duration_frames: 240 }] },
        { id: 'layer-1', clips: [{ id: 'video', media_id: 'video', kind: 'VideoPlane', source_frame_offset: 180 }] },
        { id: 'layer-2', clips: [{ id: 'image', media_id: 'image', kind: 'ImagePlane' }] },
        { id: 'layer-3', clips: [{ id: 'text', media_id: 'text', kind: 'TextPlane' }] },
        { id: 'layer-4', clips: [{ id: 'psd', media_id: 'psd', kind: 'ImagePlane' }] },
      ],
    });
    expect(result.project.media.map((media) => media.id)).toEqual(['shape', 'video', 'image', 'text', 'psd']);
    expect(result.media).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'shape', kind: 'SolidColour', source: '#ff0000', width: 200, height: 100 }),
      expect.objectContaining({ id: 'video', kind: 'Video', source: '/tmp/video.proxy.mp4', source_rate: { numerator: 60, denominator: 1 } }),
      expect.objectContaining({ id: 'text', kind: 'Text', width: 200, height: 60 }),
      expect.objectContaining({ id: 'psd', kind: 'Psd', active_layer_ids: ['title'] }),
    ]));
  });

  it('reference serializerはexportOriginalでProjectとmediaの動画sourceを原本へ切り替える', () => {
    const result = buildEditableRustScene({
      sceneId: 'export-original',
      projectSettings,
      layers,
      objects: [video({ filePath: '/media/original.mp4', proxyFilePath: '/media/proxy.mp4' })],
      mediaPurpose: 'exportOriginal',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected reference serializer to build the export scene');
    expect(result.project.media[0]).toMatchObject({ id: 'video', source: '/media/original.mp4' });
    expect(result.media[0]).toMatchObject({ id: 'video', source: '/media/original.mp4' });
  });

  it('位置keyframe・legacy animationをRust Projectへ変換する', () => {
    const keyed = image({
      id: 'keyed',
      keyframes: [
        { id: 'middle', time: 3, x: 50, y: 70, easing: 'easeInOutCubic' },
        { id: 'start', time: 1, x: 10, y: 20, easing: 'linear' },
        { id: 'end', time: 5, x: 100, y: 120, easing: 'linear' },
      ],
    });
    const legacy = shape({
      id: 'legacy',
      layer: 3,
      enableAnimation: true,
      endX: 210,
      endY: 320,
      easing: 'easeOutCubic',
    });

    const result = buildEditableRustScene({ sceneId: 'scene-keys', projectSettings, layers, objects: [keyed, legacy] });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected editable scene conversion to succeed');
    const keyedClip = result.project.tracks.flatMap((track) => track.clips).find((clip) => clip.id === 'keyed');
    const legacyClip = result.project.tracks.flatMap((track) => track.clips).find((clip) => clip.id === 'legacy');
    expect(keyedClip).toMatchObject({
      opacity: 0.75,
      position_keyframes: [
        { frame_offset: 0, x: 10, y: 20, easing: 'linear' },
        { frame_offset: 120, x: 50, y: 70, easing: 'easeInOutCubic' },
        { frame_offset: 240, x: 100, y: 120, easing: 'linear' },
      ],
      effects: [],
    });
    expect(legacyClip?.position_keyframes).toEqual([
      { frame_offset: 0, x: 10, y: 20, easing: 'easeOutCubic' },
      { frame_offset: 240, x: 210, y: 320, easing: 'linear' },
    ]);
  });

  it('装飾付きテキストの原点補正を開始時transformへ固定せずRust評価へ渡す', () => {
    const decorated = text({
      x: 100,
      y: 120,
      rotation: -20,
      scaleX: -1.1,
      scaleY: 0.9,
      keyframes: [
        { id: 'start', time: 1, x: 100, y: 120, easing: 'linear' },
        { id: 'end', time: 5, x: 200, y: 220, easing: 'linear' },
      ],
      textStroke: { colour: '#000000', width: 4 },
      textShadow: { colour: '#000000', offsetX: -8, offsetY: 3, blur: 10 },
    });
    const group: GroupControlObject = {
      ...base,
      id: 'group',
      type: 'group_control',
      layer: 2,
      x: 23,
      y: 29,
      rotation: 7,
      scaleX: 1.1,
      scaleY: 0.9,
      targetLayerCount: 0,
    };

    const result = buildEditableRustScene({
      sceneId: 'decorated-text-group',
      projectSettings,
      layers,
      objects: [decorated, group],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected editable scene conversion to succeed');

    const media = result.media.find((item) => item.id === decorated.id)!;
    const source = JSON.parse(media.source);
    const clip = result.project.tracks.flatMap((track) => track.clips).find((item) => item.id === decorated.id)!;
    expect(media).toMatchObject({ width: 224, height: 84 });
    expect(source).toMatchObject({ __renderOffsetX: 20, __renderOffsetY: 9, __contentWidth: 200, __contentHeight: 60 });
    expect(clip.position_keyframes).toHaveLength(2);
    expect(clip.transform).toMatchObject({ translation_x: 100, translation_y: 120 });
    expect(clip.position_keyframes.map(({ x, y }) => ({ x, y }))).toEqual([
      { x: 100, y: 120 },
      { x: 200, y: 220 },
    ]);
  });

  it('subject crop keyframeをclipローカルframeへ変換してRust Projectへ渡す', () => {
    const tracked = video({
      subjectCropEnabled: true,
      subjectCropKeyframes: [
        { id: 'crop-end', time: 5, x: 0.1, y: 0.12, width: 0.8, height: 0.76 },
        { id: 'crop-start', time: 1, x: 0.08, y: 0.08, width: 0.84, height: 0.84 },
        { id: 'crop-middle', time: 3, x: 0.16, y: 0.1, width: 0.7, height: 0.78 },
      ],
    });

    const result = buildEditableRustScene({
      sceneId: 'scene-subject-crop',
      projectSettings,
      layers,
      objects: [tracked],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected subject crop conversion to succeed');
    // subject crop は Rust 側専用の `subject_crop` フィールドで表現し、rust-core が
    // フレームごとに Effect::Clipping へ再評価する。ここで `effects` に subject crop
    // 由来の Clipping を静的に焼き込むと、rust-core が append する動的な Clipping と
    // 重複し、effects.length が TS/Rust で食い違ったうえ、TS 側は元の (誤って) 静的な
    // Clipping と比較されてアニメーションしていないように見えてしまう
    // （progress/rust-source-of-truth-r2-subject-crop-double-bake.md 参照）。
    expect(result.project.tracks[0].clips[0]).toMatchObject({
      effects: [],
      subject_crop: {
        source_width: 1280,
        source_height: 720,
        keyframes: [
          { frame_offset: 0, x: 0.08, y: 0.08, width: 0.84, height: 0.84 },
          { frame_offset: 120, x: 0.16, y: 0.1, width: 0.7, height: 0.78 },
          { frame_offset: 240, x: 0.1, y: 0.12, width: 0.8, height: 0.76 },
        ],
      },
    });
  });

  it('subject cropと他フィルタを併用しても、静的effectsにsubject crop由来のClippingを重複して焼き込まない', () => {
    const tracked = video({
      subjectCropEnabled: true,
      subjectCropKeyframes: [
        { id: 'crop-start', time: 1, x: 0.08, y: 0.08, width: 0.84, height: 0.84 },
        { id: 'crop-middle', time: 3, x: 0.16, y: 0.1, width: 0.7, height: 0.78 },
        { id: 'crop-end', time: 5, x: 0.1, y: 0.12, width: 0.8, height: 0.76 },
      ],
      filters: [{
        id: 'outline',
        type: 'outline',
        enabled: true,
        params: { colour: '#123456', thickness: 2, opacity: 0.65 },
      }],
    });

    const result = buildEditableRustScene({
      sceneId: 'scene-subject-crop-with-filter',
      projectSettings,
      layers,
      objects: [tracked],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected subject crop + filter conversion to succeed');
    // effects には Outline だけが乗り、subject crop 由来の Clipping は乗らない
    // （rust-core が subject_crop フィールドから毎フレーム再評価するため）。
    expect(result.project.tracks[0].clips[0].effects).toEqual([{
      Outline: {
        colour: [0x12 / 255, 0x34 / 255, 0x56 / 255],
        thickness: 2,
        opacity: 0.65,
      },
    }]);
    expect(result.project.tracks[0].clips[0].subject_crop).toMatchObject({
      keyframes: [
        { frame_offset: 0, x: 0.08, y: 0.08, width: 0.84, height: 0.84 },
        { frame_offset: 120, x: 0.16, y: 0.1, width: 0.7, height: 0.78 },
        { frame_offset: 240, x: 0.1, y: 0.12, width: 0.8, height: 0.76 },
      ],
    });
  });

  it('SpotLightだけは既存Rust effect serializerで常駐Projectへ渡す', () => {
    const result = buildEditableRustScene({
      sceneId: 'scene-spotlight',
      projectSettings,
      layers,
      objects: [shape({
        filters: [{
          id: 'spot-light',
          type: 'spot_light',
          enabled: true,
          params: {
            centreX: 0.25,
            centreY: 0.75,
            radius: 0.6,
            intensity: 0.8,
            colour: '#fff4c2',
          },
        }],
      })],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected SpotLight scene conversion to succeed');
    expect(result.project.tracks[0].clips[0].effects).toEqual([{
      SpotLight: {
        centre_x: 0.25,
        centre_y: 0.75,
        radius: 0.6,
        intensity: 0.8,
        colour: [1, 0xf4 / 255, 0xc2 / 255],
      },
    }]);
  });

  it('RegionFrameとstatic color_correctionを常駐sceneへ渡し、通常audioは非描画として除外する', () => {
    const result = buildEditableRustScene({
      sceneId: 'scene-region-frame-colour',
      projectSettings,
      layers,
      objects: [
        audio(),
        regionFrame(),
        shape({
          layer: 1,
          filters: [{
            id: 'colour-correction',
            type: 'color_correction',
            enabled: true,
            params: { brightness: 1.2, contrast: 0.5, saturation: -0.4, hue: 120 },
          }],
        }),
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected RegionFrame and colour correction scene conversion to succeed');
    expect(result.project.media.map((media) => media.id)).toEqual(['shape', 'region-frame']);
    expect(result.project.tracks.flatMap((track) => track.clips)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'region-frame', kind: 'GeneratedRegionFramePlane' }),
      expect.objectContaining({
        id: 'shape',
        effects: [{
          ColourCorrection: {
            brightness: 1.2,
            contrast: 0.5,
            saturation: -0.4,
            hue_degrees: 120,
          },
        }],
      }),
    ]));
    expect(result.media).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'region-frame', kind: 'GeneratedRegionFrame', width: 800, height: 450 }),
    ]));
  });

  it('時間非依存のGPU filterとfade opacityを常駐sceneへ搬送する', () => {
    const result = buildEditableRustScene({
      sceneId: 'scene-static-filters',
      projectSettings,
      layers,
      objects: [shape({
        opacity: 0.8,
        filters: [
          { id: 'blur', type: 'blur', enabled: true, params: { strength: 2, quality: 2 } },
          {
            id: 'outline',
            type: 'outline',
            enabled: true,
            params: { colour: '#ffffff', thickness: 2, opacity: 0.5 },
          },
          { id: 'fade', type: 'fade', enabled: true, params: { opacity: 0.5 } },
        ],
      })],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected static GPU filter conversion to succeed');
    expect(result.project.tracks[0].clips[0]).toEqual(expect.objectContaining({
      opacity: 0.4,
      effects: [
        { Blur: { radius: 2, strength: 1 } },
        { Outline: { colour: [1, 1, 1], thickness: 2, opacity: 0.5 } },
      ],
    }));
  });

  it('Wipeを静的effect列から分離してRust時間評価trackへ変換する', () => {
    const result = buildEditableRustScene({
      sceneId: 'scene-wipe',
      projectSettings,
      layers,
      objects: [shape({
        filters: [
          {
            id: 'colour',
            type: 'color_correction',
            enabled: true,
            params: { brightness: 1, contrast: 0, saturation: 0, hue: 0 },
          },
          { id: 'wipe-left', type: 'wipe', enabled: true, params: { edge: 'left', reverse: false } },
          {
            id: 'outline',
            type: 'outline',
            enabled: true,
            params: { colour: '#ffffff', thickness: 2, opacity: 0.5 },
          },
          { id: 'wipe-right', type: 'wipe', enabled: true, params: { edge: 'right', reverse: true } },
        ],
      })],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected Wipe conversion to succeed');
    expect(result.project.tracks[0].clips[0]).toMatchObject({
      effects: [
        expect.objectContaining({ ColourCorrection: expect.any(Object) }),
        expect.objectContaining({ Outline: expect.any(Object) }),
      ],
      wipe_animations: [
        { effect_index: 1, edge: 'left', reverse: false },
        { effect_index: 3, edge: 'right', reverse: true },
      ],
    });
  });

  it('描画に影響しないgroupIdは編集メタデータとして許可する', () => {
    const grouped = shape({ id: 'group-member' });
    grouped.groupId = 'group-a';

    const result = buildEditableRustScene({
      sceneId: 'scene-group-metadata',
      projectSettings,
      layers,
      objects: [grouped],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected metadata-only group conversion to succeed');
    expect(result.project.tracks.flatMap((track) => track.clips)).toEqual([
      expect.objectContaining({ id: 'group-member' }),
    ]);
  });

  it('GroupControlを非描画のRust制御データへ変換し対象trackだけを指定する', () => {
    const control: TimelineObject = {
      ...base,
      id: 'group-control',
      type: 'group_control',
      layer: 0,
      targetLayerCount: 2,
      keyframes: [
        { id: 'control-start', time: 1, x: 10, y: 20, easing: 'linear' },
        { id: 'control-end', time: 5, x: 110, y: 220, easing: 'easeInOutCubic' },
      ],
    };

    const result = buildEditableRustScene({
      sceneId: 'scene-group-control',
      projectSettings,
      layers,
      objects: [
        control,
        shape({ id: 'target-1', layer: 1 }),
        image({ id: 'target-2', layer: 2 }),
        text({ id: 'outside', layer: 3 }),
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected GroupControl conversion to succeed');
    expect(result.project.media.map((media) => media.id)).toEqual(['target-1', 'target-2', 'outside']);
    expect(result.project.group_controls).toEqual([{
      id: 'group-control',
      start_frame: 60,
      duration_frames: 240,
      transform: {
        translation_x: 10,
        translation_y: 20,
        scale_x: 1,
        scale_y: 1,
        rotation_degrees: 15,
        sampling: 'bilinear',
      },
      opacity: 0.75,
      position_keyframes: [
        { frame_offset: 0, x: 10, y: 20, easing: 'linear' },
        { frame_offset: 240, x: 110, y: 220, easing: 'easeInOutCubic' },
      ],
      target_track_ids: ['layer-1', 'layer-2'],
    }]);
  });

  it('V1外のgroup gradient、逆再生、mask、未対応typeを明示拒否する', () => {
    const unsupported: TimelineObject[] = [
      {
        ...shape({ id: 'group-member' }),
        groupId: 'group-a',
        groupGradient: {
          enabled: true,
          type: 'linear',
          scope: 'group',
          colours: ['#000000', '#ffffff'],
          stops: [0, 1],
          direction: 0,
        },
      },
      { ...video({ id: 'reversed' }), reversed: true },
      { ...image({ id: 'mask' }), clipping: true },
    ];

    const result = buildEditableRustScene({ sceneId: 'scene-rejected', projectSettings, layers, objects: unsupported });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected editable scene conversion to fail');
    expect(result.issues.map((issue) => [issue.objectId, issue.code])).toEqual([
      ['group-member', 'unsupportedGroup'],
      ['reversed', 'unsupportedVideoMode'],
      ['mask', 'unsupportedMask'],
    ]);
  });

  it('GetColor・HKSY・SimpleTube を同じ生成media serializerとclip kindで常駐Rust sceneへ変換する', () => {
    const sampled = getColor({ sampleSourceObjectId: 'sample-psd', sampleStrength: 0.8 });
    const sourcePsd = psd({ id: 'sample-psd', layer: 1, activeLayerIds: { title: true, hidden: false } });

    const result = buildEditableRustScene({
      sceneId: 'scene-generated',
      projectSettings,
      layers,
      objects: [sourcePsd, sampled, hksy({ layer: 3 }), simpleTube()],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected generated scene conversion to succeed');
    expect(result.project.tracks.flatMap((track) => track.clips)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'getcolor', kind: 'GeneratedGetColorDotsPlane' }),
      expect.objectContaining({ id: 'hksy', kind: 'GeneratedHksyCheckerGridPlane' }),
      expect.objectContaining({ id: 'tube', kind: 'GeneratedSimpleTubePlane' }),
    ]));
    expect(result.media).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'getcolor', kind: 'GeneratedGetColorDots', width: 320, height: 180 }),
      expect.objectContaining({ id: 'hksy', kind: 'GeneratedHksyCheckerGrid' }),
      expect.objectContaining({ id: 'tube', kind: 'GeneratedSimpleTube' }),
    ]));
    const getColorMedia = result.media.find((media) => media.id === 'getcolor');
    expect(JSON.parse(getColorMedia?.source ?? '{}')).toMatchObject({
      generator: 'getcolor-v2r-dot-field',
      source_image: '/tmp/design.psd',
      source_active_layer_ids: ['title'],
      sample_strength: 0.8,
    });
  });

  it('ShakingPolygonを生成mediaと専用clip kindで常駐Rust sceneへ変換する', () => {
    const result = buildEditableRustScene({
      sceneId: 'scene-shaking-polygon',
      projectSettings,
      layers,
      objects: [shakingPolygon()],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ShakingPolygon conversion to succeed');
    expect(result.project.tracks.flatMap((track) => track.clips)).toContainEqual(
      expect.objectContaining({
        id: 'shaking-polygon',
        kind: 'GeneratedShakingPolygonPlane',
      })
    );
    expect(result.media).toContainEqual(
      expect.objectContaining({
        id: 'shaking-polygon',
        kind: 'GeneratedShakingPolygon',
        width: 320,
        height: 180,
      })
    );
  });

  it('Hologramを生成mediaと専用clip kindで常駐Rust sceneへ変換する', () => {
    const hologram = {
      ...buildAviUtlHologramObject({
        id: 'hologram',
        projectWidth: 1920,
        projectHeight: 1080,
        startTime: 0,
        layer: 2,
      }),
      width: 1920,
      height: 1080,
      duration: 24,
    };
    const result = buildEditableRustScene({
      sceneId: 'scene-hologram',
      projectSettings,
      layers,
      objects: [hologram],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected Hologram conversion to succeed');
    expect(result.project.tracks.flatMap((track) => track.clips)).toContainEqual(
      expect.objectContaining({
        id: 'hologram',
        kind: 'GeneratedHologramPlane',
      })
    );
    expect(result.media).toContainEqual(
      expect.objectContaining({
        id: 'hologram',
        kind: 'GeneratedHologram',
        width: 1920,
        height: 1080,
      })
    );
  });

  it('ShatteredSphereを生成mediaと専用clip kindで常駐Rust sceneへ変換する', () => {
    const result = buildEditableRustScene({
      sceneId: 'scene-shattered-sphere',
      projectSettings,
      layers,
      objects: [shatteredSphere()],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ShatteredSphere conversion to succeed');
    expect(result.project.tracks.flatMap((track) => track.clips)).toContainEqual(
      expect.objectContaining({
        id: 'shattered-sphere',
        kind: 'GeneratedShatteredSpherePlane',
      })
    );
    expect(result.media).toContainEqual(
      expect.objectContaining({
        id: 'shattered-sphere',
        kind: 'GeneratedShatteredSphere',
        width: 320,
        height: 180,
      })
    );
  });

  it('通常音声波形をresident Projectの生成mediaとclipへ変換する', () => {
    const result = buildEditableRustScene({
      sceneId: 'scene-audio-waveform',
      projectSettings,
      layers,
      objects: [audio(), audioVisualization()],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected audio waveform scene conversion to succeed');
    expect(result.project.tracks.flatMap((track) => track.clips)).toContainEqual(
      expect.objectContaining({
        id: 'audio-waveform',
        kind: 'GeneratedAudioWaveformPlane',
      })
    );
    expect(result.media).toContainEqual(
      expect.objectContaining({
        id: 'audio-waveform',
        kind: 'GeneratedAudioWaveform',
        width: 640,
        height: 180,
      })
    );
    const media = result.media.find((candidate) => candidate.id === 'audio-waveform');
    expect(JSON.parse(media?.source ?? '{}')).toMatchObject({
      generator: 'audio-waveform-r',
      target_audio_id: 'audio',
      target_source: '/tmp/audio.wav',
      colour: '#00ff00',
      thickness: 2,
      amplitude: 0.75,
    });
  });

  it('GetColorの参照画像・PSDをnativeが読めないときは具体的なissueで拒否する', () => {
    const result = buildEditableRustScene({
      sceneId: 'scene-invalid-getcolor-source',
      projectSettings,
      layers,
      objects: [
        getColor({ id: 'missing-target', sampleSourceObjectId: 'not-found' }),
        getColor({ id: 'blob-source', sampleSourcePath: 'blob:temporary-image' }),
      ],
    });

    expect(result).toEqual({
      ok: false,
      issues: [
        expect.objectContaining({ objectId: 'missing-target', code: 'unsupportedGetColorSampleSource' }),
        expect.objectContaining({ objectId: 'blob-source', code: 'unsupportedGetColorSampleSource' }),
      ],
    });
  });
});
