import type { PreviewDisplayMode } from '../types';

const MIN_SCALE = 0.05;
const PANEL_EPS = 16;
const FIT_MARGIN = 0.96;

/** Legacy-style fallback when the panel has not been measured yet (matches previous 800px baseline, capped). */
export const fallbackAutoFitScale = (projectWidth: number, projectHeight: number): number => {
  const base = Math.max(projectWidth, projectHeight, 1);
  return Math.min(0.7, 800 / base);
};

export function computePreviewDisplayScale(
  mode: PreviewDisplayMode,
  projectWidth: number,
  projectHeight: number,
  panelWidth: number,
  panelHeight: number
): number {
  const pw = Math.max(1, projectWidth);
  const ph = Math.max(1, projectHeight);

  if (mode === 'pixelPerfect') {
    return 1;
  }

  if (!Number.isFinite(panelWidth) || !Number.isFinite(panelHeight)
    || panelWidth < PANEL_EPS || panelHeight < PANEL_EPS) {
    return fallbackAutoFitScale(pw, ph);
  }

  const fit = Math.min(panelWidth / pw, panelHeight / ph) * FIT_MARGIN;
  return Math.max(MIN_SCALE, fit);
}
