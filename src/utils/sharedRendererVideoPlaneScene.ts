import type {
  RustSceneMediaReference,
  RustSceneSnapshot,
} from './rustSceneSnapshot';

export interface SharedRendererVideoPlane {
  clipId: string;
  mediaId: string;
  sourceFrame: number;
  zIndex: number;
  opacity: number;
}

export type SharedRendererVideoPlaneVertexSceneResult = {
  ok: true;
  planeCount: number;
  planes: SharedRendererVideoPlane[];
  vertices: Float32Array;
};

export interface SharedRendererVideoPlaneVertexSceneInput {
  snapshot: RustSceneSnapshot;
  media: RustSceneMediaReference[];
  canvas: {
    width: number;
    height: number;
  };
}

export type SharedRendererVideoPlaneVertexSceneBuilder = (
  input: SharedRendererVideoPlaneVertexSceneInput
) => SharedRendererVideoPlaneVertexSceneResult;

export const buildSharedRendererVideoPlaneVertexScene: SharedRendererVideoPlaneVertexSceneBuilder = ({
  snapshot,
  media,
  canvas,
}) => {
  const mediaById = new Map(media.map((reference) => [reference.id, reference]));
  const videoClips = [...snapshot.clips]
    .sort((left, right) => left.z_index - right.z_index)
    .filter((clip) => mediaById.get(clip.media_id)?.kind === 'Video');
  const planes: SharedRendererVideoPlane[] = [];
  const vertices = new Float32Array(videoClips.length * 6 * 8);
  let offset = 0;

  videoClips.forEach((clip) => {
    const reference = mediaById.get(clip.media_id);
    if (!reference) return;

    const opacity = clamp01(clip.opacity);
    planes.push({
      clipId: clip.clip_id,
      mediaId: clip.media_id,
      sourceFrame: clip.source_frame,
      zIndex: clip.z_index,
      opacity,
    });

    const left = pixelXToClip(clip.transform.translation_x, canvas.width);
    const right = pixelXToClip(clip.transform.translation_x + reference.width * clip.transform.scale_x, canvas.width);
    const top = pixelYToClip(clip.transform.translation_y, canvas.height);
    const bottom = pixelYToClip(clip.transform.translation_y + reference.height * clip.transform.scale_y, canvas.height);
    const points = [
      [left, top, 0, 0],
      [right, top, 1, 0],
      [left, bottom, 0, 1],
      [left, bottom, 0, 1],
      [right, top, 1, 0],
      [right, bottom, 1, 1],
    ] as const;
    points.forEach(([x, y, u, v]) => {
      vertices.set([x, y, u, v, opacity, 1, 0, 1], offset);
      offset += 8;
    });
  });

  return {
    ok: true,
    planeCount: planes.length,
    planes,
    vertices: offset === vertices.length ? vertices : vertices.slice(0, offset),
  };
};

const pixelXToClip = (x: number, canvasWidth: number): number =>
  (x / canvasWidth) * 2 - 1;

const pixelYToClip = (y: number, canvasHeight: number): number =>
  1 - (y / canvasHeight) * 2;

const clamp01 = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
};
