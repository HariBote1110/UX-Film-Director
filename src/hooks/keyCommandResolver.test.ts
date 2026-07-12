import { describe, expect, it } from 'vitest';
import { resolveKeyCommand } from './keyCommandResolver';

const baseEvent = { code: '', metaKey: false, ctrlKey: false, shiftKey: false };

describe('resolveKeyCommand', () => {
  it('maps Space to playback.toggle with preventDefault', () => {
    const result = resolveKeyCommand({ ...baseEvent, code: 'Space' }, { hasSelection: false });
    expect(result).toEqual({ id: 'playback.toggle', preventDefault: true });
  });

  it('maps Delete with a selection to edit.delete without ripple', () => {
    const result = resolveKeyCommand({ ...baseEvent, code: 'Delete' }, { hasSelection: true });
    expect(result).toEqual({ id: 'edit.delete', payload: { ripple: false }, preventDefault: false });
  });

  it('maps Shift+Backspace with a selection to edit.delete with ripple', () => {
    const result = resolveKeyCommand(
      { ...baseEvent, code: 'Backspace', shiftKey: true },
      { hasSelection: true }
    );
    expect(result).toEqual({ id: 'edit.delete', payload: { ripple: true }, preventDefault: false });
  });

  it('does not map Delete when there is no selection', () => {
    const result = resolveKeyCommand({ ...baseEvent, code: 'Delete' }, { hasSelection: false });
    expect(result).toBeNull();
  });

  it('maps Escape to selection.escape without preventDefault', () => {
    const result = resolveKeyCommand({ ...baseEvent, code: 'Escape' }, { hasSelection: false });
    expect(result).toEqual({ id: 'selection.escape', preventDefault: false });
  });

  it('maps Cmd/Ctrl+Z to edit.undo with preventDefault', () => {
    const result = resolveKeyCommand({ ...baseEvent, code: 'KeyZ', metaKey: true }, { hasSelection: false });
    expect(result).toEqual({ id: 'edit.undo', preventDefault: true });
  });

  it('maps Cmd/Ctrl+Shift+Z to edit.redo with preventDefault', () => {
    const result = resolveKeyCommand(
      { ...baseEvent, code: 'KeyZ', ctrlKey: true, shiftKey: true },
      { hasSelection: false }
    );
    expect(result).toEqual({ id: 'edit.redo', preventDefault: true });
  });

  it('maps Cmd/Ctrl+Y to edit.redo with preventDefault', () => {
    const result = resolveKeyCommand({ ...baseEvent, code: 'KeyY', ctrlKey: true }, { hasSelection: false });
    expect(result).toEqual({ id: 'edit.redo', preventDefault: true });
  });

  it('returns null for unhandled keys', () => {
    const result = resolveKeyCommand({ ...baseEvent, code: 'KeyA' }, { hasSelection: false });
    expect(result).toBeNull();
  });
});
