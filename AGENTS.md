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
- `layers`: 安定した英数字の `id` を持つ。オブジェクトはレイヤー番号ではなくこの `id` を参照する。配列の並び順がそのままz順(先頭が背面、末尾が前面)。**同じレイヤーに大きな不透明シェイプを置くと、背面レイヤーの光やグラデーションは下半分・上半分だけがはみ出て見える「ドーム状のアーティファクト」になりやすい。** 背景の光やグロー表現は、カードなど不透明オブジェクトより前面のレイヤーに置くか、後述の `blur` フィルターで輪郭を溶かして目立たなくすること。
- `objects[].start` / `duration`: 秒。`x` / `y` / `width` / `height`: プロジェクトピクセル(左上原点)。
- 色は `#rrggbb`、オブジェクトIDは重複させない。
- `to` を指定すると、開始位置から終了位置までの位置アニメーションになる。
- 現在の `kind` は `shape`、`text`、`particle`、`dotField`、`shatteredSphere`、`image`、`video`、`audio`。
- 参考スキーマ: `schema/agent-project.schema.json`(エディタ補完・自己検証用。実行時の唯一の正は `src/agentProject/agentProject.ts` の `parseAgentProjectSpec`)。

### 画像・動画・音声を使う

- `kind: "image"` / `"video"` / `"audio"` は `src` が必須(`public/` からの相対パス。例: `/icon.jpg`)。`video`/`audio` は `volume`(既定1)・`muted`(既定false)を指定できる。
- `video`/`image` は `width`/`height` を指定しないと320×180になる。`audio` に `width`/`height` は不要。
- 実在しないファイルを `src` に指定してもバリデーションは通るが、書き出し時に何も再生されない点に注意(パスの存在確認は事前に自分で行うこと)。

### 背景をしっかり作り込む(グラデーション・ぼかし)

- `kind: "shape"` に `gradient: { type: "linear" | "radial", colours: ["#rrggbb", ...], stops: [0, ..., 1], direction?: 度数 }` を指定すると、フラットな `fill` の代わりにグラデーション塗りになる。`colours` と `stops` は同じ件数にする。背景パネルを単色にせず、radialグラデーションで中心と外周に濃淡をつけると画面に奥行きが出る。
- どのオブジェクトにも `filters: [{ "type": "blur", "strength": 数値(既定20), "quality": 数値1-4(既定2) }]` を付けられる。ハードエッジな図形を「光の演出」として使うときは、必ず `blur` を付けて輪郭を溶かすこと(付けないと固い縁が目立って不自然に見える)。ただしGPUアクセラレーションが効かない環境(`uxfdSharedRendererPresenterStatus` が `fallback`)では `strength` を大きくする・対象を大きくするほど書き出しが遅くなり、`agent:video` がタイムアウトしやすくなる。まずは `strength: 20〜30` 程度・対象サイズも画面の一部にとどめ、必要なら `UXFD_VIDEO_EXPORT_E2E_TIMEOUT_MS` で書き出しのタイムアウトを延長する。

表現を増やす場合は `src/agentProject/agentProject.ts`、そのテスト(`src/agentProject/agentProject.test.ts`)、このガイド、`schema/agent-project.schema.json` を同じ変更で更新します。JSONを正しく読めるかは `agent:validate`、実際の見た目とMP4化は `agent:video` で確認します。

## 既知の制約

- 動画書き出しはVite dev server + Electronを起動する重量級のE2Eハーネス(`scripts/run-video-export-e2e.mjs`)経由のため、1回の実行に数十秒〜数分かかる。軽量なヘッドレスプレビュー手段は現状ない。
- `x`/`y`を省略した場合はプロジェクト中央になるだけで、「カードの中に収める」「他のオブジェクトを基準に相対配置する」といった自動レイアウトはない。座標は手計算するか、既存レシピの数値を参考にすること。
