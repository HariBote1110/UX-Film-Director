# バグ報告：読み込み直後・ポーズ時に 0 フレームが提示されず赤枠が残る

- **状態**：修正済み（`notifyOnNextPresentableFrame` + Viewport 再描画ナッジ、版 `0.1.1-Beta-354a`）。色崩れ（§5）は別件で未着手。
- **重大度**：高（読み込み直後にプレビューが出ず赤枠のまま）
- **対象ブランチ**：`feature-proxy`
- **関連コンポーネント**：Rust shared renderer プレビュー（外部ビデオソース＝HTMLVideoElement 経路）

---

## 1. 症状

- 動画を読み込み、再生ヘッドを 0 に持っていくと、canvas 下部に赤枠：
  `Rust shared renderer preview / status=fallback / control=videoTextureViewUnavailable / reason=videoTextureViewUnavailable`
- **シークすると映像は出る**（＝外部ビデオ要素がフレームを持てば提示できる）。
- ただしシークで出た映像の**色がおかしい**（別件、§5 に分離）。

本バグ（`importExternalTexture` の同期 throw）の前段修正で presenter は never-throw 化済みだが、その結果「未準備 plane をスキップ → 描画可能 0 件 → `videoTextureViewUnavailable`（ok:false）」となり、**ポーズ中は赤枠が残ったまま**になる。

---

## 2. 根本原因

外部ビデオ要素の「フレーム準備完了で再提示する」配線が、**`isPlaying` 時にしか存在しない**。

- 0 時点（読み込み直後・ポーズ）では `syncSharedRendererExternalVideoSources`（`src/components/Viewport.tsx`）が要素を `seekTo(0)` するが、要素はまだフレームをデコードしていない。
- presenter はその直後に `presentExternalVideoFrameScene` を試みるが、未準備のため `importExternalTexture` をスキップ → `videoTextureViewUnavailable`。
- ポーズ中は再提示のトリガーが無い（再提示パス `canReuseExternalVideoPresenter` は `isPlaying` 前提：`Viewport.tsx` 760 行付近）。よって**フレームが用意できても誰も再提示せず**、赤枠が残る。
- シーク（再生位置変更）すると presenter 効果が再実行され、その頃には要素のフレームが用意できているため提示に成功する＝「シークすれば出る」。

---

## 3. 修正方針

**ポーズ中でも「外部ビデオ要素のフレーム準備完了」を検知して再提示する。**

### 3.1 実装方針

1. `SharedRendererExternalVideoElementLike` に準備状態とフレーム通知 API を追加（任意）：
   - `readyState?: number`
   - `requestVideoFrameCallback?` / `cancelVideoFrameCallback?`（あれば優先）
   - `addEventListener?` / `removeEventListener?`（フォールバック用）
2. `SharedRendererExternalVideoSource` に `notifyOnNextPresentableFrame(callback): () => void` を追加：
   - `requestVideoFrameCallback` があればワンショット登録、無ければ `seeked` / `loadeddata` / `canplay` のワンショットにフォールバック。解除関数を返す。
3. `syncSharedRendererExternalVideoSources`（Viewport）に `onFrameReady?` を追加：
   - ポーズ中かつ要素が未準備（`readyState < HAVE_CURRENT_DATA(2)` 等）のとき、`notifyOnNextPresentableFrame(onFrameReady)` を登録（entry に解除関数を保持し二重登録を防ぐ）。
4. Viewport の `onFrameReady` は再描画ナッジ（state/nonce を bump し `sharedRendererPresenterSessionKeyRef` を無効化）→ presenter 効果が再実行され、準備済みフレームを提示して赤枠が消える。
   - ワンショットのため無限ループにはならない（提示成功後の再 sync では「準備済み」なので再登録しない）。

### 3.2 想定効果

- 読み込み直後・ポーズの 0 フレームが、手動シーク無しで提示される。
- 過渡的な `videoTextureViewUnavailable` 赤枠が、フレーム準備後に自動で消える。

---

## 4. テスト計画（TDD）

### Red（`sharedRendererExternalVideoSource.test.ts`）

- `requestVideoFrameCallback` を持つ要素で `notifyOnNextPresentableFrame(cb)` を呼ぶと、次フレームコールバックで `cb` がちょうど一度呼ばれ、解除関数で `cancelVideoFrameCallback` される。
- `requestVideoFrameCallback` を持たない要素では `seeked` / `loadeddata` 等のワンショットで `cb` が一度だけ呼ばれ、解除関数でリスナーが除去される。

### Green

- `notifyOnNextPresentableFrame` を実装。

### Viewport 配線

- `syncSharedRendererExternalVideoSources` に `onFrameReady` を渡し、ポーズ・未準備時に登録。`onFrameReady` で再描画ナッジ。
- 既存の境界/統合テストと dev サーバーで回帰確認（実動画ロードは手動確認）。

---

## 5. 別件メモ：シーク後の色がおかしい

- 外部ビデオ経路（`importExternalTexture` + `externalVideoFrameShaderCode`）の出力色が、Rust デコード RGBA 経路と食い違っている可能性。
- `importExternalTexture` は video のネイティブ色空間（bt709 等）を内部変換するため、シェーダ側の前提（sRGB/linear、premultiplied alpha）とズレると色が崩れる。
- 本バグ（再提示）とは独立。別タスクとして「外部ビデオ経路の色パイプライン整合（`markdown/architecture/03-colour-pipeline.md` 準拠）」を立てて調査する。

---

## 6. 参照

- `src/components/Viewport.tsx`：`syncSharedRendererExternalVideoSources` / 再提示パス（`canReuseExternalVideoPresenter`）
- `src/utils/sharedRendererExternalVideoSource.ts`：`createSharedRendererExternalVideoSource`
- `src/utils/sharedRendererWebGpuPresenter.ts`：`presentExternalVideoFrameScene` / `externalVideoFrameShaderCode`
- `markdown/Bug_ExternalVideoImportNotReady.md`：前段（never-throw 化）
