結論: 高2件、中4件。最優先は `syncBillboards` の再適用判定と、ビルボード yaw のカメラ参照元。

### 1. `syncBillboards` の差分判定が sourceKey 基準で、毎フレーム再送要件を満たさない
- ファイル: OxidiseStageViewport.tsx:298-318
- 根拠: `computeBillboardSyncPlan` に渡す前回状態は `billboardSourceKeysRef.current`、つまり sourceKey のみ。`renderer.syncBillboard` は `plan.syncs` に入った要素にしか呼ばれない。更新後も `nextBillboardSourceKeys(syncEntries)` で sourceKey だけ保存している。sourceKey が同じで world 座標・yaw・scale・カメラ位置が変わった場合、再適用が漏れる。前提の「同一 sourceKey でも world 座標等の再送が必要」と矛盾する。`billboardPlacementsRef` も未更新のまま残る。
- 深刻度: 高

### 2. ビルボード yaw が props の `stageCamera` 依存で、実際の描画カメラ `cameraModelRef` と競合する
- ファイル: OxidiseStageViewport.tsx:273-280, 360-375
- 根拠: yaw は `stageCamera.position` から計算している一方、描画カメラは `cameraModelRef` から `eye/look` を取得して `renderer.setCamera` している。tick 内のコメントと settle 処理から、store への `setStageCamera3D` はドラッグ/ダンピング収束後。オービット中は `stageCamera` が現在の描画カメラより古い可能性が高く、ビルボードが現在のカメラを向かない/収束まで向きがずれる。
- 深刻度: 高

### 3. 初期化 effect のクリーンアップで StageRenderer を破棄していない
- ファイル: OxidiseStageViewport.tsx:391-396, 349
- 根拠: cleanup は `cancelAnimationFrame`、`lastFrameTimeRef.current = null`、`rendererRef.current = null` のみ。`renderer.dispose()` / `free()` 等の破棄呼び出しがない。さらに `disposed` 後に `StageRenderer.create` が解決した場合も、生成済み renderer をそのまま捨てている。wasm/GPU リソースを保持する StageRenderer ならリークする。
- 深刻度: 中

### 4. 初期 width/height が 0 だと、以後サイズが入っても renderer が初期化されない
- ファイル: OxidiseStageViewport.tsx:333-335, 398
- 根拠: `if (!canvas || width <= 0 || height <= 0) return;` なのに依存配列は `[]`。初回レンダーで width/height が 0 の場合、effect は何もせず return し、以後 width/height が変化しても再実行されない。renderer も rAF も起動しない。
- 深刻度: 中

### 5. renderer 生成前のリサイズが反映されない競合
- ファイル: OxidiseStageViewport.tsx:346-349, 401-413
- 根拠: 初期化は effect 実行時の `physicalWidth/physicalHeight` で非同期 `StageRenderer.create` する。リサイズ effect は `rendererRef.current` が null の間 `renderer?.resize` が no-op。create 解決前に width/height が変わると、canvas はリサイズされても renderer は古いサイズで生成され、以後の再リサイズ契機がない限り内部サイズがずれる。
- 深刻度: 中

### 6. `tick` 内例外でも次フレーム予約済みでループが止まらない
- ファイル: OxidiseStageViewport.tsx:356-384
- 根拠: `tick` の先頭で `rafRef.current = requestAnimationFrame(tick)` を予約している。その後 `setCamera`、`render`、store 更新などが throw しても次フレームは既に予約済み。継続例外時は毎フレーム例外を投げ続ける。例外でループを止めたい設計なら不適切。
- 深刻度: 中
