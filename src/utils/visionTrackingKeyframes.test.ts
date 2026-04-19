import { describe, expect, it } from 'vitest';
import { buildOverlayPositionKeyframesFromVisionTrack } from './visionTrackingKeyframes';
import type { ShapeObject, VideoObject } from '../types';

const baseVideo = (): VideoObject => ({
  id: 'vid',
  type: 'video',
  name: 'Video',
  layer: 0,
  startTime: 5,
  duration: 10,
  offset: 0,
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
  src: 'file:///tmp/x.mp4',
  width: 100,
  height: 100,
  volume: 1,
  muted: true
});

const baseOverlay = (): ShapeObject => ({
  id: 'ovl',
  type: 'shape',
  name: 'Shape',
  layer: 1,
  startTime: 5,
  duration: 10,
  x: 50,
  y: 40,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  enableAnimation: false,
  endX: 0,
  endY: 0,
  easing: 'linear',
  shapeType: 'rect',
  width: 20,
  height: 20,
  fill: '#000000'
});

describe('buildOverlayPositionKeyframesFromVisionTrack', () => {
  it('returns empty array when no samples', () => {
    expect(
      buildOverlayPositionKeyframesFromVisionTrack({
        samples: [],
        video: baseVideo(),
        overlay: baseOverlay(),
        allObjects: [baseVideo(), baseOverlay()]
      })
    ).toEqual([]);
  });

  it('maps full-frame track to overlay keyframes preserving offset from first sample', () => {
    const video = baseVideo();
    const overlay = baseOverlay();
    // First: centre (50, 50) world; overlay TL (50, 40). Second: narrow box centre x = 0.3 * 100 = 30.
    const samples = [
      { tSec: 0, boundingBox: { x: 0, y: 0, width: 1, height: 1 } },
      { tSec: 1, boundingBox: { x: 0, y: 0, width: 0.6, height: 1 } }
    ];
    const kfs = buildOverlayPositionKeyframesFromVisionTrack({
      samples,
      video,
      overlay,
      allObjects: [video, overlay]
    });
    expect(kfs.length).toBe(2);
    expect(kfs[0].time).toBeCloseTo(5);
    expect(kfs[0].x).toBeCloseTo(50);
    expect(kfs[0].y).toBeCloseTo(40);
    expect(kfs[1].time).toBeCloseTo(6);
    expect(kfs[1].x).toBeCloseTo(30);
    expect(kfs[1].y).toBeCloseTo(40);
  });

  it('shifts timeline by video offset', () => {
    const video = { ...baseVideo(), offset: 2 };
    const overlay = baseOverlay();
    const samples = [{ tSec: 2, boundingBox: { x: 0, y: 0, width: 1, height: 1 } }];
    const kfs = buildOverlayPositionKeyframesFromVisionTrack({
      samples,
      video,
      overlay,
      allObjects: [video, overlay]
    });
    expect(kfs[0].time).toBeCloseTo(5);
  });
});
