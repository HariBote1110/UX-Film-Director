# 発見: 現行 PSD インポートは二重デコードであり ag-psd の成果物は表示に使われていない

## 事実（2026-08-08 読み取り調査、コード改変なし）

- ag-psd Worker が生成する per-layer ImageBitmap（`PsdObject.textureSource`、
  `psdParser.ts:500-501` 等で書き込み）は、**src/ 内のどこからも読まれていない**
  （repo 全域 grep で書き込みのみ。読むのは persistence テストの strip 処理だけ）。
- 実際のプレビュー描画は `mediaSourceForObject()`（`rustSceneSnapshot.ts:2099-2107`）が
  返す**ファイルパス**を起点に、rust-backend が `source_frames.rs:307-356`
  （`build_psd_source_frame` → `psd_fast`）で**独自に再デコード＋合成**して
  native overlay に提示している。`active_layer_ids` も既に境界を渡っている。
- よって現行インポートの実コスト構造は
  「ag-psd デコード（Mac 実測 ~326ms、UI ツリー用）＋ Rust デコード（表示用）」の二重払い。
  ag-psd 側が本当に供給しているのはレイヤーツリーのメタデータのみで、
  それは Rust 側パーサが 0.07ms で出せる情報である。

## 帰結（path B 設計の大幅簡素化）

- Rust 完結インポートの試作は「per-layer テクスチャ導線の新設」を**必要としない**。
  表示は既存の Rust 合成経路がそのまま担う。
- 試作の最小形 = `parsePsdAsObject` にフラグゲートの新経路を足し、
  **ag-psd Worker を丸ごとスキップして rust-backend の `psd.parse`（メタデータのみ、
  blob 搬送なし）からツリーを構築**するだけ。ピクセルは JS に持ち込まない。
- 予測: path B の JS 側コストは IPC 往復＋ツリー構築のみ（数 ms オーダー）。
  end-to-end の差は「ag-psd の ~326ms が消えるか」がそのまま出るはず。
- 副次効果の期待: Worker 起動・ImageBitmap 群のメモリも消えるため、
  インポート時のメモリピークも下がる見込み（未計測）。

## 計測設計（調査エージェントの推奨を採用）

- T0 投入（`useTimelineDrop.ts:78` / `Timeline.tsx:441`）→ T1/T2 Worker 内 readPsd/walk
  （既存ログ地点）→ T3 `addObject` 直後 → T4 `onEvaluation` ready（`Viewport.tsx:1561`）
  → T5 `uxfdSharedRendererPresenterPsdCutoverReason === 'nativeRenderFrameReady'`
  （native 提示確定。`sharedRendererPsdOwnership.ts:30-34`）。
- 収集は `rendererSceneRpcTrace.ts` と同型の URL パラメータゲート付きコレクタを新設
  （`performance.mark` は repo に前例なし。console 文字列スクレイプは A/B には不適）。
- 駆動は `scripts/run-video-export-e2e.mjs` の `addPsdToTimeline`
  （CDP `DOM.setFileInputFiles` で実ファイル投入、`data-timeline-item` 出現待ち）を流用。

## 残る不確定

- ag-psd 撤去で失われる情報が本当に無いかは要確認（16bit PSD の depth 変換、
  ラジオボタングループ等、ag-psd 由来メタデータの網羅性 vs psd_fast の nodes）。
- `psd.parse` の現行実装は blob 書き出しスレッドを常に起動する（`media.rs:244-300`）。
  試作ではメタデータのみで返す形へ分離が必要（blob await を呼ばなければ実害が
  どこまで出るかは要確認）。
