import { useRef } from 'react';
import * as PIXI from 'pixi.js';
import { useStore } from '../store/useStore';
import { TimelineObject } from '../types';
import { shallow } from 'zustand/shallow';
import {
  computeResize,
  cornerLocals,
  oppositeCorner,
  type ResizeBounds,
  type ResizeCorner,
} from '../utils/transformGeometry';

interface DragState {
  active: boolean;
  targetId: string | null;
  startX: number;
  startY: number;
  initialObjState: TimelineObject | null;
}

interface ResizeState {
  active: boolean;
  targetId: string | null;
  corner: ResizeCorner;
  bounds: ResizeBounds;
  rotationRad: number;
  anchorParent: { x: number; y: number };
  /** コンテナの親（global→親空間の逆変換に用いる）。 */
  parent: PIXI.Container | null;
  lockAspectRatio: boolean;
}

/** ハンドル等が constant-size 表示でも反転しない最小スケール。 */
const MIN_RESIZE_SCALE = 0.05;

export const usePixiInteraction = (
  latestObjectsRef: React.MutableRefObject<TimelineObject[]>
) => {
  const { 
    updateObject, selectObject, toggleObjectSelection, selectObjects, selectedIds, pushHistory, isPlaying, togglePlay, layers
  } = useStore((state) => ({
    updateObject: state.updateObject,
    selectObject: state.selectObject,
    toggleObjectSelection: state.toggleObjectSelection,
    selectObjects: state.selectObjects,
    selectedIds: state.selectedIds,
    pushHistory: state.pushHistory,
    isPlaying: state.isPlaying,
    togglePlay: state.togglePlay,
    layers: state.layers,
  }), shallow);

  const dragRef = useRef<DragState>({
    active: false, targetId: null, startX: 0, startY: 0, initialObjState: null
  });

  const resizeRef = useRef<ResizeState>({
    active: false, targetId: null, corner: 'bottom-right',
    bounds: { bx: 0, by: 0, bw: 0, bh: 0 }, rotationRad: 0, anchorParent: { x: 0, y: 0 },
    parent: null,
    lockAspectRatio: true,
  });
  
  const isRecordingPathRef = useRef(false);
  const recordedPathRef = useRef<{time: number, x: number, y: number}[]>([]);
  const recordingStartTimeRef = useRef(0);

  const onDragStart = (e: PIXI.FederatedPointerEvent, targetId: string) => {
    if (useStore.getState().isExporting) return;
    e.stopPropagation();

    const nativeEvent = e.nativeEvent as MouseEvent | PointerEvent | undefined;
    const isToggleSelect = Boolean(nativeEvent && (nativeEvent.metaKey || nativeEvent.ctrlKey));
    if (isToggleSelect) {
        toggleObjectSelection(targetId);
        return;
    }
    if (nativeEvent?.shiftKey) {
        selectObjects([...selectedIds, targetId], targetId);
        return;
    }

    const currentObj = latestObjectsRef.current.find(o => o.id === targetId);
    if (!currentObj) return;
    if (layers[currentObj.layer]?.locked) {
        selectObject(targetId);
        return;
    }

    if ((window as any).isPathRecordingMode) {
        isRecordingPathRef.current = true;
        recordedPathRef.current = [];
        recordingStartTimeRef.current = Date.now();
        if (!isPlaying) togglePlay();
    }

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
        const recordingTarget = latestObjectsRef.current.find(o => o.id === targetId);
        if (recordingTarget && layers[recordingTarget.layer]?.locked) return;
        
        const globalPos = e.global;
        recordedPathRef.current.push({ time: 0, x: globalPos.x, y: globalPos.y });
        updateObject(targetId, { x: globalPos.x, y: globalPos.y });
        return;
    }

    const { active, targetId, startX, startY, initialObjState } = dragRef.current;
    if (!active || !targetId || !initialObjState) return;
    const targetObject = latestObjectsRef.current.find(o => o.id === targetId);
    if (targetObject && layers[targetObject.layer]?.locked) return;

    // ドラッグ量はコンテナの親空間（カメラのズーム・回転を加味した座標系）で
    // 算出する。global 座標のまま差分を取るとズーム時に移動量がズレるため。
    const container = e.currentTarget as PIXI.Container;
    const parent = container?.parent ?? null;
    const startParent = parent
      ? parent.toLocal(new PIXI.Point(startX, startY))
      : { x: startX, y: startY };
    const nowParent = parent
      ? parent.toLocal(e.global)
      : { x: e.global.x, y: e.global.y };
    const deltaX = nowParent.x - startParent.x;
    const deltaY = nowParent.y - startParent.y;

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

  const onResizeStart = (e: PIXI.FederatedPointerEvent, targetId: string, corner: ResizeCorner, bounds: ResizeBounds) => {
    if (useStore.getState().isExporting) return;
    // ハンドルの pointerdown が本体ドラッグ（onDragStart）へ伝播しないようにする。
    e.stopPropagation();

    const currentObj = latestObjectsRef.current.find(o => o.id === targetId);
    if (!currentObj) return;
    if (layers[currentObj.layer]?.locked) {
      selectObject(targetId);
      return;
    }

    const handle = e.currentTarget as PIXI.Container;
    const container = handle?.parent;
    if (!container) return;

    // 固定したいアンカー（掴んだ角の対角）の親空間座標を、現在のコンテナ変換から求める。
    const anchorLocal = cornerLocals(bounds)[oppositeCorner(corner)];
    const anchorParent = container.localTransform.apply(new PIXI.Point(anchorLocal.x, anchorLocal.y));

    pushHistory();
    selectObject(targetId);

    resizeRef.current = {
      active: true,
      targetId,
      corner,
      bounds,
      rotationRad: container.rotation,
      anchorParent: { x: anchorParent.x, y: anchorParent.y },
      parent: container.parent ?? null,
      lockAspectRatio: !(e.nativeEvent as MouseEvent | PointerEvent | undefined)?.shiftKey,
    };
  };

  const onResizeMove = (e: PIXI.FederatedPointerEvent) => {
    const { active, targetId, corner, bounds, rotationRad, anchorParent, parent, lockAspectRatio } = resizeRef.current;
    if (!active || !targetId) return;
    const targetObject = latestObjectsRef.current.find(o => o.id === targetId);
    if (targetObject && layers[targetObject.layer]?.locked) return;

    const pointerParent = parent
      ? parent.toLocal(e.global)
      : { x: e.global.x, y: e.global.y };

    const result = computeResize(
      { corner, bounds, rotationRad, anchorParent, minScale: MIN_RESIZE_SCALE, lockAspectRatio },
      { x: pointerParent.x, y: pointerParent.y }
    );

    updateObject(targetId, {
      scaleX: result.scaleX,
      scaleY: result.scaleY,
      x: Math.round(result.x),
      y: Math.round(result.y),
    });
  };

  const onResizeEnd = () => {
    if (resizeRef.current.active) {
      resizeRef.current = {
        active: false, targetId: null, corner: 'bottom-right',
        bounds: { bx: 0, by: 0, bw: 0, bh: 0 }, rotationRad: 0, anchorParent: { x: 0, y: 0 },
        parent: null,
        lockAspectRatio: true,
      };
    }
  };

  return {
    dragRef,
    resizeRef,
    isRecordingPathRef,
    onDragStart,
    onDragMove,
    onDragEnd,
    onResizeStart,
    onResizeMove,
    onResizeEnd,
  };
};
