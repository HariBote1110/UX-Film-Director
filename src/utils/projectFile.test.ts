import { describe, expect, it } from 'vitest';
import type { ProjectSettings, ShapeObject } from '../types';
import { MAX_LAYERS } from '../components/timelineConstants';
import { createDefaultCamera, createDefaultLayers } from './sceneState';
import { buildProjectFileData } from './projectFile';

const projectSettings = (): ProjectSettings => ({
  width: 1920,
  height: 1080,
  fps: 30,
  sampleRate: 48000
});

const minimalShape = (): ShapeObject => ({
  id: 'obj-1',
  type: 'shape',
  name: 'Box',
  layer: 0,
  startTime: 0,
  duration: 5,
  x: 10,
  y: 20,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  enableAnimation: false,
  endX: 10,
  endY: 20,
  easing: 'linear',
  shapeType: 'rect',
  width: 4,
  height: 4,
  fill: '#111111'
});

describe('buildProjectFileData', () => {
  it('flushes active editor state into the matching scene and stamps metadata', () => {
    const layers = createDefaultLayers();
    const camera = createDefaultCamera();
    const scenes = [
      {
        id: 'scene-a',
        name: 'A',
        duration: 12,
        layers,
        objects: [] as ShapeObject[],
        camera: { ...camera, zoom: 1.25 }
      },
      {
        id: 'scene-b',
        name: 'B',
        duration: 8,
        layers: createDefaultLayers(),
        objects: [],
        camera
      }
    ];
    const liveLayers = createDefaultLayers();
    liveLayers[0] = { ...liveLayers[0], name: 'Live edit' };
    const shape = minimalShape();
    const file = buildProjectFileData({
      projectSettings: projectSettings(),
      scenes,
      activeSceneId: 'scene-a',
      objects: [shape],
      layers: liveLayers,
      duration: 99,
      camera: { ...camera, zoom: 2 }
    });

    expect(file.format).toBe('uxfd-project');
    expect(file.version).toBe(2);
    expect(file.activeSceneId).toBe('scene-a');
    expect(file.scenes).toHaveLength(2);

    const active = file.scenes.find((s) => s.id === 'scene-a');
    const inactive = file.scenes.find((s) => s.id === 'scene-b');
    expect(active?.duration).toBe(99);
    expect(active?.camera.zoom).toBe(2);
    expect(active?.layers[0].name).toBe('Live edit');
    expect(active?.objects).toHaveLength(1);
    expect(active?.objects[0].id).toBe('obj-1');

    expect(inactive?.duration).toBe(8);
    expect(inactive?.camera.zoom).toBe(1);
  });

  it('clones layer rows and camera so mutations do not alias', () => {
    const layers = createDefaultLayers();
    const camera = createDefaultCamera();
    const scenes = [
      {
        id: 'only',
        name: 'Only',
        duration: 10,
        layers,
        objects: [] as ShapeObject[],
        camera
      }
    ];
    const file = buildProjectFileData({
      projectSettings: projectSettings(),
      scenes,
      activeSceneId: 'only',
      objects: [],
      layers,
      duration: 10,
      camera
    });
    expect(file.scenes[0].layers).not.toBe(layers);
    expect(file.scenes[0].layers).toHaveLength(MAX_LAYERS);
    expect(file.scenes[0].camera).not.toBe(camera);
  });
});
