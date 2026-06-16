import type {
  SharedRendererVideoPlane,
  SharedRendererVideoPlaneVertexSceneBuilder,
  SharedRendererVideoPlaneVertexSceneInput,
  SharedRendererVideoPlaneVertexSceneResult,
} from './sharedRendererVideoPlaneScene';

export interface SharedRendererRustVideoPlaneWasmModule {
  build_video_plane_vertex_scene: (
    snapshot: unknown,
    media: unknown,
    canvasWidth: number,
    canvasHeight: number
  ) => unknown;
}

export type SharedRendererRustVideoPlaneWasmLoadedModule =
  SharedRendererRustVideoPlaneWasmModule & {
    default?: () => Promise<unknown> | unknown;
  };

export interface LoadSharedRendererRustVideoPlaneVertexSceneBuilderInput {
  enabled?: boolean;
  importWasmModule?: () => Promise<SharedRendererRustVideoPlaneWasmLoadedModule>;
  warn?: (message: string, error: unknown) => void;
}

let cachedDefaultBuilder: Promise<SharedRendererVideoPlaneVertexSceneBuilder | null> | null = null;

export const loadSharedRendererRustVideoPlaneVertexSceneBuilder = async ({
  enabled = true,
  importWasmModule,
  warn = defaultWarn,
}: LoadSharedRendererRustVideoPlaneVertexSceneBuilderInput = {}): Promise<SharedRendererVideoPlaneVertexSceneBuilder | null> => {
  if (!enabled) return null;

  if (!importWasmModule) {
    cachedDefaultBuilder ??= loadSharedRendererRustVideoPlaneVertexSceneBuilderOnce({
      importWasmModule: defaultImportWasmModule,
      warn,
    });
    return cachedDefaultBuilder;
  }

  return loadSharedRendererRustVideoPlaneVertexSceneBuilderOnce({
    importWasmModule,
    warn,
  });
};

export const createSharedRendererRustVideoPlaneVertexSceneBuilder = (
  wasmModule: SharedRendererRustVideoPlaneWasmModule
): SharedRendererVideoPlaneVertexSceneBuilder =>
  (input: SharedRendererVideoPlaneVertexSceneInput): SharedRendererVideoPlaneVertexSceneResult =>
    normaliseRustVideoPlaneVertexSceneResult(
      wasmModule.build_video_plane_vertex_scene(
        input.snapshot,
        input.media,
        input.canvas.width,
        input.canvas.height
      )
    );

const loadSharedRendererRustVideoPlaneVertexSceneBuilderOnce = async ({
  importWasmModule,
  warn,
}: Required<Pick<LoadSharedRendererRustVideoPlaneVertexSceneBuilderInput, 'importWasmModule' | 'warn'>>): Promise<SharedRendererVideoPlaneVertexSceneBuilder | null> => {
  try {
    const wasmModule = await importWasmModule();
    if (typeof wasmModule.default === 'function') {
      await wasmModule.default();
    }
    return createSharedRendererRustVideoPlaneVertexSceneBuilder(wasmModule);
  } catch (error) {
    warn('Rust/WASM video plane scene builder could not be loaded; falling back to TypeScript.', error);
    return null;
  }
};

const normaliseRustVideoPlaneVertexSceneResult = (
  result: unknown
): SharedRendererVideoPlaneVertexSceneResult => {
  if (!isRecord(result) || result.ok !== true) {
    return {
      ok: true,
      planeCount: 0,
      planes: [],
      vertices: new Float32Array(),
    };
  }

  return {
    ok: true,
    planeCount: numberValue(result.plane_count),
    planes: normalisePlanes(result.planes),
    vertices: normaliseVertices(result.vertices),
  };
};

const normalisePlanes = (planes: unknown): SharedRendererVideoPlane[] => {
  if (!Array.isArray(planes)) return [];
  return planes
    .filter(isRecord)
    .map((plane) => ({
      clipId: stringValue(plane.clip_id),
      mediaId: stringValue(plane.media_id),
      sourceFrame: numberValue(plane.source_frame),
      zIndex: numberValue(plane.z_index),
      opacity: numberValue(plane.opacity),
    }));
};

const normaliseVertices = (vertices: unknown): Float32Array => {
  if (vertices instanceof Float32Array) return vertices;
  if (Array.isArray(vertices)) return new Float32Array(vertices);
  return new Float32Array();
};

const numberValue = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

const stringValue = (value: unknown): string =>
  typeof value === 'string' ? value : '';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const defaultImportWasmModule = async (): Promise<SharedRendererRustVideoPlaneWasmLoadedModule> =>
  import('../wasm/rust-core/uxfd_rust_core_wasm.js') as Promise<SharedRendererRustVideoPlaneWasmLoadedModule>;

const defaultWarn = (message: string, error: unknown) => {
  console.warn(message, error);
};
