# UX Film Director vNext 設計判断記録

## ADR-001: macOS を主ターゲットにする

### 判断

UX Film Director vNext は macOS / Apple Silicon / Metal を主ターゲットにする。Windows は準対応とし、初期段階では起動、基本描画、基本書き出しのスモーク確認を基準にする。

### 理由

- UX Film Director は Mac ユーザー向けの高性能編集環境として価値が高い。
- Windows には AviUtl という強い既存選択肢がある。
- preview は Chromium WebGPU = Dawn over Metal、export は wgpu-native = Metal に寄せられるため、macOS では parity リスクを小さくできる。
- 初期 CI と検証負荷を macOS 中心へ集約できる。

### 却下した案

Windows と macOS を初期から同格に扱う案は却下する。GPU ドライバ差、WebGPU 実装差、CI マトリクスの重さが vNext MVP の目的に対して過剰である。

## ADR-002: Electron を UI シェルとして残す

### 判断

Electron / React は UI シェルとして残す。

### 理由

- Chromium を同梱でき、WebGPU 挙動を比較的固定しやすい。
- ファイル選択、設定、プロパティパネル、進捗表示などの UI 実装速度が高い。
- 現行資産を完全に捨てずに段階移行できる。

### 却下した案

Tauri への移行は初期段階では却下する。macOS の WKWebView と Windows WebView2 に依存すると WebGPU の挙動差が大きく、レンダラが製品の心臓になる vNext ではリスクが高い。

## ADR-003: プレビューと書き出しで合成実装を分けない

### 判断

合成、エフェクト、色変換は wgpu + WGSL の shared renderer に集約し、wasm/WebGPU プレビューと native/wgpu 書き出しで同じ仕様を使う。

### 理由

- プレビューと書き出しの差異は動画編集アプリで最も避けるべき不具合である。
- ffmpeg フィルタ合成に頼ると、プレビューと書き出しの数式が二重化する。
- `wgpu` を使えば Rust 側で native と wasm の両方を対象にできる。

### 注意

同じ `wgpu` コードでも、native Metal と Chromium WebGPU / Dawn over Metal の丸め、サンプリング、色変換は完全一致しない可能性がある。完全一致ではなく、許容誤差に基づく golden-frame parity を正本にする。

さらに、preview 経路は Dawn / Tint が WGSL を MSL へ変換し、export 経路は wgpu-native / Naga が WGSL を MSL へ変換する。同じ WGSL でも翻訳器が異なるため、生成される Metal shader の差異を parity spike の原因分類に含める。

### 却下した案

ffmpeg フィルタで合成やエフェクトを実装する案は却下する。ffmpeg は decode、encode、mux、明示色変換に限定する。

## ADR-004: sidecar で危険なメディア処理を隔離する

### 判断

ffmpeg / ffprobe / decode / encode / mux / 壊れたメディア入力を扱う処理は sidecar プロセスへ隔離する。

### 理由

- napi-rs のインプロセス実行は低レイテンシだが、panic や native library のクラッシュが Electron main を巻き込む。
- 動画編集アプリでは壊れた素材やドライバ差が避けられない。
- sidecar ならクラッシュドメインを分離できる。

### 補足

純粋で小さい `rust-core` 評価 API は、将来的に napi-rs で低レイテンシに呼び出す選択肢を残す。ただし巨大フレームや危険なメディア処理は sidecar を既定にする。

## ADR-005: MVP から滑らかな再生と音声実装を外す

### 判断

vNext MVP には滑らかなリアルタイム再生と音声の再生・ミックス実装を含めない。

### 理由

- MVP の目的はアーキテクチャの縦スライス検証であり、使える編集機能の完成ではない。
- リアルタイム再生は soft realtime な先読み、リングバッファ、ドロップ制御の問題であり、最初の parity 証明には不要である。
- 音声はサンプル精度、A/V 同期、スケジューリングを伴い、初期 MVP の範囲を大きく超える。

### 補足

音声時間モデルは `rust-core` の仕様として先に定義する。ただし実装と UI は後続フェーズに回す。

## ADR-006: 初期 colour target を SDR / Rec.709 に限定する

### 判断

初期 vNext は SDR / Rec.709 を対象にする。HDR / 10bit はメタデータ保持と将来拡張余地に留める。

### 理由

- HDR / 10bit は transfer、primaries、tone mapping、YUV 変換、タグ付けの複雑度が大きい。
- MVP の主要リスクは renderer parity と sidecar 境界であり、HDR 対応を同時に抱えると検証軸が増えすぎる。

## ADR-007: 初期 export は RGBA + 明示 ffmpeg 変換にする

### 判断

初期 export は shared renderer が RGBA フレームを出力し、ffmpeg の明示 `zscale` / colour metadata 指定で SDR / Rec.709 へ変換する。

### 理由

- 初期スパイクで証明すべき parity は合成結果の RGBA 層にある。
- RGBA から YUV への変換は別レイヤーとして単体検証できる。
- shader-YUV は初期には過剰投資であり、後続の性能最適化として差し替え可能である。

### 注意

ffmpeg に自動色変換を推測させない。入力 transfer、出力 transfer、primaries、matrix、range、stream tag を明示する。

## ADR-009: 時間表現は float 秒を正本にしない

### 判断

`rust-core` の時間表現は整数 frame index または rational time base を正本にする。float 秒は UI 表示や一時計算には使えても、project model、timeline evaluation、keyframe evaluation、golden-frame の正本にはしない。

### 理由

29.97fps / 59.94fps などの `30000/1001` 系フレームレートでは、float 秒を正本にすると累積誤差で keyframe 評価と frame selection がずれる。後から時間型を直すと全評価、全 golden、全 serialization が壊れるため、最初に固定する。

## ADR-010: 合成は premultiplied alpha / linear light を既定にする

### 判断

shared renderer の合成は premultiplied alpha かつ linear light を既定にする。

### 理由

straight alpha と premultiplied alpha の違いは、opacity keyframe、画像合成、エフェクト出力のすべてに影響する。後から変更すると全 golden-frame が変わるため、MVP 前に固定する。

## ADR-008: Dawn-native は parity 失敗時の代替案にする

### 判断

初期 export は `wgpu-native` / Metal を既定にする。Dawn-native は、macOS 上で wgpu-native と WebGPU preview の差が許容誤差を超える場合にだけ検討する。

### 却下した案

headless Electron / Chromium を export worker として使う案は初期経路から外す。GPU 初期化、SwiftShader fallback、CI 差、毎フレーム readback の不安定さと重さが大きい。

## ADR-011: preview renderer を Electron main 内の napi-rs addon に置く

### 判断

preview の合成・提示は、Rust + wgpu の napi-rs addon を Electron main プロセス内に置き、macOS では CAMetalLayer へ直接描画する構成を採用する。decode は引き続き sidecar に隔離し、addon は描画、共有メモリ読み出し、window handle 操作だけを扱う。

既存 WebGPU presenter は削除せず、Phase 6 完了後も env / flag 切替で常時起動可能な退避路として残す。新経路との同一 scene pixel diff harness を `04-render-parity.md` に追加し、parity 検証にも使う。

### 理由

- 現 preview 経路は sidecar decode 後に共有メモリ、renderer process、JS heap、WebGPU `writeTexture`、Chromium GPU process をまたぐため、1080p preview では per-frame data movement が大きい。
- Electron renderer process の WebGPU 経路を bypass し、main 内 addon から CAMetalLayer へ直接 present することで、JS heap / `writeTexture` / Chromium GPU process 経由を preview から外せる。
- ADR-002 の Electron UI shell は維持でき、React UI と既存 WebGPU presenter を捨てずに段階導入できる。
- ADR-003 の shared renderer / WGSL 正本を維持し、preview と export の合成仕様を分岐させない。
- ADR-004 の危険なメディア処理隔離は維持し、ffmpeg / decode / encode / mux は sidecar の責務に残す。

### 補足

- addon の境界である NSView 操作、wgpu init、surface present、共有メモリ attach はすべて `catch_unwind` で包む。panic または復帰不能な失敗を検知した場合は、既存 WebGPU presenter 経路へ fallback する。
- addon が扱う責務は描画、共有メモリ読み出し、window handle 操作に限定する。decode は sidecar 維持とし、addon 内へ移さない。
- Phase 3b の IOSurface zero-copy は初期計画から外し、Phase 3a の in-process memcpy 経路で体感 60fps が出るかを確認してから再判断する。

### 却下した案

renderer も sidecar に置き、IOSurface だけで描画結果を main へ渡す案は初期案から外す。CALayer overlay の ownership と `MTLDrawable` の扱いが複雑で、初期検証としては POSIX shm + main 内 present よりリスクが高い。

### 改訂（2026-08-23、R6再設計に伴う位置づけ変更）

Windows_Port_Plan W7 の最終設計（`progress/windows-w7-async-attach.md` stage3以降）で、Windows の動画クリップを含むシーンは nv12 パイプライン完成まで WebGPU presenter による interim 表示を継続する構成が恒久的に採用された。これに伴い、本 ADR が定めた「preview renderer を addon に置き、既存 WebGPU presenter は削除せず parity 比較用の退避路として残す」という位置づけを次のとおり改訂する。

- presenter の役割は「parity 比較用の退避路」から「(1) Windows の nv12 attach 窓中の動画クリップシーン interim 表示（恒久・必須）、(2) 縮小規模での parity / 視覚検証用途」の二本立てに変更する。(1) は fallback ではなく W7 の設計上必須のコンポーネントである。
- `sharedRendererWebGpuPresenter.ts` の全面削除は行わない。動画クリップシーンの interim 表示に必要な最小限（背景合成＋動画テクスチャ描画）へ縮小するにとどめる。詳細は `markdown/Rust_Source_Of_Truth_Plan.md` の R6 節（2026-08-23 改訂版）を参照。
- 完全削除を再検討する条件（シェーダ再構成による attach 時間の大幅短縮など）が満たされた場合は、R6 節を再評価したうえで本 ADR も再改訂する。

## ADR-013: Native Overlay を child NSWindow として実装する

**状態**: 確定（2026-07-03）

### 背景

Bug E — preview pane 上に開く HTML 駆動 UI（context menu / popover / tooltip / modal / dropdown）が CAMetalLayer overlay に隠れて見切れる。

### 決定

Native Overlay を main BrowserWindow の contentView subview ではなく、独立した child NSWindow として実装する。`addChildWindow:ordered:` で main NSWindow に attach し、HTML 駆動 UI が preview に重なって開いたときは child window の z-order を `NSWindowBelow` へ下げる（`orderOut:` ではなく order 下げ、GPU の live surface present は継続する）。

### 理由

- macOS の z-order は「同一 NSWindow 内の view 階層」と「複数 NSWindow 間の window order」が独立した2軸であり、subview のままでは WebView 内の HTML UI を一律 overlay より上に置くことが構造的に不可能。
- child window 化により OS 任せの z-order 切替が可能になり、modal の種類に依存しない一律の解決になる。

### 却下した代替

- (A) modal open 時に overlay を `setHidden:YES` — 動画再生中の一瞬の黒画面が編集ソフトとして許容しがたい。
- (B) NSMenu / NSPanel への部分置換 — tooltip / popover / color picker 等に適用できず二重実装になる。
- (C) HTML 全廃 — ADR-002 で既に却下済み。

## ADR-014: `rust-core` を編集モデル・保存形式・評価の唯一の正本とし、TS 型を生成物にする

**状態**: 確定・実装完了（R0-R4、★2026-08-22）

### 決定

project model（42 kind `TimelineObject` を含む全 object kind）、`.uxfd` 保存形式
（`ProjectFile`/バージョニング）、timeline / keyframe / easing / visibility /
group transform / filter stack の評価、command / undo、validation の正本を
`rust-core` に置く。TypeScript の対応する型は `ts-rs` による生成物とし、手書きしない。

### 理由

現在（提案時点）easing とキーフレーム評価は TS と Rust に同じものが 2 実装あり、
評価経路も 2 本走っている。preview と export の差異は動画編集アプリで最も避けるべき
不具合であり（ADR-003 の理由と同じ）、評価が二重にある限り構造的に防げない。

### 実装結果（`Rust_Source_Of_Truth_Plan.md` R0-R4 完了時点）

- **R0**（差分ハーネス）: 経路 A（`scene.evaluate`）と経路 B（`rustSceneSnapshot.ts`）の
  評価結果差分を機械比較する `ts_evaluation_parity` を常設。当初 447 フレーム 5,099 件
  あった差分は R2 で全クラス解消し `KNOWN_DIFFERENCES.json` は `[]`。
- **R1**（型 codegen）: `ts-rs`/`schemars` で TS 型・JSON Schema を生成し、手書きミラーを全廃。
- **R2**（評価一本化）: `source_frame` 規約差・keyframe clamp 規約差・Clipping アニメーション差の
  3 クラスをすべて Rust 側評価へ統一。経路 B（`rustSceneSnapshot.ts` の評価部分）は撤去。
- **R3**（編集モデル移管）: 40+ object kind すべてを `rust-core/src/schema.rs` へ移送完了。
  ただし `audio_visualization`/`audio_sphere`/`getcolor_dot_field`/`group_control` の
  4 kind はクロスオブジェクト参照の構造的複雑さにより wire 統一（stage4）を見送り、
  型移送のみで完了とした（下記「実装からの逸脱」参照）。
- **R4**（保存形式・コマンド・レシピ）: `projectFile.ts` の読み書き・`historySlice.ts` の
  undo/redo・`agentProject.ts` のレシピ解析をすべて `rust-core` へ移管完了。

### 実装からの逸脱（正直な記録）

- 提案時点では想定していなかった `Command::Batch`（複数オブジェクトへ同時作用する
  UI 操作を単一コマンドで表現できないため R4-7b で追加）が正本の一部になった。
- クロスオブジェクト配線（4 kind）・`filterStack.ts` の編集 forward path・
  `layerTrackOps.ts` の reorder 計算は、TS 側に**意図的に**残っている
  （即時解消の対象外、`Rust_Source_Of_Truth_Plan.md` の「思想上の残り（責務台帳）」参照）。
  これは ADR-014 の決定を覆すものではなく、スナップショットスキーマ変更を伴う
  別フェーズの課題として切り出したもの。

### 却下案 (A)

TS を正本にして Rust を従属させる。export / native overlay / sidecar のすべてが
Rust 側にあり、正本を TS に置くと毎フレーム TS の評価結果を Rust へ送り続けることになる。

### 却下案 (B)

手動ミラーのまま境界テストで担保する。object kind が 40 を超えた時点でテストの
網羅コストが実装コストを上回っている。

## ADR-015: PSD 解析を自前 Rust 実装に一本化し `ag-psd` を落とす

**状態**: 確定・実装完了（R5、★2026-08-22）

### 決定

PSD 解析は `rust-backend/src/psd_fast.rs` を唯一の実装とし、`ag-psd` 依存と
`psdWasm.ts` の Worker 実装を削除する。

### 理由

解析実装が 3 つ（ag-psd / デッドコードの `psd-wasm` / `psd_fast.rs`）あり、
レイヤー名の文字化けのような互換性バグを直すたびに複数箇所を触る必要がある。

### 前提条件の充足

借用 VM の PSD parser 研究（`vm_tuning_research/notes/tachie-corpus-parity.md`）で
33/33 ファイル完全一致を確認し、前提条件を満たした。

### 実装結果

`psd-wasm` クレート・`psdWasm.ts`・`psdAgPsdWorker.ts`・`parsePsdArrayBufferAsObject`
を削除し、`package.json` から `ag-psd` を除去済み。PSD インポートは `psd.parseMeta` RPC
（meta-only、実デコードはスコープ外）1 本に統一し、CI 用 e2e パリティゲート
（`npm run test:psd-import:e2e`）を新設した。

### 記録されているギャップ

R5-7 で「native overlay の内容を CI（CDP screenshot）で目視確認する手段が無い」
ことが判明し、厳密な意味での目視ピクセル一致検証は達成できていない。
display 経路が R5 を通じて無改修であることの確認と VM 研究のパリティ結果を
根拠に完了判定した（詳細は `progress/rust-source-of-truth-r5-psd-unification.md` R5-7 節）。

### 却下案

ag-psd を残し Rust をエクスポート専用にする。preview と export で PSD の解釈が
割れる余地が残る。

## ADR-016: preview 描画を native overlay 単一経路にし TS WebGPU presenter を縮小する

**状態**: 確定・実装完了（改訂版、R6、★2026-08-23）

### 決定（提案時点）

`sharedRendererWebGpuPresenter.ts` の内蔵 WGSL と描画経路を削除し、preview 描画を
native overlay（ADR-011 / ADR-013 / ADR-012）のみにする。

### 理由

`architecture/00-overview.md` 基本方針 8 の実装。提案時点では WGSL が TS 側と
`native-wgpu-renderer` の 2 箇所にあった。

### 前提条件

macOS / Windows の両方で native overlay が既定 ON（`Windows_Port_Plan.md` W7）。

### 実装結果（R6 完了時点の決定 = 提案からの改訂）

`Windows_Port_Plan.md` W7 の最終設計により、Windows の動画クリップを含むシーンは
nv12 パイプライン完成まで（実測で launch 起点の中央値約 43 秒、cold cache 時最大
約 58 秒の可能性）WebGPU presenter による interim 表示を継続する設計が**恒久的に**
採用された。これは fallback ではなく設計上必須のコンポーネントであり、
提案時点の前提「両プラットフォームで fallback 不要」は成立しないと判明した。

したがって ADR-016 の決定を次のとおり改訂して実装した（`sharedRendererWebGpuPresenter.ts`
の**全面削除は行わない**）:

- preview 描画は native overlay を既定・唯一の常用経路にする（この部分は提案どおり実装）。
- `sharedRendererWebGpuPresenter.ts` は「Windows の nv12 attach 窓中の動画クリップシーン
  interim 表示」に必要な最小限（背景合成＋動画テクスチャ描画＋export 用 readback/handoff）
  へ縮小し、削除はしない。バッチ3時点の実測行数は presenter 本体 1,351 行 /
  presenter controller 1,211 行 / orchestration 426 行、計 2,988 行。
  非 video-scene の表示分岐・重複エフェクトスタックは削除済み（native overlay が
  essential ready の時点でそれらを担うため）。
- macOS では `nativeOverlayLifecycleState` が実質即時 `'overlay'` へ遷移し、presenter が
  表示上使われる窓は実質ゼロのまま。
- `src/` 配下の WGSL 文字列は縮小後の `sharedRendererWebGpuPresenter.ts` 1 ファイルのみに
  限定される（0 件ではない。理由は上記）。

ADR-011 の「presenter をparity比較用に残す」という位置づけも、この改訂に合わせて
ADR-011 本体に改訂節（2026-08-23）を追記済み。

### 却下した代替案（次善策として記録）

- 完全削除＋静的プレースホルダ interim: Windows で動画を含むプロジェクトを開くたび
  最大約 1 分、動画プレビューが見えなくなる UX 後退のため不採用。
- シェーダ再構成による attach 時間短縮後の完全削除: nv12 コンパイル時間短縮の見込みが
  未確立のため着手不可。将来短縮されたら本 ADR を再評価し原案（全面削除）へ回帰する余地を残す。
- presenter を parity 比較用にのみ残す（提案時点の却下案）: 比較用に残すなら「使われない
  経路を保守し続ける」ことになり、実際には parity 検証は golden-frame harness が担っている。
  ただし実装結果として presenter は CI/CDP で視覚検証できる唯一の描画経路である
  （native overlay は別 OS 合成レイヤーのため CDP では黒画面）ことも縮小維持の理由に含めた。
