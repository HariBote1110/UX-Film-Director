# 進捗ログ

## 2026-06-22
- AviUtlPackV4移植ゴールの運用スコープを更新した。
- ツール上のactive goal本文は直接差し替えできないため、`markdown/Implementation_Plan.md` と `markdown/Task.md` に現在の作業ゴールを明文化した。
- 直近スコープは `GetColor`、`hksy`（ユーザー表記: hsky）、`script/93` とし、Timeline追加、保存/読込、Rust/WebGPU preview/export、境界テスト、画素テストまで通すことを完了条件にした。
- 次候補として、93 Sphere(DrawPixel)、93 SphericalField、GetColorの元画像サンプリング寄り拡張を優先する。

## 2026-06-22
- 93 SimpleTubeトーラスをRust生成プリセットへ追加した。
- Red: `93 SimpleTubeトーラス` がfactory、Timeline右クリックメニュー、AviUtlPackV4カタログ、Rust scene snapshot、shared renderer native media、Rust backend画素生成を通る契約を追加した。
- Green: `SimpleTubeObject` に `colourPattern` / `fogStrength` / `fogColour` を追加し、`GeneratedSimpleTube` payloadへ `colour_pattern` / `fog_strength` / `fog_colour` を渡すようにした。
- Green: `buildAviUtlSimpleTubeTorusObject` と Timeline右クリックメニューの `93 SimpleTubeトーラスを追加` / `Add 93 SimpleTube Torus` を追加した。
- Green: Rust backendでSimpleTubeの色パターン `single` / `ring` / `depth` とfog色寄せを処理し、トーラス派生で反映するようにした。
- 版を `0.1.1-Beta-304a` に更新した。
- 検証: `npm test -- --run src/utils/simpleTubeObjectFactory.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/aviutlPackFeatureCatalog.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/projectFile.test.ts src/utils/packageScripts.test.ts --reporter=dot` は89件成功した。
- 検証: `cargo test --manifest-path rust-backend/Cargo.toml generated_simple_tube_source_frame -- --nocapture` は2件成功した。
- 検証: `npx tsc --noEmit` は既知の `ThreeStageViewport.tsx` のthree型、`mp4box` 型、`heavyEffectsStress.test.ts` の `PositionKeyframe` 型エラーのみで、今回のSimpleTubeトーラス由来の型エラーは出ていない。
- 次はSphere系、SphericalField、またはGetColorの元画像サンプリング/Field/Twist方向へ進む。

## 2026-06-22
- 93 SimpleTubeをRust生成プリセットへ追加した。
- Red: `93-simple-tube` がAviUtlPackV4カタログ、Timeline右クリックメニュー、factory、保存/読込、Rust scene snapshot、shared renderer native media、rust-core schema、Rust backend画素生成を通る契約を追加した。
- Green: `SimpleTubeObject` と `GeneratedSimpleTube` media kindを追加し、`simple-tube-93` source JSONで半径、奥行き、分割数、リング数、ねじれ、ランダム度、線幅、色、トーラス指定をRustへ渡すようにした。
- Green: Rust backendで透明背景にチューブ状リング、奥行き線、中心補助線をRGBA生成する初期互換実装を追加した。
- Green: Timeline右クリックメニューに `93 SimpleTubeを追加` / `Add 93 SimpleTube` を追加した。
- 版を `0.1.1-Beta-303a` に更新した。
- 検証: `npm test -- --run src/utils/simpleTubeObjectFactory.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/aviutlPackFeatureCatalog.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/projectFile.test.ts src/utils/projectExportFrameCanvas.test.ts src/utils/pixiGeneratedEffectCutover.test.ts src/utils/packageScripts.test.ts --reporter=dot` は124件成功した。
- 検証: `cargo test --manifest-path rust-core/Cargo.toml --test media_schema -- --nocapture` は30件成功した。
- 検証: `cargo test --manifest-path rust-backend/Cargo.toml generated_simple_tube_source_frame_renders_tube_lines -- --nocapture` は1件成功した。
- 検証: `npx tsc --noEmit` は既知の `ThreeStageViewport.tsx` のthree型、`mp4box` 型、`heavyEffectsStress.test.ts` の `PositionKeyframe` 型エラーのみで、今回のSimpleTube由来の型エラーは出ていない。
- 次はSimpleTube2の色パターン/fog近似、Sphere系、またはGetColorの元画像サンプリング/Field/Twist方向へ進む。

## 2026-06-22
- 93領域枠(楕円)/(角落ち)をRust生成プリセットへ追加した。
- Red: 93領域枠の `ellipse` / `cut_corner` 派生がfactory、Rust scene snapshot、shared renderer native media、Rust backend画素生成を通る契約を追加した。
- Green: `RegionFrameObject` に `shape` / `cornerCut` を追加し、既存の `GeneratedRegionFrame` payloadへ `shape` と `corner_cut` を渡せるようにした。
- Green: Rust backendで矩形、楕円、角落ちを描き分け、楕円/角落ちの外側を透明、内側を半透明背景、枠を不透明色として生成するようにした。
- Green: Timeline右クリックメニューに `93領域枠(楕円)を追加` / `Add 93 Ellipse Region Frame` と `93領域枠(角落ち)を追加` / `Add 93 Cut-Corner Region Frame` を追加した。
- 版を `0.1.1-Beta-302a` に更新した。
- 検証: `npm test -- --run src/utils/regionFrameObjectFactory.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/aviutlPackFeatureCatalog.test.ts src/utils/projectFile.test.ts src/utils/packageScripts.test.ts --reporter=dot` は86件成功した。
- 検証: `cargo test --manifest-path rust-backend/Cargo.toml generated_region_frame_source_frame -- --nocapture` は3件成功した。
- 検証: `cargo test --manifest-path rust-core/Cargo.toml --test media_schema -- --nocapture` は29件成功した。
- 検証: `npx tsc --noEmit` は既知の `ThreeStageViewport.tsx` のthree型、`mp4box` 型、`heavyEffectsStress.test.ts` の `PositionKeyframe` 型エラーのみで、今回の93領域枠派生由来の型エラーは出ていない。
- 次は93 SimpleTube/Sphere系、またはGetColorの元画像サンプリング/Field/Twist方向へ進む。

## 2026-06-22
- 93領域枠をRust生成プリセットへ追加した。
- Red: `93-region-frame` がAviUtlPackV4カタログ、Timeline右クリックメニュー、factory、Rust scene snapshot、shared renderer native media、rust-core schema、Rust backend画素生成を通る契約を追加した。
- Green: `RegionFrameObject` と `GeneratedRegionFrame` media kindを追加し、`region-frame-93` source JSONで枠線幅、背景不透明度、枠色、背景色をRustへ渡すようにした。
- Green: Rust backendで半透明背景と不透明枠をRGBA生成するようにした。
- Green: Timeline右クリックメニューに `93領域枠を追加` / `Add 93 Region Frame` を追加した。
- 版を `0.1.1-Beta-301a` に更新した。
- 検証: `npm test -- --run src/utils/regionFrameObjectFactory.test.ts src/utils/getColorDotFieldObjectFactory.test.ts src/utils/hksyCheckerGridObjectFactory.test.ts src/utils/aviutlPackFeatureCatalog.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/projectFile.test.ts src/utils/projectExportFrameCanvas.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/pixiGeneratedEffectCutover.test.ts src/utils/packageScripts.test.ts --reporter=dot` は130件成功した。
- 検証: `cargo test --manifest-path rust-core/Cargo.toml --test media_schema -- --nocapture` は29件成功した。
- 検証: `cargo test --manifest-path rust-backend/Cargo.toml generated_region_frame_source_frame -- --nocapture` は1件成功した。
- 検証: `npx tsc --noEmit` は既知の `ThreeStageViewport.tsx` のthree型、`mp4box` 型、`heavyEffectsStress.test.ts` の `PositionKeyframe` 型エラーのみで、今回の93領域枠由来の型エラーは出ていない。
- 次は93系のSimpleTube/Sphere系、またはGetColorの元画像サンプリング/Field/Twist方向へ進む。

## 2026-06-22
- GetColor V2R枠線四角ドットフィールドを標準プリセットへ追加した。
- Red: `getcolor-v2r-outlined-square-dots` がAviUtlPackV4カタログ、Timeline右クリックメニュー、factory、Rust scene snapshot、Rust backend画素生成を通る契約を追加した。
- Green: 既存の `GeneratedGetColorDots` の `dot_shape: "square"` / `stroke_width` を使う標準プリセットとして、factoryとTimeline右クリックメニューへ露出した。
- Green: Rust backendの枠線付き四角ドット描画を画素テストで確認した。
- 版を `0.1.1-Beta-300a` に更新した。
- 検証: `npm test -- --run src/utils/getColorDotFieldObjectFactory.test.ts src/utils/hksyCheckerGridObjectFactory.test.ts src/utils/aviutlPackFeatureCatalog.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/projectFile.test.ts src/utils/projectExportFrameCanvas.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/pixiGeneratedEffectCutover.test.ts src/utils/packageScripts.test.ts --reporter=dot` は128件成功した。
- 検証: `cargo test --manifest-path rust-backend/Cargo.toml generated_getcolor_dots_source_frame -- --nocapture` は3件成功した。
- 検証: `npx tsc --noEmit` は既知の `ThreeStageViewport.tsx` のthree型、`mp4box` 型、`heavyEffectsStress.test.ts` の `PositionKeyframe` 型エラーのみで、今回のGetColor枠線四角ドット由来の型エラーは出ていない。
- 次はGetColorの元画像サンプリング/Field/Twist方向、または93系の残候補へ進む。

## 2026-06-22
- GetColor V2R菱形ドットフィールドをRust生成プリセットへ追加した。
- Red: `getcolor-v2r-diamond-dots` がAviUtlPackV4カタログ、Timeline右クリックメニュー、factory、保存/読込、Rust scene snapshot、shared renderer native media、Rust backend画素生成を通る契約を追加した。
- Green: `GetColorDotFieldObject` に `dotShape` / `strokeWidth` を追加し、`GeneratedGetColorDots` のJSON payloadへ `dot_shape` / `stroke_width` を渡すようにした。
- Green: Rust backendでGetColorドットを `circle` / `square` / `diamond` として描き分けられるようにした。
- Green: Timeline右クリックメニューに `GetColor V2R菱形ドットフィールドを追加` / `Add GetColor V2R Diamond Dots` を追加した。
- 版を `0.1.1-Beta-299a` に更新した。
- 検証: `npm test -- --run src/utils/getColorDotFieldObjectFactory.test.ts src/utils/hksyCheckerGridObjectFactory.test.ts src/utils/aviutlPackFeatureCatalog.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/projectFile.test.ts src/utils/projectExportFrameCanvas.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/pixiGeneratedEffectCutover.test.ts src/utils/packageScripts.test.ts --reporter=dot` は126件成功した。
- 検証: `cargo test --manifest-path rust-backend/Cargo.toml generated_getcolor_dots_source_frame -- --nocapture` は2件成功した。
- 検証: `npx tsc --noEmit` は既知の `ThreeStageViewport.tsx` のthree型、`mp4box` 型、`heavyEffectsStress.test.ts` の `PositionKeyframe` 型エラーのみで、今回のGetColor菱形ドット由来の型エラーは出ていない。
- 次はGetColorの元画像サンプリング/Field/Twist方向、または93系の残候補へ進む。

## 2026-06-22
- hksyライン（アンカー指定）をRust生成プリセットへ追加した。
- Red: `hksy-anchor-line` がAviUtlPackV4カタログ、Timeline右クリックメニュー、factory、保存/読込、Rust scene snapshot、shared renderer native media、Rust backend画素生成を通る契約を追加した。
- Green: `HksyCheckerGridObject.pattern` に `anchor-line` を追加し、アンカー点、丸端、最大接続距離をRust payloadへ渡すようにした。
- Green: Rust backendで透明背景に太さ付きアンカー折れ線をRGBA生成するようにした。
- Green: Timeline右クリックメニューに `hksyライン（アンカー指定）を追加` / `Add hksy Anchor Line` を追加した。
- 版を `0.1.1-Beta-298a` に更新した。
- 検証: `npm test -- --run src/utils/hksyCheckerGridObjectFactory.test.ts src/utils/aviutlPackFeatureCatalog.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/projectFile.test.ts src/utils/projectExportFrameCanvas.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/pixiGeneratedEffectCutover.test.ts src/utils/packageScripts.test.ts --reporter=dot` は121件成功した。
- 検証: `cargo test --manifest-path rust-backend/Cargo.toml generated_hksy_checker_grid_source_frame -- --nocapture` は5件成功した。
- 検証: `npx tsc --noEmit` は既知の `ThreeStageViewport.tsx` のthree型、`mp4box` 型、`heavyEffectsStress.test.ts` の `PositionKeyframe` 型エラーのみで、今回のhksyライン（アンカー指定）由来の型エラーは出ていない。
- 次はGetColor画像サンプリング寄り拡張、または93系の残候補へ進む。

## 2026-06-22
- hksyグリッドをRust生成プリセットへ追加した。
- Red: `hksy-measured-grid` がAviUtlPackV4カタログ、Timeline右クリックメニュー、factory、保存/読込、Rust scene snapshot、shared renderer native media、Rust backend画素生成を通る契約を追加した。
- Green: `HksyCheckerGridObject.pattern` に `measured-grid` を追加し、`separateInterval` / `separateLineWidth` をRust payloadへ渡すようにした。
- Green: Rust backendで下地色、通常線、区切り線を持つhksyグリッドをRGBA生成するようにした。
- Green: Timeline右クリックメニューに `hksyグリッドを追加` / `Add hksy Grid` を追加した。
- 版を `0.1.1-Beta-297a` に更新した。
- 検証: `npm test -- --run src/utils/hksyCheckerGridObjectFactory.test.ts src/utils/aviutlPackFeatureCatalog.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/projectFile.test.ts src/utils/projectExportFrameCanvas.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/pixiGeneratedEffectCutover.test.ts src/utils/packageScripts.test.ts --reporter=dot` は118件成功した。
- 検証: `cargo test --manifest-path rust-backend/Cargo.toml generated_hksy_checker_grid_source_frame -- --nocapture` は4件成功した。
- 検証: `npx tsc --noEmit` は既知の `ThreeStageViewport.tsx` のthree型、`mp4box` 型、`heavyEffectsStress.test.ts` の `PositionKeyframe` 型エラーのみで、今回のhksyグリッド由来の型エラーは出ていない。
- 次はhksyライン（アンカー指定）、GetColor画像サンプリング寄り拡張、または93系の残候補へ進む。

## 2026-06-22
- hksy菱形をRust生成プリセットへ追加した。
- Red: `hksy-diamond` がAviUtlPackV4カタログ、Timeline右クリックメニュー、factory、保存/読込、Rust scene snapshot、shared renderer native media、Rust backend画素生成を通る契約を追加した。
- Green: `HksyCheckerGridObject.pattern` を追加し、`pattern: "diamond"` を `GeneratedHksyCheckerGrid` のJSON payloadへ渡すようにした。
- Green: Rust backendで `pattern == "diamond"` の場合、透明背景に太さ付き菱形ポリゴンをRGBA生成するようにした。
- Green: Timeline右クリックメニューに `hksy菱形を追加` / `Add hksy Diamond` を追加した。
- 版を `0.1.1-Beta-296a` に更新した。
- 検証: `npm test -- --run src/utils/hksyCheckerGridObjectFactory.test.ts src/utils/aviutlPackFeatureCatalog.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/projectFile.test.ts src/utils/projectExportFrameCanvas.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/pixiGeneratedEffectCutover.test.ts src/utils/packageScripts.test.ts --reporter=dot` は115件成功した。
- 検証: `cargo test --manifest-path rust-backend/Cargo.toml generated_hksy_checker_grid_source_frame -- --nocapture` は3件成功した。
- 検証: `npx tsc --noEmit` は既知の `ThreeStageViewport.tsx` のthree型、`mp4box` 型、`heavyEffectsStress.test.ts` の `PositionKeyframe` 型エラーのみで、今回のhksy菱形由来の型エラーは出ていない。
- 次はhksyのグリッド/ラインアンカー系、GetColor画像サンプリング寄り拡張、または93系の残候補へ進む。

## 2026-06-22
- hksy複数色チェッカーをRust生成プリセットへ追加した。
- Red: `hksy-multi-colour-checker` がAviUtlPackV4カタログ、Timeline右クリックメニュー、factory、保存/読込、Rust scene snapshot、shared renderer native media、Rust backend画素生成を通る契約を追加した。
- Green: `HksyCheckerGridObject.paletteColours` を追加し、`GeneratedHksyCheckerGrid` のJSON payloadへ `palette_colours` を渡すようにした。
- Green: Rust backendで `palette_colours` 指定時にチェッカータイルへ2〜16色のpaletteを循環適用するようにした。
- Green: Timeline右クリックメニューに `hksy複数色チェッカーを追加` / `Add hksy Multi-Colour Checker` を追加した。
- 版を `0.1.1-Beta-295a` に更新した。
- 検証: `npm test -- --run src/utils/hksyCheckerGridObjectFactory.test.ts src/utils/aviutlPackFeatureCatalog.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/projectFile.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/packageScripts.test.ts --reporter=dot` は74件成功した。
- 検証: `cargo test --manifest-path rust-backend/Cargo.toml generated_hksy_checker_grid_source_frame -- --nocapture` は2件成功した。
- 検証: `npx tsc --noEmit` は既知の `ThreeStageViewport.tsx` のthree型、`mp4box` 型、`heavyEffectsStress.test.ts` の `PositionKeyframe` 型エラーのみで、今回のhksy複数色チェッカー由来の型エラーは出ていない。
- 次はhksyマスク系、GetColor画像サンプリング寄り拡張、または93系の残候補へ進む。

## 2026-06-22
- hksy直線をRust生成プリセットへ追加した。
- Red: `hksy-line` がAviUtlPackV4カタログへ入り、Timeline右クリックメニューとfactoryから `hksy 直線` を追加できる契約を作った。
- Green: `buildHksyLineObject` を追加し、既存の `hksy_checker_grid` / `GeneratedHksyCheckerGrid` 経路を使う線のみプリセットとして標準搭載した。
- Green: Timeline右クリックメニューに `hksy直線を追加` / `Add hksy Lines` を追加した。
- 版を `0.1.1-Beta-294a` に更新した。
- 検証: `npm test -- --run src/utils/hksyCheckerGridObjectFactory.test.ts src/utils/aviutlPackFeatureCatalog.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/projectFile.test.ts src/utils/projectExportFrameCanvas.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/pixiGeneratedEffectCutover.test.ts --reporter=dot` は104件成功した。
- 検証: `cargo test --manifest-path rust-backend/Cargo.toml generated_hksy_checker_grid_source_frame_contains_checker_cells_and_grid -- --nocapture` は1件成功した。
- 検証: `npm test -- --run src/utils/packageScripts.test.ts --reporter=dot` は6件成功した。
- 検証: `npx tsc --noEmit` は既知の `ThreeStageViewport.tsx` のthree型、`mp4box` 型、`heavyEffectsStress.test.ts` の `PositionKeyframe` 型エラーのみで、今回変更由来の型エラーは出ていない。
- 次はhksy複数色チェッカー、またはGetColorの画像サンプリング寄り拡張へ進む。

## 2026-06-22
- AviUtl優先効果のexport E2E固有画素検査を追加した。
- Red: `test:video-export:e2e` が、GetColor V2R、hksyチェッカー/グリッド、93 SpotLight、93音声玉それぞれの固有画素検査フィールドを持つ契約を追加した。
- Green: E2E専用hookでAviUtl優先効果を画面上に分離配置し、export後のRGBAフレームから領域別に代表色を検査するようにした。
- Green: `generatedEffectsFrameInspection` に `getColorCyanPixelCount`、`hksyDarkCellPixelCount`、`spotLightWarmPixelCount`、`audioSphereCyanPixelCount` を追加した。
- 版を `0.1.1-Beta-293d` に更新した。
- 検証: `npm test -- --run src/utils/packageScripts.test.ts --reporter=dot` は6件成功した。
- 検証: `UXFD_VIDEO_EXPORT_E2E_ADD_MIXED_MEDIA=1 UXFD_VIDEO_EXPORT_E2E_ADD_AVIUTL_GENERATED_EFFECTS=1 UXFD_VIDEO_EXPORT_E2E_DURATION_SECONDS=1 UXFD_VIDEO_EXPORT_E2E_TIMEOUT_MS=240000 npm run test:video-export:e2e` は成功。60/60フレームを書き出し、`runtimeErrors` は空だった。
- 検証: 実E2Eの固有画素検査は `getColorCyanPixelCount=14080`、`hksyDarkCellPixelCount=6405`、`spotLightWarmPixelCount=2393`、`audioSphereCyanPixelCount=1903` で、各最小閾値を上回った。
- 検証: `npx tsc --noEmit` は既知の `ThreeStageViewport.tsx` のthree型、`mp4box` 型、`heavyEffectsStress.test.ts` の `PositionKeyframe` 型エラーのみで、今回変更由来の型エラーは出ていない。
- 次はAviUtlPackV4の次候補を選び、Rust生成効果またはRust/WebGPU effectへ追加する。

## 2026-06-22
- Rust所有cutoverでPixi WebGPU context破壊を回避した。
- Red: Rust/shared renderer所有のSolidColour shape cutover時と、Rust video専有時に、PixiのGPU contextをdestroyしない契約を追加した。
- Green: shape/video cutoverを `removeChildren()` + `destroy({ context: true })` から、生成効果と同じ `hidePixiChildrenForSharedRendererCutover` に切り替えた。
- 版を `0.1.1-Beta-293c` に更新した。
- 検証: `npm test -- --run src/utils/pixiRenderHelperGeneratedEffectCutover.test.ts src/utils/viewportRustVideoOnlyBoundary.test.ts src/utils/pixiSolidColourCutover.test.ts --reporter=dot` は30件成功した。
- 検証: `UXFD_VIDEO_EXPORT_E2E_ADD_MIXED_MEDIA=1 UXFD_VIDEO_EXPORT_E2E_ADD_AVIUTL_GENERATED_EFFECTS=1 UXFD_VIDEO_EXPORT_E2E_DURATION_SECONDS=1 UXFD_VIDEO_EXPORT_E2E_TIMEOUT_MS=240000 npm run test:video-export:e2e` は成功。60/60フレームを書き出し、生成効果画素検査が通り、`runtimeErrors` は空だった。
- 検証: `npx tsc --noEmit` は既知の `ThreeStageViewport.tsx` のthree型、`mp4box` 型、`heavyEffectsStress.test.ts` の `PositionKeyframe` 型エラーのみで、今回変更由来の型エラーは出ていない。
- 次は画素検査対象をGetColor/hksy/SpotLight/93音声玉固有色や形状へ広げるか、次のAviUtlPackV4優先候補をRust生成効果へ追加する。

## 2026-06-22
- 93音声玉source JSONをRust export境界で受理できるようにした。
- Red: 93音声玉の `audio-sphere-93` source JSONが、波形専用の `thickness` / `amplitude` を含まなくてもRust境界で受理される契約を追加した。
- Green: `AudioWaveformSource` の `thickness` / `amplitude` をgenerator別の任意フィールドへ変更し、`audio-waveform-r` の場合だけ必須検証するようにした。
- Green: native-wgpu-rendererの93音声玉テストを、実際のTypeScript snapshotが出す最小JSONへ寄せた。
- 版を `0.1.1-Beta-293b` に更新した。
- 検証: `cargo test --manifest-path rust-core/Cargo.toml --test audio_waveform_scene -- --nocapture` は3件成功した。
- 検証: `cargo test --manifest-path native-wgpu-renderer/Cargo.toml native_wgpu_renders_generated_audio_sphere_frame_from_audio_samples -- --nocapture` は1件成功した。
- 検証: `cargo test --manifest-path rust-backend/Cargo.toml --test decode_control_plane native_render -- --nocapture` は22件成功した。
- 次は実Electron E2Eで、GetColor / hksy / 93優先効果を混在させた動画exportが通るか再確認する。

## 2026-06-22
- GetColor V2RドットフィールドをRust生成オブジェクトへ追加した。
- Red: `GetColor V2R` のドットフィールドがタイムライン挿入、保存/読込、Rust scene snapshot、shared renderer native media、Pixi cutover、Rust core schema境界、Rust backendラスタ生成を通る契約を追加した。
- Green: `getcolor_dot_field` TimelineObjectと `GeneratedGetColorDots` media kindを追加し、右クリックメニューから「GetColor V2Rドットフィールドを追加」できるようにした。
- Green: Rust backendで背景色上に、U/V位置・疑似明度・乱数を使った前景/二次色ドットフィールドをRGBA生成する実装を入れた。
- 版を `0.1.1-Beta-289a` に更新した。
- 検証: `npm test -- --run src/utils/getColorDotFieldObjectFactory.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/pixiGeneratedEffectCutover.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/projectFile.test.ts src/utils/projectExportFrameCanvas.test.ts --reporter=dot` は97件成功した。
- 検証: `cargo test --manifest-path rust-core/Cargo.toml --test media_schema rust_core_accepts_generated_getcolor_dots_media_kind_at_the_json_boundary -- --nocapture` は1件成功した。
- 検証: `cargo test --manifest-path rust-backend/Cargo.toml generated_getcolor_dots_source_frame_contains_dot_field_and_background -- --nocapture` は1件成功した。
- 残課題: 現時点の `GeneratedGetColorDots` は画像サンプリング前の内蔵ドットフィールド互換。元画像の色/透明度を直接サンプルする本格GetColor挙動、Field/Twist/ColorShift/AudioReactは後続で段階的に接続する。

## 2026-06-22
- hksyチェッカー/グリッドをRust生成オブジェクトへ追加した。
- Red: `@hksy` のチェッカー/グリッドがタイムライン挿入、保存/読込、Rust scene snapshot、shared renderer native media、Pixi cutover、Rust core schema境界を通る契約を追加した。
- Green: `hksy_checker_grid` TimelineObjectと `GeneratedHksyCheckerGrid` media kindを追加し、Rust backendでチェッカーセルとグリッド線をRGBA生成する実装を入れた。
- Green: 右クリックメニューに「hksyチェッカー/グリッドを追加」を追加し、export frame source policyでもnative render mediaとして扱うようにした。
- 版を `0.1.1-Beta-288a` に更新した。
- 検証: `npm test -- --run src/utils/hksyCheckerGridObjectFactory.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/pixiGeneratedEffectCutover.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/projectFile.test.ts src/utils/projectExportFrameCanvas.test.ts --reporter=dot` は96件成功した。
- 検証: `cargo test --manifest-path rust-core/Cargo.toml --test media_schema rust_core_accepts_generated_hksy_checker_grid_media_kind_at_the_json_boundary -- --nocapture` は1件成功した。
- 検証: `cargo test --manifest-path rust-backend/Cargo.toml generated_hksy_checker_grid_source_frame_contains_checker_cells_and_grid -- --nocapture` は1件成功した。
- 残課題: `@hksy` の直線、複数色チェッカー、マスク系までは未移植。次は `GetColor V2R` のドットフィールド、または `93` の音声玉に進む。

## 2026-06-22
- GetColor / hksy / 93系を優先実装レーンへ追加した。
- Red: `GetColor V2R`、`@hksy`、`script/93` の代表候補がAviUtlPackV4カタログと直近ロードマップへ入る契約を追加した。
- Green: `getcolor-v2r-dot-field`、`93-audio-sphere`、`93-delay-move`、`93-spotlight`、`hksy-checker-grid` をカタログへ追加した。
- Green: 棚卸しとImplementation Planで、GetColor / hksy / 93系をP1優先レーンへ移した。
- 検証: `npm test -- --run src/utils/aviutlPackFeatureCatalog.test.ts --reporter=dot` は4件成功した。
- 次は `93-audio-sphere` か `getcolor-v2r-dot-field` の実体をRed/Greenで追加する。音声連動の価値が高いので、先に `93-audio-sphere` を既存audio waveformサンプル取得経路へ接続するのが有力。

## 2026-06-22
- Tim簡易トーンカーブをRust生成オブジェクトへ追加した。
- Red: `script/てぃむ/簡易トーンカーブ.obj` を、Rust `GeneratedToneCurve` mediaとして扱う境界契約を作った。
- Green: `ToneCurveObject` と `buildAviUtlToneCurveObject` を追加し、Timeline右クリックから `簡易トーンカーブを追加` / `Add Tone Curve` で置けるようにした。
- Green: `rustSceneSnapshot` / shared renderer native support / Rust core schema / Rust backendに `GeneratedToneCurve` を追加した。
- Green: Rust backendで不透明背景、グリッド、線幅付きトーンカーブを持つ決定的なフレームを生成できるようにした。
- Green: `tim-simple-tone-curve` をPackカタログ/棚卸し文書へ追加した。
- 版を `0.1.1-Beta-287a` に更新した。
- 検証: `npm test -- --run src/utils/toneCurveObjectFactory.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/aviutlPackFeatureCatalog.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/pixiGeneratedEffectCutover.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/projectFile.test.ts src/utils/projectExportFrameCanvas.test.ts --reporter=dot` は98件成功した。
- 検証: `cargo test --manifest-path rust-core/Cargo.toml --test media_schema rust_core_accepts_generated_tone_curve_media_kind_at_the_json_boundary -- --nocapture` は1件成功した。
- 検証: `cargo test --manifest-path rust-backend/Cargo.toml generated_tone_curve_source_frame_contains_grid_and_curve -- --nocapture` は1件成功した。
- 検証: 対象名で絞った `npx tsc --noEmit` は今回変更ファイル由来のエラーなし。既存の `ThreeStageViewport.tsx` Three.js型定義不足、`mp4box` 型定義不足、`heavyEffectsStress.test.ts` の `PositionKeyframe` 未定義のみ検出した。
- 残課題: 現時点の `GeneratedToneCurve` は表示用UIパネルとしての互換再実装。実際の色補正フィルタとして入力映像へトーンカーブを適用する処理は、後続のRust/WebGPU filter拡張で扱う。

## 2026-06-22
- SSD多角形_震えるをRust生成オブジェクトへ追加した。
- Red: `script/ANM/ANM_ssd/多角形_震える.obj` を、Rust `GeneratedShakingPolygon` mediaとして扱う境界契約を作った。
- Green: `ShakingPolygonObject` と `buildAviUtlShakingPolygonObject` を追加し、Timeline右クリックから `多角形_震えるを追加` / `Add Shaking Polygon` で置けるようにした。
- Green: `rustSceneSnapshot` / shared renderer native support / Rust core schema / Rust backendに `GeneratedShakingPolygon` を追加した。
- Green: Rust backendで透明背景、線幅付き多角形アウトライン、任意塗り、フレーム依存の頂点揺れを持つ決定的なフレームを生成できるようにした。
- Green: `ssd-shaking-polygon` をPackカタログ/棚卸し文書へ追加した。
- 版を `0.1.1-Beta-286a` に更新した。
- 検証: `npm test -- --run src/utils/shakingPolygonObjectFactory.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/aviutlPackFeatureCatalog.test.ts src/utils/pixiGeneratedEffectCutover.test.ts src/utils/projectFile.test.ts src/utils/projectExportFrameCanvas.test.ts src/e2e/allReadableMedia.e2e.test.ts --reporter=dot` は98件成功した。
- 検証: `cargo test --manifest-path rust-core/Cargo.toml --test media_schema -- --nocapture` は24件成功した。
- 検証: `cargo test --manifest-path rust-backend/Cargo.toml generated_shaking_polygon_source_frame_contains_jittered_outline_and_transparency -- --nocapture` は1件成功した。
- 検証: 対象名で絞った `npx tsc --noEmit` は今回変更ファイル由来のエラーなし。既存の `ThreeStageViewport.tsx` Three.js型定義不足、`mp4box` 型定義不足、`heavyEffectsStress.test.ts` の `PositionKeyframe` 未定義のみ検出した。
- 残課題: 現時点の `GeneratedShakingPolygon` は元スクリプトのアンカー任意座標編集を、固定直径ベースの多角形生成へ寄せた互換再実装。任意頂点アンカー編集UIは後続のPropertyPanel拡張で扱う。

## 2026-06-22
- SSD分度器をRust生成オブジェクトへ追加した。
- Red: `script/ANM/ANM_ssd/分度器.obj` を、Rust `GeneratedProtractor` mediaとして扱う境界契約を作った。
- Green: `ProtractorObject` と `buildAviUtlProtractorObject` を追加し、Timeline右クリックから `分度器を追加` / `Add Protractor` で置けるようにした。
- Green: `rustSceneSnapshot` / shared renderer native support / Rust core schema / Rust backendに `GeneratedProtractor` を追加した。
- Green: Rust backendで透明背景、半円目盛り、測定角ライン、角度ラベルを持つ決定的な分度器フレームを生成できるようにした。
- Green: `ssd-protractor` をPackカタログ/棚卸し文書へ追加した。
- 版を `0.1.1-Beta-285a` に更新した。
- 検証: `npm test -- --run src/utils/protractorObjectFactory.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/aviutlPackFeatureCatalog.test.ts src/utils/pixiGeneratedEffectCutover.test.ts src/utils/projectFile.test.ts src/utils/projectExportFrameCanvas.test.ts src/e2e/allReadableMedia.e2e.test.ts --reporter=dot` は97件成功した。
- 検証: `cargo test --manifest-path rust-core/Cargo.toml --test media_schema -- --nocapture` は23件成功した。
- 検証: `cargo test --manifest-path rust-backend/Cargo.toml generated_protractor_source_frame_contains_ticks_angle_line_and_transparency -- --nocapture` は1件成功した。
- 検証: 対象名で絞った `npx tsc --noEmit` は今回変更ファイル由来のエラーなし。既存の `ThreeStageViewport.tsx` Three.js型定義不足、`mp4box` 型定義不足、`heavyEffectsStress.test.ts` の `PositionKeyframe` 未定義のみ検出した。
- 残課題: 現時点の `GeneratedProtractor` は元スクリプトの3点アンカー角度計算テキストを、Rust側の半円分度器と固定測定角ラベル生成へ拡張した互換再実装。アンカー連動の角度計算UIは後続の編集UI拡張で扱う。

## 2026-06-22
- SSDホログラムをRust生成オブジェクトへ追加した。
- Red: `script/ANM/ANM_ssd/ホログラム.obj` を、Rust `GeneratedHologram` mediaとして扱う境界契約を作った。
- Green: `HologramObject` と `buildAviUtlHologramObject` を追加し、Timeline右クリックから `ホログラムを追加` / `Add Hologram` で置けるようにした。
- Green: `rustSceneSnapshot` / shared renderer native support / Rust core schema / Rust backendに `GeneratedHologram` を追加した。
- Green: Rust backendで不透明背景、斜めプリズム帯、明暗ストライプを持つ決定的なホログラムフレームを生成できるようにした。
- Green: `ssd-hologram` をPackカタログ/棚卸し文書へ追加した。
- 版を `0.1.1-Beta-284a` に更新した。
- 検証: `npm test -- --run src/utils/hologramObjectFactory.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/aviutlPackFeatureCatalog.test.ts src/utils/pixiGeneratedEffectCutover.test.ts src/utils/projectFile.test.ts src/utils/projectExportFrameCanvas.test.ts src/e2e/allReadableMedia.e2e.test.ts --reporter=dot` は96件成功した。
- 検証: `cargo test --manifest-path rust-core/Cargo.toml --test media_schema -- --nocapture` は22件成功した。
- 検証: `cargo test --manifest-path rust-backend/Cargo.toml generated_hologram_source_frame_contains_prism_stripes_and_opacity -- --nocapture` は1件成功した。
- 検証: 対象名で絞った `npx tsc --noEmit` は今回変更ファイル由来のエラーなし。既存の `ThreeStageViewport.tsx` Three.js型定義不足、`mp4box` 型定義不足、`heavyEffectsStress.test.ts` の `PositionKeyframe` 未定義のみ検出した。
- 残課題: 現時点の `GeneratedHologram` は元スクリプトのタイル生成・ぼかし・カラー処理を、Rust側の不透明な斜めプリズム模様生成へ置き換えた互換再実装。

## 2026-06-22
- SSDランダムラインEXをRust生成オブジェクトへ追加した。
- Red: `script/ANM/ANM_ssd/ランダムラインEX.obj` を、Rust `GeneratedRandomLineEx` mediaとして扱う境界契約を作った。
- Green: `RandomLineExObject` と `buildAviUtlRandomLineExObject` を追加し、Timeline右クリックから `ランダムラインEXを追加` / `Add Random Line EX` で置けるようにした。
- Green: `rustSceneSnapshot` / shared renderer native support / Rust core schema / Rust backendに `GeneratedRandomLineEx` を追加した。
- Green: Rust backendで透明背景、白いランダム斜線、セルノイズによる欠けを持つ決定的なランダムラインEXフレームを生成できるようにした。
- Green: `ssd-random-line-ex` をPackカタログ/棚卸し文書へ追加した。
- 版を `0.1.1-Beta-283a` に更新した。
- 検証: `npm test -- --run src/utils/randomLineExObjectFactory.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/aviutlPackFeatureCatalog.test.ts src/utils/pixiGeneratedEffectCutover.test.ts src/utils/projectFile.test.ts src/utils/projectExportFrameCanvas.test.ts src/e2e/allReadableMedia.e2e.test.ts --reporter=dot` は95件成功した。
- 検証: `cargo test --manifest-path rust-core/Cargo.toml --test media_schema -- --nocapture` は21件成功した。
- 検証: `cargo test --manifest-path rust-backend/Cargo.toml generated_random_line_ex_source_frame_contains_noisy_lines_and_transparency -- --nocapture` は1件成功した。
- 検証: 対象名で絞った `npx tsc --noEmit` は今回変更ファイル由来のエラーなし。既存の `ThreeStageViewport.tsx` Three.js型定義不足、`mp4box` 型定義不足、`heavyEffectsStress.test.ts` の `PositionKeyframe` 未定義のみ検出した。
- 残課題: 現時点の `GeneratedRandomLineEx` は元スクリプトの外部 `T_Color_Module` 依存の二値化・カラーキー処理を、Rust側の透明背景・セルノイズ付きランダム斜線生成へ置き換えた互換再実装。

## 2026-06-22
- SSD集中線plusをRust生成オブジェクトへ追加した。
- Red: `script/ANM/ANM_ssd/集中線plus.obj` を、Rust `GeneratedFocusLinesPlus` mediaとして扱う境界契約を作った。
- Green: `FocusLinesPlusObject` と `buildAviUtlFocusLinesPlusObject` を追加し、Timeline右クリックから `集中線plusを追加` / `Add Focus Lines Plus` で置けるようにした。
- Green: `rustSceneSnapshot` / shared renderer native support / Rust core schema / Rust backendに `GeneratedFocusLinesPlus` を追加した。
- Green: Rust backendで透明背景、白い放射状ポリゴン、中心抜けを持つ決定的な集中線plusフレームを生成できるようにした。
- Green: `ssd-focus-lines-plus` をPackカタログ/棚卸し文書へ追加した。
- 版を `0.1.1-Beta-282a` に更新した。
- 検証: `npm test -- --run src/utils/focusLinesPlusObjectFactory.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/aviutlPackFeatureCatalog.test.ts src/utils/pixiGeneratedEffectCutover.test.ts src/utils/projectFile.test.ts src/utils/projectExportFrameCanvas.test.ts src/e2e/allReadableMedia.e2e.test.ts --reporter=dot` は94件成功した。
- 検証: `cargo test --manifest-path rust-core/Cargo.toml --test media_schema -- --nocapture` は20件成功した。
- 検証: `cargo test --manifest-path rust-backend/Cargo.toml generated_focus_lines_plus_source_frame_contains_rays_and_centre_hole -- --nocapture` は1件成功した。
- 検証: 対象名で絞った `npx tsc --noEmit` は今回変更ファイル由来のエラーなし。既存の `ThreeStageViewport.tsx` Three.js型定義不足、`mp4box` 型定義不足、`heavyEffectsStress.test.ts` の `PositionKeyframe` 未定義のみ検出した。
- 残課題: 現時点の `GeneratedFocusLinesPlus` は元スクリプトの乱数ポリゴン生成を、Rust側の透明背景・白い放射状ライン生成へ置き換えた互換再実装。`keyframe_interval` による乱数更新の入口は保持したが、UI編集や元Lua完全一致の乱数系列までは未接続。

## 2026-06-22
- SSD麻の葉模様をRust生成オブジェクトへ追加した。
- Red: `script/ANM/ANM_ssd/麻の葉模様.obj` を、Rust `GeneratedAsanohaPattern` mediaとして扱う境界契約を作った。
- Green: `AsanohaPatternObject` と `buildAviUtlAsanohaPatternObject` を追加し、Timeline右クリックから `麻の葉模様を追加` / `Add Asanoha Pattern` で置けるようにした。
- Green: `rustSceneSnapshot` / shared renderer native support / Rust core schema / Rust backendに `GeneratedAsanohaPattern` を追加した。
- Green: Rust backendで不透明背景、黒白の六角格子・放射線を持つ決定的な麻の葉模様フレームを生成できるようにした。
- Green: `ssd-asanoha-pattern` をPackカタログ/棚卸し文書へ追加した。
- 版を `0.1.1-Beta-281a` に更新した。
- 検証: `npm test -- --run src/utils/asanohaPatternObjectFactory.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/aviutlPackFeatureCatalog.test.ts src/utils/pixiGeneratedEffectCutover.test.ts src/utils/projectFile.test.ts src/utils/projectExportFrameCanvas.test.ts src/e2e/allReadableMedia.e2e.test.ts --reporter=dot` は93件成功した。
- 検証: `cargo test --manifest-path rust-core/Cargo.toml --test media_schema -- --nocapture` は19件成功した。
- 検証: `cargo test --manifest-path rust-backend/Cargo.toml generated_asanoha_pattern_source_frame_contains_foreground_background_and_opacity -- --nocapture` は1件成功した。
- 検証: 対象名で絞った `npx tsc --noEmit` は今回変更ファイル由来のエラーなし。既存の `ThreeStageViewport.tsx` Three.js型定義不足、`mp4box` 型定義不足、`heavyEffectsStress.test.ts` の `PositionKeyframe` 未定義のみ検出した。
- 残課題: 現時点の `GeneratedAsanohaPattern` は元スクリプトのLua polygon描画を、黒白の決定的なRustラスタ生成へ置き換えた互換再実装。負値色による透明化や元Luaの完全な加算/減算合成までは未接続。

## 2026-06-21
- SSD紙飛行機をRust生成オブジェクトへ追加した。
- Red: `script/ANM/ANM_ssd/紙飛行機.obj` を、Rust `GeneratedPaperAirplane` mediaとして扱う境界契約を作った。
- Green: `PaperAirplaneObject` と `buildAviUtlPaperAirplaneObject` を追加し、Timeline右クリックから `紙飛行機を追加` / `Add Paper Airplane` で置けるようにした。
- Green: `rustSceneSnapshot` / shared renderer native support / Rust core schema / Rust backendに `GeneratedPaperAirplane` を追加した。
- Green: Rust backendで透明背景、白い左右翼と折り目影を持つ決定的な紙飛行機フレームを生成できるようにした。
- Green: `ssd-paper-airplane` をPackカタログ/棚卸し文書へ追加した。
- 版を `0.1.1-Beta-280a` に更新した。
- 検証: `npm test -- --run src/utils/paperAirplaneObjectFactory.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/aviutlPackFeatureCatalog.test.ts src/utils/pixiGeneratedEffectCutover.test.ts src/utils/projectFile.test.ts src/utils/projectExportFrameCanvas.test.ts src/e2e/allReadableMedia.e2e.test.ts --reporter=dot` は92件成功した。
- 検証: `cargo test --manifest-path rust-core/Cargo.toml --test media_schema -- --nocapture` は18件成功した。
- 検証: `cargo test --manifest-path rust-backend/Cargo.toml generated_paper_airplane_source_frame_contains_wings_shadow_and_transparency -- --nocapture` は1件成功した。
- 検証: 対象名で絞った `npx tsc --noEmit` は今回変更ファイル由来のエラーなし。既存の `ThreeStageViewport.tsx` Three.js型定義不足、`mp4box` 型定義不足、`heavyEffectsStress.test.ts` の `PositionKeyframe` 未定義のみ検出した。
- 残課題: 現時点の `GeneratedPaperAirplane` は元スクリプトの移動方向追従3D描画を、透明背景の静的な紙飛行機Rustラスタ生成へ置き換えた互換再実装。移動方向追従はキーフレーム方向と接続する後段拡張に残す。

## 2026-06-21
- SSD矢がすりをRust生成オブジェクトへ追加した。
- Red: `script/ANM/ANM_ssd/矢がすり.obj` を、Rust `GeneratedYagasuri` mediaとして扱う境界契約を作った。
- Green: `YagasuriObject` と `buildAviUtlYagasuriObject` を追加し、Timeline右クリックから `矢がすりを追加` / `Add Yagasuri` で置けるようにした。
- Green: `rustSceneSnapshot` / shared renderer native support / Rust core schema / Rust backendに `GeneratedYagasuri` を追加した。
- Green: Rust backendで不透明背景、黒白の反復矢羽根パターンを持つ決定的なフレームを生成できるようにした。
- Green: `ssd-yagasuri` をPackカタログ/棚卸し文書へ追加した。
- 版を `0.1.1-Beta-279a` に更新した。
- 検証: `npm test -- --run src/utils/yagasuriObjectFactory.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/aviutlPackFeatureCatalog.test.ts src/utils/pixiGeneratedEffectCutover.test.ts src/utils/projectFile.test.ts src/utils/projectExportFrameCanvas.test.ts src/e2e/allReadableMedia.e2e.test.ts --reporter=dot` は91件成功した。
- 検証: `cargo test --manifest-path rust-core/Cargo.toml --test media_schema -- --nocapture` は17件成功した。
- 検証: `cargo test --manifest-path rust-backend/Cargo.toml generated_yagasuri_source_frame_contains_arrow_pattern_and_opacity -- --nocapture` は1件成功した。
- 検証: 対象名で絞った `npx tsc --noEmit` は今回変更ファイル由来のエラーなし。既存の `ThreeStageViewport.tsx` Three.js型定義不足、`mp4box` 型定義不足、`heavyEffectsStress.test.ts` の `PositionKeyframe` 未定義のみ検出した。
- 残課題: 現時点の `GeneratedYagasuri` は元スクリプトのポリゴン列を、黒白の決定的なRustラスタ生成へ置き換えた互換再実装。

## 2026-06-21
- SSD千鳥格子をRust生成オブジェクトへ追加した。
- Red: `script/ANM/ANM_ssd/千鳥格子.obj` を、Rust `GeneratedHoundstooth` mediaとして扱う境界契約を作った。
- Green: `HoundstoothObject` と `buildAviUtlHoundstoothObject` を追加し、Timeline右クリックから `千鳥格子を追加` / `Add Houndstooth` で置けるようにした。
- Green: `rustSceneSnapshot` / shared renderer native support / Rust core schema / Rust backendに `GeneratedHoundstooth` を追加した。
- Green: Rust backendで不透明背景、黒白の反復千鳥格子パターンを持つ決定的なフレームを生成できるようにした。
- Green: `ssd-houndstooth` をPackカタログ/棚卸し文書へ追加した。
- 版を `0.1.1-Beta-278a` に更新した。
- 検証: `npm test -- --run src/utils/houndstoothObjectFactory.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/aviutlPackFeatureCatalog.test.ts src/utils/pixiGeneratedEffectCutover.test.ts src/utils/projectFile.test.ts src/utils/projectExportFrameCanvas.test.ts src/e2e/allReadableMedia.e2e.test.ts --reporter=dot` は90件成功した。
- 検証: `cargo test --manifest-path rust-core/Cargo.toml --test media_schema -- --nocapture` は16件成功した。
- 検証: `cargo test --manifest-path rust-backend/Cargo.toml generated_houndstooth_source_frame_contains_foreground_background_and_opacity -- --nocapture` は1件成功した。
- 検証: 対象名で絞った `npx tsc --noEmit` は今回変更ファイル由来のエラーなし。既存の `ThreeStageViewport.tsx` Three.js型定義不足、`mp4box` 型定義不足、`heavyEffectsStress.test.ts` の `PositionKeyframe` 未定義のみ検出した。
- 残課題: 現時点の `GeneratedHoundstooth` は元スクリプトのポリゴン列を、黒白の決定的なRustラスタ生成へ置き換えた互換再実装。

## 2026-06-21
- SSDタータンチェックをRust生成オブジェクトへ追加した。
- Red: `script/ANM/ANM_ssd/タータンチェック_ISTN.obj` を、Rust `GeneratedTartanCheck` mediaとして扱う境界契約を作った。
- Green: `TartanCheckObject` と `buildAviUtlTartanCheckObject` を追加し、Timeline右クリックから `タータンチェックを追加` / `Add Tartan Check` で置けるようにした。
- Green: `rustSceneSnapshot` / shared renderer native support / Rust core schema / Rust backendに `GeneratedTartanCheck` を追加した。
- Green: Rust backendで不透明背景、赤/黄/黒の格子を持つ決定的なタータンチェックフレームを生成できるようにした。
- Green: `ssd-tartan-check` をPackカタログ/棚卸し文書へ追加した。
- 版を `0.1.1-Beta-277a` に更新した。
- 検証: `npm test -- --run src/utils/tartanCheckObjectFactory.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/aviutlPackFeatureCatalog.test.ts src/utils/pixiGeneratedEffectCutover.test.ts src/utils/projectFile.test.ts src/utils/projectExportFrameCanvas.test.ts src/e2e/allReadableMedia.e2e.test.ts --reporter=dot` は89件成功した。
- 検証: `cargo test --manifest-path rust-core/Cargo.toml --test media_schema -- --nocapture` は15件成功した。
- 検証: `cargo test --manifest-path rust-backend/Cargo.toml generated_tartan_check_source_frame_contains_all_pattern_colours -- --nocapture` は1件成功した。
- 検証: 対象名で絞った `npx tsc --noEmit` は今回変更ファイル由来のエラーなし。既存の `ThreeStageViewport.tsx` Three.js型定義不足、`mp4box` 型定義不足、`heavyEffectsStress.test.ts` の `PositionKeyframe` 未定義のみ検出した。
- 残課題: 現時点の `GeneratedTartanCheck` は元スクリプトの130pxタイルとぼかし処理を、Rust側の決定的な不透明格子パターン生成へ置き換えた互換再実装。

## 2026-06-21
- SSD三角括弧をRust生成オブジェクトへ追加した。
- Red: `script/ANM/ANM_ssd/三角括弧.obj` を、Rust `GeneratedTriangleBracket` mediaとして扱う境界契約を作った。
- Green: `TriangleBracketObject` と `buildAviUtlTriangleBracketObject` を追加し、Timeline右クリックから `三角括弧を追加` / `Add Triangle Bracket` で置けるようにした。
- Green: `rustSceneSnapshot` / shared renderer native support / Rust core schema / Rust backendに `GeneratedTriangleBracket` を追加した。
- Green: Rust backendで透明背景、白い上下2本の斜線ブラケットを持つ決定的な三角括弧フレームを生成できるようにした。
- Green: `ssd-triangle-bracket` をPackカタログ/棚卸し文書へ追加した。
- 版を `0.1.1-Beta-276a` に更新した。
- 検証: `npm test -- --run src/utils/triangleBracketObjectFactory.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/aviutlPackFeatureCatalog.test.ts src/utils/pixiGeneratedEffectCutover.test.ts src/utils/projectFile.test.ts src/utils/projectExportFrameCanvas.test.ts src/e2e/allReadableMedia.e2e.test.ts --reporter=dot` は88件成功した。
- 検証: `cargo test --manifest-path rust-core/Cargo.toml --test media_schema -- --nocapture` は14件成功した。
- 検証: `cargo test --manifest-path rust-backend/Cargo.toml generated_triangle_bracket_source_frame_contains_arms_and_transparency -- --nocapture` は1件成功した。
- 検証: 対象名で絞った `npx tsc --noEmit` は今回変更ファイル由来のエラーなし。既存の `ThreeStageViewport.tsx` Three.js型定義不足、`mp4box` 型定義不足、`heavyEffectsStress.test.ts` の `PositionKeyframe` 未定義のみ検出した。
- 残課題: 現時点の `GeneratedTriangleBracket` は元スクリプトのポリゴン合成を、透明背景の斜線ブラケットRustラスタ生成へ置き換えた互換再実装。

## 2026-06-21
- SSD円矢印をRust生成オブジェクトへ追加した。
- Red: `script/ANM/ANM_ssd/円矢印.obj` を、Rust `GeneratedCircularArrow` mediaとして扱う境界契約を作った。
- Green: `CircularArrowObject` と `buildAviUtlCircularArrowObject` を追加し、Timeline右クリックから `円矢印を追加` / `Add Circular Arrow` で置けるようにした。
- Green: `rustSceneSnapshot` / shared renderer native support / Rust core schema / Rust backendに `GeneratedCircularArrow` を追加した。
- Green: Rust backendで透明背景、黄色の円弧、三角形の矢じりを持つ決定的な円矢印フレームを生成できるようにした。
- Green: `ssd-circular-arrow` をPackカタログ/棚卸し文書へ追加した。
- 版を `0.1.1-Beta-275a` に更新した。
- 検証: `npm test -- --run src/utils/circularArrowObjectFactory.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/aviutlPackFeatureCatalog.test.ts src/utils/pixiGeneratedEffectCutover.test.ts src/utils/projectFile.test.ts src/utils/projectExportFrameCanvas.test.ts src/e2e/allReadableMedia.e2e.test.ts --reporter=dot` は87件成功した。
- 検証: `cargo test --manifest-path rust-core/Cargo.toml --test media_schema -- --nocapture` は13件成功した。
- 検証: `cargo test --manifest-path rust-backend/Cargo.toml generated_circular_arrow_source_frame_contains_arc_head_and_transparency -- --nocapture` は1件成功した。
- 検証: 対象名で絞った `npx tsc --noEmit` は今回変更ファイル由来のエラーなし。既存の `ThreeStageViewport.tsx` Three.js型定義不足、`mp4box` 型定義不足、`heavyEffectsStress.test.ts` の `PositionKeyframe` 未定義のみ検出した。
- 残課題: 現時点の `GeneratedCircularArrow` は元スクリプトの図形モチーフ選択や複雑な合成処理を、透明背景の円弧/矢じりRustラスタ生成へ置き換えた互換再実装。

## 2026-06-21
- SSD日の出をRust生成オブジェクトへ追加した。
- Red: `script/ANM/ANM_ssd/日の出.obj` を、Rust `GeneratedSunburst` mediaとして扱う境界契約を作った。
- Green: `SunburstObject` と `buildAviUtlSunburstObject` を追加し、Timeline右クリックから `日の出を追加` / `Add Sunburst` で置けるようにした。
- Green: `rustSceneSnapshot` / shared renderer native support / Rust core schema / Rust backendに `GeneratedSunburst` を追加した。
- Green: Rust backendで黄色背景、赤い放射状レイ、中心円モチーフを持つ決定的な日の出フレームを生成できるようにした。
- Green: `ssd-sunburst` をPackカタログ/棚卸し文書へ追加した。
- 版を `0.1.1-Beta-274a` に更新した。
- 検証: `npm test -- --run src/utils/sunburstObjectFactory.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/aviutlPackFeatureCatalog.test.ts src/utils/pixiGeneratedEffectCutover.test.ts src/utils/projectFile.test.ts src/utils/projectExportFrameCanvas.test.ts src/e2e/allReadableMedia.e2e.test.ts --reporter=dot` は86件成功した。
- 検証: `cargo test --manifest-path rust-core/Cargo.toml --test media_schema -- --nocapture` は12件成功した。
- 検証: `cargo test --manifest-path rust-backend/Cargo.toml generated_sunburst_source_frame_contains_rays_background_and_motif -- --nocapture` は1件成功した。
- 検証: 対象名で絞った `npx tsc --noEmit` は今回変更ファイル由来のエラーなし。既存の `ThreeStageViewport.tsx` Three.js型定義不足、`mp4box` 型定義不足、`heavyEffectsStress.test.ts` の `PositionKeyframe` 未定義のみ検出した。
- 残課題: 現時点の `GeneratedSunburst` は元スクリプトの任意図形モチーフを、円/矩形モチーフと放射状レイのRustラスタ生成へ置き換えた互換再実装。

## 2026-06-21
- Tim簡易ヒストグラムをRust生成オブジェクトへ追加した。
- Red: `script/てぃむ/簡易ヒストグラム.obj` を、Rust `GeneratedHistogram` mediaとして扱う境界契約を作った。
- Green: `HistogramObject` と `buildAviUtlHistogramObject` を追加し、Timeline右クリックから `簡易ヒストグラムを追加` / `Add Histogram` で置けるようにした。
- Green: `rustSceneSnapshot` / shared renderer native support / Rust core schema / Rust backendに `GeneratedHistogram` を追加した。
- Green: Rust backendで黒背景、輝度/R/G/Bチャンネルの棒を持つ決定的なヒストグラムフレームを生成できるようにした。
- Green: `tim-simple-histogram` をPackカタログ/棚卸し文書へ追加した。
- 版を `0.1.1-Beta-273a` に更新した。
- 検証: `npm test -- --run src/utils/histogramObjectFactory.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/aviutlPackFeatureCatalog.test.ts src/utils/pixiGeneratedEffectCutover.test.ts src/utils/projectFile.test.ts src/utils/projectExportFrameCanvas.test.ts src/e2e/allReadableMedia.e2e.test.ts --reporter=dot` は85件成功した。
- 検証: `cargo test --manifest-path rust-core/Cargo.toml --test media_schema -- --nocapture` は11件成功した。
- 検証: `cargo test --manifest-path rust-backend/Cargo.toml generated_histogram_source_frame_contains_channel_bars_and_background -- --nocapture` は1件成功した。
- 検証: 対象名で絞った `npx tsc --noEmit` は今回変更ファイル由来のエラーなし。既存の `ThreeStageViewport.tsx` Three.js型定義不足、`mp4box` 型定義不足、`heavyEffectsStress.test.ts` の `PositionKeyframe` 未定義のみ検出した。
- 残課題: 現時点の `GeneratedHistogram` は元スクリプトの対象レイヤーピクセル解析を、固定bin入力のRustラスタ生成へ置き換えた互換再実装。実レイヤーからのRGB/輝度bin抽出は後段で接続する。

## 2026-06-21
- 93パイシートグラフをRust生成オブジェクトへ追加した。
- Red: `script/93/パイシートグラフ.obj` を、Rust `GeneratedPieChart` mediaとして扱う境界契約を作った。
- Green: `PieChartObject` と `buildAviUtlPieChartObject` を追加し、Timeline右クリックから `パイシートグラフを追加` / `Add Pie Chart` で置けるようにした。
- Green: `rustSceneSnapshot` / shared renderer native support / Rust core schema / Rust backendに `GeneratedPieChart` を追加した。
- Green: Rust backendで透明背景、中央穴、複数色スライスを持つ決定的なドーナツグラフフレームを生成できるようにした。
- Green: `pie-sheet-graph` をPackカタログ/棚卸し文書へ追加した。
- 版を `0.1.1-Beta-272a` に更新した。
- 検証: `npm test -- --run src/utils/pieChartObjectFactory.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/aviutlPackFeatureCatalog.test.ts src/utils/pixiGeneratedEffectCutover.test.ts src/utils/projectFile.test.ts src/utils/projectExportFrameCanvas.test.ts src/e2e/allReadableMedia.e2e.test.ts --reporter=dot` は84件成功した。
- 検証: `cargo test --manifest-path rust-core/Cargo.toml --test media_schema -- --nocapture` は10件成功した。
- 検証: `cargo test --manifest-path rust-backend/Cargo.toml generated_pie_chart_source_frame_contains_slices_hole_and_transparency -- --nocapture` は1件成功した。
- 検証: 対象名で絞った `npx tsc --noEmit` は今回変更ファイル由来のエラーなし。既存の `ThreeStageViewport.tsx` Three.js型定義不足、`mp4box` 型定義不足、`heavyEffectsStress.test.ts` の `PositionKeyframe` 未定義のみ検出した。
- 残課題: 現時点の `GeneratedPieChart` は元スクリプトの文字表示、乱数揺らぎ、進行順序の特殊パターンを省き、割合スライスのRustラスタ生成へ置き換えた互換再実装。

## 2026-06-21
- 93カスタムトラックバーをRust生成オブジェクトへ追加した。
- Red: `script/93/カスタムトラックバー.obj` を、Rust `GeneratedTrackBar` mediaとして扱う境界契約を作った。
- Green: `TrackBarObject` と `buildAviUtlTrackBarObject` を追加し、Timeline右クリックから `トラックバーを追加` / `Add Track Bar` で置けるようにした。
- Green: `rustSceneSnapshot` / shared renderer native support / Rust core schema / Rust backendに `GeneratedTrackBar` を追加した。
- Green: Rust backendで透明背景、低透明度背景レーン、4本の決定的な進捗バーを生成できるようにした。
- Green: `custom-track-bar` をPackカタログ/棚卸し文書へ追加した。
- 版を `0.1.1-Beta-271a` に更新した。
- 検証: `npm test -- --run src/utils/trackBarObjectFactory.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/aviutlPackFeatureCatalog.test.ts src/utils/pixiGeneratedEffectCutover.test.ts src/utils/projectFile.test.ts src/utils/projectExportFrameCanvas.test.ts src/e2e/allReadableMedia.e2e.test.ts --reporter=dot` は83件成功した。
- 検証: `cargo test --manifest-path rust-core/Cargo.toml --test media_schema -- --nocapture` は9件成功した。
- 検証: `cargo test --manifest-path rust-backend/Cargo.toml generated_track_bar_source_frame_contains_bars_and_background -- --nocapture` は1件成功した。
- 検証: 対象名で絞った `npx tsc --noEmit` は今回変更ファイル由来のエラーなし。既存の `ThreeStageViewport.tsx` Three.js型定義不足、`mp4box` 型定義不足、`heavyEffectsStress.test.ts` の `PositionKeyframe` 未定義のみ検出した。
- 残課題: 現時点の `GeneratedTrackBar` は元スクリプトのLua/GDI風テキスト描画をRust側ラスタバー生成へ置き換えた互換再実装で、ラベル文字の直接描画は未対応。

## 2026-06-21
- Tim歯車をRust生成オブジェクトへ追加した。
- Red: `script/てぃむ/歯車.anm` を、Rust `GeneratedGear` mediaとして扱う境界契約を作った。
- Green: `GearObject` と `buildAviUtlGearObject` を追加し、Timeline右クリックから `歯車を追加` / `Add Gear` で置けるようにした。
- Green: `rustSceneSnapshot` / shared renderer native support / Rust core schema / Rust backendに `GeneratedGear` を追加した。
- Green: Rust backendで透明背景、内側穴、歯先/歯底を持つ決定的な2D歯車フレームを生成できるようにした。
- Green: `tim-gear` をPackカタログ/棚卸し文書へ追加した。
- 版を `0.1.1-Beta-270a` に更新した。
- 検証: `npm test -- --run src/utils/gearObjectFactory.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/aviutlPackFeatureCatalog.test.ts src/utils/pixiGeneratedEffectCutover.test.ts src/utils/projectFile.test.ts src/utils/projectExportFrameCanvas.test.ts src/e2e/allReadableMedia.e2e.test.ts --reporter=dot` は82件成功した。
- 検証: `cargo test --manifest-path rust-core/Cargo.toml --test media_schema -- --nocapture` は8件成功した。
- 検証: `cargo test --manifest-path rust-backend/Cargo.toml generated_gear_source_frame_contains_teeth_hole_and_transparency -- --nocapture` は1件成功した。
- 検証: 対象名で絞った `npx tsc --noEmit` は今回変更ファイル由来のエラーなし。既存の `ThreeStageViewport.tsx` Three.js型定義不足、`mp4box` 型定義不足、`heavyEffectsStress.test.ts` の `PositionKeyframe` 未定義のみ検出した。
- 残課題: 現時点の `GeneratedGear` は元スクリプトの3D厚み・側面ポリゴン・テクスチャ貼りを、2D歯車ラスタ生成へ置き換えた互換再実装。

## 2026-06-21
- TimひょうたんTMをRust生成オブジェクトへ追加した。
- Red: `script/てぃむ/ひょうたんTM.obj` を、Rust `GeneratedGourd` mediaとして扱う境界契約を作った。
- Green: `GourdObject` と `buildAviUtlGourdObject` を追加し、Timeline右クリックから `ひょうたんを追加` / `Add Gourd` で置けるようにした。
- Green: `rustSceneSnapshot` / shared renderer native support / Rust core schema / Rust backendに `GeneratedGourd` を追加した。
- Green: Rust backendで透明背景とくびれ付きシルエットを持つ決定的フレームを生成できるようにした。
- Green: `tim-gourd` をPackカタログ/棚卸し文書へ追加した。
- 版を `0.1.1-Beta-269a` に更新した。
- 検証: `npm test -- --run src/utils/gourdObjectFactory.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/aviutlPackFeatureCatalog.test.ts src/utils/pixiGeneratedEffectCutover.test.ts src/utils/projectFile.test.ts src/utils/projectExportFrameCanvas.test.ts src/e2e/allReadableMedia.e2e.test.ts --reporter=dot` は81件成功した。
- 検証: `cargo test --manifest-path rust-core/Cargo.toml --test media_schema -- --nocapture` は7件成功した。
- 検証: `cargo test --manifest-path rust-backend/Cargo.toml generated_gourd_source_frame_contains_shape_and_transparency -- --nocapture` は1件成功した。
- 検証: 対象名で絞った `npx tsc --noEmit` は今回変更ファイル由来のエラーなし。既存の `ThreeStageViewport.tsx` Three.js型定義不足、`mp4box` 型定義不足、`heavyEffectsStress.test.ts` の `PositionKeyframe` 未定義のみ検出した。
- 残課題: 現時点の `GeneratedGourd` は元スクリプトのポリゴン分割をRust側のピクセル輪郭生成へ置き換えた互換再実装で、AviUtlのアンチエイリアスや半分リサイズ挙動までは完全一致しない。

## 2026-06-21
- Tim色相環をRust生成オブジェクトへ追加した。
- Red: `script/てぃむ/色相環.obj` を、Rust `GeneratedColourWheel` mediaとして扱う境界契約を作った。
- Green: `ColourWheelObject` と `buildAviUtlColourWheelObject` を追加し、Timeline右クリックから `色相環を追加` / `Add Colour Wheel` で置けるようにした。
- Green: `rustSceneSnapshot` / shared renderer native support / Rust core schema / Rust backendに `GeneratedColourWheel` を追加した。
- Green: Rust backendで透明背景と複数色のHSVリングを持つ決定的フレームを生成できるようにした。
- Green: `tim-colour-wheel` をPackカタログ/棚卸し文書へ追加した。
- 版を `0.1.1-Beta-268a` に更新した。
- 検証: `npm test -- --run src/utils/colourWheelObjectFactory.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/aviutlPackFeatureCatalog.test.ts src/utils/pixiGeneratedEffectCutover.test.ts src/utils/pixiRenderHelperGeneratedEffectCutover.test.ts src/utils/projectFile.test.ts src/utils/projectExportFrameCanvas.test.ts src/e2e/allReadableMedia.e2e.test.ts src/e2e/rustVideoPreview.e2e.test.ts --reporter=dot` は82件成功した。
- 検証: `cargo test --manifest-path rust-core/Cargo.toml --test media_schema -- --nocapture` は6件成功した。
- 検証: `cargo test --manifest-path rust-backend/Cargo.toml generated_colour_wheel_source_frame_contains_hues_and_transparency -- --nocapture` は1件成功した。
- 検証: 対象名で絞った `npx tsc --noEmit` は今回変更ファイル由来のエラーなし。既存の `ThreeStageViewport.tsx` Three.js型定義不足、`mp4box` 型定義不足、`heavyEffectsStress.test.ts` の `PositionKeyframe` 未定義のみ検出した。
- 残課題: 現時点の `GeneratedColourWheel` はピクセル単位のHSVリングで、元スクリプトの四角形ポリゴン分割境界とは完全一致しない。

## 2026-06-21
- TimパズルピースをRust生成オブジェクトへ追加した。
- Red: `script/てぃむ/パズルピース.obj` を、Rust `GeneratedPuzzlePiece` mediaとして扱う境界契約を作った。
- Green: `PuzzlePieceObject` と `buildAviUtlPuzzlePieceObject` を追加し、Timeline右クリックから `パズルピースを追加` / `Add Puzzle Piece` で置けるようにした。
- Green: `rustSceneSnapshot` / shared renderer native support / Rust core schema / Rust backendに `GeneratedPuzzlePiece` を追加した。
- Green: Rust backendで透明背景と白いパズルピース形状を持つ決定的フレームを生成できるようにした。
- Green: `tim-puzzle-piece` をPackカタログ/棚卸し文書へ追加した。
- 版を `0.1.1-Beta-267a` に更新した。
- 検証: `npm test -- --run src/utils/puzzlePieceObjectFactory.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/aviutlPackFeatureCatalog.test.ts src/utils/pixiGeneratedEffectCutover.test.ts src/utils/pixiRenderHelperGeneratedEffectCutover.test.ts src/utils/projectFile.test.ts src/utils/projectExportFrameCanvas.test.ts src/e2e/allReadableMedia.e2e.test.ts` は80件成功した。
- 検証: `cargo test --manifest-path rust-core/Cargo.toml --test media_schema -- --nocapture` は5件成功した。
- 検証: `cargo test --manifest-path rust-backend/Cargo.toml generated_puzzle_piece_source_frame_contains_shape_and_transparency -- --nocapture` は1件成功した。
- 検証: 対象ファイル名で絞った `npx tsc --noEmit` は今回変更ファイル由来のエラーなし。既存の `ThreeStageViewport.tsx` Three.js型定義不足のみ検出した。
- 残課題: 現時点の `GeneratedPuzzlePiece` はP形状と凹凸の主要挙動を単純化した視覚再実装で、元スクリプトの全22形状の細かな輪郭差分までは未再現。

## 2026-06-21
- TimバーコードTをRust生成オブジェクトへ追加した。
- Red: `script/てぃむ/バーコードT.obj` を、Rust `GeneratedBarcode` mediaとして扱う境界契約を作った。
- Green: `BarcodeObject` と `buildAviUtlBarcodeObject` を追加し、Timeline右クリックから `バーコードを追加` / `Add Barcode` で置けるようにした。
- Green: `rustSceneSnapshot` / shared renderer native support / Rust core schema / Rust backendに `GeneratedBarcode` を追加した。
- Green: Rust backendで白背景と黒バーを持つ決定的バーコード風フレームを生成できるようにした。
- Green: `tim-barcode` をPackカタログ/棚卸し文書へ追加した。
- 版を `0.1.1-Beta-266a` に更新した。
- 検証: `npm test -- --run src/utils/rustSceneSnapshot.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/barcodeObjectFactory.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/aviutlPackFeatureCatalog.test.ts src/utils/pixiGeneratedEffectCutover.test.ts src/utils/pixiRenderHelperGeneratedEffectCutover.test.ts src/utils/projectFile.test.ts src/utils/projectExportFrameCanvas.test.ts src/e2e/allReadableMedia.e2e.test.ts` は79件成功した。
- 検証: `cargo test --manifest-path rust-core/Cargo.toml --test media_schema -- --nocapture` は4件成功した。
- 検証: `cargo test --manifest-path rust-backend/Cargo.toml generated_barcode_source_frame_contains_background_and_bars -- --nocapture` は1件成功した。
- 検証: 対象ファイル名で絞った `npx tsc --noEmit` は今回変更ファイル由来のエラーなし。既存の `ThreeStageViewport.tsx` Three.js型定義不足のみ検出した。
- 残課題: 現時点の `GeneratedBarcode` はバーコードTの視覚再実装で、Code128としてのスキャン互換までは未実装。

## 2026-06-21
- TimインクTMを標準生成オブジェクトへ追加した。
- Red: `script/てぃむ/インクTM.obj` を、Timeline右クリックから追加できるAviUtlPackV4標準生成オブジェクトにする契約を作った。
- Green: `buildAviUtlInkSplashObject` を追加し、標準パーティクル基盤でインク飛沫近似のParticleObjectを生成できるようにした。
- Green: Timeline context menuへ `インクを追加` / `Add Ink Splash` を追加した。
- Green: `tim-ink-splash` をPackカタログ/棚卸し文書へ追加した。
- 版を `0.1.1-Beta-265a` に更新した。
- 検証: `npm test -- --run src/utils/particleObjectFactory.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/aviutlPackFeatureCatalog.test.ts` は36件成功した。
- 検証: 対象ファイル名で絞った `npx tsc --noEmit` は今回変更ファイル由来のエラーなし。既存の `ThreeStageViewport.tsx` Three.js型定義不足のみ検出した。
- 残課題: インクTMは標準パーティクル近似で、元スクリプト固有の輪郭生成、円形度合、展開アニメーション、飛散形状の差分までは未実装。

## 2026-06-21
- Tim集中線Tを標準生成オブジェクトへ追加した。
- Red: `script/てぃむ/@集中線T.obj` を、Timeline右クリックから追加できるAviUtlPackV4標準生成オブジェクトにする契約を作った。
- Green: `buildAviUtlFocusLinesObject` を追加し、標準パーティクル基盤で集中線T近似のParticleObjectを生成できるようにした。
- Green: Timeline context menuへ `集中線を追加` / `Add Focus Lines` を追加した。
- Green: `tim-focus-lines` をPackカタログ/棚卸し文書へ追加した。
- 版を `0.1.1-Beta-264a` に更新した。
- 検証: `npm test -- --run src/utils/particleObjectFactory.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts` は32件成功した。
- 残課題: 集中線Tは標準パーティクル近似で、元スクリプト固有の線分描画・遠近感までは未実装。

## 2026-06-21
- Tim泡を標準生成オブジェクトへ追加した。
- Red: `script/てぃむ/泡.obj` を、Timeline右クリックから追加できるAviUtlPackV4標準生成オブジェクトにする契約を作った。
- Green: `buildAviUtlBubbleObject` を追加し、標準パーティクル基盤で泡近似のParticleObjectを生成できるようにした。
- Green: Timeline context menuへ `泡を追加` / `Add Bubbles` を追加した。
- Green: `tim-bubbles` をPackカタログ/棚卸し文書へ追加した。
- 版を `0.1.1-Beta-263a` に更新した。
- 検証: `npm test -- --run src/utils/particleObjectFactory.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts` は31件成功した。
- 残課題: 泡は標準パーティクル近似で、元スクリプト固有の円形描画・屈折・加算/スクリーン合成までは未実装。

## 2026-06-21
- Timオーラ放出を標準生成オブジェクトへ追加した。
- Red: `script/てぃむ/オーラ放出.anm` を、Timeline右クリックから追加できるAviUtlPackV4標準生成オブジェクトにする契約を作った。
- Green: `buildAviUtlAuraEmissionObject` を追加し、標準パーティクル基盤でオーラ放出近似のParticleObjectを生成できるようにした。
- Green: Timeline context menuへ `オーラ放出を追加` / `Add Aura Emission` を追加した。
- Green: `tim-aura-emission` をPackカタログ/棚卸し文書へ追加した。
- 版を `0.1.1-Beta-262a` に更新した。
- 検証: `npm test -- --run src/utils/particleObjectFactory.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts` は30件成功した。
- 残課題: オーラ放出は標準パーティクル近似で、元スクリプト固有のゆらぎや加算合成までは未実装。

## 2026-06-21
- Tim風揺れTをネイティブmotion presetへ追加した。
- Red: AviUtlPackV4 `script/てぃむ/風揺れT.anm` を、`wind-sway-soft` として標準motion presetに追加する契約を作った。
- Green: 既存キーフレーム基盤へ、元の位置へ戻る小さな風揺れループを生成するネイティブ再実装を追加した。
- Green: `tim-wind-sway` をPackカタログ/棚卸し文書へ追加した。
- 版を `0.1.1-Beta-261a` に更新した。
- 検証: `npm test -- --run src/utils/aviutlMotionPresets.test.ts src/components/PropertyPanelBoundary.test.ts` は11件成功した。
- 残課題: 風による曲面変形そのものは未実装。現時点ではRust scene snapshotへ乗る位置キーフレーム近似として扱う。

## 2026-06-21
- Timモーションパスをネイティブmotion presetへ追加した。
- Red: AviUtlPackV4 `script/てぃむ` のモーションパス候補を、`motion-path-arc` と `motion-path-s-curve` として標準motion presetに追加する契約を作った。
- Green: 既存キーフレーム基盤へ、弧を描くパスとS字パスを生成するネイティブ再実装を追加した。
- Green: iCloud Drive内の `@モーションパスA/B/C/D` と `ベジェ軌道T` をカタログ/棚卸し文書の参照メタデータへ反映した。
- 版を `0.1.1-Beta-260a` に更新した。
- 検証: `npm test -- --run src/utils/aviutlMotionPresets.test.ts src/components/PropertyPanelBoundary.test.ts` は10件成功した。
- 残課題: ベジェ制御点をUIで編集する本格パスエディタは未実装。次は生成効果入り混在exportの高速化、または風揺れ/オーラ/グリッドワイプなどP2候補の追加へ進む。

## 2026-06-21
- 生成効果入り実Electron exportの画素検査を通過した。
- Green: 生成効果cutover時にPixi子要素を破棄/取り外しせず、非表示・非renderableで保持してWebGPU render groupの古い参照を踏まないようにした。
- Green: 動画export E2Eの成果物MP4から先頭フレームをRGBA抽出し、標準パーティクルの白画素とAudio waveform Rの下部緑ラインを検査するようにした。
- 版を `0.1.1-Beta-259g` に更新した。
- 検証: 対象unit/staticは33件成功し、生成効果入り実Electron export E2Eは60 frames、runtimeErrors 0、Audio waveform R 714px、標準パーティクル 38,504px検出で成功した。
- 残課題: 生成効果入り混在exportはまだ約4fpsなので、次はnative render sourceの待ち時間とdecode/writeの重なりを再分解して高速化する。

## 2026-06-21
- 生成効果のPixi二重描画レースを抑止した。
- Red: `Viewport` がshared renderer preview session生成直後にGeneratedAudioWaveform/GeneratedParticleのPixi cutover IDを更新する契約を追加した。
- Green: `collectSharedRendererGeneratedEffectObjectIdsFromSession` を追加し、Presenter完了前でもRust所有の生成効果をPixi描画から外すようにした。
- 版を `0.1.1-Beta-259f` に更新した。
- 検証: `npm test -- --run src/utils/viewportRustVideoOnlyBoundary.test.ts src/utils/pixiGeneratedEffectCutover.test.ts src/utils/packageScripts.test.ts -t "generated effect|records real video export|skips Rust-owned generated effects"` は3件成功した。
- 残課題: 実Electron export E2Eで、生成効果入り成果物の画素検査とruntime error検出を通す。

## 2026-06-21
- 生成波形の共有フレーム画素一致を確認した。
- Red: `native-wgpu-renderer` に、Audio waveform R生成フレームが直接フレーム出力と共有メモリ出力で一致する契約を追加した。
- Green: `render_native_wgpu_frame_to_shared_ring_with_audio_waveforms` を追加し、生成波形をRust native rendererの共有フレーム出力へ接続した。
- 版を `0.1.1-Beta-259c` に更新した。
- 検証: `cargo test --test shared_frame_output native_wgpu_generated_waveform_shared_frame_matches_direct_frame` と `cargo test --test shared_frame_output` は成功した。
- 残課題: 次は標準パーティクルを含む生成ソースと、実Electron preview/export成果物の画素比較へ広げる。

## 2026-06-21
- 生成波形と標準パーティクルの混在Rust出力を確認した。
- Test: `rust-backend` の `render.nativeSharedFrame` に、Audio waveform Rと標準パーティクルを同一フレームで合成する境界テストを追加した。
- Test: 赤い波形ラインと白い粒子が同じ共有メモリフレームに出ることを検証した。
- 挙動変更なしの確認強化のため、版は `0.1.1-Beta-259c` のままとした。
- 検証: `cargo test --test decode_control_plane native_render_shared_frame_builds_generated -- --nocapture` と `cargo test --test decode_control_plane native_render_shared_frame_composites_generated_waveform_and_particle_sources -- --nocapture` は成功した。
- 残課題: 次は実Electronのpreview/export成果物を画像として比較し、UI経由の見た目まで確認する。

## 2026-06-21
- Audio waveform RのPCM取得をsource frameへ追従させた。
- Red: previewのAudio waveform R PCM取得が `clip.source_frame` 基準の開始秒を使う契約を追加した。
- Green: `prepareNativeRenderAudioWaveforms` に `SceneSnapshot` を渡し、対象mediaの `source_frame / 60` を `startSeconds` としてRust backendへ渡すようにした。
- Green: export direct encode側も同じ時間基準でAudio waveform RのPCMを取得するようにした。
- 版を `0.1.1-Beta-259d` に更新した。
- 検証: preview/exportのaudio waveform対象テストは成功した。対象ファイル名に関するTypeScriptエラーは出ていない。
- 残課題: 次は生成効果が実Electron上で見えているかを、preview screenshotとexport frame decodeの画素比較で確認する。

## 2026-06-21
- Audio waveform RのRust画素可視性を確認した。
- Test: `native-wgpu-renderer` の生成波形共有フレーム一致テストに、指定色 `#00ff66` の画素が直接フレーム内に存在するアサートを追加した。
- 挙動変更なしの確認強化のため、版は `0.1.1-Beta-259d` のままとした。
- 検証: `cargo test --test shared_frame_output native_wgpu_generated_waveform_shared_frame_matches_direct_frame` は成功した。
- 残課題: 次は `encode.writeNativeFrame` の生成効果込みexport直結経路を確認する。

## 2026-06-21
- 生成効果込みdirect encode境界を確認した。
- Test: `encode.start` → `encode.writeNativeFrame` → `encode.finish` で、Audio waveform Rと標準パーティクルを含む1フレームを書き出すRust backend境界テストを追加した。
- Test: 生成効果入りdirect encodeが出力共有メモリを返さず、WGPU render timingsを持つnative frameとして書けることを検証した。
- 挙動変更なしの確認強化のため、版は `0.1.1-Beta-259d` のままとした。
- 検証: `cargo test --test decode_control_plane native_generated_effects_can_directly_feed_encode_without_output_shared_memory -- --nocapture` は成功した。
- 残課題: 次は実Electron E2Eでpreview screenshotとexport frame decodeを比較し、UI経由の画素一致へ進む。

## 2026-06-21
- 動画export E2Eでruntime errorを失敗扱いに変更した。
- Red: `run-video-export-e2e.mjs` が `Runtime.exceptionThrown` を `passed` 判定へ含める契約を追加した。
- Green: E2E結果作成前に `collectRuntimeErrors(client)` を評価し、runtime errorが1件でもあれば `passed=false` にするようにした。
- テスト基盤の厳格化のため、版は `0.1.1-Beta-259d` のままとした。
- 検証: `npm test -- --run src/utils/packageScripts.test.ts -t "records real video export"` は成功した。
- 残課題: 次は生成効果入りE2Eで出ているPixi WebGPU runtime errorを潰す。

## 2026-06-21
- 生成効果のPixi二重描画runtime errorを修正した。
- Red: Rust native frameが所有するAudio waveform R / 標準パーティクルはPixiで描画しない契約を追加した。
- Green: `pixiGeneratedEffectCutover` を追加し、`audio_visualization` / `particle` がRust native frameに含まれる場合はPixi描画をスキップするようにした。
- Green: shared renderer presenter controlから生成効果object idをViewportへ渡し、Pixi描画ヘルパーへ接続した。
- 版を `0.1.1-Beta-259e` に更新した。
- 検証: 実Electron E2Eは動画+図形+画像+音声+Audio waveform R+標準パーティクルで成功し、`runtimeErrors: []` を確認した。
- 結果: 60 frames / 17,679ms / 約3.39fps / 1,092,837 bytes。
- 残課題: 次はpreview screenshotとexport frame decodeの画素比較へ進む。

## 2026-06-21
- 動画export E2EのElectron bundle待機を追加した。
- Red: `run-video-export-e2e.mjs` がElectron起動前にbundle完了を待つ契約を追加した。
- Green: `dist-electron/main.js` / `dist-electron/preload.js` の更新時刻とIPC markerを確認してからElectronを起動するようにした。
- 版を `0.1.1-Beta-259b` に更新した。
- 検証: bundle待機後の実Electron E2Eは動画+図形+画像+音声+Audio waveform R+標準パーティクルで成功した。
- 結果: 60 frames / 17,662ms / 約3.40fps / 1,092,837 bytes。
- 起動ログ上、`dist-electron/preload.js` と `dist-electron/main.js` のbuild完了後にElectronを起動できている。

## 2026-06-21
- 実Electron動画export E2EにAviUtl生成効果を投入した。
- Red: `UXFD_VIDEO_EXPORT_E2E_ADD_AVIUTL_GENERATED_EFFECTS` とrenderer hookの存在契約を追加した。
- Green: `run-video-export-e2e.mjs` にAviUtl生成効果投入フラグを追加した。
- Green: `videoExportE2e` 専用hookで `Audio waveform R` と `標準パーティクル` をTimelineへ追加できるようにした。
- Green: 生成効果入りではdirect transcode固定ではなく、Rust native合成exportの成功を検証するようにした。
- 版を `0.1.1-Beta-259a` に更新した。
- 検証: 実Electron E2Eは動画+図形+画像+音声+Audio waveform R+標準パーティクルで成功した。
- 結果: 60 frames / 18,863ms / 約3.18fps / 1,092,837 bytes。
- 診断: native render envelope は `SolidColour,Image,Video,GeneratedAudioWaveform,GeneratedParticle` を含んだ。
- 残課題: 初回実行では古い `dist-electron/main.js` を掴んだ疑いがあるため、次はE2E起動前にElectron bundle完了を待つ安定化を検討する。

## 2026-06-21
- 代表素材E2Eに標準パーティクルと音声波形を追加した。
- Test: 全読込可能メディアE2Eへ `audio_visualization` と `particle` を追加した。
- Test: Rust scene snapshotが `GeneratedAudioWaveform` と `GeneratedParticle` を生成することを検証した。
- Test: 音声波形metadataが対象audioへ解決され、標準パーティクルmetadataがseed/count/spread/speed/size/colour/lifetimeを保持することを検証した。
- 挙動変更なしのテスト強化のため、版は `0.1.1-Beta-258a` のままとした。
- 検証: 代表素材E2Eは既存実装で成功した。
- 残課題: 実Electron上の画素/エンコード結果で、生成効果込みのpreview/export一致を確認する。

## 2026-06-21
- 音声波形をRust export経路判定に追加した。
- Red: plain audioは非visualのまま、`audio_visualization` はRust-native visual mediaとして扱う契約を追加した。
- Green: `hasProjectExportNativeRenderMediaObjects` の対象に `audio_visualization` を追加した。
- 版を `0.1.1-Beta-258a` に更新した。
- 検証: projectExportFrameCanvas対象37件が成功。対象ファイルに関するTypeScriptエラーは出ていない。
- 残課題: 次は代表素材E2Eに標準パーティクルと音声波形を混ぜたpreview/export境界確認へ進む。

## 2026-06-21
- 標準パーティクルをRust export経路判定に追加した。
- Red: 標準パーティクル単独/音声付きのexportでもRust-native visual mediaとして扱う契約を追加した。
- Green: `hasProjectExportNativeRenderMediaObjects` の対象に `particle` を追加した。
- 版を `0.1.1-Beta-257a` に更新した。
- 検証: projectExportFrameCanvas対象36件が成功。対象ファイルに関するTypeScriptエラーは出ていない。
- 残課題: 次は代表素材E2Eへ標準パーティクルを混ぜ、preview/export境界をまとめて確認する。

## 2026-06-21
- 標準パーティクルPropertyPanel編集を追加した。
- Red: PropertyPanelにRust-native標準パーティクル編集欄があることを確認する境界テストを追加した。
- Green: `ParticleObject` のcount/seed/spread/speed/size/colour/lifetime/width/heightを編集できるUIを追加した。
- 版を `0.1.1-Beta-256a` に更新した。
- 検証: PropertyPanel境界テストが成功。対象ファイルに関するTypeScriptエラーは出ていない。
- 残課題: 次は代表素材に標準パーティクルを載せたpreview/export一致確認を進める。

## 2026-06-21
- 標準パーティクルのプロジェクト保存/読込を許可した。
- Red: `ParticleObject` がプロジェクトJSONをround-tripできる契約を追加した。
- Green: `projectFile` のTimelineObject許可リストへ `particle` を追加した。
- Green: `particle` の幅/高さ/count/seed/spread/speed/size/colour/lifetimeを読込時に検証するようにした。
- 版を `0.1.1-Beta-255a` に更新した。
- 検証: projectFile対象6件が成功。対象ファイルに関するTypeScriptエラーは出ていない。
- 残課題: 次はPropertyPanelから標準パーティクルのパラメータを編集できるようにする。

## 2026-06-21
- 標準パーティクル追加UIをTimeline context menuへ接続した。
- Red: 標準パーティクル用のデフォルトParticleObject生成契約を追加した。
- Red: Timeline context menuが標準パーティクル追加コマンドを露出する契約を追加した。
- Green: `buildDefaultStandardParticleObject` を追加し、プロジェクトサイズに合わせた中央配置の標準パーティクルを生成できるようにした。
- Green: canvas右クリックメニューへ `Add Standard Particle` / `標準パーティクルを追加` を追加した。
- 版を `0.1.1-Beta-254a` に更新した。
- 検証: UI追加契約2件が成功。対象ファイルに関するTypeScriptエラーは出ていない。
- 残課題: 次はParticleObjectのプロジェクト保存/読込許可とPropertyPanel編集UIを追加する。

## 2026-06-21
- 標準パーティクルをsource frame対応の動的生成へ拡張した。
- Red: `GeneratedParticle` がclipの `source_frame` を使って粒子位置を進める契約を追加した。
- Green: rust-backendのnative render source収集へ `SceneSnapshot` を渡し、media idに対応するclipの `source_frame` を参照できるようにした。
- Green: `standard-particle` の `speed` と `lifetime_seconds` を使い、60fps基準の経過秒で粒子を決定的に移動させるようにした。
- Green: direct native encodeとpreview native shared frameの両方で同じsource frame評価を使うようにした。
- 版を `0.1.1-Beta-253a` に更新した。
- 検証: rust-backendのgenerated media関連5件、TS対象27件が成功。対象ファイルに関するTypeScriptエラーは出ていない。
- 残課題: 次は標準パーティクルをTimeline/PropertyPanelから追加・編集できるUIへ接続する。

## 2026-06-21
- 標準パーティクルをRust backend native renderへ接続した。
- Red: `render.nativeSharedFrame` が `GeneratedParticle` mediaをshared frameへ描ける契約を追加した。
- Green: rust-backendに `GeneratedParticleSource` metadataを追加し、`standard-particle` を検証できるようにした。
- Green: `collect_native_render_sources` が `GeneratedParticle` をRGBA source frameへ生成するようにした。
- Green: seed/count/spread/size/colourを使い、決定的な静的パーティクルをラスタライズするようにした。
- 版を `0.1.1-Beta-252a` に更新した。
- 検証: rust-backendのgenerated media関連4件、TS対象27件が成功。対象ファイルに関するTypeScriptエラーは出ていない。
- 残課題: 現段階の標準パーティクルは静的な決定的生成。次はsource frame/timeを使った速度・寿命つきの動的パーティクル化とUI追加へ進む。

## 2026-06-21
- 標準パーティクルを生成メディア境界へ追加した。
- Red: ParticleObjectがRust scene snapshotで `GeneratedParticle` mediaになる契約を追加した。
- Red: native media gateが `standard-particle` metadataをRust生成メディアとして受け入れる契約を追加した。
- Red: rust-core JSON境界が `GeneratedParticle` media kindを受け入れる契約を追加した。
- Green: `ParticleObject` をTimelineObjectへ追加し、AviUtlPackV4標準パーティクル互換の基本パラメータを持てるようにした。
- Green: `rustSceneSnapshot` が `particle` を `GeneratedParticle` media referenceへ変換するようにした。
- Green: `sharedRendererNativeMediaSupport` に `standard-particle` metadata検証を追加した。
- Green: rust-core schemaに `GeneratedParticle` / `GeneratedParticlePlane` を追加した。
- 版を `0.1.1-Beta-251a` に更新した。
- 検証: TS対象27件、rust-core media schema 1件が成功。対象ファイルに関するTypeScriptエラーは出ていない。
- 残課題: 次はRust backend/native rendererで `GeneratedParticle` を実RGBA frameへ生成し、preview/exportのnative render経路へ接続する。

## 2026-06-21
- Audio waveform Rをexport native encode payloadへ接続した。
- Red: export frame sourceがGeneratedAudioWaveformのPCMを要求し、direct native encode payloadへ `audioWaveforms` を渡す契約を追加した。
- Green: preview native renderで使う `prepareNativeRenderAudioWaveforms` をexport側でも再利用できるようにした。
- Green: `RustBackendVideoEncodeWriteNativeFramePayload` に `audioWaveforms` を追加し、direct native encodeとnative shared-frame fallbackの両方に渡すようにした。
- Green: exportテストのmock PCM要求に型注釈を追加し、対象TypeScriptエラーを解消した。
- 版を `0.1.1-Beta-250a` に更新した。
- 検証: TS対象66件が成功。対象ファイルに関するTypeScriptエラーは出ていない。
- 残課題: Audio waveform Rはpreview/exportのnative payload境界まで接続済み。次は実ウィンドウ/E2Eで代表素材に効果を載せ、表示とエンコード結果を確認する。

## 2026-06-21
- Audio waveform Rをnative render payloadへ接続した。
- Red: GeneratedAudioWaveformがpreview native renderでPCMを要求し、`audioWaveforms` としてRust native render payloadへ渡る契約を追加した。
- Red: Rust backendの `render.nativeSharedFrame` が `audioWaveforms` だけでGeneratedAudioWaveformをshared frame出力できる契約を追加した。
- Green: `RustBackendNativeRenderSharedFramePayload.audioWaveforms` を追加し、preview native render準備で `audio-waveform-r` metadataからPCMサンプルを要求するようにした。
- Green: GeneratedAudioWaveformをRust native render対応メディアとしてgateへ追加した。
- Green: rust-backendが `audioWaveforms` を `NativeAudioWaveformInput` へ変換し、native-wgpu-rendererの波形描画経路へ渡すようにした。
- Green: direct native encode側も `audioWaveforms` を受けられるようにし、preview/export両方のRust backend境界を揃えた。
- 版を `0.1.1-Beta-249a` に更新した。
- 検証: TS対象20件、Rust backendの波形native shared frameテスト1件、native-wgpu-rendererの波形描画テスト1件が成功。対象ファイルに関するTypeScriptエラーは出ていない。
- 残課題: 次はexport frame sourceでGeneratedAudioWaveformのPCM要求を行い、direct native encode payloadにも実際の `audioWaveforms` を積む。

## 2026-06-21
- Audio waveform RのElectron bridgeを追加した。
- Red: rendererから `audio.waveformSamples` を呼び出す `rustBackendAudioWaveformControl` 契約と、Electron main/preload/vite-envのbridge露出契約を追加した。
- Green: `requestRustBackendAudioWaveformSamples` を追加し、rendererから `window.rustBackend.requestAudioWaveformSamples` 経由でPCMサンプル要求を送れるようにした。
- Green: Electron preloadへ `requestAudioWaveformSamples` を露出し、main IPC `rust-backend-audio-waveform-samples` からRust backendの `audio.waveformSamples` を呼ぶようにした。
- Green: `src/vite-env.d.ts` に波形サンプル要求/応答型を追加した。
- 版を `0.1.1-Beta-248a` に更新した。
- 検証: renderer/Electron境界テスト6件が成功。対象ファイルに関するTypeScriptエラーは出ていない。
- 残課題: 次はrendererで `audio_visualization` のmetadataからPCM要求を発行し、`NativeAudioWaveformInput` へ接続してpreview/exportの実波形表示へ進む。

## 2026-06-21
- Audio waveform R用PCM供給RPCをRust backendへ追加した。
- Red: `audio.waveformSamples` RPCが音声ファイルから波形生成用のmono f32 PCMを返す契約を追加した。
- Green: `AudioWaveformSamplesParams` と `handle_audio_waveform_samples` を追加し、ffmpegで `f32le` mono PCMをstdout抽出するようにした。
- Green: `sampleRate` / `maxSamples` / `startSeconds` / `durationSeconds` を受け取り、制御面に載せるサンプル数を上限管理するようにした。
- Green: backendのnative render source収集で `GeneratedAudioWaveform` を通常画像source読み込み対象から外し、生成入力として扱えるようにした。
- 版を `0.1.1-Beta-247a` に更新した。
- 検証: rust-backendのPCM供給テスト1件、native-wgpu-rendererの波形描画テスト1件が成功。
- 残課題: 次はrenderer/Electron側で `audio_visualization` のmetadataから `audio.waveformSamples` を呼び、`NativeAudioWaveformInput` へ接続する。

## 2026-06-21
- Audio waveform Rをnative-wgpu-rendererへ接続した。
- Red: `NativeAudioWaveformInput` を渡すと、native-wgpu-rendererが生成波形をGPU合成結果へ描く契約を追加した。
- Green: `render_native_wgpu_frame_with_audio_waveforms` を追加し、PCMサンプルからRust coreのline stripを作り、RGBAフレーム化して既存WebGPU合成へ流すようにした。
- Green: 波形色、線幅、sample rate、source frameを利用し、生成メディアを通常の `RgbaFrame` sourceと同じ経路で扱えるようにした。
- 版を `0.1.1-Beta-246a` に更新した。
- 検証: native-wgpu-rendererの `native_reference_parity` 15件、Rust coreの `audio_waveform_scene` 2件が成功。
- 残課題: 次はRust backend/sidecarで音声ファイルからPCMを供給し、renderer側のAudio waveform R生成入力へ接続する。

## 2026-06-21
- Audio waveform RのRust波形生成コアを追加した。
- Red: `audio-waveform-r` metadata JSONをRustで読み取り、PCMサンプルから波形ラインストリップを生成する契約を追加した。
- Green: `rust-core/src/audio_waveform_scene.rs` を追加し、`AudioWaveformSource::from_json` と `build_audio_waveform_line_strip` を実装した。
- Green: source frame / fps / sample rate / 表示サイズから、現在フレームに対応するサンプル窓を画面座標へ変換できるようにした。
- Green: `#rrggbb` の色、線幅、振幅をRust側の生成結果へ保持するようにした。
- 版を `0.1.1-Beta-245a` に更新した。
- 検証: Rust coreの `audio_waveform_scene` 2件、`timeline_snapshot_contract` 6件が成功。
- 残課題: 次はRust backend/sidecarで対象音声をPCMへdecodeし、このline stripをnative-wgpu-rendererへ渡して実描画する。

## 2026-06-21
- Audio waveform RをRust生成メディア境界へ追加した。
- Red: `audio_visualization` オブジェクトが対象audioを参照した `GeneratedAudioWaveform` media planeとしてRust scene snapshotへ出る契約を追加した。
- Red: Rust coreの `MediaKind::GeneratedAudioWaveform` と `ClipKind::GeneratedAudioWaveformPlane` を受け入れるスキーマ契約を追加した。
- Green: `rustSceneSnapshot` が `audio_visualization` をshared renderer対応オブジェクトとして扱い、`audio-waveform-r` generator metadataをJSON sourceへ格納するようにした。
- Green: `targetAudioId` 優先、未指定時は対象レイヤーの再生中audioを参照する解決処理を追加した。
- Green: Rust core schemaに `GeneratedAudioWaveform` / `GeneratedAudioWaveformPlane` を追加した。
- 版を `0.1.1-Beta-244a` に更新した。
- 検証: TS snapshotテスト22件、Rust core `timeline_snapshot_contract` 6件が成功。対象ファイルに関するTypeScriptエラーは出ていない。
- 残課題: 次はRust側で音声サンプルを読み、波形mesh/textureを生成してnative-wgpu-rendererへ描画させる。

## 2026-06-21
- 扇クリッピング近似をRust/WebGPU境界へ追加した。
- Red: 既存の `clipping` filterが `Clipping` effectとしてRust scene snapshotへ出る契約を追加した。
- Red: Rust coreの `Effect::Clipping` と、切り取り量/角度の検証、native-wgpu-rendererの軸揃えクリッピング画素契約を追加した。
- Green: `rustSceneSnapshot` が `clipping` filterを `Clipping { top, bottom, left, right, angle_degrees }` へ変換し、shared rendererのunsupported filter判定から外すようにした。
- Green: Rust coreに `Effect::Clipping` を追加し、serde境界とvalidationへ接続した。
- Green: native-wgpu-rendererのuniform/WGSL shaderへ斜めクリッピング判定を追加し、Pixi側の既存DiagonalClippingFilterに近い中心回転クリップを行うようにした。
- 版を `0.1.1-Beta-243a` に更新した。
- 検証: TS snapshotテスト21件、Rust core `timeline_snapshot_contract` 5件、`project_validation` 11件、native-wgpu-renderer `native_reference_parity` 14件が成功。対象ファイルに関するTypeScriptエラーは出ていない。
- 残課題: 現段階は既存UIの斜めクリッピング近似をRustへ載せた段階。極座標の本格的な扇クリッピングR再現は追加effectとして拡張する。

## 2026-06-21
- 輝度ワイプをRust/WebGPU境界へ追加した。
- Red: 既存の `wipe` filterが時刻評価済み `Wipe` effectとしてRust scene snapshotへ出る契約を追加した。
- Red: Rust coreの `Effect::Wipe` / `WipeEdge` と、progress範囲検証、native-wgpu-rendererの左ワイプ画素契約を追加した。
- Green: `rustSceneSnapshot` が `wipe` filterを `Wipe { edge, progress }` へ変換し、shared rendererのunsupported filter判定から外すようにした。
- Green: Rust coreに `WipeEdge` と `Effect::Wipe` を追加し、serde境界とvalidationへ接続した。
- Green: native-wgpu-rendererのuniform/WGSL shaderへwipe edge/progressを追加し、対象外ピクセルを透明化するようにした。
- 版を `0.1.1-Beta-242a` に更新した。
- 検証: TS関連テスト24件、Rust core `timeline_snapshot_contract` 5件、`project_validation` 10件、native-wgpu-renderer `native_reference_parity` 13件が成功。対象ファイルに関するTypeScriptエラーは出ていない。
- 残課題: 次は扇クリッピングのRust native effect化、またはAudio waveform Rのnative generated object化へ進む。

## 2026-06-21
- 縁取りをFilter StackとRust/WebGPU境界へ追加した。
- Red: `outline` フィルタをFilter Stack、AviUtl効果プリセット、Rust scene snapshotへ通す契約を追加した。
- Green: `OutlineFilterParams` と `outline` filterを追加し、AviUtl Effectsの `縁取りT` をshadow近似から独立フィルタへ昇格した。
- Green: PropertyPanelで縁取りの色、太さ、不透明度を編集できるようにした。
- Green: Pixiプレビュー用にsource alpha近傍へ縁色を出すGPU filterを追加した。
- Green: Rust coreの `Effect` に `Outline` を追加し、scene snapshot JSON境界、validation、native-wgpu-rendererのWGSL shaderへ接続した。
- Green: native-wgpu-rendererに透明近傍へoutlineが出ることを検証するテストを追加した。
- 版を `0.1.1-Beta-241a` に更新した。
- 検証: TS関連テスト41件、Rust core `timeline_snapshot_contract` 5件、`project_validation` 9件、native-wgpu-renderer `native_reference_parity` 12件が成功。対象ファイルに関するTypeScriptエラーは出ていない。
- 残課題: 次は輝度ワイプ/扇クリッピングのRust native effect化、またはAudio waveform Rのnative generated object化へ進む。

## 2026-06-21
- 色収差をFilter StackとRust/WebGPU境界へ追加した。
- Red: `colour_aberration` フィルタをFilter Stack、AviUtl効果プリセット、Rust scene snapshotへ通す契約を追加した。
- Green: `ColourAberrationFilterParams` と `colour_aberration` filterを追加し、AviUtl Effectsの `色収差` ボタンから追加できるようにした。
- Green: Pixiプレビュー用にRGBチャンネルをずらすGPU filterを追加した。
- Green: Rust coreの `Effect` に `ColourAberration` を追加し、scene snapshot JSON境界、validation、native-wgpu-rendererのWGSL shaderへ接続した。
- Green: native-wgpu-rendererに3px手作り素材でチャンネルオフセットを検証するテストを追加した。
- 版を `0.1.1-Beta-240a` に更新した。
- 検証: TS関連テスト40件、Rust core `timeline_snapshot_contract` 5件、`project_validation` 8件、native-wgpu-renderer `native_reference_parity` 11件が成功。対象ファイルに関するTypeScriptエラーは出ていない。
- 残課題: 次は縁取り/輝度ワイプ/扇クリッピングのRust native effect化、またはAudio waveform Rのnative generated object化へ進む。

## 2026-06-21
- AviUtlPackV4 P1効果プリセットをPropertyPanelへ追加した。
- Red: `PropertyPanel` がAviUtlPackV4効果プリセットをFilter Stack周辺に露出する契約を追加した。
- Green: `AviUtl Effects` セクションを追加し、輝度ワイプ近似、縁取りT近似、扇クリッピング近似をボタンから追加できるようにした。
- Green: 追加後は末尾の新規filterを編集中filterとして選択するようにした。
- 版を `0.1.1-Beta-239a` に更新した。
- 検証: `npm test -- --run src/components/PropertyPanelBoundary.test.ts src/utils/aviutlEffectPresets.test.ts` は6件成功。対象ファイルに関するTypeScriptエラーは出ていない。
- 残課題: P1効果は現時点では既存Filter Stackへの近似。Rust/WebGPU本実装は次の段階で境界型から広げる。

## 2026-06-21
- AviUtlPackV4 P1効果プリセット中核を追加した。
- Red: 輝度ワイプ、縁取りT、扇クリッピングRをUX FDのFilter Stackプリセットとして追加する契約を作成した。
- Green: `src/utils/aviutlEffectPresets.ts` を追加し、P1候補を既存の `wipe` / `shadow` / `clipping` フィルタへ近似接続した。
- Green: 既存filterを破棄せず末尾へ追加し、legacy effect fieldsも同期するようにした。
- 版を `0.1.1-Beta-238a` に更新した。
- 検証: `npm test -- --run src/utils/aviutlEffectPresets.test.ts` は3件成功。対象ファイルに関するTypeScriptエラーは出ていない。
- 残課題: これはRust/WebGPU本実装前の近似プリセット。次はPropertyPanelへ入口を追加し、その後にRust effect境界を広げる。

## 2026-06-21
- AviUtlPackV4 P0モーションプリセットをPropertyPanelへ追加した。
- Red: `PropertyPanel` がAviUtlPackV4 motion presetをKeyframes周辺に露出する契約を追加した。
- Green: `AviUtl Motion` セクションを追加し、左からスライド、下からポップ、ランダム揺れ、左右反復をボタンから適用できるようにした。
- Green: 適用時は既存の `PositionKeyframe` として保存されるため、現行preview/export経路にそのまま乗る。
- 版を `0.1.1-Beta-237a` に更新した。
- 検証: `npm test -- --run src/components/PropertyPanelBoundary.test.ts src/utils/aviutlMotionPresets.test.ts` は6件成功。対象ファイルに関するTypeScriptエラーは出ていない。
- 残課題: 次はP1の輝度ワイプ、縁取り、色収差、扇クリッピングをRust/WebGPU effect境界に追加する。

## 2026-06-21
- AviUtlPackV4 P0モーションプリセット中核を追加した。
- Red: AviUtlPackV4由来のP0候補を、UX FDネイティブのmotion presetとして列挙し、選択オブジェクトへ位置キーフレームを生成する契約を追加した。
- Green: `src/utils/aviutlMotionPresets.ts` を追加し、左からスライド、下からポップ、ランダム揺れ、左右反復のプリセットを実装した。
- Green: 既存の `PositionKeyframe` / `EasingType` へ直接落とし込み、現行preview/export経路で扱える形にした。
- 版を `0.1.1-Beta-236a` に更新した。
- 検証: `npm test -- --run src/utils/aviutlMotionPresets.test.ts` は4件成功。対象ファイルに関するTypeScriptエラーは出ていない。
- 残課題: 次はPropertyPanelへAviUtl motion presetボタンを出し、実際の編集UIから適用できるようにする。

## 2026-06-21
- AviUtlPackV4標準効果カタログを追加した。
- Red: iCloud Drive配下の `AviUtlPackV4` 棚卸し結果と、標準搭載候補の優先順を返す契約を追加した。
- Green: `src/utils/aviutlPackFeatureCatalog.ts` を追加し、AviUtl/YMM4系イージング、登場退場、ランダム/反復、輝度ワイプ、縁取り、色収差、扇クリッピング、音声波形、パーティクルなどをUX FDネイティブ再実装候補として整理した。
- Green: `markdown/AviUtlPackV4_Inventory.md` を追加し、Packの拡張子数、主要ディレクトリ、標準搭載優先候補を記録した。
- 版を `0.1.1-Beta-235a` に更新した。
- 検証: `npm test -- --run src/utils/aviutlPackFeatureCatalog.test.ts` は3件成功。
- 残課題: 次はP0 motion presetを既存キーフレーム/easingへ接続し、PropertyPanelから使えるようにする。

## 2026-06-21
- PSD overlay flatten cacheを追加した。
- Red: 同じPSD overlayを2回 `encode.transcodeVideo` した時、2回目に `psdOverlayCacheHits=1` が返る契約を追加した。
- Green: Rust backendのプロセス内状態にPSD overlay cacheを追加し、`filePath + activeLayerIds + mtime + size` が同じ場合はflatten済みRGBA入力を再利用するようにした。
- Green: cache済みRGBAはffmpeg実行後に削除せず、同じbackendプロセス内の再exportで使えるようにした。
- Green: 実Electron動画export E2Eに `UXFD_VIDEO_EXPORT_E2E_REPEAT_EXPORTS` と `UXFD_VIDEO_EXPORT_E2E_EXPECT_REPEAT_SPEEDUP` を追加し、同じウィンドウ内の連続exportを計測できるようにした。
- 検証: `cargo test --manifest-path rust-backend/Cargo.toml --test decode_control_plane encode_transcode_video_reuses_static_psd_overlay_cache -- --nocapture` は1件成功。
- 検証: `cargo test --manifest-path rust-backend/Cargo.toml --test decode_control_plane encode_transcode_video -- --nocapture` は8件成功。
- 検証: `npm test -- --run src/utils/packageScripts.test.ts` と `node --check scripts/run-video-export-e2e.mjs` は成功。
- 検証: `UXFD_VIDEO_EXPORT_E2E_VIDEO_PATH=/Volumes/ExtendSSD-W/GX020052.MP4 UXFD_VIDEO_EXPORT_E2E_ADD_MIXED_MEDIA=1 UXFD_VIDEO_EXPORT_E2E_ADD_PSD=1 UXFD_VIDEO_EXPORT_E2E_REPEAT_EXPORTS=2 UXFD_VIDEO_EXPORT_E2E_EXPECT_REPEAT_SPEEDUP=1 UXFD_VIDEO_EXPORT_E2E_DURATION_SECONDS=1 UXFD_VIDEO_EXPORT_E2E_TIMEOUT_MS=360000 npm run test:video-export:e2e` は成功。1回目は60 frames / 10850ms / 約5.53fps、2回目は60 frames / 2767ms / 約21.68fps。2回目は1回目の約25.5%まで短縮された。出力MP4は `video` / `audio` streamを維持した。
- 残課題: 2回目でも約21.7fps止まりの残り要因を分ける。候補はffmpeg起動/入力初期化、音声mix生成、PSD RGBA raw inputの読み込み、短尺1秒の固定オーバーヘッド。

## 2026-06-21
- 静的PSD overlayを、per-frame native renderではなく `encode.transcodeVideo` のffmpeg filter fast pathへ載せた。
- Red: `resolveProjectExportVideoTranscodeFastPath` に、動画1本+静的PSDを `kind: 'psd'` overlayとして受け入れる契約を追加した。
- Red: Rust backend `encode.transcodeVideo` に、PSD overlayを受け取り `overlayCount` 付きで出力できる契約を追加した。
- Green: TS resolverがPSDの `filePath` / `activeLayerIds` / `scale` / opacityをRust transcode overlayへ渡すようにした。lip sync有効PSDと3D world placement有効PSDは引き続きfast path対象外。
- Green: Rust backendがPSDを一度だけparse/compositeし、一時RGBA入力としてffmpegへ渡して `overlay` filterで合成するようにした。
- 検証: `npm test -- --run src/utils/projectExportVideoTranscodeFastPath.test.ts` は9件成功。
- 検証: `cargo test --manifest-path rust-backend/Cargo.toml --test decode_control_plane encode_transcode_video_accepts_static_psd_overlay_filters -- --nocapture` は1件成功。
- 検証: `npm test -- --run src/utils/rustBackendVideoEncodeControl.test.ts src/utils/projectExportVideoTranscodeFastPath.test.ts src/utils/useProjectExportBoundary.test.ts src/utils/rustSceneSnapshot.test.ts` は57件成功。対象ファイル名で絞った `tsc` 出力は空。
- 検証: `cargo test --manifest-path rust-backend/Cargo.toml --test decode_control_plane encode_transcode_video -- --nocapture` は7件成功。
- 検証: `UXFD_VIDEO_EXPORT_E2E_VIDEO_PATH=/Volumes/ExtendSSD-W/GX020052.MP4 UXFD_VIDEO_EXPORT_E2E_ADD_MIXED_MEDIA=1 UXFD_VIDEO_EXPORT_E2E_ADD_PSD=1 UXFD_VIDEO_EXPORT_E2E_DURATION_SECONDS=1 UXFD_VIDEO_EXPORT_E2E_TIMEOUT_MS=300000 npm run test:video-export:e2e` は成功。動画+図形+画像+音声+PSDをUI投入し、`Rust backend direct transcode` で60 frames、10883ms、約5.51fps、`video` / `audio` streamありを確認した。
- 補足実測: 前段の混在ffmpeg fast pathは `/Volumes/ExtendSSD-W/GX020052.MP4` 5秒素材で300 frames、5507ms、約54.48fpsまで出た。
- 残課題: 葵ちゃんPSDは171 layerで、export冒頭のPSD parse/composite準備が支配的。次はPSD flattened RGBAのcache化で、同じPSD状態の再exportを高速化する。回転PSD、lip sync PSD、複数動画はまだnative render経路。

## 2026-06-21
- 動画1本+静的図形/画像+音声を、per-frame native renderではなく `encode.transcodeVideo` のffmpeg filter fast pathへ載せた。
- Red: `resolveProjectExportVideoTranscodeFastPath` に、動画+矩形+画像+音声を `overlays` / `requiresAudioMix` 付きfast pathとして受け入れる契約を追加した。
- Red: Rust backend `encode.transcodeVideo` に `overlays` を渡し、`overlayCount` を返す契約を追加した。
- Red: `useProjectExport` が混在fast pathの音声mix WAVをdirect transcodeへ渡す契約を追加した。
- Green: TS resolverで静的rect/image overlayを抽出し、音声オブジェクトがある場合はsource audio直結ではなくmixed audio pathを要求するようにした。
- Green: Rust backendが `filter_complex` でbase video transform後に `drawbox` / image `overlay` を適用できるようにした。
- Green: direct transcode前に音声mix WAVを保存し、`audioPath` としてRust backendへ渡し、完了/失敗後に削除するようにした。
- 検証: `npm test -- --run src/utils/rustBackendVideoEncodeControl.test.ts src/utils/projectExportVideoTranscodeFastPath.test.ts src/utils/useProjectExportBoundary.test.ts src/utils/rustSceneSnapshot.test.ts` は56件成功。対象ファイル名で絞った `tsc` 出力は空。
- 検証: `cargo test --manifest-path rust-backend/Cargo.toml --test decode_control_plane encode_transcode_video -- --nocapture` は6件成功。
- 実測: `UXFD_VIDEO_EXPORT_E2E_ADD_MIXED_MEDIA=1 UXFD_VIDEO_EXPORT_E2E_DURATION_SECONDS=1 UXFD_VIDEO_EXPORT_E2E_TIMEOUT_MS=240000 npm run test:video-export:e2e` は成功。`Rust backend direct transcode` で60 frames、2060ms、約29.13fps。前回標準混在経路の約13.1秒/4.58fpsから大きく改善した。
- 検証: 出力MP4を `ffprobe` で確認し、`video` / `audio` streamの両方が存在した。
- 実測: `/Volumes/ExtendSSD-W/GX020052.MP4` の5秒混在E2Eは300 frames、5507ms、約54.48fpsで成功した。
- 残課題: 1秒短尺では29fps付近。5秒以上では30fps超を確認済み。回転・複数動画・動的PSD overlayはまだnative render経路。

## 2026-06-21
- 混在native render export高速化の第一段として、Rust encode exportのrender-ahead深度を `VITE_UXFD_RUST_EXPORT_RENDER_AHEAD_FRAMES` で調整できるようにした。
- Red: `runRustBackendVideoEncodeExport` に、current frame write中に2フレーム先までframe source生成を進められる契約を追加した。
- Green: encode writeとframe source生成の重なりを可変queue化した。既定は実測悪化を避けるため1、明示指定時のみ最大4まで先読みする。
- Red/Green: `VITE_UXFD_NATIVE_DIRECT_ENCODE=1` 有効時に、動画+PSDなど混在native-renderable frameも `nativeEncodeFramePayload` を返し、shared-frame render RPCを避けられる契約を追加した。
- 検証: `npm test -- --run src/utils/sharedRendererExportFrameSource.test.ts src/utils/rustBackendVideoEncodeExport.test.ts src/utils/useProjectExportBoundary.test.ts` は87件成功。対象ファイル名で絞った `tsc` 出力は空。
- 実測: 標準混在E2Eは1秒60frameで13.1秒、約4.58fps。`VITE_UXFD_RUST_EXPORT_RENDER_AHEAD_FRAMES=2` は13.1秒で改善なし。`VITE_UXFD_NATIVE_DIRECT_ENCODE=1` はrender-ahead 2でdecoded slot generation競合、render-ahead 1では成功するが31.4秒、約1.91fpsまで悪化した。
- 判定: per-frame native render / encode RPCの小手先の重ね合わせは本命ではない。次は動画1本+静的図形/画像+音声を `encode.transcodeVideo` のffmpeg filter fast pathへ載せ、frameごとのRust renderを回避する。

## 2026-06-21
- 混在メディア入り動画export E2Eで、`UXFD_VIDEO_EXPORT_E2E_DURATION_SECONDS=1` でも図形・画像・音声の既定durationに引っ張られて300 frames出力になる課題を修正した。
- Red: `packageScripts` に、混在メディア追加後の全オブジェクト短尺化hookと、期待フレーム数照合をE2E scriptへ持たせる契約を追加した。
- Green: `?videoExportE2e=1` 専用の `__UXFD_VIDEO_EXPORT_E2E_SET_ALL_OBJECT_DURATIONS__` を追加し、混在メディア投入後にTimeline上の全オブジェクトdurationを短尺化するようにした。
- Green: 実Electron動画export E2Eが `expectedFrameCount` / `frameCountMatchesDuration` / `mixedMediaDurationResult` を記録し、完了dialogだけでなく期待フレーム数一致も合格条件にするようにした。
- 検証: `npm test -- --run src/utils/packageScripts.test.ts` は5件成功。`node --check scripts/run-video-export-e2e.mjs` は成功。対象ファイル名で絞った `tsc` 出力は空。
- 検証: `UXFD_VIDEO_EXPORT_E2E_ADD_MIXED_MEDIA=1 UXFD_VIDEO_EXPORT_E2E_DURATION_SECONDS=1 UXFD_VIDEO_EXPORT_E2E_TIMEOUT_MS=240000 npm run test:video-export:e2e` は成功し、`GX010052.MP4` / `Rectangle` / `icon.jpg` / `mixed-audio.wav` を含むTimelineで `expectedFrameCount=60` / `exportedFrameCount=60` / `frameCountMatchesDuration=true` を確認した。
- 残課題: 混在native render exportは1秒60frameで12.6秒、約4.76fps。300frame誤出力は潰れたが、画像・図形・動画混在時のframe source待ちが次の高速化対象。

## 2026-06-21
- 実Electron動画export E2Eに `UXFD_VIDEO_EXPORT_E2E_ADD_MIXED_MEDIA=1` を追加し、動画に加えて図形・画像・音声をUI経由でTimelineへ投入できるようにした。
- Red: `packageScripts` に混在メディアE2E用の環境変数と `mixedMediaResult` を記録する契約を追加した。
- Green: E2E scriptが `public/icon.jpg` と生成WAVをUIのImage/Audio入力へ投入し、Timeline item出現を待ってからexportへ進むようにした。
- 検証: `npm test -- --run src/utils/packageScripts.test.ts` は4件成功。`UXFD_VIDEO_EXPORT_E2E_ADD_MIXED_MEDIA=1 UXFD_VIDEO_EXPORT_E2E_DURATION_SECONDS=1 UXFD_VIDEO_EXPORT_E2E_TIMEOUT_MS=240000 npm run test:video-export:e2e` は成功し、`GX010052.MP4` / `Rectangle` / `icon.jpg` / `mixed-audio.wav` を含むTimelineから `Rust backend rawvideo/ffmpeg` で300 frames、2,719,114 bytesのMP4を出力した。
- 残課題: `UXFD_VIDEO_EXPORT_E2E_DURATION_SECONDS=1` でも混在ケースは300 frames出力になり、57.3秒 / 約5.23fpsだった。混在時のproject duration短縮と、画像/図形/音声入りnative renderの速度改善が次の対象。

## 2026-06-21
- 全読込可能メディアE2Eを明示実行できる `test:all-readable-media:e2e` scriptを追加した。
- Red: `packageScripts` に全読込可能メディアE2E commandの契約を追加し、未定義で失敗することを確認した。
- Green: package scriptを追加し、同E2Eでは図形・画像・PSDのsub-pixel translation / scaleがRust snapshotへ残ることも確認するようにした。
- 検証: `npm test -- --run src/utils/packageScripts.test.ts src/e2e/allReadableMedia.e2e.test.ts` は5件成功。`npm run test:all-readable-media:e2e` は1件成功。

## 2026-06-21
- Canvas描画結果に関わるsub-pixel配置をRust/shared renderer境界へ通すようにした。
- Red: `rustSceneSnapshot` に、図形・画像・PSD・動画の `x/y` が小数でも `translation_x/translation_y` としてRust scene snapshotへ残る契約を追加した。
- Green: `hasUnsupportedSharedRendererTransform` の整数translation制限を撤廃し、finite translation / positive finite scale / finite rotationを共有renderer対応範囲として扱うようにした。
- Green: preview/export sessionの契約を追加し、sub-pixel画像配置もPixi fallbackではなくshared renderer comparison/export surfaceへ進むようにした。
- 検証: `npm test -- --run src/utils/rustSceneSnapshot.test.ts src/utils/sharedRendererPreviewBridge.test.ts src/utils/sharedRendererPreviewSurface.test.ts src/utils/sharedRendererExportSession.test.ts` は29件成功。`npm test -- --run src/utils/sharedRendererExportFrameSource.test.ts src/utils/projectExportFrameCanvas.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/sharedRendererPreviewPresenterController.test.ts` は127件成功。`cargo test --manifest-path native-wgpu-renderer/Cargo.toml --test native_reference_parity` は10件成功。
- 版: `0.1.1-Beta-234a`。

## 2026-06-20
- UIはTypeScript/Reactのまま維持しつつ、Canvas描画結果に関わる画像・PSD・SolidColour矩形のscale transformをRust scene snapshotへ渡すようにした。
- Red: `rustSceneSnapshot` に、画像・PSD・SolidColour矩形の正の有限 `scaleX/scaleY` が `scale_x/scale_y` としてRust境界へ残る契約を追加した。
- Green: `hasUnsupportedSharedRendererTransform` の非動画scale 1固定を撤廃し、正の有限scaleと整数translationを共有rendererの対応範囲として扱うようにした。
- Green: preview/export surfaceの旧Pixi fallback期待を更新し、スケール付き画像もshared renderer comparison/export sessionへ進む契約にした。
- 検証: `npm test -- --run src/utils/rustSceneSnapshot.test.ts src/utils/sharedRendererPreviewBridge.test.ts src/utils/sharedRendererPreviewSurface.test.ts src/utils/sharedRendererExportSession.test.ts src/utils/sharedRendererExportFrameSource.test.ts src/utils/projectExportFrameCanvas.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts` は109件成功。`cargo test --manifest-path native-wgpu-renderer/Cargo.toml --test native_reference_parity` は10件成功。
- 版: `0.1.1-Beta-233a`。

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

## 2026-06-20
- 4K動画preview高速化として、external video source の WebGPU presenter を再生中に再利用する経路を追加した。
- Red: `sharedRendererPreviewPresenterController` に、既存presenterへ次のexternal video frame sceneを再presentでき、診断の `presentedSourceFrame` / `presentedFrameIndex` が進む契約を追加した。
- Green: `SharedRendererPreviewPresenterControl.presentExternalVideoFrameScene` を追加し、controller側で外部動画再presentと診断更新を行うようにした。
- Red: `sharedRendererPresenterSessionKey` に、playback専用の `frameIndex` / `sourceFrame` だけを presenter lifecycle key から外せる契約を追加した。
- Green: `buildSharedRendererPresenterSessionKey(..., { includePlaybackFrame: false })` を追加し、transform/effects/media/canvasは引き続きkeyへ残した。
- Red: `viewportRustVideoOnlyBoundary` に、Viewport が external video-only session だけ時刻非依存keyを使い、key unchanged時に `syncSharedRendererExternalVideoSources` 後に既存presenterへ再presentする契約を追加した。
- Green: `Viewport` の再生中fast pathで presenter 再起動を避け、起動中pending sessionも最新へ差し替え、live datasetへ再present診断を反映するようにした。
- 検証: `npm test -- viewportRustVideoOnlyBoundary sharedRendererPreviewPresenterController sharedRendererPresenterSessionKey` は69件成功。対象ファイルで絞った `tsc` は今回変更分の新規エラーなし（既存の `ThreeStageViewport.tsx` の three 型定義エラーのみ）。
- 実機E2E: `/Volumes/ExtendSSD-W/GX020052.MP4` で `npm run test:video-load:e2e` 成功。改善前の5秒smoothnessは `presenterStartCount=46` / `uniquePresentedFrameCount=15` / `presentedFrameSpan=290`、改善後は `presenterStartCount=6` / `uniquePresentedFrameCount=21` / `presentedFrameSpan=300` / `blockedSampleCount=0` / `externalTextureSampleCount=21`。
- 版: `0.1.1-Beta-224a`。

## 2026-06-20
- 4K動画previewの現実目標値として、`presenterStartCount` 4〜6、`uniquePresentedFrameCount` 20〜21/21、`externalVideoSuppressedSeekCount` 100前後/5秒、`externalVideoMaxAbsDriftMs` 50ms以内を置き、external video source同期の間引きを追加した。
- Red: `sharedRendererExternalVideoSource` に、再生中・既にplaying・drift許容内・同期間隔未満ではseek/play/pause/countを更新せず `throttled: true` を返す契約を追加した。
- Green: `syncSharedRendererExternalVideoPlayback` に `minimumPlayingSyncIntervalMs` と `nowMs` を追加し、throttled returnでは `lastSyncMonotonicMs` / `lastDriftSeconds` を更新しないようにした。
- Red: `viewportRustVideoOnlyBoundary` に、Viewportがexternal video playback syncへ同期間隔定数を渡す契約を追加した。
- Green: Viewportのexternal video source同期だけを75ms間隔へ間引き、`presentExternalVideoFrameScene` 自体は毎tick維持した。
- 検証: `npm test -- sharedRendererExternalVideoSource viewportRustVideoOnlyBoundary` は26件成功。対象ファイルで絞った `tsc` は今回変更分の新規エラーなし（既存の `ThreeStageViewport.tsx` の three 型定義エラーのみ）。
- 実機E2E: `/Volumes/ExtendSSD-W/GX020052.MP4` で `npm run test:video-load:e2e` 成功。最終値は `presenterStartCount=6` / `uniquePresentedFrameCount=21` / `presentedFrameSpan=305` / `externalVideoSuppressedSeekCount=97` / `externalVideoMaxAbsDriftMs=34` / `blockedSampleCount=0` / `externalTextureSampleCount=21`。
- 版: `0.1.1-Beta-224b`。

## 2026-06-20
- 動画の `Scale X/Y` を変更すると Rust/shared renderer 経路の scene snapshot が `unsupportedTransform` で弾かれ、スケールが効かない問題を修正した。
- Red: `rustSceneSnapshot` に、動画だけは正の有限 `scaleX/scaleY` を Rust snapshot へ通す契約を追加した。
- Green: shared renderer transform gateを分岐し、画像/PSD/図形は従来どおりidentity scaleのみ、動画は正の有限scaleを許可するようにした。
- Rust core側にも、動画平面の右下頂点が `reference.width/height * scale_x/scale_y` で計算される契約を追加した。
- 検証: `npm test -- rustSceneSnapshot sharedRendererVideoPlaneScene sharedRendererRustVideoPlaneScene` は23件成功。`cargo test --manifest-path rust-core/Cargo.toml applies_video_transform_scale` は1件成功。
- 版: `0.1.1-Beta-224c`。

## 2026-06-20
- 動画入りexportで `encode.start` 後にshared-frame生成やframe writeが失敗した場合、`encode.finish` に到達せずRust backend側のffmpeg/sessionが残る問題を修正した。
- Red: renderer export helper、Electron backend bridge、IPC channel、Rust backend RPCに `encode.abort` 契約を追加した。
- Green: `runRustBackendVideoEncodeExport` を `try/finally` 化し、finish未完了の失敗時は元エラーを隠さず `abortVideoEncode` をbest-effortで呼ぶようにした。
- Rust backendに冪等な `encode.abort` を追加し、active sessionをremoveしてstdinを閉じ、ffmpegをkill/waitし、stderrをdrainするようにした。
- Electron main/preloadから `rust-backend-encode-abort` / `window.rustVideoEncoder.abortVideoEncode` を公開した。
- 検証: `npm test -- rustBackendVideoEncodeExport rustBackendVideoEncodeControl rustVideoEncodeBackendBridge rustVideoEncodeIpcChannels` は23件成功。`cargo test --manifest-path rust-backend/Cargo.toml --test decode_control_plane encode_abort_removes_active_session_after_frame_source_failure -- --nocapture` は1件成功。export周辺unitは132件成功。Rust encode統合は7件成功。対象ファイルで絞った `tsc` 出力は空。
- 版: `0.1.1-Beta-224d`。

## 2026-06-20
- production Electron mainから削除済みの `resolve-4k-proxy-video` IPCを、export test harnessがまだ呼んで `test:export:fast` が失敗していた問題を修正した。
- Red: `exportTestHarnessBoundary` を追加し、削除済みproxy IPCへの依存が戻らない契約を固定した。
- Green: harness側に `resolveExportHarnessProxyVideo` を追加し、既存の `resolve-perf-heavy-video` + `check-proxy` + `generate-proxy` でH.264 proxyを解決/生成するようにした。
- production IPCにはVideoDecoder検証専用fixture resolverを戻していない。
- 検証: `npm test -- exportTestHarnessBoundary productionVideoDependencyBoundary` は9件成功。`npm run test:export:fast` は ALL PASSED。対象ファイルで絞った `tsc` は既存の `mp4box` 型解決エラーのみ。
- 版: `0.1.1-Beta-224e`。

## 2026-06-20
- 実Electron windowで `エクスポート失敗: Rust backend request timed out: encode.start` が出る問題を受け、Rust encode startのIPC timeoutを15秒から120秒へ延長した。
- Red: `rustVideoEncodeBackendBridge` に、`encode.start` が120秒timeoutで呼ばれる契約を追加した。
- 動画が消滅する症状への対策として、export中にexternal video sourceを破棄した場合は presenter session keyも無効化し、export失敗/終了後に同じsession扱いで破棄済み動画sourceを再利用しないようにした。
- Red: `viewportRustVideoOnlyBoundary` に、export中のexternal video source破棄がpresenter session keyを無効化する契約を追加した。
- 検証: `npm test -- rustVideoEncodeBackendBridge viewportRustVideoOnlyBoundary` は28件成功。`npm test -- sharedRendererExternalVideoSource sharedRendererPreviewPresenterController sharedRendererViewportPresenterOrchestration` は63件成功。`/Volumes/ExtendSSD-W/GX020052.MP4` の動画ロードE2Eは `presenterStatus=ready` / `videoOwner=sharedRenderer` / `uniquePresentedFrameCount=21` / `blockedSampleCount=0` / `externalVideoMaxAbsDriftMs=6` / `blockingDiagnostics=[]` で成功。対象ファイルで絞った `tsc` は既存の `ThreeStageViewport.tsx` three型エラーのみ。
- 版: `0.1.1-Beta-224f`。

## 2026-06-20
- 実Electron windowの動画入りexportで `No free decode frame slot: NoFreeSlot` が出る問題と、一時停止時にエラー表示が残る問題への復旧策を追加した。
- Red: `sharedRendererViewportVideoUpload` と `sharedRendererViewportNativeRenderSource` に、cached Rust decode jobが `NoFreeSlot` を返した場合はstop/startしてframe requestをretryする契約を追加した。
- Red: `viewportRustVideoOnlyBoundary` に、再生中から一時停止したcleanupでは古いshared renderer presenterを保持しない契約を追加した。
- Green: preview video upload / native render sourceの両経路で `No active decode session` と `No free decode frame slot` をrecoverable cached decode job失敗として扱い、`NoFreeSlot` では枯れたdecode sessionをstopしてから再生成するようにした。
- Green: `Viewport` のpresenter cleanupは次のplayback stateが再生中の時だけcontrolを保持し、一時停止時はdisposeするようにした。
- 検証: `npm test -- --run src/utils/sharedRendererViewportVideoUpload.test.ts src/utils/sharedRendererViewportNativeRenderSource.test.ts src/utils/viewportRustVideoOnlyBoundary.test.ts` は51件成功。`npm test -- --run src/utils/sharedRendererPreviewPresenterController.test.ts src/utils/sharedRendererViewportPresenterOrchestration.test.ts src/utils/sharedRendererExportFrameSourceBoundary.test.ts src/utils/exportTestHarnessBoundary.test.ts` は67件成功。`npm run test:export:fast` は ALL PASSED。`npx tsc --noEmit` は既存のthree/mp4box/fixture型エラーで失敗。
- 版: `0.1.1-Beta-224g`。

## 2026-06-20
- 実Electron windowで `/Volumes/ExtendSSD-W/GX020052.MP4` を読み込み、動画出力ボタンからRust backend rawvideo/ffmpeg経路でMP4を生成するE2Eを追加した。
- Red: E2Eが実ファイル選択、Timeline配置、Rust shared renderer readiness、動画出力クリック、完了dialog、成果物MP4の存在とサイズを検証する契約を追加した。
- Green: macOSの `shm_open` で失敗していた長すぎるshared memory名を、export sourceは `/uxe-...`、native render outputは `/uxn-...` の短い安定hash名へ変更した。
- Green: Rust backend側では同じdecode jobが既にactiveなのにrenderer側の `activeJobs` cacheが空の状態で `No free decode frame slot: NoFreeSlot` が返る場合も、対象jobをstop/startして同じframe requestをretryするようにした。
- E2E専用に `UXFD_VIDEO_EXPORT_E2E_SAVE_PATH` をElectron mainへ渡し、保存ダイアログを固定出力先へ迂回して、テストが実成果物を確実に検査できるようにした。通常のユーザー操作では従来どおり保存ダイアログを表示する。
- 検証: `npm test -- --run src/utils/legacyBase64ExportBoundary.test.ts src/utils/sharedRendererViewportNativeRenderSource.test.ts src/utils/sharedRendererViewportVideoUpload.test.ts src/utils/sharedRendererExportFrameSource.test.ts` は72件成功。`UXFD_VIDEO_EXPORT_E2E_VIDEO_PATH=/Volumes/ExtendSSD-W/GX020052.MP4 npm run test:video-export:e2e` は成功し、`エクスポート完了` / `Rust backend rawvideo/ffmpeg` / `60` frames / `506379` bytes のMP4生成を確認した。
- 残課題: 今回のE2Eは1秒/60フレームに短縮している。長尺4K exportの速度と安定性は別途計測・最適化する。export中previewの `status=fallback / reason=exporting` は既存のexport中surface停止制御で、書き出し自体はRust shared-frame sourceで完了している。
- 版: `0.1.1-Beta-224h`。

## 2026-06-20
- 動画export高速化の初手として、Rust shared-frame exportの `renderNativeSharedFrame` と `encode.writeFrame` を完全直列にせず、現在フレームのwrite中に次フレーム生成を1つだけ先読みするようにした。
- Red: `runRustBackendVideoEncodeExport` に、current frame writeが未完了の間にnext frame generatorが進む契約を追加した。
- Red: current frame writeが失敗した時、先読み済みのnative render outputもreleaseしてリークさせない契約を追加した。
- Green: async iteratorを手動駆動し、`writeSharedFrameToRustBackend(current)` を開始してから `iterator.next()` で次フレームを生成する形へ変更した。
- Green: write失敗時はcurrent frame outputの既存releaseに加え、prefetched frame outputもbest-effortでreleaseするようにした。
- 検証: `npm test -- --run src/utils/rustBackendVideoEncodeExport.test.ts` は14件成功。`npm test -- --run src/utils/rustBackendVideoEncodeExport.test.ts src/utils/rustBackendVideoEncodeControl.test.ts src/utils/projectExportRustEncodeFrame.test.ts src/utils/sharedRendererExportFrameSource.test.ts` は64件成功。`UXFD_VIDEO_EXPORT_E2E_VIDEO_PATH=/Volumes/ExtendSSD-W/GX020052.MP4 npm run test:video-export:e2e` は成功し、起動込み約25秒、60 frames / `506379` bytes のMP4生成を確認した。
- 残課題: 今回の改善はrender/write待ちの重なりを作る低リスク施策で、decode/native renderそのものの回数はまだ減っていない。次はE2Eにexport開始から完了までの純粋なdurationを記録し、2〜5秒尺で差分を測る。
- 版: `0.1.1-Beta-224i`。

## 2026-06-20
- 動画export高速化の判断材料として、E2E resultへElectron/Vite起動時間を除いたexportボタン押下から完了dialogまでの `exportDurationMs` を記録するようにした。
- Red: `packageScripts.test` に、`run-video-export-e2e.mjs` が `UXFD_VIDEO_EXPORT_E2E_DURATION_SECONDS`、`exportDurationMs`、`exportFramesPerSecond` を持つ契約を追加した。
- Green: `UXFD_VIDEO_EXPORT_E2E_DURATION_SECONDS` でE2E用timeline durationを可変にし、dialogの `フレーム:` から `exportedFrameCount` を抽出して `exportFramesPerSecond` を算出するようにした。
- 検証: `npm test -- --run src/utils/packageScripts.test.ts` は2件成功。`UXFD_VIDEO_EXPORT_E2E_VIDEO_PATH=/Volumes/ExtendSSD-W/GX020052.MP4 UXFD_VIDEO_EXPORT_E2E_DURATION_SECONDS=1 npm run test:video-export:e2e` は60 frames / `16306` ms / 約 `3.68` fps / `506379` bytesで成功。`UXFD_VIDEO_EXPORT_E2E_VIDEO_PATH=/Volumes/ExtendSSD-W/GX020052.MP4 UXFD_VIDEO_EXPORT_E2E_DURATION_SECONDS=2 npm run test:video-export:e2e` は120 frames / `29373` ms / 約 `4.09` fps / `1029465` bytesで成功。
- 残課題: 現状は動画only exportで約4fps。次はframe単位に `native render/decode/write` の時間を分解し、最も大きい待ちを優先して削る。
- 版: `0.1.1-Beta-224j`。

## 2026-06-20
- Rust backendの動画export hot pathで、frameごとのWGPU adapter/device/pipeline/output texture/readback buffer再生成を避けるため、`BackendState` に `NativeWgpuRenderer` を保持して解像度が変わらない限り再利用するようにした。
- native WGPU readback formatを `Rgba16Float` から `Rgba8Srgb` に変更し、CPU half-float decode / linear-to-srgb変換 / unpremultiplyをexport hot pathから外した。
- Red: native WGPU rendererのsetup時間が永続rendererのframe timingへ入らない契約、Rust backendがrendererを再利用する契約、native WGPU readbackがRGBA8で返る契約を追加済み。
- Green: `NativeWgpuRenderer::new` / `render_frame_stages` / `render_frame_to_shared_ring` を追加し、既存の単発APIは永続rendererを内部利用する互換実装に整理した。
- 検証: `cargo test --manifest-path native-wgpu-renderer/Cargo.toml --test frame_stage_timings -- --nocapture` は3件成功。`cargo test --manifest-path native-wgpu-renderer/Cargo.toml --test native_reference_parity -- --nocapture` は10件成功。`cargo test --manifest-path rust-backend/Cargo.toml --test decode_control_plane native_render_shared_frame -- --nocapture` は10件成功。`cargo test --manifest-path rust-backend/Cargo.toml --test decode_control_plane native_rendered_image_frame_can_feed_audio_muxed_encode -- --nocapture` は1件成功。`npm test -- --run src/utils/rustBackendNativeRenderBoundary.test.ts` は3件成功。`cargo build --manifest-path rust-backend/Cargo.toml` は成功。
- 実Electron E2E: `/Volumes/ExtendSSD-W/GX020052.MP4` で1秒尺は60 frames / 3017ms / 約19.89fps、2秒尺は120 frames / 4348ms / 約27.60fps、5秒尺は300 frames / 8910ms / 約33.67fpsで成功した。
- 残課題: 5秒尺では30fpsを超えたが短尺では初期化・Electron側待ちの比率が残る。次はshared memory往復を削るRust内direct encode pathと、decode/source texture再利用を優先する。
- 版: `0.1.1-Beta-225a`。

## 2026-06-20
- Rust backendに `encode.writeNativeFrame` を追加し、native render output shared memoryを返さずに `NativeWgpuRenderer::render_frame_stages` のRGBA8結果をffmpeg stdinへ直接書けるようにした。
- Electron main/preload/renderer型に `rust-backend-encode-write-native-frame` / `writeNativeEncodeFrame` を追加した。
- export helperに `nativeEncodeFramePayload` を追加し、direct frameでは `encode.writeFrame` ではなく `writeNativeEncodeFrame` を呼ぶようにした。
- shared renderer export sourceは `window.rustVideoEncoder.nativeDirectEncodeEnabled === true` の時だけdirect payloadを返す。通常exportでは既存のshared native render output経路を維持する。
- 実測: 通常E2Eは `/Volumes/ExtendSSD-W/GX020052.MP4` 5秒尺で300 frames / 8871ms / 約33.82fps。`VITE_UXFD_NATIVE_DIRECT_ENCODE=1` のdirect opt-in E2Eは2秒尺で120 frames / 8863ms / 約13.54fps。
- 判断: 単純なdirect RPC結合はshared memory往復を消す一方で、既存のrender/write先読みの重なりを失い遅くなるため、デフォルト有効化しない。次はRust backend内でrender queue / encode queueを分けるpipeline化が必要。
- 版: `0.1.1-Beta-226a`。

## 2026-06-20
- 「軽い動画なのに常に重い」問題への対策として、単一動画の軽量経路を追加した。
- Red: renderer export helperに、単一・無加工・同サイズ動画はdecoded shared frameをencoderへ直接渡し、成功/失敗時にdecode slotを解放する契約を追加した。
- Green: shared frame encode payloadへ成功/失敗後の解放callbackを追加し、`decodedVideoPassthrough` を導入した。適用条件は単一動画・identity transform・opacity 1・effectsなし・出力サイズ一致に限定。
- Red: Rust backendに、単一動画を整数座標へ置くだけのnative renderが `cpuSimpleVideoComposite` を返す契約を追加した。
- Green: `render.nativeSharedFrame` で単一Video clip、scale 1、rotation 0、opacity 1、effectsなし、整数translationの場合、WGPU upload/render/readbackを通さずCPU row-copyでoutput shared ringを作るfast pathを追加した。
- 検証: renderer/export関連unitは79件成功。`cargo test --manifest-path rust-backend/Cargo.toml --test decode_control_plane native_render -- --nocapture` は16件成功。`cargo build --manifest-path rust-backend/Cargo.toml` は成功。
- 実Electron E2E: `/Volumes/ExtendSSD-W/GX020052.MP4` 5秒尺は300 frames / 8518ms / 約35.22fpsで成功。fast path前に同条件で再測定したWGPU経路は約24.30〜25.17fps、以前の良好値は約33.82fps。
- 残課題: scaleや複数オブジェクト、フィルタが入ると従来のnative WGPU合成へ戻る。次は単純scale付き動画、静止画+動画、音声付きexportのどこから重くなるかをE2Eで分解する。
- 版: `0.1.1-Beta-227a`。

## 2026-06-20
- export済み動画がモニョモニョする問題を受け、書き出し時にプレビュー用640pxプロキシを素材として使わないように修正した。
- Red: previewでは既存プロキシを使い、exportでは原本動画file pathを使う契約を追加した。
- Red: export用decodeではviewport向けの縮小上限を呼び出し側で制御できる契約を追加した。
- Green: `VideoObject` に `sourceWidth` / `sourceHeight` を追加し、動画インポート時に原本metadataを保持するようにした。
- Green: `buildRustSceneSnapshotForTimeline` に `videoSourceMode` を追加し、previewは `previewProxy`、exportは `exportOriginal` を使うようにした。
- Green: export時は原本sourceを使い、WGPU texture上限を踏まえた2048px decodeへ変換する。visual geometryは `object.width / decodedWidth` のscale補正で維持する。
- 検証: `npm test -- --run src/utils/rustSceneSnapshot.test.ts src/utils/sharedRendererExportSession.test.ts src/utils/sharedRendererViewportNativeRenderSource.test.ts src/utils/sharedRendererExportFrameSource.test.ts` は76件成功。実Electron E2Eは `/Volumes/ExtendSSD-W/GX020052.MP4` 1秒尺で60 frames / 7758ms / 約7.73fps、出力MP4は1920x1080 / 60fps。
- 残課題: 品質優先で原本2048px decodeへ戻したため、直前のプロキシ高速経路より速度は落ちる。次は「原本高品質decode + 単純scale合成fast path」を追加して、画質と速度を両立する。
- 版: `0.1.1-Beta-228a`。
## 2026-06-22 — GetColor / hksy / 93優先効果を動画export E2E代表ケースへ投入

### 実施内容
- Red: `test:video-export:e2e` のAviUtl生成効果投入導線が、GetColor V2Rドットフィールド、hksyチェッカー/グリッド、93 SpotLight Probe、93音声玉を代表ケースとして扱う契約を追加した。
- Green: `__UXFD_VIDEO_EXPORT_E2E_ADD_AVIUTL_GENERATED_EFFECTS__` hookへ、既存のAudio waveform R / 標準パーティクルに加えて GetColor V2R、hksy、SpotLight付きshape、音声がある場合の93音声玉を追加するようにした。
- Green: `scripts/run-video-export-e2e.mjs` はhookが返す `timelineNames` を待機対象に使い、音声有無で増減する代表効果にも追従できるようにした。
- 版を `0.1.1-Beta-293a` に更新した。

### 検証
- `npm test -- --run src/utils/packageScripts.test.ts --reporter=dot` は6件成功。
- `npx tsc --noEmit` は既知の `ThreeStageViewport.tsx` のthree型、`mp4box` 型、`heavyEffectsStress.test.ts` の `PositionKeyframe` 型エラーのみで、今回のE2E hook由来の型エラーは出ていない。

### 残課題・次のステップ
- 次は `UXFD_VIDEO_EXPORT_E2E_ADD_MIXED_MEDIA=1 UXFD_VIDEO_EXPORT_E2E_ADD_AVIUTL_GENERATED_EFFECTS=1` の実Electron E2Eを短尺で走らせ、出力MP4内に優先効果が見えることを画素検査へ広げる。

## 2026-06-22 — 93 SpotLightをRust/WebGPU effectへ追加

### 実施内容
- Red: `93 SpotLight` がAviUtlPackV4 effect preset一覧へ入り、`spot_light` filterとしてRust scene snapshotへ `SpotLight` effectを渡す契約を追加した。
- Green: `SpotLightFilterParams` と `spot_light` filterを追加し、Filter Stackの正規化・PropertyPanel表示名・AviUtl Effects presetへ接続した。
- Green: rust-coreの `Effect::SpotLight` schemaとvalidationを追加し、中心・半径・強度・色をRust境界で保持できるようにした。
- Green: native-wgpu shaderへsource座標ベースのスポットライト加算を追加し、中心ピクセルが端より明るくなる画素テストを追加した。
- 版を `0.1.1-Beta-292a` に更新した。

### 検証
- `npm test -- --run src/utils/aviutlEffectPresets.test.ts src/utils/rustSceneSnapshot.test.ts src/components/PropertyPanelBoundary.test.ts src/utils/filterStack.test.ts --reporter=dot` は72件成功。
- `cargo test --manifest-path rust-core/Cargo.toml --test timeline_snapshot_contract evaluated_clip_carries_effects_for_renderer_contract -- --nocapture` は1件成功。
- `cargo test --manifest-path rust-backend/Cargo.toml --test decode_control_plane native_render -- --nocapture` は22件成功。
- `cargo test --manifest-path native-wgpu-renderer/Cargo.toml native_wgpu_applies_spot_light_to_centre_pixels -- --nocapture` は1件成功。
- `npx tsc --noEmit` は既知の `ThreeStageViewport.tsx` のthree型、`mp4box` 型、`heavyEffectsStress.test.ts` の `PositionKeyframe` 型エラーのみで、今回の `SpotLight` / `spot_light` 由来の型エラーは出ていない。

### 残課題・次のステップ
- GetColor / hksy / 93の最優先レーンは一通り入った。次は代表ケースを組み合わせたプレビュー/export確認、または93ディレクトリ内の追加候補を棚卸しして次のP1/P2を選ぶ。

## 2026-06-22 — 93 Delay個別をnative motion presetへ追加

### 実施内容
- Red: `93 Delay個別` がAviUtlPackV4 motion preset一覧へ入り、index/totalに応じた開始遅延と逆順をキーフレームとして生成する契約を追加した。
- Green: `delay-move-individual` presetを追加し、全体遅延時間を選択数で割って開始タイミングをずらすnative keyframe生成へ接続した。
- Green: PropertyPanelのAviUtl Motionから複数選択中に `93: Delay個別` を押すと、選択中オブジェクトへ順番付きでプリセットを適用するようにした。
- 版を `0.1.1-Beta-291a` に更新した。

### 検証
- `npm test -- --run src/utils/aviutlMotionPresets.test.ts src/components/PropertyPanelBoundary.test.ts --reporter=dot` は13件成功。

### 残課題・次のステップ
- 次は `93 SpotLight` をRust/WebGPU effectへ追加する。

## 2026-06-22 — 93音声玉をRust音声反応生成オブジェクトへ追加

### 実施内容
- Red済みの93音声玉契約に対して、`AudioSphereObject` と `buildAviUtlAudioSphereObject` を追加し、Timeline右クリックメニューから `93音声玉` を配置できるようにした。
- `audio_sphere` をプロジェクト保存/読込、Rust scene snapshot、shared renderer native media support、Pixi cutover、export native render gateへ接続した。
- Rust境界へ `GeneratedAudioSphere` / `audio-sphere-93` を追加し、音声サンプルpayloadを使ってnative-wgpu-renderer側で音声反応する球状点群を生成するようにした。
- Rust backendのnative render source収集では `GeneratedAudioSphere` を `GeneratedAudioWaveform` と同じくsource upload不要の音声反応生成メディアとして扱うようにした。
- 版を `0.1.1-Beta-290a` に更新した。

### 検証
- `npm test -- --run src/utils/audioSphereObjectFactory.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/pixiGeneratedEffectCutover.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/projectFile.test.ts src/utils/projectExportFrameCanvas.test.ts src/utils/sharedRendererViewportNativeRenderUpload.test.ts --reporter=dot` は113件成功。
- `cargo test --manifest-path rust-core/Cargo.toml --test media_schema rust_core_accepts_generated_audio_sphere_media_kind_at_the_json_boundary -- --nocapture` は1件成功。
- `cargo test --manifest-path native-wgpu-renderer/Cargo.toml native_wgpu_renders_generated_audio_sphere_frame_from_audio_samples -- --nocapture` は1件成功。
- `cargo test --manifest-path rust-backend/Cargo.toml --test decode_control_plane native_render -- --nocapture` は22件成功。
- `npx tsc --noEmit` は既知の `ThreeStageViewport.tsx` のthree型、`mp4box` 型、`heavyEffectsStress.test.ts` の `PositionKeyframe` 型エラーのみで、今回の `AudioSphere` / `GeneratedAudioSphere` 由来の型エラーは出ていない。

### 残課題・次のステップ
- 93系の次候補として、`Delay個別` をnative motion presetへ追加し、その後 `SpotLight` をRust/WebGPU effectへ追加する。

## 2026-06-22 — AviUtlPackV4移植ゴールの優先対象を更新

### 実施内容
- アクティブな開発ゴールの運用上の優先対象を、`AviUtlPackV4` 全体の広範な標準搭載から、まず `GetColor`、`hksy`、`93` ディレクトリの高優先効果をRust/WebGPUネイティブ実装へ載せる方針へ更新した。
- `markdown/Task.md` に現在の完了条件を追記し、GetColor系生成効果、hksyチェッカー/グリッド、93音声玉/Delay個別/SpotLightを保存/読込・プレビュー・export・境界テスト付きで利用できる状態にすることを明文化した。
- `markdown/Implementation_Plan.md` のAviUtlPackV4標準搭載ロードマップへ、`GetColor`、`hksy`、`93` を当面のP1優先レーンとして追記した。

### 検証
- 文書更新のみ。実装テストは次の93音声玉Green検証で実施する。

### 残課題・次のステップ
- 進行中の93音声玉Green実装を完了し、続けて93 Delay個別と93 SpotLightへ進む。
