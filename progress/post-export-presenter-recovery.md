# export直後のpresenter復帰

## 決定

export完了直後にプレビューのshared renderer presenterが
`videoTextureViewUnavailable` のままfallbackへ固定される不具合を、
次の2点で解消した。

1. Rust常駐scene RPCモードでも、外部動画frameがpresent可能になった通知で
   `scene.evaluate` を再要求する。`src/components/Viewport.tsx` の
   `requestTime` effectへ `sharedRendererExternalVideoFrameReadyTick` を
   依存として加え、判定を純関数
   `shouldRequestRustTimelineSceneEvaluationForTick` へ切り出した。
2. presenter起動時の初回 external video present が
   `videoTextureViewUnavailable` で失敗した場合、非厳格モードでは
   presenterを破棄せずtransient skipとして記録する。reuse tick経路と同じ
   `isTransientExternalVideoPresentationFailure` と
   `EXTERNAL_VIDEO_TRANSIENT_SKIP_ESCALATION_THRESHOLD`（120回）を再利用し、
   起動経路とreuse経路の判定を一本化した。

あわせて重量E2Eの最終整定条件を強化し、export後にpresenterとRust timelineの
**双方**が `ready` へ戻ることを待って採取するようにした
（`scripts/run-realistic-heavy-edit-e2e.mjs` の `waitForSettledSnapshot`）。

## 根本原因

- export中は `Viewport.tsx` の presenter再起動effectが毎tickで
  `disposeSharedRendererExternalVideoSources` を呼び、HTMLVideoElementを
  `src=''` まで戻して完全破棄する。
- export完了で `isExporting` がfalseへ落ちた直後、externalVideoSourceは
  ゼロから作り直されるため `readyState=0` である。この状態で
  `device.importExternalTexture` は同期的にthrowし、描画可能なplaneが
  1枚も無いため presenter は `videoTextureViewUnavailable` を返す。
- 起動経路にはreuse経路のような猶予が無く、その場で `status: 'fallback'`
  を書き込み `{ ok: false }` を返していた。
- 復帰契機である `notifyOnNextPresentableFrame` → ready tick は、
  `shouldBuildSharedRendererPreviewSessionForTick` がRPCモードで常に
  falseを返すpublish effectにしか繋がっておらず、RPCモードでは
  **復帰経路がひとつも存在しなかった**。動画が読み込み完了しても
  二度と再評価されず、fallbackが永続化していた。

## 却下した案

- **export中に外部動画ソースをdisposeせずpauseに留める**: export後の
  readiness gap自体を無くせるが、export中もvideo要素とデコーダを保持し
  続けることになり、重量シーンでのメモリとデコーダ資源の圧迫を招く。
  export中はChromium側の動画資源を手放す現行方針を維持した。
- **起動時失敗を無条件にtransient扱いにする**: 厳格モード
  （`requireSharedRendererOutput`）での `blocked` 検出が効かなくなり、
  本当に描画できないシーンを見逃す。厳格モードは従来挙動のままとした。
- **ready tick用に別カウンタを設ける**: 起動経路とreuse経路で
  エスカレーション回数が二重管理になる。既存の
  `consecutiveExternalVideoTransientSkips` を共有した。

## 制約・注意点

- `src/e2e/realisticHeavyEditHarness.ts` の `ok` 判定は
  `rustTimelineStatus === 'ready' || presenterStatus === 'ready'` と
  **どちらか一方**で真になる。seed時点では `presenterStatus` がnullのため
  両方を要求できず、この定義は変更していない。よって `ok` だけでは
  presenter側の故障を検出できない。最終地点の厳格判定は
  `waitForSettledSnapshot` 側の `settled` フラグが担う。
- `rustTimelineStatus: 'pending'` は scene評価が飛行中というだけの
  正常な過渡状態であり、それ自体は異常ではない。整定を待たずに採取すると
  `pending` を拾うことがある（実測では整定まで1ms）。
- この修正はexport直後の復帰経路を通したものであり、export中に外部動画
  ソースを毎tick破棄する設計そのものは変えていない。export後に
  video要素を再ロードするコストは残る。
