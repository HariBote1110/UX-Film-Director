import type { SphericalFieldObject } from '../types';

export interface BuildAviUtlSphericalFieldObjectInput {
  id: string;
  projectWidth: number;
  projectHeight: number;
  startTime: number;
  layer: number;
}

export const buildAviUtlSphericalFieldObject = ({
  id,
  projectWidth,
  projectHeight,
  startTime,
  layer,
}: BuildAviUtlSphericalFieldObjectInput): SphericalFieldObject => {
  const size = Math.max(240, Math.round(Math.min(projectWidth, projectHeight) * 0.4444));
  const x = Math.round((projectWidth - size) / 2);
  const y = Math.round((projectHeight - size) / 2);

  return {
    id,
    type: 'spherical_field',
    name: '93 SphericalField',
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
    radius: 160,
    strength: 100,
    colourAmount: 100,
    alphaAmount: 0,
    lineWidth: 3,
    ringCount: 4,
    vectorCount: 16,
    fieldColour: '#ff3b30',
    secondaryColour: '#36c2ff',
    backgroundOpacity: 0.08,
    container: false,
    seed: 93,
  };
};
