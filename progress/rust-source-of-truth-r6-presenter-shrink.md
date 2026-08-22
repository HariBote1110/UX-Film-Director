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

## バッチ2（本回）: 監査結果と最初の削除

### 監査結果（公開API・内部ブロック・WGSL）

`sharedRendererWebGpuPresenter.ts`（バッチ1終了時点1,471行）の呼び出し元を
`rg`で洗い出した結果、想定と異なり **非video-scene専用の表示分岐や複雑な
エフェクトスタックの重複実装はこのファイルには存在しなかった**。バッチ1
以前の段階で既にそれらは無く、このファイルは元から「背景合成（solid
colour rect）＋動画テクスチャ描画（アップロード済みテクスチャ／外部
HTMLVideoElement／native描画テクスチャのfullscreen再描画）＋export用
readback/native handoff」という薄い構成だった。

公開関数と消費者（すべて生存・正当な依存と確認）:

| 関数 | 消費者 | 用途 |
|---|---|---|
| `presentSolidSrgbSwatch` | controller (診断スワッチ) | クリアのみの単色描画 |
| `presentSolidColourScene` | controller | 背景合成（solid colourオブジェクト） |
| `uploadVideoFrameTexture` | controller | 復号済みRGBAフレームのGPUテクスチャ化 |
| `presentVideoFrameScene` | controller | アップロード済みテクスチャの動画平面描画 |
| `presentExternalVideoFrameScene` | controller, Viewport.tsx | `HTMLVideoElement`外部テクスチャの動画平面描画 |
| `presentNativeRenderFrame` | controller | native描画テクスチャのfullscreen再描画（direct encode系） |
| `takePresentedFrameSharedFrame` | export frame source, handoff bridge | native frame handoff（export） |
| `readPresentedFrameRgbaBytes` | **presenter自身のtestのみ** | 削除対象と判明（下記） |

WGSL文字列は3種（`solidColourShaderCode` / `videoFrameShaderCode` /
`externalVideoFrameShaderCode`）で、`createShaderModule`呼び出しは4箇所
（`videoFrameShaderCode`が`presentVideoFrameScene`と`presentNativeRenderFrame`
の2箇所で重複してモジュール化されている）。この重複統合は次バッチの
候補として残す（`nativeRenderFramePipeline`と`videoFramePipeline`のshader
module共有化、または`presentNativeRenderFrame`を`presentVideoFrameScene`
に一本化できるか要検証）。

### 削除した機能ブロックと根拠

- **`readPresentedFrameRgbaBytes`**（GPUバッファcopy→`mapAsync`による
  presented-frame readback、付随する`alignTo`/`asReadableGpuBuffer`/
  `ReadableGpuBuffer`/`bufferUsageMapRead`/`defaultMapReadBufferUsage`/
  `defaultMapReadMode`ヘルパ一式）を削除。
  **根拠（不採用理由: 死んでいた／native handoffへ既に移管済み）**:
  `sharedRendererPreviewPresenterController.ts`が公開する
  `SharedRendererPreviewPresenterControl`は、readyなcontrolに
  `readPresentedFrameRgbaBytes`を含めない契約が既に3箇所のテストで
  固定されていた（`'readPresentedFrameRgbaBytes' in control === false`）。
  export経路（`sharedRendererExportFrameSource.ts`）・handoff経路
  （`sharedVideoFramePresentedFrameHandoff.ts`）はいずれも
  `takePresentedFrameSharedFrame`（native frame handoff）のみを使用しており、
  このreadback実装への生存した呼び出し元はpresenter自身のunit testだけ
  だった。「native overlayが担っている」のではなく、「同ファイル内の
  別経路（native handoff）に既に置き換わっていて呼ばれなくなっていた」
  という意味での死コード削除。
  - 削除テストマッピング: `sharedRendererWebGpuPresenter.test.ts`の
    「reads the last presented frame through a WebGPU copy buffer with
    aligned row pitch」を、「does not expose a WebGPU copy-buffer readback
    API」（メソッド不在をpinする契約）に置換。

### 行数

- バッチ1終了時点: 1,471行
- バッチ2終了時点: 1,356行（-115行、約7.8%減）
- 合格条件の目標（原1,484行の1/3〜1/2、目安740行以下・理想500行）には
  **未達**。

### 検証

- `npx tsc --noEmit`: エラーなし。
- `npx vitest run`: 258 files / 1868 tests 全green（バッチ1と同数、退行なし）。
- `cargo test`: Rust側変更なしのため未実施（対象外）。
- WGSL文字列は引き続きこのファイルのみに存在（`rg "wgsl" src/`相当の
  文字列マーカーチェックは次バッチのWGSL統合作業と合わせて実施予定）。

## 未着手（次バッチ、優先度つき）

監査の結果、このファイルには「削るべき非video分岐・重複effect stack」が
想定していたほど存在せず、既に薄い構成だったため、1/3〜1/2の目標達成には
**controller/orchestration側の縮小、または現状ロジックのより踏み込んだ
統合が必要**と判明した。ただし本バッチのスコープは
`sharedRendererWebGpuPresenter.ts`単体であり、controller/orchestration本体
（`sharedRendererPreviewPresenterController.ts`本体ロジック・
`sharedRendererViewportPresenterOrchestration.ts`）への着手は計画上
別バッチ（原文書では同じR6節内だが本タスク指示は「batch 2」としてこの
ファイルに限定）。次バッチ候補:

1. `presentNativeRenderFrame`と`presentVideoFrameScene`の重複パイプライン
   統合（同一`videoFrameShaderCode`を2回`createShaderModule`している）。
   fullscreen texture描画とvideo-plane描画のロジック差分（頂点データの
   出所のみ）を精査し、1パイプラインに統合できるか検証する。
2. `presentSolidSrgbSwatch`（クリアのみ）と`presentSolidColourScene`の
   `rectCount === 0`分岐（同じくクリアのみ）の重複解消。
3. WebGPU shim interface群（33-172行相当、`SharedRendererWebGpuDeviceLike`等）
   の圧縮検討——型定義自体はロジックではないため合格条件の「コード量」
   算入対象かどうかを再確認してから着手する。
4. 上記を尽くしても目標未達の場合、原設計文書のとおり
   `sharedRendererPreviewPresenterController.ts` /
   `sharedRendererViewportPresenterOrchestration.ts`側の縮小も合わせて
   計画へ組み込む必要がある（このファイル単体では1/3〜1/2に届かない
   可能性を記録しておく）。
