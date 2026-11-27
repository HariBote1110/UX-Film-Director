# Render Parity Test Plan

## 目的

UX Film Director vNext では、プレビューと書き出しの見た目が一致することを設計上の最重要品質にする。

MVP の目的は、macOS / Metal 上で以下が成立することを確認することである。

```text
同じ project + 同じ frame index
  -> WebGPU preview
  -> native wgpu export frame
  -> 許容誤差内で一致
```

## テスト基準の分離

`rust-core` と renderer ではテスト基準を分ける。

- `rust-core`: 決定的な純粋ロジック。厳密一致。
- renderer: GPU backend、丸め、texture sampling の差がある。許容誤差比較。

この 2 つを混ぜない。

## Golden の種類

### Characterization Golden

現行 UX Film Director / PixiJS pipeline から撮影する golden。

目的:

- 現行挙動を移行前に固定する。
- Rust/wgpu 移植が観測上の現行挙動から大きく逸脱していないか確認する。

注意:

現行 pipeline が非決定的で安定した golden を出せない場合、現行 pipeline を正本にしない。その場合は手書きの小さい reference scene を golden とする。

### Reference Golden

小さい scene を手書きまたは固定生成して作る golden。

MVP reference scene:

- 1 動画平面（live decode ではなく事前抽出した静止フレームを代理入力にする）
- 1 画像
- 1 opacity keyframe
- 1 エフェクト（per-pixel gain / exposure 系）
- linear light 合成
- SDR / Rec.709 想定
- 初回 gate では source asset と canvas を同一解像度にし、transform は identity とする。
- 初回 gate では 1:1 pixel mapping に固定し、bilinear / bicubic などの resampling を発生させない。

最低 1 ケースは解析的に期待値を計算できる reference scene にする。例: 既知色の背景に既知色の foreground を opacity 50% で premultiplied alpha / linear light 合成し、期待 RGBA 値を数学的に検証する。preview と export の一致だけでなく、正しさも確認する。

スケーリング、回転、任意 transform、texture filtering は後続の別 gate で検証する。最初の parity gate では colour / alpha / shader 翻訳差だけを主対象にする。
後続 gate の第一段として、整数 translation と 2x nearest scale は CPU reference / native wgpu / WebGPU preview で
検証済み。さらに linear-light bilinear midpoint は CPU reference / native wgpu / WebGPU preview で検証済み。
top-left pivot の 90 度 rotation は CPU reference / native wgpu で検証済みで、TS scene snapshot も
`rotation_degrees` を Rust 境界へ渡す。WebGPU preview vertex scene 側の rotation parity、
bicubic filtering、任意 transform はまだ別 gate とする。

## MVP Parity Spike

MVP の parity spike は 2 段階に分ける。

### Phase 3a: native wgpu 単独検証

目的:

- renderer の colour math が解析的 reference と一致することを、WebGPU preview 経路より先に確認する。
- 不一致時に「実装の誤り」と「WebGPU / native 経路差」を混ぜない。

手順:

1. `rust-core` が指定 frame index の scene snapshot を返す。
2. `reference-renderer` が同 snapshot から CPU reference frame を生成する。
3. native wgpu / Metal が同 snapshot を `rgba16float` render target へ描画する。
4. readback 後、CPU reference と同じ量子化規則で RGBA8 に変換する。
5. `golden-harness` の最大 channel 差を主 gate として比較する。

Phase 3a の初回 gate では max channel delta を主判定にする。SSIM / PSNR は記録してよいが、正しさ判定を
SSIM 主導にしない。SSIM は局所的な pixel 誤差を平均で薄めるため、3a の correctness gate には不向きである。

RGBA8 量子化規則:

- PNG / RGBA8 入力の RGB は sRGB encoded として扱い、合成前に linear light へ decode する。
- readback された linear RGB は、RGBA8 化の直前に sRGB へ encode する。
- linear float を `0.0..1.0` に clamp する。
- `value * 255.0` を `round()` して `u8` にする。
- premultiplied buffer から保存用 RGBA8 に戻す時は、`alpha > 0` の場合だけ RGB を alpha で割って straight alpha に戻す。
- `alpha == 0` は `[0, 0, 0, 0]` とする。

この規則は CPU reference と native wgpu readback の両方で共有する。GPU render target は `rgba16float` とし、
中間合成を `rgba8unorm` に落とさない。

Native Overlay Phase 2 gate:

- `native-wgpu-renderer/tests/overlay_surface_parity.rs` を CI 対象にする。
- 対象 scene は Phase 3a の reference scene から、white 50% over black、white 25% over black、source alpha × clip opacity、gain above one clamp、2 pixel coordinate mapping を使う。
- CPU reference は手計算 anchor と厳密一致させる。
- native export readback と overlay surface test readback は `ComparisonThresholds::exact()` で比較し、`max_channel_delta=0` を gate にする。
- overlay surface test readback は検証専用であり、製品 preview 経路の steady state には readback を含めない。

Native Overlay Phase 6 3経路 parity gate:

- `npm run test:native-overlay-parity` を CI 対象にし、`native-wgpu-renderer/tests/overlay_surface_parity.rs` を実行する。
- 比較する3経路は overlay surface、WebGPU preview、export readback とする。
- overlay surface と export readback は同一 `SceneSnapshot` / source RGBA frame を使い、`ComparisonThresholds::exact()` で `max channel delta = 0` を gate にする。
- WebGPU preview は既存 `phase3b-webgpu-harness/` の reference scene と共有 WGSL parity 結果を同じ scene 群の根拠として保持し、Phase 6 では削除せず parity 用退避路として使う。
- 製品 preview の Native Overlay steady state は readback を含めない。CI で使う overlay surface readback は検証専用であり、実行時の frame bytes は制御 plane IPC に載せない。
- `VITE_UXFD_NATIVE_OVERLAY=0` または addon fallback 時は WebGPU preview を常時起動可能に保ち、同一 scene の差分調査に使う。

### Phase 3b: WebGPU preview / native export parity

Phase 3a が通った後、以下を通す。

1. `rust-core` が指定 frame index の scene snapshot を返す。
2. WebGPU preview が同 snapshot を描画する。
3. native wgpu export が同 snapshot を RGBA 描画する。
4. 両 RGBA 結果を比較する。
5. 差分が許容範囲内なら go。
6. 差分が許容範囲外なら原因を分類する。

Phase 3b で固定する実装条件:

- WGSL は `shared-renderer/shaders/solid_composite.wgsl` の単一ソースを native wgpu と WebGPU preview で共有する。
- source texture は両経路とも `rgba8unorm` / `Rgba8Unorm` とし、`-srgb` texture view による hardware sRGB decode は使わない。
- sRGB decode は共有 WGSL 内で手動実装する。
- render target は両経路とも `rgba16float` / `Rgba16Float` とする。
- readback 後の straight RGBA8 化は両経路とも CPU 側で、同じ sRGB encode と `round()` 量子化規則を使う。

初回 Phase 3b 実測:

- 実行環境: macOS 上の Chrome 149 / WebGPU、local HTTP harness。
- Adapter: `vendor=apple` / `architecture=metal-3` / `isFallbackAdapter=false`。
- 対象 harness: `phase3b-webgpu-harness/`
- 比較対象: Phase3a と同じ手計算 anchor。
- 結果: 全 6 ケースで `maxDelta = 0` / `meanAbsoluteError = 0`。
- ケース: red 50% over blue、white 50% over black、white 25% over black、source alpha × clip opacity、gain above one clamp、2 pixel coordinate mapping。
- Perturbation check: `?perturb=red-plus` で共有 WGSL 読込後の shader に red channel 加算を入れると RED になり、GPU output を実際に readback / compare できていることを確認した。

Integer transform / nearest sampling gate:

- 対象: 2x2 source を `translation=(1,1)`、`scale=(2,2)` で 5x5 canvas に配置する。
- sampling: `textureLoad` と `floor((outputPixel - translation) / scale)` による nearest。sampler / bilinear は使わない。
- CPU reference と native wgpu の比較: `maxDelta=0`。
- WebGPU preview harness: Chrome 149 / Apple Metal adapter で `maxDelta=0` / `meanAbsoluteError=0`。
- この gate では rotation、fractional scale、bilinear / bicubic filtering は扱わない。未対応 transform は fail-loud とする。

Linear-light bilinear sampling gate:

- 対象: 2x1 source（black / white）を `translation=(-0.5,0)`、`scale=(1,1)`、`sampling=bilinear` で 1x1 canvas に描画する。
- 期待値: sRGB encoded midpoint の `[128,128,128,255]` ではなく、linear light 補間後に sRGB encode した `[188,188,188,255]`。
- sampling: 4 texel を `textureLoad` で読み、sRGB -> linear light decode 後に手動 bilinear 補間する。hardware sampler と `-srgb` texture view は使わない。
- CPU reference と native wgpu の比較: `maxDelta=0`。
- WebGPU preview harness: Chrome 149 / Apple Metal adapter で `linear-light bilinear midpoint` case が `maxDelta=0` / `meanAbsoluteError=0`。
- TS scene snapshot gate は、有限の sub-pixel translation を `translation_x` / `translation_y` として Rust 境界へ渡す。
  整数translation専用の軽量fast pathに乗らない場合は、native wgpu render pathで扱う。
Top-left pivot rotation gate:

- 対象: 2x1 source（red / blue）を `translation=(1,0)`、`scale=(1,1)`、`rotation=90deg`、
  `sampling=nearest` で 2x2 canvas に描画する。
- 期待値: top-left pivot の逆変換サンプリングにより、red が `(1,0)`、blue が `(0,1)` へ配置される。
- CPU reference と native wgpu の比較: `maxDelta=0`。
- TS scene snapshot は `object.rotation` を `rotation_degrees` としてRust境界へ渡す。
- WebGPU preview vertex scene側のrotation parity、bicubic filtering、任意 transform は引き続き別 gate とする。

Claude review 後の判定:

- Phase 3b は `3b verified GO` とする。
- この判定は per-pixel 合成、整数 nearest transform、linear-light bilinear midpoint に限る。top-left pivot rotation は
  CPU reference / native wgpu では検証済みだが、WebGPU preview parity は別 gate とする。blur / bicubic など
  sampling を伴う効果も別 gate で扱う。
- `?perturb=red-plus` による RED と `isFallbackAdapter=false` の Metal adapter 確認により、「CPU 期待値だけを見ている」「fallback adapter で偶然通っている」という偽陽性リスクは退けた。
- 現時点で確認できた範囲では、WebGPU preview は Dawn / Tint over Metal、native export は wgpu-native / Naga over Metal で、共有 WGSL の per-pixel colour math が CPU reference と一致している。

原因分類:

- renderer 実装差
- texture sampling 差
- colour conversion 差
- input decode 差
- WGSL -> MSL 翻訳器差（Dawn / Tint と wgpu-native / Naga）
- readback 差
- golden 不安定

## 許容誤差

具体値は spike 前に決める。勘で数値を置かない。

導出手順:

1. 解析的に正しい期待値を持つ reference scene を用意する。
2. wasm/WebGPU preview と native/wgpu export の両方で描画する。
3. known-correct に対する各経路の誤差を測る。
4. 実測した noise floor に安全マージンを足して閾値を決める。
5. 閾値、根拠、対象環境を文書に記録する。

候補指標:

- 最大ピクセル差
- 平均絶対誤差
- PSNR
- SSIM

macOS / Metal では厳しめの閾値を採る。Windows は初期段階では厳密 golden の対象外とする。

初期の `golden-harness` crate は PNG fixture IO と、メモリ上の RGBA8 frame 同士の比較を持つ。
PNG 読込時は palette / indexed / grayscale / 16bit 入力を 8bit colour に正規化し、比較入力を RGBA8 に揃える。
実装済みの指標は最大 channel 差、平均絶対誤差、PSNR、global SSIM とする。初期 SSIM は RGBA sample
全体を 1 つのサンプル列として扱う大域指標であり、局所 window SSIM は後続の必要性が出た時に追加する。

初期 harness の機械的な失敗分類:

- `DimensionMismatch`
- `PixelValueDelta`
- `MeanAbsoluteError`
- `PsnrBelowThreshold`
- `StructuralSimilarity`

renderer 固有の原因分類（texture sampling 差、colour conversion 差、WGSL 翻訳器差など）は、Phase 3 の
preview / export 実経路に接続した後に、上記の機械分類へ追加情報として対応付ける。

## CPU Reference Renderer

`reference-renderer` crate は GPU backend に依存しない解析的 reference を提供する。入力は `rust-core` の
`SceneSnapshot` と、media id から RGBA8 frame への map である。

初期 gate の制約:

- source frame と canvas は同一解像度。
- transform は identity として扱い、resampling は発生させない。
- 合成は premultiplied alpha の `source over`。
- PNG / RGBA8 入力は sRGB encoded とし、合成前に linear light へ decode する。
- `Effect::LinearGain` は premultiply 前に RGB へ適用する。

この CPU reference は「preview と export が互いに一致しただけ」の偽陽性を避けるため、最低 1 つの
解析的に期待値が分かる scene の正本として使う。

解析アンカー:

- 不透明 black 背景に不透明 white foreground を opacity 0.5 で source-over する。
- linear 合成の正解は `0.5` であり、sRGB encode と `round()` 後の RGBA8 は `[188, 188, 188, 255]`。
- sRGB encoded byte 値のまま誤って合成すると `[128, 128, 128, 255]` 付近になり、この test で露見する。

追加の Phase3a 判別ケース:

- opacity 0.25 white over black -> `[137, 137, 137, 255]`
- source alpha 128 / clip opacity 0.5 の white over black -> `[137, 137, 137, 255]`
- sRGB 203 grey に `LinearGain { gain: 2.0 }` -> output clamp 後 `[255, 255, 255, 255]`
- 2 pixel source の red / blue を black 上に opacity 0.5 -> `[188, 0, 0, 255, 0, 0, 188, 255]`

## Go / No-Go

### Go

- macOS / Metal で WebGPU preview と native wgpu export が許容誤差内に入る。
- 差分がある場合も、原因が明確で許容値を文書化できる。
- reference golden が CI で再現できる。

### 見直し

- wgpu-native / Metal と WebGPU / Dawn over Metal の差が許容誤差を超える。
- 差分原因が合成色空間や sampling ではなく backend 固有の制御不能なものだった。
- Dawn-native による export 経路でも差が解消しない。

### 退避案

- export を正として UI に明示し、preview は近似表示とする。
- ただしこれは最初から目指す設計ではない。

## CI 方針

- Linux: `rust-core` の純粋テストのみ。
- macOS: renderer parity、golden-frame、export、sidecar 統合。
- Windows: build-only と smoke test。golden-frame は初期対象外。
