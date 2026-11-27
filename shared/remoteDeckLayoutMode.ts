/**
 * Viewport classification for the responsive deck UI. Pure so the
 * breakpoint logic is unit-testable without a DOM.
 */

export type RemoteDeckLayoutMode = 'phone-portrait' | 'phone-landscape' | 'tablet';

/** Shorter-side threshold above which the two-pane tablet layout is used. */
export const TABLET_MIN_SHORT_SIDE_PX = 768;

export const resolveRemoteDeckLayoutMode = (viewport: {
  width: number;
  height: number;
}): RemoteDeckLayoutMode => {
  const width = Number.isFinite(viewport.width) ? viewport.width : 0;
  const height = Number.isFinite(viewport.height) ? viewport.height : 0;
  if (width <= 0 || height <= 0) return 'phone-portrait';
  if (Math.min(width, height) >= TABLET_MIN_SHORT_SIDE_PX) return 'tablet';
  return width > height ? 'phone-landscape' : 'phone-portrait';
};

/** Transport grid column count per layout mode. */
export const gridColumnsForMode = (
  mode: RemoteDeckLayoutMode,
  baseColumns: number,
): number => {
  if (mode === 'tablet') return baseColumns + 1;
  if (mode === 'phone-landscape') return Math.max(1, baseColumns - 1);
  return baseColumns;
};
