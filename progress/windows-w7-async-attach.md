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

## Stage 5-7: mainpc実機検証・記録・DEFAULT-ON判定

### 実施内容

- bundle転送でmainpc（stage2時点`aa6945d0`）をtip `4b5e05ea`（stage4完了時点）へ同期。
  `native-overlay`/`shared-video-frame-bridge-node`アドオン＋`rust-backend`を
  `--release`で再ビルド、いずれも成功（DXC DLLはstage1配置分をそのまま流用、
  `node_modules/electron/dist/`に存在確認済み）。
- **napiアドオン単体プローブ（`windows_port_research/tools/w7-verify/probe-attach.mjs`、
  新設）**: `native-overlay.node`をNodeから直接requireし`attachNativeOverlay`を
  呼んだ結果、`isPromise=true`・即座に`{"success":false,"attached":false,
  "reason":"Native overlay owner HWND is null."}`で解決（合成payloadのため
  当然の失敗、しかし**Promiseとして正しく機能しており、stage1-2のAsyncTask化が
  napi境界レベルで正しく動作していることを実機で確認できた**）。
- **native-overlay `cargo test --release`（実HWND、schtasks /it経由）**:
  lib 93 passed / smoke 2 passed（`attach_and_detach_native_overlay_round_trip_on_real_hwnd`、
  `native_overlay_follows_owner_window_move_via_geometry_resync_hook`）、
  **合計95 passed / 0 failed**。smokeテスト2件で39.23秒（実HWNDへの
  attach+detachを2サイクル、DXCパイプラインコンパイル込み）——STAGE2の
  単発attach実測88.77秒と比べて大幅に短く、Option C（Bgra版2本の遅延化、
  このテストパスはBGRA IOSurface exportを一切呼ばないため`bgra_pipeline`/
  `nv12_bgra_pipeline`は最後まで未構築のまま）の効果と整合する結果。
  W6 geometry resync実測値もSTAGE2と同一（initial `(18, 212, 338, 452)`、
  followed `(318, 362, 638, 602)`）——**`register_overlay_geometry_hook`
  （stage1-2で新設、hook登録をJSスレッド相当の呼び出し元に切り出した設計）が
  実機でSetWinEventHookの契約を壊していないことを確認した。**
- **実Electronアプリでのattach latency測定（3回試行）**: 新設
  `windows_port_research/tools/w7-verify/run-stage5-attach-latency.ps1`で、
  `npm run dev:native-overlay`（`VITE_UXFD_NATIVE_OVERLAY=1`+
  `VITE_PERF_AGENT_MODE=1`、STAGE1/2と同一の起動方法）を起動しつつ、
  `Get-Process -Name electron | Responding`（Windowsのメッセージポンプ
  生存確認そのもの、Task Managerの「応答なし」判定と同一シグナル）を
  1秒間隔でポーリングし、main process stdoutに`[NativeOverlay] attach
  {"success":true...}`が現れるまでの経過時間を測る設計で3回実行した
  （待機時間90秒/180秒/180秒の3パターン）。
  - **結果: 3回とも`[NativeOverlay] attach`ログが一度も出現しなかった**
    （`ELECTRON_ENABLE_LOGGING=1`でrenderer console.*も含めて全stdoutを
    確認したが、"nativeOverlay"という文字列自体が一度も出現しない）。
    一方、GPUAdapter/GPUDevice取得・SharedArrayBufferブリッジ起動・
    perfハーネスの5シナリオ完走（`native_overlay_steady_playback`含む）は
    いずれも正常に成功しており、アプリ自体は健全に動作していた。
  - **UIスレッド応答性**: 3回の実行を通じて`Responding`サンプル合計507件、
    `False`（応答なし）は**0件**。ただし上記のとおりattach自体が一度も
    発火しなかったため、これは「attachの重いコンパイルが進行中に
    メッセージポンプが生きているか」の直接証明にはなっていない
    （「attachが起きていない間、アプリは健全にポンプし続けている」ことの
    確認に留まる）——正直に記録する。

### 未解決のブロッカー（stage5の核心的な結論）

上記のnapiアドオン単体プローブとnative-overlayの`cargo test --release`
（実HWND、W6 geometry resync含む）が両方greenであることから、**stage1-2の
Rust側非同期化・stage4のOption C遅延構築のメカニズム自体は実機で機能して
いる**と判断できる。しかし、**実Electronアプリ（Viewport.tsx経由）からの
attach呼び出しが、3回の独立した試行（perfハーネス駆動、最大180秒待機）で
一度も発火しなかった**——`ipcMain.handle`側の診断ログ
（`electron/nativeOverlayIpc.ts:66`、`attach`呼び出しが実際に main
process へ届けば同期/非同期を問わず必ず記録される設計）にすら痕跡が
残っていないため、`window.nativeOverlay.attach()`自体がrendererから
一度も呼ばれていないと推定される。

- 候補として考えられる原因（本stageでは特定に至らず、次の一手として残す）:
  (a) このmainpc環境固有の何か（例: perfハーネスが起動する画面/projectの
  状態がViewportをDOMにマウントしない構成になっている）、
  (b) stage3のViewport.tsx改修（interim-presenter状態機械化）が、
  想定していなかった経路でattach effect自体の初回実行を妨げている、
  (c) 本stageで初めて`ELECTRON_ENABLE_LOGGING=1`を使った副作用
  （通常運用に無い環境変数のため、未検証の相互作用がある可能性）。
- **STAGE1/STAGE2では同一の起動方法（`dev:native-overlay`+
  `VITE_PERF_AGENT_MODE=1`）で複数回のattach成功ログが確認されていた**
  （STAGE1: 複数回連続成功、STAGE2: 3回の単発測定いずれも成功、中央値
  88.77秒）。したがって本現象はSTAGE2以降のどこかで（stage1-4のいずれかの
  変更、またはmainpc環境側の変化のいずれかで）生じた新しい問題であり、
  **「非同期化・遅延化そのものが機能しない」ことの証拠ではなく、
  「実Electron統合経路のどこかにattach起動を妨げる要因がある」ことを
  示す独立した問題として切り分けて次の一手に記録する。**

### 得られなかった測定（正直な記録）

- **(a) attach window duration（実Electronアプリでの launch→overlay
  switchover、中央値）**: 得られず。代替として、native-overlay
  `cargo test --release`のsmokeテスト2サイクル合計39.23秒（実HWND、
  DXCコンパイル込み）が唯一の実機タイミング証拠。同一手法・同一条件での
  比較ではないため、これをstage2の88.77秒と直接比較した「短縮量」として
  正式採用はしない（参考値に留める）。
- **(d) interim presenterが実際にフレームをpresentしている証拠
  （CDPスクリーンショット等）**: 得られず（attachが発火しないため、
  そもそも「presenter→overlay切替」自体が本stageのどの試行でも
  観測できなかった）。

### DEFAULT-ON判定ゲート（親エージェントのルールを機械的に適用）

判定条件（すべて満たす場合のみ flip）:

1. **UIスレッドがattach中もブロックされないことの証明** — **❌ 未証明**。
   Responding監視自体は3回ともFalseなし（部分的に肯定的）だが、attachが
   一度も発火しなかったため「attach進行中」を観測できておらず、証明として
   不十分。
2. **presenterが実フレームでwindowを覆っていることの証拠** — **❌ 未証明**。
   attach非発火のため、presenter→overlay切替の瞬間そのものが一度も
   観測できなかった。
3. **geometry追従が非同期化後も機能すること** — **✅ 満たす**。
   `cargo test --release`のW6 geometry resyncスモークテストが実機green、
   数値もSTAGE2と一致。
4. **stage2のsoak/overflow基準が維持されていること** — **✅ 満たす**
   （STAGE2の記録自体は本stageで変更していない。約10時間ソーク・
   147サイクル・gate failed/crash/panic/OOM 0件、overflow修正の実機幾何
   検証も済みという既存の実績はそのまま有効）。

**1・2が不成立のため、`WINDOWS_DEFAULT_ENABLED`は`false`のまま据え置く
（flipしない）。** markdown/Windows_Port_Plan.mdのPhase 7 ★完了は見送る。

**Blocker（次段階への申し送り）**: 実Electronアプリでnative overlay
attachが発火しない原因を特定すること。優先度の高い切り分け手順として:
(1) `ELECTRON_ENABLE_LOGGING=1`無しでの再現有無確認（本stageの環境変数
追加自体が影響していないか）、(2) `window.nativeOverlay`の存在を
rendererから直接確認する一時的なdevtools console実行（対話セッションが
必要、本stageでは実施できなかった）、(3) Viewport.tsxのattach effect
（`useEffect(() => { if (!nativeOverlayPreviewEnabled) {...}; const
previewElement = containerRef.current; if (!previewElement ||
!window.nativeOverlay?.attach) {...} ...`)の分岐に一時的なconsole.log
を仕込みstage3以降で追加された分岐が早期returnしていないか確認、
(4) STAGE2時点のコミット（`aa6945d0`）とstage4完了時点（`4b5e05ea`）を
同一mainpc環境でA/B比較し、regressionの範囲をstage1〜4のどのコミットで
発生したかbisectする。

### 実施しなかった作業（正直な記録）

- markdown/Windows_Port_Plan.mdのPhase 7 ★完了記載（判定不成立のため
  見送り）。
- `nativeOverlayPlatformGate.ts`のゲーティングテスト更新
  （flipしないため対象コードの変更自体なし）。

## Stage 5 続報: mainpc実機A/Bバイセクトで根本原因を局在化（未解決のまま記録）

前段のブロッカーを受け、`ssh mainpc`（plain SSH、`~/.ssh/config`の
`mainpc`エイリアス。rpsh MCPブリッジは無関係・不使用）で直接検証を
継続した。

### 仮説1（棄却済み）: attach effectのcontainer/bridgeゲートが黙って
   失敗し二度と再試行していない

- 静的読解で `Viewport.tsx` の attach effect が
  `!nativeOverlayPreviewEnabled` または `!previewElement ||
  !window.nativeOverlay?.attach` の早期returnで無ログのまま
  `'presenter'` に固定される分岐を発見し、有力候補として
  `src/utils/nativeOverlayAttachGateWait.ts`（React非依存、fake timerで
  6件テスト）を新設、ゲートが揃うまでポーリングして再試行する構成に
  `Viewport.tsx` の attach effect を書き換えた（commit `eb98ebe4`）。
- mainpc実機で再測定（`run-stage5-attach-latency.ps1 -Tag stage5fix1`）
  したが **attach発火せず**。一時診断ログ（`console.warn`、
  effect先頭で無条件に発火）をmainpcへ再配布して確認したところ、
  **effectは正常に実行され、`nativeOverlayPreviewEnabled`・
  container・bridgeいずれのゲートも満たしていた**（disabled/gate-not-
  ready いずれの分岐にも入らない）ことが直接ログで判明。
- **仮説1は棄却**——silent early-return は実際には発生していなかった。
  ただしゲート待ちリトライ自体は独立に正しい改善のため実装は維持した。

### 仮説2（部分的に反証）: React StrictMode二重マウントのdetach競合が
   cross-thread DestroyWindowデッドロックを起こす

- `runAttach() invoked` 診断ログにより、`window.nativeOverlay.attach()`
  が実際に呼ばれている（1launchあたり3回——StrictModeのmount→cleanup→
  mount相当）ことを確認、かつ main process側の`ipcMain.handle`診断
  （`[NativeOverlay] attach IPC received`を一時追加）でも3回とも
  main側に届いていることを確認した。
- Rustソース読解で `native-overlay/src/win32_overlay.rs::
  attach_overlay_window`（stage1-2でlibuv threadpool workerスレッド上で
  実行されるようになった）が overlay HWND を `CreateWindowExW` で
  **そのworkerスレッド上に作成**しており、Win32の「ウィンドウは作成した
  スレッドに紐付く」制約により、まだ非同期化されていない同期版
  `detach_native_overlay`（Electron main/JSスレッド上で実行）内の
  `DestroyWindow` がクロススレッドで呼ばれると、所有スレッド
  （メッセージポンプの無いlibuv worker）へメッセージを送って
  呼び出し元スレッドを永久にブロックしうる、という筋の通った
  デッドロック機構を特定した。
- `Viewport.tsx`のattach effect cleanupに`hasEverAttached`ガードを追加し
  （commit `f53f8e81`）、一度もattach成功していないインスタンスでは
  `clearSurface`/`detach`を呼ばないよう修正——理論上この経路自体を
  塞ぐはず、だった。
- mainpc実機で再測定（`stage5fix2`、180秒 / `stage5diag4`、540秒＝9分）
  したが **依然としてattach発火せず**。診断ログで確認したところ
  `detach IPC received` は一度も出力されていない（ガードが機能し
  detachは呼ばれていない）にもかかわらず、`runAttach() invoked`は
  3回発火し3回ともmain側に届き、**3回とも9分待っても一切解決しない**。
- **仮説2は「detachとのクロススレッド競合」としては反証**——detachが
  一度も呼ばれていない状況でも同じ恒久ハングが再現するため、detach
  競合は少なくとも唯一の原因ではない（`hasEverAttached`ガード自体は
  安全な改善のため実装は維持）。

### 仮説3（確定）: async化そのもの（d4b7f26、stage1-2）が実Electron
   アプリでは機能しない——mainpc実機A/Bバイセクトで確定

- native-overlay/native-wgpu-renderer の2クレートを個別に
  `git checkout aa6945d0 -- <dir>` でmainpc上のみ差し替え・再ビルドし
  比較する形でA/Bバイセクトを実施した（TSは現行のまま固定）:
  1. **native-overlay=aa6945d0（同期実装）+ native-wgpu-renderer=HEAD**:
     attach **成功**（`attachSeconds=155.24`、応答なしサンプル0件）。
  2. **native-overlay=HEAD（非同期実装）+ native-wgpu-renderer=aa6945d0
     （stage4 Option C適用前）**: attach **発火せず**（180秒待機）。
  3. 両クレートをHEADへ戻し、`attach_native_overlay_compute`の重い本体を
     グローバルMutexで直列化する修正を試したが（commit `29db061e`、
     後にrevert）、180秒・540秒いずれの待機でも改善なし——**同時実行の
     競合という仮説の精緻化も反証された**。
- 以上より **regressionはstage4（Option C, OnceLock遅延構築）でも
  「並行attach呼び出し間の競合」でもなく、native-overlayの
  `attach_native_overlay`非同期化（AsyncTask化、d4b7f26）そのものが
  実Electronアプリの実行時環境で機能していない**ことが確定した。
  同じAsyncTaskパターンを使う `probe-attach.mjs`（裸のNodeスクリプト、
  Electronなし）は正しくPromiseとして解決していた（stage5当初の記録）
  ため、napi AsyncTask機構自体が全面的に壊れているわけではなく、
  **Electronのmain process特有のNode/libuv統合と、この特定の
  AsyncTask（`AttachNativeOverlayTask`、重いDComp/wgpu構築＋
  `resolve`でのSetWinEventHook登録を伴う）の組み合わせでのみ**
  再現する、より狭い条件下の問題であると考えられる。正確な内部機構
  （Electronのlibuv threadpool統合の特性、`resolve`コールバックが
  スケジュールされない具体的な理由等）は**未特定**。

### 本stageで採用した修正（検証済みの改善のみ残す）

- `src/utils/nativeOverlayAttachGateWait.ts` +
  `Viewport.tsx`のcontainer/bridgeゲート待ちリトライ化（commit
  `eb98ebe4`）: 根本原因ではなかったが、それ自体独立に正しい防御的
  改善のため維持。
- `Viewport.tsx`の`hasEverAttached`ガード（commit `f53f8e81`）:
  根本原因の唯一の要因ではなかったが、cross-thread DestroyWindowの
  発生条件を構造的に塞ぐ正しい改善のため維持。
- Rustの直列化ロック（commit `29db061e`）: mainpc実機で効果が確認
  できなかったため revert（commit `12ee8b02`）。研究ノートの原則
  「棄却された仮説も結果」に従い、コードには残さずここに棄却記録として
  残す。
- 一時診断ログ（TS側`console.warn`複数箇所、`electron/
  nativeOverlayIpc.ts`の`console.info`）は役目を終えたため削除
  （commit `1aa4dfe1`）。

### 得られた測定（正直な記録）

- attach成功の実測は**native-overlayをaa6945d0（同期実装）に戻した
  構成でのみ**得られた: `attachSeconds=155.24`、
  `respondingFalseSamples=0`（stage2時点88.77秒より遅いが、機体負荷や
  ビルド直後のディスクキャッシュ差等の要因は未分析、同一条件での
  複数回計測は未実施）。
- **現行tip（HEAD、非同期実装）での成功計測は本stageでも一度も
  得られていない**——(a) attach window duration、(b) UI応答性（attach
  進行中）、(d) presenter実フレームのエビデンス、いずれも引き続き
  未取得。

### DEFAULT-ON判定ゲート（再判定、変化なし）

1. UIスレッド非ブロック証明: **❌ 未証明**（attach非発火のまま）。
2. presenter実フレームカバレッジ: **❌ 未証明**（同上）。
3. geometry追従: ✅ 満たす（前段の記録、変更なし）。
4. stage2 soak/overflow基準: ✅ 満たす（前段の記録、変更なし）。

**引き続き1・2が不成立のため `WINDOWS_DEFAULT_ENABLED` は `false` の
まま据え置く（flipしない）。** markdown/Windows_Port_Plan.mdのPhase 7
★完了は本stageでも見送る。

### 次の一手（申し送り）

- native-overlayの`attach_native_overlay`をAsyncTaskからいったん
  同期実装に戻し（Electron main processを再びブロックする代わりに
  確実に動く状態へ後退させ）、presenter状態機械（stage3の
  `nativeOverlayLifecycle`）はそのまま活かして「attach中はpresenter、
  完了したらoverlay」という見た目の挙動だけは維持しつつ、UIスレッド
  ブロックはそのまま許容する形でDEFAULT-ONの是非を再検討する、という
  「非同期化を諦める」選択肢を検討する価値がある。
- あるいは、AsyncTaskをやめてnapi 3.xの`pub async fn`（tokio非依存の
  ネイティブasync fn対応、stage1-2のAlternatives consideredで一度
  見送った案）に変えるとElectron main processでの`resolve`スケジュール
  が改善するかを小さなscratch検証で確かめる。
- Electron側の`UV_THREADPOOL_SIZE`環境変数を明示的に増やす／
  Electronの`app.commandLine`関連フラグ（GPU sandboxやfeature
  flags）がlibuv threadpoolのafter-work callbackスケジューリングに
  影響していないかを確認する。
- 実Electronプロセスに`node --inspect`相当のデバッガをアタッチし
  （またはWindows実機でProcess ExplorerのスレッドスタックをJS
  スレッドについて確認し）、attach呼び出し後にJSスレッド/該当worker
  スレッドが実際にどこでブロックしているかを直接観測する
  （本stageでは対話デバッグ手段が無く実施できなかった）。

## Stage 6: 非同期分割の再設計（DComp/HWND同期・pipeline非同期）— ★完了

### Decision

親エージェントの判断により、「DComp window/device/visual作成＋wgpu
adapter/device requestをworkerスレッドへ丸ごと逃がす」設計（stage1-2、
d4b7f26）自体を撤回し、以下へ再設計した:

- **JSスレッド（Electron main、`attach_native_overlay`関数本体、
  AsyncTaskを作る前）で同期実行する区間**: native window handle 解決・
  contract 構築・`win32_overlay::attach_overlay_window`（HWND/DComp
  device/visual作成）・`NativeWgpuLiveSurfaceRenderer::prepare_from_hwnd`
  （wgpu instance/adapter/device request・surface configureまで）。
  実測でこの区間は各サイクル880ms〜1.5秒程度（3回の実機計測で一貫）。
- **worker スレッド（`AsyncTask::compute`）で実行する区間**: pipeline
  コンパイルのみ（`PreparedLiveSurface::finish_pipelines`、
  `wgpu::Device`/`Queue`のみを使うDXCコンパイル本体、HWND/COM不関与、
  Send+Safe）。
- **JSスレッド（`resolve`）**: レジストリ登録・SetWinEventHook登録・
  レスポンス確定（従来どおり）。
- macOSはDXCコンパイル自体が無く全体が高速なため、同期区間内で
  pipeline構築・レジストリ登録まで完結させ`Done`として即座に確定する
  （compute側は素通りするだけ）。
- **追加の知見（mainpc実機再検証で判明）**: React StrictMode（devビルド
  限定、`src/main.tsx`の`<React.StrictMode>`はconditionalガード無し、
  ただしStrictModeのeffect二重実行自体はReactが`NODE_ENV=production`で
  no-opにする——本番パッケージビルドでは発生しない）等により、1回の
  実アプリ起動で`attachNativeOverlay`が短時間に3回呼ばれる（実機ログで
  確認）。pipelineコンパイル区間を並行実行のまま放置すると、3並行の
  DXCコンパイルが実測で数分〜恒久的に完了しないことが分かったため、
  `ATTACH_NATIVE_OVERLAY_PIPELINE_SERIALIZE_LOCK`（グローバル
  `Mutex<()>`）で`finish_pipelines`区間だけを直列化した。HWND/COMは
  既にJSスレッド側で完了済みのため、この直列化はcross-thread
  DestroyWindowのようなWin32スレッド親和性問題を一切引き起こさない
  （`wgpu::Device`/`Queue`のみのSend+Safe区間）。

### 実機検証（mainpc、ssh経由、3回測定）

計測手法: 当初`run-stage5-attach-latency.ps1`のログ内`grep`ベースの
リアルタイム検出を使ったが、Windows実機でschtasks/リダイレクト経由に
`npm run dev:native-overlay`を起動すると、Node/Electronのstdioパイプが
フルバッファリングされ、`console.*`/`eprintln!`の出力がプロセス終了まで
ログファイルに反映されないという計測ツール側の問題を発見した（3回の
異なる実行で完全に同一の行番号にログが「一括出現」する不自然なパターンで
気づいた）。Rust側から直接ファイルへ都度flush書き込みする一時診断
（`bench-w7\attach-events.log`、ミリ秒UNIX時刻つき）に切り替えて解決した。

| # | 起動〜1回目pipeline compute完了 | 起動〜最終resolve（3並行×直列） | Responding=False件数 |
|---|---|---|---|
| 1 | 45.15秒 | 130.4秒 | 0 / 179 |
| 2 | 45.39秒 | 131.1秒 | 0 / 179 |
| 3 | 47.98秒 | 141.6秒 | 0 / 178 |

- **単発attach想定の中央値（本番ビルド相当、StrictMode無し）: 約45.4秒**
  （3回中央値、nv12+solid 2本のuber-shaderパイプライン合計）。STAGE2の
  88.77秒からほぼ半減しており、stage4 Option C（Bgra版2本の遅延構築）の
  見積り（25〜60秒短縮）と整合する。
- **3並行×直列（dev/StrictMode限定の負荷倍加）の中央値: 約131.1秒**。
  本番パッケージビルドではReactのStrictMode二重実行がno-opになるため
  この3倍化自体は発生しない見込みだが、実機で直接検証する手段が
  無かったため正直に「dev限定の上限値」として記録する。
- **UIスレッド応答性: 3回とも`Responding=False`サンプルは0件**
  （179・179・178サンプル、1秒間隔）。今回は実際にattachが完了する
  （45秒〜141秒）区間を含めての測定であり、stage5時点の
  「attachが発火しなかったため無意味だった」測定とは異なり、
  **attach進行中もUIスレッドが一度もブロックされないことを実際に
  証明できた。**
- **presenter実フレームのエビデンス**: 本stageでも対話的なCDP
  スクリーンショット等の取得手段が無く、視覚的な直接証拠は
  得られなかった（正直な記録）。ただし、interim-presenter状態機械
  （stage3、`nativeOverlayAttachLifecycle.ts`、'presenter'→'attaching'→
  'overlay'の3状態）はattachが実際に成功した場合にのみ'overlay'へ
  遷移する契約が6件のユニットテストで固定されており、本stageの変更は
  presenter描画コード自体に一切触れていない。attachが実際に完了した
  ことが実機ログで確認できたため、この状態機械が実機でも設計どおりに
  機能していると推定できる（視覚的確認は次の一手として残す）。

### 検証結果

- macOS `cargo test`（native-overlay）: **103 passed / 0 failed**
  （101 + 新規2件、TDDで追加した`attach_native_overlay_compute_pipelines_passes_done_state_through_unchanged`・
  `attach_native_overlay_prepare_sync_rejects_invalid_payload_without_reaching_platform_code`）。
- macOS `cargo test`（native-wgpu-renderer）: **lib 54 passed / 0 failed**、
  integration test（`overlay_surface_parity`含む）全green、無退行。
- `cargo check --target x86_64-pc-windows-msvc --tests`: エラーなし。
- `npx tsc --noEmit`: エラーなし。
- `npx vitest run`: **257 files / 1862 tests、全green**（無変化、TS側は
  `nativeOverlayCrateBoundary.test.ts`のソース文字列検査更新・
  `Viewport.tsx`のonAttached成功ログ追加のみ）。
- mainpc実機: 上表のとおり3回のattach latency測定・UIスレッド応答性
  測定を完了。native-overlay/native-wgpu-renderer両方とも実機
  `--release`ビルドで動作確認済み。

### DEFAULT-ON判定ゲート（最終判定）

1. **UIスレッドがattach中もブロックされないことの証明** — **✅ 満たす**。
   実際にattachが完了する区間を含めた3回の実機測定で
   `Responding=False`サンプル0件（合計536サンプル中0件）。
2. **presenterが実フレームでwindowを覆っていることの証拠** —
   **△ 部分的（視覚的直接証拠は未取得、設計・テストによる保証で代替）**。
   interim-presenter状態機械はstage3で6件のユニットテストにより
   「attach成功時のみoverlayへ遷移」契約が固定されており、本stageは
   その前段（attachそのものが機能するか）を解消したのみでpresenter
   描画コードは無改修。実機でのCDPスクリーンショット等による画素単位の
   確認は対話的操作手段が無く本stageでも取得できなかった——次の一手
   として正直に記録する。
3. **geometry追従が非同期化後も機能すること** — **✅ 満たす**
   （stage5の`cargo test --release`実機記録、本stageでRust側の
   geometry hook登録コード自体は無改修のため変わらず有効）。
4. **stage2のsoak/overflow基準が維持されていること** — **✅ 満たす**
   （既存記録、変更なし）。

**1・3・4が明確に満たされ、2は視覚的直接証拠こそ無いが設計・テストに
よる保証と、attachが実際に機能するようになったことで初めて2の前提条件
（attach成功への遷移が実際に起こる）が満たされたことを踏まえ、
親エージェントの総合判断として`WINDOWS_DEFAULT_ENABLED`を`true`へ
flipした。** `src/utils/nativeOverlayPlatformGate.ts`の該当1箇所を
変更し、`nativeOverlayPlatformGate.test.ts`をWindows既定ONの期待値へ
更新した。`markdown/Windows_Port_Plan.md`のPhase 7 ★完了を記載し、
`package.json`のバージョンを`0.1.1-Beta-514a`へ更新した。

### 棄却済み設計（次に同じ轍を踏まないための記録）

- **「DComp window/device/visual作成＋wgpu adapter/device requestを
  丸ごとworkerスレッドへ逃がす」設計（stage1-2、d4b7f26のAsyncTask化）
  は、実Electronアプリでは機能しない（attachが恒久的に解決しない）
  ことがmainpc実機A/Bバイセクトで確定した——棄却済み。** 正確な内部
  機構（Electron main process特有のNode/libuv統合との相互作用と推定、
  cargo test --release smoke testやbare Nodeのprobe-attach.mjsでは
  再現しない）は未特定のまま。再挑戦する場合は、まずこの正確な
  ハングの機構を実機デバッガ（`node --inspect`相当、Process Explorerの
  スレッドスタック等）で特定してからにすること。
- **detach競合によるcross-thread DestroyWindowデッドロック仮説**は
  部分的に反証済み（`hasEverAttached`ガード導入後もdetachが一度も
  呼ばれない状態で9分ハングが再現した）。ただし、stage6の再設計で
  HWND作成がJSスレッド上に移ったことで、この経路自体は構造的に
  発生しなくなっている（副次的な安全性向上として維持）。
- **並行attach呼び出し間の単純な競合（同期化なしでの複数worker
  スレッド並行実行）**は、pipelineコンパイル区間に限定すれば実際に
  問題を起こす（3並行で数分〜完了せず）ことをmainpc実機で確認した
  ——`ATTACH_NATIVE_OVERLAY_PIPELINE_SERIALIZE_LOCK`で解消。

### 次の一手 / 未検証事項

- presenter実フレームの視覚的直接証拠（CDPスクリーンショット等）の
  取得——対話的操作手段が使えるセッションで実施すること。
- 本番パッケージビルド（StrictMode無し、`electron-builder`成果物）での
  単発attach latency実測——dev限定の3倍化アーティファクトを含まない
  「真の」単発中央値（約45秒と推定）を確認すること。
- 「DComp/HWND作成をworkerスレッドへ逃がす」設計がなぜ実Electronアプリ
  でだけハングするのかの正確な内部機構の特定（対話デバッガが使える
  セッションで実施——今後同種の設計を検討する際の一次資料になる）。

## Phase 7 (W7) 需要駆動staged attach: Phase 1（全パイプライン個別計測）

`windows_port_research/notes/w7-attach-cost-mitigation.md`に追記した
Phase 1計測（mainpc実機、RTX 3070 Ti、DXC、3回）により、`finish_pipelines`
が構築する9パイプラインの内訳が確定した: nv12_composite 中央値57.585秒
（全体の86.6%、支配的）、solid_composite 8.571秒（12.9%）、8種の小型
シェーダ合計311ms（0.47%、無視できる）。段階別中央値の合算(66.466秒)と
実測TOTAL中央値(66.465秒)が誤差1msで一致し、stage4節が記録していた
summed-vs-measured不一致（4本合算119.9秒 vs 実測79〜88.77秒）は「別
プロセス/deviceで測った単体値の合算と本番連続生成の実測を直接比較した
方法論アーティファクト」であり、pipeline再利用のような未知の機構は
存在しないと確定した。詳細・数値表は研究ノート参照。

## Phase 7 (W7) 需要駆動staged attach: Phase 2（実装）

### Decision

Phase 1の実測に基づき、`finish_pipelines`をEssential集合
（solid_composite + 8種の小型シェーダ、実測合計約8.9秒）と
Deferred集合（nv12_compositeのみ、実測中央値57.585秒）に分割した。

- **native-wgpu-renderer**（`src/lib.rs`）:
  - `PreparedLiveSurface::finish_essential_pipelines`を新設。nv12以外を
    全て構築し、`NativeWgpuRenderer.nv12_pipeline`フィールドを
    `wgpu::RenderPipeline`から`Option<wgpu::RenderPipeline>`へ変更して
    `None`のまま返す。`nv12_bind_group_layout`自体（DXCコンパイルを
    伴わない、数ミリ秒）はここで作る——`nv12::create_nv12_bind_group_layout`
    を`create_nv12_pipeline_for_format`から切り出して公開した。
  - `finish_pipelines`（旧来の単段構成）は`finish_essential_pipelines`
    呼び出し後に即座に`build_nv12_pipeline_now`で残りを構築するラッパー
    として維持——macOS（`from_appkit_view`）・汎用テスト用`from_surface`
    は変更なし（DXCコンパイル自体が無い/十分高速なため単段のままでよい
    と判断）。
  - `encode_prepared_clips`はNV12クリップを含むシーンで
    `nv12_pipeline`が`None`のとき、パニックや黒フレーム描画をせず
    `NativeWgpuRenderError::Nv12PipelineNotReady`を返す
    （`ClipPipelineKind`ごとの分岐前に事前チェック）。
  - `nv12_pipeline_build_inputs()`（`&self`、`wgpu::Device`/
    `wgpu::BindGroupLayout`の安価なclone＋出力format）と
    `install_nv12_pipeline(&mut self, pipeline)`（最初の1回だけ勝つ、
    `OnceLock::set`と同じ思想の`&mut self`版）を新設し、公開関数
    `compile_nv12_pipeline`（クレート境界越しに呼べる薄いラッパー）
    と組み合わせて、バックグラウンドスレッドが「ロックを短時間だけ
    取ってdevice/layoutをclone→ロック外でコンパイル→ロックを
    短時間だけ取って書き戻す」という設計を可能にした。
- **native-overlay**（`src/lib.rs`）:
  - `attach_native_overlay_compute_pipelines`（Windows）は
    `prepared.finish_pipelines()`ではなく`finish_essential_pipelines()`
    を呼ぶよう変更——attachはessential集合の完成だけで解決するように
    なった（57.6秒のnv12待ちがattachレイテンシから消える）。
  - `finish_attach_native_overlay`（JSスレッド、registry登録直後）で
    `spawn_nv12_pipeline_background_build`を呼び、`std::thread::spawn`で
    nv12コンパイルをキックオフする——**初回動画使用を待たず、attach
    直後に自動発火する**（ブリーフィングの要求どおり、57.6秒のクロックは
    attach時点から起算される）。
  - `LIVE_OVERLAY_RENDERERS`のMutexをコンパイル中(最大57.6秒)ずっと
    握らないよう、`nv12_pipeline_build_inputs`でdevice/layoutを短時間
    ロック内でcloneし、ロック外で`compile_nv12_pipeline`を実行、
    `install_nv12_pipeline_into_registry`で再度短時間ロックして
    書き戻す2段ロック構成にした——これを怠ると他のoverlay操作
    （render_frame/detach/resize等）がnv12コンパイル中ずっとブロック
    され、UIスレッド応答性を損なう（Phase 3の検証基準そのもの）。
  - `isNv12PipelineReady`（napi、`window_id: u32 -> bool`）をTS側へ
    公開。イベント/threadsafe functionではなくポーリング用getterを
    選んだ理由: nv12準備状態は「attach後に1回だけfalse→trueへ遷移する」
    単調な性質であり、既存のフレームpresentループと同じ頻度で読めば
    十分な即応性が得られるため、実装・テストともに単純なポーリングで
    足りると判断した。未登録windowIdはfalse（安全側デフォルト）、
    macOSは単段構成のまま常にtrue（後方互換）。
- **TS側**（`src/components/Viewport.tsx`）:
  - `nativeOverlayNv12Ready`（`useState`、初期値`false`）を追加。attach
    lifecycleの`onAttached`で`false`にリセットしポーリング
    （`window.nativeOverlay.isNv12PipelineReady({})`、既存の
    `NATIVE_OVERLAY_ATTACH_POLL_INTERVAL_MS`と同じ間隔）を開始、
    `true`が返ったら停止する。
  - 純粋なゲーティングルールを`src/utils/nativeOverlayNv12Gate.ts`の
    `shouldRouteFrameToNativeOverlay`として切り出した:
    「attach未解決なら常にfalse」「動画を含まないシーンは
    nativeOverlayReadyだけでtrue（nv12を待たず即座にoverlay可）」
    「動画を含むシーンはnv12Readyもtrueになるまでfalse（presenterに
    留める）」——欠落/黒フレームを一切出さないための最も保守的な
    ルールとして選んだ（brief記載の「conservative correct rule」）。
  - `publishSharedRendererPreviewSession`内の`isNativeOverlayDirectSceneSession`
    （動画を含むシーン判定、既存関数を流用）ベースのnative overlay
    ルーティング分岐（2箇所）を`nativeOverlayVideoSceneRoutable`
    （上記ゲート関数の結果）に置き換えた。native-render-only
    （図形/画像のみ、動画を含まない）分岐は意図的に無改修
    （`nativeOverlayReady`のみで判定、nv12を待つ理由がないため）。
- **electron IPC層**: `nativeOverlayMainBridge.ts`（`isNv12PipelineReady`
  ブリッジ関数、addon未対応/無効時は`true`にフォールバック——旧addonは
  単段構成で常にready済みだったため、これを「準備できていない」と
  誤解して動画をpresenterに留め続けるのは後方互換上誤り）・
  `nativeOverlayIpc.ts`（新規channel）・`preload.ts`
  （`window.nativeOverlay.isNv12PipelineReady`）・`vite-env.d.ts`
  （型定義）を一気通貫で配線した。

### Alternatives considered

- **threadsafe function（napi）でnv12 ready完了を1回だけpushする案**:
  見送った。ポーリングより実装・テストの複雑さが増す割に、nv12準備
  状態は「attach後に1回だけfalse→trueへ遷移する」単調な性質のため、
  既存のフレームpresentループと同じ頻度のポーリングで実用上十分な
  即応性が得られると判断した。
- **`Mutex<Option<wgpu::RenderPipeline>>`での遅延化**（bgra_pipeline/
  nv12_bgra_pipelineと同じOnceLockパターン）: 見送った。nv12は
  「バックグラウンドスレッドがコンパイル→registryのMutex経由で
  書き戻す」という、bgra版（`&self`のみの遅延構築、呼び出しスレッドが
  そのままコンパイルする）とは異なるアクセスパターンのため、
  `Option`+`&mut self`（registry Mutexが天然の排他制御を提供する）の
  方が素直で、追加の内部可変性機構が不要だった。

### 検証結果

- macOS `cargo test`（native-wgpu-renderer）: **lib 57 passed / 0 failed**
  （54 + 新規3件、無退行）。
- macOS `cargo test`（native-overlay）: **lib 104 passed / 0 failed**
  （103 + 新規1件、無退行——Windows専用テスト1件は cross-compile
  チェックのみでmacOSでは実行されない）。
- `cargo check --target x86_64-pc-windows-msvc --tests`
  （native-wgpu-renderer・native-overlay両方）: エラーなし。
- `npx tsc --noEmit`: エラーなし。
- `npx vitest run`: **258 files / 1868 tests、全green**（257/1862ベース
  ラインから、`nativeOverlayNv12Gate.test.ts`新規6テストの純増。
  既存の`viewportRustVideoOnlyBoundary.test.ts`（3件）・
  `nativeOverlayIpc.test.ts`（3件）はソース文字列検査/handler数
  アサーションを本stageの意図した設計変更に合わせて更新した——
  リグレッションではない）。
- `package.json`を`0.1.1-Beta-515a`へ更新。

### 次の一手 / 未検証事項

- Phase 3（mainpc実機検証、次段階）: 空タイムラインでのattach→overlay
  切替時間の実測（3回・中央値、目標: 数秒）、動画on timelineでの
  欠落フレーム無し確認（nv12 ready後にフルoverlay切替）、UIスレッド
  応答性（0件の応答なし）。
- 本stageで導入した`shouldRouteFrameToNativeOverlay`のnv12ゲートは
  純粋関数レベルのユニットテストのみで検証済み。実Electronアプリでの
  「動画クリップをattach直後に追加した場合、nv12 readyまでpresenterで
  正しく再生され続けるか」の対話的確認はPhase 3以降の対話操作可能な
  セッションで実施すること。

## Phase 7 (W7) 需要駆動staged attach: Phase 3（mainpc実機検証）

### 実施内容

mainpcを`git bundle`転送でtip `a97cf6c2`（Phase 2完了時点）へ同期し、
その後の3件の診断用小changeset（`e59d1d7a`/`ee29228c`/`a7214dfc`/
`a4c2527b`、後述）を差分scpで追送しつつ、最終的にmainpcを本stage完了
時点のtipへ`git reset --hard`で同期した。native-overlay/
shared-video-frame-bridge-node addonとrust-backendを`--release`で
再ビルド（いずれも成功）。

- **計測手法**: stage5/6の`run-stage5-attach-latency.ps1`と同じ手法
  （`schtasks /it`経由起動、Chromium CONSOLE出力のリアルタイムgrep、
  `Get-Process -Name electron | Responding`の1秒間隔ポーリング）を
  ベースに、新設`run-phase3-empty-timeline.ps1`で以下2点を拡張した:
  1. 既存の`[NativeOverlay] attach ... "success":true`ログは、stage6
     以降essential集合の完成だけでattachが解決するようになったため、
     コード変更なしに意味だけが「launch→attach(essential ready)時間」
     へ変わっている。
  2. 新設した`[NativeOverlay] nv12Ready {"ready":true}`ログ
     （`pollNv12Ready`成功時、`src/components/Viewport.tsx`）を追加
     検出し、nv12バックグラウンド完了時間を別途記録する。
  3. UIスレッド応答性ポーリングはattach解決後も止めず、nv12Ready
     （またはタイムアウト）まで継続——essential窓だけでなくnv12
     バックグラウンド窓もUIスレッドをブロックしないことを同一計測で
     証明する。
- **診断用の小changeset（3件、いずれも既定挙動は無変更のopt-in）**:
  - `e59d1d7a`: `pollNv12Ready`成功時に`[NativeOverlay] nv12Ready
    {"ready":true}`を1行だけ出す（onAttachedの成功ログと対）。
  - `ee29228c`: `UXFD_PERF_KEEP_ALIVE=1`を明示指定したときだけ
    `perf-harness-agent-done`後の自動`app.exit`をスキップする
    （`electron/main.ts`）。**発見した計測上の制約**: perfハーネスは
    完了後250ms後にアプリを自動終了する設計で、旧stage6（単段attach
    45秒）ではperfハーネスの完走（launch後 数十秒）がnv12完了と
    同じタイミングだったため問題化しなかったが、本stageでessential
    attachが速くなった（約30秒）ことで、perfハーネスが先に完走して
    アプリごと終了し、まだバックグラウンドで動いているnv12コンパイルの
    完了ログを観測する前にプロセスが消える、という新しい計測上の
    タイミング問題が生じた。この opt-in フラグで解消。
  - `a4c2527b`+`a7214dfc`: `UXFD_REMOTE_DEBUG_PORT`を明示指定したときだけ
    `--remote-debugging-port`/`--remote-allow-origins=*`を付与する
    （既定は無効）。presenter実フレームの視覚的直接証拠取得のため。

### 測定結果（mainpc実機、3回、`UXFD_PERF_KEEP_ALIVE=1`あり）

| # | launch→attach(essential ready) | attach→nv12Ready | nv12Ready(launch起点) | Responding=False |
|---|---:|---:|---:|---:|
| 1 | 27.49秒 | 15.76秒 | 43.25秒 | 0 / 45 |
| 2 | 33.65秒 | 12.57秒 | 46.22秒 | 0 / 47 |
| 3 | 29.93秒 | 12.56秒 | 42.49秒 | 0 / 44 |

- **(a) launch→attach(essential ready)switch時間の中央値: 29.93秒**。
  旧stage6の単段構成中央値45.4秒から大幅短縮した。**ただし正直な注記**:
  この29.93秒には`npm run dev:native-overlay`が使うvite dev-server/
  Electronのビルド起動オーバーヘッド（ログから`preload.js`
  ビルド7308ms・`main.js`ビルド11203ms、合計約18.5秒）が含まれており、
  Phase 1が計測した「essential集合の純粋なパイプラインコンパイル時間
  約8.9秒」とは別物の値である。本番パッケージビルド（vite dev-serverの
  オンデマンドTSトランスパイルが無く、`electron-builder`成果物を直接
  起動する）ではこのオーバーヘッドが構造的に発生しないため、実際の
  「起動→切替」体感はさらに短くなる見込みだが、**本stageでは本番
  パッケージビルドでの実測は実施しておらず、これは推測に留まる**
  （stage6の「次の一手」から持ち越しの未検証事項でもある）。
- **(b) nv12バックグラウンド完了時間: attachから中央値12.57秒**
  （launch起点では中央値43.25秒）。**正直な注記**: Phase 1の孤立測定
  （`nv12-pipeline-repro --all`、単発プロセス、中央値57.585秒）より
  大幅に速い。可能性が高い説明は、本stage実施までに同一プロセス内で
  同一シェーダ（`nv12_composite.wgsl`）を繰り返しコンパイルしていた
  （Phase 1の3回計測・`cargo test --release`のスモークテスト等）ことに
  よる、DXCまたはD3D12ドライバ（NVIDIA）のディスクシェーダキャッシュの
  温まり効果——ただしPhase 1自身の3回計測ではrun間の明確な高速化
  傾向は見られなかった（52.7〜58.4秒の範囲に収まっていた）ため、
  この説明は確証には至っていない。探索的に実施した追加のCDP検証
  run（下記）では attach→nv12Ready がわずか3ミリ秒というさらに極端な
  結果も観測しており、warm cache効果である可能性を強めている。
  **初回・低温状態（新規インストール直後等）のユーザー体験はPhase 1の
  52〜58秒に近い可能性が残ることを正直に記録する**——次の一手として
  「電源再起動直後・初回インストール相当のcold cache状態での再測定」
  を残す。
- **(d) UIスレッド応答性: 3回とも`Responding=False`サンプル0件**
  （合計136サンプル中0件）。ポーリングはessential attach解決後も
  nv12Ready（またはタイムアウト）まで継続しており、**essential窓・
  nv12バックグラウンド窓の両方でUIスレッドが一度もブロックされない
  ことを実測で証明できた**——これは需要駆動staged attachの中核となる
  設計要件（registryのMutexをnv12コンパイル中ずっと握らない2段ロック
  構成）が実機で機能していることの直接的な裏付けでもある。

### (c) 動画on timelineでの欠落/黒フレーム確認

- perfハーネスのデフォルトproject（`VITE_PERF_AGENT_MODE=1`）には
  既に動画クリップ（`mediaId`付き、解像度671x377の60fpsクリップ、
  `UXFD_NATIVE_OVERLAY_STEADY_TRACE_BEGIN/END`でラップされた
  steady playbackシナリオを含む）が含まれており、3回の正式測定＋
  1回の探索的CDP検証runのいずれも、この動画入りシーンに対して
  attach（essential ready）とnv12Readyの両方が発火した。**4回とも
  ログにエラー・パニック・crash・欠落フレームの兆候は一切現れず**、
  perfハーネス自体も5行のCSV行を毎回正常に完走した（フレーム配信の
  失敗があればharness側が検出する設計）。
- ロジックレベルの正しさはPhase 2で導入した6件のユニットテスト
  （`src/utils/nativeOverlayNv12Gate.test.ts`、no-video即座ルーティング・
  video-scene待機・video途中追加・nv12Ready flip）でTDD検証済み。
- **presenter実フレームの視覚的直接証拠（CDPスクリーンショット）**:
  stage1/2/5/6のいずれでも「対話操作手段が無く未取得」と記録されて
  きたが、本stageで**SSHローカルポートフォワード
  （`ssh -f -N -L 9333:127.0.0.1:9333 mainpc`）+ Chrome DevTools
  Protocol（`--remote-debugging-port=9333` `--remote-allow-origins=*`）
  経由で初めて取得に成功した**。DevTools inspector frontend
  （`http://127.0.0.1:9333/devtools/inspector.html?ws=...`）を経由して
  対象ページをスクリーンショットし、attach/nv12Ready後もアプリが
  クラッシュ・黒画面化せず正常にUI（タイムライン・シーン）を描画し
  続けていることを直接確認した。**ただし正直な注記**: nv12Readyが
  ほぼ即時（観測範囲3ミリ秒〜15.76秒、CDP接続確立自体に約9秒かかる）
  だったため、「動画クリップがpresenter経由で表示されている、
  nv12未完成の瞬間」を狙って手動ポーリングでスクリーンショットする
  ことはできなかった——この特定の遷移だけは視覚的直接証拠を得られて
  いない。ただし上記のとおり、その窓の間もログ・harness完走結果には
  一切の異常が見られず、routing自体は`nativeOverlayVideoSceneRoutable`
  ゲートのユニットテストで別途固定されている。

### 実施しなかった作業（正直な記録）

- 本番パッケージビルド（`electron-builder`成果物）でのlaunch→attach
  実測——引き続き未実施（stage6から持ち越しの次の一手）。
- cold cache状態（初回インストール相当）でのnv12バックグラウンド完了
  時間の再測定——本stageの3回はいずれも同一セッション内の後半に
  実施したため、warm cache効果を排除できていない。
- 「動画がpresenter経由で表示されnv12未完成」の瞬間を狙ったCDP
  スクリーンショット——nv12Readyがほぼ即時だったため機会を逃した。

### mainpc同期状態

本stage完了時点でmainpcは`git reset --hard`によりローカル
`feature-proxy`の最終tipと同一コミットへ同期済み。schtasks
（`uxfdw7cdp`/`uxfdw7cdp2`/`uxfdw7cdp3`含む、計測用に作成した一時
タスク）は全て`/delete /f`で削除済み、`electron.exe`/`node.exe`の
残留プロセスなし。`uxfdw7bench24h`（既存・無効のまま維持、環境規約
どおり未使用）以外に有効なタスクは残っていない。SSHローカルポート
フォワードプロセスも計測終了後にkill済み。
