import React from 'react';
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
  const { deleteObject, selectObject, splitObject } = useStore();

  return (
    <div style={{ position: 'fixed', top: state.y, left: state.x, background: '#252526', border: '1px solid #454545', boxShadow: '0 4px 10px rgba(0,0,0,0.5)', zIndex: 9999, minWidth: '150px', borderRadius: '4px', padding: '4px 0', fontSize: '12px' }} onClick={(e) => e.stopPropagation()}>
      {state.type === 'canvas' && (
        <>
            <div style={{ padding: '4px 12px', color: '#888', borderBottom: '1px solid #333', marginBottom: '4px' }}>Time: {state.time.toFixed(2)}s <br/> Layer: {state.layer + 1}</div>
            <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#eee' }} onClick={() => { onAddShape(); onClose(); }}>Add Shape</div>
            <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#eee' }} onClick={() => { onAddText(); onClose(); }}>Add Text</div>
            <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#eee' }} onClick={() => { onAddImage(); onClose(); }}>Add Image</div>
            <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#eee' }} onClick={() => { onAddVideo(); onClose(); }}>Add Video</div>
            <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#eee' }} onClick={() => { onAddAudio(); onClose(); }}>Add Audio</div>
            <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#eee' }} onClick={() => { onAddPsd(); onClose(); }}>Add PSD</div>
            <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#eee' }} onClick={() => { onAddGroup(); onClose(); }}>Add Group</div>
        </>
      )}
      {state.type === 'object' && state.targetObjectId && (
         <>
            <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#eee' }} onClick={() => { splitObject(); onClose(); }}>Split Here</div>
            <div className="context-menu-item" style={{ padding: '6px 12px', cursor: 'pointer', color: '#ff6b6b' }} onClick={() => { deleteObject(state.targetObjectId!); selectObject(null); onClose(); }}>Delete Object</div>
         </>
      )}
    </div>
  );
};