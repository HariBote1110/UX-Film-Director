import { describe, expect, it, vi } from 'vitest';
import type { LayerState, ProjectSettings, PsdObject, ShapeObject, VideoObject } from '../types';
import type { SharedRendererScenePreviewScheduler } from './sharedRendererScenePreviewScheduler';
import {
  createEditableRustScenePreviewController,
  shouldAttachEditableRustScene,
  shouldUseRawEditableSceneGraphOnly,
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

const video = (patch: Partial<VideoObject> = {}): VideoObject => ({
  ...shape(),
  id: 'video-1',
  type: 'video',
  name: 'Video',
  src: 'blob:video',
  filePath: '/media/original.mp4',
  proxyFilePath: '/media/proxy.mp4',
  offset: 0,
  width: 1280,
  height: 720,
  volume: 1,
  muted: false,
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
    ['1', undefined, undefined, true],
    [undefined, 'basic', undefined, true],
    [undefined, '  basic,generated  ', undefined, true],
    [undefined, '', undefined, true],
    ['0', undefined, undefined, true],
    [undefined, undefined, '0', false],
  ] as const)('dual-run=%s、cut-over=%s、raw=%s のRust graph経路判定は %s', (dualRun, cutover, raw, expected) => {
    expect(shouldAttachEditableRustScene(dualRun, cutover, raw)).toBe(expected);
  });
  it('raw graph専用flagが既存のeditable scene controllerを有効化する', () => {
    expect(shouldAttachEditableRustScene(undefined, undefined, '1')).toBe(true);
  });

  it.each([
    ['1', true],
    ['0', false],
    [undefined, true],
  ] as const)('raw-graph-only flag=%s は %s', (flag, expected) => {
    expect(shouldUseRawEditableSceneGraphOnly(flag)).toBe(expected);
  });

  it('編集時だけraw graphを更新してrevisionを進め、時刻更新はframe要求だけを送る', () => {
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
    expect(sceneScheduler.submitRevision.mock.calls[0][0]).toMatchObject({
      editableScene: { mediaContext: { purpose: 'previewProxy' } },
    });
    expect(sceneScheduler.submitRevision.mock.calls[0][0]).not.toHaveProperty('project');
    expect(sceneScheduler.submitRevision.mock.calls[0][0]).not.toHaveProperty('media');
    expect(sceneScheduler.requestFrame).toHaveBeenCalledWith(75);
    expect(sceneScheduler.invalidate).not.toHaveBeenCalled();
  });

  it('既定preview経路はRust builder向けのraw graphだけを送る', () => {
    const sceneScheduler = scheduler();
    const controller = createEditableRustScenePreviewController({
      sceneId: 'preview:project-1',
      scheduler: sceneScheduler,
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
    expect(payload).not.toHaveProperty('project');
    expect(payload).not.toHaveProperty('media');
  });

  it('raw graph専用モードはTS builderを通さずproject/mediaを送らない', () => {
    const sceneScheduler = scheduler();
    const controller = createEditableRustScenePreviewController({
      sceneId: 'preview:project-1',
      scheduler: sceneScheduler,
      initialRevision: 40,
    });
    const unsupportedUntilBackendBuilds = shape({ clipping: true });

    expect(controller.replaceScene({
      projectSettings,
      layers,
      objects: [unsupportedUntilBackendBuilds],
    })).toEqual({ ok: true, revision: 41 });

    const payload = sceneScheduler.submitRevision.mock.calls[0][0];
    expect(payload).toMatchObject({
      sceneId: 'preview:project-1',
      revision: 41,
      editableScene: {
        settings: projectSettings,
        layers,
        objects: [unsupportedUntilBackendBuilds],
        mediaContext: { purpose: 'previewProxy', sceneId: 'preview:project-1' },
      },
    });
    expect(payload).not.toHaveProperty('project');
    expect(payload).not.toHaveProperty('media');
    expect(() => structuredClone(payload)).not.toThrow();
  });

  it('raw graph exportはexportOriginalを送りPSDのruntime値を除く', async () => {
    const sceneScheduler = scheduler();
    const controller = createEditableRustScenePreviewController({
      sceneId: 'preview:project-1',
      scheduler: sceneScheduler,
      initialRevision: 40,
    });

    await controller.confirmSceneForExport({
      sceneId: 'export:project-1',
      projectSettings,
      layers,
      objects: [psdWithRuntimeFields()],
    });

    const payload = sceneScheduler.confirmExportRevision.mock.calls[0][0];
    expect(payload).toMatchObject({
      editableScene: {
        mediaContext: { purpose: 'exportOriginal', sceneId: 'export:project-1' },
      },
    });
    expect(payload).not.toHaveProperty('project');
    expect(payload).not.toHaveProperty('media');
    expect((payload.editableScene?.objects[0] as PsdObject).file).toBeUndefined();
    expect(() => structuredClone(payload)).not.toThrow();
  });

  it('exportは現在graphのreplace成功を確認したrevisionを取得する', async () => {
    const sceneScheduler = scheduler();
    const controller = createEditableRustScenePreviewController({
      sceneId: 'preview:project-1',
      scheduler: sceneScheduler,
      initialRevision: 40,
    });

    await expect(controller.confirmSceneForExport({
      sceneId: 'export:project-1', projectSettings, layers, objects: [shape()],
    })).resolves.toEqual({ sceneId: 'export:project-1', revision: 41, sceneSource: 'rust' });
    expect(sceneScheduler.confirmExportRevision).toHaveBeenCalledWith(expect.objectContaining({
      sceneId: 'export:project-1',
      revision: 41,
      editableScene: expect.objectContaining({ mediaContext: { purpose: 'exportOriginal', sceneId: 'export:project-1' } }),
    }));
  });

  it('default exportはexportOriginalのraw graphだけをRustへ送る', async () => {
    const sceneScheduler = scheduler();
    const controller = createEditableRustScenePreviewController({
      sceneId: 'preview:project-1',
      scheduler: sceneScheduler,
      initialRevision: 40,
    });

    await controller.confirmSceneForExport({
      sceneId: 'export:project-1',
      projectSettings,
      layers,
      objects: [video()],
    });

    const payload = sceneScheduler.confirmExportRevision.mock.calls[0][0];
    expect(payload).toMatchObject({
      editableScene: {
        mediaContext: { purpose: 'exportOriginal', sceneId: 'export:project-1' },
      },
    });
    expect(payload).not.toHaveProperty('project');
    expect(payload).not.toHaveProperty('media');
  });

  it('eligibilityはRust側へ委譲し未対応graphもraw payloadで送る', async () => {
    const sceneScheduler = scheduler();
    const controller = createEditableRustScenePreviewController({
      sceneId: 'preview:project-1',
      scheduler: sceneScheduler,
    });

    await expect(controller.confirmSceneForExport({
      sceneId: 'export:project-1',
      projectSettings,
      layers,
      objects: [shape({ clipping: true })],
    })).resolves.toMatchObject({ sceneSource: 'rust' });
    expect(sceneScheduler.confirmExportRevision).toHaveBeenCalledWith(expect.objectContaining({
      editableScene: expect.objectContaining({
        objects: [expect.objectContaining({ clipping: true })],
      }),
    }));
  });

  it('export確認のeditableSceneからPSDのIPC非clone runtime値を除去する', async () => {
    const sceneScheduler = scheduler();
    const controller = createEditableRustScenePreviewController({
      sceneId: 'preview:project-1',
      scheduler: sceneScheduler,
      initialRevision: 40,
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

  it('未対応編集もRust eligibility判定へ委譲する', () => {
    const sceneScheduler = scheduler();
    const controller = createEditableRustScenePreviewController({
      sceneId: 'preview:project-1',
      scheduler: sceneScheduler,
      initialRevision: 40,
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

    expect(result).toEqual({ ok: true, revision: 42 });
    expect(sceneScheduler.invalidate).not.toHaveBeenCalled();
    expect(sceneScheduler.submitRevision).toHaveBeenCalledTimes(2);
    expect(sceneScheduler.submitRevision.mock.calls[1][0].editableScene?.objects[0]).toMatchObject({
      groupId: 'group-1',
      groupGradient: { enabled: true },
    });
  });
});
