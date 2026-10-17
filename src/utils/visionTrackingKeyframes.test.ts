import { describe, expect, it } from 'vitest';
import {
  buildOverlayPositionKeyframesFromPositionQuery,
  buildVisionTrackPositionQueryPlan,
} from './visionTrackingKeyframes';
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
      buildVisionTrackPositionQueryPlan({
        samples: [],
        video: baseVideo(),
        overlay: baseOverlay(),
      })
    ).toEqual({ queries: [], samples: [] });
  });

  it('creates raw-second queries for video and overlay at each clamped timeline sample time', () => {
    const video = baseVideo();
    const overlay = baseOverlay();
    const samples = [
      { tSec: 0, boundingBox: { x: 0, y: 0, width: 1, height: 1 } },
      { tSec: 1, boundingBox: { x: 0, y: 0, width: 0.6, height: 1 } }
    ];
    const plan = buildVisionTrackPositionQueryPlan({
      samples,
      video,
      overlay,
    });

    expect(plan.samples.map(({ timeSeconds }) => timeSeconds)).toEqual([5, 6]);
    expect(plan.queries).toEqual([
      { requestId: 'vision-0-video', objectId: 'vid', timeSeconds: 5 },
      { requestId: 'vision-0-overlay', objectId: 'ovl', timeSeconds: 5 },
      { requestId: 'vision-1-video', objectId: 'vid', timeSeconds: 6 },
      { requestId: 'vision-1-overlay', objectId: 'ovl', timeSeconds: 6 },
    ]);
  });

  it('uses video local positions and group-only overlay translation to preserve the legacy offset', () => {
    const video = baseVideo();
    const overlay = baseOverlay();
    const samples = [
      { tSec: 0, boundingBox: { x: 0, y: 0, width: 1, height: 1 } },
      { tSec: 1, boundingBox: { x: 0, y: 0, width: 0.6, height: 1 } }
    ];
    const plan = buildVisionTrackPositionQueryPlan({ samples, video, overlay });
    const positions = [
      { requestId: 'vision-0-video', objectId: 'vid', timeSeconds: 5, localPosition: { x: 10, y: 20 }, worldPosition: { x: 10, y: 20 }, groupTranslation: { x: 0, y: 0 }, worldRotationDegrees: 0, worldScaleX: 1, worldScaleY: 1 },
      { requestId: 'vision-0-overlay', objectId: 'ovl', timeSeconds: 5, localPosition: { x: 100, y: 110 }, worldPosition: { x: 127, y: 134 }, groupTranslation: { x: 20, y: 20 }, worldRotationDegrees: 0, worldScaleX: 1, worldScaleY: 1 },
      { requestId: 'vision-1-video', objectId: 'vid', timeSeconds: 6, localPosition: { x: 20, y: 20 }, worldPosition: { x: 20, y: 20 }, groupTranslation: { x: 0, y: 0 }, worldRotationDegrees: 0, worldScaleX: 1, worldScaleY: 1 },
      { requestId: 'vision-1-overlay', objectId: 'ovl', timeSeconds: 6, localPosition: { x: 130, y: 150 }, worldPosition: { x: 171, y: 194 }, groupTranslation: { x: 30, y: 30 }, worldRotationDegrees: 0, worldScaleX: 1, worldScaleY: 1 },
    ];

    expect(buildOverlayPositionKeyframesFromPositionQuery({ plan, video, overlay, positions }))
      .toMatchObject([
        { time: 5, x: 100, y: 110 },
        { time: 6, x: 80, y: 100 },
      ]);
  });

  it('fails closed when a Rust position response is absent or mismatched instead of using TS positions', () => {
    const video = { ...baseVideo(), offset: 2 };
    const overlay = baseOverlay();
    const samples = [{ tSec: 2, boundingBox: { x: 0, y: 0, width: 1, height: 1 } }];
    const plan = buildVisionTrackPositionQueryPlan({ samples, video, overlay });

    expect(() => buildOverlayPositionKeyframesFromPositionQuery({
      plan,
      video,
      overlay,
      positions: [],
    })).toThrow(/position query/i);
  });

});
