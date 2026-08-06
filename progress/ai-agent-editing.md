# AIエージェント編集用レシピ

## Decision

- 動画編集の一次編集面を `public/agent-projects/*.json` に置き、`src/agentProject/agentProject.ts` で短いレシピから既存の `.uxfd-project` v2 へ展開する。
- レイヤーは安定した文字列ID、時間は秒、座標とサイズはプロジェクトピクセルで表現する。これにより、エージェントが巨大な保存JSONの内部フィールドを推測せずに差分編集できる。
- `npm run agent:validate` を構造検証、`npm run agent:video` をElectron上のプレビュー・MP4出力の検証として提供する。

## Alternatives considered

- `.uxfd.json` を直接編集する案は、オブジェクト型ごとの必須フィールドが多く、意図の差分が読みにくいため採用しなかった。
- ReactコンポーネントやZustandストアへエージェント専用の編集APIを増やす案は、UI状態と作品データが混ざり、保存・再現性が下がるため採用しなかった。

## Constraints / Gotchas

- 現在のレシピで使える `kind` は `shape`、`text`、`particle`、`dotField`、`shatteredSphere`、`image`、`video`、`audio`(2026-08-05追加)。新しい種類はビルダーとテストを同時に更新する。
- `agent:video` はレシピを `public/` 配下から読み込む。外部ファイルを使う場合は、まず `public/agent-projects/` に置く。
- 動画出力の成果物は `.codex/video-export-e2e/<レシピ名>-e2e-<pid>.mp4`(レシピ経由の実行時)、またはレシピ非経由の呼び出し(`test:video-export:e2e`等)は従来どおり `video-export-e2e-output.mp4` に置かれ、Git管理対象外である(2026-08-05: 固定ファイル名だと連続実行のたびに上書きされていた問題を修正)。
- `agent:validate` は2026-08-05以降、独自の重複ロジックではなく `vite-node` 経由で `src/agentProject/agentProject.ts` の `parseAgentProjectSpec` を直接呼ぶ(`scripts/validate-agent-project.mts`)。CLIバリデーションとランタイムの実装が乖離する問題を解消した。
- 参考用JSON Schemaを `schema/agent-project.schema.json` に置いた。ただし実行時の検証には使っておらず(ajv等の追加依存を避けた)、エディタ補完・AIの自己検証の補助に留まる。実装との乖離が起きたら `agentProject.ts` を正とする。
- `shape` の `gradient` と、任意オブジェクトの `filters: [{type:"blur",...}]` を追加した。背景の光やハローを表現する際、不透明な前面レイヤーのオブジェクトに大部分を隠されると輪郭だけが「ドーム状」に露出して見える不具合的な見た目になる。`blur` で輪郭を溶かすと解決するが、GPU非対応のフォールバックレンダリング環境では `strength`/対象サイズを大きくするほど書き出しが極端に遅くなり、`agent:video` がタイムアウトする(400秒でも完走しないケースを確認)。実運用では `strength: 20〜30` 程度・対象を画面の一部にとどめるのが安全。
- 座標を毎回手計算する負担が大きいというフィードバックを受け、2026-08-06に `align`(`start`/`center`/`end`)・`relativeTo`(先に定義したオブジェクト基準の相対配置)・`padding` を追加した。`relativeTo` は定義順を前提とし、後方参照・未定義は日本語エラーで拒否する。`text` の実測幅はビルド時点で不明なため、厳密な中央寄せをしたいテキストは `width`/`height` に想定サイズを明示する必要がある(自動計測はしない)。`focus-tips.json` を全面的にこの機能へ書き換え、旧来の手計算座標と数値が一致することを確認済み。
- 背景が「派手すぎる」というフィードバックを受け、`focus-tips.json` のhalo不透明度(0.55→0.3)・粒子数(60→36)・ドット副色の彩度を落とした。装飾要素は主張しすぎない濃度にとどめるのが無難。
