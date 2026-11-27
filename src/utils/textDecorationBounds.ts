export interface TextDecorationInsets {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface TextDecorationBoundsInput {
  strokeWidth?: number | null;
  shadow?: {
    offsetX?: number | null;
    offsetY?: number | null;
    blur?: number | null;
  } | null;
}

const nonNegativeFinite = (value: number | null | undefined): number => (
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0
);

/** Rust text renderer's one-pass box-blur radius, kept in lockstep with text.rs. */
const textShadowBlurRadius = (blur: number): number => {
  if (blur <= 0) return 0;
  const idealWidth = Math.floor((blur / 2 * 3 * Math.sqrt(2 * Math.PI) / 4) + 0.5);
  return Math.max(0, Math.floor(idealWidth / 2));
};

/** Returns the smallest integer padding that contains stroke and shadow pixels. */
export const getTextDecorationInsets = (
  { strokeWidth, shadow }: TextDecorationBoundsInput,
): TextDecorationInsets => {
  const stroke = nonNegativeFinite(strokeWidth);
  const blur = nonNegativeFinite(shadow?.blur);
  const blurSpread = textShadowBlurRadius(blur) * 3;
  const offsetX = typeof shadow?.offsetX === 'number' && Number.isFinite(shadow.offsetX)
    ? shadow.offsetX
    : 0;
  const offsetY = typeof shadow?.offsetY === 'number' && Number.isFinite(shadow.offsetY)
    ? shadow.offsetY
    : 0;

  return {
    left: Math.ceil(Math.max(stroke, blurSpread - offsetX)),
    top: Math.ceil(Math.max(stroke, blurSpread - offsetY)),
    right: Math.ceil(Math.max(stroke, blurSpread + offsetX)),
    bottom: Math.ceil(Math.max(stroke, blurSpread + offsetY)),
  };
};

/** Translation adjustment for a plane whose local origin moves to (-left, -top). */
export const compensateTextOriginForExpandedPlane = (
  insets: Pick<TextDecorationInsets, 'left' | 'top'>,
  scaleX: number,
  scaleY: number,
  rotationDegrees: number,
): { x: number; y: number } => {
  const angle = rotationDegrees * Math.PI / 180;
  const localX = insets.left * scaleX;
  const localY = insets.top * scaleY;
  if (localX === 0 && localY === 0) return { x: 0, y: 0 };
  return {
    x: -(localX * Math.cos(angle) - localY * Math.sin(angle)),
    y: -(localX * Math.sin(angle) + localY * Math.cos(angle)),
  };
};
