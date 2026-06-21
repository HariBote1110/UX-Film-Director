import type { SphereDotsObject } from '../types';

export interface BuildAviUtlSphereDotsObjectInput {
  id: string;
  projectWidth: number;
  projectHeight: number;
  startTime: number;
  layer: number;
}

export const buildAviUtlSphereDotsObject = ({
  id,
  projectWidth,
  projectHeight,
  startTime,
  layer,
}: BuildAviUtlSphereDotsObjectInput): SphereDotsObject => {
  const size = Math.max(240, Math.round(Math.min(projectWidth, projectHeight) * 0.4444));
  const x = Math.round((projectWidth - size) / 2);
  const y = Math.round((projectHeight - size) / 2);

  return {
    id,
    type: 'sphere_dots',
    name: '93 Sphere(DrawPixel)',
    layer,
    startTime,
    duration: 5,
    x,
    y,
    width: size,
    height: size,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    opacity: 1,
    enableAnimation: false,
    endX: x,
    endY: y,
    easing: 'linear',
    radius: 170,
    columns: 16,
    rows: 12,
    rotationDegrees: 10,
    offsetDegrees: 0,
    luminanceInfluence: 0,
    pointSize: 6,
    latitudeLineWidth: 2,
    colour: '#ffffff',
    secondaryColour: '#36c2ff',
    seed: 93,
    planeMode: false,
  };
};
