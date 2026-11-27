import type { RustSceneMediaReference, RustSceneSnapshot, RustTransform } from './rustSceneContract';
import { cssPointToWorldPoint, type SceneHitTestViewport } from './sceneHitTest';

export interface RustEvaluatedGeometryFrame {
  sceneId: string;
  revision: number;
  frameIndex: number;
  snapshot: RustSceneSnapshot;
  media: readonly RustSceneMediaReference[];
}

export interface RustEvaluatedGeometryIdentity {
  sceneId: string;
  revision: number;
  frameIndex: number;
}

export interface RustEvaluatedObjectGeometry {
  objectId: string;
  mediaId: string;
  zIndex: number;
  width: number;
  height: number;
  transform: RustTransform;
  worldCorners: {
    topLeft: { x: number; y: number };
    topRight: { x: number; y: number };
    bottomLeft: { x: number; y: number };
    bottomRight: { x: number; y: number };
  };
  logicalOrigin: { x: number; y: number };
}

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const rotate = (x: number, y: number, degrees: number) => {
  const radians = degrees * Math.PI / 180;
  const clean = (value: number) => Math.abs(value) < 1e-12 ? 0 : value;
  return {
    x: clean(x * Math.cos(radians) - y * Math.sin(radians)),
    y: clean(x * Math.sin(radians) + y * Math.cos(radians)),
  };
};

const parseRenderOffset = (media: RustSceneMediaReference): { x: number; y: number } => {
  if (media.kind !== 'Text') return { x: 0, y: 0 };
  try {
    const source = JSON.parse(media.source) as Record<string, unknown>;
    return {
      x: finite(source.__renderOffsetX) ? source.__renderOffsetX : 0,
      y: finite(source.__renderOffsetY) ? source.__renderOffsetY : 0,
    };
  } catch {
    return { x: 0, y: 0 };
  }
};

export const getRustEvaluatedObjectGeometry = (
  frame: RustEvaluatedGeometryFrame,
  objectId: string
): RustEvaluatedObjectGeometry | null => {
  const clip = frame.snapshot.clips.find((candidate) => candidate.clip_id === objectId);
  if (!clip) return null;
  const media = frame.media.find((candidate) => candidate.id === clip.media_id);
  if (!media || !finite(media.width) || !finite(media.height) || media.width <= 0 || media.height <= 0) return null;
  const transform = clip.transform;
  if (![transform.translation_x, transform.translation_y, transform.scale_x, transform.scale_y, transform.rotation_degrees].every(finite)) return null;
  const toWorld = (x: number, y: number) => {
    const rotated = rotate(x * transform.scale_x, y * transform.scale_y, transform.rotation_degrees);
    const clean = (value: number) => Math.abs(value) < 1e-12 ? 0 : value;
    return { x: clean(transform.translation_x + rotated.x), y: clean(transform.translation_y + rotated.y) };
  };
  const offset = parseRenderOffset(media);
  const logicalOffset = toWorld(offset.x, offset.y);
  return {
    objectId,
    mediaId: media.id,
    zIndex: clip.z_index,
    width: media.width,
    height: media.height,
    transform,
    worldCorners: {
      topLeft: toWorld(0, 0),
      topRight: toWorld(media.width, 0),
      bottomLeft: toWorld(0, media.height),
      bottomRight: toWorld(media.width, media.height),
    },
    logicalOrigin: offset.x === 0 && offset.y === 0
      ? { x: transform.translation_x, y: transform.translation_y }
      : logicalOffset,
  };
};

export const getRustEvaluatedObjectLogicalOrigin = (frame: RustEvaluatedGeometryFrame, objectId: string) =>
  getRustEvaluatedObjectGeometry(frame, objectId)?.logicalOrigin ?? null;

export const rustEvaluatedObjectLocalPointToWorld = (
  frame: RustEvaluatedGeometryFrame,
  objectId: string,
  local: { x: number; y: number },
): { x: number; y: number } | null => {
  const geometry = getRustEvaluatedObjectGeometry(frame, objectId);
  if (!geometry || !finite(local.x) || !finite(local.y)) return null;
  const point = rotate(local.x * geometry.transform.scale_x, local.y * geometry.transform.scale_y, geometry.transform.rotation_degrees);
  return {
    x: geometry.transform.translation_x + point.x,
    y: geometry.transform.translation_y + point.y,
  };
};

const matchesIdentity = (frame: RustEvaluatedGeometryFrame, expected: RustEvaluatedGeometryIdentity) =>
  frame.sceneId === expected.sceneId && frame.revision === expected.revision && frame.frameIndex === expected.frameIndex &&
  frame.snapshot.frame_index === expected.frameIndex;

export const hitTestRustEvaluatedScene = (params: {
  cssX: number;
  cssY: number;
  frame: RustEvaluatedGeometryFrame | null;
  expected: RustEvaluatedGeometryIdentity;
  viewport: SceneHitTestViewport;
}): string | null => {
  const { frame, expected, viewport } = params;
  if (!frame || !matchesIdentity(frame, expected)) return null;
  const world = cssPointToWorldPoint(params.cssX, params.cssY, viewport);
  let hit: string | null = null;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const clip of frame.snapshot.clips) {
    const geometry = getRustEvaluatedObjectGeometry(frame, clip.clip_id);
    if (!geometry || clip.z_index < maxZ) continue;
    const transform = geometry.transform;
    if (transform.scale_x === 0 || transform.scale_y === 0) continue;
    const delta = { x: world.x - transform.translation_x, y: world.y - transform.translation_y };
    const localRotated = rotate(delta.x, delta.y, -transform.rotation_degrees);
    const x = localRotated.x / transform.scale_x;
    const y = localRotated.y / transform.scale_y;
    if (x >= 0 && x <= geometry.width && y >= 0 && y <= geometry.height) {
      hit = clip.clip_id;
      maxZ = clip.z_index;
    }
  }
  return hit;
};
