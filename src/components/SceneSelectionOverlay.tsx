import React from 'react';
import type { TimelineObject } from '../types';
import { getObjectWorldCorners, worldPointToCssPoint, type SceneHitTestViewport } from '../utils/sceneHitTest';

/**
 * 選択中オブジェクトの変形済み矩形を SVG で描く、Pixi 非依存のオーバーレイ。
 *
 * PixiJS 排除計画（`markdown/Pixi_Removal_Plan.md`）Phase 3 の一部。
 * `Viewport.tsx` 側の選択枠・リサイズハンドル描画（PIXI.Graphics）を置き換える
 * ための土台。配線はせず export のみ（統合は Phase 3 後、親セッションが行う）。
 *
 * props の座標系は `sceneHitTest.ts` と同じ（preview 要素基準の CSS pt）。
 */

export interface SceneSelectionOverlayProps {
  selectedIds: string[];
  objects: TimelineObject[];
  time: number;
  viewport: SceneHitTestViewport;
  /** preview 要素の CSS 幅・高さ（SVG の viewBox に用いる）。 */
  width: number;
  height: number;
  /** ハンドルクリック時のコールバック（統合時に useSceneInteraction.onResizeStart 等へ接続する）。 */
  onHandlePointerDown?: (objectId: string, corner: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right', e: React.PointerEvent) => void;
  /**
   * native overlay（child NSWindow / CAMetalLayer）が選択枠・ハンドルの見た目を
   * 描いている間は true。SVG は削除せず stroke/fill を透明化して「不可視だが
   * 操作可能」なヒット領域（リサイズハンドルの pointerEvents:'auto'）として残す。
   * native overlay 不可用時（attach 失敗・addon 不在）は false に戻し、従来の
   * 可視スタイルへフォールバックする。
   */
  visualsHidden?: boolean;
}

const RESIZE_HANDLE_SIZE = 10;

const RESIZE_CURSORS: Record<'top-left' | 'top-right' | 'bottom-left' | 'bottom-right', React.CSSProperties['cursor']> = {
  'top-left': 'nwse-resize',
  'top-right': 'nesw-resize',
  'bottom-left': 'nesw-resize',
  'bottom-right': 'nwse-resize',
};

export const SceneSelectionOverlay: React.FC<SceneSelectionOverlayProps> = ({
  selectedIds,
  objects,
  time,
  viewport,
  width,
  height,
  onHandlePointerDown,
  visualsHidden = false,
}) => {
  const selectedObjects = objects.filter((obj) => selectedIds.includes(obj.id));

  return (
    <svg
      data-testid="scene-selection-overlay"
      className="scene-selection-overlay"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        overflow: 'visible',
      }}
    >
      {selectedObjects.map((obj) => {
        const corners = getObjectWorldCorners(obj, time, objects);
        if (!corners) return null;

        const toCss = (p: { x: number; y: number }) => worldPointToCssPoint(p, viewport);
        const tl = toCss(corners.topLeft);
        const tr = toCss(corners.topRight);
        const bl = toCss(corners.bottomLeft);
        const br = toCss(corners.bottomRight);

        const points = `${tl.x},${tl.y} ${tr.x},${tr.y} ${br.x},${br.y} ${bl.x},${bl.y}`;

        const handleCorners: { corner: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'; point: { x: number; y: number } }[] = [
          { corner: 'top-left', point: tl },
          { corner: 'top-right', point: tr },
          { corner: 'bottom-left', point: bl },
          { corner: 'bottom-right', point: br },
        ];

        return (
          <g key={obj.id} data-object-id={obj.id}>
            <polygon
              points={points}
              fill="none"
              stroke={visualsHidden ? 'transparent' : '#ffd700'}
              strokeWidth={2}
            />
            {handleCorners.map(({ corner, point }) => (
              <rect
                key={corner}
                x={point.x - RESIZE_HANDLE_SIZE / 2}
                y={point.y - RESIZE_HANDLE_SIZE / 2}
                width={RESIZE_HANDLE_SIZE}
                height={RESIZE_HANDLE_SIZE}
                fill={visualsHidden ? 'transparent' : '#ffffff'}
                stroke={visualsHidden ? 'transparent' : '#ffd700'}
                strokeWidth={1.2}
                style={{ pointerEvents: onHandlePointerDown ? 'auto' : 'none', cursor: RESIZE_CURSORS[corner] }}
                onPointerDown={(e) => onHandlePointerDown?.(obj.id, corner, e)}
              />
            ))}
          </g>
        );
      })}
    </svg>
  );
};

export default SceneSelectionOverlay;
