import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';
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
  /**
   * Directory holding the built mobile deck UI (Phase 3). When absent or the
   * directory does not exist, the placeholder page is served instead.
   */
  staticDir?: string;
  /**
   * Optional path to a user-editable layout JSON (Phase 6). Served at
   * /layout.json, read per request so edits apply on page reload.
   */
  layoutFilePath?: string;
}

export interface RemoteDeckConnection {
  id: string;
  remoteAddress: string;
  connectedAt: number;
}

export interface RemoteDeckServer {
  port: number;
  readonly token: string;
  /** Lists currently connected (authenticated) clients. */
  listConnections: () => RemoteDeckConnection[];
  /** Terminates a single client connection. Returns false for unknown ids. */
  disconnectClient: (connectionId: string) => boolean;
  /** Replaces the token and terminates every existing connection. */
  regenerateToken: () => string;
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

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

/**
 * Serves a file from staticDir. Unknown paths fall back to index.html (SPA
 * routing); paths escaping staticDir are rejected. Returns false when the
 * placeholder should be served instead (staticDir missing or unusable).
 */
const serveStaticFile = (
  staticDir: string,
  requestUrl: string,
  response: ServerResponse,
): boolean => {
  const root = resolve(staticDir);
  const indexPath = join(root, 'index.html');
  if (!existsSync(indexPath)) return false;

  const pathname = decodeURIComponent(new URL(requestUrl, 'http://localhost').pathname);
  const requested = resolve(root, `.${pathname}`);
  const isInsideRoot = requested === root || requested.startsWith(root + sep);

  const target =
    isInsideRoot && existsSync(requested) && statSync(requested).isFile() ? requested : indexPath;
  const contentType = CONTENT_TYPES[extname(target)] ?? 'application/octet-stream';
  response.writeHead(200, { 'Content-Type': contentType });
  response.end(readFileSync(target));
  return true;
};

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
  let token = options.token ?? generateToken();
  const host = options.host ?? '0.0.0.0';
  const commandListeners = new Set<(message: RemoteDeckCommandMessage) => void>();
  const connections = new Map<string, { socket: WebSocket; info: RemoteDeckConnection }>();
  let connectionCounter = 0;

  const httpServer: Server = createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
    if (pathname === '/layout.json') {
      // ユーザー編集可能なレイアウト定義。リクエスト毎に読むため
      // ファイル編集はデッキ側のリロードだけで反映される。
      if (options.layoutFilePath && existsSync(options.layoutFilePath)) {
        response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        response.end(readFileSync(options.layoutFilePath));
      } else {
        response.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        response.end('{}');
      }
      return;
    }
    if (options.staticDir && serveStaticFile(options.staticDir, request.url ?? '/', response)) {
      return;
    }
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

  wss.on('connection', (webSocket: WebSocket, request: IncomingMessage) => {
    connectionCounter += 1;
    const connectionId = `conn-${connectionCounter}`;
    connections.set(connectionId, {
      socket: webSocket,
      info: {
        id: connectionId,
        remoteAddress: request.socket.remoteAddress ?? 'unknown',
        connectedAt: Date.now(),
      },
    });
    webSocket.on('close', () => {
      connections.delete(connectionId);
    });
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
        get token() {
          return token;
        },
        listConnections: () => [...connections.values()].map((entry) => ({ ...entry.info })),
        disconnectClient: (connectionId) => {
          const entry = connections.get(connectionId);
          if (!entry) return false;
          entry.socket.terminate();
          connections.delete(connectionId);
          return true;
        },
        regenerateToken: () => {
          token = generateToken();
          // 既存接続は旧トークンで認証済みのため全切断する
          connections.forEach((entry) => entry.socket.terminate());
          connections.clear();
          return token;
        },
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
