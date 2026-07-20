import {
  isRustBackendDecodedVideoFrameAvailable,
  releaseRustBackendVideoDecodeFrame,
  type RustBackendResult,
  type RustBackendSharedVideoFrame,
  type RustBackendVideoDecodeBridge,
  type RustBackendVideoDecodeFramePayload,
} from './rustBackendVideoDecodeControl';
import {
  prepareSharedRendererDecodedVideoFrameUpload,
  type PrepareSharedRendererDecodedVideoFrameUploadResult,
  type SharedVideoFrameCopyBridge,
} from './sharedVideoFrameUploadBridge';
import type { RustSceneMediaReference, RustSceneSnapshot } from './rustSceneSnapshot';
import type { SelectionDecorationPayload } from './nativeOverlaySelectionDecoration';

type NativeOverlaySceneSnapshotPayload = {
  frameIndex: number;
  colour: {
    profile: string;
    workingSpace: string;
    alpha: string;
  };
  clips: Array<{
    clipId: string;
    trackId: string;
    mediaId: string;
    sourceFrame: number;
    zIndex: number;
    transform: {
      translationX: number;
      translationY: number;
      scaleX: number;
      scaleY: number;
      rotationDegrees: number;
      sampling?: string;
    };
    opacity: number;
  }>;
  // プロジェクト解像度（シーン canvas サイズ）。clips[].transform の座標系の基準。
  // native overlay の drawable ピクセルサイズと一致しない場合があるため、Rust 側の
  // upload_frame_to_scene_sources がこれを使って contain-fit 変換を行う。
  canvasWidth: number;
  canvasHeight: number;
};

type NativeOverlaySceneMediaPayload = {
  id: string;
  kind: string;
  source: string;
  width: number;
  height: number;
};

export interface PrepareSharedRendererRustDecodedVideoUploadInput {
  decodeResponse: RustBackendResult<unknown>;
  slotCount: number;
  copyBridge: SharedVideoFrameCopyBridge;
  rustBackendBridge: RustBackendVideoDecodeBridge;
}

export interface NativeOverlayDecodedFrameBridge {
  presentSharedFrame: (payload: {
    windowId?: number;
    mediaId: string;
    snapshot?: NativeOverlaySceneSnapshotPayload;
    media?: readonly NativeOverlaySceneMediaPayload[];
    slotCount: number;
    frame: RustBackendSharedVideoFrame;
    // Bug B対策（症状B: 選択枠・本体フレームが2チャネル独立配信のため
    // ドラッグ中にズレる不具合）— この present と同じ (objects, time)
    // から計算された選択デコレーション。addon 側は同梱があればそれを
    // グローバル state の再読みなしにこの present へ使う。
    selectionDecoration?: SelectionDecorationPayload;
  }) => Promise<{
    success: boolean;
    attached: boolean;
    releaseFrame?: {
      memoryId: string;
      slotIndex: number;
      generation: number;
      ptsFrame: number;
      copyOutState: 'gpuUploadFenceSignalled';
    };
    reason?: string;
  }>;
}

export interface PresentNativeOverlayRustDecodedVideoFrameInput {
  windowId?: number;
  mediaId?: string;
  decodeResponse: RustBackendResult<unknown>;
  snapshot?: RustSceneSnapshot;
  media?: readonly RustSceneMediaReference[];
  // プロジェクト解像度（シーン canvas サイズ）。snapshot がある場合は必須。
  canvas?: { width: number; height: number };
  slotCount: number;
  // Bug B対策 — 呼び出し元（prepareSharedRendererViewportNativeOverlayPresent）
  // がこの present と同じ (objects, time) から計算した選択デコレーション。
  // 渡された場合、そのまま presentSharedFrame の payload に同梱する。
  selectionDecoration?: SelectionDecorationPayload;
  nativeOverlayBridge: NativeOverlayDecodedFrameBridge;
  rustBackendBridge: RustBackendVideoDecodeBridge;
}

export type PresentNativeOverlayRustDecodedVideoFrameResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | 'decodedFrameUnavailable'
        | 'nativeOverlayPresentFailed'
        | 'nativeOverlayReleaseMismatch'
        | 'nativeOverlayReleaseFailed';
      detail: string;
    };

export type PrepareSharedRendererRustDecodedVideoUploadResult =
  | PrepareSharedRendererDecodedVideoFrameUploadResult
  | {
      ok: false;
      reason: 'decodedFrameUnavailable';
      detail: string;
    };

const lastNativeOverlayVisualFrameKeyByTarget = new Map<string, string>();

export const resetNativeOverlayVisualFrameCache = (windowId?: number, mediaId?: string): void => {
  if (mediaId) {
    if (typeof windowId === 'number') {
      lastNativeOverlayVisualFrameKeyByTarget.delete(`${windowId}:${mediaId}`);
      return;
    }
    for (const key of lastNativeOverlayVisualFrameKeyByTarget.keys()) {
      if (key.endsWith(`:${mediaId}`)) {
        lastNativeOverlayVisualFrameKeyByTarget.delete(key);
      }
    }
    return;
  }
  lastNativeOverlayVisualFrameKeyByTarget.clear();
};

/**
 * Bug C (b) — clip 削除イベント時に上位経路から呼ぶ dedicated invalidator。
 * 当該 `windowId` の全 mediaId cache だけを消し、他 window への副作用は起こさない。
 * `resetNativeOverlayVisualFrameCache(windowId)`（mediaId 省略）は全 window 全 mediaId を消すため、
 * multi-window 環境での独立性を保つには本 API を使う。
 */
export const resetNativeOverlayVisualFrameCacheForWindow = (windowId: number): void => {
  if (!Number.isFinite(windowId)) {
    return;
  }
  const prefix = `${windowId}:`;
  for (const key of lastNativeOverlayVisualFrameKeyByTarget.keys()) {
    if (key.startsWith(prefix)) {
      lastNativeOverlayVisualFrameKeyByTarget.delete(key);
    }
  }
};

/**
 * Bug C (c) — scene の clips が空集合に遷移したことを上位経路から伝える dedicated 通知。
 * 「scene が空になった」という意図を関数名で明示する。実装としては
 * `resetNativeOverlayVisualFrameCacheForWindow` と等価だが、呼び出し側の context が違う
 * （前者は clip 削除 effect、後者は scene 空集合への遷移 effect）ので別 API として残す。
 * 本通知は次の non-empty present で必ず再描画されることを保証する。
 */
export const notifyNativeOverlaySceneCleared = (windowId: number): void => {
  resetNativeOverlayVisualFrameCacheForWindow(windowId);
};

export const presentNativeOverlayRustDecodedVideoFrame = async ({
  windowId,
  mediaId,
  decodeResponse,
  snapshot,
  media,
  canvas,
  slotCount,
  selectionDecoration,
  nativeOverlayBridge,
  rustBackendBridge,
}: PresentNativeOverlayRustDecodedVideoFrameInput): Promise<PresentNativeOverlayRustDecodedVideoFrameResult> => {
  if (!isRustBackendDecodedVideoFrameAvailable(decodeResponse)) {
    return {
      ok: false,
      reason: 'decodedFrameUnavailable',
      detail: 'Rust backend did not return a verified decoded video frame.',
    };
  }

  const { frame, jobId } = decodeResponse.result;
  const visualFrameKey = buildNativeOverlayVisualFrameKey({
    windowId,
    mediaId: mediaId ?? jobId,
    ptsFrame: frame.ptsFrame,
    snapshot,
    media,
  });
  const visualFrameTarget = `${windowId ?? 'default'}:${mediaId ?? jobId}`;
  if (lastNativeOverlayVisualFrameKeyByTarget.get(visualFrameTarget) === visualFrameKey) {
    return releaseNativeOverlayDecodedFrameLease({
      jobId,
      frame,
      rustBackendBridge,
    });
  }

  const presentResponse = await nativeOverlayBridge.presentSharedFrame({
    windowId,
    mediaId: mediaId ?? jobId,
    ...(snapshot ? { snapshot: toNativeOverlaySceneSnapshotPayload(snapshot, canvas) } : {}),
    ...(media ? { media: media.map(toNativeOverlaySceneMediaPayload) } : {}),
    slotCount,
    frame,
    ...(selectionDecoration ? { selectionDecoration } : {}),
  });
  if (!presentResponse.success || !presentResponse.releaseFrame) {
    return {
      ok: false,
      reason: 'nativeOverlayPresentFailed',
      detail: presentResponse.reason ?? 'Native overlay did not return a decoded frame release payload.',
    };
  }
  const releaseFrame = presentResponse.releaseFrame;
  if (
    releaseFrame.memoryId !== frame.descriptor.memoryId
    || releaseFrame.slotIndex !== frame.descriptor.slotIndex
    || releaseFrame.generation !== frame.descriptor.generation
    || releaseFrame.ptsFrame !== frame.ptsFrame
  ) {
    return {
      ok: false,
      reason: 'nativeOverlayReleaseMismatch',
      detail: 'Native overlay decoded frame release payload did not match the leased frame descriptor.',
    };
  }

  const releaseResponse = await releaseRustBackendVideoDecodeFrame({
    jobId,
    slotIndex: frame.descriptor.slotIndex,
    generation: frame.descriptor.generation,
    copyOutState: 'gpuUploadFenceSignalled',
  }, rustBackendBridge);
  if (!releaseResponse.success) {
    return {
      ok: false,
      reason: 'nativeOverlayReleaseFailed',
      detail: releaseResponse.error ?? 'Rust backend decoded frame release failed.',
    };
  }

  lastNativeOverlayVisualFrameKeyByTarget.set(visualFrameTarget, visualFrameKey);
  return { ok: true };
};

const releaseNativeOverlayDecodedFrameLease = async ({
  jobId,
  frame,
  rustBackendBridge,
}: {
  jobId: string;
  frame: RustBackendSharedVideoFrame;
  rustBackendBridge: RustBackendVideoDecodeBridge;
}): Promise<PresentNativeOverlayRustDecodedVideoFrameResult> => {
  const releaseResponse = await releaseRustBackendVideoDecodeFrame({
    jobId,
    slotIndex: frame.descriptor.slotIndex,
    generation: frame.descriptor.generation,
    copyOutState: 'gpuUploadFenceSignalled',
  }, rustBackendBridge);
  if (!releaseResponse.success) {
    return {
      ok: false,
      reason: 'nativeOverlayReleaseFailed',
      detail: releaseResponse.error ?? 'Rust backend decoded frame release failed.',
    };
  }

  return { ok: true };
};

const buildNativeOverlayVisualFrameKey = ({
  windowId,
  mediaId,
  ptsFrame,
  snapshot,
  media,
}: {
  windowId?: number;
  mediaId: string;
  ptsFrame: number;
  snapshot?: RustSceneSnapshot;
  media?: readonly RustSceneMediaReference[];
}): string => JSON.stringify({
  windowId: windowId ?? null,
  mediaId,
  ptsFrame,
  snapshot: snapshot ? {
    // Bug C (a) — playhead 進行の正本識別子。原 dedup（19cbb966）は colour+clips だけを見ていたが、
    // `latestWins` decode や量子化で source_frame と ptsFrame が同値に張り付くと、再生時刻が
    // 前進しても key が変わらず present がスキップされ続け、overlay が静止する退行になる。
    // `frame_index` はタイムライン上の playhead frame そのものなので、key に必ず含める。
    frame_index: snapshot.frame_index,
    colour: snapshot.colour,
    clips: snapshot.clips,
  } : null,
  media: media ?? null,
});

const toNativeOverlaySceneSnapshotPayload = (
  snapshot: RustSceneSnapshot,
  canvas: { width: number; height: number } | undefined
): NativeOverlaySceneSnapshotPayload => {
  if (!canvas) {
    // scene snapshot の transform はプロジェクト解像度（canvas サイズ）基準の絶対
    // ピクセル座標であり、Rust 側 (upload_frame_to_scene_sources) が drawable ピクセル
    // サイズへ contain-fit するにはこの値が必須。欠落したまま present すると、シーンが
    // drawable の左上に実寸で描かれ縮小表示されるバグを再導入することになる。
    throw new Error(
      'Native overlay scene snapshot present requires a canvas size for drawable-fit scaling.'
    );
  }
  return {
    frameIndex: snapshot.frame_index,
    colour: {
      profile: snapshot.colour.profile,
      workingSpace: snapshot.colour.working_space,
      alpha: snapshot.colour.alpha,
    },
    clips: snapshot.clips.map((clip) => ({
      clipId: clip.clip_id,
      trackId: clip.track_id,
      mediaId: clip.media_id,
      sourceFrame: clip.source_frame,
      zIndex: clip.z_index,
      transform: {
        translationX: clip.transform.translation_x,
        translationY: clip.transform.translation_y,
        scaleX: clip.transform.scale_x,
        scaleY: clip.transform.scale_y,
        rotationDegrees: clip.transform.rotation_degrees,
        sampling: clip.transform.sampling,
      },
      opacity: clip.opacity,
    })),
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
  };
};

const toNativeOverlaySceneMediaPayload = (
  media: RustSceneMediaReference
): NativeOverlaySceneMediaPayload => ({
  id: media.id,
  kind: media.kind,
  source: media.source,
  width: media.width,
  height: media.height,
});

export const prepareSharedRendererRustDecodedVideoUpload = async ({
  decodeResponse,
  slotCount,
  copyBridge,
  rustBackendBridge,
}: PrepareSharedRendererRustDecodedVideoUploadInput): Promise<PrepareSharedRendererRustDecodedVideoUploadResult> => {
  if (!isRustBackendDecodedVideoFrameAvailable(decodeResponse)) {
    return {
      ok: false,
      reason: 'decodedFrameUnavailable',
      detail: 'Rust backend did not return a verified decoded video frame.',
    };
  }

  const { frame, jobId } = decodeResponse.result;
  const releaseFrame = createSingleUseDecodedFrameReleaser((copyOutState) =>
    releaseRustBackendVideoDecodeFrame({
      jobId,
      slotIndex: frame.descriptor.slotIndex,
      generation: frame.descriptor.generation,
      copyOutState,
    }, rustBackendBridge).then(assertDecodedFrameReleaseSucceeded));

  let upload: PrepareSharedRendererDecodedVideoFrameUploadResult;
  try {
    upload = await prepareSharedRendererDecodedVideoFrameUpload({
      sharedFrame: frame,
      slotCount,
      bridge: copyBridge,
      releaseAfterGpuUpload: () => releaseFrame('gpuUploadFenceSignalled'),
      releaseAfterUploadAbort: () => releaseFrame('rendererUploadAborted'),
    });
  } catch (error) {
    await releaseFrame('rendererUploadAborted');
    throw error;
  }
  if (!upload.ok && shouldUseInlineDecodedFrameMvpPath(upload) && rustBackendBridge.requestVideoDecodeFrameInline) {
    const inlineUpload = await prepareInlineDecodedVideoUpload({
      payload: {
        jobId,
        requestId: decodeResponse.result.requestId,
        frameIndex: decodeResponse.result.frameIndex,
        mode: decodeResponse.result.mode,
      },
      expectedFrame: frame,
      requestInlineFrame: rustBackendBridge.requestVideoDecodeFrameInline,
      releaseAfterGpuUpload: () => releaseFrame('gpuUploadFenceSignalled'),
      releaseAfterUploadAbort: () => releaseFrame('rendererUploadAborted'),
    });
    if (inlineUpload.ok) {
      return inlineUpload;
    }
  }
  if (!upload.ok) {
    await releaseFrame('rendererUploadAborted');
  }

  return upload;
};

const shouldUseInlineDecodedFrameMvpPath = (
  upload: PrepareSharedRendererDecodedVideoFrameUploadResult
): boolean =>
  !upload.ok
  && (
    (upload.reason === 'copyFailed' && upload.detail.toLowerCase().includes('native bridge'))
    || upload.reason === 'copyReportChecksumMismatch'
    || upload.reason === 'copyReportTargetChecksumMismatch'
  );

const prepareInlineDecodedVideoUpload = async ({
  payload,
  expectedFrame,
  requestInlineFrame,
  releaseAfterGpuUpload,
  releaseAfterUploadAbort,
}: {
  payload: RustBackendVideoDecodeFramePayload;
  expectedFrame: RustBackendSharedVideoFrame;
  requestInlineFrame: NonNullable<RustBackendVideoDecodeBridge['requestVideoDecodeFrameInline']>;
  releaseAfterGpuUpload: () => Promise<void>;
  releaseAfterUploadAbort: () => Promise<void>;
}): Promise<PrepareSharedRendererDecodedVideoFrameUploadResult> => {
  const inlineResponse = await requestInlineFrame(payload);
  const inlineRgbaBytes = resolveInlineDecodedVideoFrameBytes(inlineResponse);
  if (!inlineRgbaBytes) {
    return {
      ok: false,
      reason: 'copyFailed',
      detail: inlineResponse.error ?? 'Rust backend inline decoded video frame was unavailable.',
    };
  }
  const rgbaBytes = normaliseInlineRgbaBytes(inlineRgbaBytes);
  if (!rgbaBytes || rgbaBytes.byteLength !== expectedFrame.descriptor.byteLen) {
    return {
      ok: false,
      reason: 'copyFailed',
      detail: 'Rust backend inline decoded video frame byte length did not match the descriptor.',
    };
  }

  return {
    ok: true,
    descriptor: expectedFrame.descriptor,
    ptsFrame: expectedFrame.ptsFrame,
    rgbaBytes,
    releaseAfterGpuUpload,
    releaseAfterUploadAbort,
    copyReport: {
      sequence: expectedFrame.ptsFrame,
      slotIndex: expectedFrame.descriptor.slotIndex,
      generation: expectedFrame.descriptor.generation,
      byteLen: rgbaBytes.byteLength,
      checksumAlgorithm: 'crc32',
      expectedChecksum: 0,
      actualChecksum: 0,
    },
  };
};

const resolveInlineDecodedVideoFrameBytes = (
  response: RustBackendResult<unknown>
): Uint8Array | number[] | string | null => {
  if (!response.success || !isRecord(response.result)) return null;
  const frame = response.result.frame;
  if (!isRecord(frame)) return null;
  const rgbaBytes = frame.rgbaBytes;
  if (!(rgbaBytes instanceof Uint8Array) && !Array.isArray(rgbaBytes) && typeof rgbaBytes !== 'string') {
    return null;
  }
  return rgbaBytes;
};

const normaliseInlineRgbaBytes = (
  rgbaBytes: Uint8Array | number[] | string
): Uint8Array | null => {
  if (rgbaBytes instanceof Uint8Array) return rgbaBytes;
  if (Array.isArray(rgbaBytes)) return Uint8Array.from(rgbaBytes);
  if (typeof atob !== 'function') return null;
  const binary = atob(rgbaBytes);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const assertDecodedFrameReleaseSucceeded = (result: RustBackendResult): void => {
  if (!result.success) {
    throw new Error(result.error ?? 'Rust backend decoded frame release failed.');
  }
};

const createSingleUseDecodedFrameReleaser = (
  releaseFrame: (copyOutState: 'gpuUploadFenceSignalled' | 'rendererUploadAborted') => Promise<void>
): (copyOutState: 'gpuUploadFenceSignalled' | 'rendererUploadAborted') => Promise<void> => {
  let releasePromise: Promise<void> | null = null;

  return (copyOutState) => {
    if (!releasePromise) {
      releasePromise = releaseFrame(copyOutState);
    }
    return releasePromise;
  };
};
