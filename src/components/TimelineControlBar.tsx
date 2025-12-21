import React from 'react';
import { useStore } from '../store/useStore';

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
    isPlaying, togglePlay, splitObject, isExporting, duration, setDuration, currentTime 
  } = useStore();

  return (
    <div className="no-drag" style={{ padding: '8px', borderBottom: '1px solid #111', display: 'flex', gap: '8px', alignItems: 'center', background: '#333', zIndex: 1000, fontSize: '12px' }}>
      <button onClick={togglePlay} disabled={isExporting} style={{ width: '30px', height: '24px', background: isPlaying ? '#a00' : '#444', border:'none', color:'white', borderRadius:'2px', cursor:'pointer' }}>{isPlaying ? '❚❚' : '▶'}</button>
      <div style={{ width: '1px', height: '16px', background: '#555', margin: '0 4px' }}></div>
      <button onClick={onAddShape} disabled={isExporting} style={{background:'#444', border:'none', color:'white', borderRadius:'2px', padding:'4px 8px', cursor:'pointer'}}>+ Shape</button>
      <button onClick={onAddText} disabled={isExporting} style={{background:'#444', border:'none', color:'white', borderRadius:'2px', padding:'4px 8px', cursor:'pointer'}}>+ Text</button>
      <button onClick={onAddImage} disabled={isExporting} style={{background:'#444', border:'none', color:'white', borderRadius:'2px', padding:'4px 8px', cursor:'pointer'}}>+ Image</button>
      <button onClick={onAddVideo} disabled={isExporting} style={{background:'#444', border:'none', color:'white', borderRadius:'2px', padding:'4px 8px', cursor:'pointer'}}>+ Video</button>
      <button onClick={onAddAudio} disabled={isExporting} style={{background:'#444', border:'none', color:'white', borderRadius:'2px', padding:'4px 8px', cursor:'pointer'}}>+ Audio</button>
      <button onClick={onAddPsd} disabled={isExporting} style={{ background: '#2b5c85', border:'none', color:'white', borderRadius:'2px', padding:'4px 8px', cursor:'pointer' }}>+ PSD</button>
      <button onClick={onAddGroup} disabled={isExporting} style={{background:'#2ecc71', border:'none', color:'white', borderRadius:'2px', padding:'4px 8px', cursor:'pointer'}}>+ Group</button>
      
      <div style={{ width: '1px', height: '16px', background: '#555', margin: '0 4px' }}></div>
      <button onClick={splitObject} disabled={isExporting} style={{background:'#444', border:'none', color:'white', borderRadius:'2px', padding:'4px 8px', cursor:'pointer'}}>Split</button>
      
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>Duration:</span>
          <input type="number" value={duration} onChange={(e) => setDuration(parseFloat(e.target.value))} disabled={isExporting} style={{ width: '50px', background: '#222', border: '1px solid #555', color: '#fff', padding: '2px 4px', borderRadius:'2px', fontSize:'12px' }}/>
          <span>s</span>
          <div style={{ width: '1px', height: '16px', background: '#555', margin: '0 4px' }}></div>
          <span style={{ fontFamily: 'monospace' }}>{currentTime.toFixed(2)}s</span>
      </div>
    </div>
  );
};