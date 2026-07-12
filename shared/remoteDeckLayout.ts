/**
 * Remote deck button grid layout (Remote_Control_Deck_Plan.md Phase 3).
 * Defined as JSON so it can be customised later (Phase 6); malformed
 * definitions fall back to the default layout.
 */

export interface RemoteDeckButton {
  id: string;
  label: string;
  commandId: string;
  payload?: unknown;
}

export interface RemoteDeckLayout {
  columns: number;
  buttons: RemoteDeckButton[];
}

/**
 * Default 4x3 grid. Only uses commandIds registered in Phase 1
 * (registerAppCommands).
 */
export const DEFAULT_REMOTE_DECK_LAYOUT: RemoteDeckLayout = {
  columns: 3,
  buttons: [
    { id: 'undo', label: 'Undo', commandId: 'edit.undo' },
    { id: 'play-toggle', label: '再生 / 停止', commandId: 'playback.toggle' },
    { id: 'redo', label: 'Redo', commandId: 'edit.redo' },
    { id: 'back-10', label: '−10f', commandId: 'playback.seekRelative', payload: -10 },
    { id: 'back-1', label: '−1f', commandId: 'playback.seekRelative', payload: -1 },
    { id: 'forward-1', label: '+1f', commandId: 'playback.seekRelative', payload: 1 },
    { id: 'forward-10', label: '+10f', commandId: 'playback.seekRelative', payload: 10 },
    { id: 'back-60', label: '−60f', commandId: 'playback.seekRelative', payload: -60 },
    { id: 'forward-60', label: '+60f', commandId: 'playback.seekRelative', payload: 60 },
    { id: 'delete', label: '削除', commandId: 'edit.delete', payload: { ripple: false } },
    { id: 'ripple-delete', label: 'リップル削除', commandId: 'edit.delete', payload: { ripple: true } },
    { id: 'escape', label: '選択解除', commandId: 'selection.escape' },
  ],
};

const parseButton = (value: unknown): RemoteDeckButton | null => {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as { id?: unknown; label?: unknown; commandId?: unknown; payload?: unknown };
  if (typeof candidate.id !== 'string') return null;
  if (typeof candidate.label !== 'string') return null;
  if (typeof candidate.commandId !== 'string') return null;
  const button: RemoteDeckButton = {
    id: candidate.id,
    label: candidate.label,
    commandId: candidate.commandId,
  };
  if ('payload' in candidate) button.payload = candidate.payload;
  return button;
};

/**
 * Parses a JSON layout definition. Invalid JSON or a wrong top-level
 * structure falls back to DEFAULT_REMOTE_DECK_LAYOUT; malformed button
 * entries are dropped individually.
 */
export const parseRemoteDeckLayout = (json: string): RemoteDeckLayout => {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return DEFAULT_REMOTE_DECK_LAYOUT;
  }
  if (typeof value !== 'object' || value === null) return DEFAULT_REMOTE_DECK_LAYOUT;

  const candidate = value as { columns?: unknown; buttons?: unknown };
  if (!Array.isArray(candidate.buttons)) return DEFAULT_REMOTE_DECK_LAYOUT;

  const buttons = candidate.buttons
    .map(parseButton)
    .filter((button): button is RemoteDeckButton => button !== null);
  const columns =
    typeof candidate.columns === 'number' && candidate.columns >= 1
      ? Math.floor(candidate.columns)
      : DEFAULT_REMOTE_DECK_LAYOUT.columns;

  return { columns, buttons };
};
