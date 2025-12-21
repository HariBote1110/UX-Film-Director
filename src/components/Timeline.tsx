import React, { useRef, useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { TimelineObject } from '../types';
import TimelineItem from './TimelineItem';
import { PX_PER_SEC, ROW_HEIGHT, HEADER_WIDTH, RULER_HEIGHT, MAX_LAYERS } from './timelineConstants';
import { useTimelineDrop } from '../hooks/useTimelineDrop';
import { TimelineControlBar } from './TimelineControlBar';
import { TimelineContextMenu, ContextMenuState } from './TimelineContextMenu';

const Timeline: React.FC = () => {
  const { 
    currentTime, duration, setTime, addObject, deleteObject, 
    objects, selectObject, isExporting
  } = useStore();
  
  const timelineRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const psdInputRef = useRef<HTMLInputElement>(null);
  
  const [insertTarget, setInsertTarget] = useState<{time: number, layer: number} | null>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ visible: false, x: 0, y: 0, type: 'canvas', time: 0, layer: 0 });

  // Custom Hooks
  const { handleDragOver, handleDrop } = useTimelineDrop(timelineRef);

  const calculateTimeFromEvent = (clientX: number) => {
    if (!timelineRef.current) return 0;
    const rect = timelineRef.current.getBoundingClientRect();
    const scrollLeft = timelineRef.current.scrollLeft;
    const x = clientX - rect.left + scrollLeft - HEADER_WIDTH;
    return Math.max(0, x / PX_PER_SEC);
  };

  const handleSeekMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isExporting) return;
    e.stopPropagation();
    if (e.button !== 0) return;
    setIsScrubbing(true);
    setTime(calculateTimeFromEvent(e.clientX));
  };

  const handleCanvasContextMenu = (e: React.MouseEvent) => {
    if (isExporting) return;
    e.preventDefault();
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const scrollLeft = timelineRef.current.scrollLeft;
    const scrollTop = timelineRef.current.scrollTop;
    if (e.clientX - rect.left < HEADER_WIDTH || e.clientY - rect.top < RULER_HEIGHT) return;
    const relX = e.clientX - rect.left + scrollLeft;
    const relY = e.clientY - rect.top + scrollTop;
    const time = Math.max(0, (relX - HEADER_WIDTH) / PX_PER_SEC);
    const layer = Math.floor((relY - RULER_HEIGHT) / ROW_HEIGHT);
    if (layer >= 0 && layer < MAX_LAYERS) {
      setContextMenu({ visible: true, x: e.clientX, y: e.clientY, type: 'canvas', time, layer });
    }
  };

  const handleObjectContextMenu = (e: React.MouseEvent, objectId: string) => {
    if (isExporting) return;
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ visible: true, x: e.clientX, y: e.clientY, type: 'object', time: 0, layer: 0, targetObjectId: objectId });
  };

  useEffect(() => {
    const handleClick = () => { if (contextMenu.visible) setContextMenu(prev => ({ ...prev, visible: false })); };
    window.addEventListener('click', handleClick); return () => window.removeEventListener('click', handleClick);
  }, [contextMenu.visible]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => { if (isScrubbing) setTime(calculateTimeFromEvent(e.clientX)); };
    const handleMouseUp = () => { if (isScrubbing) setIsScrubbing(false); };
    if (isScrubbing) { window.addEventListener('mousemove', handleMouseMove); window.addEventListener('mouseup', handleMouseUp); }
    return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); };
  }, [isScrubbing, setTime]);

  // Object Creation Helpers
  const addShapeAt = (startTime: number, layer: number) => {
    const newShape: TimelineObject = { 
        id: crypto.randomUUID(), type: 'shape', shapeType: 'rect', name: 'Rectangle', layer, startTime, duration: 3, 
        x: 640, y: 360, width: 200, height: 100, fill: '#ff0000', 
        enableAnimation: false, endX: 640, endY: 360, easing: 'linear', offset: 0,
        rotation: 0, scaleX: 1, scaleY: 1, opacity: 1,
    };
    addObject(newShape);
  };
  const addTextAt = (startTime: number, layer: number) => {
    const newText: TimelineObject = { 
        id: crypto.randomUUID(), type: 'text', name: 'Subtitle', layer, startTime, duration: 3, 
        x: 640, y: 600, text: 'New Text', fontSize: 48, fontFamily: 'Arial', fill: '#ffffff', 
        enableAnimation: false, endX: 640, endY: 600, easing: 'linear', offset: 0,
        rotation: 0, scaleX: 1, scaleY: 1, opacity: 1,
    };
    addObject(newText);
  };
  const addGroupControlAt = (startTime: number, layer: number) => {
    const newGroup: TimelineObject = {
        id: crypto.randomUUID(), type: 'group_control', name: 'Group Control', layer, startTime, duration: 5,
        x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1,
        enableAnimation: false, endX: 0, endY: 0, easing: 'linear', 
        targetLayerCount: 0
    };
    addObject(newGroup);
  };

  // File Upload Handlers
  const triggerImageUpload = (startTime: number, layer: number) => { setInsertTarget({ time: startTime, layer }); fileInputRef.current?.click(); };
  const triggerVideoUpload = (startTime: number, layer: number) => { setInsertTarget({ time: startTime, layer }); videoInputRef.current?.click(); };
  const triggerAudioUpload = (startTime: number, layer: number) => { setInsertTarget({ time: startTime, layer }); audioInputRef.current?.click(); };
  const triggerPsdUpload = (startTime: number) => { setInsertTarget({ time: startTime, layer: 0 }); psdInputRef.current?.click(); };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file || !insertTarget) return;
    const url = URL.createObjectURL(file); const img = new Image(); img.src = url;
    img.onload = () => {
      const newImage: TimelineObject = { 
          id: crypto.randomUUID(), type: 'image', name: file.name, layer: insertTarget.layer, startTime: insertTarget.time, duration: 5, 
          x: 640 - (img.width / 2), y: 360 - (img.height / 2), width: img.width, height: img.height, src: url, 
          enableAnimation: false, endX: 640 - (img.width / 2), endY: 360 - (img.height / 2), easing: 'linear', offset: 0,
          rotation: 0, scaleX: 1, scaleY: 1, opacity: 1,
      };
      addObject(newImage); if (fileInputRef.current) fileInputRef.current.value = ''; setInsertTarget(null);
    };
  };
  const handleVideoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file || !insertTarget) return;
    const url = URL.createObjectURL(file); const video = document.createElement('video'); video.src = url;
    video.onloadedmetadata = () => {
      const newVideo: TimelineObject = { 
          id: crypto.randomUUID(), type: 'video', name: file.name, layer: insertTarget.layer, startTime: insertTarget.time, duration: video.duration || 10, 
          x: 640 - (video.videoWidth / 2), y: 360 - (video.videoHeight / 2), width: video.videoWidth, height: video.videoHeight, src: url, volume: 1.0, muted: false, 
          enableAnimation: false, endX: 640 - (video.videoWidth / 2), endY: 360 - (video.videoHeight / 2), easing: 'linear', offset: 0,
          rotation: 0, scaleX: 1, scaleY: 1, opacity: 1,
      };
      addObject(newVideo); if (videoInputRef.current) videoInputRef.current.value = ''; setInsertTarget(null);
    };
    video.onerror = () => { alert("Failed to load video."); if (videoInputRef.current) videoInputRef.current.value = ''; setInsertTarget(null); };
  };
  const handleAudioChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file || !insertTarget) return;
    const url = URL.createObjectURL(file); const audio = document.createElement('audio'); audio.src = url;
    audio.onloadedmetadata = () => {
      const newAudio: TimelineObject = { 
          id: crypto.randomUUID(), type: 'audio', name: file.name, layer: insertTarget.layer, startTime: insertTarget.time, duration: audio.duration || 10, src: url, volume: 1.0, muted: false, 
          x: 0, y: 0, enableAnimation: false, endX: 0, endY: 0, easing: 'linear', offset: 0,
          rotation: 0, scaleX: 1, scaleY: 1, opacity: 1,
      };
      addObject(newAudio); if (audioInputRef.current) audioInputRef.current.value = ''; setInsertTarget(null);
    };
    audio.onerror = () => { alert("Failed to load audio."); if (audioInputRef.current) audioInputRef.current.value = ''; setInsertTarget(null); };
  };
  const handlePsdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file || !insertTarget) return;
    const newPsd: TimelineObject = {
        id: crypto.randomUUID(), type: 'psd', name: file.name, layer: insertTarget.layer, startTime: insertTarget.time, duration: 10, x: 960, y: 540, width: 500, height: 500, scale: 1.0, 
        enableAnimation: false, endX: 960, endY: 540, easing: 'linear', offset: 0, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1,
        file: file, src: '', layerTree: []
    };
    addObject(newPsd); selectObject(newPsd.id);
    if (psdInputRef.current) psdInputRef.current.value = ''; setInsertTarget(null);
  };

  // Action Wrappers for Child Components
  const wrapperTime = contextMenu.visible ? contextMenu.time : currentTime;
  const wrapperLayer = contextMenu.visible ? contextMenu.layer : (contextMenu.visible ? contextMenu.layer : (insertTarget?.layer || 0)); 
  // Note: ControlBar uses specific layers in original code (0,1,2,3,4).
  // ControlBar handlers:
  const cbAddShape = () => addShapeAt(currentTime, 0);
  const cbAddText = () => addTextAt(currentTime, 1);
  const cbAddImage = () => triggerImageUpload(currentTime, 2);
  const cbAddVideo = () => triggerVideoUpload(currentTime, 3);
  const cbAddAudio = () => triggerAudioUpload(currentTime, 4);
  const cbAddPsd = () => triggerPsdUpload(currentTime);
  const cbAddGroup = () => addGroupControlAt(currentTime, 0);
  
  // Context Menu handlers:
  const cmAddShape = () => addShapeAt(contextMenu.time, contextMenu.layer);
  const cmAddText = () => addTextAt(contextMenu.time, contextMenu.layer);
  const cmAddImage = () => triggerImageUpload(contextMenu.time, contextMenu.layer);
  const cmAddVideo = () => triggerVideoUpload(contextMenu.time, contextMenu.layer);
  const cmAddAudio = () => triggerAudioUpload(contextMenu.time, contextMenu.layer);
  const cmAddPsd = () => triggerPsdUpload(contextMenu.time);
  const cmAddGroup = () => addGroupControlAt(contextMenu.time, contextMenu.layer);

  const totalWidth = Math.max(duration * PX_PER_SEC + 500, window.innerWidth - 300) + HEADER_WIDTH;

  return (
    <div className="timeline-panel" style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#222', color: '#ccc', position: 'relative' }}>
      
      {isExporting && <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'white' }}>Exporting...</div>}

      <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept="image/*" onChange={handleImageChange} />
      <input type="file" ref={videoInputRef} style={{ display: 'none' }} accept="video/*" onChange={handleVideoChange} />
      <input type="file" ref={audioInputRef} style={{ display: 'none' }} accept="audio/*" onChange={handleAudioChange} />
      <input type="file" ref={psdInputRef} style={{ display: 'none' }} accept=".psd" onChange={handlePsdChange} />

      <TimelineControlBar 
        onAddShape={cbAddShape}
        onAddText={cbAddText}
        onAddImage={cbAddImage}
        onAddVideo={cbAddVideo}
        onAddAudio={cbAddAudio}
        onAddPsd={cbAddPsd}
        onAddGroup={cbAddGroup}
      />

      <div ref={timelineRef} className="timeline-tracks" style={{ flex: 1, overflow: 'auto', position: 'relative', background: '#1e1e1e' }} 
           onClick={(e) => { if (!isExporting && e.button === 0 && e.target === e.currentTarget) selectObject(null); }} 
           onContextMenu={handleCanvasContextMenu}
           onDragOver={handleDragOver}
           onDrop={handleDrop}
      >
        <div style={{ width: `${totalWidth}px`, height: `${(MAX_LAYERS * ROW_HEIGHT) + RULER_HEIGHT}px`, position: 'relative' }}>
          
          <div style={{ 
              position: 'sticky', top: 0, height: `${RULER_HEIGHT}px`, background: '#252526', zIndex: 800, 
              overflow: 'hidden', borderBottom: '1px solid #444'
          }} onMouseDown={handleSeekMouseDown}>
             <div style={{ position: 'sticky', left: 0, width: HEADER_WIDTH, height: '100%', background: '#333', borderRight: '1px solid #111', zIndex: 810, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: '#888' }}>Timeline</div>
             {Array.from({ length: Math.ceil(duration / 5) + 1 }).map((_, i) => (
                <div key={i} style={{ position: 'absolute', left: HEADER_WIDTH + (i * 5 * PX_PER_SEC), top: 0, height: '100%', borderLeft: '1px solid #555', paddingLeft: '4px', fontSize: '10px', color: '#888', pointerEvents: 'none' }}>{i * 5}s</div>
             ))}
             <div style={{ position: 'absolute', left: HEADER_WIDTH + (currentTime * PX_PER_SEC), height: '100%', width: '2px', background: 'red', zIndex: 805, pointerEvents: 'none' }} />
          </div>

          <div style={{ position: 'relative' }}>
             {Array.from({ length: MAX_LAYERS }).map((_, i) => (
                <div key={i} style={{ height: ROW_HEIGHT, borderBottom: '1px solid #2a2a2a', display: 'flex', alignItems: 'center' }}>
                    <div style={{ 
                        position: 'sticky', left: 0, width: HEADER_WIDTH, height: '100%', background: '#2d2d2d', 
                        borderRight: '1px solid #111', borderBottom: '1px solid #111', zIndex: 700,
                        display: 'flex', alignItems: 'center', paddingLeft: '10px', fontSize: '11px', color: '#ccc',
                        boxShadow: '2px 0 5px rgba(0,0,0,0.3)', boxSizing: 'border-box'
                    }}>
                        Layer {i+1}
                    </div>
                </div>
             ))}
             <div style={{ position: 'absolute', left: HEADER_WIDTH + (currentTime * PX_PER_SEC), top: 0, bottom: 0, width: '1px', background: 'rgba(255,0,0,0.5)', pointerEvents: 'none', zIndex: 600 }} />
             <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 10 }}>
                {objects.map(obj => <TimelineItem key={obj.id} object={obj} pxPerSec={PX_PER_SEC} rowHeight={ROW_HEIGHT} headerWidth={HEADER_WIDTH} onContextMenu={handleObjectContextMenu} />)}
             </div>
          </div>
        </div>
      </div>
      
      {contextMenu.visible && (
        <TimelineContextMenu 
            state={contextMenu}
            onClose={() => setContextMenu(prev => ({ ...prev, visible: false }))}
            onAddShape={cmAddShape}
            onAddText={cmAddText}
            onAddImage={cmAddImage}
            onAddVideo={cmAddVideo}
            onAddAudio={cmAddAudio}
            onAddPsd={cmAddPsd}
            onAddGroup={cmAddGroup}
        />
      )}
    </div>
  );
};
export default Timeline;