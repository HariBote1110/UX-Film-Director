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

## 2026-06-19
- Phase5のruntime plan境界として、動画objectを含むRust frame sourceが実行中にblockedになってもlegacy canvasへ復帰しないようにした。
- Red: `projectExportFrameCanvas` へ、`hasVideoObjects=true` のRust frame source planはblocked時に `failExport` になり、HTMLVideoElement seekを要求しない契約を追加した。
- Green: `buildProjectExportFrameSourcePlan` で動画ありRust frame source planの `rustFrameSourceBlockedFallback` を `failExport` に正規化した。
- 検証: `npm test -- projectExportFrameCanvas useProjectExportBoundary projectExportEncodePlan viewportRustExportFrameSource sharedRendererExportFrameSource` は75件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-145a`。

## 2026-06-19
- Phase5のpreview cutoverとして、通常preview動画も既定でPixi video pathへ進まないようにした。
- Red: `pixiVideoCutover` へ、`requireSharedRendererVideo=false` の通常preview動画でも `sharedRendererOnly` になる契約を追加した。
- Green: `shouldSkipPixiVideoForSharedRenderer` を反転し、preview動画はshared renderer専用、export互換分岐のみ旧Pixi video element pathを残すようにした。
- 検証: `npm test -- pixiVideoCutover viewportRustVideoOnlyBoundary sharedRendererVideoMediaReadiness` は14件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-146a`。

## 2026-06-19
- Phase5のpreview control境界として、動画sceneを含むcontrolからWebGPU readback APIを非公開にした。
- Red: `sharedRendererPreviewPresenterController` へ、`videoSession` のready controlが `readPresentedFrameRgbaBytes` を持たない契約を追加した。
- Green: `startSharedRendererPreviewPresenter` の返却objectで、`hasVideoScene=true` の場合は `readPresentedFrameRgbaBytes` を省くようにした。
- 検証: `npm test -- sharedRendererPreviewPresenterController sharedRendererExportFrameSource sharedRendererViewportPresenterOrchestration` は63件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-147a`。

## 2026-06-19
- Phase5のrenderer boundaryとして、JS rendererからshared-frame ringへ書き込むwriter API公開を削除した。
- Red: `sharedVideoFrameWritableBridgeBoundary` へ、renderer utility moduleとpreload/window型に `createWritableSharedFrameRing` / `writeIntoSharedFrameRing` / `closeWritableSharedFrameRing` を残さない契約を追加した。
- Green: `sharedVideoFrameWritableBridge.ts` と肯定テストを削除し、`electron/preload.ts` と `src/vite-env.d.ts` からwriter API公開を外した。native addonの低レベル関数は維持した。
- 検証: `npm test -- sharedVideoFrameWritableBridgeBoundary sharedVideoFrameUploadBridge sharedVideoFramePresentedFrameHandoffBoundary rustBackendVideoEncodeExport` は11件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-148a`。

## 2026-06-19
- Phase5のpreview起動条件として、動画cutoverを明示OFF以外では既定ONにした。
- Red: `viewportRustVideoOnlyBoundary` へ、`VITE_UXFD_SHARED_RENDERER_VIDEO_CUTOVER !== '0'` を期待する境界契約を追加した。
- Green: `Viewport` と `startSharedRendererPreviewPresenter` のvideo cutover既定値を `=== '1'` から `!== '0'` へ変更し、動画sceneなしnative render testのownership reasonを `noVideoScene` に更新した。
- 検証: `npm test -- viewportRustVideoOnlyBoundary pixiVideoCutover sharedRendererPreviewPresenterController sharedRendererViewportPresenterOrchestration sharedRendererVideoMediaReadiness` は51件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-149a`。

## 2026-06-19
- Phase5のpreview surface起動条件として、shared renderer previewを明示OFF以外では既定ONにした。
- Red: `viewportRustVideoOnlyBoundary` へ、`VITE_UXFD_SHARED_RENDERER_PREVIEW !== '0'` を期待する境界契約を追加した。
- Green: `Viewport` の `sharedRendererPreviewEnabled` を `=== '1'` から `!== '0'` へ変更し、Pixi動画既定拒否後もshared renderer surfaceが通常previewで立ち上がるようにした。
- 検証: `npm test -- viewportRustVideoOnlyBoundary sharedRendererSurfaceMount pixiVideoCutover sharedRendererViewportPresenterOrchestration sharedRendererPreviewPresenterController` は51件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-150a`。

## 2026-06-19
- Phase5のexport dependency boundaryとして、動画objectがないexportではlegacy browser video providerを読み込まないようにした。
- Red: `useProjectExportBoundary` へ、provider import gateが `exportFrameSourcePlan.requiresLegacyBrowserVideoProviders` と `videoObjects.length > 0` の両方を見る契約を追加した。
- Green: `shouldLoadLegacyBrowserVideoProviders` を追加し、`VideoFrameProvider` / `PlaybackFrameProvider` のdynamic import条件を実動画clipありに絞った。
- 検証: `npm test -- useProjectExportBoundary projectExportFrameCanvas projectExportEncodePlan viewportRustExportFrameSource` は49件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-151a`。

## 2026-06-19
- Phase5のproduction export hookから、旧VideoDecoder/rVFC/HTMLVideoElement seek fallbackを削除した。
- Red: `useProjectExportBoundary` へ、`useProjectExport` が `videoFrameProvider` / `playbackFrameProvider` をdynamic importせず、legacy provider gateや `requiresHtmlVideoElementSeekFallback` も持たない契約を追加した。
- Green: `useProjectExport` から `FrameProvider` map、provider初期化、export frame override注入、HTMLVideoElement seek fallback、VideoDecoder hybrid表示を削除した。
- 検証: `npm test -- useProjectExportBoundary projectExportFrameCanvas projectExportEncodePlan viewportRustExportFrameSource sharedRendererExportFrameSource` は77件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-152a`。

## 2026-06-19
- Phase5のproduction utils整理として、未参照になった `VideoFrameProvider` moduleを削除した。
- Red: `useProjectExportBoundary` へ、`src/utils/videoFrameProvider.ts` が存在しない契約を追加した。
- Green: `src/utils/videoFrameProvider.ts` を削除した。`videoDecodeStream` はexport test harnessの比較・診断用途として残した。
- 検証: `npm test -- useProjectExportBoundary projectExportFrameCanvas projectExportEncodePlan viewportRustExportFrameSource` は51件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-153a`。

## 2026-06-19
- Phase5のexport hook境界として、`useProjectExport` からDOM動画要素参照を削除した。
- Red: `useProjectExportBoundary` へ、hook sourceが `videoElementsRef` / `pauseLegacyBrowserVideosForExport` / `HTMLVideoElement` を含まない契約を追加した。
- Green: `useProjectExport` の引数・dependency配列・pause呼び出しを削除し、`Viewport` 側の呼び出しも更新した。
- 検証: `npm test -- useProjectExportBoundary projectExportFrameCanvas projectExportEncodePlan viewportRustExportFrameSource viewportRustVideoOnlyBoundary` は57件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-154a`。

## 2026-06-19
- Phase5のPixi video cutoverとして、Pixi video element fallbackを明示legacy opt-inに限定した。
- Red: `pixiVideoCutover` へ、export互換状況でも `allowLegacyPixiVideo` が無い場合は `sharedRendererOnly` になる契約を追加した。
- Green: `ResolvePixiVideoRenderPathInput.allowLegacyPixiVideo` を追加し、既定では最後のfallbackも `sharedRendererOnly` にした。
- 検証: `npm test -- pixiVideoCutover viewportRustVideoOnlyBoundary sharedRendererViewportPresenterOrchestration sharedRendererPreviewPresenterController` は50件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-155a`。
