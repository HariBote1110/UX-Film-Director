# 重量E2Eのpresenterフル再起動ストーム — 未修正の判断根拠

更新（2026-07-28）: 動画なしセッションの部分集合は
`progress/video-free-presenter-reuse.md` で修正済み。以下の判断根拠と残課題は、
動画を含む混在セッションに対して引き続き有効である。

## 決定

**修正しなかった。** `canReuseNativeRenderPresenter`（`src/components/Viewport.tsx:1282`,
`:1838` の重複定義）のreuseゲートを `rustVideoOnlyEnabled` 単独から
`sharedRendererVideoCutoverEnabled || rustVideoOnlyEnabled`（他のeffective cutover箇所と
同型）へ広げる案を検討したが、**混在セッション（video + 非video）でaudio/videoの
二重デコード・二重クロックを引き起こす具体的な破綻経路が見つかった**ため見送った。

## 事実確認（file:line）

- 重量E2E・本番ビルドは `VITE_UXFD_RUST_VIDEO_ONLY` を設定しない
  （`scripts/dev-native-overlay.mjs` / `dev-rust-video.mjs` のみが設定）ため
  `rustVideoOnlyEnabled = false`、`sharedRendererVideoCutoverEnabled` は既定でtrue
  （`Viewport.tsx:707,718`）。
- `canReuseNativeRenderPresenter` は3述語のORだが先頭が `rustVideoOnlyEnabled &&`
  （`Viewport.tsx:1282-1286`, 再起動effect側の複製 `:1838-1842`）。したがって
  E2E/本番では常にfalseで、video-only以外（native-render-only・混在）は
  毎publishでフル再起動する。
- `canReuseExternalVideoPresenter`（video-onlyセッションのreuse）は
  `!rustVideoOnly` 条件（`shouldReuseExternalVideoPresenterSession`,
  `Viewport.tsx:347-364`）で、こちらはE2E/本番で既に有効。**video-onlyは
  最初から無罪**であり、問題は混在・native-render-onlyに限られる。
- 重量E2Eのシーンは4K動画2本＋図形・テキスト・生成効果が同居する**混在セッション**
  （`isSharedRendererMixedNativeRenderSession`, `Viewport.tsx:340-345`）そのもの。

## 1. native-render reuseはrustVideoOnly=falseでも「起動」自体は成立する

`startSharedRendererPreviewPresenter`（`sharedRendererPreviewPresenterController.ts`）は
`presentPreparedNativeRenderFrame` を `rustVideoOnlyEnabled` を見ずに常に返す
（`:943-984`, `:1004`）。reuse tick側の分岐条件
（`Viewport.tsx:1361-1365`）も `control.presentPreparedNativeRenderFrame` があれば
成立するため、関数の存在自体はrustVideoOnly=falseでも問題ない。

**しかし video を含むセッションでは供給元が二重化する:**

- rustVideoOnly=false（cutover=trueのみ）では、動画フレームの実ソースは
  HTMLVideoElement（`sharedRendererExternalVideoSourcesByClipId:
  !rustVideoOnlyEnabled && ...`, `Viewport.tsx:1928`）で、その同期
  （`currentTime`合わせ・play/pause・**音量/muted含む再生そのもの**）は
  `syncSharedRendererExternalVideoSources` が担う。この関数は
  **presenter再起動effectの中でのみ**呼ばれる（`Viewport.tsx:1849-1867`、
  `rustVideoOnlyEnabled` のelse節）。reuse tickの中では一切呼ばれない
  （`canReuseExternalVideoPresenter` 分岐内の別呼び出し `:1301` は
  video-only reuse専用で、native-render reuse分岐には存在しない）。
- 一方 `canReuseNativeRenderPresenter` のreuse tick
  （`Viewport.tsx:1354-1487`）が使う本体フレームは
  `prepareSharedRendererViewportNativeRenderUpload` 経由の
  `render.nativeSharedFrame` RPCで、**Rust側が自前でファイルを再デコード**する
  （`sharedRendererViewportNativeRenderUpload.ts:100-` の `prepareNativeRenderSources`）。
  HTMLVideoElementの状態とは完全に独立。
- したがって混在セッションでnative-render reuseを有効化すると、
  同じ動画クリップに対して **(a) HTMLVideoElementが実際に音声を再生しながら
  currentTime同期を失う（reuse中は誰も呼ばない）** のと
  **(b) Rust側が同じ動画を独立に再デコードして映像だけ供給する**
  という二重パイプラインが同時に走る。`syncSharedRendererExternalVideoSources`
  が呼ばれなくなることで、pause/seek時の追従・ドリフト補正
  （`syncSharedRendererExternalVideoPlayback`）が止まり、
  音声が映像（Rust側の frame_index 駆動）から乖離していく。
  `render.nativeSharedFrame` 側にはRPC音声出力（waveform可視化用の
  サンプル取得はあるが実音声出力ではない、
  `sharedRendererViewportNativeRenderUpload.ts:632-668` は
  `audio-waveform-r` ジェネレータ専用）は存在しないため、
  **音声の実出力はHTMLVideoElement側にしか無い**。

これはコード中に繰り返し現れる「二重クロック対策」（`Viewport.tsx:502-515` 等）
と同種の問題であり、`progress/phase3b-present-path-unification.md` のStep 3が
「混在セッションの本体をoverlay配信に完全統合するにはvideoデコードを
JSが仲介する現構造ではなくRustが自前で保持・供給する構造が前提になる。
本フェーズはそれを行わない」と明記している未解決事項そのもの。

## 2. `shouldReuseExternalVideoPresenterSession` 警告との整合

video-onlyのreuse（`canReuseExternalVideoPresenter`）は今回のスコープ外
（既に`!rustVideoOnly`条件で正しく動作中）。今回検討したnative-render reuseの
拡大は、警告の裏返しではなく**別の新しい破綻経路**（1で述べた二重デコード）
であり、警告が想定していたケース（rust-only modeでexternal-video presenterを
reuseするとffmpeg再起動ストームになる）とは異なるが、根は同じ「video供給元の
前提が食い違うpresenterを混ぜるな」という制約。

## 3. 87回/177フレームは key churn だけで説明できるか

説明できる。混在セッションではreuseが一切成立しないため、
`nextPresenterKey` は毎tick `includePlaybackFrame: true` でframe_index等を含み、
理論上は毎publishでキーが変わりフル再起動候補になる（177回相当）。
実測が87回（≒2フレームに1回）に収まっているのは
`shouldDeferSharedRendererPreviewSessionPublish`（`Viewport.tsx:385-387`、
`sharedRendererPresenterStartingRef.current` が真の間は publish を
pendingへ退避）が起動中の複数tickを1回にまとめているため。
presenter起動が非同期でおよそ2フレーム分かかっていると仮定すれば
87回という実測値と整合する。他に再起動を追加で誘発している要因は
見つからなかった。

## 4. 既存の境界テスト契約

`src/utils/viewportRustVideoOnlyBoundary.test.ts:571,582,643,646` が
`const canReuseNativeRenderPresenter = rustVideoOnlyEnabled` /
`const canReuseCurrentNativeRenderPresenter = rustVideoOnlyEnabled` という
**ソースコード文字列そのもの**を契約として固定している。ゲートを
`sharedRendererVideoCutoverEnabled || rustVideoOnlyEnabled` に広げる変更は
これらのテストをRedにする。テスト自体を書き換えて契約を反転させることは
今回行っていない（不確実性が残ったまま反転させるべきではないため）。

## 確信が持てない理由 / 今後確信を得るために必要なこと

- 混在セッションでnative-render reuseを安全に有効化するには、
  reuse tick中も `syncSharedRendererExternalVideoSources` を呼び続けるか、
  もしくはvideo供給をRust側デコードへ完全統合する（Phase 4のRust常駐decoder
  構想、`progress/five-bugs-structural-redesign.md` 「4. デコーダ書き換え」）
  のいずれかが前提になる。前者は「毎tick both pipelineを回す」だけで
  二重デコードのコスト問題は残り、後者は本タスクの範囲を超える大改修。
- 実機（rustVideoOnly=false・cutover=true構成）でのA/Vドリフトを
  定量測定していない。理論的な破綻経路は特定したが、実際にどの程度の
  ズレが何秒で顕在化するかは未検証。
- native-render-only（video無し）セッション単体だけなら二重デコード問題が
  無いため理論上は安全に広げられそうだが、`canReuseNativeRenderPresenter`
  は3述語ORの単一ゲートで、述語ごとに異なる `rustVideoOnlyEnabled` 条件を
  持たせるには式の分割が必要（境界テストへの影響もその分広がる）。
  この部分だけを切り出す価値があるかは、重量E2Eが混在セシッションである以上
  87回のうち何回が「video抜きnative-render-only状態」で起きているか
  次第で、今回は計測していない。

## 推奨案

1. まず `render.nativeSharedFrame` reuse tickでも音声/クロックを
   壊さない形でHTMLVideoElement同期を継続する設計（もしくは
   video込み混在では現状維持のまま、native-render-onlyの瞬間だけ
   reuseする部分的ゲート分割）を設計し、契約テストをRedから書く。
2. 実機でrustVideoOnly=false・cutover=true構成でのA/Vドリフトを
   長尺再生で計測し、二重デコードが実害を持つか確認してから着手する。
3. どちらもこのタスクの範囲を超えるため、別タスクとして切り出すことを推奨する。

## 実測（Beta-483c で追加した常設診断）

`exercise.presenterRestarts.duringPlayback`（重量E2E、再生177フレーム区間）:

| 構成 | presenter再起動 | Viewportコミット |
|---|---|---|
| 本番相当（`VITE_UXFD_RUST_VIDEO_ONLY` 未設定） | **87** | 103 |

設計意図では reuse により定常再生中の再起動は0のはずで、コード中のコメントは
フル再起動を「約28ms/回」としている。**Reactのコミット削減（このセッションで
377→103）よりも、こちらの方が実CPUコストへの寄与が大きい可能性が高い。**

## video-freeセッションだけ先に直す案の検証可能性（現時点では不可）

混在セッションは上記の理由で危険だが、**動画を含まないセッション**
（`isSharedRendererNativeRenderOnlySession`）はHTMLVideoElementが関与しないため
二重デコードの危険が原理的に無く、ゲート拡大の安全な部分集合になる。

これを実測で検証するため、動画を含まない `shattered-sphere` プレビューE2Eへ
再生区間とpresenter再起動計測を追加した（`src/main.tsx` のE2E専用分岐へ
`__UXFD_SHATTERED_SPHERE_PREVIEW_E2E_PLAY__` を公開、
`scripts/run-shattered-sphere-preview-e2e.mjs` から呼ぶ）。

**しかしこのE2Eは元から失敗している。** `waitForNativePreviewReady` が
`nativePreviewReadyTimeout` で落ち、計測地点まで到達しない。
`previewReady.rootDataset` を見ると `uxfdSharedRendererPresenterStatus` は `ready`、
`surfaceGate` も `ok`、`mediaKinds` も `GeneratedShatteredSphere` を含むが、
**`uxfdSharedRendererPresenterNativeRenderFrameReady` が付与されない**のが唯一の
未達条件だった。

このセッションの変更が原因でないことは切り分け済み: 生成効果のobject-id供給元を
一本化したコミット（`603c440d`）の**手前**（`ae0535ea`）をチェックアウトして
同E2Eを実行し、**同じ `nativePreviewReadyTimeout` / `nativeRenderFrameReady` 未付与**で
失敗することを確認した。

なおこのE2Eは `VITE_UXFD_SHARED_RENDERER_VIDEO_CUTOVER=1` と
`VITE_UXFD_SHARED_RENDERER_PREVIEW=1` は設定するが、
`VITE_UXFD_RUST_VIDEO_ONLY` は設定しない。**生成効果のみのシーンで
native render frame が用意されない条件が何なのか**は未特定であり、
video-free reuse の検証に進む前にこのE2Eの失敗自体を先に解く必要がある。

## 次にやるべきこと（優先順）

1. **shattered-sphere E2E の `nativeRenderFrameReady` 未付与の原因を特定する。**
   生成効果のみのシーンが本番構成で native render frame を得られないなら、
   それ自体が製品の不具合である可能性がある（このE2Eが検証しようとしている当のもの）。
2. 1が解けたら、video-freeセッション限定で reuse ゲートを広げ、
   同E2Eの `presenterRestarts.duringPlayback` で効果を実測する。
3. 混在セッションは Phase 3b Step 3（Rustがvideoを自前で保持・供給する構造）が
   前提。`progress/phase3b-present-path-unification.md` 参照。
