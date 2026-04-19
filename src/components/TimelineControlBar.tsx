import React from 'react';
import { useStore } from '../store/useStore';
import { shallow } from 'zustand/shallow';
import { useTranslation } from '../i18n';
import { 
  Play, Pause, 
  Square, Type, Image as ImageIcon, Film, Music, 
  SplitSquareHorizontal, Copy, Scissors, ClipboardPaste, CopyPlus, Link, Unlink 
} from 'lucide-react';

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
        className={`btn-icon ${isPlaying ? 'btn-danger' : ''}`}
        onClick={togglePlay} 
        disabled={isExporting}
      >
        {isPlaying ? <Pause size={14} /> : <Play size={14} />}
      </button>

      <div className="divider"></div>

      <button className="btn-icon" onClick={onAddShape} title={t('shapeType')}><Square size={14} /></button>
      <button className="btn-icon" onClick={onAddText} title="Text"><Type size={14} /></button>
      <button className="btn-icon" onClick={onAddImage} title="Image"><ImageIcon size={14} /></button>
      <button className="btn-icon" onClick={onAddVideo} title="Video"><Film size={14} /></button>
      <button className="btn-icon" onClick={onAddAudio} title="Audio"><Music size={14} /></button>
      <button 
        className="btn-primary"
        onClick={onAddPsd} 
        disabled={isExporting}
        style={{ padding: '0 8px', height: '32px' }}
      >
        PSD
      </button>
      <button 
        className="btn-success"
        onClick={onAddGroup} 
        disabled={isExporting}
        style={{ padding: '0 8px', height: '32px' }}
      >
        {language === 'ja' ? '連' : 'GRP'}
      </button>
      
      <div className="divider"></div>

      <button onClick={splitObject} disabled={isExporting} title={t('split')}><SplitSquareHorizontal size={14} /></button>
      <button onClick={copySelectedObjects} disabled={isExporting || !hasSelection} title={t('copy')}><Copy size={14} /></button>
      <button onClick={cutSelectedObjects} disabled={isExporting || !hasSelection} title={t('cut')}><Scissors size={14} /></button>
      <button onClick={pasteClipboardObjects} disabled={isExporting} title={t('paste')}><ClipboardPaste size={14} /></button>
      <button onClick={duplicateSelectedObjects} disabled={isExporting || !hasSelection} title={t('duplicate')}><CopyPlus size={14} /></button>
      <button onClick={groupSelectedObjects} disabled={isExporting || !hasMultipleSelection} title={t('group')}><Link size={14} /></button>
      <button onClick={ungroupSelectedObjects} disabled={isExporting || !hasSelection} title={t('ungroup')}><Unlink size={14} /></button>
      
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>
              {language === 'ja' ? '長さ' : 'Dur'}:
            </span>
            <input 
              type="number" 
              value={duration} 
              onChange={(e) => setDuration(parseFloat(e.target.value))} 
              disabled={isExporting} 
              style={{ width: '48px', padding: '2px 4px', textAlign: 'center' }}
            />
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>s</span>
          </div>
          
          <div className="divider" style={{ margin: '0 4px' }}></div>
          
          <span style={{ fontFamily: 'monospace', fontSize: '15px', fontWeight: 700, color: 'var(--accent-blue)', minWidth: '60px', textAlign: 'right' }}>
            {currentTime.toFixed(2)}s
          </span>
      </div>
    </div>
  );
};
