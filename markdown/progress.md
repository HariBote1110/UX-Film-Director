# 進捗ログ

## 2026-06-19
- Phase5のRust native render export移行として、Viewport export source選択時に `nativeRenderEnvelope` を診断へ接続した。
- Red: `viewportRustExportFrameSource` のテストへ、video+PSD混在相当の `Video,Psd` envelopeがDOM datasetへ出る契約を追加した。
- Green: export session preflightの `nativeRenderEnvelope` をdecisionへ保持し、ready/blockedの状態とmedia/source内訳をdatasetへ書き込むようにした。
- 検証: `npm test -- viewportRustExportFrameSource sharedRendererExportSession` は15件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-123a`。

## 2026-06-19
- Phase5のRust native render export移行として、native renderer bridge未接続時のcapability gateをsource準備より前に移した。
- Red: `sharedRendererExportFrameSource` のテストへ、bridge未接続時に `prepareNativeRenderSources` を呼ばず `webGpuReadbackSharedFrameWriter` へ戻る契約を追加した。
- Green: `renderNativeEncodeFrame` の入口で `nativeSharedFrameRendererAvailable` を確認し、未接続ならpresenter経路へ戻すようにした。
- 検証: `npm test -- sharedRendererExportFrameSource` は19件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-124a`。

## 2026-06-19
- Phase5のRust export移行中fallback安全性として、Rust/shared renderer frame sourceがblockedになった同じframeでruntime planを更新するよう修正した。
- Red: `useProjectExportBoundary` へ、blocked後に `frameRuntimePlan = blockedRuntimePlan` へ差し替える境界契約を追加した。
- Green: `useProjectExport` の `frameRuntimePlan` を `let` にし、fallback許可時にblocked後のplanを同一frameへ反映した。
- 検証: `npm test -- useProjectExportBoundary projectExportFrameCanvas` は22件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-124b`。

## 2026-06-19
- Phase5のRust native render data-planeとして、native render output shared frameのrelease所有権を明示した。
- Red: `rustBackendVideoEncodeExport` へ、非native shared frameのencode write失敗時にnative render release bridgeを呼ばない契約を追加した。
- Green: native render直通frameだけに `releaseAfterEncodeFailure: { kind: 'nativeRenderOutput', memoryId }` を付与し、encode失敗時release対象を限定した。
- 検証: `npm test -- rustBackendVideoEncodeExport sharedRendererExportFrameSource projectExportRustEncodeFrame` は27件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-125a`。

## 2026-06-19
- Phase5のnative render output lifecycleとして、`writeVideoEncodeFrame` がPromise rejectした場合もnative render outputをreleaseするようにした。
- Red: `rustBackendVideoEncodeExport` へ、encode write reject時に `releaseNativeSharedFrame` が呼ばれる契約を追加した。
- Green: `writeRustBackendVideoEncodeFrame` を `try/catch` で囲み、catch側でも `releaseAfterEncodeFailure` metadataに基づいてreleaseしてから元エラーを再throwした。
- 検証: `npm test -- rustBackendVideoEncodeExport` は6件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-125b`。

## 2026-06-19
- Phase5のpreview native render output lifecycleとして、release callbackを単回化した。
- Red: `sharedRendererViewportNativeRenderUpload` へ、GPU upload完了/abort callbackが複数回呼ばれてもnative render outputを一度だけreleaseする契約を追加した。
- Green: `createSingleUseNativeOutputReleaser` を追加し、同じ `memoryId` のrelease Promiseを再利用するようにした。
- 検証: `npm test -- sharedRendererViewportNativeRenderUpload sharedRendererPreviewPresenterController` は28件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-125c`。

## 2026-06-19
- Phase5のRust backend encode-only exportとして、native render bridge未接続時にJS readback writerへ戻らない契約を追加した。
- Red: `sharedRendererExportFrameSource` へ、`nativeRenderRequired` 時に bridge未接続なら `nativeRenderUnavailable` でblockedする契約を追加した。`viewportRustExportFrameSource` へ `preferEncodeOnly` が `nativeRenderRequired: true` を渡す契約も追加した。
- Green: `CreateSharedRendererExportFrameSourceInput.nativeRenderRequired` を追加し、`preferEncodeOnly` 時に有効化した。
- 検証: `npm test -- sharedRendererExportFrameSource viewportRustExportFrameSource projectExportFrameCanvas useProjectExportBoundary` は54件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-126a`。

## 2026-06-19
- Phase5のRust backend encode-only exportとして、media-only frameがRust native render非対応の場合もJS readback writerへ戻らない契約を追加した。
- Red: `sharedRendererExportFrameSource` へ、remote画像media-only frameで `nativeRenderRequired` 時に `nativeRenderUnsupportedMedia` でblockedする契約を追加した。
- Green: `noVideoDecodeRequest` 分岐で `canRenderSharedRendererNativeMediaOnlyFrame` を確認し、native render必須ならfail-loudにした。
- 検証: `npm test -- sharedRendererExportFrameSource sharedRendererNativeMediaSupport` は25件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-127a`。

## 2026-06-19
- Phase5の動画export Rust移行として、動画を含むexportではWebCodecs互換encoderでもRust/shared renderer frame sourceを必須にした。
- Red: `projectExportFrameCanvas` へ、動画export時に `rustFrameSourcePolicy: requireRustFrameSource` と `rustFrameSourceBlockedFallback: failExport` を返す契約を追加した。
- Green: `resolveProjectExportFrameSourcePolicyForEncode` で `hasVideoObjects` をRust frame source必須条件に加えた。
- 検証: `npm test -- projectExportFrameCanvas` は19件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-128a`。

## 2026-06-19
- Phase5のshared renderer exportとして、export frame sourceではpreview presenterの `pixi-passthrough` をready扱いしないようにした。
- Red: `sharedRendererPreviewPresenterController` / `sharedRendererViewportPresenterOrchestration` / `sharedRendererExportFrameSource` へ、export用途で `requireSharedRendererOutput` が伝搬し、passthrough時に `sharedRendererOutputUnavailable` でblockedする契約を追加した。
- Green: presenter入力に `requireSharedRendererOutput` を追加し、export sourceから有効化した。fallback診断には `pixi-passthrough` swatchを残すようにした。
- 検証: `npm test -- sharedRendererPreviewPresenterController sharedRendererViewportPresenterOrchestration sharedRendererExportFrameSource sharedRendererPresenterDiagnostics` は60件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-129a`。

## 2026-06-19
- Phase5のRust backend encode-only exportとして、`bitmapCaptureEnabled: false` ならnative renderを暗黙必須にした。
- Red: `sharedRendererExportFrameSource` へ、呼び出し側が `nativeRenderRequired` を省略してもencode-only sourceが `nativeRenderUnavailable` でblockedする契約を追加した。
- Green: `effectiveNativeRenderRequired = nativeRenderRequired || !bitmapCaptureEnabled` を導入し、旧WebGPU readback + JS writer成功契約を削除した。
- 検証: `npm test -- sharedRendererExportFrameSource` は22件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-130a`。

## 2026-06-19
- Phase5のRust backend export encodeとして、WebGPU readback + JS shared-frame writer経路を `sharedRendererExportFrameSource` から削除した。
- Red: `sharedRendererExportFrameSource` の既存readback成功契約を、`webGpuReadbackUnavailable` でblockedする契約へ反転した。
- Green: `createEncodeFrameWriter` / `getEncodeFrameWriter` / `rustBackendVideoEncodeSharedFrameWriter` の遅延importを削除し、native renderまたはpresented shared-frame handoff以外はblockするようにした。
- 検証: `npm test -- sharedRendererExportFrameSource` は22件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-131a`。

## 2026-06-19
- Phase5の動画export Rust移行として、動画を含むexportではRust backend video encoderを必須にした。
- Red: `projectExportEncodePlan` へ、`rustVideoOnly` が無効でも動画exportでRust encoder bridgeが無い場合は `rustEncoderRequired` になる契約を追加した。
- Green: `resolveProjectExportEncodePlan` で `hasVideoObjects` をRust encoder必須条件に加えた。
- 検証: `npm test -- projectExportEncodePlan projectExportFrameCanvas useProjectExportBoundary` は31件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-132a`。

## 2026-06-19
- Phase5のpresented shared-frame handoffとして、native handoff失敗時のWebGPU readback + JS writer fallbackを削除した。
- Red: `sharedRendererWebGpuPresenter` へ、native handoff無しでは `takePresentedFrameSharedFrame` が明示エラーになり、copy/readback/writeをしない契約を追加した。
- Green: `createEncodeFrameWriter` / writer cache / readback fallbackをWebGPU presenterから削除し、native handoff payloadのみを成功扱いにした。
- 検証: `npm test -- sharedRendererWebGpuPresenter sharedRendererExportFrameSource sharedRendererPreviewPresenterController` は63件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-133a`。

## 2026-06-19
- Phase5の動画export sourceとして、動画objectを含む場合は呼び出し側の `preferEncodeOnly` 指定漏れがあってもencode-only扱いにした。
- Red: `viewportRustExportFrameSource` へ、動画export source生成時に `bitmapCaptureEnabled=false` / `nativeRenderRequired=true` が渡る契約を追加した。
- Green: `objects` 内の動画検出を `preferEncodeOnly` と統合し、動画export sourceが `renderFrame` / `createImageBitmap(canvas)` 能力を持たないようにした。
- 検証: `npm test -- viewportRustExportFrameSource useProjectExportBoundary projectExportFrameCanvas projectExportEncodePlan` は44件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-134a`。

## 2026-06-19
- Phase5の動画export sourceとして、factory直呼びでも動画 `renderFrame` requestがImageBitmap canvas captureへ進まないようにした。
- Red: `sharedRendererExportFrameSource` へ、動画objectを含む `renderFrame` が presenter起動/`createImageBitmap(canvas)` 前に `videoBitmapCaptureDisabled` でblockedになる契約を追加した。
- Green: `renderFrameBitmap` の入口で動画objectを検出し、診断datasetをblockedへ更新して `SharedRendererExportFrameSourceBlockedError` を投げるようにした。
- 検証: `npm test -- sharedRendererExportFrameSource viewportRustExportFrameSource projectExportFrameCanvas` は55件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-135a`。

## 2026-06-19
- Phase5の動画export contextとして、`useProjectExport` から Rust frame sourceへ渡す `preferEncodeOnly` 判断を純関数化した。
- Red: `projectExportFrameCanvas` へ、動画objectを含む場合は `encodeEngine: webCodecsMp4Muxer` hintでも `preferEncodeOnly=true` になる契約を追加した。
- Green: `resolveProjectExportRustFrameSourceContext` を追加し、`useProjectExport` がこのresolver経由で `getRustExportFrameSource` を呼ぶようにした。
- 検証: `npm test -- projectExportFrameCanvas useProjectExportBoundary viewportRustExportFrameSource projectExportEncodePlan` は46件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-136a`。

## 2026-06-19
- Phase5のexport source境界として、`sharedRendererExportFrameSource` のテストfixtureからもJS shared-frame writer語彙を削除した。
- Red: `sharedRendererExportFrameSourceBoundary` へ、`sharedRendererExportFrameSource.test.ts` に `createEncodeFrameWriter` を残さない契約を追加した。
- Green: encode-only/native render系テストに残っていた `createEncodeFrameWriter` 注入fixtureを削除し、WebGPU readback + JS writer経路の復活余地を狭めた。
- 検証: `npm test -- sharedRendererExportFrameSourceBoundary sharedRendererExportFrameSource` は24件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-137a`。

## 2026-06-19
- Phase5のexport source診断として、削除済みのWebGPU readback + JS writer経路を `uxfdRustExportFrameSourceFramePath` の候補から外した。
- Red: `sharedRendererExportFrameSourceBoundary` へ、production sourceに `webGpuReadbackSharedFrameWriter` diagnostic pathを残さない契約を追加した。
- Green: `writeFrameDiagnostics` の成功path unionを `nativeRenderSharedFrame` / `presentedSharedFrame` のみにした。
- 検証: `npm test -- sharedRendererExportFrameSourceBoundary sharedRendererExportFrameSource` は25件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-138a`。

## 2026-06-19
- Phase5のpreview video cutoverとして、Pixi video分岐の経路選択を純関数化し、Rust video必須時はshared rendererを最優先にした。
- Red: `pixiVideoCutover` へ、`requireSharedRendererVideo=true` ならexport frame overrideがあっても `sharedRendererOnly` になる契約を追加した。
- Green: `resolvePixiVideoRenderPath` を追加し、`updatePixiContent` のvideo分岐がこの結果に基づいて cleanup / export override / Pixi video element pathを選ぶようにした。
- 検証: `npm test -- pixiVideoCutover viewportRustVideoOnlyBoundary sharedRendererVideoMediaReadiness` は13件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-139a`。

## 2026-06-19
- Phase5のpresenter control境界として、export必須controlからWebGPU readback APIを非公開にした。
- Red: `sharedRendererPreviewPresenterController` へ、`requireSharedRendererOutput=true` のready controlが `readPresentedFrameRgbaBytes` を持たない契約を追加した。
- Green: `SharedRendererPreviewPresenterControl.readPresentedFrameRgbaBytes` をoptionalにし、export必須時は返却objectから外した。通常preview診断controlでは引き続きreadbackを公開する。
- 検証: `npm test -- sharedRendererPreviewPresenterController sharedRendererExportFrameSource sharedRendererViewportPresenterOrchestration` は60件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-140a`。

## 2026-06-19
- Phase5のexport source境界として、`sharedRendererExportFrameSource.test.ts` からWebGPU readback fixture語彙を削除した。
- Red: `sharedRendererExportFrameSourceBoundary` へ、export source testに `readPresentedFrameRgbaBytes` を残さない契約を追加した。
- Green: encode frame系fixtureから `readPresentedFrameRgbaBytes` を削除し、handoff不在時はblocked、handoffありならpayload直渡しという契約へ整理した。
- 検証: `npm test -- sharedRendererExportFrameSourceBoundary sharedRendererExportFrameSource` は26件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-141a`。

## 2026-06-19
- Phase5のexport source診断として、presented shared-frame handoff不在時のblocked reasonをWebGPU readback前提の名前から切り離した。
- Red: `sharedRendererExportFrameSource` へ、handoff不在時に `presentedSharedFrameHandoffUnavailable` としてblockedし、messageもhandoff必須を示す契約へ反転した。
- Green: `SharedRendererExportFrameSourceBlockedReason` と `renderEncodeFrame` のblocked reason/message/datasetを `presentedSharedFrameHandoffUnavailable` へ更新した。
- 検証: `npm test -- sharedRendererExportFrameSource sharedRendererExportFrameSourceBoundary sharedRendererPreviewPresenterController` は52件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-142a`。

## 2026-06-19
- Phase5のexport encode境界として、旧WebGPU readback用のJS shared-frame writer moduleを削除した。
- Red: `sharedRendererExportFrameSourceBoundary` へ、`rustBackendVideoEncodeSharedFrameWriter.ts` が存在しない契約を追加した。
- Green: `rustBackendVideoEncodeSharedFrameWriter.ts` と専用テストを削除し、production参照が境界テスト以外に残っていないことを確認した。
- 検証: `npm test -- sharedRendererExportFrameSourceBoundary sharedRendererExportFrameSource` は27件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-143a`。

## 2026-06-19
- Phase5のexport frame source planとして、動画objectありの場合はpolicy指定漏れでもlegacy canvasへ直落ちしないようにした。
- Red: `projectExportFrameCanvas` へ、`hasVideoObjects=true` かつ `rustFrameSource=null` ならPixi canvasがあっても `rustFrameSourceRequired` になる契約を追加した。
- Green: `BuildProjectExportFrameSourcePlanInput.hasVideoObjects` を追加し、`buildProjectExportFrameSourcePlan` 内で動画exportをfail-loudにした。`useProjectExport` からも `hasVideoObjects` を渡すようにした。
- 検証: `npm test -- projectExportFrameCanvas useProjectExportBoundary projectExportEncodePlan viewportRustExportFrameSource` は47件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-144a`。
