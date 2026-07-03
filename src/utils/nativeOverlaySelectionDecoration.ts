/**
 * 選択デコレーション（選択枠・リサイズハンドル）の native overlay 送信ロジック。
 *
 * 実機バグ: SceneSelectionOverlay（HTML/SVG）は child NSWindow 化された
 * native overlay（CAMetalLayer）より常に下にあり、オブジェクトが現在フレームに
 * 描画されている間は選択枠が不透明ピクセルに隠れて見えない（obstruction 検知時
 * のみ z-order を下げる ADR-013 の設計上、SVG を上へ持ってくることはできない）。
 * そこで選択枠・ハンドルの「見た目」を native overlay 側（Rust/wgpu）が scene
 * present の最後に上乗せ描画し、renderer はここで world 座標 quad を IPC で送る。
 *
 * 送信条件（Viewport.tsx から利用）:
 * - 選択変更・ドラッグ中の毎 pointermove・時間変化で update を呼ぶ
 * - ただし quad の値が不変なら送らない（dedupe）
 * - native overlay の再 attach（resize 等）では addon 側 state が失われ得る
 *   ため、resendKey（attach 完了 tick）が変わったら同値でも再送する
 */
import type { TimelineObject } from '../types';
import { getObjectWorldCorners } from './sceneHitTest';

export interface SelectionDecorationQuadPayload {
  topLeftX: number;
  topLeftY: number;
  topRightX: number;
  topRightY: number;
  bottomRightX: number;
  bottomRightY: number;
  bottomLeftX: number;
  bottomLeftY: number;
}

export interface SelectionDecorationPayload {
  canvasWidth: number;
  canvasHeight: number;
  quads: SelectionDecorationQuadPayload[];
}

export interface BuildSelectionDecorationQuadsParams {
  selectedIds: string[];
  objects: TimelineObject[];
  time: number;
}

/**
 * 選択中オブジェクトの変形済み四隅（world 座標 = project 座標系・回転込み）を
 * quad payload に変換する。SceneSelectionOverlay と同じ `getObjectWorldCorners`
 * を用いるため、SVG と native デコレーションの座標は常に一致する。
 */
export const buildSelectionDecorationQuads = ({
  selectedIds,
  objects,
  time,
}: BuildSelectionDecorationQuadsParams): SelectionDecorationQuadPayload[] => {
  const quads: SelectionDecorationQuadPayload[] = [];
  for (const selectedId of selectedIds) {
    const object = objects.find((candidate) => candidate.id === selectedId);
    if (!object) continue;
    const corners = getObjectWorldCorners(object, time, objects);
    if (!corners) continue;
    quads.push({
      topLeftX: corners.topLeft.x,
      topLeftY: corners.topLeft.y,
      topRightX: corners.topRight.x,
      topRightY: corners.topRight.y,
      bottomRightX: corners.bottomRight.x,
      bottomRightY: corners.bottomRight.y,
      bottomLeftX: corners.bottomLeft.x,
      bottomLeftY: corners.bottomLeft.y,
    });
  }
  return quads;
};

export interface NativeOverlaySelectionDecorationSender<T> {
  /**
   * payload が前回送信時から不変（かつ resendKey も同一）なら null を返して
   * 送信を省略する。変化があれば send を呼び、その Promise を返す。
   */
  update: (payload: SelectionDecorationPayload, resendKey?: number) => Promise<T> | null;
}

export const createNativeOverlaySelectionDecorationSender = <T>(
  send: (payload: SelectionDecorationPayload) => Promise<T>,
): NativeOverlaySelectionDecorationSender<T> => {
  let lastSentKey: string | null = null;

  return {
    update(payload, resendKey = 0) {
      const key = `${resendKey}:${JSON.stringify(payload)}`;
      if (key === lastSentKey) return null;
      lastSentKey = key;
      return send(payload);
    },
  };
};
