import { createServer, type IncomingMessage, type Server } from 'node:http';
import { randomBytes } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import { WebSocketServer, WebSocket } from 'ws';
import {
  parseRemoteDeckMessage,
  remoteDeckIpcChannels,
  type RemoteDeckCommandMessage,
  type RemoteDeckConnectionInfo,
} from '../shared/remoteDeckProtocol';

export interface StartRemoteDeckServerOptions {
  /** 0 (default) lets the OS assign a free port. */
  port?: number;
  /** Bind host. Defaults to 0.0.0.0 (all LAN interfaces). */
  host?: string;
  /** Injectable token for tests; a random one is generated when omitted. */
  token?: string;
}

export interface RemoteDeckServer {
  port: number;
  token: string;
  /** Subscribes to command messages from authenticated clients. Returns an unsubscribe fn. */
  onCommand: (listener: (message: RemoteDeckCommandMessage) => void) => () => void;
  /** Sends a state message to every connected (authenticated) client. */
  broadcastState: (payload: unknown) => void;
  close: () => Promise<void>;
}

/**
 * Placeholder page served until the Phase 3 mobile deck UI build output
 * replaces it. Kept minimal on purpose.
 */
const PLACEHOLDER_PAGE = [
  '<!doctype html>',
  '<meta charset="utf-8">',
  '<title>UX Film Director Remote Deck</title>',
  '<p>Remote Deck UI is not built yet (Phase 3). WebSocket endpoint is live.</p>',
].join('\n');

const generateToken = (): string => randomBytes(16).toString('hex');

const extractToken = (request: IncomingMessage): string | null => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  return url.searchParams.get('token');
};

/**
 * Starts the Remote Deck server: http (static placeholder) + WebSocket on the
 * same port, bound to all LAN interfaces with an OS-assigned port by default.
 * Connections whose token query parameter does not match are closed
 * immediately before the WebSocket upgrade completes.
 */
export const startRemoteDeckServer = (
  options: StartRemoteDeckServerOptions = {},
): Promise<RemoteDeckServer> => {
  const token = options.token ?? generateToken();
  const host = options.host ?? '0.0.0.0';
  const commandListeners = new Set<(message: RemoteDeckCommandMessage) => void>();

  const httpServer: Server = createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(PLACEHOLDER_PAGE);
  });

  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (request, socket, head) => {
    if (extractToken(request) !== token) {
      // Reject before the WebSocket handshake completes: the client sees an
      // immediate close without ever reaching the message loop.
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (webSocket) => {
      wss.emit('connection', webSocket, request);
    });
  });

  wss.on('connection', (webSocket: WebSocket) => {
    webSocket.on('message', (data) => {
      const message = parseRemoteDeckMessage(data.toString());
      if (message?.type !== 'command') return;
      commandListeners.forEach((listener) => listener(message));
    });
  });

  return new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(options.port ?? 0, host, () => {
      const address = httpServer.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('Remote deck server failed to obtain a port'));
        return;
      }

      resolve({
        port: address.port,
        token,
        onCommand: (listener) => {
          commandListeners.add(listener);
          return () => commandListeners.delete(listener);
        },
        broadcastState: (payload) => {
          const frame = JSON.stringify({ type: 'state', payload });
          wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) client.send(frame);
          });
        },
        close: () =>
          new Promise<void>((resolveClose) => {
            wss.clients.forEach((client) => client.terminate());
            wss.close(() => {
              httpServer.close(() => resolveClose());
            });
          }),
      });
    });
  });
};

/**
 * Forwards command messages received by the server to the renderer through
 * the given send function (typically `webContents.send`). Returns an
 * unsubscribe fn.
 */
export const forwardRemoteDeckCommands = (
  server: Pick<RemoteDeckServer, 'onCommand'>,
  send: (channel: string, message: RemoteDeckCommandMessage) => void,
): (() => void) =>
  server.onCommand((message) => send(remoteDeckIpcChannels.command, message));

/** Enumerates LAN-reachable connection URLs (non-internal IPv4 interfaces). */
export const buildRemoteDeckConnectionInfo = (
  server: Pick<RemoteDeckServer, 'port' | 'token'>,
): RemoteDeckConnectionInfo => {
  const hosts: string[] = [];
  const interfaces = networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) hosts.push(entry.address);
    }
  }
  return {
    port: server.port,
    token: server.token,
    urls: hosts.map((h) => `http://${h}:${server.port}/?token=${server.token}`),
  };
};
