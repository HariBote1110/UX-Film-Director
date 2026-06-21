import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ParticleObject, ProjectSettings, PsdObject, ShapeObject } from '../types';
import { MAX_LAYERS } from '../components/timelineConstants';
import { createDefaultCamera, createDefaultLayers, createDefaultStageCamera3D } from './sceneState';
import { buildProjectFileData, parseProjectPayloadV2, restoreProjectObjects } from './projectFile';
import { parsePsdWithWasm } from './psdWasm';

vi.mock('./psdWasm', () => ({
  parsePsdWithWasm: vi.fn(),
}));

const mockedParsePsdWithWasm = vi.mocked(parsePsdWithWasm);

const projectSettings = (): ProjectSettings => ({
  width: 1920,
  height: 1080,
  fps: 30,
  sampleRate: 48000
});

const defaultStage = () => createDefaultStageCamera3D();

const minimalPsdWithWorldPlacement = (): PsdObject => ({
  id: 'psd-1',
  type: 'psd',
  name: 'Stand',
  layer: 0,
  startTime: 0,
  duration: 5,
  x: 0,
  y: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  enableAnimation: false,
  endX: 0,
  endY: 0,
  easing: 'linear',
  src: 'blob:mock',
  width: 256,
  height: 512,
  scale: 1,
  worldPlacement: {
    enabled: true,
    position: { x: -1, y: 0, z: 2 },
    rotationYDeg: 15,
    scale: 1.2,
    billboard: true
  }
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

const minimalParticle = (): ParticleObject => ({
  id: 'particle-1',
  type: 'particle',
  name: '標準パーティクル',
  layer: 2,
  startTime: 1,
  duration: 5,
  x: 640,
  y: 360,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  enableAnimation: false,
  endX: 640,
  endY: 360,
  easing: 'linear',
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
        camera: { ...camera, zoom: 1.25 },
        stageCamera3D: defaultStage()
      },
      {
        id: 'scene-b',
        name: 'B',
        duration: 8,
        layers: createDefaultLayers(),
        objects: [],
        camera,
        stageCamera3D: defaultStage()
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
      camera: { ...camera, zoom: 2 },
      stageCamera3D: defaultStage()
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
        camera,
        stageCamera3D: defaultStage()
      }
    ];
    const file = buildProjectFileData({
      projectSettings: projectSettings(),
      scenes,
      activeSceneId: 'only',
      objects: [],
      layers,
      duration: 10,
      camera,
      stageCamera3D: defaultStage()
    });
    expect(file.scenes[0].layers).not.toBe(layers);
    expect(file.scenes[0].layers).toHaveLength(MAX_LAYERS);
    expect(file.scenes[0].camera).not.toBe(camera);
  });
});

describe('parseProjectPayloadV2', () => {
  beforeEach(() => {
    mockedParsePsdWithWasm.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('round-trips PSD worldPlacement through JSON payload', () => {
    const layers = createDefaultLayers();
    const camera = createDefaultCamera();
    const psd = minimalPsdWithWorldPlacement();
    const file = buildProjectFileData({
      projectSettings: { ...projectSettings(), editorMode: '3d_stage' },
      scenes: [
        {
          id: 's1',
          name: 'One',
          duration: 10,
          layers,
          objects: [psd],
          camera,
          stageCamera3D: {
            position: { x: 0, y: 3, z: 8 },
            target: { x: 0, y: 1, z: 0 }
          }
        }
      ],
      activeSceneId: 's1',
      objects: [psd],
      layers,
      duration: 10,
      camera,
      stageCamera3D: defaultStage()
    });

    const wire = JSON.parse(JSON.stringify(file)) as unknown;
    const parsed = parseProjectPayloadV2(wire);
    const obj = parsed.scenes[0].objects[0];
    expect(obj.type).toBe('psd');
    if (obj.type !== 'psd') throw new Error('expected psd');
    expect(obj.worldPlacement?.enabled).toBe(true);
    expect(obj.worldPlacement?.position).toEqual({ x: -1, y: 0, z: 2 });
    expect(obj.worldPlacement?.billboard).toBe(true);
    expect(parsed.projectSettings.editorMode).toBe('3d_stage');
  });

  it('round-trips standard particle objects through JSON payload', () => {
    const layers = createDefaultLayers();
    const camera = createDefaultCamera();
    const particle = minimalParticle();
    const file = buildProjectFileData({
      projectSettings: projectSettings(),
      scenes: [
        {
          id: 's1',
          name: 'One',
          duration: 10,
          layers,
          objects: [particle],
          camera,
          stageCamera3D: defaultStage()
        }
      ],
      activeSceneId: 's1',
      objects: [particle],
      layers,
      duration: 10,
      camera,
      stageCamera3D: defaultStage()
    });

    const parsed = parseProjectPayloadV2(JSON.parse(JSON.stringify(file)));
    expect(parsed.scenes[0].objects).toEqual([particle]);
  });

  it('rejects invalid worldPlacement on psd objects', () => {
    const bad = {
      format: 'uxfd-project',
      version: 2,
      savedAt: new Date().toISOString(),
      projectSettings: projectSettings(),
      activeSceneId: 's1',
      scenes: [
        {
          id: 's1',
          name: 'One',
          duration: 10,
          layers: createDefaultLayers(),
          camera: createDefaultCamera(),
          stageCamera3D: defaultStage(),
          objects: [
            {
              ...minimalPsdWithWorldPlacement(),
              worldPlacement: { enabled: 'yes' }
            }
          ]
        }
      ]
    };
    expect(() => parseProjectPayloadV2(bad)).toThrow();
  });

  it('maps saved PSD active layer state from legacy ids onto restored stable ids', async () => {
    mockedParsePsdWithWasm.mockResolvedValue({
      meta: {
        width: 64,
        height: 48,
        depth: 8,
        isPsb: false,
        layers: [{
          name: 'Character',
          top: 0,
          left: 0,
          width: 64,
          height: 48,
          visible: true,
          isGroup: true,
          ownGroupId: 42,
          parentGroupId: null,
          pixelByteLen: 0,
        }, {
          name: 'Face',
          top: 4,
          left: 8,
          width: 16,
          height: 16,
          visible: true,
          isGroup: false,
          ownGroupId: null,
          parentGroupId: 42,
          pixelByteLen: 0,
        }],
      },
      pixels: [new Uint8Array(0), new Uint8Array(0)],
    });
    const readFileBytes = vi.fn().mockResolvedValue({
      success: true,
      data: new ArrayBuffer(8),
    });
    vi.stubGlobal('window', {
      ipcRenderer: {
        invoke: readFileBytes,
      },
    });
    const psd: PsdObject = {
      ...minimalPsdWithWorldPlacement(),
      filePath: '/tmp/character.psd',
      rootLayer: {
        id: 'root',
        name: 'Root',
        isGroup: true,
        isRadio: false,
        children: [{
          id: 'legacy-character-id',
          name: 'Character',
          isGroup: true,
          isRadio: false,
          children: [{
            id: 'legacy-face-id',
            name: 'Face',
            isGroup: false,
            isRadio: false,
            children: [],
            width: 16,
            height: 16,
            left: 8,
            top: 4,
            defaultVisible: true,
          }],
          width: 64,
          height: 48,
          left: 0,
          top: 0,
          defaultVisible: true,
        }],
        width: 64,
        height: 48,
        left: 0,
        top: 0,
        defaultVisible: true,
      },
      activeLayerIds: {
        root: true,
        'legacy-character-id': true,
        'legacy-face-id': false,
      },
    };

    const [restored] = await restoreProjectObjects([psd], projectSettings());

    expect(readFileBytes).toHaveBeenCalledWith('read-file-bytes', {
      filePath: '/tmp/character.psd',
    });
    expect(restored.type).toBe('psd');
    if (restored.type !== 'psd') throw new Error('expected psd');
    expect(restored.rootLayer?.children[0].id).toBe('psd-group-42');
    expect(restored.rootLayer?.children[0].children[0].id).toBe('psd-layer-1');
    expect(restored.activeLayerIds).toMatchObject({
      root: true,
      'psd-group-42': true,
      'psd-layer-1': false,
    });
    expect(restored.layerTree?.[0].children[0].checked).toBe(false);
  });
});
