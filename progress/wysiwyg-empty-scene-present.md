# WYSIWYG違反: 図形クリップの範囲外シークでnative overlayにゴーストが残る

## Decision
評価済み `SharedRendererPreviewSession` が `surfaceGate.ok && surfaceGate.snapshot.clips.length === 0`
（＝現在時刻にアクティブなクリップが1つも無い）を満たすとき、
「空シーンの透明フレームをpresentする」ことそのものと定義し、
`publishSharedRendererPreviewSession`（`src/components/Viewport.tsx`）内で
毎 tick 判定して native overlay を透明clearするようにした。

- 判定は純関数 `shouldPresentSharedRendererEmptyScenePresentation`
  （`src/utils/sharedRendererViewportEmptyScenePresentation.ts`）に切り出し、
  ユニットテストで契約を固定。
- clearの直前に `sharedRendererVideoDecodeRequestIdRef.current` を進めてから
  `notifyNativeOverlaySceneCleared` + `window.nativeOverlay?.clearSurface({})`
  を呼ぶ。requestId を先に進めることで、in-flight の古い present が後から
  overlay を上書きするレースを防ぐ。
- 加えて `prepareSharedRendererViewportNativeRenderOverlayPresent`
  （`src/utils/sharedRendererViewportNativeRenderUpload.ts`）に
  `isRequestCurrent` パラメータを追加した。render.nativeSharedFrame の
  await 完了後にチェックし、追い越されていたらレンダリング済み
  shared-memory 出力を解放してpresentしない（`reason: 'supersededRequest'`）。
  video decode 経路の `prepareSharedRendererViewportNativeOverlayPresent`
  が既に持つ契約と揃えた。

## Alternatives considered
- 既存の Bug D case (i) effect（`objects.length === 0` を監視）を拡張して
  clips 空判定も兼ねさせる案 → 却下。この effect は React state
  （タイムライン全体のobjects）に依存する再レンダー契機でしか発火せず、
  時間シークだけで変化する「現在時刻のアクティブクリップ集合」を捉えられない。
  責務が違う2つの条件を1つのeffectに混ぜると可読性が落ちるため、
  `publishSharedRendererPreviewSession`（毎評価tickで呼ばれる）側に判定を
  追加する方式にした。既存effectは「プロジェクト全体が空になった」ケースの
  ためだけに残し、コメントの誤り（objects空≒clips空という誤った代表条件）
  を修正した。

## Constraints / Gotchas
- `session.surfaceGate.ok === false`（他の理由でブロックされている経路）は
  このpresentation判定の対象外。既存の別経路が扱う。
- native-render-only present経路（`prepareSharedRendererViewportNativeRenderOverlayPresent`）
  の `canPresentSceneDirectly` 分岐（`presentScene` 直接呼び出し）は
  この関数内で先行 await が無いため `isRequestCurrent` チェックを追加して
  いない。await を挟むのは render.nativeSharedFrame 経由の分岐のみ。
- native-overlay/ (Rust側) は今回変更していない。TypeScript側のみの修正。
