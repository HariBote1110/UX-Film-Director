import React, { useEffect, useState } from 'react';
import { Smartphone } from 'lucide-react';
import { buildRemoteDeckQrDataUrl } from '../remoteDeck/remoteDeckQr';
import {
  remoteDeckIpcChannels,
  type RemoteDeckConnectionInfo,
} from '../../shared/remoteDeckProtocol';

const { ipcRenderer } = window;

/**
 * Minimal Remote Control Deck connection panel: a title-bar button that
 * reveals a QR code encoding the LAN connection URL (token included).
 * Layout polish is deferred to Phase 6.
 */
export const RemoteDeckPanel: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [connectionUrl, setConnectionUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    const load = async () => {
      try {
        if (typeof ipcRenderer?.invoke !== 'function') {
          throw new Error('IPC unavailable');
        }
        const info = (await ipcRenderer.invoke(
          remoteDeckIpcChannels.getConnectionInfo,
        )) as RemoteDeckConnectionInfo | null;
        const url = info?.urls[0];
        if (!url) {
          throw new Error('no LAN address');
        }
        const dataUrl = await buildRemoteDeckQrDataUrl(url);
        if (cancelled) return;
        setConnectionUrl(url);
        setQrDataUrl(dataUrl);
        setErrorMessage(null);
      } catch {
        if (cancelled) return;
        setQrDataUrl(null);
        setConnectionUrl(null);
        setErrorMessage('リモートデッキに接続できません（サーバ未起動またはLAN未接続）');
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

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
            width: 260,
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
        </div>
      )}
    </div>
  );
};
