# R3 四番目のスライス: `video` kind の編集モデルを rust-core へ移す

## Decision

- `rust-core/src/schema.rs` に `VideoObjectFields`（`src` / `filePath` /
  `proxyFilePath` / `sourceWidth` / `sourceHeight` / `width` / `height` /
  `volume` / `muted` / `subjectCropEnabled` / `subjectCropKeyframes` /
  `reversed`）を追加した。`shape`/`text`/`image` と同じく編集モデルは TS 側の
  既存命名（camelCase）を保つため各フィールドに `#[serde(rename = ...)]` /
  `#[ts(rename = ...)]` を付けた。
- `subjectCropKeyframes` の要素型として新規に `SubjectCropNormKeyframe`
  （`id` / `time` / `x` / `y` / `width` / `height`）を追加した。既存の
  `schema::SubjectCropKeyframe`（`frame_offset` ベースの評価用ワイヤー型、
  `timeline.rs`/`keyframe.rs` が使う）とは**別物**。編集モデル側は
  タイムライン秒 `time` と `id` を持つ正規化座標のキーフレームで、
  評価用の型と構造が異なるため名前を分けて共存させた。
- `VideoObjectFields::default()` は `image` と同じ二段構えにした。
  `src`/`filePath`/`proxyFilePath`/`sourceWidth`/`sourceHeight`/`width`/
  `height` は Timeline.tsx の `handleVideoChange`
  （`src/components/Timeline.tsx:393` 付近）がファイル選択後の実データから
  その場で決めるため、対応する固定既定値が UI 側に存在せず、ニュートラルな
  空値（`""`/`None`/`0.0`）にした。一方 `volume: 1.0`/`muted: false` は
  同じ生成コードが常に固定リテラルとして書いており、これは
  「今日のアプリに実在する既定値」なので shape/text と同じ方針で
  `Default` にそのまま採用した（image にはこの種のフィールドが無かった）。
  `subjectCropEnabled`/`subjectCropKeyframes`/`reversed` はいずれも
  生成時に指定されない省略可能フィールドのため `None`。
- `src/types.ts` の `VideoObject` は
  `BaseObject & VideoObjectFields & { type: 'video' }` に縮めた。手書きの
  `interface VideoObject` と `interface SubjectCropNormKeyframe` は削除し、
  後者は生成型からの re-export（`export type { SubjectCropNormKeyframe }`）
  に置き換えた。

## Alternatives considered

- **`SubjectCropNormKeyframe` を既存の `schema::SubjectCropKeyframe` と
  統合する**: 却下。前者は編集モデル（`id`/`time` 秒、UI が保存・往復する）、
  後者は評価用ワイヤー（`frame_offset`、`timeline.rs` が読むだけ）で
  役割も構造も異なる。統合すると評価側に不要な `id` フィールドが漏れ出し、
  逆に編集側が `frame_offset` という評価専用の概念を持つことになる。
  R2 の `rust-source-of-truth-r2-subject-crop-double-bake.md` で
  「静的 effects 用の変換」と「rust-core の動的評価」が別経路であることが
  既に判明しており、型を分けたまま維持するのがその設計と整合する。
- **`volume`/`muted` もニュートラル既定値（`0.0`/`false` のうち volume だけ
  未確定扱い）にする**: 却下。image の Decision は「対応する既定値が
  UI に存在しない」ことが理由だったが、`volume`/`muted` は
  `handleVideoChange` が常に `1.0`/`false` を書く実在の既定値であり、
  image とは前提が異なる。shape/text の Default 方針（UI が今日生成している
  既定値と一致させる）をそのまま適用するのが筋が通っている。

## Constraints / Gotchas

- **video も image と同じく wire 統一（stage 3）は実質不要と確認した。**
  `rustSceneSnapshot.ts` の `mediaReferenceForObject` に `video` 専用の
  `serialiseXxxSource` は無く、`mediaSourceForObject`
  （`rustSceneSnapshot.ts:2079` 付近、`previewProxy`/`exportOriginal` の
  `videoSourceMode` で `proxyFilePath` か `src`/`filePath` を選ぶ分岐）は
  最終的に生のファイルパス文字列を返すだけで JSON 化されたワイヤー型は
  存在しない。`source_rate`（`fpsToFrameRate(projectFps)`、
  `rustSceneSnapshot.ts:1333`）は `RustSceneMediaReference` 全体への付加
  フィールドであり、`source` 文字列自体の一部ではないため、今回の型移送とは
  無関係（無変更）。したがって `mediaReferenceForObject`/`mediaSourceForObject`
  は今回一切変更していない。
- **subject crop の動的評価ロジック（`subject_crop` フィールド経由の
  `evaluate_subject_crop_keyframes`）と、R2 で修正済みの二重焼き込みバグ
  （`editableRustScene.ts` の `includeSubjectCrop: false`）は今回無変更。**
  型定義（`SubjectCropNormKeyframe`）を移しただけで、
  `subjectCropForObject`/`rustEffectsForObject` の評価・分岐ロジックは
  一切触っていない。`fixture:evaluation-parity` 再生成後も
  `KNOWN_DIFFERENCES.json` は `differences: []` のまま変化なし
  （= 挙動が変わっていないことの実測による確認）。
- **`normaliseSubjectCropKeyframesForVideo`（`src/utils/subjectCropKeyframes.ts:24`）
  の引数型を `SubjectCropNormKeyframe[] | undefined` から
  `SubjectCropNormKeyframe[] | null | undefined` に広げる必要があった。**
  生成型の `subjectCropKeyframes?: Array<SubjectCropNormKeyframe> | null`
  は `filePath?: string | null` と同じ ts-rs の `Option<T>` 既知の癖
  （R1/shape/text/image で繰り返し観測済み）で、`null` も許容される。
  `editableRustScene.ts:206` の呼び出しが型エラーになったため、
  呼び出し側ではなく関数シグネチャ側を広げて対処した（呼び出し側の
  ロジックは無変更）。
- **`codegen_types.rs` への登録漏れに注意。** `rust-core/src/schema.rs` に
  型を追加しただけでは `npm run codegen:types` の出力に現れない。
  `write_ts_bindings`（`export_all` 呼び出し）と `write_json_schemas`
  （`write_schema` 呼び出し）の両方に `VideoObjectFields` /
  `SubjectCropNormKeyframe` を追記し、`lib.rs` の re-export リストにも
  追加する必要がある（shape/text/image でも同じ3箇所）。

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

## 次の kind（`audio`）への申し送り

- `audio` の `src/types.ts` を見ると `src`/`filePath`/`volume`/`muted`/
  `labData`（`LabPhoneme[]`）のみで、video の複雑さ（proxy/subject crop/
  reversed/source_rate）は無い。`mediaReferenceForObject` に `audio` 専用の
  `serialiseXxxSource` があるかどうかは image/video と同じ手順で機械的に
  確認すること（今のところ無い可能性が高いが要現地確認）。
- `LabPhoneme` は `src/utils/labParser.ts` からの import で、他 kind
  （video の `SubjectCropNormKeyframe` 相当）と同様に rust-core へ
  型を新規追加する必要があるかどうか、先に構造を確認すること。
- 「wire 統一が要るかどうか」の判定手順（image/video で確立）:
  `mediaReferenceForObject` にその kind 専用の JSON 化ワイヤー型を返す
  関数があるか grep で確認する。無ければ型移送のみで完結する。
