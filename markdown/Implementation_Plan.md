# 実装計画

## 方針
1. 変更範囲は「効果が大きく、挙動リスクが低い箇所」を優先する。
2. `useStore()` の全体購読を減らし、必要な値だけ購読する。
3. 高頻度ループ（再生・ドラッグ・書き出し）での不要処理を削減する。

## 実施ステップ
1. `useStore` の更新処理を最適化する  
`updateObject` で実際に差分がある場合のみ更新し、`duration` 再計算は時間系変更時のみに限定する。

2. UI 側の購読をセレクタ化する  
`App`、`Timeline`、`TimelineItem`、`Viewport`、`PropertyPanel` などで `selector + shallow` を導入する。

3. タイムライン再描画を抑制する  
`TimelineItem` を `React.memo` 化し、コールバックの参照を安定化して再生中の無駄な再レンダリングを減らす。

4. エクスポート転送を軽量化する  
`toDataURL(base64)` をやめ、`Blob -> ArrayBuffer` で IPC 転送する。  
Electron 側は `stdin` バックプレッシャーを考慮して書き込みを待機する。

5. PSD 同期処理を間引く  
ポーリング間隔とレイヤーツリー取得頻度を調整し、`executeJavaScript` の連打を減らす。

6. TypeScript エラーを解消する  
型定義不足（`PsdLayerNode` 等）を補完し、Pixi v8 API と合わない箇所を修正する。

7. Rust バックエンドの第1段階を構築する  
`rust-backend/` を新設し、`stdio` JSON-RPC で `health` 応答できる最小プロセスを実装する。  
Electron メインプロセスに Rust プロセス管理と IPC ラッパーを追加し、将来の書き出し移管の土台を整える。
