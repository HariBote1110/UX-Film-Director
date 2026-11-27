# R3 生成系kind移送 バッチ3: getcolor_dot_field / hksy_checker_grid / region_frame / simple_tube / sphere_dots / spherical_field

## Decision

- 6 kind とも `rust-core/src/schema.rs` に `XxxObjectFields` を追加し、
  `src/types.ts` の対応する `interface` を
  `BaseObject & XxxObjectFields & { type: '...' }` の交差型へ縮小した
  （batch1/2 と同じ基本パターン）。
- `hksy_checker_grid`/`region_frame`/`simple_tube`/`sphere_dots`/
  `spherical_field` の 5 kind は wire 統一（stage 4）まで完了させた。
  rust-backend 側の手書き `GeneratedXxxSource`（snake_case、`generator`
  タグ付き）を廃し、rust-core の `XxxObjectFields`（camelCase、タグ無し）を
  直接デシリアライズするよう変更し、`serialiseGeneratedXxxSource`
  （`rustSceneSnapshot.ts`）をフィールドそのままの薄いパススルーへ縮小した。
- `getcolor_dot_field` は **wire 統一を意図的に見送った**（audio_visualization/
  audio_sphere と同じ「structurally surprising」ケース。下記 Gotcha 参照）。
  編集モデル型の正本化（stage 1-3）のみ完了。
- 既定値はいずれも `TimelineContextMenu.tsx` の `handleAddXxx` が呼ぶ
  `src/utils/objectFactories/*.ts` の固定リテラルから採った。6 kind とも
  `width`/`height` はプロジェクトサイズから都度計算される値のため
  ニュートラルな `0.0` にした（batch2 の histogram/tone_curve のような
  「固定リテラル width/height」の例外は今回は無かった）。
- `hksy_checker_grid` の optional フィールド（`pattern`/`paletteColours`/
  `separateInterval`/`separateLineWidth`/`anchorPoints`/`roundCaps`/
  `maxJoinDistance`）と `region_frame` の `shape`/`cornerCut`、`simple_tube`
  の `colourPattern`/`fogStrength`/`fogColour`、`getcolor_dot_field` の
  `dotShape`/`strokeWidth`/`sampleSourcePath`/`sampleSourceObjectId`/
  `sampleSourceLayer`/`sampleStrength`/`sampleHueShiftDegrees` は全て
  `Option<T>` にし、`#[serde(default, skip_serializing_if =
  "Option::is_none")]` を付けた。

## Alternatives considered

- **`getcolor_dot_field` も他 5 kind と同じく wire 統一まで行う**: 却下。
  `serialiseGeneratedGetColorDotsSource`（rustSceneSnapshot.ts）は
  `sampleSourcePath` が空のとき `objects`/`time` 引数を使って他の
  `image`/`psd` オブジェクトを `sampleSourceObjectId`/`sampleSourceLayer`
  で検索し、解決結果（`source_image`/`source_active_layer_ids`）を wire に
  含めるクロスオブジェクト参照を行う。これは `GetColorDotFieldObjectFields`
  単体の JSON 化では再現できず、audio_visualization/audio_sphere が
  `AudioWaveformSource` を経由して同じ理由で見送られたのと同型のケース。
  型移送のみで打ち切り、次バッチ以降の対象からも外す（audio 系と同じ扱い）。
- **1 kind ずつ git コミットを完全分離する**: 部分的に断念。batch2 と同じ
  理由（`schema.rs` が1ファイルで6 kind分の型定義を保持するため）で、
  Red（テスト追加）は6 kind分まとめて1コミット、Green・stage3・stage4も
  それぞれ6 kind分/5 kind分まとめて1コミットにした。

## Constraints / Gotchas

- **optional フィールドには `skip_serializing_if` だけでなく `default` も
  必須。** `skip_serializing_if` のみを付けると ts-rs は
  `pattern: string | null`（必須キー、null許容）を生成し、UI 側が
  フィールドを省略（`undefined`）できず `npx tsc --noEmit` が壊れる。
  `default` を追加して初めて `pattern?: string | null`（省略可能キー）に
  なる。batch1 の `AudioVisualizationObjectFields.targetLayer` に前例が
  あったが、batch2 では optional フィールドを持つ kind が無かったため
  今回久しぶりに踏み直したハマりどころ。
- **rust-backend 消費側の型変更で u32→f32 の不整合が複数箇所に波及した。**
  `HksyCheckerGridObjectFields` の `cellSize`/`lineWidth`/
  `separateInterval`/`separateLineWidth` は編集モデルでは全て `f32`
  （TS の `number` に対応する自然な型）だが、`hksy.rs` の描画コードは
  旧 `GeneratedHksyCheckerGridSource`（`u32`）を前提に `x / cell_size`
  のような整数演算をしていた。`build_generated_hksy_checker_grid_source_frame`
  冒頭で `cell_size = checker_grid.cell_size.round().max(1.0) as u32`
  等のローカル変数に変換し、以降はそのローカル変数だけを使うよう統一した。
  同様に `SimpleTubeObjectFields.seed` は `u32`（他 5 kind と同じ規約）だが
  `simple_tube.rs` の乱数シード計算は `i64` 前提だったため、使用箇所で
  `tube.seed as i64` にキャストした。
- **`getcolor_dot_field` は「第五の消費者」を炙り出した。**
  `src/utils/rustScenePlaybackController.test.ts` が
  batch2 までの grep 対象4ファイル（`rustSceneSnapshot.test.ts`/
  `sharedRendererNativeMediaSupport.ts`(+test)/
  `allReadableMedia.e2e.test.ts`/`generated_frame_tests.rs`）に含まれない
  独自の `simple_tube` 固定ソース文字列
  （`{"generator":"simple-tube-93",...}`）を持っており、simple_tube の
  wire 統一後にこのファイルだけ気づかず `npx vitest run` で
  `rustScenePlaybackController.test.ts` の5件が失敗した
  （`isSharedRendererNativeGeneratedSimpleTubeSourceSupported` が
  false を返すようになり native overlay 起動フローの分岐が変わったため）。
  **次バッチでは grep 対象に `rustScenePlaybackController.test.ts` も
  追加すること。** 固定文字列で `generator`/snake_case ワイヤーを埋め込む
  テストファイルは、grep リストにない場所にも存在しうる。
- **`cargo build --manifest-path rust-backend/Cargo.toml` を実行すると
  `rust-backend/Cargo.lock` が意図せず更新されることがある。** 本バッチとは
  無関係な `windows` 依存（W5、担当外）が `Cargo.toml` に既に入っていたが
  ロックファイルが未反映だったための同期で、`cargo build` の副作用として
  検出した。別コミット（`chore: Cargo.lockをwindows依存追加後の状態に同期`）
  に分離してスコープを明確にした。

## 実測（6 kind 全体、最終状態）

| 合格条件 | 結果 |
|---|---|
| `npx tsc --noEmit` | エラー 0 |
| `cargo test --manifest-path rust-core/Cargo.toml` | 全 pass |
| `cargo test --manifest-path rust-backend/Cargo.toml --bin uxfd-rust-backend` | 158 tests pass |
| `npm run codegen:types:check` | exit 0 |
| `npm run fixture:evaluation-parity` → `cargo test --test ts_evaluation_parity` | fixture 差分ゼロ（wire形式変更のみのcosmetic diffを再生成コミット済み）、pass |
| `KNOWN_DIFFERENCES.json` | `differences: []` のまま（変化なし） |
| `npx vitest run`（全スイート） | 252 files / 1833 tests 全 pass（`rustScenePlaybackController.test.ts` の第五消費者修正後） |

## コミット系列

1. `test: R3生成系kindバッチ3(...)のRedテストを追加`
2. `feat: ...のXxxObjectFieldsをrust-coreへ追加`（Green）
3. `feat: ...をcodegen登録しtypes.tsを交差型化`（stage3）
4. `chore: Cargo.lockをwindows依存追加後の状態に同期`（スコープ外の副作用同期）
5. `feat: hksy/region_frame/simple_tube/sphere_dots/spherical_fieldのwireをXxxObjectFieldsへ統一`（stage4、getcolor_dot_fieldは対象外）
6. `chore: parity fixtureを新wire形式で再生成`
7. `fix: rustScenePlaybackController.test.tsのsimple_tube固定ソースを新wire形式に追随`（第五消費者の是正）

## 次バッチ（sunburst, circular_arrow, triangle_bracket, tartan_check, houndstooth, yagasuri, 以降）への申し送り

- 着手前に必ず以下を grep して「第二〜第五の消費者」を洗い出すこと:
  `rust-backend/src/`、`src/utils/rustSceneSnapshot.test.ts`、
  `src/utils/sharedRendererNativeMediaSupport.ts`(+test)、
  `src/e2e/allReadableMedia.e2e.test.ts`、
  `rust-backend/src/generated_frame_tests.rs`、
  **`src/utils/rustScenePlaybackController.test.ts`（本バッチで新たに判明
  した第五の消費者。native overlay 起動フローのテストに固定ワイヤー文字列を
  埋め込んでいる）**。
- optional フィールドを `Option<T>` にする際は `#[serde(default,
  skip_serializing_if = "Option::is_none")]` を必ずセットで付けること
  （`default` を忘れると ts-rs が必須キーの `T | null` を生成し tsc が壊れる）。
- rust-backend 消費側コードの数値型（`u32`/`f32`/`i64`）が編集モデルの型と
  食い違う場合、フィールド直接使用ではなくローカル変数へ変換してから
  使うと影響範囲を局所化しやすい（`hksy.rs`/`simple_tube.rs` で実施）。
- 残る 28 kind（`sunburst`〜`shattered_sphere`）はいずれもクロスオブジェクト
  参照を持たない見込み（`getcolor_dot_field`/`audio_visualization`/
  `audio_sphere` のような例外は grep で `objects`/`time` 引数の有無を都度
  確認すること）。
