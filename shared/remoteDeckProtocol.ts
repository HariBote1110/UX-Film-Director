/**
 * Remote Control Deck protocol (Remote_Control_Deck_Plan.md Phase 2).
 *
 * Shared between the Electron main process (remoteDeckServer), the renderer
 * (CommandBus wiring) and, later, the mobile deck UI (Phase 3). Messages are
 * JSON objects flowing over the WebSocket connection:
 *
 *   deck → app : { type: 'command', id, payload? }
 *   app  → deck: { type: 'state', payload }
 */

export interface RemoteDeckCommandMessage {
  type: 'command';
  id: string;
  payload?: unknown;
}

export interface RemoteDeckStateMessage {
  type: 'state';
  payload: unknown;
}

export type RemoteDeckMessage = RemoteDeckCommandMessage | RemoteDeckStateMessage;

/** IPC channels used between main and renderer for the remote deck. */
export const remoteDeckIpcChannels = {
  command: 'remote-deck:command',
  getConnectionInfo: 'remote-deck:get-connection-info',
} as const;

export interface RemoteDeckConnectionInfo {
  port: number;
  token: string;
  /** LAN-reachable URLs (one per non-internal IPv4 interface). */
  urls: string[];
}

/**
 * Parses a raw WebSocket text frame into a RemoteDeckMessage.
 * Invalid JSON, non-object values and unknown types are safely ignored
 * (returns null, never throws).
 */
export const parseRemoteDeckMessage = (raw: string): RemoteDeckMessage | null => {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;

  const candidate = value as { type?: unknown; id?: unknown; payload?: unknown };
  if (candidate.type === 'command') {
    if (typeof candidate.id !== 'string') return null;
    const message: RemoteDeckCommandMessage = { type: 'command', id: candidate.id };
    if ('payload' in candidate) message.payload = candidate.payload;
    return message;
  }
  if (candidate.type === 'state') {
    return { type: 'state', payload: candidate.payload };
  }
  return null;
};

/** Type guard usable on values received over IPC (already-parsed objects). */
export const isRemoteDeckCommandMessage = (value: unknown): value is RemoteDeckCommandMessage => {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { type?: unknown; id?: unknown };
  return candidate.type === 'command' && typeof candidate.id === 'string';
};

/** Builds the connection URL a phone opens (token embedded in the query). */
export const buildRemoteDeckUrl = (input: { host: string; port: number; token: string }): string =>
  `http://${input.host}:${input.port}/?token=${input.token}`;
