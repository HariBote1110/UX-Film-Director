# R3 生成系kind移送 バッチ1: audio_visualization / audio_sphere / particle / barcode / puzzle_piece / colour_wheel

## Decision

- 6 kind とも `rust-core/src/schema.rs` に `XxxObjectFields` を追加し、
  `src/types.ts` の対応する `interface` を
  `BaseObject & XxxObjectFields & { type: '...' }` の交差型へ縮小した
  （shape/text/image/video/audio に続く基本パターン）。
- `particle`/`barcode`/`puzzle_piece`/`colour_wheel` の 4 kind は
  wire 統一（stage 4）まで完了させた。rust-backend 側の手書き
  `GeneratedXxxSource`（snake_case、`generator` タグ付き）を廃し、
  rust-core の `XxxObjectFields`（camelCase、タグ無し）を直接
  デシリアライズするよう変更し、`serialiseGeneratedXxxSource`
  （`rustSceneSnapshot.ts`）をフィールドそのままの薄いパススルーへ縮小した。
  クランプ/フォールバックは validator 側（`validate_generated_xxx_source`）と
  frame builder 側（`.round() as u32` 等）に移した。
- `audio_visualization`/`audio_sphere` の 2 kind は **wire 統一を意図的に
  見送った**（下記 Gotcha 参照）。編集モデル型の正本化（stage 1-3）のみ完了。
- 既定値はいずれも `TimelineContextMenu.tsx` の `handleAddWaveform` か、
  `src/utils/objectFactories/*.ts` の `buildAviUtlXxxObject` /
  `buildDefaultStandardParticleObject` にある「今日実際に使われている
  固定リテラル」から採った。`width`/`height`/`size`/`radius` 等、
  プロジェクトサイズから都度計算される値は固定既定値が無いためニュートラルな
  `0.0` にした（image/video と同じ方針）。

## Alternatives considered

- **audio_visualization/audio_sphere も他 4 kind と同じ 4 段階すべてを実施する**:
  却下（見送り）。これら 2 kind のワイヤーは既に `rust-core/src/
  audio_waveform_scene.rs::AudioWaveformSource` という手書き構造体を
  経由しており、この構造体は「対象 audio オブジェクトを解決した後の
  `target_source`（生パス文字列）」を含む——つまり編集モデルの
  `AudioVisualizationObjectFields`/`AudioSphereObjectFields` 単体を
  そのまま JSON 化しても wire にはならない（クロスオブジェクト参照の
  解決結果を含む必要がある）。かつ両 kind が同一の Rust 構造体を共有して
  おり、shape 型の「1 kind = 1 wire 型」という前提が成り立たない。
  これは計画の想定より構造的に複雑（"structurally surprising"）と判断し、
  型移送のみで打ち切って次 kind に進んだ。
- **particle の既定値をバリアント別（オーラ放出/泡/集中線T/インクTM）に
  分ける**: 却下。`ParticleObjectFields::default()` は「UI 全体としての
  既定値」を表すべきで、`TimelineContextMenu.tsx` の `handleAddParticle`
  が実際に呼ぶ標準パーティクル (`buildDefaultStandardParticleObject`) を
  正とした。他バリアントは選択後に別ボタンから生成される初期値であり、
  「既定値」の対象ではない。

## Constraints / Gotchas

- **wire 統一 4 kind は「第二の消費者」が最低でも 3 箇所ある。**
  `rustSceneSnapshot.test.ts` と `sharedRendererNativeMediaSupport.ts`
  （+その test）に加え、今回新たに `src/e2e/allReadableMedia.e2e.test.ts`
  にも同じワイヤーの `toMatchObject` アサーションが存在すると判明した
  （shape/text の時点の申し送りには無かった消費箇所）。次バッチ以降は
  この 3 ファイルすべてを grep してから着手すること。
- **rust-backend 側の型は `generated/sources.rs` の
  `pub(crate) struct GeneratedXxxSource` を削除し、代わりに
  `pub(crate) use uxfd_rust_core::XxxObjectFields;` を re-export する形に
  した。** 呼び出し側（`validators.rs`/`basic_effects.rs`/
  `shape_effects.rs`）は型名を `GeneratedXxxSource` → `XxxObjectFields` に
  置換するだけで、`use super::*;` 経由の可視性は変わらず済んだ。
- **particle は rust-core 内で完結していた。** 他 3 kind は
  rust-backend 側の消費だが、particle だけは
  `rust-core/src/generated_particle.rs::parse_generated_particle_source`
  が wire を直接デシリアライズしており、rust-backend は素通りで
  呼ぶだけだった。wire 統一もこのファイル 1 つの変更で完結した。
- **puzzle_piece の `connectorMode` は文字列比較から enum 比較へ変わった。**
  `PuzzleConnectorMode`（`Convex`/`Concave`、`rename_all = "lowercase"`）を
  新設し、`shape_effects.rs` 側の `puzzle.connector_mode == "convex"` を
  `matches!(puzzle.connector_mode, PuzzleConnectorMode::Convex)` に
  書き換えた。
- **f32 のテスト比較で丸め誤差に当たった。** `AudioSphereObjectFields` の
  `serde_json::to_value` 結果を `assert_eq!(value["audioInfluence"], 0.8)`
  のように直接比較すると `0.8` (f64 リテラル) と `0.800000011920929`
  (f32→f64 昇格) が一致せず失敗する。以後は `(value["x"].as_f64().unwrap()
  - expected).abs() < 1e-6` の許容誤差比較に統一した。
- **audio_sphere/audio_visualization の `targetAudioId` と `targetLayer`
  は非対称な optionality を持つ。** 前者は TS 側で `string | null`
  （常にキーが存在し null 許容）なので `Option<String>` に
  `skip_serializing_if` を付けない。後者は `number` 型の省略可能フィールド
  (`targetLayer?: number`) なので付ける。同じ「audio ターゲット」でも
  シリアライズ方針が違う点に注意。

## 実測（6 kind 全体、最終状態）

| 合格条件 | 結果 |
|---|---|
| `npx tsc --noEmit` | エラー 0 |
| `cargo test --manifest-path rust-core/Cargo.toml` | 全 pass |
| `cargo test --manifest-path rust-backend/Cargo.toml --bin uxfd-rust-backend` | 158 tests pass |
| `npm run codegen:types:check` | exit 0 |
| `npm run fixture:evaluation-parity` → `cargo test --test ts_evaluation_parity` | fixture 差分ゼロ、pass |
| `KNOWN_DIFFERENCES.json` | `differences: []` のまま（変化なし） |
| `npx vitest run`（全スイート、kind 1・3・6 後に実施） | 252 files / 1833 tests pass |

## 次バッチ（gourd, gear, track_bar, pie_chart, histogram, tone_curve）への申し送り

- 6 kind すべて `mediaReferenceForObject` に専用 `serialiseGeneratedXxxSource`
  を持つため、全件 wire 統一（stage 4）が必要な kind 群（本バッチの
  particle/barcode/puzzle_piece/colour_wheel と同じパターン）。
  クロスオブジェクト参照は無いはずなので audio 系のような足止めは
  想定されない。
- `gourd`/`gear` の rust-backend 消費コードは既に
  `rust-backend/src/generated/shape_effects.rs`
  （`build_generated_gourd_source_frame`/`build_generated_gear_source_frame`）
  と `rust-backend/src/generated/validators/shape.rs`
  （`validate_generated_gourd_source`/`validate_generated_gear_source`）に
  存在することを確認済み（本バッチの puzzle_piece 作業中に同じファイルを
  読んだ）。同じファイルに 3 kind 分の関数が並んでいるので、1 kind ずつ
  編集する際に他 kind の関数を巻き込まないよう注意。
- `track_bar`/`pie_chart`/`histogram` は `rust-backend/src/generated/
  chart_effects.rs` 系（未確認、次バッチで grep すること）。
- `tone_curve` は `rust-backend/src/generated/tone_curve.rs` に専用ファイルが
  ある（`ls rust-backend/src/generated/` で確認済み）。
- 着手前に必ず `grep -rn "GeneratedXxxSource\|xxx-generator-tag" rust-backend/
  src/ src/utils/rustSceneSnapshot.test.ts src/utils/
  sharedRendererNativeMediaSupport.test.ts src/e2e/allReadableMedia.e2e.test.ts`
  で「第二・第三の消費者」を洗い出してから Red テストを書くこと。
