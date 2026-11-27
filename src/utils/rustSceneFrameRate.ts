import type { RustFrameRate } from './rustSceneContract';

export const secondsToFrameIndex = (seconds: number, fps: number): number => {
  const safeSeconds = Number.isFinite(seconds) ? seconds : 0;
  const safeFps = Number.isFinite(fps) && fps > 0 ? fps : 60;
  return Math.max(0, Math.round(safeSeconds * safeFps));
};

export const fpsToFrameRate = (fps: number): RustFrameRate => {
  const safeFps = Number.isFinite(fps) && fps > 0 ? fps : 60;
  const rounded = Math.round(safeFps);
  if (Math.abs(safeFps - rounded) < 1e-6) {
    return {
      numerator: rounded,
      denominator: 1,
    };
  }

  const denominator = 1000;
  const numerator = Math.max(1, Math.round(safeFps * denominator));
  const divisor = greatestCommonDivisor(numerator, denominator);
  return {
    numerator: numerator / divisor,
    denominator: denominator / divisor,
  };
};

const greatestCommonDivisor = (left: number, right: number): number => {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b !== 0) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a || 1;
};

