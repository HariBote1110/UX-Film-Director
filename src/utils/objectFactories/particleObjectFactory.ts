import type { ParticleObject } from '../../types';

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

export const buildAviUtlAuraEmissionObject = ({
  id,
  projectWidth,
  projectHeight,
  startTime,
  layer,
}: BuildDefaultStandardParticleObjectInput): ParticleObject => {
  const size = Math.max(160, Math.round((Math.min(projectWidth, projectHeight) * 0.45) / 16) * 16);
  const x = Math.round((projectWidth - size) / 2);
  const y = Math.round((projectHeight - size) / 2);

  return {
    id,
    type: 'particle',
    name: 'オーラ放出',
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
    particleCount: 160,
    seed: 417,
    spread: 220,
    speed: 52,
    size: 9,
    colour: '#80d8ff',
    lifetimeSeconds: 2.8,
  };
};

export const buildAviUtlBubbleObject = ({
  id,
  projectWidth,
  projectHeight,
  startTime,
  layer,
}: BuildDefaultStandardParticleObjectInput): ParticleObject => {
  const width = Math.max(240, Math.round(projectWidth * 0.4));
  const height = Math.max(160, Math.round(projectHeight * 0.4));
  const x = Math.round((projectWidth - width) / 2);
  const y = Math.round((projectHeight - height) / 2);

  return {
    id,
    type: 'particle',
    name: '泡',
    layer,
    startTime,
    duration: 6,
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
    particleCount: 72,
    seed: 731,
    spread: 140,
    speed: 34,
    size: 12,
    colour: '#b8f3ff',
    lifetimeSeconds: 3.4,
  };
};

export const buildAviUtlFocusLinesObject = ({
  id,
  projectWidth,
  projectHeight,
  startTime,
  layer,
}: BuildDefaultStandardParticleObjectInput): ParticleObject => {
  return {
    id,
    type: 'particle',
    name: '集中線T',
    layer,
    startTime,
    duration: 3,
    x: 0,
    y: 0,
    width: projectWidth,
    height: projectHeight,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    opacity: 1,
    enableAnimation: false,
    endX: 0,
    endY: 0,
    easing: 'linear',
    particleCount: 180,
    seed: 1201,
    spread: 360,
    speed: 180,
    size: 3,
    colour: '#ffffff',
    lifetimeSeconds: 0.85,
  };
};

export const buildAviUtlInkSplashObject = ({
  id,
  projectWidth,
  projectHeight,
  startTime,
  layer,
}: BuildDefaultStandardParticleObjectInput): ParticleObject => {
  const size = Math.max(220, Math.round(Math.min(projectWidth, projectHeight) * 0.378));
  const x = Math.round((projectWidth - size) / 2);
  const y = Math.round((projectHeight - size) / 2);

  return {
    id,
    type: 'particle',
    name: 'インクTM',
    layer,
    startTime,
    duration: 4,
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
    particleCount: 88,
    seed: 3000,
    spread: 360,
    speed: 38,
    size: 18,
    colour: '#111111',
    lifetimeSeconds: 3.2,
  };
};
