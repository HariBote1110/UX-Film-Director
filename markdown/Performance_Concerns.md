# パフォーマンス関連の懸念点（調査メモ）

アプリケーションコードを読んだ時点での**推測ベースの懸念**です。計測は `npm run perf:agent` やブラウザの Performance パネルで検証してください。

---

## 1. 再生ループとグローバル状態（優先度: 高）

`useAppLogic` の `requestAnimationFrame` から `advanceTime` が呼ばれ、`currentTime` が約 60fps で更新されます。

**影響:**

- `currentTime` を購読する **`Timeline` と `Viewport` が毎フレーム再レンダー**する。
- `Timeline` は `MAX_LAYERS` が **100** のため、レイヤー行・ルーラー・再生ヘッドなどの DOM が毎フレームまとめて更新されやすい。
- プレビュー本体は Pixi の手動 `render` だが、React 側のタイムライン UI も同じ頻度で動く設計になりやすい。

**改善の方向性（例）:** `currentTime` を React の state ではなく ref ＋局所更新にする、`requestAnimationFrame` 内では Viewport のみ駆動する、タイムラインの再生ヘッドだけを CSS／直接 DOM で更新する、など。

---

## 2. `PropertyPanel` の Zustand セレクタ（優先度: 高）

メインの `useStore` が **毎レンダー新しいオブジェクトを返しており `shallow` も未使用**。さらに `currentTime` と `objects` を含むため、**再生中は巨大な `PropertyPanel` が毎フレーム再レンダーされ得る**。

**改善の方向性（例）:** `shallow` の利用、`currentTime` を別の細いサブスクに分離、プロパティパネルが本当に必要なときだけ `currentTime` を購読する。

---

## 3. `Viewport` の `renderScene`（優先度: 中〜高）

`currentTime` 更新のたびに走る処理のうち、特にコストが乗りやすいもの:

- クリーンアップで `visibleObjects.find(...)` を繰り返すなど、**オブジェクト数に対して二重ループに近いパターン**。
- 選択時: `getBounds()` に基づく選択枠の再描画。
- シャドウ: 条件が合うと **毎フレーム** シャドウノードの破棄・再生成。
- グループグラデーション: `buildConnectedComponents` が **`getBounds()` を多用**する O(n²) 近い処理。
- `world.sortChildren()` を毎フレーム実行。

**改善の方向性（例）:** 可視リストを `Map` で管理して削除を O(1) に近づける、選択枠・シャドウは差分更新、ソートはデータが変わったときだけ、など。

---

## 4. `TimelineItem` と `objects` の購読（優先度: 中）

各アイテムが `useStore` で **`objects` 配列全体**を購読している。`updateObject` のたびに配列参照が変わるため、**クリップをドラッグしている間に全 `TimelineItem` がストア更新で巻き込まれやすい**。

`React.memo` で props は抑えられても、フックの購読で子は再実行される。

**改善の方向性（例）:** アイテムごとに `useStore(selector, shallow)` で自オブジェクトだけを購読する、またはタイムライン行を仮想化する。

---

## 5. 音声バッファ読み込み `useEffect([objects])`（優先度: 中）

`objects` が変わるたびに走り、`audio_visualization` があると **`AudioContext` を都度生成**してデコードする経路がある。オブジェクト配列の細かい更新のたびにエフェクトが再実行され、不要なループやコンテキスト生成コストが乗る可能性がある。

**改善の方向性（例）:** 依存を「音声オブジェクトの id / src の集合」に絞る、単一の共有 `AudioContext` を長寿命で持つ。

---

## 6. 書き出しパイプライン（優先度: 運用上のボトルネック）

フレームごとに `renderScene` → `canvas.toBlob` → `arrayBuffer` → IPC `write-frame` と、**メインスレッドとシリアライズ負荷が大きい**経路である。解像度・尺が伸びるほど線形に重くなるのは仕様上自然。

また、書き出し中に一定間隔で **`setTime`** が呼ばれ、React 側のストアが更新される。

**改善の方向性（例）:** 書き出し専用レンダラで UI 購読を切る、フレームバッファの渡し方の見直し（共有メモリ・ストリーム等はアーキテクチャ依存）。

---

## 7. 音声ミックス `buildExportAudioMixWav`（優先度: 中〜高・尺依存）

長尺・高サンプルレートでは `OfflineAudioContext` の `length` が大きくなり、**メモリと `startRendering()` の CPU** が一気に増える候補。

---

## まとめ表

| 領域 | 主な懸念 |
|------|-----------|
| 高 | `PropertyPanel` の `useStore`（オブジェクト毎回生成＋`currentTime`）→ 再生中の全パネル再レンダー |
| 高 | `Timeline` が `currentTime` で毎フレーム大量 DOM 更新（100 レイヤー） |
| 中〜高 | `Viewport.renderScene` の毎フレームの重い処理（境界探索・シャドウ・ソート・グループグラデーション） |
| 中 | `TimelineItem` が `objects` 全購読 → ドラッグ時の全アイテム巻き込み |
| 中〜低 | `objects` 依存の音声バッファ `useEffect` の過剰実行 |
| 運用 | 書き出しのフレーム単位 JPEG／IPC、長尺オフラインミックスのリソース |

---

## 関連ドキュメント

- 自動計測・エージェント実行: [Performance_Agent.md](./Performance_Agent.md)
