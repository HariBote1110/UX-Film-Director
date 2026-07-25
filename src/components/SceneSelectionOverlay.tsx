import React from 'react';
import type { TimelineObject } from '../types';
import { type SceneHitTestViewport } from '../utils/sceneHitTest';
import { computeSceneSelectionOverlayGeometry, SCENE_SELECTION_RESIZE_HANDLE_SIZE, type SceneSelectionHandleCorner } from './sceneSelectionOverlayGeometry';
import type { SceneSelectionOverlayPatchTargets } from './sceneSelectionOverlayPatch';

/**
 * 選択中オブジェクトの変形済み矩形を SVG で描く、Pixi 非依存のオーバーレイ。
 *
 * PixiJS 排除計画（`markdown/Pixi_Removal_Plan.md`）Phase 3 の一部。
 * `Viewport.tsx` 側の選択枠・リサイズハンドル描画（PIXI.Graphics）を置き換える
 * ための土台。配線はせず export のみ（統合は Phase 3 後、親セッションが行う）。
 *
 * props の座標系は `sceneHitTest.ts` と同じ（preview 要素基準の CSS pt）。
 *
 * 【新契約（TDD Green フェーズ）】
 * 時間帯外のオブジェクトについても、`<g data-object-id>` を常にレンダーし、
 * `display:none` で隠す。これにより、命令的パッチ（`sceneSelectionOverlayPatch.ts`）が
 * 時間追従時に同じ DOM 要素へ属性を書き戻せるようになる。
 * ジオメトリ計算は `computeSceneSelectionOverlayGeometry` へ切り出した純関数を利用。
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
  /**
   * 命令的パッチ（`sceneSelectionOverlayPatch.ts`）が時間追従の属性書き戻しで
   * 参照する DOM 要素群を Map で管理するための ref。渡された場合、各選択オブジェクトの
   * `<g>` / `<polygon>` / ハンドル `<rect>` を `SceneSelectionOverlayPatchTargets`
   * として objectId をキーにして登録。callback ref が null（unmount）のときは削除。
   * 渡されていない場合は一切何もしない（既存の挙動不変）。
   */
  geometryPatchTargetsRef?: React.MutableRefObject<Map<string, SceneSelectionOverlayPatchTargets> | null>;
}

const RESIZE_CURSORS: Record<'top-left' | 'top-right' | 'bottom-left' | 'bottom-right', React.CSSProperties['cursor']> = {
  'top-left': 'nwse-resize',
  'top-right': 'nesw-resize',
  'bottom-left': 'nesw-resize',
  'bottom-right': 'nwse-resize',
};

/** ハンドルコーナーの固定順序（top-left → top-right → bottom-left → bottom-right）。 */
const HANDLE_CORNER_ORDER: SceneSelectionHandleCorner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

export const SceneSelectionOverlay: React.FC<SceneSelectionOverlayProps> = ({
  selectedIds,
  objects,
  time,
  viewport,
  width,
  height,
  onHandlePointerDown,
  visualsHidden = false,
  geometryPatchTargetsRef,
}) => {
  // ジオメトリ計算を純関数へ委譲
  const geometries = computeSceneSelectionOverlayGeometry({
    selectedIds,
    objects,
    time,
    viewport,
  });

  /**
   * <g> 要素の callback ref。React は commit 時に子→親の順で ref を呼ぶが、
   * 親である <g> の ref が呼ばれる時点では子要素（polygon, rect）がすべて
   * DOM に存在するため、querySelector で収集可能。
   *
   * ref が同一 commit 内で detach(null) → attach(elem) と呼ばれる場合も
   * あるが、React がこれを同期実行するため問題ない。
   */
  const groupRef = (objectId: string) => (elem: SVGGElement | null) => {
    if (!geometryPatchTargetsRef) return;

    if (!elem) {
      // unmount / detach: そのobjectIdのエントリを削除
      geometryPatchTargetsRef.current?.delete(objectId);
      return;
    }

    // 初回マウント時は Map を生成
    let map = geometryPatchTargetsRef.current;
    if (!map) {
      map = new Map();
      geometryPatchTargetsRef.current = map;
    }

    // querySelector で子要素を収集（すべてが DOM に存在する）
    const polygon = elem.querySelector('polygon');
    if (!polygon) return; // 防御：polygon が無ければ登録しない

    // 各ハンドル <rect> を data-corner 属性で取得
    const handles: SceneSelectionOverlayPatchTargets['handles'] = {} as SceneSelectionOverlayPatchTargets['handles'];
    for (const corner of HANDLE_CORNER_ORDER) {
      const rectElem = elem.querySelector(`rect[data-corner="${corner}"]`);
      if (rectElem) {
        handles[corner] = rectElem as unknown as SceneSelectionOverlayPatchTargets['handles'][SceneSelectionHandleCorner];
      }
    }

    // targets を組み立てて登録
    const targets: SceneSelectionOverlayPatchTargets = {
      group: elem as unknown as SceneSelectionOverlayPatchTargets['group'],
      polygon: polygon as unknown as SceneSelectionOverlayPatchTargets['polygon'],
      handles,
    };
    map.set(objectId, targets);
  };

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
      {geometries.map((entry) => {
        return (
          <g
            key={entry.objectId}
            ref={groupRef(entry.objectId)}
            data-object-id={entry.objectId}
            style={{ display: entry.visible ? undefined : 'none' }}
          >
            <polygon
              points={entry.visible ? entry.points : ''}
              fill="none"
              stroke={visualsHidden ? 'transparent' : '#ffd700'}
              strokeWidth={2}
            />
            {HANDLE_CORNER_ORDER.map((corner) => {
              // entry.handles から該当 corner を探す
              const handle = entry.handles.find((h) => h.corner === corner);
              const x = handle?.x ?? 0;
              const y = handle?.y ?? 0;

              return (
                <rect
                  key={corner}
                  data-corner={corner}
                  x={entry.visible ? x : 0}
                  y={entry.visible ? y : 0}
                  width={SCENE_SELECTION_RESIZE_HANDLE_SIZE}
                  height={SCENE_SELECTION_RESIZE_HANDLE_SIZE}
                  fill={visualsHidden ? 'transparent' : '#ffffff'}
                  stroke={visualsHidden ? 'transparent' : '#ffd700'}
                  strokeWidth={1.2}
                  style={{ pointerEvents: onHandlePointerDown ? 'auto' : 'none', cursor: RESIZE_CURSORS[corner] }}
                  onPointerDown={(e) => onHandlePointerDown?.(entry.objectId, corner, e)}
                />
              );
            })}
          </g>
        );
      })}
    </svg>
  );
};

export default SceneSelectionOverlay;
