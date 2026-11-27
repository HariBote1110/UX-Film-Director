# Native Overlay: quit時SEGV（geometry resync observerのdangling pointer参照）

## Decision

- **クラッシュ実測**: `~/Library/Logs/DiagnosticReports/` に同一 faulting
  stack（`CrBrowserMain` / `EXC_BAD_ACCESS (SIGSEGV)`）を持つ Electron
  クラッシュが5件連続。共通スタック:
  ```
  libobjc.A.dylib          objc_msgSend
  native-overlay.node      objc::message::send_unverified
  native-overlay.node      uxfd_native_overlay::macos_overlay::resync_child_window_geometry
  CoreFoundation            __CFNOTIFICATIONCENTER_IS_CALLING_OUT_TO_AN_OBSERVER__
  ...
  AppKit                    -[NSWindow _wmWindowTilingStateDidChange]
  ...
  WindowManagement          -[_WMWindow(ServerDrivenProperties) applyAgentPropertySnapshot:]
  ```
- **根本原因**（`native-overlay/src/macos_overlay.rs`）:
  - `register_geometry_resync_observer`（旧: L319-365）は
    `RESYNC_OBSERVER_IVAR_PARENT_VIEW` / `RESYNC_OBSERVER_IVAR_CHILD_WINDOW`
    に `parent_view` / `child_window` の生ポインタを `usize` 化して積むだけで、
    参照先オブジェクトを一切 retain していなかった。
  - `electron/main.ts` の `before-quit` ハンドラ（L541-545, L604-607,
    L649-651）は rustBackendProcess の kill、remote deck server の close、
    `rustScenePlaybackController.stop()` は行うが、native overlay の
    `detach`（＝ `unregister_geometry_resync_observer` を含む）は一度も
    呼んでいない。
  - そのため、アプリ終了時に AppKit が window 階層を破棄する過程
    （`_wmWindowTilingStateDidChange` 経由の内部リオーダー等）で
    `NSWindowDidMoveNotification` / `NSWindowDidResizeNotification` が
    引き続き配送されるが、その時点で observer が指す `child_window`
    （場合によっては `parent_view`）は既に AppKit 側で close/dealloc 済み。
    旧コード（旧: L253-260）は `is_null()` しか見ていなかったため、
    「非 null だが解放済み」のポインタをそのまま `objc_msgSend`
    （`setFrame:display:` 等）に渡し SEGV していた。
- **採用した修正（構造的にdangling参照を不可能にする側を優先）**:
  1. `register_geometry_resync_observer` で `parent_view` / `child_window`
     を明示的に `retain`（observer 生存中はメモリが解放されないことを保証）。
  2. `NSWindowWillCloseNotification` を parent window・child window
     双方に追加登録し、専用セレクタ `invalidateGeometryResyncObserver:`
     （`invalidate_geometry_resync_observer`）で ivar `valid` を `NO` に
     落とす。
  3. `resync_child_window_geometry` は純関数
     `should_perform_geometry_resync(observer_valid, parent_view_ptr,
     child_window_ptr)` を最初に呼び、`false` なら実際の `msg_send` 群
     （geometry 計算・`setFrame:display:`）に一切到達しない。
  4. `unregister_geometry_resync_observer` は `valid=NO` に落としたうえで
     `removeObserver:` し、register で取った retain（parent_view /
     child_window / observer 自体）を対称的に `release` する。
     （observer 自体の release は本修正以前から漏れていた既存リークで、
     ついでに解消した。）
  - これにより「late notification が届く」こと自体は止められないが、
    dangling pointer への `objc_msgSend` は構造的に発生し得なくなる
    （retain によりメモリは常に有効、かつ `valid` フラグにより論理的に
     close 済みの window への書き込みも行わない）。

## Alternatives considered

- **`before-quit` で `detach`（unregister）を呼ぶだけのオーダリング修正**:
  検討したが実装しなかった。タイミング競合（Electron の window 破棄順序、
  複数 window、将来 window 破棄以外の経路で observer が生き残るケース）
  に依存する best-effort に留まり、コールバック自体は安全にならない。
  今回の retain + invalidate だけで dangling 参照を構造的に防げるため、
  `electron/main.ts` への変更は行わなかった（"files you own" の対象では
  あるが、fix genuinely needs it の条件を満たさないと判断）。
- **`resync_child_window_geometry` を `catch_unwind` 等でラップして
  クラッシュを揉み消す**: 明示的に禁止されている（segfault は Rust の
  panic ではなく無効メモリアクセスなので `catch_unwind` では捕捉できない
  上、そもそも根本原因を隠すだけ）。不採用。
- **geometry resync 機能自体を削除**: parent window の移動・リサイズに
  overlay を追従させる目的（`addChildWindow:ordered:` の既定追従を過信
  しないフォールバック、L241-251 のコメント参照）があり、既存テストで
  ピン留めされた挙動のため不採用。

## Constraints / Gotchas

- **テストで直接カバーしている範囲**: `should_perform_geometry_resync`
  の純関数契約（`observer_valid` / ポインタ0値の組み合わせ4パターン）と、
  `register_geometry_resync_observer` が retain・
  `NSWindowWillCloseNotification` を含むことのソーステキスト契約、
  `unregister_geometry_resync_observer` が対称的に `release` することの
  ソーステキスト契約、`resync_child_window_geometry` 内で
  `should_perform_geometry_resync` の判定が実際の `setFrame:display:`
  より前に位置することのソーステキスト契約。
  （`native-overlay/src/macos_overlay.rs` の
  `geometry_resync_teardown_safety_tests` モジュール。）
- **テストでカバーしていない範囲**: 実際の objc ランタイム上での
  retain/release の refcount 挙動、`NSWindowWillCloseNotification` が
  実機で本当に期待通りのタイミングで届くこと、そして本来の SEGV
  そのものの再現。これらはこのクレートの `cargo test` では検証できず
  （実 AppKit オブジェクトを alloc/init して close させるテストハーネスが
  無い）、実機 E2E（`npm run test:realistic-heavy-edit:e2e`）実行後に
  `~/Library/Logs/DiagnosticReports/` へ新規 `Electron-*.ips` が出現しない
  ことでのみ確認できる。
- **残るリスク**: retain により「論理的に close 済みだがメモリは生きて
  いる」window オブジェクトへ、`valid` フラグが立っている間（=
  `NSWindowWillCloseNotification` が届く前）に late notification が来た
  場合、`setFrame:display:` 等は実行されてしまう。この場合でもメモリは
  retain 済みで有効なので SEGV はしないが、既に画面から外れた window へ
  無害な geometry 書き込みが発生する可能性はゼロではない
  （クラッシュではなく無害な no-op 相当の見込みだが未検証）。
- `unregister_geometry_resync_observer` は既存にあった「observer 自体を
  一度も `release` していない」リークも今回ついでに解消した
  （register/unregister が対称的な `alloc`/`init` → `release` になる）。
