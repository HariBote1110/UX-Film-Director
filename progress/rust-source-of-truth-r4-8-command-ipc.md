# R4-8: `command.apply` IPC 配線（コミットグループ a のみ完了）

## Decision

- R4-6/R4-7 が実装した `rust-core::command::{apply_command, invert, Command,
  CommandError}` を実際に呼び出す IPC 境界を、`project.deserialize`
  （R4-2、`rust-backend/src/project_file.rs`）と同じ薄いラッパーパターンで
  新設した。
  - `rust-backend/src/command.rs`: `handle_command_apply(id, params) ->
    RpcResponse`。`{ scene: SceneData, command: Command }` を受け取り
    `apply_command` の結果 `{ scene: SceneData }` か、ドメインエラー
    （新規コード `32630`、`PROJECT_FILE_INVALID_CODE`=32610・
    `AGENT_PROJECT_INVALID_CODE`=32620 と同じ帯）を返す。`CommandError` は
    `Serialize` を derive していないため、メッセージは `format!("{:?}",
    command_error)` で構造化デバッグ表現をそのまま返す（呼び出し側は
    メッセージ文字列を UI 表示にのみ使い、分岐判定には使わない設計）。
  - `rust-backend/src/rpc_dispatch.rs` に `"command.apply" =>
    handle_command_apply(...)` を追加、`main.rs` に `mod command;` を追加。
  - `electron/main.ts` に `ipcMain.handle('rust-backend-command-apply', ...)`
    （`sceneRpcFailure` で `errorCode` を含めて返す既存パターンを踏襲）、
    `electron/preload.ts` に `applyCommand`、`src/vite-env.d.ts` に
    `window.rustBackend.applyCommand` の型を追加した。すべて既存 API への
    追加のみで破壊的変更なし。
- TS 側の呼び出し口として `src/utils/rustBackendCommandBridge.ts` を新設。
  `src/utils/projectFile.ts` の `RustBackendProjectFileBridge` と同じ
  bridge-injection パターンだが、`historySlice.ts` の `undo`/`redo` は
  引数なし（`AppState['undo']: () => Promise<void>`）で呼ばれるため、
  呼び出し側が bridge を渡す形にできない。代わりにモジュールスコープの
  `setCommandBridgeForTests(bridge | null)` override を用意した。
  `getCommandBridge()` は override → `window.rustBackend.applyCommand` の
  存在チェック → どちらもなければ `null` の順に解決する。
  **`null` は「IPC bridge が存在しない環境（vitest の jsdom 等）」を表し、
  `historySlice.ts` 側はこれを undo/redo の no-op として扱う設計**
  （タスク要件どおり、テストがモックを注入しない限り no-op）。
- `src/utils/invertCommand.ts`: `rust-core::command::invert` の TS 側
  ミラー。R4-6/R4-7 の設計記録で確認済みの通り全 12 kind の invert は
  純粋なフィールド swap（`AddObject`↔`RemoveObject` のような kind 入れ替え
  も含む）で表現できるため、サーバ往復コストを避けて TS 側に複製した
  （Rust 側の `invert()` を変更した場合はこの関数も同時更新が必要 —
  コメントに明記）。別途 `rust-backend-command-invert` RPC は不要と判断。

## 検証済み

- `cargo test`（rust-core・rust-backend）フル実行、全 green
  （`rust-backend/src/command.rs` の新規テスト3件含む）。
- `npx tsc --noEmit` クリーン。
- `npm run codegen:types:check` 差分ゼロ（`Command`/`SceneData` は
  R4-6/R4-7 で既にロック済みのため今回の変更による型差分なし）。
- `npx vitest run` 253ファイル/1832テスト、全 green（既存挙動への影響
  ゼロ — 今回はまだ `historySlice.ts` 等 renderer 側の消費コードを
  一切変更していないため）。

## 未着手（このバッチでは完了しなかった範囲）

タスク本体（`historySlice.ts` の command stack 化・`pushHistory` 呼び出し
34箇所の書き換え）は着手しなかった。理由:

- `pushHistory`/`undo`/`redo` の呼び出し箇所は実測 **34箇所**
  （設計時の見積り29箇所より多い）: `TimelineItem.tsx`(1) /
  `OxidiseStageViewport.tsx`(1) / `PropertyPanel.tsx`(7) /
  `useSceneInteraction.ts`(3) / `useStore.ts`(17) /
  `layerSlice.ts`(3)、加えてテスト/harness 2箇所
  （`registerAppCommands.test.ts`、`e2e/realisticHeavyEditHarness.ts`）。
- `historySlice.ts` の `pushHistory`/`undo`/`redo` シグネチャ変更は
  `AppState` インターフェースの破壊的変更であり、34箇所すべてを同時に
  書き換えないと `tsc --noEmit` が壊れる（スナップショット全体を積む
  現行 API から、コミット時点で `Command` を構築して積む API への移行は
  型レベルで不可分）。各呼び出し箇所ごとに「どの `Command` kind に
  マッピングするか」「previous 値をどこで捕捉するか（drag-end/
  input-confirm、フレーム単位で発火させない）」を個別に精査する必要が
  あり、本バッチの残り予算では安全に完了できないと判断し、IPC 配線
  （常に安全に追加できる非破壊的な層）のみを完了させて区切った。
- 次バッチ（R4-8 残作業）でやること: `storeTypes.ts` の
  `pastStates`/`futureStates: HistorySnapshot[]` →
  `pastCommands`/`futureCommands: Command[]`、`pushHistory: (cmd: Command)
  => void`、`undo`/`redo`: `() => Promise<void>`（`getCommandBridge()` が
  `null` なら no-op、実行中は多重発火を無視する "ignore-while-pending"
  方針を採用予定 — key-mash 時に古い `Command` を誤って積み直さないため）
  への書き換えと、34箇所の呼び出し変換（コミットグループ b〜f）。
  `SceneData` の組み立ては `state.scenes.find(s => s.id ===
  activeSceneId)` から `id`/`name` を取得し、`objects`/`layers`/
  `duration`/`camera`/`stageCamera3D` は store のトップレベル状態
  （アクティブシーンの生値）を使う（`src/utils/sceneState.ts` の
  `flushActiveIntoScenes` と同じ構造）。
