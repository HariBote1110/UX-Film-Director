import React, { useState, useEffect } from 'react';
import { TimelineObject } from '../types';
import { useStore } from '../store/useStore';
import { shallow } from 'zustand/shallow';
import { MAX_LAYERS } from './timelineConstants';

interface TimelineItemProps {
  object: TimelineObject;
  pxPerSec: number;
  rowHeight: number;
  headerWidth: number;
  onContextMenu: (e: React.MouseEvent, id: string) => void;
}

interface DragTargetState {
  id: string;
  startTime: number;
  duration: number;
  layer: number;
}

const TimelineItem: React.FC<TimelineItemProps> = ({ object, pxPerSec, rowHeight, headerWidth, onContextMenu }) => {
  const { updateObject, selectObject, toggleObjectSelection, selectObjects, objects, pushHistory, selectedIds, layers } = useStore((state) => ({
    updateObject: state.updateObject,
    selectObject: state.selectObject,
    toggleObjectSelection: state.toggleObjectSelection,
    selectObjects: state.selectObjects,
    objects: state.objects,
    pushHistory: state.pushHistory,
    selectedIds: state.selectedIds,
    layers: state.layers,
  }), shallow);
  const { isLayerLocked, isLayerVisible } = useStore((state) => {
    const layerState = state.layers[object.layer];
    return {
      isLayerLocked: layerState?.locked ?? false,
      isLayerVisible: layerState?.visible ?? true
    };
  }, shallow);
  const isSelected = selectedIds.includes(object.id);

  const [isDragging, setIsDragging] = useState(false);
  const [dragType, setDragType] = useState<'move' | 'resize' | null>(null);
  const [startMouseX, setStartMouseX] = useState(0);
  const [startMouseY, setStartMouseY] = useState(0);
  
  const [initialState, setInitialState] = useState({
    startTime: 0,
    duration: 0,
    layer: 0
  });
  const [dragTargets, setDragTargets] = useState<DragTargetState[]>([]);

  const handleMouseDown = (e: React.MouseEvent, type: 'move' | 'resize') => {
    e.stopPropagation();
    
    // 右クリック
    if (e.button === 2) {
        if (isSelected) {
          selectObjects(selectedIds, object.id);
        } else {
          selectObject(object.id);
        }
        onContextMenu(e, object.id);
        return;
    }
    if (e.button !== 0) return;
    const isToggleSelect = e.metaKey || e.ctrlKey;
    if (isToggleSelect) {
      toggleObjectSelection(object.id);
      return;
    }
    if (e.shiftKey) {
      selectObjects([...selectedIds, object.id], object.id);
      return;
    }
    if (isLayerLocked) {
      selectObject(object.id);
      return;
    }

    const selectedSet = new Set(selectedIds);
    const selectedMovableTargets = objects
      .filter((candidate) => selectedSet.has(candidate.id))
      .filter((candidate) => !(layers[candidate.layer]?.locked ?? false))
      .map((candidate) => ({
        id: candidate.id,
        startTime: candidate.startTime,
        duration: candidate.duration,
        layer: candidate.layer
      }));
    const canGroupMove = type === 'move'
      && isSelected
      && selectedIds.length > 1
      && selectedMovableTargets.length > 1;

    pushHistory();
    if (canGroupMove) {
      selectObjects(selectedIds, object.id);
      setDragTargets(selectedMovableTargets);
    } else {
      selectObject(object.id);
      setDragTargets([{
        id: object.id,
        startTime: object.startTime,
        duration: object.duration,
        layer: object.layer
      }]);
    }
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
      if (isLayerLocked) return;

      const deltaX = e.clientX - startMouseX;
      const deltaTime = parseFloat((deltaX / pxPerSec).toFixed(2));

      if (dragType === 'move') {
        if (dragTargets.length > 1) {
          const deltaY = e.clientY - startMouseY;
          let layerDiff = 0;
          const absDeltaY = Math.abs(deltaY);
          const signY = Math.sign(deltaY);

          if (absDeltaY > rowHeight * 0.7) {
            layerDiff = Math.round(absDeltaY / rowHeight) * signY;
          }

          const minLayer = Math.min(...dragTargets.map((target) => target.layer));
          const maxLayer = Math.max(...dragTargets.map((target) => target.layer));
          const minStartTime = Math.min(...dragTargets.map((target) => target.startTime));

          const clampedLayerDiff = Math.max(
            -minLayer,
            Math.min(MAX_LAYERS - 1 - maxLayer, layerDiff)
          );
          const clampedDeltaTime = Math.max(-minStartTime, deltaTime);

          const hasLockedLayerTarget = dragTargets.some((target) => {
            const nextLayer = target.layer + clampedLayerDiff;
            return layers[nextLayer]?.locked ?? false;
          });
          const finalLayerDiff = hasLockedLayerTarget ? 0 : clampedLayerDiff;

          const movingIds = new Set(dragTargets.map((target) => target.id));
          const staticObjects = objects.filter((candidate) => !movingIds.has(candidate.id));

          const hasCollision = dragTargets.some((target) => {
            const nextStartTime = Math.max(0, parseFloat((target.startTime + clampedDeltaTime).toFixed(2)));
            const nextEndTime = nextStartTime + target.duration;
            const nextLayer = target.layer + finalLayerDiff;
            return staticObjects.some((candidate) => {
              if (candidate.layer !== nextLayer) return false;
              return nextStartTime < candidate.startTime + candidate.duration
                && nextEndTime > candidate.startTime;
            });
          });

          if (hasCollision) {
            return;
          }

          dragTargets.forEach((target) => {
            updateObject(target.id, {
              startTime: Math.max(0, parseFloat((target.startTime + clampedDeltaTime).toFixed(2))),
              layer: target.layer + finalLayerDiff
            });
          });
          return;
        }

        const deltaY = e.clientY - startMouseY;
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
        setDragTargets([]);
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
  }, [dragTargets, isDragging, dragType, startMouseX, startMouseY, initialState, object, pxPerSec, rowHeight, updateObject, objects, isLayerLocked, layers]);

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
      data-timeline-item="true"
      style={{
        position: 'absolute',
        left: `${leftPos}px`,
        top: `${object.layer * rowHeight}px`,
        width: `${width}px`,
        height: `${rowHeight - 2}px`,
        boxSizing: 'border-box',
        backgroundColor: getBackgroundColor(),
        border: isSelected ? '2px solid #f1c40f' : '1px solid rgba(255,255,255,0.3)',
        borderRadius: '4px',
        cursor: isLayerLocked ? 'not-allowed' : 'move',
        userSelect: 'none',
        overflow: 'hidden',
        zIndex: isDragging ? 300 : 10,
        pointerEvents: 'auto',
        boxShadow: isDragging ? '0 5px 15px rgba(0,0,0,0.5)' : 'none',
        opacity: isLayerVisible ? (isDragging ? 0.9 : 1) : (isDragging ? 0.65 : 0.45),
        transition: isDragging ? 'none' : 'background-color 0.2s, top 0.1s ease-out'
      }}
      onMouseDown={(e) => handleMouseDown(e, 'move')}
      onContextMenu={(e) => handleMouseDown(e, 'move')}
    >
      <div style={{ padding: '2px 4px', fontSize: '11px', color: 'white', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
        {object.name} {object.groupId ? '[G]' : ''} {object.keyframes && object.keyframes.length > 1 ? '◆' : ''} {object.enableAnimation ? '⇗' : ''}
      </div>

      {object.keyframes && object.keyframes.length >= 2 && object.keyframes.map((keyframe) => {
        const offsetPx = (keyframe.time - object.startTime) * pxPerSec;
        if (offsetPx < -4 || offsetPx > width + 4) return null;
        return (
          <div
            key={keyframe.id}
            title={`Keyframe ${keyframe.time.toFixed(2)}s`}
            style={{
              position: 'absolute',
              left: `${offsetPx}px`,
              top: '50%',
              width: '7px',
              height: '7px',
              marginLeft: '-4px',
              marginTop: '-4px',
              background: '#f1c40f',
              transform: 'rotate(45deg)',
              pointerEvents: 'none',
              boxShadow: '0 0 0 1px rgba(0,0,0,0.35)',
              zIndex: 2
            }}
          />
        );
      })}

      <div
        style={{
          position: 'absolute', right: 0, top: 0, bottom: 0, width: '10px',
          cursor: isLayerLocked ? 'not-allowed' : 'col-resize', background: 'rgba(0,0,0,0.2)',
        }}
        onMouseDown={(e) => handleMouseDown(e, 'resize')}
      />
    </div>
  );
};

const areEqual = (prev: TimelineItemProps, next: TimelineItemProps) => {
  return prev.object === next.object
    && prev.pxPerSec === next.pxPerSec
    && prev.rowHeight === next.rowHeight
    && prev.headerWidth === next.headerWidth
    && prev.onContextMenu === next.onContextMenu;
};

export default React.memo(TimelineItem, areEqual);
