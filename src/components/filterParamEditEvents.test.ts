import { describe, expect, it, vi } from 'vitest';
import { createFilterParamEditEventHandlers } from './filterParamEditEvents';

describe('filter parameter editor input events', () => {
  it('pointerup commits and the next keyboard edit starts a fresh session without changing input behaviour', () => {
    const begin = vi.fn();
    const commit = vi.fn();
    const handlers = createFilterParamEditEventHandlers({ begin, commit });
    const rangeTarget = { type: 'range' };

    handlers.onFocusCapture();
    handlers.onPointerUpCapture();
    handlers.onKeyDownCapture();
    handlers.onKeyUpCapture({ key: 'ArrowRight', target: rangeTarget });

    expect(begin).toHaveBeenCalledTimes(2);
    expect(commit).toHaveBeenCalledTimes(2);
  });

  it('number inputs finish on blur or Enter/Escape while preserving the key event', () => {
    const begin = vi.fn();
    const commit = vi.fn();
    const handlers = createFilterParamEditEventHandlers({ begin, commit });
    const event = { key: 'Enter', target: { type: 'number' }, preventDefault: vi.fn() };

    handlers.onFocusCapture();
    handlers.onKeyUpCapture(event);

    expect(begin).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(event.preventDefault).not.toHaveBeenCalled();
    handlers.onBlurCapture();
    expect(commit).toHaveBeenCalledTimes(2);
  });
});
