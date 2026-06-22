import type { TimelineObject } from '../../types';

export interface AviUtlCoordinateStoreEntry {
  objectId: string;
  index: number;
  x: number;
  y: number;
  z: number;
  layer: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  opacity: number;
}

export interface AviUtlCoordinateStoreSnapshot {
  name: string;
  entries: AviUtlCoordinateStoreEntry[];
}

export interface CaptureAviUtlCoordinateStoreOptions {
  name?: string;
}

export interface AviUtlCoordinateRecallPatch {
  id: string;
  patch: Pick<TimelineObject, 'x' | 'y' | 'endX' | 'endY' | 'rotation' | 'scaleX' | 'scaleY' | 'opacity'>;
}

const finiteNumberOr = (value: unknown, fallback: number): number => (
  typeof value === 'number' && Number.isFinite(value) ? value : fallback
);

export const captureAviUtlCoordinateStoreSnapshot = (
  objects: TimelineObject[],
  options: CaptureAviUtlCoordinateStoreOptions = {}
): AviUtlCoordinateStoreSnapshot => ({
  name: options.name?.trim() || 'default',
  entries: objects.map((object, index) => ({
    objectId: object.id,
    index,
    x: finiteNumberOr(object.x, 0),
    y: finiteNumberOr(object.y, 0),
    z: 0,
    layer: finiteNumberOr(object.layer, 0),
    rotation: finiteNumberOr(object.rotation, 0),
    scaleX: finiteNumberOr(object.scaleX, 1),
    scaleY: finiteNumberOr(object.scaleY, 1),
    opacity: finiteNumberOr(object.opacity, 1)
  }))
});

export const buildAviUtlCoordinateRecallPatches = (
  targetObjects: TimelineObject[],
  snapshot: AviUtlCoordinateStoreSnapshot | null | undefined
): AviUtlCoordinateRecallPatch[] => {
  if (!snapshot || snapshot.entries.length === 0 || targetObjects.length === 0) {
    return [];
  }

  return targetObjects.slice(0, snapshot.entries.length).map((object, index) => {
    const entry = snapshot.entries[index];
    return {
      id: object.id,
      patch: {
        x: entry.x,
        y: entry.y,
        endX: entry.x,
        endY: entry.y,
        rotation: entry.rotation,
        scaleX: entry.scaleX,
        scaleY: entry.scaleY,
        opacity: entry.opacity
      }
    };
  });
};
