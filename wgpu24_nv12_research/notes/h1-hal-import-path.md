# H1: wgpu 24.0.5 で hal 経由 NV12 IOSurface import は動くか

## 目的 / 仮説

`native-wgpu-renderer`（wgpu = "0.20.1"、実体 wgpu-hal 0.21.1）は Metal 上で
NV12 (biplanar 4:2:0) IOSurface-backed CVPixelBuffer をゼロコピーで
`wgpu::Texture` に import している（`newTextureWithDescriptor:iosurface:plane:`
を `objc::msg_send!` で叩き → `wgpu_hal::metal::Device::texture_from_raw` →
`wgpu::Device::create_texture_from_hal`）。別プロジェクトのエンジンと
workspace を統合するため wgpu を "24.0.5" に上げたい。

**H1（主仮説）**: この hal 経由 import 経路は wgpu 24.0.5 でも
（API シグネチャの差分を吸収すれば）動作し続ける。

**反証条件**: 上記 API が wgpu 24 に存在しない、重複しない
metal/objc 依存で一貫してビルドできない、または readback したピクセル値が
期待値と一致しない場合は H1 を棄却する。

## 環境

- ホスト: Apple M4（arm64）, macOS 26.5.2 (25F84)
- rustc 1.93.0 (254b59607 2026-01-19) / cargo 1.93.0
- ベースライン: `native-wgpu-renderer` の `Cargo.lock` 解決:
  `wgpu = 0.20.1`, `wgpu-hal = 0.21.1`, `metal = 0.28.0`, `objc = 0.2.7`,
  `core-foundation = 0.9.4`（dev-dependencies のみ）
- スパイク: `wgpu24_nv12_research/tools/nv12-wgpu24-spike`
  （独立 workspace、`Cargo.toml` に空 `[workspace]` テーブル）で
  `wgpu = "24.0.5"` を指定して解決した結果:
  - `wgpu 24.0.5`
  - `wgpu-hal 24.0.4`
  - `wgpu-core 24.0.5`
  - `wgpu-types 24.0.0`
  - `naga 24.0.0`
  - `metal 0.31.0`
  - `objc 0.2.7`（`objc2` 系は一切登場しない。`cargo tree -i objc2` は
    "did not match any packages" で確認）
  - `core-foundation 0.9.4`（重複なし。`core-graphics-types 0.1.3` 経由の
    要求と、テストフィクスチャが直接使う要求が同一バージョンに一致）
  - `cargo tree -i metal` / `-i objc` / `-i core-foundation` はいずれも
    単一バージョンのみを表示（重複クレートなし）。

## 手順

1. ベースライン確認（wgpu 0.20.1 側、変更なし）:
   ```
   cargo test --manifest-path native-wgpu-renderer/Cargo.toml nv12 -- --test-threads=1
   ```
   結果: `tests::nv12_iosurface::*` 9 件すべて `ok`（0.85s）。
2. スパイク crate 作成:
   `wgpu24_nv12_research/tools/nv12-wgpu24-spike/`
   - `Cargo.toml`: `wgpu = "24.0.5"`、macOS 専用ターゲット依存として
     `metal = "=0.31.0"`, `objc = "=0.2.7"`, `core-foundation = "0.9"`
     （バージョンは `cargo tree -i metal`/`-i objc` の実測値に厳密に
     一致させ、重複クレートを避けた。最初 `metal = "*"` としたところ
     `metal@0.33.0` が別途解決されて重複したため、この固定に修正した）。
   - `src/lib.rs`: `native-wgpu-renderer/src/nv12/import.rs`
     （`IOSurfaceTextureExt`, `import_nv12_iosurface_textures`）と
     `native-wgpu-renderer/src/lib.rs` の
     `tests::nv12_iosurface::nv12_fixture::SyntheticNv12Buffer`
     （8x8, `CVPixelBufferCreate` + `kCVPixelBufferIOSurfacePropertiesKey`,
     フォーマット `420v` = `kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange`）
     を一字一句相当で移植。
   - `src/bin/h1_import_spike.rs`: instance/device (Metal) 生成 →
     `SyntheticNv12Buffer` で Y=180, Cb=90, Cr=200 の単色 8x8 NV12
     バッファを作成 → `import_nv12_iosurface_textures` で Y (R8Unorm) /
     CbCr (RG8Unorm) の 2 テクスチャを zero-copy import → WGSL フラグメント
     シェーダで BT.709 video-range 変換 → `Rgba8Unorm` オフスクリーン
     ターゲットへレンダー → `copy_texture_to_buffer` + `map_async` で
     readback → 中心ピクセルを CPU 参照実装
     （`nv12_reference_srgb_bytes` 相当、BT.709/video range の式を
     そのまま移植）と比較（許容誤差 ±2/255）。
3. 実行コマンド:
   ```
   cd wgpu24_nv12_research/tools/nv12-wgpu24-spike
   cargo run --bin h1_import_spike
   ```

## API 差分（wgpu 0.20.1 → wgpu 24.0.5）

移植中に発見した唯一の破壊的差分:

- **`wgpu::Device::as_hal` の戻り値型**:
  - wgpu 0.20.1 (`wgpu-0.20.1/src/lib.rs:2910-2921`):
    ```rust
    pub unsafe fn as_hal<A: wgc::hal_api::HalApi, F: FnOnce(Option<&A::Device>) -> R, R>(
        &self, hal_device_callback: F,
    ) -> Option<R> {
        self.context.as_any()
            .downcast_ref::<crate::backend::ContextWgpuCore>()
            .map(|ctx| unsafe { ctx.device_as_hal::<A, F, R>(..., hal_device_callback) })
    }
    ```
    `ContextWgpuCore` へのダウンキャストに失敗した場合の外側 `Option`
    がある（`Option<R>`）。production の `import.rs` は
    `hal_device.map(|hal_device| { ... (y_texture, cbcr_texture) })`
    （内側 `Option<(Texture, Texture)>`）と合わせて
    `metal_textures: Option<Option<(Texture, Texture)>>` になるため、
    `metal_textures.flatten()` で両方の `None` を一括処理していた。
  - wgpu 24.0.5 (`wgpu-24.0.5/src/api/device.rs:388-401`):
    ```rust
    pub unsafe fn as_hal<A: wgc::hal_api::HalApi, F: FnOnce(Option<&A::Device>) -> R, R>(
        &self, hal_device_callback: F,
    ) -> R {
        if let Some(core_device) = self.inner.as_core_opt() {
            unsafe { core_device.context.device_as_hal::<A, F, R>(core_device, hal_device_callback) }
        } else {
            hal_device_callback(None)
        }
    }
    ```
    戻り値は `R` そのもの（外側 `Option` が消えた。ダウンキャスト失敗時も
    `callback(None)` を直接呼ぶ形に統一された）。
  - **必要な修正**: `wgpu24_nv12_research/tools/nv12-wgpu24-spike/src/lib.rs`
    の `import_nv12_iosurface_textures` 内、
    `let Some((y_metal_texture, cbcr_metal_texture)) = metal_textures.flatten() else { ... }`
    を `metal_textures.flatten()` → `metal_textures`
    （`.flatten()` を削除するだけ）に変更。
    変更しないと `error[E0599]: no method named 'flatten' found for enum
    'Option<(metal::Texture, metal::Texture)>'`
    （`help: call .into_iter() first` という誤誘導つき）でコンパイルエラー
    になる。
- **`wgpu_hal::metal::Device::texture_from_raw`**: シグネチャ完全一致
  （`wgpu-hal-0.21.1/src/metal/device.rs:246` と
  `wgpu-hal-24.0.4/src/metal/device.rs:304` を diff したところ、
  実装本体まで一字一句同一）。変更不要。
- **`wgpu::Device::create_texture_from_hal::<A>`**: シグネチャ・呼び出し方
  とも変更なし（`hal_texture: A::Texture, desc: &TextureDescriptor<'_>`）。
- **`metal::DeviceRef::raw_device()`**: 両バージョンとも
  `&parking_lot::Mutex<metal::Device>` を返す。`.lock()` の扱いも同一。
- **`metal` crate**: 0.28.0 → 0.31.0（wgpu-hal 側の要求バージョン変更に
  追従しただけ）。`newTextureWithDescriptor:iosurface:plane:` は 0.31.0 でも
  依然として提供されていない（production と同じ理由で
  `objc::msg_send!` 拡張トレイトが必要。`objc2` 系への移行は不要 —
  wgpu-hal 24.0.4 の Metal backend も無印 `objc 0.2.7` のまま）。
- **`wgpu::DeviceDescriptor`**: `memory_hints: MemoryHints` フィールドが
  追加された（`wgpu-types-24.0.0/src/lib.rs:1878`）。import 経路そのものの
  差分ではないが、スパイクのデバイス生成コードでは
  `memory_hints: wgpu::MemoryHints::default()` を追加する必要があった。
- **readback API 名**: `wgpu::ImageCopyTexture`/`ImageCopyBuffer` は
  `TexelCopyTextureInfo`/`TexelCopyBufferInfo`/`TexelCopyBufferLayout`
  にリネームされていた（WebGPU 仕様の `GPUTexelCopy*` に合わせた名称変更、
  `wgpu-24.0.5/src/api/command_encoder.rs:39-55`）。import 経路には無関係
  だが、readback を書くために必要だった。
- それ以外（`RequestAdapterOptions`, `plane_texture_descriptor` の
  `metal::TextureDescriptor` API, `objc::rc::autoreleasepool`,
  `IOSurfaceLookup`/`CFRelease` の FFI 宣言）は無変更で動作した。

## 結果

```
$ cargo run --bin h1_import_spike
[h1] built SyntheticNv12Buffer surface_id=326 8x8
[h1] adapter: AdapterInfo { name: "Apple M4", vendor: 0, device: 0, device_type: IntegratedGpu, driver: "", driver_info: "", backend: Metal }
[h1] import_nv12_iosurface_textures: OK (zero-copy IOSurface import succeeded)
[h1] readback centre pixel actual=[255, 161, 111] expected=[255, 161, 111]
[h1] H1 VERDICT: SUPPORTED (import + render + readback all matched within tolerance 2)
```

- 入力: Y=180, Cb=90, Cr=200（8x8 単色、`420v` = video range）。
- CPU 参照値（BT.709, video range）: `[255, 161, 111]`（sRGB8, round）。
- GPU readback（中心ピクセル、`Rgba8Unorm` 出力）: `[255, 161, 111]`。
- **差分 0/255** の完全一致（許容誤差 ±2/255 の枠内はもちろん、実際は
  誤差なし）。3 回連続実行しても同一結果で再現性あり。
- 依存グラフ: `metal`/`objc`/`core-foundation` いずれも単一バージョンに
  解決（`cargo tree -i metal`/`-i objc`/`-i core-foundation` で確認済み、
  重複クレートなし）。

## 結論

**H1 は採択（成立）**。wgpu 24.0.5 でも、wgpu 0.20.1 と本質的に同じ
hal 経由 IOSurface zero-copy import 経路
（`as_hal` → `msg_send! newTextureWithDescriptor:iosurface:plane:` →
`wgpu_hal::metal::Device::texture_from_raw` →
`wgpu::Device::create_texture_from_hal`）が、依存クレートの重複なしに
動作する。必要な修正は実質 1 箇所のみ:
`as_hal` の戻り値が `Option<R>` → `R` に変わったことに伴う
`metal_textures.flatten()` → `metal_textures` の 1 行修正
（加えて `DeviceDescriptor::memory_hints` フィールド追加、
`TexelCopy*` 名称変更という周辺 API の追従が必要だが、import 経路自体の
ロジックは無変更で移植できた）。

`metal`/`objc` は wgpu-hal 24.0.4 でも無印 `objc 0.2.7` のままで
（`objc2` への移行は発生していない）、production 側の
「wgpu-hal と同一バージョンに固定して重複回避」という設計方針
（`native-wgpu-renderer/Cargo.toml` のコメント参照）は wgpu 24 でも
そのまま踏襲可能（固定先のバージョン文字列を更新するだけ）。

## 次の一手 / 未検証事項

- 本スパイクは 8x8 単色のみを検証した。production の
  `gradient_matches_cpu_reference_within_tolerance` のようなグラデーション
  パターンや、`unchanged_revision_reuses_imported_plane_textures` の
  ようなキャッシュ再利用シナリオは未移植（H1 の core mechanism 検証には
  不要と判断したが、実際の昇格作業時には production の 9 テストすべてを
  wgpu 24 版に移植し直して通すこと）。
- BT.601 / full range など他の color range/matrix の組み合わせは
  今回未検証（`nv12_reference_srgb_bytes` の分岐は読んで移植済みだが、
  スパイクで実行したのは BT.709 video range の 1 パターンのみ）。
- `wgpu::hal::CopyExtent` 等、hal 型の他のフィールド・enum
  （`MTLTextureType` 以外のバリアント）は未検証。
- 4K 等の大きいサーフェスでの挙動・パフォーマンス（zero-copy が本当に
  維持されているか、GPU タイムラインで検証する等）は本スパイクのスコープ
  外。
- wgpu 24 への実際の昇格作業（`native-wgpu-renderer` 本体の Cargo.toml
  更新・67+ 既存テスト全体の移行）は本研究のスコープ外
  （Promotion Discipline に従い、別タスクとして `/development` ワーク
  フローで TDD で行うこと）。
