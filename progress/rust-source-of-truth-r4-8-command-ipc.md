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

# R4-8 group b: `historySlice.ts` の dual-API command stack 化

## Decision

- **採用戦略: dual-API**(親エージェントの承認済み逸脱)。`AppState` に
  新規フィールド `pastCommands`/`futureCommands: Command[]`、
  `isCommandHistoryPending: boolean` と新規アクション
  `pushHistoryCommand: (command: Command) => void`、
  `undoCommand: () => Promise<void>`、`redoCommand: () => Promise<void>`
  を追加した。既存の `pastStates`/`futureStates`/`pushHistory`/`undo`/
  `redo`(スナップショット方式)は**一切変更していない** —
  `historySlice.ts` の該当ブロックはコピー元と完全に同一のまま残置。
  これにより 34 箇所の呼び出し側は本バッチでは無改修のまま green を
  維持する(group c 以降で `pushHistory`→`pushHistoryCommand` 等へ
  1 グループずつ移行し、全箇所の移行が終わった時点で旧 API を削除する)。
- **SceneData の組み立て**: `buildActiveSceneData(state)` が
  `state.scenes.find(s => s.id === state.activeSceneId)` から `id`/`name`
  を取得し、`objects`/`layers`/`duration`/`camera`/`stageCamera3D` は
  store のトップレベル状態(アクティブシーンの生値)を使う
  (`src/utils/sceneState.ts` の `flushActiveIntoScenes` と同型)。
  アクティブシーンが scenes 配列に見つからない場合(理論上のみ発生
  しうる不整合)は undo/redo を no-op にする。
- **apply 結果の反映**: `applySceneResult(scene)` が
  `objects`/`layers`/`camera`(`sanitiseCamera`)/`stageCamera3D`
  (`sanitiseStageCamera3D`)/`duration`(`calculateAutoDuration`
  で再計算、旧 API と同じ副フィールド扱い)を返す。旧 API と同様、
  undo/redo の副作用として `selectedId`/`selectedIds` をクリアする
  (UI-only 副作用は据え置きという要件どおり)。
- **型境界の横断キャスト**: ts-rs 生成の `TimelineObject`
  (`groupId?: string | null`、serde `Option<String>` 由来)と
  `src/types.ts` の `TimelineObject`(`groupId?: string | undefined`)は
  ワイヤ表現の差のみで実データは互換なため、`buildActiveSceneData`/
  `applySceneResult` の境界でのみ `as unknown as` キャストした
  (正規化ヘルパーを新設するほどの実害がなく、IPC 境界の 2 箇所に
  閉じ込めれば十分と判断)。
- **非同期 undo/redo の多重発火ポリシー: ignore-while-pending を採用**
  (キューイングは採用しなかった)。`isCommandHistoryPending` が
  true の間に追加で `undoCommand`/`redoCommand` が呼ばれた場合は
  即座に return し、何もしない。理由: undo/redo は「IPC 往復時点での
  最新状態」に対して適用する必要があり、キューに古い `Command` を
  積んで後から適用すると、その待機中にユーザーが行った別の編集
  (後続の `pushHistoryCommand` 呼び出し等)と衝突しうる。キー連打時は
  「最初の 1 回だけ確実に効き、以降の連打は無視される」方が
  「連打した回数だけ効くが順序が怪しくなりうる」より安全と判断した。
  `finally` で必ず `isCommandHistoryPending: false` に戻すため、
  apply が失敗してもロックが残ることはない。
- **bridge 不在時の no-op**: `getCommandBridge()` が `null`
  (override 未設定 かつ `window.rustBackend.applyCommand` 不在、
  vitest の jsdom 環境等)の場合、`undoCommand`/`redoCommand` は
  スタックにも触れずに即 return する(IPC 配線バッチの設計どおり)。
- **failure policy**: `bridge.applyCommand` が `success: false` を返した
  場合、state を一切変更せず `console.error` のみ行う
  (`pastCommands`/`futureCommands` も含め変更しない — 失敗した
  コマンドは「まだ適用されていない」ため、スタックから移動させると
  二重適用や取りこぼしの原因になる)。

## テスト

`src/store/slices/historySlice.test.ts` を新設(6 件)。`useStore` を
`initializeProject` で初期化した実 store に対し、`setCommandBridgeForTests`
でモック bridge を注入して検証する。
- `pushHistoryCommand` が `pastCommands` に積み `futureCommands` を
  クリアすること。
- bridge 不在時に `undoCommand` が no-op であること
  (state 参照の同一性で「一切 set されていない」ことまで確認)。
- `undoCommand` が `invertCommand` 済みの Command を bridge へ渡し、
  成功結果を state へ反映し、コマンドを `pastCommands`→`futureCommands`
  へ移すこと。
- `redoCommand` が元の(invert していない)Command を再送すること。
- apply 失敗時に state 変更なし・`console.error` 呼び出し・
  `isCommandHistoryPending` が確実に false へ戻ることを確認する
  failure policy テスト。
- ignore-while-pending: 1 回目の `undoCommand` が in-flight の間に
  2 回目を呼んでも `applyCommand` は 1 回しか呼ばれず、2 回目は
  スタックに一切触れないことを確認する多重発火テスト。

## 検証済み(このグループの範囲)

- `npx tsc --noEmit` クリーン。
- `npx vitest run` フル実行、**254 ファイル / 1838 テスト、全 green**
  (旧基準 253/1832 + 新規 1 ファイル/6 テスト)。
- Rust/codegen の変更は本グループでは行っていないため、
  `cargo test`・`npm run codegen:types:check`・fixture parity
  (`npm run fixture:evaluation-parity` / ts_evaluation_parity)は
  **意図的にスキップした**(TS のみの変更で Rust 側の生成物・挙動に
  影響しないため)。

## group c 以降への引き継ぎ

- 34 箇所の呼び出し変換はまだ未着手。次バッチ(group c)は
  `useStore.ts` の 17 箇所(最大グループ)を対象とし、各サイトを
  `pushHistory()` → `pushHistoryCommand(cmd)` へ、必要に応じて
  `undo()`/`redo()` の呼び出し元(キーボードショートカット等)を
  `undoCommand()`/`redoCommand()` へ切り替える。
- 全 34 箇所の移行が完了するまでは `pastStates`/`futureStates`/
  `pushHistory`/`undo`/`redo`(旧 API)を削除しないこと
  (dual-API 期間中は両方が `AppState` に共存する)。
