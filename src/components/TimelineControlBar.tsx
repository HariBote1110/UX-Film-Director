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
    <div className="no-drag" style={{ padding: '8px', borderBottom: '1px solid #111', display: 'flex', gap: '8px', alignItems: 'center', background: '#333', zIndex: 1000, fontSize: '12px' }}>
      <button onClick={togglePlay} disabled={isExporting} style={{ width: '30px', height: '24px', background: isPlaying ? '#a00' : '#444', border:'none', color:'white', borderRadius:'2px', cursor:'pointer' }}>{isPlaying ? '❚❚' : '▶'}</button>
      <div style={{ width: '1px', height: '16px', background: '#555', margin: '0 4px' }}></div>
      <button onClick={onAddShape} disabled={isExporting} style={{background:'#444', border:'none', color:'white', borderRadius:'2px', padding:'4px 8px', cursor:'pointer'}}>+ {t('shapeType')}</button>
      <button onClick={onAddText} disabled={isExporting} style={{background:'#444', border:'none', color:'white', borderRadius:'2px', padding:'4px 8px', cursor:'pointer'}}>+ Text</button>
      <button onClick={onAddImage} disabled={isExporting} style={{background:'#444', border:'none', color:'white', borderRadius:'2px', padding:'4px 8px', cursor:'pointer'}}>+ Image</button>
      <button onClick={onAddVideo} disabled={isExporting} style={{background:'#444', border:'none', color:'white', borderRadius:'2px', padding:'4px 8px', cursor:'pointer'}}>+ Video</button>
      <button onClick={onAddAudio} disabled={isExporting} style={{background:'#444', border:'none', color:'white', borderRadius:'2px', padding:'4px 8px', cursor:'pointer'}}>+ Audio</button>
      <button onClick={onAddPsd} disabled={isExporting} style={{ background: '#2b5c85', border:'none', color:'white', borderRadius:'2px', padding:'4px 8px', cursor:'pointer' }}>+ PSD</button>
      <button onClick={onAddGroup} disabled={isExporting} style={{background:'#2ecc71', border:'none', color:'white', borderRadius:'2px', padding:'4px 8px', cursor:'pointer'}}>+ {t('group')}</button>
      
      <div style={{ width: '1px', height: '16px', background: '#555', margin: '0 4px' }}></div>
      <button onClick={splitObject} disabled={isExporting} style={{background:'#444', border:'none', color:'white', borderRadius:'2px', padding:'4px 8px', cursor:'pointer'}}>{t('split')}</button>
      <button onClick={copySelectedObjects} disabled={isExporting || !hasSelection} style={{background:'#444', border:'none', color:'white', borderRadius:'2px', padding:'4px 8px', cursor:isExporting || !hasSelection ? 'default' : 'pointer'}}>{t('copy')}</button>
      <button onClick={cutSelectedObjects} disabled={isExporting || !hasSelection} style={{background:'#444', border:'none', color:'white', borderRadius:'2px', padding:'4px 8px', cursor:isExporting || !hasSelection ? 'default' : 'pointer'}}>{t('cut')}</button>
      <button onClick={pasteClipboardObjects} disabled={isExporting} style={{background:'#444', border:'none', color:'white', borderRadius:'2px', padding:'4px 8px', cursor:isExporting ? 'default' : 'pointer'}}>{t('paste')}</button>
      <button onClick={duplicateSelectedObjects} disabled={isExporting || !hasSelection} style={{background:'#444', border:'none', color:'white', borderRadius:'2px', padding:'4px 8px', cursor:isExporting || !hasSelection ? 'default' : 'pointer'}}>{t('duplicate')}</button>
      <button onClick={groupSelectedObjects} disabled={isExporting || !hasMultipleSelection} style={{background:'#444', border:'none', color:'white', borderRadius:'2px', padding:'4px 8px', cursor:isExporting || !hasMultipleSelection ? 'default' : 'pointer'}}>{t('group')}</button>
      <button onClick={ungroupSelectedObjects} disabled={isExporting || !hasSelection} style={{background:'#444', border:'none', color:'white', borderRadius:'2px', padding:'4px 8px', cursor:isExporting || !hasSelection ? 'default' : 'pointer'}}>{t('ungroup')}</button>
      
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>{t('duration')}:</span>
          <input type="number" value={duration} onChange={(e) => setDuration(parseFloat(e.target.value))} disabled={isExporting} style={{ width: '50px', background: '#222', border: '1px solid #555', color: '#fff', padding: '2px 4px', borderRadius:'2px', fontSize:'12px' }}/>
          <span>s</span>
          <div style={{ width: '1px', height: '16px', background: '#555', margin: '0 4px' }}></div>
          <span style={{ fontFamily: 'monospace' }}>{currentTime.toFixed(2)}s</span>
      </div>
    </div>
  );
};
