import React, { useRef, useLayoutEffect, useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { shallow } from 'zustand/shallow';
import { useTranslation } from '../i18n';
import { buildAviUtlBarcodeObject } from '../utils/barcodeObjectFactory';
import { buildAviUtlPuzzlePieceObject } from '../utils/puzzlePieceObjectFactory';
import {
  buildAviUtlAuraEmissionObject,
  buildAviUtlBubbleObject,
  buildAviUtlFocusLinesObject,
  buildAviUtlInkSplashObject,
  buildDefaultStandardParticleObject,
} from '../utils/particleObjectFactory';

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
  const {
    deleteObject, deleteSelectedObjects, selectObject, splitObject, addObject,
    copySelectedObjects, cutSelectedObjects, pasteClipboardObjects, duplicateSelectedObjects,
    groupSelectedObjects, ungroupSelectedObjects, selectedIds, projectSettings, language
  } = useStore((state) => ({
    deleteObject: state.deleteObject,
    deleteSelectedObjects: state.deleteSelectedObjects,
    selectObject: state.selectObject,
    splitObject: state.splitObject,
    addObject: state.addObject,
    copySelectedObjects: state.copySelectedObjects,
    cutSelectedObjects: state.cutSelectedObjects,
    pasteClipboardObjects: state.pasteClipboardObjects,
    duplicateSelectedObjects: state.duplicateSelectedObjects,
    groupSelectedObjects: state.groupSelectedObjects,
    ungroupSelectedObjects: state.ungroupSelectedObjects,
    selectedIds: state.selectedIds,
    projectSettings: state.projectSettings,
    language: state.language,
  }), shallow);
  const menuRef = useRef<HTMLDivElement>(null);
  const t = useTranslation(language);
  
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
      const waveformWidth = Math.max(120, Math.round(projectSettings.width * 0.4));
      const waveformHeight = Math.max(80, Math.round(projectSettings.height * 0.14));
      const centredX = Math.round((projectSettings.width - waveformWidth) / 2);
      const centredY = Math.round((projectSettings.height - waveformHeight) / 2);
      addObject({
          id: crypto.randomUUID(),
          type: 'audio_visualization',
          name: 'Waveform',
          layer: state.layer,
          startTime: state.time,
          duration: 5,
          x: centredX, y: centredY,
          width: waveformWidth, height: waveformHeight,
          rotation: 0, scaleX: 1, scaleY: 1, opacity: 1,
          enableAnimation: false, endX: centredX, endY: centredY, easing: 'linear',
          targetAudioId: null,
          targetLayer: state.layer - 1 >= 0 ? state.layer - 1 : -1, // デフォルトで一つ上のレイヤーを対象に
          visualizationType: 'waveform',
          color: '#00ff00',
          thickness: 2,
          amplitude: 1.0
      });
      onClose();
  };

  const handleAddParticle = () => {
    addObject(buildDefaultStandardParticleObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
    onClose();
  };

  const handleAddBarcode = () => {
    addObject(buildAviUtlBarcodeObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
    onClose();
  };

  const handleAddPuzzlePiece = () => {
    addObject(buildAviUtlPuzzlePieceObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
    onClose();
  };

  const handleAddAuraEmission = () => {
    addObject(buildAviUtlAuraEmissionObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
    onClose();
  };

  const handleAddBubble = () => {
    addObject(buildAviUtlBubbleObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
    onClose();
  };

  const handleAddFocusLines = () => {
    addObject(buildAviUtlFocusLinesObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
    onClose();
  };

  const handleAddInkSplash = () => {
    addObject(buildAviUtlInkSplashObject({
      id: crypto.randomUUID(),
      projectWidth: projectSettings.width,
      projectHeight: projectSettings.height,
      startTime: state.time,
      layer: state.layer,
    }));
    onClose();
  };

  const ensureObjectSelection = (objectId: string) => {
    if (!selectedIds.includes(objectId)) {
      selectObject(objectId);
    }
    return true;
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
            <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#eee' }} onClick={() => { onAddShape(); onClose(); }}>{t('addShape')}</div>
            <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#eee' }} onClick={() => { onAddText(); onClose(); }}>{t('addText')}</div>
            <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#eee' }} onClick={() => { onAddImage(); onClose(); }}>{t('addImage')}</div>
            <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#eee' }} onClick={() => { onAddVideo(); onClose(); }}>{t('addVideo')}</div>
            <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#eee' }} onClick={() => { onAddAudio(); onClose(); }}>{t('addAudio')}</div>
            <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#eee' }} onClick={() => { onAddPsd(); onClose(); }}>{language === 'en' ? 'Add PSD' : 'PSD立ち絵を追加'}</div>
            <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#eee' }} onClick={() => { onAddGroup(); onClose(); }}>{language === 'en' ? 'Add Group Control' : 'グループ制御を追加'}</div>
            <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#aaffaa' }} onClick={handleAddWaveform}>{language === 'en' ? 'Add Waveform' : '音声波形を追加'}</div>
            <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#aaffaa' }} onClick={handleAddBarcode}>{language === 'en' ? 'Add Barcode' : 'バーコードを追加'}</div>
            <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#aaffaa' }} onClick={handleAddPuzzlePiece}>{language === 'en' ? 'Add Puzzle Piece' : 'パズルピースを追加'}</div>
            <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#aaffaa' }} onClick={handleAddParticle}>{language === 'en' ? 'Add Standard Particle' : '標準パーティクルを追加'}</div>
            <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#aaffaa' }} onClick={handleAddAuraEmission}>{language === 'en' ? 'Add Aura Emission' : 'オーラ放出を追加'}</div>
            <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#aaffaa' }} onClick={handleAddBubble}>{language === 'en' ? 'Add Bubbles' : '泡を追加'}</div>
            <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#aaffaa' }} onClick={handleAddFocusLines}>{language === 'en' ? 'Add Focus Lines' : '集中線を追加'}</div>
            <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#aaffaa' }} onClick={handleAddInkSplash}>{language === 'en' ? 'Add Ink Splash' : 'インクを追加'}</div>
        </>
      )}
      {state.type === 'object' && state.targetObjectId && (
         <>
            <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#eee' }} onClick={() => { splitObject(); onClose(); }}>{t('split')}</div>
            <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#eee' }} onClick={() => { if (ensureObjectSelection(state.targetObjectId!)) copySelectedObjects(); onClose(); }}>{t('copy')}</div>
            <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#eee' }} onClick={() => { if (ensureObjectSelection(state.targetObjectId!)) cutSelectedObjects(); onClose(); }}>{t('cut')}</div>
            <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#eee' }} onClick={() => { if (ensureObjectSelection(state.targetObjectId!)) duplicateSelectedObjects(); onClose(); }}>{t('duplicate')}</div>
            <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#eee' }} onClick={() => { pasteClipboardObjects(); onClose(); }}>{t('paste')}</div>
            <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#eee' }} onClick={() => { if (ensureObjectSelection(state.targetObjectId!)) groupSelectedObjects(); onClose(); }}>{t('group')}</div>
            <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#eee' }} onClick={() => { if (ensureObjectSelection(state.targetObjectId!)) ungroupSelectedObjects(); onClose(); }}>{t('ungroup')}</div>
            <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#ff6b6b' }} onClick={() => {
              if (selectedIds.includes(state.targetObjectId!)) {
                deleteSelectedObjects();
              } else {
                deleteObject(state.targetObjectId!);
              }
              selectObject(null);
              onClose();
            }}>{t('delete')}</div>
         </>
      )}
    </div>
  );
};
