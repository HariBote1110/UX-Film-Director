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

# R4-7: 構造コマンド（第二層）の実装

## Decision

- 第二層として `AddObject`/`RemoveObject`（`useStore.ts` の `addObject`/
  `deleteObject`）、`SetLayerState`/`ReorderLayers`（`layerSlice.ts`）、
  `AddFilter`/`RemoveFilter`/`ToggleFilterEnabled`/`MoveFilter`/
  `UpdateFilterParams`（`filterStack.ts` の 5 編集操作）、`SetCamera`/
  `SetStageCamera3D`（`useStore.ts` のカメラ操作）を追加した。
- **AddObject/RemoveObject の index 対称性**: どちらも `index: usize` を
  持ち、`invert(AddObject{object,index}) == RemoveObject{object_id,
  removed:object,index}`、その逆も同様。`RemoveObject` は「`index` の位置に
  `object_id` が実在すること」を検証してから削除する（`IndexMismatch` で
  拒否）。これにより remove→undo が厳密に元の位置へ戻ることを proptest
  （`add_object_undo_restores_scene_for_any_insert_index`/
  `remove_object_undo_restores_scene_for_any_real_index`）で固定した。
  TS 側の `addObject` は常に末尾追加（`index == objects.length`）、
  `deleteObject` は id フィルタで位置を意識しないが、コマンド自体は
  任意位置を許容する（R4-8 配線時、`addObject` は `objects.length` を、
  `deleteObject` は削除前の `findIndex` 結果を渡せばよい）。
- **SetLayerState vs ReorderLayers の使い分け**: `layerSlice.ts` の
  `setLayerName`/`toggleLayerVisibility`/`toggleLayerLock` は「1 レイヤーの
  `LayerState`（3 フィールドの軽量な値）を丸ごと差し替える」操作のため、
  フィールド単位の汎用パスを別途設けず `SetLayerState{index,next,previous}`
  の丸ごと swap とした。一方 `swapLayerTracks`/`insertLayerTrackAt`/
  `deleteLayerTrackAt`（`src/utils/layerTrackOps.ts` 実装）は、レイヤー
  入れ替え・挿入・削除のたびに全オブジェクトの `layer` フィールド（PSD の
  lipSync ターゲットや audio_visualization の targetLayer も含む）を
  再計算し、挿入で `MAX_LAYERS` を超えるオブジェクトを削除するといった
  複雑な副作用を持つ。この複雑なリマップロジックを Rust 側で再実装すると
  TS 側の実装と挙動がずれるリスクが高いため、`historySlice.ts` の
  `pushHistory`/`undo`/`redo` が既に採用している「変更前後の全状態を
  スナップショットして丸ごと差し替える」方式を踏襲し、
  `ReorderLayers{previous_layers,next_layers,previous_objects,
  next_objects}` という全 layers+objects 差し替えコマンドとした
  （呼び出し側 TS が `layerTrackOps.ts` の計算結果をそのまま渡す前提。
  Rust 側で `layerTrackOps.ts` 相当のロジックを再実装するのは R4-7 の
  スコープ外と判断した）。
- **フィルタコマンド 5 種**: `filterStack.ts` の
  `addFilterToObject`/`removeFilterFromObject`/
  `toggleFilterEnabledInObject`/`moveFilterInObject`/
  `updateFilterParamsInObject` にそれぞれ対応する。
  - `AddFilter`/`RemoveFilter` は `AddObject`/`RemoveObject` と同じ
    index-symmetry パターン（`index` は `AddFilter` では 0..=len、
    `RemoveFilter` では実在検証つき）。TS の `addFilterToObject` は常に
    末尾追加だが、コマンドとしては `invert(RemoveFilter)` の復元用に
    任意位置を許容する。
  - `ToggleFilterEnabled` は TS の `!filter.enabled` と同じ「同じコマンドを
    もう一度 apply すれば元に戻る」自己逆操作。`invert()` は同一の
    `Command` を返す。
  - `MoveFilter{object_id,filter_id,from_index,to_index}` は TS の
    `direction: 'up'|'down'` ベースではなく、クランプ済みの具体的な
    index 対を持つ（`SetObjectField` の「呼び出し側が最終値を明示する」
    設計を踏襲）。理由: direction ベースだと「端で無操作にクランプされた
    move」を invert する際に direction を単純に反転させただけでは、
    無操作だったはずの move が実際に動いてしまい round-trip が壊れる
    （例: index 0 で `up` が無操作のとき、素朴に invert して `down` を
    apply すると index 1 へ動いてしまう）。**意図的なクランプ**:
    `from_index == to_index` は「既に端で移動しない」正当な無操作として
    許可し `CommandError` にしない（`apply_command` はシーンを変更せず
    `Ok` を返す）。TS 側で `direction` をコマンドへ変換する際は、
    クランプが働く場合は `to_index = from_index` を渡せばよい。
  - `UpdateFilterParams{object_id,filter_id,next,previous}` は
    `SetObjectField` と同じ「`next`/`previous` は変更されたキーのみを
    含む部分パッチオブジェクト」のパターン。`params` オブジェクトへ
    `next` をキー単位でマージしてから `ObjectFilter` へ逆直列化する
    （`updateFilterParamsInObject` の `{ ...filter.params, ...paramsPatch }`
    と同じマージ意味論）。
- **SetCamera/SetStageCamera3D**: `CameraState`/`StageCamera3D` は
  それぞれ 4 フィールド/2 フィールドの値型で、UI 側にフィールド単位の
  部分編集ニーズがない（カメラ操作は毎フレーム全体を再計算する）ため、
  `SetObjectField` 的な汎用パスを設けず丸ごと swap とした。

## エラー種別の追加

`CommandError` に `DuplicateObjectId`（Add 系の id 重複）、
`IndexOutOfRange`（Add/Remove/SetLayerState/フィルタ系の範囲外 index）、
`IndexMismatch`（Remove 系の index に実在する id が一致しない —
「index はコマンド発行時点の位置」という楽観的コマンドの前提が崩れた
ケースを検出する）、`FilterNotFound`（未知 filter_id）、
`InvalidFilterPatch`（`UpdateFilterParams` の型不一致）を追加した。

## テストカバレッジ

`rust-core/tests/command_undo.rs` に単体テスト 19 件（各コマンドの
apply→invert 往復、拒否系: 重複 id / 範囲外 index / id 不一致 / 未知
filter_id）と proptest 3 件（AddObject の任意挿入位置、RemoveObject の
任意実在位置、MoveFilter の任意 from/to 組）を追加。全 28 テスト green。

## R4-8 への引き継ぎ

- `historySlice.ts`/`useStore.ts`（addObject/deleteObject）/
  `layerSlice.ts`/`filterStack.ts` を実際にコマンド発行へ書き換える配線
  は R4-8/R4-9 のスコープ。特に `ReorderLayers` は `layerTrackOps.ts` の
  計算結果をそのまま渡す設計のため、TS 側の当該ロジック自体は R4-7 では
  一切変更していない（意図的にスコープ外）。
