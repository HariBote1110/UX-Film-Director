# P4 編集用位置query基盤とキー追加の初回移行

## 決定

- 任意秒の位置は`scene.evaluate`のframe snapshotから逆算せず、revision付きの
  `EditableSceneGraph`を保持するRust sessionに対して`scene.query_object_positions`
  を呼ぶ。`scene.replace`は従来の`project`+`media`を維持しつつ、graph-only payload
  も受け付ける。graph-onlyはRust builderを必ず実行し、非対応診断は`-32065`で
  rejectする。TS側評価へはfallbackしない。
- query identityは`sceneId`/`revision`/`requestId`/`objectId`/`timeSeconds`。
  `timeSeconds`はAPI境界でf64を保持・echoし、座標など描画値は既存のf32契約を保つ。
  Rust responseは`typed_to_value_preserving_f32`でJSON化して、f32由来の桁ノイズを
  UIへ戻さない。TS clientもqueryごとのidentityを厳密に照合する。
- key追加の初回移行は`VITE_UXFD_RUST_EDIT_POSITION_QUERY=1`のopt-inとし、現行
  scene graphが`Viewport`から送信され、同revisionのresident ackを受けるまで待つ。
  graph更新によるsupersede、scene失敗、controller dispose、graph送信無効時は
  pending actionをreject/settleする。query応答後もscene/対象/time/graph参照を再検査し、
  操作中に変わっていたら挿入を中止する。
- TSのkeyframe挿入に使う値はobject-localのlogical origin。textのpadding補正前の
  座標を維持する。Rust world値は可視対象layerとRust group builderの数値layer差・
  hidden layer規則に合わせる。TS側の別transform graphは追加しない。

## 完了した初回範囲と残作業

- Rust coreの任意秒query、backendのgraph-only置換/raw graph保持/query RPC、Electron
  bridge配線、およびPropertyPanelのキー追加opt-in移行が完了。
- `worldPosition`はRust builderのgroup translationと共通vibration helperを合成し、
  `groupTranslation`はvibrationを含めない親groupの平行移動だけを返す。text-decoration
  のVision移行はこの値をoverlayのworld座標へ足す契約で進める。
- PropertyPanelのキー追加は、同revisionのresident ackを待ってから`localPosition`を使う。
  React closureから遅れている可能性のあるobject値を避け、action開始時にstoreからcaptureした
  objectだけでclamp/keyframe/easingを組み立てる。非同期中にscene/object/time/graphが変われば
  適用しない。Rust位置queryのopt-in flagはraw graph送信と一緒に有効化する。
- このworktreeからnative overlayを無効にしたElectronを起動し、CDPで実PropertyPanelの
  「＋キー」を操作した。raw graph resident (`sceneSource: rust`) の状態でt=2.5に(150,105)、
  t=5に(200,130)が追加されることを確認。新規objectでt=2.5をクリック直後にt=4へ変更した
  場合はt=2.5/t=4のどちらも挿入されず、通常のt=5追加は成功した。
- split位置・vision tracking任意時刻・scene hit-test/selectionへの移行は別単位として残る。

## 検証

- `cargo test --manifest-path rust-core/Cargo.toml --test editable_scene_position_query`
- `cargo test --manifest-path rust-backend/Cargo.toml --bin uxfd-rust-backend graph_only_replace_builds_and_retains_raw_graph_for_unquantised_queries`
- `npx tsc --noEmit`
- `npm test -- --run src/utils/rustBackendSceneControl.test.ts src/utils/rustBackendSceneControlBoundary.test.ts src/utils/rustScenePositionQueryRevision.test.ts`
- `npx vitest run src/utils/rustBackendSceneControl.test.ts src/utils/rustBackendSceneControlBoundary.test.ts src/utils/rustScenePositionQueryRevision.test.ts src/utils/sharedRendererScenePreviewScheduler.test.ts`
- Electron/CDP manual check: raw graph resident, ordinary key insertion and immediate playhead-change stale guard
