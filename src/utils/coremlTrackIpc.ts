import type { VisionNormBoundingBox } from './visionTrackingGeometry';

export type CoreMlTrackObjectRequest = {
  videoPath: string;
  startSec: number;
  endSec: number;
  initialBoundingBox: VisionNormBoundingBox;
  frameStride?: number;
  targetFps?: number;
};

export type CoreMlTrackSample = {
  tSec: number;
  boundingBox: VisionNormBoundingBox;
};

export type CoreMlTrackObjectResponse =
  | { ok: true; samples: CoreMlTrackSample[] }
  | { ok: false; error: string };

export type CoreMlAnimalObservation = {
  identifier: string;
  confidence: number;
  boundingBox: VisionNormBoundingBox;
};

export type CoreMlDetectSubjectsResponse =
  | { ok: true; animals: CoreMlAnimalObservation[] }
  | { ok: false; error: string };

export type CoreMlSegmentPersonResponse =
  | { ok: true; maskPngBase64: string | null; message?: string }
  | { ok: false; error: string };

export type CoreMlFramePreviewResponse =
  | { ok: true; width: number; height: number; jpegBase64: string }
  | { ok: false; error: string };

export const invokeCoreMlTrackObjectSupported = async (): Promise<boolean> => {
  if (typeof window === 'undefined' || typeof window.ipcRenderer?.invoke !== 'function') {
    return false;
  }
  const raw = (await window.ipcRenderer.invoke('coreml-track-object-supported')) as { supported?: boolean };
  return raw?.supported === true;
};

const parseVisionError = (raw: Record<string, unknown>): string | null => {
  if (raw && raw.ok === false) {
    return typeof raw.error === 'string' ? raw.error : 'Vision job failed.';
  }
  return null;
};

export const invokeCoreMlTrackObject = async (
  request: CoreMlTrackObjectRequest
): Promise<CoreMlTrackObjectResponse> => {
  const raw = (await window.ipcRenderer.invoke('coreml-track-object', request)) as Record<string, unknown>;
  const err = parseVisionError(raw);
  if (err) return { ok: false, error: err };
  if (!raw || !Array.isArray(raw.samples)) {
    return { ok: false, error: 'Unexpected response from coreml-track-object.' };
  }
  return { ok: true, samples: raw.samples as CoreMlTrackSample[] };
};

export const invokeCoreMlDetectSubjects = async (
  videoPath: string,
  timeSec: number
): Promise<CoreMlDetectSubjectsResponse> => {
  const raw = (await window.ipcRenderer.invoke('coreml-track-object', {
    command: 'detectSubjects',
    videoPath,
    timeSec,
  })) as Record<string, unknown>;
  const err = parseVisionError(raw);
  if (err) return { ok: false, error: err };
  const animals = Array.isArray(raw.animals) ? (raw.animals as CoreMlAnimalObservation[]) : [];
  return { ok: true, animals };
};

export const invokeCoreMlSegmentPerson = async (
  videoPath: string,
  timeSec: number
): Promise<CoreMlSegmentPersonResponse> => {
  const raw = (await window.ipcRenderer.invoke('coreml-track-object', {
    command: 'segmentPerson',
    videoPath,
    timeSec,
  })) as Record<string, unknown>;
  const err = parseVisionError(raw);
  if (err) return { ok: false, error: err };
  const mask = typeof raw.maskPngBase64 === 'string' ? raw.maskPngBase64 : null;
  const message = typeof raw.message === 'string' ? raw.message : undefined;
  return { ok: true, maskPngBase64: mask, message };
};

export const invokeCoreMlFramePreview = async (
  videoPath: string,
  timeSec: number
): Promise<CoreMlFramePreviewResponse> => {
  const raw = (await window.ipcRenderer.invoke('coreml-track-object', {
    command: 'framePreview',
    videoPath,
    timeSec,
  })) as Record<string, unknown>;
  const err = parseVisionError(raw);
  if (err) return { ok: false, error: err };
  const width = typeof raw.width === 'number' && Number.isFinite(raw.width) ? raw.width : NaN;
  const height = typeof raw.height === 'number' && Number.isFinite(raw.height) ? raw.height : NaN;
  const jpegBase64 = typeof raw.jpegBase64 === 'string' ? raw.jpegBase64 : '';
  if (!Number.isFinite(width) || !Number.isFinite(height) || !jpegBase64) {
    return { ok: false, error: 'Invalid framePreview response.' };
  }
  return { ok: true, width, height, jpegBase64 };
};
