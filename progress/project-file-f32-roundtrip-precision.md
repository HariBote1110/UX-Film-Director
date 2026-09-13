# プロジェクトファイルの f32 ラウンドトリップ精度

## Decision

- プロジェクトファイルの保存形式、フィールド名、Rust schema の型は変更しない。
- `project.deserialize` の成功応答で、`ProjectFile` を `json!({ "project": project })` に直接埋め込まない。型付き `ProjectFile` を `project_file_to_json_string` で先に JSON 文字列化し、その結果を既存 RPC の `serde_json::Value` 境界へ読み戻す。
- これにより、RPC 応答の最終 JSON 化まで `f32` の最短表現（`1.03`、`0.65`、`0.94`）を維持し、既存の renderer 側 shape と IPC 契約を保つ。
- 原因は rust-core の `f32` schema 自体ではなく、rust-backend の deserialize 応答生成時の `ProjectFile → serde_json::Value` 変換だった。修正前テストで `main.rs` と同じ `serde_json::to_string(&response)` を通して再現し、修正後に同じ経路で固定した。

## Alternatives considered

- すべての schema の `f32` を `f64` に変更する案は、描画・編集モデルの精度方針と型生成範囲を広げ、保存形式の意味も変えるため採用しなかった。
- `RpcResponse.result` 全体を `RawValue` ベースへ変更する案は、約65箇所の RPC 応答生成へ波及する。今回必要な project.deserialize の境界だけで解決できるため採用しなかった。
- 既存の `project_file_to_json_value` を文字列化に使い続ける案は、`Value` の数値が `f64` として保持されるため不適切である。この関数は構造比較テスト専用として残す。
- TS 側の `parseProjectPayloadV2`/restore は bridge の値をそのまま受け渡す薄い層であり、今回の差分を生成していない。Rust backend の実 RPC 応答テストで根本原因を特定できたため、TS schema や restore ロジックは変更しない。

## Constraints / Gotchas

- `serde_json::to_value(&ProjectFile)` は `f32` を `Value::Number`（実質 `f64` 保持）へ変換する。`1.03_f32` は `1.0299999713897705` として後続の JSON 化に現れる。
- `ProjectFile` から `serde_json::to_string`/`to_string_pretty` へ直接渡す経路は ryu の最短往復表現を使うため、保存側の `project.serialize` は既に正しい。ロード側でも同じ直接文字列化を先に行う必要がある。
- 退行を導入したコミットは `d4171976`（2026-08-22、R4-2、rust-backend RPC に `project.deserialize`/`project.serialize` を追加）。`git show d4171976` と `git blame rust-backend/src/project_file.rs` で、当初の `json!({ "project": project })` が導入点であることを確認した。後続の `23546d8c` は rust-core の直接文字列化を追加したが、deserialize 応答の Value 化は残したため退行を防げなかった。
- 既存の backend テストは deserialize 応答内の同じ `Value` を比較しており、数値の表記劣化を検出しなかった。新テストは実際の RPC 応答 JSON 化まで検証する。
