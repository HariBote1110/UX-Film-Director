# バグ報告：再生中シークで presenter 再起動ストーム → ウィンドウ真っ白

- **状態**：原因特定済み・修正未着手
- **重大度**：高（再生中シークでウィンドウが真っ白＝WebGPU デバイスロスト）
- **対象ブランチ**：`feature-proxy`
- **関連コンポーネント**：Rust shared renderer プレビュー（外部ビデオ再利用パス）

---

## 1. 症状

- 再生中（`isPlaying === true`）にシークするとウィンドウが真っ白になる。
- ポーズ時スクラブの暴走（`Bug_ExternalVideoPausedFrameZero.md` §7）とは別経路。あちらは `!isPlaying` のナッジ、こちらは再生中の再利用パス。

---

## 2. 根本原因

`presentExternalVideoFrameScene` の never-throw 化（`Bug_ExternalVideoImportNotReady.md`）により、未準備フレームは throw せず `ok:false`（`videoTextureViewUnavailable`）を返すようになった。

再生中は `Viewport.tsx` の再利用パス（`canReuseExternalVideoPresenter`）が毎フレーム `control.presentExternalVideoFrameScene` を直接呼ぶ：

```ts
const presentation = control.presentExternalVideoFrameScene?.({ session, sourcesByClipId });
...
if (presentation?.ok) {
  return;
}
sharedRendererPresenterSessionKeyRef.current = null;   // ← 失敗で presenter を破棄
```

その後 `setSharedRendererPreviewSession(session)` でフル再起動に落ちる。

再生中にシークすると、シーク中の要素は**カレントフレーム未準備**になり、present が `ok:false` を返す。再生中は毎フレーム publish が走るため、**未準備フレームごとに presenter フル再起動が連鎖** → WebGPU リソース枯渇／デバイスロスト＝真っ白。

### なぜ never-throw 化前は出なかったか
- 以前は未準備時に `importExternalTexture` が同期 throw していた（別の不具合）。再利用パスは try/catch していないため throw で別経路になっていた。never-throw 化で「静かな失敗」に変わり、毎フレーム再起動の温床になった。

---

## 3. 修正方針

**過渡的な未準備（`videoTextureViewUnavailable`）では presenter を破棄せず、そのフレームをスキップする。**

### 3.1 実装方針

- 再利用パスの present 失敗判定を分岐：
  - `presentation.reason === 'videoTextureViewUnavailable'`（＝シーク中などの未準備）→ **`sharedRendererPresenterSessionKeyRef.current` を維持して return**（現 presenter を保持、フレームスキップ）。再生中は次フレームの publish で再 present され、準備でき次第表示される。
  - それ以外の失敗 → 従来どおり key を null してフル再起動。
- 判定は小さな純粋ヘルパー `isTransientExternalVideoPresentationFailure(presentation)` に切り出し、`buildSharedRendererPreviewDiagnostic` と同様に export して単体テストする。

### 3.2 想定効果

- 再生中シーク時の毎フレーム再起動が無くなり、真っ白（デバイスロスト）を解消。
- シーク中の数フレームは未準備でスキップされるが、準備完了で即座に追従表示。

---

## 4. テスト計画（TDD）

### Red（`ViewportDiagnostics.test.ts` 等）

- `isTransientExternalVideoPresentationFailure`：
  - `{ ok: false, reason: 'videoTextureViewUnavailable' }` → `true`
  - `{ ok: false, reason: 'unsupportedVideoScene' }` → `false`
  - `{ ok: true, planeCount: 1 }` / `undefined` / `null` → `false`

### Green

- ヘルパーを実装し、再利用パスの分岐に適用。

---

## 5. 参照

- `src/components/Viewport.tsx`：再利用パス（`canReuseExternalVideoPresenter`）／present 失敗時の key 破棄
- `src/utils/sharedRendererWebGpuPresenter.ts`：`presentExternalVideoFrameScene`（`videoTextureViewUnavailable`）
- `markdown/Bug_ExternalVideoImportNotReady.md`：never-throw 化（本問題の前提）
- `markdown/Bug_ExternalVideoPausedFrameZero.md`：ポーズ時ナッジ（別経路）
