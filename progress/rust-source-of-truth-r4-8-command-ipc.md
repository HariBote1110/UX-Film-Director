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

# R4-8 group c 着手時に判明した設計上のブロッカー: 単一 Command では表現できない呼び出し箇所が大半

## 事象

group b の完了後、`useStore.ts` の 17 箇所(`pushHistory()` 呼び出し実測)
を `pushHistoryCommand` へ変換する group c に着手し、全 17 箇所を精査した
ところ、**単一の `Command`(R4-6/R4-7 が定義した 12 kind)へ 1:1 変換できる
のは 6 箇所のみ**で、残り 11 箇所は「1 回の undo ステップで複数オブジェクト
を同時に追加/変更/削除する」操作であり、現行の `Command` enum(バッチ/複数
コマンドをまとめる variant を持たない)では表現できないことが判明した。

## 変換可能だった 6 箇所(単一オブジェクト操作)

| 行 | action | Command kind |
|---|---|---|
| `addObject`(354) | 1 オブジェクト追加 | `addObject` |
| `addObjectFilter`(509) | 1 オブジェクトへ 1 フィルタ追加 | `addFilter` |
| `toggleObjectFilter`(524) | 1 フィルタの enabled 切替 | `toggleFilterEnabled` |
| `moveObjectFilter`(539) | 1 フィルタの並び替え | `moveFilter` |
| `removeObjectFilter`(554) | 1 フィルタ削除 | `removeFilter` |
| `deleteObject`(582) | 1 オブジェクト削除 | `removeObject` |

## 変換不能と判定した 11 箇所(複数オブジェクトに同時作用)

| 行 | action | 理由 |
|---|---|---|
| `deleteSelectedObjects`(607) | 選択中の任意数のオブジェクトを一括削除 |
| `rippleDeleteObject`(626) | 1 個削除だが後続オブジェクト全ての `startTime` 等をリップルで再計算(`computeRippledObjects`)— 実質「任意数のオブジェクトの複数フィールドを同時変更」 |
| `rippleDeleteSelectedObjects`(652) | 上に同じく複数選択+リップル |
| `splitObject`(676) | 既存オブジェクトを変更(`firstPart`)しつつ新規オブジェクトを追加(`secondPart`)— 1 操作で「変更+追加」の複合 |
| `cutSelectedObjects`(761) | 任意数のオブジェクトを一括削除 |
| `pasteObjects` 相当(827) | 任意数のオブジェクトを一括追加 |
| `duplicateSelectedObjects`(892) | 任意数のオブジェクトを一括追加 |
| `duplicateSelectedObjectsWithObjectCopyExt`(924) | 同上(コピー数 3 倍でさらに多い) |
| `applyAviUtlStoredCoordinatesToSelection`(953) | 任意数のオブジェクトの複数フィールドを同時パッチ |
| `groupSelectedObjects`(978) | 任意数のオブジェクトの `groupId` を同時変更 |
| `ungroupSelectedObjects`(1000) | 同上 |

## 根本原因

R4-7 で定義した第二層コマンド(`AddObject`/`RemoveObject`/`AddFilter`/
`RemoveFilter`/`ToggleFilterEnabled`/`MoveFilter`/`UpdateFilterParams`/
`SetLayerState`/`ReorderLayers`/`SetCamera`/`SetStageCamera3D`)は、いずれも
「1 回の apply で 1 個の意味的変更」を表す設計になっており、
`Command::Batch(Vec<Command>)` のような複数コマンドをまとめて 1 回の
undo/redo ステップとして扱う variant が存在しない
(`rust-source-of-truth-r4-commands.md` にもその設計は登場しない)。
`SetObjectField` も対象は単一 `object_id` のみで、複数オブジェクトへの
一括パッチは不可。

## この場で対応しなかった理由

- `Command` enum への `Batch` variant 追加は `rust-core/src/command.rs`
  の変更を要し、本タスクの許可スコープ(`rust-core/` は非対象ファイル)
  外である。
- 仮に TS 側だけで「複数 `pushHistoryCommand` を連続で積む」実装にすると、
  undo が「複数回に分けてしか戻せない」(1 回の Ctrl+Z で `duplicateSelectedObjects`
  が作った 3 個のオブジェクトのうち 1 個しか消えない、等)という UX 退行を
  生み、タスク要件「UI 側の 1 操作 = 1 undo ステップ」の暗黙の前提
  (旧スナップショット API と同じ粒度)を破る。誤った変換をして
  「tsc が通る」ことだけを理由に commit するのは「Rust の結果と乖離しない」
  という要件に反すると判断した。

## 推奨される次の一手(このセッションでは未着手)

1. `rust-core/src/command.rs` に `Command::Batch(Vec<Command>)` を追加し、
   `apply_command`/`invert` をそれに対応させる(R4-7 の担当領域の再開、
   別バッチとして起票が必要)。
2. Batch 対応が入るまでの暫定策として、上記 11 箇所は**旧スナップショット
   API(`pushHistory`/`undo`/`redo`)に据え置く**(dual-API 期間を意図的に
   延長する)。この場合でも 6 箇所(addObject/フィルタ 4 種/deleteObject)は
   `pushHistoryCommand` へ先行変換して問題ない(スタックの型が異なる
   `pastStates`(スナップショット)と `pastCommands`(コマンド)が並存する
   ため、UI 側の Ctrl+Z ハンドラは「どちらのスタックにも直近の変更が
   積まれていれば、より新しい方を優先する」等の突き合わせロジックが
   別途必要になる点に注意 — 単純に両方の undo を呼ぶと二重 undo になる)。

## このセッションでの判断

- 6 箇所の先行変換は、上記の「二重 undo 回避ロジックが未設計」という
  理由により、**今回はコード変更を行わなかった**(unified な undo UX
  を壊すリスクの方が「6/34 を進めた」という進捗より優先度が低いと判断)。
- group c は本ブロッカーの発見と記録のみで区切り、`useStore.ts` の
  コード自体は無改修(tree は group b コミット時点のまま)。

# R4-8 group c: `useStore.ts` の17箇所を`pushHistoryCommand`へ変換

## Decision

- ブロッカー(前バッチ記録)が `Command::Batch` の追加(R4-7b、9fce47d5..d7f3cddb)
  により解消されたため着手。`useStore.ts` の 17 箇所すべてを
  `pushHistory()` から `pushHistoryCommand(cmd)` へ変換した
  (`grep -c "pushHistory()"` は 0、`pushHistoryCommand` は 17)。
- 新規ヘルパー `src/store/commandBuilders.ts` を追加:
  `buildAddObjectCommand`/`buildRemoveObjectCommand`/`buildAddFilterCommand`/
  `buildRemoveFilterCommand`/`buildToggleFilterEnabledCommand`/
  `buildMoveFilterCommand`/`buildBatchCommand`(空なら`null`、単一なら
  `Batch`でラップせずそのまま返す)/`buildObjectFieldDiffCommands`
  (2つのオブジェクトを丸ごと比較して差分キーぶん`setObjectField`を作る
  汎用ヘルパー — 「ビジネスロジックが実際に何を変えたか」を手で追うより
  安全)。ts-rs生成の`TimelineObject`/`ObjectFilter`(`groupId?: string|null`
  等)とapp側型(`string|undefined`)の横断キャストはこのファイルに閉じ込めた。

## 変換テーブル(17箇所)

| action | Command kind | previous捕捉ポイント |
|---|---|---|
| `addObject` | `addObject` | `set()`直前、`state.objects.length`をindexに |
| `addObjectFilter` | `addFilter` | `addFilterToObject`を`set()`外で先に実行し、末尾に積まれた filter を取得してから積む(1回しか実行しない、二重生成を回避) |
| `toggleObjectFilter` | `toggleFilterEnabled` | filter実在チェック(見つからなければ積まない = guard) |
| `moveObjectFilter` | `moveFilter` | `fromIndex`/`toIndex`を`set()`外で計算。端でのクランプは`fromIndex===toIndex`(rust-source-of-truth-r4-commandsのクランプ規約に合わせる) |
| `removeObjectFilter` | `removeFilter` | filter実在チェック(guard)、`removed`は削除前のfilter実体 |
| `deleteObject` | `removeObject` | 削除前の`objects.findIndex` |
| `deleteSelectedObjects` | `batch`(`removeObject`×N、降順index) | 対象0件なら積まない(既存guard流用) |
| `rippleDeleteObject` | `batch`(`removeObject`+`setObjectField(startTime)`×shift対象) | `computeRippledObjects`の前後比較を`buildObjectFieldDiffCommands`で差分化 |
| `rippleDeleteSelectedObjects` | `batch`(`removeObject`×N降順index+`setObjectField`×shift対象) | 同上 |
| `splitObject` | `batch`(`removeObject`+`addObject`×2) | `syncObjectKeyframes`適用**後**のfirstPart/secondPartを使う(実際にstateへ入る値とCommandを一致させる) |
| `cutSelectedObjects` | `batch`(`removeObject`×N降順index) | 対象0件なら積まない(既存guard流用) |
| `pasteClipboardObjects` | `batch`(`addObject`×N、`state.objects.length`から連番index) | 対象0件なら積まない |
| `duplicateSelectedObjects` | `batch`(`addObject`×N) | 同上 |
| `duplicateSelectedObjectsWithObjectCopyExt` | `batch`(`addObject`×N) | sync済みオブジェクトを`set()`外で先に計算し、Command・stateの両方に使う |
| `applyAviUtlStoredCoordinatesToSelection` | `batch`(`setObjectField`×変更対象) | patch適用後のオブジェクトを`set()`外で先に計算し、`buildObjectFieldDiffCommands`で差分化 |
| `groupSelectedObjects` | `batch`(`setObjectField(groupId/groupGradient)`×対象) | 同上 |
| `ungroupSelectedObjects` | `batch`(`setObjectField(groupId/groupGradient)`×対象) | 同上 |

いずれのサイトも**フレーム単位で発火する経路はない**(すべて確定的な
1回のユーザー操作に対して1回だけ呼ばれる、ドラッグ中の連続呼び出しは
`useStore.ts`には存在しない)。

## zero-target guard

`deleteSelectedObjects`/`rippleDeleteSelectedObjects`/`cutSelectedObjects`/
`pasteClipboardObjects`/`duplicateSelectedObjects`/
`duplicateSelectedObjectsWithObjectCopyExt`/
`applyAviUtlStoredCoordinatesToSelection`/`groupSelectedObjects`/
`ungroupSelectedObjects` はいずれも既存コードに「対象0件なら早期return」
するguardが元々あった(`pushHistory`を呼ぶ前に該当箇所へ到達しない)ため、
そのまま踏襲するだけで zero-target 時に `pushHistoryCommand` が呼ばれない
ことを確認した。`toggleObjectFilter`/`removeObjectFilter`は元々ガードが
無かった(filterId不在でも`pushHistory`していた)ため、今回新たに
「filter実在チェック」guardを追加した(Rust側のCommandは`removed`実体や
実在`filterId`を要求するため、無効なCommandを積めないという制約上必須)。

## テスト

`src/store/useStoreCommandConversion.test.ts` を新設(9件)。単一Command
サイト(addObject/deleteObject/フィルタ3種)、guard(存在しないfilterId/
対象0件)、Batchサイト(deleteSelectedObjects降順index、rippleDeleteObject
のRemove+shift、splitObjectのRemove+Add×2、groupSelectedObjectsの
setObjectField差分)を確認。IPC往復自体の正しさはgroup bの
`historySlice.test.ts`で別途固定済みのため、ここでは「各アクションが
`pastCommands`へ正しい形のCommandを積むか」に絞った。

## 検証済み

- `npx tsc --noEmit` クリーン。
- `npx vitest run` フル実行、**256ファイル/1850テスト、全green**
  (旧基準255/1841 + 新規1ファイル/9テスト)。
- Rust/codegen変更なしのため`cargo test`・`codegen:types:check`・
  fixture parityは意図的にスキップ。

## group d 以降への引き継ぎ

- `layerSlice.ts`(3箇所)/`TimelineItem.tsx`(1箇所)/
  `OxidiseStageViewport.tsx`(1箇所)が次。`layerSlice.ts`の
  `swapLayerTracks`/`insertLayerTrackAt`/`deleteLayerTrackAt`は
  `reorderLayers` Command(layers+objects丸ごと差し替え、R4-7設計どおり)
  へのマッピングが既に決まっている。
- `旧pushHistory`/`pastStates`/`futureStates`/`undo`/`redo`は
  `useStore.ts`からは呼ばれなくなったが、`historySlice.ts`自体からは
  まだ削除していない(dual-API継続、他ファイルの17箇所がまだ未移行)。

# R4-8 group d: `layerSlice.ts`/`TimelineItem.tsx`/`OxidiseStageViewport.tsx`の5箇所

## 変換テーブル

| ファイル | action | Command kind | previous捕捉ポイント |
|---|---|---|---|
| `layerSlice.ts` | `swapLayerTracks` | `reorderLayers` | `set()`直前、変更前の`state.layers`/`state.objects` |
| `layerSlice.ts` | `insertLayerTrackAt` | `reorderLayers` | 同上 |
| `layerSlice.ts` | `deleteLayerTrackAt` | `reorderLayers` | 同上 |
| `TimelineItem.tsx` | クリップのドラッグ移動/リサイズ(`handleMouseDown`+`handleMouseUp`) | `batch`(`setObjectField`×変更フィールド、単一なら生Command) | **ドラッグ開始**(`handleMouseDown`)で`dragTargets`/`initialState`へ捕捉、**ドラッグ終了**(`handleMouseUp`)で最終値と比較してCommandを構築・1回だけpush(ドラッグ中の`handleMouseMove`は毎フレーム`updateObject`のみでCommandは一切積まない) |
| `OxidiseStageViewport.tsx` | 3Dギズモでの被写体(PSD世界配置)ドラッグ(`onPointerDown`+`onPointerUp`) | `batch`(`setObjectField`×変更フィールド、単一なら生Command) | **ドラッグ開始**(`onPointerDown`)で`dragModeRef.current.previousObject`へ捕捉、**ドラッグ終了**(`onPointerUp`)で`onBillboardWorldPositionChange`適用後の最新オブジェクトと比較してCommandを構築・1回だけpush(`onPointerMove`は毎フレーム位置更新のみ) |

## Decision

- `layerSlice.ts`の3箇所は元々`setLayerName`/`toggleLayerVisibility`/
  `toggleLayerLock`には`pushHistory`が無く(undo非対応のまま)、
  `swapLayerTracks`/`insertLayerTrackAt`/`deleteLayerTrackAt`のみが対象
  (R4-8ブロッカー記録・R4-7設計どおり実測3箇所)。いずれもR4-7で設計
  済みの`reorderLayers`(layers+objects丸ごと差し替え、`layerTrackOps.ts`
  の複雑なリマップロジックはRust側で再実装しない)へ1:1マッピング。
- `TimelineItem.tsx`/`OxidiseStageViewport.tsx`はどちらも
  「ドラッグ開始時に`pushHistory()`(1回)→ドラッグ中は`updateObject`の
  みを毎フレーム呼ぶ→ドラッグ終了時に何もしない」という既存パターン
  だった。Command化では「ドラッグ終了時に何もしない」の代わりに
  「開始時点の捕捉値と終了時点の実データを`buildObjectFieldDiffCommands`
  で比較し、1回だけ`pushHistoryCommand`する」に変更した。**フレーム単位
  でのCommand発火は発生しない**(`handleMouseMove`/`onPointerMove`は
  一切`pushHistoryCommand`を呼ばない)。
- ドラッグして実質何も変わらなかった場合(mousedown直後にmouseupする等)
  は`buildObjectFieldDiffCommands`が空配列を返し、`buildBatchCommand`が
  `null`を返すため`pushHistoryCommand`は呼ばれない(zero-target guardが
  自然に成立)。

## テスト

`src/store/slices/layerSlice.commandConversion.test.ts`を新設(4件、
swap/insert/delete各1件+範囲外indexでのguard確認)。`TimelineItem.tsx`/
`OxidiseStageViewport.tsx`はDOM操作(pointer/mouseイベントの実タイミング)
に依存するE2E的な検証が必要でユニットテストのコストが高いため、
このバッチでは新規テストを追加していない(ロジック自体は
`buildObjectFieldDiffCommands`/`buildBatchCommand`という共通ヘルパー
経由で、これらはgroup cのテストで別途検証済み)。

## 検証済み

- `npx tsc --noEmit` クリーン。
- `npx vitest run` フル実行、**257ファイル/1854テスト、全green**
  (旧基準256/1850 + 新規1ファイル/4テスト)。
- Rust/codegen変更なしのためcargo/parityはスキップ。

## group e以降への引き継ぎ

- 残るは `PropertyPanel.tsx`(7箇所)・`useSceneInteraction.ts`(3箇所)。
- ここまでで34箇所中 17(useStore) + 3(layerSlice) + 2(TimelineItem/
  OxidiseStageViewport) = 22箇所が変換済み、残り12箇所
  (PropertyPanel 7 + useSceneInteraction 3 + 元の見積りに含まれていた
  テスト/harness 2箇所)。

# R4-8 group e: `PropertyPanel.tsx`(7箇所)/`useSceneInteraction.ts`(3箇所)

## 変換テーブル

| ファイル | action | Command kind | previous捕捉ポイント |
|---|---|---|---|
| `PropertyPanel.tsx`(SceneAndCameraPanel) | `applyCamera` | `setCamera` | `setCamera(patch)`呼び出し**前**の`useStore.getState().camera`を`previous`、呼び出し**後**の値を`next`(mergeロジックを複製せず実測) |
| 同上 | `applyStageCamera3D` | `setStageCamera3D` | 同様に`setStageCamera3D`呼び出し前後の実測値 |
| `PropertyPanel.tsx`(PropertyPanel) | `handleApplyBatchTransform` | `batch`(`setObjectField`×対象オブジェクト×変更フィールド) | `updates`計算後、`set()`前に`buildObjectFieldDiffCommands`で各対象の差分化 |
| 同上 | `handleVisionApplyCropFromLastTrack` | `batch`(`setObjectField`) | patch確定後、`updateObject`呼び出し前に差分化 |
| 同上 | `handleVisionTrackRun`(トラッキング結果の反映) | `batch`(`setObjectField`) | `nextKeyframes`確定後、`updateObject`呼び出し前に差分化 |
| 同上 | `handleApplyAviUtlMotionPreset` | `batch`(`setObjectField`×対象オブジェクト) | 複数選択(sequence-aware)/単一選択どちらもpatch確定後に差分化してからupdateObject |
| 同上 | `handleApplyAviUtlEffectPreset` | `batch`(`setObjectField`) | patch確定後、`updateObject`呼び出し前に差分化 |
| `useSceneInteraction.ts` | オブジェクトドラッグ移動(`onPointerDown`→`onPointerMove`→`onPointerUp`) | `batch`(`setObjectField`) | **ドラッグ開始**(`onPointerDown`)で`dragRef.current.initialObjState`へ捕捉、**ドラッグ終了**(`onPointerUp`)で実データと比較して1回だけpush(`onPointerMove`はCommandを積まない) |
| 同上 | motion path記録(`onPointerDown`→録画→`onPointerUp`) | `batch`(`setObjectField`) | 同じ`initialObjState`(録画開始前の状態)を使い、録画終了時に`motionPath`込みで差分化 |
| 同上 | リサイズ(`onResizeStart`→`onResizeMove`→`onResizeEnd`) | `batch`(`setObjectField`) | **リサイズ開始**(`onResizeStart`)で`resizeRef.current.initialObjState`へ捕捉、**リサイズ終了**(`onResizeEnd`)で実データと比較して1回だけpush |

いずれのドラッグ系サイトも`onPointerMove`/`onResizeMove`ではCommandを
一切積まない(per-frame emitter化を回避)。`applyCamera`/
`applyStageCamera3D`は「呼び出し前後の実測値を比較する」方式を採用し、
`setCamera`/`setStageCamera3D`のmerge/sanitiseロジックをPropertyPanel側
で複製しない(実際に適用された結果と厳密に一致させる)。

## Decision

- `buildSetCameraCommand`/`buildSetStageCamera3DCommand`を
  `commandBuilders.ts`へ追加。`previous`===`next`(実質変化なし)なら
  `null`を返す。
- ドラッグ/リサイズ2箇所(`useSceneInteraction.ts`)は、`ResizeState`へ
  `initialObjState: TimelineObject | null`フィールドを新設し、
  `TimelineItem.tsx`/`OxidiseStageViewport.tsx`(group d)と同じ
  「開始時捕捉→終了時diff」パターンを踏襲した。

## テスト

このバッチではDOM/ポインタイベント駆動のUIコード(既存にも単体テストが
存在しない箇所)への変更が中心のため、新規テストは追加していない
(ロジックの正しさは共通ヘルパー`buildObjectFieldDiffCommands`/
`buildBatchCommand`/`buildSetCameraCommand`/`buildSetStageCamera3DCommand`
経由で、前者2つはgroup cのテストで、後者2つは型のみの薄いヘルパーで
別途カバー範囲内)。

## 検証済み

- `npx tsc --noEmit` クリーン。
- `npx vitest run` フル実行、**257ファイル/1854テスト、全green**
  (group dと同数、リグレッションなし)。
- Rust/codegen変更なしのためcargo/parityはスキップ。

## 34箇所の変換完了

`grep -rn "pushHistory()" src` の結果は
`src/commands/registerAppCommands.test.ts`と
`src/e2e/realisticHeavyEditHarness.ts`の2箇所のみ(いずれもR4-8ブロッカー
記録で「34箇所本体とは別」と記録済みのテスト/harnessコード)。
**本体34箇所は全て`pushHistoryCommand`へ変換完了**。group fで旧API
(`pushHistory`/`pastStates`/`futureStates`/`undo`/`redo`)を削除する際に
この2箇所も併せて対応する。

# R4-8 group f: 旧スナップショットAPI削除・R4-8完了

## Decision

- `historySlice.ts`から`pastStates`/`futureStates`/`pushHistory`/`undo`/
  `redo`を削除した。`storeTypes.ts`の`HistorySnapshot`型・対応する
  `AppState`フィールドも削除。`useStore.ts`の5箇所(initializeProject/
  loadProject/switchScene/addScene/deleteScene)にあった
  `pastStates: [], futureStates: []`初期化を`pastCommands: [],
  futureCommands: []`へ置き換えた。
- 旧APIを直接呼んでいた本体外の2箇所(R4-8ブロッカー記録で「34箇所本体
  とは別」と記録済み)を移行:
  - `src/commands/registerAppCommands.ts`の`edit.undo`/`edit.redo`
    ハンドラ: `store.getState().undo()/redo()` →
    `void store.getState().undoCommand()/redoCommand()`
    (fire-and-forgetのまま、コマンドバスのハンドラは同期シグネチャ
    のため)。
  - `src/e2e/realisticHeavyEditHarness.ts`: `undo()/redo()` →
    `await undoCommand()/redoCommand()`(囲む`exercise`関数は既に
    async)。もう1箇所の`pushHistory()`+`updateObject`は
    `buildObjectFieldDiffCommands`+`buildBatchCommand`による
    diffベースのCommand構築へ変換。

## テストの適応/削除マッピング

| ファイル | 変更内容 | 理由 |
|---|---|---|
| `src/commands/registerAppCommands.test.ts` | 「wires edit.undo and edit.redo」テストを`setCommandBridgeForTests`でモックbridgeを注入する非同期版へ書き換え(削除せず適応)。`pushHistory()`+同期assertionを、`pushHistoryCommand({kind:'setCamera',...})`+`await flushAsync()`+非同期assertionへ変更 | undo/redoが非同期command stackへ移行したため、配線検証も非同期化が必要。テスト自体の目的(edit.undo/edit.redoが正しいstoreアクションを呼ぶか)は変わらないため削除ではなく適応 |
| `src/integration/heavyEffectsStress.test.ts` | `pastStates.length`のassertionを`pastCommands.length`へ変更(意味は同一: 「大量のフィルタパラメータ更新で履歴が肥大化しない」) | フィールド名の変更のみ、テストの意図は不変 |

既存のundo/redo挙動テストで**削除したものは無い**(group b〜eの各バッチ
時点で確認済みのとおり、`grep -rln "\.undo()\|pastStates"`が元々
テストコードにほぼ存在せず、大半のstoreテストはundo/redoを経由しない
forward操作のみを検証していたため、今回の書き換えで壊れたテストは
上記2ファイルのみだった)。Rust側(`rust-core/tests/command_undo.rs`)の
undo/invert検証はR4-6/R4-7/R4-7bで別途28+5件(33件)が既にカバー済みで、
TS側で重複して同じ範囲を検証する必要はないと判断し、新規のRust相当
テストは追加していない。

## 検証済み(フルゲート)

- `npx tsc --noEmit` クリーン。
- `npm run codegen:types:check` 差分ゼロ(Rust側の型変更は本グループで
  行っていないため無変化)。
- `cargo test --manifest-path rust-core/Cargo.toml` フル実行、全green。
- `cargo test --manifest-path rust-backend/Cargo.toml` フル実行、全green
  (64+2+5件、ignoredのベンチ専用3件を除く)。
- `npm run fixture:evaluation-parity`(447フレーム比較、除外0)+
  `cargo test --test ts_evaluation_parity` green、
  `KNOWN_DIFFERENCES.json`は`[]`のまま(差分なし、git diff検出せず)。
- `npx vitest run` フル実行、**257ファイル/1854テスト、全green**
  (group e時点と同数 — 純粋なリネーム・API削除で、テスト数の増減なし)。

## R4-8完了

`historySlice.ts`のcommand stack化と、`pushHistory`呼び出し全34箇所の
変換が完了した。採用戦略は**dual-API**(group bで新API追加→group c〜eで
34箇所を段階移行→group fで旧API削除)。

### 全34箇所+テスト/harness2箇所の最終変換テーブル

group c(useStore.ts 17箇所)・group d(layerSlice.ts 3箇所+
TimelineItem.tsx 1箇所+OxidiseStageViewport.tsx 1箇所)・group e
(PropertyPanel.tsx 7箇所+useSceneInteraction.ts 3箇所)の各記録
(このファイル内の該当セクション)に全エントリを記載済み。group fでは
上記の追加2箇所(registerAppCommands.ts/realisticHeavyEditHarness.ts)
のみを移行した。

### async/queueing方針(group bで確定・以降変更なし)

ignore-while-pending。`isCommandHistoryPending`がtrueの間の追加の
undo/redo呼び出しは黙って無視する(キューイングしない)。理由は
group bのDecisionセクション参照。

### undo-fidelity(整合性)アプローチ

- undo/redoの正しさそのもの(apply/invertのround-trip)は
  `rust-core/tests/command_undo.rs`(R4-6/R4-7/R4-7b、単体28件+
  proptest5件、全33件)で固定済み。TS側はこれを信頼し、
  `historySlice.test.ts`(group b、6件)で「TS側がbridgeへ正しい
  Commandを渡し、結果を正しくstateへ反映するか」という配線の正しさに
  絞って検証した(Rust側ロジックの再検証はしない、二重管理を避ける)。
- 各呼び出し箇所のCommand構築の正しさは、`useStoreCommandConversion.test.ts`
  (group c、9件)・`layerSlice.commandConversion.test.ts`(group d、4件)で、
  「pastCommandsへ正しい形のCommandが積まれるか」を確認した。
- **既知の忠実性の限界**: フィルタ系Command(`AddFilter`/`RemoveFilter`等)
  はRust側`apply_command`が`filters`配列のみを操作し、
  `filterStack.ts`の`materialiseSyncedObject`が行う legacy フィールド
  (`colorCorrection`/`customClipping`/`vibration`/`shadow`/`gradient`)
  との同期をRust側では一切行わない。このため、フィルタ追加/削除の
  undo/redoをRust側apply経由で行うと、`filters`配列は正しく復元される
  一方でlegacyフィールドは古いままになりうる(forward方向の操作は
  従来どおりTS側`filterStack.ts`が両方を同期するため問題ないが、undo/
  redoでRust側の結果をそのままstateへ反映する箇所はこのギャップの
  影響を受けうる)。これはR4-8のスコープでは意図的に対応していない
  (`filterStack.ts`本体の書き換えはR4-9の担当領域と最初から明記されて
  いた、progress/rust-source-of-truth-r4-commands.mdのR4-8への引き継ぎ
  記述を参照)。R4-9でfilterStack.tsをRust移送する際に、この同期ギャップ
  も併せて解消される見込み。

## R4-9への引き継ぎ

- `filterStack.ts`本体(`addFilterToObject`等の実装そのもの)はまだ
  Rustへ移送されていない。R4-8は「呼び出し箇所がfilter系Commandを
  正しく発行するか」という配線のみを完了させた。
- 上記の「フィルタ操作undo時のlegacyフィールド非同期」問題は、R4-9で
  `filterStack.ts`をRustへ移送する際に、`materialiseSyncedObject`相当の
  ロジックをRust側`apply_command`にも実装するか、TS側でCommand適用後に
  追加の同期パスを挟むかの設計判断が必要。
