import { describe, expect, it } from 'vitest';
import { buildAviUtlAudioSphereObject } from './audioSphereObjectFactory';

describe('audioSphereObjectFactory', () => {
  it('builds a 93 audio sphere object for timeline insertion', () => {
    const object = buildAviUtlAudioSphereObject({
      id: 'audio-sphere-1',
      projectWidth: 1920,
      projectHeight: 1080,
      startTime: 2,
      layer: 30,
    });

    expect(object).toMatchObject({
      id: 'audio-sphere-1',
      type: 'audio_sphere',
      name: '93 音声玉',
      layer: 30,
      startTime: 2,
      duration: 5,
      x: 720,
      y: 300,
      width: 480,
      height: 480,
      columns: 16,
      rows: 12,
      baseRadius: 170,
      audioInfluence: 0.6,
      pointSize: 5,
      polygonSize: 0.35,
      randomAmount: 0.05,
      colour: '#36c2ff',
      targetAudioId: null,
      targetLayer: 29,
      sampleWindowSeconds: 0.1,
      seed: 93,
    });
  });
});
