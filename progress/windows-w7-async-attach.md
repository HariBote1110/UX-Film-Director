# W7 Option B: attach_native_overlay 非同期化（stage 1-2、Rust側 / stage 3、Viewport.tsx側）

## Decision（stage 1-2、Rust側）

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

## Stage 3（本セクション）: Viewport.tsx interim-presenter 状態機械

### Decision

- `src/utils/nativeOverlayAttachLifecycle.ts` に React 非依存の純粋な
  オーケストレーション（`createNativeOverlayAttachLifecycle`）を新設した。
  状態は `'presenter' | 'attaching' | 'overlay'` の3値。`generation` カウンタ
  で「最新の `runAttach()` 呼び出しだけが状態遷移に反映される」契約を実装し、
  `cancel()` 以降はどんな世代の resolve も無視して直ちに `'presenter'` に戻す。
  この層だけで以下の5パターンを DOM/React 環境なしで直接ユニットテスト
  できる（`nativeOverlayAttachLifecycle.test.ts`、6件）:
  1. 成功（`presenter → attaching → overlay`）
  2. 失敗（`presenter → attaching → presenter`、`onAttachFailed` 経由で
     呼び出し元が `console.error` する。**自動リトライはしない**——次に
     attach rect が実際に変化したときの `attach()` 呼び出しで初めて
     再試行される、既存の rect-key dedupe と同じ設計を踏襲）
  3. pending 中の `cancel()`（unmount/トグルOFF）— 以降その attach が
     resolve しても無視される
  4. `runAttach()` の連続呼び出し（resize連打・トグルの往復）— 最後に
     呼ばれた世代の結果だけが反映される
  5. 即時 resolve（macOS相当）でも `attaching → overlay` のシーケンス自体は
     変わらない（所要時間が短いだけで分岐はプラットフォーム非依存の
     共通コードのため、設計上自明であることをテストで固定した）
- `Viewport.tsx` に `nativeOverlayLifecycleState`（useState、上記3値）と
  派生値 `nativeOverlayReady = nativeOverlayLifecycleState === 'overlay'` を
  追加した。attach effect（旧: rect差分検出→`window.nativeOverlay.attach()`を
  直接呼ぶだけ）を `createNativeOverlayAttachLifecycle` 経由に書き換え、
  cleanup（unmount・`nativeOverlayPreviewEnabled` トグルOFF両方が通る同じ
  経路）で必ず `cancel()` を呼ぶ。
- **call site 監査**: `grep -n nativeOverlayPreviewEnabled src/components/Viewport.tsx`
  で洗い出した19箇所（定義1・コメント3を除く実コード15箇所）を、
  「設定値そのもの（機能が有効かどうか、attachライフサイクル自体を
  起動するかどうか）」と「フレームごとの描画ルーティング判定（overlay に
  present してよいか）」の2種類に分類し直した:
  - **設定値のまま**（`nativeOverlayPreviewEnabled`、変更なし）: attach effect
    の起動ゲート（旧774→現795）とその deps（旧855→現907）、objects.length
    空検出 effect（旧971/975→現1023/1027）、projectId 切替 effect
    （旧980/983→現1032/1035）。いずれも「attachライフサイクルや透明clearを
    走らせるかどうか」であり、attach完了状態とは独立の判断。
  - **`nativeOverlayReady` へ置換**（8箇所、attach完了済みかどうかで
    presenter/overlay のどちらへフレームを送るかを決める箇所）:
    `publishSharedRendererPreviewSession` 内の native reuse 再生時刻判定
    （旧1209→現1261）、空シーンpresent判定（旧1243→現1295）、選択デコレーション
    quad 計算（旧1254→現1306）、native overlay direct/native-render-only
    ルーティング分岐×3（旧1411/1412/1425/1463→現1464/1465/1478/1516）、
    presenter再起動時の`nativeOverlayDirectSceneEligible`算出（旧1969→現2022）、
    presenter起動後のtransparent clear判定（旧2039→現2092）、
    `SceneSelectionDecorationLayer`へのprop（旧2641→現2694、コンポーネント
    自体は無改修——prop名`nativeOverlayPreviewEnabled`はそのまま、渡す値だけ
    `nativeOverlayReady`にした）。
  - 副次的に発見した既存の依存配列漏れ（本stageの変更とは無関係の
    pre-existing gap）: `publishSharedRendererPreviewSession`の
    `useCallback`依存配列（現1604-1617）は元から`nativeOverlayPreviewEnabled`を
    含んでいたため`nativeOverlayReady`へ置換するだけで済んだが、
    presenter再起動`useCallback`の依存配列（現2210付近）は
    `nativeOverlayPreviewEnabled`自体が最初から入っておらず、参照先が
    ほぼ固定値だったため実害は小さかった潜在的staleness bugだった。
    `nativeOverlayReady`は1セッション中に値が変わる派生値のため、
    今回`nativeOverlayReady`を新規追加し正しくした（本stageで導入した
    値についてのみ修正、他の既存漏れの網羅的監査はスコープ外）。
- **既存の失敗時フォールバック機構との関係**: `publishSharedRendererPreviewSession`
  の native overlay 経路（`prepareSharedRendererViewportNativeOverlayPresent`
  等）は元々 `result.ok === false` のとき presenter 再起動
  （`setSharedRendererPreviewSession(session)`）へフォールバックする設計が
  既にあった。これは「overlayへのpresentが失敗した」場合のフォールバックで
  あり、本stageが導入した`nativeOverlayReady`ゲートは「そもそもoverlayが
  attach完了していない間はpresent自体を試みない」という一段前の防御。
  両者は独立に効き、互いを置き換えるものではない。

### Alternatives considered

- **`SceneSelectionDecorationLayer.tsx`自体の内部ロジック改修**: 見送った。
  同コンポーネントは `nativeOverlayPreviewEnabled` prop を受け取って
  独自の分岐（SVGデコレーション描画 vs overlay quad送信）を持つが、
  今回はViewport.tsx側で渡す値を`nativeOverlayReady`に変えるだけで
  「attach完了まではSVGデコレーション、完了後はoverlay quad」という
  望む挙動が得られる（prop名の意味論が「overlayに送ってよいか」という
  より正確なものになった）。コンポーネント本体は無改修のためリグレッション
  リスクを追加しない。
- **状態機械をReducerパターン（`useReducer`+イベント型）で実装**: 見送った。
  `createNativeOverlayAttachLifecycle`が実質的に同じ責務（状態遷移の
  一元管理、副作用の分離）を果たしており、Reactに依存しない分テストが
  軽量になるため、こちらを採用した。

### 検証結果

- `npx tsc --noEmit`: エラーなし。
- `npx vitest run`: **256 files / 1856 tests、全green**（stage開始前ベース
  ライン255/1850から、新規`nativeOverlayAttachLifecycle.test.ts`
  1ファイル・6テストの純増のみ）。
- 副次的な発見と修正: `src/utils/nativeOverlayCrateBoundary.test.ts`が
  `native-overlay/src/lib.rs`中の`std::panic::catch_unwind`（完全修飾形）の
  存在をソース文字列検査していたが、stage 1-2で削除した旧
  `attach_native_overlay_inner`ラッパーがその完全修飾呼び出しの唯一の
  出現箇所だったため、stage 1-2コミット時点で気づかず壊していた
  （stage 1-2ではRust側の`cargo test`/`tsc`のみ実行し`vitest run`を
  実行していなかったための見落とし）。`AttachNativeOverlayTask::compute`内の
  `catch_unwind`呼び出しを`std::panic::catch_unwind`に修飾し直し解消
  （native-overlay/src/lib.rs、1行修正）。`src/utils/viewportRustVideoOnlyBoundary.test.ts`
  も、本stageで意図的に`nativeOverlayPreviewEnabled`→`nativeOverlayReady`へ
  改名した3箇所のルーティング分岐文字列と、attach effectの条件式が
  `if (!nativeOverlayPreviewEnabled) return;`から`if (!nativeOverlayPreviewEnabled) {`
  （設定OFF時に明示的に`'presenter'`へ戻す分岐を追加したため）へ変わった点を
  反映して更新した（いずれも意図した設計変更の反映であり、リグレッションではない）。
- macOS `cargo test --lib`（native-overlay）: **101 passed / 0 failed**
  （ベースライン維持、上記1行修正を含めた状態で再確認）。
- mainpc実機検証は本stageでも未実施（stage 4以降で計画）。
