import type { RustBackendSceneEvaluation } from './rustBackendSceneControl';
import type { RustSceneMediaReference, RustSceneSnapshot } from './rustSceneContract';
import type { RustEvaluatedGeometryFrame } from './rustSceneEvaluatedGeometry';

let currentFrame: RustEvaluatedGeometryFrame | null = null;
let expectedIdentity: { sceneId: string; revision: number } | null = null;
const listeners = new Set<() => void>();

export const expectRustSceneEvaluatedGeometryRevision = (
  identity: { sceneId: string; revision: number } | null,
): void => {
  expectedIdentity = identity;
  if (currentFrame && identity
    && (currentFrame.sceneId !== identity.sceneId || currentFrame.revision !== identity.revision)) {
    clearRustSceneEvaluatedGeometryFrame();
  } else if (!identity) {
    clearRustSceneEvaluatedGeometryFrame();
  }
};

export const getRustSceneEvaluatedGeometryFrame = (): RustEvaluatedGeometryFrame | null => currentFrame;

export const subscribeRustSceneEvaluatedGeometryFrame = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const publishRustSceneEvaluatedGeometryFrame = (evaluation: RustBackendSceneEvaluation): void => {
  if (expectedIdentity && (evaluation.sceneId !== expectedIdentity.sceneId || evaluation.revision !== expectedIdentity.revision)) return;
  if (currentFrame && currentFrame.sceneId === evaluation.sceneId && evaluation.revision < currentFrame.revision) return;
  const nextFrame: RustEvaluatedGeometryFrame = {
    sceneId: evaluation.sceneId,
    revision: evaluation.revision,
    frameIndex: evaluation.frameIndex,
    snapshot: evaluation.snapshot as RustSceneSnapshot,
    media: evaluation.media as readonly RustSceneMediaReference[],
  };
  if (currentFrame?.sceneId === nextFrame.sceneId
    && currentFrame.revision === nextFrame.revision
    && currentFrame.frameIndex === nextFrame.frameIndex) return;
  currentFrame = nextFrame;
  listeners.forEach((listener) => listener());
};

export const clearRustSceneEvaluatedGeometryFrame = (sceneId?: string, revision?: number): void => {
  if (!currentFrame) return;
  if (sceneId && currentFrame.sceneId !== sceneId) return;
  if (revision !== undefined && currentFrame.revision > revision) return;
  currentFrame = null;
  listeners.forEach((listener) => listener());
};
