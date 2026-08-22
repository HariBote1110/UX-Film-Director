// Phase 7 (W7) 需要駆動staged attach（Phase 2）: nv12 video-gating の
// 純粋なルーティング判定。
//
// native-overlay 側（native-overlay/src/lib.rs）は attach を essential
// パイプライン集合（solid_composite + 8種の小型シェーダ、実測合計約8.9秒）
// の完成だけで解決するようになった。nv12_composite（実測中央値57.585秒、
// 全体の86.6%を占める支配的コスト）はattach解決後にバックグラウンドで
// 自動的にコンパイルされる。
//
// この間、動画クリップを含まないシーン（図形/画像のみ）は attach 解決
// （essential ready）と同時に native overlay へ即座にルーティングして
// よい。一方、動画クリップを含むシーンは nv12 パイプラインが無いと
// present できず（`native-wgpu-renderer` 側は `Nv12PipelineNotReady`
// エラーを返す設計、パニックや黒フレーム描画にはならない）、TS側で
// これを先回りして判定し、nv12 が準備できるまでは WebGPU presenter
// （既存の interim-presenter 経路）に留める必要がある——
// 「欠落フレームは絶対に出さない」という受け入れ基準を満たす、最も
// 保守的で単純なルール。
//
// このルールは純粋関数として切り出し、React/DOM/実際のnapiブリッジ
// なしで直接ユニットテストできるようにしてある
// （nativeOverlayNv12Gate.test.ts）。

export interface NativeOverlayFrameRoutingInput {
  /** attach lifecycle が 'overlay'（essential ready）に達しているか。 */
  nativeOverlayReady: boolean;
  /** nv12 パイプラインのバックグラウンド構築が完了しているか
   *  （`window.nativeOverlay.isNv12PipelineReady()` のポーリング結果）。 */
  nv12Ready: boolean;
  /** これから present しようとしているフレーム／シーンが動画ソースを
   *  含むか（`isNativeOverlayDirectSceneSession` 相当の判定）。 */
  sceneHasVideo: boolean;
}

/**
 * このフレームを native overlay へルーティングしてよいかを返す。
 *
 * - attach 自体が未解決（'attaching'/'presenter'）なら常に false
 *   （overlay へ送る対象が存在しない）。
 * - 動画を含まないシーンは nv12Ready に関係なく true
 *   （essential ready だけで十分、支配的コストのnv12を待つ理由がない）。
 * - 動画を含むシーンは nv12Ready が true になるまで false
 *   （presenter に留める——欠落/黒フレームを出さないための唯一の分岐）。
 */
export function shouldRouteFrameToNativeOverlay(
  input: NativeOverlayFrameRoutingInput,
): boolean {
  if (!input.nativeOverlayReady) return false;
  if (input.sceneHasVideo && !input.nv12Ready) return false;
  return true;
}
