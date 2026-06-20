export type ScaleAxis = 'scaleX' | 'scaleY';

export interface AspectLockedScaleInput {
  currentScaleX: number;
  currentScaleY: number;
  changedAxis: ScaleAxis;
  nextValue: number;
  lockAspectRatio: boolean;
}

const isUsableScale = (value: number): boolean =>
  Number.isFinite(value) && Math.abs(value) > 1e-6;

export const buildAspectLockedScalePatch = ({
  currentScaleX,
  currentScaleY,
  changedAxis,
  nextValue,
  lockAspectRatio,
}: AspectLockedScaleInput): Partial<Record<ScaleAxis, number>> => {
  if (!lockAspectRatio) {
    return { [changedAxis]: nextValue };
  }

  if (changedAxis === 'scaleX') {
    const ratio = isUsableScale(currentScaleX)
      ? currentScaleY / currentScaleX
      : 1;
    return {
      scaleX: nextValue,
      scaleY: nextValue * ratio,
    };
  }

  const ratio = isUsableScale(currentScaleY)
    ? currentScaleX / currentScaleY
    : 1;
  return {
    scaleX: nextValue * ratio,
    scaleY: nextValue,
  };
};
