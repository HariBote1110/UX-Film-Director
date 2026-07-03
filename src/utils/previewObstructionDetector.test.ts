import { describe, expect, it, vi } from 'vitest';
import {
  intersectsPreviewPaneRect,
  isPreviewObstructingCandidateElement,
  previewObstructionIpcChannel,
  sendPreviewObstructionChangedIpc,
  subscribeStoreToPreviewObstructionIpc,
} from './previewObstructionDetector';
import type { PreviewObstructedState } from '../store/storeTypes';

type FakeStoreState = { previewObstructed: PreviewObstructedState };
type FakeStoreListener = (state: FakeStoreState, previousState: FakeStoreState) => void;

// Bug E（Native_Overlay_Bug_E_Plan.md §3・§4 Phase E1）— preview に重なる
// HTML 駆動 UI（context menu / popover / tooltip / modal / dropdown）が
// 開いたことを renderer 側で一箇所に統一補足し、IPC で main に通知する。
// zustand store の明示 action（previewObstructed）を正本にし、
// MutationObserver は overlay-overlap 領域に限定した補助として並走させる。
describe('previewObstructionIpcChannel', () => {
  it('is the ui:preview-obstruction-changed channel from the plan §3 IPC contract', () => {
    expect(previewObstructionIpcChannel).toBe('ui:preview-obstruction-changed');
  });
});

describe('sendPreviewObstructionChangedIpc', () => {
  it('invokes the channel with { obstructed, reason, rect } payload', () => {
    const invoke = vi.fn().mockResolvedValue(undefined);

    sendPreviewObstructionChangedIpc(
      { obstructed: true, reason: 'context-menu', rect: { x: 1, y: 2, w: 3, h: 4 } },
      invoke,
    );

    expect(invoke).toHaveBeenCalledWith('ui:preview-obstruction-changed', {
      obstructed: true,
      reason: 'context-menu',
      rect: { x: 1, y: 2, w: 3, h: 4 },
    });
  });

  it('omits rect from the payload when null (obstruction without a known overlap rect)', () => {
    const invoke = vi.fn().mockResolvedValue(undefined);

    sendPreviewObstructionChangedIpc(
      { obstructed: false, reason: null, rect: null },
      invoke,
    );

    expect(invoke).toHaveBeenCalledWith('ui:preview-obstruction-changed', {
      obstructed: false,
      reason: null,
    });
  });
});

describe('subscribeStoreToPreviewObstructionIpc', () => {
  it('forwards every previewObstructed state change to the IPC channel', () => {
    const invoke = vi.fn().mockResolvedValue(undefined);
    const listeners: FakeStoreListener[] = [];
    const store = {
      getState: (): FakeStoreState => ({
        previewObstructed: { obstructed: false, reason: null, rect: null },
      }),
      subscribe: (listener: FakeStoreListener) => {
        listeners.push(listener);
        return () => {
          const index = listeners.indexOf(listener);
          if (index >= 0) listeners.splice(index, 1);
        };
      },
    };

    subscribeStoreToPreviewObstructionIpc(store, invoke);
    expect(listeners).toHaveLength(1);

    listeners[0](
      { previewObstructed: { obstructed: true, reason: 'export-modal', rect: null } },
      { previewObstructed: { obstructed: false, reason: null, rect: null } },
    );

    expect(invoke).toHaveBeenCalledWith('ui:preview-obstruction-changed', {
      obstructed: true,
      reason: 'export-modal',
    });
  });

  it('does not re-send when previewObstructed is referentially unchanged', () => {
    const invoke = vi.fn().mockResolvedValue(undefined);
    const listeners: FakeStoreListener[] = [];
    const store = {
      getState: (): FakeStoreState => ({
        previewObstructed: { obstructed: false, reason: null, rect: null },
      }),
      subscribe: (listener: FakeStoreListener) => {
        listeners.push(listener);
        return () => undefined;
      },
    };
    const sameObstructedState: PreviewObstructedState = { obstructed: true, reason: 'popover', rect: null };

    subscribeStoreToPreviewObstructionIpc(store, invoke);
    listeners[0](
      { previewObstructed: sameObstructedState },
      { previewObstructed: sameObstructedState },
    );

    expect(invoke).not.toHaveBeenCalled();
  });
});

describe('isPreviewObstructingCandidateElement', () => {
  it('accepts elements with data-state="open" (Radix/shadcn-style UI)', () => {
    const element = { getAttribute: (name: string) => (name === 'data-state' ? 'open' : null) } as unknown as Element;
    expect(isPreviewObstructingCandidateElement(element)).toBe(true);
  });

  it('accepts <dialog open> elements', () => {
    const element = {
      tagName: 'DIALOG',
      getAttribute: () => null,
      hasAttribute: (name: string) => name === 'open',
    } as unknown as Element;
    expect(isPreviewObstructingCandidateElement(element)).toBe(true);
  });

  it('rejects unrelated elements', () => {
    const element = {
      tagName: 'DIV',
      getAttribute: () => null,
      hasAttribute: () => false,
    } as unknown as Element;
    expect(isPreviewObstructingCandidateElement(element)).toBe(false);
  });
});

describe('intersectsPreviewPaneRect', () => {
  const previewPaneRect = { left: 100, top: 100, right: 500, bottom: 400 };

  it('returns true when the candidate rect overlaps the preview pane rect', () => {
    expect(intersectsPreviewPaneRect(previewPaneRect, { left: 200, top: 150, right: 260, bottom: 200 })).toBe(true);
  });

  it('returns false when the candidate rect is entirely outside the preview pane rect', () => {
    expect(intersectsPreviewPaneRect(previewPaneRect, { left: 600, top: 600, right: 700, bottom: 700 })).toBe(false);
  });

  it('returns false for a zero-area candidate rect (not yet laid out / hidden)', () => {
    expect(intersectsPreviewPaneRect(previewPaneRect, { left: 200, top: 200, right: 200, bottom: 200 })).toBe(false);
  });
});
