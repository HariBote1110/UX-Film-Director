import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { useStore } from '../store/useStore';
import { TimelineObject } from '../types';
import TimelineItem from './TimelineItem';
import { PX_PER_SEC, ROW_HEIGHT, HEADER_WIDTH, RULER_HEIGHT, MAX_LAYERS } from './timelineConstants';
import { useTimelineDrop } from '../hooks/useTimelineDrop';
import { TimelineControlBar } from './TimelineControlBar';
import { TimelineContextMenu, ContextMenuState } from './TimelineContextMenu';
import { shallow } from 'zustand/shallow';
import { getElectronFilePath, resolveAudioMetadata, resolveVideoMetadata } from '../utils/mediaMetadata';
import { parsePsdAsObject } from '../utils/psdParser';

const Timeline: React.FC = () => {
  const { 
    currentTime, duration, setTime, addObject,
    objects, selectedIds, selectObject, selectObjects, clearSelection, isExporting, projectSettings,
    layers, setLayerName, toggleLayerVisibility, toggleLayerLock
  } = useStore((state) => ({
    currentTime: state.currentTime,
    duration: state.duration,
    setTime: state.setTime,
    addObject: state.addObject,
    objects: state.objects,
    selectedIds: state.selectedIds,
    selectObject: state.selectObject,
    selectObjects: state.selectObjects,
    clearSelection: state.clearSelection,
    isExporting: state.isExporting,
    projectSettings: state.projectSettings,
    layers: state.layers,
    setLayerName: state.setLayerName,
    toggleLayerVisibility: state.toggleLayerVisibility,
    toggleLayerLock: state.toggleLayerLock,
  }), shallow);
  
  const timelineRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const psdInputRef = useRef<HTMLInputElement>(null);
  
  const [insertTarget, setInsertTarget] = useState<{time: number, layer: number} | null>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ visible: false, x: 0, y: 0, type: 'canvas', time: 0, layer: 0 });
  const [editingLayer, setEditingLayer] = useState<number | null>(null);
  const [editingLayerName, setEditingLayerName] = useState('');
  const [marqueeSelection, setMarqueeSelection] = useState<{
    active: boolean;
    append: boolean;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);

  // Custom Hooks
  const { handleDragOver, handleDrop } = useTimelineDrop(timelineRef);

  const getLayerState = useCallback((layer: number) => {
    return layers[layer] ?? { name: `Layer ${layer + 1}`, visible: true, locked: false };
  }, [layers]);

  const isLayerLocked = useCallback((layer: number) => {
    return getLayerState(layer).locked;
  }, [getLayerState]);

  const beginLayerRename = useCallback((layer: number) => {
    setEditingLayer(layer);
    setEditingLayerName(getLayerState(layer).name);
  }, [getLayerState]);

  const commitLayerRename = useCallback(() => {
    if (editingLayer === null) return;
    setLayerName(editingLayer, editingLayerName);
    setEditingLayer(null);
  }, [editingLayer, editingLayerName, setLayerName]);

  const cancelLayerRename = useCallback(() => {
    setEditingLayer(null);
    setEditingLayerName('');
  }, []);

  const calculateTimeFromEvent = (clientX: number) => {
    if (!timelineRef.current) return 0;
    const rect = timelineRef.current.getBoundingClientRect();
    const scrollLeft = timelineRef.current.scrollLeft;
    const x = clientX - rect.left + scrollLeft - HEADER_WIDTH;
    return Math.max(0, x / PX_PER_SEC);
  };

  const getContentPositionFromEvent = useCallback((clientX: number, clientY: number) => {
    if (!timelineRef.current) return null;
    const rect = timelineRef.current.getBoundingClientRect();
    return {
      x: clientX - rect.left + timelineRef.current.scrollLeft,
      y: clientY - rect.top + timelineRef.current.scrollTop
    };
  }, []);

  const commitMarqueeSelection = useCallback((selection: NonNullable<typeof marqueeSelection>) => {
    const minX = Math.min(selection.startX, selection.currentX);
    const maxX = Math.max(selection.startX, selection.currentX);
    const minY = Math.min(selection.startY, selection.currentY);
    const maxY = Math.max(selection.startY, selection.currentY);
    const width = maxX - minX;
    const height = maxY - minY;

    const isClickWithoutDrag = width < 3 && height < 3;
    if (isClickWithoutDrag) {
      if (!selection.append) clearSelection();
      return;
    }

    const hitIds = objects
      .filter((obj) => {
        const objectLeft = HEADER_WIDTH + Math.max(0, obj.startTime) * PX_PER_SEC;
        const objectRight = objectLeft + Math.max(1, obj.duration * PX_PER_SEC);
        const objectTop = RULER_HEIGHT + (obj.layer * ROW_HEIGHT);
        const objectBottom = objectTop + ROW_HEIGHT;
        return minX < objectRight && maxX > objectLeft && minY < objectBottom && maxY > objectTop;
      })
      .map((obj) => obj.id);

    if (selection.append) {
      if (hitIds.length === 0) return;
      const merged = Array.from(new Set([...selectedIds, ...hitIds]));
      selectObjects(merged, merged[merged.length - 1] ?? null);
      return;
    }

    if (hitIds.length === 0) {
      clearSelection();
      return;
    }

    selectObjects(hitIds, hitIds[hitIds.length - 1]);
  }, [clearSelection, objects, selectedIds, selectObjects]);

  const handleTimelineMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (isExporting) return;
    if (e.button !== 0) return;
    if (isScrubbing) return;

    const target = e.target as HTMLElement | null;
    if (target?.closest('[data-timeline-item="true"]')) return;

    const position = getContentPositionFromEvent(e.clientX, e.clientY);
    if (!position) return;
    if (position.x < HEADER_WIDTH || position.y < RULER_HEIGHT) return;

    setMarqueeSelection({
      active: true,
      append: e.metaKey || e.ctrlKey || e.shiftKey,
      startX: position.x,
      startY: position.y,
      currentX: position.x,
      currentY: position.y
    });
    e.preventDefault();
  }, [getContentPositionFromEvent, isExporting, isScrubbing]);

  const handleSeekMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isExporting) return;
    e.stopPropagation();
    if (e.button !== 0) return;
    setIsScrubbing(true);
    setTime(calculateTimeFromEvent(e.clientX));
  };

  const handleCanvasContextMenu = useCallback((e: React.MouseEvent) => {
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
  }, [isExporting]);

  const handleObjectContextMenu = useCallback((e: React.MouseEvent, objectId: string) => {
    if (isExporting) return;
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ visible: true, x: e.clientX, y: e.clientY, type: 'object', time: 0, layer: 0, targetObjectId: objectId });
  }, [isExporting]);

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

  useEffect(() => {
    if (!marqueeSelection?.active) return;

    const handleMouseMove = (e: MouseEvent) => {
      const position = getContentPositionFromEvent(e.clientX, e.clientY);
      if (!position) return;
      setMarqueeSelection((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          currentX: position.x,
          currentY: position.y
        };
      });
    };

    const handleMouseUp = () => {
      setMarqueeSelection((prev) => {
        if (prev) {
          commitMarqueeSelection(prev);
        }
        return null;
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [commitMarqueeSelection, getContentPositionFromEvent, marqueeSelection?.active]);

  // Object Creation Helpers
  const addShapeAt = (startTime: number, layer: number) => {
    if (isLayerLocked(layer)) return;
    const newShape: TimelineObject = { 
        id: crypto.randomUUID(), type: 'shape', shapeType: 'rect', name: 'Rectangle', layer, startTime, duration: 3, 
        x: 640, y: 360, width: 200, height: 100, fill: '#ff0000', 
        enableAnimation: false, endX: 640, endY: 360, easing: 'linear', offset: 0,
        rotation: 0, scaleX: 1, scaleY: 1, opacity: 1,
    };
    addObject(newShape);
  };
  const addTextAt = (startTime: number, layer: number) => {
    if (isLayerLocked(layer)) return;
    const newText: TimelineObject = { 
        id: crypto.randomUUID(), type: 'text', name: 'Subtitle', layer, startTime, duration: 3, 
        x: 640, y: 600, text: 'New Text', fontSize: 48, fontFamily: 'Arial', fill: '#ffffff', 
        enableAnimation: false, endX: 640, endY: 600, easing: 'linear', offset: 0,
        rotation: 0, scaleX: 1, scaleY: 1, opacity: 1,
    };
    addObject(newText);
  };
  const addGroupControlAt = (startTime: number, layer: number) => {
    if (isLayerLocked(layer)) return;
    const newGroup: TimelineObject = {
        id: crypto.randomUUID(), type: 'group_control', name: 'Group Control', layer, startTime, duration: 5,
        x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1,
        enableAnimation: false, endX: 0, endY: 0, easing: 'linear', 
        targetLayerCount: 0
    };
    addObject(newGroup);
  };

  // File Upload Handlers
  const triggerImageUpload = (startTime: number, layer: number) => {
    if (isLayerLocked(layer)) return;
    setInsertTarget({ time: startTime, layer });
    fileInputRef.current?.click();
  };
  const triggerVideoUpload = (startTime: number, layer: number) => {
    if (isLayerLocked(layer)) return;
    setInsertTarget({ time: startTime, layer });
    videoInputRef.current?.click();
  };
  const triggerAudioUpload = (startTime: number, layer: number) => {
    if (isLayerLocked(layer)) return;
    setInsertTarget({ time: startTime, layer });
    audioInputRef.current?.click();
  };
  const triggerPsdUpload = (startTime: number, layer: number) => {
    if (isLayerLocked(layer)) return;
    setInsertTarget({ time: startTime, layer });
    psdInputRef.current?.click();
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file || !insertTarget) return;
    const filePath = getElectronFilePath(file);
    const url = URL.createObjectURL(file); const img = new Image(); img.src = url;
    img.onload = () => {
      const newImage: TimelineObject = { 
          id: crypto.randomUUID(), type: 'image', name: file.name, layer: insertTarget.layer, startTime: insertTarget.time, duration: 5, 
          x: 640 - (img.width / 2), y: 360 - (img.height / 2), width: img.width, height: img.height, src: url, filePath: filePath ?? undefined,
          enableAnimation: false, endX: 640 - (img.width / 2), endY: 360 - (img.height / 2), easing: 'linear', offset: 0,
          rotation: 0, scaleX: 1, scaleY: 1, opacity: 1,
      };
      addObject(newImage); if (fileInputRef.current) fileInputRef.current.value = ''; setInsertTarget(null);
    };
  };
  const handleVideoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const target = insertTarget;
    if (!file || !target) return;

    const filePath = getElectronFilePath(file);
    const url = URL.createObjectURL(file);

    try {
      const metadata = await resolveVideoMetadata(file, url);
      const newVideo: TimelineObject = {
          id: crypto.randomUUID(), type: 'video', name: file.name, layer: target.layer, startTime: target.time, duration: metadata.duration,
          x: 640 - (metadata.width / 2), y: 360 - (metadata.height / 2), width: metadata.width, height: metadata.height, src: url, filePath: filePath ?? undefined, volume: 1.0, muted: false,
          enableAnimation: false, endX: 640 - (metadata.width / 2), endY: 360 - (metadata.height / 2), easing: 'linear', offset: 0,
          rotation: 0, scaleX: 1, scaleY: 1, opacity: 1,
      };
      addObject(newVideo);
    } catch {
      alert('Failed to load video.');
      URL.revokeObjectURL(url);
    } finally {
      if (videoInputRef.current) videoInputRef.current.value = '';
      setInsertTarget(null);
    }
  };
  const handleAudioChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const target = insertTarget;
    if (!file || !target) return;

    const filePath = getElectronFilePath(file);
    const url = URL.createObjectURL(file);

    try {
      const metadata = await resolveAudioMetadata(file, url);
      const newAudio: TimelineObject = {
          id: crypto.randomUUID(), type: 'audio', name: file.name, layer: target.layer, startTime: target.time, duration: metadata.duration, src: url, filePath: filePath ?? undefined, volume: 1.0, muted: false,
          x: 0, y: 0, enableAnimation: false, endX: 0, endY: 0, easing: 'linear', offset: 0,
          rotation: 0, scaleX: 1, scaleY: 1, opacity: 1,
      };
      addObject(newAudio);
    } catch {
      alert('Failed to load audio.');
      URL.revokeObjectURL(url);
    } finally {
      if (audioInputRef.current) audioInputRef.current.value = '';
      setInsertTarget(null);
    }
  };
  const handlePsdChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const target = insertTarget;
    if (!file || !target) return;

    const filePath = getElectronFilePath(file);
    try {
      const { psdObject } = await parsePsdAsObject(
        file,
        target.time,
        projectSettings.width,
        projectSettings.height
      );

      const newPsd: TimelineObject = {
        ...psdObject,
        filePath: filePath ?? undefined,
        layer: target.layer,
        startTime: target.time,
      };

      addObject(newPsd);
      selectObject(newPsd.id);
    } catch (error) {
      console.error('Failed to parse PSD file', error);
      alert('Failed to parse PSD file.');
    } finally {
      if (psdInputRef.current) psdInputRef.current.value = '';
      setInsertTarget(null);
    }
  };

  // Action Wrappers for Child Components
  // ControlBar handlers:
  const cbAddShape = () => addShapeAt(currentTime, 0);
  const cbAddText = () => addTextAt(currentTime, 1);
  const cbAddImage = () => triggerImageUpload(currentTime, 2);
  const cbAddVideo = () => triggerVideoUpload(currentTime, 3);
  const cbAddAudio = () => triggerAudioUpload(currentTime, 4);
  const cbAddPsd = () => triggerPsdUpload(currentTime, 0);
  const cbAddGroup = () => addGroupControlAt(currentTime, 0);
  
  // Context Menu handlers:
  const cmAddShape = () => addShapeAt(contextMenu.time, contextMenu.layer);
  const cmAddText = () => addTextAt(contextMenu.time, contextMenu.layer);
  const cmAddImage = () => triggerImageUpload(contextMenu.time, contextMenu.layer);
  const cmAddVideo = () => triggerVideoUpload(contextMenu.time, contextMenu.layer);
  const cmAddAudio = () => triggerAudioUpload(contextMenu.time, contextMenu.layer);
  const cmAddPsd = () => triggerPsdUpload(contextMenu.time, contextMenu.layer);
  const cmAddGroup = () => addGroupControlAt(contextMenu.time, contextMenu.layer);

  const marqueeRect = useMemo(() => {
    if (!marqueeSelection) return null;
    const left = Math.min(marqueeSelection.startX, marqueeSelection.currentX);
    const top = Math.min(marqueeSelection.startY, marqueeSelection.currentY);
    const width = Math.abs(marqueeSelection.currentX - marqueeSelection.startX);
    const height = Math.abs(marqueeSelection.currentY - marqueeSelection.startY);
    return {
      left,
      top: Math.max(0, top - RULER_HEIGHT),
      width,
      height
    };
  }, [marqueeSelection]);

  const totalWidth = useMemo(
    () => Math.max(duration * PX_PER_SEC + 500, window.innerWidth - 300) + HEADER_WIDTH,
    [duration]
  );

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
           onMouseDown={handleTimelineMouseDown}
           onClick={(e) => { if (!isExporting && e.button === 0 && e.target === e.currentTarget) clearSelection(); }} 
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
             {Array.from({ length: MAX_LAYERS }).map((_, i) => {
                const layerState = getLayerState(i);
                return (
                <div key={i} style={{ height: ROW_HEIGHT, borderBottom: '1px solid #2a2a2a', display: 'flex', alignItems: 'center' }}>
                    <div style={{ 
                        position: 'sticky', left: 0, width: HEADER_WIDTH, height: '100%', background: '#2d2d2d', 
                        borderRight: '1px solid #111', borderBottom: '1px solid #111', zIndex: 700,
                        display: 'flex', alignItems: 'center', padding: '0 6px', gap: '4px', fontSize: '11px', color: '#ccc',
                        boxShadow: '2px 0 5px rgba(0,0,0,0.3)', boxSizing: 'border-box'
                    }} onDoubleClick={(e) => { e.stopPropagation(); beginLayerRename(i); }}>
                        <button
                          type="button"
                          title={layerState.visible ? 'レイヤーを非表示' : 'レイヤーを表示'}
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => { e.stopPropagation(); if (!isExporting) toggleLayerVisibility(i); }}
                          style={{
                            width: '18px',
                            height: '18px',
                            border: '1px solid #555',
                            background: layerState.visible ? '#2f6f3a' : '#3a3a3a',
                            color: '#fff',
                            fontSize: '10px',
                            borderRadius: '3px',
                            padding: 0,
                            cursor: isExporting ? 'default' : 'pointer'
                          }}
                        >
                          {layerState.visible ? 'V' : '-'}
                        </button>
                        <button
                          type="button"
                          title={layerState.locked ? 'ロックを解除' : 'レイヤーをロック'}
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => { e.stopPropagation(); if (!isExporting) toggleLayerLock(i); }}
                          style={{
                            width: '18px',
                            height: '18px',
                            border: '1px solid #555',
                            background: layerState.locked ? '#8a3c3c' : '#3a3a3a',
                            color: '#fff',
                            fontSize: '10px',
                            borderRadius: '3px',
                            padding: 0,
                            cursor: isExporting ? 'default' : 'pointer'
                          }}
                        >
                          {layerState.locked ? 'L' : '-'}
                        </button>
                        {editingLayer === i ? (
                          <input
                            autoFocus
                            value={editingLayerName}
                            onChange={(e) => setEditingLayerName(e.target.value)}
                            onBlur={commitLayerRename}
                            onMouseDown={(e) => e.stopPropagation()}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                commitLayerRename();
                              }
                              if (e.key === 'Escape') {
                                e.preventDefault();
                                cancelLayerRename();
                              }
                            }}
                            style={{
                              flex: 1,
                              minWidth: 0,
                              height: '20px',
                              border: '1px solid #666',
                              borderRadius: '3px',
                              background: '#1f1f1f',
                              color: '#ddd',
                              fontSize: '11px',
                              padding: '0 4px'
                            }}
                          />
                        ) : (
                          <span
                            title={`${layerState.name} (Layer ${i + 1})`}
                            style={{
                              flex: 1,
                              minWidth: 0,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              color: layerState.visible ? '#ccc' : '#888',
                              opacity: layerState.locked ? 0.8 : 1
                            }}
                          >
                            {layerState.name}
                          </span>
                        )}
                    </div>
                </div>
             )})}
             <div style={{ position: 'absolute', left: HEADER_WIDTH + (currentTime * PX_PER_SEC), top: 0, bottom: 0, width: '1px', background: 'rgba(255,0,0,0.5)', pointerEvents: 'none', zIndex: 600 }} />
             <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 10 }}>
                {objects.map(obj => <TimelineItem key={obj.id} object={obj} pxPerSec={PX_PER_SEC} rowHeight={ROW_HEIGHT} headerWidth={HEADER_WIDTH} onContextMenu={handleObjectContextMenu} />)}
             </div>
             {marqueeRect && (
                <div
                  style={{
                    position: 'absolute',
                    left: marqueeRect.left,
                    top: marqueeRect.top,
                    width: marqueeRect.width,
                    height: marqueeRect.height,
                    border: '1px dashed #5ba8ff',
                    background: 'rgba(91, 168, 255, 0.18)',
                    pointerEvents: 'none',
                    zIndex: 650
                  }}
                />
             )}
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
