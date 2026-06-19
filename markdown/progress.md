# 進捗ログ

## 2026-06-19
- Phase5のexport診断表示として、Rust frame source plan failureの `rustFrameSourceRequired` に読みやすい表示ラベルを追加した。
- Red: `ExportProgressModal` のテストへ、raw reasonではなく `Rust frame source必須` / `Rust frame source required` が表示される契約を追加した。
- Green: plan failure reason formatterを追加し、Image/PSD Rust frame source不在のUI診断を追いやすくした。
- 検証: `npm test -- ExportProgressModal exportDiagnosticsLog exportProgressDiagnostics exportProgress` は33件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-216w`。

## 2026-06-19
- Phase5のViewport export source診断として、Image/PSDなどnative render mediaのpreflight失敗を `fallback` ではなく `blocked` として出すようにした。
- Red: `viewportRustExportFrameSource` のテストへ、`hasNativeRenderMediaObjects=true` のpreflight失敗がblocked診断になる契約を追加した。
- Green: Viewport Rust export source入力に `hasNativeRenderMediaObjects` を追加し、`Viewport` からcontext値を渡すようにした。
- 検証: `npm test -- viewportRustExportFrameSource viewportRustVideoOnlyBoundary` は34件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-216v`。

## 2026-06-19
- Phase5のexport計画診断として、Image/PSD exportでRust frame sourceが不在の場合のdetailをImage/PSD由来だと分かる文言にした。
- Red: `projectExportFrameCanvas` のテストへ、`hasNativeRenderMediaObjects=true` のplan failure detailが `Image/PSD export requires...` になる契約を追加した。
- Green: `buildProjectExportFrameSourcePlan` に `hasNativeRenderMediaObjects` を渡し、`useProjectExport` からも同じ判定を渡すようにした。
- 検証: `npm test -- projectExportFrameCanvas useProjectExportBoundary` は56件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-216u`。

## 2026-06-19
- Phase5のexport計画として、Image/PSDを含むWebCodecs互換exportもRust frame source必須・blocked時failとして扱うようにした。
- Red: `projectExportFrameCanvas` のテストへ、`hasNativeRenderMediaObjects` がtrueなら `requireRustFrameSource` / `failExport` になる契約と、contextがImage/PSDをnative render mediaとして検出する契約を追加した。
- Green: export policy/contextに `hasNativeRenderMediaObjects` を追加し、`useProjectExport` からImage/PSDの存在を渡すようにした。
- 検証: `npm test -- projectExportFrameCanvas useProjectExportBoundary` は55件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-216t`。

## 2026-06-19
- Phase5のexport runtimeとして、blocked errorが `legacyCanvasFallbackAllowed=false` を持つ場合は、非動画exportでもlegacy canvas fallbackへ戻らないようにした。
- Red: `projectExportFrameRenderer` のテストへ、計画上はlegacy fallback可能でもerror単位でfallback禁止なら失敗する契約を追加した。
- Green: `renderProjectExportFrame` がblocked診断を出した後、error単位のlegacy禁止をruntime planより優先してthrowするようにした。
- 検証: `npm test -- projectExportFrameRenderer sharedRendererExportFrameSource exportProgressDiagnostics exportProgress ExportProgressModal` は82件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-216s`。

## 2026-06-19
- Phase5のexport診断として、Image/PSD ownershipがPixiへ残った `sharedRendererOutputUnavailable` のdetailにowner/cutover reasonを残すようにした。
- Red: `sharedRendererExportFrameSource` のテストへ、presenter datasetのImage/PSD ownership診断がexport blocked error messageへ入る契約を追加した。
- Green: genericな `sharedRendererOutputUnavailable` detail生成時に `imageOwnership=pixi:nativeRenderFrameUnavailable` / `psdOwnership=pixi:nativeRenderFrameUnavailable` を付加するようにした。
- 検証: `npm test -- sharedRendererExportFrameSource ExportProgressModal exportDiagnosticsLog exportProgressDiagnostics exportProgress` は81件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-216r`。

## 2026-06-19
- Phase5のownership cutoverとして、実出力必須時にImage/PSD ownershipがPixiへ残るpreviewを `blocked` に変更した。
- Red: `sharedRendererPreviewPresenterController` のテストへ、diagnostic swatchが有効でもImage/PSDのPixi所有が `ready` にならない契約を追加した。
- Green: image/PSD ownerが `sharedRenderer` でない場合、`sharedRendererOutputUnavailable` のblocked診断を出し、owner/cutover reason/object countをdatasetへ残すようにした。
- 検証: `npm test -- sharedRendererPreviewPresenterController sharedRendererPresenterDiagnostics` は49件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-216q`。

## 2026-06-19
- Phase5のexport診断表示として、`nativeRenderTextureViewUnavailable` のRust frame source blocked診断に読みやすい表示ラベルを追加した。
- Red: `ExportProgressModal` のテストへ、raw reasonではなく `native render texture viewなし` / `native render texture view unavailable` が表示される契約を追加した。
- Green: blocked reason formatterに `nativeRenderTextureViewUnavailable` の日本語/英語ラベルを追加した。
- 検証: `npm test -- ExportProgressModal exportDiagnosticsLog exportProgressDiagnostics exportProgress sharedRendererExportFrameSource` は80件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-216p`。

## 2026-06-19
- Phase5のexport blocked伝搬として、`nativeRenderTextureViewUnavailable` をlegacy bitmap captureや `presentedSharedFrameHandoffUnavailable` に丸めず伝えるようにした。
- Red: `sharedRendererExportFrameSource` のテストへ、bitmap exportとdirect encode exportの両方でnative render texture view欠落が同じblocked reasonになる契約を追加した。
- Green: export frame sourceのblocked reasonへ `nativeRenderTextureViewUnavailable` を追加し、presenter control失敗を同じreasonで停止させた。
- 検証: `npm test -- sharedRendererExportFrameSource` は48件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-216o`。

## 2026-06-19
- Phase5のpreview診断として、実出力必須時のnative render frame presentation失敗を `fallback` ではなく `blocked` として出すようにした。
- Red: `sharedRendererPreviewPresenterController` のテストへ、native render texture view欠落時の `nativeRenderTextureViewUnavailable` がblocked診断になる契約を追加した。
- Green: native render frame presentation失敗時のdiagnostics statusを、実出力必須時だけ `blocked` に切り替えた。
- 検証: `npm test -- sharedRendererPreviewPresenterController sharedRendererPresenterDiagnostics sharedRendererViewportPresenterOrchestration viewportRustVideoOnlyBoundary` は74件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-216n`。

## 2026-06-19
- Phase5のexport診断表示として、`webGpuDrawUnavailable` のRust frame source blocked診断に読みやすい表示ラベルを追加した。
- Red: `ExportProgressModal` のテストへ、raw reasonではなく `WebGPU描画不可` / `WebGPU draw unavailable` が表示される契約を追加した。
- Green: blocked reason formatterに `webGpuDrawUnavailable` の日本語/英語ラベルを追加した。
- 検証: `npm test -- ExportProgressModal exportDiagnosticsLog exportProgressDiagnostics exportProgress sharedRendererExportFrameSource` は77件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-216m`。

## 2026-06-19
- Phase5のexport fallback境界として、presenterの `webGpuDrawUnavailable` をlegacy bitmap captureへ逃がさずblockedとして伝搬するようにした。
- Red: `sharedRendererExportFrameSource` のテストへ、WebGPU draw不可時に `createFrameBitmap` が呼ばれずblocked errorになる契約を追加した。
- Green: export frame sourceのblocked reasonへ `webGpuDrawUnavailable` を追加し、presenter control失敗をそのまま伝搬した。
- 検証: `npm test -- sharedRendererExportFrameSource projectExportFrameRenderer exportDiagnosticsLog exportProgress ExportProgressModal` は79件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-216l`。

## 2026-06-19
- Phase5のpreview診断として、実出力必須時のvideo frame scene presentation失敗を `fallback` ではなく `blocked` として出すようにした。
- Red: `sharedRendererPreviewPresenterController` のテストへ、Rust decoded video frame upload後の `webGpuDrawUnavailable` がblocked診断になる契約を追加した。
- Green: video frame scene presentation失敗時のdiagnostics statusを、実出力必須時だけ `blocked` に切り替えた。
- 検証: `npm test -- sharedRendererPreviewPresenterController sharedRendererPresenterDiagnostics sharedRendererViewportPresenterOrchestration viewportRustVideoOnlyBoundary` は73件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-216k`。

## 2026-06-19
- Phase5のpreview診断として、実出力必須時のSolidColour presentation失敗を `fallback` ではなく `blocked` として出すようにした。
- Red: `sharedRendererPreviewPresenterController` のテストへ、`requireSharedRendererOutput` 有効時の `webGpuDrawUnavailable` がblocked診断になる契約を追加した。
- Green: SolidColour presentation失敗時のdiagnostics statusを、実出力必須時だけ `blocked` に切り替えた。
- 検証: `npm test -- sharedRendererPreviewPresenterController sharedRendererPresenterDiagnostics sharedRendererViewportPresenterOrchestration viewportRustVideoOnlyBoundary` は72件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-216j`。

## 2026-06-19
- Phase5のexport診断表示として、`sharedRendererOutputUnavailable` のRust frame source blocked診断に読みやすい表示ラベルを追加した。
- Red: `ExportProgressModal` のテストへ、raw reasonではなく `shared renderer実出力なし` / `shared renderer output unavailable` が表示される契約を追加した。
- Green: blocked reason formatterに `sharedRendererOutputUnavailable` の日本語/英語ラベルを追加した。
- 検証: `npm test -- ExportProgressModal exportDiagnosticsLog exportProgressDiagnostics exportProgress` は30件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-216i`。

## 2026-06-19
- Phase5のexport fallback境界として、`sharedRendererOutputUnavailable` 時にbitmap export pathがlegacy bitmap captureへ進まないようにした。
- Red: `sharedRendererExportFrameSource` のテストへ、実出力不可時に `createFrameBitmap` が呼ばれずblocked errorになる契約を追加した。
- Green: `sharedRendererOutputUnavailable` のblocked化を `presentFrame` 共通経路へ移し、direct encodeとbitmap exportの両方で同じfail-loud境界を使うようにした。
- 検証: `npm test -- sharedRendererExportFrameSource projectExportFrameRenderer exportDiagnosticsLog exportProgress` は77件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-216h`。

## 2026-06-19
- Phase5のexport診断として、presenterの `sharedRendererOutputUnavailable` を `presentedSharedFrameHandoffUnavailable` に丸めず、native render upload失敗詳細を保持するようにした。
- Red: `sharedRendererExportFrameSource` のテストへ、direct encode exportで `webGpuUploadUnavailable` 詳細がblocked error messageに残る契約を追加した。
- Green: export frame sourceのblocked reasonへ `sharedRendererOutputUnavailable` を追加し、presenter control失敗をそのまま伝搬した。
- 検証: `npm test -- sharedRendererExportFrameSource projectExportFrameRenderer exportDiagnosticsLog exportProgress` は76件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-216g`。

## 2026-06-19
- Phase5のpreview診断として、実出力必須blocked時にnative render frame upload失敗の理由と詳細を保持するようにした。
- Red: `sharedRendererPreviewPresenterController` のテストへ、WebGPU upload不可でnative render frame uploadが失敗した場合でもblocked診断に `webGpuUploadUnavailable` が残る契約を追加した。
- Green: `sharedRendererOutputUnavailable` のblocked diagnosticsへ `nativeRenderFailureReason` / `nativeRenderFailureDetail` を渡すようにした。
- 検証: `npm test -- sharedRendererPreviewPresenterController sharedRendererPresenterDiagnostics sharedRendererViewportPresenterOrchestration viewportRustVideoOnlyBoundary` は71件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-216f`。

## 2026-06-19
- Phase5のpreview診断として、実shared renderer出力が必須なのにPixi passthroughしか残らないケースを `blocked` に変更した。
- Red: `sharedRendererPreviewPresenterController` のテストへ、`requireSharedRendererOutput` 時の `sharedRendererOutputUnavailable` がblocked診断になる契約を追加した。
- Green: presenter diagnosticsの該当経路を `fallback` から `blocked` に変更した。
- 検証: `npm test -- sharedRendererPreviewPresenterController sharedRendererPresenterDiagnostics sharedRendererViewportPresenterOrchestration viewportRustVideoOnlyBoundary` は70件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-216e`。

## 2026-06-19
- Phase5のexport診断保存として、`videoOwnershipUnavailable` / `videoUploadFailed` のblocked payload自体をlegacy fallback不可へ正規化した。
- Red: `exportProgress` と `exportProgressDiagnostics` のテストへ、古いtrue payloadでもprogress保持時にはfalseになる契約を追加した。
- Green: `normaliseRustFrameSourceBlockedFallback` を追加し、`setExportProgress` と `updateExportProgressPhase` で同じ正規化を使うようにした。
- 検証: `npm test -- ExportProgressModal exportDiagnosticsLog exportProgressDiagnostics exportProgress` は29件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-216d`。

## 2026-06-19
- Phase5のexport診断表示として、`videoOwnershipUnavailable` / `videoUploadFailed` を理由ベースでlegacy fallback不可へ正規化した。
- Red: `ExportProgressModal` と `exportDiagnosticsLog` のテストへ、古いtrue payloadでも動画Rust blocked診断はfallback不可表示になる契約を追加した。
- Green: `isRustFrameSourceLegacyCanvasFallbackAllowed` を追加し、UI summaryとDevTools logで同じ正規化を使うようにした。
- 検証: `npm test -- ExportProgressModal exportDiagnosticsLog exportProgressDiagnostics exportProgress` は28件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-216c`。

## 2026-06-19
- Phase5のexport診断として、動画を含むRust export preflight失敗を `fallback` ではなく `blocked` として出すようにした。
- Red: `viewportRustExportFrameSource` のテストへ、動画preflightで `exportSessionBlocked` になった場合に `uxfdRustExportFrameSourceStatus=blocked` になる契約を追加した。
- Green: `ViewportRustExportFrameSourceDecision` に任意の `diagnosticStatus` を追加し、動画/Rust必須preflight失敗だけblockedとして書き出すようにした。
- 検証: `npm test -- viewportRustExportFrameSource projectExportFrameCanvas viewportRustVideoOnlyBoundary sharedRendererExportFrameSource` は106件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-216b`。

## 2026-06-19
- Phase5のpreview診断として、Rust必須video/control-plane失敗を `fallback` ではなく `blocked` として出すようにした。
- Red: `sharedRendererPreviewPresenterController` のテストへ、`requiredVideoOwnershipUnavailable` と `requiredRustVideoControlPlaneUnavailable` が `uxfdSharedRendererPresenterStatus=blocked` になる契約を追加した。
- Green: `SharedRendererPresenterDiagnosticState` に `blocked` statusを追加し、required系失敗だけblockedとして書き出すようにした。
- 検証: `npm test -- sharedRendererPreviewPresenterController sharedRendererPresenterDiagnostics sharedRendererViewportPresenterOrchestration viewportRustVideoOnlyBoundary` は70件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-216a`。

## 2026-06-19
- Phase5のRust video-only export配線として、ViewportのRust export frame source生成にも `rustVideoOnlyEnabled` を渡すようにした。
- Red: `viewportRustVideoOnlyBoundary` のテストへ、`videoCutoverEnabled: sharedRendererVideoCutoverEnabled || rustVideoOnlyEnabled` になる契約を追加した。
- Green: `getRustExportFrameSource` のcutover gateとReact dependencyへ `rustVideoOnlyEnabled` を追加した。
- 検証: `npm test -- viewportRustVideoOnlyBoundary viewportRustExportFrameSource sharedRendererExportFrameSource` は75件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-215z`。

## 2026-06-19
- Phase5のexport fallback境界として、`SharedRendererExportFrameSourceBlockedError` のlegacy canvas fallbackを明示opt-inに変更した。
- Red: blocked error単体のテストへ、明示指定なしでは `fallbackToLegacyCanvas=false` / `legacyCanvasFallbackAllowed=false` になる契約を追加した。
- Green: blocked errorの既定値をfalseにし、互換fallbackとして残すsurface gate blockだけtrueを明示した。
- 検証: `npm test -- sharedRendererExportFrameSource projectExportFrameRenderer exportDiagnosticsLog exportProgress` は74件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-215y`。

## 2026-06-19
- Phase5のexport fallback境界として、native render source準備失敗ではRust/native render必須時のlegacy canvas fallbackを禁止するようにした。
- Red: `sharedRendererExportFrameSource` のテストへ、`prepareNativeRenderSources` が `staleDecodeResponse` を返した場合にfallback不可になる契約を追加した。
- Green: source準備一般失敗で `nativeRenderFailed` に丸める場合も、Rust/native render必須時は `legacyCanvasFallbackAllowed=false` を渡すようにした。
- 検証: `npm test -- sharedRendererExportFrameSource projectExportFrameRenderer exportDiagnosticsLog exportProgress` は73件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-215x`。

## 2026-06-19
- Phase5のexport fallback境界として、Rust video upload/ownership失敗ではlegacy canvas fallbackを禁止するようにした。
- Red: `sharedRendererExportFrameSource` のテストへ、`videoUploadFailed` と `videoOwnershipUnavailable` でfallback不可になる契約を追加した。
- Green: Rust video upload失敗、stale decode response、Pixi ownership残留、uploaded clip欠落のblocked errorに `legacyCanvasFallbackAllowed=false` を渡すようにした。
- 検証: `npm test -- sharedRendererExportFrameSource projectExportFrameRenderer exportDiagnosticsLog exportProgress` は72件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-215w`。

## 2026-06-19
- Phase5のexport fallback境界として、presented shared-frame handoff不可/失敗ではlegacy canvas fallbackを禁止するようにした。
- Red: `sharedRendererExportFrameSource` のテストへ、`presentedSharedFrameHandoffUnavailable` と `presentedSharedFrameHandoffFailed` でfallback不可になる契約を追加した。
- Green: presenter shared-frame handoff不可/失敗時の `SharedRendererExportFrameSourceBlockedError` に `legacyCanvasFallbackAllowed=false` を渡すようにした。
- 検証: `npm test -- sharedRendererExportFrameSource projectExportFrameRenderer exportDiagnosticsLog exportProgress` は72件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-215v`。

## 2026-06-19
- Phase5のexport fallback境界として、Rust native renderer bridge未接続時の `nativeRenderUnavailable` ではlegacy canvas fallbackを禁止するようにした。
- Red: `sharedRendererExportFrameSource` のテストへ、動画encode frameとencode-only frameでnative renderer未接続時にfallback不可になる契約を追加した。
- Green: `nativeRenderUnavailable` の `SharedRendererExportFrameSourceBlockedError` に `legacyCanvasFallbackAllowed=false` を渡すようにした。
- 検証: `npm test -- sharedRendererExportFrameSource projectExportFrameRenderer exportDiagnosticsLog exportProgress` は72件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-215u`。

## 2026-06-19
- Phase5のexport fallback境界として、Rust/native render必須時のunsupported native mediaではlegacy canvas fallbackを禁止するようにした。
- Red: `sharedRendererExportFrameSource` のテストへ、mixed video + unsupported overlay、media-only unsupported frameでfallback不可になる契約を追加した。
- Green: `nativeRenderUnsupportedMedia` を投げる2経路へfallback可否を渡し、Rust/native render必須時は `legacyCanvasFallbackAllowed=false` にした。
- 検証: `npm test -- sharedRendererExportFrameSource projectExportFrameRenderer exportDiagnosticsLog exportProgress sharedRendererNativeMediaSupport` は76件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-215t`。

## 2026-06-19
- Phase5のexport fallback境界として、native render sourceのrelease callback欠落ではlegacy canvas fallbackを禁止するようにした。
- Red: `sharedRendererExportFrameSource` のテストへ、`nativeRenderSourceReleaseUnavailable` でfallback不可になる契約を追加した。
- Green: release callback欠落時の `SharedRendererExportFrameSourceBlockedError` に `legacyCanvasFallbackAllowed=false` を渡すようにした。
- 検証: `npm test -- sharedRendererExportFrameSource projectExportFrameRenderer exportDiagnosticsLog exportProgress` は72件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-215s`。

## 2026-06-19
- Phase5のexport fallback境界として、native render source/output release失敗ではlegacy canvas fallbackを禁止するようにした。
- Red: `sharedRendererExportFrameSource` のテストへ、source complete release失敗、native render output release失敗、source abort release失敗でfallback不可になる契約を追加した。
- Green: `throwNativeRenderSourceReleaseFailed` / `throwNativeRenderOutputReleaseFailed` が `legacyCanvasFallbackAllowed=false` のblocked errorを投げるようにした。
- 検証: `npm test -- sharedRendererExportFrameSource projectExportFrameRenderer exportDiagnosticsLog exportProgress` は72件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-215r`。

## 2026-06-19
- Phase5のexport fallback境界として、Rust native render必須時の `nativeRenderFailed` ではlegacy canvas fallbackを禁止するようにした。
- Red: `sharedRendererExportFrameSource` のテストへ、native render bridgeが失敗/throwした動画encode frameでfallback不可になる契約を追加した。
- Green: `throwNativeRenderFailed` とrender失敗分岐へfallback可否を渡し、`effectiveNativeRenderRequired` では `legacyCanvasFallbackAllowed=false` にした。
- 検証: `npm test -- sharedRendererExportFrameSource projectExportFrameRenderer exportDiagnosticsLog exportProgress` は72件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-215q`。

## 2026-06-19
- Phase5のexport fallback境界として、`preparedNativeRenderSourceAbortReleaseFailed` ではlegacy canvas fallbackを禁止するようにした。
- Red: `sharedRendererExportFrameSource` のテストへ、該当blockが `fallbackToLegacyCanvas=false` / `legacyCanvasFallbackAllowed=false` になる契約を追加した。
- Green: prepared source abort release失敗で `SharedRendererExportFrameSourceBlockedError` を投げる時だけfallback許可をfalseにした。
- 検証: `npm test -- sharedRendererExportFrameSource projectExportFrameRenderer exportDiagnosticsLog exportProgress` は72件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-215p`。

## 2026-06-19
- Phase5のpresenter diagnosticsとして、`preparedNativeRenderSourceAbortReleaseFailed` の読みやすいlabelを追加した。
- Red: `sharedRendererPresenterDiagnostics` のテストへ、専用reasonが `prepared native render source abort release failed` labelとして出る契約を追加した。
- Green: `formatNativeRenderFailureLabel` にprepared source abort release失敗のlabelを追加した。
- 検証: `npm test -- sharedRendererPresenterDiagnostics sharedRendererPreviewPresenterController sharedRendererViewportNativeRenderUpload sharedRendererExportFrameSource` は96件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-215o`。

## 2026-06-19
- Phase5のexport frame source診断として、`preparedNativeRenderSourceAbortReleaseFailed` を `nativeRenderFailed` に丸めず保持するようにした。
- Red: `sharedRendererExportFrameSource` のテストへ、source準備がprepared source abort release失敗を返す場合にblock reasonとdataset reasonを保持する契約を追加した。
- Green: export source準備失敗の該当reasonだけ専用reasonとして `SharedRendererExportFrameSourceBlockedError` とframe diagnosticsへ渡すようにした。
- 検証: `npm test -- sharedRendererViewportNativeRenderSource sharedRendererViewportNativeRenderUpload sharedRendererExportFrameSource sharedRendererPreviewPresenterController exportDiagnosticsLog exportProgress` は120件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-215n`。

## 2026-06-19
- Phase5のpreview native render upload診断として、`preparedNativeRenderSourceAbortReleaseFailed` を `nativeRenderSourcesUnavailable` に丸めず保持するようにした。
- Red: `sharedRendererViewportNativeRenderUpload` のテストへ、source準備がprepared source abort release失敗を返すケースを追加した。
- Green: preview upload resultのreason unionに専用reasonを追加し、source準備失敗の該当reasonだけ透過するようにした。
- 検証: `npm test -- sharedRendererViewportNativeRenderSource sharedRendererViewportNativeRenderUpload sharedRendererExportFrameSource sharedRendererPreviewPresenterController` は91件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-215m`。

## 2026-06-19
- Phase5のmulti-video native render source診断として、stale frame自身のrelease失敗と先行prepared sourceのabort release失敗を分離した。
- Red: `sharedRendererViewportNativeRenderSource` のテストへ、stale frame releaseは成功し、先行prepared source abort releaseだけが失敗するケースを追加した。
- Green: prepared source abort release失敗時は `preparedNativeRenderSourceAbortReleaseFailed` を返すようにした。
- 検証: `npm test -- sharedRendererViewportNativeRenderSource sharedRendererViewportNativeRenderUpload sharedRendererExportFrameSource sharedRendererPreviewPresenterController` は90件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-215l`。

## 2026-06-19
- Phase5のnative render source stale診断として、stale decode detailへ対象 `clipId` / `mediaId` を含めるようにした。
- Red: `sharedRendererViewportNativeRenderSource` のstale job idテストで、detailに `clip=... media=...` が必要な契約へ更新した。
- Green: `buildStaleDecodedFrameDetail` がdecode requestを受け取り、stale request/job/generic detailにscopeを付けるようにした。
- 検証: `npm test -- sharedRendererViewportNativeRenderSource sharedRendererViewportNativeRenderUpload sharedRendererExportFrameSource sharedRendererPreviewPresenterController` は89件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-215k`。

## 2026-06-19
- Phase5のmulti-video native render source境界として、後続decode responseがstaleになった場合に先行prepared sourceのdecoded slotもabort releaseするようにした。
- Red: `sharedRendererViewportNativeRenderSource` のテストへ、1本目がsource化済み、2本目がstale job idを返すケースを追加した。
- Green: stale responseの返却slotをreleaseした後、関数内で作ったprepared source群の `releaseAfterNativeRenderAbort` を呼ぶようにした。
- 検証: `npm test -- sharedRendererViewportNativeRenderSource sharedRendererViewportNativeRenderUpload sharedRendererExportFrameSource sharedRendererViewportVideoUpload` は68件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-215j`。

## 2026-06-19
- Phase5のnative render source境界として、decoded frame responseの `jobId` が要求jobと異なる場合はRust native render入力へ採用しないようにした。
- Red: `sharedRendererViewportNativeRenderSource` のテストへ、別jobのdecoded frameをstale扱いにして返却slotをabort releaseする契約を追加した。
- Green: native render source準備でもstale判定を `requestId` と `jobId` の両方へ広げ、releaseには返却response側のslot leaseを使うようにした。
- 検証: `npm test -- sharedRendererViewportNativeRenderSource rustBackendVideoDecodeControl sharedRendererRustVideoUploadPipeline sharedRendererViewportVideoUpload sharedRendererViewportNativeRenderUpload sharedRendererExportFrameSource` は82件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-215i`。

## 2026-06-19
- Phase5のRust backend decode response境界として、verified decoded frameには `jobId` / `requestId` / `frameIndex` のidentityを必須にした。
- Red: `rustBackendVideoDecodeControl` のテストへ、空jobIdや欠落requestIdのresponseをshared-memory frameとして受け入れない契約を追加した。
- Green: `isRustBackendDecodedVideoFrameAvailable` でjob/request/frame identityを実行時検証し、release/stale判定の前提が壊れたresponseをcopyへ進ませないようにした。
- 検証: `npm test -- rustBackendVideoDecodeControl sharedRendererRustVideoUploadPipeline sharedRendererViewportVideoUpload sharedRendererViewportNativeRenderSource` は30件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-215h`。

## 2026-06-19
- Phase5のstale decode診断として、stale `requestId` / `jobId` で拒否されたdecoded frameにも `clipId` / `mediaId` を保持するようにした。
- Red: Viewport upload result、presenter diagnostics input、export block messageでstale decodeのclip/media idが落ちない契約を追加した。
- Green: `uploadFailed` 以外のvideo upload blockでもscopeを保持し、`staleDecodeResponse clip=... media=...` としてexport診断へ出せるようにした。
- 検証: `npm test -- sharedRendererViewportVideoUpload sharedRendererViewportPresenterOrchestration sharedRendererPresenterDiagnostics sharedRendererExportFrameSource exportDiagnosticsLog exportProgress` は100件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-215g`。

## 2026-06-19
- Phase5のshared memory copy data-plane検証として、`checksumAlgorithm: 'crc32'` のcopy reportを受けた場合にrenderer-owned upload bufferのCRC32も再計算するようにした。
- Red: `sharedVideoFrameUploadBridge` のテストへ、bridge reportは成功でもtarget buffer内容が一致しない場合にupload不可とする契約を追加した。
- Green: `prepareSharedRendererDecodedVideoFrameUpload` で `copyReportTargetChecksumMismatch` を返し、WebGPUへ渡す `Uint8Array` 自体を検証対象にした。
- 検証: `npm test -- sharedVideoFrameUploadBridge sharedRendererRustVideoUploadPipeline sharedRendererViewportVideoUpload sharedRendererViewportPresenterOrchestration sharedRendererPresenterDiagnostics sharedRendererExportFrameSource` は87件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-215f`。

## 2026-06-19
- Phase5のViewport Rust decode orchestrationとして、decoded frame responseの `jobId` が要求jobと異なる場合はcopyへ進まないようにした。
- Red: `sharedRendererViewportVideoUpload` のテストへ、別jobのverified frameをstale扱いにして返却slotをabort releaseする契約を追加した。
- Green: stale decoded frame判定を `requestId` と `jobId` の両方へ広げ、返却response側のslot leaseでreleaseするようにした。
- 検証: `npm test -- sharedRendererViewportVideoUpload sharedRendererRustVideoUploadPipeline rustBackendVideoDecodeControl` は26件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-215e`。

## 2026-06-19
- Phase5のRust backend decode verification境界として、`verification.frameIndex` / `result.frameIndex` / `frame.ptsFrame` が一致しないdecoded frameを拒否するようにした。
- Red: `rustBackendVideoDecodeControl` のテストへ、別フレームのverificationがshared-memory frameとして受理されない契約を追加した。
- Green: `isRustBackendDecodedVideoFrameAvailable` でverification frame indexも照合し、別フレームのchecksumでWebGPU uploadへ進む抜け道を塞いだ。
- 検証: `npm test -- rustBackendVideoDecodeControl sharedRendererRustVideoUploadPipeline sharedRendererViewportVideoUpload` は25件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-215d`。

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

## 2026-06-19
- Phase5のViewport boundaryとして、通常UIが `allowLegacyPixiVideo` を渡さない契約を追加した。
- Red/Green: 既存実装で契約を満たしていたため実装変更なし。`viewportRustVideoOnlyBoundary` に回帰防止テストのみ追加した。
- 検証: `npm test -- viewportRustVideoOnlyBoundary pixiVideoCutover` は15件成功。
- 版: 変更なし（`0.1.1-Beta-155a`）。

## 2026-06-19
- Phase5のvideo readiness診断として、shared renderer video cutover中もHTMLVideoElement readinessに依存しないようにした。
- Red: `viewportRustVideoOnlyBoundary` へ、`requireSharedRendererVideo` が `sharedRendererVideoCutoverEnabled || rustVideoOnlyEnabled` になる契約を追加した。
- Green: `Viewport` から `buildSharedRendererVideoMediaReadiness` へ渡す条件を更新した。
- 検証: `npm test -- viewportRustVideoOnlyBoundary sharedRendererVideoMediaReadiness sharedRendererViewportPresenterOrchestration sharedRendererPreviewPresenterController` は45件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-156a`。

## 2026-06-19
- Phase5のPixi content routingとして、`updatePixiContent` 側もshared renderer video cutover中にRust/shared renderer必須になるよう揃えた。
- Red: `viewportRustVideoOnlyBoundary` へ、Pixi content routingの `requireSharedRendererVideo` が `sharedRendererVideoCutoverEnabled || rustVideoOnlyEnabled` になる契約を追加した。
- Green: `Viewport` から `updatePixiContent` へ渡す条件を更新した。
- 検証: `npm test -- viewportRustVideoOnlyBoundary pixiVideoCutover` は16件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-157a`。

## 2026-06-19
- Phase5のvideo readiness診断として、cutover中に `videoElementsRef.current` を渡さない構造へ変更した。
- Red: `viewportRustVideoOnlyBoundary` へ、readiness診断ブロックが `videoElements:` を含まない契約を追加した。
- Green: `buildSharedRendererVideoMediaReadiness` の `videoElements` 入力を任意化し、ViewportからのDOM Map受け渡しを削除した。
- 検証: `npm test -- viewportRustVideoOnlyBoundary sharedRendererVideoMediaReadiness` は10件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-158a`。

## 2026-06-19
- Phase5のpresenter orchestrationとして、shared renderer video cutover中もRust/shared renderer動画必須でpresenterを起動するよう揃えた。
- Red: `viewportRustVideoOnlyBoundary` へ、`startSharedRendererViewportPresenter` の `requireSharedRendererVideo` が `sharedRendererVideoCutoverEnabled || rustVideoOnlyEnabled` になる契約を追加した。
- Green: `Viewport` のpresenter起動引数を更新した。
- 検証: `npm test -- viewportRustVideoOnlyBoundary sharedRendererViewportPresenterOrchestration` は17件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-159a`。

## 2026-06-19
- Phase5のViewport通常経路から、legacy Pixi動画用の `HTMLVideoElement` MapとVideoFrameTexture Mapの所有を削除した。
- Red: `viewportRustVideoOnlyBoundary` へ、Viewportが `videoElementsRef` / `videoFrameTexturesRef` / Pixi動画upload helper / `videoElements:` / `videoFrameTextures:` を含まない契約を追加した。
- Green: `Viewport` から該当Ref、cleanup、`updatePixiContent` へのMap受け渡しを削除し、`pixiRenderHelper` のlegacy動画Map入力を任意化した。
- 検証: `npm test -- viewportRustVideoOnlyBoundary pixiVideoCutover videoElementForPixi` は29件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-160a`。

## 2026-06-19
- Phase5のPixi動画fallback削除として、`pixiRenderHelper` からHTMLVideoElement生成、Pixi VideoSource生成、VideoFrameTexture更新、動画シーク同期の実装を削除した。
- Red: `viewportRustVideoOnlyBoundary` へ、`pixiRenderHelper` が `document.createElement('video')` / `new PIXI.VideoSource` / `ensureVideoFrameTextureState` / `drawVideoFrameToTexture` / `shouldReplacePixiVideoElementSource` を含まない契約を追加した。
- Green: `updatePixiContent` の動画分岐をshared renderer専有とexport override bitmap反映だけに簡素化した。
- 検証: `npm test -- viewportRustVideoOnlyBoundary pixiVideoCutover` は19件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-161a`。

## 2026-06-19
- Phase5のPixi動画cutoverとして、`allowLegacyPixiVideo` opt-in、`pixiVideoElement` path、`clearPixiVideoForSharedRenderer` を削除した。
- Red: `pixiVideoCutover` を、staleな `allowLegacyPixiVideo` 入力があっても `sharedRendererOnly` を返す契約へ更新した。
- Green: `ResolvePixiVideoRenderPathInput` と `PixiVideoRenderPath` からlegacy pathを削除し、不要になったHTMLVideoElement/VideoFrameTexture cleanup helperを外した。
- 検証: `npm test -- pixiVideoCutover viewportRustVideoOnlyBoundary` は18件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-162a`。

## 2026-06-19
- Phase5のhelper整理として、export overlay cleanupをPixi動画helperから独立させ、`videoElementForPixi.ts` を削除した。
- Red: `exportOverlayCanvases.test` を追加し、Viewportが `videoElementForPixi` をimportしない境界を追加した。旧 `videoElementForPixi.test` は削除した。
- Green: `destroyExportOverlayCanvases` を `exportOverlayCanvases.ts` へ移し、Viewport importを更新した。
- 検証: `npm test -- exportOverlayCanvases viewportRustVideoOnlyBoundary pixiVideoCutover` は19件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-163a`。

## 2026-06-19
- Phase5のlegacy provider隔離として、`PlaybackFrameProvider` と `FrameProvider` をproduction `src/utils` から `src/exportTest` へ移動した。
- Red: `useProjectExportBoundary` へ、`src/utils/playbackFrameProvider.ts` と `src/utils/frameProvider.ts` が存在しない契約を追加した。
- Green: export test harnessのimportを `./playbackFrameProvider` へ更新し、providerコメントも比較・診断用途に限定した。
- 検証: `npm test -- useProjectExportBoundary` は9件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-164a`。

## 2026-06-19
- Phase5のvideo readiness診断として、HTMLVideoElement readyState入力を削除し、Rust/shared renderer必須診断へ一本化した。
- Red: `sharedRendererVideoMediaReadiness` をDOM非依存契約へ更新し、Viewportが `requireSharedRendererVideo` を渡さない境界へ変更した。
- Green: `buildSharedRendererVideoMediaReadiness` から `videoElements` と `requireSharedRendererVideo` を削除し、動画mediaを常に `rustRendererRequired` として数えるようにした。
- 検証: `npm test -- sharedRendererVideoMediaReadiness viewportRustVideoOnlyBoundary` は12件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-165a`。

## 2026-06-19
- Phase5のexport frame planning整理として、`projectExportFrameCanvas` からlegacy browser video pause helperとHTMLVideoElement pause型を削除した。
- Red: `projectExportFrameCanvas` へ、`pauseLegacyBrowserVideosForExport` / `ProjectExportBrowserVideoElement` / `Pick<HTMLVideoElement, 'pause'>` を含まない契約を追加した。
- Green: 該当helperと型を削除した。
- 検証: `npm test -- projectExportFrameCanvas useProjectExportBoundary` は31件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-166a`。

## 2026-06-19
- Phase5のmetadata取得として、動画metadataからHTMLVideoElement fallbackを削除し、Rust/Electron `probe-media` 結果を正本にした。
- Red: `mediaMetadata` へ、`document.createElement('video')` / `loadVideoElementMetadata` を含まない契約を追加し、merge契約をRust probe単独へ更新した。
- Green: `loadVideoElementMetadata` を削除し、`resolveVideoMetadata` が `probeMediaWithRust` の結果だけを `mergeResolvedVideoMetadata` に渡すよう変更した。
- 検証: `npm test -- mediaMetadata` は11件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-167a`。

## 2026-06-19
- Phase5のexport frame plan整理として、browser video provider / HTMLVideoElement seek fallbackを表す古いflagを削除した。
- Red: `projectExportFrameCanvas` へ、`requiresLegacyBrowserVideoProviders` / `requiresHtmlVideoElementSeekFallback` を含まない契約を追加し、期待値から古いflagを外した。
- Green: `ProjectExportFrameSourcePlanResult` と `ProjectExportFrameRuntimePlan` から該当flagを削除した。
- 検証: `npm test -- projectExportFrameCanvas useProjectExportBoundary` は31件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-168a`。

## 2026-06-19
- Phase5のproduction動画依存境界として、`src/exportTest` とテストファイルを除く実装にブラウザ/Pixi動画fallbackトークンが戻らないテストを追加した。
- Red: `productionVideoDependencyBoundary` を追加し、`videoDecodeStream` の旧HTMLVideoElementコメントで失敗することを確認した。
- Green: `videoDecodeStream` のコメントをDOM動画要素名に依存しない表現へ整理した。
- 検証: `npm test -- productionVideoDependencyBoundary mediaMetadata projectExportFrameCanvas viewportRustVideoOnlyBoundary` は44件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-169a`。

## 2026-06-19
- Phase5のRust backend decode data-plane境界として、decoded frame responseがJSON pixel payloadを混入していた場合はshared renderer uploadへ進めないようにした。
- Red: `rustBackendVideoDecodeControl` へ、descriptorと同時に `bytes` / `pixels` / `frameBase64` が混ざったresponseを拒否する契約を追加した。
- Green: decoded frame availability判定に `bytes` / `pixels` / `frameBase64` / `rgbaBytes` の再帰検出を追加し、descriptor-only responseだけを利用可能にした。
- 検証: `npm test -- rustBackendVideoDecodeControl sharedRendererRustVideoUploadPipeline` は8件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-169b`。

## 2026-06-19
- Phase5のRust backend decode descriptor境界として、shared memory layoutとして不正なdecoded frame descriptorをTS bridge側でも拒否するようにした。
- Red: `rustBackendVideoDecodeControl` へ、空 `memoryId`、短すぎる `strideBytes`、`byteLen !== strideBytes * height` を拒否する契約を追加した。
- Green: availability判定にdescriptor layout検証を追加し、正の整数、256 byte row alignment、RGBA8 row byte長、slot byte長を確認するようにした。
- 検証: `npm test -- rustBackendVideoDecodeControl sharedRendererRustVideoUploadPipeline` は9件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-170a`。

## 2026-06-19
- Phase5のshared frame copy境界として、descriptorが宣言されたring layout外を指す場合はnative copy bridgeへ進まないようにした。
- Red: `rustBackendVideoDecodeControl` に `byteOffset !== byteLen * slotIndex` 拒否契約を追加し、`sharedVideoFrameUploadBridge` に `slotIndex >= slotCount` でcopyしない契約を追加した。
- Green: decoded frame descriptor検証にslot offset一致を追加し、upload bridgeで `slotCount`、ring byte長、slot範囲を確認するようにした。
- 検証: `npm test -- rustBackendVideoDecodeControl sharedVideoFrameUploadBridge sharedRendererRustVideoUploadPipeline sharedRendererViewportNativeRenderUpload` は18件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-171a`。

## 2026-06-19
- Phase5のshared frame copy data-plane整理として、Electron contextBridge互換の `rgbaBytes` 戻り値fallbackを削除した。
- Red: `sharedVideoFrameUploadBridge` の既存テストを、copy reportがpixel bytesを返した場合は拒否する契約へ反転した。
- Green: `SharedVideoFrameCopyReport` / `window.sharedVideoFrame.copyIntoUploadBuffer` の戻り値型から `rgbaBytes` を削除し、runtime混入時も `copyReportContainsPixelPayload` でblockedにした。
- 検証: `npm test -- sharedVideoFrameUploadBridge sharedRendererRustVideoUploadPipeline sharedRendererViewportNativeRenderUpload sharedRendererViewportVideoUpload` は17件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-172a`。

## 2026-06-19
- Phase5のElectron preload境界として、`copyIntoUploadBuffer` が `result.rgbaBytes` を注入して返す互換fallbackを削除した。
- Red: `sharedVideoFrameUploadBridgeBoundary` を追加し、`electron/preload.ts` が `rgbaBytes: target` を公開しない契約を追加した。
- Green: preloadの `SharedVideoFrameCopyResult` から `rgbaBytes` を削除し、native bridgeのcopy reportをそのまま返すようにした。
- 検証: `npm test -- sharedVideoFrameUploadBridgeBoundary sharedVideoFrameUploadBridge sharedRendererRustVideoUploadPipeline sharedRendererViewportNativeRenderUpload sharedRendererViewportVideoUpload` は18件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-173a`。

## 2026-06-19
- Phase5のshared memory slot ownershipとして、copy bridge payloadに `slotIndex` / `generation` を通すようにした。
- Red: `shared-memory-spike` にread結果のslot index契約を追加し、`shared-video-frame-bridge` にpayload slotと実slotが違う場合の拒否契約を追加した。TS側にもcopy payload/reportのslot lease契約を追加した。
- Green: `MappedReadFrame` / Rust bridge report / N-API wrapper / preload型 / renderer helper payloadへslot leaseを接続し、Rust bridgeで `SlotLeaseMismatch` を返すようにした。
- 検証: `npm test -- sharedVideoFrameUploadBridge sharedRendererRustVideoUploadPipeline sharedVideoFrameUploadBridgeBoundary sharedRendererViewportNativeRenderUpload sharedRendererViewportVideoUpload` は18件成功。`cargo test --manifest-path shared-video-frame-bridge-node/Cargo.toml`、`cargo test --manifest-path shared-video-frame-bridge/Cargo.toml --test copy_into_upload_buffer`、`cargo test --manifest-path shared-memory-spike/Cargo.toml posix_shm_multi_slot_allows_next_frame_while_previous_frame_is_reading` は成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-174a`。

## 2026-06-19
- Phase5のrenderer upload境界として、copy reportの `slotIndex` / `generation` がdecoded frame descriptorと違う場合はupload成功にしないようにした。
- Red: `sharedVideoFrameUploadBridge` へ、copy report slot lease mismatchを拒否する契約を追加した。
- Green: `prepareSharedRendererDecodedVideoFrameUpload` でcopy reportのslot leaseをdescriptorと照合し、mismatch時は `copyReportSlotLeaseMismatch` を返すようにした。
- 検証: `npm test -- sharedVideoFrameUploadBridge sharedRendererRustVideoUploadPipeline sharedRendererViewportNativeRenderUpload sharedRendererViewportVideoUpload` は19件成功。対象ファイル名で絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-174b`。

## 2026-06-19
- Phase5のdecode data-plane ownershipとして、POSIX shared memory releaseを `slotIndex` 指定にした。
- Red: `shared-memory-spike` のmulti-slot testを、second slotを先にreleaseして同じslotを再利用する契約へ強化した。`rust-backend` integrationもcontrol-plane slotとdata-plane slotが同じslotを再利用する契約へ強化した。
- Green: `PosixSharedRing::release_frame_slot` を追加し、Rust backendの `release_decode_data_plane` がdecode release payloadの `slotIndex` を渡すようにした。
- 検証: `cargo test --manifest-path rust-backend/Cargo.toml --test decode_control_plane decode_request_frame_uses_second_shared_memory_slot_while_first_slot_is_reading -- --nocapture`、`cargo test --manifest-path shared-memory-spike/Cargo.toml posix_shm_multi_slot_allows_next_frame_while_previous_frame_is_reading` は成功。
- 版: `0.1.1-Beta-175a`。

## 2026-06-19
- Phase5のRust video-only境界として、video control-planeがRust/WASMで解決できない場合はTypeScript fallbackへ戻らないようにした。
- Red: `sharedRendererPreviewPresenterController` に `requireRustVideoControlPlane` 時のfail-loud契約を追加し、`viewportRustVideoOnlyBoundary` にViewportが `rustVideoOnlyEnabled` を渡す契約を追加した。
- Green: presenter / viewport orchestration / Viewportに `requireRustVideoControlPlane` を接続し、Rust video-onlyでは `requiredRustVideoControlPlaneUnavailable` を返すようにした。
- 検証: `npm test -- sharedRendererPreviewPresenterController viewportRustVideoOnlyBoundary` は39件成功。対象ファイルパスで絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-176a`。

## 2026-06-19
- Phase5のmulti-video upload ownershipとして、後続動画upload失敗時に先行成功slotもabort releaseするようにした。
- Red: `sharedRendererViewportVideoUpload` に、2本目copy失敗時も1本目の `releaseVideoDecodeFrame(copyOutState=rendererUploadAborted)` が呼ばれる契約を追加した。
- Green: `prepareSharedRendererViewportVideoUploads` がstart / decode / stale response / upload失敗で戻る前に、準備済みupload objectの `releaseAfterUploadAbort` を順に呼ぶようにした。
- 検証: `npm test -- sharedRendererViewportVideoUpload sharedRendererRustVideoUploadPipeline sharedVideoFrameUploadBridge` は16件成功。対象ファイルパスで絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-177a`。

## 2026-06-19
- Phase5のexport boundaryとして、旧base64 `start-export` / `write-frame` / `end-export` と Rust backend `export.*` RPCを削除した。
- Red: `legacyBase64ExportBoundary` を追加し、Electron main / Rust backend / Cargo.toml に旧base64 export tokenが残らない契約を追加した。
- Green: Electron mainから旧export IPC handlerを削除し、Rust backendから `export.start` / `export.write_frame` / `export.end`、旧 `ExportSession`、`base64` dependencyを削除した。
- 検証: `npm test -- legacyBase64ExportBoundary rustVideoEncodeBackendBridge rustVideoEncodeIpcChannels` は6件成功。`cargo test --manifest-path rust-backend/Cargo.toml --test decode_control_plane encode_shared_frame_session_tracks_descriptor_without_legacy_base64_fallback` と `cargo test --manifest-path rust-backend/Cargo.toml --no-run` は成功。対象テストファイルで絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-178a`。

## 2026-06-19
- Phase5のexport hook境界として、`useProjectExport` が `PIXI.Application` refを直接受け取らないようにした。
- Red: `useProjectExportBoundary` を追加し、hookが `pixi.js` import / `PIXI.Application` / `pixiAppRef` を含まず、Viewportが `getExportCanvas` providerを渡す契約を追加した。
- Green: `useProjectExport` の引数から `pixiAppRef` を削除し、frame source planとruntime canvas resolveを `getExportCanvas` providerだけで行うようにした。
- 検証: `npm test -- useProjectExportBoundary projectExportFrameCanvas` は33件成功。対象ファイルパスで絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-179a`。

## 2026-06-19
- Phase5のexport frame canvas境界として、`projectExportFrameCanvas` のpublic APIから `pixiCanvas` 名を削除した。
- Red: `projectExportFrameCanvas` に、export frame source boundaryがPixi固有のcanvas API名を露出しない契約を追加した。
- Green: `ResolveProjectExportFrameCanvasInput` とcanvas sourceを `legacyCanvas` へ変更し、既存のfallback意味をPixi固有名から一般化した。
- 検証: `npm test -- projectExportFrameCanvas useProjectExportBoundary` は34件成功。対象ファイルパスで絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-180a`。

## 2026-06-19
- Phase5のexport hook境界として、legacy canvas captureを `useProjectExport` 本体からadapterへ隔離した。
- Red: `useProjectExportBoundary` に、hook本体が `createImageBitmap` を直接呼ばない契約を追加した。
- Green: `projectExportLegacyCanvasCapture` を追加し、互換canvas frame captureを `captureProjectExportLegacyCanvasFrame` 経由にした。
- 検証: `npm test -- useProjectExportBoundary projectExportFrameCanvas` は35件成功。対象ファイルパスで絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-181a`。

## 2026-06-19
- Phase5のexport hook境界として、WebCodecs/mp4-muxer互換encoderのdynamic importをadapterへ隔離した。
- Red: `useProjectExportBoundary` を更新し、hookが `videoExportPipeline` を直接dynamic importせず、互換adapterだけが読み込む契約へ変更した。
- Green: `projectExportCompatibilityEncoder` を追加し、`useProjectExport` は `encodeProjectExportCompatibilityVideo` を呼ぶだけにした。
- 検証: `npm test -- useProjectExportBoundary` は12件成功。対象ファイルパスで絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-182a`。

## 2026-06-19
- Phase5のexport計画境界として、`projectExportEncodePlan` / `projectExportFrameCanvas` のpolicy入力から `rustVideoOnly` を削除した。
- Red: それぞれのsource境界テストに、export encode / frame source policyが `rustVideoOnly` を露出しない契約を追加した。
- Green: `useProjectExport` から `rustVideoOnly` のexport計画受け渡しを削除し、動画exportのRust必須判定を `hasVideoObjects` に一本化した。
- 検証: `npm test -- projectExportEncodePlan projectExportFrameCanvas useProjectExportBoundary` は43件成功。対象ファイルパスで絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-183a`。

## 2026-06-19
- Phase5のcompatibility export境界として、WebCodecs/mp4-muxer互換encoderを非動画export専用に固定した。
- Red: `projectExportCompatibilityEncoder` に、`hasVideoObjects` がtrueの入力はWebCodecs互換encoderをloadする前に拒否する契約を追加した。
- Green: `projectExportCompatibilityEncoder` の入力へ `hasVideoObjects` を追加し、`useProjectExport` から実際の動画object有無を渡すようにした。
- 検証: `npm test -- projectExportCompatibilityEncoder useProjectExportBoundary projectExportEncodePlan projectExportFrameCanvas` は44件成功。対象ファイルパスで絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-184a`。

## 2026-06-19
- Phase5のcompatibility export境界として、互換encoder入力の `hasVideoObjects` sentinelを必須化した。
- Red: `projectExportCompatibilityEncoder` のsource境界テストに、`hasVideoObjects` がoptionalではなく必須booleanである契約を追加した。
- Green: `ProjectExportCompatibilityEncodeInput` の `hasVideoObjects` を必須booleanに変更し、呼び出し側のsentinel渡し忘れを型で検出できるようにした。
- 検証: `npm test -- projectExportCompatibilityEncoder useProjectExportBoundary projectExportEncodePlan projectExportFrameCanvas` は45件成功。対象ファイルパスで絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-184b`。

## 2026-06-19
- Phase5のexport hook境界として、`useProjectExport` の公開引数から旧VideoDecoder/Pixi注入用の `exportFrameOverridesRef` を削除した。
- Red: `useProjectExportBoundary` に、Viewportが `useProjectExport(renderScene, getExportCanvas, getRustExportFrameSource)` を呼び、hook本体が `exportFrameOverridesRef` を含まない契約を追加した。
- Green: `useProjectExport` の引数・dependency・clear処理から `exportFrameOverridesRef` を削除し、Viewportの呼び出しを3引数にした。
- 検証: `npm test -- useProjectExportBoundary projectExportCompatibilityEncoder projectExportEncodePlan projectExportFrameCanvas` は45件成功。対象ファイルパスで絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-185a`。

## 2026-06-19
- Phase5のPixi video cutover境界として、旧VideoDecoder/Pixi bitmap override経路を削除した。
- Red: `pixiVideoCutover` に、`exportFrameOverride` / `hasExportFrameOverride` を公開しない契約を追加した。
- Green: `pixiVideoCutover` のoverride入力・戻り値を削除し、`pixiRenderHelper` / Viewportから `exportFrameOverrides` とoverlay canvas cacheを外した。
- 検証: `npm test -- pixiVideoCutover useProjectExportBoundary projectExportCompatibilityEncoder projectExportEncodePlan projectExportFrameCanvas` は54件成功。対象ファイルパスで絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-186a`。

## 2026-06-19
- Phase5のPixi video cutover後始末として、旧overlay canvas utilityをproduction utilsから削除した。
- Red: `useProjectExportBoundary` に、`exportOverlayCanvases.ts` が存在しない契約を追加した。
- Green: 未使用になった `src/utils/exportOverlayCanvases.ts` と専用テストを削除した。
- 検証: `npm test -- useProjectExportBoundary pixiVideoCutover` は22件成功。対象ファイルパスで絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-186b`。

## 2026-06-19
- Phase5のPixi video cutover境界として、export中の動画もPixi所有へ戻らないようにした。
- Red: `pixiVideoCutover` に、`isExporting=true` のvideo objectも `shouldSkipPixiVideoForSharedRenderer` がtrueを返す契約を追加した。
- Green: `shouldSkipPixiVideoForSharedRenderer` をvideo objectなら常にtrueにし、preview/exportの分岐を削除した。
- 検証: `npm test -- pixiVideoCutover useProjectExportBoundary projectExportCompatibilityEncoder projectExportEncodePlan projectExportFrameCanvas` は55件成功。対象ファイルパスで絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-187a`。

## 2026-06-19
- Phase5のPixi video cutover境界として、動画所有判定の公開入力を `objectType` だけに縮約した。
- Red: `pixiVideoCutover` のsource境界テストに、`isExporting` / `sharedRendererVideoObjectIds` / `requireSharedRendererVideo` を公開しない契約を追加した。
- Green: `ShouldSkipPixiVideoForSharedRendererInput` から旧制御入力を削除し、`pixiRenderHelper` の呼び出しも `objectType` のみにした。
- 検証: `npm test -- pixiVideoCutover useProjectExportBoundary projectExportCompatibilityEncoder projectExportEncodePlan projectExportFrameCanvas` は56件成功。対象ファイルパスで絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-187b`。

## 2026-06-19
- Phase5のViewport/Pixi content routing境界として、旧video ownership gateの受け渡しを削除した。
- Red: `viewportRustVideoOnlyBoundary` に、`updatePixiContent` 呼び出しが `sharedRendererVideoObjectIds` / `requireSharedRendererVideo` を含まず、Viewportが `sharedRendererVideoObjectIdsRef` / `updateSharedRendererVideoObjectIds` を持たない契約を追加した。
- Green: Viewportからvideo ownership id ref / update callback / `updatePixiContent` へのvideo gate渡しを削除し、`pixiRenderHelper` のresources型からも外した。
- 検証: `npm test -- viewportRustVideoOnlyBoundary pixiVideoCutover useProjectExportBoundary projectExportCompatibilityEncoder projectExportEncodePlan projectExportFrameCanvas` は67件成功。対象ファイルパスで絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-188a`。

## 2026-06-19
- Phase5のproduction video dependency境界として、WebCodecs向けH.264中間ファイル自動生成hookを削除した。
- Red: `productionVideoDependencyBoundary` に `useMediaOptimization` / `check-intermediate` / `generate-intermediate` / `cancel-intermediate` をproduction src禁止語として追加した。
- Green: `useAppLogic` から `useMediaOptimization` のimport/callを削除し、未参照になった `src/hooks/useMediaOptimization.ts` を削除した。
- 検証: `npm test -- productionVideoDependencyBoundary viewportRustVideoOnlyBoundary pixiVideoCutover useProjectExportBoundary projectExportCompatibilityEncoder projectExportEncodePlan projectExportFrameCanvas` は68件成功。対象ファイルパスで絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-189a`。

## 2026-06-19
- Phase5のElectron boundaryとして、旧WebCodecs intermediate IPCを削除した。
- Red: `legacyBase64ExportBoundary` に `check-intermediate` / `generate-intermediate` / `cancel-intermediate` / `intermediate-progress` / `intermediateCachePath` がElectron/Rust production境界へ残らない契約を追加した。
- Green: `electron/main.ts` から旧intermediate cache path、生成中process state、`check-intermediate` / `generate-intermediate` / `cancel-intermediate` handlerを削除した。
- 検証: `npm test -- legacyBase64ExportBoundary productionVideoDependencyBoundary` は2件成功。対象ファイルパスで絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-190a`。

## 2026-06-19
- Phase5のproduction video dependency境界として、WebCodecs decode streamをexport testへ隔離した。
- Red: `productionVideoDependencyBoundary` に `new VideoDecoder` / `VideoDecoder.isConfigSupported` / `from 'mp4box'` / `decodeVideoStream` をproduction src禁止語として追加した。
- Green: `src/utils/videoDecodeStream.ts` を `src/exportTest/videoDecodeStream.ts` へ移し、`exportTestHarness` のimportを更新した。production起動時の `VideoDecoder.isConfigSupported` probeも `src/main.tsx` から削除した。
- 検証: `npm test -- productionVideoDependencyBoundary legacyBase64ExportBoundary` は2件成功。対象ファイルパスで絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-191a`。

## 2026-06-19
- Phase5のpresenter control境界として、preview/export orchestrationからWebGPU readback公開口を削除した。
- Red: `sharedRendererPreviewPresenterController` に、ready presenter controlが `readPresentedFrameRgbaBytes` を公開しない契約を追加した。
- Green: `SharedRendererPreviewPresenterControl` 型と返却objectから `readPresentedFrameRgbaBytes` を削除し、公開frame取得口を `takePresentedFrameSharedFrame` に絞った。
- 検証: `npm test -- sharedRendererPreviewPresenterController sharedRendererExportFrameSourceBoundary sharedRendererWebGpuPresenter` は49件成功。対象ファイルパスで絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-192a`。

## 2026-06-19
- Phase5のexport計画境界として、動画object有無のsentinelを必須入力にした。
- Red: `projectExportFrameCanvas` / `projectExportEncodePlan` に、`hasVideoObjects` がoptionalでも既定falseでもない契約を追加した。
- Green: encode plan / frame source policy / frame source planの入力型から `hasVideoObjects?: boolean` と `hasVideoObjects = false` を削除し、非動画ケースも呼び出し側で明示するようにした。
- 検証: `npm test -- projectExportFrameCanvas projectExportEncodePlan useProjectExportBoundary projectExportCompatibilityEncoder` は48件成功。対象ファイルパスで絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-193a`。

## 2026-06-19
- Phase5のViewport Rust export frame source境界として、動画exportではRust cutoverを実効有効化するようにした。
- Red: `viewportRustExportFrameSource` に、`videoCutoverEnabled=false` でも動画objectを含むexportならRust export sourceを作り、下流へ `videoCutoverEnabled: true` を渡す契約を追加した。
- Green: `resolveViewportRustExportFrameSource` で `videoCutoverEnabled || hasVideoObjects(objects)` を実効cutover条件にし、動画exportではencode-only / native render requiredを維持した。
- 検証: `npm test -- viewportRustExportFrameSource projectExportFrameCanvas projectExportEncodePlan useProjectExportBoundary` は60件成功。対象ファイルパスで絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-194a`。

## 2026-06-19
- Phase5のRust export source境界として、動画object有無のsentinelをViewport export sourceへ明示的に渡すようにした。
- Red: `projectExportFrameCanvas` / `viewportRustExportFrameSource` に、`ProjectExportRustFrameSourceContext` と `BuildViewportRustExportFrameSourceInput` が `hasVideoObjects` を持ち、optional `objects` から推測しない契約を追加した。
- Green: `resolveProjectExportRustFrameSourceContext` が `hasVideoObjects` を返し、Viewportが `buildViewportRustExportFrameSource` へ渡すようにした。`viewportRustExportFrameSource` から `objects?.some` 推測helperを削除した。
- 検証: `npm test -- projectExportFrameCanvas viewportRustExportFrameSource useProjectExportBoundary projectExportEncodePlan projectExportCompatibilityEncoder` は63件成功。対象ファイルパスで絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-195a`。

## 2026-06-19
- Phase5のViewport export surface gateとして、shared renderer export surfaceを既定ONにした。
- Red: `viewportRustVideoOnlyBoundary` に、`VITE_UXFD_SHARED_RENDERER_EXPORT !== '0'` を期待する境界契約を追加した。
- Green: `Viewport` の `sharedRendererExportEnabled` を `=== '1'` から `!== '0'` に変更し、動画exportが実験flag未指定でRust surfaceを失わないようにした。
- 検証: `npm test -- viewportRustVideoOnlyBoundary sharedRendererSurfaceMount viewportRustExportFrameSource useProjectExportBoundary` は42件成功。対象ファイルパスで絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-196a`。

## 2026-06-19
- Phase5のpresenter orchestration test fixture整理として、WebGPU readback再接続口を削除した。
- Red: `sharedRendererExportFrameSourceBoundary` に、`sharedRendererViewportPresenterOrchestration.test.ts` が `readPresentedFrameRgbaBytes` を含まない契約を追加した。
- Green: orchestration testの `SharedRendererPreviewPresenterControl` fixtureから `readPresentedFrameRgbaBytes` を削除し、`SharedVideoFrameCopyReport` fixtureに現在のslot/generationを明示した。
- 検証: `npm test -- sharedRendererExportFrameSourceBoundary sharedRendererViewportPresenterOrchestration sharedRendererPreviewPresenterController` は43件成功。対象ファイルパスで絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-196b`。

## 2026-06-19
- Phase5のdecoded video upload ownershipとして、Rust backend decoded slotのrelease callbackを単回化した。
- Red: `sharedRendererRustVideoUploadPipeline` に、`releaseAfterGpuUpload` / `releaseAfterUploadAbort` / 再度GPU releaseが続いても `releaseVideoDecodeFrame` は1回だけ呼ばれる契約を追加した。
- Green: `prepareSharedRendererRustDecodedVideoUpload` のrelease callbackを `createSingleUseDecodedFrameReleaser` で共有し、最初に確定した `copyOutState` だけをRust backendへ送るようにした。
- 検証: `npm test -- sharedRendererRustVideoUploadPipeline` は4件成功。対象ファイルパスで絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-197a`。

## 2026-06-19
- Phase5のdecoded video upload ownershipとして、native copy bridge例外時のslot解放漏れを塞いだ。
- Red: `sharedRendererRustVideoUploadPipeline` に、`copyIntoUploadBuffer` がthrowしてもdecoded slotを `rendererUploadAborted` でreleaseする契約を追加した。
- Green: `prepareSharedRendererRustDecodedVideoUpload` がcopy例外をcatchしてabort release後に元の例外を再throwし、single-use releaserはnative render側と同じPromise共有型に揃えた。
- 検証: `npm test -- sharedRendererRustVideoUploadPipeline sharedVideoFrameUploadBridge sharedRendererViewportVideoUpload` は18件成功。対象ファイルパスで絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-197b`。

## 2026-06-19
- Phase5のexport canvas境界整理として、Viewportのexport canvas providerからPixi固有命名を外した。
- Red: `viewportRustVideoOnlyBoundary` に、`getExportCanvas` ブロックが `pixiCanvas` を含まない契約を追加した。
- Green: `Viewport` の局所変数を `legacyExportCanvas` に変更し、export hookへ渡るcanvas fallbackをPixi固有名で扱わないようにした。
- 検証: `npm test -- viewportRustVideoOnlyBoundary` は13件成功。対象ファイルパスで絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-197c`。

## 2026-06-19
- Phase5のproduction video dependency境界として、Electron mainからVideoDecoder検証専用proxy IPCを削除した。
- Red: `productionVideoDependencyBoundary` に、`electron/main.ts` が `resolve-4k-proxy-video` / `VideoDecoder テスト用` / `GX010052.proxy.mp4` を含まない契約を追加した。
- Green: `electron/main.ts` から `resolve-4k-proxy-video` handlerを削除し、WebCodecs診断用H.264 proxy resolverをproduction IPCへ戻さないようにした。
- 検証: `npm test -- productionVideoDependencyBoundary legacyBase64ExportBoundary` は3件成功。対象ファイルパスで絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-198a`。

## 2026-06-19
- Phase5のproduction video dependency境界として、Electron mainからbrowser動画codec強制flagを削除した。
- Red: `productionVideoDependencyBoundary` に、`UseChromeOSDirectVideoDecoder` / `VideoToolboxVideoCodecFactory` / `VaapiVideoDecoder` / `VaapiVideoEncoder` / `WebCodecs` が `electron/main.ts` に戻らない契約を追加した。
- Green: Electron起動flagをWebGPU / GPU raster用途に整理し、browser動画decode/encode featureの強制有効化を外した。
- 検証: `npm test -- productionVideoDependencyBoundary legacyBase64ExportBoundary` は4件成功。対象ファイルパスで絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-199a`。

## 2026-06-19
- Phase5のRust export frame source ownershipとして、blocked時とfinally時の二重closeを防いだ。
- Red: `projectExportFrameCanvas` にsingle-use closer契約を追加し、`useProjectExportBoundary` にhookが `frameSource.close?.()` を直接呼ばない契約を追加した。
- Green: `createSingleUseProjectExportFrameSourceCloser` を追加し、`useProjectExport` のblocked cleanup / final cleanupを同じcloser経由にした。
- 検証: `npm test -- projectExportFrameCanvas useProjectExportBoundary` は39件成功。対象ファイルパスで絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-199b`。

## 2026-06-20
- Phase5の前進方針として、後方互換の診断追加に偏らず、Rustで実際に描ける表現を増やす進め方へ切り替えた。
- Red: `rustSceneSnapshot` / `sharedRendererNativeMediaSupport` / `rust-core` media schemaに、グラデーション矩形を `GeneratedGradient` mediaとして扱う契約を追加した。
- Green: `GeneratedGradient` をTS/Rust境界へ追加し、Rust backend `render.nativeSharedFrame` がグラデーション定義JSONからRGBA source frameを生成するようにした。
- Rust native render経路でSolidColour/Image/PSDに加え、グラデーション矩形もPixiから降ろせる候補に入った。
- 検証: `npm test -- rustSceneSnapshot sharedRendererNativeMediaSupport sharedRendererPreviewSurface sharedRendererExportSession` は25件成功。`cargo test` は `rust-core` 34件、`rust-backend` 28件成功。対象ファイルパスで絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-216x`。

## 2026-06-20
- Phase5のGeneratedGradient native render ownershipとして、Rust native render済みのグラデーション矩形をPixi shape描画から降ろせるようにした。
- Red: `sharedRendererPreviewPresenterController` に、native render frame ready時のGeneratedGradientが `solidColourOwnership.solidColourObjectIds` へ入る契約を追加した。
- Red: `sharedRendererSolidColourOwnership` に、前面GeneratedGradientがshared-renderer paint候補なら背面SolidColourのcutoverを塞がない契約を追加した。
- Green: presenterのsolid paint判定を `SolidColour` / `GeneratedGradient` の両方へ広げ、z-order safetyでも同じ扱いにした。
- 検証: `npm test -- sharedRendererPreviewPresenterController sharedRendererSolidColourOwnership pixiSolidColourCutover` は48件成功。対象ファイルパスで絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-216y`。

## 2026-06-20
- Phase5のmulti-video native render source ownershipとして、後続video decode失敗時も準備済みsourceをabort releaseするようにした。
- Red: `sharedRendererViewportNativeRenderSource` に、2本目video decode request失敗時に1本目decoded sourceが `rendererUploadAborted` で解放される契約を追加した。
- Green: decode start失敗、decode request失敗、decoded frame未返却の各分岐で、先に準備済みのnative render sourceをabort releaseしてから戻るようにした。
- Rust decode slotを保持したまま次フレームやfallbackへ進むリスクを減らし、multi-video native renderの再試行性を上げた。
- 検証: `npm test -- sharedRendererViewportNativeRenderSource sharedRendererViewportNativeRenderUpload sharedRendererExportFrameSource` は68件成功。対象ファイルパスで絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-216z`。
- 追加検証: `npm test -- sharedRendererViewportNativeRenderSource -t "decode start fails"` を実行し、decode start失敗時のprepared source abort release failure契約も固定した。挙動変更なしのため版は据え置き。

## 2026-06-20
- Phase5の前進スライスとして、動画shared memory sourceとGeneratedGradient mediaが同じRust native render passで合成される契約を固定した。
- Red: `rust-backend` の `decode_control_plane` に、shared memory上のVideo sourceを背景にし、GeneratedGradient mediaを前面合成する `render.nativeSharedFrame` 契約を追加した。
- Red: `sharedRendererViewportNativeRenderUpload` に、decoded video sourceとGeneratedGradient mediaを同じ `renderNativeSharedFrame` payloadへ渡す契約を追加した。
- 既存実装で契約を満たしていたため、挙動変更と版更新は行わず、Rust側へ既に載っている描画面積を太いテストとして固定した。
- 検証: `cargo test native_render_shared_frame_composites_video_source_with_generated_gradient_media` (`rust-backend/`) は1件成功。`npm test -- sharedRendererViewportNativeRenderUpload -t "generated gradient media"` は1件成功。
- 版: `0.1.1-Beta-216z` 据え置き。

## 2026-06-20
- Phase5のpreview診断として、動画とGeneratedGradientが同じnative render済みframeに含まれる場合のdataset契約を固定した。
- Red: `sharedRendererPreviewPresenterController` に、`NativeRenderMediaKinds=Video,GeneratedGradient`、`NativeRenderSourceMediaIds=video-1`、Video/GeneratedGradient双方のsharedRenderer ownershipが出る契約を追加した。
- 既存実装で契約を満たしていたため、挙動変更と版更新は行わず、実機確認時にRust側へ載っている範囲を追いやすくするテストとして固定した。
- 検証: `npm test -- sharedRendererPreviewPresenterController -t "video and generated gradient"` は1件成功。
- 版: `0.1.1-Beta-216z` 据え置き。

## 2026-06-20
- Phase5のPixi剥がし前進スライスとして、top-left pivotのrotation transformをCPU reference / native wgpu / TS scene snapshotへ接続した。
- Red: `reference-renderer` に90度回転の逆変換サンプリング契約を追加した。
- Green: `reference-renderer` が有限rotationを許可し、translation後に逆回転してsource座標をsampleするようにした。
- Red: `native-wgpu-renderer` に同じ90度回転のCPU reference parity契約を追加した。
- Green: native rendererのuniformへrotation cos/sinを渡し、共有WGSL `solid_composite.wgsl` で逆回転サンプリングするようにした。
- Red: `rustSceneSnapshot` に、Timeline objectの `rotation` が `rotation_degrees` としてRust境界へ伝搬する契約を追加した。
- Green: TS snapshot builderのrotation 0固定とunsupportedRotation gateを外し、未対応fixtureはscale変形へ差し替えた。
- 検証: `cargo test` (`reference-renderer/`) は12件成功。`cargo test native_wgpu_matches_reference_for_top_left_pivot_rotation` (`native-wgpu-renderer/`) は1件成功。`npm test -- rustSceneSnapshot sharedRendererPreviewSurface sharedRendererExportSession` は22件成功。対象TSファイルで絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-217a`。

## 2026-06-20
- 方針転換として、PixiJSを細かく剥がす作業よりも、図形・画像・音声を配置してRust backend encodeへ進むMVP経路を優先した。
- Red: `productionVideoDependencyBoundary` に、通常起動時のVite dependency scanがexport test harness / mp4boxを拾わない契約を追加した。
- Green: `src/main.tsx` のexport test harness動的importへ `/* @vite-ignore */` を付け、通常 `npm run dev` がmp4box dep-scanで止まらないようにした。
- Red: `rustSceneSnapshot` に、active audio objectがあってもvisual Rust scene snapshotは図形/画像など映像objectだけで成立する契約を追加した。
- Green: visual snapshot構築前にaudio objectを除外し、音声は `audioMixdown` / Rust encoder muxへ任せる形へ分離した。
- 検証: `npm test -- productionVideoDependencyBoundary -t "dependency scanning"` は1件成功。`npm test -- rustSceneSnapshot -t "audio objects"` は1件成功。`npm test -- rustSceneSnapshot sharedRendererExportSession sharedRendererPreviewSurface` は23件成功。対象TSファイルで絞った `tsc` 出力は空。`npm run dev` は `http://localhost:5173/` でHTTP 200を確認。
- 版: `0.1.1-Beta-217b`。

## 2026-06-20
- Native MVP再構築計画を `markdown/Native_MVP_Rebuild_Plan.md` として追加し、最初の到達点を Rectangle / gradient rectangle / PNG・JPEG画像 / WAV音声 / Rust backend MP4 export に絞った。
- Red: `projectExportFrameCanvas` に、Shape + AudioだけのMVP exportでもnative render mediaとして扱う契約を追加した。
- Green: export frame source contextのnative render media判定をShape / Image / PSD / Videoへ広げ、通常export hookも同じ判定を使うようにした。Audioはvisual media判定から除外し、mixdown + `audioPath` muxへ任せる。
- Rust backend結合確認として、PNG画像を `render.nativeSharedFrame` でRust decode/renderし、そのshared frameを `encode.writeFrame` へ渡し、WAV音声をmuxしてMP4を生成する契約を追加した。
- 検証: `npm test -- projectExportFrameCanvas` は35件成功。`cargo test --manifest-path rust-backend/Cargo.toml --test decode_control_plane native_rendered_image_frame_can_feed_audio_muxed_encode -- --nocapture` は1件成功。対象TSファイルで絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-218a`。

## 2026-06-20
- 実機確認で画像・音声・PSDは読み込めた一方、GoPro系動画読み込みとencode失敗診断が弱かったため、MVP向けに入口を広げた。
- Red: `useTimelineDrop` に、ElectronがMIME typeを空で渡す `.MP4` も動画として扱う契約を追加した。
- Green: 動画drop判定をMIME typeだけでなく `.mp4` / `.mov` / `.m4v` などの拡張子にも対応させた。
- Red: `rust-backend` decodeに、非sRGB transfer metadataの動画をMVP importで拒否しない契約を追加した。
- Green: Rust decodeの色メタデータgateを緩め、rangeだけをfull/limited変換へ使い、primaries/transfer/matrixはffmpegの変換へ任せるようにした。
- Red/Green: encode失敗時にffmpeg stderrを捨てず、`encode.finish` のRPCエラーへ含めるようにした。
- 検証: `npm test -- useTimelineDrop` は3件成功。`cargo test --manifest-path rust-backend/Cargo.toml --test decode_control_plane -- --nocapture` は29件成功。対象TSファイルで絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-218b`。

## 2026-06-20
- 実機確認で `Failed to load video metadata` と `Cannot read properties of undefined (reading 'invoke')` が出たため、IPCなし環境の扱いをMVP向けに戻した。
- Red: `mediaMetadata` に、Electron IPCがない場合もHTMLVideoElementで動画metadataを読む契約を追加した。
- Green: `resolveVideoMetadata` をRust probe優先、失敗時はbrowser video metadata fallbackへ戻した。
- Red: `useProjectExportBoundary` に、module load時点で `window.ipcRenderer` を捕まない契約を追加した。
- Green: export開始時に `getProjectExportIpcRenderer` でIPCを取得し、未接続なら「Electron app windowでexportする必要がある」と明示するようにした。
- 検証: `npm test -- mediaMetadata useTimelineDrop useProjectExportBoundary` は38件成功。対象TSファイルで絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-218c`。

## 2026-06-20
- PixiJSへ戻す選択肢を避け、Rust/shared renderer経路で動画preview/exportが止まっている地点を画面上に出す方針へ寄せた。
- Red: `ExportProgress` と `ExportProgressModal` に、Rust exportの現在工程 `stepDetail` を保持・表示する契約を追加した。
- Red: `Viewport` に、動画previewが空白のままにならないようshared renderer presenter診断を表示する契約を追加した。
- Green: export hookのsave path待ち、audio mix、shared-frame source待ち、encoder終了などの工程を進捗モーダルへ表示するようにした。
- Green: shared renderer presenterのdatasetからstatus / native render failure / video upload failureを集め、動画objectがあるpreview上へ診断として表示するようにした。
- shared-frame取得が長時間返らない場合、15秒で工程名付きエラーへ変換し、意味のない無限プログレスを避けるようにした。
- 検証: `npm test -- exportProgress ExportProgressModal viewportRustVideoOnlyBoundary useProjectExportBoundary` は73件成功。`npx tsc --noEmit --pretty false` は既存のThree/mp4box/古いテスト型エラーで失敗。今回触ったファイルで絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-218d`。

## 2026-06-20
- 方針を「動画編集の基本機能を触れる状態」へ寄せ、native copy bridge未接続でも動画previewへ進めるMVP経路を追加した。
- Red: shared memory native copyが `Shared video frame native bridge is unavailable.` で失敗した場合、Rust inline decoded RGBAをWebGPU uploadへ使う契約を追加した。
- Green: `decode.requestFrameInline` をRust backendへ追加し、通常の `decode.requestFrame` はpixel payloadなしのまま、inline専用RPCだけbase64 RGBAを返すようにした。
- Electron main/preloadから `rust-backend-decode-request-frame-inline` / `requestVideoDecodeFrameInline` を公開した。
- Renderer側はnative copy bridge失敗時のみinline RPCへ進み、取得したRGBAを既存のshared renderer WebGPU upload/drawへ渡すようにした。
- PixiJS動画描画へ戻さず、Rust decode -> WebGPU previewのMVP救済経路として実装した。
- 検証: `npm test -- sharedRendererRustVideoUploadPipeline sharedRendererViewportVideoUpload sharedVideoFrameUploadBridge` は30件成功。`cargo test --manifest-path rust-backend/Cargo.toml --test decode_control_plane -- --nocapture` は30件成功。対象ファイルで絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-219a`。

## 2026-06-20
- `npm run dev` 起動時にViteが `phase3b-webgpu-harness/index.html` / `src/index.html` までdep-scanし、export test harnessの `mp4box` importで落ちる問題を修正した。
- Red: production boundary testに、通常Vite dependency scanのentryをapp root `index.html` に限定する契約を追加した。
- Green: `vite.config.ts` の `optimizeDeps.entries` を `['index.html']` に固定し、通常devからexport test harnessをdep-scan対象外にした。
- 検証: `npm test -- productionVideoDependencyBoundary -t "dependency scanning"` は2件成功。対象ファイルで絞った `tsc` 出力は空。`npm run dev` 起動後、`http://localhost:5174/` でHTTP 200を確認した。
- 版: `0.1.1-Beta-219b`。

## 2026-06-20
- 実機で出た `presenterStartFailed` と `nativeRenderUnsupportedMediaOnly` 系の診断を受け、動画previewがその状態で終わらないことを固定するE2E寄りの統合テストを追加した。
- `src/e2e/rustVideoPreview.e2e.test.ts` を追加し、native renderが `nativeRenderUnsupportedMediaOnly` を返しても、Rust video uploadへ進み、presenterがready controlを返す流れを検証した。
- このテストではPixiJS動画描画へ戻さず、Rust decoded uploadが `sharedRendererDecodedVideoFrameUploads` としてpresenterへ渡ることを確認している。
- 検証: `npm test -- rustVideoPreview.e2e` は1件成功。`npm test -- rustVideoPreview.e2e sharedRendererViewportPresenterOrchestration sharedRendererPreviewPresenterController` は53件成功。対象E2Eファイルで絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-219b` 据え置き。
