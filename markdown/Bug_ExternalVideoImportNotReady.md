# バグ報告：未準備の video 要素への importExternalTexture でプレビュー起動が失敗

- **状態**：原因特定済み・修正未着手
- **重大度**：高（赤枠フォールバック `presenterStartFailed` でプレビューが落ちる）
- **対象ブランチ**：`feature-proxy`
- **関連コンポーネント**：Rust shared renderer プレビュー（外部ビデオソース＝HTMLVideoElement 経路）

---

## 1. 症状

canvas 下部に赤枠で次のエラーが表示される（スタック付き）：

```
Rust shared renderer preview / status=fallback / reason=presenterStartFailed / native=presenterStartFailed /
Failed to execute 'importExternalTexture' on 'GPUDevice'.
Failed to import texture from video element that doesn't have back resource.
  at Object.presentExternalVideoFrameScene (sharedRendererWebGpuPresenter.ts)
  at startSharedRendererPreviewPresenter (sharedRendererPreviewPresenterController.ts)
  at async startSharedRendererViewportPresenter (sharedRendererViewportPresenterOrchestration.ts)
```

- 動画読み込み直後やシーク直後など、**HTMLVideoElement にカレントフレーム（back resource）がまだ無い瞬間**に出る。

---

## 2. 根本原因

`src/utils/sharedRendererWebGpuPresenter.ts` の `presentExternalVideoFrameScene` で、外部ビデオ平面を描くために各 plane の元 video 要素から外部テクスチャを取得する：

```ts
for (const [index, plane] of vertexScene.planes.entries()) {
  ...
  const planeSource = sourcesByClipId ? sourcesByClipId.get(plane.clipId) : source;
  if (!planeSource) continue;
  drawablePlanes.push({
    index,
    externalTexture: device.importExternalTexture({ source: planeSource }), // ← ここで同期 throw
  });
}
```

`planeSource` は実 HTMLVideoElement（`SharedRendererExternalVideoSource.source`、Viewport の `syncSharedRendererExternalVideoSources` が `entry.source.source` を map に格納）。

WebGPU の `importExternalTexture` は、video 要素が**まだ描画可能なカレントフレームを持たない**（`readyState < HAVE_CURRENT_DATA`、`videoWidth === 0` 等）と `"Failed to import texture from video element that doesn't have back resource"` を**同期例外として throw** する。

この例外は `presentExternalVideoFrameScene` 内で捕捉されず、呼び出し元の `startSharedRendererPreviewPresenter` まで伝播し、Viewport 側の `.catch` で `presenterStartFailed` フォールバック（赤枠）になる。

### なぜ読み込み/シーク直後に起きるか

- 外部ビデオソースを生成した直後は、要素の `src` 設定〜メタデータ/最初のフレームのデコード完了まで時間差がある。
- その間にプレビュー再描画が走ると、まだ back resource の無い要素へ `importExternalTexture` してしまい throw する。
- 一度フレームが用意できれば次の描画で成功するため、**過渡的な未準備状態を致命扱いしている**のが本質。

---

## 3. 修正方針

**presenter の外部テクスチャ取得を「never throw」にし、未準備の plane は描画対象から除外する。**

### 3.1 実装方針

1. `presentExternalVideoFrameScene` の import ループで、各 `planeSource` の取得を防御する：
   - 可能なら事前に準備状態を判定（HTMLVideoElement の `readyState >= HAVE_CURRENT_DATA(2)` かつ `videoWidth/videoHeight > 0`）。型 `SharedRendererExternalVideoElementLike` に `readyState?: number` を追加。
   - 加えて `device.importExternalTexture` 呼び出しを `try/catch` で包み、throw した plane はスキップ（準備状態判定とインポート可否の競合に対する保険）。
2. 描画可能 plane が 0 件になった場合は、既存の `videoTextureViewUnavailable`（ok:false）を返す。これにより**同期 throw（presenterStartFailed クラッシュ）を解消**し、フレーム準備後の次描画で自然に回復する。

### 3.2 適用範囲の検討

- presenter は throw しない防御境界とするのが目的。上流（Viewport / controller）でも外部ビデオの準備状態ゲートを足す余地はあるが、まずは throw 源を断つ。
- `videoTextureViewUnavailable` の result 型は変更不要（既存の union を流用）。

### 3.3 想定効果

- 読み込み/シーク直後の `presenterStartFailed` 赤枠スタックが出なくなる。
- 未準備時は描画をスキップして次フレームで回復（過渡状態を致命扱いしない）。

---

## 4. テスト計画（TDD）

### Red

`src/utils/sharedRendererWebGpuPresenter.test.ts` に契約を追加：

- `onImportExternalTexture` が throw する device（back resource 無しを模擬）で `presentExternalVideoFrameScene` を呼んでも、**例外を投げず** `{ ok: false, reason: 'videoTextureViewUnavailable' }` を返すこと。
- 既存の正常系（準備済み要素で `ok: true, planeCount: 1`）は回帰しないこと。

### Green

- import ループを try/catch + 準備状態スキップに変更。

### Refactor

- 必要なら準備判定を小さな純粋ヘルパーに抽出。

---

## 5. 参照

- `src/utils/sharedRendererWebGpuPresenter.ts`：`presentExternalVideoFrameScene` / `importExternalTexture`
- `src/utils/sharedRendererExternalVideoSource.ts`：`SharedRendererExternalVideoElementLike`
- `src/utils/sharedRendererPreviewPresenterController.ts`：`startSharedRendererPreviewPresenter`
- `src/components/Viewport.tsx`：`syncSharedRendererExternalVideoSources`（`entry.source.source` を map 格納）
