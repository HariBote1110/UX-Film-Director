# R6再設計: presenter全面削除から interim専用縮小へ（バッチ1）

## 決定

原 `markdown/Rust_Source_Of_Truth_Plan.md` の R6（描画の単一実装化・
`sharedRendererWebGpuPresenter.ts` 全面削除）は、W7 の最終設計により前提が
崩れたため撤回し、「presenterのinterim専用縮小」へ再設計した。

- W7 stage3以降で確定した `shouldRouteFrameToNativeOverlay`
  （`src/utils/nativeOverlayNv12Gate.ts`）は、Windows で動画クリップを含む
  シーンを nv12 パイプライン完成まで presenter 表示に留める恒久ゲートである。
  mainpc実機計測では essential attach 解決後さらに中央値約13秒
  （launch起点で中央値約43秒、cold cache時は最大約58秒の可能性を含む）
  presenter 表示が続きうる。これは fallback ではなく設計上必須のコンポーネント
  であり、原R6の前提「両プラットフォームでfallback不要」は成立しない。
- そのため presenter の全面削除は行わず、動画クリップシーンの interim 表示に
  必要な最小限（背景合成＋動画テクスチャ描画）へ縮小する方針に変更した。
  非video-sceneの表示分岐、複雑エフェクトスタックの重複実装は削除対象
  （native overlay が essential ready 時点で既に担っているため）。
- ADR-011「presenterをparity比較用に残す」も同時に改訂し、presenterの位置づけを
  「(1) Windows nv12 attach窓中の動画クリップシーン interim表示（恒久・必須）、
  (2) 縮小規模でのparity/視覚検証用途」の二本立てへ変更した。

詳細な合格条件・未採用案は `markdown/Rust_Source_Of_Truth_Plan.md` R6節
（2026-08-23改訂版）、および `markdown/architecture/01-decision-record.md`
ADR-011の改訂サブセクションを参照。

## バッチ1（本回）で実施した内容

R6本体（presenter縮小のロジック改修）には着手せず、以下の機械的な準備のみ実施。

1. 計画書R6節の書き換え（上記）
2. ADR-011への改訂追記（履歴は書き換えず、日付付きサブセクションで追記）
3. 型抽出（TDD-light、ロジック変更なし）:
   `SharedRendererPresentedFrameSharedFrameTaker` /
   `SharedRendererPresentedFrameSharedFrameInput` /
   `SharedRendererPresentedFrameNativeHandoffInput` を
   `src/utils/sharedRendererWebGpuPresenter.ts` から
   `src/utils/sharedRendererPresentedFrameTypes.ts`（新規）へ移動し、
   presenter側は re-export で後方互換を維持。
   `sharedRendererExportFrameSource.ts` / `projectExportFrameCanvas.ts` /
   `viewportRustExportFrameSource.ts` /
   `sharedRendererViewportPresenterOrchestration.ts` の import 元を
   新モジュールへ切替え、export経路がpresenter実装モジュールに
   importで依存しない状態にした。

## 検証

- `npx tsc --noEmit`: エラーなし
- `npx vitest run`: 258 files / 1868 tests 全green（W7完了時点のベースラインと一致）
- `rg "from './sharedRendererWebGpuPresenter'|from './sharedRendererPreviewPresenterController'" src/`
  の残存箇所は controller / orchestration / handoff / upload-bridge / 各種test の
  presenter系正当な消費者のみで、export経路ファイルは含まれないことを確認。
- Rust変更なしのため `cargo test` は未実施（対象外）。

## 未着手（次バッチ）

presenter本体・controller・orchestrationの実ロジック縮小（合格条件のコード量
1/3〜1/2以下達成含む）は本バッチの範囲外。次バッチで着手する。
