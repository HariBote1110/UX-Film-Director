# wgpu 0.20 → 25 昇格（Windows 移植 Phase 4）

## Decision

- **上げ先は 25。** 30 ではない。根拠は
  `wgpu24_nv12_research/notes/h3-wgpu25-vs-wgpu30.md`。
  wgpu-hal 30 は Metal バインディングを `metal`/`objc` から `objc2-metal`/`objc2` へ
  総取り替えしており、`texture_from_raw` が
  `Retained<ProtocolObject<dyn MTLTexture>>` を要求する。
  移植計画で最大リスクと位置づけた `nv12/import.rs` を最も大きく書き換える選択になる。
  25 は `metal` 0.31 のままで、import 経路は **無変更**で通った。
- 合格条件は「移行前後でテスト数が完全一致すること」。実測で一致した。
- 非推奨エイリアス（`ImageCopyTexture` など）は 25 でまだ残っているが、
  将来消えるので**この移行のうちに改名した**。

## Alternatives considered

- **30 へ上げる**: 却下。30 でしか得られないのは `VisualFromWndHandle` だが、
  Phase 0 の実測（`windows_port_research/notes/sustained-present.md`）で
  child window 方式が破綻しないと確定したため、退避案として不要になった。
- **非推奨エイリアスを残す**: 却下。25 で 13 件の deprecation warning が出る。
  次に上げるときに必ず踏むので、まとめて潰した。

## 実測

移行前後で完全一致（macOS / Apple M4）:

| クレート | passed | failed | ignored |
|---|---|---|---|
| native-wgpu-renderer | 97 | 0 | 1 |
| native-overlay | 99 | 0 | 0 |
| rust-backend | 257 | 0 | 3 |
| rust-core | 116 | 0 | 0 |

parity ゲートも通過:

- `overlay_surface_parity`: overlay surface が export readback と一致
- `native_reference_parity`: 37 件の画素レベル effect 比較が CPU 参照と一致
- `export_round_trip`: BT.709 YUV420 / H.264 444 の往復
- NV12 IOSurface ゼロコピー import（lib テスト内）

napi addon もビルド・ロードとも成功（`capabilities.available = true`）。

## 実際に必要だった変更

| 変更 | 箇所 |
|---|---|
| `request_adapter` が `Option` → `Result`（`ok_or` → `map_err`） | 2 |
| `request_device` が引数 1 個へ。`DeviceDescriptor` に `memory_hints` / `trace` | 3 |
| `wgpu::Maintain` 廃止 → `Device::poll(PollType::Wait)` が `Result` を返す | 3 |
| `VertexState` / `FragmentState` の `entry_point` が `Option<&str>` へ | 24 |
| `RenderPipelineDescriptor` に `cache` フィールド追加 | 12 |
| `Device::as_hal` の戻り値が `Option<R>` → `R`（`.flatten()` 削除） | 2 |
| `ImageCopy*` / `ImageDataLayout` → `TexelCopy*` へ改名 | 13 |
| `metal` 0.28 → 0.31 | 2 crate |

## Constraints / Gotchas

- **`native-overlay` が `metal = "0.28.0"` を直接固定しており、wgpu-hal 25 が引く
  0.31 と重複クレートになっていた。** 揃えるまで `cargo tree` に
  `metal v0.28.0` と `metal v0.31.0` が両方出る。重複したままでも
  ビルド自体は通ってしまうので気付きにくい。次に wgpu を上げるときも
  `cargo tree -e normal | grep metal` で単一版であることを確認すること。
- `objc2-metal` が依存グラフに出るが、これは `macos-video-decode` /
  `macos-video-encode` が使う `objc2-av-foundation` → `objc2-core-video` 経由で、
  wgpu とは無関係。混同しないこと。
- **30 固有だった破壊的変更は 25 では発生しない。**
  `PipelineLayoutDescriptor.push_constant_ranges` → `immediate_size`、
  `multiview` → `multiview_mask`、`get_current_texture` の enum 化はいずれも
  30 の変更で、25 は現行と同一。Windows プローブ（wgpu 30 で書いた）の
  棚卸しをそのまま 25 の作業見積りに使うと過大評価になる。
- **`rust-backend` の `inprocess_decode_integration` が、全テストバイナリ並行実行時に
  1 度だけ落ちた**（4 回の全体実行のうち 1 回）。単独実行では通り、
  再実行 2 回も 257 全通過。ffmpeg と VideoToolbox セッションを起動する
  テストで、wgpu には触れない経路。リソース競合のフレークと見ているが、
  **移行前から存在したことは確認していない**。
