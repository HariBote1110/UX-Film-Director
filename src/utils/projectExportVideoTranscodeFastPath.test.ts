import { describe, expect, it } from 'vitest';
import type { ShapeObject, VideoObject } from '../types';
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

const shape = (): ShapeObject => ({
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

  it('rejects timelines that need composition', () => {
    expect(resolveProjectExportVideoTranscodeFastPath({
      objects: [video(), shape()],
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
