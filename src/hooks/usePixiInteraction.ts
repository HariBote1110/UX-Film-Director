import { useRef } from 'react';
import * as PIXI from 'pixi.js';
import { useStore } from '../store/useStore';
import { TimelineObject } from '../types';

interface DragState {
  active: boolean;
  targetId: string | null;
  startX: number;
  startY: number;
  initialObjState: TimelineObject | null;
}

export const usePixiInteraction = (
  latestObjectsRef: React.MutableRefObject<TimelineObject[]>
) => {
  const { 
    updateObject, selectObject, pushHistory, isPlaying, togglePlay 
  } = useStore();

  const dragRef = useRef<DragState>({ 
    active: false, targetId: null, startX: 0, startY: 0, initialObjState: null 
  });
  
  const isRecordingPathRef = useRef(false);
  const recordedPathRef = useRef<{time: number, x: number, y: number}[]>([]);
  const recordingStartTimeRef = useRef(0);

  const onDragStart = (e: PIXI.FederatedPointerEvent, targetId: string) => {
    if (useStore.getState().isExporting) return;
    e.stopPropagation();

    if ((window as any).isPathRecordingMode) {
        isRecordingPathRef.current = true;
        recordedPathRef.current = [];
        recordingStartTimeRef.current = Date.now();
        if (!isPlaying) togglePlay();
    }

    const currentObj = latestObjectsRef.current.find(o => o.id === targetId);
    if (!currentObj) return;

    if (!isRecordingPathRef.current) {
        pushHistory();
    }
    
    selectObject(targetId);
    const globalPos = e.global;
    
    dragRef.current = { 
        active: true, 
        targetId: targetId, 
        startX: globalPos.x, 
        startY: globalPos.y, 
        initialObjState: { ...currentObj } 
    };
  };

  const onDragMove = (e: PIXI.FederatedPointerEvent) => {
    if (isRecordingPathRef.current && dragRef.current.active) {
        const { targetId } = dragRef.current;
        if (!targetId) return;
        
        const globalPos = e.global;
        recordedPathRef.current.push({ time: 0, x: globalPos.x, y: globalPos.y });
        updateObject(targetId, { x: globalPos.x, y: globalPos.y });
        return;
    }

    const { active, targetId, startX, startY, initialObjState } = dragRef.current;
    if (!active || !targetId || !initialObjState) return;

    const globalPos = e.global;
    const deltaX = globalPos.x - startX;
    const deltaY = globalPos.y - startY;

    const newProps: Partial<TimelineObject> = {};
    if (initialObjState.x !== undefined) newProps.x = Math.round(initialObjState.x + deltaX);
    if (initialObjState.y !== undefined) newProps.y = Math.round(initialObjState.y + deltaY);
    
    if (initialObjState.enableAnimation) {
        if (initialObjState.endX !== undefined) newProps.endX = Math.round(initialObjState.endX + deltaX);
        if (initialObjState.endY !== undefined) newProps.endY = Math.round(initialObjState.endY + deltaY);
    }

    updateObject(targetId, newProps);
  };

  const onDragEnd = () => {
      if (isRecordingPathRef.current) {
          isRecordingPathRef.current = false;
          if (isPlaying) togglePlay(); // Stop playing

          const pathData = recordedPathRef.current;
          if (pathData.length > 1 && dragRef.current.targetId) {
             // Normalize time from 0 to 1
             const normalizedPath = pathData.map((p, i) => ({
                 time: i / (pathData.length - 1),
                 x: p.x,
                 y: p.y
             }));
             pushHistory();
             updateObject(dragRef.current.targetId, { motionPath: normalizedPath });
             alert("Motion Path Recorded!");
          }
          (window as any).isPathRecordingMode = false;
      }

      if (dragRef.current.active) {
          dragRef.current = { active: false, targetId: null, startX: 0, startY: 0, initialObjState: null };
      }
  };

  return {
    dragRef,
    isRecordingPathRef,
    onDragStart,
    onDragMove,
    onDragEnd
  };
};