import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REMOTE_DECK_LAYOUT,
  parseRemoteDeckLayout,
} from '../../shared/remoteDeckLayout';

const REGISTERED_COMMAND_IDS = [
  'playback.toggle',
  'playback.seekRelative',
  'edit.undo',
  'edit.redo',
  'edit.delete',
  'selection.escape',
];

describe('DEFAULT_REMOTE_DECK_LAYOUT', () => {
  it('provides a 4x3 grid of buttons', () => {
    expect(DEFAULT_REMOTE_DECK_LAYOUT.columns).toBe(3);
    expect(DEFAULT_REMOTE_DECK_LAYOUT.buttons).toHaveLength(12);
  });

  it('only uses commandIds registered in Phase 1', () => {
    for (const button of DEFAULT_REMOTE_DECK_LAYOUT.buttons) {
      expect(REGISTERED_COMMAND_IDS).toContain(button.commandId);
    }
  });

  it('includes frame-step buttons with payloads of ±1 and ±10 frames', () => {
    const payloads = DEFAULT_REMOTE_DECK_LAYOUT.buttons
      .filter((button) => button.commandId === 'playback.seekRelative')
      .map((button) => button.payload);
    expect(payloads).toContain(1);
    expect(payloads).toContain(-1);
    expect(payloads).toContain(10);
    expect(payloads).toContain(-10);
  });

  it('gives every button a unique id and a label', () => {
    const ids = DEFAULT_REMOTE_DECK_LAYOUT.buttons.map((button) => button.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const button of DEFAULT_REMOTE_DECK_LAYOUT.buttons) {
      expect(button.label.length).toBeGreaterThan(0);
    }
  });
});

describe('parseRemoteDeckLayout', () => {
  it('parses a valid JSON layout definition', () => {
    const json = JSON.stringify({
      columns: 2,
      buttons: [
        { id: 'play', label: 'Play', commandId: 'playback.toggle' },
        { id: 'fwd', label: '+1', commandId: 'playback.seekRelative', payload: 1 },
      ],
    });
    const layout = parseRemoteDeckLayout(json);
    expect(layout.columns).toBe(2);
    expect(layout.buttons).toHaveLength(2);
    expect(layout.buttons[1].payload).toBe(1);
  });

  it('falls back to the default layout for invalid JSON', () => {
    expect(parseRemoteDeckLayout('{broken')).toEqual(DEFAULT_REMOTE_DECK_LAYOUT);
  });

  it('falls back to the default layout when the structure is wrong', () => {
    expect(parseRemoteDeckLayout(JSON.stringify({ buttons: 'nope' }))).toEqual(
      DEFAULT_REMOTE_DECK_LAYOUT,
    );
    expect(parseRemoteDeckLayout(JSON.stringify(null))).toEqual(DEFAULT_REMOTE_DECK_LAYOUT);
  });

  it('drops malformed button entries but keeps valid ones', () => {
    const json = JSON.stringify({
      columns: 3,
      buttons: [
        { id: 'ok', label: 'OK', commandId: 'edit.undo' },
        { id: 42, label: 'bad id', commandId: 'edit.redo' },
        { id: 'no-command', label: 'bad' },
      ],
    });
    const layout = parseRemoteDeckLayout(json);
    expect(layout.buttons).toHaveLength(1);
    expect(layout.buttons[0].id).toBe('ok');
  });
});
