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
