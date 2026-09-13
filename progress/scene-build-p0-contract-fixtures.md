# Scene Build P0 契約フィクスチャ

## Decision

- `rust-core/tests/fixtures/editable-scene-builder/cross-object-resolution.json` を、現行 TypeScript serializer / resolver の出力を固定する言語非依存の契約 fixture とした。
- fixture は audio、GetColor、group-control、preview proxy / export original の各非対称規則を、入力 graph・時刻・目的・期待 media / generator source / Project で表す。
- Rust 側は P1 の builder が存在するまで fixture 妥当性と構造 JSON 比較器だけを実行する。builder 比較テストは明示的に ignore とし、未実装の結果を通過扱いにしない。

## Alternatives considered

- Rust resolver の期待値を手書きする案は、現在の TS 実装との差分を検出できず、P0 の固定点として不十分なため採用しなかった。
- JSON 文字列の完全一致は object key 順の実装詳細に依存するため採用しなかった。object は key 順非依存、array は順序有意の構造比較にした。

## Constraints / Gotchas

- fixture の再生成は `npm run fixture:editable-scene-builder`、drift 検証は Vitest で行う。
- PSD の `source_active_layer_ids` は現在の TS がソートした canonical 順で fixture に固定される。一方、通常の JSON array は順序有意である。
- `progress/INDEX.md` はユーザー指定により更新しない。
- P0 はテストと fixture のみであり、`src/` の production 関数、Rust production crate、runtime wire は変更しない。
