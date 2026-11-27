import { describe, expect, it } from 'vitest';
import { approxEqualStageCamera3D, shouldApplyIncomingStageCamera } from './stageCameraSyncPolicy';
import type { StageCamera3D } from '../../types';

const camA: StageCamera3D = {
  position: { x: 1, y: 2, z: 3 },
  target: { x: 0, y: 0, z: 0 },
};

const camB: StageCamera3D = {
  position: { x: 5, y: 6, z: 7 },
  target: { x: 1, y: 1, z: 1 },
};

describe('approxEqualStageCamera3D', () => {
  it('returns true for identical poses', () => {
    expect(approxEqualStageCamera3D(camA, { ...camA })).toBe(true);
  });

  it('returns true when the difference is within epsilon', () => {
    const nearlyA: StageCamera3D = {
      position: { x: camA.position.x + 1e-9, y: camA.position.y, z: camA.position.z },
      target: { ...camA.target },
    };
    expect(approxEqualStageCamera3D(camA, nearlyA)).toBe(true);
  });

  it('returns false for genuinely different poses', () => {
    expect(approxEqualStageCamera3D(camA, camB)).toBe(false);
  });
});

describe('shouldApplyIncomingStageCamera', () => {
  it('never applies while the user is actively dragging, even if incoming changed', () => {
    expect(shouldApplyIncomingStageCamera(camA, camB, true)).toBe(false);
  });

  it('does not re-apply the same value that was just persisted (avoids clobbering local state on an unrelated re-render)', () => {
    // ドラッグ終了→setStageCamera3D で永続化した値(camB)が lastApplied として
    // 追跡されている状態で、無関係な再レンダーにより同じ camB が incoming として
    // 戻ってきても、適用(=巻き戻し)は不要。
    expect(shouldApplyIncomingStageCamera(camB, camB, false)).toBe(false);
  });

  it('applies a genuinely new external value (e.g. project load / scene switch)', () => {
    expect(shouldApplyIncomingStageCamera(camA, camB, false)).toBe(true);
  });
});
