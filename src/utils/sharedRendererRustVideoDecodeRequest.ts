import type {
  SharedRendererDecodedVideoFrameFormat,
  SharedRendererVideoDecodeColour,
  SharedRendererVideoFrameDecodeRequest,
  SharedRendererVideoFrameDecodeRequestBuilder,
  SharedRendererVideoFrameDecodeRequestInput,
  SharedRendererVideoFrameDecodeRequestResult,
} from './sharedRendererVideoDecodeRequest';
import type { RustFrameRate } from './rustSceneSnapshot';

export interface SharedRendererRustVideoFrameDecodeRequestWasmModule {
  build_video_frame_decode_requests: (
    snapshot: unknown,
    media: unknown
  ) => unknown;
}

export type SharedRendererRustVideoFrameDecodeRequestWasmLoadedModule =
  SharedRendererRustVideoFrameDecodeRequestWasmModule & {
    default?: () => Promise<unknown> | unknown;
  };

export interface LoadSharedRendererRustVideoFrameDecodeRequestBuilderInput {
  enabled?: boolean;
  fallbackAllowed?: boolean;
  importWasmModule?: () => Promise<SharedRendererRustVideoFrameDecodeRequestWasmLoadedModule>;
  warn?: (message: string, error: unknown) => void;
}

let cachedDefaultBuilder: Promise<SharedRendererVideoFrameDecodeRequestBuilder | null> | null = null;

export const loadSharedRendererRustVideoFrameDecodeRequestBuilder = async ({
  enabled = true,
  fallbackAllowed = true,
  importWasmModule,
  warn = defaultWarn,
}: LoadSharedRendererRustVideoFrameDecodeRequestBuilderInput = {}): Promise<SharedRendererVideoFrameDecodeRequestBuilder | null> => {
  if (!enabled) return null;

  if (!importWasmModule && fallbackAllowed) {
    cachedDefaultBuilder ??= loadSharedRendererRustVideoFrameDecodeRequestBuilderOnce({
      importWasmModule: defaultImportWasmModule,
      fallbackAllowed,
      warn,
    });
    return cachedDefaultBuilder;
  }

  return loadSharedRendererRustVideoFrameDecodeRequestBuilderOnce({
    importWasmModule: importWasmModule ?? defaultImportWasmModule,
    fallbackAllowed,
    warn,
  });
};

export const createSharedRendererRustVideoFrameDecodeRequestBuilder = (
  wasmModule: SharedRendererRustVideoFrameDecodeRequestWasmModule
): SharedRendererVideoFrameDecodeRequestBuilder =>
  (input: SharedRendererVideoFrameDecodeRequestInput): SharedRendererVideoFrameDecodeRequestResult =>
    normaliseRustVideoFrameDecodeRequestResult(
      wasmModule.build_video_frame_decode_requests(input.snapshot, input.media)
    );

const loadSharedRendererRustVideoFrameDecodeRequestBuilderOnce = async ({
  importWasmModule,
  fallbackAllowed,
  warn,
}: Required<Pick<LoadSharedRendererRustVideoFrameDecodeRequestBuilderInput, 'fallbackAllowed' | 'importWasmModule' | 'warn'>>): Promise<SharedRendererVideoFrameDecodeRequestBuilder | null> => {
  try {
    const wasmModule = await importWasmModule();
    if (typeof wasmModule.default === 'function') {
      await wasmModule.default();
    }
    return createSharedRendererRustVideoFrameDecodeRequestBuilder(wasmModule);
  } catch (error) {
    warn(
      fallbackAllowed
        ? 'Rust/WASM video frame decode request builder could not be loaded; falling back to TypeScript.'
        : 'Rust/WASM video frame decode request builder could not be loaded; Rust video control plane is required.',
      error
    );
    return null;
  }
};

const normaliseRustVideoFrameDecodeRequestResult = (
  result: unknown
): SharedRendererVideoFrameDecodeRequestResult => {
  if (!isRecord(result)) {
    return {
      ok: true,
      requestCount: 0,
      requests: [],
    };
  }

  if (result.ok !== true) {
    return {
      ok: false,
      reason: 'invalidVideoMediaReference',
      detail: stringValue(result.detail),
      mediaId: stringValue(result.media_id),
    };
  }

  const requests = normaliseRequests(result.requests);
  return {
    ok: true,
    requestCount: numberValue(result.request_count),
    requests,
  };
};

const normaliseRequests = (requests: unknown): SharedRendererVideoFrameDecodeRequest[] => {
  if (!Array.isArray(requests)) return [];

  return requests
    .filter(isRecord)
    .map((request) => ({
      clipId: stringValue(request.clip_id),
      mediaId: stringValue(request.media_id),
      source: stringValue(request.source),
      sourceFrame: numberValue(request.source_frame),
      sourceRate: frameRateValue(request.source_rate),
      timelineFrame: numberValue(request.timeline_frame),
      width: numberValue(request.width),
      height: numberValue(request.height),
      format: videoFrameFormatValue(request.format),
      colour: videoDecodeColourValue(request.colour),
    }));
};

const videoFrameFormatValue = (value: unknown): SharedRendererDecodedVideoFrameFormat =>
  value === 'rgba8Srgb' ? 'rgba8Srgb' : 'rgba8Srgb';

const videoDecodeColourValue = (value: unknown): SharedRendererVideoDecodeColour =>
  value === 'rec709SrgbFullRange' ? 'rec709SrgbFullRange' : 'rec709SrgbFullRange';

const frameRateValue = (value: unknown): RustFrameRate => {
  if (!isRecord(value)) {
    return { numerator: 1, denominator: 1 };
  }
  return {
    numerator: numberValue(value.numerator),
    denominator: numberValue(value.denominator),
  };
};

const numberValue = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

const stringValue = (value: unknown): string =>
  typeof value === 'string' ? value : '';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const defaultImportWasmModule = async (): Promise<SharedRendererRustVideoFrameDecodeRequestWasmLoadedModule> =>
  import('../wasm/rust-core/uxfd_rust_core_wasm.js') as Promise<SharedRendererRustVideoFrameDecodeRequestWasmLoadedModule>;

const defaultWarn = (message: string, error: unknown) => {
  console.warn(message, error);
};
