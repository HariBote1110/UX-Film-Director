# Scene Build P2a: basic kind 群の常駐 preview cut-over

## 決定

- `UXFD_SCENE_BUILDER_CUTOVER` は既定OFFのカンマ区切り kind 群フラグとした。P2aで有効化する `basic` は、Rust builder が shape/text/image/video/PSD から生成する `SolidColour`、`GeneratedGradient`、`GeneratedShape`、`Text`、`Image`、`Video`、`Psd` の7 `MediaKind` に限る。
- `generated`、`audio`、`getcolor`、`group_control` は将来群として構文上受理するが、P2aでは有効化しても切替対象にしない。未知名は起動時にエラーを標準エラーへ記録し、切替を無効化する。
- `scene.replace` は editable graph があり、`basic` が有効で、Rust builder の `residentEligible` が真で、Project/media と全clip参照mediaが許可kindだけの場合にだけRust生成のProject/mediaをresident sessionへ保持する。それ以外は従来どおりTS送信値を保持する。
- 応答に `sceneSource` と任意の `sceneFallbackReason` を追加した。rendererは診断として受け渡すだけで、cut-over可否を判断しない。

## 制約

- rendererは `VITE_UXFD_RUST_EDITABLE_SCENE_DUAL_RUN=1` または空でない `VITE_UXFD_RUST_SCENE_BUILDER_CUTOVER` のときにだけeditable graphを添付する。Electron側ではbackend flagをsidecar子プロセスへ明示転送する。
- export、direct snapshot caller、native overlay、既存TS serializerはこのスライスでは変更しない。
