import { describe, expect, it } from 'vitest';
import { buildHksyCheckerGridObject, buildHksyLineObject } from './hksyCheckerGridObjectFactory';

describe('hksyCheckerGridObjectFactory', () => {
  it('builds an hksy checker/grid object for timeline insertion', () => {
    const object = buildHksyCheckerGridObject({
      id: 'hksy-checker-grid-1',
      projectWidth: 1920,
      projectHeight: 1080,
      startTime: 1,
      layer: 28,
    });

    expect(object).toMatchObject({
      id: 'hksy-checker-grid-1',
      type: 'hksy_checker_grid',
      name: 'hksy チェッカー/グリッド',
      layer: 28,
      startTime: 1,
      duration: 5,
      x: 560,
      y: 315,
      width: 800,
      height: 450,
      cellSize: 50,
      lineWidth: 2,
      checkerEnabled: true,
      gridEnabled: true,
      foregroundColour: '#ffffff',
      secondaryColour: '#333333',
      backgroundColour: '#000000',
    });
  });

  it('builds an hksy line object using the Rust checker/grid generator path', () => {
    const object = buildHksyLineObject({
      id: 'hksy-line-1',
      projectWidth: 1920,
      projectHeight: 1080,
      startTime: 2,
      layer: 29,
    });

    expect(object).toMatchObject({
      id: 'hksy-line-1',
      type: 'hksy_checker_grid',
      name: 'hksy 直線',
      layer: 29,
      startTime: 2,
      duration: 5,
      x: 560,
      y: 315,
      width: 800,
      height: 450,
      cellSize: 64,
      lineWidth: 4,
      checkerEnabled: false,
      gridEnabled: true,
      foregroundColour: '#ffffff',
      secondaryColour: '#ffffff',
      backgroundColour: '#000000',
    });
  });
});
