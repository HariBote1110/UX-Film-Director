import { describe, expect, it } from 'vitest';
import { createDefaultCamera, createDefaultLayers, flushActiveIntoScenes } from './sceneState';

describe('flushActiveIntoScenes', () => {
  it('writes live editor state into the active scene only', () => {
    const camA = createDefaultCamera();
    const camB = createDefaultCamera();
    camB.zoom = 1.5;
    const scenes = [
      {
        id: 'a',
        name: 'A',
        duration: 10,
        layers: createDefaultLayers(),
        objects: [],
        camera: camA
      },
      {
        id: 'b',
        name: 'B',
        duration: 20,
        layers: createDefaultLayers(),
        objects: [],
        camera: camB
      }
    ];
    const liveLayers = createDefaultLayers();
    liveLayers[0] = { ...liveLayers[0], name: 'Edited' };
    const next = flushActiveIntoScenes(scenes, 'a', [], liveLayers, 99, { ...createDefaultCamera(), zoom: 2 });
    expect(next[0].duration).toBe(99);
    expect(next[0].layers[0].name).toBe('Edited');
    expect(next[0].camera.zoom).toBe(2);
    expect(next[1].duration).toBe(20);
    expect(next[1].camera.zoom).toBe(1.5);
  });
});
