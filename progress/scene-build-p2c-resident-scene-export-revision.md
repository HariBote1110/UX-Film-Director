# P2c: cut-over 下の常駐 scene export revision 収束

## 事実

- `scene.replace` は成功時、scene source が Rust / TypeScript fallback のどちらでも、要求された revision を `state.scene_sessions` に保存する。cut-over による Rust builder の実行は revision を拒否・降格・書換えしない。
- scheduler は新しい `submitRevision` ごとに `onRemoteReady(null)` を通知する。Viewport はこれを受けて acknowledged revision を `null` にする。
- export は acknowledged revision ではなく、`replaceScene` 直後に更新する optimistic revision を resident encode payload へ渡していた。cut-over では builder を含む replace が進行中でも export 開始が可能なため、backend が保持する直前の確認済み revision と optimistic revision が一致しない。
- 対照構成では replace が export 開始までに完了しやすく、この競合が顕在化しない。既測定の scene RPC `requested=4 / resolved=4 / stale=1 / failed=0` はこの説明と矛盾せず、`stale=1` は latest-wins の通常結果である。

## 決定

- P2c は候補 (a) を採る。新しい希望 revision の送信中も backend が実際に保持する acknowledged revision を捨てず、resident export は optimistic revision ではなくその acknowledged revision を渡す。
- この変更は export を待機させない。export 時点で backend が確認済みの scene を明示的に pin するため、native encode の revision 比較と一致する。

## 代替案として退けたもの

- 候補 (b) の export 専用 lifecycle は採らない。既存 scene session と別に export 開始時の replace / 確認 API と所有権を増やす必要があり、確認済みrevisionを既に scheduler が保持する今回の不一致には過剰である。
- `waitForReady` / export 側ポーリングは再導入しない。既存試行で実機15秒タイムアウトとなり、根本の「未確認 optimistic revision を送る」問題を解かない。

## 制約・注意点

- acknowledged revision は「最新の希望revision」ではなく「backend が現在保持する revision」である。replace 進行中の export は後者を使うため、無効な revision を送らない。
- 既定OFFの cut-over flags、scene.replace wire 形状、fallback 理由の優先順位は変更しない。
