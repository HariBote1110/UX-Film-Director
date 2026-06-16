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
