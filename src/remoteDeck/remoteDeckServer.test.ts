import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws';
import {
  forwardRemoteDeckCommands,
  startRemoteDeckServer,
  type RemoteDeckServer,
} from '../../electron/remoteDeckServer';

const servers: RemoteDeckServer[] = [];

const startServer = async (options: Parameters<typeof startRemoteDeckServer>[0] = {}) => {
  const server = await startRemoteDeckServer(options);
  servers.push(server);
  return server;
};

const connect = (server: RemoteDeckServer, token: string | null = server.token) => {
  const query = token === null ? '' : `?token=${token}`;
  return new WebSocket(`ws://127.0.0.1:${server.port}/${query}`);
};

const once = <T>(socket: WebSocket, event: string): Promise<T> =>
  new Promise((resolve) => socket.once(event, (value: T) => resolve(value)));

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

describe('startRemoteDeckServer', () => {
  it('binds to an OS-assigned port when no port is given and generates a token', async () => {
    const server = await startServer();
    expect(server.port).toBeGreaterThan(0);
    expect(typeof server.token).toBe('string');
    expect(server.token.length).toBeGreaterThanOrEqual(16);
  });

  it('generates a different token per start', async () => {
    const first = await startServer();
    const second = await startServer();
    expect(first.token).not.toBe(second.token);
  });

  it('serves a placeholder page over http', async () => {
    const server = await startServer();
    const response = await fetch(`http://127.0.0.1:${server.port}/?token=${server.token}`);
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body.length).toBeGreaterThan(0);
  });

  it('accepts a websocket connection carrying the correct token', async () => {
    const server = await startServer();
    const socket = connect(server);
    await once(socket, 'open');
    expect(socket.readyState).toBe(WebSocket.OPEN);
    socket.close();
  });

  it('immediately closes a websocket connection with a wrong token', async () => {
    const server = await startServer();
    const socket = connect(server, 'wrong-token');
    await new Promise<void>((resolve) => {
      socket.once('close', () => resolve());
      socket.once('error', () => resolve());
    });
    expect(socket.readyState === WebSocket.CLOSED || socket.readyState === WebSocket.CLOSING).toBe(true);
  });

  it('immediately closes a websocket connection with no token', async () => {
    const server = await startServer();
    const socket = connect(server, null);
    await new Promise<void>((resolve) => {
      socket.once('close', () => resolve());
      socket.once('error', () => resolve());
    });
    expect(socket.readyState === WebSocket.CLOSED || socket.readyState === WebSocket.CLOSING).toBe(true);
  });

  it('emits command messages received from an authenticated client', async () => {
    const server = await startServer();
    const received: unknown[] = [];
    server.onCommand((message) => received.push(message));

    const socket = connect(server);
    await once(socket, 'open');
    socket.send(JSON.stringify({ type: 'command', id: 'playback.toggle' }));

    await vi.waitFor(() => {
      expect(received).toEqual([{ type: 'command', id: 'playback.toggle' }]);
    });
    socket.close();
  });

  it('safely ignores invalid JSON and unknown message types', async () => {
    const server = await startServer();
    const received: unknown[] = [];
    server.onCommand((message) => received.push(message));

    const socket = connect(server);
    await once(socket, 'open');
    socket.send('{broken');
    socket.send(JSON.stringify({ type: 'mystery' }));
    socket.send(JSON.stringify({ type: 'command', id: 'edit.undo' }));

    await vi.waitFor(() => {
      expect(received).toEqual([{ type: 'command', id: 'edit.undo' }]);
    });
    socket.close();
  });

  it('broadcasts state messages to connected clients', async () => {
    const server = await startServer();
    const socket = connect(server);
    await once(socket, 'open');

    const messagePromise = once<Buffer>(socket, 'message');
    server.broadcastState({ isPlaying: true });

    const raw = await messagePromise;
    expect(JSON.parse(raw.toString())).toEqual({ type: 'state', payload: { isPlaying: true } });
    socket.close();
  });
});

describe('startRemoteDeckServer static serving', () => {
  const createStaticDir = () => {
    const dir = mkdtempSync(join(tmpdir(), 'remote-deck-ui-'));
    writeFileSync(join(dir, 'index.html'), '<html>deck ui</html>');
    mkdirSync(join(dir, 'assets'));
    writeFileSync(join(dir, 'assets', 'app.js'), 'console.log("deck")');
    return dir;
  };

  it('serves index.html from staticDir at the root path', async () => {
    const server = await startServer({ staticDir: createStaticDir() });
    const response = await fetch(`http://127.0.0.1:${server.port}/`);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('deck ui');
  });

  it('serves nested asset files with a script content type', async () => {
    const server = await startServer({ staticDir: createStaticDir() });
    const response = await fetch(`http://127.0.0.1:${server.port}/assets/app.js`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('javascript');
    expect(await response.text()).toContain('deck');
  });

  it('falls back to index.html for unknown paths (SPA routing)', async () => {
    const server = await startServer({ staticDir: createStaticDir() });
    const response = await fetch(`http://127.0.0.1:${server.port}/missing/page`);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('deck ui');
  });

  it('rejects path traversal outside staticDir', async () => {
    const server = await startServer({ staticDir: createStaticDir() });
    const response = await fetch(`http://127.0.0.1:${server.port}/..%2f..%2fetc%2fpasswd`);
    const body = await response.text();
    expect(body).not.toContain('root:');
  });

  it('falls back to the placeholder page when staticDir does not exist', async () => {
    const server = await startServer({ staticDir: '/nonexistent/remote-deck-ui-dist' });
    const response = await fetch(`http://127.0.0.1:${server.port}/`);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('Phase 3');
  });
});

describe('connection management (Phase 6)', () => {
  const openSocket = async (server: RemoteDeckServer, token?: string) => {
    const socket = connect(server, token ?? server.token);
    await once(socket, 'open');
    return socket;
  };

  it('lists connected clients with remote address and connection time', async () => {
    const server = await startServer();
    const before = Date.now();
    const first = await openSocket(server);
    const second = await openSocket(server);

    const connections = server.listConnections();
    expect(connections).toHaveLength(2);
    for (const connection of connections) {
      expect(typeof connection.id).toBe('string');
      expect(connection.remoteAddress).toContain('127.0.0.1');
      expect(connection.connectedAt).toBeGreaterThanOrEqual(before);
    }
    expect(new Set(connections.map((c) => c.id)).size).toBe(2);
    first.close();
    second.close();
  });

  it('removes closed clients from the list', async () => {
    const server = await startServer();
    const socket = await openSocket(server);
    expect(server.listConnections()).toHaveLength(1);

    socket.close();
    await vi.waitFor(() => {
      expect(server.listConnections()).toHaveLength(0);
    });
  });

  it('disconnects a single client by id', async () => {
    const server = await startServer();
    const first = await openSocket(server);
    const second = await openSocket(server);
    const target = server.listConnections()[0];

    const result = server.disconnectClient(target.id);
    expect(result).toBe(true);

    await vi.waitFor(() => {
      expect(server.listConnections()).toHaveLength(1);
      expect(server.listConnections()[0].id).not.toBe(target.id);
    });
    expect(server.disconnectClient('nonexistent')).toBe(false);
    first.close();
    second.close();
  });

  it('regenerates the token, disconnects everyone and rejects the old token', async () => {
    const server = await startServer();
    const oldToken = server.token;
    const socket = await openSocket(server);

    const newToken = server.regenerateToken();
    expect(newToken).not.toBe(oldToken);
    expect(server.token).toBe(newToken);

    await vi.waitFor(() => {
      expect(server.listConnections()).toHaveLength(0);
      expect(socket.readyState === WebSocket.CLOSED || socket.readyState === WebSocket.CLOSING).toBe(true);
    });

    // 旧トークンは拒否、新トークンは受理
    const rejected = connect(server, oldToken);
    await new Promise<void>((resolve) => {
      rejected.once('close', () => resolve());
      rejected.once('error', () => resolve());
    });
    expect(rejected.readyState === WebSocket.CLOSED || rejected.readyState === WebSocket.CLOSING).toBe(true);

    const accepted = await openSocket(server, newToken);
    expect(accepted.readyState).toBe(WebSocket.OPEN);
    accepted.close();
  });
});

describe('layout customisation endpoint (Phase 6)', () => {
  it('serves the layout file at /layout.json when it exists', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'remote-deck-layout-'));
    const layoutPath = join(dir, 'remote-deck-layout.json');
    writeFileSync(layoutPath, JSON.stringify({ columns: 2, buttons: [] }));
    const server = await startServer({ layoutFilePath: layoutPath });

    const response = await fetch(`http://127.0.0.1:${server.port}/layout.json`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ columns: 2, buttons: [] });
  });

  it('returns 404 for /layout.json when the file is missing', async () => {
    const server = await startServer({ layoutFilePath: '/nonexistent/remote-deck-layout.json' });
    const response = await fetch(`http://127.0.0.1:${server.port}/layout.json`);
    expect(response.status).toBe(404);
  });

  it('reflects file edits without a server restart', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'remote-deck-layout-'));
    const layoutPath = join(dir, 'remote-deck-layout.json');
    writeFileSync(layoutPath, JSON.stringify({ columns: 2, buttons: [] }));
    const server = await startServer({ layoutFilePath: layoutPath });

    writeFileSync(layoutPath, JSON.stringify({ columns: 4, buttons: [] }));
    const response = await fetch(`http://127.0.0.1:${server.port}/layout.json`);
    expect(await response.json()).toEqual({ columns: 4, buttons: [] });
  });
});

describe('forwardRemoteDeckCommands', () => {
  it('forwards received command messages through the given send function', async () => {
    const server = await startServer();
    const send = vi.fn();
    forwardRemoteDeckCommands(server, send);

    const socket = connect(server);
    await once(socket, 'open');
    socket.send(JSON.stringify({ type: 'command', id: 'edit.redo' }));

    await vi.waitFor(() => {
      expect(send).toHaveBeenCalledWith('remote-deck:command', { type: 'command', id: 'edit.redo' });
    });
    socket.close();
  });
});
