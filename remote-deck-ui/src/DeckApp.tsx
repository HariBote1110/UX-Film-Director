import React, { useEffect, useMemo, useState } from 'react';
import {
  createRemoteDeckClient,
  type RemoteDeckClientStatus,
} from '../../shared/remoteDeckClient';
import {
  DEFAULT_REMOTE_DECK_LAYOUT,
  parseRemoteDeckLayout,
  type RemoteDeckButton,
  type RemoteDeckLayout,
} from '../../shared/remoteDeckLayout';
import {
  gridColumnsForMode,
  resolveRemoteDeckLayoutMode,
} from '../../shared/remoteDeckLayoutMode';
import { formatRemoteDeckTimecode } from '../../shared/remoteDeckTimecode';
import { PropertySurface, type SelectionContext } from './PropertySurface';

interface PlaybackState {
  kind: 'playback';
  isPlaying: boolean;
  timeSeconds: number;
  fps: number;
}

const isPlaybackState = (payload: unknown): payload is PlaybackState =>
  typeof payload === 'object' && payload !== null &&
  (payload as { kind?: unknown }).kind === 'playback';

const STATUS_LABELS: Record<RemoteDeckClientStatus, string> = {
  connecting: '接続中…',
  connected: '接続済み',
  disconnected: '切断',
};

const STATUS_COLOURS: Record<RemoteDeckClientStatus, string> = {
  connecting: '#e0a030',
  connected: '#39b54a',
  disconnected: '#e0403a',
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
  const [playback, setPlayback] = useState<PlaybackState | null>(null);
  const [viewport, setViewport] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  const [layout, setLayout] = useState<RemoteDeckLayout>(DEFAULT_REMOTE_DECK_LAYOUT);

  // ユーザー定義レイアウト（userData/remote-deck-layout.json）。無い・不正なら既定のまま
  useEffect(() => {
    let cancelled = false;
    fetch('./layout.json')
      .then((response) => (response.ok ? response.text() : null))
      .then((text) => {
        if (cancelled || text === null) return;
        const parsed = parseRemoteDeckLayout(text);
        if (parsed.buttons.length > 0) setLayout(parsed);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

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
    const onResize = () =>
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const unsubscribeStatus = client.onStatusChange(setStatus);
    const unsubscribeState = client.onStateMessage((payload) => {
      if (isPlaybackState(payload)) {
        setPlayback(payload);
        return;
      }
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

  const mode = resolveRemoteDeckLayoutMode(viewport);
  // 横向き・タブレットではトランスポートと操作面を同時表示する
  const splitView = mode !== 'phone-portrait';
  const hasSelection = context !== null && context.objectId !== null;
  const showSurfaceOnly = !splitView && status === 'connected' && hasSelection;
  const columns = gridColumnsForMode(mode, layout.columns);
  const isPlaying = playback?.isPlaying === true;

  const transportGrid = (
    <main
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gap: 10,
        padding: 12,
        alignContent: 'start',
        ...(splitView
          ? { width: mode === 'tablet' ? 400 : '42%', flex: '0 0 auto', overflowY: 'auto' }
          : { flex: 1 }),
      }}
    >
      {layout.buttons.map((button) => {
        const isPlayToggle = button.commandId === 'playback.toggle';
        const isActive = isPlayToggle && isPlaying;
        return (
          <button
            key={button.id}
            onClick={() => handlePress(button)}
            disabled={status !== 'connected'}
            style={{
              minHeight: mode === 'tablet' ? 84 : 72,
              borderRadius: 12,
              border: isActive ? '1px solid #5ad06a' : '1px solid #333',
              background: isActive ? '#1f4d27' : status === 'connected' ? '#1e1e1e' : '#161616',
              color: isActive ? '#c8f7cf' : status === 'connected' ? '#eee' : '#555',
              fontSize: mode === 'tablet' ? 17 : 15,
              fontWeight: 600,
            }}
          >
            {isPlayToggle ? (isActive ? '⏸ 停止' : '▶ 再生') : button.label}
          </button>
        );
      })}
    </main>
  );

  const surfacePane = hasSelection && context ? (
    <PropertySurface context={context} sendCommand={handleSurfaceCommand} />
  ) : (
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#555',
        fontSize: 15,
      }}
    >
      オブジェクト未選択
    </div>
  );

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
      {/* Glanceable header: 横目でも読めるサイズ・コントラスト。切断時は赤背景で即時に分かる */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: splitView ? '10px 18px' : '12px 16px',
          borderBottom: '1px solid #222',
          background: status === 'disconnected' ? '#3a1412' : 'transparent',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <span style={{ fontSize: 11, opacity: 0.55 }}>UXFD Remote Deck</span>
          <span
            style={{
              fontSize: mode === 'tablet' ? 24 : 18,
              fontWeight: 700,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: mode === 'tablet' ? 420 : 180,
              color: hasSelection ? '#eee' : '#555',
            }}
          >
            {hasSelection ? context!.objectName ?? context!.objectType : '未選択'}
          </span>
        </div>
        <span
          style={{
            fontVariantNumeric: 'tabular-nums',
            fontSize: mode === 'tablet' ? 40 : splitView ? 30 : 26,
            fontWeight: 800,
            letterSpacing: 1,
            color: isPlaying ? '#5ad06a' : '#eee',
          }}
        >
          {formatRemoteDeckTimecode(playback?.timeSeconds ?? 0, playback?.fps ?? 60)}
        </span>
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 13,
            fontWeight: 600,
            color: STATUS_COLOURS[status],
          }}
        >
          <span
            style={{
              width: 12,
              height: 12,
              borderRadius: '50%',
              background: STATUS_COLOURS[status],
              display: 'inline-block',
            }}
          />
          {STATUS_LABELS[status]}
        </span>
      </header>
      {splitView ? (
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          {transportGrid}
          <div
            style={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              borderLeft: '1px solid #222',
              overflowY: 'auto',
            }}
          >
            {surfacePane}
          </div>
        </div>
      ) : showSurfaceOnly ? (
        <PropertySurface context={context!} sendCommand={handleSurfaceCommand} />
      ) : (
        transportGrid
      )}
    </div>
  );
};
