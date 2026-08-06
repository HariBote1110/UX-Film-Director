# native再生開始が楽観的revisionを使っていたレース

## Decision

- native再生開始effect（`src/components/Viewport.tsx`の`window.rustBackend.startScenePlayback`呼び出し）が
  gate・引数に使うrevisionを、`editableRustScenePreviewController.replaceScene()`が返す**楽観的**
  `rustTimelineSceneRevision`から、Rust側で`scene.replace`が実際に反映され、かつsupersededでは
  ないことが確認できた**常駐**`rustTimelineSceneResidentRevision`へ切り替えた。
- 常駐revisionは`sharedRendererScenePreviewScheduler`に追加した`onRemoteReady`コールバックから届く。
  schedulerは`pump()`内で`scene.replace`が成功し、かつその時点の`desiredRevision`と一致する場合だけ
  `onRemoteReady({sceneId, revision})`を呼ぶ。新しい`submitRevision`・`scene.replace`/`scene.evaluate`
  失敗・`invalidate()`では`onRemoteReady(null)`を呼び、Viewport側の常駐revision stateをただちに
  「未確定」へ戻す。
- この設計により、明示的なリトライ処理や遅延タイマーを新設せずに自動リトライが手に入る。
  常駐revisionをdepsに含むeffectは、`scene.replace`が遅れて反映された時点で自然に再実行され、
  native再生開始を再試行する。

## 計測した根拠（diag-debug-1）

`perf_research/runs/diag-debug-1/result.json`から:

```
rustPlaybackStatus: "fallback:evaluationFailed"
rustPlaybackDetail: "scene.evaluate revision 1786038301103 does not match resident
                     revision 1786038301101 for sceneId 'viewport-rust-timeline'"
nativePlaybackFrameCount: 0   (179フレーム中)
```

要求revisionが常駐revisionより2つ先行しており、native再生が一度も成立していなかった。native再生が
成立した場合との比較（同じ計測条件のE2E）では、renderer busyMsが1032〜1745→463、presenterフル再起動が
54〜133→3、Viewport Reactコミットが63〜187→12へ縮小する見込みで、レースの解消は実利が大きい。

## 根本原因

1. `src/utils/editableRustScenePreviewController.ts`の`replaceScene()`はローカルのoptimistic
   `revision`カウンタをインクリメントし、実RPC完了前に即座に返す。
2. `Viewport.tsx`はその楽観値を同期的に`rustTimelineSceneRevision` stateへ格納する。
3. `sharedRendererScenePreviewScheduler`は実際の`scene.replace` RPCを非同期に実行し、成功後にだけ
   内部の`remoteReadyRevision`（旧: 外部から不可視）を更新する。
4. native再生開始effectは`rustTimelineSceneRevision`（楽観値）の変化で発火し、即座に
   `startScenePlayback({ revision: rustTimelineSceneRevision, ... })`を呼ぶ。
5. Rust側がそのrevisionをまだ適用していなければ`scene.evaluate`が`revisionMismatch`系エラーで失敗し、
   `electron/rustScenePlaybackController.ts`の`start()`は1フレーム評価して諦める。**リトライは無い。**
   一度失敗するとrenderer clockがセッション全体を持ち続ける。
6. `Viewport.tsx`の世代ガード（`rustNativePlaybackStartGenerationRef`）が追い打ちをかける。revisionが
   高頻度に変わると、in-flightのstart呼び出しの結果が世代不一致で丸ごと捨てられる。

## Alternatives considered

- **リトライループの追加**: `start()`失敗時に一定間隔で再試行するタイマーを足す案。実装は単純だが、
  「いつ常駐revisionに追いついたか」を知らないポーリングになり、無駄なRPC呼び出しとタイミング調整用の
  マジックナンバーが増える。schedulerは既に`pump()`内で`remoteReadyRevision`と`desiredRevision`の一致を
  判定しているため、その知識を再利用する方が確実で無駄がない。
- **固定ディレイの挿入**: `replaceScene()`後に一定時間待ってから`startScenePlayback`を呼ぶ案。
  RPCの実際の完了を保証しないため、遅い環境では依然として失敗し得る一方、速い環境では無駄な遅延になる。
- **controller層に常駐revisionを持たせる**: 提案では
  `editableRustScenePreviewController.ts`にコールバックを中継する案だったが、実際には
  `Viewport.tsx`がschedulerを自前で構築してから`controller`に渡している（`createEditableRustScenePreviewController`は
  既存のschedulerインスタンスを受け取るだけ）。そのため`onRemoteReady`は
  `createSharedRendererScenePreviewScheduler`の呼び出しへ直接渡せば足り、controllerに冗長な中継層を
  足す必要はなかった。

## Constraints / Gotchas

- `remoteReadyRevision`は「replaceが成功した最後のrevision」であり、`desiredRevision`（最新の希望revision）
  と一致するとは限らない。特に`submitRevision`が短時間に連続すると、遅れて解決した古いrevisionの
  replace成功が`desiredRevision`を追い越して届くことがある（既存テスト「replace r1の実行中にr2/r3を
  受けたとき、r1の後はr3だけを送る」が示す挙動）。このケースで`onRemoteReady`に古いrevisionを
  そのまま流すと、Viewportが古い常駐revisionでnative再生を開始してしまい「stale sceneが表示される」
  という新たな不整合を生む。そのため`pump()`のreplace成功ハンドラでは、`remoteReadyRevision`を
  代入した直後に`desiredRevision`と一致するかを再チェックし、一致する場合だけ`onRemoteReady`を呼ぶ。
- `submitRevision`が新しいrevisionを受理した瞬間にも`onRemoteReady(null)`を呼ぶ必要がある。呼ばないと、
  「前revisionは常駐確定済みだが次revisionのreplaceがまだ飛んでいない」間、Viewportの常駐revision state
  が古い値のまま残り、native再生開始effectが古いrevisionで再生を開始してしまう。
- `invalidate()`（未対応編集でのscene変換失敗時）でも`remoteReadyRevision`をnullへ戻すのに合わせて
  `onRemoteReady(null)`を呼ぶ。ここは提案の「blockAfterFailure、必要ならdispose」に含まれていなかったが、
  リセット漏れによる状態不整合を防ぐため追加した。`dispose()`では呼んでいない（Viewportのunmount経路は
  既にnative再生を止める別effectを持ち、unmount後のstate更新を避けるため）。
- `onRemoteReady`は重複通知を避けるため直前に通知した値と比較してから発火する（同一値の連続通知はスキップ）。
  Reactの`setState`自体も同値ならbailoutするため厳密には必須ではないが、契約をscheduler側で閉じるために
  実装した。
- `rustTimelineSceneRevision`（楽観値）は他の用途（`shouldRequestRustTimelineSceneEvaluationForTick`への
  「revision available」判定、export時の`getRustExportFrameSource`）では変更していない。前者は
  schedulerが内部で常駐確定を待ってから評価するため楽観値のままで安全。後者（export時のresident scene
  参照）は今回のタスク範囲外であり、同様のレースが理論上存在し得るが未調査・未修正のまま残した。

## 未解決の可能性がある別のレース

- `getRustExportFrameSource`内の`createResidentSceneExportFrameSource({ sceneId, revision:
  rustTimelineSceneRevision })`も楽観的revisionを使っている。書き出し開始のタイミングによっては
  同種のrevision不一致が起き得るが、今回計測した症状・依頼範囲はnative再生開始のみだったため未着手。
  再現・実利が確認できれば同じ`rustTimelineSceneResidentRevision`への置き換えを検討する価値がある。
