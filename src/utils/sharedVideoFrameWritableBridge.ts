import type { RustBackendResult } from './rustBackendVideoDecodeControl';

export interface WritableSharedFrameRingPayload {
  memoryId: string;
  slotCount: number;
  slotByteLen: number;
}

export interface WritableSharedFrameWritePayload {
  memoryId: string;
  ptsFrame: number;
}

export interface WritableSharedFrameClosePayload {
  memoryId: string;
}

export interface WritableSharedFrameRingReport extends WritableSharedFrameRingPayload {}

export interface WritableSharedFrameWriteReport {
  sequence: number;
  byteLen: number;
  checksum: number;
}

export interface WritableSharedFrameCloseReport {
  memoryId: string;
}

export interface SharedVideoFrameWritableBridge {
  createWritableSharedFrameRing: (
    payload: WritableSharedFrameRingPayload
  ) => Promise<RustBackendResult<WritableSharedFrameRingReport>>;
  writeIntoSharedFrameRing: (
    payload: WritableSharedFrameWritePayload,
    source: Uint8Array
  ) => Promise<RustBackendResult<WritableSharedFrameWriteReport>>;
  closeWritableSharedFrameRing: (
    payload: WritableSharedFrameClosePayload
  ) => Promise<RustBackendResult<WritableSharedFrameCloseReport>>;
}

export const createWritableSharedFrameRing = (
  payload: WritableSharedFrameRingPayload,
  bridge: SharedVideoFrameWritableBridge = window.sharedVideoFrame
): Promise<RustBackendResult<WritableSharedFrameRingReport>> =>
  bridge.createWritableSharedFrameRing(payload);

export const writeIntoSharedFrameRing = (
  payload: WritableSharedFrameWritePayload,
  source: Uint8Array,
  bridge: SharedVideoFrameWritableBridge = window.sharedVideoFrame
): Promise<RustBackendResult<WritableSharedFrameWriteReport>> =>
  bridge.writeIntoSharedFrameRing(payload, source);

export const closeWritableSharedFrameRing = (
  payload: WritableSharedFrameClosePayload,
  bridge: SharedVideoFrameWritableBridge = window.sharedVideoFrame
): Promise<RustBackendResult<WritableSharedFrameCloseReport>> =>
  bridge.closeWritableSharedFrameRing(payload);
