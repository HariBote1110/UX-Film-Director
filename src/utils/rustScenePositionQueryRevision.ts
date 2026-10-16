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

export class RustScenePositionQueryCancelledError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RustScenePositionQueryCancelledError';
  }
}

export const isRustScenePositionQueryCancelled = (error: unknown): error is RustScenePositionQueryCancelledError => (
  error instanceof RustScenePositionQueryCancelledError
);

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
  revision: number | null;
  resolve: (revision: number) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}

let currentTarget: RustScenePositionQueryTarget | null = null;
let currentResident: RustScenePositionQueryResident | null = null;
let currentFailure: { sceneId: string; revision?: number; detail: string } | null = null;
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
    if (sameGraph(waiter.target, currentTarget) && waiter.revision === currentResident.revision) {
      settleWaiter(waiter, undefined, currentResident.revision);
    }
  }
};

export const publishRustScenePositionQueryTarget = (target: RustScenePositionQueryTarget): void => {
  const previous = currentTarget;
  currentTarget = target;
  currentFailure = null;
  for (const waiter of waiters) {
    if (!sameGraph(waiter.target, target)
      || (waiter.revision !== null && waiter.revision !== target.revision)) {
      settleWaiter(waiter, new RustScenePositionQueryCancelledError(
        'Rust scene position query was superseded by a newer graph revision.'
      ));
    } else if (waiter.revision === null) {
      waiter.revision = target.revision;
    }
  }
  if (previous && sameGraph(previous, target) && previous.revision !== target.revision) {
    currentResident = null;
  }
  resolveAcknowledgedWaiters();
};

export const publishRustScenePositionQueryResident = (
  resident: RustScenePositionQueryResident | null,
): void => {
  if (!resident) return;
  if (!currentTarget
    || resident.sceneId !== currentTarget.sceneId
    || resident.revision !== currentTarget.revision) return;
  currentResident = resident;
  resolveAcknowledgedWaiters();
};

export const publishRustScenePositionQueryFailure = (
  sceneId: string,
  detail: string,
  revision?: number,
): void => {
  if (revision !== undefined && currentTarget
    && (currentTarget.sceneId !== sceneId || currentTarget.revision !== revision)) return;
  currentFailure = { sceneId, ...(revision !== undefined ? { revision } : {}), detail };
  for (const waiter of waiters) {
    if (waiter.target.sceneId === sceneId
      && (revision === undefined || waiter.revision === revision)) {
      settleWaiter(waiter, new Error(`Rust scene position query is unavailable: ${detail}`));
    }
  }
};

export const clearRustScenePositionQueryRevision = (detail = 'controller disposed'): void => {
  currentTarget = null;
  currentResident = null;
  currentFailure = null;
  for (const waiter of waiters) {
    settleWaiter(waiter, new RustScenePositionQueryCancelledError(
      `Rust scene position query is unavailable: ${detail}`
    ));
  }
};

export const waitForRustScenePositionQueryRevision = (
  target: RustScenePositionQueryTarget,
): Promise<number> => {
  if (currentFailure?.sceneId === target.sceneId) {
    if (currentFailure.revision === undefined
      || (currentTarget?.sceneId === target.sceneId
        && sameGraph(target, currentTarget)
        && currentFailure.revision === currentTarget.revision)) {
      return Promise.reject(new Error(`Rust scene position query is unavailable: ${currentFailure.detail}`));
    }
  }
  if (currentTarget && currentResident
    && sameGraph(target, currentTarget)
    && currentResident.sceneId === target.sceneId
    && currentResident.revision === currentTarget.revision) {
    return Promise.resolve(currentResident.revision);
  }

  return new Promise((resolve, reject) => {
    const waiter: PendingWaiter = {
      target,
      revision: currentTarget && sameGraph(target, currentTarget) ? currentTarget.revision : null,
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
