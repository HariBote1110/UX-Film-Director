# ベースライン: wgpu 0.20.1 での既存 NV12 テスト結果

## 目的 / 仮説

wgpu 24 移行の実現可能性検証（H1/H2, `h1-hal-import-path.md` /
`h2-native-nv12-texture-format.md`）に先立ち、比較対象となる現行実装
（wgpu 0.20.1）が本当にこのマシン上で正しく動作していることを確認する。

## 環境

- ホスト: Apple M4（arm64）, macOS 26.5.2 (25F84)
- rustc 1.93.0 / cargo 1.93.0
- `native-wgpu-renderer`（`wgpu = "0.20"`, `Cargo.lock` 解決で
  `wgpu-hal 0.21.1`, `metal 0.28.0`, `objc 0.2.4`→実解決 `0.2.7`,
  dev-dependencies に `core-foundation 0.9`）
- 変更なし（このリポジトリの状態そのまま。`git status` clean,
  branch `feature-proxy`）。

## 手順

```
cargo test --manifest-path native-wgpu-renderer/Cargo.toml nv12 -- --test-threads=1
```

## 結果

```
running 9 tests
test tests::live_surface_exposes_nv12_scene_present_boundary ... ok
test tests::nv12_iosurface::compositing_with_rgba_clip_matches_two_rgba_clip_reference ... ok
test tests::nv12_iosurface::gradient_matches_cpu_reference_within_tolerance ... ok
test tests::nv12_iosurface::production_path_mixes_nv12_and_rgba_clips_matching_all_rgba_reference ... ok
test tests::nv12_iosurface::production_path_renders_nv12_only_clip_with_no_rgba_sources_entry ... ok
test tests::nv12_iosurface::production_path_reuses_nv12_texture_cache_across_calls_with_unchanged_revision ... ok
test tests::nv12_iosurface::solid_colour_bt601_video_range_matches_cpu_reference ... ok
test tests::nv12_iosurface::solid_colour_bt709_full_range_matches_cpu_reference ... ok
test tests::nv12_iosurface::unchanged_revision_reuses_imported_plane_textures ... ok

test result: ok. 9 passed; 0 failed; 0 ignored; 0 measured; 37 filtered out; finished in 0.85s
```

（同コマンドは他の統合テストバイナリ7本も走らせるが `nv12` にマッチする
テストはすべて `tests::` 内のこの9件で、他は `0 tests` フィルタ済み。）

## 結論

wgpu 0.20.1 上での NV12 IOSurface zero-copy import・GPU 上 YCbCr→RGB 変換・
RGBA クリップとの混在合成・テクスチャキャッシュ再利用のすべてが、この
実機（Apple M4 / macOS 26.5.2）で問題なく再現することを確認した。この
9 テスト全 pass が、H1/H2 で比較する「現行実装のベースライン」である。

## 次の一手 / 未検証事項

なし（本ノートはベースライン記録のみ）。
