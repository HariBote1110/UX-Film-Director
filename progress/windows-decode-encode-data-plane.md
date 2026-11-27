# decode/encode データプレーンの Windows 対応（Windows Port W3b）

## Decision

- `decode.rs` の `DecodeDataPlaneRing` / `create_decode_data_plane` /
  `write_decode_data_plane` / `release_decode_data_plane` と
  `encode.rs` の `write_encode_shared_frame` を **un-gate** した。
  `cfg(unix)` / `cfg(not(unix))` の分岐を消して単一実装にしている。
  **スタブは 1 つも要らなかった** — すべて W2 の `PosixSharedRing` の上で素直に動いた。
- macOS 専用 VideoToolbox を assert していたテスト 6 件は
  `#[cfg(target_os = "macos")]` で括った。Windows で ffmpeg にフォールバックするのは
  仕様どおりの正しい挙動（ADR-007／計画の非ゴール）なので、コードではなくテストが誤っていた。
- 実機で初めて見えたテスト基盤バグ 5 件は **Windows でスキップせず正しく直した**。
  スキップで逃げると Windows CI を入れる意味が無くなる。

## Constraints / Gotchas

- **テスト基盤バグの 1 件はプロダクションバグだった。**
  `local_media_source_path` が Windows のドライブレター付き `file://` URL を
  `"/C:/Users/..."` として返しており、実際の Windows ファイル API で開けなかった。
  `file:///C:/...`（3 スラッシュ）から `file://` を外すと `/C:/...` が残り、
  先頭の `/` があると `C:` がドライブ接頭辞ではなく通常のパス要素として扱われる。
  `strip_windows_drive_root_slash` で対処。POSIX の絶対パスは
  `is_windows_drive_path` に一致しないので no-op（macOS が 257/0/3 のまま変わらないことで確認）。
- **`local_media_source_path` は `src/lib.rs` と `src/source_frames.rs` に重複している。**
  この重複は W3b 以前から存在していた（`af44e3fe` 時点で両ファイルに 1 つずつ）。
  今回は両方を直したが、メディアパス解析が 2 箇所にあるのは乖離の温床なので、
  いずれ 1 つに寄せるべき。
- `spawn_stdin_sink` の Windows 実装で `more` は使えない。
  `more` はテキストモードで 0x1A を EOF として扱うため、
  バイナリの RGBA フィクスチャが黙って切り詰められる。
  PowerShell の `Stream.CopyTo` を使っている。
- **`mainpc` の `C:\Users\gzabu\UXFD` は W2 より古い状態で放置されていた**
  （`shared-memory-spike` に `cfg(windows)` が 1 つも無かった）。
  実機検証のたびに依存クレートの推移閉包を同期する必要がある。
  同期対象: `rust-backend`, `shared-memory-spike`, `sidecar-protocol`, `rust-core`,
  `golden-harness`, `native-wgpu-renderer`, `reference-renderer`, `decode-spike`。

## 実測

| 項目 | W3 完了時 | W3b 完了時 |
|---|---|---|
| macOS `cargo test` | 257 / 0 / 3 | **257 / 0 / 3**（不変） |
| `cargo check --target x86_64-pc-windows-msvc` | 0 errors | **0 errors** |
| Windows 実機 `cargo test --no-fail-fast` | 205 passed / **29 failed** / 3 ignored | **227 passed / 1 failed / 3 ignored** |

失敗 29 件の内訳（データプレーン 18・macOS 前提 6・テスト基盤 5）は**すべて解消**した。

**残る 1 件**: `decode_request_frame_reads_all_local_video_fixtures_for_preview` が
`perf/heavy-media/20000kbps_60fps.mp4` の不在で panic する。
これは数 GB の gitignore 対象フィクスチャで、`mainpc` には最初から存在しない。
今回の変更とは無関係で、macOS でもフィクスチャを用意しない限り同じように落ちる。
数 GB を SSH で転送するのは今回のスコープ外とした。
