# H3: 上げ先は wgpu 25 か 30 か（Windows 移植 Phase 4 の設計判断1）

## 目的 / 仮説

`Windows_Port_Plan.md` の Phase 4 は wgpu 0.20 からの昇格を求めており、
上げ先が「25（透過が手に入る最小の飛距離）」か「30（最新）」かを未決にしていた。
判断材料は **`native-wgpu-renderer/src/nv12/import.rs` が触っている
`wgpu_hal::metal` 内部 API が、どちらでどれだけ変わるか**に尽きる。
ここは semver 保護の外で、壊れると macOS の IOSurface ゼロコピーが落ちる。

**H3**: wgpu 30 でも、hal 経由 NV12 IOSurface zero-copy import は
[H1](h1-hal-import-path.md) と同程度の小さな差分で動く。

**反証条件**: wgpu-hal 30 の `texture_from_raw` が別の型体系を要求する、
または wgpu-hal 30 が `metal`/`objc` crate を使わなくなっている場合は棄却する。

## 環境

- ホスト: Apple M4（arm64）, macOS 26.5.2
- rustc 1.93.0 / cargo 1.93.0
- 比較対象: `wgpu-hal` 0.21.1（現行）/ 24.0.4（[H1](h1-hal-import-path.md) 済み）/ 25.0.2 / 30.0.0
- スパイク: `wgpu24_nv12_research/tools/nv12-wgpu25-spike`
  （`nv12-wgpu24-spike` の複製に `wgpu = "25"` を指定しただけのもの）

## 手順

1. 依存グラフの観測。空 crate に `wgpu = "25"` / `wgpu = "30"` を入れて `cargo tree -e normal`。
2. `texture_from_raw` のシグネチャを registry の実ソースで確認。
3. `nv12-wgpu25-spike` を作り、`cargo run --bin h1_import_spike` で
   H1 と同じ 8x8 単色 NV12（Y=180, Cb=90, Cr=200、`420v` video range）を
   import → BT.709 変換 → readback して CPU 参照値と比較。

## 結果

### 依存グラフ

| wgpu | wgpu-hal | Metal バインディング |
|---|---|---|
| 0.20.1（現行） | 0.21.1 | `metal` 0.28 + `objc` 0.2.7 |
| 24.0.5 | 24.0.4 | `metal` 0.31 + `objc` 0.2.7 |
| **25** | **25.0.2** | **`metal` 0.31 + `objc` 0.2.7** |
| **30** | **30.0.0** | **`objc2-metal` 0.3.2 + `objc2` 0.6.4**（`metal` crate は不使用） |

### `wgpu_hal::metal::Device::texture_from_raw`

wgpu-hal 25.0.2（`src/metal/device.rs:308`）— 現行 0.21.1 と同一:

```rust
pub unsafe fn texture_from_raw(
    raw: metal::Texture,
    format: wgt::TextureFormat,
    raw_type: metal::MTLTextureType,
    array_layers: u32,
    mip_levels: u32,
    copy_size: crate::CopyExtent,
) -> super::Texture
```

wgpu-hal 30.0.0（`src/metal/device.rs:415`）— 型体系ごと別物:

```rust
pub unsafe fn texture_from_raw(
    raw: Retained<ProtocolObject<dyn MTLTexture>>,
    format: wgt::TextureFormat,
    raw_type: MTLTextureType,
    array_layers: u32,
    mip_levels: u32,
    copy_size: crate::CopyExtent,
    drop_callback: Option<DropCallback>,
) -> super::Texture
```

`metal::Texture` → `Retained<ProtocolObject<dyn MTLTexture>>` に変わり、
`drop_callback` 引数も増えている。

### wgpu 25 スパイクの実行

```
$ cargo run --bin h1_import_spike
[h1] built SyntheticNv12Buffer surface_id=13 8x8
[h1] adapter: AdapterInfo { name: "Apple M4", ..., backend: Metal }
[h1] import_nv12_iosurface_textures: OK (zero-copy IOSurface import succeeded)
[h1] readback centre pixel actual=[255, 161, 111] expected=[255, 161, 111]
[h1] H1 VERDICT: SUPPORTED (import + render + readback all matched within tolerance 2)
```

**`src/lib.rs`（import 経路本体）は 24 版と byte 単位で完全一致。**
`diff nv12-wgpu24-spike/src/lib.rs nv12-wgpu25-spike/src/lib.rs` が空。
つまり `metal`/`objc` を使う import 経路は 25 で**一切変更が要らない**。

変更が要ったのはスパイクの device 設定と readback だけ:

- `Adapter::request_device` が引数 1 個に（第 2 引数の trace path が消えた）
- `DeviceDescriptor` に `trace: wgpu::Trace` フィールドが追加
- `wgpu::Maintain` が廃止され `Device::poll(wgpu::PollType::Wait)` が `Result` を返す

## 結論

**H3 は棄却。上げ先は wgpu 25 とする。**

- wgpu 25 は `metal`/`objc` のままなので、`nv12/import.rs` は
  [H1](h1-hal-import-path.md) が特定した 1 行（`as_hal` の戻り値変更に伴う
  `.flatten()` 削除）以外に手を入れる必要がない。実測で pixel 完全一致。
- wgpu 30 は Metal バインディングが `objc2` 系に総取り替えされており、
  `nv12/import.rs` の
  `IOSurfaceTextureExt`（`objc::msg_send!` による
  `newTextureWithDescriptor:iosurface:plane:`）、
  `plane_texture_descriptor`（`metal::TextureDescriptor`）、
  `texture_from_raw` の呼び出しをすべて objc2 で書き直す必要がある。
  移植計画で最大のリスクと位置づけたファイルを、最も大きく書き換える選択になる。
- Windows の透過に必要なのは **wgpu-hal 25.0.2 以降**
  （[dx12-alpha-real-hardware.md](../../windows_port_research/notes/dx12-alpha-real-hardware.md)）。
  25 で要件を満たす。

**30 を選ぶ理由が今のところ無い。** Windows 側で 30 でしか得られない機能は
`VisualFromWndHandle` だが、これは Phase 0 の実測
（[sustained-present.md](../../windows_port_research/notes/sustained-present.md)）で
child window 方式が破綻しないと確定したため、退避案として不要になった。

## 次の一手 / 未検証事項

- **wgpu 30 での import 経路は「書き直しが要る」と判定しただけで、
  「書き直せば動くか」は未検証。** 将来 30 以降へ上げる必要が出たら、
  objc2 版のスパイクを別途立てて確かめること。
- 25 スパイクは H1 と同じ 8x8 単色 1 パターンのみ。production の NV12 テスト 9 件
  （グラデーション、キャッシュ再利用、BT.601 / full range など）は未移植。
  Phase 4 の実作業でそのまま移植して通すこと。
- `native-wgpu-renderer` / `native-overlay` 本体の 0.20 → 25 昇格そのものは未着手。
  `Surface` / `RenderPass` 周りの破壊的変更は Windows プローブ側で
  30 についてしか棚卸ししておらず、25 での差分は未確認。
