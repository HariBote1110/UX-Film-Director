import React, { useState, useEffect } from 'react';
import { TimelineObject } from '../types';
import { useStore } from '../store/useStore';

interface TimelineItemProps {
  object: TimelineObject;
  pxPerSec: number;
  rowHeight: number;
  headerWidth: number;
  onContextMenu: (e: React.MouseEvent, id: string) => void;
}

const TimelineItem: React.FC<TimelineItemProps> = ({ object, pxPerSec, rowHeight, headerWidth, onContextMenu }) => {
  const { updateObject, selectedId, selectObject, objects, pushHistory } = useStore();
  const isSelected = selectedId === object.id;

  const [isDragging, setIsDragging] = useState(false);
  const [dragType, setDragType] = useState<'move' | 'resize' | null>(null);
  const [startMouseX, setStartMouseX] = useState(0);
  const [startMouseY, setStartMouseY] = useState(0);
  
  const [initialState, setInitialState] = useState({
    startTime: 0,
    duration: 0,
    layer: 0
  });

  const handleMouseDown = (e: React.MouseEvent, type: 'move' | 'resize') => {
    e.stopPropagation();
    
    // 右クリック
    if (e.button === 2) {
        selectObject(object.id); 
        onContextMenu(e, object.id);
        return;
    }
    if (e.button !== 0) return;

    pushHistory();
    selectObject(object.id);
    setIsDragging(true);
    setDragType(type);
    
    setStartMouseX(e.clientX);
    setStartMouseY(e.clientY);
    
    setInitialState({
      startTime: object.startTime,
      duration: object.duration,
      layer: object.layer
    });
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;

      const deltaX = e.clientX - startMouseX;

      if (dragType === 'move') {
        const deltaY = e.clientY - startMouseY;
        const deltaTime = deltaX / pxPerSec;
        
        let rawNewStartTime = Math.max(0, parseFloat((initialState.startTime + deltaTime).toFixed(2)));
        
        let layerDiff = 0;
        const absDeltaY = Math.abs(deltaY);
        const signY = Math.sign(deltaY);
        
        if (absDeltaY > rowHeight * 0.7) {
           layerDiff = Math.round(absDeltaY / rowHeight) * signY;
        }
        let rawNewLayer = Math.max(0, initialState.layer + layerDiff);

        let constrainedStartTime = rawNewStartTime;
        let isClampedHorizontally = false;

        const othersInLayer = objects.filter(o => 
          o.id !== object.id && o.layer === rawNewLayer
        );

        const myDuration = initialState.duration;
        
        for (const other of othersInLayer) {
            const otherEnd = other.startTime + other.duration;
            if (rawNewStartTime < otherEnd && rawNewStartTime >= other.startTime) {
                 constrainedStartTime = Math.max(constrainedStartTime, otherEnd);
                 isClampedHorizontally = true;
            }
            if (constrainedStartTime + myDuration > other.startTime && constrainedStartTime + myDuration <= otherEnd) {
                constrainedStartTime = Math.min(constrainedStartTime, other.startTime - myDuration);
                isClampedHorizontally = true;
            }
            if ((constrainedStartTime < otherEnd && constrainedStartTime + myDuration > other.startTime)) {
                 isClampedHorizontally = true; 
            }
        }

        if (isClampedHorizontally && rawNewLayer !== initialState.layer) {
             if (absDeltaY < rowHeight * 1.5) {
                 rawNewLayer = initialState.layer;
             }
        }

        const finalOthers = objects.filter(o => o.id !== object.id && o.layer === rawNewLayer);
        const hasOverlap = finalOthers.some(o => 
            (constrainedStartTime < o.startTime + o.duration) && 
            (constrainedStartTime + myDuration > o.startTime)
        );

        if (hasOverlap) {
            rawNewLayer = initialState.layer;
        }

        constrainedStartTime = Math.max(0, constrainedStartTime);

        updateObject(object.id, { 
            startTime: constrainedStartTime,
            layer: rawNewLayer
        });

      } else if (dragType === 'resize') {
        const deltaTime = deltaX / pxPerSec;
        let rawNewDuration = Math.max(0.1, parseFloat((initialState.duration + deltaTime).toFixed(2)));
        let constrainedDuration = rawNewDuration;

        const othersInLayer = objects.filter(o => 
            o.id !== object.id && o.layer === object.layer
        );
        
        for (const other of othersInLayer) {
            if (other.startTime >= initialState.startTime + initialState.duration) {
                if (initialState.startTime + constrainedDuration > other.startTime) {
                    constrainedDuration = other.startTime - initialState.startTime;
                }
            }
        }
        updateObject(object.id, { duration: constrainedDuration });
      }
    };

    const handleMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
        setDragType(null);
      }
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragType, startMouseX, startMouseY, initialState, object, pxPerSec, rowHeight, updateObject, objects]);

  const leftPos = headerWidth + (Math.max(0, object.startTime) * pxPerSec);
  const width = object.duration * pxPerSec;

  const getBackgroundColor = () => {
      if (object.type === 'shape') return '#e74c3c';
      if (object.type === 'text') return '#3498db';
      if (object.type === 'image') return '#2ecc71';
      if (object.type === 'video') return '#9b59b6';
      if (object.type === 'audio') return '#e67e22';
      if (object.type === 'psd') return '#2b5c85';
      if (object.type === 'group_control') return '#27ae60';
      return '#95a5a6';
  };

  return (
    <div
      style={{
        position: 'absolute',
        left: `${leftPos}px`,
        top: `${object.layer * rowHeight}px`,
        width: `${width}px`,
        height: `${rowHeight - 2}px`,
        backgroundColor: getBackgroundColor(),
        border: isSelected ? '2px solid #f1c40f' : '1px solid rgba(255,255,255,0.3)',
        borderRadius: '4px',
        cursor: 'move',
        userSelect: 'none',
        overflow: 'hidden',
        zIndex: isDragging ? 300 : 10,
        pointerEvents: 'auto',
        boxShadow: isDragging ? '0 5px 15px rgba(0,0,0,0.5)' : 'none',
        opacity: isDragging ? 0.9 : 1,
        transition: isDragging ? 'none' : 'background-color 0.2s, top 0.1s ease-out'
      }}
      onMouseDown={(e) => handleMouseDown(e, 'move')}
      onContextMenu={(e) => handleMouseDown(e, 'move')}
    >
      <div style={{ padding: '2px 4px', fontSize: '11px', color: 'white', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
        {object.name} {object.enableAnimation ? '⇗' : ''}
      </div>

      <div
        style={{
          position: 'absolute', right: 0, top: 0, bottom: 0, width: '10px',
          cursor: 'col-resize', background: 'rgba(0,0,0,0.2)',
        }}
        onMouseDown={(e) => handleMouseDown(e, 'resize')}
      />
    </div>
  );
};
export default TimelineItem;