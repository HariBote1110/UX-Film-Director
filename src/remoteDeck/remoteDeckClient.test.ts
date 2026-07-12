import { describe, expect, it, vi } from 'vitest';
import { createRemoteDeckClient, type RemoteDeckSocketLike } from '../../shared/remoteDeckClient';

class FakeSocket implements RemoteDeckSocketLike {
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  sent: string[] = [];
  closed = false;

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.closed = true;
    this.onclose?.();
  }
}

const createHarness = () => {
  const sockets: FakeSocket[] = [];
  const timers: Array<{ delay: number; run: () => void }> = [];
  const client = createRemoteDeckClient({
    url: 'ws://example.local/?token=t',
    createSocket: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
    schedule: (run, delay) => {
      const entry = { delay, run };
      timers.push(entry);
      return () => {
        const index = timers.indexOf(entry);
        if (index >= 0) timers.splice(index, 1);
      };
    },
  });
  const runNextTimer = () => {
    const entry = timers.shift();
    entry?.run();
  };
  return { client, sockets, timers, runNextTimer };
};

describe('createRemoteDeckClient', () => {
  it('reports connecting then connected once the socket opens', () => {
    const { client, sockets } = createHarness();
    const statuses: string[] = [];
    client.onStatusChange((status) => statuses.push(status));

    client.connect();
    expect(statuses).toEqual(['connecting']);
    sockets[0].onopen?.();
    expect(statuses).toEqual(['connecting', 'connected']);
  });

  it('sends command messages as protocol JSON while connected', () => {
    const { client, sockets } = createHarness();
    client.connect();
    sockets[0].onopen?.();

    const sent = client.sendCommand('playback.seekRelative', 10);

    expect(sent).toBe(true);
    expect(JSON.parse(sockets[0].sent[0])).toEqual({
      type: 'command',
      id: 'playback.seekRelative',
      payload: 10,
    });
  });

  it('omits the payload field when no payload is given', () => {
    const { client, sockets } = createHarness();
    client.connect();
    sockets[0].onopen?.();

    client.sendCommand('playback.toggle');

    expect(JSON.parse(sockets[0].sent[0])).toEqual({ type: 'command', id: 'playback.toggle' });
  });

  it('returns false instead of sending while disconnected', () => {
    const { client } = createHarness();
    expect(client.sendCommand('edit.undo')).toBe(false);
  });

  it('reconnects with exponential backoff after the socket closes', () => {
    const { client, sockets, timers, runNextTimer } = createHarness();
    client.connect();
    sockets[0].onopen?.();

    sockets[0].onclose?.();
    expect(timers[0].delay).toBe(1000);
    runNextTimer();
    expect(sockets).toHaveLength(2);

    sockets[1].onclose?.();
    expect(timers[0].delay).toBe(2000);
    runNextTimer();

    sockets[2].onclose?.();
    expect(timers[0].delay).toBe(4000);
  });

  it('caps the backoff delay at 30 seconds', () => {
    const { client, sockets, timers, runNextTimer } = createHarness();
    client.connect();
    for (let attempt = 0; attempt < 8; attempt += 1) {
      sockets[sockets.length - 1].onclose?.();
      runNextTimer();
    }
    sockets[sockets.length - 1].onclose?.();
    expect(timers[0].delay).toBeLessThanOrEqual(30_000);
  });

  it('resets the backoff after a successful connection', () => {
    const { client, sockets, timers, runNextTimer } = createHarness();
    client.connect();
    sockets[0].onclose?.();
    runNextTimer();
    sockets[1].onclose?.();
    runNextTimer();

    sockets[2].onopen?.();
    sockets[2].onclose?.();
    expect(timers[0].delay).toBe(1000);
  });

  it('notifies state listeners when a state message arrives', () => {
    const { client, sockets } = createHarness();
    const states: unknown[] = [];
    client.onStateMessage((payload) => states.push(payload));
    client.connect();
    sockets[0].onopen?.();

    sockets[0].onmessage?.({
      data: JSON.stringify({ type: 'state', payload: { objectId: 'a', properties: [] } }),
    });

    expect(states).toEqual([{ objectId: 'a', properties: [] }]);
  });

  it('ignores malformed or non-state frames without throwing', () => {
    const { client, sockets } = createHarness();
    const states: unknown[] = [];
    client.onStateMessage((payload) => states.push(payload));
    client.connect();
    sockets[0].onopen?.();

    expect(() => {
      sockets[0].onmessage?.({ data: '{broken' });
      sockets[0].onmessage?.({ data: JSON.stringify({ type: 'command', id: 'x' }) });
    }).not.toThrow();
    expect(states).toEqual([]);
  });

  it('stops reconnecting after close() and reports disconnected', () => {
    const { client, sockets, timers } = createHarness();
    const statuses: string[] = [];
    client.onStatusChange((status) => statuses.push(status));
    client.connect();
    sockets[0].onopen?.();

    client.close();

    expect(sockets[0].closed).toBe(true);
    expect(timers).toHaveLength(0);
    expect(statuses[statuses.length - 1]).toBe('disconnected');
  });
});
