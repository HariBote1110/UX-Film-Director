import { describe, expect, it } from 'vitest';
import type { ShapeObject } from '../../types';
import {
  buildAviUtlMotionPresetPatch,
  getAviUtlPackMotionPresets
} from './aviutlMotionPresets';

const baseShape = (patch: Partial<ShapeObject> = {}): ShapeObject => ({
  id: 'shape-1',
  type: 'shape',
  name: 'Rect',
  layer: 0,
  startTime: 10,
  duration: 4,
  x: 320,
  y: 240,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  enableAnimation: false,
  endX: 320,
  endY: 240,
  easing: 'linear',
  shapeType: 'rect',
  width: 100,
  height: 80,
  fill: '#ffffff',
  ...patch
});

describe('AviUtlPackV4 motion presets', () => {
  it('exposes the P0 Pack motion candidates as native presets', () => {
    expect(getAviUtlPackMotionPresets().map((preset) => ({
      id: preset.id,
      sourceCandidateId: preset.sourceCandidateId
    }))).toEqual([
      { id: 'entrance-slide-left', sourceCandidateId: 'ymm4-entrance-exit' },
      { id: 'entrance-pop-up', sourceCandidateId: 'ymm4-entrance-exit' },
      { id: 'random-wiggle', sourceCandidateId: 'ymm4-random-motion' },
      { id: 'repeat-side-to-side', sourceCandidateId: 'ymm4-repeat-motion' },
      { id: 'motion-path-arc', sourceCandidateId: 'tim-motion-path' },
      { id: 'motion-path-s-curve', sourceCandidateId: 'tim-motion-path' },
      { id: 'wind-sway-soft', sourceCandidateId: 'tim-wind-sway' },
      { id: 'delay-move-individual', sourceCandidateId: '93-delay-move' },
      { id: 'coordinate-plus-snap-move', sourceCandidateId: '93-coordinate-plus' }
    ]);
  });

  it('builds an entrance slide without moving the settled object position', () => {
    const patch = buildAviUtlMotionPresetPatch(baseShape(), 'entrance-slide-left', {
      distancePx: 160,
      spanSeconds: 0.5
    });

    expect(patch.enableAnimation).toBe(true);
    expect(patch.x).toBe(320);
    expect(patch.y).toBe(240);
    expect(patch.endX).toBe(320);
    expect(patch.endY).toBe(240);
    expect(patch.easing).toBe('easeOutCubic');
    expect(patch.keyframes).toEqual([
      expect.objectContaining({ time: 10, x: 160, y: 240, easing: 'easeOutCubic' }),
      expect.objectContaining({ time: 10.5, x: 320, y: 240, easing: 'linear' }),
      expect.objectContaining({ time: 14, x: 320, y: 240, easing: 'linear' })
    ]);
  });

  it('builds deterministic bounded random wiggle keyframes', () => {
    const first = buildAviUtlMotionPresetPatch(baseShape(), 'random-wiggle', {
      distancePx: 12,
      intervalSeconds: 0.5
    });
    const second = buildAviUtlMotionPresetPatch(baseShape(), 'random-wiggle', {
      distancePx: 12,
      intervalSeconds: 0.5
    });

    expect(second.keyframes).toEqual(first.keyframes);
    expect(first.keyframes).toHaveLength(9);
    first.keyframes?.forEach((keyframe) => {
      expect(keyframe.x).toBeGreaterThanOrEqual(308);
      expect(keyframe.x).toBeLessThanOrEqual(332);
      expect(keyframe.y).toBeGreaterThanOrEqual(228);
      expect(keyframe.y).toBeLessThanOrEqual(252);
    });
  });

  it('builds repeat side-to-side motion that returns to the original position', () => {
    const patch = buildAviUtlMotionPresetPatch(baseShape(), 'repeat-side-to-side', {
      distancePx: 30,
      intervalSeconds: 1
    });

    expect(patch.keyframes).toEqual([
      expect.objectContaining({ time: 10, x: 290, y: 240, easing: 'easeInOutSine' }),
      expect.objectContaining({ time: 11, x: 350, y: 240, easing: 'easeInOutSine' }),
      expect.objectContaining({ time: 12, x: 290, y: 240, easing: 'easeInOutSine' }),
      expect.objectContaining({ time: 13, x: 350, y: 240, easing: 'easeInOutSine' }),
      expect.objectContaining({ time: 14, x: 320, y: 240, easing: 'linear' })
    ]);
  });

  it('builds a Tim motion path arc that lands at the path endpoint', () => {
    const patch = buildAviUtlMotionPresetPatch(baseShape(), 'motion-path-arc', {
      distancePx: 120
    });

    expect(patch.enableAnimation).toBe(true);
    expect(patch.x).toBe(320);
    expect(patch.y).toBe(240);
    expect(patch.endX).toBe(440);
    expect(patch.endY).toBe(240);
    expect(patch.easing).toBe('easeInOutSine');
    expect(patch.keyframes).toEqual([
      expect.objectContaining({ time: 10, x: 320, y: 240, easing: 'easeInOutSine' }),
      expect.objectContaining({ time: 12, x: 380, y: 180, easing: 'easeInOutSine' }),
      expect.objectContaining({ time: 14, x: 440, y: 240, easing: 'linear' })
    ]);
  });

  it('builds a Tim motion path S-curve with alternating control points', () => {
    const patch = buildAviUtlMotionPresetPatch(baseShape(), 'motion-path-s-curve', {
      distancePx: 120
    });

    expect(patch.endX).toBe(440);
    expect(patch.endY).toBe(240);
    expect(patch.keyframes).toEqual([
      expect.objectContaining({ time: 10, x: 320, y: 240, easing: 'easeInOutSine' }),
      expect.objectContaining({ time: 11, x: 350, y: 180, easing: 'easeInOutSine' }),
      expect.objectContaining({ time: 12, x: 380, y: 300, easing: 'easeInOutSine' }),
      expect.objectContaining({ time: 13, x: 410, y: 180, easing: 'easeInOutSine' }),
      expect.objectContaining({ time: 14, x: 440, y: 240, easing: 'linear' })
    ]);
  });

  it('builds a Tim wind sway loop that keeps the object near its resting position', () => {
    const patch = buildAviUtlMotionPresetPatch(baseShape(), 'wind-sway-soft', {
      distancePx: 16,
      intervalSeconds: 1
    });

    expect(patch.endX).toBe(320);
    expect(patch.endY).toBe(240);
    expect(patch.easing).toBe('easeInOutSine');
    expect(patch.keyframes).toEqual([
      expect.objectContaining({ time: 10, x: 320, y: 240, easing: 'easeInOutSine' }),
      expect.objectContaining({ time: 11, x: 328, y: 236, easing: 'easeInOutSine' }),
      expect.objectContaining({ time: 12, x: 312, y: 244, easing: 'easeInOutSine' }),
      expect.objectContaining({ time: 13, x: 328, y: 236, easing: 'easeInOutSine' }),
      expect.objectContaining({ time: 14, x: 320, y: 240, easing: 'linear' })
    ]);
  });

  it('builds a 93 Delay個別 motion with a sequence-based start offset', () => {
    const patch = buildAviUtlMotionPresetPatch(baseShape({ id: 'shape-3' }), 'delay-move-individual', {
      distancePx: 90,
      spanSeconds: 0.6,
      intervalSeconds: 0.4,
      sequenceIndex: 2,
      sequenceTotal: 5
    });

    expect(patch.enableAnimation).toBe(true);
    expect(patch.x).toBe(320);
    expect(patch.y).toBe(240);
    expect(patch.endX).toBe(410);
    expect(patch.endY).toBe(240);
    expect(patch.easing).toBe('easeInOutSine');
    expect(patch.keyframes).toEqual([
      expect.objectContaining({ time: 10, x: 320, y: 240, easing: 'linear' }),
      expect.objectContaining({ time: 10.2, x: 320, y: 240, easing: 'easeInOutSine' }),
      expect.objectContaining({ time: 10.8, x: 410, y: 240, easing: 'linear' }),
      expect.objectContaining({ time: 14, x: 410, y: 240, easing: 'linear' })
    ]);
  });

  it('reverses the 93 Delay個別 order when requested', () => {
    const patch = buildAviUtlMotionPresetPatch(baseShape({ id: 'shape-1' }), 'delay-move-individual', {
      distancePx: 60,
      spanSeconds: 0.5,
      intervalSeconds: 0.4,
      sequenceIndex: 1,
      sequenceTotal: 5,
      reverseOrder: true
    });

    expect(patch.keyframes).toEqual([
      expect.objectContaining({ time: 10, x: 320, y: 240, easing: 'linear' }),
      expect.objectContaining({ time: 10.3, x: 320, y: 240, easing: 'easeInOutSine' }),
      expect.objectContaining({ time: 10.8, x: 380, y: 240, easing: 'linear' }),
      expect.objectContaining({ time: 14, x: 380, y: 240, easing: 'linear' })
    ]);
  });

  it('builds a 93 座標plus snap move from a grid-aligned base position', () => {
    const patch = buildAviUtlMotionPresetPatch(baseShape({
      x: 323,
      y: 247,
      startTime: 2,
      duration: 3
    }), 'coordinate-plus-snap-move', {
      distancePx: 64,
      spanSeconds: 0.75,
      intervalSeconds: 32
    });

    expect(patch.enableAnimation).toBe(true);
    expect(patch.x).toBe(320);
    expect(patch.y).toBe(224);
    expect(patch.endX).toBe(384);
    expect(patch.endY).toBe(224);
    expect(patch.easing).toBe('easeInOutSine');
    expect(patch.keyframes).toEqual([
      expect.objectContaining({ time: 2, x: 320, y: 224, easing: 'easeInOutSine' }),
      expect.objectContaining({ time: 2.75, x: 384, y: 224, easing: 'linear' }),
      expect.objectContaining({ time: 5, x: 384, y: 224, easing: 'linear' })
    ]);
  });
});
