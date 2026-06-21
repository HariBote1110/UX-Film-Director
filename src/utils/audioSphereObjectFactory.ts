import type { AudioSphereObject } from '../types';

export interface BuildAviUtlAudioSphereObjectInput {
  id: string;
  projectWidth: number;
  projectHeight: number;
  startTime: number;
  layer: number;
}

export const buildAviUtlAudioSphereObject = ({
  id,
  projectWidth,
  projectHeight,
  startTime,
  layer,
}: BuildAviUtlAudioSphereObjectInput): AudioSphereObject => {
  const size = Math.max(240, Math.round(Math.min(projectWidth, projectHeight) * 0.4444));
  const x = Math.round((projectWidth - size) / 2);
  const y = Math.round((projectHeight - size) / 2);

  return {
    id,
    type: 'audio_sphere',
    name: '93 音声玉',
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
    columns: 16,
    rows: 12,
    baseRadius: 170,
    audioInfluence: 0.6,
    pointSize: 5,
    polygonSize: 0.35,
    randomAmount: 0.05,
    colour: '#36c2ff',
    targetAudioId: null,
    targetLayer: layer - 1 >= 0 ? layer - 1 : -1,
    sampleWindowSeconds: 0.1,
    seed: 93,
  };
};
