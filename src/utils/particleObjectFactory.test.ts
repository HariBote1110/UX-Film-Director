import { describe, expect, it } from 'vitest';
import {
  buildAviUtlAuraEmissionObject,
  buildDefaultStandardParticleObject,
} from './particleObjectFactory';

describe('particleObjectFactory', () => {
  it('builds a centred AviUtlPackV4 standard particle object for timeline insertion', () => {
    const object = buildDefaultStandardParticleObject({
      id: 'particle-1',
      projectWidth: 1920,
      projectHeight: 1080,
      startTime: 2.5,
      layer: 4,
    });

    expect(object).toMatchObject({
      id: 'particle-1',
      type: 'particle',
      name: '標準パーティクル',
      layer: 4,
      startTime: 2.5,
      duration: 5,
      x: 640,
      y: 360,
      width: 640,
      height: 360,
      particleCount: 96,
      seed: 93,
      spread: 160,
      speed: 90,
      size: 4,
      colour: '#ffffff',
      lifetimeSeconds: 2,
    });
  });

  it('builds a warm AviUtlPackV4 aura emission particle object for timeline insertion', () => {
    const object = buildAviUtlAuraEmissionObject({
      id: 'aura-1',
      projectWidth: 1920,
      projectHeight: 1080,
      startTime: 3,
      layer: 7,
    });

    expect(object).toMatchObject({
      id: 'aura-1',
      type: 'particle',
      name: 'オーラ放出',
      layer: 7,
      startTime: 3,
      duration: 5,
      x: 720,
      y: 300,
      width: 480,
      height: 480,
      particleCount: 160,
      seed: 417,
      spread: 220,
      speed: 52,
      size: 9,
      colour: '#80d8ff',
      lifetimeSeconds: 2.8,
    });
  });
});
