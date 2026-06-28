# 引き継ぎ課題：rust-only 動画プレビューの「チカチカ＋ガタガタ」を解消する

あなたはこのリポジトリ（UX-Film-Director）の調査・実装担当エージェントです。以下を**自己完結の課題ブリーフ**として読み、根本原因を直してください。コードは TDD（テスト先行）で変更し、応答とドキュメントは**日本語**、コード内英語は**英式綴り**（colour, optimise, centre）で書いてください。

---

## 2026-06-28 現状サマリ（最新・ここから着手）

チカチカ・再起動ストームは解消済み（presenter 再利用・shm leak 回収・解像度固定・直近フレームキャッシュ・dev release 化、版 0.1.1-Beta-362a）。**残る2つの問題**：

### 残問題1：fps が出ない（~15fps）。原因＝native 合成がフルキャンバス解像度で毎フレーム往復している
- `prepareSharedRendererViewportNativeRenderUpload`（`src/utils/sharedRendererViewportNativeRenderUpload.ts:215`）が `width: surfaceGate.canvas.width, height: canvas.height`（=1920等）で `renderNativeSharedFrame` を呼ぶ。
- そのため毎フレーム **フルキャンバス(1920×1080)の RGBA を生成 → 共有メモリへ readback（`native-wgpu-renderer/src/lib.rs:408` の readback、または CPU 合成 `rust-backend/src/cpu_simple_video.rs`）→ フロントが presenter の GPU へ 8MB 再アップロード**。プロキシを 720 にデコードしても**出力がキャンバスのまま**なので往復データ量が減らず 15fps の壁。
- さらに直近修正で CPU 合成パス（`try_render_simple_video_frame`）にフィットスケール（`media/source`）を入れて有効化済み＝「正しいが重い」。
- **GPU presenter は native フレームをサンプラーでキャンバスへ拡大描画できる**（`src/utils/sharedRendererWebGpuPresenter.ts:1017` `presentNativeRenderFrame` はフルスクリーン quad＋sampler）。
- **修正方針（プロキシ出力＋GPU拡大）**：native 合成の出力を**プロキシ解像度（≈720、デコードと同じ）**にし、presenter にキャンバス拡大を任せる。毎フレームのデータ量が ~7分の1。
  - 幾何：WGPU レンダラは clip quad を **ソース実寸**から計算（`native-wgpu-renderer/src/lib.rs:323` `source_width: source.width`）。出力＝ソース寸に揃え、`translation` を `output/canvas` 倍にスケールすれば、全画面1クリップは `source×scale` が出力を満たす。CPU 経路の `media/source` フィットスケールは revert し raw `transform.scale` に戻す（出力＝ソース寸前提に統一）。該当ユニットテスト `cpu_simple_video.rs::proxy_scale_tests` も新方針に更新。
  - 注意：GPU 描画結果はユニットテストで検証不可。実機 `npm run dev:rust-video`＋目視で「全画面・滑らか」を確認。
  - さらに余地：backend GPU→shm→frontend GPU の往復自体が重い。プロキシ化で十分でなければ、合成を presenter 側 GPU に寄せて readback を無くす設計も検討。

### 残問題2：映像が暗い（くらい）。原因候補＝デコードの色域処理
- `rust-backend/src/decode.rs` の `start_streaming_decode_process` がフィルタ `scale=...:in_range=<probed>:out_range=pc,format=rgba` を使用。`probe_video_input_metadata` は `color_range` を読み、**unknown/空/tv は "tv"（リミテッド）にフォールバック**。
- 動画がフルレンジ（pc）だが未タグ（unknown）の場合 "tv 扱い→暗く"。外部 HTMLVideoElement 経路が正しく見えるのと整合（ブラウザは実レンジを使う）。
- さらに **colormatrix/primaries/transfer を scale フィルタに渡していない**（range のみ）。マトリクス不一致で色相ずれも起こり得る。
- **要・実機データ**：対象動画で `ffprobe -v error -select_streams v:0 -show_entries stream=color_range,color_primaries,color_transfer,color_space,pix_fmt -of json <file>` を実行し、`color_range` 等を確認してから対処（unknown 既定を変える／matrix 等を明示）。誤ると正しくタグ付けされた tv 動画を壊すので、データ確認必須。

### 受け入れ基準（追加）
- 実機で **30fps 以上の体感** かつ **全画面表示**（極小・左上・黒なし）。
- 暗さ（くらい）が解消し、外部ビデオ経路と同等の明るさ・色。
- 既存テスト（vitest 関連・`cargo test` decode/native）が緑のまま。

---

## 2026-06-28 Codex実施結果

- バグA（native経路への `maxDecodeEdge` 未伝播）は修正済み。`prepareSharedRendererViewportNativeRenderUpload` が `maxDecodeEdge`/slot設定を受け取り、native source preparationへ渡す。
- バグBは現コードでは「初回320px video-upload、再利用tickで1920px native uploadへ切替」として再整理し、rust-onlyでは初回からnative render uploadを優先するよう修正済み。
- rust-onlyで `syncSharedRendererExternalVideoSources` がHTMLVideoElement外部ソースを作ってpresenterへ渡す混入も停止済み。
- Rustデコード層には直近フレームキャッシュを追加済み。重複/小後退要求は `cacheHit` として返し、計測テスト `decode_streaming_restart_count_stays_low_across_playback_with_repeats_and_backsteps` はGreen。
- 残る確認は実機 `UXFD_DECODE_TRACE=1 npm run dev:rust-video` での体感・トレース確認。定常再生で1920pxジョブが出ず、`firstFrame` が初回のみ、以後 `sequential`/`cacheHit` 中心になることを見る。

---

## 0. プロジェクト概要と動かし方

- Electron + React + TypeScript + WebGPU フロントエンド、Rust サイドカー（`rust-backend/`、別プロセス、stdin/stdout の JSON-RPC）。
- 動画プレビューには2系統あり、本課題の対象は **Rust デコード経路**（環境変数 `VITE_UXFD_RUST_VIDEO_ONLY=1`）。
- 起動：`npm run dev:rust-video`（Electron が立ち上がり、Rust バックエンドは別プロセスで spawn、その stderr は `[RustBackend] …` としてターミナルに出る。`electron/main.ts` 参照）。
- **実機計測**：`UXFD_DECODE_TRACE=1 npm run dev:rust-video` で `decode.requestFrame` ごとに
  `[decode.trace] job=… frame=N reason=… restarted=bool skipped=K decodeMs=…` が出る。
  - `reason`：`sequential`（温存デコーダで逐次読み＝速い）/ `firstFrame` / `backwardSeek` / `forwardGapExceeded` / `byteLenMismatch`。
  - `restarted=true` は **ffmpeg プロセスのコールド再起動**（150〜400ms の stall）＝ガタつき/チカチカの主因。
- テスト：フロントは `npx vitest run <path>`、Rust は `cargo test --manifest-path rust-backend/Cargo.toml --test decode_control_plane <name>`（実 ffmpeg を使うので重い）。

## 1. アーキテクチャ（デコード→提示）

1. Rust（`rust-backend/src/decode.rs`）：`decode.start` でデコードセッション作成、`decode.requestFrame` で1フレームを共有メモリに書き、`decode.releaseFrame` で解放。デコードは **ffmpeg CLI のストリーミング**：
   - 直近の `next_frame_index` から「前方かつ skip ≤ `MAX_STREAMING_DECODE_SKIP_FRAMES`(=90)」なら温存プロセスを逐次読み（速い）。
   - それ以外（同一/手前フレーム＝`backwardSeek`、90超前方＝`forwardGapExceeded`、初回＝`firstFrame`）は **ffprobe + ffmpeg を spawn し `-ss` 再シーク**（遅い）。
   - 直近フレームのバイトキャッシュは無い（`rust-backend/src/sessions.rs` の `StreamingDecodeProcess`）。
2. フロント（`src/components/Viewport.tsx`）：再生ヘッド `currentTime` 変化で `publishSharedRendererPreviewSession` が走り、presenter（WebGPU）に提示。rust-only ではネイティブ合成フレーム（Rust が全レイヤを1枚に合成）を提示。
3. presenter 制御（`src/utils/sharedRendererPreviewPresenterController.ts`）：`presentExternalVideoFrameScene`（HTMLVideoElement 用）と `presentPreparedNativeRenderFrame`（ネイティブ用、本課題で追加済み＝既存 presenter にフレーム差し替え）。
4. ネイティブのデコード＆合成準備：`src/utils/sharedRendererViewportNativeRenderUpload.ts` → `src/utils/sharedRendererViewportNativeRenderSource.ts`（`prepareSharedRendererViewportNativeRenderSources` が `decode.requestFrame` を発行）。
5. 駆動の中枢オーケストレーション：`src/utils/sharedRendererViewportPresenterOrchestration.ts`（`startSharedRendererViewportPresenter`）。

## 2. これまでの修正（commit 済み、git log 参照）

1. rust-only で外部ビデオ再利用パスを無効化（`shouldReuseExternalVideoPresenterSession` に `rustVideoOnly`）。
2. プレビューのデコード解像度/スロットを再生・停止で固定（`Viewport.tsx` の `videoDecodeMaxEdge: SHARED_RENDERER_PLAYBACK_DECODE_MAX_EDGE(=320)`、`videoDecodeSlotCount`）。
3. `MAX_STREAMING_DECODE_SKIP_FRAMES` 30→90。
4. **Option A**：presenter に `presentPreparedNativeRenderFrame` を追加し、`Viewport.tsx` の `publishSharedRendererPreviewSession` に「rust-only ネイティブ再利用分岐」（`canReuseNativeRenderPresenter`、単一フライト `sharedRendererNativeReusePreparingRef`）。presenter をフル再起動せず差し替え提示する狙い。
5. presenter session key から時間アニメ（transform/opacity/effects/zIndex）を除外（`buildSharedRendererPresenterSessionKey` の `includeAnimatedSceneContent`）。これで再利用分岐の鍵が毎フレーム変わらなくなり Option A が発火するように。

## 3. 現状（まだダメ）の実機トレース要約

- **1920x1080 ジョブと 320x180 ジョブが同一 media に対し並走**。両者 `firstFrame` が交互に出て互いを stale 停止（churn）。
- 1920 ジョブは `sequential` でも `decodeMs=12〜96ms`・`skipped=9〜24`。**60fps に対し遅すぎ**、再生ヘッドが先行して skip 多発＝ガタガタ。
- 320 ジョブも要所で `firstFrame`/`backwardSeek` 再起動。
- 体感：チカチカが残り、映像がガッタガタ。

## 4. 既に裏取りした「確定バグ」2つ（最優先の手がかり）

### バグA：ネイティブ経路がプレビュー解像度(320)を無視し常に 1920 でデコードしている
- `src/utils/sharedRendererViewportNativeRenderUpload.ts` の `prepareSharedRendererViewportNativeRenderUpload` は **`maxDecodeEdge` を受け取らず**、`prepareNativeRenderSources({ session, requestId, slotCount, activeJobs })`（107-112行付近）に渡していない。
- そのため `prepareSharedRendererViewportNativeRenderSources`（`src/utils/sharedRendererViewportNativeRenderSource.ts`）の既定 `maxDecodeEdge = MAX_VIEWPORT_VIDEO_DECODE_EDGE(=1920)` が使われ、**ネイティブ合成は常にフル解像度 1920 でデコード**。
- 修正2で `Viewport.tsx` が `videoDecodeMaxEdge=320` を渡しても、それはオーケストレーションの**video-upload 経路**にしか効かず、ネイティブ経路には届かない。
- 影響：1920 デコードは 30〜100ms で 60fps を維持できず**ガタガタ**。さらに 1920 ジョブが生成され churn の一方を成す。

### バグB：rust-only でデコード経路が二重に走っている
- `src/utils/sharedRendererViewportPresenterOrchestration.ts` の `startSharedRendererViewportPresenter` は、`nativeRenderPreviewEnabled`（=`sharedRendererVideoCutoverEnabled`）が真なら **ネイティブ経路**（`prepareSharedRendererViewportNativeRenderUpload`、1920）を、`effectiveVideoCutoverEnabled` が真なら **video-upload 経路**（`prepareVideoUpload(s)`、320）を**両方**準備する。
- rust-only では両フラグが立つため、**同一 media に 1920 と 320 の2ジョブが並走**し互いを stop（`firstFrame` ストーム）。
- 加えて Option A の再利用分岐（`Viewport.tsx`）も `prepareSharedRendererViewportNativeRenderUpload` を**解像度指定なし**で呼ぶため 1920。つまり再利用が効いても全解像度で遅い。

## 5. やってほしいこと（目標と優先順）

1. **ネイティブ経路にプレビュー解像度/スロットを伝播**（バグA）。`prepareSharedRendererViewportNativeRenderUpload` に `maxDecodeEdge`/`sourceSlotCount` を受けて `prepareNativeRenderSources` へ渡す。`Viewport.tsx` の Option A 再利用分岐とオーケストレーション両方から `SHARED_RENDERER_PLAYBACK_DECODE_MAX_EDGE`(320)/`SHARED_RENDERER_PLAYBACK_DECODE_SLOT_COUNT` を渡す。
2. **rust-only はデコード経路を1本化**（バグB）。ネイティブ経路か video-upload 経路のどちらを正とするか決め、もう一方を rust-only では走らせない（二重ジョブ・churn を撲滅）。どちらが正かはコードと提示パス（`presentPreparedNativeRenderFrame` はネイティブ合成フレーム前提）から判断し、根拠を明記。
3. **Option A 再利用が実際に効いているか**を確認。`publishSharedRendererPreviewSession` の `canReuseNativeRenderPresenter` 分岐に毎フレーム入り、**presenter がフル再起動していない**ことを（トレースの `firstFrame` が初回のみ、`sequential` 連続で）確認。入っていないなら鍵・条件・初回ネイティブ起動の成否を調べる。
4. **デコード層の保険**（任意・テスト目標）：`rust-backend` に直近フレーム＋小後退リングキャッシュを足し、重複/±1後退要求を再起動せず返す。下記の計測テストを Green に。
5. **不要な HTMLVideoElement 二重デコードの停止**：rust-only で `syncSharedRendererExternalVideoSources`（`Viewport.tsx`）が external source を作り `onFrameReady` で presenter 鍵を null 化（=余計なフル再起動）していないか確認し、rust-only ではスキップ。

### 受け入れ基準（自動計測）
- Rust 計測テスト `rust-backend/tests/decode_control_plane.rs::decode_streaming_restart_count_stays_low_across_playback_with_repeats_and_backsteps` を **Green**（ffmpeg コールド再起動 ≤1）に。
- 実機 `UXFD_DECODE_TRACE=1`：定常再生で **ほぼ全行 `sequential`、`decodeMs < 16ms`（320px）**、`1920x1080` ジョブが出ない、`firstFrame` は起動直後のみ。
- 体感：チカチカ消失、滑らかな再生。

## 6. 作業規約

- **TDD**：失敗するテストを先に書き（コミット）、最小実装で通し（コミット）、整理（コミット）。テストとドキュメント（`markdown/`）が信頼できる唯一の情報源。
- 日本語応答、コードは英式綴り。既存 API 名・固有名詞はそのまま。
- 1ステップ完了ごとに `progress.md` 先頭へ追記（何を・なぜ）。`package.json` の版を規約通り更新。
- 未コミットの dirty tree で次ステップに進まない。

## 7. 主要ファイル
- `src/components/Viewport.tsx`（`publishSharedRendererPreviewSession`、native 再利用分岐、`videoDecodeMaxEdge`、`syncSharedRendererExternalVideoSources`）
- `src/utils/sharedRendererViewportPresenterOrchestration.ts`（native/video 経路の起動）
- `src/utils/sharedRendererViewportNativeRenderUpload.ts`（**maxDecodeEdge 未伝播**）
- `src/utils/sharedRendererViewportNativeRenderSource.ts`（`MAX_VIEWPORT_VIDEO_DECODE_EDGE`、decode 要求）
- `src/utils/sharedRendererPreviewPresenterController.ts`（`presentPreparedNativeRenderFrame`）
- `src/utils/sharedRendererPresenterSessionKey.ts`（鍵）
- `rust-backend/src/decode.rs` / `sessions.rs`（ストリーミングデコード・トレース・キャッシュ欠如）
- `rust-backend/tests/decode_control_plane.rs`（計測テスト `decode_streaming_restart_count_stays_low_...`、`build_n_frame_h264_fixture`）

まず §4 の確定バグ（A: 解像度伝播、B: 経路二重）から着手するのが最短だと考えられます。仮説は明示し、トレースと計測テストで裏取りしながら進めてください。
