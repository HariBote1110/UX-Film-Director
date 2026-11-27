import type { TriangleBracketObject } from '../../types';

export interface BuildAviUtlTriangleBracketObjectInput {
  id: string;
  projectWidth: number;
  projectHeight: number;
  startTime: number;
  layer: number;
}

export const buildAviUtlTriangleBracketObject = ({
  id,
  projectWidth,
  projectHeight,
  startTime,
  layer,
}: BuildAviUtlTriangleBracketObjectInput): TriangleBracketObject => {
  const width = 160;
  const height = 100;
  const x = Math.round((projectWidth - width) / 2);
  const y = Math.round((projectHeight - height) / 2);

  return {
    id,
    type: 'triangle_bracket',
    name: '三角括弧',
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
    bracketWidth: 100,
    angleDegrees: 120,
    armLength: 50,
    offsetDistance: 0,
    bracketColour: '#ffffff',
  };
};
