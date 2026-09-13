# P1b Rust editable-scene builder

## Decision

- `EditableSceneGraph` と `build_evaluation_scene` を `rust-core` に追加し、P0 の
  cross-object 契約12ケース（audio、GetColor、PSD active layer、group control、
  proxy/original）を Rust の純粋関数で構築・比較する。
- 常駐 builder の resolver 時刻は、現行 `buildEditableRustScene` と同じく各 object の
  `startTime` とした。`evaluationTimeSeconds` は P1c の direct 経路を受けるための
  context に予約しており、P1b の常駐出力には使わない。
- 未移植 kind/feature は `unsupportedObjectType` または `unsupportedFeature`
  diagnostic を返し、media/clip を静かに捏造しない。実装済みの resident 経路は
  全 generated kind、fade/effects、position keyframes、wipe、subject crop である。

## Alternatives

- source JSON の文字列比較は key 順と `1`/`1.0` の表現に依存するため却下し、JSON
  構造として比較した。
- 時刻を graph 全体の任意時刻で解決する案は、常駐 TS 実装と出力が変わるため P1c
  まで採用しない。

## Constraints / Gotchas

- audio の direct ID は時間外でも選ぶが、layer fallback は半開区間内だけを選ぶ。
- GetColor は path 優先、object ID 不一致時に layer fallback しない。PSD active IDs
  は有効なものだけをソートする。
- group control は visible な object を layer 順に見て、control より上の一意な
  `layer-N` を対象にする。`targetLayerCount: 0` は全上側である。
- `Clip.subject_crop` は `rust-core/src/schema.rs:396` の
  `#[serde(default, skip_serializing_if = "Option::is_none")]`、
  `SceneMediaReference.active_layer_ids` は
  `rust-core/src/solid_colour_scene.rs:24` の
  `#[serde(default, skip_serializing_if = "Vec::is_empty")]` である。native-overlay
  は N-API object payload（`native-overlay/src/lib.rs:201-208`）で JSON serde
  deserializer を持たず、`unwrap_or_default()`（同:4300）で省略値を受ける。
  native-wgpu-renderer はこれらの scene envelope を deserialize せず、
  rust-backend が `SceneMediaReference` を deserialize する入口
  （`rust-backend/src/scene.rs:8-18`）で Rust core の serde default が適用される。
  したがって空の crop/active IDs を省略する変更は既存 consumer と互換である。
- `npm run fixture:evaluation-parity` は 3 scene / 447 frame を生成し、各 fixture に
  TS `buildEditableRustScene` の graph・Project・media を保存する。Rust parity test
  は 3 scene、34 kind（重複を除く）を比較し、診断ゼロを要求する。現在の generator
  は既存 realistic シーンで 42 kind を網羅していないため、42 kind 全 coverage
  scene と P1c の runtime cut-over は未完了である。
- 残作業は、TS serializer の clamp/default まで含む全42 kindの厳密なcanonical
  source（現在は schema fields の直接 JSON 化で、特殊 clamp を要する一部kindは
  未確認）、`smart_clipping`/`auto_blur`/`vibration`/dynamic gradient の resident
  effect移植、および42 kind coverage scene の追加である。これらは現在
  `unsupportedFeature` diagnostic として clip を出力しないため、未確認の値が
  valid-looking output に混入することはない。
