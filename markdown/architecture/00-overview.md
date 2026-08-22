# UX Film Director vNext アーキテクチャ概要

## 位置づけ

UX Film Director vNext は、現行の Electron + React + Zustand + PixiJS + WebCodecs 構成で得た知見を、Rust を正本とする編集エンジンへ移し替えるための移行計画である。

vNext の最初の目的は「完成した動画編集アプリ」を作ることではない。目的は、動画編集エンジンとして破綻しない最小の縦スライスを作り、プレビュー、書き出し、メディア境界、色処理、テスト戦略が成立するかを検証することである。

## Single Source of Truth

同じ判断を複数文書で正本化しない。各事実の home は以下とする。他文書で触れる場合は要約に留め、詳細は home へリンクする。

| 事実 | Home |
| --- | --- |
| vNext の層構成と MVP スコープ | この文書 |
| 設計判断と却下理由 | [01-decision-record.md](./01-decision-record.md) |
| project model / timeline / keyframe / command / 時間表現 | [02-rust-core-spec.md](./02-rust-core-spec.md) |
| 合成色空間 / alpha / texture format / RGBA-YUV 契約 | [03-colour-pipeline.md](./03-colour-pipeline.md) |
| golden-frame / 閾値導出 / go-no-go | [04-render-parity.md](./04-render-parity.md) |
| sidecar / IPC / 共有メモリ / back pressure | [05-boundary-ipc.md](./05-boundary-ipc.md) |
| 実行順とフェーズ | [../roadmap.md](../roadmap.md) |

## ターゲット

- 主ターゲット: macOS / Apple Silicon / Metal
- 準対応: Windows
- 初期品質基準: macOS 上でのプレビューと書き出しの一致
- Windows の初期基準: 起動、基本描画、基本書き出しのスモーク確認

Windows は初期段階では厳密な性能・画質 parity の対象にしない。Windows には AviUtl という既存選択肢があるため、UX Film Director vNext はまず Mac ユーザー向けの高性能編集環境として成立させる。

## 層構成

`Rust_Source_Of_Truth_Plan.md` の R0-R6（★2026-08-23 全完了）を経た現状の層構成は以下のとおり。
各層の詳細な設計判断は [01-decision-record.md](./01-decision-record.md) の ADR-011/013/014/015/016 を参照。

```text
Electron / React（縮小済み TS 層）
  UI、プロパティパネル、ショートカット、ファイル選択ダイアログ、進捗表示、
  IPC オーケストレーション（rust-backend RPC 呼び出しの薄い配線）、
  Windows nv12 attach 窓中の interim presenter（下記 native overlay 参照）
  編集モデルの型は rust-core からの ts-rs/schemars 生成物を import するだけ（手動ミラー廃止）

rust-core  ★編集モデル・評価・保存形式・コマンドの唯一の正本
  project model（42 kind TimelineObject を含む全 object kind、ProjectFile/バージョニング）
  timeline / keyframe / easing / visibility / group transform の評価
  command / undo（二層構成: SetObjectField 等の汎用フィールドコマンド + AddObject/
    RemoveObject/SetLayerState 等の構造コマンド + Batch）
  agent_project（レシピ解析 `parse_agent_project_spec`/`build_agent_project_file`）
  ts-rs による TS 型 + schemars による JSON Schema 生成

rust-backend  ★RPC サーフェス（project.*/command.*/agent.*/psd.parseMeta 等）
  PSD 解析（`psd_fast.rs`、ag-psd 依存は撤去済み）、decode/encode/mux、音声、
  project.serialize/deserialize、command.apply、agent.buildProjectFile

native-wgpu-renderer / native overlay  ★プレビュー描画の既定経路（両プラットフォーム既定 ON）
  macOS: napi-rs addon から CAMetalLayer へ直接描画（ADR-011）
  Windows: child window 経由の native overlay（ADR-013 系）
  wgpu + WGSL の合成・エフェクト・色変換はここに一本化

sharedRendererWebGpuPresenter.ts（TS 内蔵 WGSL、interim presenter として縮小維持）
  Windows の nv12 パイプライン attach 完了までの動画クリップシーン表示に限り必要
  （設計上恒久的なコンポーネント。ADR-016/ADR-011 改訂を参照）。
  macOS では nativeOverlayLifecycleState が実質即時 'overlay' に遷移し表示上使われる窓が実質ゼロ。

bridge
  小さい制御プレーン: IPC または napi-rs
  大きいデータプレーン: 共有メモリまたは mmap
```

上記は R0-R6 が実測で確定させた**現状**であり、以下の「基本方針」との差分（TS 側に残る
UI 以外のロジック）は `Rust_Source_Of_Truth_Plan.md` の「思想上の残り（責務台帳）」に
台帳化されている。

## 基本方針

1. 編集状態と時間評価の正本は Rust に置く。
2. React/Zustand は UI 状態を持つが、編集モデルの正本にはしない。
3. PixiJS の毎フレーム scene 再構築は vNext の恒久設計にしない。
4. プレビューと書き出しで別々の合成・エフェクト実装を持たない。
5. ffmpeg は decode、encode、mux を主責務とし、合成やエフェクトの正本にはしない。
6. フレーム単位の JSON/base64 転送は禁止する。
7. 危険なメディア処理は Electron main と同一プロセスに置かず、sidecar に隔離する。
8. プレビューは Rust renderer を `wasm32` にコンパイルし WebGPU を呼ぶ構成にする。JavaScript が独自に WGSL や scene logic を持つ構成にはしない。

## MVP の定義

vNext MVP は「危険な境界を一度ずつ通す最小の縦スライス」とする。

必ず含めるもの:

- `rust-core` の project model
- 1 トラック / 1 クリップ
- 1 つのキーフレーム付きプロパティ
- 1 動画平面（MVP parity spike では事前抽出した静止フレームを代理入力にする）
- 1 画像
- 1 エフェクト（per-pixel gain / exposure 系。blur などの sampling 系は含めない）
- linear light 合成
- Electron 内 WebGPU プレビューで指定 frame index をスクラブ表示
- 同一 timeline から native wgpu で RGBA フレーム生成
- ffmpeg の明示 `zscale` 変換によるエンコード
- golden-frame harness
- sidecar による CFR H.264 フレーム受け渡し

MVP に含めないもの:

- 滑らかなリアルタイム再生
- 音声の再生・ミックス実装
- 複数エフェクトやエフェクトスタック
- トランジション
- HEVC / HDR / 10bit / VFR
- PSD / 3D / 高度合成
- GPU テクスチャ zero-copy
- Dawn-native

## 関連文書

- [01-decision-record.md](./01-decision-record.md): 設計判断と却下案
- [02-rust-core-spec.md](./02-rust-core-spec.md): Rust core の振る舞い仕様
- [03-colour-pipeline.md](./03-colour-pipeline.md): 色処理と変換契約
- [04-render-parity.md](./04-render-parity.md): golden-frame と parity 戦略
- [05-boundary-ipc.md](./05-boundary-ipc.md): sidecar / IPC / 共有メモリ境界
- [../roadmap.md](../roadmap.md): フェーズ別ロードマップ
