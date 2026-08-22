# Rust 正本集中計画 R7: ドキュメント正本の更新（全フェーズ完了総括）

## 決定

`Rust_Source_Of_Truth_Plan.md` の R7（ドキュメント正本の更新）を実施し、R0-R7 の
全フェーズ完了を確定した。対象文書は以下の4件。

- `markdown/architecture/00-overview.md`
- `markdown/architecture/01-decision-record.md`
- `markdown/architecture/02-rust-core-spec.md`
- `AGENTS.md`（確認のみ、修正不要）

## 実施内容

### 00-overview.md

「層構成」節を、R0-R6 が実測で確定させた現状（rust-core = 編集モデル/評価/保存形式/
コマンド/レシピの正本、rust-backend = `project.*`/`command.*`/`agent.*`/`psd.parseMeta`
を含む RPC サーフェス、native overlay = 両プラットフォーム既定 ON の唯一の描画経路、
TS 層 = UI・ダイアログ・IPC オーケストレーション・Windows nv12 窓限定の interim
presenter）へ書き換えた。MVP 節（3D/PSD 除外等）は当初の parity spike の記述として
そのまま残した（今回のスコープ外、層構成の更新とは独立した別の歴史的記述のため）。

### 01-decision-record.md

ADR-014/015/016 を計画書 §5 の提案文から転記した。単純な転記ではなく、各 ADR に
「実装結果」節を追加し、提案時点の決定・理由・却下案と、実際に R0-R6 で実装された
内容の差分を明示した。特に ADR-016 は R6 で「presenter 全面削除」から「interim 専用
縮小」へ改訂されており、これは Windows W7 の nv12 attach 窓という設計上の制約による
ものであることを正直に記録した（ADR-011 の 2026-08-23 改訂節と整合させた）。
ADR 番号は 014 から採番し、既存の ADR-001〜013（ADR-012 は欠番、`Windows_Port_Plan.md`
予約済みと明記済み）との衝突がないことを確認した。

### 02-rust-core-spec.md

「MVP のモデル」を「モデル概要」へ更新し、42 kind の `TimelineObject` を含む実装済み
スキーマを記述した。旧 MVP 縦スライス仕様（Project/Track/Clip/Property/Effect 等）は
「MVP 時代の縦スライス仕様（歴史的記述、現在も成立する部分のみ有効）」という見出しで
明示的に歴史扱いにした上で残した（時間表現・premultiplied alpha 等の原則は現在も
正本として有効なため削除はしない）。その後段に実装済み範囲を仕様レベルで記述する節を
新設した:

- Timeline Evaluation（実装） — R2 で評価経路が一本化されたこと、`ts_evaluation_parity`
  ハーネスが正本の一致を CI で担保していること。
- Command / Undo（実装、二層構成） — `SetObjectField` による汎用フィールドコマンド、
  構造コマンド群、`Command::Batch`（提案時点では想定していなかった拡張）。
- Project File API（実装） — `project_file.rs` の `ProjectFile`/V1→V2 migration/
  round-trip 保証、`project.serialize`/`deserialize` RPC。
- Agent Project API（実装） — `agent_project.rs`、`agent.buildProjectFile` RPC、
  `AGENTS.md` の記述との整合。
- PSD Meta Parsing（実装） — `psd_fast.rs`、`psd.parseMeta` RPC、e2e パリティゲート。

いずれも網羅的な API 一覧やコード引用ではなく、仕様レベルの記述 + ソースへの
ポインタ（ファイルパス・`progress/rust-source-of-truth-r*-*.md`）に留めた。

### AGENTS.md

R4-5 で「実行時の唯一の正は `rust-core/src/agent_project.rs` の `parse_agent_project_spec`」
「`src/agentProject/agentProject.ts` は Rust IPC への薄い委譲のみ」という記述に
既に更新済みであることを確認した。修正不要。

## ステールクレームのスイープ

`rg -n "ag-psd|psd-wasm|parse-psd|parseAgentProjectSpec|pushHistory\b|presenter.*削除"`
で `markdown/` と `AGENTS.md`/`README.md` 全体をスイープした。ヒットしたのは以下のみで、
いずれも日付付き変更履歴または削除済みモジュールの記録として妥当な歴史的記述であり、
修正対象ではないと判定した:

- `markdown/Implementation_Plan.md`／`markdown/Walk_Through.md`／
  `markdown/PSD_WASM_Challenge.md`／`markdown/Task.md`／`markdown/progress.md`:
  すべて日付のある実装ログ・チャレンジレポートで、当時の実装状態の記録として正しい。
- `markdown/architecture/01-decision-record.md` の ADR-011: 2026-08-23 改訂節が
  既に「presenter は削除しない」という現状を明記しており、旧文の「削除せず退避路として
  残す」という記述も改訂前の決定として文脈上正しい（今回さらに改訂節を追記済み）。
- `markdown/Native_Overlay_Agent_Prompt.md`:
  Native Overlay 実装（完了済みタスク）の起動プロンプトテンプレートであり、
  「やってはいけないこと」として書かれた禁止事項（当時の禁止ルール）。現在アクティブな
  設計文書ではなくタスク引き継ぎ用の過去のテンプレートのため、対象外と判断した。

`Windows_Port_Plan.md` の `Rust_Source_Of_Truth_Plan.md` への相互参照（§8 関連文書）
および Windows native overlay 既定 ON 化の記述（Phase 7、`WINDOWS_DEFAULT_ENABLED`
の flip 記録）を確認し、現状と整合していることを確認した。修正不要。

## ゲート

- `npx tsc --noEmit`: エラーなし（対象がすべて markdown/JSON のためコード非依存だが
  regression 確認として実行）。
- `npx vitest run`: 今回の変更にコード変更が無い（`package.json` の version 文字列のみ）
  ため対象範囲なしと判断し実行していない。
- `package.json` の version を `0.1.1-Beta-515d` → `0.1.1-Beta-515e` へ更新
  （非機能変更・ドキュメント更新のため SubVer のみ 1 進めた）。

## R0-R7 全体の完了状態（総括）

`Rust_Source_Of_Truth_Plan.md` の全フェーズがこの時点で完了している。

| Phase | 状態 | 完了日 |
|---|---|---|
| R0 二重評価の差分ハーネス | ★完了 | 2026-08-22 |
| R1 型の codegen 化 | ★完了 | 2026-08-22 |
| R2 評価ロジックの一本化 | 完了（KNOWN_DIFFERENCES.json 空） | 2026-08-22 |
| R3 編集モデルの正本移管 | ★完了 | 2026-08-22 |
| R4 保存形式・コマンド・レシピの移管 | ★完了 | 2026-08-22 |
| R5 PSD 単一実装化 | ★完了 | 2026-08-22 |
| R6 描画実装の整理（interim 専用縮小へ改訂） | ★完了 | 2026-08-23 |
| R7 ドキュメント正本の更新 | ★完了 | 2026-08-23 |

`00-overview.md` 基本方針 1・2・8 は実装とドキュメントの両面で充足された。ただし
「思想上の残り（責務台帳）」に記録した4項目（クロスオブジェクト配線マッピング、
`filterStack.ts` の編集 forward path、`layerTrackOps.ts` の reorder 計算、Windows
nv12 attach 窓の interim presenter 本体）は基本方針からの意図的な逸脱として台帳に
残っており、本計画のスコープでは解消しない将来課題として明示されている。
