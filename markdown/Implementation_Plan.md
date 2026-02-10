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

8. 書き出しパイプライン制御を Rust 側へ移管する  
`export.start` / `export.write_frame` / `export.end` を Rust 側に実装し、Electron の `start-export` / `write-frame` / `end-export` ハンドラは Rust API 呼び出しへ切り替える。

9. メディアメタデータ解析を Rust 側へ移管する  
`media.probe` を Rust 側に実装し、動画/音声の追加時は `probe-media` を優先して `duration`・`width`・`height` を取得する。  
`filePath` が取れない環境や `ffprobe` 失敗時のみ、`HTMLMediaElement` での既存メタデータ取得へフォールバックする。

10. PSD 同期処理を即時反映 + 低負荷化する  
`PsdToolBridge` に即時同期 API を追加し、レイヤートグル後は強制同期でプレビューとツリーを更新する。  
常時ポーリング間隔を緩め、重い処理（`toDataURL` / ツリー収集）の実行回数を削減する。

11. ビルド署名を無効化する  
`build` スクリプトに `CSC_IDENTITY_AUTO_DISCOVERY=false` を適用し、macOS 証明書がない環境でもパッケージングを進められるようにする。

12. PSDToolKit 依存を撤廃して再構築する  
PSD の追加時に `ag-psd` で `rootLayer` / `activeLayerIds` / `layerTree` を生成し、Pixi 描画はレイヤーツリーを直接レンダリングする。  
PropertyPanel の表情切り替えは `activeLayerIds` を直接更新する方式へ置き換え、webview ブリッジを削除する。

13. PSD 画像データ変換の互換性不具合を修正する  
`layer.imageData` が `ImageData` 形式で返るケースを考慮した正規化処理を追加し、0 要素配列による `ImageData` 生成失敗を防止する。

14. PSD レイヤーテクスチャ生成の互換性を改善する  
`Texture.from(img)` をやめ、canvas 経由でテクスチャを生成して Pixi の WebGPU 警告を抑制する。  
同時に `Uint16Array` / `Float32Array` などの `PixelArray` を 8bit RGBA へ正規化する。

15. PSD レイヤー順序の逆転を修正する  
`ag-psd` から取得した `children` の順序を保持し、不要な `reverse()` を除去して PSD 上の前後関係と一致させる。

16. プロパティパネルにメディア音量/PSDスケール編集を追加する  
`video` / `audio` 選択時に `Mute` と `Volume` (0〜100%) を編集可能にし、既存再生経路へ即時反映する。  
`psd` 選択時に `scale` (0.1〜10) を編集可能にし、Pixi 側の `psdContent.scale` へ反映させる。
