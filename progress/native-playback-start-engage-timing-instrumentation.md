# startScenePlayback engage遅延の内訳計測

## Decision
- `electron/rustScenePlaybackController.ts`の`start()`に計測専用の
  `startTimingDiagnostics`（totalMs / evaluateSceneMs / presentSceneMs /
  otherMs / isFirstStartSinceLaunch）を追加した。`nowMs()`（既存の
  依存注入済み時計）で`evaluateScene`区間・`presentScene`区間・`start()`
  全体を計測し、既存のawait順序・制御フローは変更していない。
- 集計（`otherMs`の差分計算とnull化）は純粋関数
  `computeRustScenePlaybackStartTimingDiagnostics`へ切り出し、壁時計を
  介さずユニットテストで固定した。
- サーフェス選定: `RustScenePlaybackStartResult`の`active: true`分岐に
  直接フィールドを足す方式を採用（別診断IPCは追加しなかった）。理由は
  (1) rendererは既に`startPlayback`サンプルを`rendererSceneRpcTrace`へ
  記録しており、それが素通しするだけで`result.json`の
  `exercise.sceneRpcTrace.samples`へ自動的に乗る、(2) `active: false`側
  の`{active, reason, detail}`契約は`toEqual`で固定されているテストが
  複数あり、そちらには一切フィールドを追加しないことで安全に既存契約を
  保てる。
- `isFirstStartSinceLaunch`はコントローラ生成（≒アプリ起動）後、成否に
  関わらず最初の`start()`呼び出しで一度だけ`true`になるフラグ。冷却経路
  （surface作成・decoder初期化・shader/pipelineコンパイル）仮説を検証
  するためのもので、まだ検証はしていない（計測を可能にしただけ）。

## `start()`経路を読んで分かったこと
- `renderFrame`内のawaitは`evaluateScene(...)`と`presentScene(...)`の
  2つのみ。`resolveDirectOverlaySourceFrameConflict`・
  `toNativeOverlayPlaybackSnapshot`・media eligibility判定は全て同期
  処理で、数百msを持ちうる箇所ではない。
- `nativeOverlayBridge.presentScene`
  （`electron/nativeOverlayMainBridge.ts:338`）はaddonの
  `presentNativeOverlayScene`を1回awaitするだけの薄いラッパー。既に
  `presentSceneTrace`という診断ログ（`presentMs`）を持つが、
  `nativeOverlayTraceEnabled(env)`時のみ`console.info`に出るだけで
  `result.json`には乗らない。今回追加した`presentSceneMs`と役割が重なる
  が、後者はE2E harnessへ機械可読な形で届く点が異なる。
- Rust backend側の`scene.evaluate`は`electron/main.ts:631-632`の
  `callRustBackend('scene.evaluate', payload, 8_000)`経由。子プロセスの
  stdin/stdoutをJSON1行プロトコルで往復するだけで、Rust側CPUが速く
  なっても短縮しない（+6%）という実測と矛盾しない — IPC往復自体
  （プロセス間の書き込み・スケジューリング・パース）か、native overlay
  addon側（`presentNativeOverlayScene`）のどちらかが支配的な可能性が
  高い。今回の計測でどちらが370msの主要因かがログから判別できるように
  なる。

## Alternatives considered
- 別診断IPC（`rust-backend-scene-playback-start-diagnostics`のような
  ハーネス問い合わせ用チャネル）: 既存の`sceneRpcTrace`と二重の集計経路
  になり、E2Eハーネス（`scripts/run-realistic-heavy-edit-e2e.mjs`、編集
  禁止ファイル）側の変更が必要になる可能性があった。既存の素通し経路で
  完結する今回の方式の方が変更範囲が小さい。

## Constraints / Gotchas
- `active: false`側の結果オブジェクトに`startTimingDiagnostics`を
  絶対に足さないこと。`rustScenePlaybackController.test.ts`に
  `.resolves.toEqual({active:false, ...})`という完全一致アサーションが
  複数あり、余分なフィールドがあると即Redになる。
- `renderFrame`の内部戻り値型と公開の`RustScenePlaybackStartResult`は
  意図的に別型にしてある。`renderFrame`（`tick()`からも呼ばれる）は
  `startTimingDiagnostics`を持たない素の`{active:true; frameIndex}`を
  返し、`start()`だけがそれに診断を合成して返す。
