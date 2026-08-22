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

---

# R4-2: rust-core project_file のIPC境界公開・精度検証（2026-08-22）

## 決定
- **数値精度**: `project_file_to_json_value`（`serde_json::Value`経由）は
  `f32`→`f64`拡大で `1.03` が `1.0299999713897705` に劣化するため、
  ディスク書き出し用には使わずテストの構造比較専用と明記した。代わりに
  `ProjectFile` から直接文字列化する `project_file_to_json_string`
  （compact）/`project_file_to_json_pretty`（`serde_json::to_string_pretty`、
  既定2スペースインデントでTS側 `JSON.stringify(x, null, 2)` と同じ体裁）
  を新設し、serdeの直接シリアライズパス（ryuの最短表現）を使うことで
  精度劣化を回避した。`rust-core/tests/project_file_boundary.rs` の
  `to_json_string_preserves_shortest_f32_literal` 等で
  `1.03` がそのまま出力され、かつ `1.0299999` を含まないことをピン留め。
- **境界値検証**: `project_file_from_json` を `ProjectFileVersioned`
  untagged enum経由からserde_json::Valueでの事前検証方式へ変更。
  `format`/`version` を最初にチェックし、TS側 `parseProjectPayloadV2`/
  `parseProjectPayload` のV1/V2分岐と同じ「対応していないプロジェクト
  ファイル形式です。」エラーメッセージをそのまま移植した
  （不正format・非対応version・format欠損はすべてこの1メッセージに
  集約する点もTS側の挙動に合わせた）。壊れたJSONは別メッセージ
  （「プロジェクトファイルの JSON 解析に失敗しました: ...」）。
  `ProjectFileVersioned`型自体はテスト等で未使用になったが、
  スキーマ定義としての価値があるため`schema.rs`からは削除していない。
- **IPC配線**: `rust-backend/src/project_file.rs` に
  `handle_project_deserialize`/`handle_project_serialize` を新設し、
  `rpc_dispatch.rs` に `project.deserialize`/`project.serialize` として
  登録（既存の `scene.replace`/`proxy.generate` と同じ「paramsを
  `serde::Deserialize`構造体で受けてエラーは`response_error`」パターン）。
  `project.deserialize`のドメインエラー（format/version不正等）は
  `-32602`（invalid params、paramsの構造自体が壊れている場合）とは
  区別し、`scene.replace`の`-32061`（stale revision）と同様の
  アプリケーション定義コードとして`32610`
  （`PROJECT_FILE_INVALID_CODE`）を新設した。
  `electron/main.ts`には`rust-backend-project-deserialize`/
  `rust-backend-project-serialize`ハンドラを追加し、scene RPCと同じ
  `sceneRpcFailure`（`errorCode`をrendererまで保持する整形）を再利用。
  `electron/preload.ts`に`deserializeProjectFile`/`serializeProjectFile`
  を追加、`src/vite-env.d.ts`の`window.rustBackend`型に追記した。
  **renderer側の実消費（`src/utils/projectFile.ts`をこのIPCへ置き換える
  かどうか）はR4-3のスコープであり、今回は型・配線のみ。**

## E2Eテストカバレッジと既知のギャップ
- `rust-backend/src/project_file.rs`の`#[cfg(test)] mod tests`で
  `handle_project_deserialize`/`handle_project_serialize`を直接呼び出し、
  V2フィクスチャ（`rust-core/tests/fixtures/uxfd/realistic-heavy-edit-v2.uxfd.json`
  を`include_str!`で共有）のdeserialize→serialize→deserialize往復と
  `1.03`精度保持、不正format時の構造化エラー（code=32610）、
  paramsスキーマ違反時のinvalid params（-32602）をテストした。
  これは「rust-backend RPCディスパッチ層を実際に叩く」テストであり、
  IPC自体（Electron `ipcMain.handle`〜`callRustBackend`の子プロセス
  RPC）より一段内側だが、ドメインロジックとしての正しさは十分に
  検証できている。
- **既知のギャップ**: このリポジトリのvitest環境には、
  `electron/main.ts`の`ipcMain.handle`ハンドラを実際に起動して
  （子プロセスとして立ち上がる`rust-backend`と実際にJSON-RPCで
  通信して）検証する仕組みが存在しない
  （`rustBackendSceneControlBoundary.test.ts`等の既存パターンも
  「main/preload/renderer型の文字列的な配線一貫性」を確認するのみで、
  実RPC呼び出しは行っていない）。今回追加した
  `src/utils/rustBackendProjectFileBoundary.test.ts`も同じ限界の
  下で、配線の一貫性（チャネル名・`sceneRpcFailure`再利用）のみを
  検証しており、「Electronプロセスを実際に起動してIPC往復する」
  真のE2Eはこのバッチでは未達成。将来この gap を埋めるには
  Electronのheadlessテストランナー導入（既存インフラの新規構築）が
  必要で、R4-2の範囲を超えると判断した。

## ゲート結果（2026-08-22）
- `npx tsc --noEmit`: green。
- `cargo test --manifest-path rust-core/Cargo.toml`: 全green
  （新規`project_file_boundary.rs` 7件を含む）。
- `cargo test --manifest-path rust-backend/Cargo.toml`: 全green
  （新規`project_file::tests` 4件を含む）。
- `npm run codegen:types:check`: exit 0（差分なし、schema変更なしのため
  当然）。
- `npm run fixture:evaluation-parity` + `cargo test --test
  ts_evaluation_parity`: 447フレーム比較、`KNOWN_DIFFERENCES.json`は
  `[]`のまま green。
- `npx vitest run`: 254 files / 1843 tests
  （ベースライン253/1841 + 新規1ファイル2件）、全green。

## R4-3への申し送り
- `src/utils/projectFile.ts`の`parseProjectPayloadV2`/`migrateV1ToV2`/
  `openProjectFileWithDialog`等をRust実装（今回公開したIPC）へ実際に
  置き換えるかどうかは未着手・未決定のまま。今回のIPCはrenderer側
  からまだ一切呼ばれていない（型と配線のみが存在する状態）。
- 置き換える場合、保存時は`serializeProjectFile`（pretty JSON文字列を
  そのまま`fs.writeFile`）、読込時は`deserializeProjectFile`
  （返ってきた`ProjectFile`をrenderer側の型にキャストするか、
  ts-rs生成済みの`ProjectFile`型と統合するか）の設計判断が必要。
- Electron実プロセスを介したIPC E2Eテストのインフラ不足は
  `projectFile.ts`置き換え作業でも同様に残るため、R4-3でも
  「rust-backend側ユニットテストで担保し、vitestは配線一貫性のみ」
  という同じ方針を踏襲するのが妥当と考えられる。
