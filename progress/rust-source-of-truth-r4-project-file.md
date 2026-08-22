# R4-1a: ファイル形式スキャフォールディング（BaseObject / TimelineObject）

## 決定
- `src/types.ts` の `BaseObject`（全 TimelineObject kind 共通フィールド）を
  `rust-core/src/schema.rs` に `BaseObject` struct として追加した。`?:` は
  すべて `Option<...>` + `#[serde(default, skip_serializing_if = "Option::is_none")]`
  でミラーし、フィールド名は既存パターン（`ShapeObjectFields` 等）と同じく
  個別 `#[serde(rename = "...")] #[ts(rename = "...")]` で camelCase を保つ。
- `BaseObject` の構成に必要な新規サブ型を追加: `PathPoint` / `TimelinePositionKeyframe`
  （`BaseObject.keyframes` 用。評価用ワイヤーの既存 `PositionKeyframe`
  〔frame_offset ベース〕とは別ドメインのため名前を分けた）/ `ShadowEffect` /
  `GradientFill` / `ClippingParams` / `ColorCorrection` / `Vibration`。
- `BaseObject.filters: ObjectFilter[]` は 14 種のフィルタを持つ内部タグ付き
  enum（`#[serde(tag = "type")]`）として実装。5 種（`color_correction` /
  `clipping` / `vibration` / `shadow` / `gradient`）は TS 側で
  `Omit<X, 'enabled'>` として定義されているため、対応する `*Params`
  型（`ColorCorrectionParams` 等）を専用に新設した（Rust に `Omit` 相当が
  無いため）。
- `TimelineObject` は 42 kind の内部タグ付き enum（`#[serde(tag = "type")]`）。
  各 variant は `#[serde(flatten)] base: BaseObject` と
  `#[serde(flatten)] fields: XxxObjectFields`（既存 R3 型をそのまま再利用）を
  持つ。TS 側の `BaseObject & XxxObjectFields & { type: 'xxx' }` パターンを
  そのまま Rust の flatten + tag で表現できることを実装・テストで確認した。
- **`BaseObject` からは `type: ObjectType` フィールドを意図的に省いた。**
  内部タグ付き enum の `#[serde(tag = "type")]` が同じ JSON キー `type` を
  判別タグとして専有するため、flatten 対象の構造体が同名フィールドを持つと
  重複することになる（各 variant が自分の kind をタグ自体として保持して
  いるため情報は失われない）。ts-rs の生成物にも `type` フィールドは
  出ない（`BaseObject.ts` 参照）。これはミラー元 TS の `BaseObject.type`
  との唯一の意図的な差分であり、コード内コメントで明記した。
- `SceneData` / `ProjectSettings`（`EditorMode` enum 込み）/ `CameraState` /
  `LayerState` も同バッチで追加。
- `psd` kind の `TimelineObject::Psd` variant は `PsdObjectFields` を
  そのまま使う（R3 バッチCの `PsdObjectFields`）。TS 側の `PsdObject` は
  `rootLayer`/`file`/`layerTree` を独自合成する特別なパターン（既存の
  例外）のため、この enum の `Psd` variant は Rust 側のスキーマ固定用で
  あり、`PsdObject` とバイト互換ではない — これは意図した設計で、
  タスク指示どおり「TS 側は composed `PsdObject` を使い続ける」を守る。

## `serde(flatten)` + `#[serde(tag = "type")]` + ts-rs の検証結果
**結論: 問題なく動作する。** 42 variant すべてが `cargo build` を通り、
`rust-core/tests/timeline_object_schema.rs` の 10 テスト（tag ディスパッチ・
camelCase フィールド名・未知 `type` の拒否・shape/text/image/video/audio/psd/
particle の 7 kind のラウンドトリップ）が green。`codegen_types` の
`TS::export_all` も `BaseObject.ts`/`TimelineObject.ts` を問題なく生成し、
依存するサブ型（`ObjectFilter` 系・`ShadowEffect` 等）も連鎖して書き出した。
`schemars`（`JsonSchema` derive）も同じ構造で問題なくコンパイルできた。

唯一の落とし穴は上記の「flatten 対象に `type` フィールドを含められない」点
のみで、これは `BaseObject.type` を省くことで単純に回避できた。

## `src/types.ts` の再結線について（意図的に見送り）
タスク方針は「shape が変わらず re-export できるものは re-export する」
だったが、R4-1a では **`src/types.ts` を一切変更していない**（生成物の
追加のみ）。理由:
- `BaseObject`/`TimelineObject`/`PositionKeyframe` は `src/store/`・
  `src/agentProject/`・`src/utils/projectFile.ts` など極めて広い範囲から
  参照されており、これらのファイルへの変更はこのバッチのスコープ外と
  明示されている。
- 生成型は shape としては手書き型と一致することを目視確認済み
  （`BaseObject.ts`/`GradientFill.ts` 等を参照）だが、実際に import を
  差し替える作業（と回帰確認）は `projectFile.ts` を含む R4-1b 以降の
  範囲と一体で行うべきと判断した。
- 型レベルの等価性アサーション（`type Assert<T extends true> = T` 的な
  compile-time check）も同じ理由で見送り、R4-1b でまとめて追加する。

## ゲート結果（2026-08-22）
- `npx tsc --noEmit`: 変更なしで green（`src/types.ts` 未変更のため当然）。
- `cargo test --manifest-path rust-core/Cargo.toml`: 全 green（新規
  `timeline_object_schema.rs` 10 件を含む）。
- `cargo test --manifest-path rust-backend/Cargo.toml`: 全 green（既存
  スイートに影響なし）。
- `npm run codegen:types:check`: exit 0（生成物とコミット済みファイルが
  一致）。
- `npm run fixture:evaluation-parity` + `cargo test --test ts_evaluation_parity`:
  447 フレーム比較、`KNOWN_DIFFERENCES.json` は `[]` のまま green。
- `npx vitest run`: 253 files / 1841 tests、ベースラインと完全一致。

## R4-1b への申し送り
- `ProjectFile` 型（`Project`/`SceneData`/`ProjectSettings` を束ねる
  トップレベル型）とバージョン移行ロジックは未着手。
- `src/types.ts` の `BaseObject`/`TimelineObject` 判別共用体・
  `PositionKeyframe`/`ShadowEffect`/`GradientFill`/`ClippingParams`/
  `ColorCorrection`/`Vibration`/`ObjectFilter` を生成型の re-export へ
  実際に差し替える作業（`projectFile.ts` 含む）は R4-1b 以降で行う。
- IPC・`electron/` 側の変更も未着手。

---

# R4-1b: ProjectFile 型・V1→V2 移行・ラウンドトリップ fixture（2026-08-22）

## 決定
- `src/utils/projectFile.ts` の V2 payload（`ProjectFileV2`）を
  `rust-core/src/schema.rs` に `ProjectFile` struct としてミラー。
  `format: String` / `version: u32`（TS 側は型リテラル `'uxfd-project'`/`2`
  だが Rust に文字列/数値リテラル型が無いため、値の妥当性検証は
  `project_file_from_json` の呼び出し側 [将来の IPC 層] に委譲する設計とし、
  R4-1b では型としては素直な `String`/`u32` に留めた）。
  `savedAt`/`projectSettings`/`activeSceneId`/`scenes: Vec<SceneData>` は
  すべて必須（TS 側の `ProjectFileV2` も全フィールド必須のため `Option` 化
  していない）。
- V1 用に `ProjectFileV1`（`format`/`version`/`savedAt`/`projectSettings`/
  `duration`/`layers: Option<Vec<LayerState>>`/`objects`）を追加。
  TS 側 `ProjectFileV1` の `layers?: LayerState[]` は唯一のオプショナル
  フィールドで、Rust 側もそのまま `Option` + `#[serde(default,
  skip_serializing_if = "Option::is_none")]` でミラーした。
  `ProjectFileV1` は移行専用の中間表現であり TS へ直接公開する必要が
  ないため `TS` derive は付けていない（`ProjectFile`/`SceneData` 等の
  既存パターンとは異なる意図的な非対称）。
- `ProjectFileVersioned`（`#[serde(untagged)] enum { V2(ProjectFile),
  V1(ProjectFileV1) }`）で V1/V2 どちらの JSON も受け付ける。V1 の必須
  フィールド集合（`duration`/`objects`）と V2 のそれ（`activeSceneId`/
  `scenes`）が排他的なため、untagged の総当たり判定でも曖昧さは生じない
  （実装順は `V2` を先に試すが、V1 JSON には `activeSceneId`/`scenes`
  が無いため必ず `V2` 側の deserialize が失敗し `V1` へフォールバックする
  ことをテストで確認済み）。
- `From<ProjectFileV1> for ProjectFile` で `src/utils/projectFile.ts` の
  `migrateV1ToV2` を移植。`LEGACY_SCENE_ID = "legacy-scene-1"` /
  `CameraState::default_camera()`（`createDefaultCamera` 相当）/
  `StageCamera3D::default_stage_camera_3d()`（`createDefaultStageCamera3D`
  相当）/ `default_layers()`（`createDefaultLayers`、`MAX_LAYERS = 100`
  を `src/components/timelineConstants.ts` から転記）を新設し、TS 側の
  デフォルト値をすべて忠実にミラーした。`duration` は
  `Number.isFinite` かつ `Math.max(1, ...)` の二重チェックを
  `v1.duration.is_finite() { v1.duration.max(1.0) } else { 30.0 }` として
  移植（Rust 側 `duration: f32` は必須フィールドで欠損しえないが、
  `NaN`/`Infinity` は JSON 上表現できないため実質的には到達しないガードだが
  TS ロジックとの忠実な対応を優先してそのまま残した）。
- `rust-core/src/project_file.rs` に純粋関数
  `project_file_from_json(&str) -> Result<ProjectFile, String>` と
  `project_file_to_json_value(&ProjectFile) -> serde_json::Value` を追加。
  IPC・ファイル I/O・pretty-print は含まない（TS 側の責務のまま）。

## fixture 一覧と発見した不整合
- `rust-core/tests/fixtures/uxfd/realistic-heavy-edit-v2.uxfd.json`
  （`.codex/realistic-heavy-edit-e2e/` から複製、V2、3 シーン）。
- `rust-core/tests/fixtures/uxfd/realistic-heavy-edit-pre-change-v2.uxfd.json`
  （`.codex/realistic-heavy-edit-e2e-archive/pre-change-481a/` から複製、
  V2、同じ編集セッションの別スナップショットで `savedAt`/object id/
  計測値が異なる）。
- `rust-core/tests/fixtures/uxfd/legacy-v1-sample.uxfd.json`
  （TS 側に `migrateV1ToV2` の単体テストが存在しなかったため、上記 V2
  fixture の scene 0 から `objects` 3 件〔video/video/audio〕と
  `layers`/`projectSettings` を抜き出して手作りした V1 fixture）。
- 発見した不整合: **なし（型定義の欠損は 0 件）**。R4-1a で追加した
  `BaseObject`/`TimelineObject`/`SceneData`/`ProjectSettings` 等は
  実 fixture に対してキーの過不足なしで round-trip できた。
- 発見した「不整合ではないが要記録の挙動」: **全数値フィールドが `f32`**
  であるため、実 fixture の f64 精度リテラル（例 `1.03`）は
  round-trip で最終桁が丸まる（`1.0299999713897705` 等）。これは R3/
  R4-1a から続く既存方針（`BaseObject`/各 `XxxObjectFields` はすべて
  `f32`）であり R4-1b のスコープ外のため変更していない。
  `tests/project_file_round_trip.rs` の意味的等価性テストは
  「キーの有無/null/配列長/型は厳密一致、数値は f32 精度での近似一致」
  を判定基準とすることでこの既知の丸めを許容しつつ、本来の目的である
  「フィールドの消失/出現の検出」は保持した。

## ゲート結果（2026-08-22）
- `npx tsc --noEmit`: green（`src/types.ts` 未変更）。
- `cargo test --manifest-path rust-core/Cargo.toml`: 全 green（新規
  `project_file_round_trip.rs` 4 件を含む）。
- `cargo test --manifest-path rust-backend/Cargo.toml`: 全 green。
- `npm run codegen:types:check`: exit 0（`ProjectFile.ts`/`.schema.json`
  を新規生成しコミット、`index.ts` の re-export 追記込みで一致）。
- `npm run fixture:evaluation-parity` + `cargo test --test
  ts_evaluation_parity`: 447 フレーム比較、`KNOWN_DIFFERENCES.json` は
  `[]` のまま green。
- `npx vitest run`: 253 files / 1841 tests、ベースラインと完全一致
  （`src/` 未変更のため当然）。

## R4-2 への申し送り
- IPC（`electron/` の `save-project-file`/`open-project-file` ハンドラを
  `project_file_from_json`/`project_file_to_json_value` 経由にする）は
  完全に未着手。
- `src/utils/projectFile.ts` 側の `parseProjectPayloadV2`/
  `migrateV1ToV2`/`openProjectFileWithDialog` を Rust 実装へ置き換える
  かどうか（あるいは検証ロジックのみ委譲するか）は未決定。現状は
  Rust 側の `ProjectFile`/`project_file_from_json` は TS 実装と並存する
  独立した「型としての正本」段階に留まる。
- `ProjectFile`（Rust）は `format`/`version` を厳密なリテラル制約なしで
  受け付ける点が TS 側（型リテラル `'uxfd-project'`/`2`）より緩い。
  IPC 層で実際に読み込みに使う場合は呼び出し側で値検証を追加する必要が
  ある。
