export interface RustScenePositionQueryTarget {
  sceneId: string;
  revision: number;
  projectSettings: object;
  layers: readonly unknown[];
  objects: readonly unknown[];
}

export interface RustScenePositionQueryResident {
  sceneId: string;
  revision: number;
}

export interface RustScenePositionQueryActionIdentity {
  activeSceneId: string | null;
  selectedObjectId: string;
  timeSeconds: number;
  projectSettings: object;
  layers: readonly unknown[];
  objects: readonly unknown[];
}

export const isRustScenePositionQueryActionCurrent = (
  captured: RustScenePositionQueryActionIdentity,
  current: RustScenePositionQueryActionIdentity,
): boolean => captured.activeSceneId === current.activeSceneId
  && captured.selectedObjectId === current.selectedObjectId
  && captured.timeSeconds === current.timeSeconds
  && captured.projectSettings === current.projectSettings
  && captured.layers === current.layers
  && captured.objects === current.objects;

interface PendingWaiter {
  target: RustScenePositionQueryTarget;
  resolve: (revision: number) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}

let currentTarget: RustScenePositionQueryTarget | null = null;
let currentResident: RustScenePositionQueryResident | null = null;
let currentFailure: { sceneId: string; detail: string } | null = null;
const waiters = new Set<PendingWaiter>();

const sameGraph = (left: RustScenePositionQueryTarget, right: RustScenePositionQueryTarget): boolean => (
  left.sceneId === right.sceneId
  && left.projectSettings === right.projectSettings
  && left.layers === right.layers
  && left.objects === right.objects
);

const settleWaiter = (waiter: PendingWaiter, error?: Error, revision?: number) => {
  clearTimeout(waiter.timeoutId);
  waiters.delete(waiter);
  if (error) waiter.reject(error);
  else waiter.resolve(revision ?? waiter.target.revision);
};

const resolveAcknowledgedWaiters = () => {
  if (!currentTarget || !currentResident
    || currentTarget.sceneId !== currentResident.sceneId
    || currentTarget.revision !== currentResident.revision) return;
  for (const waiter of waiters) {
    if (sameGraph(waiter.target, currentTarget)) {
      settleWaiter(waiter, undefined, currentResident.revision);
    }
  }
};

export const publishRustScenePositionQueryTarget = (target: RustScenePositionQueryTarget): void => {
  const previous = currentTarget;
  currentTarget = target;
  currentFailure = null;
  if (!previous || !sameGraph(previous, target)) {
    for (const waiter of waiters) {
      if (!sameGraph(waiter.target, target)) {
        settleWaiter(waiter, new Error('Rust scene position query was superseded by a newer graph.'));
      }
    }
  }
  resolveAcknowledgedWaiters();
};

export const publishRustScenePositionQueryResident = (
  resident: RustScenePositionQueryResident | null,
): void => {
  currentResident = resident;
  resolveAcknowledgedWaiters();
};

export const publishRustScenePositionQueryFailure = (sceneId: string, detail: string): void => {
  currentFailure = { sceneId, detail };
  for (const waiter of waiters) {
    if (waiter.target.sceneId === sceneId) {
      settleWaiter(waiter, new Error(`Rust scene position query is unavailable: ${detail}`));
    }
  }
};

export const clearRustScenePositionQueryRevision = (detail = 'controller disposed'): void => {
  currentTarget = null;
  currentResident = null;
  currentFailure = null;
  for (const waiter of waiters) {
    settleWaiter(waiter, new Error(`Rust scene position query is unavailable: ${detail}`));
  }
};

export const waitForRustScenePositionQueryRevision = (
  target: RustScenePositionQueryTarget,
): Promise<number> => {
  if (currentFailure?.sceneId === target.sceneId) {
    return Promise.reject(new Error(`Rust scene position query is unavailable: ${currentFailure.detail}`));
  }
  if (currentTarget && currentResident
    && sameGraph(target, currentTarget)
    && target.revision === currentTarget.revision
    && currentResident.sceneId === target.sceneId
    && currentResident.revision === target.revision) {
    return Promise.resolve(currentResident.revision);
  }

  return new Promise((resolve, reject) => {
    const waiter: PendingWaiter = {
      target,
      resolve,
      reject,
      timeoutId: setTimeout(() => {
        settleWaiter(waiter, new Error('Timed out waiting for the current Rust scene revision.'));
      }, 10_000),
    };
    waiters.add(waiter);
    resolveAcknowledgedWaiters();
  });
};
