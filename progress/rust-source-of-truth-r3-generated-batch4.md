# R3 生成系kind移送 バッチ4: sunburst / circular_arrow / triangle_bracket / tartan_check / houndstooth / yagasuri

## Decision

- 6 kind とも `rust-core/src/schema.rs` に `XxxObjectFields` を追加し、
  `src/types.ts` の対応する `interface` を
  `BaseObject & XxxObjectFields & { type: '...' }` の交差型へ縮小した
  （batch1-3 と同じ基本パターン）。
- 6 kind ともクロスオブジェクト参照が無く、optional フィールドも存在しない
  （`sunburstObjectFactory.ts` 等 6 ファイルを確認済み）ため、batch2 と同じく
  全 kind wire 統一（stage 4）まで一括で完了させた。rust-backend 側の手書き
  `GeneratedXxxSource`（snake_case、`generator` タグ付き）を廃し、rust-core の
  `XxxObjectFields`（camelCase、タグ無し）を直接デシリアライズするよう変更し、
  `serialiseGeneratedXxxSource`（`rustSceneSnapshot.ts`）をフィールドそのままの
  薄いパススルーへ縮小した。バリデータの `generator` タグチェックは削除した
  （型で保証されるため不要）。
- 既定値はいずれも `TimelineContextMenu.tsx` の `handleAddXxx` が呼ぶ
  `src/utils/objectFactories/xxxObjectFactory.ts` の固定リテラルから採った。
  6 kind とも `width`/`height` はプロジェクトサイズに依存しない固定リテラル
  （sunburst/tartan_check/houndstooth/yagasuri: 800×450、circular_arrow:
  200×200、triangle_bracket: 160×100）だったため、batch2 の histogram/
  tone_curve と同じくニュートラル化せずそのまま採用した。
- 数値フィールドの Rust 表現型は、既存の手書き `GeneratedXxxSource`
  （u32/f32/i32 混在）をそのまま踏襲せず、**全て f32 に統一した**
  （`sunburst.rayCount` のみ回数を表すため u32 のまま維持）。理由は編集
  モデル側で「UI が入力する数値はすべて `number`」という前提を保ちつつ、
  wire 側の型を素直に ts-rs でエクスポートするため。

## Alternatives considered

- **`GeneratedXxxSource` の元の整数型（u32/i32）をそのまま
  `XxxObjectFields` に踏襲する**: 却下。他 5 バッチでも既に u32→f32 の
  不整合を rust-backend 消費側のローカル変数変換で吸収するパターンが
  確立しており、今回も同じ方針を維持する方が一貫性が高いと判断した。
  ただし `tartan_check.tileSize`/`blurRadius`、`houndstooth.patternSize`
  はタイル格子計算で `%`（剰余）を使うため f32 のままでは使えず、
  `build_generated_tartan_check_source_frame`/
  `build_generated_houndstooth_source_frame` 冒頭でローカル変数
  `tile_size: u32`/`blur_radius: u32`/`pattern_size: u32` へ変換してから
  使うようにした（batch3 の gotcha #2 と同型）。
- **1 kind ずつ git コミットを完全分離する**: 部分的に断念。`schema.rs` が
  1ファイルで6 kind分の型定義を保持するため、Red（テスト追加）は6 kind分
  まとめて1コミット、Green・stage3・stage4もそれぞれ6 kind分まとめて
  1コミットにした（batch2/3 と同じ理由）。

## Constraints / Gotchas

- **f32 化した数値フィールドをバリデータの整数リテラル比較
  (`source.radius == 0`) に使うとコンパイルエラーになる。** Rust の
  比較演算子は両辺の型を揃える必要があり、`f32 == 0`（整数リテラル）は
  型推論に失敗する（`0.0` のように明示的な浮動小数リテラルが必要）。
  今回は `circular_arrow`/`triangle_bracket`/`yagasuri` の
  `radius`/`line_width`/`bracket_width`/`arm_length`/`arrow_width`/
  `arrow_height` などで大量に発生した。`== 0` は意味的に「1 以上」の
  下限チェックだったため、`<= 0.0` に書き換えて対応した（`== 0` のままだと
  負数を弾けない副作用もあり、むしろ意味的に正しくなった）。
- **`% ` を使うタイル格子計算は f32 化できない。** `tartan_check` の
  `tile_size`/`blur_radius` と `houndstooth` の `pattern_size` は
  ピクセル座標に対する剰余演算 (`x % tile`) に使われており、f32 の
  まま渡すと型エラーになる。frame builder の冒頭で
  `let tile_size = tartan.tile_size.round().max(10.0) as u32;` のように
  一度だけ u32 へ変換し、以降はそのローカル変数だけを使うことで影響範囲を
  局所化した（batch3 gotcha #2 と同じ手法）。
- **`yagasuri` は全フィールドが浮動小数演算（`rem_euclid` 等）だけで
  完結しており、u32→f32 のローカル変数変換が不要だった。** 元の
  `let arrow_width = yagasuri.arrow_width.max(1) as f32;`
  （整数 max → f32 キャスト）を単に
  `let arrow_width = yagasuri.arrow_width.max(1.0);`
  （f32 のまま `.max(1.0)`）に書き換えるだけで済んだ。6 kind 中もっとも
  影響範囲が小さいケース。
- **`sunburst`/`circular_arrow`/`triangle_bracket` の decorative_shapes.rs
  では `x as f32`（既に f32 の値への恒等キャスト）が複数残っているが、
  Rust はこれをエラーにしないためビルドは通る。** 意味的には不要な
  キャストだが、影響範囲を最小化する優先度から今回は削除せず残した。
- **grep 対象の5ファイル
  （`rustSceneSnapshot.test.ts`/`sharedRendererNativeMediaSupport.ts`(+test)/
  `allReadableMedia.e2e.test.ts`/`generated_frame_tests.rs`/
  `rustScenePlaybackController.test.ts`）のうち、`rustScenePlaybackController.test.ts`
  には本バッチ6 kind の固定ワイヤー文字列は無かった。** grep 結果が
  0件でも「対象外と確定した」という記録を残すことに意味がある
  （batch3 で発覚した「第五の消費者」が今回は該当しないことの確認）。

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

1. `test: R3生成系kindバッチ4(...)のRedテストを追加`
2. `feat: ...のXxxObjectFieldsをrust-coreへ追加`（Green）
3. `feat: ...をcodegen登録しtypes.tsを交差型化`（stage3）
4. `feat: ...のwireをXxxObjectFieldsへ統一`（stage4、6 kind全件）

## 次バッチ（paper_airplane, asanoha_pattern, focus_lines_plus, random_line_ex, contour_trace, displacement_poly, plain_effector_line, hologram, protractor, shaking_polygon, shattered_sphere）への申し送り

- 着手前に必ず以下を grep して「消費者」を洗い出すこと:
  `rust-backend/src/`、`src/utils/rustSceneSnapshot.test.ts`、
  `src/utils/sharedRendererNativeMediaSupport.ts`(+test)、
  `src/e2e/allReadableMedia.e2e.test.ts`、
  `rust-backend/src/generated_frame_tests.rs`、
  `src/utils/rustScenePlaybackController.test.ts`（5ファイル固定）。
- `focus_lines_plus`/`random_line_ex` はファイル名が示唆する通り
  `rust-core/src/focus_lines.rs` と何らかの関係を持つ可能性がある
  （`rust-core/tests/focus_lines.rs` が既に存在する）。着手前に
  `focus_lines.rs` の役割と `FocusLinesPlusObject` の関係を必ず確認すること
  （クロスオブジェクト参照や共有ロジックの有無を含む）。
- 数値フィールドを f32 に統一する際、バリデータの整数リテラル比較
  (`== 0`/`> N`) は `.0` を付けないとコンパイルエラーになる。`== 0` は
  多くの場合「1 以上」チェックなので `<= 0.0` へ書き換えるのが自然。
- タイル格子・剰余演算（`%`）を使うフィールドは f32 のままでは使えない
  ため、frame builder 冒頭でローカル変数 `u32` へ変換してから使うこと
  （batch3/batch4 で確立したパターン）。
- 残り11 kind もクロスオブジェクト参照・optional フィールドの有無を
  各 objectFactory.ts で個別に確認すること（`getcolor_dot_field` のような
  例外がまだ潜んでいる可能性は否定できない）。
