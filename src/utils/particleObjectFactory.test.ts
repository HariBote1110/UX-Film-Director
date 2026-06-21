import { describe, expect, it } from 'vitest';
import {
  buildAviUtlAuraEmissionObject,
  buildAviUtlBubbleObject,
  buildAviUtlFocusLinesObject,
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

  it('builds an AviUtlPackV4 bubble particle object for timeline insertion', () => {
    const object = buildAviUtlBubbleObject({
      id: 'bubble-1',
      projectWidth: 1920,
      projectHeight: 1080,
      startTime: 1.25,
      layer: 6,
    });

    expect(object).toMatchObject({
      id: 'bubble-1',
      type: 'particle',
      name: '泡',
      layer: 6,
      startTime: 1.25,
      duration: 6,
      x: 576,
      y: 324,
      width: 768,
      height: 432,
      particleCount: 72,
      seed: 731,
      spread: 140,
      speed: 34,
      size: 12,
      colour: '#b8f3ff',
      lifetimeSeconds: 3.4,
    });
  });

  it('builds an AviUtlPackV4 focus lines particle object for timeline insertion', () => {
    const object = buildAviUtlFocusLinesObject({
      id: 'focus-1',
      projectWidth: 1920,
      projectHeight: 1080,
      startTime: 0.5,
      layer: 8,
    });

    expect(object).toMatchObject({
      id: 'focus-1',
      type: 'particle',
      name: '集中線T',
      layer: 8,
      startTime: 0.5,
      duration: 3,
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
      particleCount: 180,
      seed: 1201,
      spread: 360,
      speed: 180,
      size: 3,
      colour: '#ffffff',
      lifetimeSeconds: 0.85,
    });
  });
});
