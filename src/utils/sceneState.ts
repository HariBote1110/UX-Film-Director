import { MAX_LAYERS } from '../components/timelineConstants';
import { CameraState, LayerState, SceneData, StageCamera3D, TimelineObject, Vec3 } from '../types';

const defaultVec3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

export const createDefaultStageCamera3D = (): StageCamera3D => ({
  position: defaultVec3(0, 1.6, 6),
  target: defaultVec3(0, 1, 0)
});

export const sanitiseVec3 = (value: Vec3 | undefined, fallback: Vec3): Vec3 => {
  if (!value || typeof value !== 'object') return { ...fallback };
  return {
    x: Number.isFinite(value.x) ? value.x : fallback.x,
    y: Number.isFinite(value.y) ? value.y : fallback.y,
    z: Number.isFinite(value.z) ? value.z : fallback.z
  };
};

export const sanitiseStageCamera3D = (camera: StageCamera3D | undefined): StageCamera3D => {
  const fallback = createDefaultStageCamera3D();
  if (!camera || typeof camera !== 'object') return fallback;
  return {
    position: sanitiseVec3(camera.position, fallback.position),
    target: sanitiseVec3(camera.target, fallback.target)
  };
};

export const createDefaultCamera = (): CameraState => ({
  centreOffsetX: 0,
  centreOffsetY: 0,
  zoom: 1,
  rotationDeg: 0
});

export const sanitiseCamera = (camera: CameraState | undefined): CameraState => {
  const fallback = createDefaultCamera();
  if (!camera || typeof camera !== 'object') return fallback;
  return {
    centreOffsetX: Number.isFinite(camera.centreOffsetX) ? camera.centreOffsetX : 0,
    centreOffsetY: Number.isFinite(camera.centreOffsetY) ? camera.centreOffsetY : 0,
    zoom: Math.max(0.05, Math.min(20, Number.isFinite(camera.zoom) ? camera.zoom : 1)),
    rotationDeg: Number.isFinite(camera.rotationDeg) ? camera.rotationDeg : 0
  };
};

export const createDefaultLayerRow = (index: number): LayerState => ({
  name: `Layer ${index + 1}`,
  visible: true,
  locked: false
});

export const createDefaultLayers = (): LayerState[] =>
  Array.from({ length: MAX_LAYERS }, (_, index) => createDefaultLayerRow(index));

export const flushActiveIntoScenes = (
  scenes: SceneData[],
  activeSceneId: string,
  objects: TimelineObject[],
  layers: LayerState[],
  duration: number,
  camera: CameraState,
  stageCamera3D: StageCamera3D
): SceneData[] => {
  return scenes.map((scene) => {
    if (scene.id !== activeSceneId) return scene;
    return {
      ...scene,
      objects,
      layers: layers.map((layer) => ({ ...layer })),
      duration,
      camera: { ...camera },
      stageCamera3D: sanitiseStageCamera3D(stageCamera3D)
    };
  });
};
