# Rust 型から TypeScript 型を生成する（R1）

## Decision

- **`ts-rs` で TS 型、`schemars` で JSON Schema** の 2 本立て。
  `rust-core/src/bin/codegen_types.rs` が両方を吐く。
- 生成先は `src/generated/rustCore/`（22 型）と `schema/rust-core/`（同じ 22 型）。
- `#[ts(export)]` 属性は**使わない**。手動の `export_all` 呼び出しにした。
  属性を使うと ts-rs の自動 export が `cargo test` に混入し、テスト数が変わってしまう。
- ドリフト検出は `npm run codegen:types:check`
  （再生成 → `git diff --exit-code -- src/generated/rustCore schema/rust-core`）。
- `u64` フィールドは ts-rs 既定の `bigint` ではなく `number` に固定した（手書きミラーとの整合）。

## Alternatives considered

- **JSON Schema を人手の正本にして双方生成**: 見送り。Rust enum の内部タグ表現が制約される。
- **手書きミラーを残して境界テストで担保**: 却下（計画 §1 のとおり、型が 40 を超えて破綻している）。

## Constraints / Gotchas

- **生成型をそのまま re-export できなかった箇所が 2 つある。** どちらも tsc で実測して発見した。
  1. `Clip.subject_crop`: 生成型は `SubjectCropAnimation | null`（必須キー）だが、
     `buildEditableRustScene` は crop が無いときキー自体を省くスプレッド構文を使う。
     serde の `#[serde(default)]` ではキー省略と `null` は同義だが、TS の構造的型付けでは
     「必須キーの省略」はエラーになる。`subject_crop?:` の optional に戻して対応した。
  2. **readonly 配列**: 手書き型は `readonly T[]` だったが生成型は `Array<T>`（可変）。
     この向きの緩和は危険で、実際に `rustBackendVideoEncodeControl.test.ts` が
     `as const` で readonly 配列リテラルを渡しており、可変型にすると新規 tsc エラーになる。
     該当フィールドは readonly を維持するアダプタ型にした。
- **`EditableRustClip.kind` の型が広がった。** 元は V1 対応分だけの狭いリテラル部分集合だったが、
  生成型 `ClipKind`（全 variant）への置換で全種を受け入れるようになった。
  構築関数が返す値は元の部分集合のままなので実害は無いが、
  **「V1 未対応 kind を型で弾く」というドキュメント的効果は失われている。**
  R2 以降で気になるなら、生成型を狭めるアダプタを噛ませる余地がある。
- wire format は変わっていない。`rust-core/tests/fixtures/ts-evaluation-parity/` の
  fixture は byte 単位で不変（`npm run fixture:evaluation-parity` を実際に走らせて確認済み）。

## 実測

| 合格条件 | 結果 |
|---|---|
| `cargo test --manifest-path rust-core/Cargo.toml` | 116 passed / 0 failed（ベースラインと一致） |
| `npx tsc --noEmit` | エラー 0 |
| 主要 vitest 4 ファイル | 126 passed |
| fixture の byte 一致 | 差分ゼロ |
| `npm run codegen:types:check` | exit 0 |
