import { describe, expect, it } from 'vitest';
import type { AudioObject, ImageObject, PsdObject, ShapeObject, VideoObject } from '../types';
import { resolveProjectExportVideoTranscodeFastPath } from './projectExportVideoTranscodeFastPath';

const video = (patch: Partial<VideoObject> = {}): VideoObject => ({
  id: 'video-1',
  type: 'video',
  name: 'clip.mp4',
  layer: 1,
  startTime: 0,
  duration: 5,
  offset: 2,
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
  src: 'blob:video',
  filePath: '/tmp/clip.mp4',
  width: 1920,
  height: 1080,
  volume: 1,
  muted: false,
  ...patch,
});

const shape = (patch: Partial<ShapeObject> = {}): ShapeObject => ({
  id: 'shape-1',
  type: 'shape',
  name: 'Rectangle',
  layer: 1,
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
  shapeType: 'rect',
  width: 100,
  height: 100,
  fill: '#fff',
  ...patch,
});

const image = (patch: Partial<ImageObject> = {}): ImageObject => ({
  id: 'image-1',
  type: 'image',
  name: 'overlay.png',
  layer: 2,
  startTime: 0,
  duration: 5,
  x: 100,
  y: 120,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  enableAnimation: false,
  endX: 100,
  endY: 120,
  easing: 'linear',
  src: 'blob:image',
  filePath: '/tmp/overlay.png',
  width: 320,
  height: 180,
  ...patch,
});

const audio = (patch: Partial<AudioObject> = {}): AudioObject => ({
  id: 'audio-1',
  type: 'audio',
  name: 'voice.wav',
  layer: 3,
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
  src: 'blob:audio',
  filePath: '/tmp/voice.wav',
  volume: 1,
  muted: false,
  ...patch,
});

const psd = (patch: Partial<PsdObject> = {}): PsdObject => ({
  id: 'psd-1',
  type: 'psd',
  name: 'standing.psd',
  layer: 4,
  startTime: 0,
  duration: 5,
  x: 80,
  y: 90,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  enableAnimation: false,
  endX: 80,
  endY: 90,
  easing: 'linear',
  src: 'blob:psd',
  filePath: '/tmp/standing.psd',
  width: 256,
  height: 512,
  scale: 0.5,
  activeLayerIds: {
    root: true,
    'psd-layer-1': true,
    'psd-layer-2': false,
  },
  ...patch,
});

describe('resolveProjectExportVideoTranscodeFastPath', () => {
  it('accepts a single full-frame unmodified video', () => {
    expect(resolveProjectExportVideoTranscodeFastPath({
      objects: [video()],
      width: 1920,
      height: 1080,
      fps: 60,
      durationSeconds: 5,
    })).toEqual({
      inputPath: '/tmp/clip.mp4',
      width: 1920,
      height: 1080,
      fps: 60,
      durationSeconds: 5,
      startSeconds: 2,
      includeAudio: true,
      audioVolume: 1,
      objectX: 0,
      objectY: 0,
      objectWidth: 1920,
      objectHeight: 1080,
    });
  });

  it('accepts a centred single video that can be represented by scale and pad', () => {
    expect(resolveProjectExportVideoTranscodeFastPath({
      objects: [video({
        x: 640,
        y: 360,
        width: 640,
        height: 360,
      })],
      width: 1920,
      height: 1080,
      fps: 60,
      durationSeconds: 5,
    })).toMatchObject({
      inputPath: '/tmp/clip.mp4',
      objectX: 640,
      objectY: 360,
      objectWidth: 640,
      objectHeight: 360,
    });
  });

  it('accepts scale-based resizing as an exact output rectangle', () => {
    expect(resolveProjectExportVideoTranscodeFastPath({
      objects: [video({
        x: 100,
        y: 80,
        width: 640,
        height: 360,
        scaleX: 0.5,
        scaleY: 0.75,
      })],
      width: 1920,
      height: 1080,
      fps: 60,
      durationSeconds: 5,
    })).toMatchObject({
      objectX: 100,
      objectY: 80,
      objectWidth: 320,
      objectHeight: 270,
    });
  });

  it('accepts a scaled video that partially sits outside the output frame', () => {
    expect(resolveProjectExportVideoTranscodeFastPath({
      objects: [video({
        x: -240,
        y: -120,
        scaleX: 1.5,
        scaleY: 1.5,
      })],
      width: 1920,
      height: 1080,
      fps: 60,
      durationSeconds: 5,
    })).toMatchObject({
      objectX: -240,
      objectY: -120,
      objectWidth: 2880,
      objectHeight: 1620,
    });
  });

  it('rejects a video that is completely outside the output frame', () => {
    expect(resolveProjectExportVideoTranscodeFastPath({
      objects: [video({
        x: 1920,
        y: 0,
        width: 640,
        height: 360,
      })],
      width: 1920,
      height: 1080,
      fps: 60,
      durationSeconds: 5,
    })).toBeNull();
    expect(resolveProjectExportVideoTranscodeFastPath({
      objects: [video({
        x: -641,
        y: 0,
        width: 640,
        height: 360,
      })],
      width: 1920,
      height: 1080,
      fps: 60,
      durationSeconds: 5,
    })).toBeNull();
  });

  it('drops source audio when the video is muted', () => {
    expect(resolveProjectExportVideoTranscodeFastPath({
      objects: [video({ muted: true })],
      width: 1920,
      height: 1080,
      fps: 60,
      durationSeconds: 5,
    })).toMatchObject({
      includeAudio: false,
      audioVolume: 0,
    });
  });

  it('accepts a single video with static rectangle, image, and mixed audio overlays', () => {
    expect(resolveProjectExportVideoTranscodeFastPath({
      objects: [
        video({ width: 1280, height: 720, x: 320, y: 180 }),
        shape(),
        image(),
        audio(),
      ],
      width: 1920,
      height: 1080,
      fps: 60,
      durationSeconds: 5,
    })).toMatchObject({
      inputPath: '/tmp/clip.mp4',
      includeAudio: false,
      requiresAudioMix: true,
      overlays: [{
        kind: 'solidColour',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        colour: '#fff',
        opacity: 1,
      }, {
        kind: 'image',
        path: '/tmp/overlay.png',
        x: 100,
        y: 120,
        width: 320,
        height: 180,
        opacity: 1,
      }],
    });
  });

  it('accepts a single video with a static PSD overlay as a Rust transcode overlay', () => {
    expect(resolveProjectExportVideoTranscodeFastPath({
      objects: [
        video({ width: 1280, height: 720, x: 320, y: 180 }),
        psd(),
      ],
      width: 1920,
      height: 1080,
      fps: 60,
      durationSeconds: 5,
    })).toMatchObject({
      inputPath: '/tmp/clip.mp4',
      overlays: [{
        kind: 'psd',
        path: '/tmp/standing.psd',
        activeLayerIds: ['root', 'psd-layer-1'],
        x: 80,
        y: 90,
        width: 128,
        height: 256,
        opacity: 1,
      }],
    });
  });

  it('rejects timelines that need composition', () => {
    expect(resolveProjectExportVideoTranscodeFastPath({
      objects: [video(), shape({ rotation: 15 })],
      width: 1920,
      height: 1080,
      fps: 60,
      durationSeconds: 5,
    })).toBeNull();
    expect(resolveProjectExportVideoTranscodeFastPath({
      objects: [video({ rotation: 15 })],
      width: 1920,
      height: 1080,
      fps: 60,
      durationSeconds: 5,
    })).toBeNull();
    expect(resolveProjectExportVideoTranscodeFastPath({
      objects: [video({ opacity: 0.5 })],
      width: 1920,
      height: 1080,
      fps: 60,
      durationSeconds: 5,
    })).toBeNull();
  });
});
