import React from 'react';
import { useStore } from '../store/useStore';
import { shallow } from 'zustand/shallow';
import { useTranslation } from '../i18n';

interface TimelineControlBarProps {
  onAddShape: () => void;
  onAddText: () => void;
  onAddImage: () => void;
  onAddVideo: () => void;
  onAddAudio: () => void;
  onAddPsd: () => void;
  onAddGroup: () => void;
}

export const TimelineControlBar: React.FC<TimelineControlBarProps> = ({
  onAddShape,
  onAddText,
  onAddImage,
  onAddVideo,
  onAddAudio,
  onAddPsd,
  onAddGroup,
}) => {
  const { 
    isPlaying, togglePlay, splitObject, isExporting, duration, setDuration, currentTime,
    selectedIds, copySelectedObjects, cutSelectedObjects, pasteClipboardObjects, duplicateSelectedObjects,
    groupSelectedObjects, ungroupSelectedObjects, language
  } = useStore((state) => ({
    isPlaying: state.isPlaying,
    togglePlay: state.togglePlay,
    splitObject: state.splitObject,
    isExporting: state.isExporting,
    duration: state.duration,
    setDuration: state.setDuration,
    currentTime: state.currentTime,
    selectedIds: state.selectedIds,
    copySelectedObjects: state.copySelectedObjects,
    cutSelectedObjects: state.cutSelectedObjects,
    pasteClipboardObjects: state.pasteClipboardObjects,
    duplicateSelectedObjects: state.duplicateSelectedObjects,
    groupSelectedObjects: state.groupSelectedObjects,
    ungroupSelectedObjects: state.ungroupSelectedObjects,
    language: state.language,
  }), shallow);

  const t = useTranslation(language);

  const hasSelection = selectedIds.length > 0;
  const hasMultipleSelection = selectedIds.length > 1;

  return (
    <div className="control-bar no-drag">
      <button 
        className={isPlaying ? 'btn-danger' : ''}
        onClick={togglePlay} 
        disabled={isExporting} 
        style={{ width: '32px', height: '32px' }}
      >
        {isPlaying ? '❚❚' : '▶'}
      </button>

      <div className="divider"></div>

      <button onClick={onAddShape} disabled={isExporting}>+ {t('shapeType')}</button>
      <button onClick={onAddText} disabled={isExporting}>+ Text</button>
      <button onClick={onAddImage} disabled={isExporting}>+ Image</button>
      <button onClick={onAddVideo} disabled={isExporting}>+ Video</button>
      <button onClick={onAddAudio} disabled={isExporting}>+ Audio</button>
      <button 
        className="btn-primary"
        onClick={onAddPsd} 
        disabled={isExporting}
      >
        + PSD
      </button>
      <button 
        className="btn-success"
        onClick={onAddGroup} 
        disabled={isExporting}
      >
        + {t('group')}
      </button>
      
      <div className="divider"></div>

      <button onClick={splitObject} disabled={isExporting}>{t('split')}</button>
      <button onClick={copySelectedObjects} disabled={isExporting || !hasSelection}>{t('copy')}</button>
      <button onClick={cutSelectedObjects} disabled={isExporting || !hasSelection}>{t('cut')}</button>
      <button onClick={pasteClipboardObjects} disabled={isExporting}>{t('paste')}</button>
      <button onClick={duplicateSelectedObjects} disabled={isExporting || !hasSelection}>{t('duplicate')}</button>
      <button onClick={groupSelectedObjects} disabled={isExporting || !hasMultipleSelection}>{t('group')}</button>
      <button onClick={ungroupSelectedObjects} disabled={isExporting || !hasSelection}>{t('ungroup')}</button>
      
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>{t('duration')}:</span>
            <input 
              type="number" 
              value={duration} 
              onChange={(e) => setDuration(parseFloat(e.target.value))} 
              disabled={isExporting} 
              style={{ width: '60px' }}
            />
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>s</span>
          </div>
          
          <div className="divider"></div>
          
          <span style={{ fontFamily: 'monospace', fontSize: '14px', fontWeight: 700, color: 'var(--accent-blue)', minWidth: '60px', textAlign: 'right' }}>
            {currentTime.toFixed(2)}s
          </span>
      </div>
    </div>
  );
};
