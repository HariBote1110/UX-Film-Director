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

export interface SharedRendererSolidColourDrawListInput {
  snapshot: RustSceneSnapshot;
  media: RustSceneMediaReference[];
  canvas: {
    width: number;
    height: number;
  };
}

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
