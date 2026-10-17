# P4 編集用位置query基盤と任意時刻操作

## 決定

- 任意秒の位置は`scene.evaluate`のframe snapshotから逆算せず、revision付きの`EditableSceneGraph`を保持するRust sessionへ`scene.query_object_positions`を呼ぶ。`scene.replace`は従来の`project`+`media`とgraph-only payloadの両方を受け付ける。graph-onlyではRust builderを実行し、resident非対応診断は`-32065`でrejectする。TS側評価へfallbackしない。
- query identityは`sceneId`/`revision`/`requestId`/`objectId`/`timeSeconds`。`timeSeconds`はAPI境界でf64のまま保持・echoし、描画座標などは既存f32契約を維持する。Rust responseはf32由来の桁ノイズを増やさない形でJSON化し、TS clientはidentityと有限座標を検証する。
- `worldPosition`はgroup translationとvibrationを合成する。別フィールド`groupTranslation`は親groupの平行移動のみを表し、vibrationを含めない。
- split、Vision tracking、現在位置へのkeyframe追加はRust位置queryを必須とする。現在のgraphがViewportから送信され、同revisionのresident ackが届くまで待つ。graph supersede、scene失敗、controller disposeはpending actionをsettle/rejectし、旧TypeScript評価へfallbackしない。
- query結果適用前にscene、対象object、選択、再生時刻、project/layer/object graph参照を再検査する。TS側のlocal位置はtext decoration補正前のlogical originを維持する。Rust world値は可視layerとgroup builderの規則に従う。

## PropertyPanelのキー追加

- `handleAddCurrentKeyframe`は同revisionのresident ack後に`localPosition`を採用する。action開始時にstoreからcaptureしたobjectを使い、React closureの古い値からkeyframeを作らない。
- scene/object/time/graphが非同期中に変わった場合はkeyframeを適用しない。scene/revisionとrequest/object/time identityも確認する。

## Vision tracking移行

- 各sampleのvideo/overlayを同じraw timeline秒でRust queryし、応答identityと座標を検査してkeyframeを組み立てる。応答欠落・revision不一致・action staleは中断し、TS評価へfallbackしない。
- 既存意味論に合わせ、video bbox中心はRust `localPosition`と元のbase rotation/scaleから算出する。overlay位置は`localPosition + groupTranslation`で作り、`worldPosition`に入るvibrationをdeltaへ混ぜない。各時刻でgroup平行移動を差し引き、従来のTS directと同じlocal位置を得る。
- CoreML応答後、resident revision ack後、position query後、適用直前にscene・selection・再生時刻・project/layer/object graph参照を確認する。overlay選択IDも確認し、遅れて返った結果を適用しない。
- TypeScript direct評価のVision keyframe builderはproductionから削除した。

## Split位置移行

- `splitObject`は`Promise<void>`を返す。現在のtimeline raw秒と対象object idでRust `localPosition`を取得し、既存の分割・keyframe同期・Batch commandを実行する。Rust位置を取得できないときは分割しない。
- resident ack後・query response後にscene、selected id/selectedIds、時刻、settings/layers/objects参照、target object同一性、layer lockを再検証する。どれかが変わればstate/historyを変更しない。
- toolbarとcontext menuは`void splitObject()`で非同期actionを起動する。query失敗はaction内部で記録・表示し、TS評価にfallbackしない。成功時はRemove + Add×2を1つのUndo Batchとして記録する。
- graph supersede/controller disposeは専用cancelled errorとして扱い、store参照が未更新の瞬間でも正常取消として静かに終了する。Vision trackingも同じcancelled errorとaction identityを確認してから障害通知する。

## 実UI検証と既定化（2026-10-18）

- `feature-proxy`（`dd86b995`）を作業branchへfast-forward mergeした。
- overlayを無効、Rust raw graphを有効にし、指定済みverified backendを使った別Electron/CDP sessionで、アニメ図形を2.5秒位置から「分割」toolbar操作した。位置(100,200)→(500,600)が(200,300)で分かれ、Undo 1回で元の1オブジェクトへ、Redo 1回で2片へ戻り、historyは単一Batchだった。
- 同操作開始直後にplayheadを3秒へ変えたケースは1件の未分割図形を維持し、sceneを切り替えたケースは新sceneの空状態を維持した。
- 同梱CoreML/Vision trackerをローカル2.25秒動画で実行し、成功応答と14 tracking samplesを確認した。Electron UI側の追跡キーフレーム適用は、必須化後にCDP statusをpageへ保持して再確認する。
- Vitestのsplit/Rust query、PropertyPanel境界、Vision keyframe utilityの関連33 testsと`tsc --noEmit`が成功。

## 未対応範囲

- scene hit-test/selectionへの位置query移行は別タスクとして残る。

## 検証

- `cargo test --manifest-path rust-core/Cargo.toml --test editable_scene_position_query`
- `cargo test --manifest-path rust-backend/Cargo.toml --bin uxfd-rust-backend graph_only_replace_builds_and_retains_raw_graph_for_unquantised_queries`
- `npx vitest run src/utils/visionTrackingKeyframes.test.ts src/utils/rustBackendSceneControl.test.ts src/utils/rustBackendSceneControlBoundary.test.ts src/utils/rustScenePositionQueryRevision.test.ts src/components/PropertyPanelBoundary.test.ts src/components/PropertyPanelPlaybackIsolation.test.ts`
- `npx vitest run src/store/useStoreSplitPositionQuery.test.ts src/store/useStoreCommandConversion.test.ts`
- `npx tsc --noEmit`
