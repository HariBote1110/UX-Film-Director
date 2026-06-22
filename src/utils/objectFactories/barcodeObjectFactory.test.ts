import { describe, expect, it } from 'vitest';
import { buildAviUtlBarcodeObject } from './barcodeObjectFactory';

describe('barcodeObjectFactory', () => {
  it('builds an AviUtlPackV4 barcode object for timeline insertion', () => {
    const object = buildAviUtlBarcodeObject({
      id: 'barcode-1',
      projectWidth: 1920,
      projectHeight: 1080,
      startTime: 2.25,
      layer: 10,
    });

    expect(object).toMatchObject({
      id: 'barcode-1',
      type: 'barcode',
      name: 'バーコードT',
      layer: 10,
      startTime: 2.25,
      duration: 5,
      x: 700,
      y: 450,
      width: 520,
      height: 180,
      data: 'AviUtl',
      minimumBarWidth: 2,
      horizontalMargin: 30,
      verticalMargin: 20,
      foregroundColour: '#000000',
      backgroundColour: '#ffffff',
    });
  });
});
