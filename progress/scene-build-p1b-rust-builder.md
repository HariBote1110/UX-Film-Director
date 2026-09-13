# P1b Rust editable-scene builder

## Decision

- `EditableSceneGraph` と `build_evaluation_scene` を `rust-core` に追加し、P0 の
  cross-object 契約12ケース（audio、GetColor、PSD active layer、group control、
  proxy/original）を Rust の純粋関数で構築・比較する。
- 常駐 builder の resolver 時刻は、現行 `buildEditableRustScene` と同じく各 object の
  `startTime` とした。`evaluationTimeSeconds` は P1c の direct 経路を受けるための
  context に予約しており、P1b の常駐出力には使わない。
- 未移植 kind は `unsupportedObjectType` diagnostic を返し、media/clip を静かに
  捏造しない。

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
- P1b 時点では canonical serializer を移植済みなのは shape/image/video/PSD/text、
  audio_visualization/audio_sphere/getcolor_dot_field のみである。残る particle と
  barcode 以降の生成kind（および resident effects、keyframes、subject crop）は
  diagnostic または未完全な評価用clipになるため、P1c cut-over の対象にしてはならない。
