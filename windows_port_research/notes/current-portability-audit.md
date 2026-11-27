# Windows 移植可能性の現状棚卸し（cargo check ベース）

## 目的 / 仮説

「今のコードベースを Windows 向けにビルドしようとしたとき、実際に何が壊れるのか」を
コード読解の印象ではなく **コンパイラの出力** で確定させる。

- H-1: Windows ビルドの支配的なブロッカーは macOS 専用の映像 I/O
  （VideoToolbox / IOSurface / AppKit）である。
- H-2: POSIX 共有メモリ（`shared-memory-spike`）も壊れるが、副次的な問題である。

棄却条件: 上記以外のクレート（GPU レンダラ本体、napi addon）が大量のエラーを出したら
「seam が機能していない」＝H-1/H-2 とは別の構造問題があると判断する。

## 環境

- ホスト: 開発機 macOS (Apple M4, aarch64-apple-darwin)
- rustc 1.93.0 (254b59607 2026-01-19) / cargo 1.93.0
- 対象 target: `x86_64-pc-windows-msvc`（本調査で `rustup target add` して追加）
- リポジトリ: branch `feature-proxy` @ 5f078554（作業ツリーはクリーン）
- 計測日: 2026-08-22

`cargo check` は **型検査のみでリンクしない**。したがって「MSVC リンカで実際に
リンクできるか」「実行時に動くか」は本ノートの射程外。

## 手順

各クレートは独立した `Cargo.toml`（ワークスペースではない）なので個別に叩く。

```bash
rustup target add x86_64-pc-windows-msvc
for c in rust-core sidecar-protocol golden-harness reference-renderer \
         shared-memory-spike shared-video-frame-bridge \
         native-wgpu-renderer rust-backend native-overlay; do
  cargo check --target x86_64-pc-windows-msvc --manifest-path $c/Cargo.toml
done
```

第2ラウンドでは `shared-memory-spike/src/lib.rs` の先頭に
`#[cfg(windows)] mod libc { pub use ::libc::*; /* 欠損 9 シンボルのダミー */ }`
を一時挿入し、shm 起因の連鎖エラーを取り除いた状態で下流を再計測した
（計測後 `git checkout --` で復元済み。この shim はコミットしていない）。

## 結果

### ラウンド1: 素の状態

| クレート | exit | error 数 | 原因 |
|---|---|---|---|
| rust-core | 0 | 0 | — |
| sidecar-protocol | 0 | 0 | — |
| golden-harness | 0 | 0 | — |
| reference-renderer | 0 | 0 | — |
| shared-memory-spike | 101 | 11 | POSIX shm |
| shared-video-frame-bridge | 101 | 11 | 上の連鎖 |
| native-wgpu-renderer | 101 | 11 | 上の連鎖 |
| rust-backend | 101 | 11 | 上の連鎖 |
| native-overlay | 101 | 11 | 上の連鎖 |

**下流 4 クレートのエラーはすべて `uxfd-shared-memory-spike` のコンパイル失敗ひとつに
帰着した**（`could not compile 'uxfd-shared-memory-spike'` 以外の失敗クレートなし）。

欠損シンボルは `shared-memory-spike/src/lib.rs` の 1 ファイルに閉じた 9 個:
`shm_open`(2), `shm_unlink`(2), `ftruncate`, `mmap`, `munmap`,
`PROT_READ`, `PROT_WRITE`, `MAP_SHARED`, `MAP_FAILED`。

### ラウンド2: shm を stub 化した状態

| クレート | exit | error 数 |
|---|---|---|
| shared-memory-spike | 0 | 0 |
| shared-video-frame-bridge | 0 | 0 |
| **native-wgpu-renderer** | **0** | **0** |
| **native-overlay** | **0** | **0** |
| rust-backend | 101 | 5 |

`rust-backend` に残った 5 件はすべて **`cfg(unix)` ゲートの掛け漏れ**（unix 限定で
定義した関数・フィールドを無条件に参照している）であり、Windows 固有 API の不足では
ない:

| 箇所 | 症状 |
|---|---|
| `src/native_render.rs:7` | `cpu_simple_video::try_render_simple_video_frame{,_to_shared_ring}` が unix 限定 |
| `src/main.rs:32` | `source_frames::collect_native_render_sources{,_content_revisions}` が unix 限定 |
| `src/encode.rs:143` | `BackendState::native_render_outputs` フィールドが unix 限定 |
| `src/native_render.rs:1038` | `load_cached_getcolor_sample_frame` が configured out |
| `src/source_frames.rs:86` | `media_content_revision` が configured out |

## 結論

- **H-1 は棄却。** macOS 専用の映像 I/O は `#[cfg(not(target_os = "macos"))]` の
  stub がすでに全経路に入っており（`nv12/import_stub.rs`、`inprocess_decode::stub`、
  `attach_live_overlay_surface_renderer` の Err 版、`resolve_video_sources` の Err 版
  など）、**コンパイルは一切妨げていない**。
- **H-2 を採用、かつ格上げ。** POSIX 共有メモリが唯一かつ支配的なビルドブロッカー。
  1 ファイル・9 シンボルで、その上に GPU レンダラと napi addon 全体が乗っている。
- 想定外の収穫: `native-wgpu-renderer` と `native-overlay`（napi addon 本体、6,628 行）が
  shm を通した時点で **無改造で Windows 向けに型検査を通過した**。wgpu 0.20 が DX12/Vulkan を
  持つため、レンダラ本体は移植作業の対象ではない。
- ただし「型検査が通る」＝「動く」ではない。`attach_native_overlay` は Windows では
  必ず `Err("Native overlay live surface is only available on macOS.")` を返すので、
  **ビルドは通るがオーバーレイは起動しない**（既存の WebGPU presenter fallback に落ちる想定）。

## macOS 専用コードの規模（Windows 版を書き起こす必要がある量）

| 対象 | 行数 | Windows 側の対応候補 |
|---|---|---|
| `native-overlay/src/macos_overlay.rs`（AppKit child NSWindow 合成） | 1,172 | HWND child window + DirectComposition |
| `macos-video-decode`（VideoToolbox decode） | 698 | Media Foundation / D3D11VA、または ffmpeg 経路のまま |
| `macos-video-encode`（VideoToolbox encode） | 299 | Media Foundation、または ffmpeg 経路のまま |
| `native-wgpu-renderer/src/nv12/{import,sys}.rs`（IOSurface zero-copy import） | 234 | DXGI shared NV12 texture（wgpu の `TextureFormat::NV12` は DX12 で実装済み） |
| `macos-coreml-tracker`（Swift, 物体追跡） | 470 | 同等品なし。IPC 側で `supported: false` 済み |
| `shared-memory-spike/src/lib.rs`（POSIX shm ring） | 1,120（うち OS 依存は 9 呼び出し） | `CreateFileMapping` / `MapViewOfFile` |

## 次の一手 / 未検証事項

1. `shared-memory-spike` に `SharedRing` trait 相当の seam を切り、Windows 実装
   （named file mapping）を足す。ここが開くと下流 4 クレート全部が開く。
2. `rust-backend` の `cfg(unix)` 掛け漏れ 5 箇所を塞ぐ。
3. 上記2つの後に **リンクまで通るか**（MSVC リンカ、`napi-build`、wgpu の DX12 backend）を
   実測する。`cargo check` では検出できない。
4. Electron/electron-builder 側は未調査部分あり: `package.json` の `build` に `win`
   ターゲットが無い、ffmpeg が PATH 依存（`/opt/homebrew/bin` を先に見る）。
5. Windows 実機・実 GPU での起動 smoke は未実施。
