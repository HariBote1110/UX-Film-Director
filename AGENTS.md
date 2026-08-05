# AIエージェント向け編集ガイド

このリポジトリでは、動画の内容をまず `public/agent-projects/*.json` のレシピとして編集します。アプリ内部の大きなReactコンポーネントやZustandストアを直接書き換えなくても、レイヤー・オブジェクト・タイミングを差分としてレビューできます。

## 最短ワークフロー

```bash
npm run agent:validate -- public/agent-projects/ai-demo.json
npm run agent:video -- public/agent-projects/ai-demo.json
```

動画は `.codex/video-export-e2e/video-export-e2e-output.mp4` に生成されます。レシピの再生時間は `project.duration`、フレームレートは `project.fps` で決まります。

## レシピの編集規約

- `project`: `width`、`height`、`fps`、`sampleRate`、`duration` を必須にする。
- `layers`: 安定した英数字の `id` を持つ。オブジェクトはレイヤー番号ではなくこの `id` を参照する。
- `objects[].start` / `duration`: 秒。`x` / `y` / `width` / `height`: プロジェクトピクセル。
- 色は `#rrggbb`、オブジェクトIDは重複させない。
- `to` を指定すると、開始位置から終了位置までの位置アニメーションになる。
- 現在の `kind` は `shape`、`text`、`particle`、`dotField`、`shatteredSphere`。

表現を増やす場合は `src/agentProject/agentProject.ts`、そのテスト、ガイドの対応表を同じ変更で更新します。JSONを正しく読めるかは `agent:validate`、実際の見た目とMP4化は `agent:video` で確認します。
