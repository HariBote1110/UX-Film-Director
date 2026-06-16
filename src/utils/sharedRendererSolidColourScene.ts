import type {
  RustEvaluatedClip,
  RustSceneMediaReference,
  RustSceneSnapshot,
} from './rustSceneSnapshot';

export interface SharedRendererNormalisedColour {
  red: number;
  green: number;
  blue: number;
  alpha: number;
}

export type SharedRendererSolidColourParseResult =
  | {
      ok: true;
      colour: SharedRendererNormalisedColour;
    }
  | {
      ok: false;
      reason: 'unsupportedColourSource';
      detail: string;
    };

export interface SharedRendererSolidColourRect {
  clipId: string;
  zIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  colour: SharedRendererNormalisedColour;
}

export interface SharedRendererSolidColourVertexScene {
  rectCount: number;
  vertices: Float32Array;
}

export type SharedRendererSolidColourDrawListResult =
  | {
      ok: true;
      rects: SharedRendererSolidColourRect[];
    }
  | {
      ok: false;
      reason: 'unsupportedColourSource';
      detail: string;
      mediaId: string;
    };

export type SharedRendererSolidColourVertexSceneResult =
  | {
      ok: true;
      rectCount: number;
      vertices: Float32Array;
    }
  | {
      ok: false;
      reason: 'unsupportedColourSource';
      detail: string;
      mediaId: string;
    };

export interface SharedRendererSolidColourDrawListInput {
  snapshot: RustSceneSnapshot;
  media: RustSceneMediaReference[];
  canvas: {
    width: number;
    height: number;
  };
}

export type SharedRendererSolidColourVertexSceneBuilder = (
  input: SharedRendererSolidColourDrawListInput
) => SharedRendererSolidColourVertexSceneResult;

export const parseSharedRendererSolidColour = (source: string): SharedRendererSolidColourParseResult => {
  const match = /^#([0-9a-f]{6})$/i.exec(source.trim());
  if (!match) {
    return {
      ok: false,
      reason: 'unsupportedColourSource',
      detail: 'SolidColour media source must be a #rrggbb hex colour.',
    };
  }

  const value = match[1];
  return {
    ok: true,
    colour: {
      red: hexChannelToUnit(value.slice(0, 2)),
      green: hexChannelToUnit(value.slice(2, 4)),
      blue: hexChannelToUnit(value.slice(4, 6)),
      alpha: 1,
    },
  };
};

export const buildSharedRendererSolidColourVertexScene: SharedRendererSolidColourVertexSceneBuilder = (input) => {
  const drawList = buildSharedRendererSolidColourDrawList(input);
  if (!drawList.ok) {
    return drawList;
  }

  return {
    ok: true,
    rectCount: drawList.rects.length,
    vertices: buildSolidColourVertices(drawList.rects, input.canvas.width, input.canvas.height),
  };
};

export const buildSharedRendererSolidColourDrawList = ({
  snapshot,
  media,
}: SharedRendererSolidColourDrawListInput): SharedRendererSolidColourDrawListResult => {
  const mediaById = new Map(media.map((reference) => [reference.id, reference]));
  const rects: SharedRendererSolidColourRect[] = [];

  const sortedClips = [...snapshot.clips].sort((left, right) => left.z_index - right.z_index);
  for (const clip of sortedClips) {
    const reference = mediaById.get(clip.media_id);
    if (!reference || reference.kind !== 'SolidColour') continue;

    const parsed = parseSharedRendererSolidColour(reference.source);
    if (!parsed.ok) {
      return {
        ...parsed,
        mediaId: reference.id,
      };
    }

    rects.push(buildRect(clip, reference, parsed.colour));
  }

  return {
    ok: true,
    rects,
  };
};

const buildSolidColourVertices = (
  rects: SharedRendererSolidColourRect[],
  canvasWidth: number,
  canvasHeight: number
): Float32Array => {
  const vertices = new Float32Array(rects.length * 6 * 6);
  let offset = 0;
  rects.forEach((rect) => {
    const left = pixelXToClip(rect.x, canvasWidth);
    const right = pixelXToClip(rect.x + rect.width, canvasWidth);
    const top = pixelYToClip(rect.y, canvasHeight);
    const bottom = pixelYToClip(rect.y + rect.height, canvasHeight);
    const colour = [rect.colour.red, rect.colour.green, rect.colour.blue, rect.colour.alpha] as const;
    const points = [
      [left, top],
      [right, top],
      [left, bottom],
      [left, bottom],
      [right, top],
      [right, bottom],
    ] as const;
    points.forEach(([x, y]) => {
      vertices.set([x, y, ...colour], offset);
      offset += 6;
    });
  });
  return vertices;
};

const buildRect = (
  clip: RustEvaluatedClip,
  reference: RustSceneMediaReference,
  colour: SharedRendererNormalisedColour
): SharedRendererSolidColourRect => {
  const alpha = clamp01(colour.alpha * clip.opacity);
  return {
    clipId: clip.clip_id,
    zIndex: clip.z_index,
    x: clip.transform.translation_x,
    y: clip.transform.translation_y,
    width: reference.width * clip.transform.scale_x,
    height: reference.height * clip.transform.scale_y,
    colour: {
      red: colour.red * alpha,
      green: colour.green * alpha,
      blue: colour.blue * alpha,
      alpha,
    },
  };
};

const hexChannelToUnit = (hex: string): number =>
  Number.parseInt(hex, 16) / 255;

const clamp01 = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
};

const pixelXToClip = (x: number, canvasWidth: number): number =>
  (x / canvasWidth) * 2 - 1;

const pixelYToClip = (y: number, canvasHeight: number): number =>
  1 - (y / canvasHeight) * 2;
