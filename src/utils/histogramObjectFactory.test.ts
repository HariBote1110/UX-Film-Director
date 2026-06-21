import { describe, expect, it } from 'vitest';
import { buildAviUtlHistogramObject } from './histogramObjectFactory';

describe('histogramObjectFactory', () => {
  it('builds an AviUtlPackV4 simple histogram object for timeline insertion', () => {
    const object = buildAviUtlHistogramObject({
      id: 'histogram-1',
      projectWidth: 1920,
      projectHeight: 1080,
      startTime: 1.5,
      layer: 14,
    });

    expect(object).toMatchObject({
      id: 'histogram-1',
      type: 'histogram',
      name: '簡易ヒストグラム',
      layer: 14,
      startTime: 1.5,
      duration: 5,
      x: 832,
      y: 440,
      width: 256,
      height: 200,
      binValues: [0.08, 0.18, 0.32, 0.55, 0.78, 0.92, 0.64, 0.36],
      heightScalePercent: 100,
      lineWidth: 1,
      showLuminance: true,
      showRed: true,
      showGreen: true,
      showBlue: true,
      channelColours: ['#ffffff', '#ff4b4b', '#4bff6a', '#4b8cff'],
      backgroundColour: '#000000',
    });
  });
});
