import { describe, expect, it } from 'vitest';
import {
  buildRemoteDeckUrl,
  parseRemoteDeckMessage,
  remoteDeckIpcChannels,
} from '../../shared/remoteDeckProtocol';

describe('parseRemoteDeckMessage', () => {
  it('parses a valid command message', () => {
    const raw = JSON.stringify({ type: 'command', id: 'playback.toggle' });
    expect(parseRemoteDeckMessage(raw)).toEqual({ type: 'command', id: 'playback.toggle' });
  });

  it('parses a command message with a payload', () => {
    const raw = JSON.stringify({ type: 'command', id: 'playback.seekRelative', payload: 30 });
    expect(parseRemoteDeckMessage(raw)).toEqual({
      type: 'command',
      id: 'playback.seekRelative',
      payload: 30,
    });
  });

  it('parses a valid state message', () => {
    const raw = JSON.stringify({ type: 'state', payload: { isPlaying: true } });
    expect(parseRemoteDeckMessage(raw)).toEqual({ type: 'state', payload: { isPlaying: true } });
  });

  it('returns null for invalid JSON without throwing', () => {
    expect(() => parseRemoteDeckMessage('{not json')).not.toThrow();
    expect(parseRemoteDeckMessage('{not json')).toBeNull();
  });

  it('returns null for an unknown message type', () => {
    expect(parseRemoteDeckMessage(JSON.stringify({ type: 'mystery' }))).toBeNull();
  });

  it('returns null for a command message without a string id', () => {
    expect(parseRemoteDeckMessage(JSON.stringify({ type: 'command' }))).toBeNull();
    expect(parseRemoteDeckMessage(JSON.stringify({ type: 'command', id: 42 }))).toBeNull();
  });

  it('returns null for non-object JSON values', () => {
    expect(parseRemoteDeckMessage('42')).toBeNull();
    expect(parseRemoteDeckMessage('null')).toBeNull();
    expect(parseRemoteDeckMessage('"command"')).toBeNull();
  });
});

describe('buildRemoteDeckUrl', () => {
  it('builds an http URL embedding the token as a query parameter', () => {
    const url = buildRemoteDeckUrl({ host: '192.168.1.20', port: 45678, token: 'abc123' });
    expect(url).toBe('http://192.168.1.20:45678/?token=abc123');
  });
});

describe('remoteDeckIpcChannels', () => {
  it('defines the command forwarding and connection info channels', () => {
    expect(remoteDeckIpcChannels.command).toBe('remote-deck:command');
    expect(remoteDeckIpcChannels.getConnectionInfo).toBe('remote-deck:get-connection-info');
    expect(remoteDeckIpcChannels.state).toBe('remote-deck:state');
  });
});
