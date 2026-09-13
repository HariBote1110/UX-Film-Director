# P1b Rust editable-scene builder

## Decision

- `EditableSceneGraph` と `build_evaluation_scene` を `rust-core` に追加し、P0 の
  cross-object 契約12ケース（audio、GetColor、PSD active layer、group control、
  proxy/original）を Rust の純粋関数で構築・比較する。
- 常駐 builder の resolver 時刻は、現行 `buildEditableRustScene` と同じく各 object の
  `startTime` とした。`evaluationTimeSeconds` は P1c の direct 経路を受けるための
  context に予約しており、P1b の常駐出力には使わない。
- 未移植 feature は `unsupportedFeature` diagnostic を返し、media/clip を静かに
  捏造しない。全42 object type の canonical media serializer parity は coverage
  fixture で検証済みであり、object type 診断は残っていない。

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
- `npm run fixture:evaluation-parity` は既存の 3 scene / 447 frame を byte-identical
  に維持する。別 fixture `all-object-types.json` は全42 typeを各1オブジェクト含み、
  TS canonical media と Rust の Project/media を比較する。verified は
  `text、shape、image、video、audio、psd、group_control、audio_visualization、audio_sphere、particle、barcode、puzzle_piece、colour_wheel、gourd、gear、track_bar、pie_chart、histogram、tone_curve、hksy_checker_grid、getcolor_dot_field、region_frame、simple_tube、sphere_dots、spherical_field、sunburst、circular_arrow、triangle_bracket、tartan_check、houndstooth、yagasuri、paper_airplane、asanoha_pattern、focus_lines_plus、random_line_ex、contour_trace、displacement_poly、plain_effector_line、hologram、protractor、shaking_polygon、shattered_sphere` の42種、still-diagnosed は空集合である。
- Project parity は手書き期待値ではなく、実際の TS `buildEditableRustScene` の出力を
  fixture に保存して Rust と比較する（現行 TS builder が受理する V1 対象と group
  control）。42 型全体の media は同じ TS canonical serializer で別比較する。
- 27 generated type には境界値・空値を投入した。particle、barcode、puzzle piece、
  colour wheel、gourd、gear は最小値、track bar と tone curve は空配列、pie chart、
  histogram、sphere dots、spherical field、sunburst、circular arrow、triangle
  bracket、tartan check、houndstooth、yagasuri、paper airplane、asanoha、focus lines
  plus、random line EX、contour trace、displacement poly は最小値・ゼロ値、plain
  effector line / hologram / protractor は範囲外値と不正 colour を投入した。これに
  より明示 clamp、既定値、colour fallback、空配列 wire shape を検証する。
- coverage fixture の drift test も追加した。未検証として残るのは
  `smart_clipping`/`auto_blur`/`vibration`/dynamic gradient の resident effect、
  および TS editable builder 自体がまだ Project 化しない generated 27 型の
  editable Project parity である。
