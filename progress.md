## 2026-05-31 — 中間ファイルのバックグラウンド先行生成（初回書き出しも速く）

### 背景・計測
- ユーザー実シナリオ「出力 FHD・ソース 4K HEVC(5分)」を計測。getFrame/描画/読み戻しは全て高速で、ボトルネックは **HEVC が rVFC 再生方式に落ち、ディスプレイのリフレッシュ(~60Hz)制限＋4Kデコードのため実時間が上限**。エフェクト無関係。
- ffmpeg(HW) 4K HEVC→FHD H.264 変換は約2倍速（5分→2.5分）・576MB。変換自体が4Kデコードを伴うため、書き出し時に同期生成すると初回が逆に遅くなる。

### 実施内容
- **中間ファイルを編集中にバックグラウンド先行生成**する設計に変更:
  - `useMediaOptimization` フック: 出力解像度より大きい動画ソースを、出力解像度の H.264 へ HW で1本ずつ変換・キャッシュ（書き出し中は競合回避で停止）。
  - Electron: `generate-intermediate`(HW・キャッシュ・進捗・同時1本)＋`check-intermediate`(生成せず存在確認)。キャッシュキーはソースの size+mtime+幅。
  - 書き出し: キャッシュ済み中間ファイルが**あれば**最優先で VideoDecoder デコード（最速・フレーム落ちなし）、**無ければ待たずに**従来フォールバック（rVFC）。→ 初回書き出しは遅くならず、編集中に生成が済めば以降は高速。
- 優先順: 中間ファイル → プロキシ → ソース直 VideoDecoder → rVFC → シーク。

### 選定理由・判断の根拠
- 同期生成は初回が遅くなるため却下。バックグラウンド＋「あれば使う」方式なら回帰ゼロで、編集時間を使って透過的に最適化メディアを用意できる（FCP の optimized media と同じ発想）。
- ゲートを「ソース幅 > 出力幅」にし、4K→FHD の主ケースを HEVC/H.264 ともにカバー（HEVC 同解像度は当面 rVFC のまま・将来 codec プローブで拡張可）。

### 残課題・次のステップ
- 実機での体感確認（編集中に生成完了 → 書き出しが VideoDecoder 経路で高速・無ドロップになるか）。
- 編集中の生成が重い場合のアイドル判定／明示的な「最適化中」インジケータ。
- 中間ファイルのキャッシュ掃除（tmpdir 蓄積）。

## 2026-05-31 — 4K 書き出しを約2倍高速化（コーデックレベル/レイテンシ修正）

### 実施内容
- 実 Pixi(WebGPU) パイプラインを実ファイル(4K)で計測し、真の律速を特定:
  - getFrame=0.3ms / texUpdate=0.1 / render=0.4 / readback=0.1 / encode=0.1 と**取得・描画・読み戻しは全てほぼ無料**。
  - **encWait（HW エンコーダ待ち）だけが支配的**（修正前 ~39ms/枠）。→ デコード/描画/読み戻しの最適化が効かなかった理由。
- 原因と修正（`videoExportPipeline.ts`）:
  1. **コーデックレベルが Level 4.0 固定**で 4K 非対応 → 解像度から必要レベルを算出（4K は 5.1/5.2）。`buildH264Candidates`/`h264LevelHexFor`。
  2. **`latencyMode` が 'quality' 優先（遅い）** → **'realtime' 優先**（VideoToolbox の frame delay 制約緩和で高速）。
  3. **コーデックキャッシュが解像度を無視**（1080p 検出を 4K に流用）→ `${W}x${H}@${fps}` キーの Map に。
  4. ビットレートを解像度連動に（4K で 10Mbps は低品質 → ~25Mbps）。
- 計測結果: 4K 実効 **23fps → 43fps（約1.9倍）**、encWait 39→22ms。

### 選定理由・判断の根拠
- 計測で「エンコーダが唯一の律速」と確定したため、エンコーダ構成（レベル・レイテンシ）の最適化が最大効果。Level 4.0 で 4K を投げていたのは明確なバグ。
- realtime 優先は全解像度に効く（quality より速く、書き出し用途では十分な品質）。

### 残課題・次のステップ
- encWait（4K H.264 HW エンコード ~45fps）が新たな上限。さらなる高速化は HEVC 出力エンコード（要互換性検討）か出力解像度の選択肢提供。
- 実機での 4K 長尺の体感確認。

## 2026-05-31 — 書き出し高速化: 段のオーバーラップ＋出力のディスク逐次書き出し

### 実施内容
- 計測（実ファイル 4K, IMG_3899.MOV）: 実効 54fps、「再生デコード ~10ms ＋ 4K HWエンコード待ち ~8ms」がほぼ直列。
- **段のオーバーラップ**（`videoExportPipeline.ts`）: `new VideoFrame(bitmap)` はコピー生成のため、生成直後に次フレームの取得・描画(`iterator.next()`)を開始。現フレームのエンコード/背圧待ちと並行化し、「取得+描画」と「エンコード」の直列を解消。
- **出力のディスク逐次書き出し**:
  - `encodeVideoToMp4` に `writeChunk` を追加。指定時は `StreamTarget`(mp4-muxer) で出力チャンクを逐次書き出し、出力全体をメモリ保持しない（fastStart:false = moov 末尾）。
  - Electron に `export-stream-open/write/close` IPC を追加（fd を保持し position 指定で書き込み）。
  - `useProjectExport` は保存先を開き writeChunk で逐次書き込み、`save-buffer-to-file` の全保持書き込みを廃止。
- 検証: ハーネスで `streamed=true`・先頭ボックス=ftyp の有効 MP4 生成、オーバーラップ後も背圧 peakQueueSize=8 維持、無地エンコード正常を確認。

### 選定理由・判断の根拠
- VideoFrame のコピー特性を使うことで、所有権契約を変えずに（ジェネレータ側 close を維持）安全にパイプライン化できる（低リスク）。
- StreamTarget + fastStart:false は逐次・メモリ非保持で実装が単純。moov 末尾の再インポート遅延は許容（外部プレーヤ再生は問題なし）。faststart 化は将来 ffmpeg `-c copy -movflags +faststart` で対応可能。

### 残課題・次のステップ
- 実機（4K/長尺 HEVC）での体感速度・メモリの最終確認。
- 真のボトルネックが Pixi の WebGPU 読み戻しなら、`VideoFrame(canvas)` 直結（colorSpace 対応要確認）でさらに削減余地。

## 2026-05-31 — 書き出しメモリ爆発の真因を修正（エンコーダ背圧）

### 実施内容
- 症状: フレーム供給を bounded 化してもなお、実書き出しでメモリが膨張し続ける。
- 真因: `videoExportPipeline.ts` のエンコーダ背圧が**実質無効**だった。
  - `if (encodeQueueSize > 10) await Promise.race([setTimeout(0), error])` は「1回だけイベントループに譲る」だけで、**キューが捌けるのを待っていなかった**。
  - 生成（プロバイダ＋Pixi描画）が HW エンコードより速いと、**エンコーダ内部キューに VideoFrame が無制限に積もる**（1枚 数MB〜十数MB × 数千枚 → 数十GB）。
- 修正: `encodeQueueSize > MAX_QUEUE(8)` の間、`dequeue` イベント（非対応時は短いポーリング）で**実際にキューが減るまで待つ**。`for await` が止まることで上流の生成も自然に停止し、全体が bounded に。
- 検証: 4K フレームを 600 枚「即時供給」しても `peakQueueSize=8`（上限内）に張り付くことをハーネスで確認（`EncodeResult.peakQueueSize` を追加）。

### 選定理由・判断の根拠
- 真の背圧は「キュー減少を待つ」こと。`setTimeout(0)` の単発譲りは供給を止められず無意味だった。`dequeue` イベントが正攻法、フォールバックの短ポーリングで環境差も吸収。
- MAX_QUEUE=8 はパイプライン段数として十分（スループット維持）かつメモリ上限（4K で ~96MB）の両立点。

### 残課題・次のステップ
- 実機（4K/長尺 HEVC・H.264）での書き出しでメモリが数百MB〜1GB台に収束することの最終確認。
- これまでの一連（decode背圧／0フレームfallback／encoder背圧）で供給・変換・エンコードの全段が bounded 化。

## 2026-05-31 — HEVC 実ファイルのメモリ爆発を修正（0フレーム時のフォールバック）

### 実施内容
- 症状: 実ファイル `IMG_3899.MOV`（iPhone HEVC, ~2GB）で書き出すと 9000 フレーム付近で ~60GB 消費。
- 計測（`createImageBitmap`/`VideoFrame` の生成・解放をカウントする診断）で判明:
  - この HEVC は **VideoDecoder 経路に乗るが 1 フレームも生成しない**（MP4Box デマックスの HEVC 問題）。
  - しかも `VideoFrameProvider.init()` が **0 フレームでも成功扱い**になり、再生方式へフォールバックしなかった。
  - 結果、実書き出しでは「空のプロバイダ」が居座り、毎フレーム `getFrame()`=null → 同期されない通常 Pixi 動画パスに落ち、フレーム蓄積で 60GB。
- 修正（`src/utils/videoFrameProvider.ts`）: `init()` は **1 枚も取得できなければ例外**を投げる。
  - → HEVC は確実に **再生方式(PlaybackFrameProvider)** へフォールバック。
- 検証: 再生方式で実ファイルを 1500 フレーム消費しても **未解放 ImageBitmap は 1〜2 枚・VideoFrame 0**（完全に bounded）、got=1500/1500・60fps相当。

### 選定理由・判断の根拠
- 「0 フレーム成功」は無言の不具合源。明示的に失敗させることで、useProjectExport の 3 段フォールバック（VideoDecoder→再生→シーク）が正しく機能する。
- 再生方式は元から maxBuffer=8 で bounded のため、フォールバックさえ効けばメモリは収束する（計測で確認）。

### 残課題・次のステップ
- 実機での 4K/長尺 HEVC 書き出しでメモリが数GB以内に収束することの体感確認。
- HEVC が VideoDecoder で 0 フレームになる根本（MP4Box の onSamples 不発）は未解明だが、再生方式で実用上は解決。

## 2026-05-30 — 書き出しのメモリ爆発を修正（背圧の追加）

### 実施内容
- 症状: 4K 60fps 5分の動画を書き出すとメモリを ~50GB 消費。
- 原因: `decodeVideoStream`（VideoDecoder 経路）に**背圧が無く**、`feedPromise` が全サンプルを一気に `decoder.decode()` へ流すため、デコード済み 4K VideoFrame（1枚 ~12MB）が `frameQueue` に**無制限に蓄積**していた（消費＝エンコードより圧倒的に速いため）。加えて mp4box の使用済みサンプルも未解放。
- 修正（`src/utils/videoDecodeStream.ts`）:
  - **背圧を追加**: `pendingCount = frameQueue + decodeQueueSize + backlog` が `HIGH_WATER(24)` を超えたら fetch 読み込み（=サンプル供給=デコード）を停止し、1 枚消費（yield）ごとに再開。
  - `releaseUsedSamples` で mp4box 保持の使用済みサンプルを解放。
  - 範囲外フレーム破棄時も供給を再開（`notifyDrain`）。
- 結果: 4K でもピークは「デコード待ち ≤24 枚 + 先読み数枚 + 出力 MP4 数百MB」≒ 約1GB に収束。

### 選定理由・判断の根拠
- 標準的な bounded-queue 背圧パターンを採用。HIGH_WATER=24 はスループット維持（常に先読みが在る）とメモリ上限（4K で ~288MB）の両立点。
- `PlaybackFrameProvider`（再生方式）は元から maxBuffer=8 で背圧済みのため変更不要。問題は VideoDecoder 経路のみ。

### 残課題・次のステップ
- 実機（4K 60fps 5分）で再書き出しし、メモリが収束することの体感確認。
- 出力 MP4 を全てメモリ保持（ArrayBufferTarget）している点は長尺・高ビットレートで効くため、将来はストリーミング書き出し（ファイルへ逐次 flush）も検討余地。

## 2026-05-30 — HEVC 高速書き出し: rVFC 再生方式プロバイダ追加

### 実施内容
- `PlaybackFrameProvider`（`src/utils/playbackFrameProvider.ts`）を新設。
  - HTMLVideoElement を「シークせず再生」し `requestVideoFrameCallback` で提示フレームを取得。
  - OS デコーダ依存なので VideoDecoder/MP4Box が扱えない HEVC 等でも動作。
  - `playbackRate` で高速化＋リングバッファ＋背圧（満杯で一時停止）。
- 共通インターフェース `FrameProvider`（`getFrame`/`close`）を導入し、`VideoFrameProvider` と `PlaybackFrameProvider` を多態化。
- `useProjectExport` を **3 段フォールバック**に変更：①VideoDecoder(最速) → ②再生方式(rVFC・HEVC対応) → ③シーク。
- 計測（HEVC 10000kbps, 30fps×2s 要求）で `playbackRate` を掃引し最適点を決定：
  - 1x: uniq 100% / 30fps、2x: **uniq 98% / 59fps**、3x: 68%、4x: 52%。
  - → 既定 `playbackRate=2`（98% カバレッジ・約2倍速）。

### 選定理由・判断の根拠
- HEVC は VideoDecoder で description 修正後もデマックス側でサンプルが取れずデコード不可だったため、コーデック非依存で確実な「OS 再生＋rVFC」方式を採用。
- `playbackRate=2`：高速化とフレーム落ち（カバレッジ低下）のトレードオフの最良点。3x 以上は欠落フレームが増え書き出しがカクつくため不採用。
- 3 段フォールバックで H.264 は最速(VideoDecoder)、HEVC は再生方式、非対応のみシークと、回帰なく最大速度を選べる。

### 残課題・次のステップ
- 実プロジェクト（実 GoPro HEVC）での体感・画質確認（`npm run dev` → 動画出力）。
- 高 `playbackRate` でのフレーム落ちはソース fps 依存。必要なら適応制御（落ち検出で減速）。
- moov 末尾配置の大容量 H.264 は VideoDecoder 起動が遅く再生方式へ流れる（許容）。

## 2026-05-30 — 書き出し高速化: 全動画を VideoDecoder 経路へ（プロキシ不要化）

### 実施内容
- 書き出しボトルネックを計測ハーネスで定量化（`exportTestHarness.ts` にフェーズ別内訳・ソース直接デコード可否テストを追加）。
  - 結論: ボトルネックは **`HTMLVideoElement.currentTime` シーク = 100ms/フレーム**。コピー/読み戻し/Pixi 合成は 4K でも合計 <4ms と無視できる。
  - H.264(faststart) はソース直接 VideoDecoder で **731fps相当・起動218ms**。HEVC は VideoDecoder 無反応（6s でも 0 フレーム）。
- `useProjectExport` の経路選択を変更：
  - 順方向クリップは「プロキシがあればプロキシ、無ければ**ソースを直接** VideoDecoder デコード」を試行。
  - 初期化が 5s でタイムアウト/失敗した場合のみ従来のシーク方式へフォールバック（HEVC・moov 末尾配置・不正コンテナを安全に退避）。
  - → **H.264 の元動画はプロキシ生成なしで高速エンコード可能に**（9fps → encode 律速の数十fps）。

### 選定理由・判断の根拠
- PixiJS 撤廃・copy-chain 改修は不要と計測で判断：FHD/4K いずれもコピーは実質タダで、遅さの実体はシークだったため。最小変更で目標（重い動画 20〜40fps）に到達できる経路選択変更を採用。
- フォールバックを残す設計：HEVC 直接デコードが現状不可のため、回帰ゼロを最優先。タイムアウト 5s は faststart H.264 の起動(~0.2s)に十分な余裕かつ HEVC 退避を過度に遅延させない値。

### HEVC 調査の結果（追記）
- HEVC HW デコードは Electron で **利用可能**（`isConfigSupported`=supported）。
- 旧バグ: `sample.description` が HEVC で空 → `hvcC` が取れず description 無しで configure → デコーダ無反応。
  → **stsd の sample entry から抽出するよう修正**（`extractDescriptionFromTrack`）。AV1(av1C) も対応。
- ただしテストサンプル `10000kbps_60fps.mp4` では **MP4Box の onSamples が発火せず**（サンプル取り出し0件）、デマックス側に別問題が残る。fMP4 等サンプル特有の可能性があり、ユーザー実機の GoPro HEVC で要再検証。

### 残課題・次のステップ
- **HEVC を確実に無プロキシ高速化する本命案**: HTMLVideoElement の逐次再生（シークなし）＋ `requestVideoFrameCallback`＋ `playbackRate` でフレーム取得する provider。OS デコーダを使うためコーデック非依存で MP4Box 問題を回避できる。
- まずユーザー実機 HEVC で「description 修正だけで速くなるか」を確認するのが安価。
- moov 末尾配置の大容量 H.264 は起動が遅くフォールバック → range 取得 or 軽量 faststart remux の自動化が候補。
- 実プロジェクトでの体感確認（`npm run dev` → 動画出力）は未実施。

## 2026-05-29 — ブラウザでの実機確認とリサイズハンドルの視認性修正

### 実施内容
- レンダラのみをブラウザで起動する preview 設定（`.claude/launch.json`、`VITEST=true` で electron プラグインを無効化）を追加し、computer use で動作確認。
  - リサイズ: 右下ハンドルのドラッグで scaleX/scaleY が 1→2、左上アンカーが固定されることを実機確認。
  - ドラッグ移動のズレ修正: カメラ zoom=2 で本体をドラッグし、移動量が `Δclient/(displayScale*zoom)`（=68px）と一致、旧バグ値（135px）でないことを確認。
  - 書き出しモーダル: 準備中／描画中（フレーム N/総数・%）／キャンセル中の各表示とキャンセルボタン動作を確認。
- リサイズハンドルの見かけサイズ補正に `displayScale` を加味（約 3.7px → 約 10px）。プレビュー縮小時でも掴みやすいサイズに。

### 選定理由・判断の根拠
- ハンドルサイズの補正に displayScale を含める: スクリーン上の実ピクセルサイズは `local * objScale * cameraZoom * displayScale` で決まるため、一定の見かけサイズにするには displayScale も割る必要がある。`renderScene` の依存を増やさないよう ref 経由で参照。

## 2026-05-29 — 動画書き出しの進捗モーダルとキャンセル機能

### 実施内容
- 書き出し中に進捗を表示するモーダル `ExportProgressModal` を追加（App 直下にマウント）。
  - フェーズ表示（準備中 / 描画中 / 保存中 / キャンセル中）。
  - 描画中は「フレーム N / 総数」と % を確定プログレスバーで表示。それ以外は不確定バー。
  - キャンセルボタンを設置。
- store に書き出し進捗・キャンセル要求の状態を追加（TDD）。
  - `exportProgress`（phase / currentFrame / totalFrames）, `exportCancelRequested`。
  - アクション: `setExportProgress`, `requestExportCancel`。`setExporting` で開始時に初期化・終了時にクリア。
- `useProjectExport` を進捗報告・キャンセル対応に更新。
  - フレームループで約 10 回/秒に間引いて進捗を更新。
  - キャンセル要求（または effect クリーンアップ）を `isCancelled()` で監視し、ループ中断・保存スキップ・完了/失敗アラート抑制を行う。

### 選定理由・判断の根拠
- キャンセルを `isExporting=false` ではなく専用フラグ `exportCancelRequested` で行う方針: エンコード処理を中断し保存をスキップした上で `finally` が後始末してから `isExporting` を落とす、という安全な収束順序を保つため。即座に `isExporting` を落とすとモーダルが消え、進行中処理との状態不整合が生じる。
- 進捗更新を間引く: フレーム毎の store 更新は React 再レンダリングを多発させ書き出しを遅くするため、約 10 回/秒に制限。
- 状態を store に置く理由: 書き出しは `useProjectExport`（Viewport 配下）で走るが、モーダルは App 直下に置きたく、コンポーネント間で状態共有が必要なため。

### 残課題・次のステップ
- 現状キャンセルはフレームループ／保存前の境界で反映される。エンコーダ内部処理が長い場合は反映に多少の遅延がある。

## 2026-05-29 — 要素の角リサイズ機能とドラッグ移動ズレの修正

### 実施内容
- 選択中の要素の四隅にリサイズハンドルを表示し、ドラッグで拡縮できる機能を実装。
  - 掴んだ角の対角（アンカー）を固定したまま `scaleX` / `scaleY` を変更する挙動。
  - コンテナの回転にも対応（ローカル軸へ逆回転して拡縮量を算出）。
  - ハンドルはカメラズーム・要素スケールに依らず見かけ一定サイズ（約 10px）になるよう補正。
- リサイズ計算ロジックを純粋関数 `src/utils/transformGeometry.ts` に分離し、TDD で実装（`transformGeometry.test.ts`）。
- 要素のドラッグ移動がカメラズーム時にズレる不具合を修正。
  - 従来は global 座標の差分をそのまま `obj.x/y` に加算していたため、ズーム倍率分ズレていた。
  - コンテナの親空間（`parent.toLocal`）で差分を取るよう変更し、ズーム・回転・ネストを正しく加味。
- 3D ステージのビルボード抽出からリサイズハンドルを除外。

### 選定理由・判断の根拠
- 拡縮を `width/height` ではなく `scaleX/scaleY` で行う方針: text を含む全オブジェクト型で `width/height` を持つとは限らず、`scaleX/scaleY` は `BaseObject` 共通プロパティのため汎用的に扱えるため。
- 幾何計算を PixiJS 非依存の純粋関数へ分離: TDD でアンカー固定・回転対応の数式を単体検証できるようにするため。
- ドラッグ差分を親空間で取る方式: カメラ変換（zoom/rotation/pan）をコンテナ階層から自動的に反映でき、store のカメラ値を個別に持ち込むより堅牢なため。

### 残課題・次のステップ
- グループ所属・キーフレーム/モーションパス・振動オフセットを持つ要素のリサイズは、`obj.x/y` とコンテナ実位置がずれるためアンカー固定が完全でない（静的要素では正確）。必要なら別途対応。
