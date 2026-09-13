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

## 追跡調査（command.apply 後の状態）

- 実アプリの重い編集ハーネスでは、`seed()` 直後の保存→読込は差分ゼロだった。一方、scrub・duplicate・undo/redo・scene 切替・再生後は Zustand 内ですでに `1.0299999713897705`、`0.6499999761581421` などが発生していた。
- 根本原因は `rust-backend/src/command.rs` の `command.apply` が、f32 を含む型付き `SceneData` を `json!({ "scene": next_scene })` に直接埋め込んでいたことだった。`historySlice`、フィルター、レイヤートラックのコマンド適用がこの応答を Zustand に戻すため、保存前に単精度ノイズが注入されていた。
- `typed_to_value_preserving_f32` を rust-backend の共有ヘルパーとして抽出した。型付き値を一度 `serde_json::to_string` で文字列化し、その後 `Value` に戻すことで、RPC の `Value` 境界でも f32 の最短表現を維持する。
- `command.apply` に `0.94` の応答表記を検証する Red→Green テストを追加した。修正前は `0.9399999976158142` となり、修正後は `0.94` になった。

## RPC 応答の監査結果

| 呼び出し箇所 | 判断 | 理由・対応 |
| --- | --- | --- |
| `command.rs:handle_command_apply` | 修正 | `SceneData` が undo/redo、フィルター、レイヤートラック経由で Zustand に戻り、保存対象になる。共有ヘルパーを使用。 |
| `project_file.rs:handle_project_deserialize` | 修正 | `ProjectFile` が Zustand に戻り、保存対象になる。既存の個別変換を共有ヘルパーへ置換。 |
| `project_file.rs:handle_project_serialize` | 対応不要 | `ProjectFile` を `Value` にせず `project_file_to_json_pretty` で直接文字列化する既存経路を維持。型付き入力の `1.03`/`0.65` と、展開表記がないことをテストで固定。 |
| `agent_project.rs:handle_agent_build_project_file` | 修正 | 生成した `ProjectFile` はエージェントの新規プロジェクトとして renderer/Zustand と保存経路へ渡る。共有ヘルパーを使用。 |
| `scene.rs:handle_scene_evaluate` (`snapshot`) | 対応不要 | `SceneSnapshot` はフレーム描画用の一時結果で、編集状態や保存ファイルへ戻らない。 |
| `scene.rs:dual_run_diagnostics` の比較用 `to_value` | 対応不要 | TS/Rust の構造比較専用で、RPC 応答や永続状態には出力しない。 |
| `scene.rs:handle_scene_replace` の `dualRun` 診断 | 対応不要 | 診断情報のみで、編集プロジェクトを renderer/Zustand へ返す応答ではない。 |
| `native_render.rs:133-135` (`snapshot`/`media`/`nv12Sources`) | 対応不要 | encode 内部へ渡す入力を `Value` 化しているだけで、RPC の成功結果には含めない。描画専用。 |
| `native_render.rs` の各成功応答 | 対応不要 | frame count、timing、render path などの描画・エンコード診断で、保存対象の型付き構造体を返さない。 |
| `media.rs` の PSD 応答 | 対応不要 | PSD の寸法・ノード情報や一時blobパスを返すメディア処理結果で、f32 を含む編集プロジェクトを返さない。 |
| `decode.rs` の `start`/`requestFrame` 応答 | 対応不要 | デコーダー制御情報とフレームバッファを返す描画経路で、Zustand の保存対象へ流れない。 |
| `rpc_dispatch.rs:health` | 対応不要 | `HealthResult` は文字列のみで f32 フィールドを持たない。 |
