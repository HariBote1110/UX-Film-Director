import { describe, expect, it } from 'vitest';
import {
  localTopLeftPointToWorld,
  visionNormBoundingBoxCentreToLocalTopLeft,
  type VisionNormBoundingBox
} from './visionTrackingGeometry';

describe('visionNormBoundingBoxCentreToLocalTopLeft', () => {
  it('maps full-frame Vision box centre to sprite centre', () => {
    const box: VisionNormBoundingBox = { x: 0, y: 0, width: 1, height: 1 };
    expect(visionNormBoundingBoxCentreToLocalTopLeft(box, 200, 100)).toEqual({ localX: 100, localY: 50 });
  });

  it('uses Vision lower-left origin for y', () => {
    // Bottom strip: y=0 in Vision is image bottom; centre of box at y=0.125 (height 0.25 from bottom)
    const box: VisionNormBoundingBox = { x: 0, y: 0, width: 0.25, height: 0.25 };
    expect(visionNormBoundingBoxCentreToLocalTopLeft(box, 100, 100)).toEqual({ localX: 12.5, localY: 87.5 });
  });

  it('maps top-centre patch on a wide sprite', () => {
    // Box touching top: in Vision, top means y + h = 1
    const box: VisionNormBoundingBox = { x: 0.25, y: 0.75, width: 0.5, height: 0.25 };
    expect(visionNormBoundingBoxCentreToLocalTopLeft(box, 1000, 400)).toEqual({ localX: 500, localY: 50 });
  });
});

describe('localTopLeftPointToWorld', () => {
  it('adds translation when scale 1 and no rotation', () => {
    expect(
      localTopLeftPointToWorld({ localX: 5, localY: 10 }, { x: 100, y: 200, rotationDeg: 0, scaleX: 1, scaleY: 1 })
    ).toEqual({ x: 105, y: 210 });
  });

  it('applies scale before rotation around top-left pivot', () => {
    expect(
      localTopLeftPointToWorld({ localX: 10, localY: 0 }, { x: 0, y: 0, rotationDeg: 0, scaleX: 2, scaleY: 3 })
    ).toEqual({ x: 20, y: 0 });
  });

  it('rotates 90 degrees clockwise (Pixi rotation is clockwise for positive angle)', () => {
    const r90 = 90;
    // (1,0) local scaled -> rotate 90° CW around origin -> (0, 1) in parent if standard 2D rotation
    const out = localTopLeftPointToWorld(
      { localX: 1, localY: 0 },
      { x: 10, y: 20, rotationDeg: r90, scaleX: 1, scaleY: 1 }
    );
    expect(out.x).toBeCloseTo(10);
    expect(out.y).toBeCloseTo(21);
  });
});
