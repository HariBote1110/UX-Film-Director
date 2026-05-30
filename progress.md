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
