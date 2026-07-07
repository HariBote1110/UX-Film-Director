import type { SharedRendererDecodedVideoFrameUpload } from './sharedRendererPreviewPresenterController';
import type {
  RustBackendResult,
  RustBackendSharedVideoFrame,
} from './rustBackendVideoDecodeControl';

export interface SharedVideoFrameCopyIntoUploadBufferPayload {
  memoryId: string;
  slotCount: number;
  slotByteLen: number;
  slotIndex: number;
  generation: number;
  ptsFrame: number;
}

export interface SharedVideoFrameCopyReport {
  sequence: number;
  slotIndex: number;
  generation: number;
  byteLen: number;
  checksumAlgorithm?: 'crc32';
  expectedChecksum: number;
  actualChecksum: number;
}

export type SharedVideoFrameCopyResponse = RustBackendResult<SharedVideoFrameCopyReport> & {
  copiedBytes?: Uint8Array | number[];
  // preloadがSAB経路を提供できない環境（addon未更新・SAB無効化など）を
  // 「本物のコピー失敗」と区別するためのフラグ。trueならlegacy経路へ
  // フォールバックしてよい（フレーム自体は失われていない）。
  sharedUploadUnavailable?: boolean;
};

export interface SharedVideoFrameSharedCopyPayload extends SharedVideoFrameCopyIntoUploadBufferPayload {
  // postMessageで登録済みのSABを指す参照。copy呼び出し自体は文字列参照のみを
  // contextBridge越しに渡す（SAB/viewはcontextBridgeでクローン不可のため）。
  sharedUploadBufferId: string;
}

export interface SharedUploadBufferRegistration {
  bufferId: string;
  byteLen: number;
  buffer: SharedArrayBuffer;
}

export interface SharedUploadBufferRegistrationResult {
  success: boolean;
  sharedUploadUnavailable?: boolean;
  error?: string;
}

export interface SharedVideoFrameCopyBridge {
  copyIntoUploadBuffer: (
    payload: SharedVideoFrameCopyIntoUploadBufferPayload,
    target: Uint8Array
  ) => Promise<SharedVideoFrameCopyResponse>;
  // SAB zero-copy経路の登録（optional: 省略時はwindow.postMessageの既定実装を
  // 使う）。SharedArrayBufferは構造化クローンでバッキングメモリが共有される
  // ため、一回の登録以降はaddonのmemcpy 1回だけでrendererのバッファへ画素が
  // 届く（copiedBytesのエコーバックは行わない）。
  registerSharedUploadBuffer?: (
    registration: SharedUploadBufferRegistration
  ) => Promise<SharedUploadBufferRegistrationResult>;
  // 登録済みバッファの解放通知（optional）。byteLen変更でringを作り直す時に
  // preload側の登録簿から古いSABを外し、旧解像度の8.3MB級バッファを保持し
  // 続けないようにする。
  releaseSharedUploadBuffer?: (payload: { bufferId: string }) => void;
  // SAB zero-copy経路のコピー（optional: addon未更新のpreloadでは存在しない）。
  copyIntoSharedUploadBuffer?: (
    payload: SharedVideoFrameSharedCopyPayload
  ) => Promise<SharedVideoFrameCopyResponse>;
}

export interface PrepareSharedRendererDecodedVideoFrameUploadInput {
  sharedFrame: RustBackendSharedVideoFrame;
  slotCount: number;
  bridge?: SharedVideoFrameCopyBridge;
  releaseAfterGpuUpload?: () => Promise<void>;
  releaseAfterUploadAbort?: () => Promise<void>;
}

export type PrepareSharedRendererDecodedVideoFrameUploadResult =
  | (SharedRendererDecodedVideoFrameUpload & {
      ok: true;
      copyReport: SharedVideoFrameCopyReport;
    })
  | {
      ok: false;
      reason: 'copyFailed';
      detail: string;
    }
  | {
      ok: false;
      reason: 'copyReportByteLengthMismatch';
      detail: string;
      expectedByteLength: number;
      actualByteLength: number;
    }
  | {
      ok: false;
      reason: 'copyReportSlotLeaseMismatch';
      detail: string;
      expectedSlotIndex: number;
      actualSlotIndex: number;
      expectedGeneration: number;
      actualGeneration: number;
    }
  | {
      ok: false;
      reason: 'copyReportSequenceMismatch';
      detail: string;
      expectedSequence: number;
      actualSequence: number;
    }
  | {
      ok: false;
      reason: 'copyReportChecksumMismatch';
      detail: string;
      expectedChecksum: number;
      actualChecksum: number;
    }
  | {
      ok: false;
      reason: 'copyReportTargetChecksumMismatch';
      detail: string;
      expectedChecksum: number;
      actualChecksum: number;
    }
  | {
      ok: false;
      reason: 'copyReportChecksumAlgorithmUnsupported';
      detail: string;
      checksumAlgorithm: string;
    }
  | {
      ok: false;
      reason: 'descriptorOutsideSharedRingLayout';
      detail: string;
    }
  | {
      ok: false;
      reason: 'copyReportContainsPixelPayload';
      detail: string;
    };

export const prepareSharedRendererDecodedVideoFrameUpload = async ({
  sharedFrame,
  slotCount,
  bridge = window.sharedVideoFrame,
  releaseAfterGpuUpload,
  releaseAfterUploadAbort,
}: PrepareSharedRendererDecodedVideoFrameUploadInput): Promise<PrepareSharedRendererDecodedVideoFrameUploadResult> => {
  const { descriptor, ptsFrame } = sharedFrame;
  if (!isDescriptorInsideSharedRingLayout(descriptor, slotCount)) {
    return {
      ok: false,
      reason: 'descriptorOutsideSharedRingLayout',
      detail: 'Shared video frame descriptor points outside the declared ring layout.',
    };
  }

  const { response, copyTarget, usedSharedPath } = await copyFrameIntoUploadBuffer(bridge, {
    memoryId: descriptor.memoryId,
    slotCount,
    slotByteLen: descriptor.byteLen,
    slotIndex: descriptor.slotIndex,
    generation: descriptor.generation,
    ptsFrame,
  });

  if (!response.success || !response.result) {
    return {
      ok: false,
      reason: 'copyFailed',
      detail: response.error ?? 'Shared video frame copy failed.',
    };
  }
  if (response.result.byteLen !== descriptor.byteLen) {
    return {
      ok: false,
      reason: 'copyReportByteLengthMismatch',
      detail: 'Shared video frame copy report must match the decoded frame descriptor.',
      expectedByteLength: descriptor.byteLen,
      actualByteLength: response.result.byteLen,
    };
  }
  // copiedBytesのエコーバック（contextBridgeの構造化クローン産物）はlegacy経路
  // 専用。SAB経路ではaddonがrenderer所有メモリへ直接書き込むため存在しない。
  const copiedBytes = usedSharedPath ? null : normaliseCopiedUploadBytes(response.copiedBytes);
  if (copiedBytes) {
    if (copiedBytes.byteLength !== descriptor.byteLen) {
      return {
        ok: false,
        reason: 'copyReportByteLengthMismatch',
        detail: 'Shared video frame copy report must match the decoded frame descriptor.',
        expectedByteLength: descriptor.byteLen,
        actualByteLength: copiedBytes.byteLength,
      };
    }
    copyTarget.set(copiedBytes);
  }
  if (
    response.result.slotIndex !== descriptor.slotIndex
    || response.result.generation !== descriptor.generation
  ) {
    return {
      ok: false,
      reason: 'copyReportSlotLeaseMismatch',
      detail: 'Shared video frame copy report must match the decoded frame descriptor slot lease.',
      expectedSlotIndex: descriptor.slotIndex,
      actualSlotIndex: response.result.slotIndex,
      expectedGeneration: descriptor.generation,
      actualGeneration: response.result.generation,
    };
  }
  if (response.result.sequence !== ptsFrame) {
    return {
      ok: false,
      reason: 'copyReportSequenceMismatch',
      detail: 'Shared video frame copy report must match the decoded frame pts.',
      expectedSequence: ptsFrame,
      actualSequence: response.result.sequence,
    };
  }
  if (
    response.result.checksumAlgorithm !== undefined
    && response.result.checksumAlgorithm !== 'crc32'
  ) {
    return {
      ok: false,
      reason: 'copyReportChecksumAlgorithmUnsupported',
      detail: 'Shared video frame copy report checksum algorithm must be crc32.',
      checksumAlgorithm: response.result.checksumAlgorithm,
    };
  }
  if (response.result.expectedChecksum !== response.result.actualChecksum) {
    return {
      ok: false,
      reason: 'copyReportChecksumMismatch',
      detail: 'Shared video frame copy report checksum verification failed.',
      expectedChecksum: response.result.expectedChecksum,
      actualChecksum: response.result.actualChecksum,
    };
  }
  // JS側での全画素CRC32再計算はopt-in診断のみ。Rust側
  // (shared-video-frame-bridge-node/src/lib.rs の copy_into_upload_buffer)が
  // copy report生成時に既にshared memory実データからexpected/actual checksumを
  // 計算・照合済みで、その結果はここより前段の `copyReportChecksumMismatch`
  // （response.result内の値同士を比較するだけの軽量チェック）でfail-loud化
  // されている。JSでの再計算は「rendererが受け取ったbytes自体」を疑う三重目の
  // 診断であり、move毎に1920x1080x4=8.3MBを舐めるため
  // ドラッグ中プレビューガタつきのCPUプロファイルでself time 47%を占めていた
  // （実測）。通常運用では走らせず、`VITE_UXFD_UPLOAD_CRC_VERIFY=1` を
  // 指定した時だけ診断として実行する。
  if (
    response.result.checksumAlgorithm === 'crc32'
    && import.meta.env.VITE_UXFD_UPLOAD_CRC_VERIFY === '1'
  ) {
    const targetChecksum = crc32(copyTarget);
    if (targetChecksum !== response.result.actualChecksum) {
      return {
        ok: false,
        reason: 'copyReportTargetChecksumMismatch',
        detail: 'Shared video frame upload buffer checksum must match the copy report.',
        expectedChecksum: response.result.actualChecksum,
        actualChecksum: targetChecksum,
      };
    }
  }
  if (copyReportContainsPixelPayload(response.result)) {
    return {
      ok: false,
      reason: 'copyReportContainsPixelPayload',
      detail: 'Shared video frame copy report must not return pixel bytes through the control plane.',
    };
  }

  // writeTextureがSABバックのviewを拒否した実績のある環境では、pooled非共有
  // stagingバッファへの1回の.setを挟む（それでもbridgeの構造化クローンと
  // preload側の新規割当ては消えており、コピーは合計1回に減っている）。
  let rgbaBytes = copyTarget;
  if (usedSharedPath && writeTextureRejectedDetail !== null) {
    const staging = acquireUploadBuffer(descriptor.byteLen);
    staging.set(copyTarget);
    rgbaBytes = staging;
  }

  return {
    ok: true,
    descriptor,
    ptsFrame,
    rgbaBytes,
    releaseAfterGpuUpload,
    releaseAfterUploadAbort,
    copyReport: response.result,
  };
};

const isDescriptorInsideSharedRingLayout = (
  descriptor: RustBackendSharedVideoFrame['descriptor'],
  slotCount: number,
): boolean => {
  if (!Number.isSafeInteger(slotCount) || slotCount <= 0) return false;
  if (!Number.isSafeInteger(descriptor.slotIndex) || descriptor.slotIndex < 0) return false;
  if (!Number.isSafeInteger(descriptor.byteLen) || descriptor.byteLen <= 0) return false;
  if (!Number.isSafeInteger(descriptor.byteOffset) || descriptor.byteOffset < 0) return false;

  const expectedOffset = descriptor.byteLen * descriptor.slotIndex;
  const ringByteLen = descriptor.byteLen * slotCount;

  return descriptor.slotIndex < slotCount
    && Number.isSafeInteger(expectedOffset)
    && Number.isSafeInteger(ringByteLen)
    && descriptor.byteOffset === expectedOffset
    && descriptor.byteOffset + descriptor.byteLen <= ringByteLen;
};

const copyReportPixelPayloadKeys = new Set([
  'bytes',
  'pixels',
  'frameBase64',
  'rgbaBytes',
]);

const copyReportContainsPixelPayload = (report: SharedVideoFrameCopyReport): boolean => {
  const record = report as unknown as Record<string, unknown>;
  return Object.keys(record).some((key) => copyReportPixelPayloadKeys.has(key));
};

// アップロードバッファのプール — move毎の `new Uint8Array(8.3MB)`
// (1920x1080x4) 割当てがドラッグ中プレビューのGCサンプルの約13%を占めていた
// （実測）。呼び出し元(sharedRendererRustVideoUploadPipeline.ts /
// sharedRendererViewportNativeRenderUpload.ts)はいずれもpresenter再起動を
// single-flightで直列にawaitする経路のみからこの関数を呼び、返した
// `rgbaBytes` はWebGPU `device.queue.writeTexture`
// （sharedRendererWebGpuPresenter.ts）へ同期的に書き込まれた時点で用済みに
// なる。そのため同一byteLenが続く限り前回のバッファをそのまま再利用してよい。
// byteLenが変わった場合（解像度変更等）は新しいバッファを確保し直す。
let pooledUploadBuffer: Uint8Array | null = null;

const acquireUploadBuffer = (byteLen: number): Uint8Array => {
  if (pooledUploadBuffer && pooledUploadBuffer.byteLength === byteLen) {
    return pooledUploadBuffer;
  }
  const buffer = new Uint8Array(byteLen);
  pooledUploadBuffer = buffer;
  return buffer;
};

// --- SharedArrayBuffer zero-copy経路 ---
// 本体フレーム(1920x1080x4=8.3MB)はlegacy経路だとcontextBridgeの構造化クローン
// (renderer→preload) + copiedBytesエコーバック(preload→renderer) +
// rgbaBytes.set() でmove毎に8.3MBx2〜3回のコピーと毎回の新規割当てが発生し、
// CPUプロファイルでコピー26%+GC 27%を占めていた（実測）。SharedArrayBufferは
// 構造化クローンでもバッキングメモリが共有されるため、rendererが確保した
// SABバックのviewをpreloadの copyIntoSharedUploadBuffer へ渡せば、addonの
// shared memory→viewポインタへのmemcpy 1回だけで画素がrendererに届く。
//
// 競合管理の契約: この関数の呼び出し元（sharedRendererRustVideoUploadPipeline /
// sharedRendererViewportNativeRenderUpload）はいずれもsingle-flightで直列に
// awaitする経路のみで、WebGPU `device.queue.writeTexture` は呼び出し時点で
// データをコマンドバッファへコピーして戻る仕様のため、writeTextureが返った後は
// バッファを上書きしてよい。さらに保険としてSABを2本のringで交互に使い、
// 「前フレームのwriteTextureが何らかの理由で遅延しても次のコピーが同じ
// バッファを上書きしない」ことを構造的に保証する。
const SHARED_UPLOAD_RING_SIZE = 2;

interface SharedUploadRingSlot {
  bufferId: string;
  view: Uint8Array;
}

let sharedUploadRing: Array<SharedUploadRingSlot | undefined> = [];
let sharedUploadRingByteLen = 0;
let sharedUploadRingIndex = 0;
let sharedUploadBufferSerial = 0;

// フォールバックの階段: SAB無効化・addon未更新・bridge越えの例外を検知したら
// 以後はlegacy経路へ永続的に切り替える（latch）。理由はdiagnosticsに残す。
let sharedUploadFallbackReason: string | null = null;
// ChromiumのWebGPUがSABバックのviewを拒否した場合のstagedモード切替detail。
let writeTextureRejectedDetail: string | null = null;
let sharedUploadPathAnnounced = false;
let lastUploadPathMode: SharedVideoFrameUploadPathMode | null = null;
let sharedCopyCount = 0;
let legacyCopyCount = 0;

export type SharedVideoFrameUploadPathMode =
  | 'sharedArrayBufferZeroCopy'
  | 'sharedArrayBufferStaged'
  | 'legacyCopy';

export interface SharedVideoFrameUploadPathDiagnostics {
  lastMode: SharedVideoFrameUploadPathMode | null;
  sharedCopyCount: number;
  legacyCopyCount: number;
  sharedUploadFallbackReason: string | null;
  writeTextureRejectedDetail: string | null;
}

export const getSharedVideoFrameUploadPathDiagnostics = (): SharedVideoFrameUploadPathDiagnostics => ({
  lastMode: lastUploadPathMode,
  sharedCopyCount,
  legacyCopyCount,
  sharedUploadFallbackReason,
  writeTextureRejectedDetail,
});

// presenter(sharedRendererWebGpuPresenter.ts)がwriteTextureのSAB拒否を検知した
// 時に呼ぶ。以後のフレームはSABコピー後にpooled非共有バッファへ1回だけ.setして
// からwriteTextureへ渡す（例外の再発なし）。
export const markSharedUploadWriteTextureRejected = (detail: string): void => {
  if (writeTextureRejectedDetail !== null) return;
  writeTextureRejectedDetail = detail;
  console.warn(
    '[sharedVideoFrameUploadBridge] WebGPU writeTexture rejected a SharedArrayBuffer-backed view; staging uploads through a pooled non-shared buffer from now on:',
    detail,
  );
};

export const resetSharedVideoFrameUploadPathForTest = (): void => {
  sharedUploadRing = [];
  sharedUploadRingByteLen = 0;
  sharedUploadRingIndex = 0;
  sharedUploadBufferSerial = 0;
  sharedUploadFallbackReason = null;
  writeTextureRejectedDetail = null;
  sharedUploadPathAnnounced = false;
  lastUploadPathMode = null;
  sharedCopyCount = 0;
  legacyCopyCount = 0;
  pooledUploadBuffer = null;
};

const disableSharedUploadPath = (reason: string): void => {
  if (sharedUploadFallbackReason !== null) return;
  sharedUploadFallbackReason = reason;
  console.warn(
    '[sharedVideoFrameUploadBridge] Falling back to the legacy copy upload path:',
    reason,
  );
};

// window.postMessage経由の既定登録実装 — ElectronのcontextBridgeはSAB(バック
// のview含む)を「An object could not be cloned.」で拒否するため、SAB本体は
// 本物の構造化クローンが走るwindow.postMessageで一回だけpreloadへ渡す
// （バッキングメモリは共有される）。preload(electron/preload.ts)が
// 'uxfd:registerSharedUploadBuffer' を受けて登録簿へviewを保持し、
// 'uxfd:sharedUploadBufferRegistered' をackとして返す。
const SHARED_UPLOAD_REGISTRATION_ACK_TIMEOUT_MS = 2_000;

const registerSharedUploadBufferViaWindowMessage = (
  registration: SharedUploadBufferRegistration,
): Promise<SharedUploadBufferRegistrationResult> => new Promise((resolve) => {
  if (typeof window === 'undefined' || typeof window.postMessage !== 'function') {
    resolve({
      success: false,
      error: 'Shared upload buffer registration transport (window.postMessage) is unavailable.',
    });
    return;
  }
  const onMessage = (event: MessageEvent) => {
    const data = event.data as { type?: unknown; bufferId?: unknown } | null;
    if (
      !data
      || typeof data !== 'object'
      || data.type !== 'uxfd:sharedUploadBufferRegistered'
      || data.bufferId !== registration.bufferId
    ) {
      return;
    }
    cleanup();
    resolve({ success: true });
  };
  const timeout = setTimeout(() => {
    cleanup();
    resolve({
      success: false,
      error: 'Shared upload buffer registration ack timed out (preload listener missing?).',
    });
  }, SHARED_UPLOAD_REGISTRATION_ACK_TIMEOUT_MS);
  const cleanup = () => {
    clearTimeout(timeout);
    window.removeEventListener('message', onMessage);
  };
  window.addEventListener('message', onMessage);
  try {
    window.postMessage({
      type: 'uxfd:registerSharedUploadBuffer',
      bufferId: registration.bufferId,
      byteLen: registration.byteLen,
      buffer: registration.buffer,
    }, '*');
  } catch (error) {
    cleanup();
    resolve({
      success: false,
      error: `Shared upload buffer registration postMessage failed: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
});

const releaseSharedUploadBufferViaWindowMessage = (bufferId: string): void => {
  if (typeof window === 'undefined' || typeof window.postMessage !== 'function') return;
  try {
    window.postMessage({ type: 'uxfd:releaseSharedUploadBuffer', bufferId }, '*');
  } catch {
    // 解放通知はベストエフォート（失敗してもpreload側に古いviewが残るだけ）
  }
};

const releaseSharedUploadRing = (bridge: SharedVideoFrameCopyBridge): void => {
  for (const slot of sharedUploadRing) {
    if (!slot) continue;
    if (typeof bridge.releaseSharedUploadBuffer === 'function') {
      bridge.releaseSharedUploadBuffer({ bufferId: slot.bufferId });
    } else {
      releaseSharedUploadBufferViaWindowMessage(slot.bufferId);
    }
  }
  sharedUploadRing = [];
  sharedUploadRingIndex = 0;
};

// ringスロットの確保+preloadへの登録（SAB確保時の一回きり）。登録に失敗した
// 場合はnullを返し、呼び出し側でlegacy経路へフォールバックする。
const ensureSharedUploadRingSlot = async (
  bridge: SharedVideoFrameCopyBridge,
  byteLen: number,
): Promise<SharedUploadRingSlot | null> => {
  if (sharedUploadRingByteLen !== byteLen) {
    // 解像度変更等でbyteLenが変わったらring全体を登録解除して確保し直す
    releaseSharedUploadRing(bridge);
    sharedUploadRingByteLen = byteLen;
  }
  const index = sharedUploadRingIndex;
  sharedUploadRingIndex = (index + 1) % SHARED_UPLOAD_RING_SIZE;
  const existing = sharedUploadRing[index];
  if (existing) return existing;

  sharedUploadBufferSerial += 1;
  const buffer = new SharedArrayBuffer(byteLen);
  const slot: SharedUploadRingSlot = {
    bufferId: `uxfd-shared-upload-${sharedUploadBufferSerial}-${byteLen}`,
    view: new Uint8Array(buffer),
  };
  const register = bridge.registerSharedUploadBuffer ?? registerSharedUploadBufferViaWindowMessage;
  const registrationResult = await register.call(bridge, {
    bufferId: slot.bufferId,
    byteLen,
    buffer,
  });
  if (!registrationResult.success) {
    disableSharedUploadPath(
      registrationResult.error ?? 'Shared upload buffer registration failed without detail.',
    );
    return null;
  }
  sharedUploadRing[index] = slot;
  return slot;
};

interface UploadCopyAttempt {
  response: SharedVideoFrameCopyResponse;
  copyTarget: Uint8Array;
  usedSharedPath: boolean;
}

const copyFrameIntoUploadBuffer = async (
  bridge: SharedVideoFrameCopyBridge,
  payload: SharedVideoFrameCopyIntoUploadBufferPayload,
): Promise<UploadCopyAttempt> => {
  const sharedCopy = bridge.copyIntoSharedUploadBuffer;
  if (
    sharedUploadFallbackReason === null
    && typeof sharedCopy === 'function'
    && typeof SharedArrayBuffer === 'function'
  ) {
    try {
      const slot = await ensureSharedUploadRingSlot(bridge, payload.slotByteLen);
      if (slot) {
        const response = await sharedCopy.call(bridge, {
          ...payload,
          sharedUploadBufferId: slot.bufferId,
        });
        if (response.sharedUploadUnavailable === true) {
          disableSharedUploadPath(
            response.error ?? 'Shared upload bridge entry reported unavailable without detail.',
          );
        } else {
          sharedCopyCount += 1;
          lastUploadPathMode = writeTextureRejectedDetail === null
            ? 'sharedArrayBufferZeroCopy'
            : 'sharedArrayBufferStaged';
          if (!sharedUploadPathAnnounced) {
            sharedUploadPathAnnounced = true;
            console.info(
              '[sharedVideoFrameUploadBridge] SharedArrayBuffer zero-copy upload path is active.',
            );
          }
          return { response, copyTarget: slot.view, usedSharedPath: true };
        }
      }
    } catch (error) {
      disableSharedUploadPath(error instanceof Error ? error.message : String(error));
    }
  }

  const copyTarget = acquireUploadBuffer(payload.slotByteLen);
  const response = await bridge.copyIntoUploadBuffer(payload, copyTarget);
  legacyCopyCount += 1;
  lastUploadPathMode = 'legacyCopy';
  return { response, copyTarget, usedSharedPath: false };
};

const normaliseCopiedUploadBytes = (value: unknown): Uint8Array | null => {
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value) && value.every((entry) => Number.isInteger(entry) && entry >= 0 && entry <= 255)) {
    return Uint8Array.from(value);
  }
  return null;
};

let crc32Table: Uint32Array | null = null;

const crc32 = (bytes: Uint8Array): number => {
  const table = crc32Table ??= buildCrc32Table();
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const buildCrc32Table = (): Uint32Array => {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) !== 0
        ? (0xedb88320 ^ (value >>> 1))
        : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
};
