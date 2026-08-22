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

## バッチ3（本回・最終）: controller/orchestration監査、合格条件再改訂、R6完了判定

### 監査結果: controller / orchestration

`sharedRendererPreviewPresenterController.ts`（1,211行）・
`sharedRendererViewportPresenterOrchestration.ts`（426行）を、バッチ2と同じ
「消費者を`rg`で全数確認する」手法で監査した。

- 両ファイルの `export const` / `export function` / `export interface` /
  `export type` 全件について `rg -c "\b<name>\b" src -t ts` で使用回数を
  数えたところ、**未使用（定義のみで消費者ゼロ）の公開シンボルは1件も
  無かった**（最小値は`SharedRendererDecodedVideoFrameUploadForClip`の2件
  ＝定義＋1消費者）。死コードは検出されなかった。
- controllerの本体は`startSharedRendererPreviewPresenter`という単一の
  大きな関数（194〜1006行、約800行）で、solid colour / video / image / psd /
  text の各メディア種別についてRust側ビルダー
  （`loadSharedRendererRust{SolidColour,VideoFrameDecodeRequest,VideoPlane}Builder`）
  を呼び出し、その結果をpresenterへ渡すデコード要求・アップロード・
  所有権（ownership）管理のライフサイクル配線である。ロジックの実体
  （頂点シーン構築・デコード要求構築）はいずれも`loadSharedRendererRust*`
  系を通じてRust側に委譲されており、TS側にはRustの重複実装は見当たらない。
  残る手続き（`hasVideoClip`等の分岐判定、`releaseDecodedVideoUploadAfter*`
  等のリソース解放順序、cutoverフラグ判定）はいずれも「どのRust経路を
  いつ呼ぶか」という配線であり、描画・変換ロジックそのものの再実装ではない。
- orchestration本体`startSharedRendererViewportPresenter`（153〜362行）は
  nv12ゲート（`shouldRouteFrameToNativeOverlay`）に整合するpresenter⇔native
  overlay切替、`resolveNativeOverlayTransparentClearTransition`による
  透過クリア状態遷移など、計画書が「残す」と明記した部分そのものであり、
  想定通り load-bearing。

結論: 両ファイルとも「(iii) load-bearing lifecycle/UI plumbing」に分類され、
(i)死コード・(ii)Rust重複のいずれにも該当するブロックは検出されなかった。
削除対象なし。

### 実行した統合（batch2フラグ分の再検証）

- **`presentSolidSrgbSwatch`とsolid colour scene rectCount===0分岐のクリア
  パス統合**: `sharedRendererWebGpuPresenter.ts`内、両者が完全に同一の
  clear-and-presentレンダーパス（`beginRenderPass`→`pass.end()`→
  `queue.submit`）を独立に実装していたため、共通ヘルパ`submitClearOnlyPass`
  へ抽出。戻り値の形（void vs `{ok, rectCount}`）は各呼び出し側で維持し、
  GPU submit部分のみ共有。`npx vitest run src/utils/sharedRendererWebGpuPresenter.test.ts`
  （24件）で挙動不変をpinしてから実施、全green。1,356→1,351行（-5行）。
- **`presentNativeRenderFrame`と`presentVideoFrameScene`の
  `videoFrameShaderCode`パイプライン統合は見送り（skip、根拠あり）**:
  両者は同一のシェーダ文字列・頂点レイアウト・フラグメントターゲットで
  `createRenderPipeline`しているが、(1) 生成される`GPURenderPipeline`は
  それぞれ独立の変数（`videoFramePipeline` / `nativeRenderFramePipeline`）
  に保持され、後続で`getBindGroupLayout`（テストモックでは
  `pipelineBindGroupLayout`ヘルパ経由）を介してbind group layoutを解決する
  経路がラベル文字列（`'video-frame-pipeline'` / `'native-render-frame-pipeline'`）
  に強く結合している。(2) `sharedRendererWebGpuPresenter.test.ts`の
  `fakeDevice.createRenderPipeline`モックは`descriptorLabel`が
  `'video-frame-pipeline'`のときのみ`getBindGroupLayout`を持つオブジェクトを
  返し、`'native-render-frame-pipeline'`のときはフォールバックの生文字列
  `'solid-colour-pipeline'`を返す実装になっている。これはモック側の簡略化
  だが、本体コード側でパイプラインを1本化してラベルを統一すると、この
  フォールバック分岐の意味が変わり、bind group layout解決の等価性を
  安全に証明できない（モックを書き換えれば通せるが、それは「テストが
  実装に追従して変わる」であって「挙動が変わらないことをテストで証明する」
  というTDDの手順が満たせない）。実行時の`GPURenderPipeline`は生成コストが
  ある共有可能なリソースだが、統合によって得られる行数削減は小さく
  （二重の`createRenderPipeline`呼び出し15行程度）、リスクに見合わないと
  判断し本バッチでは見送る。将来、パイプライン生成を
  `buildFullscreenTexturePipeline(label)`のような単一ヘルパへ切り出し、
  ラベルのみ差し替える形にリファクタすれば安全に統合できる見込みがあり、
  次の機会（presenterへの他の変更のついで）に候補として残す。

### WGSL単一ファイル確認

`rg -n "wgsl|createShaderModule" src --type ts -l` の結果:
`sharedRendererWebGpuPresenter.ts`（本体）、
`sharedRendererPreviewPresenterController.test.ts` /
`sharedRendererWebGpuPresenter.test.ts`（いずれもtestで、`createShaderModule`
呼び出しのモック・スパイ参照のみ、WGSL文字列そのものの重複定義ではない）
の3件のみ。ストラグラーなし、例外事項もなし。

### 最終行数

| ファイル | バッチ1終了時 | バッチ2終了時 | バッチ3終了時（最終） |
|---|---|---|---|
| `sharedRendererWebGpuPresenter.ts` | 1,471 | 1,356 | 1,351 |
| `sharedRendererPreviewPresenterController.ts` | 1,214（変更なし） | 1,214 | 1,211* |
| `sharedRendererViewportPresenterOrchestration.ts` | 426（変更なし） | 426 | 426 |

*controller行数は本バッチでの意図的な編集はなし。タスク指示文中の1,214行は
着手前時点のスナップショットで、`wc -l`実測は1,211行（差3行は計測タイミングの
差、本バッチでの変更ではない）。

### 検証

- `npx tsc --noEmit`: エラーなし。
- `npx vitest run`: 258 files / 1,868 tests 全green（バッチ1・2と同数、退行なし）。
- `cargo test`: Rust側変更なしのため未実施（対象外）。

### 合格条件の再改訂とR6完了判定

計画書`markdown/Rust_Source_Of_Truth_Plan.md` R6節を改訂し、行数比率
（1/3〜1/2）による合格条件を撤回して「監査済み・死コード/Rust重複ゼロ・
表示専用の薄層のみ（実測行数を記録）」へ差し替えた。改訂後の4条件
（nv12ゲート健全性／WGSL単一ファイル／macOS即時overlay遷移／監査済み・
死コードゼロ）はすべて満たすため、**R6を★完了（2026-08-23）と判定した**。
詳細な判定根拠表は計画書R6節末尾を参照。

あわせて計画書に「思想上の残り（責務台帳）」節を追加し、TS側に残る
非UIロジック4件（クロスオブジェクト配線マッピング、`filterStack.ts`の
編集forward path、`layerTrackOps.ts`のreorder計算、interim presenter
本体）を将来課題として記録した。

## 未着手（バッチ3時点、R6完了後の将来課題）

バッチ3でR6は★完了と判定したため、以下は「R6合格条件の未達成分」ではなく、
将来presenterに手を入れる際の任意の改善候補として記録する。

1. `presentNativeRenderFrame`と`presentVideoFrameScene`のパイプライン統合は
   バッチ3で見送った（上記「実行した統合」節に根拠を記録）。統合するなら
   `buildFullscreenTexturePipeline(label)`のような単一ヘルパへ切り出す形が
   安全。
2. `presentSolidSrgbSwatch`と`presentSolidColourScene`の`rectCount === 0`
   分岐のクリアパス重複は、バッチ3で`submitClearOnlyPass`ヘルパへ統合済み
   （完了）。
3. WebGPU shim interface群（33-172行相当、`SharedRendererWebGpuDeviceLike`等）
   の圧縮は、型定義でありロジックではないため合格条件の対象外と判断し、
   着手しない（対応不要と結論）。
4. controller/orchestration側は、バッチ3の監査で死コード・Rust重複が
   検出されなかったため、追加の縮小作業は不要と結論した。
