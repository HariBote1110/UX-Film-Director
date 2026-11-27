import { describe, expect, it } from 'vitest';
import { buildAviUtlContourTraceObject } from './contourTraceObjectFactory';

describe('contourTraceObjectFactory', () => {
  it('builds a 93 Contour trace object for timeline insertion', () => {
    const object = buildAviUtlContourTraceObject({
      id: 'contour-trace-1',
      projectWidth: 1920,
      projectHeight: 1080,
      startTime: 3,
      layer: 24,
    });

    expect(object).toMatchObject({
      id: 'contour-trace-1',
      type: 'contour_trace',
      name: '93 輪郭トレス',
      layer: 24,
      startTime: 3,
      duration: 5,
      x: 560,
      y: 315,
      width: 800,
      height: 450,
      lineWidth: 3,
      contourCount: 5,
      jitterAmount: 1.5,
      traceColour: '#ffffff',
      backgroundOpacity: 0,
      seed: 93,
    });
  });
});
