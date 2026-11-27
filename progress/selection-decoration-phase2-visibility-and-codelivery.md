# 選択枠フェーズ2: 時間帯可視性の一元化 + native overlay デコレーション同時配信

## 決定

`five-bugs-structural-redesign.md` の「2. 可視性述語の統一 + 選択装飾のシーングラフ化」に対応するフェーズ2実装。フルの「リテインドシーングラフ + stateVersion」（同ドキュメント項目3、後続フェーズ）ではなく、スコープを絞った2部構成で実装した。

### Part A — 時間帯可視性の唯一実装

- `src/utils/objectVisibility.ts` に `isObjectVisibleAtTime(object, time, layers?)` を新設。`sceneHitTest.ts` の `isVisible` と `rustSceneSnapshot.ts` の `collectVisibleObjects` はこれへ委譲する。
- `getObjectWorldCorners`（sceneHitTest.ts）に同判定を追加し、時間帯外のオブジェクトは corners=null を返すようにした。呼び出し元は `SceneSelectionOverlay.tsx` と `nativeOverlaySelectionDecoration.ts`（buildSelectionDecorationQuads）のみで、どちらも本体が描かれない間は枠も出ないのが正しい挙動のため、時間可視性を無視するオプトアウトは追加していない（リサイズハンドルの当たり判定は `getObjectWorldCorners` を使わず独自に位置を再計算しているため影響を受けない）。

### Part B — native overlay デコレーションの同時配信（本体と同一 present）

`presentNativeOverlaySharedFrame` napi payload に任意フィールド `selectionDecoration`（canvasWidth/canvasHeight/quads）を追加した。同梱された場合、Rust 側 `resolve_present_selection_decoration` は `SELECTION_DECORATIONS` グローバル map を再読みせず、同梱値そのものをこの present に使い、かつ map もその値で置き換える（空 quads は解除として扱う）。同梱が無い場合のみ従来どおり map の値へフォールバックする。

JS 側は `prepareSharedRendererViewportNativeOverlayPresent`（native overlay の video-only reuse present 経路。`sharedRendererViewportVideoUpload.ts`）→ `presentNativeOverlayRustDecodedVideoFrame`（`sharedRendererRustVideoUploadPipeline.ts`）を通じて同梱する。`Viewport.tsx` の `publishSharedRendererPreviewSession` 内で、body と全く同じ `(currentObjects, previewTime)` から `buildSelectionDecorationQuads` を計算して渡す。

standalone の `setNativeOverlaySelectionDecoration` 送信は `shouldSendStandaloneDecoration`（`nativeOverlaySelectionDecoration.ts`）で分岐する: co-delivery 対象 tick（video-only reuse 経路）で objects/time が変化した場合は送信をスキップし（body 側が同梱するため）、selectedIds のみの変化・co-delivery 非対象の間は従来どおり送信する。

## 検討して却下した代替案

- **body 側の present 呼び出し（`prepareSharedRendererViewportNativeRenderUpload` → `presentPreparedNativeRenderFrame`）へ同梱する** — 親エージェントの verified code map で名指しされていたパスだが、実装を追ったところこれは DOM 上の WebGPU `<canvas>` へ直接 present する別パイプラインで、`window.nativeOverlay.presentSharedFrame`（症状Bの当該チャネル）には一切触れないことを確認した。同梱しても消費先が無く無意味なため、実際に `presentSharedFrame` を呼ぶ `prepareSharedRendererViewportNativeOverlayPresent`（native overlay 専用の video-only reuse present 経路）へ同梱する設計に変更した。
- **`shouldSendStandaloneDecoration` を「objects/time が変化したら常にスキップ」という単純な比較にする** — native overlay の attach は window 単位で常時行われ、図形のみ/混在セッション（DOM WebGPU canvas 経路）でも `setSelectionDecoration` は有効な唯一の配信経路であり続ける。この場合まで無条件にスキップすると、そうしたセッションでドラッグ中に選択枠が更新されなくなる回帰を生む。そのため `nativeOverlayBodyCoDeliveryEligible`（`rustVideoOnlyEnabled && isSharedRendererExternalVideoOnlySession(session)` から算出）を明示的な入力として持たせ、co-delivery が実際に発生する tick でのみスキップするようにした。

## 制約・注意点

- `publishSharedRendererPreviewSession`（Viewport.tsx）内で `selectedIds` を直接クロージャの依存配列に加えると、選択変更のたびにコールバック identity が変わり、それに連動する再 publish effect が余分な decode リクエスト + present（dedupe skip 前提でも Rust バックエンドへの通信自体は発生する）を誘発してしまう。`latestSelectedIdsRef`（`latestObjectsRef` と同じ ref パターン）経由で読むことで回避した。
- body co-delivery は video-only セッションの reuse present 経路（`isSharedRendererExternalVideoOnlySession`）でのみ発生する。混在/図形のみセッションは presenter フル再起動または DOM WebGPU canvas 経路を使うため、native overlay の decoration は standalone 経路が引き続き唯一の正本になる。
- `presentNativeOverlayRustDecodedVideoFrame` の重複 present dedupe キー（`buildNativeOverlayVisualFrameKey`）は selectionDecoration の値を含めていない。ドラッグでオブジェクトが動けば snapshot の clip transform が変わり通常はキーも変わるため実害は無いが、理論上「本体 pixel が完全に不変のまま選択枠だけ動く」ケースがあれば dedupe によりその tick の present がスキップされ decoration co-delivery も一緒に飛ばされる。現状そのような入力経路は無いため未対応（将来 body-index に decoration を含めない構成へ変わった場合は要再検証）。
