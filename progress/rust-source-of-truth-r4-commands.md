# R4-6: コマンド層（`SetObjectField` 汎用パス）の実装

## Decision

- **対象状態型**: `rust-core/src/schema.rs` の `SceneData`
  （`objects`/`layers`/`camera`/`stageCamera3D`）を採用した。
  `src/store/slices/historySlice.ts` の `pushHistory`/`undo`/`redo` が実際に
  スナップショットしているフィールドがこの 4 つに一致するため（`id`/`name`
  は含まれず、`duration` は `calculateAutoDuration(objects)` から undo/redo
  のたびに再計算される副フィールド）。`schema.rs` にはもう一つ
  `Project`（`Clip`/`Track` ベース、R0 由来の評価器 MVP モデル）があるが、
  これは実際のエディタ編集状態とは無関係で `historySlice` からも一切
  参照されないため対象外とした。
- **二層構成**: 第一層は 42 kind 共通の汎用フィールド編集
  `Command::SetObjectField { object_id, field, next, previous }`
  （`next`/`previous` は `serde_json::Value`）のみ。第二層（構造コマンド:
  AddObject/RemoveObject/ReorderLayer/Filter 系/SetCamera/
  SetStageCamera3D 等）は R4-7 で追加する。
- **apply/invert**: `apply_command(scene: &SceneData, cmd: &Command) ->
  Result<SceneData, CommandError>`。`invert(cmd: &Command) -> Command` は
  `next`/`previous` を入れ替えるだけ。undo は「invert を apply する」ことで
  実現し、`AppliedCommand`（MVP 版が持っていた `{project, undo}` の組）は
  廃止した — undo コマンドは `invert()` から都度導出できるため、返り値に
  同梱する意味がなかった。
- **SetObjectField の適用ロジック**: 対象オブジェクトを `serde_json::Value`
  へ直列化 → 対象フィールドキーを `next` で上書き → `TimelineObject` へ
  逆直列化。型不一致（例: `opacity` に文字列を渡す）は逆直列化がそのまま
  `Err` を返すため自然に拒否される。
- **未知フィールドの拒否**: serde は既定で未知キーを黙って無視するため
  （`#[serde(deny_unknown_fields)]` は `schema.rs` のどの型にも付いていない）、
  逆直列化の成否だけでは「存在しないフィールド名」を検出できない。これを
  検出するため、`schemars::schema_for!` が生成する JSON Schema の
  `properties` キー集合を「対象 kind の既知フィールド」の正とし
  （`BaseObject` のスキーマ ∪ 対象 kind の `*ObjectFields` のスキーマ）、
  `field` がこの集合に含まれない場合は `CommandError::InvalidFieldPatch`
  で拒否する。42 kind 分のフィールド一覧を手書きで二重管理せずに済む
  （新しい kind やフィールドが増えても `schema.rs` の derive を更新する
  だけで自動的に反映される）。
- **`type` フィールドの拒否**: kind を変えることは構造変更（R4-7 の領域）
  であり `SetObjectField` の対象外とするため、`field == "type"` を明示的に
  拒否した。

## SetClipOpacity の fold 判断

- MVP の `Command::SetClipOpacity` は `Project`/`Clip` モデル専用で、
  `rust-backend`/`src/` のいずれからも `Command`/`apply_command`/
  `CommandError`/`AppliedCommand` を参照するコードは存在しなかった
  （IPC 配線は R4-8 で行う予定のまま未着手）。外部依存がないため、
  「単一フィールドの不透明度編集」を表す専用バリアントとして残す理由が
  なく、**`SetObjectField { field: "opacity", .. }` へ統合（fold）して
  廃止した**。旧 `rust-core/tests/command_undo.rs`（`Project`/`Clip` ベース
  の 4 テスト）は新モデル向けに全面的に書き換えた。

## Proptest カバレッジ

- `rust-core/tests/command_undo.rs` の
  `undo_of_do_restores_scene_for_any_real_numeric_field` が
  `apply(invert(apply(scene, cmd))) == scene` を検証する。
- 完全ランダムな `(object, field)` の組を生成するのではなく、実フィクスチャ
  （`tests/fixtures/uxfd/realistic-heavy-edit-v2.uxfd.json` の先頭シーン、
  45 オブジェクト）から実在する数値フィールドを列挙し、その中から
  `sample_index` で選んで値だけを変異させる方式を採った。存在しない
  フィールド名を生成しても「常に失敗するテスト」にしかならず、
  「妥当な patch は必ず成功して undo で必ず戻る」という不変条件の検証には
  実在ペアの列挙の方が有効なため。
- 元値が整数表現（`rows`/`targetLayer` 等の u32/i32）か小数表現
  （`opacity`/`x` 等の f32）かで perturbation の型を変えている
  （`serde_json::Value::is_u64()`/`is_i64()` で判別。整数由来のフィールドは
  常に整数バリアントの `Number` に直列化されるため誤判定しない）。
- 決定性テスト（`apply_command_is_deterministic`）も別途固定した。

## TS 側の配線状況

- `Command` を `rust-core/src/bin/codegen_types.rs` に登録し、
  `npm run codegen:types` で `src/generated/rustCore/Command.ts` を生成した
  （`{ kind: "setObjectField", objectId, field, next: JsonValue, previous:
  JsonValue }`）。`next`/`previous` を `serde_json::Value` として TS へ
  `any` 相当（`JsonValue`）でエクスポートするため、`ts-rs` の
  `serde-json-impl` feature を `rust-core/Cargo.toml` へ追加した。
- IPC 配線・`historySlice.ts` の書き換えは R4-8 のスコープであり本バッチでは
  行っていない。

## R4-7 への引き継ぎ

- 構造コマンド（AddObject/RemoveObject/ReorderLayer/Filter 系/SetCamera/
  SetStageCamera3D）は `Command` enum に新バリアントとして追加する形で
  拡張できる（`apply_command`/`invert` の `match` に腕を足すだけ）。
- `known_field_names`（`command.rs`）のスキーマベース検証パターンは
  構造コマンドにはそのまま使えない（フィールド単位の検証ではなく
  オブジェクトの追加/削除/並び替えという別種の妥当性検証が要る）ため、
  R4-7 では別途設計する。
