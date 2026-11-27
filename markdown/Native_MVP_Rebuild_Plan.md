# Native MVP 再構築計画

## 方針

PixiJSから既存実装を少しずつ剥がすのではなく、UX Film Directorを「配置して、見て、書き出せる」最小編集アプリとしてRust/native経路へ再構築する。

優先するのは完成体の足場であり、互換fallbackの細かい境界ではない。

## 最初に到達する地点

- Rectangle / gradient rectangle をタイムラインに置ける。
- PNG / JPEG 画像をタイムラインに置ける。
- WAV / audio file をタイムラインに置ける。
- 図形 + 画像 + 音声を含むプロジェクトをMP4へ書き出せる。
- 書き出し映像フレームはRust native render shared frameを正本にする。
- 音声はmixdownしたWAVをRust backend encoderへ `audioPath` として渡し、ffmpegでmuxする。
- このMVPではText / complex filters / arbitrary masks / 3D / advanced PSD controlは後回しにする。

## 必須機能

### 1. Scene Snapshot

- Timeline objectからRust `SceneSnapshot` と media referencesを生成する。
- Visual snapshotは映像objectだけを対象にし、audio objectは除外する。
- layer visibility、timeline active range、fps、position、opacity、rotationを反映する。
- 未検証transformや未対応objectはfail-loudにする。

### 2. Native Media

- `SolidColour`: rectangle fillをRust mediaとして扱う。
- `GeneratedGradient`: gradient rectangleをRust mediaとして扱う。
- `Image`: local PNG / JPEGをRust backendでdecodeしてsource frame化する。
- `Psd`: local PSDは段階対応。MVPでは読み込み済みの単純PSDから始める。
- `Video`: 後続。まずは静止画/図形/音声exportを安定させる。

### 3. Native Render

- Rust backend `render.nativeSharedFrame` で1フレームをshared memoryへ描画する。
- CPU reference / native wgpu parityを持つ範囲だけをRust経路へ通す。
- 現時点で扱う範囲:
  - linear-light source-over
  - finite / sub-pixel translation
  - positive finite scale
  - nearest / bilinear sampling
  - top-left pivot rotation
  - SolidColour / GeneratedGradient / Image / PSD / Video source frame

### 4. Encode

- Rust backend `encode.start` / `encode.writeFrame` / `encode.finish` を標準経路にする。
- rendererからbase64や巨大JSON pixel payloadを送らない。
- frameはshared memory descriptorだけをcontrol planeで渡す。
- audioがある場合は `buildExportAudioMixWav` でWAV化し、`audioPath` としてRust backendへ渡す。

### 5. UI導線

- 既存の通常ExportボタンからRust backend encoderを優先する。
- Rust backend encoderがある環境では、非動画exportでもRust encoderを使う。
- 失敗時は「どのmedia/transformが未対応か」を短く出す。
- 必要なら次段で `Quick Native Export` ボタンを追加し、Pixi互換分岐を通らずRust経路を直接呼ぶ。

## 後回し

- Text rendering
- blur / shadow / clippingなど複雑filter
- group gradient
- skew / perspectiveなど、translate-scale-rotateを超える任意transform
- video decodeの複数source scheduler
- Windows最適化

## 次の作業順

1. 実機UIで Rectangle + Image + Audio を配置してRust MP4 exportを確認する。
2. 失敗した箇所をMVP blockerとして直す。
3. Quick Native Export導線が必要なら追加する。
4. scale transformをCPU reference / native wgpu / TS snapshotへ広げる。
5. 動画decodeをこのMVP経路へ合流させる。
