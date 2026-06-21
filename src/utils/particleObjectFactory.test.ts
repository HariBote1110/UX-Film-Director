import { describe, expect, it } from 'vitest';
import { buildDefaultStandardParticleObject } from './particleObjectFactory';

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
});
