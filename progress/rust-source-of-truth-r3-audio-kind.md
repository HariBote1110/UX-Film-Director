# R3 五番目のスライス: `audio` kind の編集モデルを rust-core へ移す

## Decision

- `rust-core/src/schema.rs` に `AudioObjectFields`（`src` / `filePath` /
  `volume` / `muted` / `labData`）を追加した。`shape`/`text`/`image`/`video`
  と同じく編集モデルは TS 側の既存命名（camelCase）を保つため各フィールドに
  `#[serde(rename = ...)]` / `#[ts(rename = ...)]` を付けた。
- `labData` の要素型として新規に `AudioLabPhoneme`（`startTime` / `endTime` /
  `phoneme`）を追加した。`src/utils/labParser.ts` の手書き `LabPhoneme`
  interface に対応する型で、`audio` kind 以外からは参照されない専用データ
  （grep で確認済み）のため、共有型ルールには当たらず生成型へ完全移行した。
- `AudioObjectFields::default()` は video と同じ二段構えにした。`src`/
  `filePath` は Timeline.tsx の `handleAudioChange`
  （`src/components/Timeline.tsx:411` 付近）がファイル選択後の実データから
  その場で決めるため、対応する固定既定値が UI 側に存在せず、ニュートラルな
  空値（`""`/`None`）にした。一方 `volume: 1.0`/`muted: false`
  （同ファイル 398 行目・422 行目、`handleAudioChange` が常に書く固定
  リテラル）は「今日のアプリに実在する既定値」なので shape/text/video と
  同じ方針で `Default` にそのまま採用した。`labData` は生成時に指定されない
  省略可能フィールドのため `None`。
- `src/types.ts` の `AudioObject` は
  `BaseObject & AudioObjectFields & { type: 'audio' }` に縮めた。手書きの
  `interface AudioObject` は削除し、`import { LabPhoneme } from
  './utils/labParser'` も不要になったため削除した。
- `src/utils/labParser.ts` の手書き `interface LabPhoneme` は
  `export type LabPhoneme = AudioLabPhoneme;`（生成型からの re-export）に
  置き換えた。`parseLabFile`/`phonemeToViseme` のロジックは無変更。

## Alternatives considered

- **wire 統一（stage 3）を実施する**: 却下。`rustSceneSnapshot.ts` の
  `mediaReferenceForObject`/`isSupportedSceneObject` はどちらも `audio` を
  対象にしていない（`isVisualSceneObject` は明示的に
  `object.type !== 'audio'` として除外している）。`audio` kind 専用の
  `serialiseAudioSource` のようなワイヤー変換関数は存在せず、`audio` は
  そもそも rust-core のシーン評価パイプラインに乗らない（音声再生は別経路）。
  したがって型移送のみで完結する image/video と同じパターンで、wire 統一の
  作業自体が発生しない。
- **`serialiseGeneratedAudioWaveformSource`（`rustSceneSnapshot.ts:1434`
  付近）をこのスライスで扱う**: 却下。この関数は `audio_visualization`
  kind（`GeneratedAudioWaveform`）専用で、`AudioVisualizationObject` を
  引数に取る。`audio` kind（本スライスの対象）とは異なる別の TimelineObject
  種別であり、`findTargetAudioForGeneratedAudio` で参照先の `audio`
  オブジェクトを検索して `mediaSourceForObject`（生パス文字列）を渡すだけの
  関係。`audio_visualization`/`audio_sphere` はどちらも将来の別スライスで
  扱うべき生成系 kind であり、今回は無変更・現状追認のみとした。
- **`LabPhoneme` を `audio` kind 固有ではなく汎用ユーティリティ型として
  手書き維持する**: 却下。grep で `LabPhoneme` の参照元が
  `src/types.ts`（`AudioObject.labData`）と `src/utils/labParser.ts`
  自身のみであることを確認済み。他 kind・他モジュールから参照されない
  ため、shape の `GradientFill` のような「共有型は手書き維持」ルールには
  該当せず、video の `SubjectCropNormKeyframe` と同じく生成型へ完全移行
  する方針を適用した。

## Constraints / Gotchas

- **`audio` は image/video と同じく wire 統一（stage 3）が不要と確認した
  ものの、理由が異なる。** image/video は「wire 型はあるが JSON 化されて
  おらず生パス文字列を返すだけ」で不要だったのに対し、`audio` は
  「rust-core のシーン評価対象そのものに含まれない」ため、
  `mediaReferenceForObject`/`mediaSourceForObject` のどちらの分岐にも
  `object.type === 'audio'` が現れない。したがってこれらの関数は今回
  一切変更していない。
- **`projectFile.ts` の永続化ロジックは無変更で問題ないことを確認した。**
  `restoreObjectFromProject`（`src/utils/projectFile.ts:845`）に
  `obj.type === 'image' || obj.type === 'video' || obj.type === 'audio'`
  という分岐があるが、`filePath` から `src` を `toFileProtocolUrl` で
  復元するだけの既存ロジックで、フィールド名・構造とも今回の型移送で
  変わっていない。ワイヤーが壊れる変更は無い。
- **`codegen_types.rs` への登録漏れに注意。** `rust-core/src/schema.rs` に
  型を追加しただけでは `npm run codegen:types` の出力に現れない。
  `write_ts_bindings`（`export_all` 呼び出し）と `write_json_schemas`
  （`write_schema` 呼び出し）の両方に `AudioObjectFields` /
  `AudioLabPhoneme` を追記し、`lib.rs` の re-export リストにも追加する
  必要があった（shape/text/image/video でも同じ3箇所、今回で5回目の
  同じ手順）。

## 実測

| 合格条件 | 結果 |
|---|---|
| `npx tsc --noEmit` | エラー 0 |
| `cargo test --manifest-path rust-core/Cargo.toml` | 全 pass |
| `cargo test --manifest-path rust-backend/Cargo.toml --bin uxfd-rust-backend` | 158 tests pass |
| `npm run codegen:types:check` | exit 0（生成物は最新のまま） |
| `npm run fixture:evaluation-parity` → `cargo test --test ts_evaluation_parity` | fixture 差分ゼロ、pass |
| `KNOWN_DIFFERENCES.json` | `differences: []` のまま（変化なし） |
| `npx vitest run`（全スイート） | 252 files / 1833 tests pass |

## 次段階（生成系 kind の一括移行）への申し送り

`shape`/`text`/`image`/`video`/`audio` の 5 kind で R3 の「基本パターン」の
移送は完了した。残る 34 の生成系 kind（`Rust_Source_Of_Truth_Plan.md` R3 の
「GetColor / hksy / 93-series」）は、いずれも `mediaReferenceForObject` に
専用の `serialiseGeneratedXxxSource` を持つため、**全件 wire 統一（stage 3）
が必要な kind 群**（shape と同じパターン）。以下は
`src/utils/rustSceneSnapshot.ts` の関数一覧とおおよそのフィールド数
（`BaseObject` 共通フィールドを除いた kind 固有フィールド数、`interface Xxx
extends BaseObject { ... }` を機械的にカウント）:

| kind (TimelineObject type) | serialise 関数 | 固有フィールド数（目安） |
|---|---|---|
| `audio_visualization` | `serialiseGeneratedAudioWaveformSource` | 9 |
| `audio_sphere` | `serialiseGeneratedAudioSphereSource` | 15 |
| `particle` | `serialiseGeneratedParticleSource` | 10 |
| `barcode` | `serialiseGeneratedBarcodeSource` | 9 |
| `puzzle_piece` | `serialiseGeneratedPuzzlePieceSource` | 7 |
| `colour_wheel` | `serialiseGeneratedColourWheelSource` | 8 |
| `gourd` | `serialiseGeneratedGourdSource` | 9 |
| `gear` | `serialiseGeneratedGearSource` | 9 |
| `track_bar` | `serialiseGeneratedTrackBarSource` | 8 |
| `pie_chart` | `serialiseGeneratedPieChartSource` | 10 |
| `histogram` | `serialiseGeneratedHistogramSource` | 12 |
| `tone_curve` | `serialiseGeneratedToneCurveSource` | 9 |
| `getcolor_dot_field` | `serialiseGeneratedGetColorDotsSource` | 21（最大） |
| `hksy_checker_grid` | `serialiseGeneratedHksyCheckerGridSource` | 17 |
| `region_frame` | `serialiseGeneratedRegionFrameSource` | 11 |
| `simple_tube` | `serialiseGeneratedSimpleTubeSource` | 17 |
| `sphere_dots` | `serialiseGeneratedSphereDotsSource` | 15 |
| `spherical_field` | `serialiseGeneratedSphericalFieldSource` | 15 |
| `sunburst` | `serialiseGeneratedSunburstSource` | 12 |
| `circular_arrow` | `serialiseGeneratedCircularArrowSource` | 13 |
| `triangle_bracket` | `serialiseGeneratedTriangleBracketSource` | 8 |
| `tartan_check` | `serialiseGeneratedTartanCheckSource` | 9 |
| `houndstooth` | `serialiseGeneratedHoundstoothSource` | 6（最小） |
| `yagasuri` | `serialiseGeneratedYagasuriSource` | 9 |
| `paper_airplane` | `serialiseGeneratedPaperAirplaneSource` | 10 |
| `asanoha_pattern` | `serialiseGeneratedAsanohaPatternSource` | 7 |
| `focus_lines_plus` | `serialiseGeneratedFocusLinesPlusSource` | 13 |
| `random_line_ex` | `serialiseGeneratedRandomLineExSource` | 10 |
| `contour_trace` | `serialiseGeneratedContourTraceSource` | 9 |
| `displacement_poly` | `serialiseGeneratedDisplacementPolySource` | 12 |
| `plain_effector_line` | `serialiseGeneratedPlainEffectorLineSource` | 13 |
| `hologram` | `serialiseGeneratedHologramSource` | 8 |
| `protractor` | `serialiseGeneratedProtractorSource` | 11 |
| `shaking_polygon` | `serialiseGeneratedShakingPolygonSource` | 15 |
| `shattered_sphere` | `serialiseGeneratedShatteredSphereSource` | 19 |

合計 34 kind。フィールド数がおおむね 6〜21 とばらつき、`shape`
（当時 wire 統一を伴った最初のスライス）で確立した「型移送 + rust-backend
側の手書き `GeneratedXxxSource` を `XxxObjectFields` の直接デシリアライズへ
統一 + `serialiseGeneratedXxxSource` をパススルーへ縮小」という3点セットの
作業が、kind ごとに 1 コミットの原則で 34 回繰り返されることになる。
フィールド数の小さいもの（`houndstooth`=6, `asanoha_pattern`=7,
`puzzle_piece`=7, `triangle_bracket`=8, `colour_wheel`=8,
`track_bar`=8, `hologram`=8）から着手し、パターンを再確認しながら
`getcolor_dot_field`（21・最大）のような複雑なものへ進める順が安全。
`audio_visualization`/`audio_sphere` は `findTargetAudioForGeneratedAudio`
経由で今回移行した `AudioObjectFields`/`mediaSourceForObject` を参照する
ため、この2つを移行する際は `audio` の型が既に rust-core 正本になっている
前提を踏まえて良い（依存関係の向きは `audio` → `audio_visualization`/
`audio_sphere` で、逆方向の依存は無い）。
