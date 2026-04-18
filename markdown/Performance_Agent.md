# パフォーマンス計測（AI エージェント向け）

自律エージェントがリポジトリでパフォーマンス回帰を確認するための手順です。

## 前提

- 計測は **Electron ウィンドウ**内のレンダラーで実行されます（Pixi プレビューと同一プロセス）。
- 完了後にプロセスが終了するのは **`npm run perf:agent`**（`VITE_PERF_AGENT_MODE=1`）のときのみです。

## 実行コマンド

リポジトリルートで:

```bash
npm run perf:agent
```

初回は Vite と Electron の起動に時間がかかります。約 3 秒後にハーネスが走り、**数秒以内に Electron が終了**すれば正常です。

終了時の **プロセス終了コード**は、計測がすべて成功した場合 **0**、いずれかで例外や永続化失敗があった場合 **1** です（シナリオ行の失敗は `perf-agent-output.json` の `success` と `errorMessage` を参照してください）。

## 成果物（エージェントが読むファイル）

1. **`perf-agent-output.json`**（既定では **カレントワーキングディレクトリ**＝多くの場合リポジトリルート）
   - 各シナリオの行データ（`rows`）、成功可否、`csvFilePath` などが入ります。
2. **`UXFD_PERF_RESULT_JSON:` 行**（親プロセスの標準出力）
   - ターミナルログに 1 行で出ます。`jsonFilePath` の所在確認に使えます。
3. **累積 CSV**（Electron の `userData` 配下）
   - `performance-reports/harness-runs.csv` に追記されます（手動比較・履歴用）。

## 出力先を変える

メインプロセスの作業ディレクトリではなく明示したい場合:

```bash
UXFD_PERF_OUTPUT_DIR=/path/to/dir npm run perf:agent
```

## 失敗時の解釈

- `perf-agent-output.json` の `success` が `false` のときは `errorMessage` を確認してください。
- Electron が起動しない・即終了する場合は、先に `npm run dev` が通るかを確認してください。

## 手動（人間・デバッグ）

開発ビルドの DevTools から:

```js
await window.__UXFD_RUN_PERF_HARNESS__()
```

エージェントモード無効時はウィンドウは開いたままです。
