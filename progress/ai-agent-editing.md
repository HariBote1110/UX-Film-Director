# AIエージェント編集用レシピ

## Decision

- 動画編集の一次編集面を `public/agent-projects/*.json` に置き、`src/agentProject/agentProject.ts` で短いレシピから既存の `.uxfd-project` v2 へ展開する。
- レイヤーは安定した文字列ID、時間は秒、座標とサイズはプロジェクトピクセルで表現する。これにより、エージェントが巨大な保存JSONの内部フィールドを推測せずに差分編集できる。
- `npm run agent:validate` を構造検証、`npm run agent:video` をElectron上のプレビュー・MP4出力の検証として提供する。

## Alternatives considered

- `.uxfd.json` を直接編集する案は、オブジェクト型ごとの必須フィールドが多く、意図の差分が読みにくいため採用しなかった。
- ReactコンポーネントやZustandストアへエージェント専用の編集APIを増やす案は、UI状態と作品データが混ざり、保存・再現性が下がるため採用しなかった。

## Constraints / Gotchas

- 現在のレシピで使える `kind` は `shape`、`text`、`particle`、`dotField`、`shatteredSphere`。新しい種類はビルダーとテストを同時に更新する。
- `agent:video` はレシピを `public/` 配下から読み込む。外部ファイルを使う場合は、まず `public/agent-projects/` に置く。
- 動画出力の成果物は `.codex/video-export-e2e/video-export-e2e-output.mp4` に置かれ、Git管理対象外である。
