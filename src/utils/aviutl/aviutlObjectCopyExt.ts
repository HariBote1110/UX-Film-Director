import type { TimelineObject } from '../../types';

export interface AviUtlObjectCopyExtCloneOptions {
  copies?: number;
  offsetX?: number;
  offsetY?: number;
  timeOffsetSeconds?: number;
  layerOffset?: number;
  idFactory?: (sourceId: string, copyIndex: number, keyframeId?: string, keyframeIndex?: number) => string;
  maxLayer?: number;
}

const defaultIdFactory = (sourceId: string, copyIndex: number, keyframeId?: string, keyframeIndex?: number): string => {
  if (keyframeId !== undefined && keyframeIndex !== undefined) {
    return `${sourceId}-object-copy-ext-${copyIndex}-${keyframeId}-${keyframeIndex}`;
  }
  return `${sourceId}-object-copy-ext-${copyIndex}`;
};

export const buildAviUtlObjectCopyExtClones = (
  objects: TimelineObject[],
  options: AviUtlObjectCopyExtCloneOptions = {}
): TimelineObject[] => {
  const copies = Math.max(1, Math.min(24, Math.round(finiteNumberOr(options.copies, 3))));
  const offsetX = finiteNumberOr(options.offsetX, 16);
  const offsetY = finiteNumberOr(options.offsetY, 16);
  const timeOffsetSeconds = finiteNumberOr(options.timeOffsetSeconds, 0.1);
  const layerOffset = Math.round(finiteNumberOr(options.layerOffset, 1));
  const maxLayer = Math.max(0, Math.round(finiteNumberOr(options.maxLayer, 99)));
  const idFactory = options.idFactory ?? defaultIdFactory;
  const clones: TimelineObject[] = [];

  objects.forEach((source) => {
    for (let copyIndex = 1; copyIndex <= copies; copyIndex += 1) {
      const xDelta = offsetX * copyIndex;
      const yDelta = offsetY * copyIndex;
      const timeDelta = timeOffsetSeconds * copyIndex;
      const clone = cloneTimelineObject(source);
      const cloneId = idFactory(source.id, copyIndex);

      clone.id = cloneId;
      clone.name = `${source.name} ObjectCopyEXT ${copyIndex}`;
      clone.layer = clamp(Math.round(source.layer + layerOffset * copyIndex), 0, maxLayer);
      clone.startTime = roundTime(Math.max(0, source.startTime + timeDelta));
      clone.x = roundPosition(source.x + xDelta);
      clone.y = roundPosition(source.y + yDelta);
      clone.endX = roundPosition((source.endX ?? source.x) + xDelta);
      clone.endY = roundPosition((source.endY ?? source.y) + yDelta);

      if (clone.motionPath) {
        clone.motionPath = clone.motionPath.map((point) => ({
          ...point,
          x: roundPosition(point.x + xDelta),
          y: roundPosition(point.y + yDelta)
        }));
      }

      if (clone.keyframes) {
        clone.keyframes = clone.keyframes.map((keyframe, keyframeIndex) => ({
          ...keyframe,
          id: `${cloneId}-${keyframe.id}-${keyframeIndex + 1}`,
          time: roundTime(keyframe.time + timeDelta),
          x: roundPosition(keyframe.x + xDelta),
          y: roundPosition(keyframe.y + yDelta)
        }));
      }

      if (clone.groupId) {
        clone.groupId = `${clone.groupId}-object-copy-ext-${copyIndex}`;
      }

      clones.push(clone);
    }
  });

  return clones;
};

const cloneTimelineObject = (object: TimelineObject): TimelineObject =>
  JSON.parse(JSON.stringify(object)) as TimelineObject;

const finiteNumberOr = (value: unknown, fallback: number): number => (
  typeof value === 'number' && Number.isFinite(value) ? value : fallback
);

const roundTime = (value: number): number => Math.round(value * 1000) / 1000;
const roundPosition = (value: number): number => Math.round(value * 1000) / 1000;
const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
