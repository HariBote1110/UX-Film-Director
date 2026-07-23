import { describe, expect, it } from 'vitest';
import {
  createSharedRendererScenePreviewScheduler,
  type SharedRendererSceneEvaluation,
  type SharedRendererScenePreviewSchedulerRpc,
} from './sharedRendererScenePreviewScheduler';

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

const deferred = <T,>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
};

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

const revision = (value: number) => ({
  sceneId: 'preview:main',
  revision: value,
  project: { id: `project-${value}` },
  media: [],
});

const evaluation = (sceneId: string, revisionValue: number, frameIndex: number): SharedRendererSceneEvaluation => ({
  sceneId,
  revision: revisionValue,
  frameIndex,
  snapshot: { frame_index: frameIndex, clips: [] },
  media: [],
});

describe('sharedRendererScenePreviewScheduler', () => {
  it('評価中の10→11→12をlatest-winsで畳み、10をpresentせず12だけ評価する', async () => {
    const replace = deferred<ReturnType<SharedRendererScenePreviewSchedulerRpc['replaceScene']> extends Promise<infer T> ? T : never>();
    const firstEvaluate = deferred<ReturnType<SharedRendererScenePreviewSchedulerRpc['evaluateScene']> extends Promise<infer T> ? T : never>();
    const evaluateCalls: number[] = [];
    const presented: SharedRendererSceneEvaluation[] = [];
    const rpc: SharedRendererScenePreviewSchedulerRpc = {
      replaceScene: () => replace.promise,
      evaluateScene: (input) => {
        evaluateCalls.push(input.frameIndex);
        return evaluateCalls.length === 1
          ? firstEvaluate.promise
          : Promise.resolve({ ok: true, value: evaluation(input.sceneId, input.revision, input.frameIndex) });
      },
    };
    const scheduler = createSharedRendererScenePreviewScheduler({ rpc, onEvaluation: (value) => presented.push(value) });

    scheduler.submitRevision(revision(1));
    scheduler.requestFrame(10);
    replace.resolve({ ok: true, value: { sceneId: 'preview:main', revision: 1 } });
    await flush();
    scheduler.requestFrame(11);
    scheduler.requestFrame(12);
    firstEvaluate.resolve({ ok: true, value: evaluation('preview:main', 1, 10) });
    await flush();

    expect(evaluateCalls).toEqual([10, 12]);
    expect(presented.map((entry) => entry.frameIndex)).toEqual([12]);
    expect(scheduler.diagnostics).toMatchObject({ requested: 2, resolved: 2, stale: 1, coalesced: 1, failed: 0 });
  });

  it('replace r1の実行中にr2/r3を受けたとき、r1の後はr3だけを送る', async () => {
    const replaces: Array<{ input: { revision: number }; deferred: Deferred<any> }> = [];
    const rpc: SharedRendererScenePreviewSchedulerRpc = {
      replaceScene: (input) => {
        const next = deferred<any>();
        replaces.push({ input, deferred: next });
        return next.promise;
      },
      evaluateScene: async (input) => ({ ok: true, value: evaluation(input.sceneId, input.revision, input.frameIndex) }),
    };
    const scheduler = createSharedRendererScenePreviewScheduler({ rpc, onEvaluation: () => {} });

    scheduler.submitRevision(revision(1));
    scheduler.requestFrame(5);
    scheduler.submitRevision(revision(2));
    scheduler.submitRevision(revision(3));
    expect(replaces.map((entry) => entry.input.revision)).toEqual([1]);
    replaces[0].deferred.resolve({ ok: true, value: { sceneId: 'preview:main', revision: 1 } });
    await flush();
    expect(replaces.map((entry) => entry.input.revision)).toEqual([1, 3]);
    replaces[1].deferred.resolve({ ok: true, value: { sceneId: 'preview:main', revision: 3 } });
    await flush();

    expect(scheduler.diagnostics).toMatchObject({ requested: 1, resolved: 1, stale: 0, coalesced: 0, failed: 0 });
  });

  it('revision更新後に完了した旧evaluate結果をpresentしない', async () => {
    const evaluationDeferred = deferred<any>();
    const presented: SharedRendererSceneEvaluation[] = [];
    const rpc: SharedRendererScenePreviewSchedulerRpc = {
      replaceScene: async (input) => ({ ok: true, value: { sceneId: input.sceneId, revision: input.revision } }),
      evaluateScene: (input) => input.revision === 1
        ? evaluationDeferred.promise
        : Promise.resolve({ ok: true, value: evaluation(input.sceneId, input.revision, input.frameIndex) }),
    };
    const scheduler = createSharedRendererScenePreviewScheduler({ rpc, onEvaluation: (value) => presented.push(value) });

    scheduler.submitRevision(revision(1));
    scheduler.requestFrame(9);
    await flush();
    scheduler.submitRevision(revision(2));
    evaluationDeferred.resolve({ ok: true, value: evaluation('preview:main', 1, 9) });
    await flush();

    expect(presented.map((entry) => `${entry.revision}:${entry.frameIndex}`)).toEqual(['2:9']);
    expect(scheduler.diagnostics.stale).toBe(1);
  });

  it('dispose後は完了したRPC結果を無視する', async () => {
    const replace = deferred<any>();
    const presented: SharedRendererSceneEvaluation[] = [];
    const scheduler = createSharedRendererScenePreviewScheduler({
      rpc: {
        replaceScene: () => replace.promise,
        evaluateScene: async (input) => ({ ok: true, value: evaluation(input.sceneId, input.revision, input.frameIndex) }),
      },
      onEvaluation: (value) => presented.push(value),
    });

    scheduler.submitRevision(revision(1));
    scheduler.requestFrame(1);
    scheduler.dispose();
    replace.resolve({ ok: true, value: { sceneId: 'preview:main', revision: 1 } });
    await flush();

    expect(presented).toEqual([]);
    expect(scheduler.diagnostics).toMatchObject({ requested: 0, resolved: 0, stale: 0, coalesced: 0, failed: 0 });
  });

  it('未対応編集でinvalidateした後は、実行中の旧評価結果をpresentしない', async () => {
    const evaluationDeferred = deferred<any>();
    const presented: SharedRendererSceneEvaluation[] = [];
    const scheduler = createSharedRendererScenePreviewScheduler({
      rpc: {
        replaceScene: async (input) => ({ ok: true, value: { sceneId: input.sceneId, revision: input.revision } }),
        evaluateScene: () => evaluationDeferred.promise,
      },
      onEvaluation: (value) => presented.push(value),
    });

    scheduler.submitRevision(revision(1));
    scheduler.requestFrame(14);
    await flush();
    scheduler.invalidate();
    evaluationDeferred.resolve({ ok: true, value: evaluation('preview:main', 1, 14) });
    await flush();

    expect(presented).toEqual([]);
    expect(scheduler.diagnostics.stale).toBe(1);
  });

  it('scene RPC失敗を呼び出し側へ通知し、同じrevisionの評価を停止する', async () => {
    const failures: string[] = [];
    const rpc: SharedRendererScenePreviewSchedulerRpc = {
      replaceScene: async (input) => ({ ok: true, value: { sceneId: input.sceneId, revision: input.revision } }),
      evaluateScene: async () => ({ ok: false, reason: 'backendFailure', detail: 'renderer unavailable' }),
    };
    const scheduler = createSharedRendererScenePreviewScheduler({
      rpc,
      onEvaluation: () => {},
      onFailure: (failure) => failures.push(`${failure.operation}:${failure.detail}`),
    });

    scheduler.submitRevision(revision(1));
    scheduler.requestFrame(2);
    await flush();
    scheduler.requestFrame(3);
    await flush();

    expect(failures).toEqual(['evaluate:renderer unavailable']);
    expect(scheduler.diagnostics).toMatchObject({ requested: 1, failed: 1 });
  });
});
