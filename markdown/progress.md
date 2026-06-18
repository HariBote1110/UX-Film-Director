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
