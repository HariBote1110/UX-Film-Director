import { ProjectSettings, TimelineObject, PsdObject, PsdLayerNode, LayerState, SceneData, CameraState } from '../types';
import { buildPsdLayerTree, parsePsdArrayBufferAsObject, stripPsdLayerNodeForPersistence } from './psdParser';
import { toFileProtocolUrl } from './mediaMetadata';
import { flushActiveIntoScenes, sanitiseStageCamera3D } from './sceneState';

const PROJECT_FILE_FORMAT = 'uxfd-project';
const PROJECT_FILE_VERSION_V2 = 2;

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

type RustBackendDeserializeResult = { success: boolean; result?: { project: unknown }; error?: string; errorCode?: number };
type RustBackendSerializeResult = { success: boolean; result?: { json: string }; error?: string; errorCode?: number };

/**
 * `window.rustBackend.deserializeProjectFile`/`serializeProjectFile`
 * （rust-core の `project_file_from_json`/`project_file_to_json_pretty` に
 * 委譲する Rust IPC、R4-2 で配線済み）の薄い呼び出し口。
 *
 * `src/utils/rustBackendSceneControl.ts` と同じパターン（デフォルト実装は
 * `window.rustBackend` を直接呼ぶだけで存在チェックはしない — Electron
 * renderer コンテキストであることを前提とする。テストはこの bridge を
 * 差し替えてモックする）を踏襲した。
 */
export interface RustBackendProjectFileBridge {
  deserializeProjectFile: (payload: { json: string }) => Promise<RustBackendDeserializeResult>;
  serializeProjectFile: (payload: { project: unknown }) => Promise<RustBackendSerializeResult>;
}

const defaultRustBackendProjectFileBridge = (): RustBackendProjectFileBridge => ({
  deserializeProjectFile: (payload) => window.rustBackend.deserializeProjectFile(payload),
  serializeProjectFile: (payload) => window.rustBackend.serializeProjectFile(payload),
});

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object'
);

/**
 * Rust 側 (`schema::ProjectFile`) が返した値が期待する最上位 shape を
 * 持つことだけを確認する。フィールド単位の詳細な妥当性検証（旧
 * `isTimelineObject`/`isProjectSettings` 等）は rust-core の
 * `serde::Deserialize` に一本化したため、ここでは二重実装しない。
 */
const isProjectFileShape = (value: unknown): value is ProjectFileV2 => (
  isRecord(value)
  && typeof value.format === 'string'
  && typeof value.version === 'number'
  && typeof value.savedAt === 'string'
  && isRecord(value.projectSettings)
  && typeof value.activeSceneId === 'string'
  && Array.isArray(value.scenes)
);

/**
 * `.uxfd.json` の JSON テキストを Rust IPC (`project.deserialize`) 経由で
 * 解析する。V1→V2 移行・スキーマ検証はすべて rust-core 側で行われる。
 */
export const parseProjectPayloadV2 = async (
  json: string,
  bridge: RustBackendProjectFileBridge = defaultRustBackendProjectFileBridge()
): Promise<ProjectFileV2> => {
  const response = await bridge.deserializeProjectFile({ json });
  if (!response.success || !response.result) {
    throw new Error(response.error ?? 'プロジェクトファイルの解析に失敗しました。');
  }
  const { project } = response.result;
  if (!isProjectFileShape(project)) {
    throw new Error('プロジェクトファイル形式が不正です。');
  }
  return project;
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

export const saveProjectFileWithDialog = async (
  projectFile: ProjectFileV2,
  bridge: RustBackendProjectFileBridge = defaultRustBackendProjectFileBridge()
): Promise<SaveProjectResponse> => {
  try {
    const serialised = await bridge.serializeProjectFile({ project: projectFile });
    if (!serialised.success || !serialised.result) {
      return {
        success: false,
        error: serialised.error ?? 'プロジェクトファイルの直列化に失敗しました。',
      };
    }
    const response = await window.ipcRenderer.invoke('save-project-file', {
      data: serialised.result.json,
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

export const openProjectFileWithDialog = async (
  bridge: RustBackendProjectFileBridge = defaultRustBackendProjectFileBridge()
): Promise<{
  filePath: string;
  project: ProjectFileV2;
} | null> => {
  const response = await window.ipcRenderer.invoke('open-project-file') as OpenProjectResponse;
  if (!response || response.success !== true) {
    return null;
  }

  const project = await parseProjectPayloadV2(response.data, bridge);
  return { filePath: response.filePath, project };
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
