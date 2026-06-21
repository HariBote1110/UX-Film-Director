import { ProjectSettings, TimelineObject, PsdObject, PsdLayerNode, LayerState, SceneData, CameraState } from '../types';
import { buildPsdLayerTree, parsePsdArrayBufferAsObject, stripPsdLayerNodeForPersistence } from './psdParser';
import { toFileProtocolUrl } from './mediaMetadata';
import {
  createDefaultCamera,
  createDefaultLayers,
  createDefaultStageCamera3D,
  flushActiveIntoScenes,
  sanitiseStageCamera3D
} from './sceneState';

const PROJECT_FILE_FORMAT = 'uxfd-project';
const PROJECT_FILE_VERSION_V1 = 1;
const PROJECT_FILE_VERSION_V2 = 2;
const LEGACY_SCENE_ID = 'legacy-scene-1';

type ProjectFileV1 = {
  format: typeof PROJECT_FILE_FORMAT;
  version: typeof PROJECT_FILE_VERSION_V1;
  savedAt: string;
  projectSettings: ProjectSettings;
  duration: number;
  layers?: LayerState[];
  objects: TimelineObject[];
};

export type ProjectFileV2 = {
  format: typeof PROJECT_FILE_FORMAT;
  version: typeof PROJECT_FILE_VERSION_V2;
  savedAt: string;
  projectSettings: ProjectSettings;
  activeSceneId: string;
  scenes: SceneData[];
};

type SaveProjectResponse =
  | { success: true; filePath: string }
  | { success: false; cancelled?: boolean; error?: string };

type OpenProjectResponse =
  | { success: true; filePath: string; data: string }
  | { success: false; cancelled?: boolean; error?: string };

type ReadFileBytesResponse =
  | { success: true; data: unknown }
  | { success: false; error?: string };

const isProjectSettings = (value: unknown): value is ProjectSettings => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.width !== 'number' ||
    !Number.isFinite(candidate.width) ||
    typeof candidate.height !== 'number' ||
    !Number.isFinite(candidate.height) ||
    typeof candidate.fps !== 'number' ||
    !Number.isFinite(candidate.fps) ||
    typeof candidate.sampleRate !== 'number' ||
    !Number.isFinite(candidate.sampleRate)
  ) {
    return false;
  }
  if (candidate.editorMode !== undefined && candidate.editorMode !== '2d' && candidate.editorMode !== '3d_stage') {
    return false;
  }
  return true;
};

const isLayerState = (value: unknown): value is LayerState => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.name === 'string' &&
    typeof candidate.visible === 'boolean' &&
    typeof candidate.locked === 'boolean'
  );
};

const isFiniteNumber = (value: unknown): value is number => {
  return typeof value === 'number' && Number.isFinite(value);
};

const TIMELINE_OBJECT_TYPES = new Set([
  'text',
  'shape',
  'image',
  'video',
  'audio',
  'psd',
  'group_control',
  'audio_visualization',
  'particle',
  'barcode',
  'puzzle_piece',
  'colour_wheel'
]);

const isVec3 = (value: unknown): boolean => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return isFiniteNumber(candidate.x) && isFiniteNumber(candidate.y) && isFiniteNumber(candidate.z);
};

const isStageCamera3D = (value: unknown): boolean => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return isVec3(candidate.position) && isVec3(candidate.target);
};

const isPsdWorldPlacement = (value: unknown): boolean => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.enabled === 'boolean'
    && isVec3(candidate.position)
    && isFiniteNumber(candidate.rotationYDeg)
    && isFiniteNumber(candidate.scale)
    && typeof candidate.billboard === 'boolean'
  );
};

const isPositionKeyframe = (value: unknown): boolean => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    isFiniteNumber(candidate.time) &&
    isFiniteNumber(candidate.x) &&
    isFiniteNumber(candidate.y) &&
    (candidate.easing === undefined || typeof candidate.easing === 'string')
  );
};

const isTimelineObject = (value: unknown): value is TimelineObject => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.id !== 'string' || candidate.id.trim() === '') return false;
  if (typeof candidate.name !== 'string') return false;
  if (typeof candidate.type !== 'string' || !TIMELINE_OBJECT_TYPES.has(candidate.type)) return false;
  if (!isFiniteNumber(candidate.layer)) return false;
  if (!isFiniteNumber(candidate.startTime)) return false;
  if (!isFiniteNumber(candidate.duration)) return false;
  if (!isFiniteNumber(candidate.x) || !isFiniteNumber(candidate.y)) return false;
  if (!isFiniteNumber(candidate.endX) || !isFiniteNumber(candidate.endY)) return false;
  if (!isFiniteNumber(candidate.rotation)) return false;
  if (!isFiniteNumber(candidate.scaleX) || !isFiniteNumber(candidate.scaleY)) return false;
  if (!isFiniteNumber(candidate.opacity)) return false;
  if (typeof candidate.enableAnimation !== 'boolean') return false;
  if (typeof candidate.easing !== 'string') return false;
  if (candidate.keyframes !== undefined) {
    if (!Array.isArray(candidate.keyframes)) return false;
    if (!candidate.keyframes.every((keyframe) => isPositionKeyframe(keyframe))) return false;
  }
  if (candidate.type === 'psd') {
    const wp = candidate.worldPlacement;
    if (wp !== undefined && !isPsdWorldPlacement(wp)) return false;
  }
  if (candidate.type === 'particle') {
    if (!isFiniteNumber(candidate.width) || candidate.width <= 0) return false;
    if (!isFiniteNumber(candidate.height) || candidate.height <= 0) return false;
    if (typeof candidate.particleCount !== 'number' || !Number.isInteger(candidate.particleCount) || candidate.particleCount <= 0) return false;
    if (typeof candidate.seed !== 'number' || !Number.isInteger(candidate.seed)) return false;
    if (!isFiniteNumber(candidate.spread) || candidate.spread < 0) return false;
    if (!isFiniteNumber(candidate.speed) || candidate.speed < 0) return false;
    if (!isFiniteNumber(candidate.size) || candidate.size <= 0) return false;
    if (typeof candidate.colour !== 'string' || !/^#[0-9a-f]{6}$/i.test(candidate.colour)) return false;
    if (!isFiniteNumber(candidate.lifetimeSeconds) || candidate.lifetimeSeconds <= 0) return false;
  }
  if (candidate.type === 'barcode') {
    if (!isFiniteNumber(candidate.width) || candidate.width <= 0) return false;
    if (!isFiniteNumber(candidate.height) || candidate.height <= 0) return false;
    if (typeof candidate.data !== 'string') return false;
    if (!isFiniteNumber(candidate.minimumBarWidth) || candidate.minimumBarWidth <= 0) return false;
    if (!isFiniteNumber(candidate.horizontalMargin) || candidate.horizontalMargin < 0) return false;
    if (!isFiniteNumber(candidate.verticalMargin) || candidate.verticalMargin < 0) return false;
    if (typeof candidate.foregroundColour !== 'string' || !/^#[0-9a-f]{6}$/i.test(candidate.foregroundColour)) return false;
    if (typeof candidate.backgroundColour !== 'string' || !/^#[0-9a-f]{6}$/i.test(candidate.backgroundColour)) return false;
  }
  if (candidate.type === 'puzzle_piece') {
    if (!isFiniteNumber(candidate.width) || candidate.width <= 0) return false;
    if (!isFiniteNumber(candidate.height) || candidate.height <= 0) return false;
    if (!isFiniteNumber(candidate.size) || candidate.size <= 0) return false;
    if (typeof candidate.shapeVariant !== 'number' || !Number.isInteger(candidate.shapeVariant) || candidate.shapeVariant < 1 || candidate.shapeVariant > 22) return false;
    if (candidate.connectorMode !== 'convex' && candidate.connectorMode !== 'concave') return false;
    if (typeof candidate.fillColour !== 'string' || !/^#[0-9a-f]{6}$/i.test(candidate.fillColour)) return false;
  }
  if (candidate.type === 'colour_wheel') {
    if (!isFiniteNumber(candidate.width) || candidate.width <= 0) return false;
    if (!isFiniteNumber(candidate.height) || candidate.height <= 0) return false;
    if (!isFiniteNumber(candidate.radius) || candidate.radius <= 0) return false;
    if (!isFiniteNumber(candidate.saturation) || candidate.saturation < 0 || candidate.saturation > 100) return false;
    if (!isFiniteNumber(candidate.brightness) || candidate.brightness < 0 || candidate.brightness > 100) return false;
    if (!isFiniteNumber(candidate.ringWidthPercent) || candidate.ringWidthPercent <= 0 || candidate.ringWidthPercent > 100) return false;
    if (typeof candidate.segmentCount !== 'number' || !Number.isInteger(candidate.segmentCount) || candidate.segmentCount < 3 || candidate.segmentCount > 360) return false;
  }
  return true;
};

const parseLayers = (value: unknown): LayerState[] | undefined => {
  if (value == null) return undefined;
  if (!Array.isArray(value)) return undefined;
  if (!value.every((layer) => isLayerState(layer))) return undefined;
  return value.map((layer) => ({ ...layer }));
};

const isCameraState = (value: unknown): value is CameraState => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    isFiniteNumber(candidate.centreOffsetX)
    && isFiniteNumber(candidate.centreOffsetY)
    && isFiniteNumber(candidate.zoom)
    && isFiniteNumber(candidate.rotationDeg)
  );
};

const parseSceneEntry = (value: unknown): SceneData | null => {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.id !== 'string' || candidate.id.trim() === '') return null;
  if (typeof candidate.name !== 'string') return null;
  if (!isFiniteNumber(candidate.duration)) return null;
  const layers = parseLayers(candidate.layers) ?? createDefaultLayers();
  const objectCandidates = candidate.objects;
  if (!Array.isArray(objectCandidates)) return null;
  if (!objectCandidates.every((obj) => isTimelineObject(obj))) return null;
  const camera = isCameraState(candidate.camera) ? candidate.camera : createDefaultCamera();
  const stageCamera3D = isStageCamera3D(candidate.stageCamera3D)
    ? sanitiseStageCamera3D(candidate.stageCamera3D as SceneData['stageCamera3D'])
    : createDefaultStageCamera3D();
  return {
    id: candidate.id,
    name: candidate.name,
    duration: Math.max(1, candidate.duration as number),
    layers,
    objects: objectCandidates as TimelineObject[],
    camera,
    stageCamera3D
  };
};

const migrateV1ToV2 = (candidate: ProjectFileV1): ProjectFileV2 => {
  const layers = parseLayers(candidate.layers) ?? createDefaultLayers();
  return {
    format: PROJECT_FILE_FORMAT,
    version: PROJECT_FILE_VERSION_V2,
    savedAt: typeof candidate.savedAt === 'string' ? candidate.savedAt : new Date().toISOString(),
    projectSettings: candidate.projectSettings,
    activeSceneId: LEGACY_SCENE_ID,
    scenes: [{
      id: LEGACY_SCENE_ID,
      name: 'Scene 1',
      duration: typeof candidate.duration === 'number' && Number.isFinite(candidate.duration)
        ? Math.max(1, candidate.duration)
        : 30,
      layers,
      objects: candidate.objects,
      camera: createDefaultCamera(),
      stageCamera3D: createDefaultStageCamera3D()
    }]
  };
};

const sanitiseObjectForSave = (obj: TimelineObject): TimelineObject => {
  if (obj.type === 'psd') {
    const psd = obj as PsdObject;
    const snapshot: PsdObject = {
      ...psd,
      file: undefined,
      rootLayer: psd.rootLayer ? stripPsdLayerNodeForPersistence(psd.rootLayer) : psd.rootLayer,
    };
    return JSON.parse(JSON.stringify(snapshot)) as TimelineObject;
  }
  return JSON.parse(JSON.stringify(obj)) as TimelineObject;
};

const normaliseBinaryData = (value: unknown): ArrayBuffer | null => {
  if (value instanceof ArrayBuffer) {
    return value;
  }

  if (ArrayBuffer.isView(value)) {
    const view = value as ArrayBufferView;
    const copied = new Uint8Array(view.byteLength);
    copied.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
    return copied.buffer;
  }

  if (Array.isArray(value) && value.every((item) => typeof item === 'number')) {
    return new Uint8Array(value).buffer;
  }

  return null;
};

const extractFileName = (filePath: string): string => {
  const parts = filePath.split(/[\\/]/).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : 'unknown.psd';
};

const haveMatchingPsdLayerShape = (savedNode: PsdLayerNode, restoredNode: PsdLayerNode): boolean => (
  savedNode.name === restoredNode.name && savedNode.isGroup === restoredNode.isGroup
);

const mergeRestoredPsdActiveLayerIds = (
  restoredRoot: PsdLayerNode,
  restoredActiveLayerIds: Record<string, boolean>,
  savedRoot: PsdLayerNode | undefined,
  savedActiveLayerIds: Record<string, boolean>
): Record<string, boolean> => {
  const merged = { ...restoredActiveLayerIds };

  Object.entries(savedActiveLayerIds).forEach(([id, active]) => {
    if (Object.prototype.hasOwnProperty.call(merged, id)) {
      merged[id] = Boolean(active);
    }
  });

  const applySavedTreeState = (savedNode: PsdLayerNode, restoredNode: PsdLayerNode) => {
    if (!haveMatchingPsdLayerShape(savedNode, restoredNode)) return;
    if (Object.prototype.hasOwnProperty.call(savedActiveLayerIds, savedNode.id)) {
      merged[restoredNode.id] = Boolean(savedActiveLayerIds[savedNode.id]);
    }

    const childCount = Math.min(savedNode.children.length, restoredNode.children.length);
    for (let i = 0; i < childCount; i += 1) {
      applySavedTreeState(savedNode.children[i], restoredNode.children[i]);
    }
  };

  if (savedRoot) {
    applySavedTreeState(savedRoot, restoredRoot);
  }

  merged.root = true;
  return merged;
};

const readFileBytes = async (filePath: string): Promise<ArrayBuffer | null> => {
  try {
    const response = await window.ipcRenderer.invoke('read-file-bytes', { filePath }) as ReadFileBytesResponse;
    if (!response || response.success !== true) return null;
    return normaliseBinaryData(response.data);
  } catch {
    return null;
  }
};

const restorePsdObjectFromFile = async (
  savedObject: PsdObject,
  projectSettings: ProjectSettings
): Promise<PsdObject | null> => {
  const filePath = savedObject.filePath?.trim();
  if (!filePath) return null;

  const psdBuffer = await readFileBytes(filePath);
  if (!psdBuffer) return null;

  try {
    const parsed = await parsePsdArrayBufferAsObject(
      psdBuffer,
      extractFileName(filePath),
      savedObject.startTime,
      projectSettings.width,
      projectSettings.height
    );

    let nextActiveLayerIds = parsed.psdObject.activeLayerIds;
    let nextLayerTree = parsed.psdObject.layerTree;
    const savedActive = savedObject.activeLayerIds;
    if (parsed.psdObject.rootLayer && nextActiveLayerIds && savedActive) {
      nextActiveLayerIds = mergeRestoredPsdActiveLayerIds(
        parsed.psdObject.rootLayer,
        nextActiveLayerIds,
        savedObject.rootLayer,
        savedActive
      );
      nextLayerTree = buildPsdLayerTree(parsed.psdObject.rootLayer, nextActiveLayerIds);
    }

    return {
      ...parsed.psdObject,
      ...savedObject,
      src: parsed.psdObject.src,
      rootLayer: parsed.psdObject.rootLayer,
      layerTree: nextLayerTree,
      activeLayerIds: nextActiveLayerIds,
      file: undefined,
      filePath,
    };
  } catch {
    return null;
  }
};

const restoreObjectFromProject = async (
  obj: TimelineObject,
  projectSettings: ProjectSettings
): Promise<TimelineObject> => {
  if (obj.type === 'psd') {
    const restored = await restorePsdObjectFromFile(obj as PsdObject, projectSettings);
    if (restored) return restored;
    return { ...obj, file: undefined };
  }

  if (obj.type === 'image' || obj.type === 'video' || obj.type === 'audio') {
    if (typeof obj.filePath === 'string' && obj.filePath.trim() !== '') {
      return {
        ...obj,
        src: toFileProtocolUrl(obj.filePath),
      };
    }
  }

  return obj;
};

export const buildProjectFileData = (input: {
  projectSettings: ProjectSettings;
  scenes: SceneData[];
  activeSceneId: string;
  objects: TimelineObject[];
  layers: LayerState[];
  duration: number;
  camera: CameraState;
  stageCamera3D: SceneData['stageCamera3D'];
}): ProjectFileV2 => {
  const flushed = flushActiveIntoScenes(
    input.scenes,
    input.activeSceneId,
    input.objects,
    input.layers,
    input.duration,
    input.camera,
    input.stageCamera3D
  );
  return {
    format: PROJECT_FILE_FORMAT,
    version: PROJECT_FILE_VERSION_V2,
    savedAt: new Date().toISOString(),
    projectSettings: input.projectSettings,
    activeSceneId: input.activeSceneId,
    scenes: flushed.map((scene) => ({
      ...scene,
      layers: scene.layers.map((layer) => ({ ...layer })),
      camera: { ...scene.camera },
      stageCamera3D: sanitiseStageCamera3D(scene.stageCamera3D),
      objects: scene.objects.map(sanitiseObjectForSave)
    }))
  };
};

/** テストおよび検証用：パース済み JSON を v2 プロジェクトとして検証する */
export const parseProjectPayloadV2 = (parsed: unknown): ProjectFileV2 => {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('プロジェクトファイル形式が不正です。');
  }
  const candidate = parsed as Partial<ProjectFileV1> & Partial<ProjectFileV2>;
  if (candidate.format !== PROJECT_FILE_FORMAT) {
    throw new Error('対応していないプロジェクトファイル形式です。');
  }
  if (!isProjectSettings(candidate.projectSettings)) {
    throw new Error('プロジェクト設定が不正です。');
  }
  if (candidate.version !== PROJECT_FILE_VERSION_V2) {
    throw new Error('対応していないプロジェクトファイル形式です。');
  }
  const rawScenes = (parsed as Record<string, unknown>).scenes;
  if (!Array.isArray(rawScenes) || rawScenes.length === 0) {
    throw new Error('シーン一覧が不正です。');
  }
  const scenes = rawScenes
    .map((entry) => parseSceneEntry(entry))
    .filter((entry): entry is SceneData => entry !== null);
  if (scenes.length !== rawScenes.length) {
    throw new Error('シーン一覧に不正な要素が含まれています。');
  }
  const activeSceneId = typeof candidate.activeSceneId === 'string' && candidate.activeSceneId.trim() !== ''
    ? candidate.activeSceneId
    : scenes[0].id;
  if (!scenes.some((scene) => scene.id === activeSceneId)) {
    throw new Error('アクティブシーン ID が存在しません。');
  }
  return {
    format: PROJECT_FILE_FORMAT,
    version: PROJECT_FILE_VERSION_V2,
    savedAt: typeof candidate.savedAt === 'string' ? candidate.savedAt : new Date().toISOString(),
    projectSettings: candidate.projectSettings,
    activeSceneId,
    scenes
  };
};

export const saveProjectFileWithDialog = async (
  projectFile: ProjectFileV2
): Promise<SaveProjectResponse> => {
  try {
    const response = await window.ipcRenderer.invoke('save-project-file', {
      data: JSON.stringify(projectFile, null, 2),
      defaultName: 'project.uxfd.json',
    }) as SaveProjectResponse;
    return response;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

export const openProjectFileWithDialog = async (): Promise<{
  filePath: string;
  project: ProjectFileV2;
} | null> => {
  const response = await window.ipcRenderer.invoke('open-project-file') as OpenProjectResponse;
  if (!response || response.success !== true) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(response.data);
  } catch {
    throw new Error('プロジェクトファイルの JSON 解析に失敗しました。');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('プロジェクトファイル形式が不正です。');
  }

  const candidate = parsed as Partial<ProjectFileV1> & Partial<ProjectFileV2>;
  if (candidate.format !== PROJECT_FILE_FORMAT) {
    throw new Error('対応していないプロジェクトファイル形式です。');
  }
  if (!isProjectSettings(candidate.projectSettings)) {
    throw new Error('プロジェクト設定が不正です。');
  }

  if (candidate.version === PROJECT_FILE_VERSION_V1) {
    const objectCandidates = (parsed as Record<string, unknown>).objects;
    if (!Array.isArray(objectCandidates)) {
      throw new Error('オブジェクト一覧が不正です。');
    }
    if (!objectCandidates.every((obj) => isTimelineObject(obj))) {
      throw new Error('オブジェクト一覧に不正な要素が含まれています。');
    }
    const v1: ProjectFileV1 = {
      format: PROJECT_FILE_FORMAT,
      version: PROJECT_FILE_VERSION_V1,
      savedAt: typeof candidate.savedAt === 'string' ? candidate.savedAt : new Date().toISOString(),
      projectSettings: candidate.projectSettings,
      duration: typeof candidate.duration === 'number' && Number.isFinite(candidate.duration)
        ? Math.max(1, candidate.duration)
        : 30,
      layers: parseLayers(candidate.layers),
      objects: objectCandidates as TimelineObject[]
    };
    return {
      filePath: response.filePath,
      project: migrateV1ToV2(v1)
    };
  }

  if (candidate.version === PROJECT_FILE_VERSION_V2) {
    return {
      filePath: response.filePath,
      project: parseProjectPayloadV2(parsed)
    };
  }

  throw new Error('対応していないプロジェクトファイル形式です。');
};

export const restoreProjectObjects = async (
  objects: TimelineObject[],
  projectSettings: ProjectSettings
): Promise<TimelineObject[]> => {
  const restored = await Promise.all(
    objects.map((obj) => restoreObjectFromProject(obj, projectSettings))
  );
  return restored;
};
