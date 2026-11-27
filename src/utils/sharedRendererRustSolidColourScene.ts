import type {
  SharedRendererSolidColourDrawListInput,
  SharedRendererSolidColourVertexSceneBuilder,
  SharedRendererSolidColourVertexSceneResult,
} from './sharedRendererSolidColourScene';

export interface SharedRendererRustSolidColourWasmModule {
  build_solid_colour_vertex_scene: (
    snapshot: unknown,
    media: unknown,
    canvasWidth: number,
    canvasHeight: number
  ) => unknown;
}

export type SharedRendererRustSolidColourWasmLoadedModule =
  SharedRendererRustSolidColourWasmModule & {
    default?: () => Promise<unknown> | unknown;
  };

export interface LoadSharedRendererRustSolidColourVertexSceneBuilderInput {
  enabled?: boolean;
  importWasmModule?: () => Promise<SharedRendererRustSolidColourWasmLoadedModule>;
  warn?: (message: string, error: unknown) => void;
}

let cachedDefaultBuilder: Promise<SharedRendererSolidColourVertexSceneBuilder | null> | null = null;

export const loadSharedRendererRustSolidColourVertexSceneBuilder = async ({
  enabled = true,
  importWasmModule,
  warn = defaultWarn,
}: LoadSharedRendererRustSolidColourVertexSceneBuilderInput = {}): Promise<SharedRendererSolidColourVertexSceneBuilder | null> => {
  if (!enabled) return null;

  if (!importWasmModule) {
    cachedDefaultBuilder ??= loadSharedRendererRustSolidColourVertexSceneBuilderOnce({
      importWasmModule: defaultImportWasmModule,
      warn,
    });
    return cachedDefaultBuilder;
  }

  return loadSharedRendererRustSolidColourVertexSceneBuilderOnce({
    importWasmModule,
    warn,
  });
};

export const createSharedRendererRustSolidColourVertexSceneBuilder = (
  wasmModule: SharedRendererRustSolidColourWasmModule
): SharedRendererSolidColourVertexSceneBuilder =>
  (input: SharedRendererSolidColourDrawListInput): SharedRendererSolidColourVertexSceneResult =>
    normaliseRustSolidColourVertexSceneResult(
      wasmModule.build_solid_colour_vertex_scene(
        input.snapshot,
        input.media,
        input.canvas.width,
        input.canvas.height
      )
    );

const loadSharedRendererRustSolidColourVertexSceneBuilderOnce = async ({
  importWasmModule,
  warn,
}: Required<Pick<LoadSharedRendererRustSolidColourVertexSceneBuilderInput, 'importWasmModule' | 'warn'>>): Promise<SharedRendererSolidColourVertexSceneBuilder | null> => {
  try {
    const wasmModule = await importWasmModule();
    if (typeof wasmModule.default === 'function') {
      await wasmModule.default();
    }
    return createSharedRendererRustSolidColourVertexSceneBuilder(wasmModule);
  } catch (error) {
    warn('Rust/WASM solid colour scene builder could not be loaded; falling back to TypeScript.', error);
    return null;
  }
};

const normaliseRustSolidColourVertexSceneResult = (
  result: unknown
): SharedRendererSolidColourVertexSceneResult => {
  if (!isRecord(result)) {
    return unsupportedColourSource('unknown', 'Rust solid colour scene builder returned a non-object result.');
  }

  if (result.ok === false) {
    return unsupportedColourSource(
      stringValue(result.media_id) || 'unknown',
      stringValue(result.detail) || 'Rust solid colour scene builder failed.'
    );
  }

  if (result.ok !== true) {
    return unsupportedColourSource('unknown', 'Rust solid colour scene builder returned an unknown result.');
  }

  return {
    ok: true,
    rectCount: numberValue(result.rect_count),
    vertices: normaliseVertices(result.vertices),
  };
};

const normaliseVertices = (vertices: unknown): Float32Array => {
  if (vertices instanceof Float32Array) return vertices;
  if (Array.isArray(vertices)) return new Float32Array(vertices);
  return new Float32Array();
};

const unsupportedColourSource = (
  mediaId: string,
  detail: string
): SharedRendererSolidColourVertexSceneResult => ({
  ok: false,
  reason: 'unsupportedColourSource',
  detail,
  mediaId,
});

const numberValue = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

const stringValue = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const defaultImportWasmModule = async (): Promise<SharedRendererRustSolidColourWasmLoadedModule> =>
  import('../wasm/rust-core/uxfd_rust_core_wasm.js') as Promise<SharedRendererRustSolidColourWasmLoadedModule>;

const defaultWarn = (message: string, error: unknown) => {
  console.warn(message, error);
};
