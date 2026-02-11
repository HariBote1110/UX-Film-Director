import { ProjectSettings, TimelineObject, PsdObject } from '../types';
import { buildPsdLayerTree, parsePsdArrayBufferAsObject } from './psdParser';
import { toFileProtocolUrl } from './mediaMetadata';

const PROJECT_FILE_FORMAT = 'uxfd-project';
const PROJECT_FILE_VERSION = 1;

type ProjectFileV1 = {
  format: typeof PROJECT_FILE_FORMAT;
  version: typeof PROJECT_FILE_VERSION;
  savedAt: string;
  projectSettings: ProjectSettings;
  duration: number;
  objects: TimelineObject[];
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
  return (
    typeof candidate.width === 'number' &&
    Number.isFinite(candidate.width) &&
    typeof candidate.height === 'number' &&
    Number.isFinite(candidate.height) &&
    typeof candidate.fps === 'number' &&
    Number.isFinite(candidate.fps) &&
    typeof candidate.sampleRate === 'number' &&
    Number.isFinite(candidate.sampleRate)
  );
};

const sanitiseObjectForSave = (obj: TimelineObject): TimelineObject => {
  const serialised = JSON.parse(JSON.stringify(obj)) as TimelineObject;
  if (serialised.type === 'psd') {
    delete (serialised as PsdObject).file;
  }
  return serialised;
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
      const merged = { ...nextActiveLayerIds };
      Object.entries(savedActive).forEach(([id, active]) => {
        if (Object.prototype.hasOwnProperty.call(merged, id)) {
          merged[id] = Boolean(active);
        }
      });
      merged.root = true;
      nextActiveLayerIds = merged;
      nextLayerTree = buildPsdLayerTree(parsed.psdObject.rootLayer, merged);
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

export const buildProjectFileData = (
  projectSettings: ProjectSettings,
  duration: number,
  objects: TimelineObject[]
): ProjectFileV1 => {
  return {
    format: PROJECT_FILE_FORMAT,
    version: PROJECT_FILE_VERSION,
    savedAt: new Date().toISOString(),
    projectSettings,
    duration,
    objects: objects.map(sanitiseObjectForSave),
  };
};

export const saveProjectFileWithDialog = async (
  projectFile: ProjectFileV1
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
  project: ProjectFileV1;
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

  const candidate = parsed as Partial<ProjectFileV1>;
  if (candidate.format !== PROJECT_FILE_FORMAT || candidate.version !== PROJECT_FILE_VERSION) {
    throw new Error('対応していないプロジェクトファイル形式です。');
  }
  if (!isProjectSettings(candidate.projectSettings)) {
    throw new Error('プロジェクト設定が不正です。');
  }
  if (!Array.isArray(candidate.objects)) {
    throw new Error('オブジェクト一覧が不正です。');
  }

  return {
    filePath: response.filePath,
    project: {
      format: PROJECT_FILE_FORMAT,
      version: PROJECT_FILE_VERSION,
      savedAt: typeof candidate.savedAt === 'string' ? candidate.savedAt : new Date().toISOString(),
      projectSettings: candidate.projectSettings,
      duration: typeof candidate.duration === 'number' && Number.isFinite(candidate.duration)
        ? Math.max(1, candidate.duration)
        : 30,
      objects: candidate.objects as TimelineObject[],
    },
  };
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
