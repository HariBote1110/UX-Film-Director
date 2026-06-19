import { describe, expect, it } from 'vitest';
import { createDefaultLayers } from './sceneState';
import {
  buildRustSceneSnapshotForTimeline,
  type RustSceneSnapshotBuildIssue,
} from './rustSceneSnapshot';
import type { AudioObject, ImageObject, ProjectSettings, PsdObject, ShapeObject, TimelineObject, VideoObject } from '../types';

const settings: ProjectSettings = {
  width: 1920,
  height: 1080,
  fps: 60,
  sampleRate: 48000,
};

const baseImage = (patch: Partial<ImageObject> = {}): ImageObject => ({
  id: 'image-1',
  type: 'image',
  name: 'image.png',
  layer: 2,
  startTime: 1,
  duration: 4,
  x: 100,
  y: 200,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 0.75,
  enableAnimation: false,
  endX: 100,
  endY: 200,
  easing: 'linear',
  src: 'blob:image',
  filePath: '/tmp/image.png',
  width: 640,
  height: 360,
  ...patch,
});

const baseVideo = (patch: Partial<VideoObject> = {}): VideoObject => ({
  id: 'video-1',
  type: 'video',
  name: 'video.mp4',
  layer: 1,
  startTime: 2,
  duration: 5,
  offset: 3,
  x: 10,
  y: 20,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  enableAnimation: false,
  endX: 10,
  endY: 20,
  easing: 'linear',
  src: 'blob:video',
  filePath: '/tmp/video.mp4',
  width: 1280,
  height: 720,
  volume: 1,
  muted: false,
  ...patch,
});

const baseShape = (patch: Partial<ShapeObject> = {}): ShapeObject => ({
  id: 'shape-1',
  type: 'shape',
  name: 'Rectangle',
  layer: 0,
  startTime: 1,
  duration: 4,
  x: 300,
  y: 120,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 0.5,
  enableAnimation: false,
  endX: 300,
  endY: 120,
  easing: 'linear',
  shapeType: 'rect',
  width: 200,
  height: 100,
  fill: '#ff0000',
  ...patch,
});

const basePsd = (patch: Partial<PsdObject> = {}): PsdObject => ({
  id: 'psd-1',
  type: 'psd',
  name: 'standing.psd',
  layer: 2,
  startTime: 1,
  duration: 4,
  x: 400,
  y: 120,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 0.9,
  enableAnimation: false,
  endX: 400,
  endY: 120,
  easing: 'linear',
  src: 'blob:psd',
  filePath: '/tmp/standing.psd',
  width: 512,
  height: 768,
  scale: 1,
  activeLayerIds: {
    'face-open': true,
  },
  ...patch,
});

const baseAudio = (patch: Partial<AudioObject> = {}): AudioObject => ({
  id: 'audio-1',
  type: 'audio',
  name: 'music.wav',
  layer: 3,
  startTime: 1,
  duration: 4,
  x: 0,
  y: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  enableAnimation: false,
  endX: 0,
  endY: 0,
  easing: 'linear',
  src: 'blob:audio',
  filePath: '/tmp/music.wav',
  volume: 1,
  muted: false,
  ...patch,
});

describe('buildRustSceneSnapshotForTimeline', () => {
  it('builds a solid colour plane for active rectangle shapes', () => {
    const layers = createDefaultLayers();
    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [baseShape()],
      time: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected snapshot build to pass');

    expect(result.snapshot.clips).toEqual([
      {
        clip_id: 'shape-1',
        track_id: 'layer-0',
        media_id: 'shape-1',
        source_frame: 0,
        z_index: 0,
        transform: {
          translation_x: 300,
          translation_y: 120,
          scale_x: 1,
          scale_y: 1,
          rotation_degrees: 0,
          sampling: 'nearest',
        },
        opacity: 0.5,
        effects: [],
      },
    ]);
    expect(result.media).toEqual([
      {
        id: 'shape-1',
        kind: 'SolidColour',
        source: '#ff0000',
        width: 200,
        height: 100,
      },
    ]);
  });

  it('ignores active audio objects while building the visual Rust scene snapshot', () => {
    const layers = createDefaultLayers();
    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [baseShape(), baseAudio()],
      time: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected audio-backed visual snapshot to pass');

    expect(result.snapshot.clips.map((clip) => clip.clip_id)).toEqual(['shape-1']);
    expect(result.media.map((reference) => reference.id)).toEqual(['shape-1']);
  });

  it('builds a generated gradient plane for active rectangle shapes', () => {
    const layers = createDefaultLayers();
    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [baseShape({
        id: 'gradient-1',
        gradient: {
          enabled: true,
          type: 'linear',
          colours: ['#ff0000', '#0000ff'],
          stops: [0, 1],
          direction: 90,
        },
      })],
      time: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected snapshot build to pass');

    expect(result.media).toEqual([
      {
        id: 'gradient-1',
        kind: 'GeneratedGradient',
        source: JSON.stringify({
          type: 'linear',
          colours: ['#ff0000', '#0000ff'],
          stops: [0, 1],
          direction: 90,
        }),
        width: 200,
        height: 100,
      },
    ]);
    expect(result.snapshot.clips[0]).toMatchObject({
      clip_id: 'gradient-1',
      media_id: 'gradient-1',
      transform: {
        sampling: 'bilinear',
      },
    });
  });

  it('builds a rust-core compatible scene snapshot for active image and video planes', () => {
    const layers = createDefaultLayers();
    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [baseImage(), baseVideo()],
      time: 2.5,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected snapshot build to pass');

    expect(result.snapshot).toEqual({
      frame_index: 150,
      colour: {
        profile: 'rec709-sdr',
        working_space: 'linear-light',
        alpha: 'premultiplied',
      },
      clips: [
        {
          clip_id: 'video-1',
          track_id: 'layer-1',
          media_id: 'video-1',
          source_frame: 210,
          z_index: 0,
          transform: {
            translation_x: 10,
            translation_y: 20,
            scale_x: 1,
            scale_y: 1,
            rotation_degrees: 0,
            sampling: 'bilinear',
          },
          opacity: 1,
          effects: [],
        },
        {
          clip_id: 'image-1',
          track_id: 'layer-2',
          media_id: 'image-1',
          source_frame: 0,
          z_index: 1,
          transform: {
            translation_x: 100,
            translation_y: 200,
            scale_x: 1,
            scale_y: 1,
            rotation_degrees: 0,
            sampling: 'bilinear',
          },
          opacity: 0.75,
          effects: [],
        },
      ],
    });
    expect(result.media).toEqual([
      {
        id: 'video-1',
        kind: 'Video',
        source: '/tmp/video.mp4',
        width: 1280,
        height: 720,
        source_rate: {
          numerator: 60,
          denominator: 1,
        },
      },
      {
        id: 'image-1',
        kind: 'Image',
        source: '/tmp/image.png',
        width: 640,
        height: 360,
      },
    ]);
  });

  it('builds a rust-core compatible media reference for active PSD planes', () => {
    const layers = createDefaultLayers();
    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [basePsd()],
      time: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected snapshot build to pass');

    expect(result.snapshot.clips).toEqual([
      {
        clip_id: 'psd-1',
        track_id: 'layer-2',
        media_id: 'psd-1',
        source_frame: 0,
        z_index: 0,
        transform: {
          translation_x: 400,
          translation_y: 120,
          scale_x: 1,
          scale_y: 1,
          rotation_degrees: 0,
          sampling: 'bilinear',
        },
        opacity: 0.9,
        effects: [],
      },
    ]);
    expect(result.media).toEqual([
      {
        id: 'psd-1',
        kind: 'Psd',
        source: '/tmp/standing.psd',
        width: 512,
        height: 768,
        active_layer_ids: ['face-open'],
      },
    ]);
  });

  it('serialises PSD active layer ids deterministically for Rust native composition', () => {
    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers: createDefaultLayers(),
      objects: [basePsd({
        activeLayerIds: {
          'mouth-open': true,
          'mouth-closed': false,
          root: true,
          'eye-open': true,
        },
      })],
      time: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected snapshot build to pass');

    expect(result.media).toEqual([
      expect.objectContaining({
        id: 'psd-1',
        kind: 'Psd',
        active_layer_ids: ['eye-open', 'mouth-open', 'root'],
      }),
    ]);
  });

  it('uses evaluated position animation and fade opacity while ignoring inactive or hidden clips', () => {
    const layers = createDefaultLayers();
    layers[4] = { ...layers[4], visible: false };
    const active = baseImage({
      id: 'animated',
      layer: 3,
      x: 0,
      y: 10,
      endX: 100,
      endY: 210,
      enableAnimation: true,
      filters: [
        {
          id: 'fade-1',
          type: 'fade',
          enabled: true,
          params: { opacity: 0.5 },
        },
      ],
    });
    const hidden = baseImage({ id: 'hidden', layer: 4 });
    const inactive = baseImage({ id: 'inactive', startTime: 10, layer: 5 });

    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [hidden, active, inactive],
      time: 3,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected snapshot build to pass');

    expect(result.snapshot.clips).toHaveLength(1);
    expect(result.snapshot.clips[0].clip_id).toBe('animated');
    expect(result.snapshot.clips[0].transform.translation_x).toBe(50);
    expect(result.snapshot.clips[0].transform.translation_y).toBe(110);
    expect(result.snapshot.clips[0].opacity).toBe(0.375);
  });

  it('carries finite object rotation into the Rust scene transform', () => {
    const layers = createDefaultLayers();
    const rotated = baseImage({
      id: 'rotated',
      rotation: 90,
    });

    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [rotated],
      time: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected rotated snapshot build to pass');

    expect(result.snapshot.clips[0].transform.rotation_degrees).toBe(90);
  });

  it('fails loud for visible Pixi features the shared renderer cannot represent yet', () => {
    const layers = createDefaultLayers();
    const unsupportedText: TimelineObject = {
      id: 'text-1',
      type: 'text',
      name: 'title',
      layer: 0,
      startTime: 0,
      duration: 5,
      x: 0,
      y: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      opacity: 1,
      enableAnimation: false,
      endX: 0,
      endY: 0,
      easing: 'linear',
      text: 'hello',
      fontSize: 24,
      fontFamily: 'Arial',
      fill: '#ffffff',
    };
    const blurred = baseImage({
      id: 'blurred',
      filters: [
        {
          id: 'blur-1',
          type: 'blur',
          enabled: true,
          params: { strength: 4, quality: 2 },
        },
      ],
    });

    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [unsupportedText, blurred],
      time: 2,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected snapshot build to fail');

    expect(issueCodes(result.issues)).toEqual([
      'unsupportedObjectType',
      'unsupportedFilter',
    ]);
  });

  it('fails loud for shape geometry outside the first shared renderer rectangle envelope', () => {
    const layers = createDefaultLayers();
    const circle = baseShape({
      id: 'circle',
      shapeType: 'circle',
    });

    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [circle],
      time: 2,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected snapshot build to fail');

    expect(issueCodes(result.issues)).toEqual(['unsupportedShapeGeometry']);
  });

  it('fails loud for Pixi group composition and mask semantics', () => {
    const layers = createDefaultLayers();
    const grouped = baseImage({
      id: 'grouped',
      groupId: 'group-a',
    });
    const clippingMask = baseImage({
      id: 'clipping-mask',
      clipping: true,
    });
    const groupedGradient = baseImage({
      id: 'group-gradient',
      groupGradient: {
        enabled: true,
        type: 'linear',
        colours: ['#ffffff', '#000000'],
        stops: [0, 1],
        direction: 0,
      },
    });

    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [grouped, clippingMask, groupedGradient],
      time: 2,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected snapshot build to fail');

    expect(issueCodes(result.issues)).toEqual([
      'unsupportedGroupComposition',
      'unsupportedMask',
      'unsupportedGroupComposition',
    ]);
  });

  it('fails loud for transform sampling cases outside the proven migration envelope', () => {
    const layers = createDefaultLayers();
    const scaled = baseImage({
      id: 'scaled',
      scaleX: 2,
    });
    const subPixel = baseImage({
      id: 'sub-pixel',
      x: 10.5,
    });

    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers,
      objects: [scaled, subPixel],
      time: 2,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected snapshot build to fail');

    expect(issueCodes(result.issues)).toEqual([
      'unsupportedTransform',
      'unsupportedTransform',
    ]);
  });
});

const issueCodes = (issues: RustSceneSnapshotBuildIssue[]) =>
  issues.map((issue) => issue.code);
