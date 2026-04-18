import { describe, expect, it } from 'vitest';
import {
  buildSubjectCropKeyframesFromVisionTrackSamples,
  evaluateSubjectCropNormRectAtTime,
  normaliseSubjectCropKeyframesForVideo
} from './subjectCropKeyframes';
import type { VideoObject } from '../types';

const videoBase = (): VideoObject => ({
  id: 'v',
  type: 'video',
  name: 'V',
  layer: 0,
  startTime: 2,
  duration: 8,
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
  src: 'file:///x.mp4',
  width: 100,
  height: 100,
  volume: 1,
  muted: true
});

describe('evaluateSubjectCropNormRectAtTime', () => {
  it('interpolates rect components', () => {
    const video = {
      ...videoBase(),
      subjectCropKeyframes: [
        { id: 'a', time: 2, x: 0, y: 0, width: 1, height: 1 },
        { id: 'b', time: 10, x: 0.1, y: 0.2, width: 0.5, height: 0.5 }
      ]
    };
    const mid = evaluateSubjectCropNormRectAtTime(video, 6);
    expect(mid).not.toBeNull();
    expect(mid!.x).toBeCloseTo(0.05);
    expect(mid!.y).toBeCloseTo(0.1);
    expect(mid!.width).toBeCloseTo(0.75);
    expect(mid!.height).toBeCloseTo(0.75);
  });
});

describe('buildSubjectCropKeyframesFromVisionTrackSamples', () => {
  it('maps Vision boxes to Pixi-normalised keyframes on the timeline', () => {
    const video = videoBase();
    const samples = [
      { tSec: 0, boundingBox: { x: 0, y: 0, width: 1, height: 1 } }
    ];
    const kfs = buildSubjectCropKeyframesFromVisionTrackSamples(samples, video);
    expect(kfs.length).toBe(1);
    expect(kfs[0].time).toBeCloseTo(2);
    expect(kfs[0].x).toBeCloseTo(0);
    expect(kfs[0].y).toBeCloseTo(0);
    expect(kfs[0].width).toBeCloseTo(1);
    expect(kfs[0].height).toBeCloseTo(1);
  });
});

describe('normaliseSubjectCropKeyframesForVideo', () => {
  it('clamps times and rect', () => {
    const video = videoBase();
    const out = normaliseSubjectCropKeyframesForVideo(video, [
      { id: 'x', time: 999, x: -0.1, y: 0, width: 2, height: 1 }
    ]);
    expect(out[0].time).toBeCloseTo(10);
    expect(out[0].x).toBeGreaterThanOrEqual(0);
    expect(out[0].width).toBeLessThanOrEqual(1);
  });
});
