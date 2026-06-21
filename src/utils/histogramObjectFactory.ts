import type { HistogramObject } from '../types';

export interface BuildAviUtlHistogramObjectInput {
  id: string;
  projectWidth: number;
  projectHeight: number;
  startTime: number;
  layer: number;
}

const defaultBinValues = [0.08, 0.18, 0.32, 0.55, 0.78, 0.92, 0.64, 0.36];
const defaultChannelColours = ['#ffffff', '#ff4b4b', '#4bff6a', '#4b8cff'];

export const buildAviUtlHistogramObject = ({
  id,
  projectWidth,
  projectHeight,
  startTime,
  layer,
}: BuildAviUtlHistogramObjectInput): HistogramObject => {
  const width = 256;
  const height = 200;
  const x = Math.round((projectWidth - width) / 2);
  const y = Math.round((projectHeight - height) / 2);

  return {
    id,
    type: 'histogram',
    name: '簡易ヒストグラム',
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
    binValues: defaultBinValues,
    heightScalePercent: 100,
    lineWidth: 1,
    showLuminance: true,
    showRed: true,
    showGreen: true,
    showBlue: true,
    channelColours: defaultChannelColours,
    backgroundColour: '#000000',
  };
};
