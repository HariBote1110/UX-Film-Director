import { useRef } from 'react';
import { useStore } from '../store/useStore';
import { TimelineObject } from '../types';
import { shallow } from 'zustand/shallow';
import {
  computeResize,
  cornerLocals,
  oppositeCorner,
  rotateVec,
  type ResizeBounds,
  type ResizeCorner,
} from '../utils/transformGeometry';
import { cssPointToWorldPoint, type SceneHitTestViewport } from '../utils/sceneHitTest';
import {
  computeDragUpdate,
  normaliseRecordedMotionPath,
  resolvePointerSelectionIntent,
  type Vec2,
} from '../utils/sceneInteractionLogic';

/**
 * PixiJS のシーングラフに依存しない、DOM ポインタイベントベースのインタラクションフック。
 *
 * PixiJS 排除計画（`markdown/Pixi_Removal_Plan.md`）Phase 3 の一部。
 * `usePixiInteraction.ts` と同じ store 操作（選択状態の更新・位置キーフレームの更新等）を
 * 再現するが、ヒットテスト・座標変換は `sceneHitTest.ts` の純粋関数（Pixi 非依存）を用いる。
 *
 * 座標入力は preview 要素基準の CSS pt（`sceneHitTest.ts` と同じ座標系）を渡すこと。
 * 本フックは配線されていない（統合は Phase 3 後、親セッションが Viewport.tsx で行う）。
 */

interface DragState {
  active: boolean;
  targetId: string | null;
  startWorld: Vec2;
  initialObjState: TimelineObject | null;
}

interface ResizeState {
  active: boolean;
  targetId: string | null;
  corner: ResizeCorner;
  bounds: ResizeBounds;
  rotationRad: number;
  anchorWorld: Vec2;
  lockAspectRatio: boolean;
}

/** ハンドル等が constant-size 表示でも反転しない最小スケール。 */
const MIN_RESIZE_SCALE = 0.05;

export const useSceneInteraction = (
  latestObjectsRef: React.MutableRefObject<TimelineObject[]>,
  viewportRef: React.MutableRefObject<SceneHitTestViewport>
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
    active: false, targetId: null, startWorld: { x: 0, y: 0 }, initialObjState: null
  });

  const resizeRef = useRef<ResizeState>({
    active: false, targetId: null, corner: 'bottom-right',
    bounds: { bx: 0, by: 0, bw: 0, bh: 0 }, rotationRad: 0, anchorWorld: { x: 0, y: 0 },
    lockAspectRatio: true,
  });

  const isRecordingPathRef = useRef(false);
  const recordedPathRef = useRef<{ time: number; x: number; y: number }[]>([]);

  const toWorld = (cssX: number, cssY: number): Vec2 =>
    cssPointToWorldPoint(cssX, cssY, viewportRef.current);

  const onPointerDown = (e: React.PointerEvent, targetId: string) => {
    if (useStore.getState().isExporting) return;
    e.stopPropagation();

    const isToggleSelect = resolvePointerSelectionIntent({
      metaKey: e.metaKey,
      ctrlKey: e.ctrlKey,
      shiftKey: e.shiftKey,
    });
    if (isToggleSelect === 'toggle') {
      toggleObjectSelection(targetId);
      return;
    }
    if (isToggleSelect === 'range') {
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
      if (!isPlaying) togglePlay();
    }

    if (!isRecordingPathRef.current) {
      pushHistory();
    }

    selectObject(targetId);
    const startWorld = toWorld(e.clientX, e.clientY);

    dragRef.current = {
      active: true,
      targetId,
      startWorld,
      initialObjState: { ...currentObj },
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (isRecordingPathRef.current && dragRef.current.active) {
      const { targetId } = dragRef.current;
      if (!targetId) return;
      const recordingTarget = latestObjectsRef.current.find(o => o.id === targetId);
      if (recordingTarget && layers[recordingTarget.layer]?.locked) return;

      const world = toWorld(e.clientX, e.clientY);
      recordedPathRef.current.push({ time: 0, x: world.x, y: world.y });
      updateObject(targetId, { x: world.x, y: world.y });
      return;
    }

    const { active, targetId, startWorld, initialObjState } = dragRef.current;
    if (!active || !targetId || !initialObjState) return;
    const targetObject = latestObjectsRef.current.find(o => o.id === targetId);
    if (targetObject && layers[targetObject.layer]?.locked) return;

    const nowWorld = toWorld(e.clientX, e.clientY);
    const delta: Vec2 = { x: nowWorld.x - startWorld.x, y: nowWorld.y - startWorld.y };

    updateObject(targetId, computeDragUpdate(initialObjState, delta));
  };

  const onPointerUp = () => {
    if (isRecordingPathRef.current) {
      isRecordingPathRef.current = false;
      if (isPlaying) togglePlay();

      const pathData = recordedPathRef.current;
      const normalised = normaliseRecordedMotionPath(pathData);
      if (normalised.length > 0 && dragRef.current.targetId) {
        pushHistory();
        updateObject(dragRef.current.targetId, { motionPath: normalised });
        alert('Motion Path Recorded!');
      }
      (window as any).isPathRecordingMode = false;
    }

    if (dragRef.current.active) {
      dragRef.current = { active: false, targetId: null, startWorld: { x: 0, y: 0 }, initialObjState: null };
    }
  };

  const onResizeStart = (
    e: React.PointerEvent,
    targetId: string,
    corner: ResizeCorner,
    bounds: ResizeBounds,
    containerWorldTransform: { x: number; y: number; rotationRad: number; scaleX: number; scaleY: number }
  ) => {
    if (useStore.getState().isExporting) return;
    e.stopPropagation();

    const currentObj = latestObjectsRef.current.find(o => o.id === targetId);
    if (!currentObj) return;
    if (layers[currentObj.layer]?.locked) {
      selectObject(targetId);
      return;
    }

    const anchorLocal = cornerLocals(bounds)[oppositeCorner(corner)];
    const scaledAnchor = {
      x: anchorLocal.x * containerWorldTransform.scaleX,
      y: anchorLocal.y * containerWorldTransform.scaleY,
    };
    const rotatedAnchor = rotateVec(scaledAnchor, containerWorldTransform.rotationRad);
    const anchorWorld: Vec2 = {
      x: containerWorldTransform.x + rotatedAnchor.x,
      y: containerWorldTransform.y + rotatedAnchor.y,
    };

    pushHistory();
    selectObject(targetId);

    resizeRef.current = {
      active: true,
      targetId,
      corner,
      bounds,
      rotationRad: containerWorldTransform.rotationRad,
      anchorWorld,
      lockAspectRatio: !e.shiftKey,
    };
  };

  const onResizeMove = (e: React.PointerEvent) => {
    const { active, targetId, corner, bounds, rotationRad, anchorWorld, lockAspectRatio } = resizeRef.current;
    if (!active || !targetId) return;
    const targetObject = latestObjectsRef.current.find(o => o.id === targetId);
    if (targetObject && layers[targetObject.layer]?.locked) return;

    const pointerWorld = toWorld(e.clientX, e.clientY);

    const result = computeResize(
      { corner, bounds, rotationRad, anchorParent: anchorWorld, minScale: MIN_RESIZE_SCALE, lockAspectRatio },
      pointerWorld
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
        bounds: { bx: 0, by: 0, bw: 0, bh: 0 }, rotationRad: 0, anchorWorld: { x: 0, y: 0 },
        lockAspectRatio: true,
      };
    }
  };

  return {
    dragRef,
    resizeRef,
    isRecordingPathRef,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onResizeStart,
    onResizeMove,
    onResizeEnd,
  };
};
