import { describe, expect, it } from 'vitest';
import { buildAviUtlPieChartObject } from './pieChartObjectFactory';

describe('pieChartObjectFactory', () => {
  it('builds an AviUtlPackV4 pie sheet graph object for timeline insertion', () => {
    const object = buildAviUtlPieChartObject({
      id: 'pie-chart-1',
      projectWidth: 1920,
      projectHeight: 1080,
      startTime: 1.25,
      layer: 13,
    });

    expect(object).toMatchObject({
      id: 'pie-chart-1',
      type: 'pie_chart',
      name: 'パイシートグラフ',
      layer: 13,
      startTime: 1.25,
      duration: 5,
      x: 760,
      y: 340,
      width: 400,
      height: 400,
      values: [10, 20, 30, 40],
      sortMode: 'descending',
      normaliseToHundred: true,
      labelMode: 'percentage',
      progressPercent: 100,
      strokeWidth: 20,
      sliceColours: ['#389ba6', '#f2e2c4', '#f29422', '#f27830', '#f24b0f'],
    });
  });
});
