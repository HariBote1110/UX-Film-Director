import { describe, expect, it } from 'vitest';
import { MAX_LAYERS } from '../components/timelineConstants';
import {
  createDefaultCamera,
  createDefaultLayers,
  createDefaultLayerRow,
  createDefaultStageCamera3D,
  flushActiveIntoScenes,
  sanitiseCamera
} from './sceneState';

describe('createDefaultLayers', () => {
  it('creates one row per MAX_LAYERS slot', () => {
    const layers = createDefaultLayers();
    expect(layers).toHaveLength(MAX_LAYERS);
    expect(layers[0].visible).toBe(true);
  });
});

describe('createDefaultLayerRow', () => {
  it('names rows with a human-readable index', () => {
    expect(createDefaultLayerRow(0).name).toContain('1');
    expect(createDefaultLayerRow(4).name).toContain('5');
  });
});

describe('sanitiseCamera', () => {
  it('returns defaults for invalid input', () => {
    expect(sanitiseCamera(undefined).zoom).toBe(1);
    expect(sanitiseCamera({} as never).zoom).toBe(1);
  });

  it('clamps zoom into supported range', () => {
    expect(sanitiseCamera({ ...createDefaultCamera(), zoom: 0.001 }).zoom).toBe(0.05);
    expect(sanitiseCamera({ ...createDefaultCamera(), zoom: 100 }).zoom).toBe(20);
  });
});

describe('flushActiveIntoScenes', () => {
  it('writes live editor state into the active scene only', () => {
    const camA = createDefaultCamera();
    const camB = createDefaultCamera();
    camB.zoom = 1.5;
    const stageA = createDefaultStageCamera3D();
    const stageB = createDefaultStageCamera3D();
    const scenes = [
      {
        id: 'a',
        name: 'A',
        duration: 10,
        layers: createDefaultLayers(),
        objects: [],
        camera: camA,
        stageCamera3D: stageA
      },
      {
        id: 'b',
        name: 'B',
        duration: 20,
        layers: createDefaultLayers(),
        objects: [],
        camera: camB,
        stageCamera3D: stageB
      }
    ];
    const liveLayers = createDefaultLayers();
    liveLayers[0] = { ...liveLayers[0], name: 'Edited' };
    const liveStage = createDefaultStageCamera3D();
    const next = flushActiveIntoScenes(
      scenes,
      'a',
      [],
      liveLayers,
      99,
      { ...createDefaultCamera(), zoom: 2 },
      { ...liveStage, position: { x: 0, y: 2, z: 10 } }
    );
    expect(next[0].duration).toBe(99);
    expect(next[0].layers[0].name).toBe('Edited');
    expect(next[0].camera.zoom).toBe(2);
    expect(next[1].duration).toBe(20);
    expect(next[1].camera.zoom).toBe(1.5);
    expect(next[0].stageCamera3D.position.z).toBe(10);
    expect(next[1].stageCamera3D.position.z).toBe(stageB.position.z);
  });
});
