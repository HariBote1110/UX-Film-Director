# wgpu24_nv12_research: ノート索引

新しい順。

- [h3-wgpu25-vs-wgpu30.md](h3-wgpu25-vs-wgpu30.md) —
  H3: wgpu 30 でも hal 経由 import が小さい差分で動く、は**棄却**。
  wgpu-hal 30 は Metal バインディングを `metal`/`objc` から `objc2-metal`/`objc2`
  へ総取り替えしており、`texture_from_raw` が
  `Retained<ProtocolObject<dyn MTLTexture>>` を要求する。対して **wgpu 25 は
  `metal` 0.31 のままで、import 経路のソースは 24 版と byte 単位で完全一致**
  （pixel も完全一致）。**上げ先は 25 と決定**。
- [h2-native-nv12-texture-format.md](h2-native-nv12-texture-format.md) —
  H2: wgpu 24 の `TextureFormat::NV12`/`TEXTURE_FORMAT_NV12` は Metal
  backend では未実装（Vulkan/DX12 限定）。「適用不可」として棄却済み。
- [h1-hal-import-path.md](h1-hal-import-path.md) —
  H1: hal 経由 NV12 IOSurface zero-copy import は wgpu 24.0.5 でも
  動作する（採択）。唯一の破壊的差分は `Device::as_hal` の戻り値が
  `Option<R>` → `R` に変わったこと（`.flatten()` の削除で対応）。
  readback は CPU 参照実装と完全一致。
- [baseline-wgpu020-nv12-tests.md](baseline-wgpu020-nv12-tests.md) —
  ベースライン: 現行 `native-wgpu-renderer`（wgpu 0.20.1）の NV12
  テスト 9 件がこの実機で全 pass することを確認。
