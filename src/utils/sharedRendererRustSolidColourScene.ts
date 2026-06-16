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
