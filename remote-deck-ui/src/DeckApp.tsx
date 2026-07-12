import React, { useEffect, useMemo, useState } from 'react';
import {
  createRemoteDeckClient,
  type RemoteDeckClientStatus,
} from '../../shared/remoteDeckClient';
import { DEFAULT_REMOTE_DECK_LAYOUT, type RemoteDeckButton } from '../../shared/remoteDeckLayout';
import { PropertySurface, type SelectionContext } from './PropertySurface';

const STATUS_LABELS: Record<RemoteDeckClientStatus, string> = {
  connecting: '接続中…',
  connected: '接続済み',
  disconnected: '切断',
};

const STATUS_COLOURS: Record<RemoteDeckClientStatus, string> = {
  connecting: '#e0a030',
  connected: '#39b54a',
  disconnected: '#c0392b',
};

const buildWsUrl = (): string => {
  const token = new URLSearchParams(window.location.search).get('token') ?? '';
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${window.location.host}/?token=${token}`;
};

const vibrate = () => {
  // iOS Safari does not implement navigator.vibrate; silently ignored there.
  if (typeof navigator.vibrate === 'function') navigator.vibrate(20);
};

export const DeckApp: React.FC = () => {
  const [status, setStatus] = useState<RemoteDeckClientStatus>('disconnected');
  const [context, setContext] = useState<SelectionContext | null>(null);
  const layout = DEFAULT_REMOTE_DECK_LAYOUT;

  const client = useMemo(
    () =>
      createRemoteDeckClient({
        url: buildWsUrl(),
        createSocket: (url) => new WebSocket(url),
        schedule: (run, delayMs) => {
          const timer = window.setTimeout(run, delayMs);
          return () => window.clearTimeout(timer);
        },
      }),
    [],
  );

  useEffect(() => {
    const unsubscribeStatus = client.onStatusChange(setStatus);
    const unsubscribeState = client.onStateMessage((payload) => {
      const candidate = payload as SelectionContext | null;
      if (candidate && typeof candidate === 'object' && Array.isArray(candidate.properties)) {
        setContext(candidate);
      }
    });
    client.connect();
    return () => {
      unsubscribeStatus();
      unsubscribeState();
      client.close();
    };
  }, [client]);

  const handlePress = (button: RemoteDeckButton) => {
    const sent = client.sendCommand(button.commandId, button.payload);
    if (sent) vibrate();
  };

  const handleSurfaceCommand = (id: string, payload?: unknown) => {
    const sent = client.sendCommand(id, payload);
    if (sent) vibrate();
    return sent;
  };

  // TouchBar 風: 選択中はコンテキスト操作面、非選択時は従来のボタングリッド
  const showSurface = status === 'connected' && context !== null && context.objectId !== null;

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#111',
        colorScheme: 'dark',
        color: '#eee',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'system-ui, sans-serif',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        touchAction: 'manipulation',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          fontSize: 13,
        }}
      >
        <span style={{ opacity: 0.7 }}>UXFD Remote Deck</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: STATUS_COLOURS[status],
              display: 'inline-block',
            }}
          />
          {STATUS_LABELS[status]}
        </span>
      </header>
      {showSurface && context ? (
        <PropertySurface context={context} sendCommand={handleSurfaceCommand} />
      ) : (
      <main
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: `repeat(${layout.columns}, 1fr)`,
          gap: 10,
          padding: 12,
          alignContent: 'stretch',
        }}
      >
        {layout.buttons.map((button) => (
          <button
            key={button.id}
            onClick={() => handlePress(button)}
            disabled={status !== 'connected'}
            style={{
              minHeight: 72,
              borderRadius: 12,
              border: '1px solid #333',
              background: status === 'connected' ? '#1e1e1e' : '#161616',
              color: status === 'connected' ? '#eee' : '#555',
              fontSize: 15,
              fontWeight: 600,
            }}
          >
            {button.label}
          </button>
        ))}
      </main>
      )}
    </div>
  );
};
