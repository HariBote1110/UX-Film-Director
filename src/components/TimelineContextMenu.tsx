import React, { useRef, useLayoutEffect, useState, useEffect } from 'react';
import { useStore } from '../store/useStore';

export interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  type: 'canvas' | 'object';
  time: number;
  layer: number;
  targetObjectId?: string;
}

interface TimelineContextMenuProps {
  state: ContextMenuState;
  onClose: () => void;
  onAddShape: () => void;
  onAddText: () => void;
  onAddImage: () => void;
  onAddVideo: () => void;
  onAddAudio: () => void;
  onAddPsd: () => void;
  onAddGroup: () => void;
}

export const TimelineContextMenu: React.FC<TimelineContextMenuProps> = ({
  state,
  onClose,
  onAddShape,
  onAddText,
  onAddImage,
  onAddVideo,
  onAddAudio,
  onAddPsd,
  onAddGroup,
}) => {
  const { deleteObject, selectObject, splitObject, addObject } = useStore();
  const menuRef = useRef<HTMLDivElement>(null);
  
  const [position, setPosition] = useState({ top: state.y, left: state.x });

  // 画面外はみ出し防止
  useLayoutEffect(() => {
    if (menuRef.current) {
      const menu = menuRef.current;
      const rect = menu.getBoundingClientRect();
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;

      let newTop = state.y;
      let newLeft = state.x;

      if (newTop + rect.height > windowHeight) {
        newTop = state.y - rect.height;
        if (newTop < 0) newTop = windowHeight - rect.height - 10;
      }

      if (newLeft + rect.width > windowWidth) {
        newLeft = state.x - rect.width;
        if (newLeft < 0) newLeft = 10;
      }

      setPosition({ top: newTop, left: newLeft });
    }
  }, [state.x, state.y]);

  // 外側クリックで閉じる
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  // 音声波形追加ハンドラ
  const handleAddWaveform = () => {
      addObject({
          id: crypto.randomUUID(),
          type: 'audio_visualization',
          name: 'Waveform',
          layer: state.layer,
          startTime: state.time,
          duration: 5,
          x: 400, y: 300,
          width: 400, height: 100,
          rotation: 0, scaleX: 1, scaleY: 1, opacity: 1,
          enableAnimation: false, endX: 400, endY: 300, easing: 'linear',
          targetAudioId: null,
          targetLayer: state.layer - 1 >= 0 ? state.layer - 1 : -1, // デフォルトで一つ上のレイヤーを対象に
          visualizationType: 'waveform',
          color: '#00ff00',
          thickness: 2,
          amplitude: 1.0
      });
      onClose();
  };

  return (
    <div 
      ref={menuRef}
      style={{ 
        position: 'fixed', 
        top: position.top, 
        left: position.left, 
        background: '#252526', 
        border: '1px solid #454545', 
        boxShadow: '0 4px 10px rgba(0,0,0,0.5)', 
        zIndex: 9999, 
        minWidth: '160px', 
        borderRadius: '4px', 
        padding: '4px 0', 
        fontSize: '12px' 
      }} 
      onClick={(e) => e.stopPropagation()}
    >
      {state.type === 'canvas' && (
        <>
            <div style={{ padding: '4px 12px', color: '#888', borderBottom: '1px solid #333', marginBottom: '4px' }}>
              Time: {state.time.toFixed(2)}s <br/> Layer: {state.layer + 1}
            </div>
            <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#eee' }} onClick={() => { onAddShape(); onClose(); }}>図形を追加</div>
            <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#eee' }} onClick={() => { onAddText(); onClose(); }}>テキストを追加</div>
            <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#eee' }} onClick={() => { onAddImage(); onClose(); }}>画像を追加</div>
            <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#eee' }} onClick={() => { onAddVideo(); onClose(); }}>動画を追加</div>
            <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#eee' }} onClick={() => { onAddAudio(); onClose(); }}>音声を追加</div>
            <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#eee' }} onClick={() => { onAddPsd(); onClose(); }}>PSD立ち絵を追加</div>
            <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#eee' }} onClick={() => { onAddGroup(); onClose(); }}>グループ制御を追加</div>
            <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#aaffaa' }} onClick={handleAddWaveform}>音声波形を追加</div>
        </>
      )}
      {state.type === 'object' && state.targetObjectId && (
         <>
            <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#eee' }} onClick={() => { splitObject(); onClose(); }}>ここで分割</div>
            <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#ff6b6b' }} onClick={() => { deleteObject(state.targetObjectId!); selectObject(null); onClose(); }}>削除</div>
         </>
      )}
    </div>
  );
};