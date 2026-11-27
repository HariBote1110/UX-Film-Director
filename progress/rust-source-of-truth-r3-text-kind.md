# R3 二番目のスライス: `text` kind の編集モデルを rust-core へ移す

## Decision

- `rust-core/src/schema.rs` に `TextAlignment` / `TextStroke` / `TextShadow` /
  `TextObjectFields` を追加した。`shape` と同様、編集モデルは TS 側の既存命名
  （camelCase）を保つため個別に `#[serde(rename = "...")]` / `#[ts(rename = "...")]`
  を付けた。`TextAlignment` は `rename_all = "lowercase"` で
  `left` / `centre` / `right` を維持している。
- `TextObjectFields::default()` は `Timeline.tsx` の `addTextAt` が今日生成している
  既定値（`text: 'New Text'`, `fontSize: 48`, `fontFamily: 'Arial'`,
  `fill: '#ffffff'`, その他は未指定 = `None`）と一致させた。`shape` と同じく
  `Timeline.tsx` 自体はこのタスクの所有スコープ外なので書き換えていない
  （既定値の重複は shape の Gotcha と同じ状態で残る）。
- `measuredWidth` / `measuredHeight` は PixiJS 実測値という UI 都合の値だが、
  **フィールドの所在**は他の text 固有フィールドと同じ扱いにし
  `TextObjectFields` に含めた。一方、**未測定時のヒューリスティック
  フォールバック計算**（`rustSceneSnapshot.ts` の `textMediaBox`、
  `fontSize`・文字数からの概算）はタスク指示どおり TS 側に残した。理由は
  「実測できるかどうか」自体が PixiJS 側の実行環境に依存する UI 都合の判断で
  あり、Rust 側に持って行っても実測値そのものは UI からしか得られないため。
- `src/types.ts` の `TextObject` は
  `BaseObject & TextObjectFields & { type: 'text' }` に縮めた。手書きだった
  `TextStroke` / `TextShadow` インターフェースは削除し、生成型を
  `export type { TextStroke, TextShadow, TextAlignment } from
  './generated/rustCore'` として re-export した。これは `shape` の
  `GradientFill` とは扱いが違う判断で、`GradientFill` は 40+ kind 共通の
  共有インフラ型だったため手書きのまま残したが、`TextStroke` /
  `TextShadow` は text 専用型で他 kind から参照されていないことを確認した
  うえで完全に生成型へ寄せた。

## Alternatives considered

- **`measuredWidth`/`measuredHeight` を Rust 側へ持ち込まず、TS 側の
  独自フィールドとして残す（`TextObjectFields` には含めない）**: 却下。
  値は測定結果だが、シリアライズ・保存・往復（round-trip）の対象という
  「編集モデルの一部としての所在」は他の text フィールドと変わらない。
  タスク指示が求めていたのは「測定ロジック（ヒューリスティック計算）を
  無理に Rust へ移さない」ことであり、フィールド自体を除外することでは
  ないと判断した。
- **`TextStroke`/`TextShadow` を `shape` の `GradientFill` と同様に
  手書きのまま残す**: 却下。`grep` で確認した結果、この 2 つの型は
  `src/types.ts` と `sharedRendererNativeMediaSupport.ts` でしか参照されて
  おらず、共有インフラ型ではなく text 専用型だった。完全に生成型へ寄せる
  方が「型の二重管理を無くす」という R3 全体の目的に近い。

## Constraints / Gotchas

- **wire スキーマ統一は shape と同じ 3 コミット構成で完了できた。**
  `rust-backend/src/generated/text.rs` の手書き `GeneratedTextSource`
  （`colour`/`font_family`/`font_size`/`alignment`/`letter_spacing` の
  独自 snake_case 命名、`GeneratedTextAlignment` enum も別定義）を廃止し、
  `uxfd_rust_core::TextObjectFields` を直接 `serde_json::from_str` する
  ようにした。フォールバック処理
  （`textAlignment` 未指定 → `Left`、`letterSpacing` 未指定 → `0.0`）は
  `effective_text_alignment` / `effective_letter_spacing` という
  2 つの薄いヘルパー関数として `text.rs` 内に残した（shape の
  `effective_generated_gradient_source` と同じパターン）。
  `validators/text.rs` は作らなかった — text には shape の
  `validate_shape_object_fields` に相当するような「特定 shape_type を
  拒否する」といった構造的な検証が無く、既存の `parse_hex_colour_source`
  呼び出し（`fill`/`textStroke.colour`/`textShadow.colour`）だけで
  十分だったため。
- **`rustSceneSnapshot.ts` の `serialiseTextSource` は shape と同じ形
  （フィールドをそのまま JSON 化するだけ）に縮んだが、`measuredWidth`/
  `measuredHeight` も含めて JSON 化している。** これは shape が
  `width`/`height` を `source` 内にも含めていた（media plane の外側の
  `width`/`height` と重複するが、shape の描画ロジック内部でも参照するため）
  のと同じ考え方。text の場合 `measuredWidth`/`measuredHeight` は
  `build_generated_text_source_frame` では読まれず、`media.width`/
  `media.height`（= `textMediaBox` が計算した box）だけを使うため、
  実質的には冗長なフィールドだが、「`TextObjectFields` をそのまま
  JSON 化する」という単純さを優先し、個別に除外する特別扱いはしなかった。
- **`mediaReferenceForEditableRustScene` の text 部分は shape と同様、
  型定義の移送だけでは消えない。** 今回は `rust-backend` 側スキーマの
  統一まで同じスライスで終えたため、`serialiseTextSource` は最終的に
  薄いパススルーになったが、「型を rust-core に置いただけ」の段階
  （最初のコミット時点）ではまだ変換コードは残っていた。この事実は
  shape の progress ファイルに書いた教訓の再確認であり、
  `Rust_Source_Of_Truth_Plan.md` R3 節には既に追記済みなので、
  ここでの追記はしていない。
- **wire fixture（`ts_evaluation_parity` 用）の再生成は文字列の中身だけが
  変わり値は不変。** `realistic-heavy-titles.json` の `Text` media の
  `source` 文字列が snake_case から camelCase パススルー形式へ変わったが、
  `KNOWN_DIFFERENCES.json` は `differences: []` のまま変化なし。

## 実測

| 合格条件 | 結果 |
|---|---|
| `npx tsc --noEmit` | エラー 0 |
| `cargo test --manifest-path rust-core/Cargo.toml` | 全 pass |
| `cargo test --manifest-path rust-backend/Cargo.toml --bin uxfd-rust-backend` | 158 tests pass |
| `npm run codegen:types:check` | exit 0 |
| `npm run fixture:evaluation-parity` → `cargo test --test ts_evaluation_parity` | fixture 差分ゼロ、pass |
| `KNOWN_DIFFERENCES.json` | `differences: []` のまま（変化なし） |
| `npx vitest run`（全スイート） | 252 files / 1833 tests pass |

## 次の kind（`image`）への申し送り

- `shape` / `text` の 2 例から、「編集モデル移送 → 生成型 export →
  ワイヤースキーマ統一（rust-backend が生成型を直接デシリアライズ）」の
  3 コミット構成は再現性がある。`image` でも同じ順で進めてよい。
- `ImageObject`（`src/types.ts`）は現状 `src: string`, `filePath?: string`,
  `width: number`, `height: number` と比較的単純。ただし `image` は
  ファイルパス解決（`src`/`filePath` の使い分け、相対パスの正規化）が
  絡む可能性があるため、`rustSceneSnapshot.ts` 側で `image` 用の
  シリアライズ関数がどこにあるか（`mediaReferenceForObject` 内の
  `object.type === 'image'` 分岐）を先に確認してから着手するとよい。
- `TextStroke`/`TextShadow` のように「専用型か共有型か」の判断は、
  `grep -rln` で参照元ファイルを先に確認してから、生成型へ完全に
  寄せるか手書きのまま残すかを決めるとよい（shape の `GradientFill` は
  共有型だったため手書きのまま残した一方、text の 2 型は専用型だったため
  完全に生成型へ寄せた）。
