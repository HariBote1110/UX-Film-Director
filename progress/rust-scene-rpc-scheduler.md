# Rust scene RPC スケジューラ

## 決定

- ChromiumからRustへのシーン同期は、編集時の`scene.replace`と再生時の`scene.evaluate`に分離する。
- `scene.replace`と`scene.evaluate`のエラーコード`-32060`、`-32061`、`-32062`は、rendererでそれぞれ`missingScene`、`staleRevision`、`revisionMismatch`として扱う。
- プレビュー用スケジューラは評価中のフレーム要求を一件だけ保持するlatest-wins方式とする。古い評価結果はpresentへ渡さない。
- revisionの置換中に新しいrevisionが到着した場合は、中間revisionを送らず、最新revisionだけを置換する。

## 検討した代替案

- 全フレームで評価済みスナップショットをChromiumから送る方式は、キーフレーム・グループ・エフェクト評価をrendererへ残すため採用しない。
- 各スクラブ要求を並列に評価する方式は、古い結果がnative overlayを上書きしうるため採用しない。

## 制約

- この段階ではReact/Viewport統合を行わない。既存presenter reuseとデコード要求IDの安全機構は、次段階でschedulerが採用した評価結果にのみ接続する。
- 書き出しはフレーム欠落を許容できないため、latest-winsのプレビューscene sessionを共有しない。
