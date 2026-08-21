# R3 最初のスライス: `shape` kind の編集モデルを rust-core へ移す

## Decision

- `rust-core/src/schema.rs` に `ShapeType` / `ShapeGradientKind` / `ShapeGradientScope` /
  `ShapeGradientFill` / `ShapeObjectFields` を追加した。既存の評価用ワイヤー型
  （`Clip` 等）は snake_case のままだが、こちらは編集モデルなので TS 側の既存命名
  （camelCase）を保つよう個別に `#[serde(rename = "...")]` / `#[ts(rename = "...")]`
  を付けた（構造体レベルの `rename_all` にしなかったのは `shape_type` の内部識別子と
  TS 側 `shapeType` の対応をコードで明示したかったため）。
- `ShapeObjectFields::default()` は Timeline.tsx の `addShapeAt` が今日生成している
  既定値（`shapeType: 'rect'`, `width: 200`, `height: 100`, `fill: '#ff0000'`,
  `gradient: undefined`, `cornerRadius: undefined`）と一致させた。これが
  「オブジェクトを作ったときの既定値の正本」になる。ただし **Timeline.tsx 自体は
  このタスクの所有スコープ外なので書き換えていない** — 依然として自前の
  リテラルを持ったままで、Rust の Default とは値が重複している（後述の Gotcha）。
- `src/types.ts` の `ShapeObject` は
  `BaseObject & ShapeObjectFields & { type: 'shape' }` という交差型に縮めた。
  `type: 'shape'` は判別用の literal で、ts-rs では素直に表現しづらいため
  手書きのまま残した。`BaseObject` と `GradientFill`（共有型）はまだ Rust 化せず
  手書きのまま — この 2 つは 40+ kind すべてが使う共有インフラ型なので、
  「1 kind = 1 コミット」の原則を守るなら shape 単体の移送では触らない判断にした。

## Alternatives considered

- **`ShapeObject` をひとつの flat 生成型として re-export（`BaseObject` ごと Rust 化）**:
  却下。`BaseObject` は 40+ kind 共通で、`motionPath` / `keyframes` / `shadow` /
  `filters` / `groupGradient` など多数の依存型（`ObjectFilter` は特に巨大な
  タグ付き union）を今回のスコープに巻き込むことになり、「shape から始める」という
  計画の意図（依存の少ないものから）に反する。次の kind でも同じ判断が要る。
- **`serialiseGeneratedShapeSource` / `serialiseGeneratedGradientSource` の
  snake_case 変換ロジックの削除**: 断念。これらは `rust-backend` 側の
  `sources.rs`（`ShapeSource` 構造体、`fill_colour` / `shape_type` などの
  wire フォーマット）へ渡す JSON を組み立てる関数で、渡し先の型は
  `rust-backend` にある。今回の作業スコープ（`rust-core/`, `src/types.ts`,
  `rustSceneSnapshot.ts`, generated-type files, `progress/`）に `rust-backend/`
  は含まれないため、ここは変更していない。

## Constraints / Gotchas

- **`mediaReferenceForEditableRustScene` の shape 部分は消えなかった。**
  R3 計画の合格基準は「対応部分が消えることを確認する。消えないなら移送できて
  いない」だが、shape の場合は消えない理由が構造的なもの — この関数
  （実体は `mediaReferenceForObject` とその配下の `serialiseGeneratedShapeSource`）
  は編集モデル（今回 Rust 化した `ShapeObjectFields`）を **rust-backend の
  別スキーマ**（`rust-backend/src/generated/sources.rs` の `ShapeSource`、
  snake_case、`fill_colour`/`shape_type` 等の異なるフィールド名）へ変換している。
  編集モデルの型がどこで定義されていても、この 2 つの異なるスキーマ間の変換
  コード自体はどのみち必要になる。**「消える」ことが起こるとすれば、それは
  `rust-backend` 側のスキーマ自体を rust-core 由来にする（または生成型を
  そのまま受け取れるようにする）フェーズが別途要るということ** — これは
  現行の R3〜R7 のどのフェーズ番号にも明記されていない。次の kind（text 等）
  でも同じ壁にぶつかるはずなので、計画側でこの事実を反映するか、
  「合格条件」の文言を「型定義が消える」に絞るか要検討。
- **生成型の `Option<T>` は `T | null | undefined` になる（R1 と同じ既知の癖）。**
  `ShapeGradientFill.scope: Option<ShapeGradientScope>` が生成 TS では
  `scope?: ShapeGradientScope | null` になり、手書きの `GradientFill.scope?:
  'group' | 'connected'`（null 無し）と構造的に非互換になった。
  `rustSceneSnapshot.ts` の `serialiseGeneratedGradientSource` は元々 `scope` を
  読んでいなかったので、引数型を `Pick<GradientFill, 'type' | 'colours' |
  'stops' | 'direction'>` に絞ることで回避した（呼び出し元はこの 1 箇所のみで
  影響範囲を確認済み）。次の kind で同じ関数を使う場合は同じ罠に注意。
- **Timeline.tsx の既定値は今回移していない。**
  「`objectFactories` が既定値を持つ側」という計画の前提は shape には
  そのまま当てはまらない — `shape` には `objectFactories/` 配下の専用ファイルが
  存在せず、`src/components/Timeline.tsx` の `addShapeAt` 内にリテラルとして
  ベタ書きされている。`Timeline.tsx` は今回の所有スコープ外のため触っておらず、
  Rust 側の `Default` と値が重複したままになっている
  （どちらも `width: 200, height: 100, fill: '#ff0000'`）。将来 UI 側の
  リテラルを `ShapeObjectFields::default()` 相当から引く形に揃えるなら、
  スキーマを JSON Schema 経由で読むのではなく、TS 側にも default 定数を
  生成する仕組み（今は無い）を R1 の codegen 基盤に足す必要がある。

## 実測

| 合格条件 | 結果 |
|---|---|
| `npx tsc --noEmit` | エラー 0 |
| `cargo test --manifest-path rust-core/Cargo.toml` | 全 pass（新規 3 件を含む） |
| `npm run codegen:types:check` | exit 0 |
| `npm run fixture:evaluation-parity` → `cargo test --test ts_evaluation_parity` | fixture 差分ゼロ、pass |
| `KNOWN_DIFFERENCES.json` | `differences: []` のまま（変化なし） |
| 関連 vitest（rustSceneSnapshot 系・objectFactories 系 37 ファイル） | 164 tests pass |
