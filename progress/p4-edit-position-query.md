# P4 編集用位置query基盤と任意時刻操作

## 決定

- 任意秒の位置は`scene.evaluate`のframe snapshotから逆算せず、revision付きの`EditableSceneGraph`を保持するRust sessionへ`scene.query_object_positions`を呼ぶ。`scene.replace`は従来の`project`+`media`とgraph-only payloadの両方を受け付ける。graph-onlyではRust builderを実行し、resident非対応診断は`-32065`でrejectする。TS側評価へfallbackしない。
- query identityは`sceneId`/`revision`/`requestId`/`objectId`/`timeSeconds`。`timeSeconds`はAPI境界でf64のまま保持・echoし、描画座標などは既存f32契約を維持する。Rust responseはf32由来の桁ノイズを増やさない形でJSON化し、TS clientはidentityと有限座標を検証する。
- `worldPosition`はgroup translationとvibrationを合成する。別フィールド`groupTranslation`は親groupの平行移動のみを表し、vibrationを含めない。
- UI queryは`VITE_UXFD_RUST_EDIT_POSITION_QUERY=1`のopt-in。現在のgraphがViewportから送信され、同revisionのresident ackが届くまで待つ。graph supersede、scene失敗、controller dispose、graph送信無効化はpending actionをsettle/rejectする。
- query結果適用前にscene、対象object、選択、再生時刻、project/layer/object graph参照を再検査する。TS側のlocal位置はtext decoration補正前のlogical originを維持する。Rust world値は可視layerとgroup builderの規則に従う。

## PropertyPanelのキー追加

- `handleAddCurrentKeyframe`は同revisionのresident ack後に`localPosition`を採用する。action開始時にstoreからcaptureしたobjectを使い、React closureの古い値からkeyframeを作らない。
- scene/object/time/graphが非同期中に変わった場合はkeyframeを適用しない。opt-in flagはraw graph送信と合わせて有効化する。
- native overlayを無効にしたElectronを起動してCDPから実UIを操作し、raw graph residentでの通常追加と、クリック直後にplayheadを変更した場合のstale応答破棄を確認した。

## Vision tracking移行

- opt-in中は各sampleのvideo/overlayを同じraw timeline秒でRust queryし、応答identityと座標を検査してkeyframeを組み立てる。応答欠落・revision不一致・action staleは中断し、TS評価へfallbackしない。
- 既存意味論に合わせ、video bbox中心はRust `localPosition`と元のbase rotation/scaleから算出する。overlay位置は`localPosition + groupTranslation`で作り、`worldPosition`に入るvibrationをdeltaへ混ぜない。各時刻でgroup平行移動を差し引き、従来のTS directと同じlocal位置を得る。
- CoreML応答後、resident revision ack後、position query後、適用直前にscene・selection・再生時刻・project/layer/object graph参照を確認する。overlay選択IDも確認し、遅れて返った結果を適用しない。
- flag OFF時は従来のTS directを維持する。flag ONでqueryが失敗した場合は終了し、誤ったfallback位置を使わない。

## Split位置移行

- `splitObject`は`Promise<void>`を返す。query opt-in中は現在のtimeline raw秒と対象object idでRust `localPosition`を取得し、既存の分割・keyframe同期・Batch commandを実行する。flag OFF時は従来のTS直接評価を維持する。
- resident ack後・query response後にscene、selected id/selectedIds、時刻、settings/layers/objects参照、target object同一性、layer lockを再検証する。どれかが変わればstate/historyを変更しない。
- toolbarとcontext menuは`void splitObject()`で非同期actionを起動する。query失敗はaction内部で記録・表示し、TS評価にfallbackしない。成功時はRemove + Add×2を1つのUndo Batchとして記録する。

## 未対応範囲

- scene hit-test/selectionへの位置query移行は別タスクとして残る。
- 実Electron/CDPによるVision trackingとsplit操作の統合確認は未実施。純粋位置計算、query/RPC、store stale guard、既存PropertyPanel境界をVitestとTypeScript型チェックで確認している。

## 検証

- `cargo test --manifest-path rust-core/Cargo.toml --test editable_scene_position_query`
- `cargo test --manifest-path rust-backend/Cargo.toml --bin uxfd-rust-backend graph_only_replace_builds_and_retains_raw_graph_for_unquantised_queries`
- `npx vitest run src/utils/visionTrackingKeyframes.test.ts src/utils/rustBackendSceneControl.test.ts src/utils/rustBackendSceneControlBoundary.test.ts src/utils/rustScenePositionQueryRevision.test.ts src/components/PropertyPanelBoundary.test.ts src/components/PropertyPanelPlaybackIsolation.test.ts`
- `npx vitest run src/store/useStoreSplitPositionQuery.test.ts src/store/useStoreCommandConversion.test.ts`
- `npx tsc --noEmit`
