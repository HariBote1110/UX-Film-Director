import { MAX_LAYERS } from '../components/timelineConstants';
import { CameraState, LayerState, SceneData, TimelineObject } from '../types';

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
  camera: CameraState
): SceneData[] => {
  return scenes.map((scene) => {
    if (scene.id !== activeSceneId) return scene;
    return {
      ...scene,
      objects,
      layers: layers.map((layer) => ({ ...layer })),
      duration,
      camera: { ...camera }
    };
  });
};
