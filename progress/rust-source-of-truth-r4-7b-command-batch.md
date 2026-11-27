# R4-7b: `Command::Batch`（複数コマンドの1 undoステップ束ね）

## Decision

- R4-8 のブロッカー記録（`progress/rust-source-of-truth-r4-8-command-ipc.md`）
  で判明した「1 回の undo ステップで複数オブジェクトへ同時作用する」11 の
  UI 操作（`deleteSelectedObjects`/`rippleDelete` 系/`splitObject`/
  `cutSelectedObjects`/`paste`/`duplicate` 系 2 種/
  `applyAviUtlStoredCoordinates`/`group`・`ungroup`）に対応するため、
  `rust-core/src/command.rs` の `Command` enum へ `Batch { commands:
  Vec<Command> }` を追加した。
- **apply は all-or-nothing**: `apply_command` の他バリアントと同じ
  「ローカル clone 上でのみ変更し、失敗したら破棄する」設計をそのまま
  踏襲するだけで自然に成立する。`Batch` の腕は `next_scene` を
  `commands` の各要素に対して順番に `apply_command(&next_scene,
  sub_command)?` へ差し替えていくだけで、途中の `?` が失敗した瞬間に
  関数全体が `Err` を返し、呼び出し元が保持する元の `scene` 参照は
  一切変更されない。
- **invert は逆順**: `invert(Batch[a, b, c]) == Batch[invert(c),
  invert(b), invert(a)]`。apply が all-or-nothing のため「Batch の一部だけ
  適用された」状態は undo 履歴に存在し得ず、単純な逆順 + 各要素の invert
  で正しい undo になる。
- **入れ子の Batch は拒否**（`CommandError::NestedBatch`）:
  `commands` に `Command::Batch` 自体が含まれる場合、apply 時に拒否する。
  nested Batch を許すと「内側の Batch が部分失敗したら外側はどこまで
  ロールバックするか」を再帰的に考える必要が生じ、invert の逆順則
  （フラットな 1 段の逆順で十分）が壊れるため、設計をシンプルに保つため
  あえて禁止した。`invert()` 自体は入れ子構造が来ても素直に再帰的に
  逆順化するが（`apply_command` が事前に弾くため実運用では到達しない
  経路）、コード上は特別扱いせず一貫した振る舞いにしてある。
- **空 Batch は拒否**（`CommandError::EmptyBatch`、apply 時）:
  「commands が空の Batch を construction 時点で作れないようにする」
  型レベルの強制（`NonEmptyVec` 等）は Rust 標準の `Vec` を崩す割に
  得るものが小さいため見送り、`apply_command` での実行時検証に留めた。
  理由: 呼び出し側（UI）が「対象 0 件の操作」を誤って undo 履歴へ積むと、
  undo/redo が何もしないスタックエントリを生み、ユーザーから見て
  「undo を押しても何も起きない」不可解な挙動になる。呼び出し元
  （TS 側、R4-8 group c 以降の配線）は「積む前に対象が 1 件以上あるか」を
  確認してから `Batch` を構築する責務を持つ。

## テスト

`rust-core/tests/command_undo.rs` に追加（TDD Red→Green、全 33 テスト
green）:
- `batch_apply_and_undo_round_trip_removes_multiple_objects`:
  実フィクスチャ（45 オブジェクト）から降順 index (44, 10, 2) で
  `RemoveObject` 3 件を `Batch` にして apply→undo し、位置・順序を含め
  厳密に元の `SceneData` に一致することを確認。
- `batch_apply_is_all_or_nothing_on_mid_batch_failure`: 1 番目が妥当・
  2 番目が未知フィールドの `SetObjectField` を `Batch` にして apply が
  `Err` を返すこと、かつ元の `scene` が一切変更されていないこと
  （別の `apply_command` 呼び出しで probe）を確認。
- `batch_rejects_nested_batch` / `batch_rejects_empty_commands`。
- proptest `batch_of_remove_objects_undo_restores_scene_for_any_sequence`:
  1〜10 件の `RemoveObject` を降順 index で `Batch` にした場合、
  任意本数で apply→undo が round-trip すること。

## TS 側（`src/utils/invertCommand.ts`）

- `npm run codegen:types` で `Command.ts` を再生成（`ts-rs` は自己参照
  union をそのまま `Array<Command>` として素直に出力し、追加の対応は
  不要だった）。
- `invertCommand` に `batch` ケースを追加: `[...command.commands]
  .reverse().map(invertCommand)` で Rust 側の逆順則を複製した。
  `src/utils/invertCommand.test.ts` を新設（3 件）し、逆順+要素 invert・
  `invertCommand(invertCommand(batch)) === batch` の往復・空 batch の
  3 パターンを固定した（この topic に対する初めてのテストファイル）。

## 検証済み

- `cargo test`（rust-core フル: 33+3+2+2 件 green、rust-backend フル:
  64+2+5 件 green、`ignored` 3 件は既存のベンチ専用テストで対象外）。
- `npx tsc --noEmit` クリーン。
- `npm run codegen:types:check` 差分ゼロ。
- `npm run fixture:evaluation-parity`（447 フレーム比較、除外 0）+
  `cargo test --test ts_evaluation_parity` green、
  `KNOWN_DIFFERENCES.json` は `[]` のまま。
- `npx vitest run` 255 ファイル/1841 テスト、全 green（旧基準 254/1838 +
  今回追加の invertCommand.test.ts 3 件）。

## 次バッチへの引き継ぎ

- `Batch` は rust-core の型・ロジックのみで、`rust-backend`
  の `command.apply` RPC 境界（R4-8 で新設済み）は `Command` を
  そのまま JSON でやり取りするため無改修で `Batch` を通せる（動作確認は
  `apply_command` の呼び出し経路が共通のため、rust-backend フル
  `cargo test` の green で構造的に担保されている。専用の RPC テストは
  追加していない）。
- R4-8 group c 以降で、11 箇所の UI 操作を `Batch` へ変換する配線が
  残っている（本バッチのスコープ外）。
