# P1b Rust editable-scene builder

## Decision

- `EditableSceneGraph` と `build_evaluation_scene` を `rust-core` に追加し、P0 の
  cross-object 契約12ケース（audio、GetColor、PSD active layer、group control、
  proxy/original）を Rust の純粋関数で構築・比較する。
- 常駐 builder の resolver 時刻は、現行 `buildEditableRustScene` と同じく各 object の
  `startTime` とした。`evaluationTimeSeconds` は P1c の direct 経路を受けるための
  context に予約しており、P1b の常駐出力には使わない。
- resident eligibility は TS と同じ40 visual typeとfeature guardで判定し、診断コードは
  `unsupportedObjectType` / `unsupportedGroup` / `unsupportedVideoMode` /
  `unsupportedMask` / `unsupportedFilter` / `unsupportedGetColorSampleSource` を使う。
  `BuiltEvaluationScene.residentEligible`（診断が空の場合true）はTSの`ok`に対応する。
  一方、canonical `media` は40種の全visual objectについて生成し、resident eligibilityと
  media availabilityを別の結果として扱う。不適格objectはmediaを保持したままclipを作らない。

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
- `npm run fixture:evaluation-parity` は3 scene / 447 frameを比較し、装飾付きTextの内部
  source metadata、拡張media寸法、補正translationを含むRust/TS parityを維持する。別 fixture
  `all-object-types.json` は42 TimelineObject kindを各1オブジェクト含む。そのうちaudioと
  group_controlを除く40 visual typeがresident clipを持ち、audioは音声参照、group_controlは
  clipを持たない制御として扱う。27 generated visual typeのうちaudio_visualizationと
  audio_sphereは既対応で、追加した25型はbarcode、puzzle_piece、colour_wheel、gourd、gear、
  track_bar、pie_chart、histogram、tone_curve、sphere_dots、spherical_field、sunburst、
  circular_arrow、triangle_bracket、tartan_check、houndstooth、yagasuri、paper_airplane、
  asanoha_pattern、focus_lines_plus、random_line_ex、contour_trace、displacement_poly、
  plain_effector_line、protractorである。
- coverage fixtureは全42型のTS結果、40 visual型のresident Project、全visual mediaを別々に
  保存する。Rust側でeligibility/diagnostics、clip kindとProject全field、media sourceと寸法を
  比較し、25追加型の専用testでも各clipの存在とnative kindを固定する。診断の比較はTSの
  順序を仕様化せず、object IDとcodeの組をソートする。
- 再生成した `all-object-types.json` を実配列から集計すると、objectは42件（visual 40件、
  audio 1件、group_control 1件）、resident track/clipは各40件。25追加型すべてにclipがあり、
  既対応visual型と合わせて全visual objectがresident Projectに残る。
- 27 generated type には境界値・空値を投入した。particle、barcode、puzzle piece、
  colour wheel、gourd、gear は最小値、track bar と tone curve は空配列、pie chart、
  histogram、sphere dots、spherical field、sunburst、circular arrow、triangle
  bracket、tartan check、houndstooth、yagasuri、paper airplane、asanoha、focus lines
  plus、random line EX、contour trace、displacement poly は最小値・ゼロ値、plain
  effector line / hologram / protractor は範囲外値と不正 colour を投入した。これに
  より明示 clamp、既定値、colour fallback、空配列 wire shape を検証する。
- coverage fixture の drift testも追加した。resident type coverageと区別して残る制約は、
  dynamic group gradient、逆再生video、mask、shape以外のgradient、外部参照が必要な
  GetColor sourceである。これらのguardは今回解除していない。

## P2 resident Vibration

- `Effect::Vibration { strength, speed }` を resident Project 内の動的offset運搬子として追加。
  enabled filtersの順序を保って保持し、Rust `evaluate_frame` がabsolute scene seconds
  (`frame_index / fps`) と `index * 1.618` phaseで積算する。評価後effectsから必ず除去し、
  clip translationにはgroup transform合成後・Text render-origin補正前に加える。
- 純計算は `rust-core/src/vibration.rs::evaluate_vibration_offset` に集約し、Rust timelineと
  P4 position queryの双方から呼べる公開helperにした。TS direct snapshotは既存の
  `getVibrationOffset` を引き続き参照実装として使う。旧legacy `BaseObject.vibration` も同じ
  enabled-filter解決経由でresident effectに変換する。
- `vibration-resident.json` はstart/end外・境界・group開始/終了を含む9 frameをTS directと
  resident Rust評価で比較する。Text stroke/shadowによる拡張plane、複数段/disabled/zero
  strength/zero speed vibration、group rotation/scale、Wipe effect indexを同時に固定。従来3 fixture
  の447 frameは変更なし。未評価Effectがnative wgpu、backend IPC、reference rendererに届いた場合は
  unsupported errorで拒否する。
