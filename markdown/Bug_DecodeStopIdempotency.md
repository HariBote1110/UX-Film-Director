# バグ報告：デコードセッション停止の非冪等性による再生プレビュー停止

- **状態**：修正済み（`isDecodeStopSatisfied` で冪等化、版 `0.1.1-Beta-352a`）
- **重大度**：高（一時停止／再生の連打でプレビューが長時間フリーズする）
- **対象ブランチ**：`feature-proxy`
- **関連コンポーネント**：Rust shared renderer プレビュー（ビューポート動画デコード経路）

---

## 1. 症状

- 動画を読み込んだプロジェクトで、canvas 下部に赤い縁の診断オーバーレイが表示される。
  - 文言：`Rust shared renderer preview / status=ready / video=stopFailed / No active decode session`
- 主に **一時停止中** に出る。シークバーをドラッグしている間は出ない。
- **一時停止と再生開始を連打すると、プレビューが結構な時間止まったまま**になる。
- 再生開始までの待ち時間も長い（※こちらはデコード起動コストが主因で本バグとは別件。ただし後述の中断→リトライのカスケードが上乗せされている）。

---

## 2. 赤枠オーバーレイの正体

- 描画箇所：[`src/components/Viewport.tsx`](../src/components/Viewport.tsx) の `shared-renderer-preview-diagnostics`（`{sharedRendererPreviewDiagnostic && hasVideoObjects && (...)}`）。
- スタイル（赤い縁）：[`src/index.css`](../src/index.css) の `.shared-renderer-preview-diagnostics`（`position: absolute; bottom: 8px;` の赤枠・赤文字）。
- 文言生成：`buildSharedRendererPreviewDiagnostic`（Viewport.tsx）。プレビューが完全正常なときのみ `null`（非表示）になり、それ以外は `status= / reason= / native= / video= / videoFrameUploadReady=false` を連結して表示する。
- このオーバーレイは `hasVideoObjects`（動画オブジェクトが存在する）ときだけ出るため、「動画を読み込んだときに出る警告」として観測される。

---

## 3. 根本原因

**すでに終了済みのデコードセッションに対する「停止（stop）」を、致命的エラーとして扱っている。**

### 3.1 Rust 側：`decode.stop` はセッションが無いとエラーを返す

`rust-backend/src/decode.rs` の `handle_decode_stop`：

```rust
let Some(session) = state.decode_sessions.get(&parsed.job_id) else {
    return response_error(id, -32041, "No active decode session");
};
```

指定 `jobId` のセッションが既に存在しない場合、`-32041 "No active decode session"` を返す。

### 3.2 TS 側：stale ジョブの停止失敗を全体中断にしている

`src/utils/sharedRendererViewportVideoUpload.ts` の stale ジョブ停止ループ：

```ts
for (const staleJob of staleActiveJobs) {
  const stopResponse = await stopRustBackendVideoDecode({ jobId: staleJob.jobId }, rustBackendBridge);
  if (!stopResponse.success) {
    return {
      ok: false,
      reason: 'stopFailed',
      detail: stopResponse.error ?? 'Rust backend rejected the stale video decode stop request.',
      activeJobs: visibleActiveJobs,
    };
  }
}
```

キャッシュ上の「アクティブなジョブ」（`sharedRendererVideoDecodeJobsRef`）を停止しようとした際、バックエンドのセッションが既に無いと `No active decode session` が返り、それを **致命的失敗として動画アップロード処理全体を中断** している。

同様の `stopFailed` を返す箇所は計 3 箇所：

1. stale ジョブ停止ループ（`staleActiveJobs` の停止）
2. デコードフレームのスロット枯渇回復時の stop（複数ジョブ経路）
3. 単一ジョブ経路のスロット枯渇回復時の stop

### 3.3 なぜ一時停止時・連打時に起きるか

- 再生／一時停止を切り替えるたびにデコードセッションが start/stop される。連打すると、TS 側のキャッシュ `activeJobs` と Rust 側の実体 `decode_sessions` の状態がずれる。
- ずれた状態で「もう存在しないセッション」を stop すると `No active decode session` が返り、上記ロジックでアップロード全体が中断される。
- 中断するとフレームが提示されず、次の start が成功するまでプレビューが固まる（＝「結構な時間止まったまま」）。
- 一時停止中は新規デコードが走らないため、この中断状態がそのまま赤枠 + `videoFrameUploadReady=false` として残り続ける。

### 3.4 これがバグである決定的根拠（既存ロジックとの非一貫性）

同じ `No active decode session` エラーは、**`decode.requestFrame`（フレーム要求）側では既に「回復可能」として扱われている**。

```ts
const shouldRecoverDecodeFrameRequestError = (
  error: string | undefined,
  hasCachedActiveJob: boolean
): boolean =>
  isNoFreeDecodeFrameSlotError(error)
  || (hasCachedActiveJob && isNoActiveDecodeSessionError(error));
```

ところが **stop 側だけは致命扱い** になっている。意味的には「すでに止まっているセッションを止める」のは **望んだ最終状態そのもの** であり、本来は **冪等（idempotent、成功扱い）** であるべき。この非一貫性が不具合の本質。

---

## 4. 修正方針

**`decode.stop` が `No active decode session` を返した場合は「成功（セッションは既に消えている＝目的達成）」とみなす。**

### 4.1 実装方針

- `stopRustBackendVideoDecode` の応答判定を、「`success` または `isNoActiveDecodeSessionError(error)` なら停止成功」とみなすヘルパーに集約する。
  - 例：`isDecodeStopSatisfied(stopResponse)` のような純粋判定関数を `sharedRendererViewportVideoUpload.ts` に追加。
- 上記 3 箇所の `if (!stopResponse.success) { ... stopFailed ... }` を、新ヘルパーによる判定へ置き換える。
- これにより、stale ／枯渇回復時の stop でセッションが既に消えていても中断せず処理を継続でき、中断→リトライのカスケードが解消する。

### 4.2 適用範囲の検討

- 同型の停止経路が `sharedRendererViewportNativeRenderSource.ts` にも存在する（`stopFailed` / `isNoActiveDecodeSessionError` が定義済み）。同じ非冪等問題を抱えるため、本修正と同方針で揃える。
- Rust 側 `decode.stop` の挙動自体は変更しない（「無いセッションを止めようとした」という事実は API としては妥当に返す）。冪等化は呼び出し側（TS）で吸収する。

### 4.3 想定効果

- 一時停止／再生連打時のフリーズ解消。
- ポーズ時の赤枠（`video=stopFailed / No active decode session`）が出なくなる。
- 再生開始の遅延のうち、中断→リトライ分の上乗せが軽減される（起動コスト自体は別途の課題）。

---

## 5. テスト計画（TDD）

### Red

`src/utils/sharedRendererViewportVideoUpload.test.ts` に契約を追加：

- stale ジョブの stop が `No active decode session` を返しても、アップロードは `ok: true`（または `stopFailed` を返さない）で継続すること。
- スロット枯渇回復経路の stop が `No active decode session` を返しても中断しないこと。
- 一方で、`No active decode session` 以外の停止失敗（実エラー）では従来どおり `stopFailed` を返すこと（回帰防止）。

### Green

- `isDecodeStopSatisfied` ヘルパーを実装し、3 箇所の判定を置換。

### Refactor

- 必要に応じて `sharedRendererViewportNativeRenderSource.ts` 側にも同ヘルパー方針を展開し、重複を共通化。

---

## 6. 参照

- `src/components/Viewport.tsx`：診断オーバーレイの描画・文言生成
- `src/index.css`：`.shared-renderer-preview-diagnostics`
- `src/utils/sharedRendererViewportVideoUpload.ts`：デコードジョブ start/stop と `stopFailed` 判定
- `src/utils/sharedRendererViewportNativeRenderSource.ts`：ネイティブレンダー経路の同型処理
- `rust-backend/src/decode.rs`：`handle_decode_stop`（`No active decode session`）
