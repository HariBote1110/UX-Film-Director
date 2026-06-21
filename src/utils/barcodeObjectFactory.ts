import type { BarcodeObject } from '../types';

export interface BuildAviUtlBarcodeObjectInput {
  id: string;
  projectWidth: number;
  projectHeight: number;
  startTime: number;
  layer: number;
}

export const buildAviUtlBarcodeObject = ({
  id,
  projectWidth,
  projectHeight,
  startTime,
  layer,
}: BuildAviUtlBarcodeObjectInput): BarcodeObject => {
  const width = Math.max(320, Math.round((projectWidth * 0.27) / 10) * 10);
  const height = Math.max(120, Math.round(projectHeight / 6));
  const x = Math.round((projectWidth - width) / 2);
  const y = Math.round((projectHeight - height) / 2);

  return {
    id,
    type: 'barcode',
    name: 'バーコードT',
    layer,
    startTime,
    duration: 5,
    x,
    y,
    width,
    height,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    opacity: 1,
    enableAnimation: false,
    endX: x,
    endY: y,
    easing: 'linear',
    data: 'AviUtl',
    minimumBarWidth: 2,
    horizontalMargin: 30,
    verticalMargin: 20,
    foregroundColour: '#000000',
    backgroundColour: '#ffffff',
  };
};
