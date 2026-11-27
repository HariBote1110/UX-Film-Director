/**
 * TouchBar-style slider maths for the mobile deck (Phase 4). Pure functions
 * so they are unit-testable without a DOM.
 */

export interface ComputeSliderValueInput {
  startValue: number;
  /** Horizontal drag distance in px since the pointer went down. */
  deltaX: number;
  /** Width of the slider track in px (full width spans the full range). */
  trackWidth: number;
  min: number;
  max: number;
  /**
   * Vertical distance in px from the track. The further the finger moves
   * vertically, the finer the adjustment (TouchBar-style precision mode).
   */
  verticalOffset?: number;
  step?: number;
}

const FINE_ADJUST_FALLOFF_PX = 100;

export const computeSliderValue = (input: ComputeSliderValueInput): number => {
  const verticalOffset = Math.abs(input.verticalOffset ?? 0);
  const gain = 1 / (1 + verticalOffset / FINE_ADJUST_FALLOFF_PX);
  const range = input.max - input.min;
  const raw = input.startValue + (input.deltaX / input.trackWidth) * range * gain;
  const clamped = Math.min(input.max, Math.max(input.min, raw));
  if (!input.step || input.step <= 0) return clamped;
  const quantised = Math.round(clamped / input.step) * input.step;
  return Math.min(input.max, Math.max(input.min, quantised));
};

export interface SendThrottle {
  /** Returns the value when it may be sent now, or null when suppressed. */
  offer: (value: number) => number | null;
  /** Returns the last suppressed value (for the pointer-up commit), once. */
  flush: () => number | null;
}

export const createSendThrottle = (options: {
  intervalMs: number;
  now?: () => number;
}): SendThrottle => {
  const now = options.now ?? (() => Date.now());
  let lastSentAt: number | null = null;
  let pending: number | null = null;

  return {
    offer: (value) => {
      const time = now();
      if (lastSentAt !== null && time - lastSentAt < options.intervalMs) {
        pending = value;
        return null;
      }
      lastSentAt = time;
      pending = null;
      return value;
    },
    flush: () => {
      const value = pending;
      pending = null;
      return value;
    },
  };
};

export interface ComputeRelativeDragValueInput {
  startValue: number;
  /** Horizontal drag distance in px since the pointer went down. */
  deltaX: number;
  /** How many value units one pixel of horizontal drag represents. */
  unitPerPx: number;
  /** Vertical distance in px; larger offsets give finer adjustment. */
  verticalOffset?: number;
  min?: number;
  max?: number;
  step?: number;
}

/**
 * Relative (infinite) drag for unbounded values such as x/y position:
 * the value moves by drag distance × unitPerPx, with the same
 * vertical-offset fine-adjust behaviour as the slider.
 */
export const computeRelativeDragValue = (input: ComputeRelativeDragValueInput): number => {
  const verticalOffset = Math.abs(input.verticalOffset ?? 0);
  const gain = 1 / (1 + verticalOffset / FINE_ADJUST_FALLOFF_PX);
  let value = input.startValue + input.deltaX * input.unitPerPx * gain;
  if (input.step && input.step > 0) value = Math.round(value / input.step) * input.step;
  if (typeof input.min === 'number') value = Math.max(input.min, value);
  if (typeof input.max === 'number') value = Math.min(input.max, value);
  return value;
};
