import type { PlainEffectorLineObject } from '../../types';

export interface BuildAviUtlPlainEffectorLineObjectInput {
  id: string;
  projectWidth: number;
  projectHeight: number;
  startTime: number;
  layer: number;
}

export const buildAviUtlPlainEffectorLineObject = ({
  id,
  projectWidth,
  projectHeight,
  startTime,
  layer,
}: BuildAviUtlPlainEffectorLineObjectInput): PlainEffectorLineObject => {
  const width = 800;
  const height = 450;
  const x = Math.round((projectWidth - width) / 2);
  const y = Math.round((projectHeight - height) / 2);

  return {
    id,
    type: 'plain_effector_line',
    name: '93 PlainEffector Line',
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
    radius: 100,
    strength: 1,
    randomness: 0,
    zoom: 1,
    invert: false,
    lineCount: 24,
    lineWidth: 2,
    colour: '#f74d52',
    colourAmount: 1,
    seed: 93,
  };
};
