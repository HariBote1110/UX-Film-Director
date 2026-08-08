# 外部ビデオ経路のシーク後色崩れ — 診断と修正記録

出典バグ: [Bug_ExternalVideoPausedFrameZero.md](../markdown/Bug_ExternalVideoPausedFrameZero.md) §5。
外部ビデオ経路（`importExternalTexture` + `externalVideoFrameShaderCode`）の出力色が
Rust デコード RGBA 経路と食い違う件。

## 調査で確定した事実（2026-08-08）

- **エンコード/リニアの表現形式は両経路で一致しており、原因ではない（棄却）**。
  両経路とも「ガンマエンコード値を素通しで非 srgb キャンバス（`bgra8unorm` +
  colorSpace `srgb`）へ書く」設計で一貫している。`rgba8unorm`（非 -srgb view）の採用理由は
  `sharedRendererWebGpuPresenter.ts:664-668` と `architecture/04-render-parity.md` に明記済み。
- Rust 本流（in-process VideoToolbox）の YUV→RGB は**明示処理**：
  タグ（`kCVImageBufferYCbCrMatrixKey`）優先、タグ無しは長辺 1280px 閾値で BT.601/709 を選択
  （`macos-video-decode/src/colour.rs:24-37`）、range 展開も明示
  （`rust-backend/src/inprocess_decode.rs:690-762`）。alpha は 255 固定の straight。
- **ffmpeg フォールバック経路は matrix 未指定**（`rust-backend/src/decode.rs:1037-1054`）。
  range は ffprobe で明示解決するが、BT.601/709 の選択は ffmpeg 内部の推測任せ。
  `03-colour-pipeline.md` の「ffmpeg 任せの既定値を避ける」に対する実在の契約違反。
- **`importExternalTexture` は colorSpace 無指定**（`sharedRendererWebGpuPresenter.ts:968`）で、
  ブラウザの暗黙変換（タグ解釈＋タグ無し時の Chromium 独自推測）に依存。
- handoff の `ColourMetadata::rec709_srgb()` は実デコードパラメータを反映しない固定値で、
  TS 側は合否ゲート（`rustBackendVideoDecodeControl.ts:165-190`）としか使っていない。

## 原因仮説（順位付き）

- **H1（最有力）**: タグ無し／境界付近の素材で、Rust 側ヒューリスティック（1280px 閾値）と
  Chromium の推測が異なる matrix / range を選び、色味だけがズレる。
  「シーク後」はシークで初めて外部経路の実フレームが提示される再現手順の記述で、
  時間的な現象ではない可能性が高い。
- **H2（副次）**: BT.709 transfer と sRGB transfer の微差。Rust 側は transfer 変換をせず
  `srgb` とラベルするだけ（`03-colour-pipeline.md:60-62` が MVP 近似として明記）だが、
  ブラウザ側が transfer を厳密に変換するとコントラスト差が出る。
- **H3（両経路共通のため今回の食い違いの原因ではないが別課題）**: 両シェーダーとも
  opacity を straight alpha のまま premultiplied キャンバスへ書いており、blend 未設定。
  契約の「linear premultiplied 合成」に対する共通の逸脱。

## 実施した修正

1. ffmpeg フォールバックへ `in_color_matrix` を明示指定（タグ優先、タグ無しは in-process と
   同じ 1280px ヒューリスティック、bt2020 は bt709 近似）— rust-backend 側 TDD。
2. `importExternalTexture` の `colorSpace: 'srgb'` を明示固定し契約テストで固定 — TS 側 TDD。

## 未確定・残課題

- H1 の実証には**実際に色崩れが再現する素材の ffprobe**（color_space / color_range /
  解像度タグの有無）が必要。素材が bt709 タグ付きなら H1 は棄却され H2 が昇格する。
- タグ無し素材で Chromium の推測と Rust 側 1280px ヒューリスティックを一致させる保証は
  構造的に不可能（ブラウザ内部実装依存）。恒久策の候補は「タグ無し素材はデコード時に
  タグを正規化して外部経路へ渡す」か「外部経路を廃してデコード済み RGBA に一本化」。
- H3（premultiply/blend の契約逸脱）は別タスクとして扱う。
