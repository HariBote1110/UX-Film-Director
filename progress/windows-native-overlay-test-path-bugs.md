# native-overlay Windows固有テスト2件の修正（W5フォローアップ）

## Decision

- W5 実機テスト（`progress/windows-w5-native-overlay.md`、84 passed / 2
  failed）で見つかった以下 2 件を修正した。どちらもプロダクションコードの
  バグではなく、テストコード自身が Windows 形状の入力（バックスラッシュ
  区切り・ドライブレター・埋め込みスペース）を誤って組み立てていた
  テストインフラのバグと判明した。`progress/windows-cfg-unix-gaps.md`
  （W3）が記録した既知のバグ分類（Windows パスの未エスケープ埋め込み・
  不正な `file://` URL 組み立て）と同一クラス。
- `overlay_image_source_loaders_accept_percent_encoded_jpeg_file_urls`
  （`native-overlay/src/lib.rs`）: `file://` URL を
  `path.to_string_lossy().replace(' ', "%20")` で手組みしており、POSIX の
  絶対パス（先頭が `/`）を前提にしていた。Windows パス（`C:\Users\...`）は
  先頭が `/` でなくバックスラッシュ区切りのため、本番の
  `local_media_source_path`（`rust-backend`）が要求する
  「scheme 直後は `/` で始まる」という契約を満たせず reject されていた。
  本番側（`strip_windows_drive_root_slash`、W3b 由来）は
  `file:///C:/Users/...` 形式を既に正しくデコードできるため、
  テスト側に `path_to_percent_encoded_file_url` ヘルパーを新設し
  （バックスラッシュ→スラッシュ変換＋先頭スラッシュ補完＋スペースの
  パーセントエンコード）、実際のクライアント（Electron の
  `pathToFileURL` 相当）が組む形の URL を作るよう修正した。
- `getcolor_source_image_metadata_changes_native_overlay_media_revision`
  （同ファイル）: `source_image.display()` の結果をエスケープせず
  `format!` で JSON リテラルへ直接埋めていた。Windows パスの
  バックスラッシュ（`\U`, `\S` 等）は不正な JSON エスケープシーケンスに
  なり、`serde_json::from_str` によるパースが失敗する（本番の
  `hash_getcolor_source_image_metadata` は `serde_json::Value` で正しく
  パースしており、こちらもバグなし）。テスト側に
  `path_to_json_string_literal`（`serde_json::to_string` 経由でエスケープ
  した JSON 文字列リテラルを返す）ヘルパーを新設し修正した。
- 両ヘルパーとも純粋関数（OS 依存 API を使わない文字列操作のみ）である
  ため、Windows 形状の合成入力（ドライブレター付きパス）を渡した
  regression テストを macOS 上に追加できた
  （`path_to_percent_encoded_file_url_handles_windows_drive_paths`、
  `getcolor_source_json_embeds_windows_paths_as_valid_json`）。
  `local_media_source_path` 側の Windows ドライブパス処理（
  `is_windows_drive_path`/`strip_windows_drive_root_slash`）自体も
  プラットフォーム非依存な純粋関数であることを確認済み
  （`rust-backend/src/lib.rs`・`source_frames.rs`、W3b で既に修正済み）。

## Alternatives considered

- 本番の `local_media_source_path` 側を変更する案は不採用。既に
  `file:///C:/...` を正しくデコードできており、テストが本番と異なる
  （壊れた）URL 組み立てロジックを使っていただけだったため。

## Constraints / Gotchas

- `native-overlay` と `rust-backend` の両方に `local_media_source_path`
  のほぼ同一実装が存在する（`rust-backend/src/lib.rs` の public 版と
  `source_frames.rs` の `pub(crate)` 版）。W3b で言及された重複の
  smell がそのまま残っている。native-overlay は `rust-backend/src/lib.rs`
  の public 版を `use uxfd_rust_backend::local_media_source_path` で
  再利用しており、今回の修正はどちらの実装にも触れていない
  （テストコードのみの修正のため、この重複自体は本タスクのスコープ外
  として維持）。
- `native-overlay/src/lib.rs` の `rust-backend` 側 lib-test に
  `decode_request_frame_reads_all_local_video_fixtures_for_preview` の
  失敗が既存であるが、これはこのワークツリーに
  `perf/heavy-media/20000kbps_60fps.mp4` フィクスチャが存在しないことに
  よるもので、本タスクの変更とは無関係（未着手のまま）。

## 実測

| 項目 | 結果 |
|---|---|
| macOS `cargo test`（native-overlay） | 99 passed → **101 passed / 0 failed**（+2、新規固定テスト分） |
| macOS `cargo test`（rust-backend、ヘビーフィクスチャ欠如の1件を除く） | 変化なし・green |
| `cargo check --target x86_64-pc-windows-msvc --tests`（native-overlay） | 0 errors |

**実機（mainpc）での `cargo test --release`（native-overlay）再実行は
W7 stage 2 に委譲**（本セッションは mainpc 上で 24 時間安定性ベンチを
実行中のため触れられない制約があった）。W7 stage 2 で確認すべきこと:
上記 2 テストが実機で `ok` になること、および他のテストへの影響が
ないこと（84 passed / 2 failed → 86 passed / 0 failed になっているはず）。
