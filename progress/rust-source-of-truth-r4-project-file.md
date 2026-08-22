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
