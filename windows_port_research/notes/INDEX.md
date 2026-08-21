# Windows 移植研究ノート索引

macOS-first（ADR-001）で作った現行実装を Windows へ運ぶ道筋を、印象ではなく実測で
詰める研究。新しいものを上に置く。1行1ノート。

- [current-portability-audit.md](current-portability-audit.md) — `cargo check --target x86_64-pc-windows-msvc` による現状棚卸し。唯一のビルドブロッカーは `shared-memory-spike` の POSIX shm 9 シンボル（1ファイル）で、下流4クレートのエラーはすべてその連鎖と確定。shm を stub 化すると `native-wgpu-renderer` と `native-overlay`（6,628行のnapi addon）は**無改造で型検査通過**、残るのは `rust-backend` の `cfg(unix)` 掛け漏れ5箇所のみ。macOS専用 stub は全経路に既設でコンパイルを妨げていなかった（仮説H-1棄却）。リンク・実行時は未検証（2026-08-22）
