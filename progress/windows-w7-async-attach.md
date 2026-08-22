# W7 Option B: attach_native_overlay 非同期化（stage 1-2、Rust側）

## Decision

- napi-rs の非同期化手法は新規検証不要と判断した。`native-overlay/src/lib.rs`
  には既に `prepareNativeOverlaySources`（beachball対策Fix 2）が
  `napi::bindgen_prelude::AsyncTask<T: napi::Task>` パターンで
  libuv threadpool worker への処理委譲を実現しており、macOS
  `cargo test`（101 passed）で継続的にgreenであることが動作実証済みの
  前例となっている。よって「tiny scratch async fn」の新規作成・削除は
  省略し、この既存パターンをそのまま `attach_native_overlay` へ適用する
  方針を採った（`napi = "3.9.2"`, `napi-derive = "3.5.6"`。実際に
  ビルドされたのは napi 3.9.4 / napi-derive 3.5.7、Cargo.toml のバージョン
  指定に収まる範囲）。
- `attach_native_overlay`（旧: `pub fn` で同期実行、Electron main process/JS
  スレッドを最大約89秒ブロック）を `pub fn ... -> napi::Result<AsyncTask<AttachNativeOverlayTask>>`
  へ変更した。重い処理（DComp window/device/visual作成 + wgpuレンダラ構築
  ＝DXCパイプラインコンパイルの本体）は `AttachNativeOverlayTask::compute`
  （libuv threadpool worker スレッド）で実行し、`resolve`（JSスレッドへ
  戻ってから呼ばれる）で最終レスポンスを組み立てる。
- **SetWinEventHook のスレッド/メッセージポンプ契約（設計判断）**:
  `windows-w5-attach-hang.md`（H-1棄却）で確認済みのとおりDirectComposition
  呼び出し自体（ウィンドウ作成含む）はメッセージポンプの無いスレッドでも
  動作する。一方 `SetWinEventHook(..., WINEVENT_OUTOFCONTEXT)`
  （`win32_overlay.rs::register_geometry_resync_hook`、W6 geometry resync）は
  登録したスレッドがメッセージポンプを持つことを要求する。worker スレッドに
  ポンプは無いため、**hook登録だけを`compute`から切り離し、`resolve`
  （JS/Electron mainスレッド、Chromiumのメッセージポンプ上）で実行する**
  設計にした。
  - `win32_overlay::attach_overlay_window` は変更後、ウィンドウ/DComp
    デバイス/visual作成のみを行い、hook登録を行わない（コメントで理由を明記）。
  - 新設 `win32_overlay::register_overlay_geometry_hook(native_window_handle, overlay_hwnd, contract)`
    を `AttachNativeOverlayTask::resolve` から呼ぶ。失敗しても attach 自体は
    継続する（従来と同じフォールバック方針）。
  - `attach_native_overlay_compute`（worker側、旧`attach_native_overlay_inner`を
    分割・置換）は Windows 成功時に `AttachNativeOverlayOutcome::NeedsWindowsGeometryHook`
    （owner の native window handle・overlay HWND・contract を保持）を返し、
    `finish_attach_native_overlay`（JS側）が hook 登録とレスポンス確定を行う。
    macOS・失敗ケースは `AttachNativeOverlayOutcome::Done` でこの時点のレスポンスが
    そのまま確定する（macOSは元々hookを使わないため、この分岐は関与しない＝
    挙動変化なし）。
- テスト境界: napi/Node ランタイム外の素の Rust テストバイナリ
  （`native-overlay/tests/win32_overlay_smoke.rs`）から attach を検証できるよう、
  同期版 `attach_native_overlay_sync_for_test`（`compute`→`resolve`を同一
  スレッドで直列実行するだけ）を公開し、smoke test の呼び出しをこちらへ
  置き換えた。挙動は非同期化前の `attach_native_overlay_inner` と完全に同一
  （テスト自体が元々シングルスレッドでメッセージポンプの有無を検証していない
  ため、hook登録スレッドが呼び出しスレッドのままでも無害）。

## Alternatives considered

- **worker スレッドにメッセージポンプを持たせて hook もそこで登録する案**:
  却下。libuv threadpool worker は napi/uv が管理する汎用プールであり、
  専用スレッドを1本立てて`GetMessage`ループを常駐させる設計は
  `detach`時のhook解除・スレッドライフサイクル管理が複雑になり、
  「hook登録だけJS側の既存メッセージポンプ（Electron mainが元々持っている）
  に相乗りする」案よりリスクが高いと判断した。
- **napi 3.x の `pub async fn`（tokio非依存のネイティブasync fn対応）を
  新規に試す案**: 既存コードベースに `AsyncTask` の動作実証済み前例が
  あったため、追加のtiny scratch検証をせずその前例パターンへ揃えた
  （実装の一貫性を優先）。

## Constraints / Gotchas

- `attach_native_overlay` の napi 戻り値型が `NativeOverlayResponse` から
  `napi::Result<AsyncTask<AttachNativeOverlayTask>>` に変わったため、JS側は
  常にPromiseを受け取る契約になる。`electron/nativeOverlayMainBridge.ts` の
  `attachNativeOverlay?: (...) => NativeOverlayResponse | Promise<NativeOverlayResponse>`
  という型と `await addon.attachNativeOverlay(...)` という呼び出しは
  変更前から両対応の設計になっていたため、**TS側の型変更は不要**
  だった（`npx tsc --noEmit` clean を確認）。
- macOS 側の実処理内容（AppKit view attach、contentsScale/opaque再適用の
  タイミング）は一切変更していない。`compute`内で実行されるだけで、
  重さ自体は変わらない（元々高速なため、threadpool往復のオーバーヘッドは
  無視できる想定——mainpc実測はWindows側のみ計画されている）。
- `AttachNativeOverlayOutcome::NeedsWindowsGeometryHook` は
  `#[cfg(target_os = "windows")]` のみに存在するため、macOSビルドでは
  `AttachNativeOverlayOutcome`は実質`Done`単体のenumとして扱われる
  （`#[allow(unreachable_code)]`をターゲット非依存な末尾のDone分岐に付与、
  windowsでは早期returnのため到達しない）。
- 旧 `attach_native_overlay_inner`（napiラッパーの中身そのもの）は削除した。
  `attach_native_overlay_inner_reapplies_opaque_immediately_after_contents_scale`
  という既存テストは関数呼び出しではなく `include_str!("lib.rs")` による
  ソース文字列検索（contents_scale再適用直後にopaque再適用があるか）のため、
  対象コードを`attach_native_overlay_compute`内に一字一句同じ形で保持して
  おり、テスト名は「inner」のままだが実体（文字列検索対象コード）は
  維持されているため無改修でgreen。

## 検証結果（stage 1-2、Rust側のみ、mainpc未実施）

- macOS `cargo test --lib`（native-overlay）: **101 passed / 0 failed**
  （stage開始前のベースラインと同数、リグレッションなし）。
- macOS `cargo check --lib --tests`（native-overlay）: エラーなし
  （既存の未使用関数警告のみ、本変更由来ではない）。
- `cargo check --target x86_64-pc-windows-msvc --tests`（native-overlay）:
  エラーなし（`win32_overlay_smoke.rs`のクロスコンパイルチェック含む）。
- `npx tsc --noEmit`: エラーなし（TS型変更不要と判定した根拠を上記に記録）。
- mainpc実機（DComp attach、SetWinEventHookが実際にJSスレッド/Electron main
  のメッセージポンプ上で機能するか、attachレイテンシが実際に短縮されるか）は
  **本stageでは未実施**。次段階（stage 3: Viewport.tsx状態機械化）と合わせて
  実施する計画。
