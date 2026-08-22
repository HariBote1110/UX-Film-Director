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

## Stage 4: Option C — native-wgpu-renderer の format-aware 遅延パイプライン構築

### Decision

- `native-wgpu-renderer/src/lib.rs`を読み、`bgra_pipeline`/`nv12_bgra_pipeline`
  （Bgra8UnormSrgb版のuber-shaderパイプライン2本）の実際の使用箇所を
  `grep`で洗い出した結果、**w7-attach-cost-mitigation.mdのOption C節が
  想定していた前提（「live surfaceの構成フォーマット次第でRgba/Bgra
  どちらかが本当に使われる」）とは異なる構造**であることが判明した:
  - `bgra_pipeline`/`nv12_bgra_pipeline`を実際に参照する唯一のメソッドは
    `render_frame_to_bgra_iosurface_with_audio_reactive_sources`
    （`NativeWgpuRenderer`にのみ生えている、BGRA IOSurface export専用
    ——macOSのAVFoundation連携動画exportが呼ぶ、IOSurfaceはmacOS限定機能）。
  - `NativeWgpuLiveSurfaceRenderer::from_surface`（native-overlayのlive
    attach経路が呼ぶ、Windows/macOS共通のコンストラクタ）は内部で
    `core: NativeWgpuRenderer`を構築するが、`core`は**privateフィールド**
    であり、`NativeWgpuLiveSurfaceRenderer`自体はBGRA IOSurface exportの
    メソッドを一切公開していない。したがって**live attach経路で構築された
    レンダラのbgra_pipeline/nv12_bgra_pipelineは、live surfaceが選んだ
    フォーマット（`choose_live_surface_format`の戻り値、`pipeline`/
    `nv12_pipeline`が使う）が何であれ、セッション中一度も到達し得ない
    完全な死重**（研究ノートの想定と異なり「フォーマット次第でどちらかが
    ホット」という二者択一の構図自体が live 経路には存在しない）。
  - `NativeWgpuRenderer::new`（`rust-backend/src/native_render.rs`が呼ぶ
    オフスクリーンexport/サムネイル生成経路、`native-wgpu-renderer`内の
    テストでも54箇所以上で使われる汎用コンストラクタ）についても、
    BGRA IOSurface exportを実際に使う呼び出しはごく一部（動画export時の
    特定経路のみ）で、大多数の呼び出しはRGBA経路しか使わない。
  - この発見により、「format-aware」な遅延化は実質的に
    **「live surfaceのフォーマットに関わらず常にBgra版2本を遅延する」**
    という単純な形に帰着した（研究ノートが想定した「configuredでない方の
    フォーマットを遅延する」判定ロジック自体が不要——Bgra版はどちらの
    コンストラクタでも「configuredでない方」に常に該当する）。
- `bgra_pipeline`/`nv12_bgra_pipeline`フィールドを`wgpu::RenderPipeline`から
  `std::sync::OnceLock<wgpu::RenderPipeline>`へ変更し、`from_surface`・
  `NativeWgpuRenderer::new`の両コンストラクタで即時構築せず`OnceLock::new()`
  のまま残すようにした。専用アクセサ`bgra_pipeline(&self)`/
  `nv12_bgra_pipeline(&self)`（`OnceLock::get_or_init`）を新設し、唯一の
  呼び出し元`render_frame_to_bgra_iosurface_with_audio_reactive_sources`
  内の`&self.bgra_pipeline`/`&self.nv12_bgra_pipeline`をこのアクセサ経由に
  差し替えた。
- **スレッド安全性**: 呼び出し元メソッドは`&self`（`&mut self`ではない、
  `render_frame_to_bgra_iosurface_with_audio_reactive_sources`のシグネチャ
  参照）のため、単純な`Option<wgpu::RenderPipeline>`＋`&mut self`ラッパーは
  使えない。`OnceLock`は`&self`のみで内部可変性による遅延初期化ができ、
  複数スレッドから同時に`get_or_init`が呼ばれても初期化処理は1回しか
  実行されない（std保証）契約を素直に使える。`wgpu::RenderPipeline`は
  `Send + Sync`（wgpu全体がそう設計されている）なので`OnceLock<T: Send + Sync>`も
  問題なく`Sync`になり、既存の呼び出し規約（`NativeWgpuLiveSurfaceRenderer`は
  `LIVE_OVERLAY_RENDERERS`のMutex越しにアクセスされる契約、`NativeWgpuRenderer`
  は主に単一スレッドから呼ばれる）を変える必要はなかった。
- **who-uses-which-format finding（上記Decisionの要約）**: live surfaceの
  attach経路にとってBgra版2本は「configuredでない方」ではなく「そもそも
  到達不能」。offscreen export経路にとっては「ほとんどの呼び出しで未使用、
  BGRA IOSurface export呼び出し時にのみ必要」。いずれの場合も遅延構築で
  安全かつ有効。

### 期待されるattach時間短縮（見積り、stage5実測まで正式値ではない）

`windows_port_research/notes/nv12-pipeline-compile-time.md`（DXC導入後、mainpc実測）:

| 項目 | 中央値 |
|---|---|
| nv12単体パイプライン | 52.42秒 |
| solid単体パイプライン | 7.51秒 |

`w7-attach-cost-mitigation.md`が記録した「4本のuber-shader版（solid×2,
nv12×2）を単純合算すると2×7.51+2×52.42=119.9秒になり実測79.09秒（stage2実測は
88.77秒）と矛盾する」逆算不一致は未解決のまま（同一device内の複数pipeline
連続生成で何らかの再利用が効いている可能性、"次の一手"として記録済み）
——したがって**この見積りは上限側の粗い概算であり、正確な短縮量はmainpc実測
（stage5）でしか確定できないことを正直に記録する**。

- 単純合算ベースの上限見積り: Bgra版2本（solid Bgra + nv12 Bgra）を除外
  すると、理論上の最大短縮は `7.51 + 52.42 = 59.93秒`（4本合算119.9秒中
  ちょうど半分）。
- 実測ベース（stage2の88.77秒中央値、bgra版込みの実測値）から逆算する
  保守的な見積り: 4本合算が実測79.09〜88.77秒の範囲に収まっている
  （何らかの再利用効果を含む）とすれば、Bgra版2本の除外による短縮は
  この範囲の**半分未満**（uber-shader分の合算比率がRgba版2本:Bgra版2本で
  概ね対称と仮定した場合、25〜44秒程度）に留まる可能性が高い。
- **正式な数値はstage5でmainpc実測（DXCあり、Bgra版除外後の実際のattach
  レイテンシを3回計測し中央値を取る）によって確定する。** 本ノートの
  見積り（25〜60秒程度の短縮）はあくまで既知の単体実測値からの機械的な
  上限/下限計算であり、実測ではない。

### Alternatives considered

- **surface_formatを見て動的にRgba/Bgraのどちらを遅延するか切り替える
  判定ロジック**: 見送った。上記Decisionの調査で、live attach経路に
  とってBgra版2本は常に到達不能（surface_formatが何であれ関係ない）
  ことが判明したため、条件分岐を導入する意味がない。もし将来
  `NativeWgpuLiveSurfaceRenderer`がBGRA IOSurface exportへの参照経路を
  獲得した場合（現状は無い）、その時点で本当に動的判定が必要になるかを
  再評価すればよい。
- **`Mutex<Option<wgpu::RenderPipeline>>`での遅延化**: 見送った。
  `OnceLock`の方が「一度構築されたら二度と書き換わらない」契約を型で
  表現でき、`&self`のみで完結し、呼び出しごとにロックを取る
  オーバーヘッドも無い（`OnceLock::get_or_init`は初期化後は単なる
  atomic load 相当）。

### 検証結果

- macOS `cargo test`（native-wgpu-renderer、lib + 全integration test）:
  **lib 54 passed / 0 failed**（新規4件——`bgra_pipelines_are_not_built_at_construction`、
  `bgra_pipelines_build_lazily_on_first_use_and_are_reused`、
  `first_bgra_iosurface_export_call_builds_pipelines_once_and_renders_correctly`、
  既存の`steady_state_export_frame_does_not_take_the_upload_fence`は無改修で
  green）含む、ベースラインから純増）。
  `native_reference_parity.rs`: **37 passed / 0 failed**（無改修、退行なし）。
  `bgra_iosurface_target.rs`（実IOSurfaceへの実ピクセル色検証、
  `renders_scene_directly_into_bgra_iosurface_without_readback`他）:
  **2 passed / 0 failed**（Option C適用後もBgra版パイプラインが正しく
  レンダリングすることを実ピクセル比較で確認——「初回使用時に正しく
  レンダリングされる」要件の実質的な担保）。他の全integration test
  （`overlay_surface_parity`・`shared_frame_output`・`shm_decoded_frame_render`・
  `export_round_trip`等）も無改修で green。
- macOS `cargo test`（native-overlay）: **101 passed / 0 failed**
  （stage1-3から無変化、native-wgpu-renderer変更の影響なし）。
- `cargo check --target x86_64-pc-windows-msvc --tests`
  （native-wgpu-renderer・native-overlay両方）: エラーなし
  （既存の未使用関数警告のみ、本変更由来ではない）。
- `npx tsc --noEmit`: エラーなし（TS側は無改修）。
- `npx vitest run`: **256 files / 1856 tests、全green**
  （stage3終了時点のベースラインから無変化、TS側は無改修のため）。
