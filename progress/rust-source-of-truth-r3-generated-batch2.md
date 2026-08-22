# R3 生成系kind移送 バッチ2: gourd / gear / track_bar / pie_chart / histogram / tone_curve

## Decision

- 6 kind とも `rust-core/src/schema.rs` に `XxxObjectFields` を追加し、
  `src/types.ts` の対応する `interface` を
  `BaseObject & XxxObjectFields & { type: '...' }` の交差型へ縮小した
  （バッチ1の particle/barcode/puzzle_piece/colour_wheel と同じ基本パターン）。
- 6 kind とも wire 統一（stage 4）まで完了させた。rust-backend 側の手書き
  `GeneratedXxxSource`（snake_case、`generator` タグ付き）を廃し、
  rust-core の `XxxObjectFields`（camelCase、タグ無し）を直接デシリアライズ
  するよう変更し、`serialiseGeneratedXxxSource`（`rustSceneSnapshot.ts`）を
  フィールドそのままの薄いパススルーへ縮小した。バリデータの `generator` タグ
  チェックは削除し（型で保証されるため不要）、`sort_mode`/`label_mode` の
  文字列比較は `PieChartSortMode`/`PieChartLabelMode` 列挙型比較へ置き換えた。
- 既定値は `TimelineContextMenu.tsx` の `handleAddXxx` が呼ぶ
  `src/utils/objectFactories/xxxObjectFactory.ts` の固定リテラルから採った。
  `gourd`/`gear`/`track_bar`/`pie_chart` の `width`/`height` はプロジェクト
  サイズから都度計算されるためニュートラルな `0.0` にした。`gear` の
  `outerRadius` も同様にプロジェクトサイズ依存の計算値（
  `Math.round(size / 2)`）なのでニュートラルな `0` にした。
  **`histogram`（256×200）と `tone_curve`（360×360）は width/height が
  プロジェクトサイズに依存しない固定リテラルだったため、他 kind と異なり
  ニュートラル化せずそのまま採用した** — バッチ1までの「width/height は
  常にニュートラル」という単純な決めつけが崩れた最初のケース。
- フィールドの Rust 表現型は、既存の手書き `GeneratedXxxSource`（wire）が
  使っていた型（`u32`/`f32`/`bool`/`String`/`Vec<...>`）をそのまま踏襲した
  （TS 側はすべて `number` だが、batch1 の `PuzzlePieceObjectFields.
  shape_variant: u32` 同様、意味に応じた整数/浮動小数の書き分けを継続）。
  `track_bar` の `trackRanges`（TS: `[number, number][]`）は
  `Vec<[f32; 2]>`（旧 wire の固定長配列）ではなく `Vec<(f32, f32)>`
  （タプル）を採用した。ts-rs はタプルを `[number, number]` として問題なく
  エクスポートする。

## Alternatives considered

- **`track_bar` の `trackRanges` を `Vec<[f32; 2]>` のまま維持する**: 却下。
  Rust の固定長配列パターン `let [min, max] = ranges[i]` は値渡しの配列の
  分解には使えるが、`schema.rs` に既存の `Vec<[f32; N]>` 前例が無く、
  JsonSchema/ts-rs 双方でタプル (`(f32, f32)`) の方が素直に扱えたため。
  wire 上の JSON 表現（`[min, max]` の2要素配列）は変わらない。
- **本バッチも batch1 のように 1 kind ずつ git コミットを完全分離する**:
  部分的に断念。`schema.rs` が1ファイルで6 kind分の型定義を保持するため、
  gourd の Red（テスト追加）は単独コミットにしたが、Green（フィールド
  実装）以降は6 kind分をまとめて1コミットずつにした
  （`feat: ...をrust-coreへ追加` 等）。理由は diff の hunk 単位分離の
  コストが見合わないため。stage 3（codegen+types.ts）・stage 4（wire統一）
  も同様に6 kind分をまとめて1コミットにした。

## Constraints / Gotchas

- **width/height が常にニュートラル `0.0` になるとは限らない。**
  `histogramObjectFactory.ts`/`toneCurveObjectFactory.ts` は
  `Math.round((projectWidth - width) / 2)` のように x/y はプロジェクト
  サイズ依存だが、width/height 自体は `256`/`200`、`360`/`360` の固定
  リテラルだった。次バッチ以降も「width/height は無条件でニュートラル」と
  決め打ちせず、各 objectFactory の実装を毎回確認すること。
- **f32 精度差によるテスト失敗パターンが2箇所で再発した**
  （`histogram` の `binValues: [0.1, 0.2]`、`track_bar` の
  `backgroundOpacity: 0.2`）。`serde_json::to_value` は f32→f64 昇格で
  丸め誤差が出るため、割り切れない小数を含むテストは
  `(value.as_f64().unwrap() - expected).abs() < 1e-6` の許容誤差比較に
  すること（batch1 の gotcha が今回も刺さった）。
- **`gear`/`gourd` は `rust-backend/src/generated/shape_effects.rs` と
  `validators/shape.rs` に、`track_bar`/`pie_chart`/`histogram` は
  `chart_effects.rs` と `validators/chart.rs` に、`tone_curve` は
  `tone_curve.rs`（frame builder）と `validators.rs`（バリデータ本体、
  専用ファイル無し）にそれぞれ実装がある。1ファイルに複数 kind の関数が
  同居しているため、`sed` の一括置換より個別 Edit の方が安全だった。
- **`generated_frame_tests.rs`（rust-backend の統合フレームテスト）は
  第4の消費者だった。** バッチ1の申し送りにあった3ファイル
  （`rustSceneSnapshot.test.ts`/`sharedRendererNativeMediaSupport.ts`(+test)/
  `allReadableMedia.e2e.test.ts`）に加え、`rust-backend/src/
  generated_frame_tests.rs` 内の `SceneMediaReference::source` リテラルも
  旧 snake_case + `generator` タグ形式のままだと
  `missing field 'width'`/デシリアライズエラーで壊れる。次バッチでも
  grep 対象に `rust-backend/src/generated_frame_tests.rs` を追加すること。
- **`allReadableMedia.e2e.test.ts` には `tone_curve` の消費箇所が無かった**
  （gourd/gear/track_bar/pie_chart/histogram の5 kindのみ登場）。ワイヤー
  消費者の grep 結果は kind ごとに異なりうるので、対象ファイルに出現する
  kind の集合を毎回確認すること。
- **`PieChartSortMode`/`PieChartLabelMode` を新設した。** 文字列
  `'none' | 'descending' | 'ascending'` 等を Rust 側で `#[serde(rename_all
  = "lowercase")]` の enum にし、`chart_effects.rs` の
  `pie_chart.sort_mode.as_str()` による match を `match pie_chart.sort_mode
  { PieChartSortMode::Descending => ... }` へ書き換えた
  （`PuzzleConnectorMode` と同じパターン）。

## 実測（6 kind 全体、最終状態）

| 合格条件 | 結果 |
|---|---|
| `npx tsc --noEmit` | エラー 0 |
| `cargo test --manifest-path rust-core/Cargo.toml` | 全 pass |
| `cargo test --manifest-path rust-backend/Cargo.toml --bin uxfd-rust-backend` | 158 tests pass |
| `npm run codegen:types:check` | exit 0 |
| `npm run fixture:evaluation-parity` → `cargo test --test ts_evaluation_parity` | fixture 差分ゼロ、pass |
| `KNOWN_DIFFERENCES.json` | `differences: []` のまま（変化なし） |
| `npx vitest run`（全スイート） | 252 files 中 251 pass / 1833 tests 中 1832 pass。**失敗1件は `src/utils/nativeOverlayCrateBoundary.test.ts`（native-overlay の Cargo.toml crate-type アサーション）で、本バッチのスコープ外（`native-overlay/` は担当外ディレクトリ）かつ本バッチの変更と無関係の既存失敗。** |

## 次バッチ（getcolor_dot_field, hksy_checker_grid, region_frame, simple_tube, sphere_dots, spherical_field）への申し送り

- 着手前に必ず以下を grep して「第二・第三・第四の消費者」を洗い出すこと:
  `rust-backend/src/`、`src/utils/rustSceneSnapshot.test.ts`、
  `src/utils/sharedRendererNativeMediaSupport.ts`(+test)、
  `src/e2e/allReadableMedia.e2e.test.ts`、
  **`rust-backend/src/generated_frame_tests.rs`（本バッチで新たに判明した
  第4の消費者）**。
- width/height を無条件でニュートラル `0.0` にせず、各
  `xxxObjectFactory.ts` を毎回読んで固定リテラルかプロジェクトサイズ
  依存の計算値かを確認すること。
- `getcolor_dot_field` は `dotShape`/`strokeWidth` が optional
  （`?`）な項目を含む（`src/types.ts` 参照）。batch1 の audio 系で見た
  「optionality の非対称性」同様、どのフィールドが常在でどれが省略可能かを
  型定義から都度確認すること。
- `hksy_checker_grid` は `pattern`/`paletteColours`/`separateInterval`/
  `separateLineWidth`/`anchorPoints`/`roundCaps`/`maxJoinDistance` など
  optional フィールドが多く、6 kind中もっともフィールド数が多い部類。
  1 kind分でも構造が複雑なので、他 kind とまとめず単独で先に着手する方が
  安全。
