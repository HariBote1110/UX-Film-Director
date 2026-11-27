import type { DisplacementPolyObject } from '../../types';

export interface BuildAviUtlDisplacementPolyObjectInput {
  id: string;
  projectWidth: number;
  projectHeight: number;
  startTime: number;
  layer: number;
}

export const buildAviUtlDisplacementPolyObject = ({
  id,
  projectWidth,
  projectHeight,
  startTime,
  layer,
}: BuildAviUtlDisplacementPolyObjectInput): DisplacementPolyObject => {
  const width = 800;
  const height = 450;
  const x = Math.round((projectWidth - width) / 2);
  const y = Math.round((projectHeight - height) / 2);

  return {
    id,
    type: 'displacement_poly',
    name: '93 DisplacementPoly',
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
    columns: 14,
    rows: 8,
    displacementScale: 42,
    depthScale: 18,
    meshOpacity: 0.85,
    fillOpacity: 0.18,
    lineColour: '#36c2ff',
    fillColour: '#0b1020',
    seed: 93,
  };
};
