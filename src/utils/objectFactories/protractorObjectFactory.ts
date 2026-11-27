import type { ProtractorObject } from '../../types';

export interface BuildAviUtlProtractorObjectInput {
  id: string;
  projectWidth: number;
  projectHeight: number;
  startTime: number;
  layer: number;
}

export const buildAviUtlProtractorObject = ({
  id,
  projectWidth,
  projectHeight,
  startTime,
  layer,
}: BuildAviUtlProtractorObjectInput): ProtractorObject => {
  const width = 420;
  const height = 240;
  const x = Math.round((projectWidth - width) / 2);
  const y = Math.round((projectHeight - height) / 2);

  return {
    id,
    type: 'protractor',
    name: '分度器',
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
    radius: 180,
    measuredAngleDegrees: 90,
    tickStepDegrees: 10,
    majorTickStepDegrees: 30,
    decimalPlaces: 1,
    lineColour: '#ffffff',
    textColour: '#ffffff',
    shadowColour: '#000000',
  };
};
