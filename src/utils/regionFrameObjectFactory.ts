import type { RegionFrameObject } from '../types';

export interface BuildAviUtlRegionFrameObjectInput {
  id: string;
  projectWidth: number;
  projectHeight: number;
  startTime: number;
  layer: number;
}

const buildBaseRegionFrameObject = ({
  id,
  projectWidth,
  projectHeight,
  startTime,
  layer,
}: BuildAviUtlRegionFrameObjectInput): Omit<RegionFrameObject, 'name' | 'shape' | 'cornerCut'> => {
  const width = Math.max(320, Math.round(projectWidth * 0.4167));
  const height = Math.max(180, Math.round(projectHeight * 0.4167));
  const x = Math.round((projectWidth - width) / 2);
  const y = Math.round((projectHeight - height) / 2);

  return {
    id,
    type: 'region_frame',
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

export const buildAviUtlRegionFrameObject = (input: BuildAviUtlRegionFrameObjectInput): RegionFrameObject => ({
  ...buildBaseRegionFrameObject(input),
  name: '93 領域枠',
  shape: 'rectangle',
});

export const buildAviUtlEllipseRegionFrameObject = (input: BuildAviUtlRegionFrameObjectInput): RegionFrameObject => ({
  ...buildBaseRegionFrameObject(input),
  name: '93 領域枠(楕円)',
  shape: 'ellipse',
});

export const buildAviUtlCutCornerRegionFrameObject = (input: BuildAviUtlRegionFrameObjectInput): RegionFrameObject => ({
  ...buildBaseRegionFrameObject(input),
  name: '93 領域枠(角落ち)',
  shape: 'cut_corner',
  cornerCut: 20,
});
