import type { ParticleObject } from '../types';

export interface BuildDefaultStandardParticleObjectInput {
  id: string;
  projectWidth: number;
  projectHeight: number;
  startTime: number;
  layer: number;
}

export const buildDefaultStandardParticleObject = ({
  id,
  projectWidth,
  projectHeight,
  startTime,
  layer,
}: BuildDefaultStandardParticleObjectInput): ParticleObject => {
  const width = Math.max(120, Math.round(projectWidth / 3));
  const height = Math.max(90, Math.round(projectHeight / 3));
  const x = Math.round((projectWidth - width) / 2);
  const y = Math.round((projectHeight - height) / 2);

  return {
    id,
    type: 'particle',
    name: '標準パーティクル',
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
    particleCount: 96,
    seed: 93,
    spread: 160,
    speed: 90,
    size: 4,
    colour: '#ffffff',
    lifetimeSeconds: 2,
  };
};
