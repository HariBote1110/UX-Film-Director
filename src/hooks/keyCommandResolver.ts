/**
 * Minimal shape of the KeyboardEvent fields relevant to shortcut resolution.
 * Kept structural (not `KeyboardEvent`) so the mapping logic is a pure,
 * DOM-free function that is trivial to unit test.
 */
export interface KeyCommandEventLike {
  code: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
}

export interface KeyCommandContext {
  hasSelection: boolean;
}

export interface KeyCommandResolution {
  id: string;
  payload?: unknown;
  preventDefault: boolean;
}

/**
 * Resolves a keyboard event to a CommandBus commandId (plus payload and
 * whether the caller should call preventDefault()), or null when the key
 * combination is not handled here.
 *
 * Only covers the shortcuts routed through the CommandBus (Phase 1 of the
 * Remote Control Deck plan). Other shortcuts (copy/cut/paste/duplicate/
 * group) remain handled directly in useAppLogic.
 */
export const resolveKeyCommand = (
  event: KeyCommandEventLike,
  context: KeyCommandContext
): KeyCommandResolution | null => {
  const isModifier = event.metaKey || event.ctrlKey;

  if (isModifier && event.code === 'KeyZ') {
    return { id: event.shiftKey ? 'edit.redo' : 'edit.undo', preventDefault: true };
  }

  if (isModifier && event.code === 'KeyY') {
    return { id: 'edit.redo', preventDefault: true };
  }

  switch (event.code) {
    case 'Space':
      return { id: 'playback.toggle', preventDefault: true };
    case 'Delete':
    case 'Backspace':
      if (!context.hasSelection) return null;
      return { id: 'edit.delete', payload: { ripple: event.shiftKey }, preventDefault: false };
    case 'Escape':
      return { id: 'selection.escape', preventDefault: false };
    default:
      return null;
  }
};
