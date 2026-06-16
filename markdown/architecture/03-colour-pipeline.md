# Colour Pipeline

## 目的

色処理は UX Film Director vNext の preview/export parity を左右する中核仕様である。後から合成色空間を変更すると、全エフェクトと golden-frame が壊れるため、初期段階で前提を固定する。

## 初期ターゲット

- 初期対象: SDR / Rec.709
- 表示: sRGB display
- 合成: linear light
- alpha: premultiplied alpha
- HDR / 10bit: MVP では対象外

HDR / 10bit 素材のメタデータは将来拡張のため保持できるようにするが、MVP の renderer parity 対象にはしない。

## 基本方針

1. 入力素材は境界で作業色空間へ変換する。
2. 合成とエフェクトは linear light で行う。
3. プレビュー表示時は display 向けに変換する。
4. 書き出し時は SDR / Rec.709 へ明示変換する。
5. 暗黙の色変換、自動推測、ffmpeg 任せの既定値を避ける。

## Input Decode Contract

入力デコードも preview / export parity の一部である。

preview と export で別々のデコーダを使うと、renderer に渡る前の RGBA が食い違う。例として、ブラウザの画像デコーダは ICC / gamma / sRGB chunk を尊重する一方、Rust 側 decoder がそれを無視する場合がある。動画でも WebCodecs decode と ffmpeg decode の YUV->RGB matrix、range 展開、transfer 処理が異なる可能性がある。

MVP では、画像と動画の入力アセットを sidecar / Rust 側の単一経路でデコードし、デコード済み RGBA と colour metadata を preview と export の両方へ供給する。ブラウザに preview 用画像を別途 decode させない。

入力側でも自動推測に依存しない。

- decoder / ffmpeg の入力 colour assumptions を明示する。
- YUV -> RGB matrix を明示する。
- limited / full range の展開を明示する。
- transfer を明示する。
- sidecar は RGBA が sRGB encoded なのか linear なのかを metadata として返す。
- shared renderer は metadata に従って作業色空間へ変換する。

### PNG / Video Transfer の MVP 方針

PNG / RGBA8 画像入力は sRGB transfer として扱う。

動画入力は source container / bitstream metadata と renderer handoff metadata を分けて扱う。

- source H.264 / SDR video:
  - primaries: BT.709
  - matrix: BT.709
  - range: full または limited を metadata から明示して扱う
  - transfer: BT.709 が一般的だが、MVP の renderer handoff では sRGB transfer の RGBA8 へ正規化する
- renderer handoff:
  - format: `Rgba8Srgb`
  - primaries: `bt709`
  - transfer: `srgb`
  - matrix: `rgb`
  - range: `full`

つまり `ColourMetadata::rec709_srgb()` は「Rec.709 primaries の SDR RGB を、renderer 入力として
sRGB transfer に正規化済み」という意味で使う。BT.709 transfer の動画を厳密に扱う場合は、sidecar 側で
BT.709 EOTF -> linear -> sRGB OETF の正規化を行うか、renderer が `transfer=bt709` を decode できるようにする。

source が limited range (`tv`) の場合も、sidecar decode は metadata を読んで full-range RGBA へ展開し、
renderer handoff metadata は `range=full` に揃える。limited range を `full` として無音処理してはいけない。

MVP では、まず sidecar handoff を `Rgba8Srgb` に揃えて preview / export parity を閉じる。BT.709 transfer と
sRGB transfer の差を厳密に保持する HDR / 放送規格向け処理は、後続の colour-management gate で扱う。

## Renderer 内部

shared renderer は合成中間表現として RGBA を扱う。

MVP では linear light 合成の中間ターゲットを `rgba16float` 既定にする。

`rgba8unorm` は sRGB encoded の入出力や storage には使えるが、linear light の合成中間保持には使わない。linear light を 8bit に保持すると暗部バンディングが発生しやすく、後から直すと golden-frame とエフェクト挙動が壊れる。

スパイクで測る対象は「`rgba16float` を使うかどうか」ではなく、「`rgba16float` で MVP の性能が足りるか」である。

## MVP の演算順序

MVP の画像 PNG / RGBA8 入力は sRGB encoded として扱う。renderer と CPU reference は以下の順序を正本とする。

1. 入力 RGBA8 の RGB を sRGB から linear light へ decode する。
2. alpha は encoded colour ではなく coverage / opacity として扱い、`0.0..1.0` に正規化する。
3. `Effect::LinearGain` は straight linear RGB に適用する。
4. clip opacity を alpha に掛ける。
5. RGB を premultiplied alpha へ変換する。
6. linear premultiplied alpha で source-over 合成する。
7. 保存・比較用 RGBA8 に戻す時は、`alpha > 0` の場合だけ RGB を alpha で割って straight alpha に戻す。
8. straight linear RGB を sRGB へ encode する。
9. `0.0..1.0` に clamp し、`value * 255.0` を `round()` して `u8` に量子化する。

禁止:

- sRGB encoded byte 値のまま opacity / gain / blend を行う。
- gain を premultiply 後の RGB に適用する。
- 初回 parity gate で `rgba8unorm` render target に中間合成を保持する。
- CPU reference と shader で decode / effect / premultiply / blend / encode の順序を変える。

この順序は `reference-renderer` と `native-wgpu-renderer` の Phase3a test で固定する。

## Export 変換

初期 export は renderer が RGBA を出し、ffmpeg の明示変換で YUV / Rec.709 へ変換する。

必須条件:

- 入力 colour assumptions を明示する。
- 出力 primaries を明示する。
- transfer を明示する。
- matrix を明示する。
- range を明示する。
- stream metadata tag を明示する。

`zscale` または同等に測色を明示できる経路を優先する。ffmpeg の自動推測に依存してはならない。

## Shader YUV

shader 側で最終 YUV まで生成する案は、MVP では採らない。

後続で検討する条件:

- RGBA readback + CPU 変換が export 性能の主要 bottleneck になった場合
- HDR / 10bit 出力を製品対象にする場合
- ffmpeg の色変換が parity / 品質の許容基準を満たせない場合

## テスト方針

色処理のテストは 2 層に分ける。

1. Renderer parity
   - preview と export の RGBA 合成結果を比較する。
   - 完全一致ではなく許容誤差で比較する。

2. RGBA -> YUV -> RGBA round-trip
   - ffmpeg 変換を別レイヤーとして検証する。
   - 明示変換設定が変わったら golden を更新する前に差分理由を記録する。
   - 色変換の数学的検証は 4:4:4 で行う。
   - 4:2:0 は chroma subsampling により本質的に lossy であるため、色境界の誤差を含む別許容基準で扱う。

## 未決事項

- 初期許容誤差の数値
- ffmpeg 変換コマンドの最終形
- HDR metadata の schema 位置
