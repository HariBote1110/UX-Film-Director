# Windows 移植研究ノート索引

macOS-first（ADR-001）で作った現行実装を Windows へ運ぶ道筋を、印象ではなく実測で
詰める研究。新しいものを上に置く。1行1ノート。

- [cametallayer-equivalent-and-alpha.md](cametallayer-equivalent-and-alpha.md) — CAMetalLayer の Windows 相当は IDCompositionVisual で、wgpu 0.20 に `SurfaceTargetUnsafe::CompositionVisual` の入口も既にある（仮説H-2棄却）。**ただし wgpu-hal の dx12 backend が `composite_alpha_modes` を Opaque のみ広告し `map_acomposite_alpha_mode` が `DXGI_ALPHA_MODE_IGNORE` を直返しするため、wgpu 経由では透過 overlay が作れない**（wgpu-hal 24.0.4 でも同様＝バージョン上げでは直らない）。しかも `choose_live_surface_alpha_mode` が Opaque へ黙って fallback するのでエラーにならず無言の見た目バグになる。overlay surface の入口 `from_appkit_view` は macOS 専用、`from_surface` は cfg なしで再利用可能（2026-08-22）
- [current-portability-audit.md](current-portability-audit.md) — `cargo check --target x86_64-pc-windows-msvc` による現状棚卸し。唯一のビルドブロッカーは `shared-memory-spike` の POSIX shm 9 シンボル（1ファイル）で、下流4クレートのエラーはすべてその連鎖と確定。shm を stub 化すると `native-wgpu-renderer` と `native-overlay`（6,628行のnapi addon）は**無改造で型検査通過**、残るのは `rust-backend` の `cfg(unix)` 掛け漏れ5箇所のみ。macOS専用 stub は全経路に既設でコンパイルを妨げていなかった（仮説H-1棄却）。リンク・実行時は未検証（2026-08-22）
