# rust-backend の cfg(unix) 掛け漏れ解消（Windows Port W3）

## Decision

- 5 箇所すべて **スタブではなく un-gate**（Windows でも本当に動かす）で対応した。
  いずれも `uxfd-shared-memory-spike` が unix 限定だったことだけを理由にゲートされており、
  W2 でその前提が消えたためゲートの根拠が残っていない。
- 定義の un-gate だけでは到達不能なままなので、呼び出し側の cfg 分岐スタブも除去した
  （`native_render.rs` の 3 ハンドラ、`native_shared.rs` の 1 ハンドラ）。
  正味 92 行の削除になっている。
- `Cargo.toml` の `uxfd-shared-memory-spike` を
  `[target.'cfg(unix)'.dependencies]` から素の `[dependencies]` へ移した。
  これが無いと Windows からクレート自体が見えない。

## Constraints / Gotchas

- **「Windows ビルドが通る」と「Windows で動く」は別物である。**
  実機テストは **205 passed / 29 failed / 3 ignored**。29 件の内訳:

  | 件数 | 内容 | 扱い |
  |---|---|---|
  | 18 | 通常の ffmpeg decode/encode データプレーン（`decode.rs` の `DecodeDataPlaneRing` / `create_decode_data_plane` / `write_decode_data_plane`、`encode.rs` の `write_encode_shared_frame`）が依然 `cfg(not(unix))` の no-op スタブ | **未着手の実装**。監査の 5 件には含まれておらず、`decode.rs` は 1,300 行超で Phase 3 のスコープ外 |
  | 6 | macOS 専用 VideoToolbox の in-process decode 経路が使われることを assert しているテスト。Windows では正しく ffmpeg へフォールバックしている | テスト側が `cfg(target_os = "macos")` で括られていないだけ |
  | 5 | 既存のテスト基盤バグ。Windows パスのバックスラッシュを JSON リテラルへ未エスケープで埋める（2 件）、stdin シンクに `sh -c` を使う（2 件、Windows に `sh` が無い）、空白入り Windows パスから不正な `file://` URL を組む（1 件） | Windows でビルドが通らなかったため今まで見えていなかった |

- **したがって `Windows_Port_Plan.md` Phase 3 が掲げていたマイルストーン
  「native overlay 以外は Windows で動く。decode/encode は ffmpeg 経路」は達成していない。**
  ffmpeg decode/encode のデータプレーンが Windows で no-op のままだからである。
  達成したのは「ビルドが通り、native render の共有フレーム経路は実機で動く」ところまで。
  W3 が un-gate した 5 箇所を実際に行使する
  `native_render_shared_frame_*` / `native_rendered_*` テストは実機で通っている。

- 実機テストを回して初めて見つかった上記 5 件のテスト基盤バグは、
  Windows CI を入れる前に潰しておかないと恒常的な赤になる。

## 実測

| 項目 | 結果 |
|---|---|
| `cargo check --target x86_64-pc-windows-msvc` | 5 errors → **0 errors** |
| macOS `cargo test` | 257 passed / 0 failed / 3 ignored（変化なし） |
| Windows 実機 `cargo check` | 0 errors |
| Windows 実機 `cargo test --no-fail-fast` | 205 passed / 29 failed / 3 ignored |
