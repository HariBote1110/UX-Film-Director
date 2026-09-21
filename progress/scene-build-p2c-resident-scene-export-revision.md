# P2c: cut-over 下の常駐 scene export revision 収束

## 事実

- `scene.replace` は成功時、scene source が Rust / TypeScript fallback のどちらでも、要求された revision を `state.scene_sessions` に保存する。cut-over による Rust builder の実行は revision を拒否・降格・書換えしない。
- scheduler は新しい `submitRevision` ごとに `onRemoteReady(null)` を通知する。Viewport はこれを受けて acknowledged revision を `null` にする。
- export は acknowledged revision ではなく、`replaceScene` 直後に更新する optimistic revision を resident encode payload へ渡していた。cut-over では builder を含む replace が進行中でも export 開始が可能なため、backend が保持する直前の確認済み revision と optimistic revision が一致しない。
- 対照構成では replace が export 開始までに完了しやすく、この競合が顕在化しない。既測定の scene RPC `requested=4 / resolved=4 / stale=1 / failed=0` はこの説明と矛盾せず、`stale=1` は latest-wins の通常結果である。

## 決定

- P2c は候補 (a) を維持する。新しい希望 revision の送信中も backend が実際に保持する acknowledged revision を捨てず、resident export は optimistic revision ではなくその acknowledged revision を渡す。
- この変更は export を待機させない。export 時点で backend が確認済みの scene を明示的に pin するため、native encode の revision 比較と一致する。

## 代替案として退けたもの

- 候補 (b) の export 専用 lifecycle は撤回した。実装試行はE2Eでoutput未生成・`exportSessionBlocked`を起こした。Rust backend の`scene_sessions`はscene IDごとの`HashMap`であり、surface gateもbackend sessionを参照しないため、export IDがpreview slotを置換したという仮説は成立しなかった。さらにE2Eの唯一の`getRustExportFrameSource`呼出はcontroller不在でfallbackしており、export専用replaceは当該runでは実行されていない。
- `waitForReady` / export 側ポーリングは再導入しない。既存試行で実機15秒タイムアウトとなり、根本の「未確認 optimistic revision を送る」問題を解かない。

## 制約・注意点

- acknowledged revision は「最新の希望revision」ではなく「backend が現在保持する revision」である。replace 進行中の export は後者を使うため、無効な revision を送らない。
- 既定OFFの cut-over flags、scene.replace wire 形状、fallback 理由の優先順位は変更しない。

## 実装

- schedulerに`onResidentRevision`を追加した。これは成功した`scene.replace`ごとにbackendが保持するrevisionを通知し、次の`submitRevision`中も直前の確認済み値を保持する。従来の`onRemoteReady`は「現在の希望revisionがpresent済み」のままとし、native playbackの意味論を変えていない。
- Viewportはexport専用の`rustTimelineSceneExportRevision`へこの通知を保存し、resident encode payloadにはこの値だけを渡す。backend確認がまだ無い場合はresident exportを試みず既存のframe source fallbackへ進み、statusを`residentSceneUnacknowledged`にする。
- cut-over専用のresident export無効化ガードおよび`residentSceneDisabledUnderSceneBuilderCutover` statusを削除した。待機・ポーリングは追加していない。

## 最終検証出力

```text
$ npm test -- --run src/utils/residentSceneExportBoundary.test.ts src/utils/viewportRustExportFrameSource.test.ts src/utils/sharedRendererScenePreviewScheduler.test.ts src/utils/editableRustScenePreviewController.test.ts src/utils/viewportRustVideoOnlyBoundary.test.ts src/utils/rustSceneNativePlaybackBoundary.test.ts --reporter=dot
Test Files  6 passed (6)
Tests  94 passed (94)

$ cargo test --manifest-path rust-backend/Cargo.toml --bin uxfd-rust-backend rpc_dispatch::tests:: -- --nocapture
test result: ok. 17 passed; 0 failed; 0 ignored; 0 measured; 181 filtered out

$ npx tsc --noEmit
(exit 0; outputなし)
```

## generated source 整数 wire 修正（2026-09-22）

### 事実

- clone-safe export確認後のcut-over E2Eは`residentScene`まで到達し、初めてnative WebGPUのHKSY sourceを読んだ。`cellSize: 50.0`が`native-wgpu-renderer`の`u32` deserialiserで拒否された。
- Rust scene builderはHKSYを`HksyCheckerGridObjectFields`から直接serialiseするが、その編集モデルの`cell_size`、`line_width`、`separate_interval`、`separate_line_width`が`f32`だった。そのため、整数意味論の値がJSONでは浮動小数点数になっていた。TS serialiserは同じ値を整数JSON numberとして出す。
- 同じ「整数を一度`f32`へcastして`trunc`する」経路を監査した結果、Hologram（`tileSize`、`colourMode`）、Focus Lines（`keyframeInterval`）、Plain Effector Line（`lineCount`）、Protractor（4フィールド）、Shaking Polygon（6フィールド）にも同種の不整合があった。GetColor Dots、Particle、Audio Sphere/Waveform、Simple Tube、Shattered Sphereおよび残るgenerated kindは、builderとconsumerの整数・浮動小数点型が一致していた。

### 決定

- 整数パラメータはbuilder/編集schemaから整数型で保持し、整数JSON numberとしてserialiseする。native deserialiserを浮動小数点許容・丸めへ緩めない。TS wireとの互換性を保ち、非整数入力を静かに丸めないためである。
- `all-object-types.json`からRust builderで作る36種すべてのgenerated sourceを、backendが用いる対応Rust source型へdeserialiseするテストを追加した。HKSY等native固有の整数契約はrust-core parity testでも明示的に固定する。

### 代替案として退けたもの

- native HKSY deserialiserで`50.0`を受け入れて丸める案は採らない。TS pathが整数を送っており、値の意味論も整数なので、producerの型を正すべきである。
- HKSYだけの局所修正は採らない。同じbuilderを通る全generated kindを監査し、同じf32化があった5種を同時に修正・回帰テスト化した。

### 制約・注意点

- この変更はcut-over既定値、scene.replace wire形状、fallback優先順位を変えない。JSON numberというwire表現は同じで、浮動小数点の小数部だけを出さなくする。
- Electron E2Eはこの環境では実行していない。次のclean-port E2Eでnative WebGPUの後続描画を確認する。

### 検証

```text
$ cargo test --manifest-path rust-core/Cargo.toml -- --nocapture
test result: ok. 全rust-core tests passed

$ cargo test --manifest-path rust-backend/Cargo.toml --bin uxfd-rust-backend editable_scene_builder_generated_sources_deserialise_in_backend -- --nocapture
test generated_frame_tests::editable_scene_builder_generated_sources_deserialise_in_backend ... ok
test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 198 filtered out

$ cargo test --manifest-path rust-backend/Cargo.toml --bin uxfd-rust-backend rpc_dispatch::tests:: -- --nocapture
test result: ok. 17 passed; 0 failed; 0 ignored; 0 measured; 182 filtered out
```

`native-wgpu-renderer`全体テストはsandboxにGPU adapterが無いため5件が同じadapter取得失敗で失敗し、52 passed / 5 failedとなった。`rust-backend` bin全体は従来どおりPOSIX shared memory 2件とVideoToolbox 1件のみ失敗し、194 passed / 3 failed / 2 ignoredだった。いずれも今回のsource型変更による失敗ではない。

指定のbin全体テストは2回とも、sandboxが許可しないPOSIX shared memoryとVideoToolboxのため同じ3件で失敗した。変更対象の`rpc_dispatch::tests`は17件すべて成功した。

```text
$ cargo test --manifest-path rust-backend/Cargo.toml --bin uxfd-rust-backend -- --nocapture
test result: FAILED. 193 passed; 3 failed; 2 ignored
decode::tests::decode_start_rejects_a_slot_count_that_disagrees_with_the_active_session_for_the_same_job_id
  Failed to create decode shared memory: shm_open(create): Operation not permitted
native_shared::tests::read_native_render_source_frame_releases_only_the_slot_it_read_not_the_first_reading_slot
  shm_open(create): Operation not permitted
encode::tests::iosurface_transport_with_audio_path_mux_es_into_final_file
  Failed to start IOSurface VideoToolbox encoder: StartFailed(\"The operation could not be completed\")
```

## 再調査（2026-09-21、E2E未達）

### 事実

- cut-over E2Eは`uxfdRustExportFrameSourceStatus=residentSceneUnacknowledged`かつ`uxfdRustTimelineSceneRpcStatus=pending`で終了した。これはexport時に確認済みrevisionが無く、fallbackへ進んだことを示す。
- controller生成effectの依存は`rustEditableSceneCutoverEnabled`と`rustTimelineSceneRpcEnabled`だけであり、どちらも起動時の環境変数から決まる。export開始はこのeffectを再生成しない。`pending`はcontroller生成時だけでなく、objects/layers変更後の`replaceScene` effectと評価要求時にも書かれるため、E2Eの`pending`単独からcontroller再生成は結論できない。
- E2Eは混在kind追加・全object短尺化の直後にexportボタンを押し、最後のZustand変更に対応するReact passive effect（`scene.replace`送信）完了を待たない。export中はpreview評価要求も意図的に停止する。したがって、E2Eのexport routeには、現行preview lifecycleが最新sceneを確認する前にframe source選択へ進む構造的な窓がある。
- `useProjectExport`はframe sourceを初期plan作成時に一度だけ取得する。candidate (b) runの最終datasetが`residentSceneUnacknowledged`であるため、その唯一の呼出で`rustTimelineScenePreviewControllerRef.current`は`null`だった。controller refを`null`にするコードは、RPC flag無効化またはcontroller setup effectのcleanupだけである。両flagはimport時の環境変数にのみ依存するため、既存datasetだけではcleanupを起こした実行時イベントを特定できない。
- candidate (b) のexport専用replaceがsurface gateを破壊したという因果は確認できない。backendはscene IDごとにsessionを保持し、surface gateは`context.objects`から純粋に作るpayloadだけを検証する。かつ、上記のcontroller不在により当該runではexport専用replace自体が発行されない。

### 決定の更新

- candidate (b) は回帰を起こしたため撤回し、実装をcommit済み候補(a)相当へ戻した。これにより、exportが開始不能になる回帰は残さない。
- 現在の証拠では、`residentScene`がE2E routeで構造的に不可能とは結論できない。一方でcontroller不在の原因を示す診断がなく、候補(a)では確認済みrevisionが存在しないため、acceptance条件はなお未達である。

### 検証（rollback後）

```text
$ npm test -- --run src/utils/residentSceneExportBoundary.test.ts src/utils/viewportRustExportFrameSource.test.ts src/utils/sharedRendererScenePreviewScheduler.test.ts src/utils/editableRustScenePreviewController.test.ts src/utils/viewportRustVideoOnlyBoundary.test.ts src/utils/rustSceneNativePlaybackBoundary.test.ts src/components/ViewportDiagnostics.test.ts src/components/ViewportRustTimelineSceneRpc.test.ts --reporter=dot
Test Files  8 passed (8)
Tests  117 passed (117)

$ npx tsc --noEmit
(exit 0; outputなし)

$ cargo test --manifest-path rust-backend/Cargo.toml --bin uxfd-rust-backend -- --nocapture
test result: FAILED. 193 passed; 3 failed; 2 ignored
```

Rust全体テストの3失敗は従来どおりsandboxのPOSIX shared memory権限とVideoToolbox起動制限による。

## controller lifecycle 計測（2026-09-21、診断専用）

- `rustTimelineScenePreviewControllerRef.current`がexport source取得時にnullとなる理由を測定するため、挙動を変えないdataset traceを追加した。RPC、scene.replace、fallback順序、statusは変更しない。
- `uxfdRustTimelineSceneControllerTrace`は`<連番>:<created|cleanup|exportSource>@<Date.now milliseconds>`を`|`で連結する。cleanupには`:cleared`（identity check一致でrefをnull化）または`:retained`を、exportSourceには`:present|null:lastLifecycle=<連番|none>`を追加する。
- `uxfdRustTimelineSceneControllerExportSourceCalls`はexport source取得回数、`uxfdRustTimelineSceneControllerExportSourceState`は最後の取得時のref状態と直前lifecycle連番である。実際のunmount/remount後も既存datasetからtraceを復元して連番を継続する。
- これは原因特定後に削除または縮小する一時的な診断scaffoldingである。
- `ViewportDiagnostics.test.ts`で作成・cleanup・exportSourceの順序とremount後の連番継続を固定した。関連8 files / 119 testsと`npx tsc --noEmit`は成功した。

## export 専用 scene 確認の clone 境界（2026-09-22）

### 事実

- 以前のcandidate (b)回帰報告は、古いElectron processにCDP接続していた測定誤りだった。port解放後の再測定では、controllerはStrictModeの`created → cleanup:cleared → created`後も存在し、`getRustExportFrameSource`は1回だけ呼ばれ、export専用`scene.replace`の発行まで到達した。
- export確認は発行直後（同一ミリ秒帯）に`An object could not be cloned.`で拒否された。これはRust RPC往復前のElectron contextBridge境界である。
- 混在E2Eが追加するPSDは`parsePsdAsObject`から`editableScene.objects[<PSD>].file`に元の`File`を保持する。さらにPSDレイヤーツリーは`editableScene.objects[<PSD>].rootLayer.children[*].textureSource`に`ImageBitmap`を持ちうる。どちらもTS runtime専用であり、Rustの編集graph / JSON wireに含める値ではない。
- previewとexportの意味上の入力は同じZustand objectである。previewの最後の`pending`は、PSD追加後のreplaceがこの非clone値を含み得ることと整合する。export確認はschedulerを経由せず直ちにcontextBridgeへ渡すため、同期拒否が明確に観測された。

### 決定

- candidate (b) を再採用する。exportは新しいexport専用scene IDで最新graphの`scene.replace`成功を確認し、その確認済みrevisionだけをresident encoderへ渡す。待機・ポーリングは追加しない。
- `editableScene`を作る境界でPSDのruntime値を除去する。既存の永続化処理と同じ`stripPsdLayerNodeForPersistence`を再利用して`rootLayer`の`textureSource`を落とし、`PsdObject.file`も除外する。`filePath`、PSDレイヤーmetadata、表示設定は保持する。
- statusは確認開始時`residentSceneConfirming`、確認成功後のみ`residentScene`、拒否時`residentSceneConfirmationFailed`とする。acceptance signalが未完了の成功を示さないようにする。

### 代替案として退けたもの

- clone失敗をfallbackへ隠すことは採らない。export専用sceneを確認できない以上、resident encoderへ未確認revisionを送れず、statusは失敗を明示する必要がある。
- `File`や`ImageBitmap`をwireへ変換して送ることは採らない。Rust editable sceneの意味論はファイルパスとPSD metadataで足り、runtime resourceをIPC越しに送る設計は既存の保存・preload境界にも反する。

### 制約・注意点

- `Viewport`のcontroller traceは原因確定後に削除または縮小する診断scaffoldingであり、現時点では`exportConfirmIssued` / `exportConfirmResolved` / `exportConfirmRejected`も記録する。
- `editableRustScenePreviewController.test.ts`はPSD runtime値を含むexport確認payloadに対し、runtime値の不在と`structuredClone`成功を固定する。Electron contextBridgeは標準structured cloneより厳しい場合があるため、runtimeフィールド自体をwireから除去することを主契約とする。

### 検証

```text
$ npm test -- --run src/utils/residentSceneExportBoundary.test.ts src/utils/viewportRustExportFrameSource.test.ts src/utils/sharedRendererScenePreviewScheduler.test.ts src/utils/editableRustScenePreviewController.test.ts src/utils/viewportRustVideoOnlyBoundary.test.ts src/utils/rustSceneNativePlaybackBoundary.test.ts src/components/ViewportDiagnostics.test.ts src/components/ViewportRustTimelineSceneRpc.test.ts --reporter=dot
Test Files  8 passed (8)
Tests  124 passed (124)

$ npx tsc --noEmit
(exit 0; outputなし)
```
