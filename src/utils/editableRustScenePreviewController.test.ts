import { describe, expect, it, vi } from 'vitest';
import type { LayerState, ProjectSettings, ShapeObject } from '../types';
import type { SharedRendererScenePreviewScheduler } from './sharedRendererScenePreviewScheduler';
import { createEditableRustScenePreviewController } from './editableRustScenePreviewController';

const projectSettings: ProjectSettings = {
  width: 1920,
  height: 1080,
  fps: 60,
  sampleRate: 48_000,
};

const layers: LayerState[] = [{
  id: 'layer-0',
  name: 'Layer 0',
  visible: true,
  locked: false,
}];

const shape = (patch: Partial<ShapeObject> = {}): ShapeObject => ({
  id: 'shape-1',
  type: 'shape',
  name: 'Shape',
  layer: 0,
  startTime: 0,
  duration: 5,
  x: 10,
  y: 20,
  endX: 10,
  endY: 20,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  enableAnimation: false,
  easing: 'linear',
  width: 320,
  height: 180,
  shapeType: 'rect',
  fill: '#ff0000',
  ...patch,
});

const scheduler = () => ({
  submitRevision: vi.fn(),
  requestFrame: vi.fn(),
  invalidate: vi.fn(),
  dispose: vi.fn(),
  diagnostics: { requested: 0, resolved: 0, stale: 0, coalesced: 0, failed: 0 },
}) satisfies SharedRendererScenePreviewScheduler;

describe('editableRustScenePreviewController', () => {
  it('編集時だけProjectを更新してrevisionを進め、時刻更新はframe要求だけを送る', () => {
    const sceneScheduler = scheduler();
    const controller = createEditableRustScenePreviewController({
      sceneId: 'preview:project-1',
      scheduler: sceneScheduler,
    });

    expect(controller.replaceScene({ projectSettings, layers, objects: [shape()] })).toMatchObject({
      ok: true,
      revision: 1,
    });
    controller.requestTime(1.25, 60);
    expect(controller.replaceScene({ projectSettings, layers, objects: [shape({ x: 40 })] })).toMatchObject({
      ok: true,
      revision: 2,
    });

    expect(sceneScheduler.submitRevision).toHaveBeenCalledTimes(2);
    expect(sceneScheduler.submitRevision.mock.calls.map(([payload]) => payload.revision)).toEqual([1, 2]);
    expect(sceneScheduler.requestFrame).toHaveBeenCalledWith(75);
    expect(sceneScheduler.invalidate).not.toHaveBeenCalled();
  });

  it('未対応編集は旧sceneを無効化し、問題を呼び出し側へ返す', () => {
    const sceneScheduler = scheduler();
    const controller = createEditableRustScenePreviewController({
      sceneId: 'preview:project-1',
      scheduler: sceneScheduler,
    });

    controller.replaceScene({ projectSettings, layers, objects: [shape()] });
    const result = controller.replaceScene({
      projectSettings,
      layers,
      objects: [shape({ groupId: 'group-1' })],
    });

    expect(result).toMatchObject({
      ok: false,
      issues: [{ objectId: 'shape-1', code: 'unsupportedGroup' }],
    });
    expect(sceneScheduler.invalidate).toHaveBeenCalledTimes(1);
    expect(sceneScheduler.submitRevision).toHaveBeenCalledTimes(1);
  });
});
