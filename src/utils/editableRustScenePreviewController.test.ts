import { describe, expect, it, vi } from 'vitest';
import type { LayerState, ProjectSettings, PsdObject, ShapeObject } from '../types';
import type { SharedRendererScenePreviewScheduler } from './sharedRendererScenePreviewScheduler';
import {
  createEditableRustScenePreviewController,
  shouldAttachEditableRustScene,
} from './editableRustScenePreviewController';

const projectSettings: ProjectSettings = {
  width: 1920,
  height: 1080,
  fps: 60,
  sampleRate: 48_000,
};

const layers: LayerState[] = [{
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

const psdWithRuntimeFields = (): PsdObject => ({
  ...shape(),
  id: 'psd-1',
  type: 'psd',
  name: 'PSD',
  src: 'file:///tmp/example.psd',
  filePath: '/tmp/example.psd',
  scale: 1,
  file: { runtimeOnly: true } as unknown as File,
  rootLayer: {
    id: 'root',
    name: 'Root',
    isGroup: true,
    isRadio: false,
    children: [{
      id: 'psd-layer-1',
      name: 'Layer',
      isGroup: false,
      isRadio: false,
      children: [],
      width: 320,
      height: 180,
      left: 0,
      top: 0,
      defaultVisible: true,
      src: 'uxfd:psd-layer:psd-layer-1',
      textureSource: (() => undefined) as unknown as ImageBitmap,
    }],
    width: 320,
    height: 180,
    left: 0,
    top: 0,
    defaultVisible: true,
  },
});

const scheduler = () => ({
  submitRevision: vi.fn(),
  confirmExportRevision: vi.fn().mockResolvedValue({ sceneId: 'export:project-1', revision: 41, sceneSource: 'rust' }),
  requestFrame: vi.fn(),
  invalidate: vi.fn(),
  dispose: vi.fn(),
  diagnostics: { requested: 0, resolved: 0, stale: 0, coalesced: 0, failed: 0 },
}) satisfies SharedRendererScenePreviewScheduler;

describe('editableRustScenePreviewController', () => {
  it.each([
    ['1', undefined, true],
    [undefined, 'basic', true],
    [undefined, '  basic,generated  ', true],
    [undefined, '', false],
    ['0', undefined, false],
  ])('dual-run=%s、cut-over=%s の editableScene 添付判定は %s', (dualRun, cutover, expected) => {
    expect(shouldAttachEditableRustScene(dualRun, cutover)).toBe(expected);
  });

  it('編集時だけProjectを更新してrevisionを進め、時刻更新はframe要求だけを送る', () => {
    const sceneScheduler = scheduler();
    const controller = createEditableRustScenePreviewController({
      sceneId: 'preview:project-1',
      scheduler: sceneScheduler,
      initialRevision: 40,
    });

    expect(controller.replaceScene({ projectSettings, layers, objects: [shape()] })).toMatchObject({
      ok: true,
      revision: 41,
    });
    controller.requestTime(1.25, 60);
    expect(controller.replaceScene({ projectSettings, layers, objects: [shape({ x: 40 })] })).toMatchObject({
      ok: true,
      revision: 42,
    });

    expect(sceneScheduler.submitRevision).toHaveBeenCalledTimes(2);
    expect(sceneScheduler.submitRevision.mock.calls.map(([payload]) => payload.revision)).toEqual([41, 42]);
    expect(sceneScheduler.submitRevision.mock.calls[0][0]).not.toHaveProperty('editableScene');
    expect(sceneScheduler.requestFrame).toHaveBeenCalledWith(75);
    expect(sceneScheduler.invalidate).not.toHaveBeenCalled();
  });

  it('renderer flagが有効なときだけ同じZustand入力からeditableSceneを追加する', () => {
    const sceneScheduler = scheduler();
    const controller = createEditableRustScenePreviewController({
      sceneId: 'preview:project-1',
      scheduler: sceneScheduler,
      includeEditableScene: true,
      initialRevision: 40,
    });

    controller.replaceScene({ projectSettings, layers, objects: [shape()] });
    const payload = sceneScheduler.submitRevision.mock.calls[0][0];
    expect(payload).toMatchObject({
      editableScene: {
        settings: projectSettings,
        layers,
        objects: [shape()],
        // Rust builder は mediaContext.sceneId を Project.id に使うため、TS の sceneId と揃える。
        mediaContext: { purpose: 'previewProxy', sceneId: 'preview:project-1' },
      },
    });
  });

  it('exportは現在graphのreplace成功を確認したrevisionを取得する', async () => {
    const sceneScheduler = scheduler();
    const controller = createEditableRustScenePreviewController({
      sceneId: 'preview:project-1',
      scheduler: sceneScheduler,
      initialRevision: 40,
      includeEditableScene: true,
    });

    await expect(controller.confirmSceneForExport({
      sceneId: 'export:project-1', projectSettings, layers, objects: [shape()],
    })).resolves.toEqual({ sceneId: 'export:project-1', revision: 41, sceneSource: 'rust' });
    expect(sceneScheduler.confirmExportRevision).toHaveBeenCalledWith(expect.objectContaining({
      sceneId: 'export:project-1', revision: 41, editableScene: expect.any(Object),
    }));
  });

  it('export確認のeditableSceneからPSDのIPC非clone runtime値を除去する', async () => {
    const sceneScheduler = scheduler();
    const controller = createEditableRustScenePreviewController({
      sceneId: 'preview:project-1',
      scheduler: sceneScheduler,
      initialRevision: 40,
      includeEditableScene: true,
    });

    await controller.confirmSceneForExport({
      sceneId: 'export:project-1', projectSettings, layers, objects: [psdWithRuntimeFields()],
    });

    const payload = sceneScheduler.confirmExportRevision.mock.calls[0][0];
    const psd = payload.editableScene?.objects[0] as PsdObject;
    expect(psd.file).toBeUndefined();
    expect(psd.rootLayer?.children[0].textureSource).toBeUndefined();
    expect(() => structuredClone(payload)).not.toThrow();
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
      objects: [shape({
        groupId: 'group-1',
        groupGradient: {
          enabled: true,
          type: 'linear',
          scope: 'group',
          colours: ['#000000', '#ffffff'],
          stops: [0, 1],
          direction: 0,
        },
      })],
    });

    expect(result).toMatchObject({
      ok: false,
      issues: [{ objectId: 'shape-1', code: 'unsupportedGroup' }],
    });
    expect(sceneScheduler.invalidate).toHaveBeenCalledTimes(1);
    expect(sceneScheduler.submitRevision).toHaveBeenCalledTimes(1);
  });
});
