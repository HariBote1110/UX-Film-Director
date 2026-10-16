import { describe, expect, it, vi } from 'vitest';
import type { TimelineObject } from '../types';
import { createSharedRendererExportEvaluationProvider } from './sharedRendererExportEvaluationProvider';

const evaluation = (frameIndex: number, revision: number) => ({
  sceneId: 'export-scene',
  revision,
  frameIndex,
  snapshot: { frame_index: frameIndex, clips: [] },
  media: [],
});

describe('createSharedRendererExportEvaluationProvider', () => {
  it('同じgraphではreplaceを一度だけ行い、各frameをRustでevaluateする', async () => {
    const objects = [] as TimelineObject[];
    const prepareScene = vi.fn(async () => ({ sceneId: 'export-scene', revision: 7 }));
    const evaluateScene = vi.fn(async ({ frameIndex }: { sceneId: string; revision: number; frameIndex: number }) => (
      evaluation(frameIndex, 7)
    ));
    const evaluate = createSharedRendererExportEvaluationProvider({ prepareScene, evaluateScene });

    const first = await evaluate({ objects, frameIndex: 1 });
    const second = await evaluate({ objects, frameIndex: 2 });

    expect(prepareScene).toHaveBeenCalledTimes(1);
    expect(prepareScene).toHaveBeenCalledWith(objects);
    expect(evaluateScene.mock.calls.map(([request]) => request.frameIndex)).toEqual([1, 2]);
    expect(first?.frameIndex).toBe(1);
    expect(second?.frameIndex).toBe(2);
  });

  it('graphが変わると新しいscene revisionを準備する', async () => {
    const prepareScene = vi.fn(async (_objects: TimelineObject[]) => ({
      sceneId: 'export-scene',
      revision: prepareScene.mock.calls.length,
    }));
    const evaluateScene = vi.fn(async ({ frameIndex, revision }: { sceneId: string; revision: number; frameIndex: number }) => (
      evaluation(frameIndex, revision)
    ));
    const evaluate = createSharedRendererExportEvaluationProvider({ prepareScene, evaluateScene });

    await evaluate({ objects: [] as TimelineObject[], frameIndex: 1 });
    await evaluate({ objects: [] as TimelineObject[], frameIndex: 2 });

    expect(prepareScene).toHaveBeenCalledTimes(2);
    expect(evaluateScene.mock.calls.map(([request]) => request.revision)).toEqual([1, 2]);
  });

  it('Rust builderがgraphを受理しない場合は未評価を返し、呼出側が既存serializerへ戻せる', async () => {
    const objects = [] as TimelineObject[];
    const prepareScene = vi.fn(async () => null);
    const evaluateScene = vi.fn();
    const evaluate = createSharedRendererExportEvaluationProvider({ prepareScene, evaluateScene });

    await expect(evaluate({ objects, frameIndex: 1 })).resolves.toBeNull();
    expect(evaluateScene).not.toHaveBeenCalled();
  });
});
