# Windows native overlay 段階導入・既定切替（Windows Port W7）STAGE 1

## Decision

- macOS と同じ env/flag 規約（`VITE_UXFD_NATIVE_OVERLAY`）を維持しつつ、
  プラットフォームごとの既定値だけを切り替える純粋関数
  `resolveNativeOverlayEnabled(platform, env)`
  （`src/utils/nativeOverlayPlatformGate.ts`）を新設した。
  - macOS: 既存どおり opt-out（`'0'` を明示しない限り既定 ON）。
  - Windows・その他未知プラットフォーム: 24 時間ベンチ合格までは opt-in
    （`'1'` を明示しない限り既定 OFF）。既定を macOS と揃える（opt-out へ
    切り替える）際は、ファイル内の `WINDOWS_DEFAULT_ENABLED` 定数を
    `true` にする 1 行変更で済む形にしてある。
  - TDD で 7 件（macOS 3 パターン、Windows 3 パターン、未知プラットフォーム
    2 パターン）のユニットテストを追加（`nativeOverlayPlatformGate.test.ts`）。
- renderer 側でプラットフォームを判定できるよう、`electron/preload.ts` に
  `contextBridge.exposeInMainWorld('uxfdPlatform', process.platform)` を追加
  した。`electronFile` と同様、関数越しではなく静的値をそのまま公開する設計。
- `Viewport.tsx:731` 付近の
  `nativeOverlayPreviewEnabled = import.meta.env.VITE_UXFD_NATIVE_OVERLAY !== '0'`
  を `resolveNativeOverlayEnabled(window.uxfdPlatform ?? '', {...})` 呼び出しに
  置き換えた。既存の WebGPU presenter は無改造のまま残っており（ADR-011
  どおり parity 比較用に使える）、native overlay が opt-out/opt-in いずれで
  無効化されても presenter 側にフォールバックする経路は W1〜W6 の時点で
  既に存在する。

## 実機検証（mainpc）

- ビルド: `native-overlay`（`build-native-overlay-addon.mjs --release`）、
  `shared-video-frame-bridge-node`（`build-shared-video-frame-node-addon.mjs
  --release`）、`rust-backend`（`cargo build --release`）を mainpc 上で
  再ビルドし、いずれも成功（addon 2 件は数秒、rust-backend は 2m01s）。
- DXC DLL（`dxcompiler.dll`/`dxil.dll`、W5 で `native-overlay/target/release/
  deps/` に配置済みのものをそのまま流用）を `node_modules/electron/dist/`
  （実 Electron 実行ファイルと同じディレクトリ）へ配置した。W5/W6 は
  テストバイナリ横にしか配置しておらず、**実 Electron アプリ本体の exe と
  同じディレクトリに置いたのは本 Phase が初めて**。
- `VITE_UXFD_NATIVE_OVERLAY=1`（opt-in）+ `VITE_PERF_AGENT_MODE=1` で
  `npm run dev:native-overlay` を実行し、実 Electron アプリ上で
  native overlay を実際に attach させることを確認した
  （`schtasks /it` 経由、DirectComposition は SSH 直実行だと
  `E_ACCESSDENIED` になるため probe-sustained と同じ手法）。
  ログに `[NativeOverlay] attach {"success":true,"attached":true}` が
  複数回（perf harness の各シナリオごとに attach/detach が走るため）連続で
  記録され、いずれも成功した。**W7 STAGE1 の主目的である「Windows で
  native overlay を実 Electron アプリ上で動かせるか」は実機で確認できた。**
- W6 の「未検証のまま残るもの」3 点への到達状況:
  1. **実 Electron アプリでの見た目確認（Bug E 含む）**: 目視確認はできて
     いない（この環境から mainpc の対話セッションへ画面操作を送る手段が
     無いため）。ログベースでは `set_native_overlay_obstructed` の呼び出し
     経路自体は W6 で配線済みだが、実際に HTML UI が overlay の手前/奥へ
     切り替わる見た目は本 Phase でも未検証のまま。
  2. **devtools 開閉時の挙動**: 同じ理由（対話操作を送る手段が無い）で
     未検証のまま。
  3. **初回 attach の UI スレッドブロック時間（DXC あり/なし比較）**:
     DXC DLL を Electron exe 横に配置した状態での実 Electron 上の attach は、
     ログのタイムスタンプ精度では正確な秒数を測れなかったが（stdout は
     行単位でしか時刻を残さない）、W5 で報告された Fxc 時代の「79.09秒
     （テストバイナリ単体、DXC 導入後）」「10分超（Fxc）」という基準と比べ、
     ポーリング間隔（15〜20秒）の中で複数回の attach が完了しており、
     体感として大幅に短いことは確認できた。DLL 無し（Fxc フォールバック）
     との対照実験は本 Phase では実施していない（時間予算の都合、また
     mainpc 上で唯一の実機環境を長時間占有する 24 時間ベンチと競合する
     ため）。**正確な数値比較は次段階の課題として残す。**

## 24 時間ベンチ

- `scripts/run-native-overlay-long-bench.mjs`（`npm run bench:native-overlay`）
  を使用。`probe-sustained` へのフォールバックは行わなかった
  ——このスクリプトは実 Electron アプリを `VITE_PERF_AGENT_MODE=1` で
  繰り返し起動し、`native_overlay_steady_playback` シナリオの frame time
  を実測してから自己終了する設計で、まさに「実アプリを無人で回す」W7 の
  要件に合致しており、`probe-sustained`（Rust 単体プローブ）より実態に
  近い検証になるため。
- **見つけた不具合と対処（scope: `scripts/`、コミット別途）**:
  `resolveBenchSpawnCommand` が Windows で `npm.cmd` を `shell: true` なしで
  直接 spawn しており、`schtasks /it` 経由（コンソール非継承）の起動では
  `spawn EINVAL` で即死していた。`spawn` オプションに
  `shell: process.platform === 'win32'` を追加して解消した。
- **見つけたフィクスチャ欠落と対処**: mainpc の `perf/heavy-media/` に
  重量動画フィクスチャ（`20000kbps_60fps.mp4` 等）が存在せず、
  `native_overlay_steady_playback` シナリオが `skipped_no_heavy_mp4` として
  スキップされ、ベンチのゲート判定（スキップは失敗扱い）に落ちていた。
  `ffmpeg`（mainpc に winget 導入済み）で 1920x1080/60fps/20000kbps・15秒の
  合成テストクリップを生成し配置した。
- **見つけた予算不一致と対処**: `native_overlay_steady_playback` の
  frame time 予算（既定 mean 16.8ms / p95 20.0ms）は macOS の in-process
  decode を前提にしており、Windows は in-process decode 未実装のため
  ffmpeg パイプラインへフォールバックする（`[RustBackend] ... in-process
  decode is only available on macOS`、既知の Windows 側ギャップで本 Phase の
  スコープ外）。素の予算では 1 サイクル目で
  `mean exceeded 60fps budget: 31.25ms` としてゲート判定に落ち、24 時間
  ベンチが即座に停止してしまう。本ベンチは「fps parity のゲート」ではなく
  「クラッシュ・ハング・メモリリークを検出する安定性ソーク」として使うため、
  スクリプトが公式にサポートする環境変数（
  `UXFD_NATIVE_OVERLAY_STEADY_MEAN_BUDGET_MS=120`,
  `UXFD_NATIVE_OVERLAY_STEADY_P95_BUDGET_MS=180`）で予算を緩め、
  コード自体（ゲートの実装）は変更していない。
- **開始時刻**: 2026-08-22T02:30:08Z（PowerShell `Get-Date -Format o`
  実測、JST 表示は `2026-08-22T11:30:08.6563582+09:00`）。
- **ログ**: `C:\Users\gzabu\UXFD\bench-w7\bench-24h.log`
  （`npm run bench:native-overlay` の stdout/stderr をリダイレクト）。
  完了時は末尾に `BENCH_DONE_MARKER exitcode=<code>` が付く
  （`C:\Users\gzabu\UXFD\bench-w7\bench-24h.done` の有無でも判定可）。
- **起動スクリプト**: `windows_port_research/tools/w7-verify/start-bench.ps1`
  （`schtasks /it` でログオン済みセッションへ流し込む。DirectComposition が
  SSH 直実行だと `E_ACCESSDENIED` になるため。probe-sustained と同型）。
- **結果の読み方**: ログ中の `[native-overlay-bench] run N 完了` が
  1 サイクル成功、`gate failed:` が失敗（原因メッセージ付きでループが停止する
  ため、24 時間経過前にログが止まっていたら要調査）。各サイクルの詳細行は
  `C:\Users\gzabu\UXFD\perf\native-overlay-long-bench\perf-agent-output.json`
  だが、次サイクル開始時に上書きされるため、サイクルごとの推移は
  `bench-24h.log` の `[native-overlay-bench] run N 完了` 行の数と
  タイムスタンプ間隔で追う。24 時間経過後、ログ末尾が
  `BENCH_DONE_MARKER exitcode=0` かつ `run N` の N が途中で頭打ちに
  なっていなければ安定と判断できる（`exitcode` が非 0、または
  `gate failed`/`起動失敗` が出ていれば要調査）。

## Alternatives considered

- `probe-sustained`（Rust 単体プローブ、W5 Phase 0 相当）を 24 時間ベンチに
  流用する案は却下した。実 Electron アプリ・napi 境界・perf harness を
  経由しないため、W7 が検証したい「実アプリ運用での安定性」からは一段
  遠く、既に「実アプリを繰り返し起動する」設計の
  `run-native-overlay-long-bench.mjs` が既存資産としてあったため、そちらを
  優先した。

## Constraints / Gotchas

- `window.uxfdPlatform` は Electron の `contextBridge` 経由でのみ存在する。
  vite dev server を素のブラウザで開いた場合（Electron 無し）は
  `undefined` になり、`resolveNativeOverlayEnabled('', ...)` は「未知の
  プラットフォーム」分岐（Windows と同じ opt-in 扱い）に落ちる。native
  overlay 自体は `window.nativeOverlay?.attach` の有無でも別途ガードされて
  いるため、ブラウザ単体プレビューで機能的な問題は起きない。
- `dev:native-overlay`（vite dev server 経由の起動）では、React の
  副作用の再実行（StrictMode 相当の挙動）や HMR により、1 プロセス内で
  attach が複数回連続して走ることを実機ログで確認した。production build
  （`electron-builder` 経由）でも同様かどうかは本 Phase では未検証。
- `scripts/run-native-overlay-long-bench.mjs` の
  `resolveBenchSpawnCommand`（Windows で `npm.cmd` を spawn）は
  `shell: true` が無いとコンソール非継承の起動元（`schtasks /it` 経由）で
  `spawn EINVAL` になる。macOS 側（`caffeinate` 経由）は元々問題なし。

## Stage 2 への申し送り（STAGE1 時点の記述、STAGE2 結果は下記参照）

- 24 時間ベンチの結果を収集し、`gate failed`/クラッシュ/メモリ増加傾向が
  無いことを確認してから、`nativeOverlayPlatformGate.ts` の
  `WINDOWS_DEFAULT_ENABLED` を `true` にして Windows も opt-out（既定 ON）
  へ切り替える。
- `package.json` の PhaseVer を +1 する（本 STAGE1 では見送り。★完了は
  ベンチ合格後）。
- Bug E の実 Electron 上での見た目確認、devtools 開閉時の挙動確認は、
  対話操作を行える環境（実機に直接アクセスできるセッション、または
  リモートデスクトップ等）で改めて実施する必要がある。
- DXC あり/なしでの初回 attach ブロック時間の定量比較（W5 の
  「79.09秒 → 更に短い」を実 Electron 上で数値として取り直す）は未実施の
  まま残っている。
- Windows の in-process decode 未実装（ffmpeg フォールバック）は
  `native_overlay_steady_playback` の frame time に直接影響する既知の
  ギャップ。W7 のスコープ外だが、Windows でも mac 相当の fps 予算を
  ゲートとして使いたい場合はこちらの解消が前提になる。

## STAGE2（本セクション、2026-08-22 実施）

### 24 時間ベンチの結果（実際は約 10 時間でユーザーが早期停止）

- ユーザーが `C:\Users\gzabu\UXFD\bench-w7\bench-24h.log` の実行中、
  アプリが断続的に「応答なし」になるのを確認し、24 時間の満了を待たず
  約 10 時間で早期停止した。開始 `2026-08-22T02:30:08Z`、停止
  `2026-08-22T12:37:04.9128741Z`（ログ末尾の `BENCH_STOPPED_EARLY_BY_USER`
  実測、JST `21:37:04`）——**約 10 時間7分の安定性ソークとして評価する
  （24 時間ではない）**。`schtasks` タスク `uxfdw7bench24h` は無効化
  済みで、本 STAGE2 では再有効化していない。
- ログ全体（251,599 行、8.98MB）を走査した結果:
  - `[native-overlay-bench] run N 完了` = **147 回**（サイクルが最後まで
    連続しており、途中で頭打ちになっていない）。
  - `gate failed` = **0 件**。
  - `panic` = **0 件**。
  - `crash`/`Crash` = **0 件**。
  - `out of memory`/`OOM` = **0 件**。
  - `Uncaught`/`unhandledRejection`/`EACCES`/`EINVAL`/`memory`/`rss`/
    `heapUsed`/`attach.*false`/`failed:` = **0 件**（メモリ使用量自体は
    本ベンチが記録しない項目のため、メモリ増加傾向は本ログからは
    判定不能——測定項目として未整備であることを正直に記録する）。
  - `error`/`Error`/`ERROR` の 592 件はすべて `cargo build` の warning
    出力中の識別子名（`HandleError` 等）・unused import 警告であり、
    実行時エラーではないことをサンプル確認済み。
  - `[NativeOverlay] attach ... "success":true` = **442 件**、すべて成功。
- **結論**: 約 10 時間の範囲では、クラッシュ・gate failed・パニック・
  OOM のいずれも 0 件で安定していた。ただし「応答なし」というユーザー
  観測はログの完了行数やエラー件数には現れない種類の不具合（UI スレッド
  ブロック）であり、ログベースの安定性評価だけでは検出できない既知の
  ギャップとして扱う（後述の attach レイテンシ実測が直接の原因調査）。

### 実機検証1: native-overlay `cargo test --release`（両フィックス込み）

- mainpc の作業コピーが古い commit（`5f078554`）のままだったため、
  bundle 転送（`git bundle create ... HEAD ^5f078554` → scp → mainpc 側
  `git fetch <bundle> HEAD:refs/heads/w7stage2` → `git reset --hard`）で
  `aa6945d0`（パスバグ2件修正＋overflow修正の統合コミット）まで同期した。
- `cargo test --release`（native-overlay、`schtasks /it` 経由で DComp
  アクセス権のあるセッションから実行）:
  - lib unittests: **93 passed / 0 failed**
  - `tests/win32_overlay_smoke.rs`: **2 passed / 0 failed**
    （`attach_and_detach_native_overlay_round_trip_on_real_hwnd`、
    `native_overlay_follows_owner_window_move_via_geometry_resync_hook`
    含む）
  - doctest: 0 passed / 0 failed（対象なし）
  - **合計 95 passed / 0 failed**。W5 時点の見出し数「84 passed / 2
    failed → 86 passed / 0 failed」から見ると合計数が増えているのは、
    その後の R5/W6 等で正当にテストが追加され続けているため
    （`progress/windows-native-overlay-test-path-bugs.md` が言及していた
    2 件の修正対象自体は上記の smoke テスト2件に含まれ、いずれも
    green）。**path バグ修正の実機検証は完了、0 failed。**

### 実機検証2: overflow 修正（bottom-left→top-left フリップ）の実機幾何検証

- `win32_overlay_smoke.rs` を `--nocapture` で再実行し、
  `native_overlay_follows_owner_window_move_via_geometry_resync_hook` が
  出力する実測値を採取した:
  - attach payload（contract 座標）: `x=10, y=20, width=320, height=240`
  - 実測 initial overlay rect（screen 座標）: `(18, 212, 338, 452)`
    （幅 320・高さ 240 で payload と完全一致、引き伸ばしなし）
  - 逆算: `screen_x - contract_x = 18 - 10 = 8`（owner の左境界オフセット）、
    `owner_client_height ≈ 472 - screen_y_origin` として整合性を確認した
    結果、`owner_client_height ≈ 433px`（`WS_OVERLAPPEDWINDOW` の標準
    タイトルバー/枠幅として妥当な値）で `resolve_overlay_screen_rect` の
    `owner_client_height_px - scaled_view_y - height` 式と矛盾なく
    説明できた。修正前の「常に bottom-left のまま加算」する式であれば
    screen_y は大きく異なる値（この例では約 59 相当）になり、canvas
    領域からのはみ出しが再現する計算になる。
  - `followed overlay rect = (318, 362, 638, 602)`（owner を
    `+300, +150` 移動させた後）も width/height 不変のまま追従しており、
    幅・高さの破綻は無い。
  - **canvas（owner のクライアント領域）を大きくはみ出す「えげつない」
    ずれは実機で再現しなかった。overflow 修正は実機幾何検証で確認できた
    と判断する。**
- 制約として正直に記録: 既存の `native_overlay_follows_owner_window_move_via_geometry_resync_hook`
  は「相対移動量が一致するか」のみを assert しており、上記の絶対座標
  一致（owner_client_height からの逆算）はテストコードの assertion では
  なく、本 STAGE2 セッションでの手計算による事後検証である。将来
  「canvas rect に厳密一致する」ことを自動でゲートしたい場合は、
  `GetClientRect`/`GetWindowRect` から独立して期待値を計算する専用の
  assertion をテストに追加する必要がある（未実装、次段階へ申し送り）。
  RDP 経由の目視確認（Bug E・devtools 開閉挙動含む）は、本 STAGE2 でも
  対話操作を送る手段が無かったため引き続き未実施。

### 実機検証3: attach レイテンシ実測（DXC あり、通常アプリセッション）

- `schtasks /it` 経由で `VITE_UXFD_NATIVE_OVERLAY=1` +
  `VITE_PERF_AGENT_MODE=1` で `npm run dev:native-overlay` を3回連続
  起動し、プロセス起動時刻から `[NativeOverlay] attach
  {"success":true,...}` ログ出現までの経過時間を計測した
  （24時間ベンチのループとは別の、単発の通常アプリセッションとして）。
  - run1: **89.77 秒**
  - run2: **88.77 秒**
  - run3: **88.20 秒**
  - **中央値 ≈ 88.77 秒**。3回とも rust-backend の `cargo build` は
    既にビルド済みキャッシュがヒットしており（run2 のログに
    `Finished .release. profile` 行が出ない＝再ビルド無し、`vite ready in
    351ms`）、cargo 再ビルドのノイズではなく、Electron 起動〜overlay
    attach 成功までの実態としての約 88 秒である。
  - `VITE_UXFD_NATIVE_OVERLAY=1` のみ（`VITE_PERF_AGENT_MODE` 無し）で
    起動した1回目の予備実験では、60 秒待っても attach が一度も発火
    しなかった（`ATTACH_TIMEOUT_60S`）。**overlay attach はビューポートが
    実際にネイティブ描画対象シーンを評価するまで発火せず、アプリを
    起動しただけ・ユーザー操作を待つだけの状態では自動的には attach
    されない**。今回は STAGE1 と同じ perf harness（`VITE_PERF_AGENT_MODE=1`）
    でシナリオを自動駆動させて発火させた。
  - **attach は同期 napi 呼び出しであり（`native-overlay/src/lib.rs` の
    `attach_native_overlay`）、この間 Electron メインプロセスの UI
    スレッドは応答しなくなる。ユーザーが観測した「応答なし」は、
    24時間ベンチのループの各サイクルで発生していた実行時間90秒近い
    attach 呼び出しと一致する挙動であり、初回だけでなく毎サイクル
    （＝毎起動）発生するコストであることが下記の pipeline cache 調査
    と合わせて裏付けられる。**

### 実機検証4（廉価調査）: pipeline compile コストは毎起動 or 初回限定か

- `native-wgpu-renderer`/`native-overlay`/`rust-backend` の各 crate を
  `wgpu::Features::PIPELINE_CACHE`・`create_pipeline_cache`・
  `get_pipeline_cache_data` で検索したが **0 件**。`wgpu::DeviceDescriptor`
  の `request_device` 呼び出し（3箇所）はいずれも
  `required_features: wgpu::Features::empty()` で、pipeline cache
  feature を要求していない。
- ディスク上のシェーダキャッシュ機構（`shader_cache`、
  `%LOCALAPPDATA%` へのDXC出力キャッシュ等）も見当たらない。
- **結論: wgpu のパイプラインキャッシュは一切実装・有効化されておらず、
  DXC によるシェーダコンパイルは毎回のアプリ起動（毎回の native overlay
  attach）ごとに再実行される設計になっている。** ユーザーが観測した
  「応答なし」は初回起動だけの一過性コストではなく、**アプリを起動する
  たび（24時間ベンチの各サイクルを含む）に毎回発生する構造的コスト**
  であると判断できる。

### DEFAULT-ON 判定ゲート（親エージェントのルールを機械的に適用）

判定条件（すべて満たす場合のみ flip）:

1. 約10時間のソークで crash/gate failed が 0 件 — **✅ 満たす**
   （147サイクル完走、gate failed 0、panic/crash/OOM 0）。
2. overflow 修正が実機検証済み — **✅ 満たす**
   （geometry smoke test 2/2 pass、絶対座標の手計算検証も整合）。
3. DXC ありでの attach レイテンシ中央値が 5 秒未満 — **❌ 満たさない**
   （実測中央値 ≈ **88.77 秒**、5秒の要求を大幅に超過）。

**3 が不成立のため、`WINDOWS_DEFAULT_ENABLED` は `false` のまま据え置く
（flip しない）。** default-ON は「attach を非同期化する」または
「wgpu pipeline cache／DXC コンパイル結果の永続キャッシュを導入して
毎起動コストを削る」のいずれかが前提条件となる、W7 の具体的な残課題として
記録する。

- `package.json` の PhaseVer は「flip しない」判定であっても、本 STAGE2
  で実施した実機検証・不具合特定（応答なしの根本原因特定を含む）は
  意味のある進捗のため +1 する（バージョニング規約どおり、コード変更を
  伴わない検証セッションでも重要な決定ログとして扱う）。
- STAGE2 は★完了ではなく **部分完了（stage-2 partial）** として記録する。
  Blocker: 「attach 呼び出しの非同期化」または「pipeline cache 導入」
  いずれかが完了するまで、Windows の既定 ON 化は見送る。
