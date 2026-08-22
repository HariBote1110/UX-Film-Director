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

## Stage 2 への申し送り

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
