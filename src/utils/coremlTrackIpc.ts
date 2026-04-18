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

export const invokeCoreMlTrackObjectSupported = async (): Promise<boolean> => {
  if (typeof window === 'undefined' || typeof window.ipcRenderer?.invoke !== 'function') {
    return false;
  }
  const raw = (await window.ipcRenderer.invoke('coreml-track-object-supported')) as { supported?: boolean };
  return raw?.supported === true;
};

export const invokeCoreMlTrackObject = async (
  request: CoreMlTrackObjectRequest
): Promise<CoreMlTrackObjectResponse> => {
  const raw = (await window.ipcRenderer.invoke('coreml-track-object', request)) as Record<string, unknown>;
  if (raw && raw.ok === false) {
    return { ok: false, error: typeof raw.error === 'string' ? raw.error : 'Tracking failed.' };
  }
  if (!raw || !Array.isArray(raw.samples)) {
    return { ok: false, error: 'Unexpected response from coreml-track-object.' };
  }
  return { ok: true, samples: raw.samples as CoreMlTrackSample[] };
};
