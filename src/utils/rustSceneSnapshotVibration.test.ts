import { describe, expect, it } from 'vitest';
import { createDefaultLayers } from './sceneState';
import { buildRustSceneSnapshotForTimeline } from './rustSceneSnapshot';
import { getVibrationOffset } from './sceneTransforms';
import { evaluateObjectPositionAtTime } from './keyframes';
import type { ProjectSettings, ShapeObject } from '../types';

const settings: ProjectSettings = {
  width: 1920,
  height: 1080,
  fps: 60,
  sampleRate: 48000,
};

const baseShape = (patch: Partial<ShapeObject> = {}): ShapeObject => ({
  id: 'shape-vibration-1',
  type: 'shape',
  name: 'Rectangle',
  layer: 0,
  startTime: 1,
  duration: 4,
  x: 300,
  y: 120,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  enableAnimation: false,
  endX: 300,
  endY: 120,
  easing: 'linear',
  shapeType: 'rect',
  width: 200,
  height: 100,
  fill: '#ff0000',
  ...patch,
});

describe('rustSceneSnapshot vibration filter', () => {
  it('振動フィルタ付きオブジェクトでも snapshot build が成功する（unsupportedFilter にならない）', () => {
    const object = baseShape({
      filters: [
        {
          id: 'filter-vibration-1',
          type: 'vibration',
          enabled: true,
          params: { strength: 12, speed: 2 },
        },
      ],
    });

    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers: createDefaultLayers(),
      objects: [object],
      time: 2,
    });

    expect(result.ok).toBe(true);
  });

  it('振動オフセットが transform の translation に畳み込まれる（Pixi 非依存の sceneTransforms と一致）', () => {
    const object = baseShape({
      filters: [
        {
          id: 'filter-vibration-1',
          type: 'vibration',
          enabled: true,
          params: { strength: 12, speed: 2 },
        },
      ],
    });
    const time = 2.35;

    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers: createDefaultLayers(),
      objects: [object],
      time,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const base = evaluateObjectPositionAtTime(object, time);
    const offset = getVibrationOffset(object, time);
    expect(offset.x).not.toBe(0);
    expect(offset.y).not.toBe(0);

    const clip = result.snapshot.clips[0];
    expect(clip.transform.translation_x).toBeCloseTo(base.x + offset.x, 6);
    expect(clip.transform.translation_y).toBeCloseTo(base.y + offset.y, 6);
  });

  it('振動フィルタが無いオブジェクトの translation は基準位置のまま', () => {
    const object = baseShape();
    const time = 2.35;

    const result = buildRustSceneSnapshotForTimeline({
      projectSettings: settings,
      layers: createDefaultLayers(),
      objects: [object],
      time,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const base = evaluateObjectPositionAtTime(object, time);
    const clip = result.snapshot.clips[0];
    expect(clip.transform.translation_x).toBeCloseTo(base.x, 6);
    expect(clip.transform.translation_y).toBeCloseTo(base.y, 6);
  });
});
