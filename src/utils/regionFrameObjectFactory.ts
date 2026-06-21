import type { RegionFrameObject } from '../types';

export interface BuildAviUtlRegionFrameObjectInput {
  id: string;
  projectWidth: number;
  projectHeight: number;
  startTime: number;
  layer: number;
}

export const buildAviUtlRegionFrameObject = ({
  id,
  projectWidth,
  projectHeight,
  startTime,
  layer,
}: BuildAviUtlRegionFrameObjectInput): RegionFrameObject => {
  const width = Math.max(320, Math.round(projectWidth * 0.4167));
  const height = Math.max(180, Math.round(projectHeight * 0.4167));
  const x = Math.round((projectWidth - width) / 2);
  const y = Math.round((projectHeight - height) / 2);

  return {
    id,
    type: 'region_frame',
    name: '93 領域枠',
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
    lineWidth: 10,
    extraWidth: 0,
    extraHeight: 0,
    backgroundOpacity: 0.2,
    frameColour: '#ffffff',
    backgroundColour: '#ccccff',
  };
};
