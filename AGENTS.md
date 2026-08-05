# AIエージェント向け編集ガイド

このリポジトリでは、動画の内容をまず `public/agent-projects/*.json` のレシピとして編集します。アプリ内部の大きなReactコンポーネントやZustandストアを直接書き換えなくても、レイヤー・オブジェクト・タイミングを差分としてレビューできます。

## 最短ワークフロー

```bash
npm run agent:validate -- public/agent-projects/ai-demo.json
npm run agent:video -- public/agent-projects/ai-demo.json
```

動画は `.codex/video-export-e2e/<レシピのファイル名(拡張子なし)>-e2e-<プロセスID>.mp4` に生成されます(例: `focus-tips.json` を実行した場合 `.codex/video-export-e2e/focus-tips-e2e-12345.mp4`)。実行のたびにファイル名が変わるため、同じレシピを繰り返し実行しても過去の出力を上書きせず、複数の実行結果を並べて比較できます。実際に生成された正確なパスは `npm run agent:video -- <レシピパス>` の標準出力ログ(`[video-export-e2e] 動画出力を開始(...): <パス>`)で確認してください。

なお `test:video-export:e2e` など、レシピを指定しない他の呼び出しは従来どおり固定パス `.codex/video-export-e2e/video-export-e2e-output.mp4` に生成されます。

## レシピの編集規約

- `project`: `width`、`height`、`fps`、`sampleRate`、`duration` を必須にする。
- `layers`: 安定した英数字の `id` を持つ。オブジェクトはレイヤー番号ではなくこの `id` を参照する。
- `objects[].start` / `duration`: 秒。`x` / `y` / `width` / `height`: プロジェクトピクセル。
- 色は `#rrggbb`、オブジェクトIDは重複させない。
- `to` を指定すると、開始位置から終了位置までの位置アニメーションになる。
- 現在の `kind` は `shape`、`text`、`particle`、`dotField`、`shatteredSphere`。

表現を増やす場合は `src/agentProject/agentProject.ts`、そのテスト、ガイドの対応表を同じ変更で更新します。JSONを正しく読めるかは `agent:validate`、実際の見た目とMP4化は `agent:video` で確認します。
