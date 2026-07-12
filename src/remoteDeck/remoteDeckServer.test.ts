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
