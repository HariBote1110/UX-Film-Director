# R4-4/R4-5: agent-projectレシピ解析のrust-core移送（2026-08-22）

## 決定
- `src/agentProject/agentProject.ts` の `parseAgentProjectSpec`/
  `buildAgentProjectFile` を `rust-core/src/agent_project.rs` へ1:1移植した。
  `AgentProjectSpec`（`AgentObjectSpec` は `#[serde(tag = "kind")]` の
  内部タグ付きenum、`TimelineObject`/`BaseObject`と同じ「flatten + tag」
  パターン）・`parse_agent_project_spec(&str) -> Result<AgentProjectSpec, String>`・
  `build_agent_project_file(&str) -> Result<ProjectFile, String>` を新設。
  検証エラーメッセージはTS版と同じ日本語文言をそのまま移植した
  （AIエージェントがレシピ作者としてこのメッセージを直接読むため）。
- particle/dotField/shatteredSphereの既定値展開は、TS側が
  `objectFactories/*.ts` の専用ファクトリ関数（`buildDefaultStandardParticleObject`
  等）を呼んでいたのに対し、Rust側は対応する `*ObjectFields` の
  `impl Default`（R3で追加済み・doc commentで「UIの固定リテラルと同値」と
  明記されている）をそのまま使う設計にした。二重実装を避けつつ、
  実際の既定値はTSファクトリと同じ値になる（`rust-core/tests/agent_project_schema.rs`
  の実フィクスチャ経由テストで確認）。
- `new Date().toISOString()`（`savedAt`）はchrono等の外部クレートを追加せず、
  `std::time::SystemTime` + Howard Hinnantの`civil_from_days`アルゴリズムで
  ISO8601 UTC文字列を組み立てる自前実装にした（`iso8601_utc_now`）。

## schemaの差分（`schema/agent-project.schema.json`）
`codegen_types` に `AgentProjectSpec` を登録し、手書きJSON Schemaを
`schemars` 生成物へ置換した。差分は主に以下（すべて**緩くなる方向**）:
- `additionalProperties: false` が無くなる（生成物は既定でadditionalPropertiesを
  制約しない）。ただし実際のTS/Rustパーサーは元々このプロパティ制約を
  実行時検証していなかった（`parseAgentProjectSpec`は未知フィールドを
  無視するだけでエラーにしない）ため、**これは生成物が実際の挙動に
  近づいた**というのが正しい理解であり、手書きスキーマの方が実装より
  厳しかった既知の乖離だった。
- `exclusiveMinimum`/`minItems`/`colour`パターン（`^#[0-9a-fA-F]{6}$`）/
  `stops`の`minimum`/`maximum`などのピンポイントな制約は生成物には出ない
  （schemarsはRust型の構造は反映するが、値レンジの制約はRust型システムに
  現れないため）。これらの実行時検証は元々 `parse_agent_project_spec`
  （手書きバリデータ）側にしかなく、schemaはエディタ補完の参考情報という
  位置づけは変わらない。
- `version: { "const": 1 }` が `{ "type": "integer", "minimum": 0 }` に
  緩くなる（Rust側`version: u32`という素直な型のため）。実際の値検証は
  `parse_agent_project_spec` が担う。

いずれも「Rustパーサーが唯一の正」という既存方針を裏付ける結果であり、
挙動を変える必要のある差分は無かった。

## `agent:validate` のRust化（R4-5）
- `rust-core/src/bin/agent_validate.rs`（新設CLI）: 引数のファイルパス
  （省略時は標準入力）を読み、`parse_agent_project_spec`の結果に応じて
  exit 0/1、エラーはstderrに出す。
- `scripts/validate-agent-project.mts` は `cargo run --manifest-path
  rust-core/Cargo.toml --bin agent_validate` を`spawnSync`する薄いラッパに
  書き換えた（`rust-backend`の`rust:run`スクリプトと同じ`cargo run`呼び出し
  パターンを踏襲、`--release`は使わない）。有効/無効レシピ双方で
  `npm run agent:validate`のexit code・メッセージを確認済み。

## IPC境界の決定（R4-4/R4-5、renderer実行時消費）
`rg buildAgentProjectFile` で調査した結果、`parseAgentProjectSpec`の
呼び出し元はテストのみだったが、`buildAgentProjectFile`は
`src/main.tsx`（`?agentProject=<path>`クエリでレシピをfetchしてロードする
renderer実行時パス）から呼ばれていた。これはR4-2/R4-3の`projectFile.ts`と
同じ「renderer実行時にRustロジックが必要」なケースのため、**IPC経由に
一本化**した（TS側に並行実装は残さない）:
- `rust-backend/src/agent_project.rs`: `agent.buildProjectFile` RPC
  ハンドラ（`project.deserialize`と同じパターン、paramsスキーマ違反は
  `-32602`、ドメインエラー（未知レイヤー参照等）は新設の
  `AGENT_PROJECT_INVALID_CODE = 32620`）。`rpc_dispatch.rs`に登録。
- `electron/main.ts`: `rust-backend-agent-build-project-file`ハンドラ
  （`sceneRpcFailure`を再利用、`project.deserialize`ハンドラと同型）。
- `electron/preload.ts`: `window.rustBackend.buildAgentProjectFile`。
- `src/vite-env.d.ts`: 対応する型。
- `src/agentProject/agentProject.ts`: `buildAgentProjectFile`を
  `RustBackendAgentProjectBridge`注入可能な非同期関数へ縮小（566行→79行）。
  `parseAgentProjectSpec`は削除（テスト以外の呼び出し元が無く、CLI側は
  Rustを直接呼ぶため不要）。`src/main.tsx`の`agentProjectPath`読み込みを
  `await`対応に変更（`response.json()`→`response.text()`、`buildAgentProjectFile`
  にJSON文字列をそのまま渡す）。

## テストの扱いとRust側等価テストへのマッピング
- `src/agentProject/agentProject.test.ts`: バリデーション/レイアウト解決の
  実体テストをすべて削除し、`rustBackendProjectFileBoundary.test.ts`と
  同じ「IPC配線の一貫性」テスト＋bridge差し替えによるエラー伝播テスト
  （3件）へ縮小。等価カバレッジ:
  - バリデーションエラーメッセージ・align/relativeToのレイアウト解決・
    gradient/filter展開・kind別既定値 → `rust-core/tests/agent_project_schema.rs`
    （11→12件、実フィクスチャai-demo/explainer/focus-tipsのparse/build/
    round-tripテストを含む）。
- `src/agentProject/explainerProject.test.ts`: 削除。等価カバレッジは
  `rust-core/tests/agent_project_schema.rs`の
  `explainer_recipe_expands_expected_scene`（duration/object id/text内容の
  アサーションをそのまま移植）。
- `rust-backend/src/agent_project.rs`の`#[cfg(test)] mod tests`（3件）で
  RPCハンドラ自体（実フィクスチャでのbuild成功・ドメインエラー・
  invalid params）を直接カバー。R4-2と同じ既知のギャップ（Electron実
  プロセスを起動する真のIPC E2Eはこのリポジトリに基盤が無い）が
  ここにも残る。

## ゲート結果（2026-08-22）
- `npx tsc --noEmit`: green。
- `cargo test --manifest-path rust-core/Cargo.toml`: 全green
  （新規`agent_project_schema.rs` 12件を含む）。
- `cargo test --manifest-path rust-backend/Cargo.toml`: 全green
  （新規`agent_project::tests` 3件を含む）。
- `npm run codegen:types:check`: exit 0（`AgentProjectSpec`ほか11型の
  新規生成物と`schema/agent-project.schema.json`置換をコミット済み）。
- `npm run agent:validate`: 有効/無効レシピ双方でexit code・メッセージを
  確認済み。
- `npx vitest run`: 全green（`agentProject.test.ts`をadapt、
  `explainerProject.test.ts`を削除、他は無変更）。

## stream-1C（agent-projectレシピ解析のRust移送）完了判定
**完了と判断する。** レシピの解析・展開・妥当性検証・既定値補完は
すべて`rust-core::agent_project`が正本となり、`agent:validate`・
renderer実行時（`agent.buildProjectFile` IPC）ともにそこへ一本化した。
TSに残るのは薄いIPCデリゲーションのみ。R4全体（`historySlice`の
undo/redoコマンド化）は本バッチのスコープ外で別途未着手のまま。
