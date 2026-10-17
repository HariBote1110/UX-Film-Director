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

- `sharedRendererPreviewBridge.ts` は評価済みRust snapshotのplan生成と型契約を持ち、`rustSceneSnapshot.ts` のserializerをimportしない。
- preview/exportのproduction session facadeは型だけを提供する。旧同期builderは `sharedRendererPreviewSessionReference.ts`、`sharedRendererExportSessionReference.ts`、`sharedRendererPreviewPlanReference.ts` に隔離し、値importはtest/E2E reference側だけにする。production export frame sourceに `buildExportSessionForTest` やTS builder injectionは残さない。
- `sharedRendererExportFrameSource.ts` はRust評価session constructorを使い、resident providerが無い時はblockedにする。legacy `buildSharedRendererExportSession` / `buildSharedRendererPreviewSession` の呼び出しはproduction sourceにはない。
- `rustSceneSnapshot.ts` / `editableRustScene.ts` はparity、fixture生成、旧挙動比較用のreference実装としてソースに残る。production runtimeのserializer callerとしては残さない。型/wire契約、surface boundary validator、frame rate helper、object eligibilityは独立moduleに分離済み。text geometryは `textMediaGeometry.ts` に分離済み。
- `main.tsx` のserializer依存E2E harnessは `import.meta.env.DEV` のdynamic importに限定。production Vite buildでserializer symbolと該当E2E entry chunkが含まれないことを確認した（無関係な`exportTestHarness` chunkは別途存在する）。
- 旧migration flagはTS serializer復活用rollbackに使わない。rollbackは既知のP2 graph-only契約をrevertするrelease rollbackで行う。RPC OFF/provider不在はblockedであり、TS snapshotを生成しない。

P3のproduction経路撤去は完了。reference serializerをテストから除去する作業ではなく、production import graphから隔離する作業として完了した。`rustSceneSnapshot.ts` と `editableRustScene.ts` のtest/fixture利用はparity基準を保持するため継続する。

## P4との境界

`scene.query_object_positions` は `sceneId` / `revision` と任意時刻queryを使うRust編集用APIで、`scene.evaluate` のframe量子化結果から逆算しない。PropertyPanelのkey追加、Vision tracking、split位置はRust query必須になった。選択枠とhit-testは `Viewport` の評価済みsnapshotに含まれるframe/revisionのgeometryへ接続された。query `timeSeconds` のf64 echoが一部値でbit-exactにならない問題が残り、Rust JSON serialization修正を調査中である。text評価plane原点のtransformとUI geometryを二重補正しない契約も維持する。

## 検証

- 親担当default export E2E: raw graph/RPC flag未設定、mixed scene、60/60 frame、H.264 probe一致、runtime errorsなし、`residentScene`（`/tmp/uxfd-verified-default-export-result.json`）。
- serializer/session reference分離後のfocused Vitest: 3 files / 58 tests passed。既存session挙動はreference module経由で維持。
- `npx tsc --noEmit`: 成功。
- `npm run codegen:types:check`: 成功、生成差分なし。
- 親統合後の全Vitest: 276 files / 1982 tests passed。唯一の失敗は `src/e2e/allReadableMedia.e2e.test.ts` が参照するgitignore対象 `perf/heavy-media` fixtureの欠落によるfile existence assertionであり、隔離worktreeに素材が存在しない。fixture生成や期待値のskipは行っていない。
- production Vite build: 成功。bundle内にserializer名はなく、serializer依存E2E entryも含まれない。テストビルドが生成したtracked `dist/index.html` と既存bundle差分は確認後に復元した。
