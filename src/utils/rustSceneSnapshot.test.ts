import { describe, expect, it } from 'vitest';
import { createDefaultLayers } from './sceneState';
import {
  buildRustSceneSnapshotForTimeline,
  type RustSceneSnapshotBuildIssue,
} from './rustSceneSnapshot';
import type { ImageObject, ProjectSettings, TimelineObject, VideoObject } from '../types';

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
  scaleX: 1.5,
  scaleY: 0.5,
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

describe('buildRustSceneSnapshotForTimeline', () => {
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
            scale_x: 1.5,
            scale_y: 0.5,
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
    const rotated = baseImage({ id: 'rotated', rotation: 15 });
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
      objects: [unsupportedText, rotated, blurred],
      time: 2,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected snapshot build to fail');

    expect(issueCodes(result.issues)).toEqual([
      'unsupportedObjectType',
      'unsupportedRotation',
      'unsupportedFilter',
    ]);
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
});

const issueCodes = (issues: RustSceneSnapshotBuildIssue[]) =>
  issues.map((issue) => issue.code);
