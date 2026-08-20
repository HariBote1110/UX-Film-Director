# H2: wgpu 24 の `TextureFormat::NV12`（`TEXTURE_FORMAT_NV12`）は Metal で使えるか

## 目的 / 仮説

wgpu 24 系には first-class の `wgpu::TextureFormat::NV12`
（`Features::TEXTURE_FORMAT_NV12` で有効化）が存在する。H1
（`wgpu24_nv12_research/notes/h1-hal-import-path.md`）で hal 経由の
IOSurface import 経路が動作することを確認済みだが、この標準フォーマットが
使えるなら、`objc::msg_send!` の自前拡張トレイトなしに、より素直な
（wgpu 標準 API のみで完結する）import/wrap ができる可能性がある。

**H2（副仮説、H1 成立後に検証）**: Metal backend 上で
`wgpu::TextureFormat::NV12` を使うと、IOSurface の import または
R8/RG8 プレーンビュー作成を、hal のハックなしでより直接的に行える。

反証されても（「Metal では使えないので無関係」という結論でも）研究として
価値がある、と明記されているタスクなので、そのつもりで検証する。

## 環境

H1 と同一（Apple M4 / macOS 26.5.2 (25F84) / rustc 1.93.0 /
`wgpu24_nv12_research/tools/nv12-wgpu24-spike`, `wgpu = "24.0.5"`,
`wgpu-hal = 24.0.4`）。

## 手順

1. まず `wgpu-hal-24.0.4` のソースを読んで Metal backend の
   `Tf::NV12` 対応状況を調査（`~/.cargo/registry/src/.../wgpu-hal-24.0.4/src/metal/adapter.rs`）。
2. ソース調査の結論を実行時に裏付けるため、
   `src/bin/h2_nv12_format_probe.rs` を作成し、Metal adapter に対して
   (a) `adapter.features().contains(TEXTURE_FORMAT_NV12)` を問い合わせ、
   (b) `required_features: wgpu::Features::TEXTURE_FORMAT_NV12` を指定して
   `request_device` を呼び、実際に拒否されるかを確認した。
   （`wgpu_hal::metal` の `Tf::NV12 => unreachable!()` パニックを実際に
   踏みに行くのは wgpu-hal 内部不変条件への意図的違反であり、まともな
   呼び出し側がすべきことではないため、feature query 側の確認に留めた。）
3. 実行コマンド:
   ```
   cd wgpu24_nv12_research/tools/nv12-wgpu24-spike
   cargo run --bin h2_nv12_format_probe
   ```

## 結果

### ソース調査（wgpu-hal 24.0.4, Metal backend）

- `wgpu-hal-24.0.4/src/metal/adapter.rs:272`
  （`describe_format` 相当、`TextureFormatCapabilities` を返す関数）:
  ```rust
  Tf::NV12 => return Tfc::empty(),
  ```
  → Metal では NV12 に一切のケーパビリティ（sampled/render
  attachment/blend 等）を認めていない。
- `wgpu-hal-24.0.4/src/metal/adapter.rs:1120`
  （wgpu の `TextureFormat` → `MTLPixelFormat` 変換テーブル）:
  ```rust
  Tf::NV12 => unreachable!(),
  ```
  → そもそも `MTLPixelFormat` へのマッピングが存在しない。
    このパスに実際に到達すればパニックする。
- 対照的に、Vulkan / DX12 では実装されている:
  - `wgpu-hal-24.0.4/src/vulkan/conv.rs:78`:
    `Tf::NV12 => F::G8_B8R8_2PLANE_420_UNORM`
    （Vulkan のネイティブ biplanar フォーマットにマップ）。
  - `wgpu-hal-24.0.4/src/vulkan/adapter.rs:379,788,932`:
    `sampler_ycbcr_conversion` 等、Vulkan 側の YCbCr 拡張機能と連動。
  - `wgpu-hal-24.0.4/src/dx12/adapter.rs:320`:
    `Features::TEXTURE_FORMAT_NV12` の対応が明記されている。

### 実行結果

```
$ cargo run --bin h2_nv12_format_probe
[h2] adapter: AdapterInfo { name: "Apple M4", vendor: 0, device: 0, device_type: IntegratedGpu, driver: "", driver_info: "", backend: Metal }
[h2] adapter.features().contains(TEXTURE_FORMAT_NV12) = false (Metal backend; expected false per wgpu-hal-24.0.4/src/metal/adapter.rs:272,1120)
[h2] request_device with required_features=TEXTURE_FORMAT_NV12 failed as expected: Unsupported features were requested: Features(TEXTURE_FORMAT_NV12)
[h2] H2 VERDICT: NOT APPLICABLE on Metal -- wgpu::TextureFormat::NV12 / Features::TEXTURE_FORMAT_NV12 is Vulkan/DX12-only in wgpu-hal 24.0.4; the Metal backend has zero support (Tfc::empty() capabilities, unreachable!() in the format-conversion table). The hal-level IOSurface import path validated in H1 remains the only way to get NV12/biplanar textures on Metal.
```

- Apple M4 実機の Metal adapter は `TEXTURE_FORMAT_NV12` feature を
  一切公開していない（`adapter.features()` に含まれない）。
- `required_features` にこの feature を指定して `request_device` すると
  `Unsupported features were requested: Features(TEXTURE_FORMAT_NV12)`
  で明示的に失敗する（ソース調査の結論と実行時挙動が一致）。

## 結論

**H2 は「Metal では適用不可（not applicable）」として棄却済み**。
wgpu 24 系の `wgpu::TextureFormat::NV12` /
`Features::TEXTURE_FORMAT_NV12` は wgpu-hal 24.0.4 の実装上
Vulkan backend と DX12 backend にのみ配線されており、Metal backend では
`describe_format` が空のケーパビリティを返し、フォーマット変換テーブルにも
`unreachable!()` しか存在しない。つまり macOS/Metal をターゲットにする限り
このフォーマットは実行時に一切利用できず、H1 で検証した hal 経由の
IOSurface zero-copy import（`msg_send!` 拡張トレイト経由の
`newTextureWithDescriptor:iosurface:plane:` 呼び出し）が、wgpu 24 に
アップグレードした後も引き続き唯一の実現手段であり続ける。

将来 Windows（DX12）や Linux（Vulkan）向けに同種の NV12 動画 import
機能が必要になった場合は、`TextureFormat::NV12` +
`TEXTURE_FORMAT_NV12` feature がその環境でのネイティブな選択肢になり得る
（Vulkan の `sampler_ycbcr_conversion` と組み合わせる設計が別途必要）が、
それは本タスクのスコープ外。

## 次の一手 / 未検証事項

- 本研究は「Metal 上で `TEXTURE_FORMAT_NV12` が使えるか」だけを検証した。
  Vulkan/DX12 上での実際の動作（`sampler_ycbcr_conversion` の要否、
  `G8_B8R8_2PLANE_420_UNORM` へのマッピングが実機で機能するか等）は
  未検証（クロスプラットフォームエンジン統合が具体化した時点で別途
  研究する）。
- wgpu-hal の将来バージョンで Metal 対応が追加される可能性はあるため、
  wgpu をさらに上げるタイミングでは `metal/adapter.rs` の
  `Tf::NV12` 分岐を再確認すること。
