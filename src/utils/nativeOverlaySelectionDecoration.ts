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
   *
   * single-flight: 前回 send がまだ in-flight（未解決）の間に update が
   * 呼ばれた場合は、その場では send せず「最新の payload+resendKey」だけを
   * 1件保持して上書きする（drag 中の毎 pointermove で invoke が滞留し
   * native 側の同期 present が数十ms級のため、5fps 級までガタつく実機バグの
   * 対策）。in-flight の send が解決したら、保持中の最新 payload が最後に
   * 送った内容と異なる場合のみ改めて1回 send する（これを繰り返す）。
   */
  update: (payload: SelectionDecorationPayload, resendKey?: number) => Promise<T> | null;
}

export const createNativeOverlaySelectionDecorationSender = <T>(
  send: (payload: SelectionDecorationPayload) => Promise<T>,
): NativeOverlaySelectionDecorationSender<T> => {
  let lastSentKey: string | null = null;
  let inFlight = false;
  // in-flight 中に合流した update のうち最新の1件だけを保持する。
  let queued: { key: string; payload: SelectionDecorationPayload } | null = null;

  // in-flight の send が解決した後、保持中の最新 payload を（必要なら）送る。
  // 呼び出し元の update() 呼び出しからは切り離して自走させる（fire-and-forget）。
  const flushQueued = () => {
    if (inFlight) return;
    const next = queued;
    if (!next) return;
    if (next.key === lastSentKey) {
      queued = null;
      return;
    }
    queued = null;
    lastSentKey = next.key;
    inFlight = true;
    send(next.payload)
      .catch(() => {
        // 送信失敗時も lastSentKey は更新済みのまま: 直後の同値再送は
        // dedupe されるが、値が変われば通常どおり再送される。
      })
      .finally(() => {
        inFlight = false;
        flushQueued();
      });
  };

  return {
    update(payload, resendKey = 0) {
      const key = `${resendKey}:${JSON.stringify(payload)}`;
      if (inFlight) {
        if (key === lastSentKey) {
          // 直近の送信と同値に戻った: 保留中の再送予約があれば取り消す。
          queued = null;
          return null;
        }
        queued = { key, payload };
        return null;
      }
      if (key === lastSentKey) return null;
      lastSentKey = key;
      inFlight = true;
      const pending = send(payload);
      void pending
        .catch(() => {
          // send 失敗は呼び出し元の pending Promise 側に委ねる。
        })
        .finally(() => {
          inFlight = false;
          flushQueued();
        });
      return pending;
    },
  };
};
