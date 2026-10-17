# P2d: preview/export の Rust evaluation 接続と残存経路

最終更新: 2026-10-18

## 現在地

- P2c のexport用 `scene.replace` / revision確認は完了済み。preview/exportともraw editable graphを置換時に一度送り、以後の各frameではRust resident sceneを評価する。毎frame graphを転送しない。
- graph-only `scene.replace` が既定経路。`VITE_UXFD_RUST_SCENE_RAW_GRAPH_ONLY` と `VITE_UXFD_RUST_TIMELINE_SCENE_RPC` を設定しない通常構成で、親担当のmixed exportが60/60 frame成功、H.264 probe一致、runtime errorなし、`residentScene` を確認した（証跡: `/tmp/uxfd-verified-default-export-result.json`）。backendは存在確認済みのrelease binaryを明示指定して実行した。
- exportは `exportOriginal`、previewは `previewProxy` をRust builderへ渡す。legacy TypeScript export sessionにも `exportOriginal` の回帰があり、proxy/file pathが異なるfixtureで原本sourceを固定している。
- graph builderがunsupportedを返す場合、またはRust評価providerが無い場合は `unsupportedScene` / `residentEvaluationUnavailable` でblockedにする。RPC、clone、acknowledgement、scene/revision/frame不一致などの異常もエラーで停止し、TS snapshotへfallbackしない。async評価中にframe sourceがcloseされた場合も、await後にpresenterを開始しない。
- `RAW_GRAPH_ONLY=0` はTS builderへの切り戻しではなくRust resident経路を無効化してblockedにする。RPC無効も同期TS評価へのfallbackを持たない。従来のdual-run / builder-cutover flag名はgraph-only経路の互換aliasであり、旧serializerを復活させない。

## P2のcoverageと残存guard

`sharedRendererSceneObjectSupport.ts` は40種類のvisual object kindを列挙する。42種類のcanonical media coverageは別のfixture契約であり、この40種類のsupported-object集合や各graphのresident eligibilityと同一視しない。resident eligibilityはRust builderのgraph-level diagnosticsで判定し、未対応機能を有効に含むgraphは明示的にblockedにする。

builderの診断guardは現在も必要である。代表例はmask、reverse video、unsupported dynamic gradient/filter組み合わせ、GetColorの未対応sample source、unsupported group conditionである。これらは正常なclipに見せかけたり、objectを無言で落としたりしない。従来TS経路も扱えない条件を含むため、production TS fallbackを残さずRust diagnosticsを維持する。全組み合わせのnative coverageは未完了として記録し、個別guardの解除はRust側の実装・parity・実機確認を伴う。

P2d cutoverはdefault graph-onlyで完了したが、P2全体を「全featureがresident対応済み」とは扱わない。40 visual object kind / vibrationを含むRust builder coverage、42 media serialization coverage、graph-level eligibilityとunsupported guardは別々の受入契約である。Windows interim presenterはRust評価済みsessionを消費する配線だが、この報告のdefault export E2Eはnative overlayを無効にした構成であり、Windows attach/interim実機E2Eは独立確認として残る。

## production import台帳とP3現在地

- `sharedRendererPreviewBridge.ts` は評価済みRust snapshotのplan生成と型契約を持ち、`rustSceneSnapshotReference.ts` のserializerをimportしない。
- preview/exportのproduction session facadeは型だけを提供する。旧同期builderは `sharedRendererPreviewSessionReference.ts`、`sharedRendererExportSessionReference.ts`、`sharedRendererPreviewPlanReference.ts` に隔離し、値importはtest/E2E reference側だけにする。production export frame sourceに `buildExportSessionForTest` やTS builder injectionは残さない。
- `sharedRendererExportFrameSource.ts` はRust評価session constructorを使い、resident providerが無い時はblockedにする。legacy `buildSharedRendererExportSession` / `buildSharedRendererPreviewSession` の呼び出しはproduction sourceにはない。
- `rustSceneSnapshotReference.ts` / `editableRustSceneReference.ts` はparity、fixture生成、旧挙動比較用のreference実装としてソースに残る。`sceneEvaluationReference.ts` / `easingEvaluationReference.ts` は旧評価比較用の値helperを持つ。これらはproduction runtimeのserializer/evaluator callerとして残さず、型/wire契約、surface boundary validator、frame rate helper、object eligibility、text geometryは独立moduleに分離済み。
- `main.tsx` のserializer依存E2E harnessは `import.meta.env.DEV` のdynamic importに限定。production Vite buildでserializer symbolと該当E2E entry chunkが含まれないことを確認した（無関係な`exportTestHarness` chunkは別途存在する）。
- 旧migration flagはTS serializer復活用rollbackに使わない。rollbackは既知のP2 graph-only契約をrevertするrelease rollbackで行う。RPC OFF/provider不在はblockedであり、TS snapshotを生成しない。

P3のproduction経路撤去は完了。reference serializerをテストから除去する作業ではなく、production import graphから隔離する作業として完了した。`*Reference.ts` のtest/fixture利用はparity基準を保持するため継続する。旧評価関数も専用Reference module内に保持し、production値importを持たせない。

## P4との境界

`scene.query_object_positions` は `sceneId` / `revision` と任意時刻queryを使うRust編集用APIで、`scene.evaluate` のframe量子化結果から逆算しない。PropertyPanelのkey追加、Vision tracking、split位置はRust query必須になった。選択枠とhit-testは `Viewport` の評価済みsnapshotに含まれるframe/revisionのgeometryへ接続された。query `timeSeconds` のf64 echoはRust側のJSON round-trip serialization修正で解消し、fractional query timeの契約テストで固定した。text評価plane原点のtransformとUI geometryを二重補正しない契約も維持する。

## P3/P4 Reference隔離更新（2026-10-18）

- 旧評価関数を `sceneEvaluationReference.ts` / `easingEvaluationReference.ts` に集約し、`keyframes.ts` と `subjectCropKeyframes.ts` は編集用helper、`easings.ts` は型・表示名だけを残す。`sceneTransforms.ts` / `objectVisibility.ts` は削除し、値評価の比較はReference moduleから行う。
- 旧snapshot/builderの実装は `rustSceneSnapshotReference.ts` / `editableRustSceneReference.ts` へ改名した。parity、境界、fixture生成テストはReferenceを引き続き使う。production runtimeはこのmodule群を値importしない。
- Reference移設後のfocused Vitestは12 files / 240 tests成功。fixture drift 3 files / 9 testsも成功し、`npx tsc --noEmit`成功。
- 評価reference隔離は旧TS経路をproductionへ戻す変更ではない。R2の最終完了は実UI/native/performance検証が残るため未確定。

## 検証

- 親担当default export E2E: raw graph/RPC flag未設定、mixed scene、60/60 frame、H.264 probe一致、runtime errorsなし、`residentScene`（`/tmp/uxfd-verified-default-export-result.json`）。
- 旧builder/evaluator Reference分離後のfocused Vitest: 12ファイル / 240件成功。fixture drift も3ファイル / 9件成功。
- `npx tsc --noEmit`: 成功。
- `npm run codegen:types:check`: 成功、生成差分なし。
- `cargo test --manifest-path rust-core/Cargo.toml --test ts_evaluation_parity`: 447フレームのTS/Rust比較に成功し、差分0件。
- 全Vitest: 277ファイル中276成功、1986件中1985件成功。唯一の失敗は `src/e2e/allReadableMedia.e2e.test.ts` が要求するgitignore対象 `perf/heavy-media` fixtureの欠落によるファイル存在確認。隔離worktreeには `.gitignore` のみで素材が存在しない。fixture生成や期待値のskipは行っていない。
- production Vite build: `/tmp/uxfd-reference-isolation-build-20261018` へのbuild成功。bundle内に`rustSceneSnapshotReference` / `editableRustSceneReference` / evaluator Reference名はなく、旧serializer/evaluatorがproduction bundleへ到達しない。test buildは`dist`へ出力せず、tracked build artifactsの変更もない。
