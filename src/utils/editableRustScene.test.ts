import { describe, expect, it } from 'vitest';
import type {
  ImageObject,
  GetColorDotFieldObject,
  HksyCheckerGridObject,
  LayerState,
  PsdObject,
  ProjectSettings,
  ShapeObject,
  SimpleTubeObject,
  TextObject,
  TimelineObject,
  VideoObject,
} from '../types';
import { buildEditableRustScene } from './editableRustScene';

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

describe('buildEditableRustScene', () => {
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

  it('V1外のgroup、逆再生、filter、animated crop、mask、未対応typeを明示拒否する', () => {
    const unsupported: TimelineObject[] = [
      { ...shape({ id: 'group-member' }), groupId: 'group-a' },
      { ...video({ id: 'reversed' }), reversed: true },
      { ...shape({ id: 'filter' }), filters: [{ id: 'fade', type: 'fade', enabled: true, params: { opacity: 0.5 } }] },
      {
        ...video({ id: 'animated-crop' }),
        subjectCropEnabled: true,
        subjectCropKeyframes: [
          { id: 'crop-0', time: 1, x: 0, y: 0, width: 1, height: 1 },
          { id: 'crop-1', time: 3, x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
        ],
      },
      { ...image({ id: 'mask' }), clipping: true },
      { ...shape({ id: 'group-control' }), type: 'group_control' as const, targetLayerCount: 2 } as TimelineObject,
    ];

    const result = buildEditableRustScene({ sceneId: 'scene-rejected', projectSettings, layers, objects: unsupported });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected editable scene conversion to fail');
    expect(result.issues.map((issue) => [issue.objectId, issue.code])).toEqual([
      ['group-member', 'unsupportedGroup'],
      ['reversed', 'unsupportedVideoMode'],
      ['filter', 'unsupportedFilter'],
      ['animated-crop', 'unsupportedSubjectCrop'],
      ['mask', 'unsupportedMask'],
      ['group-control', 'unsupportedObjectType'],
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
