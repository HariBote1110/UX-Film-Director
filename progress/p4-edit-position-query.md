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

## 現在の範囲と制約

- Rust coreの任意秒query、backendのgraph-only置換/raw graph保持/query RPC、Electron
  bridge配線、およびPropertyPanelのキー追加opt-in移行を実装中。
- groupのworld transformはRust builderと一致するが、振動offsetはtext-decoration側の
  共通Rust helperをこのworktreeへ取り込めていないため、worldPositionの振動一致は
  追加確認が必要。最初のUI移行はlocalPositionを使う。
- Chromeのbrowser automation providerが利用できず、実ブラウザでボタンを押す操作確認は
  未実施。registry、query client、selection/time/scene/graph identity guardのVitestと
  TypeScript型チェックで検証している。
- split位置・vision tracking任意時刻・scene hit-test/selectionへの移行は別単位として残る。

## 検証

- `cargo test --manifest-path rust-core/Cargo.toml --test editable_scene_position_query`
- `cargo test --manifest-path rust-backend/Cargo.toml --bin uxfd-rust-backend graph_only_replace_builds_and_retains_raw_graph_for_unquantised_queries`
- `npx tsc --noEmit`
- `npm test -- --run src/utils/rustBackendSceneControl.test.ts src/utils/rustBackendSceneControlBoundary.test.ts src/utils/rustScenePositionQueryRevision.test.ts`
