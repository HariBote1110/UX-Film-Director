# R3 生成系kind移送 バッチ5: paper_airplane / asanoha_pattern / focus_lines_plus / random_line_ex / contour_trace / displacement_poly

## Decision

- 6 kind とも `rust-core/src/schema.rs` に `XxxObjectFields` を追加し、
  `src/types.ts` の対応する `interface` を
  `BaseObject & XxxObjectFields & { type: '...' }` の交差型へ縮小した
  （batch1-4 と同じ基本パターン）。
- 6 kind ともクロスオブジェクト参照が無く、optional フィールドも存在しない
  （各 `xxxObjectFactory.ts` を確認済み）ため、batch2/3/4 と同じく
  全 kind wire 統一（stage 4）まで一括で完了させた。rust-backend 側の手書き
  `GeneratedXxxSource`（snake_case、`generator` タグ付き）を廃し、rust-core の
  `XxxObjectFields`（camelCase、タグ無し）を直接デシリアライズするよう変更し、
  `serialiseGeneratedXxxSource`（`rustSceneSnapshot.ts`）をフィールドそのままの
  薄いパススルーへ縮小した。バリデータの `generator` タグチェックは削除した。
- 既定値はいずれも `TimelineContextMenu.tsx` から呼ばれる
  `src/utils/objectFactories/xxxObjectFactory.ts` の固定リテラルから採った。
  6 kind とも `width`/`height` はプロジェクトサイズに依存しない固定リテラル
  （paper_airplane: 320×240、他5 kind: 800×450）だったため、batch2/4 と同じく
  ニュートラル化せずそのまま採用した。
- 数値フィールドは原則 f32 に統一した。ただし「回数」を表す
  `lineCount`/`contourCount`/`columns`/`rows` は batch3/4 の `rayCount` と
  同じ理由で u32 のまま維持した。`seed` フィールドも batch3/4 の precedent
  （`GetColorDotFieldObjectFields.seed` 等）に合わせ u32 とした（元の
  rust-backend 側は i64 だったが、他バッチとの一貫性を優先）。

## Alternatives considered

- **`focus_lines_plus` の `keyframeInterval` を u64 のまま schema フィールドに
  残す**: 却下。「TS 側は number」の原則を優先し f32 化したうえで、
  `rust-backend/src/generated/line_effects.rs` の frame builder 冒頭で
  `focus_lines.keyframe_interval.max(0.0).round() as u64` へローカル変換する
  batch3/4 の tile-grid パターンを踏襲した。
- **`random_line_ex` の `threshold`/`noiseCellSize` を u32 のまま維持する**:
  却下。他の同種フィールド（`lineWidth`/`widthVariance` 等）との一貫性を
  優先して f32 化し、`noiseCellSize` はタイル格子計算（`x / cell`）に使うため
  frame builder 内でローカル `u32` 変数へ変換、`threshold` は比較先の
  `noise` 値そのものを f32 化することで整数変換を回避した。

## Constraints / Gotchas

- **`focus_lines_plus` は事前確認どおり `rust-core/src/focus_lines.rs` と
  シェアード・ロジックを持っていた。** `focus_lines_frame_bucket_from_source`
  が `media.source`（wire 文字列）を直接パースする補助構造体
  `FocusLinesFrameBucketSource { keyframe_interval: u64 }` を持っており、
  これは `FocusLinesPlusObjectFields` とは独立した手書き型だが、
  **フィールド名は同じ wire 文字列を読む**ため、wire を camelCase へ
  統一すると壊れる（`missing field keyframeInterval` エラー）。
  `#[serde(rename = "keyframeInterval")]` を付け、フィールド型も `f32` に
  変更してローカルで `u64` へ変換するよう修正した。batch4 の申し送りで
  「着手前に確認すること」と指示されていたとおり、クロスオブジェクト参照は
  無かったが、**この種の「同じ wire を読む独立ヘルパー」という盲点は
  grep 対象の5ファイルには現れない**ため、`focus_lines_frame_bucket_from_source`
  の呼び出し元（`native_render.rs`）まで辿って発見した。次にワイヤーを
  統一する kind では、`media.source` を直接パースする補助関数が無いか
  `rg "media.source" rust-backend/src` で確認することを推奨する。
- **grep 対象の5ファイルのうち、`src/e2e/allReadableMedia.e2e.test.ts` は
  `contour_trace`/`displacement_poly` の2 kind を最初から含んでいなかった。**
  他4 kind（paper_airplane/asanoha_pattern/focus_lines_plus/random_line_ex）は
  含まれていたが、`contour_trace`/`displacement_poly` はこの e2e テストの
  対象オブジェクト一覧に無い。「0件」も含めて確認結果として記録する。
- **`rustScenePlaybackController.test.ts` は本バッチ6 kind 全件で0件**
  （batch4 と同じ状況）。
- **displacement_poly の `mesh_opacity`/`fill_opacity` のテストで
  f32→f64 昇格による丸め誤差**（batch1 で確立済みの既知パターン）に当たった。
  `assert_eq!(value["meshOpacity"], 0.9)` は `0.9` (f64) と
  `0.8999999761581421` (f32→f64) が一致せず失敗するため、
  `(value["meshOpacity"].as_f64().unwrap() - 0.9).abs() < 1e-6` の
  許容誤差比較に変更した。

## 実測（6 kind 全体、最終状態）

| 合格条件 | 結果 |
|---|---|
| `npx tsc --noEmit` | エラー 0 |
| `cargo test --manifest-path rust-core/Cargo.toml` | 全 pass |
| `cargo test --manifest-path rust-backend/Cargo.toml --bin uxfd-rust-backend` | 158 tests pass |
| `npm run codegen:types:check` | exit 0 |
| `npm run fixture:evaluation-parity` → `cargo test --test ts_evaluation_parity` | fixture 差分ゼロ、pass |
| `KNOWN_DIFFERENCES.json` | `differences: []` のまま（変化なし） |
| `npx vitest run`（全スイート） | 252 files / 1833 tests 全 pass |

## コミット系列

1. `test: R3生成系kindバッチ5(...)のRedテストを追加`
2. `feat: ...のXxxObjectFieldsをrust-coreへ追加`（Green）
3. `feat: ...をcodegen登録しtypes.tsを交差型化`（stage3）
4. `feat: ...のwireをXxxObjectFieldsへ統一`（stage4、6 kind全件）

## 次バッチ（plain_effector_line, hologram, protractor, shaking_polygon, shattered_sphere）への申し送り

- これで R3 の生成系 kind 移送は残り5 kind。
- 着手前に必ず以下を grep して「消費者」を洗い出すこと:
  `rust-backend/src/`、`src/utils/rustSceneSnapshot.test.ts`、
  `src/utils/sharedRendererNativeMediaSupport.ts`(+test)、
  `src/e2e/allReadableMedia.e2e.test.ts`、
  `rust-backend/src/generated_frame_tests.rs`、
  `src/utils/rustScenePlaybackController.test.ts`（5ファイル固定）。
  加えて `rg "media\.source" rust-backend/src` で、grep 対象5ファイルに
  現れない「wire 文字列を直接パースする独立ヘルパー」が無いか確認すること
  （本バッチの `focus_lines_frame_bucket_from_source` のような盲点）。
- 数値フィールドを f32 に統一する際、バリデータの整数リテラル比較
  (`== 0`/`> N`) は `.0` を付けないとコンパイルエラーになる。`== 0` は
  多くの場合「1 以上」チェックなので `<= 0.0`/`< 0.0` へ書き換えるのが自然。
- タイル格子・剰余演算（`%`、整数除算）を使うフィールドは f32 のままでは
  使えないため、frame builder 冒頭でローカル変数 `u32`/`u64` へ変換してから
  使うこと（batch3/4/5 で確立したパターン）。
- f32 の JSON シリアライズを Rust テストで比較する際は
  `serde_json::to_value` の f64 昇格丸め誤差に当たることがあるため、
  小数点を含む既定値のテストは許容誤差比較（`(value - expected).abs() < 1e-6`）
  にしておくと安全。
