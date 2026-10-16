# P2d: preview/export の Rust evaluation 接続と残存経路

## 現在の到達点

- Rust builder が受理した常駐 scene は、preview では `scene.replace` 成功後の `scene.evaluate` 結果を共通 session として publish する。export では同じ graph の `scene.replace` を一度だけ行い、各 frame の `scene.evaluate` 結果から export session を作る。
- preview は RPC 有効時、評価済み session が無い同期 publish 要求を拒否し、TypeScript snapshot を再生成しない。RPC 無効時は既存の同期経路を維持する。
- export はRust builder が明示的に未対応 graph と判定した場合だけ `null` による旧 serializer fallback を許す。RPC、clone、acknowledgement、scene/revision/frame 不一致は fallback に変換せずエラーとして伝播する。
- export builder の media purpose は `exportOriginal`。preview の `previewProxy` と区別し、`proxyFilePath` と `filePath` が異なる parity fixture、および既存 TypeScript export session test で original source を確認する。
- 非同期評価を待つ間に frame source が close された場合、await 復帰後に presenter を開始しない。

## 旧 TypeScript snapshot へ流れる具体条件

| 経路 | 条件 | 動作 |
| --- | --- | --- |
| Preview | `rustTimelineSceneRpcEnabled=false` | `shouldBuildSharedRendererPreviewSessionForTick` が同期 session 構築を許可する。各種 RPC/cut-over flag OFF 時の互換経路。 |
| Preview | RPC 有効で replace/evaluate が失敗 | session を消去して blocked にする。旧 snapshot へは戻らない。 |
| Export | resident evaluation provider を構成できない（RPC、editable cut-over、controller のいずれかが無効/未生成） | 既存 export session builder を使う。 |
| Export | builder が unsupported eligibility を明示する、または確認結果が Rust source でない | provider が `null` を返し、その frame のみ既存 export builder を使う。 |
| Export | RPC、clone、acknowledgement、evaluation 応答が異常 | error として停止する。正常 fallback として扱わない。 |

Windows interim presenter に個別の snapshot 生成路はない。presenter が受け取るのは通常 publish 済み session であり、RPC 有効時は Rust evaluation 結果、RPC 無効時は互換の同期 session である。

## Serializer 撤去前の production import 台帳

`buildRustSceneSnapshotForTimeline` の production 呼び出しは `sharedRendererPreviewBridge.ts` の同期 plan builder 一箇所である。そこから preview の flag-off 経路と export の明示 fallback が到達する。`sharedRendererPreviewSession.ts` と `sharedRendererExportSession.ts` はその plan builder を呼ぶ。`Viewport.tsx` は同期 preview builder と評価済み preview session helper の切替を行い、`sharedRendererExportFrameSource.ts` / `viewportRustExportFrameSource.ts` は export builder または Rust evaluation provider を選ぶ。

`rustSceneSnapshot.ts` 全体は serializer 専用ではない。P3 で削除する前に次の契約を別 module に保持または移動する必要がある。

- snapshot/effect/media 型、frame rate と colour pipeline 型など Rust wire の共有型。
- `validateRustSceneSnapshotBoundary` 相当の surface gate 境界検証。
- `isSupportedSceneObject` は `projectExportFrameCanvas.ts` から production 利用される。
- `textMediaBox` は `SceneSelectionDecorationLayer.tsx` と `sceneHitTest.ts` で利用される。text geometry の専用 module への移行後に旧 export を整理する。
- `secondsToFrameIndex` は `editableRustScenePreviewController.ts` が利用する。
- native render/video、presenter、empty-scene、solid-colour の複数 module は `RustSceneSnapshot` / media reference の型のみを利用するため、serializer と型契約を同時に削除しない。

残る TS-only 機能は、現時点では Rust resident builder eligibility を満たさない graph と、Rust builder がまだ完全に native resident 化していない kind/effect 組み合わせである。42種類の media serialization coverage と15種類の resident eligibility は別の集合であり、27 generated kind の残作業を15型 whitelist に含めた扱いにはしない。未対応 kind は fallback 中も既存 gate / error と診断を維持し、無言で落とさない。

## P2 / P3 / P4 の残り

- P2 全体は未完了。unsupported eligibility への旧 serializer fallback、RPC/cut-over flag OFF の互換路、controller 未生成時の同期 fallback が残る。builder coverage を広げ、eligible-outside fallback を段階的に減らす必要がある。
- P3 は未着手。上記 fallback を安全に無くせるまで production serializer 呼び出しを撤去しない。text helper と Rust snapshot/effect/media 型を分離してから小分けに削る。
- P4 は未着手。frame 現在値購読だけでは代替できない参照が残る。PropertyPanel の任意時刻評価（keyframe insertion 位置を含む）、splitObject の境界位置、visionTrackingKeyframes の複数 sample 変換、および `sceneHitTest.ts` の位置/group 評価は、scene revision と任意 frame/time の契約が必要。

## 検証

```text
$ npm test -- --run src/utils/sharedRendererPreviewBridge.test.ts src/utils/sharedRendererEvaluatedScenePreviewSession.test.ts src/utils/sharedRendererPreviewSession.test.ts src/utils/sharedRendererExportEvaluationProvider.test.ts src/utils/sharedRendererExportFrameSource.test.ts src/utils/sharedRendererExportSession.test.ts src/utils/viewportRustExportFrameSource.test.ts src/utils/editableRustScenePreviewController.test.ts src/utils/sharedRendererScenePreviewScheduler.test.ts
Test Files  9 passed (9)
Tests  109 passed (109)

$ cargo test --manifest-path rust-core/Cargo.toml --test editable_scene_builder_parity -- --nocapture
test result: ok. 7 passed; 0 failed

$ npx tsc --noEmit
exit 0

$ npm test -- --run src/utils/sharedRendererExportFrameSource.test.ts
Test Files  1 passed (1)
Tests  49 passed (49)
```

preview publish guard の追加後は `ViewportRustTimelineSceneRpc`, evaluated preview session, preview bridge の15 testsと `npx tsc --noEmit` が成功した。

親担当による統合 E2E（`/tmp/uxfd-subagent-rust-evaluation-result.json`）では、nativeDirect=0、native overlay OFF、all cut-over ON の mixed/PSD/generated/group-control scene が `residentScene` source で60/60 frame完了し、H.264 ffprobe一致、`runtimeErrors=[]`、encoder は `ffmpegRawRgba` だった。これは nativeDirect=true の既存 resident encode 経路とは別に、今回の async provider を通った結果である。

`npm run codegen:types:check` は既存 schema drift 5件で失敗した。FocusLinesPlus/Hksy の整数契約、および ProjectFile/SceneData/TimelineObject の参照差分であり、本作業中に生成された schema 差分は戻してある。親レビュー後に独立の再生成 commit で扱う。
