/**
 * Reconnecting WebSocket client for the mobile deck UI
 * (Remote_Control_Deck_Plan.md Phase 3). Socket creation and timer
 * scheduling are injected so the logic stays DOM-free and unit-testable.
 */

export interface RemoteDeckSocketLike {
  // Handler property types are kept loose so the browser WebSocket (whose
  // handlers receive an Event argument) is structurally assignable.
  onopen: ((...args: never[]) => unknown) | null;
  onclose: ((...args: never[]) => unknown) | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- bivariance with browser WebSocket
  onmessage: ((...args: any[]) => unknown) | null;
  send: (data: string) => void;
  close: () => void;
}

export type RemoteDeckClientStatus = 'connecting' | 'connected' | 'disconnected';

export interface CreateRemoteDeckClientOptions {
  url: string;
  createSocket: (url: string) => RemoteDeckSocketLike;
  /** Schedules `run` after `delayMs`; returns a cancel function. */
  schedule: (run: () => void, delayMs: number) => () => void;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

export interface RemoteDeckClient {
  connect: () => void;
  /** Sends a command message. Returns false when not connected. */
  sendCommand: (commandId: string, payload?: unknown) => boolean;
  close: () => void;
  onStatusChange: (listener: (status: RemoteDeckClientStatus) => void) => () => void;
  /** Subscribes to state message payloads pushed by the app. */
  onStateMessage: (listener: (payload: unknown) => void) => () => void;
  getStatus: () => RemoteDeckClientStatus;
}

export const createRemoteDeckClient = (
  options: CreateRemoteDeckClientOptions,
): RemoteDeckClient => {
  const baseDelayMs = options.baseDelayMs ?? 1000;
  const maxDelayMs = options.maxDelayMs ?? 30_000;
  const listeners = new Set<(status: RemoteDeckClientStatus) => void>();
  const stateListeners = new Set<(payload: unknown) => void>();

  let status: RemoteDeckClientStatus = 'disconnected';
  let socket: RemoteDeckSocketLike | null = null;
  let isOpen = false;
  let failedAttempts = 0;
  let cancelReconnect: (() => void) | null = null;
  let isClosed = false;

  const setStatus = (next: RemoteDeckClientStatus) => {
    if (status === next) return;
    status = next;
    listeners.forEach((listener) => listener(next));
  };

  const scheduleReconnect = () => {
    const delay = Math.min(baseDelayMs * 2 ** failedAttempts, maxDelayMs);
    failedAttempts += 1;
    cancelReconnect = options.schedule(() => {
      cancelReconnect = null;
      openSocket();
    }, delay);
  };

  const openSocket = () => {
    if (isClosed) return;
    setStatus('connecting');
    isOpen = false;
    socket = options.createSocket(options.url);
    socket.onopen = () => {
      isOpen = true;
      failedAttempts = 0;
      setStatus('connected');
    };
    socket.onmessage = (event: { data: unknown }) => {
      if (typeof event.data !== 'string') return;
      let value: unknown;
      try {
        value = JSON.parse(event.data);
      } catch {
        return;
      }
      if (typeof value !== 'object' || value === null) return;
      const candidate = value as { type?: unknown; payload?: unknown };
      if (candidate.type !== 'state') return;
      stateListeners.forEach((listener) => listener(candidate.payload));
    };
    socket.onclose = () => {
      isOpen = false;
      socket = null;
      if (isClosed) return;
      setStatus('connecting');
      scheduleReconnect();
    };
  };

  return {
    connect: () => {
      if (socket !== null || isClosed) return;
      openSocket();
    },
    sendCommand: (commandId, payload) => {
      if (!isOpen || socket === null) return false;
      const message: { type: 'command'; id: string; payload?: unknown } = {
        type: 'command',
        id: commandId,
      };
      if (payload !== undefined) message.payload = payload;
      socket.send(JSON.stringify(message));
      return true;
    },
    close: () => {
      isClosed = true;
      cancelReconnect?.();
      cancelReconnect = null;
      const current = socket;
      socket = null;
      isOpen = false;
      current?.close();
      setStatus('disconnected');
    },
    onStatusChange: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    onStateMessage: (listener) => {
      stateListeners.add(listener);
      return () => stateListeners.delete(listener);
    },
    getStatus: () => status,
  };
};
