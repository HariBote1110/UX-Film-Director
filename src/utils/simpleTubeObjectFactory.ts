import type { SimpleTubeObject } from '../types';

export interface BuildAviUtlSimpleTubeObjectInput {
  id: string;
  projectWidth: number;
  projectHeight: number;
  startTime: number;
  layer: number;
}

export const buildAviUtlSimpleTubeObject = ({
  id,
  projectWidth,
  projectHeight,
  startTime,
  layer,
}: BuildAviUtlSimpleTubeObjectInput): SimpleTubeObject => {
  const width = Math.max(320, Math.round(projectWidth * 0.4167));
  const height = Math.max(180, Math.round(projectHeight * 0.4167));
  const x = Math.round((projectWidth - width) / 2);
  const y = Math.round((projectHeight - height) / 2);

  return {
    id,
    type: 'simple_tube',
    name: '93 SimpleTube',
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
    radius: 150,
    depth: 280,
    segments: 16,
    rings: 10,
    twistDegrees: 0,
    randomAmount: 0,
    strokeWidth: 3,
    colour: '#0e769f',
    secondaryColour: '#ffffff',
    seed: 93,
    torus: false,
  };
};
