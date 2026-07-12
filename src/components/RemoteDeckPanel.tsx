import React, { useCallback, useEffect, useState } from 'react';
import { Smartphone } from 'lucide-react';
import { buildRemoteDeckQrDataUrl } from '../remoteDeck/remoteDeckQr';
import {
  remoteDeckIpcChannels,
  type RemoteDeckConnectionInfo,
} from '../../shared/remoteDeckProtocol';

const { ipcRenderer } = window;

interface DeckConnection {
  id: string;
  remoteAddress: string;
  connectedAt: number;
}

const formatConnectedAt = (timestamp: number): string =>
  new Date(timestamp).toLocaleTimeString();

/**
 * Remote Control Deck connection panel (Phase 6):
 * QR code, connected-device list with per-device disconnect, token
 * regeneration (drops every session and refreshes the QR), and a shortcut
 * to the user-editable layout JSON.
 */
export const RemoteDeckPanel: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [connectionUrl, setConnectionUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [connections, setConnections] = useState<DeckConnection[]>([]);

  const applyConnectionInfo = useCallback(async (info: RemoteDeckConnectionInfo | null) => {
    const url = info?.urls[0];
    if (!url) throw new Error('no LAN address');
    const dataUrl = await buildRemoteDeckQrDataUrl(url);
    setConnectionUrl(url);
    setQrDataUrl(dataUrl);
    setErrorMessage(null);
  }, []);

  const loadInfo = useCallback(async () => {
    try {
      if (typeof ipcRenderer?.invoke !== 'function') throw new Error('IPC unavailable');
      const info = (await ipcRenderer.invoke(
        remoteDeckIpcChannels.getConnectionInfo,
      )) as RemoteDeckConnectionInfo | null;
      await applyConnectionInfo(info);
    } catch {
      setQrDataUrl(null);
      setConnectionUrl(null);
      setErrorMessage('リモートデッキに接続できません（サーバ未起動またはLAN未接続）');
    }
  }, [applyConnectionInfo]);

  const refreshConnections = useCallback(async () => {
    if (typeof ipcRenderer?.invoke !== 'function') return;
    try {
      const list = (await ipcRenderer.invoke(
        remoteDeckIpcChannels.listConnections,
      )) as DeckConnection[];
      setConnections(Array.isArray(list) ? list : []);
    } catch {
      setConnections([]);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    void loadInfo();
    void refreshConnections();
    // 開いている間だけ接続一覧をポーリング
    const timer = window.setInterval(() => {
      void refreshConnections();
    }, 2000);
    return () => window.clearInterval(timer);
  }, [isOpen, loadInfo, refreshConnections]);

  const handleDisconnect = async (id: string) => {
    if (typeof ipcRenderer?.invoke !== 'function') return;
    await ipcRenderer.invoke(remoteDeckIpcChannels.disconnectClient, { id });
    void refreshConnections();
  };

  const handleRegenerateToken = async () => {
    if (typeof ipcRenderer?.invoke !== 'function') return;
    try {
      const info = (await ipcRenderer.invoke(
        remoteDeckIpcChannels.regenerateToken,
      )) as RemoteDeckConnectionInfo | null;
      await applyConnectionInfo(info);
    } catch {
      setErrorMessage('トークンの再生成に失敗しました');
    }
    void refreshConnections();
  };

  const handleOpenLayoutFile = async () => {
    if (typeof ipcRenderer?.invoke !== 'function') return;
    await ipcRenderer.invoke(remoteDeckIpcChannels.openLayoutFile);
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button onClick={() => setIsOpen((open) => !open)} title="リモートデッキ">
        <Smartphone size={14} />
      </button>
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '110%',
            right: 0,
            zIndex: 1000,
            background: '#222',
            border: '1px solid #444',
            borderRadius: 6,
            padding: 12,
            width: 280,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 12, marginBottom: 8 }}>スマホでスキャンして接続</div>
          {qrDataUrl ? (
            <>
              <img src={qrDataUrl} alt="Remote deck QR code" style={{ width: 220, height: 220 }} />
              <div style={{ fontSize: 10, wordBreak: 'break-all', marginTop: 8, opacity: 0.7 }}>
                {connectionUrl}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 11, opacity: 0.8 }}>{errorMessage ?? '読み込み中…'}</div>
          )}

          <div
            style={{
              marginTop: 12,
              paddingTop: 10,
              borderTop: '1px solid #3a3a3a',
              textAlign: 'left',
            }}
          >
            <div style={{ fontSize: 11, opacity: 0.8, marginBottom: 6 }}>
              接続中のデバイス（{connections.length}）
            </div>
            {connections.length === 0 ? (
              <div style={{ fontSize: 11, opacity: 0.5, marginBottom: 6 }}>接続なし</div>
            ) : (
              connections.map((connection) => (
                <div
                  key={connection.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 6,
                    fontSize: 11,
                    marginBottom: 4,
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {connection.remoteAddress}（{formatConnectedAt(connection.connectedAt)}〜）
                  </span>
                  <button
                    onClick={() => void handleDisconnect(connection.id)}
                    style={{ fontSize: 10, flex: '0 0 auto' }}
                  >
                    切断
                  </button>
                </div>
              ))
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button
              onClick={() => void handleRegenerateToken()}
              title="トークンを再生成すると接続中のデバイスはすべて切断されます"
              style={{ flex: 1, fontSize: 11 }}
            >
              トークン再生成
            </button>
            <button onClick={() => void handleOpenLayoutFile()} style={{ flex: 1, fontSize: 11 }}>
              レイアウトファイルを開く
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
