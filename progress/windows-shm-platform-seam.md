# shared-memory-spike のプラットフォーム seam（Windows Port W2）

## Decision

- `PosixSharedRing` の**型名は変えない**。`rust-backend` / `native-wgpu-renderer` /
  `shared-video-frame-bridge` が既に参照しており、改名するとこの seam の外へ波及するため。
  Windows では中身が named file mapping になるが、公開された振る舞いは変わらない。
- POSIX 経路は **1 行も書き換えない**。`#[cfg(unix)]` で囲うだけにした。
  差分は 321 行の追加のみ、削除ゼロ。リングバッファのアトミック制御（1,120 行の大半）も無傷。
- 命名規約はプラットフォーム別に分離した。POSIX は `PSHMNAMLEN = 31`、
  Windows は `Local\` 名前空間 + MAX_PATH(260)。片方の規約をもう片方へ押し付けない。

## Alternatives considered

- **`PosixSharedRing` を `SharedRing` へ改名**: 却下。下流 3 クレートの改修が要り、
  W2 の「1 クレートで閉じる」という切り分けが壊れる。
- **Windows でも POSIX と同じ「名前が残っていたら unlink して作り直す」挙動を再現する**: 却下。
  そもそも再現する対象が存在しない（下記）。

## Constraints / Gotchas

- **Windows の named mapping には POSIX 的な「リークした名前」状態が存在しない。**
  参照カウント式のカーネルオブジェクトで、プロセスがクラッシュしても全ハンドルが閉じれば
  OS が破棄する。したがって `shm_unlink` + リトライで回収する状況が原理的に起きない。
  `CreateFileMappingW` が `ERROR_ALREADY_EXISTS` を返したら、それは**生きている別の所有者が
  本当に同じ名前を握っている**ということなので、fail-fast させる。
  POSIX 側の「クラッシュした所有者から回収する」テストは `#[cfg(unix)]` に限定した。
- `MapViewOfFile` の失敗処理では、**`CloseHandle` より先に `last_os_error()` を退避する**こと。
  逆順にすると `CloseHandle` が last error を上書きして原因が消える。
- `loom` テストは POSIX 依存ではなかった（実機で 6/6 pass）。計画で「未確認」としていた点が解消。
- **`mainpc`（Windows 検証機）に FFmpeg 9.0 を winget で入れた。** 本クレートのテスト 2 件が
  `decode-spike` 経由で ffmpeg を要求するため。共有マシンへの永続的な変更である。
  なお **Windows Port Plan Phase 1 の「ffmpeg を同梱するか明示エラーにするか」という
  設計課題は未解決**で、これは検証ホストを動かしただけ。
- `mainpc` の SSH セッションは winget が行った PATH 変更をセッション内で拾わない
  （sshd から継承した古い環境ブロックのため）。同じ PowerShell 呼び出しの中で
  `$env:PATH` へ前置きして回避する。

## 実測

| 環境 | 結果 |
|---|---|
| macOS（変更前ベースライン） | 23 passed / 0 failed |
| macOS（変更後） | 23 passed / 0 failed |
| `cargo check --target x86_64-pc-windows-msvc` | エラー 0 / 警告 0 |
| Windows 実機（`mainpc`, rustc 1.98.0） | 23 passed / 0 failed |

**この seam が開いた結果、`native-wgpu-renderer` と `native-overlay` は
無改造で Windows 向けクロスチェックを通過するようになった（いずれもエラー 0）。**
残るビルドブロッカーは `rust-backend` の `cfg(unix)` 掛け漏れ 5 箇所のみで、
これは監査ノートの予測と完全に一致している。
