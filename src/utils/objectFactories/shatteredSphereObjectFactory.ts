import type { ShatteredSphereObject } from '../../types';

export interface BuildAviUtlShatteredSphereObjectInput {
  id: string;
  projectWidth: number;
  projectHeight: number;
  startTime: number;
  layer: number;
}

export const buildAviUtlShatteredSphereObject = ({
  id,
  projectWidth,
  projectHeight,
  startTime,
  layer,
}: BuildAviUtlShatteredSphereObjectInput): ShatteredSphereObject => {
  const width = 360;
  const height = 360;
  const x = Math.round((projectWidth - width) / 2);
  const y = Math.round((projectHeight - height) / 2);

  return {
    id,
    type: 'shattered_sphere',
    name: '93 砕け散る球',
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
    fractureAmount: 100,
    delay: 100,
    radius: 160,
    limitDistance: 150,
    thickness: 20,
    fragmentSize: 40,
    randomShape: 100,
    speed: 100,
    impact: 100,
    gravityX: 0,
    gravityY: 100,
    gravityZ: 0,
    spin: 100,
    directionDiffusion: 100,
    colour: '#ffffff',
    seed: 93,
  };
};
