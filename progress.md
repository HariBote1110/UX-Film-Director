## 2026-06-22 — utilsのAviUtlプリセット群をaviutlへ集約

### 実施内容
- `glittery-sauteeing-diffie.md` のフェーズ1方針に従い、`aviutlEffectPresets`、`aviutlMotionPresets`、`aviutlPackFeatureCatalog` と対のテストを `src/utils/aviutl/` へ移動した。
- `PropertyPanel` のAviUtlプリセットimportを新しい配置へ更新した。
- 移動したファイル内の `types`、`filterStack`、`easings` 参照を新しい階層に合わせて調整した。
- 振る舞い不変のリファクタリングのため、`package.json` のバージョンは据え置いた。

### 検証
- `npm test -- --run src/utils/aviutlEffectPresets.test.ts src/utils/aviutlMotionPresets.test.ts src/utils/aviutlPackFeatureCatalog.test.ts --reporter=dot` は3ファイル17件成功した。
- `npm test -- --run src/utils/aviutl src/components/PropertyPanelBoundary.test.ts --reporter=dot` は4ファイル22件成功した。
- `npx tsc --noEmit` は既知の `ThreeStageViewport.tsx` のthree型、`mp4box` 型、`heavyEffectsStress.test.ts` の `PositionKeyframe` 型エラーのみで、今回の移動由来のimportエラーは出ていない。

### 残課題・次のステップ
- 次は `export/`、`pixi/`、`sharedRenderer/` など残りの `src/utils/` クラスタを小さく分けて移動する。

## 2026-06-22 — utilsのObjectFactory群をobjectFactoriesへ集約

### 実施内容
- `glittery-sauteeing-diffie.md` のフェーズ1方針に従い、`src/utils/*ObjectFactory.ts` と対になる `*.test.ts` 30組を `src/utils/objectFactories/` へ移動した。
- `src/components/TimelineContextMenu.tsx` と `src/main.tsx` の生成オブジェクトfactory importを新しい配置へ更新した。
- 移動したfactory内の `types` 参照を `../../types` へ調整し、テスト側は同一ディレクトリの相対importを維持した。
- 振る舞い不変のリファクタリングのため、`package.json` のバージョンは `0.1.1-Beta-313a` のまま据え置いた。

### 検証
- `npm test -- --run src/utils/objectFactories --reporter=dot` は30ファイル45件成功した。
- `npm test -- --run src/utils/objectFactories src/components/TimelineContextMenu.particle.test.ts src/utils/projectFile.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/packageScripts.test.ts --reporter=dot` は35ファイル139件成功した。
- `npx tsc --noEmit` は既知の `ThreeStageViewport.tsx` のthree型、`mp4box` 型、`heavyEffectsStress.test.ts` の `PositionKeyframe` 型エラーのみで、今回の移動由来のimportエラーは出ていない。

### 残課題・次のステップ
- 次は `glittery-sauteeing-diffie.md` のフェーズ1に沿って、`sharedRenderer/` または `export/` などのクラスタを同様に小さく移動する。

## 2026-06-22 — GetColor ColorShift初期互換としてサンプル色相シフトを追加

### 実施内容
- Red: `GeneratedGetColorDots` が `sample_hue_shift_degrees` をsnapshot/native gate/Rust画素生成で扱う契約を追加した。
- Red: PropertyPanelのGetColor Sampling UIが `sampleHueShiftDegrees` と `Sample Hue Shift` を露出する契約を追加した。
- Green: `GetColorDotFieldObject` に `sampleHueShiftDegrees` を追加し、Rust scene snapshotで `sample_hue_shift_degrees` として渡すようにした。
- Green: shared renderer native gateとproject file検証で `sample_hue_shift_degrees` / `sampleHueShiftDegrees` を `-720..720` に制限した。
- Green: Rust backendでサンプル済みRGBをHSVへ変換し、指定角度だけ色相を回してからドットへ描画するようにした。
- Green: PropertyPanelに `Sample Hue Shift` 数値入力を追加し、UIからGetColor(ColorShift)初期互換を調整できるようにした。
- 版を `0.1.1-Beta-313a` に更新した。

### 検証
- `npm test -- --run src/utils/rustSceneSnapshot.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts --reporter=dot` は76件成功した。
- `npm test -- --run src/components/PropertyPanelBoundary.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts --reporter=dot` は81件成功した。
- `npm test -- --run src/utils/projectFile.test.ts src/utils/packageScripts.test.ts --reporter=dot` は17件成功した。
- `cargo test --manifest-path rust-backend/Cargo.toml generated_getcolor_dots_source -- --nocapture` は6件成功した。
- `npx tsc --noEmit` は既知の `ThreeStageViewport.tsx` のthree型、`mp4box` 型、`heavyEffectsStress.test.ts` の `PositionKeyframe` 型エラーのみで、今回のGetColor ColorShift初期互換由来の型エラーは出ていない。

### 残課題・次のステップ
- 現時点はサンプル色の色相シフト初期互換。AviUtl GetColor(ColorShift)の閾値タイプ、段階表示、HEX/Alpha連動は後続で段階的に追加する。
- 次はGetColor(Twist/Field/AudioReact)か、`hksy` / `93` の未移植候補へ進む。

## 2026-06-22 — GetColor PSDサンプル参照をRust生成とPropertyPanelへ接続

### 実施内容
- Red: Rust scene snapshot、shared renderer native media gate、Rust backend validatorが、PSDを `GeneratedGetColorDots` の `source_image` として受け取り、`source_active_layer_ids` を保持する契約を追加した。
- Red: PropertyPanelのGetColor Sampling UIが、PNG/JPEG画像だけでなくPSDオブジェクトもサンプル候補として扱う契約を追加した。
- Green: Rust scene snapshotでPSDオブジェクト参照時に `source_image` と `source_active_layer_ids` を `GeneratedGetColorDots` source JSONへ渡すようにした。
- Green: Rust backendでGetColorサンプル元PSDを読み込み、アクティブレイヤーだけを合成したフレームからドット色と透明度をサンプリングできるようにした。
- Green: PropertyPanelのSample Object候補にPSDオブジェクトを含め、UI説明文もPNG/JPEGまたはPSDに更新した。
- 版を `0.1.1-Beta-311a` に更新した。

### 検証
- `npm test -- --run src/components/PropertyPanelBoundary.test.ts --reporter=dot` は5件成功した。
- `npm test -- --run src/components/PropertyPanelBoundary.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/projectFile.test.ts src/utils/packageScripts.test.ts --reporter=dot` は98件成功した。
- `cargo test --manifest-path rust-backend/Cargo.toml generated_getcolor_dots_source -- --nocapture` は5件成功した。
- `npx tsc --noEmit` は既知の `ThreeStageViewport.tsx` のthree型、`mp4box` 型、`heavyEffectsStress.test.ts` の `PositionKeyframe` 型エラーのみで、今回のGetColor PSDサンプル対応由来の型エラーは出ていない。

### 残課題・次のステップ
- 小型PSD fixtureを用意できたら、実PSDファイルを使う画素E2EでレイヤーON/OFF差分まで検証する。
- 次はGetColorのField/Twist/ColorShift/AudioReact系、または `hksy` / `93` の残候補へ進む。

## 2026-06-22 — GetColorサンプリング編集UIをPropertyPanelへ追加

### 実施内容
- Red: PropertyPanelが `getcolor_dot_field` 選択時に `GetColor Sampling`、`Sample Layer`、`Sample Object`、`Sample Strength` を露出する契約を追加した。
- Green: PropertyPanelにGetColorサンプリング編集UIを追加し、画像オブジェクト候補から `sampleSourceObjectId` を選択できるようにした。
- Green: `sampleSourceLayer` は1始まりのレイヤー番号として編集でき、`sampleStrength` は0〜1のスライダーで編集できるようにした。
- Green: 明示画像オブジェクト選択時は直接パス指定を解除し、Rust scene snapshot側のオブジェクトID参照解決に寄せるようにした。
- Version: `0.1.1-Beta-309a`。

### 検証
- `npm test -- --run src/components/PropertyPanelBoundary.test.ts --reporter=dot` は5件成功。
- `npm test -- --run src/components/PropertyPanelBoundary.test.ts src/utils/getColorDotFieldObjectFactory.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/projectFile.test.ts src/utils/packageScripts.test.ts --reporter=dot` は100件成功。
- `cargo test --manifest-path rust-backend/Cargo.toml generated_getcolor_dots_source_frame -- --nocapture` は4件成功。
- `npx tsc --noEmit` は既知の `ThreeStageViewport.tsx` のthree型、`mp4box` 型、`heavyEffectsStress.test.ts` の `PositionKeyframe` 型エラーのみで、今回のGetColorサンプリング編集UI由来の型エラーは出ていない。

### 残課題・次のステップ
- 画像オブジェクト候補はPNG/JPEGに限定。PSDを合成済みサンプルとして扱うUI/Rust経路は後続で追加する。

## 2026-06-22 — GetColor画像レイヤー参照をRust生成へ接続

### 実施内容
- Red: GetColor V2R画像サンプリングドットが、直接画像パスだけでなく `sampleSourceLayer` と `sampleSourceObjectId` から画像オブジェクトのローカルパスを解決して `source_image` へ渡す契約を追加した。
- Green: `GetColorDotFieldObject` に `sampleSourceLayer` / `sampleSourceObjectId` を追加し、保存/読込検証で保持できるようにした。
- Green: `buildGetColorSampledDotFieldObject` は、配置レイヤーの一つ上を既定サンプル元レイヤーとして持つようにした。
- Green: Rust scene snapshotで、`sampleSourcePath` 明示指定を最優先し、次に `sampleSourceObjectId`、最後に `sampleSourceLayer` のアクティブな画像オブジェクトを解決して `GeneratedGetColorDots` source JSONへ渡すようにした。
- Version: `0.1.1-Beta-308a`。

### 検証
- `npm test -- --run src/utils/getColorDotFieldObjectFactory.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/projectFile.test.ts --reporter=dot` は79件成功。
- `npm test -- --run src/utils/getColorDotFieldObjectFactory.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/projectFile.test.ts src/utils/aviutlPackFeatureCatalog.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/packageScripts.test.ts --reporter=dot` は100件成功。
- `cargo test --manifest-path rust-backend/Cargo.toml generated_getcolor_dots_source_frame -- --nocapture` は4件成功。

### 残課題・次のステップ
- 現時点の自動参照は画像オブジェクトのPNG/JPEGに限定。PSDを直接 `source_image` として読む経路や、PropertyPanel/source pickerで明示的に選ぶUIは後続で接続する。

## 2026-06-22 — GetColor画像サンプリングをRust生成へ接続

### 実施内容
- Red: GetColor V2R画像サンプリングドットがfactory、Timeline右クリックメニュー、AviUtlPackV4カタログ、保存/読込、Rust scene snapshot、shared renderer native media、Rust backend画素生成を通る契約を追加した。
- Green: `GetColorDotFieldObject` に `sampleSourcePath` / `sampleStrength` を追加し、`GeneratedGetColorDots` source JSONへ `source_image` / `sample_strength` を渡せるようにした。
- Green: Rust backendで `source_image` のPNG/JPEGを既存ローカルメディアパス処理経由で読み、各ドット位置の元画像色と透明度をサンプリングしてRGBA生成へ反映するようにした。
- Green: native render gateで `source_image` をローカルPNG/JPEGまたは `file://` に限定し、`sample_strength` を0〜1に制限した。
- Green: Timeline右クリックメニューに `GetColor V2R画像サンプリングドットを追加` / `Add GetColor V2R Sampled Dots` を追加した。
- Version: `0.1.1-Beta-307a`。

### 検証
- `npm test -- --run src/utils/getColorDotFieldObjectFactory.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/projectFile.test.ts src/utils/aviutlPackFeatureCatalog.test.ts src/components/TimelineContextMenu.particle.test.ts --reporter=dot` は92件成功。
- `cargo test --manifest-path rust-backend/Cargo.toml generated_getcolor_dots_source_frame_samples_source_image_colour_and_alpha -- --nocapture` は1件成功。
- `cargo test --manifest-path rust-backend/Cargo.toml generated_getcolor_dots_source_frame -- --nocapture` は4件成功。
- `npm test -- --run src/utils/pixiGeneratedEffectCutover.test.ts src/utils/packageScripts.test.ts --reporter=dot` は7件成功。

### 残課題・次のステップ
- 今回はRust生成経路とプロジェクト永続化の接続まで。実用面では画像パス指定UI、または上位画像レイヤーを自動参照する導線を追加すると、GetColorらしい素材反応表現として使いやすくなる。

## 2026-06-22 — 93 SphericalFieldをRust生成プリセットへ追加

### 実施内容
- Red: `spherical_field` がfactory、Timeline右クリックメニュー、AviUtlPackV4カタログ、Rust scene snapshot、shared renderer native media、rust-core schema、Rust backend画素生成を通る契約を追加した。
- Green: `SphericalFieldObject` と `GeneratedSphericalField` media kindを追加し、`spherical-field-93` source JSONで半径、強度、色量、透明度、線幅、リング数、ベクトル数、色、背景不透明度、container指定をRustへ渡すようにした。
- Green: Rust backendで透明背景に球状フィールド、複数リング、外向き/内向きベクトル、中心マーカーをRGBA生成する初期互換実装を追加した。
- Green: Timeline右クリックメニューに `93 SphericalFieldを追加` / `Add 93 SphericalField` を追加した。
- Green: 保存/読込、export native render判定、Pixi二重描画除外、shared renderer preview session収集にも `spherical_field` / `GeneratedSphericalField` を接続した。
- Version: `0.1.1-Beta-306a`。

### 検証
- `npm test -- --run src/utils/sphericalFieldObjectFactory.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/aviutlPackFeatureCatalog.test.ts src/components/TimelineContextMenu.particle.test.ts --reporter=dot` は76件成功。
- `npm test -- --run src/utils/projectFile.test.ts src/utils/projectExportFrameCanvas.test.ts src/utils/pixiGeneratedEffectCutover.test.ts src/utils/packageScripts.test.ts --reporter=dot` は54件成功。
- `cargo test --manifest-path rust-core/Cargo.toml --test media_schema -- --nocapture` は32件成功。
- `cargo test --manifest-path rust-backend/Cargo.toml generated_spherical_field_source_frame_renders_force_ring -- --nocapture` は1件成功。
- `npx tsc --noEmit` は既知の `ThreeStageViewport.tsx` のthree型、`mp4box` 型、`heavyEffectsStress.test.ts` の `PositionKeyframe` 型エラーのみで、今回の93 SphericalField由来の型エラーは出ていない。

### 残課題・次のステップ
- SphericalField本来のオブジェクト座標押し出し/吸い込みは未実装。次はGetColorの元画像サンプリング寄り拡張へ進む。

## 2026-06-22 — 93 Sphere(DrawPixel)をRust生成プリセットへ追加

### 実施内容
- Red: `sphere_dots` がfactory、Timeline右クリックメニュー、AviUtlPackV4カタログ、Rust scene snapshot、shared renderer native media、rust-core schema、Rust backend画素生成を通る契約を追加した。
- Green: `SphereDotsObject` と `GeneratedSphereDots` media kindを追加し、`sphere-drawpixel-93` source JSONで半径、列/行、回転、ズレ、輝度影響、点サイズ、緯線幅、色、平面化指定をRustへ渡すようにした。
- Green: Rust backendで透明背景に球状点群、緯線、中心補助線をRGBA生成する初期互換実装を追加した。
- Green: Timeline右クリックメニューに `93 Sphere(DrawPixel)を追加` / `Add 93 Sphere(DrawPixel)` を追加した。
- Version: `0.1.1-Beta-305a`。

### 検証
- `npm test -- --run src/utils/sphereDotsObjectFactory.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/aviutlPackFeatureCatalog.test.ts src/components/TimelineContextMenu.particle.test.ts --reporter=dot` は74件成功。
- `npm test -- --run src/utils/projectFile.test.ts src/utils/projectExportFrameCanvas.test.ts src/utils/pixiGeneratedEffectCutover.test.ts src/utils/packageScripts.test.ts --reporter=dot` は54件成功。
- `cargo test --manifest-path rust-core/Cargo.toml --test media_schema -- --nocapture` は31件成功。
- `cargo test --manifest-path rust-backend/Cargo.toml generated_sphere_dots_source_frame_renders_equator_points -- --nocapture` は1件成功。
- `npx tsc --noEmit` は既知の `ThreeStageViewport.tsx` のthree型、`mp4box` 型、`heavyEffectsStress.test.ts` の `PositionKeyframe` 型エラーのみで、今回の93 Sphere(DrawPixel)由来の型エラーは出ていない。

### 残課題・次のステップ
- 元画像ピクセルサンプリング、DOF、delayは未実装。次は93 SphericalField、またはGetColorの元画像サンプリング寄り拡張へ進む。

## 2026-06-22 — AviUtlPackV4移植ゴールの運用スコープを更新

### 実施内容
- ツール上のactive goal本文は直接差し替えできないため、`markdown/Implementation_Plan.md` と `markdown/Task.md` に現在の作業ゴールを明文化した。
- 直近スコープを `GetColor`、`hksy`（ユーザー表記: hsky）、`script/93` に絞り、候補棚卸しよりも実際にTimeline追加、保存/読込、Rust/WebGPU preview/export、境界テスト、画素テストまで到達する実装を優先する方針へ更新した。
- `markdown/AviUtlPackV4_Inventory.md` に `hksy` と `hsky` 表記の対応、93 Sphere(DrawPixel) / SphericalField、GetColor画像サンプリング系をP1候補として追記した。

### 検証
- 文書更新のみ。次の実装タスクでRed/Green検証を行う。

### 残課題・次のステップ
- 93 Sphere(DrawPixel)、93 SphericalField、GetColorの元画像サンプリング寄り拡張を優先して、Rust生成プリセットまたはRust/WebGPU effectとして追加する。

## 2026-06-22 — 93 SimpleTubeトーラスをRust生成プリセットへ追加

### 実施内容
- Red: `93 SimpleTubeトーラス` がfactory、Timeline右クリックメニュー、AviUtlPackV4カタログ、Rust scene snapshot、shared renderer native media、Rust backend画素生成を通る契約を追加した。
- Green: `SimpleTubeObject` に `colourPattern` / `fogStrength` / `fogColour` を追加し、`GeneratedSimpleTube` payloadへ `colour_pattern` / `fog_strength` / `fog_colour` を渡すようにした。
- Green: `buildAviUtlSimpleTubeTorusObject` と Timeline右クリックメニューの `93 SimpleTubeトーラスを追加` / `Add 93 SimpleTube Torus` を追加した。
- Green: Rust backendでSimpleTubeの色パターン `single` / `ring` / `depth` とfog色寄せを処理し、トーラス派生で反映するようにした。
- Version: `0.1.1-Beta-304a`。

### 検証
- `npm test -- --run src/utils/simpleTubeObjectFactory.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/aviutlPackFeatureCatalog.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/projectFile.test.ts src/utils/packageScripts.test.ts --reporter=dot` は89件成功。
- `cargo test --manifest-path rust-backend/Cargo.toml generated_simple_tube_source_frame -- --nocapture` は2件成功。
- `npx tsc --noEmit` は既知の `ThreeStageViewport.tsx` のthree型、`mp4box` 型、`heavyEffectsStress.test.ts` の `PositionKeyframe` 型エラーのみで、今回のSimpleTubeトーラス由来の型エラーは出ていない。

### 残課題・次のステップ
- SimpleTube2の完全な3Dポリゴン/fade/fog挙動は未実装。次はSphere系、SphericalField、またはGetColorの元画像サンプリング/Field/Twist方向へ進む。

## 2026-06-22 — 93 SimpleTubeをRust生成プリセットへ追加

### 実施内容
- Red: `93-simple-tube` がAviUtlPackV4カタログ、Timeline右クリックメニュー、factory、保存/読込、Rust scene snapshot、shared renderer native media、rust-core schema、Rust backend画素生成を通る契約を追加した。
- Green: `SimpleTubeObject` と `GeneratedSimpleTube` media kindを追加し、`simple-tube-93` source JSONで半径、奥行き、分割数、リング数、ねじれ、ランダム度、線幅、色、トーラス指定をRustへ渡すようにした。
- Green: Rust backendで透明背景にチューブ状リング、奥行き線、中心補助線をRGBA生成する初期互換実装を追加した。
- Green: Timeline右クリックメニューに `93 SimpleTubeを追加` / `Add 93 SimpleTube` を追加した。
- Version: `0.1.1-Beta-303a`。

### 検証
- `npm test -- --run src/utils/simpleTubeObjectFactory.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/aviutlPackFeatureCatalog.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/projectFile.test.ts src/utils/projectExportFrameCanvas.test.ts src/utils/pixiGeneratedEffectCutover.test.ts src/utils/packageScripts.test.ts --reporter=dot` は124件成功。
- `cargo test --manifest-path rust-core/Cargo.toml --test media_schema -- --nocapture` は30件成功。
- `cargo test --manifest-path rust-backend/Cargo.toml generated_simple_tube_source_frame_renders_tube_lines -- --nocapture` は1件成功。
- `npx tsc --noEmit` は既知の `ThreeStageViewport.tsx` のthree型、`mp4box` 型、`heavyEffectsStress.test.ts` の `PositionKeyframe` 型エラーのみで、今回のSimpleTube由来の型エラーは出ていない。

### 残課題・次のステップ
- SimpleTubeはRust生成の初期線描画版で、AviUtlの3Dポリゴン/fog/fade/色パターン完全互換は未実装。次はSimpleTube2の色パターン/fog近似、Sphere系、またはGetColorの元画像サンプリング/Field/Twist方向へ進む。

## 2026-06-22 — 93領域枠(楕円)/(角落ち)をRust生成プリセットへ追加

### 実施内容
- Red: 93領域枠の `ellipse` / `cut_corner` 派生がfactory、Rust scene snapshot、shared renderer native media、Rust backend画素生成を通る契約を追加した。
- Green: `RegionFrameObject` に `shape` / `cornerCut` を追加し、既存の `GeneratedRegionFrame` payloadへ `shape` と `corner_cut` を渡せるようにした。
- Green: Rust backendで矩形、楕円、角落ちを描き分け、楕円/角落ちの外側を透明、内側を半透明背景、枠を不透明色として生成するようにした。
- Green: Timeline右クリックメニューに `93領域枠(楕円)を追加` / `Add 93 Ellipse Region Frame` と `93領域枠(角落ち)を追加` / `Add 93 Cut-Corner Region Frame` を追加した。
- Version: `0.1.1-Beta-302a`。

### 検証
- `npm test -- --run src/utils/regionFrameObjectFactory.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/aviutlPackFeatureCatalog.test.ts src/utils/projectFile.test.ts src/utils/packageScripts.test.ts --reporter=dot` は86件成功。
- `cargo test --manifest-path rust-backend/Cargo.toml generated_region_frame_source_frame -- --nocapture` は3件成功。
- `cargo test --manifest-path rust-core/Cargo.toml --test media_schema -- --nocapture` は29件成功。
- `npx tsc --noEmit` は既知の `ThreeStageViewport.tsx` のthree型、`mp4box` 型、`heavyEffectsStress.test.ts` の `PositionKeyframe` 型エラーのみで、今回の93領域枠派生由来の型エラーは出ていない。

### 残課題・次のステップ
- 93領域枠は矩形/楕円/角落ちまでRust生成メディアへ乗った。次は93 SimpleTube/Sphere系、またはGetColorの元画像サンプリング/Field/Twist方向へ進む。

## 2026-06-22 — 93領域枠をRust生成プリセットへ追加

### 実施内容
- Red: `93-region-frame` がAviUtlPackV4カタログ、Timeline右クリックメニュー、factory、Rust scene snapshot、shared renderer native media、rust-core schema、Rust backend画素生成を通る契約を追加した。
- Green: `RegionFrameObject` と `GeneratedRegionFrame` media kindを追加し、`region-frame-93` source JSONで枠線幅、背景不透明度、枠色、背景色をRustへ渡すようにした。
- Green: Rust backendで半透明背景と不透明枠をRGBA生成するようにした。
- Green: Timeline右クリックメニューに `93領域枠を追加` / `Add 93 Region Frame` を追加した。
- Version: `0.1.1-Beta-301a`。

### 検証
- `npm test -- --run src/utils/regionFrameObjectFactory.test.ts src/utils/getColorDotFieldObjectFactory.test.ts src/utils/hksyCheckerGridObjectFactory.test.ts src/utils/aviutlPackFeatureCatalog.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/projectFile.test.ts src/utils/projectExportFrameCanvas.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/pixiGeneratedEffectCutover.test.ts src/utils/packageScripts.test.ts --reporter=dot` は130件成功。
- `cargo test --manifest-path rust-core/Cargo.toml --test media_schema -- --nocapture` は29件成功。
- `cargo test --manifest-path rust-backend/Cargo.toml generated_region_frame_source_frame -- --nocapture` は1件成功。
- `npx tsc --noEmit` は既知の `ThreeStageViewport.tsx` のthree型、`mp4box` 型、`heavyEffectsStress.test.ts` の `PositionKeyframe` 型エラーのみで、今回の93領域枠由来の型エラーは出ていない。

### 残課題・次のステップ
- 93系は音声玉、Delay個別、SpotLight、領域枠までUX FDネイティブへ乗った。次はSimpleTube/Sphere系、またはGetColorの元画像サンプリング/Field/Twist方向へ進む。

## 2026-06-22 — GetColor V2R枠線四角ドットを標準プリセットへ追加

### 実施内容
- Red: `getcolor-v2r-outlined-square-dots` がAviUtlPackV4カタログ、Timeline右クリックメニュー、factory、Rust scene snapshot、Rust backend画素生成を通る契約を追加した。
- Green: 既存の `GeneratedGetColorDots` の `dot_shape: "square"` / `stroke_width` を使う標準プリセットとして、factoryとTimeline右クリックメニューへ露出した。
- Green: Rust backendの枠線付き四角ドット描画を画素テストで確認した。
- Version: `0.1.1-Beta-300a`。

### 検証
- `npm test -- --run src/utils/getColorDotFieldObjectFactory.test.ts src/utils/hksyCheckerGridObjectFactory.test.ts src/utils/aviutlPackFeatureCatalog.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/projectFile.test.ts src/utils/projectExportFrameCanvas.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/pixiGeneratedEffectCutover.test.ts src/utils/packageScripts.test.ts --reporter=dot` は128件成功。
- `cargo test --manifest-path rust-backend/Cargo.toml generated_getcolor_dots_source_frame -- --nocapture` は3件成功。
- `npx tsc --noEmit` は既知の `ThreeStageViewport.tsx` のthree型、`mp4box` 型、`heavyEffectsStress.test.ts` の `PositionKeyframe` 型エラーのみで、今回のGetColor枠線四角ドット由来の型エラーは出ていない。

### 残課題・次のステップ
- GetColorはドットフィールド、菱形、枠線四角の図形指定までRust生成メディアへ乗った。次は元画像サンプリング/Field/Twist方向、または93系の残候補へ進む。

## 2026-06-22 — GetColor V2R菱形ドットをRust生成プリセットへ追加

### 実施内容
- Red: `getcolor-v2r-diamond-dots` がAviUtlPackV4カタログ、Timeline右クリックメニュー、factory、保存/読込、Rust scene snapshot、shared renderer native media、Rust backend画素生成を通る契約を追加した。
- Green: `GetColorDotFieldObject` に `dotShape` / `strokeWidth` を追加し、`GeneratedGetColorDots` のJSON payloadへ `dot_shape` / `stroke_width` を渡すようにした。
- Green: Rust backendでGetColorドットを `circle` / `square` / `diamond` として描き分けられるようにした。
- Green: Timeline右クリックメニューに `GetColor V2R菱形ドットフィールドを追加` / `Add GetColor V2R Diamond Dots` を追加した。
- Version: `0.1.1-Beta-299a`。

### 検証
- `npm test -- --run src/utils/getColorDotFieldObjectFactory.test.ts src/utils/hksyCheckerGridObjectFactory.test.ts src/utils/aviutlPackFeatureCatalog.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/projectFile.test.ts src/utils/projectExportFrameCanvas.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/pixiGeneratedEffectCutover.test.ts src/utils/packageScripts.test.ts --reporter=dot` は126件成功。
- `cargo test --manifest-path rust-backend/Cargo.toml generated_getcolor_dots_source_frame -- --nocapture` は2件成功。
- `npx tsc --noEmit` は既知の `ThreeStageViewport.tsx` のthree型、`mp4box` 型、`heavyEffectsStress.test.ts` の `PositionKeyframe` 型エラーのみで、今回のGetColor菱形ドット由来の型エラーは出ていない。

### 残課題・次のステップ
- GetColorはドットフィールドと菱形図形指定までRust生成メディアへ乗った。次は元画像サンプリング/Field/Twist方向、または93系の残候補へ進む。

## 2026-06-22 — hksyライン（アンカー指定）をRust生成プリセットへ追加

### 実施内容
- Red: `hksy-anchor-line` がAviUtlPackV4カタログ、Timeline右クリックメニュー、factory、保存/読込、Rust scene snapshot、shared renderer native media、Rust backend画素生成を通る契約を追加した。
- Green: `HksyCheckerGridObject.pattern` に `anchor-line` を追加し、アンカー点、丸端、最大接続距離をRust payloadへ渡すようにした。
- Green: Rust backendで透明背景に太さ付きアンカー折れ線をRGBA生成するようにした。
- Green: Timeline右クリックメニューに `hksyライン（アンカー指定）を追加` / `Add hksy Anchor Line` を追加した。
- Version: `0.1.1-Beta-298a`。

### 検証
- `npm test -- --run src/utils/hksyCheckerGridObjectFactory.test.ts src/utils/aviutlPackFeatureCatalog.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/projectFile.test.ts src/utils/projectExportFrameCanvas.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/pixiGeneratedEffectCutover.test.ts src/utils/packageScripts.test.ts --reporter=dot` は121件成功。
- `cargo test --manifest-path rust-backend/Cargo.toml generated_hksy_checker_grid_source_frame -- --nocapture` は5件成功。
- `npx tsc --noEmit` は既知の `ThreeStageViewport.tsx` のthree型、`mp4box` 型、`heavyEffectsStress.test.ts` の `PositionKeyframe` 型エラーのみで、今回のhksyライン（アンカー指定）由来の型エラーは出ていない。

### 残課題・次のステップ
- hksy系はチェッカー/グリッド/直線/複数色チェッカー/菱形/グリッド/ライン（アンカー指定）までRust生成メディアへ乗った。次はGetColor画像サンプリング寄り拡張、または93系の残候補へ進む。

## 2026-06-22 — hksyグリッドをRust生成プリセットへ追加

### 実施内容
- Red: `hksy-measured-grid` がAviUtlPackV4カタログ、Timeline右クリックメニュー、factory、保存/読込、Rust scene snapshot、shared renderer native media、Rust backend画素生成を通る契約を追加した。
- Green: `HksyCheckerGridObject.pattern` に `measured-grid` を追加し、`separateInterval` / `separateLineWidth` をRust payloadへ渡すようにした。
- Green: Rust backendで下地色、通常線、区切り線を持つhksyグリッドをRGBA生成するようにした。
- Green: Timeline右クリックメニューに `hksyグリッドを追加` / `Add hksy Grid` を追加した。
- Version: `0.1.1-Beta-297a`。

### 検証
- `npm test -- --run src/utils/hksyCheckerGridObjectFactory.test.ts src/utils/aviutlPackFeatureCatalog.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/projectFile.test.ts src/utils/projectExportFrameCanvas.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/pixiGeneratedEffectCutover.test.ts src/utils/packageScripts.test.ts --reporter=dot` は118件成功。
- `cargo test --manifest-path rust-backend/Cargo.toml generated_hksy_checker_grid_source_frame -- --nocapture` は4件成功。
- `npx tsc --noEmit` は既知の `ThreeStageViewport.tsx` のthree型、`mp4box` 型、`heavyEffectsStress.test.ts` の `PositionKeyframe` 型エラーのみで、今回のhksyグリッド由来の型エラーは出ていない。

### 残課題・次のステップ
- hksy系はチェッカー/グリッド/直線/複数色チェッカー/菱形/グリッドまでRust生成メディアへ乗った。次はhksyライン（アンカー指定）、GetColor画像サンプリング寄り拡張、または93系の残候補へ進む。

## 2026-06-22 — hksy菱形をRust生成プリセットへ追加

### 実施内容
- Red: `hksy-diamond` がAviUtlPackV4カタログ、Timeline右クリックメニュー、factory、保存/読込、Rust scene snapshot、shared renderer native media、Rust backend画素生成を通る契約を追加した。
- Green: `HksyCheckerGridObject.pattern` を追加し、`pattern: "diamond"` を `GeneratedHksyCheckerGrid` のJSON payloadへ渡すようにした。
- Green: Rust backendで `pattern == "diamond"` の場合、透明背景に太さ付き菱形ポリゴンをRGBA生成するようにした。
- Green: Timeline右クリックメニューに `hksy菱形を追加` / `Add hksy Diamond` を追加した。
- Version: `0.1.1-Beta-296a`。

### 検証
- `npm test -- --run src/utils/hksyCheckerGridObjectFactory.test.ts src/utils/aviutlPackFeatureCatalog.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/projectFile.test.ts src/utils/projectExportFrameCanvas.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/pixiGeneratedEffectCutover.test.ts src/utils/packageScripts.test.ts --reporter=dot` は115件成功。
- `cargo test --manifest-path rust-backend/Cargo.toml generated_hksy_checker_grid_source_frame -- --nocapture` は3件成功。
- `npx tsc --noEmit` は既知の `ThreeStageViewport.tsx` のthree型、`mp4box` 型、`heavyEffectsStress.test.ts` の `PositionKeyframe` 型エラーのみで、今回のhksy菱形由来の型エラーは出ていない。

### 残課題・次のステップ
- hksy系はチェッカー/グリッド/直線/複数色チェッカー/菱形までRust生成メディアへ乗った。次はhksyのグリッド/ラインアンカー系、GetColor画像サンプリング寄り拡張、または93系の残候補へ進む。

## 2026-06-22 — hksy複数色チェッカーをRust生成プリセットへ追加

### 実施内容
- Red: `hksy-multi-colour-checker` がAviUtlPackV4カタログ、Timeline右クリックメニュー、factory、保存/読込、Rust scene snapshot、shared renderer native media、Rust backend画素生成を通る契約を追加した。
- Green: `HksyCheckerGridObject.paletteColours` を追加し、`GeneratedHksyCheckerGrid` のJSON payloadへ `palette_colours` を渡すようにした。
- Green: Rust backendで `palette_colours` 指定時にチェッカータイルへ2〜16色のpaletteを循環適用するようにした。
- Green: Timeline右クリックメニューに `hksy複数色チェッカーを追加` / `Add hksy Multi-Colour Checker` を追加した。
- Version: `0.1.1-Beta-295a`。

### 検証
- `npm test -- --run src/utils/hksyCheckerGridObjectFactory.test.ts src/utils/aviutlPackFeatureCatalog.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/projectFile.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/packageScripts.test.ts --reporter=dot` は74件成功。
- `cargo test --manifest-path rust-backend/Cargo.toml generated_hksy_checker_grid_source_frame -- --nocapture` は2件成功。
- `npx tsc --noEmit` は既知の `ThreeStageViewport.tsx` のthree型、`mp4box` 型、`heavyEffectsStress.test.ts` の `PositionKeyframe` 型エラーのみで、今回のhksy複数色チェッカー由来の型エラーは出ていない。

### 残課題・次のステップ
- hksy系はチェッカー/グリッド/直線/複数色チェッカーまでRust生成メディアへ乗った。次はhksyマスク系、GetColor画像サンプリング寄り拡張、または93系の残候補へ進む。

## 2026-06-22 — GetColor V2RドットフィールドをRust生成オブジェクトへ追加

### 実施内容
- Red: `GetColor V2R` のドットフィールドがタイムライン挿入、保存/読込、Rust scene snapshot、shared renderer native media、Pixi cutover、Rust core schema境界、Rust backendラスタ生成を通る契約を追加した。
- Green: `getcolor_dot_field` TimelineObjectと `GeneratedGetColorDots` media kindを追加し、右クリックメニューから「GetColor V2Rドットフィールドを追加」できるようにした。
- Green: Rust backendで背景色上に、U/V位置・疑似明度・乱数を使った前景/二次色ドットフィールドをRGBA生成する実装を入れた。
- Version: `0.1.1-Beta-289a`。

### 検証
- `npm test -- --run src/utils/getColorDotFieldObjectFactory.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/pixiGeneratedEffectCutover.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/projectFile.test.ts src/utils/projectExportFrameCanvas.test.ts --reporter=dot` は97件成功。
- `cargo test --manifest-path rust-core/Cargo.toml --test media_schema rust_core_accepts_generated_getcolor_dots_media_kind_at_the_json_boundary -- --nocapture` は1件成功。
- `cargo test --manifest-path rust-backend/Cargo.toml generated_getcolor_dots_source_frame_contains_dot_field_and_background -- --nocapture` は1件成功。

### 残課題・次のステップ
- 現時点の `GeneratedGetColorDots` は画像サンプリング前の内蔵ドットフィールド互換。元画像の色/透明度を直接サンプルする本格GetColor挙動、Field/Twist/ColorShift/AudioReactは後続で段階的に接続する。
- 次は `93音声玉`、`93 Delay個別`、`93 SpotLight` のいずれかを優先する。

## 2026-06-22 — hksyチェッカー/グリッドをRust生成オブジェクトへ追加

### 実施内容
- Red: `@hksy` のチェッカー/グリッドがタイムライン挿入、保存/読込、Rust scene snapshot、shared renderer native media、Pixi cutover、Rust core schema境界を通る契約を追加した。
- Green: `hksy_checker_grid` TimelineObjectと `GeneratedHksyCheckerGrid` media kindを追加し、Rust backendでチェッカーセルとグリッド線をRGBA生成する実装を入れた。
- Green: 右クリックメニューに「hksyチェッカー/グリッドを追加」を追加し、export frame source policyでもnative render mediaとして扱うようにした。
- Version: `0.1.1-Beta-288a`。

### 検証
- `npm test -- --run src/utils/hksyCheckerGridObjectFactory.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/pixiGeneratedEffectCutover.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/projectFile.test.ts src/utils/projectExportFrameCanvas.test.ts --reporter=dot` は96件成功。
- `cargo test --manifest-path rust-core/Cargo.toml --test media_schema rust_core_accepts_generated_hksy_checker_grid_media_kind_at_the_json_boundary -- --nocapture` は1件成功。
- `cargo test --manifest-path rust-backend/Cargo.toml generated_hksy_checker_grid_source_frame_contains_checker_cells_and_grid -- --nocapture` は1件成功。

### 残課題・次のステップ
- `@hksy` の直線、複数色チェッカー、マスク系までは未移植。次は `GetColor V2R` のドットフィールド、または `93` の音声玉に進む。

## 2026-06-22 — GetColor / hksy / 93系を優先実装レーンへ追加

### 実施内容
- Red: `GetColor V2R`、`@hksy`、`script/93` の代表候補がAviUtlPackV4カタログと直近ロードマップへ入る契約を追加した。
- Green: `getcolor-v2r-dot-field`、`93-audio-sphere`、`93-delay-move`、`93-spotlight`、`hksy-checker-grid` をカタログへ追加した。
- Green: 棚卸しとImplementation Planで、GetColor / hksy / 93系をP1優先レーンへ移した。

### 検証
- `npm test -- --run src/utils/aviutlPackFeatureCatalog.test.ts --reporter=dot` は4件成功。

### 残課題・次のステップ
- 次は `93-audio-sphere` か `getcolor-v2r-dot-field` の実体をRed/Greenで追加する。音声連動の価値が高いので、先に `93-audio-sphere` を既存audio waveformサンプル取得経路へ接続するのが有力。

## 2026-06-22 — Tim簡易トーンカーブをRust生成オブジェクトへ追加

### 実施内容
- Red: `script/てぃむ/簡易トーンカーブ.obj` を、Rust `GeneratedToneCurve` mediaとして扱う境界契約を作った。
- Green: `ToneCurveObject` と `buildAviUtlToneCurveObject` を追加し、Timeline右クリックから `簡易トーンカーブを追加` / `Add Tone Curve` で置けるようにした。
- Green: `rustSceneSnapshot` / shared renderer native support / Rust core schema / Rust backendに `GeneratedToneCurve` を追加した。
- Green: Rust backendで不透明背景、グリッド、線幅付きトーンカーブを持つ決定的なフレームを生成できるようにした。
- Green: `tim-simple-tone-curve` をPackカタログ/棚卸し文書へ追加した。
- 版を `0.1.1-Beta-287a` に更新した。

### 検証
- `npm test -- --run src/utils/toneCurveObjectFactory.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/aviutlPackFeatureCatalog.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/pixiGeneratedEffectCutover.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/projectFile.test.ts src/utils/projectExportFrameCanvas.test.ts --reporter=dot` は98件成功。
- `cargo test --manifest-path rust-core/Cargo.toml --test media_schema rust_core_accepts_generated_tone_curve_media_kind_at_the_json_boundary -- --nocapture` は1件成功。
- `cargo test --manifest-path rust-backend/Cargo.toml generated_tone_curve_source_frame_contains_grid_and_curve -- --nocapture` は1件成功。
- 対象名で絞った `npx tsc --noEmit` は今回変更ファイル由来のエラーなし。既存の `ThreeStageViewport.tsx` Three.js型定義不足、`mp4box` 型定義不足、`heavyEffectsStress.test.ts` の `PositionKeyframe` 未定義のみ検出した。

### 残課題・次のステップ
- 現時点の `GeneratedToneCurve` は表示用UIパネルとしての互換再実装。実際の色補正フィルタとして入力映像へトーンカーブを適用する処理は、後続のRust/WebGPU filter拡張で扱う。

## 2026-06-22 — SSD多角形_震えるをRust生成オブジェクトへ追加

### 実施内容
- Red: `script/ANM/ANM_ssd/多角形_震える.obj` を、Rust `GeneratedShakingPolygon` mediaとして扱う境界契約を作った。
- Green: `ShakingPolygonObject` と `buildAviUtlShakingPolygonObject` を追加し、Timeline右クリックから `多角形_震えるを追加` / `Add Shaking Polygon` で置けるようにした。
- Green: `rustSceneSnapshot` / shared renderer native support / Rust core schema / Rust backendに `GeneratedShakingPolygon` を追加した。
- Green: Rust backendで透明背景、線幅付き多角形アウトライン、任意塗り、フレーム依存の頂点揺れを持つ決定的なフレームを生成できるようにした。
- Green: `ssd-shaking-polygon` をPackカタログ/棚卸し文書へ追加した。
- 版を `0.1.1-Beta-286a` に更新した。

### 検証
- `npm test -- --run src/utils/shakingPolygonObjectFactory.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/aviutlPackFeatureCatalog.test.ts src/utils/pixiGeneratedEffectCutover.test.ts src/utils/projectFile.test.ts src/utils/projectExportFrameCanvas.test.ts src/e2e/allReadableMedia.e2e.test.ts --reporter=dot` は98件成功。
- `cargo test --manifest-path rust-core/Cargo.toml --test media_schema -- --nocapture` は24件成功。
- `cargo test --manifest-path rust-backend/Cargo.toml generated_shaking_polygon_source_frame_contains_jittered_outline_and_transparency -- --nocapture` は1件成功。
- 対象名で絞った `npx tsc --noEmit` は今回変更ファイル由来のエラーなし。既存の `ThreeStageViewport.tsx` Three.js型定義不足、`mp4box` 型定義不足、`heavyEffectsStress.test.ts` の `PositionKeyframe` 未定義のみ検出した。

### 残課題・次のステップ
- 現時点の `GeneratedShakingPolygon` は元スクリプトのアンカー任意座標編集を、固定直径ベースの多角形生成へ寄せた互換再実装。任意頂点アンカー編集UIは後続のPropertyPanel拡張で扱う。

## 2026-06-22 — SSD分度器をRust生成オブジェクトへ追加

### 実施内容
- Red: `script/ANM/ANM_ssd/分度器.obj` を、Rust `GeneratedProtractor` mediaとして扱う境界契約を作った。
- Green: `ProtractorObject` と `buildAviUtlProtractorObject` を追加し、Timeline右クリックから `分度器を追加` / `Add Protractor` で置けるようにした。
- Green: `rustSceneSnapshot` / shared renderer native support / Rust core schema / Rust backendに `GeneratedProtractor` を追加した。
- Green: Rust backendで透明背景、半円目盛り、測定角ライン、角度ラベルを持つ決定的な分度器フレームを生成できるようにした。
- Green: `ssd-protractor` をPackカタログ/棚卸し文書へ追加した。
- 版を `0.1.1-Beta-285a` に更新した。

### 検証
- `npm test -- --run src/utils/protractorObjectFactory.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/aviutlPackFeatureCatalog.test.ts src/utils/pixiGeneratedEffectCutover.test.ts src/utils/projectFile.test.ts src/utils/projectExportFrameCanvas.test.ts src/e2e/allReadableMedia.e2e.test.ts --reporter=dot` は97件成功。
- `cargo test --manifest-path rust-core/Cargo.toml --test media_schema -- --nocapture` は23件成功。
- `cargo test --manifest-path rust-backend/Cargo.toml generated_protractor_source_frame_contains_ticks_angle_line_and_transparency -- --nocapture` は1件成功。
- 対象名で絞った `npx tsc --noEmit` は今回変更ファイル由来のエラーなし。既存の `ThreeStageViewport.tsx` Three.js型定義不足、`mp4box` 型定義不足、`heavyEffectsStress.test.ts` の `PositionKeyframe` 未定義のみ検出した。

### 残課題・次のステップ
- 現時点の `GeneratedProtractor` は元スクリプトの3点アンカー角度計算テキストを、Rust側の半円分度器と固定測定角ラベル生成へ拡張した互換再実装。アンカー連動の角度計算UIは後続の編集UI拡張で扱う。

## 2026-06-22 — SSDホログラムをRust生成オブジェクトへ追加

### 実施内容
- Red: `script/ANM/ANM_ssd/ホログラム.obj` を、Rust `GeneratedHologram` mediaとして扱う境界契約を作った。
- Green: `HologramObject` と `buildAviUtlHologramObject` を追加し、Timeline右クリックから `ホログラムを追加` / `Add Hologram` で置けるようにした。
- Green: `rustSceneSnapshot` / shared renderer native support / Rust core schema / Rust backendに `GeneratedHologram` を追加した。
- Green: Rust backendで不透明背景、斜めプリズム帯、明暗ストライプを持つ決定的なホログラムフレームを生成できるようにした。
- Green: `ssd-hologram` をPackカタログ/棚卸し文書へ追加した。
- 版を `0.1.1-Beta-284a` に更新した。

### 検証
- `npm test -- --run src/utils/hologramObjectFactory.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/aviutlPackFeatureCatalog.test.ts src/utils/pixiGeneratedEffectCutover.test.ts src/utils/projectFile.test.ts src/utils/projectExportFrameCanvas.test.ts src/e2e/allReadableMedia.e2e.test.ts --reporter=dot` は96件成功。
- `cargo test --manifest-path rust-core/Cargo.toml --test media_schema -- --nocapture` は22件成功。
- `cargo test --manifest-path rust-backend/Cargo.toml generated_hologram_source_frame_contains_prism_stripes_and_opacity -- --nocapture` は1件成功。
- 対象名で絞った `npx tsc --noEmit` は今回変更ファイル由来のエラーなし。既存の `ThreeStageViewport.tsx` Three.js型定義不足、`mp4box` 型定義不足、`heavyEffectsStress.test.ts` の `PositionKeyframe` 未定義のみ検出した。

### 残課題・次のステップ
- 現時点の `GeneratedHologram` は元スクリプトのタイル生成・ぼかし・カラー処理を、Rust側の不透明な斜めプリズム模様生成へ置き換えた互換再実装。

## 2026-06-22 — SSDランダムラインEXをRust生成オブジェクトへ追加

### 実施内容
- Red: `script/ANM/ANM_ssd/ランダムラインEX.obj` を、Rust `GeneratedRandomLineEx` mediaとして扱う境界契約を作った。
- Green: `RandomLineExObject` と `buildAviUtlRandomLineExObject` を追加し、Timeline右クリックから `ランダムラインEXを追加` / `Add Random Line EX` で置けるようにした。
- Green: `rustSceneSnapshot` / shared renderer native support / Rust core schema / Rust backendに `GeneratedRandomLineEx` を追加した。
- Green: Rust backendで透明背景、白いランダム斜線、セルノイズによる欠けを持つ決定的なランダムラインEXフレームを生成できるようにした。
- Green: `ssd-random-line-ex` をPackカタログ/棚卸し文書へ追加した。
- 版を `0.1.1-Beta-283a` に更新した。

### 検証
- `npm test -- --run src/utils/randomLineExObjectFactory.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/aviutlPackFeatureCatalog.test.ts src/utils/pixiGeneratedEffectCutover.test.ts src/utils/projectFile.test.ts src/utils/projectExportFrameCanvas.test.ts src/e2e/allReadableMedia.e2e.test.ts --reporter=dot` は95件成功。
- `cargo test --manifest-path rust-core/Cargo.toml --test media_schema -- --nocapture` は21件成功。
- `cargo test --manifest-path rust-backend/Cargo.toml generated_random_line_ex_source_frame_contains_noisy_lines_and_transparency -- --nocapture` は1件成功。
- 対象名で絞った `npx tsc --noEmit` は今回変更ファイル由来のエラーなし。既存の `ThreeStageViewport.tsx` Three.js型定義不足、`mp4box` 型定義不足、`heavyEffectsStress.test.ts` の `PositionKeyframe` 未定義のみ検出した。

### 残課題・次のステップ
- 現時点の `GeneratedRandomLineEx` は元スクリプトの外部 `T_Color_Module` 依存の二値化・カラーキー処理を、Rust側の透明背景・セルノイズ付きランダム斜線生成へ置き換えた互換再実装。

## 2026-06-22 — SSD集中線plusをRust生成オブジェクトへ追加

### 実施内容
- Red: `script/ANM/ANM_ssd/集中線plus.obj` を、Rust `GeneratedFocusLinesPlus` mediaとして扱う境界契約を作った。
- Green: `FocusLinesPlusObject` と `buildAviUtlFocusLinesPlusObject` を追加し、Timeline右クリックから `集中線plusを追加` / `Add Focus Lines Plus` で置けるようにした。
- Green: `rustSceneSnapshot` / shared renderer native support / Rust core schema / Rust backendに `GeneratedFocusLinesPlus` を追加した。
- Green: Rust backendで透明背景、白い放射状ポリゴン、中心抜けを持つ決定的な集中線plusフレームを生成できるようにした。
- Green: `ssd-focus-lines-plus` をPackカタログ/棚卸し文書へ追加した。
- 版を `0.1.1-Beta-282a` に更新した。

### 検証
- `npm test -- --run src/utils/focusLinesPlusObjectFactory.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/aviutlPackFeatureCatalog.test.ts src/utils/pixiGeneratedEffectCutover.test.ts src/utils/projectFile.test.ts src/utils/projectExportFrameCanvas.test.ts src/e2e/allReadableMedia.e2e.test.ts --reporter=dot` は94件成功。
- `cargo test --manifest-path rust-core/Cargo.toml --test media_schema -- --nocapture` は20件成功。
- `cargo test --manifest-path rust-backend/Cargo.toml generated_focus_lines_plus_source_frame_contains_rays_and_centre_hole -- --nocapture` は1件成功。
- 対象名で絞った `npx tsc --noEmit` は今回変更ファイル由来のエラーなし。既存の `ThreeStageViewport.tsx` Three.js型定義不足、`mp4box` 型定義不足、`heavyEffectsStress.test.ts` の `PositionKeyframe` 未定義のみ検出した。

### 残課題・次のステップ
- 現時点の `GeneratedFocusLinesPlus` は元スクリプトの乱数ポリゴン生成を、Rust側の透明背景・白い放射状ライン生成へ置き換えた互換再実装。`keyframe_interval` による乱数更新の入口は保持したが、UI編集や元Lua完全一致の乱数系列までは未接続。

## 2026-06-22 — SSD麻の葉模様をRust生成オブジェクトへ追加

### 実施内容
- Red: `script/ANM/ANM_ssd/麻の葉模様.obj` を、Rust `GeneratedAsanohaPattern` mediaとして扱う境界契約を作った。
- Green: `AsanohaPatternObject` と `buildAviUtlAsanohaPatternObject` を追加し、Timeline右クリックから `麻の葉模様を追加` / `Add Asanoha Pattern` で置けるようにした。
- Green: `rustSceneSnapshot` / shared renderer native support / Rust core schema / Rust backendに `GeneratedAsanohaPattern` を追加した。
- Green: Rust backendで不透明背景、黒白の六角格子・放射線を持つ決定的な麻の葉模様フレームを生成できるようにした。
- Green: `ssd-asanoha-pattern` をPackカタログ/棚卸し文書へ追加した。
- 版を `0.1.1-Beta-281a` に更新した。

### 検証
- `npm test -- --run src/utils/asanohaPatternObjectFactory.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/aviutlPackFeatureCatalog.test.ts src/utils/pixiGeneratedEffectCutover.test.ts src/utils/projectFile.test.ts src/utils/projectExportFrameCanvas.test.ts src/e2e/allReadableMedia.e2e.test.ts --reporter=dot` は93件成功。
- `cargo test --manifest-path rust-core/Cargo.toml --test media_schema -- --nocapture` は19件成功。
- `cargo test --manifest-path rust-backend/Cargo.toml generated_asanoha_pattern_source_frame_contains_foreground_background_and_opacity -- --nocapture` は1件成功。
- 対象名で絞った `npx tsc --noEmit` は今回変更ファイル由来のエラーなし。既存の `ThreeStageViewport.tsx` Three.js型定義不足、`mp4box` 型定義不足、`heavyEffectsStress.test.ts` の `PositionKeyframe` 未定義のみ検出した。

### 残課題・次のステップ
- 現時点の `GeneratedAsanohaPattern` は元スクリプトのLua polygon描画を、黒白の決定的なRustラスタ生成へ置き換えた互換再実装。負値色による透明化や元Luaの完全な加算/減算合成までは未接続。

## 2026-06-21 — SSD紙飛行機をRust生成オブジェクトへ追加

### 実施内容
- Red: `script/ANM/ANM_ssd/紙飛行機.obj` を、Rust `GeneratedPaperAirplane` mediaとして扱う境界契約を作った。
- Green: `PaperAirplaneObject` と `buildAviUtlPaperAirplaneObject` を追加し、Timeline右クリックから `紙飛行機を追加` / `Add Paper Airplane` で置けるようにした。
- Green: `rustSceneSnapshot` / shared renderer native support / Rust core schema / Rust backendに `GeneratedPaperAirplane` を追加した。
- Green: Rust backendで透明背景、白い左右翼と折り目影を持つ決定的な紙飛行機フレームを生成できるようにした。
- Green: `ssd-paper-airplane` をPackカタログ/棚卸し文書へ追加した。
- 版を `0.1.1-Beta-280a` に更新した。

### 検証
- `npm test -- --run src/utils/paperAirplaneObjectFactory.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/aviutlPackFeatureCatalog.test.ts src/utils/pixiGeneratedEffectCutover.test.ts src/utils/projectFile.test.ts src/utils/projectExportFrameCanvas.test.ts src/e2e/allReadableMedia.e2e.test.ts --reporter=dot` は92件成功。
- `cargo test --manifest-path rust-core/Cargo.toml --test media_schema -- --nocapture` は18件成功。
- `cargo test --manifest-path rust-backend/Cargo.toml generated_paper_airplane_source_frame_contains_wings_shadow_and_transparency -- --nocapture` は1件成功。
- 対象名で絞った `npx tsc --noEmit` は今回変更ファイル由来のエラーなし。既存の `ThreeStageViewport.tsx` Three.js型定義不足、`mp4box` 型定義不足、`heavyEffectsStress.test.ts` の `PositionKeyframe` 未定義のみ検出した。

### 残課題・次のステップ
- 現時点の `GeneratedPaperAirplane` は元スクリプトの移動方向追従3D描画を、透明背景の静的な紙飛行機Rustラスタ生成へ置き換えた互換再実装。移動方向追従はキーフレーム方向と接続する後段拡張に残す。

## 2026-06-21 — SSD矢がすりをRust生成オブジェクトへ追加

### 実施内容
- Red: `script/ANM/ANM_ssd/矢がすり.obj` を、Rust `GeneratedYagasuri` mediaとして扱う境界契約を作った。
- Green: `YagasuriObject` と `buildAviUtlYagasuriObject` を追加し、Timeline右クリックから `矢がすりを追加` / `Add Yagasuri` で置けるようにした。
- Green: `rustSceneSnapshot` / shared renderer native support / Rust core schema / Rust backendに `GeneratedYagasuri` を追加した。
- Green: Rust backendで不透明背景、黒白の反復矢羽根パターンを持つ決定的なフレームを生成できるようにした。
- Green: `ssd-yagasuri` をPackカタログ/棚卸し文書へ追加した。
- 版を `0.1.1-Beta-279a` に更新した。

### 検証
- `npm test -- --run src/utils/yagasuriObjectFactory.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/aviutlPackFeatureCatalog.test.ts src/utils/pixiGeneratedEffectCutover.test.ts src/utils/projectFile.test.ts src/utils/projectExportFrameCanvas.test.ts src/e2e/allReadableMedia.e2e.test.ts --reporter=dot` は91件成功。
- `cargo test --manifest-path rust-core/Cargo.toml --test media_schema -- --nocapture` は17件成功。
- `cargo test --manifest-path rust-backend/Cargo.toml generated_yagasuri_source_frame_contains_arrow_pattern_and_opacity -- --nocapture` は1件成功。
- 対象名で絞った `npx tsc --noEmit` は今回変更ファイル由来のエラーなし。既存の `ThreeStageViewport.tsx` Three.js型定義不足、`mp4box` 型定義不足、`heavyEffectsStress.test.ts` の `PositionKeyframe` 未定義のみ検出した。

### 残課題・次のステップ
- 現時点の `GeneratedYagasuri` は元スクリプトのポリゴン列を、黒白の決定的なRustラスタ生成へ置き換えた互換再実装。

## 2026-06-21 — SSD千鳥格子をRust生成オブジェクトへ追加

### 実施内容
- Red: `script/ANM/ANM_ssd/千鳥格子.obj` を、Rust `GeneratedHoundstooth` mediaとして扱う境界契約を作った。
- Green: `HoundstoothObject` と `buildAviUtlHoundstoothObject` を追加し、Timeline右クリックから `千鳥格子を追加` / `Add Houndstooth` で置けるようにした。
- Green: `rustSceneSnapshot` / shared renderer native support / Rust core schema / Rust backendに `GeneratedHoundstooth` を追加した。
- Green: Rust backendで不透明背景、黒白の反復千鳥格子パターンを持つ決定的なフレームを生成できるようにした。
- Green: `ssd-houndstooth` をPackカタログ/棚卸し文書へ追加した。
- 版を `0.1.1-Beta-278a` に更新した。

### 検証
- `npm test -- --run src/utils/houndstoothObjectFactory.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/aviutlPackFeatureCatalog.test.ts src/utils/pixiGeneratedEffectCutover.test.ts src/utils/projectFile.test.ts src/utils/projectExportFrameCanvas.test.ts src/e2e/allReadableMedia.e2e.test.ts --reporter=dot` は90件成功。
- `cargo test --manifest-path rust-core/Cargo.toml --test media_schema -- --nocapture` は16件成功。
- `cargo test --manifest-path rust-backend/Cargo.toml generated_houndstooth_source_frame_contains_foreground_background_and_opacity -- --nocapture` は1件成功。
- 対象名で絞った `npx tsc --noEmit` は今回変更ファイル由来のエラーなし。既存の `ThreeStageViewport.tsx` Three.js型定義不足、`mp4box` 型定義不足、`heavyEffectsStress.test.ts` の `PositionKeyframe` 未定義のみ検出した。

### 残課題・次のステップ
- 現時点の `GeneratedHoundstooth` は元スクリプトのポリゴン列を、黒白の決定的なRustラスタ生成へ置き換えた互換再実装。

## 2026-06-21 — SSDタータンチェックをRust生成オブジェクトへ追加

### 実施内容
- Red: `script/ANM/ANM_ssd/タータンチェック_ISTN.obj` を、Rust `GeneratedTartanCheck` mediaとして扱う境界契約を作った。
- Green: `TartanCheckObject` と `buildAviUtlTartanCheckObject` を追加し、Timeline右クリックから `タータンチェックを追加` / `Add Tartan Check` で置けるようにした。
- Green: `rustSceneSnapshot` / shared renderer native support / Rust core schema / Rust backendに `GeneratedTartanCheck` を追加した。
- Green: Rust backendで不透明背景、赤/黄/黒の格子を持つ決定的なタータンチェックフレームを生成できるようにした。
- Green: `ssd-tartan-check` をPackカタログ/棚卸し文書へ追加した。
- 版を `0.1.1-Beta-277a` に更新した。

### 検証
- `npm test -- --run src/utils/tartanCheckObjectFactory.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/aviutlPackFeatureCatalog.test.ts src/utils/pixiGeneratedEffectCutover.test.ts src/utils/projectFile.test.ts src/utils/projectExportFrameCanvas.test.ts src/e2e/allReadableMedia.e2e.test.ts --reporter=dot` は89件成功。
- `cargo test --manifest-path rust-core/Cargo.toml --test media_schema -- --nocapture` は15件成功。
- `cargo test --manifest-path rust-backend/Cargo.toml generated_tartan_check_source_frame_contains_all_pattern_colours -- --nocapture` は1件成功。
- 対象名で絞った `npx tsc --noEmit` は今回変更ファイル由来のエラーなし。既存の `ThreeStageViewport.tsx` Three.js型定義不足、`mp4box` 型定義不足、`heavyEffectsStress.test.ts` の `PositionKeyframe` 未定義のみ検出した。

### 残課題・次のステップ
- 現時点の `GeneratedTartanCheck` は元スクリプトの130pxタイルとぼかし処理を、Rust側の決定的な不透明格子パターン生成へ置き換えた互換再実装。

## 2026-06-21 — SSD三角括弧をRust生成オブジェクトへ追加

### 実施内容
- Red: `script/ANM/ANM_ssd/三角括弧.obj` を、Rust `GeneratedTriangleBracket` mediaとして扱う境界契約を作った。
- Green: `TriangleBracketObject` と `buildAviUtlTriangleBracketObject` を追加し、Timeline右クリックから `三角括弧を追加` / `Add Triangle Bracket` で置けるようにした。
- Green: `rustSceneSnapshot` / shared renderer native support / Rust core schema / Rust backendに `GeneratedTriangleBracket` を追加した。
- Green: Rust backendで透明背景、白い上下2本の斜線ブラケットを持つ決定的な三角括弧フレームを生成できるようにした。
- Green: `ssd-triangle-bracket` をPackカタログ/棚卸し文書へ追加した。
- 版を `0.1.1-Beta-276a` に更新した。

### 検証
- `npm test -- --run src/utils/triangleBracketObjectFactory.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/aviutlPackFeatureCatalog.test.ts src/utils/pixiGeneratedEffectCutover.test.ts src/utils/projectFile.test.ts src/utils/projectExportFrameCanvas.test.ts src/e2e/allReadableMedia.e2e.test.ts --reporter=dot` は88件成功。
- `cargo test --manifest-path rust-core/Cargo.toml --test media_schema -- --nocapture` は14件成功。
- `cargo test --manifest-path rust-backend/Cargo.toml generated_triangle_bracket_source_frame_contains_arms_and_transparency -- --nocapture` は1件成功。
- 対象名で絞った `npx tsc --noEmit` は今回変更ファイル由来のエラーなし。既存の `ThreeStageViewport.tsx` Three.js型定義不足、`mp4box` 型定義不足、`heavyEffectsStress.test.ts` の `PositionKeyframe` 未定義のみ検出した。

### 残課題・次のステップ
- 現時点の `GeneratedTriangleBracket` は元スクリプトのポリゴン合成を、透明背景の斜線ブラケットRustラスタ生成へ置き換えた互換再実装。

## 2026-06-21 — SSD円矢印をRust生成オブジェクトへ追加

### 実施内容
- Red: `script/ANM/ANM_ssd/円矢印.obj` を、Rust `GeneratedCircularArrow` mediaとして扱う境界契約を作った。
- Green: `CircularArrowObject` と `buildAviUtlCircularArrowObject` を追加し、Timeline右クリックから `円矢印を追加` / `Add Circular Arrow` で置けるようにした。
- Green: `rustSceneSnapshot` / shared renderer native support / Rust core schema / Rust backendに `GeneratedCircularArrow` を追加した。
- Green: Rust backendで透明背景、黄色の円弧、三角形の矢じりを持つ決定的な円矢印フレームを生成できるようにした。
- Green: `ssd-circular-arrow` をPackカタログ/棚卸し文書へ追加した。
- 版を `0.1.1-Beta-275a` に更新した。

### 検証
- `npm test -- --run src/utils/circularArrowObjectFactory.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/aviutlPackFeatureCatalog.test.ts src/utils/pixiGeneratedEffectCutover.test.ts src/utils/projectFile.test.ts src/utils/projectExportFrameCanvas.test.ts src/e2e/allReadableMedia.e2e.test.ts --reporter=dot` は87件成功。
- `cargo test --manifest-path rust-core/Cargo.toml --test media_schema -- --nocapture` は13件成功。
- `cargo test --manifest-path rust-backend/Cargo.toml generated_circular_arrow_source_frame_contains_arc_head_and_transparency -- --nocapture` は1件成功。
- 対象名で絞った `npx tsc --noEmit` は今回変更ファイル由来のエラーなし。既存の `ThreeStageViewport.tsx` Three.js型定義不足、`mp4box` 型定義不足、`heavyEffectsStress.test.ts` の `PositionKeyframe` 未定義のみ検出した。

### 残課題・次のステップ
- 現時点の `GeneratedCircularArrow` は元スクリプトの図形モチーフ選択や複雑な合成処理を、透明背景の円弧/矢じりRustラスタ生成へ置き換えた互換再実装。

## 2026-06-21 — SSD日の出をRust生成オブジェクトへ追加

### 実施内容
- Red: `script/ANM/ANM_ssd/日の出.obj` を、Rust `GeneratedSunburst` mediaとして扱う境界契約を作った。
- Green: `SunburstObject` と `buildAviUtlSunburstObject` を追加し、Timeline右クリックから `日の出を追加` / `Add Sunburst` で置けるようにした。
- Green: `rustSceneSnapshot` / shared renderer native support / Rust core schema / Rust backendに `GeneratedSunburst` を追加した。
- Green: Rust backendで黄色背景、赤い放射状レイ、中心円モチーフを持つ決定的な日の出フレームを生成できるようにした。
- Green: `ssd-sunburst` をPackカタログ/棚卸し文書へ追加した。
- 版を `0.1.1-Beta-274a` に更新した。

### 検証
- `npm test -- --run src/utils/sunburstObjectFactory.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/aviutlPackFeatureCatalog.test.ts src/utils/pixiGeneratedEffectCutover.test.ts src/utils/projectFile.test.ts src/utils/projectExportFrameCanvas.test.ts src/e2e/allReadableMedia.e2e.test.ts --reporter=dot` は86件成功。
- `cargo test --manifest-path rust-core/Cargo.toml --test media_schema -- --nocapture` は12件成功。
- `cargo test --manifest-path rust-backend/Cargo.toml generated_sunburst_source_frame_contains_rays_background_and_motif -- --nocapture` は1件成功。
- 対象名で絞った `npx tsc --noEmit` は今回変更ファイル由来のエラーなし。既存の `ThreeStageViewport.tsx` Three.js型定義不足、`mp4box` 型定義不足、`heavyEffectsStress.test.ts` の `PositionKeyframe` 未定義のみ検出した。

### 残課題・次のステップ
- 現時点の `GeneratedSunburst` は元スクリプトの任意図形モチーフを、円/矩形モチーフと放射状レイのRustラスタ生成へ置き換えた互換再実装。

## 2026-06-21 — Tim簡易ヒストグラムをRust生成オブジェクトへ追加

### 実施内容
- Red: `script/てぃむ/簡易ヒストグラム.obj` を、Rust `GeneratedHistogram` mediaとして扱う境界契約を作った。
- Green: `HistogramObject` と `buildAviUtlHistogramObject` を追加し、Timeline右クリックから `簡易ヒストグラムを追加` / `Add Histogram` で置けるようにした。
- Green: `rustSceneSnapshot` / shared renderer native support / Rust core schema / Rust backendに `GeneratedHistogram` を追加した。
- Green: Rust backendで黒背景、輝度/R/G/Bチャンネルの棒を持つ決定的なヒストグラムフレームを生成できるようにした。
- Green: `tim-simple-histogram` をPackカタログ/棚卸し文書へ追加した。
- 版を `0.1.1-Beta-273a` に更新した。

### 検証
- `npm test -- --run src/utils/histogramObjectFactory.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/aviutlPackFeatureCatalog.test.ts src/utils/pixiGeneratedEffectCutover.test.ts src/utils/projectFile.test.ts src/utils/projectExportFrameCanvas.test.ts src/e2e/allReadableMedia.e2e.test.ts --reporter=dot` は85件成功。
- `cargo test --manifest-path rust-core/Cargo.toml --test media_schema -- --nocapture` は11件成功。
- `cargo test --manifest-path rust-backend/Cargo.toml generated_histogram_source_frame_contains_channel_bars_and_background -- --nocapture` は1件成功。
- 対象名で絞った `npx tsc --noEmit` は今回変更ファイル由来のエラーなし。既存の `ThreeStageViewport.tsx` Three.js型定義不足、`mp4box` 型定義不足、`heavyEffectsStress.test.ts` の `PositionKeyframe` 未定義のみ検出した。

### 残課題・次のステップ
- 現時点の `GeneratedHistogram` は元スクリプトの対象レイヤーピクセル解析を、固定bin入力のRustラスタ生成へ置き換えた互換再実装。実レイヤーからのRGB/輝度bin抽出は後段で接続する。

## 2026-06-21 — 93パイシートグラフをRust生成オブジェクトへ追加

### 実施内容
- Red: `script/93/パイシートグラフ.obj` を、Rust `GeneratedPieChart` mediaとして扱う境界契約を作った。
- Green: `PieChartObject` と `buildAviUtlPieChartObject` を追加し、Timeline右クリックから `パイシートグラフを追加` / `Add Pie Chart` で置けるようにした。
- Green: `rustSceneSnapshot` / shared renderer native support / Rust core schema / Rust backendに `GeneratedPieChart` を追加した。
- Green: Rust backendで透明背景、中央穴、複数色スライスを持つ決定的なドーナツグラフフレームを生成できるようにした。
- Green: `pie-sheet-graph` をPackカタログ/棚卸し文書へ追加した。
- 版を `0.1.1-Beta-272a` に更新した。

### 検証
- `npm test -- --run src/utils/pieChartObjectFactory.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/aviutlPackFeatureCatalog.test.ts src/utils/pixiGeneratedEffectCutover.test.ts src/utils/projectFile.test.ts src/utils/projectExportFrameCanvas.test.ts src/e2e/allReadableMedia.e2e.test.ts --reporter=dot` は84件成功。
- `cargo test --manifest-path rust-core/Cargo.toml --test media_schema -- --nocapture` は10件成功。
- `cargo test --manifest-path rust-backend/Cargo.toml generated_pie_chart_source_frame_contains_slices_hole_and_transparency -- --nocapture` は1件成功。
- 対象名で絞った `npx tsc --noEmit` は今回変更ファイル由来のエラーなし。既存の `ThreeStageViewport.tsx` Three.js型定義不足、`mp4box` 型定義不足、`heavyEffectsStress.test.ts` の `PositionKeyframe` 未定義のみ検出した。

### 残課題・次のステップ
- 現時点の `GeneratedPieChart` は元スクリプトの文字表示、乱数揺らぎ、進行順序の特殊パターンを省き、割合スライスのRustラスタ生成へ置き換えた互換再実装。

## 2026-06-21 — 93カスタムトラックバーをRust生成オブジェクトへ追加

### 実施内容
- Red: `script/93/カスタムトラックバー.obj` を、Rust `GeneratedTrackBar` mediaとして扱う境界契約を作った。
- Green: `TrackBarObject` と `buildAviUtlTrackBarObject` を追加し、Timeline右クリックから `トラックバーを追加` / `Add Track Bar` で置けるようにした。
- Green: `rustSceneSnapshot` / shared renderer native support / Rust core schema / Rust backendに `GeneratedTrackBar` を追加した。
- Green: Rust backendで透明背景、低透明度背景レーン、4本の決定的な進捗バーを生成できるようにした。
- Green: `custom-track-bar` をPackカタログ/棚卸し文書へ追加した。
- 版を `0.1.1-Beta-271a` に更新した。

### 検証
- `npm test -- --run src/utils/trackBarObjectFactory.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/aviutlPackFeatureCatalog.test.ts src/utils/pixiGeneratedEffectCutover.test.ts src/utils/projectFile.test.ts src/utils/projectExportFrameCanvas.test.ts src/e2e/allReadableMedia.e2e.test.ts --reporter=dot` は83件成功。
- `cargo test --manifest-path rust-core/Cargo.toml --test media_schema -- --nocapture` は9件成功。
- `cargo test --manifest-path rust-backend/Cargo.toml generated_track_bar_source_frame_contains_bars_and_background -- --nocapture` は1件成功。
- 対象名で絞った `npx tsc --noEmit` は今回変更ファイル由来のエラーなし。既存の `ThreeStageViewport.tsx` Three.js型定義不足、`mp4box` 型定義不足、`heavyEffectsStress.test.ts` の `PositionKeyframe` 未定義のみ検出した。

### 残課題・次のステップ
- 現時点の `GeneratedTrackBar` は元スクリプトのLua/GDI風テキスト描画をRust側ラスタバー生成へ置き換えた互換再実装で、ラベル文字の直接描画は未対応。

## 2026-06-21 — Tim歯車をRust生成オブジェクトへ追加

### 実施内容
- Red: `script/てぃむ/歯車.anm` を、Rust `GeneratedGear` mediaとして扱う境界契約を作った。
- Green: `GearObject` と `buildAviUtlGearObject` を追加し、Timeline右クリックから `歯車を追加` / `Add Gear` で置けるようにした。
- Green: `rustSceneSnapshot` / shared renderer native support / Rust core schema / Rust backendに `GeneratedGear` を追加した。
- Green: Rust backendで透明背景、内側穴、歯先/歯底を持つ決定的な2D歯車フレームを生成できるようにした。
- Green: `tim-gear` をPackカタログ/棚卸し文書へ追加した。
- 版を `0.1.1-Beta-270a` に更新した。

### 検証
- `npm test -- --run src/utils/gearObjectFactory.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/aviutlPackFeatureCatalog.test.ts src/utils/pixiGeneratedEffectCutover.test.ts src/utils/projectFile.test.ts src/utils/projectExportFrameCanvas.test.ts src/e2e/allReadableMedia.e2e.test.ts --reporter=dot` は82件成功。
- `cargo test --manifest-path rust-core/Cargo.toml --test media_schema -- --nocapture` は8件成功。
- `cargo test --manifest-path rust-backend/Cargo.toml generated_gear_source_frame_contains_teeth_hole_and_transparency -- --nocapture` は1件成功。
- 対象名で絞った `npx tsc --noEmit` は今回変更ファイル由来のエラーなし。既存の `ThreeStageViewport.tsx` Three.js型定義不足、`mp4box` 型定義不足、`heavyEffectsStress.test.ts` の `PositionKeyframe` 未定義のみ検出した。

### 残課題・次のステップ
- 現時点の `GeneratedGear` は元スクリプトの3D厚み・側面ポリゴン・テクスチャ貼りを、2D歯車ラスタ生成へ置き換えた互換再実装。

## 2026-06-21 — TimひょうたんTMをRust生成オブジェクトへ追加

### 実施内容
- Red: `script/てぃむ/ひょうたんTM.obj` を、Rust `GeneratedGourd` mediaとして扱う境界契約を作った。
- Green: `GourdObject` と `buildAviUtlGourdObject` を追加し、Timeline右クリックから `ひょうたんを追加` / `Add Gourd` で置けるようにした。
- Green: `rustSceneSnapshot` / shared renderer native support / Rust core schema / Rust backendに `GeneratedGourd` を追加した。
- Green: Rust backendで透明背景とくびれ付きシルエットを持つ決定的フレームを生成できるようにした。
- Green: `tim-gourd` をPackカタログ/棚卸し文書へ追加した。
- 版を `0.1.1-Beta-269a` に更新した。

### 検証
- `npm test -- --run src/utils/gourdObjectFactory.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/aviutlPackFeatureCatalog.test.ts src/utils/pixiGeneratedEffectCutover.test.ts src/utils/projectFile.test.ts src/utils/projectExportFrameCanvas.test.ts src/e2e/allReadableMedia.e2e.test.ts --reporter=dot` は81件成功。
- `cargo test --manifest-path rust-core/Cargo.toml --test media_schema -- --nocapture` は7件成功。
- `cargo test --manifest-path rust-backend/Cargo.toml generated_gourd_source_frame_contains_shape_and_transparency -- --nocapture` は1件成功。
- 対象名で絞った `npx tsc --noEmit` は今回変更ファイル由来のエラーなし。既存の `ThreeStageViewport.tsx` Three.js型定義不足、`mp4box` 型定義不足、`heavyEffectsStress.test.ts` の `PositionKeyframe` 未定義のみ検出した。

### 残課題・次のステップ
- 現時点の `GeneratedGourd` は元スクリプトのポリゴン分割をRust側のピクセル輪郭生成へ置き換えた互換再実装で、AviUtlのアンチエイリアスや半分リサイズ挙動までは完全一致しない。

## 2026-06-21 — Tim色相環をRust生成オブジェクトへ追加

### 実施内容
- Red: `script/てぃむ/色相環.obj` を、Rust `GeneratedColourWheel` mediaとして扱う境界契約を作った。
- Green: `ColourWheelObject` と `buildAviUtlColourWheelObject` を追加し、Timeline右クリックから `色相環を追加` / `Add Colour Wheel` で置けるようにした。
- Green: `rustSceneSnapshot` / shared renderer native support / Rust core schema / Rust backendに `GeneratedColourWheel` を追加した。
- Green: Rust backendで透明背景と複数色のHSVリングを持つ決定的フレームを生成できるようにした。
- Green: `tim-colour-wheel` をPackカタログ/棚卸し文書へ追加した。
- 版を `0.1.1-Beta-268a` に更新した。

### 検証
- `npm test -- --run src/utils/colourWheelObjectFactory.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/aviutlPackFeatureCatalog.test.ts src/utils/pixiGeneratedEffectCutover.test.ts src/utils/pixiRenderHelperGeneratedEffectCutover.test.ts src/utils/projectFile.test.ts src/utils/projectExportFrameCanvas.test.ts src/e2e/allReadableMedia.e2e.test.ts src/e2e/rustVideoPreview.e2e.test.ts --reporter=dot` は82件成功。
- `cargo test --manifest-path rust-core/Cargo.toml --test media_schema -- --nocapture` は6件成功。
- `cargo test --manifest-path rust-backend/Cargo.toml generated_colour_wheel_source_frame_contains_hues_and_transparency -- --nocapture` は1件成功。
- 対象名で絞った `npx tsc --noEmit` は今回変更ファイル由来のエラーなし。既存の `ThreeStageViewport.tsx` Three.js型定義不足、`mp4box` 型定義不足、`heavyEffectsStress.test.ts` の `PositionKeyframe` 未定義のみ検出した。

### 残課題・次のステップ
- 現時点の `GeneratedColourWheel` はピクセル単位のHSVリングで、元スクリプトの四角形ポリゴン分割境界とは完全一致しない。

## 2026-06-21 — TimパズルピースをRust生成オブジェクトへ追加

### 実施内容
- Red: `script/てぃむ/パズルピース.obj` を、Rust `GeneratedPuzzlePiece` mediaとして扱う境界契約を作った。
- Green: `PuzzlePieceObject` と `buildAviUtlPuzzlePieceObject` を追加し、Timeline右クリックから `パズルピースを追加` / `Add Puzzle Piece` で置けるようにした。
- Green: `rustSceneSnapshot` / shared renderer native support / Rust core schema / Rust backendに `GeneratedPuzzlePiece` を追加した。
- Green: Rust backendで透明背景と白いパズルピース形状を持つ決定的フレームを生成できるようにした。
- Green: `tim-puzzle-piece` をPackカタログ/棚卸し文書へ追加した。
- 版を `0.1.1-Beta-267a` に更新した。

### 検証
- `npm test -- --run src/utils/puzzlePieceObjectFactory.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/aviutlPackFeatureCatalog.test.ts src/utils/pixiGeneratedEffectCutover.test.ts src/utils/pixiRenderHelperGeneratedEffectCutover.test.ts src/utils/projectFile.test.ts src/utils/projectExportFrameCanvas.test.ts src/e2e/allReadableMedia.e2e.test.ts` は80件成功。
- `cargo test --manifest-path rust-core/Cargo.toml --test media_schema -- --nocapture` は5件成功。
- `cargo test --manifest-path rust-backend/Cargo.toml generated_puzzle_piece_source_frame_contains_shape_and_transparency -- --nocapture` は1件成功。
- 対象ファイル名で絞った `npx tsc --noEmit` は今回変更ファイル由来のエラーなし。既存の `ThreeStageViewport.tsx` Three.js型定義不足のみ検出した。

### 残課題・次のステップ
- 現時点の `GeneratedPuzzlePiece` はP形状と凹凸の主要挙動を単純化した視覚再実装で、元スクリプトの全22形状の細かな輪郭差分までは未再現。

## 2026-06-21 — TimバーコードTをRust生成オブジェクトへ追加

### 実施内容
- Red: `script/てぃむ/バーコードT.obj` を、Rust `GeneratedBarcode` mediaとして扱う境界契約を作った。
- Green: `BarcodeObject` と `buildAviUtlBarcodeObject` を追加し、Timeline右クリックから `バーコードを追加` / `Add Barcode` で置けるようにした。
- Green: `rustSceneSnapshot` / shared renderer native support / Rust core schema / Rust backendに `GeneratedBarcode` を追加した。
- Green: Rust backendで白背景と黒バーを持つ決定的バーコード風フレームを生成できるようにした。
- Green: `tim-barcode` をPackカタログ/棚卸し文書へ追加した。
- 版を `0.1.1-Beta-266a` に更新した。

### 検証
- `npm test -- --run src/utils/rustSceneSnapshot.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/barcodeObjectFactory.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/aviutlPackFeatureCatalog.test.ts src/utils/pixiGeneratedEffectCutover.test.ts src/utils/pixiRenderHelperGeneratedEffectCutover.test.ts src/utils/projectFile.test.ts src/utils/projectExportFrameCanvas.test.ts src/e2e/allReadableMedia.e2e.test.ts` は79件成功。
- `cargo test --manifest-path rust-core/Cargo.toml --test media_schema -- --nocapture` は4件成功。
- `cargo test --manifest-path rust-backend/Cargo.toml generated_barcode_source_frame_contains_background_and_bars -- --nocapture` は1件成功。
- 対象ファイル名で絞った `npx tsc --noEmit` は今回変更ファイル由来のエラーなし。既存の `ThreeStageViewport.tsx` Three.js型定義不足のみ検出した。

### 残課題・次のステップ
- 現時点の `GeneratedBarcode` はバーコードTの視覚再実装で、Code128としてのスキャン互換までは未実装。

## 2026-06-21 — TimインクTMを標準生成オブジェクトへ追加

### 実施内容
- Red: `script/てぃむ/インクTM.obj` を、Timeline右クリックから追加できるAviUtlPackV4標準生成オブジェクトにする契約を作った。
- Green: `buildAviUtlInkSplashObject` を追加し、標準パーティクル基盤でインク飛沫近似のParticleObjectを生成できるようにした。
- Green: Timeline context menuへ `インクを追加` / `Add Ink Splash` を追加した。
- Green: `tim-ink-splash` をPackカタログ/棚卸し文書へ追加した。
- 版を `0.1.1-Beta-265a` に更新した。

### 検証
- `npm test -- --run src/utils/particleObjectFactory.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/aviutlPackFeatureCatalog.test.ts` は36件成功。
- 対象ファイル名で絞った `npx tsc --noEmit` は今回変更ファイル由来のエラーなし。既存の `ThreeStageViewport.tsx` Three.js型定義不足のみ検出した。

### 残課題・次のステップ
- インクTMは標準パーティクル近似で、元スクリプト固有の輪郭生成、円形度合、展開アニメーション、飛散形状の差分までは未実装。

## 2026-06-21 — Tim集中線Tを標準生成オブジェクトへ追加

### 実施内容
- Red: `script/てぃむ/@集中線T.obj` を、Timeline右クリックから追加できるAviUtlPackV4標準生成オブジェクトにする契約を作った。
- Green: `buildAviUtlFocusLinesObject` を追加し、標準パーティクル基盤で集中線T近似のParticleObjectを生成できるようにした。
- Green: Timeline context menuへ `集中線を追加` / `Add Focus Lines` を追加した。
- Green: `tim-focus-lines` をPackカタログ/棚卸し文書へ追加した。
- 版を `0.1.1-Beta-264a` に更新した。

### 検証
- `npm test -- --run src/utils/particleObjectFactory.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts` は32件成功。
- 対象ファイル名で絞った `npx tsc --noEmit` は今回変更ファイル由来のエラーなし。既存の `ThreeStageViewport.tsx` Three.js型定義不足のみ検出した。

### 残課題・次のステップ
- 集中線Tは標準パーティクル近似で、元スクリプト固有の線分描画・遠近感までは未実装。

## 2026-06-21 — Tim泡を標準生成オブジェクトへ追加

### 実施内容
- Red: `script/てぃむ/泡.obj` を、Timeline右クリックから追加できるAviUtlPackV4標準生成オブジェクトにする契約を作った。
- Green: `buildAviUtlBubbleObject` を追加し、標準パーティクル基盤で泡近似のParticleObjectを生成できるようにした。
- Green: Timeline context menuへ `泡を追加` / `Add Bubbles` を追加した。
- Green: `tim-bubbles` をPackカタログ/棚卸し文書へ追加した。
- 版を `0.1.1-Beta-263a` に更新した。

### 検証
- `npm test -- --run src/utils/particleObjectFactory.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts` は31件成功。
- 対象ファイル名で絞った `npx tsc --noEmit` は今回変更ファイル由来のエラーなし。既存の `ThreeStageViewport.tsx` Three.js型定義不足のみ検出した。

### 残課題・次のステップ
- 泡は標準パーティクル近似で、元スクリプト固有の円形描画・屈折・加算/スクリーン合成までは未実装。

## 2026-06-21 — Timオーラ放出を標準生成オブジェクトへ追加

### 実施内容
- Red: `script/てぃむ/オーラ放出.anm` を、Timeline右クリックから追加できるAviUtlPackV4標準生成オブジェクトにする契約を作った。
- Green: `buildAviUtlAuraEmissionObject` を追加し、標準パーティクル基盤でオーラ放出近似のParticleObjectを生成できるようにした。
- Green: Timeline context menuへ `オーラ放出を追加` / `Add Aura Emission` を追加した。
- Green: `tim-aura-emission` をPackカタログ/棚卸し文書へ追加した。
- 版を `0.1.1-Beta-262a` に更新した。

### 検証
- `npm test -- --run src/utils/particleObjectFactory.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts` は30件成功。
- 対象ファイル名で絞った `npx tsc --noEmit` は今回変更ファイル由来のエラーなし。既存の `ThreeStageViewport.tsx` Three.js型定義不足のみ検出した。

### 残課題・次のステップ
- オーラ放出は標準パーティクル近似で、元スクリプト固有のゆらぎや加算合成までは未実装。次はnative renderer側の合成モードや生成効果入りexport高速化へ進む。

## 2026-06-21 — Tim風揺れTをネイティブmotion presetへ追加

### 実施内容
- Red: AviUtlPackV4 `script/てぃむ/風揺れT.anm` を、`wind-sway-soft` として標準motion presetに追加する契約を作った。
- Green: 既存キーフレーム基盤へ、元の位置へ戻る小さな風揺れループを生成するネイティブ再実装を追加した。
- Green: `tim-wind-sway` をPackカタログ/棚卸し文書へ追加した。
- 版を `0.1.1-Beta-261a` に更新した。

### 検証
- `npm test -- --run src/utils/aviutlMotionPresets.test.ts src/components/PropertyPanelBoundary.test.ts` は11件成功。
- 対象ファイル名で絞った `npx tsc --noEmit` は今回変更ファイル由来のエラーなし。既存の `ThreeStageViewport.tsx` Three.js型定義不足のみ検出した。

### 残課題・次のステップ
- 風による曲面変形そのものは未実装。現時点ではRust scene snapshotへ乗る位置キーフレーム近似として扱う。

## 2026-06-21 — Timモーションパスをネイティブmotion presetへ追加

### 実施内容
- Red: AviUtlPackV4 `script/てぃむ` のモーションパス候補を、`motion-path-arc` と `motion-path-s-curve` として標準motion presetに追加する契約を作った。
- Green: 既存キーフレーム基盤へ、弧を描くパスとS字パスを生成するネイティブ再実装を追加した。
- Green: iCloud Drive内の `@モーションパスA/B/C/D` と `ベジェ軌道T` をカタログ/棚卸し文書の参照メタデータへ反映した。
- 版を `0.1.1-Beta-260a` に更新した。

### 検証
- `npm test -- --run src/utils/aviutlMotionPresets.test.ts src/components/PropertyPanelBoundary.test.ts` は10件成功。
- 対象ファイル名で絞った `npx tsc --noEmit` は今回変更ファイル由来のエラーなし。既存の `ThreeStageViewport.tsx` Three.js型定義不足のみ検出した。

### 残課題・次のステップ
- ベジェ制御点をUIで編集する本格パスエディタは未実装。次は生成効果入り混在exportの高速化、または風揺れ/オーラ/グリッドワイプなどP2候補の追加へ進む。

## 2026-06-21 — 生成効果入り実Electron exportの画素検査を通過

### 実施内容
- Green: 生成効果cutover時にPixi子要素を破棄/取り外しせず、非表示・非renderableで保持してWebGPU render groupの古い参照を踏まないようにした。
- Green: 動画export E2Eの成果物MP4から先頭フレームをRGBA抽出し、標準パーティクルの白画素とAudio waveform Rの下部緑ラインを検査するようにした。
- 版を `0.1.1-Beta-259g` に更新した。

### 検証
- `npm test -- --run src/utils/packageScripts.test.ts src/utils/pixiRenderHelperGeneratedEffectCutover.test.ts src/utils/pixiGeneratedEffectCutover.test.ts src/utils/viewportRustVideoOnlyBoundary.test.ts` は33件成功。
- `node --check scripts/run-video-export-e2e.mjs` は成功。
- `UXFD_VIDEO_EXPORT_E2E_ADD_MIXED_MEDIA=1 UXFD_VIDEO_EXPORT_E2E_ADD_AVIUTL_GENERATED_EFFECTS=1 UXFD_VIDEO_EXPORT_E2E_DURATION_SECONDS=1 UXFD_VIDEO_EXPORT_E2E_TIMEOUT_MS=240000 npm run test:video-export:e2e` は成功。
- 実Electron E2Eは60 frames、約3.97fps、runtimeErrors 0、Audio waveform R 714px、標準パーティクル 38,504pxを検出した。

### 残課題・次のステップ
- 生成効果入り混在exportはまだ約4fpsなので、次はnative render sourceの待ち時間とdecode/writeの重なりを再分解して高速化する。

## 2026-06-21 — 生成効果のPixi二重描画レースを抑止

### 実施内容
- Red: `Viewport` がshared renderer preview session生成直後にGeneratedAudioWaveform/GeneratedParticleのPixi cutover IDを更新する契約を追加した。
- Green: `collectSharedRendererGeneratedEffectObjectIdsFromSession` を追加し、Presenter完了前でもRust所有の生成効果をPixi描画から外すようにした。
- 版を `0.1.1-Beta-259f` に更新した。

### 検証
- `npm test -- --run src/utils/viewportRustVideoOnlyBoundary.test.ts src/utils/pixiGeneratedEffectCutover.test.ts src/utils/packageScripts.test.ts -t "generated effect|records real video export|skips Rust-owned generated effects"` は3件成功。
- 対象ファイル名で絞った `npx tsc --noEmit` は今回変更ファイル由来のエラーなし。既存の `ThreeStageViewport.tsx` Three.js型定義不足のみ検出した。

### 残課題・次のステップ
- 実Electron export E2Eで、生成効果入り成果物の画素検査とruntime error検出を通す。

## 2026-06-21 — 生成波形の共有フレーム画素一致を確認

### 実施内容
- Red: `native-wgpu-renderer` に、Audio waveform R生成フレームが直接フレーム出力と共有メモリ出力で一致する契約を追加した。
- Green: `render_native_wgpu_frame_to_shared_ring_with_audio_waveforms` を追加し、生成波形をRust native rendererの共有フレーム出力へ接続した。
- 版を `0.1.1-Beta-259c` に更新した。

### 検証
- `cargo test --test shared_frame_output native_wgpu_generated_waveform_shared_frame_matches_direct_frame`
- `cargo test --test shared_frame_output`

### 結果・残課題
- Audio waveform RはRust native renderer内で直接フレームと共有メモリフレームの画素一致を確認できた。
- 次は標準パーティクルを含む生成ソースと、実Electron preview/export成果物の画素比較へ広げる。

## 2026-06-21 — 生成波形と標準パーティクルの混在Rust出力を確認

### 実施内容
- Test: `rust-backend` の `render.nativeSharedFrame` に、Audio waveform Rと標準パーティクルを同一フレームで合成する境界テストを追加した。
- Test: 赤い波形ラインと白い粒子が同じ共有メモリフレームに出ることを検証した。
- 挙動変更なしの確認強化のため、版は `0.1.1-Beta-259c` のままとした。

### 検証
- `cargo test --test decode_control_plane native_render_shared_frame_builds_generated -- --nocapture`
- `cargo test --test decode_control_plane native_render_shared_frame_composites_generated_waveform_and_particle_sources -- --nocapture`

### 結果・残課題
- Rust backend境界では、GeneratedAudioWaveformとGeneratedParticleの混在合成が共有メモリ出力まで成功することを確認できた。
- 次は実Electronのpreview/export成果物を画像として比較し、UI経由の見た目まで確認する。

## 2026-06-21 — Audio waveform RのPCM取得をsource frameへ追従

### 実施内容
- Red: previewのAudio waveform R PCM取得が `clip.source_frame` 基準の開始秒を使う契約を追加した。
- Green: `prepareNativeRenderAudioWaveforms` に `SceneSnapshot` を渡し、対象mediaの `source_frame / 60` を `startSeconds` としてRust backendへ渡すようにした。
- Green: export direct encode側も同じ時間基準でAudio waveform RのPCMを取得するようにした。
- 版を `0.1.1-Beta-259d` に更新した。

### 検証
- `npm test -- --run src/utils/sharedRendererViewportNativeRenderUpload.test.ts -t "requests generated audio waveform samples"`
- `npm test -- --run src/utils/sharedRendererViewportNativeRenderUpload.test.ts src/utils/sharedRendererExportFrameSource.test.ts -t "audio waveform"`
- `npx tsc --noEmit 2>&1 | rg "sharedRendererViewportNativeRenderUpload|sharedRendererExportFrameSource"`

### 結果・残課題
- preview/exportともに、Audio waveform Rが常に0秒地点のPCMだけを見る問題を修正した。
- 次は生成効果が実Electron上で見えているかを、preview screenshotとexport frame decodeの画素比較で確認する。

## 2026-06-21 — Audio waveform RのRust画素可視性を確認

### 実施内容
- Test: `native-wgpu-renderer` の生成波形共有フレーム一致テストに、指定色 `#00ff66` の画素が直接フレーム内に存在するアサートを追加した。
- 挙動変更なしの確認強化のため、版は `0.1.1-Beta-259d` のままとした。

### 検証
- `cargo test --test shared_frame_output native_wgpu_generated_waveform_shared_frame_matches_direct_frame`

### 結果・残課題
- 直接フレームと共有メモリフレームの一致だけでなく、Audio waveform R自体が実際に描画されていることも確認できるようになった。
- 次は `encode.writeNativeFrame` の生成効果込みexport直結経路を確認する。

## 2026-06-21 — 生成効果込みdirect encode境界を確認

### 実施内容
- Test: `encode.start` → `encode.writeNativeFrame` → `encode.finish` で、Audio waveform Rと標準パーティクルを含む1フレームを書き出すRust backend境界テストを追加した。
- Test: 生成効果入りdirect encodeが出力共有メモリを返さず、WGPU render timingsを持つnative frameとして書けることを検証した。
- 挙動変更なしの確認強化のため、版は `0.1.1-Beta-259d` のままとした。

### 検証
- `cargo test --test decode_control_plane native_generated_effects_can_directly_feed_encode_without_output_shared_memory -- --nocapture`

### 結果・残課題
- export直結経路でもGeneratedAudioWaveformとGeneratedParticleを含むRust native frameを書けることを確認した。
- 次は実Electron E2Eでpreview screenshotとexport frame decodeを比較し、UI経由の画素一致へ進む。

## 2026-06-21 — 動画export E2Eでruntime errorを失敗扱いに変更

### 実施内容
- Red: `run-video-export-e2e.mjs` が `Runtime.exceptionThrown` を `passed` 判定へ含める契約を追加した。
- Green: E2E結果作成前に `collectRuntimeErrors(client)` を評価し、runtime errorが1件でもあれば `passed=false` にするようにした。
- テスト基盤の厳格化のため、版は `0.1.1-Beta-259d` のままとした。

### 検証
- `npm test -- --run src/utils/packageScripts.test.ts -t "records real video export"`

### 結果・残課題
- 実Electron exportが完了しても、Viewport/Pixi等のruntime errorが出ていればE2Eで検出できるようになった。
- 次は生成効果入りE2Eで出ているPixi WebGPU runtime errorを潰す。

## 2026-06-21 — 生成効果のPixi二重描画runtime errorを修正

### 実施内容
- Red: Rust native frameが所有するAudio waveform R / 標準パーティクルはPixiで描画しない契約を追加した。
- Green: `pixiGeneratedEffectCutover` を追加し、`audio_visualization` / `particle` がRust native frameに含まれる場合はPixi描画をスキップするようにした。
- Green: shared renderer presenter controlから生成効果object idをViewportへ渡し、Pixi描画ヘルパーへ接続した。
- 版を `0.1.1-Beta-259e` に更新した。

### 検証
- `npm test -- --run src/utils/pixiGeneratedEffectCutover.test.ts src/utils/sharedRendererViewportPresenterOrchestration.test.ts`
- `npx tsc --noEmit 2>&1 | rg "Viewport|pixiRenderHelper|sharedRendererPreviewPresenterController|pixiGeneratedEffectCutover|sharedRendererViewportPresenterOrchestration"`
- `UXFD_VIDEO_EXPORT_E2E_ADD_MIXED_MEDIA=1 UXFD_VIDEO_EXPORT_E2E_ADD_AVIUTL_GENERATED_EFFECTS=1 UXFD_VIDEO_EXPORT_E2E_DURATION_SECONDS=1 UXFD_VIDEO_EXPORT_E2E_TIMEOUT_MS=240000 npm run test:video-export:e2e`

### 結果・残課題
- 実Electron E2Eは動画+図形+画像+音声+Audio waveform R+標準パーティクルで成功し、`runtimeErrors: []` を確認した。
- 出力: 60 frames / 17,679ms / 約3.39fps / 1,092,837 bytes。
- TypeScriptチェックは既存のThree.js型不足のみ残り、今回対象ファイル名のエラーは出ていない。
- 次はpreview screenshotとexport frame decodeの画素比較へ進む。

## 2026-06-21 — 動画export E2EのElectron bundle待機を追加

### 実施内容
- Red: `run-video-export-e2e.mjs` がElectron起動前にbundle完了を待つ契約を追加した。
- Green: `dist-electron/main.js` / `dist-electron/preload.js` の更新時刻とIPC markerを確認してからElectronを起動するようにした。
- 版を `0.1.1-Beta-259b` に更新した。

### 検証
- `npm test -- --run src/utils/packageScripts.test.ts`
- `npx tsc --noEmit 2>&1 | rg "run-video-export-e2e|packageScripts"`
- `UXFD_VIDEO_EXPORT_E2E_ADD_MIXED_MEDIA=1 UXFD_VIDEO_EXPORT_E2E_ADD_AVIUTL_GENERATED_EFFECTS=1 UXFD_VIDEO_EXPORT_E2E_DURATION_SECONDS=1 UXFD_VIDEO_EXPORT_E2E_TIMEOUT_MS=240000 npm run test:video-export:e2e`

### 結果・残課題
- bundle待機後の実Electron E2Eは動画+図形+画像+音声+Audio waveform R+標準パーティクルで成功した。
- 出力: 60 frames / 17,662ms / 約3.40fps / 1,092,837 bytes。
- 起動ログ上、`dist-electron/preload.js` と `dist-electron/main.js` のbuild完了後にElectronを起動できている。

## 2026-06-21 — 実Electron動画export E2EにAviUtl生成効果を投入

### 実施内容
- Red: `UXFD_VIDEO_EXPORT_E2E_ADD_AVIUTL_GENERATED_EFFECTS` とrenderer hookの存在契約を追加した。
- Green: `run-video-export-e2e.mjs` にAviUtl生成効果投入フラグを追加した。
- Green: `videoExportE2e` 専用hookで `Audio waveform R` と `標準パーティクル` をTimelineへ追加できるようにした。
- Green: 生成効果入りではdirect transcode固定ではなく、Rust native合成exportの成功を検証するようにした。
- 版を `0.1.1-Beta-259a` に更新した。

### 検証
- `npm test -- --run src/utils/packageScripts.test.ts`
- `npx tsc --noEmit 2>&1 | rg "main.tsx|run-video-export-e2e|packageScripts|AudioVisualizationObject|ParticleObject"`
- `UXFD_VIDEO_EXPORT_E2E_ADD_MIXED_MEDIA=1 UXFD_VIDEO_EXPORT_E2E_ADD_AVIUTL_GENERATED_EFFECTS=1 UXFD_VIDEO_EXPORT_E2E_DURATION_SECONDS=1 UXFD_VIDEO_EXPORT_E2E_TIMEOUT_MS=240000 npm run test:video-export:e2e`

### 結果・残課題
- 実Electron E2Eは動画+図形+画像+音声+Audio waveform R+標準パーティクルで成功した。
- 出力: 60 frames / 18,863ms / 約3.18fps / 1,092,837 bytes。
- 診断: native render envelope は `SolidColour,Image,Video,GeneratedAudioWaveform,GeneratedParticle` を含んだ。
- 初回実行では古い `dist-electron/main.js` を掴んだ疑いがあり、`rust-backend-audio-waveform-samples` handler未登録で失敗した。再実行では成功したため、次はE2E起動前にElectron bundle完了を待つ安定化を検討する。

## 2026-06-21 — 代表素材E2Eに標準パーティクルと音声波形を追加

### 実施内容
- Test: 全読込可能メディアE2Eへ `audio_visualization` と `particle` を追加した。
- Test: Rust scene snapshotが `GeneratedAudioWaveform` と `GeneratedParticle` を生成することを検証した。
- Test: 音声波形metadataが対象audioへ解決され、標準パーティクルmetadataがseed/count/spread/speed/size/colour/lifetimeを保持することを検証した。
- 挙動変更なしのテスト強化のため、版は `0.1.1-Beta-258a` のままとした。

### 検証
- `npm test -- --run src/e2e/allReadableMedia.e2e.test.ts`
- `npx tsc --noEmit 2>&1 | rg "allReadableMedia|AudioVisualizationObject|ParticleObject|GeneratedParticle|GeneratedAudioWaveform"`

### 結果・残課題
- 代表素材E2Eは既存実装で成功した。
- 残りは実Electron上の画素/エンコード結果で、生成効果込みのpreview/export一致を確認する。

## 2026-06-21 — 音声波形をRust export経路判定に追加

### 実施内容
- Red: plain audioは非visualのまま、`audio_visualization` はRust-native visual mediaとして扱う契約を追加した。
- Green: `hasProjectExportNativeRenderMediaObjects` の対象に `audio_visualization` を追加した。
- 版を `0.1.1-Beta-258a` に更新した。

### 検証
- `npm test -- --run src/utils/projectExportFrameCanvas.test.ts`
- `npx tsc --noEmit 2>&1 | rg "projectExportFrameCanvas|AudioVisualizationObject|audio_visualization"`

### 結果・残課題
- projectExportFrameCanvas対象37件が成功。対象ファイルに関するTypeScriptエラーは出ていない。
- 次は代表素材E2Eに標準パーティクルと音声波形を混ぜたpreview/export境界確認へ進む。

## 2026-06-21 — 標準パーティクルをRust export経路判定に追加

### 実施内容
- Red: 標準パーティクル単独/音声付きのexportでもRust-native visual mediaとして扱う契約を追加した。
- Green: `hasProjectExportNativeRenderMediaObjects` の対象に `particle` を追加した。
- 版を `0.1.1-Beta-257a` に更新した。

### 検証
- `npm test -- --run src/utils/projectExportFrameCanvas.test.ts`
- `npx tsc --noEmit 2>&1 | rg "projectExportFrameCanvas|ParticleObject|particle"`

### 結果・残課題
- projectExportFrameCanvas対象36件が成功。対象ファイルに関するTypeScriptエラーは出ていない。
- 次は代表素材E2Eへ標準パーティクルを混ぜ、preview/export境界をまとめて確認する。

## 2026-06-21 — 標準パーティクルPropertyPanel編集を追加

### 実施内容
- Red: PropertyPanelにRust-native標準パーティクル編集欄があることを確認する境界テストを追加した。
- Green: `ParticleObject` のcount/seed/spread/speed/size/colour/lifetime/width/heightを編集できるUIを追加した。
- 版を `0.1.1-Beta-256a` に更新した。

### 検証
- `npm test -- --run src/components/PropertyPanelBoundary.test.ts`
- `npx tsc --noEmit 2>&1 | rg "PropertyPanel|ParticleObject|particle"`

### 結果・残課題
- PropertyPanel境界テストが成功。対象ファイルに関するTypeScriptエラーは出ていない。
- 次は代表素材に標準パーティクルを載せたpreview/export一致確認を進める。

## 2026-06-21 — 標準パーティクルのプロジェクト保存/読込を許可

### 実施内容
- Red: `ParticleObject` がプロジェクトJSONをround-tripできる契約を追加した。
- Green: `projectFile` のTimelineObject許可リストへ `particle` を追加した。
- Green: `particle` の幅/高さ/count/seed/spread/speed/size/colour/lifetimeを読込時に検証するようにした。
- 版を `0.1.1-Beta-255a` に更新した。

### 検証
- `npm test -- --run src/utils/projectFile.test.ts`
- `npx tsc --noEmit 2>&1 | rg "projectFile|ParticleObject|particle"`

### 結果・残課題
- projectFile対象6件が成功。対象ファイルに関するTypeScriptエラーは出ていない。
- 次はPropertyPanelから標準パーティクルのパラメータを編集できるようにする。

## 2026-06-21 — 標準パーティクル追加UIをTimeline context menuへ接続

### 実施内容
- Red: 標準パーティクル用のデフォルトParticleObject生成契約を追加した。
- Red: Timeline context menuが標準パーティクル追加コマンドを露出する契約を追加した。
- Green: `buildDefaultStandardParticleObject` を追加し、プロジェクトサイズに合わせた中央配置の標準パーティクルを生成できるようにした。
- Green: canvas右クリックメニューへ `Add Standard Particle` / `標準パーティクルを追加` を追加した。
- 版を `0.1.1-Beta-254a` に更新した。

### 検証
- `npm test -- --run src/utils/particleObjectFactory.test.ts src/components/TimelineContextMenu.particle.test.ts`
- `npx tsc --noEmit 2>&1 | rg "particleObjectFactory|TimelineContextMenu|ParticleObject|particle|projectFile"`

### 結果・残課題
- UI追加契約2件が成功。対象ファイルに関するTypeScriptエラーは出ていない。
- 次はParticleObjectのプロジェクト保存/読込許可とPropertyPanel編集UIを追加する。

## 2026-06-21 — 標準パーティクルをsource frame対応の動的生成へ拡張

### 実施内容
- Red: `GeneratedParticle` がclipの `source_frame` を使って粒子位置を進める契約を追加した。
- Green: rust-backendのnative render source収集へ `SceneSnapshot` を渡し、media idに対応するclipの `source_frame` を参照できるようにした。
- Green: `standard-particle` の `speed` と `lifetime_seconds` を使い、60fps基準の経過秒で粒子を決定的に移動させるようにした。
- Green: direct native encodeとpreview native shared frameの両方で同じsource frame評価を使うようにした。
- 版を `0.1.1-Beta-253a` に更新した。

### 検証
- `cargo test --manifest-path rust-backend/Cargo.toml --test decode_control_plane native_render_generated_particle_uses_clip_source_frame_for_motion -- --nocapture`
- `cargo test --manifest-path rust-backend/Cargo.toml --test decode_control_plane generated -- --nocapture`
- `npm test -- --run src/utils/rustSceneSnapshot.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts`
- `npx tsc --noEmit 2>&1 | rg "Particle|particle|rust-backend|rustSceneSnapshot|sharedRendererNativeMediaSupport"`

### 結果・残課題
- rust-backendのgenerated media関連5件、TS対象27件が成功。対象ファイルに関するTypeScriptエラーは出ていない。
- 次は標準パーティクルをTimeline/PropertyPanelから追加・編集できるUIへ接続する。

## 2026-06-21 — 標準パーティクルをRust backend native renderへ接続

### 実施内容
- Red: `render.nativeSharedFrame` が `GeneratedParticle` mediaをshared frameへ描ける契約を追加した。
- Green: rust-backendに `GeneratedParticleSource` metadataを追加し、`standard-particle` を検証できるようにした。
- Green: `collect_native_render_sources` が `GeneratedParticle` をRGBA source frameへ生成するようにした。
- Green: seed/count/spread/size/colourを使い、決定的な静的パーティクルをラスタライズするようにした。
- 版を `0.1.1-Beta-252a` に更新した。

### 検証
- `cargo test --manifest-path rust-backend/Cargo.toml --test decode_control_plane native_render_shared_frame_builds_generated_particle_sources_from_media -- --nocapture`
- `cargo test --manifest-path rust-backend/Cargo.toml --test decode_control_plane generated -- --nocapture`
- `npm test -- --run src/utils/rustSceneSnapshot.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts`
- `npx tsc --noEmit 2>&1 | rg "Particle|particle|rust-backend|rustSceneSnapshot|sharedRendererNativeMediaSupport"`

### 結果・残課題
- rust-backendのgenerated media関連4件、TS対象27件が成功。対象ファイルに関するTypeScriptエラーは出ていない。
- 現段階の標準パーティクルは静的な決定的生成。次はsource frame/timeを使った速度・寿命つきの動的パーティクル化とUI追加へ進む。

## 2026-06-21 — 標準パーティクルを生成メディア境界へ追加

### 実施内容
- Red: ParticleObjectがRust scene snapshotで `GeneratedParticle` mediaになる契約を追加した。
- Red: native media gateが `standard-particle` metadataをRust生成メディアとして受け入れる契約を追加した。
- Red: rust-core JSON境界が `GeneratedParticle` media kindを受け入れる契約を追加した。
- Green: `ParticleObject` をTimelineObjectへ追加し、AviUtlPackV4標準パーティクル互換の基本パラメータを持てるようにした。
- Green: `rustSceneSnapshot` が `particle` を `GeneratedParticle` media referenceへ変換するようにした。
- Green: `sharedRendererNativeMediaSupport` に `standard-particle` metadata検証を追加した。
- Green: rust-core schemaに `GeneratedParticle` / `GeneratedParticlePlane` を追加した。
- 版を `0.1.1-Beta-251a` に更新した。

### 検証
- `npm test -- --run src/utils/rustSceneSnapshot.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts`
- `cargo test --manifest-path rust-core/Cargo.toml --test media_schema rust_core_accepts_generated_particle_media_kind_at_the_json_boundary -- --nocapture`
- `npx tsc --noEmit 2>&1 | rg "Particle|particle|rustSceneSnapshot|sharedRendererNativeMediaSupport|sharedRendererPreviewPresenterController|projectFile"`

### 結果・残課題
- TS対象27件、rust-core media schema 1件が成功。対象ファイルに関するTypeScriptエラーは出ていない。
- 次はRust backend/native rendererで `GeneratedParticle` を実RGBA frameへ生成し、preview/exportのnative render経路へ接続する。

## 2026-06-21 — Audio waveform Rをexport native encode payloadへ接続

### 実施内容
- Red: export frame sourceがGeneratedAudioWaveformのPCMを要求し、direct native encode payloadへ `audioWaveforms` を渡す契約を追加した。
- Green: preview native renderで使う `prepareNativeRenderAudioWaveforms` をexport側でも再利用できるようにした。
- Green: `RustBackendVideoEncodeWriteNativeFramePayload` に `audioWaveforms` を追加し、direct native encodeとnative shared-frame fallbackの両方に渡すようにした。
- Green: exportテストのmock PCM要求に型注釈を追加し、対象TypeScriptエラーを解消した。
- 版を `0.1.1-Beta-250a` に更新した。

### 検証
- `npm test -- --run src/utils/sharedRendererExportFrameSource.test.ts src/utils/sharedRendererViewportNativeRenderUpload.test.ts src/utils/rustBackendVideoEncodeControl.test.ts`
- `npx tsc --noEmit 2>&1 | rg "sharedRendererExportFrameSource|sharedRendererViewportNativeRenderUpload|rustBackendVideoEncodeControl|rustBackendNativeRenderControl"`

### 結果・残課題
- TS対象66件が成功。対象ファイルに関するTypeScriptエラーは出ていない。
- Audio waveform Rはpreview/exportのnative payload境界まで接続済み。次は実ウィンドウ/E2Eで代表素材に効果を載せ、表示とエンコード結果を確認する。

## 2026-06-21 — Audio waveform Rをnative render payloadへ接続

### 実施内容
- Red: GeneratedAudioWaveformがpreview native renderでPCMを要求し、`audioWaveforms` としてRust native render payloadへ渡る契約を追加した。
- Red: Rust backendの `render.nativeSharedFrame` が `audioWaveforms` だけでGeneratedAudioWaveformをshared frame出力できる契約を追加した。
- Green: `RustBackendNativeRenderSharedFramePayload.audioWaveforms` を追加し、preview native render準備で `audio-waveform-r` metadataからPCMサンプルを要求するようにした。
- Green: GeneratedAudioWaveformをRust native render対応メディアとしてgateへ追加した。
- Green: rust-backendが `audioWaveforms` を `NativeAudioWaveformInput` へ変換し、native-wgpu-rendererの波形描画経路へ渡すようにした。
- Green: direct native encode側も `audioWaveforms` を受けられるようにし、preview/export両方のRust backend境界を揃えた。
- 版を `0.1.1-Beta-249a` に更新した。

### 検証
- `npm test -- --run src/utils/rustBackendNativeRenderControl.test.ts src/utils/sharedRendererViewportNativeRenderUpload.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts`
- `cargo test --manifest-path rust-backend/Cargo.toml --test decode_control_plane native_render_shared_frame_builds_generated_audio_waveform_from_payload -- --nocapture`
- `cargo test --manifest-path native-wgpu-renderer/Cargo.toml --test native_reference_parity native_wgpu_renders_generated_audio_waveform_frame -- --nocapture`
- `npx tsc --noEmit 2>&1 | rg "sharedRendererViewportNativeRenderUpload|rustBackendNativeRenderControl|sharedRendererNativeMediaSupport|vite-env|electron/main|native render"`

### 結果・残課題
- TS対象20件、Rust backendの波形native shared frameテスト1件、native-wgpu-rendererの波形描画テスト1件が成功。対象ファイルに関するTypeScriptエラーは出ていない。
- 次はexport frame sourceでGeneratedAudioWaveformのPCM要求を行い、direct native encode payloadにも実際の `audioWaveforms` を積む。

## 2026-06-21 — Audio waveform RのElectron bridgeを追加

### 実施内容
- Red: rendererから `audio.waveformSamples` を呼び出す `rustBackendAudioWaveformControl` 契約と、Electron main/preload/vite-envのbridge露出契約を追加した。
- Green: `requestRustBackendAudioWaveformSamples` を追加し、rendererから `window.rustBackend.requestAudioWaveformSamples` 経由でPCMサンプル要求を送れるようにした。
- Green: Electron preloadへ `requestAudioWaveformSamples` を露出し、main IPC `rust-backend-audio-waveform-samples` からRust backendの `audio.waveformSamples` を呼ぶようにした。
- Green: `src/vite-env.d.ts` に波形サンプル要求/応答型を追加した。
- 版を `0.1.1-Beta-248a` に更新した。

### 検証
- `npm test -- --run src/utils/rustBackendAudioWaveformControl.test.ts src/utils/rustBackendNativeRenderBoundary.test.ts`
- `npx tsc --noEmit 2>&1 | rg "rustBackendAudioWaveformControl|vite-env|electron/preload|electron/main"`

### 結果・残課題
- renderer/Electron境界テスト6件が成功。対象ファイルに関するTypeScriptエラーは出ていない。
- 次はrendererで `audio_visualization` のmetadataからPCM要求を発行し、`NativeAudioWaveformInput` へ接続してpreview/exportの実波形表示へ進む。

## 2026-06-21 — Audio waveform R用PCM供給RPCをRust backendへ追加

### 実施内容
- Red: `audio.waveformSamples` RPCが音声ファイルから波形生成用のmono f32 PCMを返す契約を追加した。
- Green: `AudioWaveformSamplesParams` と `handle_audio_waveform_samples` を追加し、ffmpegで `f32le` mono PCMをstdout抽出するようにした。
- Green: `sampleRate` / `maxSamples` / `startSeconds` / `durationSeconds` を受け取り、制御面に載せるサンプル数を上限管理するようにした。
- Green: backendのnative render source収集で `GeneratedAudioWaveform` を通常画像source読み込み対象から外し、生成入力として扱えるようにした。
- 版を `0.1.1-Beta-247a` に更新した。

### 検証
- `cargo test --manifest-path rust-backend/Cargo.toml --test decode_control_plane audio_waveform_samples_decodes_pcm_for_native_waveform_generation -- --nocapture`
- `cargo test --manifest-path native-wgpu-renderer/Cargo.toml --test native_reference_parity native_wgpu_renders_generated_audio_waveform_frame -- --nocapture`

### 結果・残課題
- rust-backendのPCM供給テスト1件、native-wgpu-rendererの波形描画テスト1件が成功。
- 次はrenderer/Electron側で `audio_visualization` のmetadataから `audio.waveformSamples` を呼び、`NativeAudioWaveformInput` へ接続する。

## 2026-06-21 — Audio waveform Rをnative-wgpu-rendererへ接続

### 実施内容
- Red: `NativeAudioWaveformInput` を渡すと、native-wgpu-rendererが生成波形をGPU合成結果へ描く契約を追加した。
- Green: `render_native_wgpu_frame_with_audio_waveforms` を追加し、PCMサンプルからRust coreのline stripを作り、RGBAフレーム化して既存WebGPU合成へ流すようにした。
- Green: 波形色、線幅、sample rate、source frameを利用し、生成メディアを通常の `RgbaFrame` sourceと同じ経路で扱えるようにした。
- 版を `0.1.1-Beta-246a` に更新した。

### 検証
- `cargo test --manifest-path native-wgpu-renderer/Cargo.toml --test native_reference_parity native_wgpu_renders_generated_audio_waveform_frame -- --nocapture`
- `cargo test --manifest-path native-wgpu-renderer/Cargo.toml --test native_reference_parity -- --nocapture`
- `cargo test --manifest-path rust-core/Cargo.toml --test audio_waveform_scene -- --nocapture`

### 結果・残課題
- native-wgpu-rendererの `native_reference_parity` 15件、Rust coreの `audio_waveform_scene` 2件が成功。
- 次はRust backend/sidecarで音声ファイルからPCMを供給し、renderer側のAudio waveform R生成入力へ接続する。

## 2026-06-21 — Audio waveform RのRust波形生成コアを追加

### 実施内容
- Red: `audio-waveform-r` metadata JSONをRustで読み取り、PCMサンプルから波形ラインストリップを生成する契約を追加した。
- Green: `rust-core/src/audio_waveform_scene.rs` を追加し、`AudioWaveformSource::from_json` と `build_audio_waveform_line_strip` を実装した。
- Green: source frame / fps / sample rate / 表示サイズから、現在フレームに対応するサンプル窓を画面座標へ変換できるようにした。
- Green: `#rrggbb` の色、線幅、振幅をRust側の生成結果へ保持するようにした。
- 版を `0.1.1-Beta-245a` に更新した。

### 検証
- `cargo test --manifest-path rust-core/Cargo.toml --test audio_waveform_scene -- --nocapture`
- `cargo test --manifest-path rust-core/Cargo.toml --test timeline_snapshot_contract --test audio_waveform_scene -- --nocapture`

### 結果・残課題
- Rust coreの `audio_waveform_scene` 2件、`timeline_snapshot_contract` 6件が成功。
- 次はRust backend/sidecarで対象音声をPCMへdecodeし、このline stripをnative-wgpu-rendererへ渡して実描画する。

## 2026-06-21 — Audio waveform RをRust生成メディア境界へ追加

### 実施内容
- Red: `audio_visualization` オブジェクトが対象audioを参照した `GeneratedAudioWaveform` media planeとしてRust scene snapshotへ出る契約を追加した。
- Red: Rust coreの `MediaKind::GeneratedAudioWaveform` と `ClipKind::GeneratedAudioWaveformPlane` を受け入れるスキーマ契約を追加した。
- Green: `rustSceneSnapshot` が `audio_visualization` をshared renderer対応オブジェクトとして扱い、`audio-waveform-r` generator metadataをJSON sourceへ格納するようにした。
- Green: `targetAudioId` 優先、未指定時は対象レイヤーの再生中audioを参照する解決処理を追加した。
- Green: Rust core schemaに `GeneratedAudioWaveform` / `GeneratedAudioWaveformPlane` を追加した。
- 版を `0.1.1-Beta-244a` に更新した。

### 検証
- `npm test -- --run src/utils/rustSceneSnapshot.test.ts`
- `npx tsc --noEmit 2>&1 | rg "src/utils/rustSceneSnapshot|src/types|rustSceneSnapshot.test"`
- `cargo test --manifest-path rust-core/Cargo.toml --test timeline_snapshot_contract -- --nocapture`

### 結果・残課題
- TS snapshotテストは22件成功。対象ファイルに関するTypeScriptエラーは出ていない。
- Rust coreは `timeline_snapshot_contract` 6件成功。
- 現段階は波形の生成メタデータをRust境界へ渡すところまで。次はRust側で音声サンプルを読み、波形mesh/textureを生成してnative-wgpu-rendererへ描画させる。

## 2026-06-21 — 扇クリッピング近似をRust/WebGPU境界へ追加

### 実施内容
- Red: 既存の `clipping` filterが `Clipping` effectとしてRust scene snapshotへ出る契約を追加した。
- Red: Rust coreの `Effect::Clipping` と、切り取り量/角度の検証、native-wgpu-rendererの軸揃えクリッピング画素契約を追加した。
- Green: `rustSceneSnapshot` が `clipping` filterを `Clipping { top, bottom, left, right, angle_degrees }` へ変換し、shared rendererのunsupported filter判定から外すようにした。
- Green: Rust coreに `Effect::Clipping` を追加し、serde境界とvalidationへ接続した。
- Green: native-wgpu-rendererのuniform/WGSL shaderへ斜めクリッピング判定を追加し、Pixi側の既存DiagonalClippingFilterに近い中心回転クリップを行うようにした。
- 版を `0.1.1-Beta-243a` に更新した。

### 検証
- `npm test -- --run src/utils/rustSceneSnapshot.test.ts`
- `npx tsc --noEmit 2>&1 | rg "src/utils/rustSceneSnapshot|src/types|src/utils/filterStack|src/utils/aviutlEffectPresets"`
- `cargo test --manifest-path rust-core/Cargo.toml --test timeline_snapshot_contract --test project_validation -- --nocapture`
- `cargo test --manifest-path native-wgpu-renderer/Cargo.toml --test native_reference_parity -- --nocapture`

### 結果・残課題
- TS snapshotテストは21件成功。対象ファイルに関するTypeScriptエラーは出ていない。
- Rust coreは `timeline_snapshot_contract` 5件、`project_validation` 11件成功。
- native-wgpu-rendererは `native_reference_parity` 14件成功し、`native_wgpu_applies_axis_aligned_clipping` で実shader効果を確認した。
- 現段階は既存UIの斜めクリッピング近似をRustへ載せた段階。極座標の本格的な扇クリッピングR再現は追加effectとして拡張する。

## 2026-06-21 — 輝度ワイプをRust/WebGPU境界へ追加

### 実施内容
- Red: 既存の `wipe` filterが時刻評価済み `Wipe` effectとしてRust scene snapshotへ出る契約を追加した。
- Red: Rust coreの `Effect::Wipe` / `WipeEdge` と、progress範囲検証、native-wgpu-rendererの左ワイプ画素契約を追加した。
- Green: `rustSceneSnapshot` が `wipe` filterを `Wipe { edge, progress }` へ変換し、shared rendererのunsupported filter判定から外すようにした。
- Green: Rust coreに `WipeEdge` と `Effect::Wipe` を追加し、serde境界とvalidationへ接続した。
- Green: native-wgpu-rendererのuniform/WGSL shaderへwipe edge/progressを追加し、対象外ピクセルを透明化するようにした。
- 版を `0.1.1-Beta-242a` に更新した。

### 検証
- `npm test -- --run src/utils/rustSceneSnapshot.test.ts src/utils/aviutlEffectPresets.test.ts`
- `npx tsc --noEmit 2>&1 | rg "src/utils/rustSceneSnapshot|src/types|src/utils/filterStack|src/utils/aviutlEffectPresets"`
- `cargo test --manifest-path rust-core/Cargo.toml --test timeline_snapshot_contract --test project_validation -- --nocapture`
- `cargo test --manifest-path native-wgpu-renderer/Cargo.toml --test native_reference_parity -- --nocapture`

### 結果・残課題
- TS関連テストは24件成功。対象ファイルに関するTypeScriptエラーは出ていない。
- Rust coreは `timeline_snapshot_contract` 5件、`project_validation` 10件成功。
- native-wgpu-rendererは `native_reference_parity` 13件成功し、`native_wgpu_applies_left_wipe_progress` で実shader効果を確認した。
- 次は扇クリッピングのRust native effect化、またはAudio waveform Rのnative generated object化へ進む。

## 2026-06-21 — 縁取りをFilter StackとRust/WebGPU境界へ追加

### 実施内容
- Red: `outline` フィルタをFilter Stack、AviUtl効果プリセット、Rust scene snapshotへ通す契約を追加した。
- Green: `OutlineFilterParams` と `outline` filterを追加し、AviUtl Effectsの `縁取りT` をshadow近似から独立フィルタへ昇格した。
- Green: PropertyPanelで縁取りの色、太さ、不透明度を編集できるようにした。
- Green: Pixiプレビュー用にsource alpha近傍へ縁色を出すGPU filterを追加した。
- Green: Rust coreの `Effect` に `Outline` を追加し、scene snapshot JSON境界、validation、native-wgpu-rendererのWGSL shaderへ接続した。
- Green: native-wgpu-rendererに透明近傍へoutlineが出ることを検証するテストを追加した。
- 版を `0.1.1-Beta-241a` に更新した。

### 検証
- `npm test -- --run src/utils/filterStack.test.ts src/utils/aviutlEffectPresets.test.ts src/utils/rustSceneSnapshot.test.ts src/components/PropertyPanelBoundary.test.ts`
- `npx tsc --noEmit 2>&1 | rg "src/types|src/utils/filterStack|src/utils/aviutlEffectPresets|src/utils/rustSceneSnapshot|src/utils/pixiRenderHelper|src/components/PropertyPanel"`
- `cargo test --manifest-path rust-core/Cargo.toml --test timeline_snapshot_contract --test project_validation -- --nocapture`
- `cargo test --manifest-path native-wgpu-renderer/Cargo.toml --test native_reference_parity -- --nocapture`

### 結果・残課題
- TS関連テストは41件成功。対象ファイルに関するTypeScriptエラーは出ていない。
- Rust coreは `timeline_snapshot_contract` 5件、`project_validation` 9件成功。
- native-wgpu-rendererは `native_reference_parity` 12件成功し、`native_wgpu_applies_outline_to_transparent_neighbours` で実shader効果を確認した。
- 次は輝度ワイプ/扇クリッピングのRust native effect化、またはAudio waveform Rのnative generated object化へ進む。

## 2026-06-21 — 色収差をFilter StackとRust/WebGPU境界へ追加

### 実施内容
- Red: `colour_aberration` フィルタをFilter Stack、AviUtl効果プリセット、Rust scene snapshotへ通す契約を追加した。
- Green: `ColourAberrationFilterParams` と `colour_aberration` filterを追加し、AviUtl Effectsの `色収差` ボタンから追加できるようにした。
- Green: Pixiプレビュー用にRGBチャンネルをずらすGPU filterを追加した。
- Green: Rust coreの `Effect` に `ColourAberration` を追加し、scene snapshot JSON境界、validation、native-wgpu-rendererのWGSL shaderへ接続した。
- Green: native-wgpu-rendererに3px手作り素材でチャンネルオフセットを検証するテストを追加した。
- 版を `0.1.1-Beta-240a` に更新した。

### 検証
- `npm test -- --run src/utils/filterStack.test.ts src/utils/aviutlEffectPresets.test.ts src/utils/rustSceneSnapshot.test.ts src/components/PropertyPanelBoundary.test.ts`
- `npx tsc --noEmit 2>&1 | rg "src/types|src/utils/filterStack|src/utils/aviutlEffectPresets|src/utils/rustSceneSnapshot|src/utils/pixiRenderHelper|src/components/PropertyPanel"`
- `cargo test --manifest-path rust-core/Cargo.toml --test timeline_snapshot_contract --test project_validation -- --nocapture`
- `cargo test --manifest-path native-wgpu-renderer/Cargo.toml --test native_reference_parity -- --nocapture`

### 結果・残課題
- TS関連テストは40件成功。対象ファイルに関するTypeScriptエラーは出ていない。
- Rust coreは `timeline_snapshot_contract` 5件、`project_validation` 8件成功。
- native-wgpu-rendererは `native_reference_parity` 11件成功し、`native_wgpu_applies_colour_aberration_channel_offsets` で実shader効果を確認した。
- 次は縁取り/輝度ワイプ/扇クリッピングのRust native effect化、またはAudio waveform Rのnative generated object化へ進む。

## 2026-06-21 — AviUtlPackV4 P1効果プリセットをPropertyPanelへ追加

### 実施内容
- Red: `PropertyPanel` がAviUtlPackV4効果プリセットをFilter Stack周辺に露出する契約を追加した。
- Green: `AviUtl Effects` セクションを追加し、輝度ワイプ近似、縁取りT近似、扇クリッピング近似をボタンから追加できるようにした。
- Green: 追加後は末尾の新規filterを編集中filterとして選択するようにした。
- 版を `0.1.1-Beta-239a` に更新した。

### 検証
- `npm test -- --run src/components/PropertyPanelBoundary.test.ts src/utils/aviutlEffectPresets.test.ts`
- `npx tsc --noEmit 2>&1 | rg "src/components/PropertyPanel|PropertyPanel|src/utils/aviutlEffectPresets|aviutlEffectPresets"`

### 結果・残課題
- UI境界テスト3件と効果プリセット単体テスト3件が成功。対象ファイルに関するTypeScriptエラーは出ていない。
- P1効果は現時点では既存Filter Stackへの近似。Rust/WebGPU本実装は次の段階で境界型から広げる。

## 2026-06-21 — AviUtlPackV4 P1効果プリセット中核を追加

### 実施内容
- Red: 輝度ワイプ、縁取りT、扇クリッピングRをUX FDのFilter Stackプリセットとして追加する契約を作成した。
- Green: `src/utils/aviutlEffectPresets.ts` を追加し、P1候補を既存の `wipe` / `shadow` / `clipping` フィルタへ近似接続した。
- Green: 既存filterを破棄せず末尾へ追加し、legacy effect fieldsも同期するようにした。
- 版を `0.1.1-Beta-238a` に更新した。

### 検証
- `npm test -- --run src/utils/aviutlEffectPresets.test.ts`
- `npx tsc --noEmit 2>&1 | rg "src/utils/aviutlEffectPresets|aviutlEffectPresets"`

### 結果・残課題
- 効果プリセット単体テストは3件成功。対象ファイルに関するTypeScriptエラーは出ていない。
- これはRust/WebGPU本実装前の近似プリセット。次はPropertyPanelへ入口を追加し、その後にRust effect境界を広げる。

## 2026-06-21 — AviUtlPackV4 P0モーションプリセットをPropertyPanelへ追加

### 実施内容
- Red: `PropertyPanel` がAviUtlPackV4 motion presetをKeyframes周辺に露出する契約を追加した。
- Green: `AviUtl Motion` セクションを追加し、左からスライド、下からポップ、ランダム揺れ、左右反復をボタンから適用できるようにした。
- Green: 適用時は既存の `PositionKeyframe` として保存されるため、現行preview/export経路にそのまま乗る。
- 版を `0.1.1-Beta-237a` に更新した。

### 検証
- `npm test -- --run src/components/PropertyPanelBoundary.test.ts src/utils/aviutlMotionPresets.test.ts`
- `npx tsc --noEmit 2>&1 | rg "src/components/PropertyPanel|PropertyPanel|src/utils/aviutlMotionPresets|aviutlMotionPresets"`

### 結果・残課題
- UI境界テスト2件とmotion preset単体テスト4件が成功。対象ファイルに関するTypeScriptエラーは出ていない。
- 次はP1の輝度ワイプ、縁取り、色収差、扇クリッピングをRust/WebGPU effect境界に追加する。

## 2026-06-21 — AviUtlPackV4 P0モーションプリセット中核を追加

### 実施内容
- Red: AviUtlPackV4由来のP0候補を、UX FDネイティブのmotion presetとして列挙し、選択オブジェクトへ位置キーフレームを生成する契約を追加した。
- Green: `src/utils/aviutlMotionPresets.ts` を追加し、左からスライド、下からポップ、ランダム揺れ、左右反復のプリセットを実装した。
- Green: 既存の `PositionKeyframe` / `EasingType` へ直接落とし込み、現行preview/export経路で扱える形にした。
- 版を `0.1.1-Beta-236a` に更新した。

### 検証
- `npm test -- --run src/utils/aviutlMotionPresets.test.ts`
- `npx tsc --noEmit 2>&1 | rg "src/utils/aviutlMotionPresets|aviutlMotionPresets"`

### 結果・残課題
- P0 motion presetの中核テストは4件成功。対象ファイルに関するTypeScriptエラーは出ていない。
- 次はPropertyPanelへAviUtl motion presetボタンを出し、実際の編集UIから適用できるようにする。

## 2026-06-21 — AviUtlPackV4標準効果カタログを追加

### 実施内容
- Red: iCloud Drive配下の `AviUtlPackV4` 棚卸し結果と、標準搭載候補の優先順を返す契約を追加した。
- Green: `src/utils/aviutlPackFeatureCatalog.ts` を追加し、AviUtl/YMM4系イージング、登場退場、ランダム/反復、輝度ワイプ、縁取り、色収差、扇クリッピング、音声波形、パーティクルなどをUX FDネイティブ再実装候補として整理した。
- Green: `markdown/AviUtlPackV4_Inventory.md` を追加し、Packの拡張子数、主要ディレクトリ、標準搭載優先候補を記録した。
- 版を `0.1.1-Beta-235a` に更新した。

### 検証
- `npm test -- --run src/utils/aviutlPackFeatureCatalog.test.ts`

### 結果・残課題
- Packの実測ファイル数は `.anm` 137、`.obj` 61、`.tra` 12、`.cam` 6、`.scn` 2、`.lua` 15、`.stg` 18。
- 第三者スクリプト本体はコピーせず、UX FDネイティブの互換再実装として標準搭載する方針を固定した。
- 次はP0 motion presetを既存キーフレーム/easingへ接続し、PropertyPanelから使えるようにする。

## 2026-06-21 — PSD overlay flatten cacheを追加

### 実施内容
- Red: 同じPSD overlayを2回 `encode.transcodeVideo` した時、2回目に `psdOverlayCacheHits=1` が返る契約を追加した。
- Green: Rust backendのプロセス内状態にPSD overlay cacheを追加し、`filePath + activeLayerIds + mtime + size` が同じ場合はflatten済みRGBA入力を再利用するようにした。
- Green: cache済みRGBAはffmpeg実行後に削除せず、同じbackendプロセス内の再exportで使えるようにした。
- Green: 実Electron動画export E2Eに `UXFD_VIDEO_EXPORT_E2E_REPEAT_EXPORTS` と `UXFD_VIDEO_EXPORT_E2E_EXPECT_REPEAT_SPEEDUP` を追加し、同じウィンドウ内の連続exportを計測できるようにした。

### 検証
- `cargo test --manifest-path rust-backend/Cargo.toml --test decode_control_plane encode_transcode_video_reuses_static_psd_overlay_cache -- --nocapture`
- `cargo test --manifest-path rust-backend/Cargo.toml --test decode_control_plane encode_transcode_video -- --nocapture`
- `npm test -- --run src/utils/packageScripts.test.ts`
- `node --check scripts/run-video-export-e2e.mjs`
- `UXFD_VIDEO_EXPORT_E2E_VIDEO_PATH=/Volumes/ExtendSSD-W/GX020052.MP4 UXFD_VIDEO_EXPORT_E2E_ADD_MIXED_MEDIA=1 UXFD_VIDEO_EXPORT_E2E_ADD_PSD=1 UXFD_VIDEO_EXPORT_E2E_REPEAT_EXPORTS=2 UXFD_VIDEO_EXPORT_E2E_EXPECT_REPEAT_SPEEDUP=1 UXFD_VIDEO_EXPORT_E2E_DURATION_SECONDS=1 UXFD_VIDEO_EXPORT_E2E_TIMEOUT_MS=360000 npm run test:video-export:e2e`
- `ffprobe -v error -show_entries stream=codec_type -of csv=p=0 .codex/video-export-e2e/video-export-e2e-output.mp4`

### 結果・残課題
- Rust transcode系テストは8件成功。
- 初回exportはPSD parse/compositeが必要。2回目以降の同一PSD状態はflatten済みRGBAを再利用できる。
- 実Electron E2Eで動画+図形+画像+音声+PSDを2回連続exportし、1回目は60 frames / 10850ms / 約5.53fps、2回目は60 frames / 2767ms / 約21.68fps。2回目は1回目の約25.5%まで短縮された。
- 出力MP4は `video` / `audio` streamを維持した。
- 次は2回目でも約21.7fps止まりの残り要因を分ける。候補はffmpeg起動/入力初期化、音声mix生成、PSD RGBA raw inputの読み込み、短尺1秒の固定オーバーヘッド。

## 2026-06-21 — 静的PSD overlayをffmpeg fast pathへ接続

### 実施内容
- Red: `resolveProjectExportVideoTranscodeFastPath` が動画1本+静的PSDを `kind: 'psd'` overlayとして受け入れる契約を追加した。
- Red: Rust backend `encode.transcodeVideo` がPSD overlayを受け取り、出力MP4を生成する契約を追加した。
- Green: TS resolverでPSDの `filePath` / `activeLayerIds` / `scale` / opacityをdirect transcode overlayへ渡すようにした。
- Green: Rust backendでPSDを一度だけparse/compositeし、一時RGBA入力としてffmpeg `overlay` filterへ渡すようにした。
- Green: lip sync有効PSDと3D world placement有効PSDは、動的表現が必要なためfast path対象外のままにした。

### 検証
- `npm test -- --run src/utils/projectExportVideoTranscodeFastPath.test.ts`
- `cargo test --manifest-path rust-backend/Cargo.toml --test decode_control_plane encode_transcode_video_accepts_static_psd_overlay_filters -- --nocapture`
- `npm test -- --run src/utils/rustBackendVideoEncodeControl.test.ts src/utils/projectExportVideoTranscodeFastPath.test.ts src/utils/useProjectExportBoundary.test.ts src/utils/rustSceneSnapshot.test.ts`
- `npx tsc --noEmit 2>&1 | rg "src/utils/projectExportVideoTranscodeFastPath|src/utils/rustBackendVideoEncodeControl|src/hooks/useProjectExport|src/vite-env|rustSceneSnapshot"`
- `cargo test --manifest-path rust-backend/Cargo.toml --test decode_control_plane encode_transcode_video -- --nocapture`
- `UXFD_VIDEO_EXPORT_E2E_VIDEO_PATH=/Volumes/ExtendSSD-W/GX020052.MP4 UXFD_VIDEO_EXPORT_E2E_ADD_MIXED_MEDIA=1 UXFD_VIDEO_EXPORT_E2E_ADD_PSD=1 UXFD_VIDEO_EXPORT_E2E_DURATION_SECONDS=1 UXFD_VIDEO_EXPORT_E2E_TIMEOUT_MS=300000 npm run test:video-export:e2e`
- `ffprobe -v error -show_entries stream=codec_type -of csv=p=0 .codex/video-export-e2e/video-export-e2e-output.mp4`

### 結果・残課題
- PSD overlay単体契約はGreen。関連TSテストは57件成功、Rust transcode系テストは7件成功。
- 前段の混在ffmpeg fast pathは `/Volumes/ExtendSSD-W/GX020052.MP4` 5秒素材で300 frames、5507ms、約54.48fpsまで出た。
- 実Electron E2Eで動画+図形+画像+音声+PSDをUI投入し、`Rust backend direct transcode` で60 frames、10883ms、約5.51fps、`video` / `audio` streamありを確認した。
- 葵ちゃんPSDは171 layerで、export冒頭のPSD parse/composite準備が支配的。次はPSD flattened RGBAのcache化で、同じPSD状態の再exportを高速化する。回転PSD、lip sync PSD、複数動画はまだnative render経路。

## 2026-06-21 — 混在メディアをffmpeg fast pathへ接続

### 実施内容
- Red: 動画1本+静的矩形+静的画像+音声を `resolveProjectExportVideoTranscodeFastPath` が受け入れる契約を追加した。
- Red: Rust backend `encode.transcodeVideo` が `overlays` を受け取り、`overlayCount` を返す契約を追加した。
- Red: direct transcode fast pathで混在音声mix WAVを作り、`audioPath` としてRust backendへ渡す契約を追加した。
- Green: TS resolverでrect/image overlayと `requiresAudioMix` を返すようにした。
- Green: Rust backendのffmpeg commandを `filter_complex` 対応にし、base video transform後に `drawbox` / image `overlay` を適用するようにした。
- Green: direct transcode前に音声mix WAVを保存し、完了/失敗後に一時ファイルを削除するようにした。

### 検証
- `npm test -- --run src/utils/rustBackendVideoEncodeControl.test.ts src/utils/projectExportVideoTranscodeFastPath.test.ts src/utils/useProjectExportBoundary.test.ts src/utils/rustSceneSnapshot.test.ts`
- `npx tsc --noEmit 2>&1 | rg "src/hooks/useProjectExport|src/utils/projectExportVideoTranscodeFastPath|src/utils/rustBackendVideoEncodeControl|src/vite-env|src/utils/rustSceneSnapshot"`
- `cargo test --manifest-path rust-backend/Cargo.toml --test decode_control_plane encode_transcode_video -- --nocapture`
- `UXFD_VIDEO_EXPORT_E2E_ADD_MIXED_MEDIA=1 UXFD_VIDEO_EXPORT_E2E_DURATION_SECONDS=1 UXFD_VIDEO_EXPORT_E2E_TIMEOUT_MS=240000 npm run test:video-export:e2e`
- `ffprobe -v error -show_entries stream=codec_type -of csv=p=0 .codex/video-export-e2e/video-export-e2e-output.mp4`

### 結果・残課題
- 混在メディアE2Eは `Rust backend direct transcode` に入り、60frameを2060ms、約29.13fpsで出力した。
- `/Volumes/ExtendSSD-W/GX020052.MP4` の5秒混在E2Eは300 frames、5507ms、約54.48fpsで成功した。
- 前回のper-frame native render経路は約13.1秒/4.58fpsだったため、短尺条件では大幅改善。
- 出力MP4には `video` と `audio` streamの両方が存在した。
- 5秒以上では30fps超を確認済み。回転・複数動画・動的PSD overlayはまだnative render経路。

## 2026-06-21 — 混在native render export高速化の初回実測

### 実施内容
- Red: `runRustBackendVideoEncodeExport` に、encode write中に2フレーム先までframe source生成を進められる契約を追加した。
- Green: Rust encode exportのrender-ahead深度を可変queue化し、`VITE_UXFD_RUST_EXPORT_RENDER_AHEAD_FRAMES` で1〜4へ調整できるようにした。
- Green: 実測で悪化したため既定値は1へ戻し、明示指定時だけ2以上を試す形にした。
- Red/Green: `VITE_UXFD_NATIVE_DIRECT_ENCODE=1` 有効時に、混在native-renderable frameも `nativeEncodeFramePayload` を返せるようにした。

### 検証
- `npm test -- --run src/utils/sharedRendererExportFrameSource.test.ts src/utils/rustBackendVideoEncodeExport.test.ts src/utils/useProjectExportBoundary.test.ts`
- `npx tsc --noEmit 2>&1 | rg "src/utils/sharedRendererExportFrameSource|src/utils/rustBackendVideoEncodeExport|src/hooks/useProjectExport"`
- `UXFD_VIDEO_EXPORT_E2E_ADD_MIXED_MEDIA=1 UXFD_VIDEO_EXPORT_E2E_DURATION_SECONDS=1 UXFD_VIDEO_EXPORT_E2E_TIMEOUT_MS=240000 npm run test:video-export:e2e`
- `VITE_UXFD_NATIVE_DIRECT_ENCODE=1 VITE_UXFD_RUST_EXPORT_RENDER_AHEAD_FRAMES=1 UXFD_VIDEO_EXPORT_E2E_ADD_MIXED_MEDIA=1 UXFD_VIDEO_EXPORT_E2E_DURATION_SECONDS=1 UXFD_VIDEO_EXPORT_E2E_TIMEOUT_MS=240000 npm run test:video-export:e2e`

### 結果・残課題
- 標準混在E2Eは1秒60frameで13.1秒、約4.58fps。短尺化と出力frame数は正常。
- render-ahead 2は13.1秒で改善なし。native direct encodeはrender-ahead 2でdecoded slot generation競合、render-ahead 1では成功するが31.4秒、約1.91fpsまで悪化した。
- 次の本命は、動画1本+静的図形/画像+音声をffmpeg filter fast pathへ載せ、frameごとのnative renderを回避すること。

## 2026-06-21 — 混在メディアexportの短尺E2Eを修正

### 実施内容
- Red: 実Electron動画export E2Eに、混在メディア追加後の全オブジェクト短尺化hookと期待フレーム数照合の契約を追加した。
- Green: `?videoExportE2e=1` 専用の `__UXFD_VIDEO_EXPORT_E2E_SET_ALL_OBJECT_DURATIONS__` を追加し、動画・図形・画像・音声をまとめて指定durationへ短尺化できるようにした。
- Green: `scripts/run-video-export-e2e.mjs` が混在メディア投入後に短尺化hookを呼び、`expectedFrameCount` / `frameCountMatchesDuration` / `mixedMediaDurationResult` を結果JSONへ記録するようにした。
- Green: export E2Eの合格条件に、完了dialogと出力ファイルだけでなく期待フレーム数一致を含めた。

### 検証
- `npm test -- --run src/utils/packageScripts.test.ts`
- `node --check scripts/run-video-export-e2e.mjs`
- `npx tsc --noEmit 2>&1 | rg "src/main.tsx|src/utils/packageScripts|run-video-export-e2e"`
- `UXFD_VIDEO_EXPORT_E2E_ADD_MIXED_MEDIA=1 UXFD_VIDEO_EXPORT_E2E_DURATION_SECONDS=1 UXFD_VIDEO_EXPORT_E2E_TIMEOUT_MS=240000 npm run test:video-export:e2e`

### 結果・残課題
- 混在メディア入り実Electron exportで `expectedFrameCount=60` / `exportedFrameCount=60` / `frameCountMatchesDuration=true` を確認した。
- 以前の1秒指定なのに300frame出力される課題は解消した。
- ただし混在native render exportは1秒60frameで12.6秒、約4.76fps。次はframe source待ちと画像・図形合成経路の高速化が対象。

## 2026-06-20 — リサイズ比率ロックとpreview診断表示を整理

### 実施内容
- Red: 角ハンドルのリサイズがデフォルトで縦横比を維持し、明示的に解除した時だけ自由変形できる契約を追加した。
- Red: PropertyPanelのScale編集がデフォルトで `scaleX` / `scaleY` を連動し、比率固定を解除できる契約を追加した。
- Red: shared renderer previewがreadyでexternal video source描画できている時、非致命的なupload診断をキャンバス上に出さない契約を追加した。
- Green: `computeResize` に `lockAspectRatio` を追加し、省略時は縦横比固定、Shiftリサイズ時だけ自由変形にした。
- Green: `buildAspectLockedScalePatch` を追加し、右パネルのScale X/Y入力をデフォルト連動にした。UIには `比率を固定` チェックを追加した。
- Green: `buildSharedRendererPreviewDiagnostic` をexportし、ready/external-video-source/videoFrameUploadReadyの非ブロッキング診断は非表示にした。
- 版を `0.1.1-Beta-232a` に更新した。

### 検証
- `npm test -- --run src/utils/transformGeometry.test.ts src/utils/aspectRatioScale.test.ts src/components/ViewportDiagnostics.test.ts src/components/PropertyPanelBoundary.test.ts`
- `npx tsc --noEmit 2>&1 | rg "src/utils/transformGeometry|src/utils/aspectRatioScale|src/hooks/usePixiInteraction|src/components/Viewport|src/components/PropertyPanel"`
- `UXFD_VIDEO_LOAD_E2E_VIDEO_PATH=/Volumes/ExtendSSD-W/GX020052.MP4 UXFD_VIDEO_LOAD_E2E_EXPECT_EXTERNAL_TEXTURE=1 UXFD_VIDEO_LOAD_E2E_TIMEOUT_MS=240000 npm run test:video-load:e2e`

### 結果・残課題
- 実ウィンドウE2EでGoPro素材を読み込み、PropertyPanelに `比率` / `比率を固定` が表示されることを確認した。
- E2E結果は `blockingDiagnostics: []`、`videoPresentationSource=external-video-source`、`videoFrameUploadReady=true`、`externalTextureSampleCount=21/21`。
- 通常ready状態では `Rust shared renderer preview / ...` の警告文がbodyに出ないことを確認した。blocked/fallback時の診断表示は維持している。
- 次はGPU fast path検証として、full-frame単一動画で `scale_vt` / VideoToolbox option を比較する。

## 2026-06-20 — export速度/品質/容量presetをdirect transcodeへ追加

### 実施内容
- Red: `compact` / `speed` / `balanced` / `quality` のencode preset契約を追加し、`balanced` は従来相当の 8000kbps とした。
- Red: production export hookがdirect transcode payloadへ速度/品質/容量設定を渡す契約を追加した。
- Red: Rust backend `encode.transcodeVideo` が `qualityPreset` と `videoBitrateKbps` を受け取り、実際の `encodeSettings` を結果へ返す契約を追加した。
- Green: `resolveVideoExportEncodeSettings` を追加し、presetと任意bitrateを解決できるようにした。
- Green: direct transcodeの固定 `8000k` を廃止し、presetまたは `videoBitrateKbps` でbitrateを指定できるようにした。
- Green: 品質比較scriptをpreset matrix対応にし、presetごとにE2E用Vite/debug port/profileを分離して実ウィンドウ測定を安定化した。
- 版を `0.1.1-Beta-231a` に更新した。

### 検証
- `npm test -- --run src/utils/videoExportEncodeSettings.test.ts src/utils/useProjectExportBoundary.test.ts src/utils/videoExportQualityScript.test.ts src/utils/packageScripts.test.ts`
- `node --check scripts/compare-video-export-quality.mjs && node --check scripts/run-video-export-e2e.mjs`
- `cargo test --manifest-path rust-backend/Cargo.toml --test decode_control_plane encode_transcode_video_accepts_speed_quality_size_settings -- --nocapture`
- `UXFD_VIDEO_EXPORT_QUALITY_VIDEO_PATH=/Volumes/ExtendSSD-W/GX020052.MP4 UXFD_VIDEO_EXPORT_QUALITY_DURATION_SECONDS=2 UXFD_VIDEO_EXPORT_QUALITY_PRESET_MATRIX=compact,speed,balanced,quality UXFD_VIDEO_EXPORT_QUALITY_VIDEO_PATCH_JSON='{"x":0,"y":0,"scaleX":3,"scaleY":3}' npm run test:video-export:quality`

### 結果・残課題
- 2秒/120frame/1920x1080/full-frame条件で、`compact`: 約57.58fps、1.06MiB、SSIM 0.949733、VMAF 75.097736。
- 同条件で、`speed`: 約58.59fps、1.55MiB、SSIM 0.957324、VMAF 81.052262。
- 同条件で、`balanced`: 約58.57fps、2.06MiB、SSIM 0.961878、VMAF 84.525010。
- 同条件で、`quality`: 約58.74fps、3.53MiB、SSIM 0.970268、VMAF 89.970077。品質gateを通過した。
- 今回の測定ではbitrateを上げても短尺2秒では速度低下がほぼなく、容量と品質だけが素直に上がった。次はこのpresetをExport UIに露出し、`quality` を初期候補、`speed` / `compact` を軽量出力用に選べるようにする。

## 2026-06-20 — video export品質比較をPSNR/SSIM/VMAFで検証

### 実施内容
- Red: video export品質比較scriptの契約を追加し、direct transcodeと同じ配置geometryで参照映像を作る期待を固定した。
- Red: `package.json` に `test:video-export:quality` があり、E2E export後にPSNR/SSIM/VMAFと `quality-report.json` を生成する契約を追加した。
- Green: `scripts/compare-video-export-quality.mjs` を追加し、Electron実ウィンドウE2Eで書き出したMP4を、原本から同一配置へ変換したreference映像と比較するようにした。
- Green: `scripts/run-video-export-e2e.mjs` とE2E用window hookにvideo object geometry取得を追加し、品質比較側がTL上の `x/y/scaleX/scaleY` を使えるようにした。
- Green: 比較結果として `.codex/video-export-quality/quality-report.json`、`psnr.log`、`ssim.log`、`vmaf.json` を出力するようにした。
- 版を `0.1.1-Beta-230a` に更新した。

### 検証
- `npm test -- --run src/utils/videoExportQualityScript.test.ts src/utils/packageScripts.test.ts`
- `node --check scripts/compare-video-export-quality.mjs && node --check scripts/run-video-export-e2e.mjs`
- `UXFD_VIDEO_EXPORT_QUALITY_VIDEO_PATH=/Volumes/ExtendSSD-W/GX020052.MP4 UXFD_VIDEO_EXPORT_QUALITY_DURATION_SECONDS=5 npm run test:video-export:quality`
- `UXFD_VIDEO_EXPORT_QUALITY_VIDEO_PATH=/Volumes/ExtendSSD-W/GX020052.MP4 UXFD_VIDEO_EXPORT_QUALITY_DURATION_SECONDS=5 UXFD_VIDEO_EXPORT_QUALITY_VIDEO_PATCH_JSON='{"x":0,"y":0,"scaleX":3,"scaleY":3}' npm run test:video-export:quality`

### 結果・残課題
- 通常配置 `640x360 centred`: exportは4607ms / 約65.12fps。PSNR average 51.073674、PSNR min 50.120192、SSIM All 0.997877、VMAF mean 94.789002で品質gateを通過した。
- フル画面寄せ `1920x1080`: exportは4089ms / 約73.37fps。PSNR average 38.500467、PSNR min 36.711483、SSIM All 0.960762、VMAF mean 83.878676で、速度は高いがSSIM/VMAFが閾値未満になった。
- 現在の高速direct transcodeは、縮小表示ではかなり良好だが、原本4KをフルHD全画面へ落とす条件では品質劣化が検出される。次はencoder preset/CRF/scale filterの比較matrixを作り、60fpsを維持しながらSSIM 0.97 / VMAF 85以上へ戻せる設定を探す。

## 2026-06-20 — direct transcodeの実percent進捗をUIへ表示

### 実施内容
- Red: Rust backendの `encode.transcodeVideo` がprogress eventを出し、`sessionId` / `completedFrames` / `totalFrames` / `percent` を含める契約を追加した。
- Red: Electron/renderer IPCに direct transcode progress 専用チャンネルを追加し、`useProjectExport` が同一 `sessionId` のeventだけをprogressへ反映する契約を追加した。
- Red: `ExportProgressModal` がtranscoding中もRust進捗eventから `フレーム x / total` と `進捗 n%` を表示する契約へ変更した。
- Green: Rust backendでffmpegを `-progress pipe:1` 付きで起動し、`frame` / `out_time_ms` / `progress` を読んでJSON eventとしてstdoutへ流すようにした。
- Green: Electron mainが `id` を持たないRust backend eventを通常RPC responseから分離し、`rust-backend-encode-transcode-video-progress` でrendererへ転送するようにした。
- Green: preloadに `window.rustVideoEncoder.onTranscodeProgress` を追加し、unsubscribe可能な購読APIにした。
- Green: direct transcode payloadへ `sessionId` を渡し、progress eventで `currentFrame` / `totalFrames` を更新するようにした。
- 版を `0.1.1-Beta-229e` に更新した。

### 検証
- `npm test -- --run src/components/ExportProgressModal.test.ts src/utils/useProjectExportBoundary.test.ts src/utils/rustVideoEncodeIpcChannels.test.ts src/utils/rustBackendVideoEncodeControl.test.ts src/utils/rustVideoEncodeBackendBridge.test.ts`
- `cargo fmt --manifest-path rust-backend/Cargo.toml && cargo test --manifest-path rust-backend/Cargo.toml --test decode_control_plane encode_transcode_video -- --nocapture`
- `npx tsc --noEmit 2>&1 | rg "electron/main|electron/preload|rustVideoEncodeIpc|src/components/ExportProgressModal|src/hooks/useProjectExport|src/store/useStore|src/vite-env|rustBackendVideoEncodeControl"`
- `UXFD_VIDEO_EXPORT_E2E_VIDEO_PATH=/Volumes/ExtendSSD-W/GX020052.MP4 UXFD_VIDEO_EXPORT_E2E_DURATION_SECONDS=5 npm run test:video-export:e2e`

### 結果・残課題
- E2Eの `progressSamples` で `フレーム 155 / 300進捗 52%経過 4.5 秒` のようにpercentが段階的に更新されることを確認した。
- 5秒300frameのdirect transcodeは8749ms / 約34.29fpsで完了した。progress event追加後の単発計測なので、次に速度を見るときは複数回平均で確認する。
- `npx tsc --noEmit` は今回触った範囲に追加エラーなし。ただし既存の `src/utils/rustBackendVideoEncodeControl.test.ts` native frame payload型エラーは残っている。

## 2026-06-20 — direct transcode中の進捗UIを正直な表示へ修正

### 実施内容
- Red: direct transcode中は確定%を偽装せず、不確定バーのまま処理対象フレーム数と経過時間を表示する契約を追加した。
- Red: `useProjectExport` がdirect transcode開始時刻をprogress payloadへ入れる契約を追加した。
- Green: `ExportProgressModal` に `getExportProgressPresentation` を追加し、rendering/savingは従来通り確定progress、transcodingは `処理対象 N フレーム` と `経過 N 秒` を表示するようにした。
- Green: direct transcode開始時に `startedAtMs` と `Rust export: direct video transcode running` をprogressへ保存するようにした。
- Green: `exportPhaseTranscoding` の文言を `高速動画を書き出し中...` へ変更し、中間ファイル生成に見える誤解を避けた。
- Green: Electron動画export E2Eへ進捗モーダルテキストのサンプリングを追加した。
- 版を `0.1.1-Beta-229d` に更新した。

### 検証
- `npm test -- --run src/components/ExportProgressModal.test.ts src/utils/useProjectExportBoundary.test.ts src/store/exportProgress.test.ts`
- `node --check scripts/run-video-export-e2e.mjs`
- `npx tsc --noEmit 2>&1 | rg "src/components/ExportProgressModal|src/hooks/useProjectExport|src/store/useStore|src/i18n|src/utils/useProjectExportBoundary"`
- `UXFD_VIDEO_EXPORT_E2E_VIDEO_PATH=/Volumes/ExtendSSD-W/GX020052.MP4 UXFD_VIDEO_EXPORT_E2E_DURATION_SECONDS=5 npm run test:video-export:e2e`

### 結果・残課題
- 外付けSSDのGoPro MP4 export中に、E2Eの `progressSamples` で `書き出し中...高速動画を書き出し中...Rust export: direct video transcode running処理対象 300 フレーム経過 0.0 秒...` から `経過 5.5 秒` まで更新されることを確認した。
- 5秒300frameのdirect transcodeは6214ms / 約48.28fpsで完了した。
- 現時点ではRust backendからffmpegの実progress eventをstreamしていないため、transcoding中のバーは不確定表示。次により正確な%が必要なら、Rust側で `ffmpeg -progress pipe` を読んでcontrol eventとしてrendererへ流す。

## 2026-06-20 — direct transcodeをはみ出し配置とE2E変形測定へ拡張

### 実施内容
- Red: direct transcode fast pathが、拡大した動画の一部が出力フレーム外にはみ出す配置を受け入れる契約を追加した。
- Red: 完全に出力フレーム外へ出た動画はfast path対象外にする契約を追加した。
- Green: `resolveProjectExportVideoTranscodeFastPath` の配置判定を「出力フレーム内に収まる」から「出力フレームと交差する」へ変更した。
- Green: Rust `encode.transcodeVideo` のfilterを `scale -> pad -> crop -> fps` に変更し、負の座標・右下方向のはみ出し・拡大クロップをdirect transcodeで処理できるようにした。
- Green: Electron動画export E2Eへ `UXFD_VIDEO_EXPORT_E2E_VIDEO_PATCH_JSON` を追加し、読み込み後のvideo objectへ `x/y/scaleX/scaleY` などを当てて実ウィンドウ測定できるようにした。
- 版を `0.1.1-Beta-229c` に更新した。

### 検証
- `npm test -- --run src/utils/projectExportVideoTranscodeFastPath.test.ts src/utils/rustBackendVideoEncodeControl.test.ts`
- `cargo fmt --manifest-path rust-backend/Cargo.toml && cargo test --manifest-path rust-backend/Cargo.toml --test decode_control_plane encode_transcode_video -- --nocapture`
- `node --check scripts/run-video-export-e2e.mjs`
- `npx tsc --noEmit 2>&1 | rg "src/main\\.tsx|projectExportVideoTranscodeFastPath|rustBackendVideoEncodeControl|run-video-export-e2e"`
- `UXFD_VIDEO_EXPORT_E2E_VIDEO_PATH=/Volumes/ExtendSSD-W/GX020052.MP4 UXFD_VIDEO_EXPORT_E2E_DURATION_SECONDS=5 npm run test:video-export:e2e`
- `UXFD_VIDEO_EXPORT_E2E_VIDEO_PATH=/Volumes/ExtendSSD-W/GX020052.MP4 UXFD_VIDEO_EXPORT_E2E_DURATION_SECONDS=5 UXFD_VIDEO_EXPORT_E2E_VIDEO_PATCH_JSON='{"x":100,"y":80,"scaleX":0.5,"scaleY":0.5}' npm run test:video-export:e2e`
- `UXFD_VIDEO_EXPORT_E2E_VIDEO_PATH=/Volumes/ExtendSSD-W/GX020052.MP4 UXFD_VIDEO_EXPORT_E2E_DURATION_SECONDS=5 UXFD_VIDEO_EXPORT_E2E_VIDEO_PATCH_JSON='{"x":-240,"y":-120,"scaleX":1.5,"scaleY":1.5}' npm run test:video-export:e2e`
- `UXFD_VIDEO_EXPORT_E2E_VIDEO_PATH=/Volumes/ExtendSSD-W/GX020052.MP4 UXFD_VIDEO_EXPORT_E2E_DURATION_SECONDS=5 UXFD_VIDEO_EXPORT_E2E_VIDEO_PATCH_JSON='{"x":1700,"y":900,"scaleX":0.5,"scaleY":0.5}' npm run test:video-export:e2e`
- `ffprobe -v error -show_entries stream=index,codec_type,codec_name,width,height,avg_frame_rate -of json .codex/video-export-e2e/video-export-e2e-output.mp4`

### 結果・残課題
- 通常配置: 5秒300frameを5071msでexport、約59.16fps。
- 縮小端寄せ `x=100,y=80,scale=0.5`: 5秒300frameを6132msでexport、約48.92fps。
- 拡大左上クロップ `x=-240,y=-120,scale=1.5`: 5秒300frameを5105msでexport、約58.77fps。
- 右下はみ出し `x=1700,y=900,scale=0.5`: 5秒300frameを5108msでexport、約58.73fps。
- ffprobeで出力は1920x1080/60fps H.264 + AAC音声であることを確認した。
- `npx tsc --noEmit` は今回触った範囲に追加エラーなし。ただし既存の `src/utils/rustBackendVideoEncodeControl.test.ts` 型エラーは残っている。
- direct transcodeは引き続き単一動画が対象。図形・画像・複数object・rotation・opacity・filterありは合成経路の高速化が別途必要。

## 2026-06-20 — direct transcodeのresizeとsource音声を修正

### 実施内容
- Red: direct transcode fast pathが `scaleX/scaleY` によるリサイズを正確な出力矩形として受け入れる契約を追加した。
- Red: direct transcodeでsource動画の音声を保持する契約を追加した。
- Green: `resolveProjectExportVideoTranscodeFastPath` が `width * scaleX` / `height * scaleY` を矩形サイズとして返すようにした。
- Green: Rust `encode.transcodeVideo` のvideo filterをアスペクト維持scaleではなく指定矩形へのexact scaleに変更し、リサイズ結果とexportを揃えた。
- Green: direct transcodeで `includeAudio` がtrueのとき、source動画の `0:a:0?` をAACとして出力へmapするようにした。ミュート時は音声を落とす。
- 版を `0.1.1-Beta-229b` に更新した。

### 検証
- `npm test -- --run src/utils/projectExportVideoTranscodeFastPath.test.ts src/utils/rustVideoEncodeBackendBridge.test.ts src/utils/rustVideoEncodeIpcChannels.test.ts src/utils/rustBackendVideoEncodeControl.test.ts`
- `cargo test --manifest-path rust-backend/Cargo.toml --test decode_control_plane encode_transcode_video -- --nocapture`
- `UXFD_VIDEO_EXPORT_E2E_VIDEO_PATH=/Volumes/ExtendSSD-W/GX020052.MP4 UXFD_VIDEO_EXPORT_E2E_DURATION_SECONDS=5 npm run test:video-export:e2e`
- `ffprobe -v error -select_streams a -show_entries stream=codec_type,codec_name -of json .codex/video-export-e2e/video-export-e2e-output.mp4`

### 結果・残課題
- 5秒300frame E2Eは `Rust backend direct transcode` で 4581ms / 約65.49fps。
- ffprobeで出力MP4にAAC audio streamが入ることを確認した。
- direct transcodeは回転、opacity、filter、複数objectなど合成が必要なケースでは従来経路へ戻る。次は図形・画像をffmpeg filter graphへ載せるか、GPU合成側の高速化へ進む。

## 2026-06-20 — 単一動画exportをdirect transcode fast pathへ接続

### 実施内容
- Red: Rust backendに `encode.transcodeVideo` の契約を追加し、単一動画をframe IPCなしでMP4へ書き出す期待を固定した。
- Red: Electron/renderer bridgeに `rust-backend-encode-transcode-video` と `encode.transcodeVideo` のルーティング契約を追加した。
- Green: Rust backendでffmpeg direct transcodeを実装し、`scale -> pad -> fps` filterで単一動画の矩形配置を保持するようにした。
- Green: `resolveProjectExportVideoTranscodeFastPath` を追加し、単一動画・変形なし・フィルタなし・画面内配置のときだけfast pathへ入るようにした。
- Green: `useProjectExport` から単一動画fast pathを呼び、通常のRGBA frame生成/IPC/writeFrameループをスキップするようにした。
- 実測でCPU simple direct encodeは `/Volumes/ExtendSSD-W/GX020052.MP4` 1秒尺が約3.47fpsまで悪化したため、JS側の自動投入はやめて明示フラグ配下に戻した。
- 版を `0.1.1-Beta-229a` に更新した。

### 検証
- `cargo test --manifest-path rust-backend/Cargo.toml --test decode_control_plane encode_transcode_video_writes_single_source_output_without_frame_ipc -- --nocapture`
- `cargo test --manifest-path rust-backend/Cargo.toml --test decode_control_plane native_render -- --nocapture`
- `npm test -- --run src/utils/projectExportVideoTranscodeFastPath.test.ts src/utils/rustVideoEncodeBackendBridge.test.ts src/utils/rustVideoEncodeIpcChannels.test.ts src/utils/rustBackendVideoEncodeControl.test.ts src/utils/rustBackendVideoEncodeExport.test.ts src/utils/sharedRendererExportFrameSource.test.ts`
- CLI ffmpeg同等filter: `/Volumes/ExtendSSD-W/GX020052.MP4` 5秒300frameを3.558秒で処理。
- Electron E2E: `UXFD_VIDEO_EXPORT_E2E_VIDEO_PATH=/Volumes/ExtendSSD-W/GX020052.MP4 UXFD_VIDEO_EXPORT_E2E_DURATION_SECONDS=5 npm run test:video-export:e2e`
- Electron E2E: `UXFD_VIDEO_EXPORT_E2E_VIDEO_PATH=/Volumes/ExtendSSD-W/GX020052.MP4 UXFD_VIDEO_EXPORT_E2E_DURATION_SECONDS=10 npm run test:video-export:e2e`

### 結果・残課題
- 5秒300frame E2Eは `Rust backend direct transcode` で 5186ms / 約57.85fps。
- 10秒600frame E2Eは `Rust backend direct transcode` で 9137ms / 約65.67fps。短尺初期化込みでもリアルタイム60fpsを超えた。
- direct transcode fast pathは単一動画のみ。図形・画像・PSD・複数動画・フィルタありでは従来のRust frame exportへ戻る。
- 次は「単一動画 + 音声」「動画 + 軽い図形/画像」の合成をGPU/ffmpeg filter graph側へ寄せ、RGBA frame IPCを通るケースを減らす。

## 2026-06-20 — external動画sourceの再生中seekを抑制

### 実施内容
- Red: external video sourceが再生中かつtimeline targetに近い場合、毎tick `currentTime` を書き換えない契約を追加した。
- Red: external video source同期stateへseek回数、抑制seek回数、driftを蓄積する契約を追加した。
- Green: `syncSharedRendererExternalVideoPlayback` を追加し、再生開始時または大きなdrift時だけseekし、停止中は正確にseekするようにした。
- Green: Viewportのexternal texture preview同期を `seekTo/play/pause` 直呼びから同期helper経由へ変更した。
- Green: E2E結果へ `externalVideoSeekCount` / `externalVideoSuppressedSeekCount` / `externalVideoMaxAbsDriftMs` を出すようにした。
- Green: Viteの `mp4box` 解決を実体の `.mjs` へ向け、E2E中のdep-scan errorを解消した。
- 変更前E2E baselineは `/Volumes/ExtendSSD-W/GX020052.MP4` で `uniquePresentedFrameCount=15`、`presentedFrameSpan=305`、`blockedSampleCount=0`、`externalTextureSampleCount=21/21` だった。
- 変更後E2Eは `uniquePresentedFrameCount=16`、`presentedFrameSpan=335`、`blockedSampleCount=0`、`externalTextureSampleCount=21/21`、`externalVideoSeekCount=5`、`externalVideoSuppressedSeekCount=36`、pixel delta OKだった。
- 版を `0.1.1-Beta-223c` に更新した。

### 検証
- `npm test -- sharedRendererExternalVideoSource viewportRustVideoOnlyBoundary sharedRendererViewportPresenterOrchestration sharedRendererPreviewPresenterController`
- `npm test -- productionVideoDependencyBoundary`
- `npx tsc --noEmit 2>&1 | rg "src/components/Viewport\\.tsx|src/utils/sharedRendererExternalVideoSource|src/utils/viewportRustVideoOnlyBoundary|src/utils/sharedRendererViewportPresenterOrchestration|src/utils/sharedRendererPreviewPresenterController"`
- `node --check scripts/run-video-load-e2e.mjs`
- `UXFD_VIDEO_LOAD_E2E_VIDEO_PATH=/Volumes/ExtendSSD-W/GX020052.MP4 UXFD_VIDEO_LOAD_E2E_EXPECT_EXTERNAL_TEXTURE=1 UXFD_VIDEO_LOAD_E2E_TIMEOUT_MS=240000 npm run test:video-load:e2e`

### 結果・残課題
- 再生中の高頻度seekを避け、ブラウザ/Electronの動画decoderが連続再生しやすい状態にした。
- 単発E2E比較では `unique +1`、`span +30`、`blocked ±0` で、少なくともこの条件では性能低下ではなく改善寄りだった。
- 残りはpresenter再起動回数そのものを減らすことと、`requestVideoFrameCallback` 相当の動画frame駆動presentへ進むこと。

## 2026-06-20 — 再生成される作業ファイルをignoreへ整理

### 実施内容
- `.codex/` と `dist-electron/` を `.gitignore` に追加した。
- 既に追跡されていた `.DS_Store`、`dist-electron/main.js`、`dist-electron/preload.js` をindexから外し、以後の開発・E2E実行で生成差分として残らないようにした。

### 検証
- `git check-ignore .codex dist-electron/main.js dist-electron/preload.js .DS_Store`

### 結果・残課題
- 反復コミット時に残っていた生成物・ローカル作業物のノイズをGit差分から除外した。

## 2026-06-20 — export前にexternal動画sourceを破棄

### 実施内容
- Red: shared renderer previewのexternal video sourceがexport開始時に残留しない契約を追加した。
- Green: `isExporting` 中はexternal video source mapを作らず、既存のclip sourceを明示的にdisposeしてからpresenterを起動するようにした。
- サブエージェントの軽量レビューで指摘された「export開始時に裏でvideo要素が残る可能性」を潰した。
- 版を `0.1.1-Beta-222c` に更新した。

### 検証
- `npm test -- viewportRustVideoOnlyBoundary sharedRendererViewportPresenterOrchestration sharedRendererPreviewPresenterController`
- `npx tsc --noEmit 2>&1 | rg "src/components/Viewport\\.tsx|src/utils/viewportRustVideoOnlyBoundary|src/utils/sharedRendererViewportPresenterOrchestration|src/utils/sharedRendererPreviewPresenterController"`

### 結果・残課題
- preview再生中にexportへ入っても、external texture用の動画sourceが裏で残り続けないようになった。
- 残りはplay失敗やcodec非対応時のdiagnosticをより細かく出すこと。

## 2026-06-20 — external texture preview診断をE2Eへ接続

### 実施内容
- Red: external video sourceをpresentした時、presenter datasetへ `videoPresentationSource=external-video-source` とpresent済みsource frameを出す契約を追加した。
- Green: shared renderer presenter diagnosticsへ `videoPresentationSource` を追加し、external source / Rust decoded RGBA / native render frameのどの経路で描画したかを記録するようにした。
- Green: Electron実ウィンドウ動画E2Eへ `UXFD_VIDEO_LOAD_E2E_EXPECT_EXTERNAL_TEXTURE=1` を追加し、4K fast path確認時だけexternal texture sampleを必須にできるようにした。
- 版を `0.1.1-Beta-222b` に更新した。

### 検証
- `npm test -- sharedRendererPresenterDiagnostics sharedRendererPreviewPresenterController`
- `npx tsc --noEmit 2>&1 | rg "src/utils/sharedRendererPresenterDiagnostics|src/utils/sharedRendererPreviewPresenterController|scripts/run-video-load-e2e"`
- `node --check scripts/run-video-load-e2e.mjs`

### 結果・残課題
- 4K原本previewが低コピーexternal texture経路に乗っているかを、E2EのJSON結果とdatasetから確認できるようになった。
- `/Volumes/ExtendSSD-W/GX020052.MP4` を `UXFD_VIDEO_LOAD_E2E_EXPECT_EXTERNAL_TEXTURE=1` で投入し、Electron実ウィンドウE2Eがpassした。
- E2E結果は `videoPresentationSource=external-video-source`、`externalTextureSampleCount=21/21`、`blockedSampleCount=0`、`uniquePresentedFrameCount=16`、`presentedFrameSpan=310`、pixel delta OKだった。
- 残りはこのfast pathを実UI操作でも継続確認し、proxy/Rust decoded RGBA側の旧preview経路をどこまで削るか決めること。

## 2026-06-20 — Viewportでexternal動画sourceをshared rendererへ同期

### 実施内容
- Red: Viewport本体がisolated external video source providerを使い、presenter orchestrationへsource mapを渡す境界契約を追加した。
- Green: Viewportでclipごとのexternal video source lifecycleを保持し、`source_frame` / `source_rate` から再生時刻へseek同期して、再生中はplay、停止中はpauseするようにした。
- Green: 4K原本previewを検証しやすくするため、動画objectに `filePath` がある場合はproxy由来のmedia sourceより原本pathを優先してexternal textureへ渡すようにした。
- 版を `0.1.1-Beta-222a` に更新した。

### 検証
- `npm test -- viewportRustVideoOnlyBoundary sharedRendererViewportPresenterOrchestration sharedRendererPreviewPresenterController sharedRendererExternalVideoSource`
- `npx tsc --noEmit 2>&1 | rg "src/components/Viewport\\.tsx|src/utils/viewportRustVideoOnlyBoundary|src/utils/sharedRendererViewportPresenterOrchestration|src/utils/sharedRendererPreviewPresenterController|src/utils/sharedRendererExternalVideoSource"`

### 結果・残課題
- WebGPU `texture_external` presenterからViewport起動まで、原本動画sourceをshared renderer previewへ渡す低コピーfast pathがつながった。
- 残りはGoPro 4K原本 `/Volumes/ExtendSSD-W/GX020052.MP4` をElectron実ウィンドウE2Eで投入し、diagnosticsとpixel/frame進行で滑らかさを確認すること。

## 2026-06-20 — external動画sourceをviewport orchestrationへ接続

### 実施内容
- Red: viewport presenter orchestrationがexternal video source mapをpreview presenterへ渡す契約を追加した。
- Green: `startSharedRendererViewportPresenter` に `sharedRendererExternalVideoSourcesByClipId` を追加し、start presenter入力へそのまま渡すようにした。
- 版を `0.1.1-Beta-221a` に更新した。

### 検証
- `npm test -- sharedRendererViewportPresenterOrchestration sharedRendererPreviewPresenterController`
- `npx tsc --noEmit 2>&1 | rg "src/utils/sharedRendererViewportPresenterOrchestration|src/utils/sharedRendererPreviewPresenterController"`

### 結果・残課題
- Viewport orchestration層までexternal texture fast pathのsource mapを通せるようになった。
- 残りはViewport本体でclipごとのsource lifecycleとplayback時刻同期を実装し、実ウィンドウE2Eへ接続すること。

## 2026-06-20 — external動画sourceをpreview presenterへ接続

### 実施内容
- Red: `startSharedRendererPreviewPresenter` にexternal video source mapを渡すと、Rust RGBA uploadではなくexternal texture presentationを使う契約を追加した。
- Green: external video sourceが存在するclipを、shared renderer ownership判定上のready sourceとして扱うようにした。
- Green: external sourceがreadyな動画previewでは `presentExternalVideoFrameScene` を呼び、`uploadVideoFrameTexture` / `writeTexture` に進まないようにした。
- 版を `0.1.1-Beta-220a` に更新した。

### 検証
- `npm test -- sharedRendererPreviewPresenterController`
- `npx tsc --noEmit 2>&1 | rg "src/utils/sharedRendererPreviewPresenterController|src/utils/sharedRendererPreviewPresenterController\\.test"`

### 結果・残課題
- presenter controllerまでは4K低コピーfast pathを通せるようになった。
- 次はViewportがtimeline動画clipごとに `sharedRendererExternalVideoSource` を保持し、再生時刻へseek/play同期してorchestrationへ渡す。

## 2026-06-20 — external video source providerをshared renderer専用に隔離

### 実施内容
- Red: production video dependency境界へ、ブラウザ動画要素を作れる場所を `sharedRendererExternalVideoSource.ts` だけに限定する契約を追加した。
- Green: `sharedRendererExternalVideoSource` を追加し、presenter-owned external video sourceの作成・seek/play/pause/disposeとmetadata取得を集約した。
- Green: `mediaMetadata.ts` の動画metadata fallbackも新providerへ委譲し、metadata module内の直接 `document.createElement('video')` を削除した。
- 版を `0.1.1-Beta-219p` に更新した。

### 検証
- `npm test -- sharedRendererExternalVideoSource mediaMetadata productionVideoDependencyBoundary`
- `npx tsc --noEmit 2>&1 | rg "src/utils/sharedRendererExternalVideoSource|src/utils/mediaMetadata|src/utils/productionVideoDependencyBoundary"`

### 結果・残課題
- 低コピーpreview用のbrowser video sourceは、Pixi fallbackではなくshared renderer presenter専用providerとして隔離できた。
- 次はこのproviderをViewportのshared renderer orchestrationへ接続し、GoPro 4K原本をproxyなしで `importExternalTexture` 描画するE2Eを追加する。

## 2026-06-20 — 4K低コピーpreviewへ向けたexternal texture presenterを追加

### 実施内容
- Red: WebGPU presenterに、外部動画sourceを `importExternalTexture` で描画し、Rust decoded RGBAの `writeTexture` 経路を使わない契約を追加した。
- Green: `presentExternalVideoFrameScene` を追加し、`texture_external` / `textureSampleBaseClampToEdge` 専用WGSLで動画planeを描けるようにした。
- Green: 既存のRust decoded RGBA upload経路は残し、4K原本preview向けの低コピーfast pathを別メソッドとして並走できる形にした。
- 版を `0.1.1-Beta-219o` に更新した。

### 検証
- `npm test -- sharedRendererWebGpuPresenter`
- `npx tsc --noEmit 2>&1 | rg "src/utils/sharedRendererWebGpuPresenter|src/utils/sharedRendererWebGpuPresenter\\.test|src/utils/productionVideoDependencyBoundary|src/utils/viewportRustVideoOnlyBoundary"`

### 結果・残課題
- presenter単体では、外部動画sourceを `importExternalTexture({ source })` し、RGBA byte uploadなしでWebGPU render passへ渡す契約が通った。
- `npm test -- sharedRendererWebGpuPresenter productionVideoDependencyBoundary viewportRustVideoOnlyBoundary` は、今回の変更とは別に `src/utils/mediaMetadata.ts` の既存HTMLVideoElement metadata fallback境界で失敗した。
- 次はWebGPU presenter専用の外部動画source providerを、Pixi/legacy HTMLVideoElement fallbackとは別gateとして設計し、実ウィンドウでGoPro 4K原本を直接再生するE2Eへ接続する。

## 2026-06-20 — 動画preview再生中のblocked点滅を抑制

### 実施内容
- Red: Electron実ウィンドウ動画E2Eへ、5秒間の再生サンプル中に `blocked/pixi` 診断が複数回混ざる場合は失敗する契約を追加した。
- Green: 再生中のshared renderer presenter更新では診断をscratch datasetへ一旦書き、成功時だけlive datasetへ反映するようにした。
- Green: 再生中または再生へ入る遷移では、前回成功したpresenter controlを新規presenter成功まで保持し、新規presenterが失敗したtickでは直前の成功フレームを維持するようにした。
- 版を `0.1.1-Beta-219n` に更新した。

### 検証
- `npm test -- sharedRendererPreviewPresenterController sharedRendererViewportPresenterOrchestration`
- `npx tsc --noEmit 2>&1 | rg "src/components/Viewport\\.tsx|scripts/run-video-load-e2e\\.mjs"`
- `UXFD_VIDEO_LOAD_E2E_VIDEO_PATH=/Volumes/ExtendSSD-W/GX020052.MP4 UXFD_VIDEO_LOAD_E2E_TIMEOUT_MS=180000 npm run test:video-load:e2e`

### 結果・残課題
- 外付けSSDのGoPro原本 `/Volumes/ExtendSSD-W/GX020052.MP4` で、5秒間の再生サンプルが `blockedSampleCount=0`、`uniquePresentedFrameCount=13`、`presentedFrameSpan=310` になったことを確認した。
- 現段階はproxy previewを滑らかに見せるための保持戦略。原本4Kの高fps直再生には、VideoToolbox/WebCodecs/AVFoundation相当のhardware decodeとGPU低copy経路が必要。

## 2026-06-20 — Rust動画previewの連続再生とproxy自動生成を追加

### 実施内容
- Red: Rust backendの `decode.requestFrame` が連続再生frameで同じffmpeg streamを再利用する契約を追加した。
- Green: `DecodeSession` にstreaming ffmpeg processを保持し、連続frameはstdoutから読み進め、シークや大きな飛びだけstreamを張り直すようにした。
- Red: Rust preview再生cadenceの契約を追加し、再生中は12fps / 320px decode / 6-slot ringで動かす設定を切り出した。
- Green: Viewportのpresenter起動を直列化し、起動中は最新ではなく最初のpending sessionを保持して、stream decodeが大ジャンプseekへ戻らないようにした。
- Red: preview proxyが存在しない場合に自動生成する契約を追加した。
- Green: 動画追加/ドロップ時に `.proxy.mp4` を検出し、なければ640px preview proxyを自動生成してRust preview sourceへ使うようにした。
- Green: Rust `proxy.generate` はpreview向けに640px既定、H.264、全Iフレーム、音声なしで生成するようにした。
- Green: WebGPU presenterのadapter/deviceを同一GPU objectごとに再利用し、frameごとの固定起動費を削減した。
- Electron実ウィンドウE2Eを、単発のピクセル変化だけでなく5秒間の複数present frameサンプルを確認する契約へ強化した。
- 版を `0.1.1-Beta-219m` に更新した。

### 検証
- `cargo test --manifest-path rust-backend/Cargo.toml decode_request_frame -- --nocapture`
- `npm test -- sharedRendererWebGpuPresenter sharedRendererPlaybackPreviewSettings sharedRendererViewportVideoUpload sharedRendererViewportPresenterOrchestration sharedRendererPreviewPresenterController proxyUtils`
- `npx tsc --noEmit 2>&1 | rg "(src/components/Viewport\\.tsx|src/utils/sharedRendererWebGpuPresenter|src/utils/sharedRendererPlaybackPreviewSettings|src/utils/sharedRendererViewportPresenterOrchestration|src/utils/proxyUtils|electron/main\\.ts|rust-backend/src/main\\.rs|scripts/run-video-load-e2e\\.mjs)"`
- `cargo build --manifest-path rust-backend/Cargo.toml`
- `rm -f /Volumes/ExtendSSD-W/GX020052.proxy.mp4 && UXFD_VIDEO_LOAD_E2E_VIDEO_PATH=/Volumes/ExtendSSD-W/GX020052.MP4 UXFD_VIDEO_LOAD_E2E_TIMEOUT_MS=600000 npm run test:video-load:e2e`
- `UXFD_VIDEO_LOAD_E2E_VIDEO_PATH=/Volumes/ExtendSSD-W/GX020052.MP4 UXFD_VIDEO_LOAD_E2E_TIMEOUT_MS=180000 npm run test:video-load:e2e`

### 結果・残課題
- 外付けSSDのGoPro原本 `/Volumes/ExtendSSD-W/GX020052.MP4` で、proxy未作成状態から自動生成、TL投入、Rust shared renderer preview再生、ピクセル変化、5秒間の複数frame presentまでE2Eで確認した。
- 生成後の `/Volumes/ExtendSSD-W/GX020052.proxy.mp4` は640x360 H.264、全3627frameがkeyframeであることを確認した。
- 現段階は「原本直decodeで滑らか」ではなく「preview proxy + Rust decode/uploadで連続再生できる」段階。完全な高fpsには、WebGPU presenterの永続化、texture差し替えAPI、または非同期decode queueの追加が必要。

## 2026-06-20 — Rust動画preview再生の暫定更新経路を追加

### 実施内容
- Red: Electron実ウィンドウ動画E2Eを、読込成功だけでなくPlay後に `source_frame` が進み、shared renderer surfaceの実ピクセルが変化することまで検証する契約へ拡張した。
- Red: GoPro原本では `sourceFrame` は進むが、present済みframeとcanvas pixelsが初回frameのままであることを再現した。
- Green: presenter診断へ `videoPresentedSourceFrame` / `videoPresentedFrameIndex` を追加し、E2Eが古いready診断ではなく実際にpresentされたframeを待てるようにした。
- Green: Rust backendの `decode.requestFrame` を `select=eq(n,...)` による先頭からのframe走査ではなく、`sourceRate` から算出した `-ss` seek + 1 frame decodeへ変更した。
- Green: 再生中のshared renderer previewは、decode完了前に次tickでキャンセルされないよう、0.5fps cadence・最大辺320pxの低解像度decodeへ切り替えた。停止/スクラブ時は従来の高めのdecode設定を使う。
- 版を `0.1.1-Beta-219l` に更新した。

### 検証
- `npm test -- sharedRendererViewportVideoUpload sharedRendererViewportPresenterOrchestration`
- `npm test -- sharedRendererPresenterDiagnostics sharedRendererPreviewPresenterController`
- `cargo test --manifest-path rust-backend/Cargo.toml decode_request_frame -- --nocapture`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererViewportVideoUpload|src/utils/sharedRendererViewportPresenterOrchestration|src/components/Viewport\\.tsx|rust-backend/src/main\\.rs|scripts/run-video-load-e2e\\.mjs)"`
- `UXFD_VIDEO_LOAD_E2E_VIDEO_PATH=/Volumes/ExtendSSD-W/GX020052.MP4 UXFD_VIDEO_LOAD_E2E_TIMEOUT_MS=180000 npm run test:video-load:e2e`

### 残課題・次のステップ
- 現状はspawn-per-frame ffmpeg decodeの制約内での暫定再生なので、GoPro原本は0.5fps程度の粗い更新になる。滑らかな再生にはpersistent decode session、proxy自動生成、または連続frame bufferが必要。
- E2Eでは `presentedSourceFrame=480`、`meanAbsoluteDelta=18.217`、`changedSampleRatio=0.5201` で、再生中に実ピクセルが変化することを確認した。

## 2026-06-20 — 外付けSSD動画の一時ファイルprobe fallbackを追加

### 実施内容
- Red: Electronが選択Fileの実パスを返せない場合でも、File本体を一時ファイル化してRust/ffprobeで動画metadataを解決する契約を追加した。
- Green: `materialise-media-file` IPCを追加し、rendererから渡されたFile bytesをOS temp配下の `uxfd-media-import/` に保存してRustが読めるfile pathを返すようにした。
- 動画追加/ドロップ時は `resolveVideoImportSource` を使い、直接path probeが失敗した場合だけ一時ファイル化probeへ進み、そのfile pathをTimeline objectへ保持するようにした。
- GoPro原本のようにブラウザmetadata取得が苦手な素材でも、Rust/ffprobe経路で読み込みを継続できるfallbackを追加した。
- 版を `0.1.1-Beta-219k` に更新した。

### 検証
- `npm test -- mediaMetadata`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/mediaMetadata|src/components/Timeline|src/hooks/useTimelineDrop|electron/main|src/vite-env\\.d\\.ts)"`
- `UXFD_VIDEO_LOAD_E2E_VIDEO_PATH=/Volumes/ExtendSSD-W/GX020052.MP4 UXFD_VIDEO_LOAD_E2E_TIMEOUT_MS=180000 npm run test:video-load:e2e`

### 残課題・次のステップ
- 通常E2Eでは `/Volumes/ExtendSSD-W/GX020052.MP4` の直接pathが取得できているため、一時ファイルfallbackは単体テストで契約確認した。実ウィンドウで外付けSSDだけpath/probeが落ちる場合の保険として機能する。
- 大容量素材を一時ファイル化するfallbackはメモリ/時間コストがあるため、直接pathが使える場合は従来通り直接Rustへ渡す。

## 2026-06-20 — decode.start冪等化とE2E診断強化

### 実施内容
- Red: Rust backendで同じ `jobId` の `decode.start` を再送した場合、`Decode session already active for jobId` で失敗せず既存sessionのstart responseを返す契約を追加した。
- Green: `handle_decode_start` で既存decode sessionを検出した場合、エラーではなく保存済み `DecodeStartResponse` を返すようにした。
- Electron実ウィンドウ動画読込E2Eで、WebGPU validation error、`Decode session already active for jobId`、`No active decode session`、shared renderer blocked診断を失敗条件として収集するようにした。
- 版を `0.1.1-Beta-219j` に更新した。

### 検証
- `cargo test --manifest-path rust-backend/Cargo.toml decode_start_reuses_active_session_for_same_job_id -- --nocapture`
- `UXFD_VIDEO_LOAD_E2E_VIDEO_PATH=/Volumes/ExtendSSD-W/GX020052.MP4 UXFD_VIDEO_LOAD_E2E_TIMEOUT_MS=180000 npm run test:video-load:e2e`

### 残課題・次のステップ
- 冷えた状態で1本投入するE2Eではユーザー報告のGPUDevice mismatchは再現しなかった。再発時はE2Eを「同一window内で複数回追加/削除/再読込するstress」へ拡張する。
- `npm run dev` の既存Electron windowが古いrenderer/Rust backendを掴んでいる場合があるため、確認時はElectron windowとdev serverを完全に閉じてから起動し直す。

## 2026-06-20 — 既存Rust decode sessionを再利用するpreview復旧を追加

### 実施内容
- Red: UI側active job記録が空でもRust backendに同じ `jobId` のdecode sessionが残っている場合、`decode.start` の `Decode session already active for jobId` を失敗扱いしない契約を追加した。
- Green: video upload経路とnative render source経路の `startDecodeJob` で、同じ `jobId` のalready-active応答を既存session再利用として扱い、そのまま `decode.requestFrame` へ進むようにした。
- `requiredVideoOwnershipUnavailable / video=startFailed / Decode session already active for jobId` でpreviewがblockedになる状態を復旧対象にした。
- 版を `0.1.1-Beta-219i` に更新した。

### 検証
- `npm test -- sharedRendererViewportVideoUpload sharedRendererViewportNativeRenderSource sharedRendererViewportPresenterOrchestration sharedRendererPreviewPresenterController`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererViewportVideoUpload\\.ts|src/utils/sharedRendererViewportVideoUpload\\.test\\.ts|src/utils/sharedRendererViewportNativeRenderSource\\.ts|src/utils/sharedRendererViewportNativeRenderSource\\.test\\.ts)"`
- `UXFD_VIDEO_LOAD_E2E_VIDEO_PATH=/Volumes/ExtendSSD-W/GX020052.MP4 UXFD_VIDEO_LOAD_E2E_TIMEOUT_MS=180000 npm run test:video-load:e2e`

### 残課題・次のステップ
- `jobId` はsource/解像度/fpsを含むため同一job扱いにできる。将来的にbackend側へ `decode.start` のidempotent成功レスポンスを追加すると、frontend側の特例をさらに薄くできる。

## 2026-06-20 — WebGPU presenterの古い起動競合を停止

### 実施内容
- Red: `dispose()` 後のWebGPU presenterがvideo render passを作らない契約を追加した。
- Red: Rust video upload完了後にviewport startがstaleになった場合、WebGPU presenter startへ進まない契約を追加した。
- Green: `isStartCurrent` をviewport orchestration、preview presenter controller、WebGPU presenterへ通し、WASM load / decode upload / GPU adapter/device取得後に古いstartを中断するようにした。
- Green: WebGPU presenterの `present*` / upload / readback / native handoff は、dispose済みまたはstaleになった後はcanvas/current textureへ触れないようにした。
- `presenterStartFailed` の詳細文字列を `swatch` ではなくdiagnostic detailへ出すようにし、診断型の不整合も修正した。
- 版を `0.1.1-Beta-219h` に更新した。

### 検証
- `npm test -- sharedRendererWebGpuPresenter sharedRendererViewportPresenterOrchestration sharedRendererPreviewPresenterController`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererWebGpuPresenter\\.ts|src/utils/sharedRendererWebGpuPresenter\\.test\\.ts|src/utils/sharedRendererViewportPresenterOrchestration\\.ts|src/utils/sharedRendererViewportPresenterOrchestration\\.test\\.ts|src/utils/sharedRendererPreviewPresenterController\\.ts|src/components/Viewport\\.tsx)"`
- `UXFD_VIDEO_LOAD_E2E_VIDEO_PATH=/Volumes/ExtendSSD-W/GX020052.MP4 UXFD_VIDEO_LOAD_E2E_TIMEOUT_MS=180000 npm run test:video-load:e2e`

### 残課題・次のステップ
- 実ウィンドウで古いrenderer bundleが残っている場合は、dev server再起動とElectron windowの閉じ直しが必要。

## 2026-06-20 — 外部4K GoPro素材のRust preview decodeを修正

### 実施内容
- Red: `/Volumes/ExtendSSD-W/GX020052.MP4` をElectron実ウィンドウE2Eへ投入し、optional native renderが4K source texture上限やdecode session競合を踏んでpreviewを進められない状態を再現した。
- Red: viewport presenter orchestrationへ、Rust decoded video uploadをoptional native render previewより優先する契約を追加した。
- Red: 3840x2160素材のpreview decode jobをcanvas相当の1920x1080へ縮小する契約を追加した。
- Red: Rust backendへ、`decode.start` の要求width/heightへffmpeg decode結果をscaleする契約を追加した。
- Green: optional native render previewを動画upload成功後には起動しない順序へ変更し、外部4K素材でnative wgpu texture上限を先に踏まないようにした。
- Green: viewport video uploadはpreview用decode sizeをcanvasと最大辺1920に収め、native fallbackも最大辺1920を上限にした。
- Green: Rust backendのffmpeg filterへ `scale=w=...:h=...` を指定し、要求decode sizeとshared ring layoutのbyte lengthを一致させた。
- 版を `0.1.1-Beta-219g` に更新した。

### 検証
- `npm test -- sharedRendererViewportVideoUpload sharedRendererViewportNativeRenderSource sharedRendererViewportPresenterOrchestration`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererViewportVideoUpload\\.ts|src/utils/sharedRendererViewportVideoUpload\\.test\\.ts|src/utils/sharedRendererViewportNativeRenderSource\\.ts|src/utils/sharedRendererViewportPresenterOrchestration\\.ts|src/utils/sharedRendererViewportPresenterOrchestration\\.test\\.ts)"`
- `cargo test --manifest-path rust-backend/Cargo.toml decode_request_frame -- --nocapture`
- `UXFD_VIDEO_LOAD_E2E_VIDEO_PATH=/Volumes/ExtendSSD-W/GX020052.MP4 UXFD_VIDEO_LOAD_E2E_TIMEOUT_MS=180000 npm run test:video-load:e2e`

### 残課題・次のステップ
- previewは1920px上限のdecodeで成立した。将来的にはcanvas表示サイズ・再生中負荷・proxy有無に応じてdecode解像度を動的に下げる制御を追加すると、120fps/60Mbps素材でもさらに軽くできる。

## 2026-06-20 — 動画previewの透明フレームによる灰色表示を修正

### 実施内容
- Red: Electron実ウィンドウ動画読込E2Eを、presenter readyだけでなくshared renderer canvasのスクリーンショットを取得し、実ピクセルが灰色一色ではないことまで検証する契約へ強化した。
- Red: WebGPU動画shaderがdecode済みvideo frameを不透明素材として扱い、出力alphaへobject opacityだけを適用する契約を追加した。
- Green: video fragment shaderでsampled textureのalphaを乗算せず、`colour.rgb` と `in.opacity` で出力するようにした。decoded frame側alphaが0または未定義相当でも背景だけが見える状態を避ける。
- 版を `0.1.1-Beta-219f` に更新した。

### 検証
- `npm test -- sharedRendererWebGpuPresenter`
- `npm test -- sharedRendererWebGpuPresenter sharedRendererPreviewPresenterController sharedRendererViewportPresenterOrchestration`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererWebGpuPresenter\\.ts|src/utils/sharedRendererWebGpuPresenter\\.test\\.ts|scripts/run-video-load-e2e\\.mjs)"`
- `npm run test:video-load:e2e`

### 残課題・次のステップ
- 既に開いているElectron windowに古いrenderer codeが残っている場合は、dev server再起動またはwindow reload後に確認する。
- 追加で複数fixtureを連続実行した際、`10000kbps_60fps.mp4` のスクリーンショット取得がCDP timeoutになった。今回の灰色表示修正とは別に、長時間fixture向けのE2E timeout/待機条件を調整する余地がある。

## 2026-06-20 — optional native render対象外診断をready previewから除外

### 実施内容
- Red: optionalなnative render previewが `nativeRenderUnsupportedMediaOnly` を返した場合、`requireSharedRendererOutput` でなければpresenterへ失敗診断を渡さない契約を追加した。
- Green: `startSharedRendererViewportPresenter` で `nativeRenderUnsupportedMediaOnly` をoptional native renderの対象外扱いにし、ready previewのUIへ `native=...` 診断を混ぜないようにした。
- `requireSharedRendererOutput=true` の場合は従来通り診断を保持し、export/実出力必須側のfail-loudは維持した。
- 版を `0.1.1-Beta-219e` に更新した。

### 検証
- `npm test -- sharedRendererViewportPresenterOrchestration sharedRendererPreviewPresenterController sharedRendererViewportNativeRenderUpload`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererViewportPresenterOrchestration\\.ts|src/utils/sharedRendererViewportPresenterOrchestration\\.test\\.ts)"`
- `npm run test:video-load:e2e`

### 残課題・次のステップ
- `npm run test:video-load:e2e` 中にVite dep-scanの既存 `mp4box` entry解決警告が出るが、動画読込E2E自体は成功している。別途export test系の依存解決整理で潰す。

## 2026-06-20 — Rust decode session喪失時のpreview復旧を追加

### 実施内容
- Red: UI側active job cacheは残っているがRust backend側のdecode sessionが消えて `No active decode session` を返すケースを、動画upload経路とnative render source経路の両方で追加した。
- Green: `requestFrame` が `No active decode session` を返した場合、同じjobId/source/sizeで `decode.start` を再実行し、同じframe requestを再試行するようにした。
- `requiredVideoOwnershipUnavailable` / `nativeRenderSourcesUnavailable` / `frameDecodeFailed` が、backend session喪失だけで発生してpreviewをblockedにする状態を復旧できるようにした。
- 版を `0.1.1-Beta-219d` に更新した。

### 検証
- `npm test -- sharedRendererViewportVideoUpload sharedRendererViewportNativeRenderSource`
- `npm test -- sharedRendererViewportVideoUpload sharedRendererViewportNativeRenderSource sharedRendererViewportNativeRenderUpload sharedRendererPreviewPresenterController sharedRendererWebGpuPresenter`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererViewportVideoUpload\\.ts|src/utils/sharedRendererViewportNativeRenderSource\\.ts|src/utils/sharedRendererViewportVideoUpload\\.test\\.ts|src/utils/sharedRendererViewportNativeRenderSource\\.test\\.ts)"`
- `npm run test:video-load:e2e`

### 残課題・次のステップ
- 既存の実ウィンドウに古いrenderer codeが残っている場合は、dev server再起動またはウィンドウreload後に復旧挙動を確認する。

## 2026-06-20 — Electron実ウィンドウ動画読込E2EをGreen化

### 実施内容
- Red: `scripts/run-video-load-e2e.mjs` を追加し、`npm run test:video-load:e2e` でElectron実ウィンドウをCDP操作し、`perf/heavy-media/GX010052.MP4` がタイムライン投入後にRust shared renderer所有でreadyになることを確認する契約を追加した。
- Green: Electron preloadのsandbox/createRequire/file path取得を修正し、`webUtils.getPathForFile` 経由で実ファイルpathをrendererへ渡すようにした。
- GoPro original投入時は既存proxyのmetadata/sourceをRust scene snapshotへ使い、3840px動画をそのままpreview decodeしてWebGPU制限に当てないようにした。
- WebGPU presenterの `createBindGroup` 呼び出しをreceiver付きにし、実Electronで起きていた `Illegal invocation` を解消した。
- native renderがsource data planeを先に解放した後の `decode.releaseFrame` をRust backendで成功扱いにし、純動画previewではRust decoded video upload成功時にnative render実験経路の失敗診断をready表示へ混ぜないようにした。
- 版を `0.1.1-Beta-219c` に更新した。

### 検証
- `npm test -- sharedRendererPreviewPresenterController sharedRendererWebGpuPresenter sharedRendererRustVideoUploadPipeline rustSceneSnapshot mediaMetadata`
- `cargo test --manifest-path rust-backend/Cargo.toml decode_release_frame_accepts_source_data_plane_already_consumed_by_native_render -- --nocapture`
- `npx tsc --noEmit 2>&1 | rg "(scripts/run-video-load-e2e|electron/preload|electron/main|src/main\\.tsx|src/components/Timeline\\.tsx|src/hooks/useTimelineDrop\\.tsx|src/utils/mediaMetadata\\.ts|src/utils/sharedRendererPreviewPresenterController\\.ts|src/utils/sharedRendererWebGpuPresenter\\.ts|src/utils/sharedRendererRustVideoUploadPipeline\\.ts|src/utils/rustSceneSnapshot\\.ts|src/vite-env\\.d\\.ts)"`
- `npm run test:video-load:e2e`

### 残課題・次のステップ
- native render出力のshared memory copy checksum不一致は、純動画previewではRust decoded video path成功を優先してUI診断から除外した。画像/PSD混在やexportでnative render実出力を必須にする場合は、native render output upload側にもinline fallbackまたはnative bridge修正が必要。
- `npx tsc --noEmit` 全体は既存のThree/mp4box/filterStack等の型エラーが残るため、今回は対象ファイルgrepで確認した。

## 2026-06-20 — ローカル動画fixtureのRust実decode契約を追加

### 実施内容
- Red: `perf/heavy-media/` 配下の動画4本をRust backendの `decode.start` / `decode.requestFrame` / `decode.releaseFrame` / `decode.stop` で実際に1フレーム読む契約を追加した。
- GoPro proxy、GoPro original、10Mbps/20Mbps HEVC動画の各1フレームをshared memoryへdecodeし、consumer read後にreleaseできることを固定した。
- UI上の動画preview不表示は、少なくともローカル動画ファイルそのものをRust backendがdecodeできない問題ではないと切り分けた。

### 検証
- `cargo test --manifest-path rust-backend/Cargo.toml decode_request_frame_reads_all_local_video_fixtures_for_preview -- --nocapture`

### 残課題・次のステップ
- Electron rendererからRust decode結果をshared renderer presenterへ渡す実ウィンドウ相当のE2Eを追加し、preview不表示の残り原因をpresentation/upload側へ絞る。

## 2026-06-20 — 全読込可能メディアのE2E契約を追加

### 実施内容
- Red: リポジトリ内で読み込める `mp4` 全4本、`public/icon.jpg`、`葵ちゃん.psd`、テスト内生成WAV、Solid rectangle、Gradient rectangleを同一タイムラインへ配置するE2E契約を追加した。
- Rust scene snapshotで音声をvisual snapshotから除外しつつ、画像/PSD/動画/図形が `SolidColour` / `GeneratedGradient` / `Image` / `Video` / `Psd` media referenceへ変換されることを固定した。
- shared renderer preview sessionとRust backend encoder用export frame source計画まで到達できることを確認した。
- 実ファイルの動画4本は `ffprobe` でもvideo/audio streamとdurationを確認した。

### 検証
- `ffprobe -v error -show_entries format=duration -show_entries stream=codec_type,codec_name,width,height,r_frame_rate,duration -of json` を `perf/heavy-media/20000kbps_60fps.mp4` / `GX010052.proxy.mp4` / `10000kbps_60fps.mp4` / `GX010052.MP4` に実行。
- `npm test -- allReadableMedia.e2e`
- `npx tsc --noEmit 2>&1 | rg "src/e2e/allReadableMedia\\.e2e\\.test\\.ts"`

### 残課題・次のステップ
- `npm test -- allReadableMedia.e2e rustVideoPreview.e2e sharedRendererPreviewSession projectExportFrameCanvas rustSceneSnapshotBoundary` は、既存の `sharedRendererPreviewSession.test.ts` がrotationをunsupported扱いにする古い期待値で失敗した。
- `npx tsc --noEmit` 全体は、既存のThree/mp4box型定義欠落、`heavyEffectsStress.test.ts` の `PositionKeyframe` import不足、`filterStack.test.ts` の古い型期待で失敗した。
- 次はElectron実ウィンドウ相当のメディア投入/エクスポートE2Eへ広げ、Rust frame source実体が無い場合のUI診断も自動確認する。

## 2026-06-19 — Rust frame source plan failure表示ラベルを追加

### 実施内容
- Red: export frame source plan failureの `rustFrameSourceRequired` がraw reasonではなく読みやすいラベルで表示される契約を追加した。
- Green: `ExportProgressModal` のplan failure formatterに `Rust frame source必須` / `Rust frame source required` を追加した。
- Image/PSD exportでRust frame sourceが不在の場合の診断を、実機UI上でも追いやすい文言に整えた。
- 版を `0.1.1-Beta-216w` に更新した。

### 検証
- `npm test -- ExportProgressModal exportDiagnosticsLog exportProgressDiagnostics exportProgress`
- `npx tsc --noEmit 2>&1 | rg "(src/components/ExportProgressModal\\.tsx|src/components/ExportProgressModal\\.test\\.ts|src/utils/exportDiagnosticsLog\\.ts|src/utils/exportProgressDiagnostics\\.ts|src/store/useStore\\.ts)"`

### 残課題・次のステップ
- shared renderer実出力必須モードの実機確認範囲を、画像/PSD混在タイムラインへ広げる。
- Rust frame source plan failureのDevTools log側も必要に応じて読みやすいラベルへ揃える。

## 2026-06-19 — native render media preflight失敗をblocked診断に変更

### 実施内容
- Red: Image/PSDなどnative render mediaのRust export preflight失敗が、legacy fallbackではなくblocked診断になる契約を追加した。
- Green: `BuildViewportRustExportFrameSourceInput` に `hasNativeRenderMediaObjects` を追加し、preflight失敗時のdiagnostic status判定へ含めた。
- `Viewport` からもexport contextの `hasNativeRenderMediaObjects` をRust export frame source生成へ渡すようにした。
- 版を `0.1.1-Beta-216v` に更新した。

### 検証
- `npm test -- viewportRustExportFrameSource viewportRustVideoOnlyBoundary`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/viewportRustExportFrameSource\\.ts|src/utils/viewportRustExportFrameSource\\.test\\.ts|src/components/Viewport\\.tsx|src/utils/viewportRustVideoOnlyBoundary\\.test\\.ts)"`

### 残課題・次のステップ
- Image/PSD native render mediaのplan failureをexport progress modal上でさらに読みやすくする。
- shared renderer実出力必須モードの実機確認範囲を、画像/PSD混在タイムラインへ広げる。

## 2026-06-19 — Image/PSD Rust frame source不在detailを明示

### 実施内容
- Red: Image/PSD exportでRust frame sourceがない場合、plan failure detailが汎用のRust-onlyではなくImage/PSD由来だと分かる契約を追加した。
- Green: `buildProjectExportFrameSourcePlan` に `hasNativeRenderMediaObjects` を渡し、Rust frame source不在時のdetailを `Image/PSD export requires...` に分岐した。
- `useProjectExport` でも同じnative render media判定をplan生成へ渡し、UI/ログで原因を追いやすくした。
- 版を `0.1.1-Beta-216u` に更新した。

### 検証
- `npm test -- projectExportFrameCanvas useProjectExportBoundary`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/projectExportFrameCanvas\\.ts|src/utils/projectExportFrameCanvas\\.test\\.ts|src/hooks/useProjectExport\\.ts|src/utils/useProjectExportBoundary\\.test\\.ts)"`

### 残課題・次のステップ
- shared renderer実出力必須モードの実機確認範囲を、画像/PSD混在タイムラインへ広げる。
- Image/PSD native render mediaのplan failureをexport progress modal上でさらに読みやすくする。

## 2026-06-19 — Image/PSD exportをRust frame source必須条件に追加

### 実施内容
- Red: WebCodecs互換encoderでもImage/PSDを含むexportはRust frame source必須・blocked時failになる契約を追加した。
- Green: `hasNativeRenderMediaObjects` をexport frame source context/policyへ追加し、Image/PSDをnative render mediaとして扱うようにした。
- `useProjectExport` からもImage/PSDの存在をpolicyへ渡し、計画段階でlegacy canvas exportへ戻らないようにした。
- 版を `0.1.1-Beta-216t` に更新した。

### 検証
- `npm test -- projectExportFrameCanvas useProjectExportBoundary`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/projectExportFrameCanvas\\.ts|src/utils/projectExportFrameCanvas\\.test\\.ts|src/hooks/useProjectExport\\.ts|src/utils/useProjectExportBoundary\\.test\\.ts)"`

### 残課題・次のステップ
- native render media必須時のplan failure detailに、Image/PSDが対象であることをより明示する。
- shared renderer実出力必須モードの実機確認範囲を、画像/PSD混在タイムラインへ広げる。

## 2026-06-19 — blocked error単位のlegacy fallback禁止をruntimeで優先

### 実施内容
- Red: 非動画exportで計画上はlegacy canvas fallback可能でも、blocked errorが `legacyCanvasFallbackAllowed=false` を持つ場合はfallbackせず失敗する契約を追加した。
- Green: `renderProjectExportFrame` がRust frame source blocked診断を出した後、error単位のlegacy禁止をruntime planより優先してfail-loudにするようにした。
- Image/PSD ownership残留など、Rust/shared renderer実出力不可を明示したblocked errorが、非動画exportだからという理由でlegacy canvasへ戻らないようにした。
- 版を `0.1.1-Beta-216s` に更新した。

### 検証
- `npm test -- projectExportFrameRenderer sharedRendererExportFrameSource exportProgressDiagnostics exportProgress ExportProgressModal`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/projectExportFrameRenderer\\.ts|src/utils/projectExportFrameRenderer\\.test\\.ts|src/utils/sharedRendererExportFrameSource\\.ts|src/store/useStore\\.ts|src/components/ExportProgressModal\\.tsx)"`

### 残課題・次のステップ
- export計画段階でImage/PSD native render必須条件をさらに明示し、Rust frame source不在時の診断を強化する。
- shared renderer実出力必須モードの実機確認範囲を、画像/PSD混在タイムラインへ広げる。

## 2026-06-19 — Image/PSD ownership診断をexport blocked detailに保持

### 実施内容
- Red: presenterがImage/PSD ownershipのPixi残留診断をdatasetへ残した場合、export blocked error detailにもその情報が残る契約を追加した。
- Green: `sharedRendererOutputUnavailable` のgeneric detail生成時に、`imageOwnership` / `psdOwnership` のownerとcutover reasonを付加するようにした。
- previewで検出したnative render frame未到達の原因を、export進捗・ログ側でも追えるようにした。
- 版を `0.1.1-Beta-216r` に更新した。

### 検証
- `npm test -- sharedRendererExportFrameSource ExportProgressModal exportDiagnosticsLog exportProgressDiagnostics exportProgress`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererExportFrameSource\\.ts|src/utils/sharedRendererExportFrameSource\\.test\\.ts|src/components/ExportProgressModal\\.tsx|src/store/useStore\\.ts)"`

### 残課題・次のステップ
- export計画段階でImage/PSD native render必須条件をさらに明示し、Rust frame source不在時の診断を強化する。
- shared renderer実出力必須モードの実機確認範囲を、画像/PSD混在タイムラインへ広げる。

## 2026-06-19 — 実出力必須時のimage/PSD Pixi所有をblocked診断に変更

### 実施内容
- Red: `requireSharedRendererOutput` 有効時にImage/PSD ownershipがPixiに残る場合、diagnostic swatchで `ready` にならず `blocked` になる契約を追加した。
- Green: image/PSD ownershipが `sharedRenderer` でない実出力必須previewを `sharedRendererOutputUnavailable` として停止するようにした。
- blocked診断にもImage/PSD owner/cutover reason/object countを記録し、native render frame未到達でPixi所有に残った原因を追えるようにした。
- 版を `0.1.1-Beta-216q` に更新した。

### 検証
- `npm test -- sharedRendererPreviewPresenterController sharedRendererPresenterDiagnostics`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererPreviewPresenterController\\.ts|src/utils/sharedRendererPreviewPresenterController\\.test\\.ts|src/utils/sharedRendererPresenterDiagnostics\\.ts|src/utils/sharedRendererPresenterDiagnostics\\.test\\.ts)"`

### 残課題・次のステップ
- image/PSDのnative render coverageをexport計画側の診断にもさらに接続する。
- Viewport本体のPixi依存撤去へ向けて、shared renderer実出力必須モードの実機確認範囲を広げる。

## 2026-06-19 — native render texture view blocked診断の表示ラベルを追加

### 実施内容
- Red: `nativeRenderTextureViewUnavailable` のRust frame source blocked診断がraw reasonではなく読みやすいラベルで表示される契約を追加した。
- Green: `ExportProgressModal` のblocked reason formatterに `nativeRenderTextureViewUnavailable` を追加し、日本語では `native render texture viewなし`、英語では `native render texture view unavailable` と表示するようにした。
- native render texture view欠落でRust/shared renderer実出力が止まった場合の診断を、実機UIで追いやすい文言に整えた。
- 版を `0.1.1-Beta-216p` に更新した。

### 検証
- `npm test -- ExportProgressModal exportDiagnosticsLog exportProgressDiagnostics exportProgress sharedRendererExportFrameSource`
- `npx tsc --noEmit 2>&1 | rg "(src/components/ExportProgressModal\\.tsx|src/components/ExportProgressModal\\.test\\.ts|src/utils/exportDiagnosticsLog\\.ts|src/utils/exportDiagnosticsLog\\.test\\.ts|src/utils/exportProgressDiagnostics\\.ts|src/store/useStore\\.ts|src/utils/sharedRendererExportFrameSource\\.ts)"`

### 残課題・次のステップ
- Viewport本体のPixi依存撤去へ向けて、image/PSD/SolidColourのnative render coverageをさらに診断へ接続する。
- shared renderer実出力必須モードで、image/PSD系のpresentation失敗も同じblocked診断へ揃える。

## 2026-06-19 — native render texture view失敗をexport blockedに伝搬

### 実施内容
- Red: exportのbitmap pathとdirect encode pathで `nativeRenderTextureViewUnavailable` がlegacy captureや別reasonへ進まずblockedになる契約を追加した。
- Green: export frame sourceのblocked reasonへ `nativeRenderTextureViewUnavailable` を追加し、presenter control失敗を同じreasonで伝搬するようにした。
- Rust/native render frameのWebGPU texture view欠落を、export境界で `presentedSharedFrameHandoffUnavailable` へ丸めたりlegacy bitmap captureへ逃がしたりしないようにした。
- 版を `0.1.1-Beta-216o` に更新した。

### 検証
- `npm test -- sharedRendererExportFrameSource`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererExportFrameSource\\.ts|src/utils/sharedRendererExportFrameSource\\.test\\.ts|src/store/useStore\\.ts|src/components/ExportProgressModal\\.tsx)"`

### 残課題・次のステップ
- `nativeRenderTextureViewUnavailable` のUI表示ラベルを追加し、raw reasonを実機UIへ出さないようにする。
- Viewport本体のPixi依存撤去へ向けて、image/PSD/SolidColourのnative render coverageをさらに診断へ接続する。

## 2026-06-19 — 実出力必須時のnative render presentation失敗をblocked診断に変更

### 実施内容
- Red: `requireSharedRendererOutput` 有効時にnative render frame presentationが失敗した場合、presenter診断が `blocked` になる契約を追加した。
- Green: native render frame presentation失敗時のdiagnostics statusを、通常previewでは `fallback` のまま、実出力必須時だけ `blocked` へ切り替えるようにした。
- Rust/native renderで合成済みフレームを受け取った後のWebGPU texture view失敗を、Pixi互換fallbackとして見せないようにした。
- 版を `0.1.1-Beta-216n` に更新した。

### 検証
- `npm test -- sharedRendererPreviewPresenterController`
- `npm test -- sharedRendererPreviewPresenterController sharedRendererPresenterDiagnostics sharedRendererViewportPresenterOrchestration viewportRustVideoOnlyBoundary`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererPreviewPresenterController\\.ts|src/utils/sharedRendererPreviewPresenterController\\.test\\.ts|src/utils/sharedRendererPresenterDiagnostics\\.ts|src/utils/sharedRendererPresenterDiagnostics\\.test\\.ts|src/utils/sharedRendererWebGpuPresenter\\.ts)"`

### 残課題・次のステップ
- `nativeRenderTextureViewUnavailable` のexport伝搬とUI表示ラベルを必要に応じて整理する。
- Viewport本体のPixi依存撤去へ向けて、image/PSD/SolidColourのnative render coverageをさらに診断へ接続する。

## 2026-06-19 — WebGPU draw不可blocked診断の表示ラベルを追加

### 実施内容
- Red: `webGpuDrawUnavailable` のRust frame source blocked診断がraw reasonではなく読みやすいラベルで表示される契約を追加した。
- Green: `ExportProgressModal` のblocked reason formatterに `webGpuDrawUnavailable` を追加し、日本語では `WebGPU描画不可`、英語では `WebGPU draw unavailable` と表示するようにした。
- WebGPU draw不可でRust/shared renderer実出力が止まった場合の診断を、実機UIで追いやすい文言に整えた。
- 版を `0.1.1-Beta-216m` に更新した。

### 検証
- `npm test -- ExportProgressModal exportDiagnosticsLog exportProgressDiagnostics exportProgress sharedRendererExportFrameSource`
- `npx tsc --noEmit 2>&1 | rg "(src/components/ExportProgressModal\\.tsx|src/components/ExportProgressModal\\.test\\.ts|src/utils/exportDiagnosticsLog\\.ts|src/utils/exportDiagnosticsLog\\.test\\.ts|src/utils/exportProgressDiagnostics\\.ts|src/store/useStore\\.ts|src/utils/sharedRendererExportFrameSource\\.ts)"`

### 残課題・次のステップ
- Viewport本体のPixi依存撤去へ向けて、image/PSD/SolidColourのnative render coverageをさらに診断へ接続する。
- `webGpuDrawUnavailable` の実機発生ケースで、progress modal、toast、DevTools logが同じblocked payloadを参照することを確認する。

## 2026-06-19 — WebGPU draw不可時のbitmap legacy captureを禁止

### 実施内容
- Red: export bitmap pathでpresenterが `webGpuDrawUnavailable` を返した場合、`createFrameBitmap` に進まずblocked errorになる契約を追加した。
- Green: `SharedRendererExportFrameSourceBlockedReason` に `webGpuDrawUnavailable` を追加し、presenter control失敗をexport blocked reasonとして伝搬するようにした。
- 実shared renderer出力のWebGPU drawが成立しない状態を、legacy bitmap canvas captureで成功扱いにする抜け道を塞いだ。
- 版を `0.1.1-Beta-216l` に更新した。

### 検証
- `npm test -- sharedRendererExportFrameSource`
- `npm test -- sharedRendererExportFrameSource projectExportFrameRenderer exportDiagnosticsLog exportProgress ExportProgressModal`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererExportFrameSource\\.ts|src/utils/sharedRendererExportFrameSource\\.test\\.ts|src/utils/projectExportFrameRenderer\\.ts|src/utils/projectExportFrameRenderer\\.test\\.ts|src/utils/exportDiagnosticsLog\\.ts|src/store/useStore\\.ts|src/components/ExportProgressModal\\.tsx)"`

### 残課題・次のステップ
- `webGpuDrawUnavailable` のUI/ログ表示ラベルを必要に応じて整理する。
- Viewport本体のPixi依存撤去へ向けて、image/PSD/SolidColourのnative render coverageをさらに診断へ接続する。

## 2026-06-19 — 実出力必須時のvideo presentation失敗をblocked診断に変更

### 実施内容
- Red: `requireSharedRendererOutput` 有効時にvideo frame scene presentationが失敗した場合、presenter診断が `blocked` になる契約を追加した。
- Green: video frame scene presentation失敗時のdiagnostics statusを、通常previewでは `fallback` のまま、実出力必須時だけ `blocked` へ切り替えるようにした。
- 実shared renderer出力が必須の検証で、Rust decoded video frame upload後のpresentation失敗をPixi互換fallbackとして見せないようにした。
- 版を `0.1.1-Beta-216k` に更新した。

### 検証
- `npm test -- sharedRendererPreviewPresenterController`
- `npm test -- sharedRendererPreviewPresenterController sharedRendererPresenterDiagnostics sharedRendererViewportPresenterOrchestration viewportRustVideoOnlyBoundary`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererPreviewPresenterController\\.ts|src/utils/sharedRendererPreviewPresenterController\\.test\\.ts|src/utils/sharedRendererPresenterDiagnostics\\.ts|src/utils/sharedRendererPresenterDiagnostics\\.test\\.ts|src/utils/sharedRendererWebGpuPresenter\\.ts)"`

### 残課題・次のステップ
- presentation失敗reasonのUI/ログ表示ラベルを必要に応じて整理する。
- Viewport本体のPixi依存撤去へ向けて、image/PSD/SolidColourのnative render coverageをさらに診断へ接続する。

## 2026-06-19 — 実出力必須時のSolidColour presentation失敗をblocked診断に変更

### 実施内容
- Red: `requireSharedRendererOutput` 有効時にSolidColour scene presentationが失敗した場合、presenter診断が `blocked` になる契約を追加した。
- Green: SolidColour presentation失敗時のdiagnostics statusを、通常previewでは `fallback` のまま、実出力必須時だけ `blocked` へ切り替えるようにした。
- 実shared renderer出力が必須の検証で、SolidColour presentation失敗をPixi互換fallbackとして見せないようにした。
- 版を `0.1.1-Beta-216j` に更新した。

### 検証
- `npm test -- sharedRendererPreviewPresenterController`
- `npm test -- sharedRendererPreviewPresenterController sharedRendererPresenterDiagnostics sharedRendererViewportPresenterOrchestration viewportRustVideoOnlyBoundary`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererPreviewPresenterController\\.ts|src/utils/sharedRendererPreviewPresenterController\\.test\\.ts|src/utils/sharedRendererPresenterDiagnostics\\.ts|src/utils/sharedRendererPresenterDiagnostics\\.test\\.ts|src/utils/sharedRendererWebGpuPresenter\\.ts)"`

### 残課題・次のステップ
- 実出力必須時のvideo frame scene presentation失敗も、同じくblocked診断へ寄せる。
- Viewport本体のPixi依存撤去へ向けて、image/PSD/SolidColourのnative render coverageをさらに診断へ接続する。

## 2026-06-19 — shared renderer output blocked診断の表示ラベルを追加

### 実施内容
- Red: `sharedRendererOutputUnavailable` のRust frame source blocked診断がraw reasonではなく読みやすいラベルで表示される契約を追加した。
- Green: `ExportProgressModal` のblocked reason formatterに `sharedRendererOutputUnavailable` を追加し、日本語では `shared renderer実出力なし`、英語では `shared renderer output unavailable` と表示するようにした。
- export実出力不可のblocked診断を、実機UIで原因追跡しやすい文言に整えた。
- 版を `0.1.1-Beta-216i` に更新した。

### 検証
- `npm test -- ExportProgressModal exportDiagnosticsLog exportProgressDiagnostics exportProgress`
- `npx tsc --noEmit 2>&1 | rg "(src/components/ExportProgressModal\\.tsx|src/components/ExportProgressModal\\.test\\.ts|src/utils/exportDiagnosticsLog\\.ts|src/utils/exportDiagnosticsLog\\.test\\.ts|src/utils/exportProgressDiagnostics\\.ts|src/store/useStore\\.ts|src/utils/sharedRendererExportFrameSource\\.ts)"`

### 残課題・次のステップ
- Viewport本体のPixi依存撤去へ向けて、image/PSD/SolidColourのnative render coverageをさらに診断へ接続する。
- `sharedRendererOutputUnavailable` の実機発生ケースで、progress modal、toast、DevTools logが同じblocked payloadを参照することを確認する。

## 2026-06-19 — 実出力不可時のbitmap legacy captureを禁止

### 実施内容
- Red: bitmap export pathでpresenterが `sharedRendererOutputUnavailable` を返した場合、`createFrameBitmap` に進まずblocked errorになる契約を追加した。
- Green: `sharedRendererOutputUnavailable` のblocked化を `presentFrame` 共通経路へ移し、direct encodeとbitmap exportの両方で同じfail-loud境界を通すようにした。
- 実shared renderer出力がない状態を、legacy bitmap canvas captureで成功扱いにする抜け道を塞いだ。
- 版を `0.1.1-Beta-216h` に更新した。

### 検証
- `npm test -- sharedRendererExportFrameSource`
- `npm test -- sharedRendererExportFrameSource projectExportFrameRenderer exportDiagnosticsLog exportProgress`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererExportFrameSource\\.ts|src/utils/sharedRendererExportFrameSource\\.test\\.ts|src/utils/projectExportFrameRenderer\\.ts|src/utils/projectExportFrameRenderer\\.test\\.ts|src/utils/exportDiagnosticsLog\\.ts|src/store/useStore\\.ts)"`

### 残課題・次のステップ
- `sharedRendererOutputUnavailable` をexport progress/modal/logでより明示的な文言にする必要があるか、実機diagnosticsで確認する。
- Viewport本体のPixi依存撤去へ向けて、image/PSD/SolidColourのnative render coverageをさらに診断へ接続する。

## 2026-06-19 — export実出力blocked詳細を保持

### 実施内容
- Red: export direct encodeでpresenterが `sharedRendererOutputUnavailable` を返した場合、`presentedSharedFrameHandoffUnavailable` に丸めず、native render upload失敗詳細を保持する契約を追加した。
- Green: `SharedRendererExportFrameSourceBlockedReason` に `sharedRendererOutputUnavailable` を追加し、presenter control失敗をexport blocked reasonとして伝搬するようにした。
- `nativeRenderUploadResult` が失敗している場合、`webGpuUploadUnavailable` などの理由と詳細をblocked error messageへ含めるようにした。
- 版を `0.1.1-Beta-216g` に更新した。

### 検証
- `npm test -- sharedRendererExportFrameSource`
- `npm test -- sharedRendererExportFrameSource projectExportFrameRenderer exportDiagnosticsLog exportProgress`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererExportFrameSource\\.ts|src/utils/sharedRendererExportFrameSource\\.test\\.ts|src/utils/projectExportFrameRenderer\\.ts|src/utils/projectExportFrameRenderer\\.test\\.ts|src/utils/exportDiagnosticsLog\\.ts|src/store/useStore\\.ts)"`

### 残課題・次のステップ
- `sharedRendererOutputUnavailable` をexport progress/modal/logでより明示的な文言にする必要があるか、実機diagnosticsで確認する。
- Viewport本体のPixi依存撤去へ向けて、image/PSD/SolidColourのnative render coverageをさらに診断へ接続する。

## 2026-06-19 — 実出力必須blocked診断にnative render upload失敗を保持

### 実施内容
- Red: `requireSharedRendererOutput` 有効時にnative render frame uploadが失敗した場合、`sharedRendererOutputUnavailable` のblocked診断へnative render失敗理由と詳細が残る契約を追加した。
- Green: `sharedRendererOutputUnavailable` のblocked diagnosticsへ `nativeRenderFailureReason` / `nativeRenderFailureDetail` を渡すようにした。
- Pixi passthroughへ戻れない検証で、Rust/native render upload失敗の根本原因が診断から落ちる問題を塞いだ。
- 版を `0.1.1-Beta-216f` に更新した。

### 検証
- `npm test -- sharedRendererPreviewPresenterController`
- `npm test -- sharedRendererPreviewPresenterController sharedRendererPresenterDiagnostics sharedRendererViewportPresenterOrchestration viewportRustVideoOnlyBoundary`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererPreviewPresenterController\\.ts|src/utils/sharedRendererPreviewPresenterController\\.test\\.ts|src/utils/sharedRendererPresenterDiagnostics\\.ts|src/utils/sharedRendererPresenterDiagnostics\\.test\\.ts)"`

### 残課題・次のステップ
- native render frame upload失敗時に、Rust/native render必須のexport frame source側でも同じdetail保持ができているか確認する。
- Viewport本体のPixi依存撤去へ向けて、image/PSD/SolidColourのnative render coverageをさらに診断へ接続する。

## 2026-06-19 — shared renderer実出力必須時のPixi passthroughをblocked診断に変更

### 実施内容
- Red: `requireSharedRendererOutput` が有効で、native render frameもuploaded video frameもなくPixi passthroughしか残らない場合、presenter診断が `blocked` になる契約を追加した。
- Green: `sharedRendererOutputUnavailable` のpresenter diagnosticsを `fallback` から `blocked` に変更した。
- 実出力必須のpreview検証で、Pixi passthroughを互換fallbackとして成功寄りに見せるズレを塞いだ。
- 版を `0.1.1-Beta-216e` に更新した。

### 検証
- `npm test -- sharedRendererPreviewPresenterController`
- `npm test -- sharedRendererPreviewPresenterController sharedRendererPresenterDiagnostics sharedRendererViewportPresenterOrchestration viewportRustVideoOnlyBoundary`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererPreviewPresenterController\\.ts|src/utils/sharedRendererPreviewPresenterController\\.test\\.ts|src/utils/sharedRendererPresenterDiagnostics\\.ts|src/utils/sharedRendererPresenterDiagnostics\\.test\\.ts)"`

### 残課題・次のステップ
- native render frame upload失敗時に、Rust/native render必須のpreview/exportではPixi presentationへ戻らない境界を追加で整理する。
- Viewport本体のPixi依存撤去へ向けて、image/PSD/SolidColourのnative render coverageをさらに診断へ接続する。

## 2026-06-19 — 動画Rust blocked診断をprogress保存時に正規化

### 実施内容
- Red: `videoOwnershipUnavailable` の古い診断payloadが `legacyCanvasFallbackAllowed=true` を持っていても、progress payloadとlast diagnosticsではfalseへ正規化される契約を追加した。
- Green: `normaliseRustFrameSourceBlockedFallback` を追加し、`setExportProgress` と `updateExportProgressPhase` がRust動画必須blocked診断を保存時にfallback不可へ正規化するようにした。
- UI/ログ表示だけでなく、保持される診断payload自体もRust動画必須blockedの意味に揃えた。
- 版を `0.1.1-Beta-216d` に更新した。

### 検証
- `npm test -- exportProgress exportProgressDiagnostics`
- `npm test -- ExportProgressModal exportDiagnosticsLog exportProgressDiagnostics exportProgress`
- `npx tsc --noEmit 2>&1 | rg "(src/store/useStore\\.ts|src/store/exportProgress\\.test\\.ts|src/utils/exportProgressDiagnostics\\.ts|src/utils/exportProgressDiagnostics\\.test\\.ts|src/utils/rustFrameSourceBlockedFallback\\.ts|src/components/ExportProgressModal\\.tsx|src/utils/exportDiagnosticsLog\\.ts)"`

### 残課題・次のステップ
- Viewport本体のPixi依存撤去へ向けて、video以外のPixi-only presentation条件とRust native render coverageを整理する。
- Rust動画必須blocked診断が蓄積される実機ケースで、DevTools logとexport progress表示が同じpayloadを参照していることを確認する。

## 2026-06-19 — 動画Rust blocked診断のfallback表示を不可へ正規化

### 実施内容
- Red: `videoOwnershipUnavailable` の古い診断payloadが `legacyCanvasFallbackAllowed=true` を持っていても、UI summaryとDevTools logではlegacy fallback不可として表示する契約を追加した。
- Green: `isRustFrameSourceLegacyCanvasFallbackAllowed` を追加し、`videoOwnershipUnavailable` / `videoUploadFailed` は理由ベースでfallback不可へ正規化した。
- ExportProgressModalとexport diagnostics logで同じhelperを使い、Rust動画必須blockedがlegacy fallback可に見えるズレを塞いだ。
- 版を `0.1.1-Beta-216c` に更新した。

### 検証
- `npm test -- ExportProgressModal exportDiagnosticsLog`
- `npm test -- ExportProgressModal exportDiagnosticsLog exportProgressDiagnostics exportProgress`
- `npx tsc --noEmit 2>&1 | rg "(src/components/ExportProgressModal\\.tsx|src/components/ExportProgressModal\\.test\\.ts|src/utils/exportDiagnosticsLog\\.ts|src/utils/exportDiagnosticsLog\\.test\\.ts|src/utils/rustFrameSourceBlockedFallback\\.ts|src/utils/exportProgressDiagnostics\\.ts|src/store/useStore\\.ts)"`

### 残課題・次のステップ
- progress payload自体の古いfixtureも、今後の整理で `legacyCanvasFallbackAllowed=false` に寄せる。
- Viewport本体のPixi依存撤去へ向けて、video以外のPixi-only presentation条件とRust native render coverageを整理する。

## 2026-06-19 — 動画Rust export preflight失敗をblocked診断に変更

### 実施内容
- Red: 動画を含むRust export preflightで `exportSessionBlocked` が発生した場合、frame source diagnosticsが `blocked` statusになる契約を追加した。
- Green: `ViewportRustExportFrameSourceDecision` に任意の `diagnosticStatus` を追加し、動画/Rust必須preflight失敗だけ `blocked` としてdatasetへ書き出すようにした。
- 非動画互換exportのclosed gateは従来通り `fallback` のままにし、Rust必須failureとlegacy fallbackを診断上で分離した。
- 版を `0.1.1-Beta-216b` に更新した。

### 検証
- `npm test -- viewportRustExportFrameSource`
- `npm test -- viewportRustExportFrameSource projectExportFrameCanvas viewportRustVideoOnlyBoundary sharedRendererExportFrameSource`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/viewportRustExportFrameSource\\.ts|src/utils/viewportRustExportFrameSource\\.test\\.ts|src/utils/projectExportFrameCanvas\\.ts|src/utils/viewportRustVideoOnlyBoundary\\.test\\.ts|src/utils/sharedRendererExportFrameSource\\.ts)"`

### 残課題・次のステップ
- preview/export双方で `blocked` statusを使う経路を、実機diagnostics overlayやexport progressの表示へどう反映するか整理する。
- Viewport本体のPixi依存撤去へ向けて、video以外のPixi-only presentation条件とRust native render coverageを整理する。

## 2026-06-19 — Rust必須preview失敗をblocked診断に変更

### 実施内容
- Red: `requiredVideoOwnershipUnavailable` と `requiredRustVideoControlPlaneUnavailable` のpreview診断が `blocked` statusになる契約へ更新した。
- Green: `SharedRendererPresenterDiagnosticState` に `blocked` statusを追加し、Rust必須video/control-plane失敗だけ `blocked` として書き出すようにした。
- 通常のPixi互換fallbackは `fallback` のまま維持し、Rust必須失敗と互換退避を実機datasetで区別できるようにした。
- 版を `0.1.1-Beta-216a` に更新した。

### 検証
- `npm test -- sharedRendererPreviewPresenterController`
- `npm test -- sharedRendererPreviewPresenterController sharedRendererPresenterDiagnostics sharedRendererViewportPresenterOrchestration viewportRustVideoOnlyBoundary`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererPreviewPresenterController\\.ts|src/utils/sharedRendererPreviewPresenterController\\.test\\.ts|src/utils/sharedRendererPresenterDiagnostics\\.ts|src/utils/sharedRendererPresenterDiagnostics\\.test\\.ts|src/utils/sharedRendererViewportPresenterOrchestration\\.ts|src/utils/viewportRustVideoOnlyBoundary\\.test\\.ts)"`

### 残課題・次のステップ
- preview/export双方で `fallback` と `blocked` の診断語彙を揃え、Rust必須failureがPixi退避に見えないようにする。
- Viewport本体のPixi依存撤去へ向けて、video以外のPixi-only presentation条件とRust native render coverageを整理する。

## 2026-06-19 — Rust video-onlyをexport cutover gateへ接続

### 実施内容
- Red: ViewportのRust export frame source生成で、`rustVideoOnlyEnabled` が `videoCutoverEnabled` に含まれる契約を追加した。
- Green: `getRustExportFrameSource` の `videoCutoverEnabled` を `sharedRendererVideoCutoverEnabled || rustVideoOnlyEnabled` にし、dependencyへ `rustVideoOnlyEnabled` を追加した。
- Rust video-only起動時に、previewだけでなくexport frame source側もRust video cutover必須として扱う配線に揃えた。
- 版を `0.1.1-Beta-215z` に更新した。

### 検証
- `npm test -- viewportRustVideoOnlyBoundary`
- `npm test -- viewportRustVideoOnlyBoundary viewportRustExportFrameSource sharedRendererExportFrameSource`
- `npx tsc --noEmit 2>&1 | rg "(src/components/Viewport\\.tsx|src/utils/viewportRustVideoOnlyBoundary\\.test\\.ts|src/utils/viewportRustExportFrameSource\\.ts|src/utils/sharedRendererExportFrameSource\\.ts)"`

### 残課題・次のステップ
- 次の機能/不具合修正ではSubVerが `z` に達したため、版を `0.1.1-Beta-216a` に進める。
- Viewport本体のPixi依存撤去へ向けて、video以外のPixi-only presentation条件とRust native render coverageを整理する。

## 2026-06-19 — blocked errorのlegacy fallbackを明示opt-inに変更

### 実施内容
- Red: `SharedRendererExportFrameSourceBlockedError` が明示指定なしではlegacy canvas fallbackを許可しない契約を追加した。
- Green: blocked errorの `legacyCanvasFallbackAllowed` 既定値を `false` にし、互換fallbackとして残すsurface gate blockだけ `true` を明示した。
- 新しいRust export block reasonを追加した時に、指定漏れでPixi/legacy captureへ戻る抜け道を塞いだ。
- 版を `0.1.1-Beta-215y` に更新した。

### 検証
- `npm test -- sharedRendererExportFrameSource`
- `npm test -- sharedRendererExportFrameSource projectExportFrameRenderer exportDiagnosticsLog exportProgress`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererExportFrameSource\\.ts|src/utils/sharedRendererExportFrameSource\\.test\\.ts|src/utils/projectExportFrameRenderer\\.ts|src/utils/exportDiagnosticsLog\\.ts|src/utils/exportProgress\\.ts)"`

### 残課題・次のステップ
- surface gateの互換fallbackを、editor mode未対応など非動画Rust経路に限定し続ける。
- Viewport本体のPixi依存撤去へ向けて、動画以外のPixi-only presentation条件も整理する。

## 2026-06-19 — native render source準備失敗ではRust必須時のlegacy fallbackを禁止

### 実施内容
- Red: `prepareNativeRenderSources` が `staleDecodeResponse` で失敗した場合、`nativeRenderFailed` blockがlegacy canvas fallbackを許可しない契約を追加した。
- Green: native render source準備の一般失敗でも、Rust/native render必須時は `legacyCanvasFallbackAllowed=false` にした。
- Rust decode/source準備が成立しない状態を、Pixi/legacy captureで成功扱いにする抜け道を塞いだ。
- 版を `0.1.1-Beta-215x` に更新した。

### 検証
- `npm test -- sharedRendererExportFrameSource`
- `npm test -- sharedRendererExportFrameSource projectExportFrameRenderer exportDiagnosticsLog exportProgress`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererExportFrameSource\\.ts|src/utils/sharedRendererExportFrameSource\\.test\\.ts|src/utils/projectExportFrameRenderer\\.ts|src/utils/exportDiagnosticsLog\\.ts|src/utils/exportProgress\\.ts)"`

### 残課題・次のステップ
- `SharedRendererExportFrameSourceBlockedError` のdefault fallback許可をさらに絞れるか、互換fallbackとRust必須failureを分類する。
- Viewport本体のPixi依存撤去へ向けて、動画以外のPixi-only presentation条件も整理する。

## 2026-06-19 — video upload/ownership失敗ではlegacy fallbackを禁止

### 実施内容
- Red: `videoUploadFailed` と `videoOwnershipUnavailable` のexport blockで、legacy canvas fallbackを許可しない契約を追加した。
- Green: Rust video upload失敗、stale decode response、Pixi ownership残留、uploaded clip欠落のblocked errorへ `legacyCanvasFallbackAllowed=false` を渡すようにした。
- Rust decode/upload/ownership cutoverが成立していない動画exportを、Pixi/legacy captureで成功扱いにする抜け道を塞いだ。
- 版を `0.1.1-Beta-215w` に更新した。

### 検証
- `npm test -- sharedRendererExportFrameSource`
- `npm test -- sharedRendererExportFrameSource projectExportFrameRenderer exportDiagnosticsLog exportProgress`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererExportFrameSource\\.ts|src/utils/sharedRendererExportFrameSource\\.test\\.ts|src/utils/projectExportFrameRenderer\\.ts|src/utils/exportDiagnosticsLog\\.ts|src/utils/exportProgress\\.ts)"`

### 残課題・次のステップ
- remaining `fallbackToLegacyCanvas=true` を再スキャンし、互換fallbackとして残すものとRust必須で塞ぐものを分ける。
- Viewport本体のPixi依存撤去へ向けて、動画以外のPixi-only presentation条件も整理する。

## 2026-06-19 — presented shared-frame handoffではlegacy fallbackを禁止

### 実施内容
- Red: `presentedSharedFrameHandoffUnavailable` と `presentedSharedFrameHandoffFailed` のexport blockで、legacy canvas fallbackを許可しない契約を追加した。
- Green: presenter shared-frame handoff不可/失敗時の `SharedRendererExportFrameSourceBlockedError` へ `legacyCanvasFallbackAllowed=false` を渡すようにした。
- Rust direct encode用のpresented shared-frameを受け取れない状態を、Pixi/legacy captureで成功扱いにする抜け道を塞いだ。
- 版を `0.1.1-Beta-215v` に更新した。

### 検証
- `npm test -- sharedRendererExportFrameSource`
- `npm test -- sharedRendererExportFrameSource projectExportFrameRenderer exportDiagnosticsLog exportProgress`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererExportFrameSource\\.ts|src/utils/sharedRendererExportFrameSource\\.test\\.ts|src/utils/projectExportFrameRenderer\\.ts|src/utils/exportDiagnosticsLog\\.ts|src/utils/exportProgress\\.ts)"`

### 残課題・次のステップ
- remaining `fallbackToLegacyCanvas=true` のうち、video ownership / upload gateなどRust必須経路で残してよい互換fallbackかを棚卸しする。
- Viewport本体のPixi依存撤去へ向けて、動画以外のPixi-only presentation条件も整理する。

## 2026-06-19 — native renderer未接続ではRust必須時のlegacy fallbackを禁止

### 実施内容
- Red: 動画encode frameとencode-only frameでRust native renderer bridgeが未接続の場合、blocked errorがlegacy canvas fallbackを許可しない契約へ更新した。
- Green: `nativeRenderUnavailable` の `SharedRendererExportFrameSourceBlockedError` に `legacyCanvasFallbackAllowed=false` を渡すようにした。
- native renderer未接続をPixi/legacy captureへ退避させず、Rust必須exportとして明示的に停止する境界にした。
- 版を `0.1.1-Beta-215u` に更新した。

### 検証
- `npm test -- sharedRendererExportFrameSource`
- `npm test -- sharedRendererExportFrameSource projectExportFrameRenderer exportDiagnosticsLog exportProgress`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererExportFrameSource\\.ts|src/utils/sharedRendererExportFrameSource\\.test\\.ts|src/utils/projectExportFrameRenderer\\.ts|src/utils/exportDiagnosticsLog\\.ts|src/utils/exportProgress\\.ts)"`

### 残課題・次のステップ
- remaining `fallbackToLegacyCanvas=true` のうち、presented shared-frame handoff失敗/不可がRust direct encode必須時にfallback不可であるべきか整理する。
- Viewport本体のPixi依存撤去へ向けて、動画以外のPixi-only presentation条件も整理する。

## 2026-06-19 — unsupported native mediaではRust必須時のlegacy fallbackを禁止

### 実施内容
- Red: mixed video exportでoverlay mediaがRust native render未対応の場合と、encode-only media-only frameが未対応mediaの場合に、legacy canvas fallbackを許可しない契約を追加した。
- Green: `nativeRenderUnsupportedMedia` を投げる2経路へfallback可否を渡し、Rust/native render必須時は `legacyCanvasFallbackAllowed=false` にした。
- Rust必須exportで未対応mediaをPixi/legacy captureへ退避させず、未対応範囲として明示的に止めるようにした。
- 版を `0.1.1-Beta-215t` に更新した。

### 検証
- `npm test -- sharedRendererExportFrameSource`
- `npm test -- sharedRendererExportFrameSource projectExportFrameRenderer exportDiagnosticsLog exportProgress sharedRendererNativeMediaSupport`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererExportFrameSource\\.ts|src/utils/sharedRendererExportFrameSource\\.test\\.ts|src/utils/projectExportFrameRenderer\\.ts|src/utils/exportDiagnosticsLog\\.ts|src/utils/exportProgress\\.ts|src/utils/sharedRendererNativeMediaSupport\\.ts)"`

### 残課題・次のステップ
- remaining `fallbackToLegacyCanvas=true` のうち、動画export/Rust必須経路に該当するものをさらに棚卸しする。
- Viewport本体のPixi依存撤去へ向けて、動画以外のPixi-only presentation条件も整理する。

## 2026-06-19 — native render source release callback欠落ではlegacy fallbackを禁止

### 実施内容
- Red: decoded native render sourceにcomplete/abort release callbackがない場合、export blocked errorがlegacy canvas fallbackを許可しない契約を追加した。
- Green: `nativeRenderSourceReleaseUnavailable` の `SharedRendererExportFrameSourceBlockedError` へ `legacyCanvasFallbackAllowed=false` を渡すようにした。
- decoded sourceのrelease ownership契約が崩れた状態を、Pixi/legacy captureで成功扱いにする抜け道を塞いだ。
- 版を `0.1.1-Beta-215s` に更新した。

### 検証
- `npm test -- sharedRendererExportFrameSource`
- `npm test -- sharedRendererExportFrameSource projectExportFrameRenderer exportDiagnosticsLog exportProgress`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererExportFrameSource\\.ts|src/utils/sharedRendererExportFrameSource\\.test\\.ts|src/utils/projectExportFrameRenderer\\.ts|src/utils/exportDiagnosticsLog\\.ts|src/utils/exportProgress\\.ts)"`

### 残課題・次のステップ
- `nativeRenderUnsupportedMedia` など、Rust/native render必須時のunsupported系blocked reasonもlegacy fallback不可へ寄せるかをTDDで判断する。
- Viewport本体のPixi依存撤去へ向けて、動画以外のPixi-only presentation条件も棚卸しする。

## 2026-06-19 — native render release失敗ではlegacy fallbackを禁止

### 実施内容
- Red: source complete release失敗、native render output release失敗、source abort release失敗のexport blockで、legacy canvas fallbackを許可しない契約を追加した。
- Green: `throwNativeRenderSourceReleaseFailed` / `throwNativeRenderOutputReleaseFailed` が `legacyCanvasFallbackAllowed=false` の `SharedRendererExportFrameSourceBlockedError` を投げるようにした。
- Rust decoded sourceやnative render outputの所有権解放失敗を、Pixi/legacy captureで成功扱いにする抜け道を塞いだ。
- 版を `0.1.1-Beta-215r` に更新した。

### 検証
- `npm test -- sharedRendererExportFrameSource`
- `npm test -- sharedRendererExportFrameSource projectExportFrameRenderer exportDiagnosticsLog exportProgress`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererExportFrameSource\\.ts|src/utils/sharedRendererExportFrameSource\\.test\\.ts|src/utils/projectExportFrameRenderer\\.ts|src/utils/exportDiagnosticsLog\\.ts|src/utils/exportProgress\\.ts)"`

### 残課題・次のステップ
- `nativeRenderSourceReleaseUnavailable` やunsupported mediaなど、Rust/native render必須時にlegacy fallback不可へすべき残りreasonを順にTDDで締める。
- Viewport本体のPixi依存撤去へ向けて、動画以外のPixi-only presentation条件も棚卸しする。

## 2026-06-19 — native render失敗ではRust必須時のlegacy fallbackを禁止

### 実施内容
- Red: Rust native renderが失敗またはthrowした動画encode frameで、blocked errorがlegacy canvas fallbackを許可しない契約を追加した。
- Green: `nativeRenderFailed` を投げる経路へfallback可否を渡し、`effectiveNativeRenderRequired` の場合は `legacyCanvasFallbackAllowed=false` にした。
- 動画exportのRust必須経路でnative render bridge失敗をPixi/legacy captureへ戻して成功扱いにする抜け道を塞いだ。
- 版を `0.1.1-Beta-215q` に更新した。

### 検証
- `npm test -- sharedRendererExportFrameSource`
- `npm test -- sharedRendererExportFrameSource projectExportFrameRenderer exportDiagnosticsLog exportProgress`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererExportFrameSource\\.ts|src/utils/sharedRendererExportFrameSource\\.test\\.ts|src/utils/projectExportFrameRenderer\\.ts|src/utils/exportDiagnosticsLog\\.ts|src/utils/exportProgress\\.ts)"`

### 残課題・次のステップ
- `nativeRenderSourceReleaseFailed` / `nativeRenderOutputReleaseFailed` など、Rust/native render必須時にlegacy fallback不可へすべきrelease系blocked reasonを順にTDDで締める。
- Viewport本体のPixi依存撤去へ向けて、動画以外のPixi-only presentation条件も棚卸しする。

## 2026-06-19 — prepared source abort失敗ではlegacy fallbackを禁止

### 実施内容
- Red: export native render source準備で `preparedNativeRenderSourceAbortReleaseFailed` が発生した場合、blocked errorがlegacy canvas fallbackを許可しない契約を追加した。
- Green: 該当reasonで `SharedRendererExportFrameSourceBlockedError` を投げる時だけ、`legacyCanvasFallbackAllowed=false` を渡すようにした。
- Rust decoded slot leak防止に失敗した状態で、Pixi/legacy captureへ戻って成功扱いになる抜け道を塞いだ。
- 版を `0.1.1-Beta-215p` に更新した。

### 検証
- `npm test -- sharedRendererExportFrameSource`
- `npm test -- sharedRendererExportFrameSource projectExportFrameRenderer exportDiagnosticsLog exportProgress`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererExportFrameSource\\.ts|src/utils/sharedRendererExportFrameSource\\.test\\.ts|src/utils/projectExportFrameRenderer\\.ts|src/utils/exportDiagnosticsLog\\.ts|src/utils/exportProgress\\.ts)"`

### 残課題・次のステップ
- Rust/native render必須時の他のblocked reasonでもlegacy fallbackを禁止すべき箇所を順にTDDで締める。
- Viewport本体のPixi依存撤去へ向けて、動画以外のPixi-only presentation条件も棚卸しする。

## 2026-06-19 — presenter diagnosticsにprepared source abort診断labelを追加

### 実施内容
- Red: `preparedNativeRenderSourceAbortReleaseFailed` がpresenter datasetへ出る時、labelも読みやすい文言になる契約を追加した。
- Green: `formatNativeRenderFailureLabel` に `prepared native render source abort release failed` を追加した。
- source準備、preview upload、export frame sourceから伝播したslot leak防止失敗を、実機ログ上でも読みやすくした。
- 版を `0.1.1-Beta-215o` に更新した。

### 検証
- `npm test -- sharedRendererPresenterDiagnostics`
- `npm test -- sharedRendererPresenterDiagnostics sharedRendererPreviewPresenterController sharedRendererViewportNativeRenderUpload sharedRendererExportFrameSource`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererPresenterDiagnostics\\.ts|src/utils/sharedRendererPresenterDiagnostics\\.test\\.ts|src/utils/sharedRendererPreviewPresenterController\\.ts|src/utils/sharedRendererPreviewPresenterController\\.test\\.ts|src/utils/sharedRendererViewportNativeRenderUpload\\.ts|src/utils/sharedRendererExportFrameSource\\.ts)"`

### 残課題・次のステップ
- Pixi依存撤去へ向けて、Viewport本体の動画所有者がsharedRenderer固定になった後のlegacy fallback経路をさらに削る。
- export / preview双方で、Rust必須時にlegacy canvas/Pixi fallbackへ戻る抜け道が残っていないか再スキャンする。

## 2026-06-19 — export frame sourceでprepared source abort診断を保持

### 実施内容
- Red: native render source準備が `preparedNativeRenderSourceAbortReleaseFailed` を返した場合に、export block reasonとdataset reasonでも同じreasonを保持する契約を追加した。
- Green: `createSharedRendererExportFrameSource` が該当reasonを `nativeRenderFailed` に丸めず、`SharedRendererExportFrameSourceBlockedError` とframe diagnosticsへ渡すようにした。
- 動画exportのRust必須経路で、途中成功sourceのslot leak防止失敗をnative render bridge失敗と区別できるようにした。
- 版を `0.1.1-Beta-215n` に更新した。

### 検証
- `npm test -- sharedRendererExportFrameSource`
- `npm test -- sharedRendererViewportNativeRenderSource sharedRendererViewportNativeRenderUpload sharedRendererExportFrameSource sharedRendererPreviewPresenterController exportDiagnosticsLog exportProgress`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererViewportNativeRenderSource\\.ts|src/utils/sharedRendererViewportNativeRenderUpload\\.ts|src/utils/sharedRendererExportFrameSource\\.ts|src/utils/sharedRendererExportFrameSource\\.test\\.ts|src/utils/sharedRendererPreviewPresenterController\\.ts|src/utils/exportDiagnosticsLog\\.ts|src/utils/exportProgress\\.ts)"`

### 残課題・次のステップ
- presenter diagnosticsのdatasetにも専用reasonが表面化するか確認する。
- Pixi依存撤去へ向けて、Viewport本体の動画所有者がsharedRenderer固定になった後のlegacy fallback経路をさらに削る。

## 2026-06-19 — preview native render uploadでprepared source abort診断を保持

### 実施内容
- Red: native render source準備が `preparedNativeRenderSourceAbortReleaseFailed` を返した場合に、preview upload resultでも同じreasonを保持する契約を追加した。
- Green: `prepareSharedRendererViewportNativeRenderUpload` が該当reasonを `nativeRenderSourcesUnavailable` に丸めず返すようにした。
- preview presenter側で、途中成功sourceのslot leak防止失敗をsource準備一般失敗と区別できる足場にした。
- 版を `0.1.1-Beta-215m` に更新した。

### 検証
- `npm test -- sharedRendererViewportNativeRenderUpload`
- `npm test -- sharedRendererViewportNativeRenderSource sharedRendererViewportNativeRenderUpload sharedRendererExportFrameSource sharedRendererPreviewPresenterController`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererViewportNativeRenderSource\\.ts|src/utils/sharedRendererViewportNativeRenderSource\\.test\\.ts|src/utils/sharedRendererViewportNativeRenderUpload\\.ts|src/utils/sharedRendererViewportNativeRenderUpload\\.test\\.ts|src/utils/sharedRendererExportFrameSource\\.ts|src/utils/sharedRendererPreviewPresenterController\\.ts)"`

### 残課題・次のステップ
- export frame sourceでも `preparedNativeRenderSourceAbortReleaseFailed` を `nativeRenderFailed` に丸めず、export block reasonとして保持する。
- presenter diagnosticsのdatasetにも専用reasonが表面化するか確認する。

## 2026-06-19 — prepared native render source abort release失敗を分離

### 実施内容
- Red: multi-video native render source準備で、stale frame自身はreleaseできたが先行prepared sourceのabort releaseが失敗した場合に、専用reasonを返す契約を追加した。
- Green: prepared source abort release失敗時は `preparedNativeRenderSourceAbortReleaseFailed` を返し、stale frame自身の `staleDecodeReleaseFailed` と診断上で分離した。
- 途中成功sourceのslot leak防止失敗を、返却stale slotの後始末失敗と切り分けて追えるようにした。
- 版を `0.1.1-Beta-215l` に更新した。

### 検証
- `npm test -- sharedRendererViewportNativeRenderSource`
- `npm test -- sharedRendererViewportNativeRenderSource sharedRendererViewportNativeRenderUpload sharedRendererExportFrameSource sharedRendererPreviewPresenterController`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererViewportNativeRenderSource\\.ts|src/utils/sharedRendererViewportNativeRenderSource\\.test\\.ts|src/utils/sharedRendererViewportNativeRenderUpload\\.ts|src/utils/sharedRendererExportFrameSource\\.ts|src/utils/sharedRendererPreviewPresenterController\\.ts)"`

### 残課題・次のステップ
- 上位preview/export診断でも `preparedNativeRenderSourceAbortReleaseFailed` を専用reasonとしてdatasetやexport blockへ保持する。
- Pixi依存撤去へ向けて、Viewport本体の動画所有者がsharedRenderer固定になった後のlegacy fallback経路をさらに削る。

## 2026-06-19 — native render sourceのstale診断へclip/media idを含める

### 実施内容
- Red: native render source準備でstale job idを拒否する結果detailに、対象 `clipId` / `mediaId` を含める契約を追加した。
- Green: `buildStaleDecodedFrameDetail` にdecode requestを渡し、stale request id / stale job id / generic stale detailの末尾へ `clip=... media=...` を付けるようにした。
- preview/export側へ流れるnative render source準備失敗detailから、複数動画中のstale decode対象を追跡できるようにした。
- 版を `0.1.1-Beta-215k` に更新した。

### 検証
- `npm test -- sharedRendererViewportNativeRenderSource`
- `npm test -- sharedRendererViewportNativeRenderSource sharedRendererViewportNativeRenderUpload sharedRendererExportFrameSource sharedRendererPreviewPresenterController`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererViewportNativeRenderSource\\.ts|src/utils/sharedRendererViewportNativeRenderSource\\.test\\.ts|src/utils/sharedRendererViewportNativeRenderUpload\\.ts|src/utils/sharedRendererExportFrameSource\\.ts|src/utils/sharedRendererPreviewPresenterController\\.ts)"`

### 残課題・次のステップ
- prepared source abort release失敗時の理由を、stale frame自身のrelease失敗と区別できる診断名へ分ける。
- Pixi依存撤去へ向けて、Viewport本体の動画所有者がsharedRenderer固定になった後のlegacy fallback経路をさらに削る。

## 2026-06-19 — multi-video stale時にprepared native render sourceをabort release

### 実施内容
- Red: native render source準備で、1本目の動画sourceをpreparedにした後、2本目のRust backend decoded frame responseが別job idを返した場合に、先行sourceのslotもabort releaseする契約を追加した。
- Green: stale response自身のslot release後、関数内で既にpreparedになったsource群の `releaseAfterNativeRenderAbort` を呼び、途中成功したRust decoded slotを残さないようにした。
- multi-video preview/exportで後続staleにより処理が中断されても、Rust decode ring bufferが先行slot leakで詰まらない境界にした。
- 版を `0.1.1-Beta-215j` に更新した。

### 検証
- `npm test -- sharedRendererViewportNativeRenderSource`
- `npm test -- sharedRendererViewportNativeRenderSource sharedRendererViewportNativeRenderUpload sharedRendererExportFrameSource sharedRendererViewportVideoUpload`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererViewportNativeRenderSource\\.ts|src/utils/sharedRendererViewportNativeRenderSource\\.test\\.ts|src/utils/sharedRendererViewportNativeRenderUpload\\.ts|src/utils/sharedRendererExportFrameSource\\.ts|src/utils/sharedRendererViewportVideoUpload\\.ts)"`

### 残課題・次のステップ
- native render sourceのstale decode detailもclip/media id付きでpresenter/export診断へ残す。
- prepared source abort release失敗時の理由を、stale frame自身のrelease失敗と区別できる診断名へ分ける。

## 2026-06-19 — native render sourceのstale job idを拒否

### 実施内容
- Red: native render source準備時に、Rust backend decoded frame responseの `jobId` が要求jobと異なる場合はsource化せず、返却slotをabort releaseする契約を追加した。
- Green: `prepareSharedRendererViewportNativeRenderSources` のstale判定を `requestId` と `jobId` の両方へ広げ、releaseには返却response側の `jobId` / `slotIndex` / `generation` を使うようにした。
- 別jobのshared frame descriptorがRust native render入力へ混入する抜け道を塞いだ。
- 版を `0.1.1-Beta-215i` に更新した。

### 検証
- `npm test -- sharedRendererViewportNativeRenderSource`
- `npm test -- sharedRendererViewportNativeRenderSource rustBackendVideoDecodeControl sharedRendererRustVideoUploadPipeline sharedRendererViewportVideoUpload sharedRendererViewportNativeRenderUpload sharedRendererExportFrameSource`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererViewportNativeRenderSource\\.ts|src/utils/sharedRendererViewportNativeRenderSource\\.test\\.ts|src/utils/rustBackendVideoDecodeControl\\.ts|src/utils/sharedRendererRustVideoUploadPipeline\\.ts|src/utils/sharedRendererViewportVideoUpload\\.ts|src/utils/sharedRendererViewportNativeRenderUpload\\.ts|src/utils/sharedRendererExportFrameSource\\.ts)"`

### 残課題・次のステップ
- multi-video stale job idの専用境界テストを追加し、先行成功slotのabort releaseと同時に検証する。
- native render sourceのstale decode detailもclip/media id付きでpresenter/export診断へ残す。

## 2026-06-19 — decoded frame identityを必須にする

### 実施内容
- Red: Rust backend decoded frame responseで `jobId` が空、または `requestId` が欠落している場合、shared-memory frameとして受け入れない契約を追加した。
- Green: `isRustBackendDecodedVideoFrameAvailable` が `jobId` / `requestId` / `frameIndex` / `verification.frameIndex` / `frame.ptsFrame` を実行時検証するようにした。
- release/stale判定の前提になるidentityが壊れたresponseを、shared memory copy / WebGPU uploadへ進ませないようにした。
- 版を `0.1.1-Beta-215h` に更新した。

### 検証
- `npm test -- rustBackendVideoDecodeControl`
- `npm test -- rustBackendVideoDecodeControl sharedRendererRustVideoUploadPipeline sharedRendererViewportVideoUpload sharedRendererViewportNativeRenderSource`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/rustBackendVideoDecodeControl\\.ts|src/utils/rustBackendVideoDecodeControl\\.test\\.ts|src/utils/sharedRendererRustVideoUploadPipeline\\.ts|src/utils/sharedRendererViewportVideoUpload\\.ts|src/utils/sharedRendererViewportNativeRenderSource\\.ts)"`

### 残課題・次のステップ
- native render source側のstale decode判定も `jobId` まで確認し、返却response側のslot leaseでreleaseする。
- multi-video stale job idの専用境界テストを追加し、先行成功slotのabort releaseと同時に検証する。

## 2026-06-19 — stale decode診断をclip/media id付きで伝播

### 実施内容
- Red: stale decoded frame responseでも、Viewport upload result、presenter diagnostics input、export block messageに対象clip/media idを残す契約を追加した。
- Green: `prepareSharedRendererViewportVideoUpload(s)` がstale responseへ `uploadFailureClipId` / `uploadFailureMediaId` を添え、presenter/export resolverが `uploadFailed` 以外でもscopeを保持するようにした。
- source切替や複数動画中に起きるstale decodeを、`staleDecodeResponse clip=... media=...` として実機ログから追えるようにした。
- 版を `0.1.1-Beta-215g` に更新した。

### 検証
- `npm test -- sharedRendererViewportPresenterOrchestration sharedRendererExportFrameSource`
- `npm test -- sharedRendererViewportVideoUpload sharedRendererViewportPresenterOrchestration sharedRendererExportFrameSource`
- `npm test -- sharedRendererViewportVideoUpload sharedRendererViewportPresenterOrchestration sharedRendererPresenterDiagnostics sharedRendererExportFrameSource exportDiagnosticsLog exportProgress`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererViewportVideoUpload\\.ts|src/utils/sharedRendererViewportVideoUpload\\.test\\.ts|src/utils/sharedRendererViewportPresenterOrchestration\\.ts|src/utils/sharedRendererViewportPresenterOrchestration\\.test\\.ts|src/utils/sharedRendererExportFrameSource\\.ts|src/utils/sharedRendererExportFrameSource\\.test\\.ts|src/utils/sharedRendererPresenterDiagnostics\\.ts)"`

### 残課題・次のステップ
- multi-video stale job idの専用境界テストを追加し、先行成功slotのabort releaseと同時に検証する。
- `copyReportTargetChecksumMismatch` のclip/media id付き表示を実機GoPro素材で確認する。

## 2026-06-19 — upload buffer checksumをcopy reportと照合

### 実施内容
- Red: `copyIntoUploadBuffer` のcopy reportが成功を返しても、renderer-owned upload bufferのCRC32がreportと異なる場合はupload不可にする契約を追加した。
- Green: `prepareSharedRendererDecodedVideoFrameUpload` が `checksumAlgorithm: 'crc32'` のreportを受けた場合、copy後の `Uint8Array` からCRC32を再計算し、`copyReportTargetChecksumMismatch` でfail-loudにするようにした。
- native bridgeのreportだけでなく、実際にWebGPU uploadへ渡すbuffer内容もdata-plane検証対象にした。
- 版を `0.1.1-Beta-215f` に更新した。

### 検証
- `npm test -- sharedVideoFrameUploadBridge`
- `npm test -- sharedVideoFrameUploadBridge sharedRendererRustVideoUploadPipeline sharedRendererViewportVideoUpload sharedRendererViewportPresenterOrchestration sharedRendererPresenterDiagnostics sharedRendererExportFrameSource`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedVideoFrameUploadBridge\\.ts|src/utils/sharedVideoFrameUploadBridge\\.test\\.ts|src/utils/sharedRendererRustVideoUploadPipeline\\.ts|src/utils/sharedRendererViewportVideoUpload\\.ts|src/utils/sharedRendererViewportPresenterOrchestration\\.ts|src/utils/sharedRendererPresenterDiagnostics\\.ts|src/utils/sharedRendererExportFrameSource\\.ts)"`

### 残課題・次のステップ
- `copyReportTargetChecksumMismatch` をViewport/Export診断のclip/media id付き表示へ伝播する。
- multi-video stale job idの専用境界テストを追加し、先行成功slotのabort releaseと同時に検証する。

## 2026-06-19 — Rust decode応答job idの鮮度を確認

### 実施内容
- Red: Viewport decode orchestrationで、返却decoded frame responseの `jobId` が要求したdecode jobと異なる場合、shared memory copyへ進まない契約を追加した。
- Green: stale decoded frame判定を `requestId` と `jobId` の両方へ広げ、stale job idでは返却response側の `jobId` / `slotIndex` / `generation` を使ってabort releaseするようにした。
- source切替や複数動画中に、別jobのshared-memory slotを現在clipとしてWebGPU uploadする抜け道を塞いだ。
- 版を `0.1.1-Beta-215e` に更新した。

### 検証
- `npm test -- sharedRendererViewportVideoUpload`
- `npm test -- sharedRendererViewportVideoUpload sharedRendererRustVideoUploadPipeline rustBackendVideoDecodeControl`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererViewportVideoUpload\\.ts|src/utils/sharedRendererViewportVideoUpload\\.test\\.ts|src/utils/sharedRendererRustVideoUploadPipeline\\.ts|src/utils/rustBackendVideoDecodeControl\\.ts)"`

### 残課題・次のステップ
- multi-video stale job idの専用境界テストを追加し、先行成功slotのabort releaseと同時に検証する。
- stale decode responseのdetailをViewport presenter datasetへ構造化して表示する。

## 2026-06-19 — Rust decode検証frame indexを照合

### 実施内容
- Red: Rust backend decode responseで `verification.frameIndex` が `frameIndex` と異なる場合、shared-memory frameとして受け入れない契約を追加した。
- Green: `isRustBackendDecodedVideoFrameAvailable` が `verification.frameIndex` / `result.frameIndex` / `frame.ptsFrame` の整合を確認するようにした。
- 別フレームのchecksumでshared-memory slotを信頼してWebGPU uploadへ進む抜け道を塞いだ。
- 版を `0.1.1-Beta-215d` に更新した。

### 検証
- `npm test -- rustBackendVideoDecodeControl`
- `npm test -- rustBackendVideoDecodeControl sharedRendererRustVideoUploadPipeline sharedRendererViewportVideoUpload`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/rustBackendVideoDecodeControl\\.ts|src/utils/rustBackendVideoDecodeControl\\.test\\.ts|src/utils/sharedRendererRustVideoUploadPipeline\\.ts|src/utils/sharedRendererViewportVideoUpload\\.ts)"`

### 残課題・次のステップ
- shared-memory copy reportとWebGPU upload resultのdiagnosticをViewport/Export診断へ統合する。
- Rust decode slot release failureをUI上で構造化表示する。

## 2026-06-19 — Rust source fallback診断にreasonを含める

### 実施内容
- Red: Rust export source fallback detailに `fallback=...` と native render envelope reason/media countを含める契約を追加した。
- Green: `formatProjectExportRustFrameSourceUnavailableDetail` を追加し、`useProjectExport` がViewport fallback decisionを整形してframe source plan failureへ渡すようにした。
- preflight失敗時に `exportSessionBlocked` / `surfaceGateUnavailable` などの機械的なreasonもalert/終了後診断へ残るようにした。
- 版を `0.1.1-Beta-215c` に更新した。

### 検証
- `npm test -- projectExportFrameCanvas useProjectExportBoundary viewportRustExportFrameSource viewportRustVideoOnlyBoundary`
- `npm test -- projectExportFrameCanvas useProjectExportBoundary viewportRustExportFrameSource viewportRustVideoOnlyBoundary exportProgress exportDiagnosticsLog ExportProgressModal projectExportFrameRenderer`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/projectExportFrameCanvas\\.ts|src/utils/projectExportFrameCanvas\\.test\\.ts|src/hooks/useProjectExport\\.ts|src/utils/useProjectExportBoundary\\.test\\.ts|src/utils/viewportRustExportFrameSource\\.ts|src/utils/viewportRustExportFrameSource\\.test\\.ts|src/components/Viewport\\.tsx)"`

### 残課題・次のステップ
- native render envelopeのdiagnosticをUI上で構造化表示する。
- Rust backend decodeとshared memory/mmap data-planeの所有権cutoverを、Viewport側の実フレームhandoffまでさらに固定する。

## 2026-06-19 — Rust source fallback詳細をexport失敗へ渡す

### 実施内容
- Red: ViewportのRust export source preflight失敗detailを、`useProjectExport` のRust frame source plan failureへ渡す契約を追加した。
- Green: `ProjectExportRustFrameSourceContext` に `onFrameSourceUnavailable` を追加し、Viewportのfallback decision detailをhookへ報告するようにした。
- `buildProjectExportFrameSourcePlan` がRust source未取得時のdetailをplan failure文面へ付加し、alert/終了後診断でpreflight失敗理由を追えるようにした。
- 版を `0.1.1-Beta-215b` に更新した。

### 検証
- `npm test -- projectExportFrameCanvas viewportRustExportFrameSource useProjectExportBoundary viewportRustVideoOnlyBoundary`
- `npm test -- projectExportFrameCanvas viewportRustExportFrameSource useProjectExportBoundary viewportRustVideoOnlyBoundary exportProgress exportDiagnosticsLog ExportProgressModal projectExportFrameRenderer`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/projectExportFrameCanvas\\.ts|src/utils/projectExportFrameCanvas\\.test\\.ts|src/utils/viewportRustExportFrameSource\\.ts|src/utils/viewportRustExportFrameSource\\.test\\.ts|src/components/Viewport\\.tsx|src/hooks/useProjectExport\\.ts|src/utils/useProjectExportBoundary\\.test\\.ts|src/utils/viewportRustVideoOnlyBoundary\\.test\\.ts)"`

### 残課題・次のステップ
- fallback detailだけでなく、native render envelopeのreason/media countも終了後診断に含める。
- Rust backend decodeとshared memory/mmap data-planeの所有権cutoverを、Viewport側の実フレームhandoffまでさらに固定する。

## 2026-06-19 — Rust export preflightで終端フレームを確認

### 実施内容
- Red: ViewportのRust export source preflightがobject開始時刻だけでなく、最後に表示されるフレーム時刻も確認する契約を追加した。
- Green: `buildViewportRustExportPreflightTimes` にfpsを渡し、`startTime + duration - 1 / fps` をpreflight対象へ追加するようにした。
- 動画やnative render sourceが終端付近だけWebGPU/native render envelopeで失敗するケースを、export source生成前に検出しやすくした。
- 版を `0.1.1-Beta-215a` に更新した。

### 検証
- `npm test -- viewportRustExportFrameSource`
- `npm test -- viewportRustExportFrameSource viewportRustVideoOnlyBoundary projectExportFrameRenderer projectExportFrameCanvas useProjectExportBoundary`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/viewportRustExportFrameSource\\.ts|src/utils/viewportRustExportFrameSource\\.test\\.ts|src/components/Viewport\\.tsx|src/utils/projectExportFrameRenderer\\.ts|src/utils/projectExportFrameCanvas\\.ts)"`

### 残課題・次のステップ
- preflight失敗時の診断をexport failure alertにも統合し、終端フレームで詰まった理由をユーザー側から追いやすくする。
- Rust backend decodeとshared memory/mmap data-planeの所有権cutoverを、Viewport側のRust frame source生成から実フレームhandoffまでさらに固定する。

## 2026-06-19 — blocked Rust frameでlegacy captureを拒否

### 実施内容
- Red: `rustFrameSourceBlocked: true` かつ `rustFrameSourceBlockedFallback: 'failExport'` のframeがlegacy canvas captureへ戻らない契約を追加した。
- Green: `renderProjectExportFrame` が `shouldFailOnRustFrameSourceBlocked` のruntime planを受けた場合、canvas解決前に即失敗するようにした。
- video/Rust backend encode必須経路で、一度blockedになったRust frame sourceが後続フレームでlegacy captureへ退避する抜け道を塞いだ。
- 版を `0.1.1-Beta-214b` に更新した。

### 検証
- `npm test -- projectExportFrameRenderer`
- `npm test -- projectExportFrameRenderer projectExportFrameCanvas projectExportRustEncodeFrame useProjectExportBoundary exportProgress exportDiagnosticsLog`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/projectExportFrameRenderer\\.ts|src/utils/projectExportFrameRenderer\\.test\\.ts|src/hooks/useProjectExport\\.ts|src/utils/projectExportFrameCanvas\\.ts|src/utils/useProjectExportBoundary\\.test\\.ts)"`

### 残課題・次のステップ
- legacy fallbackが許可されるnon-video compatibility exportだけでcanvas captureに進む実行テストを追加する。
- Rust backend decodeとshared memory/mmap data-planeの所有権cutoverを、Viewport側のRust frame source生成まで含めて固定する。

## 2026-06-19 — Rust ready frameでlegacy captureを遮断

### 実施内容
- Red: Rust shared-frame sourceがreadyな1フレーム描画で `renderScene` / `getExportCanvas` / legacy canvas captureを呼ばない契約を追加した。
- Green: `projectExportFrameRenderer` を追加し、hook内の1フレーム描画分岐を実行テスト可能なrendererへ委譲した。
- blocked診断はrendererで生成し、hookは `rustFrameSourceBlocked` としてprogressへ保存する責務に寄せた。
- required Rust sourceがblockedで失敗する場合はfallback warningを出さず、legacy fallbackが実際に使われる場合だけwarningできるように分離した。
- 版を `0.1.1-Beta-214a` に更新した。

### 検証
- `npm test -- projectExportFrameRenderer useProjectExportBoundary`
- `npm test -- projectExportFrameRenderer projectExportFrameCanvas projectExportRustEncodeFrame useProjectExportBoundary exportProgress exportDiagnosticsLog`
- `npx tsc --noEmit 2>&1 | rg "(src/hooks/useProjectExport\\.ts|src/utils/projectExportFrameRenderer\\.ts|src/utils/projectExportFrameRenderer\\.test\\.ts|src/utils/useProjectExportBoundary\\.test\\.ts|src/utils/projectExportFrameCanvas\\.ts|src/utils/projectExportRustEncodeFrame\\.ts)"`

### 残課題・次のステップ
- `renderProjectExportFrame` のlegacy fallback経路にも実行テストを追加し、non-video compatibility exportの退避路を明確化する。
- Rust backend decodeとshared memory/mmap data-planeの所有権cutoverを、Viewport側のRust frame source生成まで含めてさらに固定する。

## 2026-06-19 — Rust frame source plan failure診断を保持

### 実施内容
- Red: Rust frame source plan段階で `rustFrameSourceRequired` / `exportFrameSourceUnavailable` になった場合も、終了後診断へ残す契約を追加した。
- Green: `ExportProgress` / `ExportDiagnostics` に `exportFrameSourcePlanFailure` を追加し、`initialFrameSourcePlan` 失敗時にprogressへ保存するようにした。
- DevToolsログと終了後診断toastにもplan failureを表示し、shared-frame Rust source未接続やbitmap-only source拒否を後から追えるようにした。
- 版を `0.1.1-Beta-213b` に更新した。

### 検証
- `npm test -- exportProgress exportDiagnosticsLog ExportProgressModal useProjectExportBoundary`
- `npm test -- exportDiagnosticsLog exportProgressDiagnostics useProjectExportBoundary ExportProgressModal exportProgress`
- `npx tsc --noEmit 2>&1 | rg "(src/store/useStore\\.ts|src/store/exportProgress\\.test\\.ts|src/utils/exportDiagnosticsLog\\.ts|src/utils/exportDiagnosticsLog\\.test\\.ts|src/components/ExportProgressModal\\.tsx|src/components/ExportProgressModal\\.test\\.ts|src/hooks/useProjectExport\\.ts|src/utils/useProjectExportBoundary\\.test\\.ts)"`

### 残課題・次のステップ
- Rust frame source ready時のhook実行テストをさらに強め、legacy canvas captureが呼ばれないことを実行レベルで固定する。
- plan failure診断を必要に応じてexport failure alertの文面にも統合する。

## 2026-06-19 — video exportでshared-frame Rust sourceを必須化

### 実施内容
- Red: video exportにbitmap-only Rust frame sourceが渡された場合、plan段階で拒否する契約を追加した。
- Green: `buildProjectExportFrameSourcePlan` でvideo exportまたはRust必須export時に `renderEncodeFrame` を持つshared-frame Rust sourceだけを受け入れるようにした。
- video exportが `ImageBitmap` / legacy canvas fallback前提のRust sourceを通らず、Rust shared-memory/shared-frame encode経路を要求するようにした。
- 版を `0.1.1-Beta-213a` に更新した。

### 検証
- `npm test -- projectExportFrameCanvas`
- `npm test -- projectExportFrameCanvas projectExportRustEncodeFrame useProjectExportBoundary`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/projectExportFrameCanvas\\.ts|src/utils/projectExportFrameCanvas\\.test\\.ts|src/utils/projectExportRustEncodeFrame\\.ts|src/utils/projectExportRustEncodeFrame\\.test\\.ts|src/hooks/useProjectExport\\.ts)"`

### 残課題・次のステップ
- Rust frame source ready時のhook実行テストをさらに強め、legacy canvas captureが呼ばれないことを実行レベルで固定する。
- Rust-only non-video exportでbitmap-only sourceが拒否された時のUI診断を必要に応じて追加する。

## 2026-06-19 — 終了後Rust診断を画面表示

### 実施内容
- Red: `lastExportDiagnostics` を終了後表示用の診断行に変換する契約を追加した。
- Green: `ExportProgressModal` がexport中でない場合でも `lastExportDiagnostics` を小さな診断toastとして表示するようにした。
- Rust frame source blocked/native render output release診断を、DevToolsログだけでなく画面上でも確認できるようにした。
- 版を `0.1.1-Beta-212a` に更新した。

### 検証
- `npm test -- ExportProgressModal`
- `npm test -- exportDiagnosticsLog exportProgressDiagnostics useProjectExportBoundary ExportProgressModal exportProgress`
- `npx tsc --noEmit 2>&1 | rg "(src/components/ExportProgressModal\\.tsx|src/components/ExportProgressModal\\.test\\.ts|src/index\\.css|src/store/useStore\\.ts|src/utils/exportDiagnosticsLog\\.ts)"`

### 残課題・次のステップ
- Rust frame source ready時のbrowser fallback遮断を統合テストで固定する。
- 必要なら終了後診断toastのdismiss操作を追加する。

## 2026-06-19 — export終了後Rust診断をログ出力

### 実施内容
- Red: `lastExportDiagnostics` をDevToolsログ向けに1行要約し、診断がない場合はログを出さない契約を追加した。
- Green: `formatLastExportDiagnosticsLog` / `logLastExportDiagnostics` を追加し、Rust frame source blocked/native render output release診断を要約できるようにした。
- `useProjectExport` の終了処理で `setExporting(false)` 後に `lastExportDiagnostics` をログ出力し、モーダルが消えた後も実機調査で診断を拾えるようにした。
- 版を `0.1.1-Beta-211i` に更新した。

### 検証
- `npm test -- exportDiagnosticsLog useProjectExportBoundary`
- `npm test -- exportDiagnosticsLog exportProgressDiagnostics useProjectExportBoundary ExportProgressModal exportProgress`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/exportDiagnosticsLog\\.ts|src/utils/exportDiagnosticsLog\\.test\\.ts|src/hooks/useProjectExport\\.ts|src/utils/useProjectExportBoundary\\.test\\.ts|src/store/useStore\\.ts)"`

### 残課題・次のステップ
- Rust frame source ready時のbrowser fallback遮断を統合テストで固定する。
- 必要なら `lastExportDiagnostics` を開発者向けUIにも表示する。

## 2026-06-19 — Rust block reasonの表示ラベルを追加

### 実施内容
- Red: `nativeRenderSourceReleaseFailed` と `presentedSharedFrameHandoffFailed` をraw reasonではなく読める診断ラベルで表示する契約を追加した。
- Green: `ExportProgressModal` のRust frame source blocked formatterへnative render source release失敗とpresented shared-frame handoff失敗のラベルを追加した。
- native render output/source release失敗とshared-frame handoff失敗をUI診断で切り分けやすくした。
- 版を `0.1.1-Beta-211h` に更新した。

### 検証
- `npm test -- ExportProgressModal`
- `npm test -- exportProgressDiagnostics useProjectExportBoundary ExportProgressModal exportProgress`
- `npx tsc --noEmit 2>&1 | rg "(src/components/ExportProgressModal\\.tsx|src/components/ExportProgressModal\\.test\\.ts|src/store/useStore\\.ts|src/store/exportProgress\\.test\\.ts)"`

### 残課題・次のステップ
- `lastExportDiagnostics` を開発者向けUIまたは診断ログへ表示/出力する導線を追加する。
- Rust frame source ready時のbrowser fallback遮断を統合テストで固定する。

## 2026-06-19 — export終了後にRust診断を保持

### 実施内容
- Red: export終了で `exportProgress` がクリアされた後も、Rust frame source blocked/native render release診断を `lastExportDiagnostics` に残す契約を追加した。
- Green: `useStore` に `ExportDiagnostics` と診断抽出処理を追加し、`setExporting(false)` で直近Rust診断を保存するようにした。
- 新しいexport開始時には古い `lastExportDiagnostics` をクリアし、前回診断の混入を避けるようにした。
- 版を `0.1.1-Beta-211g` に更新した。

### 検証
- `npm test -- exportProgress`
- `npm test -- exportProgressDiagnostics useProjectExportBoundary ExportProgressModal exportProgress`
- `npx tsc --noEmit 2>&1 | rg "(src/store/useStore\\.ts|src/store/exportProgress\\.test\\.ts|src/utils/exportProgressDiagnostics\\.ts|src/hooks/useProjectExport\\.ts)"`

### 残課題・次のステップ
- `lastExportDiagnostics` を開発者向けUIまたは診断ログへ表示/出力する導線を追加する。
- Rust frame source ready時のbrowser fallback遮断を統合テストで固定する。

## 2026-06-19 — export progress診断保持を共通化

### 実施内容
- Red: `updateExportProgressPhase` が既存のRust frame source blocked/native render release診断を保持したままphase/counterを更新する契約を追加した。
- Green/Refactor: `useProjectExport` のrendering/saving進捗更新を `updateExportProgressPhase` へ寄せ、診断保持の重複実装を減らした。
- 今後Rust export診断フィールドが増えても、phase更新で消しにくい構造にした。
- 挙動変更ではないため版は `0.1.1-Beta-211f` のまま維持した。

### 検証
- `npm test -- exportProgressDiagnostics useProjectExportBoundary ExportProgressModal exportProgress`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/exportProgressDiagnostics\\.ts|src/utils/exportProgressDiagnostics\\.test\\.ts|src/hooks/useProjectExport\\.ts|src/utils/useProjectExportBoundary\\.test\\.ts)"`

### 残課題・次のステップ
- export完了後の診断履歴保存や実機ログ出力の導線を検討する。
- Rust frame source ready時のbrowser fallback遮断を統合テストで固定する。

## 2026-06-19 — savingでもRust export診断を保持

### 実施内容
- Red: Rust exportが `saving` phaseへ進む時も、既存のRust frame source blocked/native render release診断を保持する契約を追加した。
- Green: `useProjectExport` のsaving進捗更新で現在の `ExportProgress` を引き継ぎ、診断フィールドを消さないようにした。
- export完了直前のモーダルでもRust側のblock/detail/release情報を確認できるようにした。
- 版を `0.1.1-Beta-211f` に更新した。

### 検証
- `npm test -- useProjectExportBoundary ExportProgressModal exportProgress`
- `npx tsc --noEmit 2>&1 | rg "(src/hooks/useProjectExport\\.ts|src/utils/useProjectExportBoundary\\.test\\.ts|src/components/ExportProgressModal\\.tsx|src/store/useStore\\.ts)"`

### 残課題・次のステップ
- export完了後に診断を履歴/ログとして保存するか検討する。
- Rust frame source ready時のbrowser fallback遮断を、hookの文字列境界ではなく統合テストでも固定する。

## 2026-06-19 — export progressのRust block診断を保持

### 実施内容
- Red: Rust/shared renderer frame source blocked診断が、その後のrendering progress tickで消えない契約を追加した。
- Green: `useProjectExport` の進捗更新時に既存 `ExportProgress` を保持し、`rustFrameSourceBlocked` / `nativeRenderOutputRelease` などの診断を残すようにした。
- fallback継続時でもRust frame sourceがなぜ止まったかをExportProgressModalで追えるようにした。
- 版を `0.1.1-Beta-211e` に更新した。

### 検証
- `npm test -- useProjectExportBoundary ExportProgressModal exportProgress`
- `npx tsc --noEmit 2>&1 | rg "(src/hooks/useProjectExport\\.ts|src/utils/useProjectExportBoundary\\.test\\.ts|src/components/ExportProgressModal\\.tsx|src/store/useStore\\.ts)"`

### 残課題・次のステップ
- 次はRust frame source ready時に `VideoFrameProvider` / `HTMLVideoElement` seek fallbackが絶対に起動しない境界をさらに確認する。
- 実機exportでblocked診断が最後までモーダルに残るか確認する。

## 2026-06-19 — export progressでRust block detailを表示

### 実施内容
- Red: Rust/shared renderer frame sourceがblockedになった時、`error.message` を `ExportProgress.rustFrameSourceBlocked.detail` として保持し、ExportProgressModalで表示する契約を追加した。
- Green: `useProjectExport` からblocked error detailをprogressへ渡し、`videoOwnershipUnavailable` を「動画所有権未移管」として読める診断にした。
- exportで不足upload clipを検出した時、UI上でも `missing uploaded video clips: ...` まで追えるようにした。
- 版を `0.1.1-Beta-211d` に更新した。

### 検証
- `npm test -- ExportProgressModal exportProgress useProjectExportBoundary`
- `npx tsc --noEmit 2>&1 | rg "(src/components/ExportProgressModal\\.tsx|src/components/ExportProgressModal\\.test\\.ts|src/store/useStore\\.ts|src/store/exportProgress\\.test\\.ts|src/hooks/useProjectExport\\.ts|src/utils/useProjectExportBoundary\\.test\\.ts)"`

### 残課題・次のステップ
- Rust frame source blocked detailを、失敗だけでなくfallback継続時の実機ログ/diagnostic exportにも残すか検討する。
- 次は `HTMLVideoElement` / legacy canvas fallback が動画exportで残る入口をさらにfail-loud化する。

## 2026-06-19 — exportで不足upload clip診断をblock

### 実施内容
- Red: presenterが `videoUploadMissingClipIds` をdatasetへ残したexport frameでは、video ownershipがsharedRendererでもblockedにする契約を追加した。
- Green: export frame sourceのvideo ownership判定でpresenter datasetの不足clip診断を読み、`videoOwnershipUnavailable` としてfail-loudにした。
- previewで検出したmulti-video不足uploadがexport時にcanvas captureへ進まないようにした。
- 版を `0.1.1-Beta-211c` に更新した。

### 検証
- `npm test -- sharedRendererExportFrameSource`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererExportFrameSource\\.ts|src/utils/sharedRendererExportFrameSource\\.test\\.ts)"`

### 残課題・次のステップ
- `videoUploadMissingClipIds` をExportProgressModalにも表示するか検討する。
- 実機GoPro複数素材で不足clip診断がpreview/export双方で同じclip idを示すか確認する。

## 2026-06-19 — multi-video不足upload clip診断を保持

### 実施内容
- Red: multi-video previewで一部clipのdecoded uploadが不足している場合、datasetに `videoUploadMissingClipIds` を残す契約を追加した。
- Green: Rust decode requestのclip一覧とupload成功clip一覧を比較し、不足clipを `videoUploadMissingClip` 診断としてready/fallback datasetへ渡すようにした。
- 部分Rust所有を許しつつ、GoPro複数素材で「どの動画clipがRust upload未到達か」を追えるようにした。
- 版を `0.1.1-Beta-211b` に更新した。

### 検証
- `npm test -- sharedRendererPreviewPresenterController`
- `npm test -- sharedRendererPresenterDiagnostics sharedRendererPreviewPresenterController`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererPresenterDiagnostics\\.ts|src/utils/sharedRendererPresenterDiagnostics\\.test\\.ts|src/utils/sharedRendererPreviewPresenterController\\.ts|src/utils/sharedRendererPreviewPresenterController\\.test\\.ts)"`

### 残課題・次のステップ
- export側にも不足clip診断が必要か、native render source preparationの失敗detailと突き合わせて確認する。
- 実機GoPro素材で `videoUploadMissingClipIds` がdatasetに出るか確認し、UI表示へ必要なら接続する。

## 2026-06-19 — fallback時のvideo upload失敗診断を保持

### 実施内容
- Red: presenter fallback時にも `videoUploadFailureReason` / `detail` / `clipId` / `mediaId` をdatasetへ残す契約を追加した。
- Green: `writeSharedRendererPresenterDiagnostics` のfallback分岐でvideo upload失敗診断を書き出すようにした。
- multi-videoで単一uploadを拒否した場合やRust必須video ownership失敗時に、失敗理由が実機datasetから消えないようにした。
- 版を `0.1.1-Beta-211a` に更新した。

### 検証
- `npm test -- sharedRendererPresenterDiagnostics`
- `npm test -- sharedRendererPresenterDiagnostics sharedRendererPreviewPresenterController`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererPresenterDiagnostics\\.ts|src/utils/sharedRendererPresenterDiagnostics\\.test\\.ts|src/utils/sharedRendererPreviewPresenterController\\.ts|src/utils/sharedRendererPreviewPresenterController\\.test\\.ts)"`

### 残課題・次のステップ
- multi-videoで不足clipがある場合に、どのclipのdecoded uploadが不足したかをpreview/exportのUIへさらに見えやすくする。
- 実機GoPro素材で `videoUploadFailureReason` と `videoCutoverReason` の組み合わせを確認し、Rust経路の詰まりをdatasetから追えるか検証する。

## 2026-06-19 — multi-videoで単一upload所有を拒否

### 実施内容
- Red: 複数video clipを含むpreviewでlegacy単一decoded uploadが渡っても、全videoをRust/shared renderer所有扱いにしない契約を追加した。
- Green: 単一decoded uploadはscene内のVideo clipが1つだけでclipId/mediaIdを一意に解決できる場合だけ採用し、multi-videoではupload済み所有へ進めないようにした。
- multi-video previewで同じRust textureを複数video planeへ誤って使い回す入口を閉じた。
- 版を `0.1.1-Beta-210z` に更新した。

### 検証
- `npm test -- sharedRendererPreviewPresenterController`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererPreviewPresenterController\\.ts|src/utils/sharedRendererPreviewPresenterController\\.test\\.ts)"`

### 残課題・次のステップ
- multi-videoで各clipのdecoded uploadが揃わない場合のUI診断をさらに具体化し、GoPro複数素材でも不足clipを追えるようにする。
- 次の版更新では `SubVer=z` のため `0.1.1-Beta-211a` へ繰り上げる。

## 2026-06-19 — native render release失敗時のexport path診断を保持

### 実施内容
- Red: native render後のsource complete/abort release失敗とoutput release失敗でも `uxfdRustExportFrameSourceFramePath=nativeRenderSharedFrame` を残す契約を追加した。
- Green: `nativeRenderSourceReleaseFailed` / `nativeRenderOutputReleaseFailed` の診断に `nativeRenderSharedFrame` pathを付与した。
- render前の `nativeRenderSourceReleaseUnavailable` は未到達blockedとしてpath未設定のまま残し、release ownership不足とrender後cleanup失敗を区別できるようにした。
- 版を `0.1.1-Beta-210y` に更新した。

### 検証
- `npm test -- sharedRendererExportFrameSource`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererExportFrameSource\\.ts|src/utils/sharedRendererExportFrameSource\\.test\\.ts)"`

### 残課題・次のステップ
- export側blocked診断とpreview側ownership診断のreason/pathを揃え、GoPro素材で失敗原因を一貫して追えるようにする。
- 次はRust必須preview/exportでHTMLVideoElement/Pixi video fallbackへ戻る入口をさらに狭める。

## 2026-06-19 — native render失敗時のexport frame path診断を保持

### 実施内容
- Red: Rust native render bridgeがthrowしたblocked exportでも `uxfdRustExportFrameSourceFramePath=nativeRenderSharedFrame` を残す契約を追加した。
- Green: native renderを実際に呼び出した後の `nativeRenderFailed` 診断に `nativeRenderSharedFrame` pathを付与し、未到達blockedと区別できるようにした。
- export実機datasetで「native renderへ入ろうとして失敗した」状態を追いやすくした。
- 版を `0.1.1-Beta-210x` に更新した。

### 検証
- `npm test -- sharedRendererExportFrameSource`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererExportFrameSource\\.ts|src/utils/sharedRendererExportFrameSource\\.test\\.ts)"`

### 残課題・次のステップ
- native render source/output release失敗時にもpath診断を広げるか、実機datasetで必要性を確認する。
- export側blocked診断とpreview側ownership診断のreason/pathを揃え、GoPro素材で失敗原因を一貫して追えるようにする。

## 2026-06-19 — Rust必須video ownership失敗診断を保持

### 実施内容
- Red: `requiredVideoOwnershipUnavailable` のfail-loud fallbackでも `videoOwner` / `videoCutoverReason` / `sharedVideoObjectCount` をdatasetへ残す契約を追加した。
- Green: `writeSharedRendererPresenterDiagnostics` のfallback stateにvideo ownership診断を許可し、presenterのRust必須失敗分岐から実際のownership結果を渡すようにした。
- Rust video-only previewで「なぜsharedRenderer所有へ移れなかったか」を実機datasetから追えるようにした。
- 版を `0.1.1-Beta-210w` に更新した。

### 検証
- `npm test -- sharedRendererPresenterDiagnostics sharedRendererPreviewPresenterController`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererPresenterDiagnostics\\.ts|src/utils/sharedRendererPresenterDiagnostics\\.test\\.ts|src/utils/sharedRendererPreviewPresenterController\\.ts|src/utils/sharedRendererPreviewPresenterController\\.test\\.ts)"`

### 残課題・次のステップ
- 実機Rust video-only previewで `requiredVideoOwnershipUnavailable` 時の `videoCutoverReason` が `videoFrameUploadUnavailable` / `rustDecodeRequestUnavailable` などへ正しく分岐することを確認する。
- export側blocked診断とpreview側ownership診断のreasonを揃え、GoPro素材で失敗原因を一貫して追えるようにする。

## 2026-06-19 — Rust video plane必須時のloader診断をfail-loud化

### 実施内容
- Red: Rust video plane control必須時にWASM vertex scene builderのload失敗を「TypeScript fallback」と表現しない契約を追加した。
- Green: `loadSharedRendererRustVideoPlaneVertexSceneBuilder` に `fallbackAllowed` を追加し、Rust必須時は `Rust video control plane is required` の診断へ切り替えた。
- `startSharedRendererPreviewPresenter` からvideo plane builderにも `fallbackAllowed: !requireRustVideoControlPlane` を渡し、decode request builderと診断方針を揃えた。
- 版を `0.1.1-Beta-210v` に更新した。

### 検証
- `npm test -- sharedRendererRustVideoPlaneScene`
- `npm test -- sharedRendererRustVideoPlaneScene sharedRendererPreviewPresenterController viewportRustVideoOnlyBoundary`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererRustVideoPlaneScene\\.ts|src/utils/sharedRendererRustVideoPlaneScene\\.test\\.ts|src/utils/sharedRendererPreviewPresenterController\\.ts|src/utils/sharedRendererPreviewPresenterController\\.test\\.ts|src/utils/viewportRustVideoOnlyBoundary\\.test\\.ts)"`

### 残課題・次のステップ
- Rust video-only previewで、video plane scene builder / decode request builderの双方がRust必須診断へ揃っていることを実機datasetでも確認する。
- 通常互換previewのTypeScript fallbackを診断用に残しつつ、Rust必須検証でfallback文言が混ざらない状態を維持する。

## 2026-06-19 — Rust video control-plane必須時のloader診断をfail-loud化

### 実施内容
- Red: Rust video control-plane必須時にWASM decode request builderのload失敗を「TypeScript fallback」と表現しない契約を追加した。
- Green: `loadSharedRendererRustVideoFrameDecodeRequestBuilder` に `fallbackAllowed` を追加し、Rust必須時は `Rust video control plane is required` の診断へ切り替えた。
- `startSharedRendererPreviewPresenter` から `fallbackAllowed: !requireRustVideoControlPlane` を渡し、Rust video-only previewのfail-loud挙動と警告文言を揃えた。
- 版を `0.1.1-Beta-210u` に更新した。

### 検証
- `npm test -- sharedRendererRustVideoDecodeRequest`
- `npm test -- sharedRendererRustVideoDecodeRequest sharedRendererPreviewPresenterController viewportRustVideoOnlyBoundary`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererRustVideoDecodeRequest\\.ts|src/utils/sharedRendererRustVideoDecodeRequest\\.test\\.ts|src/utils/sharedRendererPreviewPresenterController\\.ts|src/utils/sharedRendererPreviewPresenterController\\.test\\.ts|src/utils/viewportRustVideoOnlyBoundary\\.test\\.ts)"`

### 残課題・次のステップ
- Rust video-only時のvideo plane scene builder側も、必要なら同じ `fallbackAllowed` 診断へ揃える。
- 通常互換previewではTypeScript fallbackを残しつつ、Rust必須検証ではfallback診断が混ざらない状態を維持する。

## 2026-06-19 — presented-frame preload境界から旧writer語彙を削除

### 実施内容
- Red: `electron/preload.ts` のpresented-frame handoff契約に `SharedVideoFrameWritableResult` が残らない境界テストを追加した。
- Green: preload内のhandoff結果型を `SharedVideoFramePresentedFrameResult` へ改名し、旧JS writable shared-frame writer語彙をrenderer公開境界から外した。
- `takePresentedFrameSharedFrame` をnative handoff専用の名前へ揃え、`createWritableSharedFrameRing` 系の旧経路と混同しにくくした。
- 版を `0.1.1-Beta-210t` に更新した。

### 検証
- `npm test -- sharedVideoFrameUploadBridgeBoundary`
- `npm test -- sharedVideoFrameUploadBridgeBoundary sharedVideoFramePresentedFrameHandoffBoundary`
- `npx tsc --noEmit 2>&1 | rg "(electron/preload\\.ts|src/utils/sharedVideoFrameUploadBridgeBoundary\\.test\\.ts|src/utils/sharedVideoFramePresentedFrameHandoffBoundary\\.test\\.ts)"`

### 残課題・次のステップ
- N-API addon内に残る低レベル writable ring API がrenderer公開面へ再露出しないことを境界テストで継続監視する。
- presented-frame handoff / native render / Rust encode のshared-frame data-planeを、旧JS writerに戻らない形で統合し続ける。

## 2026-06-19 — fallback不可blocked objectをtype guardで認識

### 実施内容
- Red: `fallbackToLegacyCanvas=false` / `legacyCanvasFallbackAllowed=false` の構造的blocked objectも `isSharedRendererExportFrameSourceBlockedError` が認識する契約を追加した。
- Green: type guardの構造判定を `fallbackToLegacyCanvas === true` からboolean許容へ変更し、fallback不可診断をrealm越え/fixtureでも扱えるようにした。
- 動画exportでlegacy fallback不可を明示する診断オブジェクトを、hook側のblocked処理が取りこぼさないようにした。
- 版を `0.1.1-Beta-210s` に更新した。

### 検証
- `npm test -- sharedRendererExportFrameSource`
- `npm test -- sharedRendererExportFrameSource sharedRendererExportFrameSourceBoundary useProjectExportBoundary`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererExportFrameSource\\.ts|src/utils/sharedRendererExportFrameSource\\.test\\.ts|src/hooks/useProjectExport\\.ts|src/components/ExportProgressModal\\.tsx)"`

### 残課題・次のステップ
- 実機動画exportでfallback不可のblocked objectがUI進捗へ確実に伝搬することを確認する。
- Rust native render / shared-frame pathの実機失敗reasonが、legacy fallback不可として一貫表示されることを確認する。

## 2026-06-19 — Rust frame source blocked時のfallback可否を同期

### 実施内容
- Red: 動画bitmap capture禁止時の `SharedRendererExportFrameSourceBlockedError` が `fallbackToLegacyCanvas=false` / `legacyCanvasFallbackAllowed=false` を示す契約へ更新した。
- Green: `fallbackToLegacyCanvas` を固定trueではなく `legacyCanvasFallbackAllowed` と同期させ、fail-loudな動画export診断でlegacy fallback可能に見えないようにした。
- export progress / blocked error上のfallback可否と、実際の動画Rust-only方針を揃えた。
- 版を `0.1.1-Beta-210r` に更新した。

### 検証
- `npm test -- sharedRendererExportFrameSource`
- `npm test -- sharedRendererExportFrameSource sharedRendererExportFrameSourceBoundary useProjectExportBoundary`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererExportFrameSource\\.ts|src/utils/sharedRendererExportFrameSource\\.test\\.ts|src/hooks/useProjectExport\\.ts|src/components/ExportProgressModal\\.tsx)"`

### 残課題・次のステップ
- 実機動画exportでRust frame source blocked時にUIが `legacy fallback不可` を表示することを確認する。
- 動画exportのfail-loud理由が `nativeRenderUnavailable` / `videoBitmapCaptureDisabled` などに正しく分岐することを確認する。

## 2026-06-19 — export sourceのcanvas captureをadapterへ隔離

### 実施内容
- Red: `sharedRendererExportFrameSource` 本体に `createImageBitmap(` を残さず、browser canvas captureを `projectExportLegacyCanvasCapture` adapterへ閉じ込める境界契約を追加した。
- Green: export sourceのdefault bitmap factoryを `captureProjectExportLegacyCanvasFrame` 経由に変更し、adapter側に `sx` / `sy` を追加して元のcapture矩形を保持した。
- 非動画互換のcanvas capture語彙をadapterへ集約し、動画/Rust export source本体からbrowser capture依存をさらに遠ざけた。
- 版を `0.1.1-Beta-210q` に更新した。

### 検証
- `npm test -- sharedRendererExportFrameSourceBoundary`
- `npm test -- projectExportLegacyCanvasCapture`
- `npm test -- sharedRendererExportFrameSource sharedRendererExportFrameSourceBoundary projectExportLegacyCanvasCapture`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererExportFrameSource\\.ts|src/utils/sharedRendererExportFrameSourceBoundary\\.test\\.ts|src/utils/projectExportLegacyCanvasCapture\\.ts|src/utils/projectExportLegacyCanvasCapture\\.test\\.ts)"`

### 残課題・次のステップ
- `videoExportPipeline` などWebCodecs互換adapter内のbrowser capture語彙が、非動画互換export専用に留まっていることを継続確認する。
- 動画exportでは `renderFrame` / canvas captureではなく `renderEncodeFrame` / native render shared-frame pathを正本にする。

## 2026-06-19 — 動画encode frameでnative renderを必須化

### 実施内容
- Red: `createSharedRendererExportFrameSource` を直接使う場合でも、動画objectを含む `renderEncodeFrame` がpresenter handoffへ逃げず `nativeRenderUnavailable` で止まる契約を追加した。
- Green: `renderNativeEncodeFrame` のnative render必須判定をrequest単位にし、`request.objects` に動画がある場合は `bitmapCaptureEnabled` / `nativeRenderRequired` の呼び出し設定に関係なくnative render必須にした。
- Viewport側のexport planningを迂回しても、動画exportがpresented shared-frame補助経路へ戻りにくくした。
- 版を `0.1.1-Beta-210p` に更新した。

### 検証
- `npm test -- sharedRendererExportFrameSource`
- `npm test -- sharedRendererExportFrameSource sharedRendererExportFrameSourceBoundary`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererExportFrameSource\\.ts|src/utils/sharedRendererExportFrameSource\\.test\\.ts|src/utils/sharedRendererExportFrameSourceBoundary\\.test\\.ts)"`

### 残課題・次のステップ
- 動画exportでnative render bridgeが利用可能な場合、必ず `nativeRenderSharedFrame` pathへ進むことを実機で確認する。
- `presentedSharedFrame` pathを非動画/互換診断用としてさらに狭められるか確認する。

## 2026-06-19 — presented shared-frame handoff失敗をexport診断へ追加

### 実施内容
- Red: `takePresentedFrameSharedFrame` が失敗した場合に、export frame sourceが例外を素通しせず `presentedSharedFrameHandoffFailed` としてblocked診断へ残す契約を追加した。
- Green: presented shared-frame handoff呼び出しをtry/catchし、失敗時はdatasetへframe index/reasonを出して `SharedRendererExportFrameSourceBlockedError` へ変換するようにした。
- Rust direct encode直前のshared-frame data-plane失敗を、ユーザー環境で追跡できる形にした。
- 版を `0.1.1-Beta-210o` に更新した。

### 検証
- `npm test -- sharedRendererExportFrameSource`
- `npm test -- sharedRendererExportFrameSource sharedRendererExportFrameSourceBoundary`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererExportFrameSource\\.ts|src/utils/sharedRendererExportFrameSource\\.test\\.ts|src/utils/sharedRendererExportFrameSourceBoundary\\.test\\.ts)"`

### 残課題・次のステップ
- 実機exportで `presentedSharedFrame` pathが失敗したとき、datasetに `presentedSharedFrameHandoffFailed` が残ることを確認する。
- 可能ならnative render shared-frame pathを優先し、presented shared-frame pathを互換・診断用の補助経路に留める。

## 2026-06-19 — Pixi動画crop helperを撤去

### 実施内容
- Red: `pixiRenderHelper` が `VideoObject` / `evaluateSubjectCropNormRectAtTime` / `applyVideoSubjectCropMask` を持たない契約を境界テストへ追加した。
- Green: 未使用になっていたPixi動画subject-crop mask helperを削除し、動画をPixi spriteとして再作成する判定も削除した。
- Pixi側に残っていた「動画spriteを加工して表示する」前提を取り除き、動画表示の正本をRust/shared renderer側へさらに寄せた。
- 版を `0.1.1-Beta-210n` に更新した。

### 検証
- `npm test -- viewportRustVideoOnlyBoundary`
- `npm test -- viewportRustVideoOnlyBoundary productionVideoDependencyBoundary`
- `npm test -- pixiRenderHelper pixiSolidColourCutover pixiImageCutover pixiPsdCutover subjectCropKeyframes`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/pixiRenderHelper\\.ts|src/utils/viewportRustVideoOnlyBoundary\\.test\\.ts|src/utils/subjectCropKeyframes\\.ts)"`

### 残課題・次のステップ
- Pixi helperに残る動画関連語彙がhitArea cleanup以外に復活していないか、production境界で継続的に監視する。
- Rust native render / shared renderer側でsubject crop相当の表現を必要に応じて別途実装し、Pixi動画sprite処理へ戻さない。

## 2026-06-19 — Pixi動画cutover中間ゲートを撤去

### 実施内容
- Red: `pixiRenderHelper` が `pixiVideoCutover` / `resolvePixiVideoRenderPath` を参照しない契約を境界テストへ追加した。
- Green: 既に常時 `sharedRendererOnly` だったPixi動画cutover中間ユーティリティを削除し、Pixi動画分岐をshared renderer用cleanupへ直接固定した。
- 古い `pixiVideoCutover.ts` と専用テストを削除し、通常preview動画がPixi側の動画経路へ戻る足場をさらに減らした。
- 版を `0.1.1-Beta-210m` に更新した。

### 検証
- `npm test -- viewportRustVideoOnlyBoundary`
- `npm test -- viewportRustVideoOnlyBoundary productionVideoDependencyBoundary`
- `npm test -- pixiRenderHelper pixiSolidColourCutover pixiImageCutover pixiPsdCutover`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/pixiRenderHelper\\.ts|src/utils/pixiVideoCutover\\.ts|src/utils/pixiVideoCutover\\.test\\.ts|src/utils/viewportRustVideoOnlyBoundary\\.test\\.ts|src/utils/productionVideoDependencyBoundary\\.test\\.ts)"`

### 残課題・次のステップ
- `pixiRenderHelper` に残るPixi本体依存を、動画以外のlegacy overlay/editor interactionへ限定できているか確認する。
- Rust native render / shared rendererが表示正本になる範囲を実機素材で確認し、Pixi canvasに戻る出口をさらに削る。

## 2026-06-19 — native render GPU release失敗をpresenter診断へ追加

### 実施内容
- Red: native render frameのWebGPU upload成功後、`releaseAfterGpuUpload` が失敗してもpresenter処理を例外で落とさず、datasetへ `nativeRenderOutputReleaseFailed` を出す契約を追加した。
- Green: GPU fence後releaseをhelperで捕捉し、失敗時はnative render failure診断へdetail付きで反映するようにした。
- Rust native render outputのGPU upload後解放失敗を、shared renderer ready状態の裏で見失わないようにした。
- 版を `0.1.1-Beta-210l` に更新した。

### 検証
- `npm test -- sharedRendererPreviewPresenterController`
- `npm test -- sharedRendererPreviewPresenterController sharedRendererPresenterDiagnostics`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererPreviewPresenterController\\.ts|src/utils/sharedRendererPreviewPresenterController\\.test\\.ts|src/utils/sharedRendererPresenterDiagnostics\\.ts)"`

### 残課題・次のステップ
- 実機GoPro素材でnative render outputのGPU fence後release失敗がdatasetに残ることを確認する。
- PixiJS依存の残存箇所を洗い出し、Rust native render / decoded video upload経路を通常経路として固定する。

## 2026-06-19 — 動画GPU release失敗をpresenter診断へ追加

### 実施内容
- Red: decoded Rust video frameのWebGPU upload成功後、`releaseAfterGpuUpload` が失敗してもpresenter処理を例外で落とさず、datasetへ `videoUploadGpuReleaseFailed` を出す契約を追加した。
- Green: GPU fence後releaseをhelperで捕捉し、失敗時はvideo upload failure診断へclip/media id付きで反映するようにした。
- WebGPU upload自体が成功した後のRust decoded slot解放失敗を、shared renderer ownershipの裏で見失わないようにした。
- 版を `0.1.1-Beta-210k` に更新した。

### 検証
- `npm test -- sharedRendererPreviewPresenterController`
- `npm test -- sharedRendererPreviewPresenterController sharedRendererPresenterDiagnostics`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererPreviewPresenterController\\.ts|src/utils/sharedRendererPreviewPresenterController\\.test\\.ts|src/utils/sharedRendererPresenterDiagnostics\\.ts)"`

### 残課題・次のステップ
- native render frame upload成功後の `releaseAfterGpuUpload` 失敗も同じ粒度で診断できるようにする。
- 実機GoPro素材でGPU fence後release失敗がdatasetに残ることを確認する。

## 2026-06-19 — native render abort release失敗をpresenter診断へ追加

### 実施内容
- Red: native render frame upload失敗後の `releaseAfterUploadAbort` が失敗してもpresenter処理を例外で落とさず、datasetへ `nativeRenderOutputReleaseFailed` を出す契約を追加した。
- Green: native render upload / presentation失敗後のabort releaseを捕捉し、失敗時は `nativeRenderFailureReason=nativeRenderOutputReleaseFailed` とdetailを残すようにした。
- Rust native render outputの解放失敗を、preview fallback表示の裏で見失わないようにした。
- 版を `0.1.1-Beta-210j` に更新した。

### 検証
- `npm test -- sharedRendererPreviewPresenterController`
- `npm test -- sharedRendererPreviewPresenterController sharedRendererPresenterDiagnostics`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererPreviewPresenterController\\.ts|src/utils/sharedRendererPreviewPresenterController\\.test\\.ts|src/utils/sharedRendererPresenterDiagnostics\\.ts)"`

### 残課題・次のステップ
- 実機GoPro素材でnative render output upload / release失敗時にdatasetへreason/detail/labelが残ることを確認する。
- 成功時はnative render output release診断が残らず、shared renderer ownershipへ進むことを確認する。

## 2026-06-19 — 動画upload abort release失敗をpresenter診断へ追加

### 実施内容
- Red: WebGPU texture upload失敗後の `releaseAfterUploadAbort` が失敗してもpresenter処理を例外で落とさず、datasetへ `videoUploadAbortReleaseFailed` を出す契約を追加した。
- Green: decoded video upload abort releaseをhelperで捕捉し、失敗時はvideo upload failure診断へclip/media id付きで反映するようにした。
- Rust decoded slotの解放失敗を、Pixi fallback表示の裏で見失わないようにした。
- 版を `0.1.1-Beta-210i` に更新した。

### 検証
- `npm test -- sharedRendererPreviewPresenterController`
- `npm test -- sharedRendererPreviewPresenterController sharedRendererViewportPresenterOrchestration sharedRendererPresenterDiagnostics`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererPreviewPresenterController\\.ts|src/utils/sharedRendererPreviewPresenterController\\.test\\.ts|src/utils/sharedRendererViewportPresenterOrchestration\\.ts|src/utils/sharedRendererPresenterDiagnostics\\.ts)"`

### 残課題・次のステップ
- 実機GoPro素材でupload失敗/abort release失敗の診断がdatasetに残ることを確認する。
- 同じ方針をnative render upload abort releaseにも必要なら適用し、preview側のshared-frame release診断粒度を揃える。

## 2026-06-19 — WebGPU動画upload失敗clip/media idを補完

### 実施内容
- Red: 単一decoded Rust video uploadのWebGPU texture uploadが失敗した場合も、presenter datasetへ `VideoUploadFailureClipId` / `MediaId` を出す契約を追加した。
- Green: `sharedRendererDecodedVideoFrameUpload` 単体入力ではsession上の単一Video clipからclip/media idを補完し、複数upload入力ではorchestrationから `mediaId` も渡すようにした。
- WebGPU upload失敗診断を、shared memory copy失敗診断と同じ粒度で実機追跡できるようにした。
- 版を `0.1.1-Beta-210h` に更新した。

### 検証
- `npm test -- sharedRendererPreviewPresenterController`
- `npm test -- sharedRendererPreviewPresenterController sharedRendererViewportPresenterOrchestration sharedRendererPresenterDiagnostics`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererPreviewPresenterController\\.ts|src/utils/sharedRendererPreviewPresenterController\\.test\\.ts|src/utils/sharedRendererViewportPresenterOrchestration\\.ts|src/utils/sharedRendererViewportPresenterOrchestration\\.test\\.ts|src/utils/sharedRendererPresenterDiagnostics\\.ts)"`

### 残課題・次のステップ
- 実機GoPro素材でWebGPU upload失敗時にreason/detail/clip/media idがdatasetへ揃って出ることを確認する。
- 成功時はclip/media id付き失敗診断が残らず、shared renderer ownershipへ進むことを確認する。

## 2026-06-19 — WebGPU動画upload失敗をpresenter診断へ追加

### 実施内容
- Red: `sharedRendererPreviewPresenterController` に、decoded Rust video frameのWebGPU texture uploadが失敗した場合、presenter datasetへ `webGpuUploadUnavailable` とdetailを出す契約を追加した。
- Green: decoded video uploadの `uploadVideoFrameTexture` 失敗を `resolvedVideoUploadFailure` に保持し、既存の `uxfdSharedRendererPresenterVideoUploadFailureReason` / `Detail` へ合流させた。
- Rust decode / shared memory copyが成功してもWebGPU texture uploadで止まったケースを、Pixi表示へ戻っただけで見失わないようにした。
- 版を `0.1.1-Beta-210g` に更新した。

### 検証
- `npm test -- sharedRendererPreviewPresenterController`
- `npm test -- sharedRendererPreviewPresenterController sharedRendererPresenterDiagnostics sharedRendererViewportPresenterOrchestration`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererPreviewPresenterController\\.ts|src/utils/sharedRendererPreviewPresenterController\\.test\\.ts|src/utils/sharedRendererPresenterDiagnostics\\.ts|src/utils/sharedRendererViewportPresenterOrchestration\\.ts)"`

### 残課題・次のステップ
- 実機GoPro素材でWebGPU texture upload失敗時に `uxfdSharedRendererPresenterVideoUploadFailureReason=webGpuUploadUnavailable` が確認できるかを見る。
- 成功時は同datasetに失敗理由が残らず、`uxfdSharedRendererPresenterVideoOwner=sharedRenderer` へ進むことを確認する。

## 2026-06-19 — export動画upload失敗detailへclip/media idを追加

### 実施内容
- Red: `sharedRendererExportFrameSource` に、Rust video upload失敗でexportがblockedになる場合、低レベル理由に加えて `clip=... media=...` をmessageへ含める契約を追加した。
- Green: `resolveExportVideoUploadBlock` がviewport upload結果の `uploadFailureClipId` / `uploadFailureMediaId` をblocked detailへ含めるようにした。
- preview datasetとexport blocked errorのどちらでも、GoPro素材などの複数動画timelineで失敗対象を特定できるようにした。
- 版を `0.1.1-Beta-210f` に更新した。

### 検証
- `npm test -- sharedRendererExportFrameSource`
- `npm test -- sharedRendererExportFrameSource sharedRendererViewportVideoUpload`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererExportFrameSource\\.ts|src/utils/sharedRendererExportFrameSource\\.test\\.ts|src/utils/sharedRendererViewportVideoUpload\\.ts)"`

### 残課題・次のステップ
- `npm run dev:rust-video` でGoPro素材のpreview/exportを実機確認し、preview datasetとexport blocked errorの両方で失敗理由・clip/media idを確認する。
- 成功経路ではRust decode → shared memory copy → WebGPU upload → ownership cutoverがPixi videoなしで通ることを確認する。

## 2026-06-19 — 動画upload失敗clipをpresenter診断へ追加

### 実施内容
- Red: `sharedRendererViewportVideoUpload` に、複数動画upload失敗時の `uploadFailureClipId` / `uploadFailureMediaId` を要求する契約を追加した。
- Green: Rust shared memory copy / WebGPU upload準備が失敗したrequestの `clipId` / `mediaId` をviewport upload結果へ保持するようにした。
- Red: presenter diagnosticsとviewport orchestrationに、upload失敗clip/media idをdataset入力へ渡す契約を追加した。
- Green: `uxfdSharedRendererPresenterVideoUploadFailureClipId` / `uxfdSharedRendererPresenterVideoUploadFailureMediaId` をdatasetへ出すようにした。
- 版を `0.1.1-Beta-210e` に更新した。

### 検証
- `npm test -- sharedRendererViewportVideoUpload`
- `npm test -- sharedRendererPresenterDiagnostics sharedRendererViewportPresenterOrchestration`
- `npm test -- sharedRendererViewportVideoUpload sharedRendererPresenterDiagnostics sharedRendererViewportPresenterOrchestration sharedRendererPreviewPresenterController`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererViewportVideoUpload\\.ts|src/utils/sharedRendererViewportVideoUpload\\.test\\.ts|src/utils/sharedRendererPresenterDiagnostics\\.ts|src/utils/sharedRendererPresenterDiagnostics\\.test\\.ts|src/utils/sharedRendererPreviewPresenterController\\.ts|src/utils/sharedRendererViewportPresenterOrchestration\\.ts|src/utils/sharedRendererViewportPresenterOrchestration\\.test\\.ts)"`

### 残課題・次のステップ
- `npm run dev:rust-video` でGoPro素材を読み込み、失敗時に `uxfdSharedRendererPresenterVideoUploadFailureReason` とあわせてclip/media idが見えることを確認する。
- export blocked error側にも必要ならclip/media idを含め、previewとexportの診断粒度を揃える。

## 2026-06-19 — Rust動画dev起動前にbridge buildを実行

### 実施内容
- Red: `packageScripts` に、`dev:rust-video` がVite起動前に `scripts/build-shared-video-frame-node-addon.mjs` を実行する契約を追加した。
- Green: `scripts/dev-rust-video.mjs` がshared-video-frame Node addonを先にbuildし、成功した場合だけRust video-onlyのVite dev serverを起動するようにした。
- 実機GoPro確認時にnative bridge addonの手動build忘れでRust shared memory copy経路が落ちるリスクを下げた。
- 版を `0.1.1-Beta-210d` に更新した。

### 検証
- `npm test -- packageScripts`
- `npm run bridge:node:build`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/packageScripts\\.test\\.ts|scripts/dev-rust-video\\.mjs|package\\.json)"`

### 残課題・次のステップ
- `npm run dev:rust-video` で実機Electron/Viteを起動し、GoPro素材のpreview/exportがRust decode → shared memory copy → WebGPU upload → ownership cutoverへ到達することを確認する。
- 実機素材で失敗した場合、preview datasetとexport blocked errorの両方に低レベル失敗理由が出ることを確認する。

## 2026-06-19 — copy report checksum algorithmのrenderer検証

### 実施内容
- Red: `sharedVideoFrameUploadBridge` に、copy reportが `crc32` 以外の `checksumAlgorithm` を名乗った場合はuploadを拒否する契約を追加した。
- Green: `prepareSharedRendererDecodedVideoFrameUpload` が未知のchecksum algorithmを `copyReportChecksumAlgorithmUnsupported` としてfail-loudにするようにした。
- Rust shared memory copy reportの `expectedChecksum` / `actualChecksum` を、renderer側でも `crc32` 前提の値として扱う境界を固定した。
- 版を `0.1.1-Beta-210c` に更新した。

### 検証
- `npm test -- sharedVideoFrameUploadBridge`
- `npm test -- sharedVideoFrameUploadBridge sharedRendererRustVideoUploadPipeline sharedRendererViewportVideoUpload`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedVideoFrameUploadBridge\\.ts|src/utils/sharedVideoFrameUploadBridge\\.test\\.ts|src/utils/sharedRendererRustVideoUploadPipeline\\.ts|src/utils/sharedRendererViewportVideoUpload\\.ts)"`

### 残課題・次のステップ
- 実機GoPro素材でpreview datasetとexport blocked errorの両方に失敗理由が現れることを確認する。
- shared renderer preview/exportの通常起動で、Rust decode → shared memory copy → WebGPU upload → ownership cutoverがPixi videoなしで通ることを再確認する。

## 2026-06-19 — Node addon checksum report algorithmを明示

### 実施内容
- Red: `scripts/test-shared-video-frame-node-addon.mjs` に、write report / copy report の `checksumAlgorithm` が `crc32` で、write checksum と copy report checksumが一致する契約を追加した。
- Green: `shared-video-frame-bridge-node` の writable write report と copy reportへ `checksumAlgorithm: 'crc32'` を追加した。
- Electron preload / renderer型境界でもcopy report checksum algorithmを受け取れるようにし、Rust shared memory copy reportの意味をJS境界で固定した。
- 版を `0.1.1-Beta-210b` に更新した。

### 検証
- `npm run test:bridge-node`
- `npm test -- sharedVideoFrameUploadBridge sharedVideoFrameUploadBridgeBoundary`
- `cargo test --manifest-path shared-video-frame-bridge-node/Cargo.toml`
- `npx tsc --noEmit 2>&1 | rg "(electron/preload\\.ts|src/vite-env\\.d\\.ts|src/utils/sharedVideoFrameUploadBridge\\.ts|src/utils/sharedVideoFrameUploadBridge\\.test\\.ts|src/utils/sharedVideoFrameUploadBridgeBoundary\\.test\\.ts)"`

### 残課題・次のステップ
- 実機GoPro素材でpreview datasetとexport blocked errorの両方に失敗理由が現れることを確認する。
- shared renderer preview/exportの通常起動で、Rust decode → shared memory copy → WebGPU upload → ownership cutoverがPixi videoなしで通ることを再確認する。

## 2026-06-19 — checksum不一致時のshared frame slot解放

### 実施内容
- Red: `shared-video-frame-bridge` のintegration testに、POSIX shared memory上のframe bytesを破損させたあと、copy拒否後も次frameを書ける契約を追加した。
- Green: `PosixSharedRing::read_frame` がchecksum mismatchを検出した場合、`READING` に遷移したslotを `FREE` へ戻してから `ChecksumMismatch` を返すようにした。
- Rust/shared memory data-planeで破損frameがdecode ringを詰まらせる経路を塞いだ。
- 版を `0.1.1-Beta-210a` に更新した。

### 検証
- `cargo test --manifest-path shared-video-frame-bridge/Cargo.toml --test copy_into_upload_buffer`
- `cargo test --manifest-path shared-memory-spike/Cargo.toml --test atomic_ring_stress`
- `cargo test --manifest-path shared-memory-spike/Cargo.toml --test sidecar_decode_checksum`
- `cargo test --manifest-path shared-memory-spike/Cargo.toml posix_shm_multi_slot_allows_next_frame_while_previous_frame_is_reading`

### 残課題・次のステップ
- Node addon契約でも `writeIntoSharedFrameRing` のchecksumと `copyIntoUploadBuffer` のcopy report checksumを突き合わせ、JS境界でのreport名と値を固定する。
- 実機GoPro素材でpreview datasetとexport blocked errorの両方に失敗理由が現れることを確認する。

## 2026-06-19 — export動画upload失敗detailへ低レベル理由を追加

### 実施内容
- Red: `sharedRendererExportFrameSource` に、Rust video upload失敗でexportがblockedになる場合、`copyReportChecksumMismatch` をmessageへ含める契約を追加した。
- Green: `resolveExportVideoUploadBlock` が `uploadFailureReason` を保持している場合は `copyReportChecksumMismatch: ...` の形式でblocked detailを返すようにした。
- preview診断だけでなく、書き出し失敗時にもRust/shared memory copyの拒否理由を追えるようにした。
- 版を `0.1.1-Beta-209b` に更新した。

### 検証
- `npm test -- sharedRendererExportFrameSource`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererExportFrameSource\\.ts|src/utils/sharedRendererExportFrameSource\\.test\\.ts)"`

### 残課題・次のステップ
- Rust backend/native bridge側のchecksum report生成テストを再実行し、renderer/exportのfail-loud契約と一致していることを確認する。
- 実機GoPro素材でpreview datasetとexport blocked errorの両方に失敗理由が現れることを確認する。

## 2026-06-19 — presenter動画upload失敗診断を追加

### 実施内容
- Red: `sharedRendererPresenterDiagnostics` と `sharedRendererViewportPresenterOrchestration` に、Rust video upload失敗理由がpresenter診断へ届く契約を追加した。
- Green: `sharedRendererVideoUploadFailure` をViewport orchestrationからpresenterへ渡し、ready/fallback診断に `uxfdSharedRendererPresenterVideoUploadFailureReason` / `Detail` を書くようにした。
- `uploadFailed` の内側に保持した `copyReportChecksumMismatch` などをdatasetで追えるようにし、Pixi fallback表示だけではRust経路の失敗が見えない状態を減らした。
- 版を `0.1.1-Beta-209a` に更新した。

### 検証
- `npm test -- sharedRendererPresenterDiagnostics sharedRendererViewportPresenterOrchestration sharedRendererPreviewPresenterController`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererPresenterDiagnostics\\.ts|src/utils/sharedRendererPresenterDiagnostics\\.test\\.ts|src/utils/sharedRendererPreviewPresenterController\\.ts|src/utils/sharedRendererViewportPresenterOrchestration\\.ts|src/utils/sharedRendererViewportPresenterOrchestration\\.test\\.ts)"`

### 残課題・次のステップ
- export frame source側でも `uploadFailureReason` をblocked errorのdetailへ含め、書き出し中のRust data-plane拒否理由をUIへ返せるようにする。
- Rust backend/native bridge側のchecksum report生成テストを再実行し、renderer側fail-loud契約と一致していることを確認する。

## 2026-06-19 — viewport動画upload失敗理由を保持

### 実施内容
- Red: `sharedRendererViewportVideoUpload` に、shared frame copy checksum不一致時の `copyReportChecksumMismatch` がviewport結果に残る契約を追加した。
- Green: `PrepareSharedRendererViewportVideoUploadResult` / `PrepareSharedRendererViewportVideoUploadsResult` の `uploadFailed` に `uploadFailureReason` を追加し、Rust decoded video upload pipelineの低レベル失敗理由を保持するようにした。
- Rust/shared memory copyで拒否した理由を後段のpresenter/export diagnosticsへ渡せる足場を作った。
- 版を `0.1.1-Beta-208z` に更新した。

### 検証
- `npm test -- sharedRendererViewportVideoUpload`
- `npm test -- sharedRendererViewportVideoUpload sharedVideoFrameUploadBridge sharedRendererRustVideoUploadPipeline`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererViewportVideoUpload\\.ts|src/utils/sharedRendererViewportVideoUpload\\.test\\.ts|src/utils/sharedVideoFrameUploadBridge\\.ts|src/utils/sharedRendererRustVideoUploadPipeline\\.ts)"`

### 残課題・次のステップ
- `videoUploadResult` / `videoUploadsResult` の `uploadFailureReason` をpresenter/export diagnosticsへ露出し、実機GoPro素材で失敗理由を追えるようにする。
- Rust backend/native bridge側のchecksum report生成テストを再実行し、renderer側fail-loud契約と一致していることを確認する。

## 2026-06-18 — Phase5: renderer native render bridgeを追加

### 実施内容
- `src/utils/rustBackendNativeRenderControl.test.ts` を追加し、renderer helperがnative render payloadをRust backend bridgeへ渡す契約を追加した。
- `src/utils/rustBackendNativeRenderBoundary.test.ts` を追加し、Electron main/preload/vite-envが `render.nativeSharedFrame` を公開する境界契約を追加した。
- `src/utils/rustBackendNativeRenderControl.ts` を追加し、typed payload/resultで `window.rustBackend.renderNativeSharedFrame` を呼べるようにした。
- `electron/main.ts` / `electron/preload.ts` / `src/vite-env.d.ts` に native render shared-frame bridgeを追加した。
- package version を `0.1.1-Beta-95a` に更新した。

### 検証
- `npm test -- src/utils/rustBackendNativeRenderControl.test.ts src/utils/rustBackendNativeRenderBoundary.test.ts`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/rustBackendNativeRenderControl\\.ts\\(|src/utils/rustBackendNativeRenderControl\\.test\\.ts\\(|src/utils/rustBackendNativeRenderBoundary\\.test\\.ts\\(|electron/main\\.ts\\(|electron/preload\\.ts\\(|src/vite-env\\.d\\.ts\\()"`

### 残課題・次のステップ
- rendererからbackend native render RPCを呼べる入口ができた。次はshared renderer export sourceでRust decoded source frameを `renderNativeSharedFrame` へ渡し、その出力をRust encoderへ渡す。

## 2026-06-18 — Phase5: backend native render shared-frame RPCを追加

### 実施内容
- `rust-backend/tests/decode_control_plane.rs` に、source shared memoryをbackend native renderへ渡し、出力descriptorだけを受け取る統合契約を追加した。
- `rust-backend` に `render.nativeSharedFrame` RPCを追加した。
- backendがsource shared-frame ringへattachし、padded RGBAをtight RGBAへ戻してRust/wgpu rendererへ渡すようにした。
- Rust/wgpu render出力は新しいshared-frame ringへ書き込み、output ring ownerをbackend stateで保持するようにした。
- package version を `0.1.1-Beta-94a` に更新した。

### 検証
- `cargo test --manifest-path rust-backend/Cargo.toml native_render_shared_frame_consumes_source_shm_and_returns_descriptor_only`
- `cargo test --manifest-path rust-backend/Cargo.toml encode_shared_frame_session_tracks_descriptor_without_legacy_base64_fallback`
- `cargo test --manifest-path rust-backend/Cargo.toml decode_request_frame_writes_decoded_rgba_to_posix_shared_memory`
- `cargo test --manifest-path rust-backend/Cargo.toml encode_write_frame_rejects_descriptor_that_does_not_match_session`
- `cargo test --manifest-path native-wgpu-renderer/Cargo.toml --test shared_frame_output`

### 残課題・次のステップ
- Rust backend内で decode shared memory → native render shared memory の接続ができた。次は renderer/export source から `render.nativeSharedFrame` を呼び、Rust encoderの `encode.writeFrame` へ直結する。

## 2026-06-18 — Phase5: native wgpu frameをshared memoryへ出力

### 実施内容
- `native-wgpu-renderer/tests/shared_frame_output.rs` を追加し、Rust/wgpu描画結果をshared-frame ringへ書く契約を追加した。
- `native-wgpu-renderer` に `render_native_wgpu_frame_to_shared_ring` と `NativeWgpuSharedFrameReport` を追加した。
- Rust/wgpuのRGBA出力を `rgba8Srgb` descriptorの `strideBytes` に合わせてpadし、POSIX shared memory ringへ書き込むようにした。
- `uxfd-shared-memory-spike` と `uxfd-sidecar-protocol` をnative rendererの通常依存へ移した。
- package version を `0.1.1-Beta-93a` に更新した。

### 検証
- `cargo test --manifest-path native-wgpu-renderer/Cargo.toml --test shared_frame_output`
- `cargo test --manifest-path native-wgpu-renderer/Cargo.toml --test shm_decoded_frame_render --test frame_stage_timings`

### 残課題・次のステップ
- Rust-owned render surfaceからshared-frame descriptorを返す入口はできた。次はこの出力をRust backend encoder / Electron IPC / export sourceの実経路へ接続する。

## 2026-06-18 — Phase5: presented-frame handoffをcapabilityと例外fallbackで保護

### 実施内容
- `src/utils/sharedVideoFramePresentedFrameHandoff.test.ts` に、capabilityが未対応を返す場合はhandoff takerを作らない契約を追加した。
- `scripts/test-shared-video-frame-node-addon.mjs` に、N-API addonが `getPresentedFrameHandoffCapabilities()` で未実装を明示する契約を追加した。
- `electron/preload.ts` / `src/vite-env.d.ts` / `shared-video-frame-bridge-node/src/lib.rs` に capability APIを追加した。
- `takePresentedFrameSharedFrame` が例外/rejectした場合、renderer factoryは `null` を返してreadback fallbackへ戻すようにした。
- package version を `0.1.1-Beta-92b` に更新した。

### 検証
- `npm test -- src/utils/sharedVideoFramePresentedFrameHandoff.test.ts src/utils/sharedVideoFramePresentedFrameHandoffBoundary.test.ts`
- `npm test -- src/utils/sharedVideoFramePresentedFrameHandoff.test.ts src/utils/sharedVideoFramePresentedFrameHandoffBoundary.test.ts src/utils/useProjectExportBoundary.test.ts`
- `npm run test:bridge-node`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedVideoFramePresentedFrameHandoff\\.ts\\(|src/utils/sharedVideoFramePresentedFrameHandoff\\.test\\.ts\\(|src/utils/sharedVideoFramePresentedFrameHandoffBoundary\\.test\\.ts\\(|src/vite-env\\.d\\.ts\\(|electron/preload\\.ts\\()"`

### 残課題・次のステップ
- contextBridge越しにGPU objectを直接渡す道は安全な本命ではない。次はRust-owned render/export surface、またはclone可能なhandle/descriptor契約へ設計を寄せる。

## 2026-06-18 — Phase5: native addon presented-frame handoff入口を追加

### 実施内容
- `scripts/test-shared-video-frame-node-addon.mjs` に、N-API addonが `takePresentedFrameSharedFrame` を公開する契約を追加した。
- `shared-video-frame-bridge-node/src/lib.rs` に presented-frame handoff payload/response 型と `takePresentedFrameSharedFrame` を追加した。
- 現時点ではWebGPU textureをN-API越しにRustで直接扱えないため、addonは明示的に `success: false` と未実装エラーを返す。
- package version を `0.1.1-Beta-92a` に更新した。

### 検証
- `npm run test:bridge-node`

### 残課題・次のステップ
- native handoff APIは実addonまで届いた。次は `takePresentedFrameSharedFrame` が常時fallbackを発生させないよう、factory側の可用性判定をcapability/diagnostic込みにするか、Rust-owned render surfaceからshared-frame payloadを返す実装へ進む。

## 2026-06-18 — Phase5: native/Rust handoff bridge factoryをexportへ注入

### 実施内容
- `src/utils/sharedVideoFramePresentedFrameHandoff.test.ts` を追加し、native bridge methodの有無でhandoff takerを生成/非生成する契約を追加した。
- `src/utils/sharedVideoFramePresentedFrameHandoffBoundary.test.ts` を追加し、preloadとrenderer型が `takePresentedFrameSharedFrame` を公開する境界契約を追加した。
- `useProjectExport` からRust export frame sourceへ `createSharedVideoFramePresentedFrameTaker()` を注入するようにした。
- `electron/preload.ts` と `src/vite-env.d.ts` に optional native handoff APIを追加した。未対応時はfail-softに `success: false` を返し、既存fallbackへ戻せる。
- package version を `0.1.1-Beta-91a` に更新した。

### 検証
- `npm test -- src/utils/sharedVideoFramePresentedFrameHandoff.test.ts src/utils/sharedVideoFramePresentedFrameHandoffBoundary.test.ts src/utils/useProjectExportBoundary.test.ts`
- `npm test -- src/utils/sharedVideoFramePresentedFrameHandoff.test.ts src/utils/sharedVideoFramePresentedFrameHandoffBoundary.test.ts src/utils/useProjectExportBoundary.test.ts src/utils/projectExportFrameCanvas.test.ts src/utils/sharedRendererWebGpuPresenter.test.ts src/utils/sharedRendererExportFrameSource.test.ts`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedVideoFramePresentedFrameHandoff\\.ts\\(|src/hooks/useProjectExport\\.ts\\(|src/vite-env\\.d\\.ts\\(|electron/preload\\.ts\\(|src/utils/sharedRendererWebGpuPresenter\\.ts\\()"`

### 残課題・次のステップ
- 実アプリのRust direct encode経路へoptional native handoffを注入できるようになった。次はN-API addon側で `takePresentedFrameSharedFrame` を実装し、WebGPU textureからshared-frame payloadを返す経路を作る。

## 2026-06-18 — Phase5: Viewport export source builderからnative/Rust handoffを配線

### 実施内容
- `src/utils/viewportRustExportFrameSource.test.ts` に、handoffがshared renderer export sourceへ渡る契約を追加した。
- `src/utils/viewportRustVideoOnlyBoundary.test.ts` に、Viewportがexport contextのhandoffをbuilderへ渡す境界契約を追加した。
- `ProjectExportRustFrameSourceContext` と `BuildViewportRustExportFrameSourceInput` に `presentedFrameSharedFrameTaker` を追加した。
- `Viewport` から `buildViewportRustExportFrameSource` へhandoffをpass-throughするようにした。
- package version を `0.1.1-Beta-90a` に更新した。

### 検証
- `npm test -- src/utils/viewportRustExportFrameSource.test.ts src/utils/viewportRustVideoOnlyBoundary.test.ts`
- `npm test -- src/utils/viewportRustExportFrameSource.test.ts src/utils/viewportRustVideoOnlyBoundary.test.ts src/utils/projectExportFrameCanvas.test.ts src/utils/sharedRendererExportFrameSource.test.ts src/utils/sharedRendererViewportPresenterOrchestration.test.ts`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/projectExportFrameCanvas\\.ts\\(|src/utils/viewportRustExportFrameSource\\.ts\\(|src/components/Viewport\\.tsx\\(|src/utils/viewportRustExportFrameSource\\.test\\.ts\\(|src/utils/viewportRustVideoOnlyBoundary\\.test\\.ts\\()"`

### 残課題・次のステップ
- 実アプリのRust direct encode経路へhandoffを注入できる入口ができた。次はElectron/native bridge側のhandoff実装と可用性診断を追加する。

## 2026-06-18 — Phase5: export sourceからnative/Rust handoffをcontrollerまで配線

### 実施内容
- `src/utils/sharedRendererViewportPresenterOrchestration.test.ts` に、handoffがpresenter start inputへ渡る契約を追加した。
- `src/utils/sharedRendererExportFrameSource.test.ts` に、export frame sourceからviewport presenter orchestrationへhandoffが渡る契約を追加した。
- `StartSharedRendererViewportPresenterInput` と `CreateSharedRendererExportFrameSourceInput` に `presentedFrameSharedFrameTaker` を追加した。
- Rust direct encodeのexport sourceからWebGPU presenterのnative/Rust handoffまでpass-throughできるようにした。
- package version を `0.1.1-Beta-89a` に更新した。

### 検証
- `npm test -- src/utils/sharedRendererViewportPresenterOrchestration.test.ts src/utils/sharedRendererExportFrameSource.test.ts`
- `npm test -- src/utils/sharedRendererViewportPresenterOrchestration.test.ts src/utils/sharedRendererExportFrameSource.test.ts src/utils/sharedRendererPreviewPresenterController.test.ts src/utils/sharedRendererWebGpuPresenter.test.ts src/utils/sharedRendererExportFrameSourceBoundary.test.ts`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererViewportPresenterOrchestration\\.ts\\(|src/utils/sharedRendererExportFrameSource\\.ts\\(|src/utils/sharedRendererPreviewPresenterController\\.ts\\(|src/utils/sharedRendererWebGpuPresenter\\.ts\\(|src/utils/sharedRendererViewportPresenterOrchestration\\.test\\.ts\\(|src/utils/sharedRendererExportFrameSource\\.test\\.ts\\()"`

### 残課題・次のステップ
- native/Rust handoffの差し込み経路はexport sourceからpresenterまで通った。次は実際のElectron/native bridge実装、または未対応時の診断を追加する。

## 2026-06-18 — Phase5: preview presenter controllerからnative/Rust handoffを配線

### 実施内容
- `src/utils/sharedRendererPreviewPresenterController.test.ts` に、controller入口へ渡したnative/Rust handoffがready presenter controlへ届く契約を追加した。
- `StartSharedRendererPreviewPresenterInput` に `presentedFrameSharedFrameTaker` を追加した。
- `startSharedRendererPreviewPresenter` から `createSharedRendererWebGpuPresenter` へhandoffをpass-throughするようにした。
- package version を `0.1.1-Beta-88a` に更新した。

### 検証
- `npm test -- src/utils/sharedRendererPreviewPresenterController.test.ts src/utils/sharedRendererWebGpuPresenter.test.ts`
- `npm test -- src/utils/sharedRendererPreviewPresenterController.test.ts src/utils/sharedRendererWebGpuPresenter.test.ts src/utils/sharedRendererViewportPresenterOrchestration.test.ts src/utils/sharedRendererExportFrameSource.test.ts src/utils/sharedRendererExportFrameSourceBoundary.test.ts`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererPreviewPresenterController\\.ts\\(|src/utils/sharedRendererPreviewPresenterController\\.test\\.ts\\(|src/utils/sharedRendererWebGpuPresenter\\.ts\\(|src/utils/sharedRendererWebGpuPresenter\\.test\\.ts\\()"`

### 残課題・次のステップ
- native/Rust handoffをcontroller入口から差し込めるようになった。次はElectron/native bridgeのhandoff実装、またはViewport/export sourceへの実配線を進める。

## 2026-06-18 — Phase5: WebGPU presenterでnative/Rust handoffを優先

### 実施内容
- `src/utils/sharedRendererWebGpuPresenter.test.ts` に、native/Rust handoffがpayloadを返す場合は `copyTextureToBuffer` とJS shared-frame writerを呼ばない契約を追加した。
- `createSharedRendererWebGpuPresenter` に `presentedFrameSharedFrameTaker` 注入点を追加した。
- `takePresentedFrameSharedFrame` が最後にpresentしたtexture、WebGPU device、format、canvas sizeをhandoffへ渡し、payloadが返ればreadback fallbackを使わないようにした。
- package version を `0.1.1-Beta-87a` に更新した。

### 検証
- `npm test -- src/utils/sharedRendererWebGpuPresenter.test.ts`
- `npm test -- src/utils/sharedRendererWebGpuPresenter.test.ts src/utils/sharedRendererPreviewPresenterController.test.ts src/utils/sharedRendererExportFrameSource.test.ts src/utils/sharedRendererExportFrameSourceBoundary.test.ts src/utils/sharedRendererViewportPresenterOrchestration.test.ts`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererWebGpuPresenter\\.ts\\(|src/utils/sharedRendererWebGpuPresenter\\.test\\.ts\\(|src/utils/sharedRendererPreviewPresenterController\\.ts\\(|src/utils/sharedRendererExportFrameSource\\.ts\\()"`

### 残課題・次のステップ
- WebGPU presenterはnative/Rust handoffを優先できるようになった。次はElectron/native bridgeまたはRust backend側にこのhandoffの実装境界を追加する。

## 2026-06-18 — Phase5: export sourceのJS shared-frame writer静的依存を排除

### 実施内容
- `src/utils/sharedRendererExportFrameSourceBoundary.test.ts` を追加し、`sharedRendererExportFrameSource` が `rustBackendVideoEncodeSharedFrameWriter` を静的importしない契約を追加した。
- `sharedRendererExportFrameSource` のfallback writer生成を `import('./rustBackendVideoEncodeSharedFrameWriter')` へ動的import化した。
- presenterが `takePresentedFrameSharedFrame` を提供する通常のRust direct encode経路では、export source初期ロード時にJS shared-frame writer実装を読み込まないようにした。
- package version を `0.1.1-Beta-86a` に更新した。

### 検証
- `npm test -- src/utils/sharedRendererExportFrameSourceBoundary.test.ts`
- `npm test -- src/utils/sharedRendererExportFrameSourceBoundary.test.ts src/utils/sharedRendererExportFrameSource.test.ts src/utils/sharedRendererWebGpuPresenter.test.ts src/utils/sharedRendererPreviewPresenterController.test.ts`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererExportFrameSource\\.ts\\(|src/utils/sharedRendererExportFrameSourceBoundary\\.test\\.ts\\(|src/utils/sharedRendererExportFrameSource\\.test\\.ts\\()"`

### 残課題・次のステップ
- export sourceからfallback writerの静的依存は消えた。次はpresenter内部のGPU readback / JS writer自体をnative/Rust handoffへ置き換える契約を切る。

## 2026-06-18 — Phase5: WebGPU presenterがshared-frame payload生成を所有

### 実施内容
- `src/utils/sharedRendererWebGpuPresenter.test.ts` に、presenterが最後に提示したWebGPU textureをshared-frame payloadへ変換する契約を追加した。
- `createSharedRendererWebGpuPresenter` に `createEncodeFrameWriter` 注入点と `takePresentedFrameSharedFrame` を追加した。
- WebGPU readback結果をpresenter内のshared-frame writerへ渡し、Rust backend encoder用payloadを返すようにした。
- `startSharedRendererPreviewPresenter` から同APIをcontrolへ中継するようにした。
- package version を `0.1.1-Beta-85a` に更新した。

### 検証
- `npm test -- src/utils/sharedRendererWebGpuPresenter.test.ts src/utils/sharedRendererPreviewPresenterController.test.ts src/utils/sharedRendererExportFrameSource.test.ts`
- `npm test -- src/utils/sharedRendererWebGpuPresenter.test.ts src/utils/sharedRendererPreviewPresenterController.test.ts src/utils/sharedRendererExportFrameSource.test.ts src/utils/sharedRendererViewportPresenterOrchestration.test.ts src/utils/projectExportRustEncodeFrame.test.ts src/utils/rustBackendVideoEncodeSharedFrameWriter.test.ts`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererWebGpuPresenter\\.ts\\(|src/utils/sharedRendererPreviewPresenterController\\.ts\\(|src/utils/sharedRendererWebGpuPresenter\\.test\\.ts\\(|src/utils/sharedRendererExportFrameSource\\.ts\\(|src/utils/sharedRendererExportFrameSource\\.test\\.ts\\()"`

### 残課題・次のステップ
- shared-frame payload生成責務はpresenterへ寄った。次はこの内部のGPU readback / JS shared-frame writerをnative/Rust側へ差し替える設計と契約を切る。

## 2026-06-18 — Phase5: presenter shared-frame payloadをdirect encodeへ直結する受け口を追加

### 実施内容
- `src/utils/sharedRendererExportFrameSource.test.ts` に、presenterがshared-frame payloadを返せる場合はWebGPU readbackとJS shared-frame writerを呼ばない契約を追加した。
- `SharedRendererPreviewPresenterControl` に `takePresentedFrameSharedFrame` を任意メソッドとして追加した。
- `createSharedRendererExportFrameSource` の `renderEncodeFrame` で、`takePresentedFrameSharedFrame` を `readPresentedFrameRgbaBytes` より優先するようにした。
- package version を `0.1.1-Beta-84a` に更新した。

### 検証
- `npm test -- src/utils/sharedRendererExportFrameSource.test.ts`
- `npm test -- src/utils/sharedRendererExportFrameSource.test.ts src/utils/sharedRendererPreviewPresenterController.test.ts src/utils/sharedRendererWebGpuPresenter.test.ts src/utils/sharedRendererViewportPresenterOrchestration.test.ts src/utils/projectExportRustEncodeFrame.test.ts`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererExportFrameSource\\.ts\\(|src/utils/sharedRendererPreviewPresenterController\\.ts\\(|src/utils/sharedRendererExportFrameSource\\.test\\.ts\\()"`

### 残課題・次のステップ
- JS readbackを省けるAPIの受け口はできた。次は実際にpresenter/Rust側がこのpayloadを生成できる実装へ進める。

## 2026-06-18 — Phase5: Rust direct encode sourceからbitmap capture出口を外す

### 実施内容
- `src/utils/sharedRendererExportFrameSource.test.ts` に、Rust direct encode-only sourceでは `renderFrame` を公開せず `renderEncodeFrame` だけでshared-frame payloadを返す契約を追加した。
- `src/utils/viewportRustExportFrameSource.test.ts` に、Rust backend encoder所有時はshared renderer export sourceへ `bitmapCaptureEnabled: false` を渡す契約を追加した。
- `src/utils/useProjectExportBoundary.test.ts` / `src/utils/viewportRustVideoOnlyBoundary.test.ts` に、HookからViewportへ `preferEncodeOnly` が届く境界契約を追加した。
- `createSharedRendererExportFrameSource` に `bitmapCaptureEnabled` を追加し、Rust backend encoder経路では `createImageBitmap(canvas)` 用の `renderFrame` を持たないsourceを生成するようにした。
- package version を `0.1.1-Beta-83a` に更新した。

### 検証
- `npm test -- src/utils/sharedRendererExportFrameSource.test.ts src/utils/viewportRustExportFrameSource.test.ts src/utils/useProjectExportBoundary.test.ts src/utils/viewportRustVideoOnlyBoundary.test.ts`
- `npm test -- src/utils/sharedRendererExportFrameSource.test.ts src/utils/viewportRustExportFrameSource.test.ts src/utils/useProjectExportBoundary.test.ts src/utils/viewportRustVideoOnlyBoundary.test.ts src/utils/projectExportFrameCanvas.test.ts src/utils/projectExportRustEncodeFrame.test.ts src/utils/projectExportEncodePlan.test.ts`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererExportFrameSource\\.ts\\(|src/utils/viewportRustExportFrameSource\\.ts\\(|src/utils/projectExportFrameCanvas\\.ts\\(|src/hooks/useProjectExport\\.ts\\(|src/components/Viewport\\.tsx\\(|src/utils/sharedRendererExportFrameSource\\.test\\.ts\\(|src/utils/viewportRustExportFrameSource\\.test\\.ts\\(|src/utils/useProjectExportBoundary\\.test\\.ts\\(|src/utils/viewportRustVideoOnlyBoundary\\.test\\.ts\\()"`

### 残課題・次のステップ
- Rust backend encoder経路はbitmap capture出口を持たなくなった。次はRust video-only時にPixi側で `HTMLVideoElement` / `PIXI.VideoSource` を生成しない契約へ進める。

## 2026-06-18 — Phase5: Rust video-only preview診断でDOM動画readinessを回避

### 実施内容
- `src/utils/sharedRendererVideoMediaReadiness.test.ts` に、Rust video-only時は `HTMLVideoElement` が無くても `missingElement` と扱わない契約を追加した。
- `src/utils/viewportRustVideoOnlyBoundary.test.ts` に、Viewportがreadiness診断へ `rustVideoOnlyEnabled` を渡す境界契約を追加した。
- `buildSharedRendererVideoMediaReadiness` に `requireSharedRendererVideo` と `rustRendererRequired` / `rustRequiredCount` を追加した。
- `Viewport` から同フラグを渡し、DOM動画missingではなくRust renderer必須状態としてdiagnostics datasetへ出すようにした。
- package version を `0.1.1-Beta-82a` に更新した。

### 検証
- `npm test -- src/utils/sharedRendererVideoMediaReadiness.test.ts src/utils/viewportRustVideoOnlyBoundary.test.ts`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererVideoMediaReadiness\\.ts\\(|src/components/Viewport\\.tsx\\(|src/utils/viewportRustVideoOnlyBoundary\\.test\\.ts\\()"`

### 残課題・次のステップ
- Rust video-only preview診断はDOM動画readinessを参照しなくなった。次は実機ElectronでRust decode/upload/ownershipが実際に `sharedRenderer` へ到達するか確認する。

## 2026-06-18 — Phase5: legacy browser export依存を動的import化

### 実施内容
- `src/utils/useProjectExportBoundary.test.ts` に、`useProjectExport` が `VideoFrameProvider` / `PlaybackFrameProvider` / `videoExportPipeline` を静的importしない契約を追加した。
- `src/hooks/useProjectExport.ts` から legacy browser decode provider と WebCodecs encoder の静的importを外した。
- legacy browser providerは `requiresLegacyBrowserVideoProviders` branch内、`encodeVideoToMp4` はWebCodecs互換branch内でのみ動的importするようにした。
- package version を `0.1.1-Beta-81a` に更新した。

### 検証
- `npm test -- src/utils/useProjectExportBoundary.test.ts`
- `npm test -- src/utils/useProjectExportBoundary.test.ts src/utils/projectExportEncodePlan.test.ts src/utils/projectExportFrameCanvas.test.ts src/utils/projectExportRustEncodeFrame.test.ts`
- `npx tsc --noEmit 2>&1 | rg "useProjectExport|useProjectExportBoundary|videoFrameProvider|playbackFrameProvider|videoExportPipeline"`（対象ファイルの型エラーなし）

### 残課題・次のステップ
- Rust export pathはlegacy browser export modulesを初期ロードしなくなった。次は実機Electronで `npm run dev:rust-video` を使い、Rust backend decode / shared memory upload / Rust encodeまでの実動作を検証する。

## 2026-06-18 — Phase5: Rust video-only exportでRust encoderを必須化

### 実施内容
- `src/utils/projectExportEncodePlan.test.ts` に、Rust video-onlyかつ動画を含むexportではRust encoder bridgeが無い場合にWebCodecsへfallbackしない契約を追加した。
- `resolveProjectExportEncodePlan` / `resolveProjectExportEncodePlanFromBridge` に `rustVideoOnly` / `hasVideoObjects` を追加し、動画export時だけRust encoder必須へ寄せた。
- `src/hooks/useProjectExport.ts` から encode plan へ `rustVideoOnly` と動画有無を渡すようにした。
- `scripts/dev-rust-video.mjs` に `VITE_UXFD_RUST_EXPORT_ONLY=1` を追加し、検証起動時のpreview/exportをRust経路へ固定した。
- package version を `0.1.1-Beta-80a` に更新した。

### 検証
- `npm test -- src/utils/projectExportEncodePlan.test.ts src/utils/packageScripts.test.ts src/utils/projectExportFrameCanvas.test.ts src/utils/projectExportRustEncodeFrame.test.ts`
- `npx tsc --noEmit 2>&1 | rg "projectExportEncodePlan|useProjectExport|rustVideoOnly|hasVideoObjects|packageScripts|dev-rust-video"`（対象ファイルの型エラーなし）

### 残課題・次のステップ
- Rust video-onlyの動画exportはRust frame sourceとRust backend encoderの両方が必須になった。次は実機ElectronでRust backend bridge接続後に `npm run dev:rust-video` を使い、GoPro素材のpreview/exportを確認する。

## 2026-06-18 — Phase5: Rust動画dev起動scriptを追加

### 実施内容
- `src/utils/packageScripts.test.ts` に、Rust動画検証用の `dev:rust-video` script とwrapper内容の契約を追加した。
- `package.json` に `npm run dev:rust-video` を追加した。
- `scripts/dev-rust-video.mjs` を追加し、Node経由でViteへ `VITE_UXFD_SHARED_RENDERER_PREVIEW=1` / `VITE_UXFD_SHARED_RENDERER_EXPORT=1` / `VITE_UXFD_RUST_VIDEO_ONLY=1` を渡すようにした。
- package version を `0.1.1-Beta-79a` に更新した。

### 検証
- `npm test -- src/utils/packageScripts.test.ts`
- `npx tsc --noEmit 2>&1 | rg "packageScripts|dev-rust-video|package.json"`（対象ファイルの型エラーなし）

### 残課題・次のステップ
- Rust動画検証の起動入口は用意できた。実機Electronでは先にRust backendとshared-video-frame bridgeを用意し、`npm run dev:rust-video` でGoPro素材のpreview/exportを確認する。

## 2026-06-18 — Phase5: Rust video必須時はcutoverを暗黙有効化

### 実施内容
- `src/utils/sharedRendererViewportPresenterOrchestration.test.ts` に、Rust video必須ならcutover flagがOFFでもRust video upload準備を行う契約を追加した。
- `startSharedRendererViewportPresenter` で `videoCutoverEnabled || requireSharedRendererVideo` をeffective cutoverとして使い、upload準備とpresenter入力へ同じ値を渡すようにした。
- Rust video-only設定だけでdecode/upload/ownership判定へ進めるようになり、旧flag未設定による即fail-loudを避けた。
- package version を `0.1.1-Beta-78a` に更新した。

### 検証
- `npm test -- src/utils/sharedRendererViewportPresenterOrchestration.test.ts`
- `npm test -- src/utils/sharedRendererViewportPresenterOrchestration.test.ts src/utils/sharedRendererPreviewPresenterController.test.ts`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererViewportPresenterOrchestration\\.ts\\(|effectiveVideoCutoverEnabled)"`（対象ファイルの型エラーなし）

### 残課題・次のステップ
- Rust video-only previewはcutover flag未設定でもRust upload準備へ進む。次は実機ElectronでRust backend decode / shared frame upload / WebGPU presentationの一連を確認する。

## 2026-06-18 — Phase5: Rust video必須previewをfail-loud化

### 実施内容
- `src/utils/sharedRendererPreviewPresenterController.test.ts` に、Rust video必須時にshared rendererが動画所有権を取れない場合は `ok:false` で返す契約を追加した。
- `startSharedRendererPreviewPresenter` に `requireSharedRendererVideo` を追加し、動画sceneで `videoOwnership.owner !== 'sharedRenderer'` の場合は `requiredVideoOwnershipUnavailable` をdiagnosticsへ出すようにした。
- `startSharedRendererViewportPresenter` と `Viewport` へ同フラグを伝搬し、`VITE_UXFD_RUST_VIDEO_ONLY` とpreview presenterを接続した。
- package version を `0.1.1-Beta-77a` に更新した。

### 検証
- `npm test -- src/utils/sharedRendererPreviewPresenterController.test.ts`
- `npm test -- src/utils/sharedRendererPreviewPresenterController.test.ts src/utils/sharedRendererViewportPresenterOrchestration.test.ts src/utils/pixiVideoCutover.test.ts`
- `npx tsc --noEmit 2>&1 | rg "(src/components/Viewport\\.tsx|src/utils/sharedRendererPreviewPresenterController\\.ts|src/utils/sharedRendererViewportPresenterOrchestration\\.ts|requireSharedRendererVideo|requiredVideoOwnershipUnavailable)"`（対象ファイルの型エラーなし）

### 残課題・次のステップ
- Rust video-only previewは、Rust decode/upload不成立を成功扱いしなくなった。次は実機ElectronでGoPro素材を使い、preview/exportともにRust video pathの診断・出力を確認する。

## 2026-06-18 — Phase5: Rust video-only exportでlegacy canvas fallbackを禁止

### 実施内容
- `src/utils/projectExportFrameCanvas.test.ts` に、`rustVideoOnly=true` かつ動画を含むexportではWebCodecs互換encoderでもRust frame sourceを必須にする契約を追加した。
- `resolveProjectExportFrameSourcePolicyForEncode` に `rustVideoOnly` / `hasVideoObjects` を追加し、動画exportだけを `requireRustFrameSource` / `failExport` にした。
- `src/hooks/useProjectExport.ts` で `VITE_UXFD_RUST_VIDEO_ONLY` と動画有無をexport frame source policyへ渡すようにした。
- package version を `0.1.1-Beta-76a` に更新した。

### 検証
- `npm test -- src/utils/projectExportFrameCanvas.test.ts`
- `npm test -- src/utils/projectExportFrameCanvas.test.ts src/utils/projectExportRustEncodeFrame.test.ts`
- `npx tsc --noEmit 2>&1 | rg "projectExportFrameCanvas|useProjectExport|rustVideoOnly|hasVideoObjects"`（対象ファイルの型エラーなし）

### 残課題・次のステップ
- Rust video-only時の動画exportはlegacy canvas / HTMLVideoElement seek / ImageBitmap captureへ戻れなくなった。次はpreview側でもRust video-only失敗をsilent blankではなく診断としてfail-loudにする。

## 2026-06-18 — Phase5: Rust direct encode source から ImageBitmap 必須型を撤去

### 実施内容
- `src/utils/projectExportRustEncodeFrame.test.ts` に、Rust direct encode source は `renderEncodeFrame` だけで成立する型契約を追加した。
- `ProjectExportRustFrameSource.renderFrame` をoptionalにし、bitmap互換経路だけが `renderFrame` の存在を要求するようにした。
- `createSharedRendererExportFrameSource` の戻り値型は、実態どおり `renderFrame` / `renderEncodeFrame` の両方を持つsourceとして明示した。
- package version を `0.1.1-Beta-75a` に更新した。

### 検証
- `npx tsc --noEmit 2>&1 | rg "projectExportRustEncodeFrame|ProjectExportRustFrameSource|renderFrame"`（Red: `renderFrame` 必須型で失敗）
- `npm test -- src/utils/projectExportRustEncodeFrame.test.ts src/utils/projectExportFrameCanvas.test.ts src/utils/sharedRendererExportFrameSource.test.ts src/utils/viewportRustExportFrameSource.test.ts`
- `npx tsc --noEmit 2>&1 | rg "projectExportRustEncodeFrame|projectExportFrameCanvas|sharedRendererExportFrameSource|viewportRustExportFrameSource|useProjectExport"`（対象ファイルの型エラーなし）

### 残課題・次のステップ
- Rust direct encodeは `ImageBitmap` capture能力を型上も要求しなくなった。次は `VITE_UXFD_RUST_VIDEO_ONLY` とexport source policyを連動させ、Rust video-only時のlegacy canvas / WebCodecs fallbackをさらに狭める。

## 2026-06-18 — Phase5: Rust export時は DOM動画pause副作用を回避

### 実施内容
- `src/utils/projectExportFrameCanvas.test.ts` に、shared renderer Rust frame source 使用時は `HTMLVideoElement.pause()` を呼ばない契約を追加した。
- legacy canvas / browser video provider を使う互換exportでは従来どおりDOM動画をpauseする契約も固定した。
- `pauseLegacyBrowserVideosForExport` を追加し、`useProjectExport` のexport開始時pauseを `requiresLegacyBrowserVideoProviders` に従わせた。
- package version を `0.1.1-Beta-74a` に更新した。

### 検証
- `npm test -- src/utils/projectExportFrameCanvas.test.ts`
- `npx tsc --noEmit 2>&1 | rg "projectExportFrameCanvas|useProjectExport"`（対象ファイルの型エラーなし）

### 残課題・次のステップ
- Rust frame source 経路では export 開始時のDOM動画副作用を避けられた。次はpreview/exportに残る `HTMLVideoElement` readiness / canvas ImageBitmap 互換経路のうち、Rust必須モードで不要なものをさらにfail-loud化する。

## 2026-06-18 — Phase5: Rust video必須時は export中も Pixi video fallback を禁止

### 実施内容
- `src/utils/pixiVideoCutover.test.ts` に、`requireSharedRendererVideo=true` の場合はexport中でもPixi video fallbackをskipする契約を追加した。
- `shouldSkipPixiVideoForSharedRenderer` のexport中ガードを整理し、Rust video必須時だけ `isExporting` に関係なくPixi videoを外すようにした。
- shared renderer所有済みIDだけに基づく通常cutoverは、互換fallbackとしてexport中のPixi描画を引き続き許可する。
- package version を `0.1.1-Beta-73a` に更新した。

### 検証
- `npm test -- src/utils/pixiVideoCutover.test.ts`
- `npm test -- src/utils/pixiVideoCutover.test.ts src/utils/sharedRendererVideoOwnership.test.ts src/utils/sharedRendererPreviewPresenterController.test.ts src/utils/projectExportFrameCanvas.test.ts`
- `npx tsc --noEmit 2>&1 | rg "pixiVideoCutover|pixiRenderHelper|sharedRendererVideoOwnership|useProjectExport"`（対象ファイルの型エラーなし）

### 残課題・次のステップ
- 実機ElectronでRust video必須時のpreview/exportがPixi videoを生成・維持しないことを確認する。
- 完全なPixi video撤去には、互換fallbackを残す条件とUI flagの整理がまだ必要。

## 2026-06-18 — Phase5: Rust encode runner 入力型を shared-frame 専用化

### 実施内容
- `src/utils/rustBackendVideoEncodeExport.test.ts` に `@ts-expect-error` 契約を追加し、Rust encode runnerへ `ImageBitmap` frameを渡せない型境界を固定した。
- `runRustBackendVideoEncodeExport` の `frames` 入力型を `RustBackendVideoEncodeSharedFramePayloadFrame` の `AsyncIterable` に限定した。
- `src/hooks/useProjectExport.ts` のRust encoder分岐に `renderRustEncodeFrames()` を追加し、shared-frame payloadだけをrunnerへ渡すようにした。
- package version を `0.1.1-Beta-72a` に更新した。

### 検証
- `npx tsc --noEmit 2>&1 | rg "rustBackendVideoEncodeExport|useProjectExport|projectExportRustEncodeFrame|sharedRendererExportFrameSource"`（対象ファイルの型エラーなし）
- `npm test -- src/utils/rustBackendVideoEncodeExport.test.ts src/utils/projectExportRustEncodeFrame.test.ts src/utils/sharedRendererExportFrameSource.test.ts src/utils/projectExportFrameCanvas.test.ts`

### 残課題・次のステップ
- 型と実行時の両方でRust encode runnerはshared-frame専用になった。次は実機Electronで通常exportのRust経路を確認し、WebGPU readback / shared memory writer / Rust backend ffmpeg encodeが一連で通ることを検証する。

## 2026-06-18 — Phase5: Rust encode runner を shared-frame 専用化

### 実施内容
- `src/utils/rustBackendVideoEncodeExport.test.ts` に、bitmap frameをRust encode runnerへ渡した場合はwritable ring copyへ進まず失敗する契約を追加した。
- `runRustBackendVideoEncodeExport` から `extractImageBitmapRgbaBytes`、canvas 2D readback、runner側writable shared frame writer生成を削除した。
- Rust encode runnerは `sharedFramePayload` を `writeVideoEncodeFrame` へ転送するだけの制御面になり、data-planeは shared renderer export source のWebGPU readback経路へ集約した。
- package version を `0.1.1-Beta-71a` に更新した。

### 検証
- `npm test -- src/utils/rustBackendVideoEncodeExport.test.ts`
- `npm test -- src/utils/rustBackendVideoEncodeExport.test.ts src/utils/projectExportRustEncodeFrame.test.ts src/utils/sharedRendererExportFrameSource.test.ts src/utils/projectExportFrameCanvas.test.ts`
- `npx tsc --noEmit 2>&1 | rg "rustBackendVideoEncodeExport|projectExportRustEncodeFrame|sharedRendererExportFrameSource|useProjectExport"`（対象ファイルの型エラーなし）
- `cargo test --manifest-path rust-backend/Cargo.toml encode_`

### 残課題・次のステップ
- shared renderer export source内部ではWebGPU readback bytesをCPU mapped bufferとして受け、writable shared frame writerへ書いている。次はこのcopyをnative側へ寄せる余地を検討する。
- WebCodecs互換fallbackはRust encoder bridge未接続時のみ残る。

## 2026-06-18 — Phase5: Rust direct encode で WebGPU readback を必須化

### 実施内容
- `src/utils/projectExportRustEncodeFrame.test.ts` に、Rust direct encodeで `renderEncodeFrame` が無い場合はImageBitmap fallbackせず失敗する契約を追加した。
- `src/utils/sharedRendererExportFrameSource.test.ts` に、presenter readbackが無い場合は `webGpuReadbackUnavailable` でblockedになり、`createImageBitmap` / RGBA extraction / tight writeを呼ばない契約を追加した。
- `renderProjectExportRustEncodeFrame` は `preferSharedFrame=true` の時にshared-frame export sourceを必須にした。
- `SharedRendererExportFrameSource.renderEncodeFrame` は `readPresentedFrameRgbaBytes` が無い場合にfail-loudし、direct encodeからImageBitmap fallbackを削除した。
- package version を `0.1.1-Beta-70a` に更新した。

### 検証
- `npm test -- src/utils/projectExportRustEncodeFrame.test.ts src/utils/sharedRendererExportFrameSource.test.ts`
- `npm test -- src/utils/projectExportRustEncodeFrame.test.ts src/utils/sharedRendererExportFrameSource.test.ts src/utils/rustBackendVideoEncodeExport.test.ts src/utils/projectExportFrameCanvas.test.ts`
- `npx tsc --noEmit 2>&1 | rg "projectExportRustEncodeFrame|sharedRendererExportFrameSource|rustBackendVideoEncodeExport|projectExportFrameCanvas"`（対象ファイルの型エラーなし）

### 残課題・次のステップ
- 実機ElectronでWebGPU readbackが使えない環境のfail-loud表示を確認する。
- WebGPU readback bytesはまだCPU mapped buffer経由。GPU bufferからnative/shared memoryへ近道する最適化は次段以降。

## 2026-06-18 — Phase5: Rust encoder時の legacy frame source fallback を禁止

### 実施内容
- `src/utils/projectExportFrameCanvas.test.ts` に、Rust backend encoderが選ばれた通常exportでもRust frame sourceを必須にする契約を追加した。
- `resolveProjectExportFrameSourcePolicyForEncode` を追加し、encoder選択に応じて `rustFrameSourcePolicy` と blocked fallbackを決めるようにした。
- `src/hooks/useProjectExport.ts` の初期化順を encoder plan先行へ変更し、Rust encoder経路ではPixi canvas / HTMLVideoElement / ImageBitmap capture fallbackへ戻らずfail-loudにした。
- package version を `0.1.1-Beta-69a` に更新した。

### 検証
- `npm test -- src/utils/projectExportFrameCanvas.test.ts`
- `npm test -- src/utils/projectExportFrameCanvas.test.ts src/utils/projectExportEncodePlan.test.ts src/utils/rustBackendVideoEncodeExport.test.ts src/utils/projectExportRustEncodeFrame.test.ts`
- `npx tsc --noEmit 2>&1 | rg "projectExportFrameCanvas|useProjectExport|projectExportEncodePlan|rustBackendVideoEncode"`（対象ファイルの型エラーなし）

### 残課題・次のステップ
- 実機Electronで通常export時にRust frame sourceが無い場合のfail-loudメッセージと、Rust frame sourceがある場合のMP4出力を確認する。
- 互換fallbackとして残るWebCodecs経路は、Rust encoder bridge未接続時だけ許可される。次はpreview/export双方の残りPixi video fallbackを段階的に削る。

## 2026-06-18 — Phase5: 通常exportを Rust encoder 優先へ切り替え

### 実施内容
- `src/utils/projectExportEncodePlan.test.ts` に、通常exportでもRust encoder bridgeが利用可能なら `rustBackendVideoEncoder` を選ぶ契約を追加した。
- `src/utils/projectExportEncodePlan.ts` の優先順位をRust-firstへ変更し、Rust encoder未接続の通常環境だけWebCodecs/mp4-muxerへfallbackするようにした。
- `VITE_UXFD_RUST_EXPORT_ONLY=1` では引き続きRust encoder未接続をfail-loudにし、暗黙のWebCodecs fallbackを禁止する。
- package version を `0.1.1-Beta-68a` に更新した。

### 検証
- `npm test -- src/utils/projectExportEncodePlan.test.ts`
- `npm test -- src/utils/projectExportEncodePlan.test.ts src/utils/rustBackendVideoEncodeExport.test.ts src/utils/projectExportRustEncodeFrame.test.ts`
- `npx tsc --noEmit 2>&1 | rg "projectExportEncodePlan|useProjectExport|rustBackendVideoEncode"`（対象ファイルの型エラーなし）

### 残課題・次のステップ
- 実機Electronで通常起動のexportがRust backend rawvideo/ffmpeg経路へ入ることを確認し、GoPro動画の出力MP4で映像・音声・尺を検証する。
- WebCodecs/mp4-muxerは未接続環境の互換fallbackとして残る。完全除去はRust exportの実機安定性確認後に行う。

## 2026-06-18 — Phase5: export source direct encode を WebGPU readback へ接続

### 実施内容
- `src/utils/sharedRendererPreviewPresenterController.test.ts` に、ready presenter controlが `readPresentedFrameRgbaBytes` を公開する契約を追加した。
- `src/utils/sharedRendererPreviewPresenterController.ts` でWebGPU presenterのreadback APIをcontrolへ露出し、`bufferUsageMapRead` を渡せるようにした。
- `src/utils/rustBackendVideoEncodeSharedFrameWriter.test.ts` / `.ts` に `writePaddedFrame` を追加し、WebGPU readback済みの256 byte stride frameを再packingせずshared memory ringへ書けるようにした。
- `src/utils/sharedRendererExportFrameSource.test.ts` に、presenter readbackがある場合は `ImageBitmap` capture / RGBA extractionを呼ばず `writePaddedFrame` へ渡す契約を追加した。
- `src/utils/sharedRendererExportFrameSource.ts` の `renderEncodeFrame` をWebGPU readback優先にし、readback未対応時だけ従来のImageBitmap経路へfallbackするようにした。
- package version を `0.1.1-Beta-67a` に更新した。

### 検証
- `npm test -- src/utils/sharedRendererPreviewPresenterController.test.ts src/utils/sharedRendererWebGpuPresenter.test.ts`
- `npm test -- src/utils/rustBackendVideoEncodeSharedFrameWriter.test.ts src/utils/rustBackendVideoEncodeExport.test.ts src/utils/sharedRendererExportFrameSource.test.ts`
- `npm test -- src/utils/sharedRendererExportFrameSource.test.ts src/utils/sharedRendererPreviewPresenterController.test.ts src/utils/rustBackendVideoEncodeSharedFrameWriter.test.ts`
- `npx tsc --noEmit 2>&1 | rg "sharedRendererExportFrameSource|rustBackendVideoEncodeSharedFrameWriter"`（対象ファイルの型エラーなし）

### 残課題・次のステップ
- 実機ElectronでRust-only exportを確認し、WebGPU readback経路が実際のGoPro動画で動くか、出力MP4の映像・音声・時間長を検証する。
- readback bufferはまだCPU mapped bytesを経由する。最終的にはGPU bufferからnative/shared memoryへのcopy最短化を検討するが、`ImageBitmap`/canvas 2D readbackはRust encoder direct経路から外れた。

## 2026-06-18 — Phase5: WebGPU presented frame readback API を追加

### 実施内容
- `src/utils/sharedRendererWebGpuPresenter.test.ts` に、最後にpresentしたcanvas textureから `copyTextureToBuffer` で256 byte aligned row pitchのRGBA bytesを読む契約を追加した。
- `src/utils/sharedRendererWebGpuPresenter.ts` でcanvas contextを `RENDER_ATTACHMENT | COPY_SRC` でconfigureし、present時に最後のtarget textureを保持するようにした。
- `readPresentedFrameRgbaBytes` を追加し、`GPUBufferUsage.MAP_READ | COPY_DST` のreadback bufferへcopyしてmapped bytesを返すようにした。
- package version を `0.1.1-Beta-66a` に更新した。

### 検証
- `npm test -- src/utils/sharedRendererWebGpuPresenter.test.ts`
- `npm test -- src/utils/sharedRendererWebGpuPresenter.test.ts src/utils/sharedRendererPreviewPresenterController.test.ts src/utils/sharedRendererExportFrameSource.test.ts`
- `npx tsc --noEmit 2>&1 | rg "sharedRendererWebGpuPresenter(\\.test)?\\.ts"`（対象ファイルの型エラーなし）

### 残課題・次のステップ
- `SharedRendererPreviewPresenterControl` / `SharedRendererExportFrameSource` へreadback APIを接続し、direct encode時の `ImageBitmap` captureを実際に削除する。
- 全体 `tsc` は既存の `sharedRendererPreviewPresenterController.test.ts` 型エラーを含むため、今回も対象ファイルに絞って確認した。

## 2026-06-18 — Phase5: SharedRendererExportFrameSource で direct encode frame を生成

### 実施内容
- `src/utils/sharedRendererExportFrameSource.test.ts` に、shared renderer export sourceが `renderEncodeFrame` でwritable shared frame writerへRGBAを書き、`RustBackendVideoEncodeWriteFramePayload` を返す契約を追加した。
- `src/utils/sharedRendererExportFrameSource.ts` の描画処理を内部 `renderFrameBitmap` に切り出し、通常の `renderFrame` と `renderEncodeFrame` で同じsurface gate / video ownership gateを通すようにした。
- `renderEncodeFrame` はencode sessionごとにsource専用memory id `/uxfd-export-source-...` のwriterをlazy生成し、source `close()` でwriterとRust decode jobsを閉じる。
- package version を `0.1.1-Beta-65a` に更新した。

### 検証
- `npm test -- src/utils/sharedRendererExportFrameSource.test.ts src/utils/projectExportRustEncodeFrame.test.ts src/utils/rustBackendVideoEncodeExport.test.ts`
- `npx tsc --noEmit 2>&1 | rg "sharedRendererExportFrameSource|projectExportRustEncodeFrame|rustBackendVideoEncodeExport|projectExportFrameCanvas"`（対象ファイルの型エラーなし）

### 残課題・次のステップ
- direct encode経路はrunner側readbackを迂回するが、source内部ではまだ `ImageBitmap` capture + RGBA readbackを使う。次はWebGPU texture / mapped bufferからshared memoryへ直接copyする設計に寄せる。
- Electron実機で `VITE_UXFD_RUST_EXPORT_ONLY=1 npm run dev` を起動し、GoPro動画のRust-only exportが映像・音声つきMP4として保存できるか確認する。

## 2026-06-18 — Phase5: Rust export frame source direct encode 経路を追加

### 実施内容
- `src/utils/rustBackendVideoEncodeExport.test.ts` に、prepacked shared-frame encode payloadを受け取った場合はRGBA readbackやwritable ring copyを行わず、`writeVideoEncodeFrame`へそのまま渡す契約を追加した。
- `src/utils/rustBackendVideoEncodeExport.ts` を `ImageBitmap` frame / shared-frame payload frame のunion入力に対応させた。
- `src/utils/projectExportRustEncodeFrame.test.ts` / `projectExportRustEncodeFrame.ts` を追加し、`ProjectExportRustFrameSource.renderEncodeFrame` がある場合にRust encoder用direct payloadを優先するhelperを実装した。
- `src/hooks/useProjectExport.ts` でRust encoder経路だけ `renderEncodeFrame` を優先し、同じ `sessionId` をframe sourceとRust encoder runnerへ渡すようにした。
- package version を `0.1.1-Beta-64a` に更新した。

### 検証
- `npm test -- src/utils/rustBackendVideoEncodeExport.test.ts src/utils/rustBackendVideoEncodeSharedFrameWriter.test.ts src/utils/rustBackendVideoEncodeControl.test.ts`
- `npm test -- src/utils/projectExportRustEncodeFrame.test.ts src/utils/rustBackendVideoEncodeExport.test.ts src/utils/projectExportFrameCanvas.test.ts`
- `npx tsc --noEmit 2>&1 | rg "useProjectExport|projectExportRustEncodeFrame|rustBackendVideoEncodeExport|projectExportFrameCanvas"`（対象ファイルの型エラーなし）

### 残課題・次のステップ
- `SharedRendererExportFrameSource` 自体はまだ `renderEncodeFrame` を実装していない。次段でWebGPU/export canvas readbackをshared memory writerへ移し、`ImageBitmap`を返さない実経路を作る。
- direct payload経路ではRust backend encoderがslot解放まで行うため、shared renderer側のring所有権・close順序を追加テストで固定する。

## 2026-06-18 — Phase5: Rust encode audio mux を接続

### 実施内容
- `rust-backend/tests/decode_control_plane.rs` に、`encode.start` が `audioPath` を受け取り、shared-frame映像とWAV音声をmuxしたMP4にaudio streamが含まれる契約を追加した。
- `rust-backend/src/main.rs` のshared-frame encoderで `audioPath` を受け付け、ffmpeg rawvideo stdin + WAV inputを `-map 0:v:0 -map 1:a:0` でmuxするようにした。
- `src/utils/rustBackendVideoEncodeExport.ts` / `rustBackendVideoEncodeControl.ts` / `vite-env.d.ts` に `audioPath` を追加した。
- `src/hooks/useProjectExport.ts` のRust encoder経路で `buildExportAudioMixWav` → `save-temp-audio` → `runRustBackendVideoEncodeExport(audioPath)` → `delete-temp-file` の流れを接続した。
- package version を `0.1.1-Beta-63a` に更新した。

### 検証
- `cargo test --manifest-path rust-backend/Cargo.toml encode_start_accepts_audio_path_and_muxes_audio_with_shared_frames`
- `cargo test --manifest-path rust-backend/Cargo.toml encode_`
- `npm test -- src/utils/rustBackendVideoEncodeExport.test.ts src/utils/rustBackendVideoEncodeControl.test.ts`
- `npx tsc --noEmit 2>&1 | rg "useProjectExport|rustBackendVideoEncodeExport|rustBackendVideoEncodeControl|vite-env"`（対象ファイルの型エラーなし）

### 残課題・次のステップ
- 実機ElectronでRust-only exportを確認し、GoPro動画 + timeline音声のMP4 mux結果を確認する。
- まだRGBA readbackはrenderer canvas由来のCPU readbackを挟む。次段ではshared renderer export sourceから直接shared memory frame descriptorを返す形へ寄せ、`ImageBitmap` readbackを削る。

## 2026-06-18 — Phase5: useProjectExport の Rust encoder 分岐を接続

### 実施内容
- `src/hooks/useProjectExport.ts` の `rustBackendVideoEncoder` 分岐から未接続alertを削除し、`runRustBackendVideoEncodeExport` を呼ぶようにした。
- Rust encoder経路では `renderFrames()` の `ImageBitmap` streamをshared memory writerへ渡し、WebCodecs/mp4-muxerとElectron export stream writerを迂回する。
- legacy WebCodecs経路では従来どおり `buildExportAudioBuffer` と `encodeVideoToMp4` を使う。Rust encoder経路の音声muxは未接続として明示的に次段へ残した。
- package version を `0.1.1-Beta-62a` に更新した。

### 検証
- `npm test -- src/utils/rustBackendVideoEncodeExport.test.ts src/utils/rustBackendVideoEncodeSharedFrameWriter.test.ts src/utils/projectExportEncodePlan.test.ts src/utils/projectExportFrameCanvas.test.ts`
- `npx tsc --noEmit 2>&1 | rg "useProjectExport|rustBackendVideoEncodeExport|rustBackendVideoEncodeSharedFrameWriter|projectExportEncodePlan|projectExportFrameCanvas"`（対象ファイルの型エラーなし）

### 残課題・次のステップ
- Rust encoder経路は映像のみ。次はRust backend `encode.start` にaudio sourceを渡し、ffmpegで映像と音声を同時muxする。
- 実機Electronで `VITE_UXFD_RUST_EXPORT_ONLY=1 npm run dev` を使い、GoPro動画をshared renderer export source経由でMP4保存できるか確認する。

## 2026-06-18 — Phase5: Rust encode export runner を追加

### 実施内容
- `src/utils/rustBackendVideoEncodeExport.test.ts` を追加し、rendered `ImageBitmap` streamをRust backend encoderへ流すorchestration契約をRedで固定した。
- `src/utils/rustBackendVideoEncodeExport.ts` を追加し、`startVideoEncode` → writable shared frame ring作成 → frameごとのRGBA readback/write → `writeVideoEncodeFrame` → ring close → `finishVideoEncode` の順で実行するrunnerを実装した。
- frame dataはshared memory ringへだけ書き、encoder IPC payloadには `RustBackendVideoEncodeWriteFramePayload` のdescriptor metadataのみを載せる。
- package version を `0.1.1-Beta-61a` に更新した。

### 検証
- `npm test -- src/utils/rustBackendVideoEncodeExport.test.ts src/utils/rustBackendVideoEncodeSharedFrameWriter.test.ts src/utils/rustBackendVideoEncodeControl.test.ts`
- `npx tsc --noEmit 2>&1 | rg "rustBackendVideoEncodeExport|rustBackendVideoEncodeSharedFrameWriter|rustBackendVideoEncodeControl"`（対象ファイルの型エラーなし）

### 残課題・次のステップ
- まだ `useProjectExport` のRust encoder分岐はこのrunnerを呼んでいない。次段でalertを外し、Rust-only export時にshared renderer frame sourceからRust encoderへ映像を書き出す。
- Rust backend encoderのaudio mux入口は未実装。映像Rust化を先に接続し、その後 `encode.start` payloadへaudio inputを追加して音声もRust側へ移す。

## 2026-06-18 — Phase5: Rust encoder shared frame writer を追加

### 実施内容
- `src/utils/rustBackendVideoEncodeSharedFrameWriter.test.ts` を追加し、tight RGBA rowsを256 byte strideへpaddingしてwritable shared frame ringへ書き、Rust encoder payloadをdescriptor metadataだけで返す契約をRedで固定した。
- `src/utils/rustBackendVideoEncodeSharedFrameWriter.ts` を追加し、`createWritableSharedFrameRing` / `writeIntoSharedFrameRing` / `closeWritableSharedFrameRing` を使うexport用writerを実装した。
- `RustBackendVideoEncodeWriteFramePayload` は `memoryId` / `slotCount` / `byteLen` / `strideBytes` / colour metadataを持つshared frame descriptorだけを運び、frame bytes / base64 / pixel arrayをcontrol planeへ載せない。
- package version を `0.1.1-Beta-60z` に更新した。

### 検証
- `npm test -- src/utils/rustBackendVideoEncodeSharedFrameWriter.test.ts src/utils/sharedVideoFrameWritableBridge.test.ts src/utils/rustBackendVideoEncodeControl.test.ts`
- `npx tsc --noEmit 2>&1 | rg "rustBackendVideoEncodeSharedFrameWriter|sharedVideoFrameWritableBridge|rustBackendVideoEncodeControl"`（対象ファイルの型エラーなし）

### 残課題・次のステップ
- まだ `useProjectExport` の `rustBackendVideoEncoder` 分岐はalertで止まっている。次段でshared renderer export frameをRGBA bytesへ変換し、このwriter経由でRust backend encoderへ渡す。
- 今回 `SubVer` が `z` に到達したため、次の動作変更では版番号を `0.1.1-Beta-61a` へ繰り上げる。

## 2026-06-18 — Phase5: writable shared frame bridge を追加

### 実施内容
- `shared-video-frame-bridge` に、writable POSIX shared memory ring の create / write / close APIを追加した。
- N-API addonに `createWritableSharedFrameRing` / `writeIntoSharedFrameRing` / `closeWritableSharedFrameRing` を公開した。
- preload の `window.sharedVideoFrame` から同APIを呼べるようにし、renderer utility `sharedVideoFrameWritableBridge` を追加した。
- `test:bridge-node` で、addonが作ったringへ `Uint8Array` をwriteし、既存copy APIで同じbytesを読み戻せることを確認した。
- package version を `0.1.1-Beta-60y` に更新した。

### Red
- `scripts/test-shared-video-frame-node-addon.mjs` にwritable ring API契約を追加し、未実装関数で失敗することを確認した。
- `src/utils/sharedVideoFrameWritableBridge.test.ts` にrenderer utility契約を追加し、未実装moduleで失敗することを確認した。

### Green
- `shared-video-frame-bridge/src/lib.rs` にwritable ring registryを追加した。
- `shared-video-frame-bridge-node/src/lib.rs` にN-API wrapperを追加した。
- `electron/preload.ts` と `src/vite-env.d.ts` にwritable shared frame APIを追加した。
- `src/utils/sharedVideoFrameWritableBridge.ts` を追加した。

### 現在の制限
- まだ `useProjectExport` はこのwritable ringへexport frameを書いていない。次段でshared renderer export frameをRGBA bytes化し、writable ringへwriteしてRust encoderへdescriptorを渡す。

### 検証
- `npm run test:bridge-node`
  -> shared video frame native addon contract passed。
- `cargo test --manifest-path shared-video-frame-bridge/Cargo.toml`
  -> 1 test passed。
- `npm test -- src/utils/sharedVideoFrameWritableBridge.test.ts src/utils/sharedVideoFrameUploadBridge.test.ts`
  -> 2 files / 4 tests passed。
- `npx tsc --noEmit 2>&1 | rg "(electron/preload\\.ts|src/(utils/sharedVideoFrameWritableBridge\\.ts|utils/sharedVideoFrameWritableBridge\\.test\\.ts|vite-env\\.d\\.ts))"`
  -> 対象ファイルの型エラーなし。

## 2026-06-18 — Phase5: Rust encode で rawvideo ffmpeg 出力を実装

### 実施内容
- `encode.start` が raw RGBA input の ffmpeg processを起動し、stdinをRust backend sessionに保持するようにした。
- `encode.writeFrame` はshared memoryから読んだpadded RGBAを行単位でtight RGBAへ詰め直し、ffmpeg stdinへ書くようにした。
- `encode.finish` はstdinを閉じてffmpegをwaitし、MP4 output fileを確定するようにした。
- 未finishのencode sessionはbackend終了時にkill/waitして、テストや異常終了でffmpeg processを残しにくくした。
- package version を `0.1.1-Beta-60x` に更新した。

### Red
- `rust-backend/tests/decode_control_plane.rs` のencode session契約を、`encode.finish` 後に実際のMP4 output fileが存在し、payloadを持つことまで拡張した。
- 旧実装ではffmpegを起動していないため、output fileが存在せず失敗することを確認した。

### Green
- `EncodeSession` に `Child` / `ChildStdin` を持たせた。
- `start_encode_ffmpeg` を追加し、`-f rawvideo -pix_fmt rgba` のstdin入力でffmpegを起動するようにした。
- `write_tight_rgba_frame_to_encoder` を追加し、GPU row pitch付きshared frameからtight RGBAだけを抽出してstdinへ書くようにした。
- `handle_encode_finish` でffmpeg終了ステータスを確認するようにした。

### 現在の制限
- Renderer/export orchestrationはまだRust encoderへshared-frame export sourceを流していない。次段で `useProjectExport` の `rustBackendVideoEncoder` 分岐を実装し、shared renderer export frame sourceからshared memory descriptorを渡す経路を作る必要がある。

### 検証
- `cargo test --manifest-path rust-backend/Cargo.toml encode_`
  -> 3 tests passed。
- `cargo test --manifest-path rust-backend/Cargo.toml decode_start_returns_shared_ring_layout_without_frame_bytes`
  -> 1 test passed。

## 2026-06-18 — Phase5: Rust encode write で shared frame を読み解放

### 実施内容
- `encode.writeFrame` が `PosixSharedRing::attach_with_retry_for_layout` でshared memoryへattachするようにした。
- `SharedFrame.ptsFrame` をsequenceとして対象frameを読み、checksum検証済みのbytesをRust backend側で受け取るようにした。
- 読み終えたslotを `CopyOutState::EncoderFrameWritten` で解放し、producer側のshared memory ringがFREEへ戻るようにした。
- responseには `sharedFrameByteLen` だけを返し、frame bytes / base64 / pixel array はcontrol planeに載せない。
- package version を `0.1.1-Beta-60w` に更新した。

### Red
- `rust-backend/tests/decode_control_plane.rs` のencode session契約を、テスト内で作った `PosixSharedRing` にframeを書いたうえで `encode.writeFrame` 後にslotがFREEへ戻る形へ拡張した。
- 旧実装ではdescriptor検証だけでshared memoryを読まないため、`wait_until_free` がtimeoutすることを確認した。

### Green
- `rust-backend/src/main.rs` に `read_encode_shared_frame` を追加した。
- unix環境では `PosixSharedRing::attach_with_retry_for_layout` / `read_frame` / `release_frame(EncoderFrameWritten)` を実行し、非unix環境ではdescriptor byte lengthだけを受け付ける形にした。

### 現在の制限
- まだ読んだframe bytesをffmpeg / encoder stdinへ書いていない。次段で `encode.start` がrawvideo ffmpeg processを起動し、`encode.writeFrame` が読み取ったRGBA frameをstdinへ渡す。

### 検証
- `cargo test --manifest-path rust-backend/Cargo.toml encode_`
  -> 3 tests passed。
- `cargo test --manifest-path rust-backend/Cargo.toml decode_start_returns_shared_ring_layout_without_frame_bytes`
  -> 1 test passed。
- `cargo test --manifest-path shared-memory-spike/Cargo.toml posix_shm_slot_can_be_released_after_encoder_writes_frame`
  -> 1 test passed。

## 2026-06-18 — Phase5: Rust encode session skeleton を実装

### 実施内容
- Rust backend の `encode.start` / `encode.writeFrame` / `encode.finish` をfail-loud予約からsession管理へ進めた。
- `encode.start` は `sessionId` ごとのsessionを作り、`rgba8Srgb` / `bt709` / `srgb` / `rgb` / `full` 以外を拒否する。
- `encode.writeFrame` は `slotCount` と `SharedFrame` descriptorを検証し、sessionのwidth/height/format/colourと一致しないframeを拒否する。
- `encode.finish` はsessionを閉じ、`filePath` と `frameCount` を返す。
- package version を `0.1.1-Beta-60v` に更新した。

### Red
- `rust-backend/tests/decode_control_plane.rs` に、Rust encode sessionがstart/write/finishでmetadataとdescriptorを追跡し、legacy base64 payloadを返さない契約を追加した。
- `slotCount` が無い `encode.writeFrame` を拒否する契約を追加した。
- sessionの寸法と一致しないdescriptorを拒否する契約を追加した。

### Green
- `rust-backend/src/main.rs` に `EncodeSession` と `EncodeStartParams` / `EncodeWriteFrameParams` / `EncodeFinishParams` を追加した。
- `handle_encode_start` / `handle_encode_write_frame` / `handle_encode_finish` を実装し、`validate_encode_shared_frame` でdescriptor整合を検証するようにした。

### 現在の制限
- `encode.writeFrame` はまだ `PosixSharedRing::attach_with_retry_for_layout` でshared memoryを読んでいない。次段でdescriptorからshared memoryへattachし、frame bytesをRust側で取得してslotを `encoderFrameWritten` で解放する。

### 検証
- `cargo test --manifest-path rust-backend/Cargo.toml encode_`
  -> 3 tests passed。
- `cargo test --manifest-path rust-backend/Cargo.toml decode_start_returns_shared_ring_layout_without_frame_bytes`
  -> 1 test passed。

## 2026-06-18 — Phase5: Rust encode frame payload に slotCount を追加

### 実施内容
- `RustBackendVideoEncodeWriteFramePayload` に `slotCount` を追加した。
- `window.rustVideoEncoder.writeVideoEncodeFrame` の型にも `slotCount` を追加し、rendererからRust backendへshared memory layoutを渡せるようにした。
- package version を `0.1.1-Beta-60u` に更新した。

### Red
- `src/utils/rustBackendVideoEncodeControl.test.ts` に、shared memory descriptorでframeを書き込むpayloadが `slotCount` を含む契約を追加した。
- `npx tsc --noEmit` の対象抽出で、`slotCount` がpayload型に存在しないことを確認した。

### Green
- `src/utils/rustBackendVideoEncodeControl.ts` と `src/vite-env.d.ts` のpayload型へ `slotCount` を追加した。

### 現在の制限
- Rust backendはまだ `slotCount` を使ってshared memoryへattachしていない。次段で `encode.start/writeFrame/finish` のsession skeletonを実装する。

### 検証
- `npm test -- src/utils/rustBackendVideoEncodeControl.test.ts`
  -> 1 file / 4 tests passed。
- `npx tsc --noEmit 2>&1 | rg "src/(utils/rustBackendVideoEncodeControl\\.test\\.ts|utils/rustBackendVideoEncodeControl\\.ts|vite-env\\.d\\.ts)"`
  -> 対象ファイルの型エラーなし。

## 2026-06-18 — Phase5: encoder書込後の shared slot 解放状態を追加

### 実施内容
- `CopyOutState::EncoderFrameWritten` を追加し、Rust encoderがshared memory frameをencoder stdinへ書き終えた後にslotを解放できる状態を定義した。
- `SharedFrameRing::release_read_slot` と `PosixSharedRing::release_frame` の解放許可判定を `permits_read_slot_release()` に揃えた。
- preview decode向けの `gpuUploadFenceSignalled` / `rendererUploadAborted` と、encode向けの `encoderFrameWritten` を同じ所有権返却口で扱えるようにした。
- package version を `0.1.1-Beta-60t` に更新した。

### Red
- `sidecar-protocol/tests/ring_buffer.rs` に、encoder書込完了後にREADING slotをFREEへ戻せる契約を追加した。
- `sidecar-protocol/tests/control_plane.rs` に、`encoderFrameWritten` がcamelCaseでserialiseされ、frame bytesを含まない契約を追加した。
- `shared-memory-spike/tests/posix_shm_two_process.rs` に、POSIX shared memory ringでもencoder書込後にslotを解放できる契約を追加した。

### Green
- `sidecar-protocol/src/lib.rs` に `CopyOutState::EncoderFrameWritten` を追加し、`permits_read_slot_release()` で許可した。
- `shared-memory-spike/src/lib.rs` の `release_frame` を `permits_read_slot_release()` ベースに変更した。

### 現在の制限
- まだ `encode.writeFrame` は実際にはshared memoryへattachしていない。次段で `slotCount` を含むencode payload契約を足し、Rust backendが `PosixSharedRing::attach_with_retry_for_layout` でframeを読む。

### 検証
- `cargo test --manifest-path sidecar-protocol/Cargo.toml encoder_frame_written`
  -> 1 test passed。
- `cargo test --manifest-path sidecar-protocol/Cargo.toml reading_slot_can_be_released_when_encoder_has_written_frame`
  -> 1 test passed。
- `cargo test --manifest-path sidecar-protocol/Cargo.toml reading_slot_is_not_freed_until_copy_out_completion_is_signalled`
  -> 1 test passed。
- `cargo test --manifest-path shared-memory-spike/Cargo.toml posix_shm_slot_can_be_released_after_encoder_writes_frame`
  -> 1 test passed。
- `cargo test --manifest-path shared-memory-spike/Cargo.toml posix_shm_multi_slot_allows_next_frame_while_previous_frame_is_reading`
  -> 1 test passed。
- `cargo test --manifest-path rust-backend/Cargo.toml encode_shared_frame_rpc_is_reserved_and_fails_loud_without_legacy_base64_fallback`
  -> 1 test passed。

## 2026-06-18 — Phase5: Rust encode IPC を backend RPC へ接続

### 実施内容
- Electron main の `rust-backend-encode-start` / `rust-backend-encode-write-frame` / `rust-backend-encode-finish` handlerを、Rust backend の `encode.start` / `encode.writeFrame` / `encode.finish` RPC呼び出しへ接続した。
- `writeFrame` payloadはshared memory descriptorをそのまま渡し、旧 `write-frame` channelや `export.write_frame` のbase64経路へ戻らない境界にした。
- Rust backendが未実装エラーを返した場合も、renderer bridge向けに `{ success: false, error }` へflattenするようにした。
- package version を `0.1.1-Beta-60s` に更新した。

### Red
- `src/utils/rustVideoEncodeBackendBridge.test.ts` に、encode start/write/finishがRust backendの `encode.*` RPCへ流れ、legacy channel / `frameBase64` / `rgbaBytes` を使わない契約を追加した。

### Green
- `electron/rustVideoEncodeBackendBridge.ts` を追加し、`callRustBackend` の成功/失敗を renderer bridge result shapeへ変換する薄い境界を実装した。
- `electron/main.ts` の Rust encode IPC handlerを、fail-loud stubからbackend RPC bridge呼び出しへ置き換えた。

### 現在の制限
- Rust backend encoder本体はまだ未実装のため、`encode.*` RPCは現時点でも `Rust shared-frame video encoder backend is not connected yet.` を返す。違いは、その未実装判定がElectron stubではなくRust backend側まで到達すること。

### 検証
- `npm test -- src/utils/rustVideoEncodeBackendBridge.test.ts src/utils/rustVideoEncodeIpcChannels.test.ts src/utils/rustBackendVideoEncodeControl.test.ts src/utils/projectExportEncodePlan.test.ts`
  -> 4 files / 13 tests passed。
- `cargo test --manifest-path rust-backend/Cargo.toml encode_shared_frame_rpc_is_reserved_and_fails_loud_without_legacy_base64_fallback`
  -> 1 test passed。
- `npx tsc --noEmit 2>&1 | rg "(electron/(main|rustVideoEncodeBackendBridge|rustVideoEncodeIpc)\\.ts|src/(utils/rustVideoEncodeBackendBridge\\.test\\.ts|utils/rustVideoEncodeIpcChannels\\.test\\.ts|utils/rustBackendVideoEncodeControl\\.ts|utils/projectExportEncodePlan\\.ts|vite-env\\.d\\.ts))"`
  -> 対象ファイルの型エラーなし。

## 2026-06-18 — Phase5: Rust shared-frame encode RPC を予約

### 実施内容
- Rust backend に `encode.start` / `encode.writeFrame` / `encode.finish` を追加した。
- 旧 `export.start` / `export.write_frame` / `export.end` のbase64/MJPEG stdin経路とは別の、shared-frame encoder用RPC名を確保した。
- 本体未実装の現段階では `Rust shared-frame video encoder backend is not connected yet.` を返し、`Method not found` やlegacy fallbackにはしない。
- package version を `0.1.1-Beta-60r` に更新した。

### Red
- `rust-backend/tests/decode_control_plane.rs` に、`encode.*` RPC が予約済みであり、shared frame descriptor payloadでも旧base64 fallbackへ流れない契約を追加した。

### Green
- `rust-backend/src/main.rs` の `handle_request` に `encode.start` / `encode.writeFrame` / `encode.finish` を追加し、`handle_encode_unavailable` へ接続した。

### 現在の制限
- Rust backend encoder本体はまだ未実装。次段では Electron main の `rust-backend-encode-*` IPC からこのRPCへ接続し、その後 shared memory frameをffmpeg/encoderへ渡す実装へ進む。

### 検証
- `cargo test --manifest-path rust-backend/Cargo.toml encode_shared_frame_rpc_is_reserved_and_fails_loud_without_legacy_base64_fallback`
  -> 1 test passed。
- `cargo test --manifest-path rust-backend/Cargo.toml decode_start_returns_shared_ring_layout_without_frame_bytes`
  -> 1 test passed。

## 2026-06-18 — Phase5: Rust video encode IPC境界を追加

### 実施内容
- `rustVideoEncodeIpcChannels` を追加し、Rust shared-frame encoder用の IPC channel 名を固定した。
- `preload` から `window.rustVideoEncoder.startVideoEncode` / `writeVideoEncodeFrame` / `finishVideoEncode` を露出した。
- Electron main に同channelのhandlerを登録した。
- 現段階では旧base64 export APIへ流さず、`Rust shared-frame video encoder backend is not connected yet.` としてfail-loudにする。
- package version を `0.1.1-Beta-60q` に更新した。

### Red
- `src/utils/rustVideoEncodeIpcChannels.test.ts` に、Rust encode IPC channel が legacy `start-export` / `write-frame` / `end-export` と別名である契約を追加した。

### Green
- `electron/rustVideoEncodeIpc.ts` を追加した。
- `electron/preload.ts` へ `rustVideoEncoder` bridgeを追加した。
- `electron/main.ts` に fail-loud handlerを追加し、未実装段階で旧base64経路へ暗黙fallbackしないようにした。

### 現在の制限
- Rust backend の shared-frame encoder RPC 本体は未実装。IPC名とrenderer/preload/mainの境界を固定した段階。

### 検証
- `npm test -- src/utils/rustVideoEncodeIpcChannels.test.ts src/utils/rustBackendVideoEncodeControl.test.ts src/utils/projectExportEncodePlan.test.ts`
  -> 3 files / 9 tests passed。
- `npm test -- src/utils/rustVideoEncodeIpcChannels.test.ts src/utils/rustBackendVideoEncodeControl.test.ts src/utils/projectExportEncodePlan.test.ts src/utils/rustBackendVideoDecodeControl.test.ts src/utils/sharedVideoFrameUploadBridge.test.ts src/utils/sharedRendererRustVideoUploadPipeline.test.ts src/utils/sharedRendererViewportVideoUpload.test.ts src/utils/projectExportFrameCanvas.test.ts src/utils/sharedRendererExportFrameSource.test.ts`
  -> 9 files / 44 tests passed。
- `npx tsc --noEmit 2>&1 | rg "(electron/(preload|main|rustVideoEncodeIpc)\\.ts|src/(utils/rustVideoEncodeIpcChannels\\.test\\.ts|utils/rustBackendVideoEncodeControl\\.ts|utils/projectExportEncodePlan\\.ts|hooks/useProjectExport\\.ts|vite-env\\.d\\.ts))"`
  -> 対象ファイルの型エラーなし。

## 2026-06-18 — Phase5: Rust video encode bridge control を追加

### 実施内容
- `rustBackendVideoEncodeControl` を追加し、Rust video encoder session の `startVideoEncode` / `writeVideoEncodeFrame` / `finishVideoEncode` をrenderer側から扱える型境界を作った。
- `writeVideoEncodeFrame` は `RustBackendSharedVideoFrame` の shared memory descriptor を渡し、`frameBase64` や `rgbaBytes` をcontrol payloadへ載せない契約にした。
- `resolveProjectExportEncodePlanFromBridge` を追加し、`window.rustVideoEncoder` のbridge shapeからRust encoder availabilityを判断するようにした。
- `useProjectExport` は固定 `rustEncoderAvailable=false` ではなく、renderer bridge availabilityからencode planを選ぶようにした。
- package version を `0.1.1-Beta-60p` に更新した。

### Red
- `src/utils/rustBackendVideoEncodeControl.test.ts` に、encoder bridge availability、metadataのみのstart、shared frame descriptorによるframe write、session idによるfinishの契約を追加した。
- `src/utils/projectExportEncodePlan.test.ts` に、bridge shapeからRust encoder availabilityを導出する契約を追加した。

### Green
- `src/utils/rustBackendVideoEncodeControl.ts` を追加した。
- `src/utils/projectExportEncodePlan.ts` に `resolveProjectExportEncodePlanFromBridge` を追加した。
- `src/hooks/useProjectExport.ts` から `window.rustVideoEncoder` を使ってencode planを解決するようにした。
- `src/vite-env.d.ts` に `window.rustVideoEncoder` の型を追加した。

### 現在の制限
- `window.rustVideoEncoder` のpreload/main接続とRust backend encoder本体は未実装。現時点ではrenderer側のRust encoder control境界を先に固定した段階。

### 検証
- `npm test -- src/utils/rustBackendVideoEncodeControl.test.ts`
  -> 1 file / 4 tests passed。
- `npm test -- src/utils/rustBackendVideoEncodeControl.test.ts src/utils/projectExportEncodePlan.test.ts`
  -> 2 files / 8 tests passed。
- `npm test -- src/utils/rustBackendVideoEncodeControl.test.ts src/utils/projectExportEncodePlan.test.ts src/utils/rustBackendVideoDecodeControl.test.ts src/utils/sharedVideoFrameUploadBridge.test.ts src/utils/sharedRendererRustVideoUploadPipeline.test.ts src/utils/sharedRendererViewportVideoUpload.test.ts src/utils/projectExportFrameCanvas.test.ts src/utils/sharedRendererExportFrameSource.test.ts`
  -> 8 files / 43 tests passed。
- `npx tsc --noEmit 2>&1 | rg "src/(utils/rustBackendVideoEncodeControl\\.ts|utils/projectExportEncodePlan\\.ts|hooks/useProjectExport\\.ts|vite-env\\.d\\.ts)"`
  -> 対象ファイルの型エラーなし。

## 2026-06-18 — Phase5: Rust video必須時は Pixi preview fallback を禁止

### 実施内容
- `shouldSkipPixiVideoForSharedRenderer` に `requireSharedRendererVideo` を追加した。
- `requireSharedRendererVideo=true` のpreviewでは、shared renderer ownership対象IDに入っていない動画clipでもPixi video fallbackを作らないようにした。
- `VITE_UXFD_RUST_VIDEO_ONLY=1` を `Viewport` から `updatePixiContent` へ渡すようにした。
- package version を `0.1.1-Beta-60o` に更新した。

### Red
- `src/utils/pixiVideoCutover.test.ts` に、Rust video必須時は未所有videoでもpreviewのPixi fallbackをskipする契約を追加した。

### Green
- `src/utils/pixiVideoCutover.ts` と `src/utils/pixiRenderHelper.ts` にstrict video fallback禁止フラグを接続した。
- `src/components/Viewport.tsx` と `src/vite-env.d.ts` に `VITE_UXFD_RUST_VIDEO_ONLY` を追加した。

### 現在の制限
- flag有効時、shared rendererが所有できない動画clipはPixiでは表示されない。これは検証用のfail-visible挙動で、既定の互換モードでは従来通りPixi fallbackを維持する。

### 検証
- `npm test -- src/utils/pixiVideoCutover.test.ts`
  -> 1 file / 4 tests passed。
- `npm test -- src/utils/pixiVideoCutover.test.ts src/utils/videoElementForPixi.test.ts src/utils/projectExportEncodePlan.test.ts src/utils/projectExportFrameCanvas.test.ts src/utils/sharedRendererExportFrameSource.test.ts src/utils/viewportRustExportFrameSource.test.ts src/utils/sharedRendererViewportVideoUpload.test.ts src/utils/sharedRendererWebGpuPresenter.test.ts`
  -> 8 files / 65 tests passed。
- `npx tsc --noEmit 2>&1 | rg "src/(utils/pixiVideoCutover\\.ts|utils/pixiRenderHelper\\.ts|components/Viewport\\.tsx|vite-env\\.d\\.ts)"`
  -> 対象ファイルの型エラーなし。

## 2026-06-18 — Phase5: Rust-only export で WebCodecs encoder を拒否

### 実施内容
- `resolveProjectExportEncodePlan` を追加し、export encoder の選択を明示的なplanに分離した。
- 通常互換モードでは従来どおり `webCodecsMp4Muxer` を選ぶ。
- `VITE_UXFD_RUST_EXPORT_ONLY=1` では、Rust video encoder backendが無い限り `rustEncoderRequired` としてexport開始前に失敗するようにした。
- `useProjectExport` が encode plan を確認し、Rust-only時に WebCodecs `VideoEncoder` / mp4-muxer へ暗黙に戻らないようにした。
- package version を `0.1.1-Beta-60n` に更新した。

### Red
- `src/utils/projectExportEncodePlan.test.ts` を追加し、通常互換モードではWebCodecs、Rust-onlyかつRust encoder未接続では失敗、Rust encoder利用可能時はRust backend encoderを選ぶ契約を追加した。

### Green
- `src/utils/projectExportEncodePlan.ts` を追加し、encoder選択の純粋関数を実装した。
- `src/hooks/useProjectExport.ts` に encode plan check を追加した。

### 現在の制限
- Rust video encoder backend本体は未接続のため、Rust-only exportはこの段階では明示的に失敗する。次段でRust backend encoder sessionへ接続する。

### 検証
- `npm test -- src/utils/projectExportEncodePlan.test.ts`
  -> 1 file / 3 tests passed。
- `npm test -- src/utils/projectExportEncodePlan.test.ts src/utils/projectExportFrameCanvas.test.ts src/utils/sharedRendererExportFrameSource.test.ts src/utils/viewportRustExportFrameSource.test.ts`
  -> 4 files / 31 tests passed。
- `npx tsc --noEmit 2>&1 | rg "src/(hooks/useProjectExport\\.ts|utils/projectExportEncodePlan\\.ts|utils/projectExportFrameCanvas\\.ts)"`
  -> 対象ファイルの型エラーなし。

## 2026-06-18 — Phase5: Rust export 動画ownership失敗を blocked 扱いにする

### 実施内容
- Rust/shared renderer export frame sourceで、presenter control の `videoOwnership.owner` を確認するようにした。
- exportではPixiに動画所有を戻せないため、`videoOwnership.owner !== 'sharedRenderer'` かつ `reason !== 'noVideoScene'` の場合は `videoOwnershipUnavailable` としてblocked errorに変換する。
- 動画ownership失敗時はbitmap captureへ進まず、presenter controlをdisposeしてからlegacy canvas exportへ退避する。
- package version を `0.1.1-Beta-60m` に更新した。

### Red
- `src/utils/sharedRendererExportFrameSource.test.ts` に、動画ownershipがPixiのままならbitmap captureせずblocked fallbackする契約を追加した。

### Green
- `src/utils/sharedRendererExportFrameSource.ts` に `resolveExportVideoOwnershipBlock` を追加し、export中のPixi video ownership返却を成功扱いしないようにした。

### 現在の制限
- `VITE_UXFD_RUST_EXPORT_ONLY=1` でない場合、blocked後はlegacy canvas exportへ退避する。完全Rust-onlyでは前段のpolicyにより再throwされる。

### 検証
- `npm test -- src/utils/sharedRendererExportFrameSource.test.ts`
  -> 1 file / 7 tests passed。
- `npm test -- src/utils/sharedRendererSurfaceMount.test.ts src/utils/viewportRustExportFrameSource.test.ts src/utils/sharedRendererExportFrameSource.test.ts src/utils/sharedRendererExportSession.test.ts src/utils/projectExportFrameCanvas.test.ts src/utils/sharedRendererViewportPresenterOrchestration.test.ts src/utils/sharedRendererViewportVideoUpload.test.ts src/utils/sharedRendererWebGpuPresenter.test.ts src/utils/rustBackendVideoDecodeControl.test.ts src/utils/sharedRendererRustVideoUploadPipeline.test.ts src/utils/sharedRendererPresenterDiagnostics.test.ts`
  -> 11 files / 64 tests passed。
- `npx tsc --noEmit 2>&1 | rg "src/(utils/sharedRendererExportFrameSource\\.ts|hooks/useProjectExport\\.ts|utils/projectExportFrameCanvas\\.ts)"`
  -> 対象ファイルの型エラーなし。

## 2026-06-18 — Phase5: Rust-only export source policy を追加

### 実施内容
- `ProjectExportRustFrameSourcePolicy` と `ProjectExportRustFrameSourceBlockedFallback` を追加した。
- `rustFrameSourcePolicy=requireRustFrameSource` では、Rust frame sourceが無い場合にlegacy canvasへ戻らず `rustFrameSourceRequired` として失敗するようにした。
- `rustFrameSourceBlockedFallback=failExport` では、Rust frame source blocked後にlegacy canvas runtimeを復旧せず `sharedRendererRustFrameSourceBlocked` として失敗へ流すようにした。
- `useProjectExport` は `VITE_UXFD_RUST_EXPORT_ONLY=1` のときだけ上記policyを有効化する。
- package version を `0.1.1-Beta-60l` に更新した。

### Red
- `src/utils/projectExportFrameCanvas.test.ts` に、Rust source必須時はPixi/explicit canvas fallbackを拒否する契約を追加した。
- Rust source blocked時にlegacy canvasへ戻さずexport失敗へ進むruntime plan契約を追加した。

### Green
- `src/utils/projectExportFrameCanvas.ts` にsource selection policyとblocked fallback policyを実装した。
- `src/hooks/useProjectExport.ts` で strict flag を読み、blocked error捕捉時もfail policyなら再throwするようにした。
- `src/vite-env.d.ts` に `VITE_UXFD_RUST_EXPORT_ONLY` を追加した。

### 現在の制限
- 既定では互換性維持のためlegacy fallbackを許可する。Rust-only動作の実機検証はflag有効時に行う。

### 検証
- `npm test -- src/utils/projectExportFrameCanvas.test.ts`
  -> 1 file / 12 tests passed。
- `npm test -- src/utils/sharedRendererSurfaceMount.test.ts src/utils/viewportRustExportFrameSource.test.ts src/utils/sharedRendererExportFrameSource.test.ts src/utils/sharedRendererExportSession.test.ts src/utils/projectExportFrameCanvas.test.ts src/utils/sharedRendererViewportPresenterOrchestration.test.ts src/utils/sharedRendererViewportVideoUpload.test.ts src/utils/sharedRendererWebGpuPresenter.test.ts src/utils/rustBackendVideoDecodeControl.test.ts src/utils/sharedRendererRustVideoUploadPipeline.test.ts src/utils/sharedRendererPresenterDiagnostics.test.ts`
  -> 11 files / 63 tests passed。
- `npx tsc --noEmit 2>&1 | rg "src/(hooks/useProjectExport\\.ts|utils/projectExportFrameCanvas\\.ts|utils/sharedRendererExportFrameSource\\.ts|utils/viewportRustExportFrameSource\\.ts|vite-env\\.d\\.ts)"`
  -> 対象ファイルの型エラーなし。

## 2026-06-18 — Phase5: Rust export 動画upload失敗を blocked 扱いにする

### 実施内容
- `SharedRendererExportFrameSourceBlockedReason` に `videoUploadFailed` を追加した。
- Rust/shared renderer export frame sourceでは、`videoUploadResult` / `videoUploadsResult` の失敗をPixi fallback前提で通さず、blocked errorとしてlegacy canvas exportへ退避するようにした。
- 動画upload失敗時はbitmap captureへ進まず、presenter controlをdisposeしてからfallbackするようにした。
- 動画が存在しないだけの `noVideoDecodeRequest` は、shape/image中心のRust exportを妨げないよう非blockingのままにした。
- package version を `0.1.1-Beta-60k` に更新した。

### Red
- `src/utils/sharedRendererExportFrameSource.test.ts` に、Rust video upload失敗時はbitmap captureせず `videoUploadFailed` のblocked errorを返す契約を追加した。
- 同時に、`noVideoDecodeRequest` はbitmap captureを継続する契約を追加した。

### Green
- `src/utils/sharedRendererExportFrameSource.ts` で presenter result を確認し、export中の動画upload失敗だけをblocked errorに変換するようにした。

### 現在の制限
- blocked後は `useProjectExport` の既存挙動に従い、残りframeはlegacy canvas exportへ退避する。Rust-only fail-loud modeは未実装。

### 検証
- `npm test -- src/utils/sharedRendererExportFrameSource.test.ts`
  -> 1 file / 6 tests passed。
- `npm test -- src/utils/sharedRendererSurfaceMount.test.ts src/utils/viewportRustExportFrameSource.test.ts src/utils/sharedRendererExportFrameSource.test.ts src/utils/sharedRendererExportSession.test.ts src/utils/projectExportFrameCanvas.test.ts src/utils/sharedRendererViewportPresenterOrchestration.test.ts src/utils/sharedRendererViewportVideoUpload.test.ts src/utils/sharedRendererWebGpuPresenter.test.ts src/utils/rustBackendVideoDecodeControl.test.ts src/utils/sharedRendererRustVideoUploadPipeline.test.ts src/utils/sharedRendererPresenterDiagnostics.test.ts`
  -> 11 files / 61 tests passed。
- `npx tsc --noEmit 2>&1 | rg "src/(utils/sharedRendererExportFrameSource\\.ts|hooks/useProjectExport\\.ts|utils/projectExportFrameCanvas\\.ts|utils/viewportRustExportFrameSource\\.ts)"`
  -> 対象ファイルの型エラーなし。

## 2026-06-18 — Phase5: Rust export preflight を時刻スキャンへ拡張

### 実施内容
- Rust export source selection のpreflightを、代表時刻 `0` だけでなく可視オブジェクトの開始時刻にも広げた。
- 開始時刻は重複排除して昇順に確認し、最初にblockedした時点で `exportSessionBlocked` として legacy canvas export へ戻すようにした。
- 後半で初めて出てくるunsupported sceneを、frame render中ではなくexport開始前に検出しやすくした。
- package version を `0.1.1-Beta-60j` に更新した。

### Red
- `src/utils/viewportRustExportFrameSource.test.ts` に、未来のオブジェクト開始時刻でblockedになる場合はsourceを作らずfallbackする契約を追加した。

### Green
- `src/utils/viewportRustExportFrameSource.ts` にpreflight時刻リスト生成を追加し、`buildSharedRendererExportSession` を各候補時刻で実行するようにした。

### 現在の制限
- キーフレーム時刻やエフェクト切替時刻まではまだスキャンしていない。現時点ではオブジェクト開始時刻を主要なscene変化点として扱う。

### 検証
- `npm test -- src/utils/viewportRustExportFrameSource.test.ts`
  -> 1 file / 9 tests passed。
- `npm test -- src/utils/sharedRendererSurfaceMount.test.ts src/utils/viewportRustExportFrameSource.test.ts src/utils/sharedRendererExportFrameSource.test.ts src/utils/sharedRendererExportSession.test.ts src/utils/projectExportFrameCanvas.test.ts src/utils/sharedRendererViewportPresenterOrchestration.test.ts src/utils/sharedRendererViewportVideoUpload.test.ts src/utils/sharedRendererWebGpuPresenter.test.ts src/utils/rustBackendVideoDecodeControl.test.ts src/utils/sharedRendererRustVideoUploadPipeline.test.ts src/utils/sharedRendererPresenterDiagnostics.test.ts`
  -> 11 files / 59 tests passed。
- `npx tsc --noEmit 2>&1 | rg "src/(components/Viewport\\.tsx|hooks/useProjectExport\\.ts|utils/(viewportRustExportFrameSource|projectExportFrameCanvas|sharedRendererExportSession)\\.ts)"`
  -> 対象ファイルの型エラーなし。

## 2026-06-18 — Phase5: Rust export source selection に preflight を追加

### 実施内容
- `ProjectExportRustFrameSourceContext` を追加し、export開始時に実際の可視オブジェクト集合と代表時刻を Rust frame source 選択へ渡すようにした。
- `resolveViewportRustExportFrameSource` が `buildSharedRendererExportSession` で代表時刻 `0` の surface gate を先に確認するようにした。
- preflightでshared renderer export sessionがblockedの場合は `exportSessionBlocked` として legacy canvas export へ戻し、frame source自体は生成しないようにした。
- root dataset診断にも `uxfdRustExportFrameSourceReason=exportSessionBlocked` を残すようにした。
- package version を `0.1.1-Beta-60i` に更新した。

### Red
- `src/utils/viewportRustExportFrameSource.test.ts` に、preflight blocked時はsourceを作らずlegacyへ戻る契約、preflight成功時のみsourceを作る契約、diagnostics reason契約を追加した。

### Green
- `src/utils/viewportRustExportFrameSource.ts` に optional preflightを実装した。
- `src/hooks/useProjectExport.ts` は Rust source選択前に `exportObjects` を確定し、`getRustExportFrameSource({ objects, time: 0 })` を呼ぶようにした。
- `src/components/Viewport.tsx` は受け取ったexport contextを `buildViewportRustExportFrameSource` へ渡すようにした。

### 現在の制限
- preflightは代表時刻 `0` のみを見る。後続時刻で初めて現れるunsupported objectは、現状どおりframe render時のblocked fallbackで検出する。

### 検証
- `npm test -- src/utils/viewportRustExportFrameSource.test.ts`
  -> 1 file / 8 tests passed。
- `npm test -- src/utils/sharedRendererSurfaceMount.test.ts src/utils/viewportRustExportFrameSource.test.ts src/utils/sharedRendererExportFrameSource.test.ts src/utils/sharedRendererExportSession.test.ts src/utils/projectExportFrameCanvas.test.ts src/utils/sharedRendererViewportPresenterOrchestration.test.ts src/utils/sharedRendererViewportVideoUpload.test.ts src/utils/sharedRendererWebGpuPresenter.test.ts src/utils/rustBackendVideoDecodeControl.test.ts src/utils/sharedRendererRustVideoUploadPipeline.test.ts src/utils/sharedRendererPresenterDiagnostics.test.ts`
  -> 11 files / 58 tests passed。
- `npx tsc --noEmit 2>&1 | rg "src/(components/Viewport\\.tsx|hooks/useProjectExport\\.ts|utils/(viewportRustExportFrameSource|projectExportFrameCanvas|sharedRendererExportSession)\\.ts)"`
  -> 対象ファイルの型エラーなし。

## 2026-06-18 — Phase5: Rust export blocked時にsourceを即時close

### 実施内容
- `ProjectExportFrameRuntimePlan` に `shouldCloseRustFrameSource` を追加した。
- Rust/shared renderer frame sourceがblockedになりlegacyへ退避する時点で、Rust frame sourceの `close` を即時呼び出すようにした。
- 退避後の残りframeはlegacy canvas runtimeで処理しつつ、Rust decode jobsをexport終了まで保持し続けないようにした。
- package version を `0.1.1-Beta-60h` に更新した。

### Red
- `src/utils/projectExportFrameCanvas.test.ts` に、Rust source active時はclose不要、blocked後legacy runtimeではclose必要、通常legacy pathではclose不要という契約を追加した。

### Green
- `resolveProjectExportFrameRuntimePlan` が close要否を返す。
- `useProjectExport` は blocked error 捕捉後にruntime planを再解決し、必要なら `frameSource.close()` を呼んでからlegacyへ退避する。

### 現在の制限
- `frameSource.close()` が失敗した場合はexport失敗として扱う。close失敗をwarnだけにするかは実機smoke後に判断する。

### 検証
- `npm test -- src/utils/projectExportFrameCanvas.test.ts src/utils/sharedRendererExportFrameSource.test.ts src/utils/viewportRustExportFrameSource.test.ts`
  -> 3 files / 19 tests passed。
- `npx tsc --noEmit 2>&1 | rg "projectExportFrameCanvas|useProjectExport|sharedRendererExportFrameSource|viewportRustExportFrameSource"`
  -> 対象ファイルの型エラーなし。

## 2026-06-18 — Phase5: Rust export blocked後のlegacy runtimeを復旧

### 実施内容
- `resolveProjectExportFrameRuntimePlan` を追加し、export開始時のsource planとframe実行時のruntime planを分離した。
- Rust/shared renderer frame sourceがactiveな間は browser video provider / HTMLVideoElement seek / canvas capture を使わない。
- Rust frame sourceがblockedになってlegacyへ退避した後は、`renderScene` と `HTMLVideoElement` seek fallback を再度有効にする。
- package version を `0.1.1-Beta-60g` に更新した。

### Red
- `src/utils/projectExportFrameCanvas.test.ts` に、Rust source active時はbrowser副作用を無効にし、blocked後はlegacy canvas + HTMLVideoElement seekを有効化する契約を追加した。

### Green
- `useProjectExport` のframe loopは `resolveProjectExportFrameRuntimePlan` の結果で Rust source / override / seek / renderScene を判断する。
- blocked後のlegacy fallbackでも動画clipの時刻同期が走るようになった。

### 現在の制限
- blocked後はVideoDecoder / PlaybackFrameProviderを後から初期化しないため、legacy fallbackはHTMLVideoElement seek中心の低速経路になる。

### 検証
- `npm test -- src/utils/projectExportFrameCanvas.test.ts src/utils/sharedRendererExportFrameSource.test.ts src/utils/viewportRustExportFrameSource.test.ts`
  -> 3 files / 19 tests passed。
- `npx tsc --noEmit 2>&1 | rg "projectExportFrameCanvas|useProjectExport|sharedRendererExportFrameSource|viewportRustExportFrameSource"`
  -> 対象ファイルの型エラーなし。

## 2026-06-18 — Phase5: Rust export blocked 時は legacy canvas へ退避

### 実施内容
- `SharedRendererExportFrameSourceBlockedError` と `isSharedRendererExportFrameSourceBlockedError` を追加した。
- Rust/shared renderer export frame source が surface gate でblockedになった場合、fallback可能なblocked errorとして投げるようにした。
- `useProjectExport` は blocked error だけを捕捉し、その時点以降は Rust frame source を使わず legacy canvas capture へ退避する。
- 任意の実行時エラーは従来通りthrowし、隠さない。
- package version を `0.1.1-Beta-60f` に更新した。

### Red
- `src/utils/sharedRendererExportFrameSource.test.ts` に、blocked frame error が `reason` / `frameIndex` / `fallbackToLegacyCanvas=true` を持つ契約を追加した。

### Green
- Rust export frame source の surface blocked は typed error に変換した。
- export frame loop は typed blocked error だけをlegacy fallbackへ流し、HTMLVideoElement seek / Pixi renderScene / canvas captureで続行する。

### 現在の制限
- fallback後はそのexport中の残りframeをlegacy canvasで処理する。Rust sourceの再試行は次回exportまで行わない。

### 検証
- `npm test -- src/utils/sharedRendererExportFrameSource.test.ts src/utils/projectExportFrameCanvas.test.ts src/utils/viewportRustExportFrameSource.test.ts`
  -> 3 files / 16 tests passed。
- `npx tsc --noEmit 2>&1 | rg "sharedRendererExportFrameSource|useProjectExport|projectExportFrameCanvas|viewportRustExportFrameSource"`
  -> 対象ファイルの型エラーなし。

## 2026-06-18 — Phase5: Rust export frame source frame診断を追加

### 実施内容
- Rust export frame source の各 `renderFrame` で canvas dataset に frame-level 診断を書くようにした。
- ready時は `uxfdRustExportFrameSourceFrameStatus=ready` と `uxfdRustExportFrameSourceFrameIndex` を更新し、blocked時は `uxfdRustExportFrameSourceFrameStatus=blocked` と `uxfdRustExportFrameSourceFrameReason` を残す。
- unsupported scene / editor mode / WebGPU gate などでframe renderが止まった場合、presenterやbitmap captureへ進む前に理由を確認できる。
- package version を `0.1.1-Beta-60e` に更新した。

### Red
- `src/utils/sharedRendererExportFrameSource.test.ts` に、ready frameとblocked frameのdataset診断契約を追加した。

### Green
- `createSharedRendererExportFrameSource` に `writeFrameDiagnostics` を追加し、surface gate通過前後でframe診断を書き込む。

### 現在の制限
- 診断は shared renderer surface canvas dataset に記録される。root datasetへの転写は未実装。

### 検証
- `npm test -- src/utils/sharedRendererExportFrameSource.test.ts src/utils/viewportRustExportFrameSource.test.ts src/utils/sharedRendererSurfaceMount.test.ts src/utils/projectExportFrameCanvas.test.ts`
  -> 4 files / 18 tests passed。
- `npx tsc --noEmit 2>&1 | rg "sharedRendererExportFrameSource|viewportRustExportFrameSource|Viewport.tsx|projectExportFrameCanvas"`
  -> 新規診断対象の型エラーなし。既存の `ThreeStageViewport.tsx` の `three` 型定義不足は残存。

## 2026-06-18 — Phase5: Rust export source 診断を追加

### 実施内容
- `resolveViewportRustExportFrameSource` を追加し、Rust export source が ready か fallback かを理由付きで返すようにした。
- fallback理由は `exportFlagDisabled` / `surfaceCanvasUnavailable` / `unsupportedEditorMode` / `webGpuUnavailable` / `fallbackAdapter` / `videoCutoverDisabled` に分けた。
- `writeViewportRustExportFrameSourceDiagnostics` を追加し、`document.documentElement.dataset` に `uxfdRustExportFrameSourceStatus` と `uxfdRustExportFrameSourceReason` を公開する。
- `Viewport` は Rust export source解決時にroot datasetへ診断を書き、実験flagで試す時にlegacy fallback理由を確認できるようにした。
- package version を `0.1.1-Beta-60d` に更新した。

### Red
- `src/utils/viewportRustExportFrameSource.test.ts` に、ready decision、fallback reason、dataset diagnostics の契約を追加した。

### Green
- 既存の `buildViewportRustExportFrameSource` は decision を内部で使い、source or null の互換APIを維持した。
- `diagnosticsDataset` が渡された場合だけ dataset 書き込みを行う。

### 現在の制限
- 診断は `getRustExportFrameSource` 実行時、つまりexport開始時に更新される。常時ライブ表示ではない。

### 検証
- `npm test -- src/utils/viewportRustExportFrameSource.test.ts src/utils/sharedRendererSurfaceMount.test.ts src/utils/sharedRendererExportFrameSource.test.ts src/utils/projectExportFrameCanvas.test.ts`
  -> 4 files / 18 tests passed。
- `npx tsc --noEmit 2>&1 | rg "viewportRustExportFrameSource|Viewport.tsx|sharedRendererSurfaceMount|sharedRendererExportFrameSource"`
  -> 新規診断対象の型エラーなし。既存の `ThreeStageViewport.tsx` の `three` 型定義不足は残存。

## 2026-06-18 — Phase5: export flag で shared renderer surface を mount

### 実施内容
- `shouldMountSharedRendererSurfaceCanvas` を追加し、shared renderer surface canvas を preview または export のどちらかが有効なら mount する契約にした。
- `VITE_UXFD_SHARED_RENDERER_EXPORT=1` だけでも export frame source 用 canvas が存在するようにした。
- preview flagが無い場合は canvas を hidden にし、画面表示ではなく export render target として使う。
- package version を `0.1.1-Beta-60c` に更新した。

### Red
- `src/utils/sharedRendererSurfaceMount.test.ts` に、preview/exportのORでsurface canvasをmountする契約を追加した。

### Green
- `src/utils/sharedRendererSurfaceMount.ts` を追加し、`Viewport` のcanvas mount条件を `sharedRendererPreviewEnabled || sharedRendererExportEnabled` にした。

### 現在の制限
- export flag配下の実機smokeは未実施。WebGPU/Electron環境での確認が次段。

### 検証
- `npm test -- src/utils/sharedRendererSurfaceMount.test.ts src/utils/viewportRustExportFrameSource.test.ts src/utils/sharedRendererExportFrameSource.test.ts src/utils/projectExportFrameCanvas.test.ts`
  -> 4 files / 15 tests passed。
- `npx tsc --noEmit 2>&1 | rg "sharedRendererSurfaceMount|Viewport.tsx|viewportRustExportFrameSource|sharedRendererExportFrameSource"`
  -> 新規接続対象の型エラーなし。既存の `ThreeStageViewport.tsx` の `three` 型定義不足は残存。

## 2026-06-18 — Phase5: Rust export frame source close で decode job を停止

### 実施内容
- `ProjectExportRustFrameSource` に任意の `close` を追加した。
- `createSharedRendererExportFrameSource` は保持中の active Rust decode jobs を `close` 時に `decode.stop` で停止する。
- `useProjectExport` の `finally` から Rust frame source の `close` を呼び、export成功・失敗・キャンセルのいずれでもRust decode jobを解放する。
- `close` は二重実行しても同じjobを二度止めない。
- package version を `0.1.1-Beta-60b` に更新した。

### Red
- `src/utils/sharedRendererExportFrameSource.test.ts` に、source close時にactive Rust decode jobを停止し、二重closeでは重複停止しない契約を追加した。

### Green
- `stopVideoDecodeJob` injection pointを追加し、defaultでは `stopRustBackendVideoDecode({ jobId })` を呼ぶ。
- sourceはclose後の `renderFrame` を fail-loud にする。

### 現在の制限
- `decode.stop` 失敗時の詳細集約・UI表示は未整理。現状は `close` のPromise rejectionとしてexport失敗経路に出る。

### 検証
- `npm test -- src/utils/sharedRendererExportFrameSource.test.ts src/utils/projectExportFrameCanvas.test.ts src/utils/viewportRustExportFrameSource.test.ts`
  -> 3 files / 13 tests passed。
- `npx tsc --noEmit 2>&1 | rg "sharedRendererExportFrameSource|projectExportFrameCanvas|useProjectExport|viewportRustExportFrameSource"`
  -> 対象ファイルの型エラーなし。

## 2026-06-18 — Phase5: Viewport から Rust export frame source を接続

### 実施内容
- `buildViewportRustExportFrameSource` を追加し、Viewport が `ProjectExportRustFrameSource` を安全に提供する条件をTDDで固定した。
- `Viewport` は `VITE_UXFD_SHARED_RENDERER_EXPORT=1`、2D editor、WebGPU available、non-fallback adapter、`VITE_UXFD_SHARED_RENDERER_VIDEO_CUTOVER=1`、shared renderer canvasありの時だけ Rust export frame source を `useProjectExport` へ渡す。
- export flag が有効な場合も WebGPU probe を実行するようにし、preview flagなしでも export source の可否を判定できるようにした。
- 条件が一つでも閉じている場合は `null` を返し、従来の Pixi / explicit canvas export path を維持する。
- package version を `0.1.1-Beta-60a` に更新した。

### Red
- `src/utils/viewportRustExportFrameSource.test.ts` を追加し、Rust export gateが完全に開いた時だけsourceを作り、それ以外ではlegacy exportへ戻す契約を追加した。

### Green
- `src/utils/viewportRustExportFrameSource.ts` を実装し、`createSharedRendererExportFrameSource` への薄いgate helperにした。
- `src/components/Viewport.tsx` から `useProjectExport` の `getRustExportFrameSource` 引数へ接続した。
- `src/vite-env.d.ts` に `VITE_UXFD_SHARED_RENDERER_EXPORT` を追加した。

### 現在の制限
- Rust export path は実験flag配下。既定では従来のcanvas export。
- unsupported scene は Rust export source内で fail-loud になるため、実利用時は `VITE_UXFD_SHARED_RENDERER_EXPORT=1` を明示して検証する。
- full `npx tsc --noEmit` は既存の `ThreeStageViewport` / preview plan test / filter test などで失敗する。

### 検証
- `npm test -- src/utils/viewportRustExportFrameSource.test.ts src/utils/sharedRendererExportFrameSource.test.ts src/utils/sharedRendererExportSession.test.ts src/utils/projectExportFrameCanvas.test.ts`
  -> 4 files / 14 tests passed。
- `npx tsc --noEmit 2>&1 | rg "Viewport.tsx|viewportRustExportFrameSource|sharedRendererExportFrameSource|projectExportFrameCanvas|vite-env"`
  -> 新規接続対象の型エラーなし。既存の `ThreeStageViewport.tsx` の `three` 型定義不足は残存。

## 2026-06-18 — Phase5: shared renderer export frame source を追加

### 実施内容
- `createSharedRendererExportFrameSource` を追加し、export frameごとに shared renderer export session を構築して presenter orchestration で描画し、canvasから `ImageBitmap` を返す最小sourceを作った。
- source内部で `activeVideoDecodeJobs` を保持し、Rust backend multi-session decode jobs を次frameへ引き継げるようにした。
- render後は `createImageBitmap(canvas, 0, 0, width, height)` で切り出し、presenter control を必ず dispose する。
- blocked export session では presenter / bitmap capture を開始せず、surface gate の detail で fail-loud にする。
- package version を `0.1.1-Beta-59a` に更新した。

### Red
- `src/utils/sharedRendererExportFrameSource.test.ts` を追加し、shared renderer export session描画、canvas capture、control dispose、decode job引き継ぎ、blocked session fail-loud を契約化した。

### Green
- `src/utils/sharedRendererExportFrameSource.ts` を追加し、`ProjectExportRustFrameSource` を返す factory を実装した。
- `ProjectExportRustFrameRequest.objects` を `TimelineObject[]` 境界に強め、export session builderへそのまま渡せるようにした。

### 現在の制限
- `Viewport` から `useProjectExport` へこの source を渡す接続は次段。
- 現時点では毎frame presenterを開始・破棄するため、性能最適化は未実施。まずRust/shared renderer export pathの正しさを優先する。

### 検証
- `npm test -- src/utils/sharedRendererExportFrameSource.test.ts src/utils/sharedRendererExportSession.test.ts src/utils/projectExportFrameCanvas.test.ts`
  -> 3 files / 12 tests passed。
- `npx tsc --noEmit 2>&1 | rg "sharedRendererExportFrameSource|projectExportFrameCanvas|sharedRendererExportSession|useProjectExport"`
  -> 対象ファイルの型エラーなし。

## 2026-06-18 — Phase5: export frame source 副作用flagsを補強

### 実施内容
- サブエージェントレビューを受け、Rust/shared renderer frame source ready時にskipする副作用を plan flags として明示した。
- `requiresHtmlVideoElementSeekFallback` と `usesExportFrameOverrides` を追加し、browser video provider初期化、HTMLVideoElement seek、export frame override利用を別々に判断できるようにした。
- `useProjectExport` の effect dependency に `getRustExportFrameSource` を追加し、frame source provider差し替え時の stale closure を避けた。
- package version を `0.1.1-Beta-58b` に更新した。

### Red
- `src/utils/projectExportFrameCanvas.test.ts` に Rust frame source pathでは seek fallback / export overrides を使わず、canvas fallback pathでは使う契約を追加した。

### Green
- `buildProjectExportFrameSourcePlan` の success result に副作用flagsを追加した。
- `useProjectExport` は override注入と HTMLVideoElement seek fallback をそれぞれ plan flags でguardする。

### 現在の制限
- Rust frame sourceが「完成済み合成frame」を返す前提でのみ `renderScene` / canvas capture をskipできる。単なるdecode済みvideo frame sourceはこの経路へ渡してはいけない。

### 検証
- `npm test -- src/utils/projectExportFrameCanvas.test.ts src/utils/sharedRendererExportSession.test.ts src/utils/sharedRendererPreviewSession.test.ts src/utils/sharedRendererPreviewSurface.test.ts`
  -> 4 files / 14 tests passed。
- `npx tsc --noEmit 2>&1 | rg "projectExportFrameCanvas|useProjectExport|sharedRendererExportSession|sharedRendererPreviewSession|sharedRendererPreviewSurface"`
  -> 対象ファイルの型エラーなし。

## 2026-06-18 — Phase5: shared renderer export session を追加

### 実施内容
- `buildSharedRendererExportSession` を追加し、preview用 session が `isExporting` でsurface gateを塞ぐ問題を export 経路から分離した。
- export session は既存の `buildSharedRendererPreviewPlan` / Rust boundary validation / WebGPU availability gate を再利用しつつ、export中でも supported 2D scene の surface gate を開ける。
- unsupported scene、3D editor、WebGPU unavailable、fallback adapter、invalid boundary payload は引き続き fail-loud のまま維持した。
- package version を `0.1.1-Beta-58a` に更新した。

### Red
- `src/utils/sharedRendererExportSession.test.ts` を追加し、preview session は export中に `reason: exporting` で塞がる一方、export session は同じsupported 2D sceneを通す契約を追加した。
- unsupported scene は export session でも `planNotComparable` で塞ぐ契約を追加した。

### Green
- `src/utils/sharedRendererExportSession.ts` を追加し、export専用の session builder を用意した。
- surface gate には `isExporting: false` を渡し、preview-onlyの安全停止をexport frame source準備から切り離した。

### 現在の制限
- export sessionはまだ実際のWebGPU export canvas / frame source生成へ接続していない。
- presenterのrender targetから `ImageBitmap` を返す実装は次段。

### 検証
- `npm test -- src/utils/sharedRendererExportSession.test.ts src/utils/sharedRendererPreviewSession.test.ts src/utils/sharedRendererPreviewSurface.test.ts src/utils/projectExportFrameCanvas.test.ts`
  -> 4 files / 14 tests passed。
- `npx tsc --noEmit 2>&1 | rg "sharedRendererExportSession|sharedRendererPreviewSession|sharedRendererPreviewSurface|projectExportFrameCanvas|useProjectExport"`
  -> 対象ファイルの型エラーなし。

## 2026-06-18 — Phase5: Rust export frame source plan を追加

### 実施内容
- `buildProjectExportFrameSourcePlan` を追加し、Rust/shared renderer frame source を canvas capture より優先する契約を固定した。
- Rust frame source ready 時は `captureCanvas=false` / `requiresRenderScene=false` / `requiresLegacyBrowserVideoProviders=false` とし、export hook が `VideoFrameProvider` / `PlaybackFrameProvider` / `HTMLVideoElement` seek fallback を通らない入口を作った。
- `useProjectExport` に任意の `getRustExportFrameSource` を追加し、Rust frame source が返す `ImageBitmap` を直接 `encodeVideoToMp4` へ流せるようにした。
- canvas 経路では従来通り `renderScene` -> `resolveProjectExportFrameCanvas` -> `createImageBitmap` の fallback を維持した。
- package version を `0.1.1-Beta-57a` に更新した。

### Red
- `src/utils/projectExportFrameCanvas.test.ts` に Rust frame source が Pixi canvas capture より優先される契約を追加した。
- Rust frame source 不在時の explicit export canvas fallback、Pixi canvas legacy fallback、frame source 不在時 fail-loud の契約を追加した。

### Green
- `ProjectExportRustFrameSource` / `ProjectExportRustFrameRequest` を定義し、`frameIndex` / `timestampUs` / `time` / output size / export objects を渡せるようにした。
- export frame loop は Rust frame source 経路では `exportFrameOverridesRef` を clear し、DOM video provider / seek / canvas capture を skip して `ImageBitmap` を yield する。

### 現在の制限
- 実際の Rust/shared renderer export frame source の実装と `Viewport` からの接続は未実装。
- Rust frame source が export 開始後に失われた場合の動的fallbackはまだ行わず、export開始時のsource planを固定する。
- full `npx tsc --noEmit` は既存のThree型定義、preview plan test型、filter test型などで失敗する。

### 検証
- `npm test -- src/utils/projectExportFrameCanvas.test.ts src/utils/rustBackendVideoDecodeControl.test.ts src/utils/sharedRendererRustVideoUploadPipeline.test.ts src/utils/sharedRendererViewportVideoUpload.test.ts src/utils/sharedRendererWebGpuPresenter.test.ts src/utils/sharedRendererViewportPresenterOrchestration.test.ts`
  -> 6 files / 36 tests passed。
- `npx tsc --noEmit 2>&1 | rg "projectExportFrameCanvas|useProjectExport|rustBackendVideoDecodeControl|sharedRendererRustVideoUploadPipeline|sharedRendererViewportVideoUpload.ts|sharedRendererWebGpuPresenter.ts"`
  -> 対象ファイルの型エラーなし。

## 2026-06-18 — Phase5: export frame canvas のPixi必須条件を解除

### 実施内容
- export frame capture の canvas 解決を `resolveProjectExportFrameCanvas` に分離し、明示的な shared renderer export canvas がある場合は Pixi canvas なしで export を開始できる契約にした。
- `useProjectExport` の入口と各frame captureで同じ resolver を使い、Pixi app 不在時に無言 return せず fail-loud にした。
- Rust decode bridge の `requestVideoDecodeFrame` 戻り値を `unknown` 境界として扱い、verified decoded frame guard 後だけ shared memory upload pipeline に流す型契約へ揃えた。
- multi-session upload orchestration の `stopFailed` reason と decode job type guard を補強し、WebGPU presenter の buffer / bind group 型を実装に合わせた。
- package version を `0.1.1-Beta-56a` に更新した。

### Red
- `src/utils/projectExportFrameCanvas.test.ts` に、明示 export canvas があれば Pixi canvas を要求しない契約を追加した。
- Pixi canvas fallback と canvas 不在時 fail-loud の契約も同時に固定した。

### Green
- `src/utils/projectExportFrameCanvas.ts` を追加し、`explicitExportCanvas` -> `pixiCanvas` の順で frame canvas を解決する。
- `useProjectExport` は `pixiAppRef.current` そのものではなく resolver の結果を export 続行条件にする。
- Rust decode response は control plane 境界では `unknown` とし、`isRustBackendDecodedVideoFrameAvailable` で検証済みの frame descriptor だけを upload pipeline が受け入れる。

### 現在の制限
- export の frame source はまだ canvas capture であり、`renderScene` / Pixi video branch / `HTMLVideoElement` seek fallback は残る。
- shared renderer / Rust frame source を export hook に渡す計画関数は次段で追加する。
- full `npx tsc --noEmit` は Three 型定義、preview plan test 型、既存 filter test 型などの残存負債で失敗する。

### 検証
- `npm test -- src/utils/rustBackendVideoDecodeControl.test.ts src/utils/sharedRendererRustVideoUploadPipeline.test.ts src/utils/sharedRendererViewportVideoUpload.test.ts src/utils/sharedRendererWebGpuPresenter.test.ts src/utils/sharedRendererViewportPresenterOrchestration.test.ts src/utils/projectExportFrameCanvas.test.ts`
  -> 6 files / 32 tests passed。
- `npx tsc --noEmit 2>&1 | rg "rustBackendVideoDecodeControl|sharedRendererRustVideoUploadPipeline|sharedRendererViewportVideoUpload.ts|sharedRendererWebGpuPresenter.ts|projectExportFrameCanvas|useProjectExport"`
  -> 対象ファイルの型エラーなし。

## 2026-06-18 — Phase5: Rust decode colour metadata gate を追加

### 実施内容
- Rust backend の POSIX shared memory name を jobId全文ではなく CRC32 hash にし、macOS の短い shm name 制限内に収めた。
- `ffprobe` から `color_range` / `color_primaries` / `color_transfer` / `color_space` を読み、Rust decode が扱える bt709 / sRGB transfer / bt709 matrix 以外を fail-loud にした。
- package version を `0.1.1-Beta-55a` に更新した。

### Red
- renderer由来の長い `jobId` でも `decode.start` が短い `memoryId` を返す契約を追加した。
- `color_transfer=bt709` の素材を Rust decode が拒否する契約を追加した。

### Green
- `decode_memory_id` は `jobId` の CRC32 hash を使い、`/uxfd-{pid}-{hash}` 形式にした。
- `probe_video_input_metadata` を追加し、range は `pc` / `tv` のみ、primaries は `bt709` のみ、transfer は `iec61966-2-1` のみ、matrix は `bt709` のみ許可する。

### 現在の制限
- HDR / 10bit / Rec.2020 / PQ / HLG / bt709 transfer の明示変換は未対応。現時点では安全側に拒否する。

### 検証
- `cargo test --manifest-path rust-backend/Cargo.toml --test decode_control_plane`
  -> 11 tests passed。

## 2026-06-18 — Phase5: Rust video multi-session / clip別WebGPU描画を追加

### 実施内容
- Rust backend decode を `jobId` keyed multi-session にし、複数動画sourceを同時に `decode.start` / `decode.requestFrame` / `decode.releaseFrame` できるようにした。
- renderer upload orchestration に `prepareSharedRendererViewportVideoUploads` を追加し、visible video request をすべて Rust decode / shared memory copy / upload object 化するようにした。
- stale active decode job は `decode.stop` で停止し、Viewport は active jobs を配列で保持するようにした。
- controller / ownership / WebGPU presenter を clip id 付き upload に対応させ、Rust upload 済み動画clipだけ shared renderer 所有にして、clip別 texture bind group で描画するようにした。
- package version を `0.1.1-Beta-54a` に更新した。

### Red
- Rust backend が2つの `jobId` を同時に開始し、それぞれ別 shared memory ring へ decode できる契約を追加した。
- 複数visible videoをすべて Rust upload 準備する契約、非表示 stale job を停止する契約を追加した。
- upload済みclipだけ video ownership をsharedへ進める契約、複数textureをclip別bind groupで描画する契約を追加した。
- Viewport presenter orchestration が複数uploadを controller へ渡す契約を追加した。

### Green
- `BackendState.decode_sessions: HashMap<String, DecodeSession>` で `decode.start` / `requestFrame` / `releaseFrame` / `stop` を jobId別に処理する。
- `sharedRendererViewportVideoUpload` は active jobs を配列で扱い、visible jobを再利用しつつstale jobだけ停止する。
- `sharedRendererPreviewPresenterController` は `sharedRendererDecodedVideoFrameUploads` から upload成功clip集合を作り、`texturesByClipId` を WebGPU presenter に渡す。
- `sharedRendererWebGpuPresenter` は複数動画planeを同一vertex buffer上で planeごとに bind group を切り替えて `draw(6, 1, firstVertex)` する。

### 現在の制限
- Electron `contextBridge` 越しの isolate 間コピーは残る。
- transfer / matrix / HDR / 10bit metadata gate は未実装。
- export path はまだ Pixi / HTMLVideoElement 依存が残る。

### 検証
- `npm test -- src/utils/sharedRendererViewportPresenterOrchestration.test.ts src/utils/sharedRendererViewportVideoUpload.test.ts src/utils/sharedRendererPreviewPresenterController.test.ts src/utils/sharedRendererWebGpuPresenter.test.ts src/utils/sharedRendererVideoOwnership.test.ts src/utils/sharedRendererRustVideoUploadPipeline.test.ts src/utils/sharedVideoFrameUploadBridge.test.ts src/utils/rustBackendVideoDecodeControl.test.ts`
  -> 8 files / 50 tests passed。
- `cargo test --manifest-path rust-backend/Cargo.toml --test decode_control_plane`
  -> 9 tests passed。
- `cargo test --manifest-path sidecar-protocol/Cargo.toml --test ring_buffer`
  -> 9 tests passed。
- `npx vite build`
  -> renderer / electron main / electron preload build passed。

## 2026-06-18 — Phase5: Rust video upload cutover のレビュー指摘を修正

### 実施内容
- サブエージェント Parfit のレビュー指摘を受け、uploaded texture を破棄せず
  `presentVideoFrameScene` へ渡して video plane として描画するようにした。
- `CopyOutState::RendererUploadAborted` / `rendererUploadAborted` を追加し、copy失敗・WebGPU upload失敗・stale response時に
  decoded slot を release できるようにした。
- `sharedRendererViewportPresenterOrchestration` は decode job 解決時点で callback を呼び、
  Viewport が presenter 完了前に active job ref を更新できるようにした。
- Rust decode response の `requestId` が現在値と違う場合は copy せず abort release する。
- `contextBridge` 返却 `Uint8Array` は再コピーせず、そのまま `rgbaBytes` として採用する。
- package version を `0.1.1-Beta-53a` に更新した。

### Red
- uploaded Rust video frame が実際に WebGPU draw pass へ進む契約を追加し、旧実装が texture を捨てて Red になることを確認した。
- copy失敗、WebGPU upload失敗、stale response の各ケースで abort release が呼ばれる契約を追加した。
- in-flight decode job を presenter 起動前に記録する契約を追加した。
- contextBridge returned bytes を再コピーせず同一 `Uint8Array` として使う契約を追加した。

### Green
- video ownership が shared に進む場合、`presentVideoFrameScene` を呼んで uploaded texture を描画する。
- `rendererUploadAborted` は ring/backend release で free へ戻せる。
- `releaseAfterUploadAbort` callback を upload object に追加し、controller upload失敗時に呼ぶ。
- stale request id の decoded frame は copyせず release して fallback する。

### 現在の制限
- `contextBridge` の isolate 間コピー自体は残る。完全なzero-copyにはSAB/transferable/別window設計が必要。
- 同時複数動画はまだ Rust backend multi-session 化が必要。

### 検証
- `npm test -- src/utils/sharedRendererPreviewPresenterController.test.ts src/utils/sharedRendererWebGpuPresenter.test.ts src/utils/sharedRendererViewportPresenterOrchestration.test.ts src/utils/sharedRendererViewportVideoUpload.test.ts src/utils/sharedRendererRustVideoUploadPipeline.test.ts src/utils/sharedVideoFrameUploadBridge.test.ts src/utils/rustBackendVideoDecodeControl.test.ts`
  -> 7 files / 40 tests passed。
- `cargo test --manifest-path sidecar-protocol/Cargo.toml --test ring_buffer`
  -> 9 tests passed。
- `cargo test --manifest-path rust-backend/Cargo.toml --test decode_control_plane`
  -> 8 tests passed。
- `npx vite build`
  -> renderer / electron main / electron preload build passed。

## 2026-06-18 — Phase5: Rust decode session stop / source 切替を追加

### 実施内容
- Rust backend に `decode.stop(jobId)` を追加し、active decode session を破棄してから別 source/layout の
  `decode.start` を受けられるようにした。
- Electron main / preload / renderer utility に `stopVideoDecode` / `stopRustBackendVideoDecode` を追加した。
- `sharedRendererViewportVideoUpload` は active job が次の request と一致しない場合、古い job を stop してから
  新しい job を start する。
- package version を `0.1.1-Beta-52a` に更新した。

### Red
- `rust-backend/tests/decode_control_plane.rs` に、`decode.stop` 後に別 source を start できる契約を追加して Red を確認した。
- `src/utils/rustBackendVideoDecodeControl.test.ts` に stop bridge 契約を追加して Red を確認した。
- `src/utils/sharedRendererViewportVideoUpload.test.ts` に stale active job stop 契約を追加して Red を確認した。

### Green
- `decode.stop` は jobId が active session と一致する場合だけ `{ stopped:true, jobId }` を返す。
- renderer orchestration は stale job stop が成功した場合だけ次の `decode.start` に進む。

### 現在の制限
- Rust backend はまだ同時に1 decode sessionのみ。複数動画を同一frameでRust decodeするには multi-session 化が必要。
- stop 時に未release slotがあっても session drop で破棄するため、GPU upload中の切替順序は今後さらに明示化する必要がある。

### 検証
- `cargo test --manifest-path rust-backend/Cargo.toml --test decode_control_plane`
  -> 8 tests passed。
- `npm test -- src/utils/sharedRendererViewportVideoUpload.test.ts src/utils/rustBackendVideoDecodeControl.test.ts src/utils/sharedRendererViewportPresenterOrchestration.test.ts`
  -> 3 files / 9 tests passed。

## 2026-06-18 — Phase5: shared video frame native addon の自動解決を追加

### 実施内容
- `electron/sharedVideoFrameNativeBridgePath.ts` を追加し、native addon path を
  env override -> dev build output -> packaged resources の順に解決するようにした。
- `electron/preload.ts` は resolver を使い、`UXFD_SHARED_VIDEO_FRAME_BRIDGE_MODULE` 未指定でも
  `shared-video-frame-bridge-node/shared-video-frame-bridge.node` があれば読み込む。
- `electron-builder` の `extraResources` に `shared-video-frame-bridge.node` の packaged 配置先を追加した。
- package version を `0.1.1-Beta-51a` に更新した。

### Red
- `src/utils/sharedVideoFrameNativeBridgePath.test.ts` を追加し、resolver module 未作成で Red になった。

### Green
- env override を最優先し、dev output と packaged resources は `existsSync` で存在確認してから返す。
- preload bundle は resolver import を含めた状態で Vite build できることを確認した。

### 現在の制限
- dev 起動前に `npm run bridge:node:build` で `.node` を生成する必要がある。
- packaged build では `.node` を release build へ切り替える build pipeline がまだ未整理。

### 検証
- `npm test -- src/utils/sharedVideoFrameNativeBridgePath.test.ts`
  -> 1 file / 4 tests passed。
- `npm run test:bridge-node`
  -> shared video frame native addon contract passed。
- `npx vite build`
  -> renderer / electron main / electron preload build passed。

## 2026-06-18 — Phase5: Viewport orchestration から Rust video upload を起動

### 実施内容
- `sharedRendererViewportVideoUpload` を追加し、shared renderer session から最初の visible video decode request を取り出して
  Rust backend `decode.start` / `decode.requestFrame` / shared memory copy / release callback 付き upload object まで準備する
  orchestration をTDDで固定した。
- `sharedRendererViewportPresenterOrchestration` を追加し、Rust video upload 準備に成功した場合だけ
  `sharedRendererDecodedVideoFrameUpload` を presenter へ渡し、失敗時は Pixi owner を維持できるようにした。
- `Viewport.tsx` は `VITE_UXFD_SHARED_RENDERER_VIDEO_CUTOVER=1` のとき presenter 起動前に Rust video upload を準備する。
- 同じ source/layout の active decode job は再利用し、不要な `decode.start` を避ける。
- package version を `0.1.1-Beta-50a` に更新した。

### Red
- `src/utils/sharedRendererViewportVideoUpload.test.ts` を追加し、orchestrator module 未作成で Red になった。
- `src/utils/sharedRendererViewportPresenterOrchestration.test.ts` を追加し、presenter start wrapper 未作成で Red になった。

### Green
- Rust backend start/request payload、shared memory copy payload、GPU fence 後 release payload を一続きの契約として固定した。
- presenter 起動 wrapper は upload 失敗時にも presenter を起動し、video ownership 判定で Pixi fallback できるようにした。
- Viewport は active decode job ref と request id ref を持ち、video cutover flag 有効時だけ Rust video upload を試行する。

### 現在の制限
- Rust backend decode はまだ単一 session 前提。複数動画、source 切替、decode session の明示 stop / replace は未実装。
- `contextBridge` の isolate 間 copy は残るため、完全な zero-copy renderer upload ではない。
- transfer / matrix / HDR / 10bit metadata gate はまだ次段。

### 検証
- `npm test -- src/utils/sharedRendererViewportPresenterOrchestration.test.ts src/utils/sharedRendererViewportVideoUpload.test.ts src/utils/sharedVideoFrameUploadBridge.test.ts src/utils/sharedRendererPreviewPresenterController.test.ts`
  -> 4 files / 18 tests passed。
- `npx vite build`
  -> renderer / electron main / electron preload build passed。

## 2026-06-18 — Phase5: Electron contextBridge 返却bytes契約へ切り替え

### 実施内容
- 一時Electronプローブで、`contextBridge` 越しでは renderer 側 `Uint8Array` target が
  preload/native側の mutation を反映しないことを確認した。
- `electron/preload.ts` は native addon に clone 済み target へ copy させた後、その `Uint8Array` を
  `result.rgbaBytes` として返すようにした。
- `sharedVideoFrameUploadBridge` は `result.rgbaBytes` がある場合、それを renderer upload buffer に採用する。
- package version を `0.1.1-Beta-49a` に更新した。

### Red
- `src/utils/sharedVideoFrameUploadBridge.test.ts` に、bridge が target を直接 mutate できず
  `result.rgbaBytes` を返すケースを追加し、旧実装が bytes を無視して Red になることを確認した。

### Green
- returned bytes を `Uint8Array` / `ArrayBuffer` / number array から正規化して採用する処理を追加した。
- preload は successful copy response に `rgbaBytes: target` を同梱する。

### 現在の制限
- `contextBridge` のため preload -> renderer の isolate 間コピーは残る。
- Viewport はまだ decode response -> native bridge copy -> WebGPU presenter upload を呼んでいない。

### 検証
- `npm test -- src/utils/sharedVideoFrameUploadBridge.test.ts src/utils/sharedRendererRustVideoUploadPipeline.test.ts src/utils/sharedRendererPreviewPresenterController.test.ts`
  -> 3 files / 16 tests passed。
- `npm run test:bridge-node`
  -> shared video frame native addon contract passed。
- 一時Electronプローブで、元targetは未更新だが `result.rgbaBytes` は renderer 側で `Uint8Array` として読めることを確認した。

## 2026-06-18 — Phase5: shared video frame N-API addon を追加

### 実施内容
- `shared-video-frame-bridge-node` crate を追加し、既存の `shared-video-frame-bridge` Rust core を
  N-API addon として wrap した。
- `copyIntoUploadBuffer(payload, target)` は POSIX shm copy core を呼び、通常の shm / length error は例外ではなく
  `{ success:false, error }` として返す。
- `debugFillForTest(target, value)` を追加し、Node 直 require で `Uint8Array` の in-place mutation を確認できるようにした。
- `scripts/build-shared-video-frame-node-addon.mjs` と `npm run test:bridge-node` を追加し、
  `cargo build` 済み dylib を `shared-video-frame-bridge.node` へ copy して contract test を走らせる。
- package version を `0.1.1-Beta-48a` に更新した。

### Red
- `scripts/test-shared-video-frame-node-addon.mjs` を追加し、native addon 未作成のため
  `shared-video-frame-bridge.node` が存在しない Red を確認した。

### Green
- `napi` / `napi-derive` / `napi-build` を使い、Rust core を呼ぶ薄い addon crate を追加した。
- Node 直 require では `Uint8Array` target を native 側で更新でき、copy error mapping も fail-loud に返ることを確認した。

### 現在の制限
- Electron `contextBridge` 越しに renderer 側 `Uint8Array` が in-place 更新されるかは未検証。
- Viewport はまだ decode response -> native bridge copy -> WebGPU presenter upload を呼んでいない。

### 検証
- `npm run test:bridge-node`
  -> shared video frame native addon contract passed。
- `cargo test --manifest-path shared-video-frame-bridge-node/Cargo.toml`
  -> 0 tests / compile passed。
- `npm test -- src/utils/sharedVideoFrameUploadBridge.test.ts src/utils/sharedRendererRustVideoUploadPipeline.test.ts`
  -> 2 files / 4 tests passed。

## 2026-06-18 — Phase5: Rust decoded video upload pipeline helper を追加

### 実施内容
- `sharedRendererRustVideoUploadPipeline` を追加し、Rust backend の verified decoded frame response から
  shared renderer に渡す upload object を作る経路をTDDで固定した。
- pipeline は `isRustBackendDecodedVideoFrameAvailable` で検証済みの response だけを受け入れ、
  `sharedVideoFrameUploadBridge` で POSIX shm -> renderer upload buffer copy を行う。
- `releaseAfterGpuUpload` callback は `releaseRustBackendVideoDecodeFrame(copyOutState=gpuUploadFenceSignalled)` を呼び、
  controller 側の `queue.onSubmittedWorkDone()` 後 release 契約に接続できる。
- package version を `0.1.1-Beta-47a` に更新した。

### Red
- `src/utils/sharedRendererRustVideoUploadPipeline.test.ts` を追加し、helper module 未作成で Red になった。

### Green
- verified decoded frame 以外は `decodedFrameUnavailable` で fail-loud にし、copy bridge を呼ばない。
- copy payload と release payload の両方が descriptor / job id / slot lease token から作られることをテストで固定した。

### 現在の制限
- Viewport はまだこの pipeline を呼んでいない。
- native module 実体もまだ未接続のため、実アプリでの video cutover は引き続き Pixi fallback 側に留まる。

### 検証
- `npm test -- src/utils/sharedRendererRustVideoUploadPipeline.test.ts src/utils/sharedVideoFrameUploadBridge.test.ts src/utils/rustBackendVideoDecodeControl.test.ts`
  -> 3 files / 7 tests passed。

## 2026-06-18 — Phase5: shared video frame preload bridge API を追加

### 実施内容
- `sharedVideoFrameUploadBridge` を追加し、Rust backend の `SharedFrame` descriptor から renderer-owned `Uint8Array`
  upload buffer を確保して、preload/native bridge の `copyIntoUploadBuffer` へ渡す契約を固定した。
- bridge の control payload は `memoryId` / `slotCount` / `slotByteLen` / `ptsFrame` のみを持ち、
  `rgbaBytes` / `pixels` / `frameBase64` を JSON 側へ混ぜない。
- `electron/preload.ts` は `window.sharedVideoFrame.copyIntoUploadBuffer` を公開した。
  現時点では `UXFD_SHARED_VIDEO_FRAME_BRIDGE_MODULE` で指定された native module を読み、未指定なら fail-loud で返す。
- `src/vite-env.d.ts` に `window.sharedVideoFrame` 型を追加した。
- package version を `0.1.1-Beta-46a` に更新した。

### Red
- `src/utils/sharedVideoFrameUploadBridge.test.ts` を追加し、helper module 未作成で Red になった。

### Green
- `prepareSharedRendererDecodedVideoFrameUpload` を追加し、copy report の byte length が descriptor と一致した場合だけ
  controller へ渡せる upload object を返すようにした。
- preload は native bridge 未接続時に成功扱いせず、`success:false` を返す。

### 現在の制限
- native module そのものはまだ build / package していないため、実アプリで shm copy を成功させるには
  `shared-video-frame-bridge` core を N-API module として接続する必要がある。
- Viewport はまだ decode result -> bridge copy -> presenter upload の orchestration を呼んでいない。

### 検証
- `npm test -- src/utils/sharedVideoFrameUploadBridge.test.ts src/utils/sharedRendererPreviewPresenterController.test.ts src/utils/sharedRendererWebGpuPresenter.test.ts`
  -> 3 files / 25 tests passed。

## 2026-06-18 — Phase5: shared video frame bridge core をRustで追加

### 実施内容
- `shared-video-frame-bridge` crate を追加し、POSIX shared memory ring から renderer upload buffer 相当の
  `&mut [u8]` へ decoded frame bytes を copy する core を実装した。
- `copy_shared_frame_into_upload_buffer` は `memoryId` / `slotCount` / `slotByteLen` / `sequence` を受け取り、
  `PosixSharedRing::attach_with_retry_for_layout` で attach して対象 frame を読む。
- copy 後も slot は `READING` のままにし、GPU upload fence 後の `decode.releaseFrame` が ownership を戻す。
- package version を `0.1.1-Beta-45a` に更新した。

### Red
- `shared-video-frame-bridge/tests/copy_into_upload_buffer.rs` に、shared memory から upload buffer へ copy し、
  copy 済み frame を release するまで別 slot が利用可能である契約を追加した。
- 旧状態では `copy_shared_frame_into_upload_buffer` が未実装で Red になった。

### Green
- `SharedVideoFrameCopyReport` と `SharedVideoFrameBridgeError` を追加した。
- upload buffer 長が `slotByteLen` と一致しない場合は shared memory を読まずに fail-loud する。
- target build output を誤って追跡したため、直後の commit で `shared-video-frame-bridge/.gitignore` を追加し、
  `target/` を追跡対象外に戻した。

### 現在の制限
- Rust core はできたが、N-API / Electron preload へはまだ接続していない。
- renderer から直接使うには、次段でこの core を native addon として build し、`copyIntoUploadBuffer` API を露出する必要がある。

### 検証
- `cargo test --manifest-path shared-video-frame-bridge/Cargo.toml` -> 1 test passed。

## 2026-06-18 — Phase5: Rust decoded video frame の WebGPU upload / draw gate

### 実施内容
- `sharedRendererWebGpuPresenter` に `uploadVideoFrameTexture` を追加し、
  Rust backend の `rgba8Srgb` descriptor + `Uint8Array` を WebGPU `rgba8unorm-srgb` texture へ upload できるようにした。
- upload は `descriptor.strideBytes` を `bytesPerRow`、`descriptor.height` を `rowsPerImage` として使い、
  `descriptor.byteLen` と実 bytes 長が一致しない場合は upload しない。
- `startSharedRendererPreviewPresenter` は decoded frame upload が成功した時だけ `videoFrameUploadReady=true` とし、
  release callback がある場合は `queue.onSubmittedWorkDone()` 後に呼ぶようにした。
- `sharedRendererWebGpuPresenter` に `presentVideoFrameScene` を追加し、既存の video plane vertices を
  uploaded texture + sampler で描画する WebGPU pass を追加した。
- package version を `0.1.1-Beta-44a` に更新した。

### Red
- `sharedRendererWebGpuPresenter.test.ts` に texture upload 契約を追加し、
  旧実装では `uploadVideoFrameTexture is not a function` で Red になった。
- `sharedRendererPreviewPresenterController.test.ts` に upload 成功後の ownership / diagnostics / release timing 契約を追加し、
  旧実装では `videoFrameUploadUnavailable` のまま Red になった。
- `sharedRendererWebGpuPresenter.test.ts` に uploaded video texture 描画契約を追加し、
  旧実装では `presentVideoFrameScene is not a function` で Red になった。

### Green
- WebGPU upload は control plane JSON ではなく、bridge から渡される `Uint8Array` を入力にする形にした。
- WebGPU texture format は protocol の `rgba8Srgb` を `rgba8unorm-srgb` へ変換する。
- video draw pass は transparent clear の上に video plane vertex buffer を描き、sampler + texture view を bind する。
- controller は upload 結果を ownership gate と diagnostics へ反映する。

### 現在の制限
- POSIX shm から renderer upload buffer へ bytes を移す preload/native bridge はまだ未実装。
- `presentVideoFrameScene` は単一 uploaded texture を video plane scene に描く最小実装で、複数 video / texture cache / long-lived presenter 更新は未実装。
- transfer / matrix metadata gate はまだ `bt709` 前提で、次以降に `ffprobe` 照合と fail-loud 化を進める。

### 検証
- `npm test -- src/utils/sharedRendererWebGpuPresenter.test.ts src/utils/sharedRendererPreviewPresenterController.test.ts src/utils/sharedRendererVideoOwnership.test.ts src/utils/sharedRendererPresenterDiagnostics.test.ts`
  -> 4 files / 30 tests passed。
- `cargo test --manifest-path shared-memory-spike/Cargo.toml --test posix_shm_two_process` -> 3 tests passed。
- `cargo test --manifest-path rust-backend/Cargo.toml --test decode_control_plane` -> 7 tests passed。

## 2026-06-18 — Phase5: Rust backend decode data-plane を multi-slot shared memory 化

### 実施内容
- `uxfd-shared-memory-spike::PosixSharedRing` に `create_with_slot_count` と
  `attach_with_retry_for_layout` を追加し、POSIX shared memory ring を single-slot smoke から
  multi-slot data-plane へ拡張した。
- producer が1枚目の frame を consumer の `READING` 状態に保持したまま、2枚目を別 slot へ書ける契約を追加した。
- `rust-backend` の `decode.start(slotCount)` は control-plane descriptor だけでなく、実体の POSIX shared memory も
  同じ slot count で作成するようにした。
- `decode.requestFrame` は1枚目の decoded RGBA が読み取り中でも、2枚目を Rust backend で decode して
  shared memory の別 slot へ書ける。
- Meitner の軽量レビューにより、次の bridge は renderer に shm attach させるのではなく、
  preload/native 側で shm から upload 用 buffer へ copy し、renderer で WebGPU `queue.writeTexture` する方針を確認した。
- package version を `0.1.1-Beta-43a` に更新した。

### Red
- `shared-memory-spike/tests/posix_shm_two_process.rs` に
  `posix_shm_multi_slot_allows_next_frame_while_previous_frame_is_reading` を追加した。
- `rust-backend/tests/decode_control_plane.rs` に
  `decode_request_frame_uses_second_shared_memory_slot_while_first_slot_is_reading` を追加した。
- 旧実装では backend が `slotCount=2` を返しても POSIX shm header は `actual: 1` で、attach layout 検証が Red になった。

### Green
- POSIX shm layout を `header + slot headers[] + frame bytes[]` に変更し、既存の single-slot API は
  `slot_count=1` wrapper として維持した。
- `write_frame` / `read_frame` / `release_frame` / `wait_until_free` は全 slot を走査するようにした。
- backend の `create_decode_data_plane` は `layout.slot_count()` を `PosixSharedRing::create_with_slot_count` へ渡す。
- 既存 fixture の `DecodeFrameRequest` は `requestId` / `mode=latestWins` を持つ現行 protocol に追従した。

### 現在の制限
- renderer / Electron から WebGPU texture upload する経路はまだ未接続で、`videoFrameUploadReady=false` のまま Pixi preview を維持する。
- transfer / matrix metadata gate はまだ `bt709` 前提で、次以降に `ffprobe` 照合と fail-loud 化を進める。
- release は POSIX shm ring 側では `READING` slot を順に解放する単純実装で、descriptor slot index と厳密照合する段階にはまだ進めていない。

### 検証
- `cargo test --manifest-path shared-memory-spike/Cargo.toml` -> 17 tests passed。
- `cargo test --manifest-path rust-backend/Cargo.toml` -> 7 tests passed。

## 2026-06-18 — Phase5: Rust backend decoded RGBA を POSIX shared memory へ書き込む

### 実施内容
- `rust-backend/tests/decode_control_plane.rs` に、`decode.requestFrame` 後に別 consumer が `memoryId` へ attach し、
  decoded RGBA bytes を POSIX shared memory から読める契約を追加した。
- `decode.start` の `memoryId` を attach 可能な POSIX shared memory name (`/uxfd-...`) に変更した。
- `rust-backend` は unix 環境で `uxfd-shared-memory-spike` の `PosixSharedRing` を保持し、
  `decode.requestFrame` で padded RGBA を ring に write、`decode.releaseFrame` で shared memory slot を free に戻すようにした。
- control plane は引き続き descriptor / CRC32 verification のみを返し、frame bytes / pixel array / base64 は載せない。
- package version を `0.1.1-Beta-42a` に更新した。

### Red
- `decode_request_frame_writes_decoded_rgba_to_posix_shared_memory` を追加した。
- 旧実装では `memoryId` が `decode-shm-ring` 形式で、POSIX shm consumer が attach できず Red になった。

### Green
- `decode_memory_id` で job id から `/uxfd-{pid}-{jobId}-ring` を生成するようにした。
- `create_decode_data_plane` / `write_decode_data_plane` / `release_decode_data_plane` を追加し、unix では POSIX shm、
  non-unix では no-op fallback とした。
- release test は consumer が shared memory から frame を読んだ後に `decode.releaseFrame(copyOutState=gpuUploadFenceSignalled)` を呼ぶ実運用に合わせた。

### 現在の制限
- `uxfd-shared-memory-spike::PosixSharedRing` は現時点で single-slot smoke 実装のため、production ring の multi-slot 化が次の課題。
- renderer / Electron から WebGPU texture upload する経路はまだ未接続で、`videoFrameUploadReady=false` のまま Pixi preview を維持する。

### 検証
- `cargo test --manifest-path rust-backend/Cargo.toml` -> 6 tests passed。

## 2026-06-17 — Phase5: Rust backend 動画decodeの limited range gate

### 実施内容
- サブエージェントレビューで指摘された `color_range=pc` 固定の危険をTDDで修正した。
- `rust-backend/tests/decode_control_plane.rs` に limited range H.264 fixture を追加し、`frameIndex=1` の decode が
  `tv -> pc` 明示変換のCRCと一致することを固定した。
- `rust-backend/src/main.rs` は `decode.requestFrame` ごとに `ffprobe` で `color_range` を読み、
  `pc` / `tv` のみを `scale=in_range=...:out_range=pc` へ渡すようにした。
- unknown / missing / unsupported range は無音で full range 扱いせず、Rust decode error として fail-loud にする。
- package version を `0.1.1-Beta-41b` に更新した。

### 現在の制限
- transfer / matrix の strict gate はまだ `bt709` 前提で、次の colour metadata gate で `ffprobe` 照合対象にする。
- POSIX shm / WebGPU upload は引き続き未実装で、Pixi video preview は維持する。

### 検証
- `cargo test --manifest-path rust-backend/Cargo.toml` -> 5 tests passed。

## 2026-06-17 — Phase5: Rust backend 実動画フレーム decode gate

### 実施内容
- `rust-backend` の `decode.requestFrame` を ack-only から、実ファイルの指定 `frameIndex` を `ffmpeg` で RGBA decode する経路へ進めた。
- decode 結果は GPU row pitch に合わせて `strideBytes` padding し、`SharedFrame` descriptor と `FrameVerificationReport` の CRC32 だけを JSON-RPC で返すようにした。
- `SharedFrameRing` を backend session 内で保持し、`mark_slot_ready -> acquire_ready_slot -> decode.releaseFrame` の所有権遷移を通すようにした。
- `rustBackendVideoDecodeControl` に decoded frame descriptor / verification の型と `isRustBackendDecodedVideoFrameAvailable` を追加した。
- presenter diagnostics に `uxfdSharedRendererPresenterVideoFrameUploadReady` を追加し、Rust backend が verified frame を返せても WebGPU upload 未完了なら video cutover しない状態を可視化した。
- サブエージェントの軽量レビューで、次に `ffprobe` metadata gate と POSIX shm 書き込みが必要であることを確認した。
- package version を `0.1.1-Beta-41a` に更新した。

### Red
- `rust-backend/tests/decode_control_plane.rs` に、2 frame H.264 fixture の `frameIndex=1` を Rust backend が実 decode し、
  descriptor / verification checksum を返す契約を追加した。
- `frameBase64` / `bytes` / `pixels` が control-plane JSON に混入しないことを再帰的に固定した。
- `src/utils/rustBackendVideoDecodeControl.test.ts` に decoded frame availability 型ガードの契約を追加した。
- `src/utils/sharedRendererPresenterDiagnostics.test.ts` に `videoFrameUploadReady=false` の診断出力を追加した。

### Green
- `rust-backend/src/main.rs` に `decode_tight_rgba_frame` / `pad_rgba_rows` / CRC32 verification を実装した。
- `decode.start` は source path、ffmpeg path、`SharedFrameRing` を session に保持するようにした。
- `decode.releaseFrame` は GPU upload fence signalled の release だけを受け付け、ring slot を `free` に戻すようにした。
- TypeScript 側は verified decoded frame を認識できるが、actual pixel bytes はまだ IPC に載せない。

### 現在の制限
- actual pixel bytes はまだ POSIX shm / mmap へ書いていない。現時点では heap 上で padding と checksum を作り、control-plane に descriptor / checksum だけを返す。
- WebGPU texture upload は未実装のため、`videoFrameUploadReady=false` を維持し、Pixi video preview はまだ残す。
- `ffmpeg` decode filter は現時点で `in_range=pc` 固定。limited range / transfer / matrix は次 gate で `ffprobe` を使って fail-loud または明示変換にする。
- `latestWins` scheduler / request cancellation は未実装で、scrub 時の古い request coalesce は次以降の課題。

### 検証
- `cargo test --manifest-path rust-backend/Cargo.toml` -> 4 tests passed。
- `npm test -- src/utils/rustBackendVideoDecodeControl.test.ts src/utils/sharedRendererPresenterDiagnostics.test.ts src/utils/sharedRendererPreviewPresenterController.test.ts`
  - 3 files / 16 tests passed。

## 2026-06-17 — Phase5: SolidColour rectangle を Pixi から shared renderer ownership へ移管

### 実施内容
- `sharedRendererSolidColourOwnership` を追加し、SolidColour rectangle の cutover 条件を TDD で固定した。
  - shared renderer preview が ready。
  - geometry source が `rust-wasm`。
  - cutover 対象より前面に Pixi-only object がない。
  - export 中ではない。
- `sharedRendererSolidColourStackSafety` を追加し、SolidColour より前面に `Image` など Pixi-only plane がある場合は cutover しないようにした。
- `sharedRendererSolidColourScene` / `sharedRendererWebGpuPresenter` は owned SolidColour object id だけを draw list に残すようにした。
  - Pixi 側で unsafe shape を残しても shared renderer が上から描いてしまう z-order 破壊を防ぐ。
- `Viewport` は presenter の `solidColourOwnership.solidColourObjectIds` を `updatePixiContent` へ渡すようにした。
- `pixiRenderHelper` は owned SolidColour shape について Pixi children を cleanup し、`hitArea` だけ残して shape branch を抜けるようにした。
- DOM diagnostics に SolidColour ownership / reason / shared object count を追加した。
- package version を `0.1.1-Beta-40a` に更新した。

### 選定理由・判断の根拠
- 動画は actual pixel decode / shared memory / WebGPU upload が未実装のため、まだ Pixi から外すと表示を壊す。
- SolidColour rectangle は Rust/WASM で vertex 生成済み、WebGPU presenter で描画済みなので、PixiJS を剥がす最初の対象として最も安全。
- shared renderer canvas は Pixi 全体の上に重なるため、draw list 自体を safe id に絞らないと Pixi-only 前面 object を覆ってしまう。
- export は現行 Pixi canvas を読むため、Pixi shape skip は preview のみとした。

### 検証
- `npm test -- src/utils/sharedRendererSolidColourOwnership.test.ts src/utils/pixiSolidColourCutover.test.ts src/utils/sharedRendererSolidColourScene.test.ts src/utils/sharedRendererPreviewPresenterController.test.ts src/utils/sharedRendererPresenterDiagnostics.test.ts src/utils/pixiVideoCutover.test.ts`
  - 6 files / 26 tests passed。
- `npx tsc --noEmit --pretty false`
  - 既存残件として `ThreeStageViewport.tsx` の `three` 型定義不足、`heavyEffectsStress.test.ts` の `PositionKeyframe`、`filterStack.test.ts` の fixture 型不整合で失敗。
  - 今回の SolidColour ownership / Pixi cutover 由来の新規エラーはなし。

## 2026-06-16 — Pixi video texture cleanup のリーク対策

### 実施内容
- サブエージェントの軽量レビューで指摘された video texture / export overlay の破棄漏れを修正した。
- `videoElementForPixi` に cleanup helper を追加し、canvas upload texture は source ごと `destroy(true)`、`VideoSource` 経路は `VideoSource.destroy()` と `texture.destroy(false)` に分けるようにした。
- export overlay cache は export 終了、clip 非表示化、Viewport unmount 時に texture source ごと破棄するようにした。
- video object の `src` / `proxyFilePath` が差し替わった時、既存 `HTMLVideoElement` と frame texture を使い続けないようにした。
- package version を `0.1.1-Beta-39b` に更新した。

### 検証
- `npm test -- src/utils/videoElementForPixi.test.ts src/utils/pixiVideoCutover.test.ts src/utils/sharedRendererVideoCutoverStack.test.ts src/utils/sharedRendererVideoOwnership.test.ts src/utils/sharedRendererPreviewPresenterController.test.ts`
  - 5 files / 31 tests passed。
- `npx tsc --noEmit --pretty false`
  - 既存残件として `ThreeStageViewport.tsx` の `three` 型定義不足、`heavyEffectsStress.test.ts` の `PositionKeyframe`、`filterStack.test.ts` の fixture 型不整合で失敗。
  - 今回の cleanup helper / Pixi video cleanup 由来の新規エラーはなし。

## 2026-06-16 — Phase5: video cutover z-order safety を追加

### 実施内容
- `sharedRendererVideoCutoverStack` を追加し、video cutover 候補より前面に Pixi-only object がある場合は cutover しない契約を TDD で固定した。
  - 前面の `Image` は Pixi-only として blocker にする。
  - 前面の `SolidColour` は shared renderer が描けるため blocker にしない。
  - 前面の `Video` は同じ cutover 候補に含まれる時だけ shared renderer owned とみなす。
- `sharedRendererVideoOwnership` は stack safety で許可された video id だけを `sharedRenderer` owner として返すようにした。
- `sharedRendererPreviewPresenterController` は Rust/WASM video decode request から candidate video id を取り、stack safety を通した id だけを ownership 判定へ渡すようにした。
- package version を `0.1.1-Beta-39a` に更新した。

### 選定理由・判断の根拠
- shared renderer canvas は Pixi 全体の上に重なるため、video だけを shared renderer へ移すと、video より前面にある Pixi-only image / PSD / text などを上書きして見える危険がある。
- actual frame upload を有効化する前に stack safety を ownership gate に入れることで、将来の切替時に z-order 破壊を避けられる。
- SolidColour は既に shared renderer で描けるため、video の前面にあっても同じ shared renderer stack 内で扱える。

### 検証
- `npm test -- src/utils/sharedRendererVideoCutoverStack.test.ts src/utils/sharedRendererVideoOwnership.test.ts src/utils/sharedRendererPresenterDiagnostics.test.ts src/utils/sharedRendererPreviewPresenterController.test.ts src/utils/pixiVideoCutover.test.ts`
  - 5 files / 23 tests passed。
- `npx tsc --noEmit --pretty false`
  - 既存残件として `ThreeStageViewport.tsx` の `three` 型定義不足、`heavyEffectsStress.test.ts` の `PositionKeyframe`、`filterStack.test.ts` の fixture 型不整合で失敗。
  - 今回追加した stack safety / ownership gate 由来の新規エラーはなし。

## 2026-06-16 — Phase5: Pixi video cutover ownership gate を追加

### 実施内容
- `sharedRendererVideoOwnership` を追加し、shared renderer が video ownership を取れる条件を TDD で固定した。
  - `cutoverEnabled`
  - Video scene が存在すること
  - video frame decode request が `rust-wasm` 経路で生成されていること
  - decoded frame の upload path が ready であること
- `sharedRendererPreviewPresenterController` は video ownership を計算し、DOM diagnostics に以下を公開するようにした。
  - `uxfdSharedRendererPresenterVideoOwner`
  - `uxfdSharedRendererPresenterVideoCutoverReason`
  - `uxfdSharedRendererPresenterSharedVideoObjectCount`
- `pixiVideoCutover` を追加し、shared renderer が所有する video object だけ Pixi video 分岐を skip できる判定を TDD で固定した。
- `Viewport` は presenter の `videoOwnership.videoObjectIds` を `updatePixiContent` に渡すようにした。
- `pixiRenderHelper` は cutover 対象 video について、Pixi children、`HTMLVideoElement`、`VideoFrameTextureState` を明示 cleanup してから video 分岐を抜けるようにした。
- package version を `0.1.1-Beta-38a` に更新した。

### 選定理由・判断の根拠
- `VITE_UXFD_SHARED_RENDERER_PREVIEW` だけで Pixi video を消すと、実 decoded frame upload が未実装の段階で動画が消えるため危険。
- `videoFrameUploadReady` を必須条件にすることで、現状では Pixi preview を維持しつつ、将来の sidecar decode -> shared memory -> WebGPU upload が入った時だけ切替できる。
- export は現行 Pixi canvas 経路を読むため、`isExporting === true` では Pixi video を維持する。
- shared renderer canvas は Pixi 全体の上に重なるため、future cutover では z-order parity が残件。今回の gate は ownership と cleanup の配線に留めた。

### 検証
- `npm test -- src/utils/sharedRendererVideoOwnership.test.ts src/utils/pixiVideoCutover.test.ts src/utils/sharedRendererPresenterDiagnostics.test.ts src/utils/sharedRendererPreviewPresenterController.test.ts`
  - 4 files / 19 tests passed。
- `npx tsc --noEmit --pretty false`
  - 既存残件として `ThreeStageViewport.tsx` の `three` 型定義不足、`heavyEffectsStress.test.ts` の `PositionKeyframe`、`filterStack.test.ts` の fixture 型不整合で失敗。
  - 今回変更した `Viewport` / `pixiRenderHelper` / shared renderer ownership 由来の新規エラーはなし。

## 2026-06-16 — Phase5: video frame decode request と Rust backend 制御プレーンを接続

### 実施内容
- `rust-core` に `video_decode_request` module を追加し、`SceneSnapshot + SceneMediaReference` から
  Video frame decode request set を生成する契約を TDD で固定した。
  - `Video` media のみ抽出。
  - `source_frame` / `timeline_frame` / `source_rate` を integer / rational で保持。
  - output format は `rgba8Srgb`、colour contract は `rec709SrgbFullRange` に固定。
  - Video media の `source_rate` 欠落や `0/x`、`x/0` は fail-loud。
- `rust-core-wasm` に `build_video_frame_decode_requests` binding を追加し、生成済み WASM を更新した。
- `sharedRendererVideoDecodeRequest` と `sharedRendererRustVideoDecodeRequest` を追加し、
  TypeScript fallback と Rust/WASM adapter の両方で `sourceRate` を扱えるようにした。
- `rustSceneSnapshot` は video media reference に project fps 由来の `source_rate` を付けるようにした。
  将来は ffprobe の実 source fps に差し替える。
- `sharedRendererPreviewPresenterController` は Video clip がある時に decode request builder を実行し、
  DOM diagnostics に以下を公開するようにした。
  - `uxfdSharedRendererPresenterVideoDecodeRequestSource`
  - `uxfdSharedRendererPresenterVideoDecodeRequestCount`
- `sidecar-protocol` に `DecodeStartRequest` / `DecodeStartResponse` / `DecodeReleaseFrameRequest` /
  `FrameRate` / `DecodeFrameRequestMode::LatestWins` を追加した。
  - control plane は frame bytes / pixels / base64 を含まない。
  - `decode.start` は `sourceRate` と shared ring layout を扱う。
  - `decode.requestFrame` は `requestId` と `mode=latestWins` を持ち、scrub 時の stale frame 破棄に備える。
- `rust-backend` に `decode.start` / `decode.requestFrame` / `decode.releaseFrame` の JSON-RPC 受け口を追加した。
  - 現段階では実 decode は行わず、ring layout の返却、frame request 受理、GPU copy 完了後 release の受理まで。
- Electron IPC / preload / renderer utility に Rust backend video decode control API を追加した。
- package version を `0.1.1-Beta-37a` に更新した。

### 選定理由・判断の根拠
- `HTMLVideoElement` / `importExternalTexture` はブラウザ暗黙 decode と色変換に依存するため、shared renderer の
  parity source にはしない。正確性経路は Rust/sidecar decoded RGBA -> shared memory / mmap -> WebGPU texture upload とする。
- H.264 の `requestFrame(N)` は O(1) ではないため、API 形に `latestWins` と `requestId` を入れ、
  scrub 中の古い decode 完了を consumer が破棄できるようにした。
- `SharedFrame.ptsFrame` / `requestId` / `generation` を照合し、ready slot の順序だけに依存しない方針にした。
- 実 pixel decode / shared memory 実装へ進む前に、control plane が frame bytes を載せないことを test で固定した。

### 検証
- `cargo test --manifest-path rust-core/Cargo.toml`
  - 32 tests passed。
- `cargo check --manifest-path rust-core-wasm/Cargo.toml`
  - passed。
- `npm run wasm:build:rust-core`
  - passed。
- Node `initSync` で生成済み WASM を直接呼び、`request_count=1` と
  `source_rate={ numerator: 60, denominator: 1 }` を確認した。
- `cargo test --manifest-path sidecar-protocol/Cargo.toml`
  - 25 tests passed。
- `cargo test --manifest-path rust-backend/Cargo.toml`
  - 3 integration tests passed。
- `npm test -- src/utils/sharedRendererVideoDecodeRequest.test.ts src/utils/sharedRendererRustVideoDecodeRequest.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/rustSceneSnapshotBoundary.test.ts src/utils/sharedRendererPreviewPresenterController.test.ts src/utils/rustBackendVideoDecodeControl.test.ts`
  - 6 files / 25 tests passed。

## 2026-06-16 — Phase5: video plane geometry を Rust/WASM に接続

### 実施内容
- `rust-core` に `video_plane_scene` module を追加し、`SceneSnapshot + SceneMediaReference + CanvasSize` から
  Video plane metadata と WebGPU 用 vertex buffer を生成する契約を TDD で固定した。
  - `Video` media のみ抽出。
  - `clip_id` / `media_id` / `source_frame` / `z_index` / `opacity` を plane metadata として保持。
  - texture UV と opacity を含む vertex 配列を生成。
- `rust-core-wasm` に `build_video_plane_vertex_scene` binding を追加し、生成済み WASM を更新した。
- `sharedRendererVideoPlaneScene` を追加し、Rust/WASM が使えない時の TypeScript fallback を用意した。
- `sharedRendererRustVideoPlaneScene` を追加し、WASM の snake_case 結果を TS の video plane scene contract へ正規化した。
- `sharedRendererPreviewPresenterController` は Video clip がある時に Rust/WASM video plane builder を実行し、
  DOM diagnostics に `uxfdSharedRendererPresenterVideoGeometrySource` を公開するようにした。
- package version を `0.1.1-Beta-36a` に更新した。

### 選定理由・判断の根拠
- 動画は decode / 色変換 / frame accuracy / GPU external texture の論点が重いため、まず video plane の
  scene geometry と source frame metadata を Rust/WASM へ移した。
- これにより、動画読み込み readiness と GPU sampling に入る前に、Rust/WASM 呼び出し・fallback・diagnostics の
  境界を確認できる。
- この段階では動画フレームの実描画はまだ Pixi / HTMLVideoElement 経路であり、Rust は動画平面の geometry と
  metadata 生成までを担当する。

### 検証
- `cargo test --manifest-path rust-core/Cargo.toml --test video_plane_scene`
  - 2 tests passed。
- `cargo test --manifest-path rust-core/Cargo.toml`
  - 30 tests passed。
- `cargo check --manifest-path rust-core-wasm/Cargo.toml`
  - passed。
- `npm run wasm:build:rust-core`
  - passed。
- Node `initSync` で生成済み WASM を直接呼び、`plane_count=1`, `source_frame=90`,
  先頭 vertex `[-0.989583313, 0.962962985, 0, 0, 0.75, 1, 0, 1]` を確認した。
- `npm test -- src/utils/sharedRendererPresenterDiagnostics.test.ts src/utils/sharedRendererPreviewPresenterController.test.ts src/utils/sharedRendererRustVideoPlaneScene.test.ts src/utils/sharedRendererVideoPlaneScene.test.ts`
  - 4 files / 14 tests passed。

## 2026-06-16 — Phase5: solid rectangle 図形の vertex 生成を Rust/WASM に接続

### 実施内容
- `rust-core` に `solid_colour_scene` module を追加し、`SceneSnapshot + SceneMediaReference + CanvasSize` から
  SolidColour draw list と WebGPU 用 vertex buffer を生成する契約を TDD で固定した。
  - `#rrggbb` colour source の parse。
  - clip opacity を掛けた premultiplied colour の生成。
  - canvas pixel 座標から clip-space 座標への変換。
- `rust-core-wasm` crate を追加し、`build_solid_colour_vertex_scene` を browser から呼べる WASM binding として生成した。
- `sharedRendererWebGpuPresenter` は、自前で矩形 geometry を作るのではなく、生成済み SolidColour vertices を受け取って
  GPU buffer に upload する形へ変更した。
- `sharedRendererPreviewPresenterController` は SolidColour clip がある時だけ Rust/WASM builder を読み込み、
  WASM 読み込みに失敗した場合は TypeScript fallback を使う。
- DOM diagnostics に `uxfdSharedRendererPresenterGeometrySource` を追加し、図形 vertex 生成が `rust-wasm` か
  `typescript` fallback かを確認できるようにした。
- `package.json` / `package-lock.json` を `0.1.1-Beta-35a` に更新し、`wasm:build:rust-core` script を追加した。

### 選定理由・判断の根拠
- 動画の前に図形を Rust 化する方針に合わせ、まず失敗時の影響が小さい solid rectangle を Rust/WASM 境界の縦スライスにした。
- GPU command 発行はまだ TypeScript/WebGPU に残し、geometry / colour / vertex 生成だけを Rust に寄せた。
  これにより、次の動画 gate へ進む前に Rust/WASM 呼び出し、fallback、presenter 受け口を確認できる。
- controller では TS draw list 生成を事前判定から外し、SolidColour clip の有無だけを見るようにした。
  実際の colour parse と vertex 生成は Rust/WASM builder へ寄せる。

### 検証
- `cargo test --manifest-path rust-core/Cargo.toml`
  - 28 tests passed。
- `cargo check --manifest-path rust-core-wasm/Cargo.toml`
  - passed。
- `wasm-pack build rust-core-wasm --target web --out-dir ../src/wasm/rust-core --out-name uxfd_rust_core_wasm`
  - passed。
- Node `initSync` で生成済み WASM を直接呼び、`rect_count=1` と先頭 vertex `[-0.6875, 0.777777791, 0.5, 0, 0, 0.5]` を確認した。
- `npm test -- src/utils/sharedRendererPreviewPresenterController.test.ts src/utils/sharedRendererWebGpuPresenter.test.ts src/utils/sharedRendererRustSolidColourScene.test.ts src/utils/sharedRendererSolidColourScene.test.ts`
  - 4 files / 23 tests passed。
- ブラウザ確認（`VITE_UXFD_SHARED_RENDERER_PREVIEW=1 npm run dev -- --host 127.0.0.1 --port 5174`）:
  - 図形追加後に `presenterStatus=ready`, `presenterSwatch=solid-colour-scene`,
    `geometrySource=rust-wasm`, `presenterFormat=bgra8unorm`。
  - console error は 0 件。通常起動では CSS reference swatch も表示されない。

## 2026-06-16 — Phase5: shared renderer overlay が動画を隠す不具合を修正

### 実施内容
- shared renderer preview 有効時、SolidColour scene が無い場合に診断用の青い swatch を全面描画していた挙動を修正した。
  - 通常 preview では transparent clear を描き、Pixi preview をパススルーする。
  - 診断 swatch / 左上 CSS reference swatch は `VITE_UXFD_SHARED_RENDERER_DIAGNOSTIC_SWATCH=1` の時だけ表示する。
- `presentSolidColourScene` は rect が 0 件でも transparent clear pass を実行するようにした。
- package version を `0.1.1-Beta-34b` に更新した。

### 選定理由・判断の根拠
- ユーザー実機で「GoPro 動画が Rectangle と一緒に TL にいないと表示されない」「左上に謎の青い刺客がいる」と報告。
  原因は shared renderer overlay が Pixi の上に乗り、動画だけの scene では診断 swatch が動画を覆っていたため。
- shared renderer がまだ描けない video / image / unsupported content は、Pixi fallback を見せるのが正しい。

### 検証
- `npm test -- src/utils/sharedRendererWebGpuPresenter.test.ts src/utils/sharedRendererPreviewPresenterController.test.ts src/utils/sharedRendererPresenterDiagnostics.test.ts`
  - 3 files / 17 tests passed。
- `npx tsc --noEmit`
  - shared renderer / Viewport 由来の新規エラーなし。
  - 既存残件として `ThreeStageViewport.tsx` の `three` 型定義不足などは継続。
- ブラウザ確認（`VITE_UXFD_SHARED_RENDERER_PREVIEW=1 npm run dev -- --host 127.0.0.1 --port 5174`）:
  - `presenterStatus=ready`, `presenterFormat=bgra8unorm`, `presenterSwatch=pixi-passthrough`, `surfaceGate=ok`。
  - `data-shared-renderer-css-reference-swatch` は存在せず、console error は 0 件。

## 2026-06-16 — Phase5: shared renderer video media readiness 診断を追加

### 実施内容
- `sharedRendererVideoMediaReadiness` を追加し、`SceneSnapshot` の `Video` media reference と既存 preview の
  `HTMLVideoElement` を照合して、`ready` / `pending` / `missingElement` を診断できるようにした。
- `Viewport` から `window.__UXFD_SHARED_RENDERER_VIDEO_MEDIA_READINESS__` と DOM dataset に以下を公開した。
  - `uxfdSharedRendererVideoReadyCount`
  - `uxfdSharedRendererVideoPendingCount`
  - `uxfdSharedRendererVideoMissingCount`
- `renderScene` 後にも shared renderer preview session を publish し、Pixi 側が video element を作った後の readiness が
  shared renderer diagnostics に反映されるようにした。
- package version を `0.1.1-Beta-34a` に更新した。

### 選定理由・判断の根拠
- 動画はいきなり WebGPU external texture に進まず、まず既存 preview loader が video element を作り、
  current frame data を持っているかを shared renderer 側から観測できる gate にした。
- これにより、次の external texture 実装で「動画が読めていない」のか「GPU import / sampling が壊れている」のかを分離できる。
- Claude レビュー反映:
  HTMLVideoElement / `importExternalTexture` はブラウザの暗黙 YUV→RGB と float 秒 seek に依存するため、
  「動画を読み込める preview」と「preview/export parity が保証された動画」は別物として扱う。次の visible slice では
  動画表示を許可しても、色・フレーム正確性は parity 未検証として明示し、known clip で preview decode と export/sidecar decode を
  比較する gate を外さない。

### 検証
- `npm test -- src/utils/sharedRendererVideoMediaReadiness.test.ts src/utils/sharedRendererPresenterSessionKey.test.ts src/utils/sharedRendererPreviewPresenterController.test.ts`
  - 3 files / 9 tests passed。
- `npx tsc --noEmit`
  - shared renderer / Viewport / video readiness 由来の新規エラーなし。
  - 既存残件として `ThreeStageViewport.tsx` の `three` 型定義不足などは継続。
- in-app Browser では file chooser へローカル動画をセットする API が見えていないため、動画 upload 後の実ブラウザ確認は未実施。
  repo 内には `perf/heavy-media/*.mp4` があるため、次は手動または別ブラウザ制御で upload 実確認を行う。

## 2026-06-16 — Phase5: shared renderer で矩形 shape を表示

### 実施内容
- `SceneSnapshot` bridge で `shapeType: "rect"` かつ gradient 無しの shape を `SolidColour` plane として許可した。
  - `media.kind` に `SolidColour` を追加。
  - `source` は `#rrggbb`、`width` / `height` は shape の矩形サイズを保持。
  - 円・丸角・グラデーションなどは `unsupportedShapeGeometry` として fail-loud のまま。
- `rust-core` schema に `MediaKind::SolidColour` / `ClipKind::SolidColourPlane` を追加し、
  timeline snapshot contract で serialise / evaluate を固定した。
- `sharedRendererSolidColourScene` を追加し、`SceneSnapshot + media` から premultiplied な矩形 draw list を生成する契約を固定した。
- WebGPU presenter に SolidColour rect 用の最小 vertex pipeline を追加した。
  - transparent clear の上に triangle-list で矩形を描く。
  - SolidColour rect が存在する session では diagnostic swatch ではなく scene content を描く。
- package version を `0.1.1-Beta-33a` に更新した。

### 選定理由・判断の根拠
- shape を無理に動画/画像 media として扱わず、`SolidColour` media として境界に入れた理由:
  既存の `media_id` / `source_frame` 契約を崩さず、最初の「置いた図形が shared renderer に出る」体験を最小変更で作れるため。
- `rect` のみ許可した理由:
  circle / rounded rect / polygon / gradient は geometry・coverage・anti-aliasing の parity 論点を持つ。最初の遊べるラインでは
  1枚の solid rectangle に絞り、WebGPU pipeline と React/Timeline 連動を先に証明する。

### 検証
- `npm test -- src/utils/rustSceneSnapshot.test.ts src/utils/rustSceneSnapshotBoundary.test.ts src/utils/sharedRendererPreviewBridge.test.ts src/utils/sharedRendererPreviewSurface.test.ts src/utils/sharedRendererPreviewDiagnostics.test.ts src/utils/sharedRendererPreviewSession.test.ts src/utils/sharedRendererPresentationContract.test.ts src/utils/sharedRendererWebGpuPresenter.test.ts src/utils/sharedRendererPresenterDiagnostics.test.ts src/utils/sharedRendererPreviewPresenterController.test.ts src/utils/sharedRendererSolidColourScene.test.ts`
  - 11 files / 44 tests passed。
- `cargo test --manifest-path rust-core/Cargo.toml --test timeline_snapshot_contract`
  - 5 tests passed。
- `npx tsc --noEmit`
  - shared renderer / rustSceneSnapshot / Viewport 由来の新規エラーなし。
  - 既存残件として `ThreeStageViewport.tsx` の `three` 型定義不足などは継続。
- ブラウザ実機確認（`VITE_UXFD_SHARED_RENDERER_PREVIEW=1 npm run dev -- --host 127.0.0.1 --port 5174`）:
  - UI から「図形の形」を追加後、`presenterStatus=ready`, `presenterFormat=bgra8unorm`,
    `presenterSwatch=solid-colour-scene`, `surfaceGate=ok`。
  - console error は 0 件。
  - スクリーンショット上の shape 中心サンプルは RGBA `(218,0,0,255)`、shape 外側は `(35,35,35,255)` で、
    shared renderer canvas 上に矩形 scene が出ていることを確認。
  - 途中で presenter session key が canvas contract のみを見ており shape 追加で再描画されない不具合を検出。
    `buildSharedRendererPresenterSessionKey` を追加し、clips/media を key に含めて修正。

## 2026-06-16 — Phase5: shared renderer presenter を Viewport に接続

### 実施内容
- `sharedRendererPresenterDiagnostics` を追加し、WebGPU presenter の `ready` / `fallback` / `deviceLost` 状態を
  DOM dataset に公開する契約を TDD で固定した。
- `sharedRendererPreviewPresenterController` を追加し、surface gate が OK のときだけ WebGPU presenter を作成し、
  `solid-srgb` swatch を clear pass で表示、失敗時は Pixi fallback 診断へ戻す接続契約を TDD で固定した。
- `Viewport` の shared renderer preview canvas に presenter controller を接続した。
  - `VITE_UXFD_SHARED_RENDERER_PREVIEW=1` のときだけ動作する。
  - canvas session key は surface gate と canvas presentation contract で安定化し、毎フレームの再初期化を避ける。
  - device lost は stale shared frame を許可せず、DOM dataset 上で Pixi fallback として見える。
- P3 Mac での目視 close 用に、同じ solid swatch 定数から生成した CSS sRGB reference swatch を preview 上に重ねた。
  実機では canvas 面と CSS reference の境界が同色に見えることを確認する。
- package version を `0.1.1-Beta-32a` に更新した。

### 選定理由・判断の根拠
- React component 直書きではなく controller に切り出した理由:
  WebGPU presenter の生成・swatch present・fallback 診断の順序を DOM 非依存でテストでき、以後 shader/pipeline に
  置き換える時も `Viewport` 側の差分を小さく保てるため。
- 初回表示を solid swatch に限定した理由:
  P3 Mac 上の canvas presentation 色管理だけを先に切り分けるため。SceneSnapshot の本描画や offscreen readback は
  後続 gate で追加する。
- CSS reference swatch を同時表示する理由:
  スクリーンショット RGBA は physical P3 display 上の見えを証明しない。canvas と CSS の同一 sRGB 色を実機で
  並べて見ることで、`colorSpace: "srgb"` が wide-gamut panel 上でも正しく扱われているかを切り分ける。

### 検証
- `npm test -- src/utils/sharedRendererPresenterDiagnostics.test.ts src/utils/sharedRendererPreviewPresenterController.test.ts src/utils/sharedRendererWebGpuPresenter.test.ts src/utils/sharedRendererPreviewSession.test.ts src/utils/sharedRendererPresentationContract.test.ts`
  - 5 files / 17 tests passed。
- `npx tsc --noEmit`
  - shared renderer / Viewport 接続由来の新規エラーなし。
  - 既存残件として `ThreeStageViewport.tsx` の `three` 型定義不足などは継続。
- ブラウザ実機確認（`VITE_UXFD_SHARED_RENDERER_PREVIEW=1 npm run dev -- --host 127.0.0.1 --port 5174`）:
  - `planMode=parallelCompare`, `surfaceGate=ok`, `canvasColourSpace=srgb`, `canvasAlphaMode=premultiplied`。
  - `presenterStatus=ready`, `presenterFormat=bgra8unorm`, `presenterSwatch=solid-srgb`。
  - canvas backing size は 1920x1080、表示は visible、pointer events は none、console error は 0 件。
  - スクリーンショット上の preview 中央/四分点サンプルは RGBA `(67,115,179,255)` で、solid swatch の表示を確認。
  - DOMStringMap では `dataset.foo = undefined` が文字列 `"undefined"` になるため、不要診断キーは `delete` する契約へ修正。
  - 注意: 上記 RGBA は buffer/capture 経路の確認であり、P3 実機 close ではない。P3 close は CSS reference swatch との
    side-by-side 目視確認で行う。
  - CSS reference swatch 追加後のブラウザ確認:
    - reference background は `rgb(64, 128, 191)`。
    - スクリーンショット上の CSS reference 中央 / canvas 中央 / reference 右隣 canvas はいずれも
      RGBA `(89,127,189,255)`。capture 経路上の side-by-side 差はなく、P3 実機目視 gate の配置は完了。

## 2026-06-16 — vNext（Rust/wgpu 移行）アーキテクチャ方針の確定（Codex と協議）

調査・設計のみのセッション。コード変更なし。Codex（dev チーム）と agmsg 経由で大規模アーキテクチャ
移行計画をレビュー・往復し、方針を確定。設計文書の正本は `markdown/architecture/` 配下（Codex が作成）に
置き、ここには**判断の根拠と協議で潰した論点**を残す。

### 確定した方針
- **層構成**: Electron/React を薄い UI シェルに、`rust-core` を編集状態・時間評価・フィルタ仕様・
  音声時間評価・色空間メタの**正本**に、`wgpu+WGSL` の**単一レンダラ**を WASM/WebGPU プレビューと
  native 書き出しで共有、危険な ffmpeg/メディア処理は**別プロセス sidecar に隔離**。
- **3 前提**: ①レンダラは wgpu で一本化（parity を構造で保証）②ffmpeg/デコードは別プロセス隔離
  （クラッシュドメイン分離）③golden-frame parity テスト土台を移行の前に作る。
- **Electron 維持**: WebGPU 挙動の OS 横断一貫性のため Chromium 同梱が必須。Tauri は WKWebView の
  WebGPU 未成熟のため不採用。
- **境界技術**: 制御プレーン（小・安全）は napi-rs 可、データプレーン（巨大フレーム）は別プロセス＋
  **共有メモリ/mmap**。JSON/base64 でフレームを流さない。
- **書き出しレンダラ**: 既定 (A)wgpu-native。parity 許容超過時のみ (B)Dawn-native へ。
  (C)headless Chromium は本経路に採らない（GPU 不安定・速度死）。
- **色/YUV**: 初期は RGBA 出力＋ffmpeg(**zscale で色空間/レンジ/primaries 明示**)。shader-YUV 化は
  後続最適化（HDR 狙いの時のみ前倒し）。**合成色空間は linear 光で決め打ち**（最大の後戻り不能点）。

### MVP スコープ（厳しく削る）
- MVP の目的は「使える編集機能」ではなく**「アーキテクチャが崩れない証明」**＝危険な境界を 1 回ずつ
  通す最薄の縦スライス。
- **絶対に入れない**: 滑らかな再生（real-time playback）と音声。過去に UXFD がネイティブ/Electron 両方で
  溺れた沼であり、かつ parity・境界の証明には不要。
- 入れる: 1 トラック 1 クリップ 1 keyframe / 1 動画平面＋1 画像＋1 エフェクト / スクラブ to frame の
  WebGPU プレビュー / 同一 timeline の wgpu-native 書き出し / golden 比較 / sidecar デコード（CPU 共有メモリ）。

### 選定理由・判断の根拠
- **wgpu 一本化**: プレビュー（wasm/WebGPU）と書き出し（native+ffmpeg フィルタ）を別実装にすると
  "What You See Is Not What You Render" を設計段階で組み込むことになるため。ffmpeg は decode/encode/mux に縮小。
- **sidecar 隔離**: libav は壊れた HEVC で普通に segfault する。最も落ちる処理を最も落ちてはいけない
  プロセス（UI 本体）に napi で同居させない。
- **linear 光合成を先決**: エフェクトを sRGB 合成前提で作って後で linear に変えると全エフェクトが壊れ、
  後戻り不能度が YUV の置き場所より高い。
- **却下案**: Tauri（WKWebView WebGPU 未成熟）/ ffmpeg フィルタ合成（parity 断層）/ 単一プロセス napi
  （クラッシュ結合）/ プレビューと書き出しの別レンダラ 2 実装。

### 過小評価されがちなリスク（初期計画に織り込む）
- カラーマネジメント（HDR/10bit/広色域）、音声同期、VFR（PTS ドリフト）、クロスプラットフォーム決定性
  （golden は許容誤差 SSIM/PSNR ベース）、実時間スケジューリング、4K フレームのバッファ/メモリ管理
  （wasm 4GB 制限、SharedArrayBuffer に COOP/COEP 必須）、CI マトリクス爆発。

### 設計文書（成果物・Codex が作成、本セッションで合意）
- `markdown/architecture/` に 00-overview / 01-decision-record(ADR) / 02-rust-core-spec / 03-colour-pipeline /
  04-render-parity / 05-boundary-ipc、＋ `markdown/roadmap.md`。
- **正本の分担**: 振る舞い＝02-rust-core-spec＋テスト、"なぜ"＝01-ADR、各事実の home は 00 の SSoT 表。
  コードは正本にしない。

### レビューで潰した重要論点（Claude 指摘 → 文書反映）
- **後戻り不能な未決定3点を Phase1 前に確定**: ①時間表現は float 秒を正本にせず整数 frame index /
  rational time base（29.97 等の drift 回避）②合成は premultiplied alpha・linear light ③linear 中間は
  `rgba16float` 既定（8bit linear のバンディング回避）。
- **parity の divergence 源を名指し**: preview(Dawn/Tint) と export(wgpu-native/Naga) で WGSL→MSL 翻訳器が
  別物。完全一致でなく許容誤差 golden を正本にし、原因分類に翻訳器差を含める。
- **入力側 parity を追加**: 画像・動画を preview/export で別 decode せず、sidecar/Rust の単一経路で
  decoded RGBA＋色 metadata を両レンダラへ供給（＝レンダラ一本化の入力版）。入力側の YUV→RGB / range /
  transfer も自動推測に依存しない契約に。
- **初回 parity gate の純化**: source=canvas 同一解像度・transform identity・1:1・no-resample で、色の正しさと
  sampling 差を交絡させない。scale/rotation/filtering は後続 gate。
- **MVP の1エフェクト＝per-pixel gain/exposure**（blur 等 sampling 系は後回し）。YUV round-trip は 4:4:4 で
  数学検証、4:2:0 は lossy 別許容。閾値は known-correct の noise floor＋margin で導出。

### 残課題・次のステップ
- **Phase1（rust-core）は着手可**＝project model の serialize round-trip test（Red）から開始。机上の詰めは
  収穫逓減で、残る未決は spike が答えを出すフェーズへ。
- 実データ待ちの判断: 初期許容誤差の具体値 / `rgba16float` の perf / VideoToolbox セッション競合の解消可否
  （sidecar 隔離で改善するか別スパイク）/ Naga・Tint 差の実測量。
- 解消済みの前提: Windows は準対応＝スモークのみ（厳密 golden は macOS/Metal に集約）。HDR は MVP 対象外
  （SDR/Rec.709、メタのみ保持）。音声は仕様定義のみで実装は後続。
- rust-core の厳密一致テストは no fast-math / FMA 再順序化前提。

## 2026-06-16 — Phase1: rust-core project model round-trip の TDD 着手

### Red
- `rust-core` crate の最小骨格を追加し、`tests/project_model_round_trip.rs` に project model の round-trip 期待テストを書いた。
- 期待 API として `Project` / `Fps` / `ProjectSize` / `ColourPipeline` / `MediaReference` / `Track` / `Clip` を先に固定した。
- `Fps` は `numerator` / `denominator` を持ち、serialised form に float 秒を含めないことをテストした。
- `cargo test --manifest-path rust-core/Cargo.toml` は未定義型で失敗し、Red を確認した。

### Green
- `serde` 対応の最小 schema を実装し、project model の `load -> save -> load` identity を通した。
- `ColourPipeline::rec709_sdr_linear()` は `rec709-sdr` / `linear-light` / `premultiplied` を返す最小実装にした。

### Refactor
- schema 定義を `rust-core/src/schema.rs` に分離し、`src/lib.rs` から再 export する構成に整理した。
- `rust-core/.gitignore` を追加し、`target/` を成果物から除外した。

### 確認結果
- `cargo test --manifest-path rust-core/Cargo.toml`
- 結果: 2 tests passed。

## 2026-06-16 — Phase1: timeline / keyframe / validation の TDD 拡張

### Timeline Evaluation
- Red: `tests/timeline_evaluation.rs` を追加し、clip の有効区間を `[start_frame, start_frame + duration_frames)` として固定した。
- Green: `evaluate_frame` / `SceneSnapshot` / `EvaluatedClip` を実装し、開始 frame、終了直前 frame、終了 frame、ゼロ duration の挙動を通した。
- Refactor: `clip_contains_frame` を切り出し、半開区間の判定を明示した。

### Keyframe Evaluation
- Red: `tests/keyframe_evaluation.rs` を追加し、opacity keyframe を clip-local `frame_offset` として評価する契約を固定した。
- Green: `ScalarKeyframe` と `opacity_keyframes` を schema に追加し、timeline evaluation の opacity に線形補間を反映した。
- Refactor: 補間処理を `src/keyframe.rs` に分離した。

### Validation
- Red: `tests/project_validation.rs` を追加し、不正 FPS、media 参照欠落、重複 ID、非有限 opacity を拒否する契約を固定した。
- Green: `validate_project` / `ValidationCode` / `ValidationIssue` を実装した。
- Refactor: ID 検証を `record_id` に切り出し、重複検出の重複を減らした。

### Property-based Test
- Red: `tests/keyframe_properties.rs` を追加し、`proptest` 未導入で失敗することを確認した。
- Green: `proptest` を dev dependency に追加し、2 keyframe 間の補間が有限値で端点範囲内に収まることを property test で確認した。
- 調整: `f32` 丸め誤差を踏んだため、範囲チェックに `1.0e-5` の許容を設け、proptest の failure persistence を無効化して CI で regression file を生成しないようにした。

### 確認結果
- `cargo test --manifest-path rust-core/Cargo.toml`
- 結果: 14 tests passed。

## 2026-06-16 — Phase1: command / snapshot contract / effect schema の TDD 拡張

### Command / Undo
- Red: `tests/command_undo.rs` を追加し、`SetClipOpacity` の do / undo / redo 契約を固定した。
- Green: `src/command.rs` を追加し、入力 `Project` を破壊せず新しい `Project` と undo command を返す最小実装にした。
- Validation: 存在しない clip は `ClipNotFound`、NaN opacity など適用後に不正となる command は `ValidationFailed` で拒否する。

### Timeline Snapshot Contract
- Red: `tests/timeline_snapshot_contract.rs` を追加し、renderer 境界として scene snapshot が `colour` metadata と clip `transform` を持つことを固定した。
- Green: `Transform` を schema に追加し、`evaluate_frame` の `SceneSnapshot` / `EvaluatedClip` に colour と transform を流すようにした。
- Validation: transform の NaN / infinite を `NonFiniteNumber` として拒否する。

### Effect Schema
- Red: MVP effect として `Effect::LinearGain { gain }` を clip に持たせ、evaluated clip にそのまま渡す契約を追加した。
- Green: `effects: Vec<Effect>` を schema と snapshot に追加し、`LinearGain` の非有限 gain を validation で拒否した。

### 確認結果
- `cargo fmt --manifest-path rust-core/Cargo.toml`
- `cargo test --manifest-path rust-core/Cargo.toml`
- 結果: 22 tests passed。

## 2026-06-16 — Phase2: golden-harness RGBA 比較土台の TDD 着手

### Red
- `golden-harness` crate を追加し、`tests/rgba_compare.rs` に同一 RGBA frame の pass、channel delta の fail、寸法不一致の fail を先に書いた。
- SSIM 追加前に、`FrameMetrics.ssim` / `ComparisonThresholds.min_ssim` / `DifferenceCause::StructuralSimilarity` の未定義で Red を確認した。

### Green
- `RgbaFrame` / `compare_rgba_frames` / `ComparisonThresholds` / `FrameMetrics` / `DifferenceCause` を実装した。
- 指標は最大 channel 差、平均絶対誤差、PSNR、global SSIM。
- 失敗原因は `DimensionMismatch` / `PixelValueDelta` / `MeanAbsoluteError` / `PsnrBelowThreshold` / `StructuralSimilarity` に分類する。

### Refactor
- fixture IO や PNG 依存はまだ入れず、RGBA8 メモリ比較の純粋ロジックだけに閉じた。
- `markdown/architecture/04-render-parity.md` と `markdown/roadmap.md` を現状の harness 契約に更新した。

### 確認結果
- `cargo fmt --manifest-path golden-harness/Cargo.toml`
- `cargo test --manifest-path golden-harness/Cargo.toml`
- 結果: 5 tests passed。

## 2026-06-16 — Phase2: PNG fixture IO と CPU reference renderer の TDD 拡張

### PNG Fixture IO
- Red: `golden-harness/tests/png_fixture_io.rs` を追加し、RGBA PNG の保存・読込 round-trip と missing fixture の IO error を固定した。
- Green: `png` crate を導入し、`save_rgba_png` / `load_rgba_png` を実装した。
- Red: indexed PNG の palette / transparency が RGBA8 に展開される test を追加し、未正規化の読込で失敗することを確認した。
- Green: `png::Transformations::normalize_to_color8()` を読込に適用し、palette / indexed / grayscale / 16bit 系入力を比較前に 8bit colour へ正規化するようにした。

### CPU Reference Renderer
- Red: `reference-renderer` crate を追加し、`rust-core` の `SceneSnapshot` と media id -> `RgbaFrame` map から解析的 reference frame を生成する契約を test 化した。
- Green: 初回 parity gate 用に、source=canvas 同一解像度、identity transform、no resampling の CPU renderer を実装した。
- 合成: linear light sample、premultiplied alpha の source-over、`Effect::LinearGain` を premultiply 前の RGB に適用。
- Error: missing source と source/canvas size mismatch を明示的に返す。

### 文書更新
- `markdown/architecture/04-render-parity.md` に PNG 正規化と `reference-renderer` の役割を追記した。
- `markdown/roadmap.md` の Phase2 タスクに PNG fixture IO と CPU reference renderer を追加した。

### 確認結果
- `cargo fmt --manifest-path rust-core/Cargo.toml`
- `cargo fmt --manifest-path golden-harness/Cargo.toml`
- `cargo fmt --manifest-path reference-renderer/Cargo.toml`
- `cargo test --manifest-path rust-core/Cargo.toml` -> 22 tests passed。
- `cargo test --manifest-path golden-harness/Cargo.toml` -> 8 tests passed。
- `cargo test --manifest-path reference-renderer/Cargo.toml` -> 4 tests passed。

## 2026-06-16 — Phase3a: native wgpu 単独 parity spike の TDD 着手

### Claude レビュー反映
- 現行 Pixi characterization golden は後回しにし、先に Phase3a として native wgpu 単独で解析的 reference と比較する方針にした。
- 理由: WebGPU preview / native export の二経路比較を先に始めると、不一致時に renderer math の誤りと経路差を切り分けづらいため。
- `markdown/architecture/04-render-parity.md` と `markdown/roadmap.md` を Phase3a / Phase3b の 2 段構成に更新した。

### Red
- `native-wgpu-renderer` crate を追加し、`tests/native_reference_parity.rs` で `SceneSnapshot` + RGBA sources を native wgpu で描画し、CPU reference と比較する期待を先に固定した。
- 未定義の `render_native_wgpu_frame` / `NativeWgpuRenderError` と未導入 `pollster` で Red を確認した。

### Green
- `wgpu` / `half` / `bytemuck` / `pollster` を導入した。
- offscreen native wgpu renderer を実装し、`rgba16float` render target に premultiplied alpha の source-over で合成するようにした。
- source texture は `Rgba8Unorm` とし、shader 側で `textureLoad` により 1:1 no-resample で取得する。
- readback 後は CPU reference と同じ規則（clamp -> `value * 255.0` -> `round()`）で straight RGBA8 に変換する。
- 初回 gate は identity transform のみ対応し、CPU reference との比較は max channel delta を主判定にした。

### 確認結果
- `cargo fmt --manifest-path native-wgpu-renderer/Cargo.toml`
- `cargo test --manifest-path native-wgpu-renderer/Cargo.toml`
- 結果: 1 test passed。
- 併せて `rust-core` 22 tests、`golden-harness` 8 tests、`reference-renderer` 4 tests も再確認済み。

## 2026-06-16 — Phase3a: sRGB 入力契約と oracle の解析アンカー修正

### Claude レビュー反映
- Claude から「oracle の正しさを誰が保証するか」「PNG byte を linear sample と見なす曖昧さ」を赤信号として指摘された。
- これを受け、PNG / RGBA8 入力は sRGB encoded とし、合成前に linear light へ decode、出力比較時に sRGB encode する契約へ修正した。

### Red
- `reference-renderer/tests/solid_scene.rs` の期待値を、sRGB decode -> linear 合成 -> sRGB encode の手計算値に変更した。
- 赤 50% over 青は `[128, 0, 128, 255]` ではなく `[188, 0, 188, 255]`。
- `[255, 128, 0]` に `LinearGain { gain: 0.5 }` を適用する case は `[188, 92, 0, 255]`。
- 旧実装は encoded byte 値のまま計算していたため Red を確認した。

### Green
- `reference-renderer` に sRGB -> linear decode と linear -> sRGB encode を追加した。
- `native-wgpu-renderer` の WGSL shader に sRGB decode を追加し、readback 後の RGBA8 化でも sRGB encode を行うようにした。
- native wgpu と CPU reference の parity test を Green に戻した。
- 追加アンカー: white 50% over black の手計算値 `[188, 188, 188, 255]` を CPU reference と native wgpu の両方で確認した。
- さらに opacity 0.25、source alpha 128 × clip opacity 0.5、gain 2.0 clamp、2 pixel 座標写像の判別ケースを追加した。

### 文書更新
- `markdown/architecture/03-colour-pipeline.md` に MVP の演算順序を正本として追記した。
- `markdown/architecture/04-render-parity.md` の Phase3a 量子化規則にも sRGB decode / encode を追記した。

### 確認結果
- `cargo test --manifest-path rust-core/Cargo.toml` -> 22 tests passed。
- `cargo test --manifest-path golden-harness/Cargo.toml` -> 8 tests passed。
- `cargo test --manifest-path reference-renderer/Cargo.toml` -> 9 tests passed。
- `cargo test --manifest-path native-wgpu-renderer/Cargo.toml` -> 6 tests passed。

## 2026-06-16 — Phase3b: WebGPU preview harness の実測

### Claude レビュー反映
- Phase3b 前に、共有 WGSL、plain `rgba8unorm` + 手動 sRGB decode、`rgba16float` render target、readback 後 CPU encode / quantise の 4 点を固定した。
- WGSL は `shared-renderer/shaders/solid_composite.wgsl` の単一ソースに移し、native wgpu と WebGPU harness の両方から読む構成にした。

### WebGPU Harness
- `phase3b-webgpu-harness/` を追加した。
- local HTTP server 経由で Chrome 149 / WebGPU を起動し、Phase3a と同じ 6 つの hand anchor case を描画した。
- source texture は `rgba8unorm`、render target は `rgba16float`、sRGB decode は共有 WGSL、sRGB encode と `round()` は JS 側 readback 後に実行した。

### 実測結果
- 実行 URL: `http://127.0.0.1:4177/phase3b-webgpu-harness/`
- Adapter: `vendor=apple` / `architecture=metal-3` / `isFallbackAdapter=false`。
- red 50% over blue: `maxDelta = 0`
- white 50% over black: `maxDelta = 0`
- white 25% over black: `maxDelta = 0`
- source alpha × clip opacity: `maxDelta = 0`
- gain above one clamp: `maxDelta = 0`
- 2 pixel coordinate mapping: `maxDelta = 0`
- すべて `meanAbsoluteError = 0`。

### 追加確認
- `?perturb=red-plus` で共有 WGSL 読込後の shader に red channel 加算を入れ、期待通り RED になることを確認した。
- これにより、WebGPU harness が GPU output を実際に readback / compare していることを確認した。
- Claude レビューで `3b verified GO` として扱ってよいと確認された。
- この GO は per-pixel 合成の範囲に限定する。blur / scale / rotate など sampling 系は後続 gate で検証する。

## 2026-06-16 — Phase4: sidecar ring buffer / back pressure contract の TDD 着手

### Red
- `sidecar-protocol/tests/ring_buffer.rs` を追加し、共有フレーム ring の layout、slot 状態遷移、producer back pressure、consumer empty ring の契約を先に固定した。
- 期待 API として `FrameRingLayout` / `SharedFrameRing` / `SlotState` / `AcquireWriteError` / `AcquireReadError` を置いた。
- 未定義 API により `cargo test --manifest-path sidecar-protocol/Cargo.toml` が失敗し、Red を確認した。

### Green
- `sidecar-protocol` に OS 非依存の純粋な ring buffer state machine を実装した。
- slot 状態は `free -> writing -> ready -> reading -> free` とした。
- producer は `free` slot がない場合 `NoFreeSlot` を返し、consumer は `ready` slot がない場合 `NoReadySlot` を返す。
- `FrameRingLayout` は `memoryId`、slot 数、slot byte length、解像度、stride、format、colour metadata から各 `FrameDescriptor` を導出する。
- frame bytes は protocol object に載せず、`SharedFrame` は descriptor と `ptsFrame` のみを持つ契約を維持した。

### 文書更新
- `markdown/architecture/05-boundary-ipc.md` に ring layout、状態遷移、所有権、back pressure の初期契約を追記した。
- checksum / pixel diff schema と実共有メモリ API は未決として残した。

### 確認結果
- `cargo fmt --manifest-path sidecar-protocol/Cargo.toml`
- `cargo test --manifest-path sidecar-protocol/Cargo.toml`
- 結果: 6 tests passed。

### Claude レビュー反映
- Claude から、共有メモリ ring contract の MVP blocker として以下の指摘を受けた。
  - Apple Silicon では plain load/store の slot state だと `ready` が見えても bytes が未可視化の torn frame が起きうる。
  - `reading -> free` を GPU upload 完了前に行うと、producer が上書きして renderer が読みかけの frame を壊す。
- Red: `reading_slot_is_not_freed_until_copy_out_completion_is_signalled` と `synchronisation_contract_requires_release_acquire_slot_state` を追加した。
- Green: `CopyOutState` / `RingSynchronisationContract` / `SlotStateStorage::AtomicU32` / `AtomicOrdering::{Release, Acquire}` を追加した。
- `release_read_slot` は `CopyOutState::GpuUploadFenceSignalled` が渡されるまで slot を `free` に戻さない契約に変更した。
- stride padding と colour metadata の退行防止として `layout_preserves_padded_stride_and_colour_metadata` を追加した。
- `markdown/architecture/05-boundary-ipc.md` に SPSC、atomic release/acquire、GPU upload fence、preview/export の独立 ring、back pressure policy、stuck slot の未決を追記した。

### 再確認結果
- `cargo fmt --manifest-path sidecar-protocol/Cargo.toml`
- `cargo test --manifest-path sidecar-protocol/Cargo.toml`
- 結果: 7 tests passed。
- Perturbation: `?perturb=red-plus` で shader の red channel を意図的に壊し、5/6 ケースが RED になることを確認した。gain clamp case は saturate して差が出ないため pass のまま。

### 確認結果
- `node --check phase3b-webgpu-harness/phase3b.js`
- `cargo test --manifest-path native-wgpu-renderer/Cargo.toml` -> 6 tests passed。

## 2026-06-16 — Phase4: checksum schema と既知 CFR H.264 decode correctness spike

### Claude レビュー反映
- Claude から、decode spike の目的は `preview == export` の同語反復ではなく、既知入力に対する
  decode -> colour conversion -> descriptor の正しさ確認に置くべきと指摘された。
- そのため、テスト素材は中身が既知の CFR H.264 をテスト中に生成し、期待 RGBA と decoded RGBA を比較する方針にした。
- 追加レビューで、grayscale ramp は luma 経路だけを確認する identity gate になり、YUV matrix の chroma 項を炙れないと指摘された。
- Red として pure R / G / B、orange、teal を含むことを test に追加し、grayscale 実装で失敗することを確認した。
- Green として既知フレームを 32x16 colour swatch に差し替え、x264 VUI / ffprobe metadata で
  `primaries=bt709`、`matrix=bt709`、`range=pc`、`transfer=iec61966-2-1` を明示した。
- `markdown/architecture/03-colour-pipeline.md` に、MVP の renderer handoff は `Rgba8Srgb` / sRGB transfer へ
  正規化する方針を追記した。

### Red
- `sidecar-protocol/tests/frame_verification.rs` を追加し、`FrameVerificationReport` / `FrameChecksum` /
  `PixelDiffSummary` / `FrameVerificationStatus` の JSON schema を先に固定した。
- verification report も frame bytes / pixel array / base64 を載せない契約にした。
- `decode-spike/tests/known_cfr_h264_decode.rs` を追加し、既知 CFR H.264 1 frame が期待 RGBA と許容差内で
  一致すること、descriptor が `Rgba8Srgb` と colour metadata を持つこと、decode invocation が 1 回であることを固定した。

### Green
- `sidecar-protocol` に checksum / pixel diff summary schema を実装した。
- `decode-spike` crate を追加した。
- 既知 32x16 RGBA colour swatch を生成し、`ffmpeg` + software `libx264` fallback で `yuv444p` / `crf=0` の
  1 frame CFR H.264 を作るようにした。
- `ffprobe` で `codec=h264`、`avgFrameRate=30/1`、`frameCount=1`、colour metadata を確認した。
- `ffmpeg` decode は 1 回だけ実行し、decoded RGBA8 frame から descriptor / shared frame / verification report を生成した。

### 実測結果
- decoded RGBA vs 期待 RGBA: `maxDelta=2`、`meanAbsoluteError=0.3125`、`PSNR=52.042869868809795`、
  `SSIM=0.9999737802566389`。
- decoded RGBA CRC32: `ef46fca8`。
- descriptor: `format=Rgba8Srgb`、`colour=rec709_srgb()`、`strideBytes=width*4`。

### 確認結果
- `cargo fmt --manifest-path sidecar-protocol/Cargo.toml`
- `cargo test --manifest-path sidecar-protocol/Cargo.toml` -> 11 tests passed。
- `cargo fmt --manifest-path decode-spike/Cargo.toml`
- `cargo test --manifest-path decode-spike/Cargo.toml` -> 1 test passed。

## 2026-06-16 — Phase4: renderer handoff validation と atomic ring stress

### Claude レビュー反映
- Claude から、`transfer=bt709` や `range=tv` の実素材を sRGB/full range として無音処理しないよう、
  descriptor metadata を読んで未対応なら fail-loud にすべきと指摘された。
- また、単スレッドの ring buffer state machine test は acquire/release の正しさを証明しないため、
  producer / consumer を実スレッドで同時に回す checksum stress が必要と指摘された。

### Descriptor Validation
- Red: `sidecar-protocol/tests/descriptor_validation.rs` を追加し、MVP renderer handoff として
  `Rgba8Srgb + bt709 primaries + srgb transfer + rgb matrix + full range` だけを受け付ける契約を固定した。
- Green: `validate_renderer_handoff_descriptor` / `DescriptorValidationError` を実装した。
- `transfer=bt709` と `range=tv` は、後続 gate で対応するまでは明示的に reject する。

### Atomic Ring Stress
- Red: `shared-memory-spike/tests/atomic_ring_stress.rs` を追加し、producer / consumer を実スレッドで回して
  deterministic frame bytes と CRC32 が一致し続けることを固定した。
- Green: `shared-memory-spike` crate を追加し、`AtomicU32` slot state、`UnsafeCell<Vec<u8>>` buffer、
  release-store / acquire-load を使う in-memory SPSC ring を実装した。
- 2,000 frames / 4,096 bytes の stress で、読み出し bytes と checksum が全 iteration で一致した。
- stress は throughput / 機能確認として残す。メモリ順序 correctness の主証明にはしない。

### Loom Ordering
- Claude から、stress pass は確率的であり、Release/Acquire が本当に効いている証明にはならないと指摘された。
- Red/Green: `shared-memory-spike/tests/loom_ordering.rs` を追加し、stable toolchain で `loom` による ordering model を通した。
- Init handshake: header fields -> `initState` の Release/Acquire model は全 interleaving で pass。
- Init perturb: `initState` の store/load を Relaxed に落とした model は failure として検出されることを確認した。
- Publish 方向: frame bytes -> `ready` の Release/Acquire model は全 interleaving で pass。
- Publish perturb: `ready` の store/load を Relaxed に落とした model は failure として検出されることを `catch_unwind` で確認した。
- Recycle 方向: copy-out marker -> `free` の Release/Acquire model は、slot を 2 cycle 再利用しても全 interleaving で pass。
- Recycle perturb: `free` の store/load を Relaxed に落とした model は failure として検出されることを `catch_unwind` で確認した。
- ThreadSanitizer はローカルに nightly toolchain が無いため未実施。後続 CI / nightly 環境で追加する。

### Shared Header
- Claude から、cross-process mmap では `repr(C)` だけでは別ビルド間の layout drift を検出できないため、
  magic / protocol version / layout hash を共有領域先頭に置くべきと指摘された。
- Red: `shared-memory-spike/tests/shared_header.rs` を追加し、header offset / size、未初期化 attach の拒否、
  layout hash mismatch の拒否を固定した。
- Green: `SharedRingHeader` / `SharedRingAttachError` / `expected_shared_ring_layout_hash` を実装した。
- `SharedRingHeader` は `#[repr(C)]`、現時点で size 40 bytes。主要 offset は test で固定した。
- producer は初期化完了時に `init_state` を Release store、consumer attach は Acquire load で確認する。

### POSIX Shm Two-Process Spike
- Red: `shared-memory-spike/tests/posix_shm_two_process.rs` を追加し、consumer を producer より先に起動して
  shm object の存在 retry を踏む 2 プロセス CRC stress を固定した。
- Green: `shm_open` / `ftruncate` / `mmap(MAP_SHARED)` を使う `PosixSharedRing` と、
  `uxfd-shm-producer` / `uxfd-shm-consumer` bin を実装した。
- producer / consumer は別プロセスで 250 frames / 4,096 bytes の deterministic frame と CRC32 を検証した。
- Red/Green: 実 mapping 上の layout hash を意図的に壊した場合、attach が `LayoutHashMismatch` で fail-loud になる test を追加した。
- macOS の POSIX shm 名長制限に当たったため、test 用 shm name は短い形式に調整した。

### Decode -> Shm Integration
- Red: `shared-memory-spike/tests/decode_to_shm.rs` と `uxfd-shm-raw-consumer` bin を追加し、
  `decode-spike` の既知 CFR H.264 decoded RGBA を POSIX shm に流して別プロセス consumer が検証する契約を固定した。
- Green: `run_shm_raw_consumer_from_args` を実装し、consumer が expected raw RGBA file と shm frame の bytes / CRC32 を比較するようにした。
- 既知 colour swatch H.264 decode -> POSIX shm ring -> 別プロセス raw consumer の統合 test が pass した。

### Shm -> Native Renderer Integration
- Claude から、decode -> shm で止めず、実 decoded frame を renderer texture upload へ通してから 4K throughput に進むべきと指摘された。
- Red: `native-wgpu-renderer/tests/shm_decoded_frame_render.rs` を追加し、POSIX shm から読み出した decoded RGBA を
  native wgpu renderer に渡し、known swatch と比較する契約を固定した。
- Green: 既存 `render_native_wgpu_frame` で decoded frame を描画し、render 完了後に
  `CopyOutState::GpuUploadFenceSignalled` として slot release するようにした。
- 実測: `maxDelta=2`、`meanAbsoluteError=0.3125`、`PSNR=52.042869868809795`、
  `SSIM=0.9999737802566389`。
- これにより input -> decode -> POSIX shm -> native wgpu render -> known swatch 比較の end-to-end correctness が通った。

### 確認結果
- `cargo fmt --manifest-path sidecar-protocol/Cargo.toml`
- `cargo test --manifest-path sidecar-protocol/Cargo.toml` -> 14 tests passed。
- `cargo fmt --manifest-path shared-memory-spike/Cargo.toml`
- `cargo test --manifest-path shared-memory-spike/Cargo.toml` -> 14 tests passed。
- `cargo fmt --manifest-path native-wgpu-renderer/Cargo.toml`
- `cargo test --manifest-path native-wgpu-renderer/Cargo.toml --test shm_decoded_frame_render` -> 1 test passed。

## 2026-06-16 — Phase4: 4K throughput / slot sizing spike

### Red
- `sidecar-protocol/tests/frame_memory_sizing.rs` を追加し、4K RGBA8 decode slot と `rgba16float`
  render target readback の byte footprint を先に固定した。
- `native-wgpu-renderer/tests/frame_stage_timings.rs` を追加し、native wgpu renderer が
  `sourceUpload` / `render` / `readbackEncode` / `total` を分離して返す契約を固定した。
- `native-wgpu-renderer/tests/four_k_throughput.rs` を `#[ignore]` 付きの明示実行 probe として追加した。

### Green
- `frame_buffer_footprint` と `rgba8_srgb_ring_layout` を実装し、row pitch は 256 byte alignment で計算するようにした。
- 4K RGBA8 source slot は `33,177,600 bytes`、4K `rgba16float` readback は `66,355,200 bytes` として固定した。
- `measure_native_wgpu_frame_stages` を実装し、従来の `render_native_wgpu_frame` は測定 API の frame だけを返す互換 API とした。
- 4K probe の初回実行で `wgpu::Limits::downlevel_defaults()` の `maxTextureDimension2D=2048` に当たり、
  3840px texture 作成が失敗した。device request limit を frame size に合わせ、adapter limit を超える場合は
  `FrameSizeExceedsAdapterLimit` として fail-loud にした。

### Claude レビュー反映
- Claude から、`total` に adapter / device / pipeline 作成などの一回性 setup が混入しているため、
  throughput 判断では per-frame steady state と分けるべきと指摘された。
- Red/Green: `NativeWgpuFrameStageTimings` に `setup` と `steadyState` を追加し、
  `steadyState = sourceUpload + render + readbackEncode` を test で固定した。
- preview path と export path を分けて読む必要がある。preview は readback を行わず、
  export だけが `readbackEncode` を支払う。

### 実測結果
- Debug build: `setup=28.588625ms`、`sourceUpload=13.600083ms`、`render=21.783333ms`、
  `readbackEncode=1.314205583s`、`steadyState=1.349588999s`、`total=1.379209708s`。
- Release build observed range: `setup=9.623042ms-25.295542ms`、`sourceUpload=10.807208ms-12.032625ms`、
  `render=7.610625ms-8.507167ms`、`readbackEncode=112.997ms-136.20175ms`、
  `steadyState=132.664167ms-155.516125ms`、`total=146.89025ms-181.625625ms`。
- `sourceUpload` は source texture 作成、CPU bytes の staging copy、queue flush、GPU work completion を含む。
- `render` は render command submit から GPU work completion までを含む。
- `readbackEncode` は `copy_texture_to_buffer` completion、buffer map、`f16` readback scan、
  premultiplied -> straight RGBA8、CPU linear -> sRGB encode を含む。
- Release の preview 相当 steady state は `sourceUpload + render = 約18.5-20.5ms`、約 49-54fps。
- Release の export steady state は `約132.7-155.5ms/frame`、約 6.4-7.5fps。
- 現時点の支配項は export 側の readback + CPU encode。これは後続の shader encode / u8 readback /
  YUV 直出し最適化の根拠として残すが、MVP では correctness gate を優先する。

### 確認結果
- `cargo test --manifest-path sidecar-protocol/Cargo.toml --test frame_memory_sizing` -> 4 tests passed。
- `cargo test --manifest-path native-wgpu-renderer/Cargo.toml --test frame_stage_timings` -> 1 test passed。
- `cargo test --manifest-path native-wgpu-renderer/Cargo.toml --test four_k_throughput` -> 1 ignored。
- `cargo test --manifest-path native-wgpu-renderer/Cargo.toml --test four_k_throughput -- --ignored --nocapture` -> 1 test passed。
- `cargo test --release --manifest-path native-wgpu-renderer/Cargo.toml --test four_k_throughput -- --ignored --nocapture` -> 1 test passed。

## 2026-06-16 — Phase4: export round-trip / explicit ffmpeg colour conversion

### Red
- `decode-spike/tests/explicit_colour_export_round_trip.rs` を追加し、RGBA -> H.264 4:4:4 export filter が
  `primariesin` / `transferin` / `matrixin` / `rangein` と出力側 `primaries` / `transfer` / `matrix` / `range`
  を明示する契約を固定した。
- 既知 swatch frame を explicit H.264 4:4:4 へ encode し、再 decode して元 swatch と比較する契約を固定した。
- `native-wgpu-renderer/tests/export_round_trip.rs` を追加し、timeline snapshot -> native wgpu RGBA ->
  explicit H.264 4:4:4 export -> 再 decode -> known swatch 比較の縦スライスを固定した。

### Green
- `decode-spike` に `export_rgba_frame_to_h264_444` / `decode_exported_h264_to_rgba` /
  `explicit_rgba_to_h264_444_filter` を実装した。
- encode filter は `matrixin=gbr`、出力 `matrix=bt709`、`transfer=iec61966-2-1`、`range=full` を明示した。
- decode filter は H.264 4:4:4 側の `bt709` / sRGB transfer / full range を明示し、最後に `format=rgba` へ落とす。
- 最初の decode filter では `matrix=gbr` を zscale 出力に指定して失敗した。zscale は YUV family に RGB matrix を
  出せないため、YUV 側を明示した上で `format=rgba` に渡す形に修正した。

### 実測結果
- explicit H.264 4:4:4 export round-trip: `maxDelta=1`、`meanAbsoluteError=0.203125`、
  `PSNR=55.05316982544961`、`SSIM=0.9999856973166401`。
- native wgpu -> explicit H.264 4:4:4 export round-trip: `maxDelta=1`、`meanAbsoluteError=0.203125`、
  `PSNR=55.05316982544961`、`SSIM=0.9999856973166401`。
- native preview output -> export round-trip output の直接比較: `maxDelta=1`、`meanAbsoluteError=0.203125`、
  `PSNR=55.05316982544961`、`SSIM=0.9999856973166401`。
- ffprobe metadata: `codec=h264`、`avgFrameRate=30/1`、`frameCount=1`、`range=pc`、
  `space=bt709`、`transfer=iec61966-2-1`、`primaries=bt709`。
- 4:2:0 export は subsampling tolerance が別物になるため未実施。まず 4:4:4 correctness gate を固定した。
- Spike では sRGB transfer (`iec61966-2-1`) tag を使っている。内部一貫性は取れているが、shipping export では
  SDR H.264 の一般的な期待に合わせて bt709 transfer 出力を別 gate で確認する。

### 確認結果
- `cargo fmt --manifest-path decode-spike/Cargo.toml`
- `cargo test --manifest-path decode-spike/Cargo.toml --test explicit_colour_export_round_trip -- --nocapture` -> 2 tests passed。
- `cargo fmt --manifest-path native-wgpu-renderer/Cargo.toml`
- `cargo test --manifest-path native-wgpu-renderer/Cargo.toml --test export_round_trip -- --nocapture` -> 1 test passed。

### Consolidated Milestone
- Claude レビューで、MVP のアーキテクチャ検証 arc は完了と扱ってよいと確認された。
- central risk はそれぞれ falsification-grade の gate を持った:
  - preview parity: WebGPU / native wgpu / CPU reference / hand anchor が `maxDelta=0`。
  - input correctness: known CFR H.264 decode が `maxDelta=2`。
  - data plane: decode -> POSIX shm -> consumer が byte / CRC exact、Release/Acquire は loom perturb で検証済み。
  - render integration: shm frame -> native wgpu -> known swatch が `maxDelta=2`。
  - export correctness: native wgpu -> explicit H.264 4:4:4 -> known swatch が `maxDelta=1`。
  - WYSIWYG direct check: native preview output -> export round-trip output が `maxDelta=1`。
- ここから先はアーキテクチャ成立性の証明ではなく、breadth と production 化:
  sampling 系 effect、real footage、bt709 / limited range、VFR、4:2:0 tolerance、shader encode / u8 readback、
  sidecar orchestration / cancellation / crash recovery。

## 2026-06-16 — Breadth: bt709 transfer shipping export gate

### Red
- `decode-spike/tests/bt709_transfer_export_round_trip.rs` を追加し、sRGB encoded RGBA input を
  bt709 transfer の H.264 4:4:4 へ変換して書き出す filter contract を先に固定した。
- `native-wgpu-renderer/tests/export_round_trip.rs` に、native wgpu output -> bt709 transfer H.264 4:4:4 ->
  再 decode -> known swatch / preview output 比較の gate を追加した。

### Green
- `explicit_rgba_to_h264_444_bt709_filter` / `explicit_h264_444_bt709_to_rgba_filter` /
  `export_rgba_frame_to_h264_444_bt709` を実装した。
- encode filter は入力側 `transferin=iec61966-2-1`、出力側 `transfer=bt709` とし、RGB matrix input は
  `matrixin=gbr`、H.264 側は `matrix=bt709` とした。
- `libx264` と container tag も `transfer=bt709` / `-color_trc bt709` に揃えた。
- decode filter は bt709 transfer の H.264 4:4:4 を sRGB RGBA へ戻すため、
  `transferin=bt709` -> `transfer=iec61966-2-1` を明示した。

### 実測結果
- RGBA -> bt709 H.264 4:4:4 -> RGBA: `maxDelta=2`、`meanAbsoluteError=0.328125`、
  `PSNR=52.57532498834205`、`SSIM=0.999975264393527`。
- native wgpu -> bt709 H.264 4:4:4 -> RGBA: `maxDelta=2`、`meanAbsoluteError=0.328125`、
  `PSNR=52.57532498834205`、`SSIM=0.999975264393527`。
- native preview output -> bt709 export round-trip output: `maxDelta=2`、`meanAbsoluteError=0.328125`、
  `PSNR=52.57532498834205`、`SSIM=0.999975264393527`。
- ffprobe metadata: `codec=h264`、`avgFrameRate=30/1`、`frameCount=1`、`range=pc`、
  `space=bt709`、`transfer=bt709`、`primaries=bt709`。

### 確認結果
- `cargo fmt --manifest-path decode-spike/Cargo.toml`
- `cargo test --manifest-path decode-spike/Cargo.toml --test bt709_transfer_export_round_trip -- --nocapture` -> 2 tests passed。
- `cargo fmt --manifest-path native-wgpu-renderer/Cargo.toml`
- `cargo test --manifest-path native-wgpu-renderer/Cargo.toml --test export_round_trip -- --nocapture` -> 2 tests passed。

## 2026-06-16 — Breadth: bt709 H.264 4:2:0 distribution export gate

### Red
- `decode-spike/tests/bt709_yuv420_export_round_trip.rs` を追加し、bt709 transfer / full range / H.264 4:2:0 の
  distribution export contract を固定した。
- `native-wgpu-renderer/tests/export_round_trip.rs` に、native wgpu output -> bt709 H.264 4:2:0 ->
  再 decode の gate を追加した。

### Green
- `explicit_rgba_to_h264_420_bt709_filter` / `export_rgba_frame_to_h264_420_bt709` を実装した。
- `ProbeSummary` に `pixelFormat` を追加し、ffprobe の `pix_fmt` を検証できるようにした。
- full range 4:2:0 は ffprobe 上 `yuvj420p` と報告されるため、`range=pc` と合わせてその表記を受け入れる。
- 32x16 の硬い色境界 swatch は 4:2:0 chroma subsampling の影響が内部まで強く出たため、
  4:2:0 gate では 128x128 の同一色 swatch を使い、full-frame envelope と stable swatch interior を分けて判定した。

### 実測結果
- RGBA -> bt709 H.264 4:2:0 -> RGBA full-frame: `maxDelta=132`、`meanAbsoluteError=3.0048828125`、
  `PSNR=27.403575633662975`、`SSIM=0.9915148895704098`。
- RGBA -> bt709 H.264 4:2:0 -> RGBA swatch interior: `maxDelta=2`、`meanAbsoluteError=0.34375`、
  `PSNR=52.390490931401914`、`SSIM=0.9999747882512735`。
- native wgpu -> bt709 H.264 4:2:0 -> RGBA full-frame: `maxDelta=132`、`meanAbsoluteError=3.0048828125`、
  `PSNR=27.403575633662975`、`SSIM=0.9915148895704098`。
- native wgpu -> bt709 H.264 4:2:0 -> RGBA swatch interior: `maxDelta=2`、`meanAbsoluteError=0.34375`、
  `PSNR=52.390490931401914`、`SSIM=0.9999747882512735`。

### 判断
- 4:2:0 は graphics / text / hard chroma edge で大きな局所劣化を起こす。これは codec/subsampling の性質であり、
  renderer parity failure と混同しない。
- distribution export の acceptance は full-frame envelope と stable-region correctness を別々に持つ。
- 高忠実度が必要な編集確認・中間成果物は 4:4:4 gate、配布用互換性は 4:2:0 gate で扱う。

### 確認結果
- `cargo fmt --manifest-path decode-spike/Cargo.toml`
- `cargo test --manifest-path decode-spike/Cargo.toml --test bt709_yuv420_export_round_trip -- --nocapture` -> 2 tests passed。
- `cargo fmt --manifest-path native-wgpu-renderer/Cargo.toml`
- `cargo test --manifest-path native-wgpu-renderer/Cargo.toml --test export_round_trip -- --nocapture` -> 3 tests passed。

## 2026-06-16 — Phase4: sidecar protocol 契約の TDD 着手

### Red
- `sidecar-protocol` crate を追加し、制御プレーンに frame bytes / base64 / pixel array を載せない契約を `tests/control_plane.rs` で先に固定した。
- `DecodeFrameRequest` は float 秒ではなく `frameIndex` を使うことを test 化した。

### Green
- `DecodeFrameRequest` / `ControlEvent` / `SharedFrame` / `FrameDescriptor` / `FrameFormat` / `ColourMetadata` を実装した。
- `FrameReady` event は shared memory descriptor と colour metadata だけを JSON に載せ、巨大 frame data は data plane に分離する形にした。

### 文書更新
- `markdown/architecture/05-boundary-ipc.md` に `sidecar-protocol` の制御プレーン / データプレーン契約を追記した。

### 確認結果
- `cargo test --manifest-path sidecar-protocol/Cargo.toml` -> 2 tests passed。

## 2026-06-16 — Phase4: sidecar job lifecycle / cancellation control-plane

### Red
- `sidecar-protocol/tests/job_lifecycle.rs` を追加し、cancel request が `jobId` だけを持ち、frame bytes /
  pixel array / base64 を制御プレーンに載せない契約を固定した。
- `jobProgress` と `jobCancelled` event が progress / cancellation metadata のみを JSON に載せることを固定した。
- cancel request 後に `complete` が成功せず、cleanup 完了後の `jobCancelled` で終端する state machine を先に書いた。

### Green
- `CancelJobRequest` / `JobState` / `JobLifecycle` / `JobLifecycleError` を実装した。
- `ControlEvent` に `JobStarted` / `JobProgress` / `JobCompleted` / `JobCancelled` を追加した。
- job state は `queued -> running -> completed`、または `queued/running -> cancelling -> cancelled` とし、
  `cancelling` 中の `complete` は `CancellationPending` で拒否する。
- `jobId` / `completedFrames` / `totalFrames` / `slotIndex` は JSON 側で camelCase になるよう固定した。

### 文書更新
- `markdown/architecture/05-boundary-ipc.md` に job lifecycle と cancellation の最小 state machine を追記した。
- `markdown/roadmap.md` の Phase4 タスクに job lifecycle / progress / cancellation control-plane gate を追加した。

### 確認結果
- `cargo fmt --manifest-path sidecar-protocol/Cargo.toml`
- `cargo test --manifest-path sidecar-protocol/Cargo.toml --test job_lifecycle` -> 3 tests passed。
- `cargo test --manifest-path sidecar-protocol/Cargo.toml --test control_plane` -> 2 tests passed。

## 2026-06-16 — Phase4: slot lease generation / stuck slot recovery contract

### Red
- `sidecar-protocol/tests/ring_buffer.rs` に、`FrameDescriptor.generation` と stale consumer release 防止の契約を追加した。
- watchdog recovery 後に古い `ReadyFrame` を release しても、新しい reader lease を `free` に戻せないことを固定した。
- 未定義の `SlotRecoveryReason` / `recover_stuck_slot` / `LeaseGenerationMismatch` と descriptor `generation` で Red を確認した。

### Green
- `FrameDescriptor` に `generation` を追加し、静的 layout descriptor は `generation=0`、実 write lease は 1 以上を発行するようにした。
- `SharedFrameRing.acquire_write_slot` が slot ごとに generation を進め、`mark_slot_ready` / `release_read_slot` で lease generation を検証するようにした。
- `recover_stuck_slot` を追加し、`writing` / `ready` / `reading` の stuck slot を `free` に戻す際に generation を進め、古い token を無効化するようにした。

### 文書更新
- `markdown/architecture/05-boundary-ipc.md` に descriptor `generation` と slot lease / recovery contract を追記した。
- `markdown/roadmap.md` の Phase4 タスクと完了条件に stale slot release 防止 gate を追加した。

### 確認結果
- `cargo fmt --manifest-path sidecar-protocol/Cargo.toml`
- `cargo test --manifest-path sidecar-protocol/Cargo.toml --test ring_buffer` -> 8 tests passed。

## 2026-06-16 — Breadth: limited range H.264 decode gate

### Red
- `decode-spike/tests/limited_range_decode.rs` を追加し、source H.264 が `color_range=tv` の場合でも
  sidecar decode が full-range `Rgba8Srgb` descriptor を返す契約を固定した。
- limited range encode filter が `rangein=full` から `range=limited` へ明示変換することを test 化した。

### Green
- `explicit_rgba_to_limited_range_h264_444_filter` と
  `build_known_cfr_h264_limited_range_fixture` を実装した。
- `decode_fixture_to_shared_rgba` は `ffprobe` の `color_range` を読み、`pc` / `tv` に応じて
  `scale=in_range=...:out_range=pc` を明示するようにした。
- unknown / missing range は無音で full range 扱いせず、probe error として扱う。

### 実測結果
- limited range H.264 4:4:4 -> full-range RGBA: `maxDelta=1`、`meanAbsoluteError=0.25`、
  `PSNR=54.15140352195873`、`SSIM=0.9999824540291767`。

### 文書更新
- `markdown/architecture/03-colour-pipeline.md` に limited range source を full-range renderer handoff へ正規化する契約を追記した。
- `markdown/architecture/05-boundary-ipc.md` に limited range decode gate の実測値を追記した。
- `markdown/roadmap.md` の Phase4 完了条件に limited range H.264 input gate を追加した。

### 確認結果
- `cargo fmt --manifest-path decode-spike/Cargo.toml`
- `cargo test --manifest-path decode-spike/Cargo.toml --test limited_range_decode -- --nocapture` -> 2 tests passed。

## 2026-06-16 — Phase3c: integer transform / nearest sampling gate

### Red
- `reference-renderer/tests/solid_scene.rs` と `native-wgpu-renderer/tests/native_reference_parity.rs` に、
  2x2 source を `translation=(1,1)`、`scale=(2,2)` で 5x5 canvas に配置する hand anchor test を追加した。
- 旧実装は source と canvas の同一サイズ / identity transform 前提だったため、CPU reference 側で `SourceSizeMismatch` になり Red を確認した。

### Green
- `reference-renderer` に integer translation / nearest scale / clipping を追加した。
- `native-wgpu-renderer` と共有 WGSL に同じ nearest mapping を追加した。
- mapping は `floor((outputPixel - translation) / scale)` とし、sampler / bilinear filtering は使わない。
- rotation、非正 scale は引き続き unsupported として fail-loud にした。
- `phase3b-webgpu-harness` に同じ transform case を追加した。

### 実測結果
- CPU reference transform gate: hand anchor と一致。
- native wgpu transform gate: CPU reference / hand anchor と `maxDelta=0`。
- WebGPU preview harness: Chrome 149、Apple Metal adapter、`integer translation and nearest scale` case が
  `maxDelta=0` / `meanAbsoluteError=0`。

### 文書更新
- `markdown/architecture/04-render-parity.md` に integer transform / nearest sampling gate を追記した。
- `markdown/roadmap.md` に Phase3c を追加した。

### 確認結果
- `cargo fmt --manifest-path reference-renderer/Cargo.toml`
- `cargo fmt --manifest-path native-wgpu-renderer/Cargo.toml`
- `cargo test --manifest-path reference-renderer/Cargo.toml` -> 10 tests passed。
- `cargo test --manifest-path native-wgpu-renderer/Cargo.toml` -> 12 passed / 1 ignored。
- `node --check phase3b-webgpu-harness/phase3b.js`
- WebGPU harness: `http://127.0.0.1:4177/phase3b-webgpu-harness/` を system Chrome 149 で実行し `ok=true`。

## 2026-06-16 — Phase3d: linear-light bilinear sampling gate

### Red
- `reference-renderer/tests/solid_scene.rs` に、2x1 source（black / white）の midpoint を
  `sampling=bilinear` で 1x1 canvas に描画し、期待値 `[188,188,188,255]` と比較する hand anchor test を追加した。
- `native-wgpu-renderer/tests/native_reference_parity.rs` に同じ scene を追加し、native wgpu / CPU reference / hand anchor の一致を要求した。
- 旧 schema には `SamplingMode` と `Transform.sampling` が存在しないため、compile error で Red を確認した。

### Green
- `rust-core` の `Transform` に `sampling` を追加し、`nearest` / `bilinear` を `SamplingMode` として定義した。
- 既定値は後方互換のため `nearest` とし、既存 timeline snapshot は明示的に nearest を使う形に更新した。
- `reference-renderer` は nearest と bilinear の sampling を分岐し、bilinear では 4 texel を sRGB -> linear light decode 後に補間する。
- `native-wgpu-renderer` と共有 WGSL は `sampling_mode` uniform を受け取り、CPU reference と同じ linear-light bilinear 補間を行う。
- `phase3b-webgpu-harness` に `linear-light bilinear midpoint` case を追加した。

### 実測結果
- CPU reference bilinear gate: hand anchor `[188,188,188,255]` と一致。
- native wgpu bilinear gate: CPU reference / hand anchor と `maxDelta=0`。
- WebGPU preview harness: Chrome 149、Apple Metal adapter、`linear-light bilinear midpoint` case が
  `maxDelta=0` / `meanAbsoluteError=0`。

### 文書更新
- `markdown/architecture/02-rust-core-spec.md` に `Transform.sampling` と linear-light bilinear の契約を追記した。
- `markdown/architecture/04-render-parity.md` に linear-light bilinear sampling gate を追記した。
- `markdown/roadmap.md` に Phase3d を追加した。

### 確認結果
- `cargo fmt --manifest-path rust-core/Cargo.toml`
- `cargo fmt --manifest-path reference-renderer/Cargo.toml`
- `cargo fmt --manifest-path native-wgpu-renderer/Cargo.toml`
- `cargo test --manifest-path rust-core/Cargo.toml` -> passed。
- `cargo test --manifest-path golden-harness/Cargo.toml` -> passed。
- `cargo test --manifest-path reference-renderer/Cargo.toml` -> passed。
- `cargo test --manifest-path sidecar-protocol/Cargo.toml` -> passed。
- `cargo test --manifest-path decode-spike/Cargo.toml` -> passed。
- `cargo test --manifest-path shared-memory-spike/Cargo.toml` -> passed。
- `cargo test --manifest-path native-wgpu-renderer/Cargo.toml` -> passed / 1 ignored。
- `node --check phase3b-webgpu-harness/phase3b.js`
- WebGPU harness: `http://127.0.0.1:4177/phase3b-webgpu-harness/` を system Chrome 149 で実行し `ok=true`。

## 2026-06-16 — Phase4: sidecar decode checksum handoff gate

### Red
- `shared-memory-spike/tests/sidecar_decode_checksum.rs` を追加し、既知 CFR H.264 の direct decode RGBA を
  sidecar handoff API 経由で POSIX shm に書き込む契約を固定した。
- test は `FrameReady` の `SharedFrame`、`FrameVerificationReport.checksum`、consumer readback CRC32 が
  direct decode reference と一致することを要求する。
- 未定義の `write_sidecar_decoded_frame_to_ring` で compile error になり Red を確認した。

### Green
- `shared-memory-spike` に `write_sidecar_decoded_frame_to_ring` と `SidecarDecodedFrameWrite` を追加した。
- API は `DecodeFrameRequest`、`FrameDescriptor`、RGBA bytes を受け取り、POSIX shm へ frame を書いて
  `JobStarted -> FrameReady -> JobCompleted` の control events を返す。
- `FrameVerificationReport` は CRC32 / byte length を持ち、pixel bytes 自体は control plane に載せない。

### 文書更新
- `markdown/architecture/05-boundary-ipc.md` に sidecar data-plane handoff gate を追記した。

### 確認結果
- `cargo fmt --manifest-path shared-memory-spike/Cargo.toml`
- `cargo test --manifest-path shared-memory-spike/Cargo.toml --test sidecar_decode_checksum` -> 1 test passed。
- `cargo test --manifest-path shared-memory-spike/Cargo.toml` -> passed。

## 2026-06-16 — Phase4: sidecar handoff metadata fail-loud gate

### Red
- `shared-memory-spike/tests/sidecar_decode_checksum.rs` に、`transfer=bt709` の descriptor を
  sidecar handoff が shm 書き込み前に拒否する contract test を追加した。
- 未定義の `SidecarDecodeHandoffError` で Red を確認した。

### Green
- `write_sidecar_decoded_frame_to_ring` の戻り値を `SidecarDecodeHandoffError` に変更し、
  `DescriptorValidationError` と shm error を分離した。
- shm へ bytes を書く前に `validate_renderer_handoff_descriptor` を呼び、未対応 metadata を fail-loud にした。

### 文書更新
- `markdown/architecture/05-boundary-ipc.md` に sidecar handoff 時の descriptor validation を追記した。

### 確認結果
- `cargo fmt --manifest-path shared-memory-spike/Cargo.toml`
- `cargo test --manifest-path shared-memory-spike/Cargo.toml --test sidecar_decode_checksum` -> 2 tests passed。
- `cargo test --manifest-path shared-memory-spike/Cargo.toml` -> passed。

## 2026-06-16 — Phase5: Pixi state -> Rust SceneSnapshot adapter gate

### Red
- `src/utils/rustSceneSnapshot.test.ts` を追加し、既存 `TimelineObject` / layer visibility / fps / timeline time から
  rust-core serde 互換の `SceneSnapshot` JSON を作る契約を固定した。
- active image / video plane、position animation、fade opacity、hidden / inactive clip の除外、
  unsupported Pixi feature の fail-loud を test 化した。
- 未実装の `rustSceneSnapshot` module import error で Red を確認した。

### Green
- `src/utils/rustSceneSnapshot.ts` を追加し、Phase5 入口用の `buildRustSceneSnapshotForTimeline` を実装した。
- 変換対象は `image` / `video` の media plane に限定し、`RustSceneSnapshot` と media references を返す。
- `frame_index` / `source_frame` は project fps から整数 frame に丸め、video は `offset` を source frame に反映する。
- `sampling` は shared renderer の Phase3d gate に合わせて `bilinear` とした。
- text / shape / PSD / audio、rotation、非正 scale、video reversed / subject crop、fade 以外の enabled filter は
  shared renderer へ黙って渡さず issue として fail-loud にした。
- `package.json` / `package-lock.json` を `0.1.1-Beta-20a` に更新した。

### 文書更新
- `markdown/roadmap.md` の Phase5 に Pixi state -> Rust SceneSnapshot adapter gate を追記した。

### 確認結果
- `npm test -- src/utils/rustSceneSnapshot.test.ts` -> 3 tests passed。

## 2026-06-16 — Phase5: Rust SceneSnapshot JSON boundary gate

### Red
- `rust-core/tests/timeline_snapshot_contract.rs` に `SceneSnapshot` の serde JSON contract test を追加した。
- TS adapter と同じ `frame_index` / `clip_id` / `media_id` / `source_frame` / `sampling` などの field name を固定した。
- `SceneSnapshot` / `EvaluatedClip` に `Serialize` / `Deserialize` が無いため compile error で Red を確認した。

### Green
- `rust-core/src/timeline.rs` の `SceneSnapshot` と `EvaluatedClip` に `Serialize` / `Deserialize` derive を追加した。
- `Effect::LinearGain` は serde の外部タグ付き enum として `{ "LinearGain": { "gain": ... } }` の形を維持した。

### 確認結果
- `cargo fmt --manifest-path rust-core/Cargo.toml`
- `cargo test --manifest-path rust-core/Cargo.toml --test timeline_snapshot_contract` -> 4 tests passed。
- `cargo test --manifest-path rust-core/Cargo.toml` -> passed。

## 2026-06-16 — Phase5: shared renderer adapter fail-loud widening

### Red
- `src/utils/rustSceneSnapshot.test.ts` に、`groupId` / `groupGradient` / `clipping` を持つ media plane を
  shared renderer adapter が拒否する contract test を追加した。
- 旧 adapter はこれらの Pixi 固有合成意味論を通してしまい、`ok=true` になったため Red を確認した。

### Green
- `RustSceneSnapshotBuildIssueCode` に `unsupportedGroupComposition` と `unsupportedMask` を追加した。
- `buildRustSceneSnapshotForTimeline` は group composition / group gradient / layer clipping mask を issue として返す。
- `package.json` / `package-lock.json` を `0.1.1-Beta-20b` に更新した。

### 確認結果
- `npm test -- src/utils/rustSceneSnapshot.test.ts` -> 4 tests passed。

## 2026-06-16 — Phase5: shared renderer adapter transform envelope gate

### Red
- `src/utils/rustSceneSnapshot.test.ts` に、非 identity scale と sub-pixel translation を shared renderer adapter が
  拒否する contract test を追加した。
- 旧 adapter は scale / sub-pixel translation を通してしまい、`ok=true` になったため Red を確認した。

### Green
- `buildRustSceneSnapshotForTimeline` は評価後 position が整数でない場合、または `scaleX` / `scaleY` が 1 でない場合に
  `unsupportedTransform` を返すようにした。
- Claude review の指摘に従い、Phase5 の最初の bridge は verified envelope に閉じ、Pixi差分を正解扱いせず triage 用にする。
- `package.json` / `package-lock.json` を `0.1.1-Beta-20c` に更新した。

### 確認結果
- `npm test -- src/utils/rustSceneSnapshot.test.ts` -> 5 tests passed。

## 2026-06-16 — Phase5: shared renderer preview bridge plan gate

### Red
- `src/utils/sharedRendererPreviewBridge.test.ts` を追加し、shared renderer preview の入口方針を固定した。
- flag disabled では Pixi only、adapter OK では Pixi primary / shared renderer candidate の `parallelCompare`、
  unsupported scene では Pixi fallback になることを test 化した。
- 未実装の `sharedRendererPreviewBridge` module import error で Red を確認した。

### Green
- `src/utils/sharedRendererPreviewBridge.ts` を追加し、`buildSharedRendererPreviewPlan` を実装した。
- bridge は Pixi を即 cutover せず、shared renderer を comparison candidate として返す。
- adapter issue がある場合は `pixiFallback` とし、unsupported feature を黙って近似しない。
- `markdown/roadmap.md` に Pixi は oracle ではなく triage signal として扱う方針を追記した。
- `package.json` / `package-lock.json` を `0.1.1-Beta-21a` に更新した。

### 確認結果
- `npm test -- src/utils/sharedRendererPreviewBridge.test.ts` -> 3 tests passed。

## 2026-06-16 — Phase5: Viewport shared renderer preview diagnostic wiring

### Green
- `src/components/Viewport.tsx` で `VITE_UXFD_SHARED_RENDERER_PREVIEW=1` の時だけ
  `buildSharedRendererPreviewPlan` を呼ぶ diagnostic wiring を追加した。
- Pixi preview は引き続き primary renderer のまま維持し、shared renderer plan は
  `window.__UXFD_SHARED_RENDERER_PREVIEW_PLAN__` に公開するだけにした。
- `package.json` / `package-lock.json` を `0.1.1-Beta-22a` に更新した。

### 確認結果
- `npm test -- src/utils/rustSceneSnapshot.test.ts src/utils/sharedRendererPreviewBridge.test.ts` -> 8 tests passed。
- `npx tsc --noEmit` は既存の `three` 型不足と既存 test 型エラーで失敗するため、今回追加分の全体型検査は未完了。

## 2026-06-16 — Phase5: TS SceneSnapshot boundary validation gate

### Red
- `src/utils/rustSceneSnapshotBoundary.test.ts` を追加し、TS adapter output が rust-core JSON 境界として妥当かを
  unknown payload から検査する契約を固定した。
- `frame_index` / `clip_id` など snake_case field を要求し、camelCase drift、非有限数、非整数 frame、
  未対応 enum、範囲外 opacity、未対応 effect、未対応 media kind を拒否する test を追加した。
- 未実装の `validateRustSceneSnapshotBoundary` で Red を確認した。

### Green
- `src/utils/rustSceneSnapshot.ts` に `validateRustSceneSnapshotBoundary` を追加した。
- Rust / shared renderer へ渡す前の JSON 境界として、`SceneSnapshot`、clip transform、effect stack、media references を
  実行時に検査できるようにした。
- `package.json` / `package-lock.json` を `0.1.1-Beta-23a` に更新した。

### 確認結果
- `npm test -- src/utils/rustSceneSnapshotBoundary.test.ts` -> 3 tests passed。

## 2026-06-16 — Phase5: shared renderer preview surface gate

### Red
- `src/utils/sharedRendererPreviewSurface.test.ts` を追加し、shared renderer canvas を mount してよい条件を
  UI から切り離した純粋関数の契約として固定した。
- `parallelCompare` 以外、export 中、3D editor mode、不正 project size、WebGPU 不在、fallback adapter、
  Rust boundary validation 失敗を明示理由つきで block する test を追加した。
- 未実装 module import error で Red を確認した。

### Green
- `src/utils/sharedRendererPreviewSurface.ts` を追加し、`buildSharedRendererPreviewSurfaceGate` を実装した。
- Gate が通る時だけ canvas size、snapshot、media references を返し、Pixi primary / shared renderer candidate の
  read-only 並走条件を固定した。
- `package.json` / `package-lock.json` を `0.1.1-Beta-24a` に更新した。

### 確認結果
- `npm test -- src/utils/sharedRendererPreviewSurface.test.ts` -> 3 tests passed。

## 2026-06-16 — Phase5: shared renderer preview diagnostics gate

### Red
- `src/utils/sharedRendererPreviewDiagnostics.test.ts` を追加し、Pixi diff を正解 oracle として扱わない比較診断契約を固定した。
- Pixi と candidate が一致しても reference gate 未実行なら `triageOnly`、reference が fail したら Pixi 一致でも
  `rejected`、reference/native が pass して Pixi だけ差分なら `needsLegacyTriage` とする test を追加した。
- report に frame bytes / pixel array / base64 を含めない metric-only 契約も固定した。
- 未実装 module import error で Red を確認した。

### Green
- `src/utils/sharedRendererPreviewDiagnostics.ts` を追加し、`classifySharedRendererPreviewComparison` を実装した。
- 判定優先順位を reference correctness / native parity / Pixi triage の順に固定し、Pixi 一致だけで pass しないようにした。
- `markdown/roadmap.md` に比較診断 report の metric-only 方針を追記した。
- `package.json` / `package-lock.json` を `0.1.1-Beta-25a` に更新した。

### 確認結果
- `npm test -- src/utils/sharedRendererPreviewDiagnostics.test.ts` -> 4 tests passed。

## 2026-06-16 — Phase5: SceneSnapshot strict boundary schema gate

### Red
- `src/utils/rustSceneSnapshotBoundary.test.ts` に strict schema の追加契約を足した。
- camelCase drift を「必須 field 欠落」だけでなく「未知 field 混入」としても検出し、
  snapshot / clip / transform / media の unknown field、media id 重複、clip から参照されない orphan media を拒否する
  test を追加した。
- 旧 validator は unknown field と duplicate / orphan media を通したため Red を確認した。

### Green
- `validateRustSceneSnapshotBoundary` に allowed keys の検査、duplicate media id 検出、orphan media reference 検出を追加した。
- これにより TS 側の実行時 payload が Rust serde contract から緩く広がる drift を早期に検出できるようにした。
- `package.json` / `package-lock.json` を `0.1.1-Beta-26a` に更新した。

### 確認結果
- `npm test -- src/utils/rustSceneSnapshotBoundary.test.ts` -> 4 tests passed。

## 2026-06-16 — Phase5: Viewport shared renderer preview session wiring

### Red
- `src/utils/sharedRendererPreviewSession.test.ts` を追加し、preview plan と surface gate を一括生成する session 契約を固定した。
- supported 2D scene では `parallelCompare` plan と mount 可能 surface gate を返し、disabled / unsupported scene では
  blocked surface reason を保つ test を追加した。
- 未実装 module import error で Red を確認した。

### Green
- `src/utils/sharedRendererPreviewSession.ts` を追加し、`buildSharedRendererPreviewPlan` と
  `buildSharedRendererPreviewSurfaceGate` を束ねる `buildSharedRendererPreviewSession` を実装した。
- `src/components/Viewport.tsx` の feature flag 診断を session 経由へ切り替え、WebGPU adapter probe と
  `window.__UXFD_SHARED_RENDERER_PREVIEW_SURFACE_GATE__` の公開を追加した。
- `preview-canvas-container` 内に `data-shared-renderer-preview-surface` canvas を重ねる準備を入れた。Pixi は引き続き primary。
- `src/utils/sharedRendererPreviewSurface.test.ts` の union narrowing を補い、全体 `tsc` 上の新規 shared renderer 型エラーを解消した。
- `package.json` / `package-lock.json` を `0.1.1-Beta-27a` に更新した。

### 確認結果
- `npm test -- src/utils/sharedRendererPreviewSurface.test.ts src/utils/sharedRendererPreviewSession.test.ts` -> 5 tests passed。
- `npx tsc --noEmit` は既存の `src/components/ThreeStageViewport.tsx` の `three` 型不足で失敗するが、
  `Viewport` / `sharedRendererPreview*` / `rustSceneSnapshot` の新規エラーは出ていない。

## 2026-06-16 — Phase5: shared renderer presentation contract gate

### Claude レビュー反映
- Claude から、Phase3b の readback proof は canvas presentation / display colour management / page compositing を通っていないため、
  on-screen preview では macOS P3 display、canvas alpha、同一 frame freeze、device lost、unsupported frame partition が
  盲点になると指摘を受けた。

### Red
- `src/utils/sharedRendererPresentationContract.test.ts` を追加し、WebGPU canvas presentation を `colorSpace: "srgb"` /
  `alphaMode: "premultiplied"` に固定する契約を test 化した。
- 比較 readback は page-composited canvas ではなく offscreen render target から取ること、device lost 時は Pixi fallback、
  stale shared frame を許さないことを test 化した。
- Pixi / shared renderer / SceneSnapshot の frame index が一致しない比較を拒否し、unsupported frame を parity metrics から除外して
  Pixi-only partition に分ける契約を追加した。
- さらに `src/utils/sharedRendererPreviewSession.test.ts` で session が presentation contract を公開する Red を確認した。

### Green
- `src/utils/sharedRendererPresentationContract.ts` を追加し、presentation contract、frame lock validation、
  comparable / Pixi-only frame partition を実装した。
- `buildSharedRendererPreviewSession` が `presentationContract` を返すようにし、
  `Viewport` から `window.__UXFD_SHARED_RENDERER_PRESENTATION_CONTRACT__` へ診断公開するようにした。
- `markdown/roadmap.md` に WebGPU presentation / offscreen readback / frozen frame / partition 方針を追記した。
- `package.json` / `package-lock.json` を `0.1.1-Beta-28a` に更新した。

### 確認結果
- `npm test -- src/utils/sharedRendererPresentationContract.test.ts src/utils/sharedRendererPreviewSession.test.ts` -> 5 tests passed。

### Browser 追加確認と修正
- `VITE_UXFD_SHARED_RENDERER_PREVIEW=1 npm run dev -- --host 127.0.0.1 --port 5174` で起動し、Browser で新規 project を作成した。
- `data-shared-renderer-preview-surface` canvas は Pixi canvas と同じ 1920x1080 backing size / 同じ CSS size /
  `pointer-events: none` で mount されることを確認した。
- 一方で `pixiReady` が render effect の依存に無いため、Pixi 初期化後に `renderScene` が再発火せず
  `window.__UXFD_SHARED_RENDERER_*` 診断 payload が未設定になることを確認した。
- `renderScene` の dependency に shared renderer flag / GPU status / editor mode / project settings を含め、
  render effect が `pixiReady` 後に再実行されるよう修正した。
- さらに診断 payload 生成を `renderScene` から独立した effect へ分離し、空 scene や初期描画前でも
  `window.__UXFD_SHARED_RENDERER_*` を観測できるようにした。
- Browser の read-only evaluation では page world の `window.__UXFD_*` expando を観測できない可能性があったため、
  `document.documentElement.dataset` と surface canvas dataset に plan / gate / canvas colour / alpha contract を
  併せて公開するようにした。
- 再確認で `planMode=parallelCompare`、`surfaceGate=ok`、`colourSpace=srgb`、`alphaMode=premultiplied`、
  surface canvas は backing size 1920x1080 / CSS size は preview scale / `pointer-events: none`、error log なしを確認した。
- `package.json` / `package-lock.json` を `0.1.1-Beta-28d` に更新した。

### 残る手動 gate
- Claude から、P3 display 上の OS compositor colour management は unit test / offscreen readback では観測できないため、
  実機 P3 Mac で shared-renderer preview swatch と export-decoded reference swatch を並べる visual / sampled check が
  初回 surface go 前に必要と指摘を受けた。
- この P3 実機 check を `markdown/roadmap.md` の Phase5 gate に追記した。

## 2026-06-16 — Phase5: shared renderer WebGPU presenter init gate

### Red
- `src/utils/sharedRendererWebGpuPresenter.test.ts` を追加し、実描画前の WebGPU presenter 初期化契約を固定した。
- surface gate が blocked の時は WebGPU / canvas context に触らないこと、gate OK では
  `getPreferredCanvasFormat()`、`colorSpace: "srgb"`、`alphaMode: "premultiplied"`、
  `GPUTextureUsage.RENDER_ATTACHMENT` で `canvas.configure` することを test 化した。
- `device.lost` 解決時に Pixi fallback と stale shared frame 禁止を通知することも test 化した。
- 未実装 module import error で Red を確認した。

### Green
- `src/utils/sharedRendererWebGpuPresenter.ts` を追加し、`createSharedRendererWebGpuPresenter` を実装した。
- presenter は shader / render pipeline をまだ作らず、adapter / device / canvas context / presentation configure /
  device lost fallback のみに責務を限定した。
- `markdown/roadmap.md` に初回 presenter の責務境界を追記した。
- `package.json` / `package-lock.json` を `0.1.1-Beta-29a` に更新した。

### 確認結果
- `npm test -- src/utils/sharedRendererWebGpuPresenter.test.ts` -> 3 tests passed。
- `npx tsc --noEmit` は既存の `src/components/ThreeStageViewport.tsx` の `three` 型不足で失敗するが、
  `sharedRendererWebGpuPresenter` / shared renderer 追加分の新規エラーは出ていない。

### Dispose guard
- `src/utils/sharedRendererWebGpuPresenter.test.ts` に、presenter `dispose()` 後に `device.lost` が解決しても
  Pixi fallback callback を呼ばない契約を追加した。
- `createSharedRendererWebGpuPresenter` の成功結果に `dispose()` を追加し、unmount 後の遅延 device-lost event を抑止するようにした。
- `package.json` / `package-lock.json` を `0.1.1-Beta-29b` に更新した。

### Non-sRGB canvas format gate
- Claude から、canvas format を `-srgb` にすると renderer 側の linear -> sRGB encode と二重 encode になり、
  preview / export parity を壊すと指摘を受けた。
- `src/utils/sharedRendererWebGpuPresenter.test.ts` に `bgra8unorm-srgb` など `-srgb` format を拒否する契約を追加した。
- `createSharedRendererWebGpuPresenter` は `getPreferredCanvasFormat()` の結果が `-srgb` で終わる場合、
  `srgbCanvasFormat` として fail-loud にするようにした。
- `markdown/roadmap.md` に non-srgb canvas format 方針と二重 encode 禁止を追記した。
- `package.json` / `package-lock.json` を `0.1.1-Beta-29c` に更新した。

## 2026-06-16 — Phase5: presenter solid swatch gate

### Red
- `src/utils/sharedRendererWebGpuPresenter.test.ts` に、P3 実機確認用の solid sRGB swatch presentation 契約を追加した。
- presenter が shader module / render pipeline を作らず、`getCurrentTexture()` への render pass clear だけで
  swatch を canvas に出すことを fake device で固定した。
- 未実装の `presentSolidSrgbSwatch` で Red を確認した。

### Green
- `createSharedRendererWebGpuPresenter` の成功結果に `presentSolidSrgbSwatch` を追加した。
- 実装は `context.getCurrentTexture().createView()` を color attachment にした clear pass のみで、
  shader / pipeline 抽出前に canvas presentation の P3 表示境界を単独確認できる形にした。
- `markdown/roadmap.md` に solid swatch による canvas presentation 確認方針を追記した。
- `package.json` / `package-lock.json` を `0.1.1-Beta-30a` に更新した。

### 確認結果
- `npm test -- src/utils/sharedRendererWebGpuPresenter.test.ts` -> 6 tests passed。
- `npx tsc --noEmit` は既存の `src/components/ThreeStageViewport.tsx` の `three` 型不足で失敗するが、
  `sharedRendererWebGpuPresenter` / shared renderer 追加分の新規エラーは出ていない。

## 2026-05-31 — 中間ファイル生成を SW(libx264) 化＋実測ベンチ

### 実施内容（不具合修正）
- 中間ファイル生成を `h264_videotoolbox`(HW) で行うと、アプリ側の VideoToolbox 使用
  （プレビュー decode / 書き出し encode）と**セッション競合し、途中失敗・破損ファイル**を
  生成していた（ffprobe で「ストリーム無し」/「Conversion failed!」）。手動（レンダラ無し）では成功するのが傍証。
- 修正: 中間ファイルの **デコード・エンコードとも SW** に変更（`-i`（HWアクセラ無し）＋`-c:v libx264 -preset veryfast -crf 20`）。VideoToolbox を使わないため競合せず確実。4K HEVC→FHD で **約1.4倍速**（5分→約3.5分）と実用範囲。

### 実測ベンチ（4K HEVC 5分 → FHD60 書き出し）
- 修正前 rVFC: **82fps** → 5分の書き出し ≈ 3.7分（＋フレーム落ちの恐れ）
- 修正後 中間ファイル: **121fps** → ≈ 2.5分（フレーム落ちなし）
- => **書き出し 約1.5倍速**（＋ドロップ解消）。中間生成は一度きり・編集中にバックグラウンドで実施（約3.5分・~230MB/本）。

### 残課題・次のステップ
- 中間生成中の CPU 使用（~640%）で編集が一瞬重くなる可能性 → `nice`/スレッド数制限/アイドル判定で緩和余地。
- 中間ファイルが encode 律速(FHD60 H.264 ~120fps)に到達。さらなる高速化は HEVC 出力 or 出力解像度選択。
- tmpdir キャッシュの掃除。

## 2026-05-31 — 中間ファイルのバックグラウンド先行生成（初回書き出しも速く）

### 背景・計測
- ユーザー実シナリオ「出力 FHD・ソース 4K HEVC(5分)」を計測。getFrame/描画/読み戻しは全て高速で、ボトルネックは **HEVC が rVFC 再生方式に落ち、ディスプレイのリフレッシュ(~60Hz)制限＋4Kデコードのため実時間が上限**。エフェクト無関係。
- ffmpeg(HW) 4K HEVC→FHD H.264 変換は約2倍速（5分→2.5分）・576MB。変換自体が4Kデコードを伴うため、書き出し時に同期生成すると初回が逆に遅くなる。

### 実施内容
- **中間ファイルを編集中にバックグラウンド先行生成**する設計に変更:
  - `useMediaOptimization` フック: 出力解像度より大きい動画ソースを、出力解像度の H.264 へ HW で1本ずつ変換・キャッシュ（書き出し中は競合回避で停止）。
  - Electron: `generate-intermediate`(HW・キャッシュ・進捗・同時1本)＋`check-intermediate`(生成せず存在確認)。キャッシュキーはソースの size+mtime+幅。
  - 書き出し: キャッシュ済み中間ファイルが**あれば**最優先で VideoDecoder デコード（最速・フレーム落ちなし）、**無ければ待たずに**従来フォールバック（rVFC）。→ 初回書き出しは遅くならず、編集中に生成が済めば以降は高速。
- 優先順: 中間ファイル → プロキシ → ソース直 VideoDecoder → rVFC → シーク。

### 選定理由・判断の根拠
- 同期生成は初回が遅くなるため却下。バックグラウンド＋「あれば使う」方式なら回帰ゼロで、編集時間を使って透過的に最適化メディアを用意できる（FCP の optimized media と同じ発想）。
- ゲートを「ソース幅 > 出力幅」にし、4K→FHD の主ケースを HEVC/H.264 ともにカバー（HEVC 同解像度は当面 rVFC のまま・将来 codec プローブで拡張可）。

### 残課題・次のステップ
- 実機での体感確認（編集中に生成完了 → 書き出しが VideoDecoder 経路で高速・無ドロップになるか）。
- 編集中の生成が重い場合のアイドル判定／明示的な「最適化中」インジケータ。
- 中間ファイルのキャッシュ掃除（tmpdir 蓄積）。

## 2026-05-31 — 4K 書き出しを約2倍高速化（コーデックレベル/レイテンシ修正）

### 実施内容
- 実 Pixi(WebGPU) パイプラインを実ファイル(4K)で計測し、真の律速を特定:
  - getFrame=0.3ms / texUpdate=0.1 / render=0.4 / readback=0.1 / encode=0.1 と**取得・描画・読み戻しは全てほぼ無料**。
  - **encWait（HW エンコーダ待ち）だけが支配的**（修正前 ~39ms/枠）。→ デコード/描画/読み戻しの最適化が効かなかった理由。
- 原因と修正（`videoExportPipeline.ts`）:
  1. **コーデックレベルが Level 4.0 固定**で 4K 非対応 → 解像度から必要レベルを算出（4K は 5.1/5.2）。`buildH264Candidates`/`h264LevelHexFor`。
  2. **`latencyMode` が 'quality' 優先（遅い）** → **'realtime' 優先**（VideoToolbox の frame delay 制約緩和で高速）。
  3. **コーデックキャッシュが解像度を無視**（1080p 検出を 4K に流用）→ `${W}x${H}@${fps}` キーの Map に。
  4. ビットレートを解像度連動に（4K で 10Mbps は低品質 → ~25Mbps）。
- 計測結果: 4K 実効 **23fps → 43fps（約1.9倍）**、encWait 39→22ms。

### 選定理由・判断の根拠
- 計測で「エンコーダが唯一の律速」と確定したため、エンコーダ構成（レベル・レイテンシ）の最適化が最大効果。Level 4.0 で 4K を投げていたのは明確なバグ。
- realtime 優先は全解像度に効く（quality より速く、書き出し用途では十分な品質）。

### 残課題・次のステップ
- encWait（4K H.264 HW エンコード ~45fps）が新たな上限。さらなる高速化は HEVC 出力エンコード（要互換性検討）か出力解像度の選択肢提供。
- 実機での 4K 長尺の体感確認。

## 2026-05-31 — 書き出し高速化: 段のオーバーラップ＋出力のディスク逐次書き出し

### 実施内容
- 計測（実ファイル 4K, IMG_3899.MOV）: 実効 54fps、「再生デコード ~10ms ＋ 4K HWエンコード待ち ~8ms」がほぼ直列。
- **段のオーバーラップ**（`videoExportPipeline.ts`）: `new VideoFrame(bitmap)` はコピー生成のため、生成直後に次フレームの取得・描画(`iterator.next()`)を開始。現フレームのエンコード/背圧待ちと並行化し、「取得+描画」と「エンコード」の直列を解消。
- **出力のディスク逐次書き出し**:
  - `encodeVideoToMp4` に `writeChunk` を追加。指定時は `StreamTarget`(mp4-muxer) で出力チャンクを逐次書き出し、出力全体をメモリ保持しない（fastStart:false = moov 末尾）。
  - Electron に `export-stream-open/write/close` IPC を追加（fd を保持し position 指定で書き込み）。
  - `useProjectExport` は保存先を開き writeChunk で逐次書き込み、`save-buffer-to-file` の全保持書き込みを廃止。
- 検証: ハーネスで `streamed=true`・先頭ボックス=ftyp の有効 MP4 生成、オーバーラップ後も背圧 peakQueueSize=8 維持、無地エンコード正常を確認。

### 選定理由・判断の根拠
- VideoFrame のコピー特性を使うことで、所有権契約を変えずに（ジェネレータ側 close を維持）安全にパイプライン化できる（低リスク）。
- StreamTarget + fastStart:false は逐次・メモリ非保持で実装が単純。moov 末尾の再インポート遅延は許容（外部プレーヤ再生は問題なし）。faststart 化は将来 ffmpeg `-c copy -movflags +faststart` で対応可能。

### 残課題・次のステップ
- 実機（4K/長尺 HEVC）での体感速度・メモリの最終確認。
- 真のボトルネックが Pixi の WebGPU 読み戻しなら、`VideoFrame(canvas)` 直結（colorSpace 対応要確認）でさらに削減余地。

## 2026-05-31 — 書き出しメモリ爆発の真因を修正（エンコーダ背圧）

### 実施内容
- 症状: フレーム供給を bounded 化してもなお、実書き出しでメモリが膨張し続ける。
- 真因: `videoExportPipeline.ts` のエンコーダ背圧が**実質無効**だった。
  - `if (encodeQueueSize > 10) await Promise.race([setTimeout(0), error])` は「1回だけイベントループに譲る」だけで、**キューが捌けるのを待っていなかった**。
  - 生成（プロバイダ＋Pixi描画）が HW エンコードより速いと、**エンコーダ内部キューに VideoFrame が無制限に積もる**（1枚 数MB〜十数MB × 数千枚 → 数十GB）。
- 修正: `encodeQueueSize > MAX_QUEUE(8)` の間、`dequeue` イベント（非対応時は短いポーリング）で**実際にキューが減るまで待つ**。`for await` が止まることで上流の生成も自然に停止し、全体が bounded に。
- 検証: 4K フレームを 600 枚「即時供給」しても `peakQueueSize=8`（上限内）に張り付くことをハーネスで確認（`EncodeResult.peakQueueSize` を追加）。

### 選定理由・判断の根拠
- 真の背圧は「キュー減少を待つ」こと。`setTimeout(0)` の単発譲りは供給を止められず無意味だった。`dequeue` イベントが正攻法、フォールバックの短ポーリングで環境差も吸収。
- MAX_QUEUE=8 はパイプライン段数として十分（スループット維持）かつメモリ上限（4K で ~96MB）の両立点。

### 残課題・次のステップ
- 実機（4K/長尺 HEVC・H.264）での書き出しでメモリが数百MB〜1GB台に収束することの最終確認。
- これまでの一連（decode背圧／0フレームfallback／encoder背圧）で供給・変換・エンコードの全段が bounded 化。

## 2026-05-31 — HEVC 実ファイルのメモリ爆発を修正（0フレーム時のフォールバック）

### 実施内容
- 症状: 実ファイル `IMG_3899.MOV`（iPhone HEVC, ~2GB）で書き出すと 9000 フレーム付近で ~60GB 消費。
- 計測（`createImageBitmap`/`VideoFrame` の生成・解放をカウントする診断）で判明:
  - この HEVC は **VideoDecoder 経路に乗るが 1 フレームも生成しない**（MP4Box デマックスの HEVC 問題）。
  - しかも `VideoFrameProvider.init()` が **0 フレームでも成功扱い**になり、再生方式へフォールバックしなかった。
  - 結果、実書き出しでは「空のプロバイダ」が居座り、毎フレーム `getFrame()`=null → 同期されない通常 Pixi 動画パスに落ち、フレーム蓄積で 60GB。
- 修正（`src/utils/videoFrameProvider.ts`）: `init()` は **1 枚も取得できなければ例外**を投げる。
  - → HEVC は確実に **再生方式(PlaybackFrameProvider)** へフォールバック。
- 検証: 再生方式で実ファイルを 1500 フレーム消費しても **未解放 ImageBitmap は 1〜2 枚・VideoFrame 0**（完全に bounded）、got=1500/1500・60fps相当。

### 選定理由・判断の根拠
- 「0 フレーム成功」は無言の不具合源。明示的に失敗させることで、useProjectExport の 3 段フォールバック（VideoDecoder→再生→シーク）が正しく機能する。
- 再生方式は元から maxBuffer=8 で bounded のため、フォールバックさえ効けばメモリは収束する（計測で確認）。

### 残課題・次のステップ
- 実機での 4K/長尺 HEVC 書き出しでメモリが数GB以内に収束することの体感確認。
- HEVC が VideoDecoder で 0 フレームになる根本（MP4Box の onSamples 不発）は未解明だが、再生方式で実用上は解決。

## 2026-05-30 — 書き出しのメモリ爆発を修正（背圧の追加）

### 実施内容
- 症状: 4K 60fps 5分の動画を書き出すとメモリを ~50GB 消費。
- 原因: `decodeVideoStream`（VideoDecoder 経路）に**背圧が無く**、`feedPromise` が全サンプルを一気に `decoder.decode()` へ流すため、デコード済み 4K VideoFrame（1枚 ~12MB）が `frameQueue` に**無制限に蓄積**していた（消費＝エンコードより圧倒的に速いため）。加えて mp4box の使用済みサンプルも未解放。
- 修正（`src/utils/videoDecodeStream.ts`）:
  - **背圧を追加**: `pendingCount = frameQueue + decodeQueueSize + backlog` が `HIGH_WATER(24)` を超えたら fetch 読み込み（=サンプル供給=デコード）を停止し、1 枚消費（yield）ごとに再開。
  - `releaseUsedSamples` で mp4box 保持の使用済みサンプルを解放。
  - 範囲外フレーム破棄時も供給を再開（`notifyDrain`）。
- 結果: 4K でもピークは「デコード待ち ≤24 枚 + 先読み数枚 + 出力 MP4 数百MB」≒ 約1GB に収束。

### 選定理由・判断の根拠
- 標準的な bounded-queue 背圧パターンを採用。HIGH_WATER=24 はスループット維持（常に先読みが在る）とメモリ上限（4K で ~288MB）の両立点。
- `PlaybackFrameProvider`（再生方式）は元から maxBuffer=8 で背圧済みのため変更不要。問題は VideoDecoder 経路のみ。

### 残課題・次のステップ
- 実機（4K 60fps 5分）で再書き出しし、メモリが収束することの体感確認。
- 出力 MP4 を全てメモリ保持（ArrayBufferTarget）している点は長尺・高ビットレートで効くため、将来はストリーミング書き出し（ファイルへ逐次 flush）も検討余地。

## 2026-05-30 — HEVC 高速書き出し: rVFC 再生方式プロバイダ追加

### 実施内容
- `PlaybackFrameProvider`（`src/utils/playbackFrameProvider.ts`）を新設。
  - HTMLVideoElement を「シークせず再生」し `requestVideoFrameCallback` で提示フレームを取得。
  - OS デコーダ依存なので VideoDecoder/MP4Box が扱えない HEVC 等でも動作。
  - `playbackRate` で高速化＋リングバッファ＋背圧（満杯で一時停止）。
- 共通インターフェース `FrameProvider`（`getFrame`/`close`）を導入し、`VideoFrameProvider` と `PlaybackFrameProvider` を多態化。
- `useProjectExport` を **3 段フォールバック**に変更：①VideoDecoder(最速) → ②再生方式(rVFC・HEVC対応) → ③シーク。
- 計測（HEVC 10000kbps, 30fps×2s 要求）で `playbackRate` を掃引し最適点を決定：
  - 1x: uniq 100% / 30fps、2x: **uniq 98% / 59fps**、3x: 68%、4x: 52%。
  - → 既定 `playbackRate=2`（98% カバレッジ・約2倍速）。

### 選定理由・判断の根拠
- HEVC は VideoDecoder で description 修正後もデマックス側でサンプルが取れずデコード不可だったため、コーデック非依存で確実な「OS 再生＋rVFC」方式を採用。
- `playbackRate=2`：高速化とフレーム落ち（カバレッジ低下）のトレードオフの最良点。3x 以上は欠落フレームが増え書き出しがカクつくため不採用。
- 3 段フォールバックで H.264 は最速(VideoDecoder)、HEVC は再生方式、非対応のみシークと、回帰なく最大速度を選べる。

### 残課題・次のステップ
- 実プロジェクト（実 GoPro HEVC）での体感・画質確認（`npm run dev` → 動画出力）。
- 高 `playbackRate` でのフレーム落ちはソース fps 依存。必要なら適応制御（落ち検出で減速）。
- moov 末尾配置の大容量 H.264 は VideoDecoder 起動が遅く再生方式へ流れる（許容）。

## 2026-05-30 — 書き出し高速化: 全動画を VideoDecoder 経路へ（プロキシ不要化）

### 実施内容
- 書き出しボトルネックを計測ハーネスで定量化（`exportTestHarness.ts` にフェーズ別内訳・ソース直接デコード可否テストを追加）。
  - 結論: ボトルネックは **`HTMLVideoElement.currentTime` シーク = 100ms/フレーム**。コピー/読み戻し/Pixi 合成は 4K でも合計 <4ms と無視できる。
  - H.264(faststart) はソース直接 VideoDecoder で **731fps相当・起動218ms**。HEVC は VideoDecoder 無反応（6s でも 0 フレーム）。
- `useProjectExport` の経路選択を変更：
  - 順方向クリップは「プロキシがあればプロキシ、無ければ**ソースを直接** VideoDecoder デコード」を試行。
  - 初期化が 5s でタイムアウト/失敗した場合のみ従来のシーク方式へフォールバック（HEVC・moov 末尾配置・不正コンテナを安全に退避）。
  - → **H.264 の元動画はプロキシ生成なしで高速エンコード可能に**（9fps → encode 律速の数十fps）。

### 選定理由・判断の根拠
- PixiJS 撤廃・copy-chain 改修は不要と計測で判断：FHD/4K いずれもコピーは実質タダで、遅さの実体はシークだったため。最小変更で目標（重い動画 20〜40fps）に到達できる経路選択変更を採用。
- フォールバックを残す設計：HEVC 直接デコードが現状不可のため、回帰ゼロを最優先。タイムアウト 5s は faststart H.264 の起動(~0.2s)に十分な余裕かつ HEVC 退避を過度に遅延させない値。

### HEVC 調査の結果（追記）
- HEVC HW デコードは Electron で **利用可能**（`isConfigSupported`=supported）。
- 旧バグ: `sample.description` が HEVC で空 → `hvcC` が取れず description 無しで configure → デコーダ無反応。
  → **stsd の sample entry から抽出するよう修正**（`extractDescriptionFromTrack`）。AV1(av1C) も対応。
- ただしテストサンプル `10000kbps_60fps.mp4` では **MP4Box の onSamples が発火せず**（サンプル取り出し0件）、デマックス側に別問題が残る。fMP4 等サンプル特有の可能性があり、ユーザー実機の GoPro HEVC で要再検証。

### 残課題・次のステップ
- **HEVC を確実に無プロキシ高速化する本命案**: HTMLVideoElement の逐次再生（シークなし）＋ `requestVideoFrameCallback`＋ `playbackRate` でフレーム取得する provider。OS デコーダを使うためコーデック非依存で MP4Box 問題を回避できる。
- まずユーザー実機 HEVC で「description 修正だけで速くなるか」を確認するのが安価。
- moov 末尾配置の大容量 H.264 は起動が遅くフォールバック → range 取得 or 軽量 faststart remux の自動化が候補。
- 実プロジェクトでの体感確認（`npm run dev` → 動画出力）は未実施。

## 2026-05-29 — ブラウザでの実機確認とリサイズハンドルの視認性修正

### 実施内容
- レンダラのみをブラウザで起動する preview 設定（`.claude/launch.json`、`VITEST=true` で electron プラグインを無効化）を追加し、computer use で動作確認。
  - リサイズ: 右下ハンドルのドラッグで scaleX/scaleY が 1→2、左上アンカーが固定されることを実機確認。
  - ドラッグ移動のズレ修正: カメラ zoom=2 で本体をドラッグし、移動量が `Δclient/(displayScale*zoom)`（=68px）と一致、旧バグ値（135px）でないことを確認。
  - 書き出しモーダル: 準備中／描画中（フレーム N/総数・%）／キャンセル中の各表示とキャンセルボタン動作を確認。
- リサイズハンドルの見かけサイズ補正に `displayScale` を加味（約 3.7px → 約 10px）。プレビュー縮小時でも掴みやすいサイズに。

### 選定理由・判断の根拠
- ハンドルサイズの補正に displayScale を含める: スクリーン上の実ピクセルサイズは `local * objScale * cameraZoom * displayScale` で決まるため、一定の見かけサイズにするには displayScale も割る必要がある。`renderScene` の依存を増やさないよう ref 経由で参照。

## 2026-05-29 — 動画書き出しの進捗モーダルとキャンセル機能

### 実施内容
- 書き出し中に進捗を表示するモーダル `ExportProgressModal` を追加（App 直下にマウント）。
  - フェーズ表示（準備中 / 描画中 / 保存中 / キャンセル中）。
  - 描画中は「フレーム N / 総数」と % を確定プログレスバーで表示。それ以外は不確定バー。
  - キャンセルボタンを設置。
- store に書き出し進捗・キャンセル要求の状態を追加（TDD）。
  - `exportProgress`（phase / currentFrame / totalFrames）, `exportCancelRequested`。
  - アクション: `setExportProgress`, `requestExportCancel`。`setExporting` で開始時に初期化・終了時にクリア。
- `useProjectExport` を進捗報告・キャンセル対応に更新。
  - フレームループで約 10 回/秒に間引いて進捗を更新。
  - キャンセル要求（または effect クリーンアップ）を `isCancelled()` で監視し、ループ中断・保存スキップ・完了/失敗アラート抑制を行う。

### 選定理由・判断の根拠
- キャンセルを `isExporting=false` ではなく専用フラグ `exportCancelRequested` で行う方針: エンコード処理を中断し保存をスキップした上で `finally` が後始末してから `isExporting` を落とす、という安全な収束順序を保つため。即座に `isExporting` を落とすとモーダルが消え、進行中処理との状態不整合が生じる。
- 進捗更新を間引く: フレーム毎の store 更新は React 再レンダリングを多発させ書き出しを遅くするため、約 10 回/秒に制限。
- 状態を store に置く理由: 書き出しは `useProjectExport`（Viewport 配下）で走るが、モーダルは App 直下に置きたく、コンポーネント間で状態共有が必要なため。

### 残課題・次のステップ
- 現状キャンセルはフレームループ／保存前の境界で反映される。エンコーダ内部処理が長い場合は反映に多少の遅延がある。

## 2026-05-29 — 要素の角リサイズ機能とドラッグ移動ズレの修正

### 実施内容
- 選択中の要素の四隅にリサイズハンドルを表示し、ドラッグで拡縮できる機能を実装。
  - 掴んだ角の対角（アンカー）を固定したまま `scaleX` / `scaleY` を変更する挙動。
  - コンテナの回転にも対応（ローカル軸へ逆回転して拡縮量を算出）。
  - ハンドルはカメラズーム・要素スケールに依らず見かけ一定サイズ（約 10px）になるよう補正。
- リサイズ計算ロジックを純粋関数 `src/utils/transformGeometry.ts` に分離し、TDD で実装（`transformGeometry.test.ts`）。
- 要素のドラッグ移動がカメラズーム時にズレる不具合を修正。
  - 従来は global 座標の差分をそのまま `obj.x/y` に加算していたため、ズーム倍率分ズレていた。
  - コンテナの親空間（`parent.toLocal`）で差分を取るよう変更し、ズーム・回転・ネストを正しく加味。
- 3D ステージのビルボード抽出からリサイズハンドルを除外。

### 選定理由・判断の根拠
- 拡縮を `width/height` ではなく `scaleX/scaleY` で行う方針: text を含む全オブジェクト型で `width/height` を持つとは限らず、`scaleX/scaleY` は `BaseObject` 共通プロパティのため汎用的に扱えるため。
- 幾何計算を PixiJS 非依存の純粋関数へ分離: TDD でアンカー固定・回転対応の数式を単体検証できるようにするため。
- ドラッグ差分を親空間で取る方式: カメラ変換（zoom/rotation/pan）をコンテナ階層から自動的に反映でき、store のカメラ値を個別に持ち込むより堅牢なため。

### 残課題・次のステップ
- グループ所属・キーフレーム/モーションパス・振動オフセットを持つ要素のリサイズは、`obj.x/y` とコンテナ実位置がずれるためアンカー固定が完全でない（静的要素では正確）。必要なら別途対応。

## 2026-06-18 — export encodeをRust native render shared-frame経路へ接続

### 実施内容
- `prepareSharedRendererViewportNativeRenderSources` を追加し、`decode.requestFrame` の結果をJS copy-outせず、native render用の `SharedFrame` descriptorとして保持する経路をTDDで実装した。
- `sharedRendererExportFrameSource` の `renderEncodeFrame` 先頭で、動画sceneの場合に `render.nativeSharedFrame` を呼び、返却されたrender output descriptorを `RustBackendVideoEncodeWriteFramePayload` としてRust encoderへ渡すようにした。
- native renderが成功した場合は、WebGPU presenter、`readPresentedFrameRgbaBytes`、JS shared-frame writerを呼ばない契約を追加した。
- 動画decode requestがないsceneでは従来のpresenter/readback fallbackを維持し、native render準備またはRPC失敗は `nativeRenderFailed` としてfail-loudにした。

### 検証
- `npm test -- src/utils/sharedRendererViewportNativeRenderSource.test.ts`
- `npm test -- src/utils/sharedRendererExportFrameSource.test.ts src/utils/sharedRendererViewportNativeRenderSource.test.ts`
- 対象ファイルに絞った `npx tsc --noEmit` エラー確認。

### 残課題・次のステップ
- native render output ringのencode後解放は次項で追加済み。encodeを通らないpreview/native render output向けには別途明示release契約が必要。
- native rendererは全clip sourceを要求するため、SolidColour等をRust backend側でsource化し、動画以外を含むsceneでも完全にPixi/WebGPU presenterへ戻らないようにする。

## 2026-06-18 — native render output ringのencode後解放を実装

### 実施内容
- `encode.writeFrame` が `render.nativeSharedFrame` のoutput descriptorを消費した後、backend stateの `native_render_outputs` から対応 `memoryId` を削除するようにした。
- owner `PosixSharedRing` のdropによりPOSIX shared memoryがunlinkされ、frameごとのnative render output ringがexport中に残り続けない契約を追加した。
- `encode_write_frame_unlinks_native_render_output_after_consuming_it` を追加し、encode後に同じ `memoryId` へ再attachできないことを検証した。

### 検証
- `cargo test --manifest-path rust-backend/Cargo.toml encode_write_frame_unlinks_native_render_output_after_consuming_it`
- `cargo test --manifest-path rust-backend/Cargo.toml native_render_shared_frame_consumes_source_shm_and_returns_descriptor_only`
- `cargo test --manifest-path rust-backend/Cargo.toml encode_shared_frame_session_tracks_descriptor_without_legacy_base64_fallback`

### 残課題・次のステップ
- encodeを通らないpreview/native render output向けには、別途明示release RPCまたはowner lifecycle policyが必要。
- SolidColour source化は次項で追加済み。Image/PSD/textなど、残るmedia種別は引き続きRust source化またはfail-loud境界が必要。

## 2026-06-18 — SolidColourをRust native render sourceへ統合

### 実施内容
- native-wgpu renderer / reference rendererのidentity transform時source size一致要求を外し、小さいsourceをcanvas左上へ部分配置できるようにした。
- `render.nativeSharedFrame` payloadに `media` を追加し、renderer export sourceから `surfaceGate.media` をRust backendへ渡すようにした。
- Rust backendで `kind=SolidColour` / `source=#rrggbb` のmediaをRGBA frameへ変換し、動画shared-frame sourceと同じnative render sourcesへ合流させた。
- 動画source＋SolidColour mediaを含むexport native render payloadの契約をTDDで追加した。

### 検証
- `cargo test --manifest-path native-wgpu-renderer/Cargo.toml --test native_reference_parity`
- `cargo test --manifest-path native-wgpu-renderer/Cargo.toml --test shared_frame_output --test shm_decoded_frame_render`
- `cargo test --manifest-path rust-backend/Cargo.toml native_render_shared_frame_builds_solid_colour_sources_from_media`
- `npm test -- src/utils/sharedRendererExportFrameSource.test.ts src/utils/rustBackendNativeRenderControl.test.ts src/utils/rustBackendNativeRenderBoundary.test.ts`
- 対象ファイルに絞った `npx tsc --noEmit` エラー確認。

### 残課題・次のステップ
- Image/PSD/textなど、まだRust source化していないmedia種別はnative renderでfail-loudになる。
- SolidColourのグラデーション、円、丸角、rotationなどは既存shared renderer境界と同様に未対応。

## 2026-06-18 — PNG Image mediaをRust native render sourceへ統合

### 実施内容
- `render.nativeSharedFrame` が `kind=Image` のmediaをPNGとして読み込み、RGBA frameへ変換してnative render sourcesへ合流させるようにした。
- PNGのdecoded dimensionsとmediaに宣言された `width` / `height` が一致しない場合はRust backend側でfail-loudにした。
- Image media source化のTDD契約として、PNG sourceのみでnative render output descriptorを返し、control planeへframe bytesを返さないテストを追加した。
- 同じ `mediaId` がmedia由来sourceとshared-frame sourceの両方に現れた場合、無言上書きせず `-32602` で拒否するようにした。
- shared memory名のテスト用生成を、時刻下位bitだけでなく全nanosと単調カウンタを使う形にして連続実行時の衝突を避けた。
- 版を `0.1.1-Beta-98b` に更新した。

### 検証
- `cargo test --manifest-path rust-backend/Cargo.toml native_render_shared_frame_builds_png_image_sources_from_media`
- `cargo test --manifest-path rust-backend/Cargo.toml native_render_shared_frame_rejects_duplicate_media_and_shared_sources`
- `cargo test --manifest-path rust-backend/Cargo.toml native_render_shared_frame`
- `cargo test --manifest-path rust-backend/Cargo.toml encode_write_frame_unlinks_native_render_output_after_consuming_it`

### 残課題・次のステップ
- JPG/PSD/textなど、PNG以外の静止素材はまだRust source化していない。
- Video mediaそのものをRust decode requestなしでmedia sourceから解決する経路は未実装。次はRust backendが `Image` 以外のmedia source可用性をcapabilityとして返すか、動画media sourceのdecode/session lifecycleをnative render側へ統合する。

## 2026-06-18 — PNG Image上位でもvideo cutoverを維持

### 実施内容
- `buildSharedRendererVideoCutoverStackSafety` で、動画clipより上にあるPNG `Image` mediaをshared renderer/Rust native render対応済みとして扱うようにした。
- 未対応画像形式（例: JPG）は引き続き `pixiOnlyObjectAboveVideo` として動画cutoverを止める契約を追加した。
- 動画＋PNG Image＋SolidColourの積層sceneがPixiへ戻らず、Rust native render/export経路へ進めるようにした。
- 版を `0.1.1-Beta-99a` に更新した。

### 検証
- `npm test -- src/utils/sharedRendererVideoCutoverStack.test.ts`
- `npm test -- src/utils/sharedRendererVideoCutoverStack.test.ts src/utils/sharedRendererVideoOwnership.test.ts src/utils/sharedRendererExportFrameSource.test.ts src/utils/sharedRendererViewportNativeRenderSource.test.ts`
- 対象ファイルに絞った `npx tsc --noEmit` エラー確認。

### 残課題・次のステップ
- PNG判定はsource拡張子ベース。Rust backend側は実際のPNG decodeで最終検証するが、将来はcapability共有またはsource sniffingでより正確にする。
- JPG/PSD/textなどの上位clipはまだvideo cutoverを止めるため、Rust source化対象として順次追加する。

## 2026-06-18 — media-only exportをRust native renderへ接続

### 実施内容
- export `renderEncodeFrame` が `noVideoDecodeRequest` を受けた場合でも、surfaceGate内のvisible clipが `SolidColour` / PNG `Image` だけなら `render.nativeSharedFrame` を `sources: []` で呼ぶようにした。
- Electron native render bridgeが無い環境、空scene、未対応画像形式を含むsceneでは従来どおりWebGPU presenter/readback fallbackを維持するcapability判定を追加した。
- media-only PNG＋SolidColour exportがpresenter/readback/JS shared-frame writerを使わない契約をTDDで追加した。
- 版を `0.1.1-Beta-100a` に更新した。

### 検証
- `npm test -- src/utils/sharedRendererExportFrameSource.test.ts`
- `npm test -- src/utils/sharedRendererExportFrameSource.test.ts src/utils/sharedRendererViewportNativeRenderSource.test.ts src/utils/rustBackendNativeRenderControl.test.ts`
- 対象ファイルに絞った `npx tsc --noEmit` エラー確認。

### 残課題・次のステップ
- PNG判定はまだ拡張子ベース。Rust backend decodeとTS capabilityの共有化が必要。
- previewはmedia-only native render outputの明示release lifecycleをまだ持っていない。export encode経路ではencode後解放済み。

## 2026-06-18 — native media support判定を共通化

### 実施内容
- `sharedRendererNativeMediaSupport` を追加し、Rust native renderでsource化できるmedia判定を共通化した。
- export media-only native render判定とvideo cutover stack safetyのPNG/SolidColour判定を同じhelperへ寄せた。
- JPG/PSD/text追加時に、cutover側とexport側の対応範囲がズレるリスクを下げた。

### 検証
- `npm test -- src/utils/sharedRendererNativeMediaSupport.test.ts`
- `npm test -- src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/sharedRendererVideoCutoverStack.test.ts src/utils/sharedRendererExportFrameSource.test.ts src/utils/sharedRendererViewportNativeRenderSource.test.ts`
- 対象ファイルに絞った `npx tsc --noEmit` エラー確認。

### 残課題・次のステップ
- helperの画像対応はPNG/JPG/JPEGになった。次はPSD/textまたはpreview native render output releaseへ進む。

## 2026-06-18 — JPG/JPEG Image mediaをRust native render sourceへ統合

### 実施内容
- `golden-harness` に `jpeg-decoder` を追加し、JPEGをRGBA frameへ展開する `load_rgba_jpeg` を実装した。
- Rust backendの `render.nativeSharedFrame` が `.jpg` / `.jpeg` の `Image` mediaをRGBA source化できるようにした。
- TS側の `sharedRendererNativeMediaSupport` をPNG/JPG/JPEG対応へ広げ、video cutover stack safetyとmedia-only exportでJPGをRust対応済みとして扱うようにした。
- 版を `0.1.1-Beta-101a` に更新した。

### 検証
- `cargo test --manifest-path golden-harness/Cargo.toml`
- `cargo test --manifest-path rust-backend/Cargo.toml native_render_shared_frame_builds_jpeg_image_sources_from_media`
- `cargo test --manifest-path rust-backend/Cargo.toml native_render_shared_frame`
- `npm test -- src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/sharedRendererVideoCutoverStack.test.ts src/utils/sharedRendererExportFrameSource.test.ts src/utils/sharedRendererViewportNativeRenderSource.test.ts`
- 対象ファイルに絞った `npx tsc --noEmit` エラー確認。

### 残課題・次のステップ
- JPEGはlossyなので、pixel exactな比較ではなく近似色契約で検証している。
- PSD/textはまだRust native render source化していない。

## 2026-06-18 — native render output明示release RPCを追加

### 実施内容
- Rust backendに `render.releaseNativeSharedFrame` を追加し、`render.nativeSharedFrame` が保持したoutput ringをencodeに渡さず解放できるようにした。
- Electron main/preloadとrenderer controlに `releaseNativeSharedFrame` bridgeを追加した。
- preview/診断用途のnative render outputがbackend stateに残り続けないlifecycleをTDDで固定した。
- Rust direct encode runnerで `encode.writeFrame` が失敗した場合、未消費のnative render output `memoryId` をreleaseするfallbackを追加した。
- 版を `0.1.1-Beta-102b` に更新した。

### 検証
- `cargo test --manifest-path rust-backend/Cargo.toml native_render_release_shared_frame_unlinks_output_without_encode`
- `cargo test --manifest-path rust-backend/Cargo.toml native_render_shared_frame`
- `npm test -- src/utils/rustBackendNativeRenderControl.test.ts src/utils/rustBackendNativeRenderBoundary.test.ts`
- `npm test -- src/utils/rustBackendVideoEncodeExport.test.ts src/utils/rustBackendNativeRenderControl.test.ts src/utils/rustBackendNativeRenderBoundary.test.ts`
- 対象ファイルに絞った `npx tsc --noEmit` エラー確認。

### 残課題・次のステップ
- preview側の実フローでnative render outputを生成・表示・disposeする配線はまだ未実装。
- PSD/textなど未対応mediaは引き続きRust source化が必要。

## 2026-06-18 — file URL画像sourceをRust native renderへ接続

### 実施内容
- TS側の `sharedRendererNativeMediaSupport` が、ローカルパスと `file://` / `file://localhost/` のPNG/JPG/JPEGだけをRust native render対応として扱うようにした。
- query/hash付きのfile URLでも拡張子判定が崩れないようにし、HTTPなどの非ローカルURLはRust同期ファイル読み込み経路へ渡さない契約を追加した。
- Rust backendのImage media loaderが `file://` URLからquery/hashを除去し、percent encodingを実ファイルパスへ戻してからPNG/JPEGをdecodeするようにした。
- 版を `0.1.1-Beta-103a` に更新した。

### 検証
- `npm test -- src/utils/sharedRendererNativeMediaSupport.test.ts`
- `npm test -- src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/sharedRendererVideoCutoverStack.test.ts src/utils/sharedRendererExportFrameSource.test.ts`
- `cargo test --manifest-path rust-backend/Cargo.toml native_render_shared_frame_builds_file_url_png_image_sources_from_media`
- `cargo test --manifest-path rust-backend/Cargo.toml --test decode_control_plane native_render_shared_frame_builds`
- 対象ファイルに絞った `npx tsc --noEmit` エラー確認。

### 残課題・次のステップ
- Rust backend側でもHTTP/blob/dataなどのImage media sourceをdecode前に明示拒否するfail-loud契約を追加すると、TS判定との差分に強くなる。
- preview側でnative render outputを実際に表示し、dispose時に `render.releaseNativeSharedFrame` を呼ぶ最小縦スライスへ進める。

## 2026-06-18 — remote画像sourceをRust native render decode前に拒否

### 実施内容
- TS側のnative media support契約に `blob:` / `data:` sourceをRust対応外として固定するassertionを追加した。
- Rust backendのImage media source正規化で、`https:` など `file:` 以外のURL schemeをPNG/JPEG decode前に明示拒否するようにした。
- Windowsドライブ文字はURL schemeとして誤判定しないようにし、ローカルパスとfile URLの既存経路は維持した。
- 版を `0.1.1-Beta-103b` に更新した。

### 検証
- `cargo test --manifest-path rust-backend/Cargo.toml native_render_shared_frame_rejects_remote_image_media_source_before_decode`
- `cargo test --manifest-path rust-backend/Cargo.toml --test decode_control_plane native_render_shared_frame`
- `npm test -- src/utils/sharedRendererNativeMediaSupport.test.ts`
- `npm test -- src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/sharedRendererVideoCutoverStack.test.ts src/utils/sharedRendererExportFrameSource.test.ts`
- 対象ファイルに絞った `npx tsc --noEmit` エラー確認。

### 残課題・次のステップ
- 次はpreview側でnative render outputを生成・表示・releaseする最小縦スライスへ進む。
- PSD/textは引き続きPixi側の大きな残り境界として扱う。

## 2026-06-18 — preview native render frame表示入口を追加

### 実施内容
- `startSharedRendererPreviewPresenter` に `sharedRendererNativeRenderFrameUpload` 入力を追加し、Rust native render output相当のRGBA shared frameをpreviewへ渡せる入口を作った。
- WebGPU presenterに `presentNativeRenderFrame` を追加し、uploaded textureを動画planeではなくcanvas全面へ描画するfullscreen passを実装した。
- native render frame表示後、GPU queue完了を待ってrelease callbackを呼ぶ契約を追加した。
- presenter diagnosticsに `native-render-frame` / `uxfdSharedRendererPresenterNativeRenderFrameReady` を追加した。
- 版を `0.1.1-Beta-104a` に更新した。

### 検証
- `npm test -- src/utils/sharedRendererPreviewPresenterController.test.ts`
- `npm test -- src/utils/sharedRendererPreviewPresenterController.test.ts src/utils/sharedRendererExportFrameSource.test.ts src/utils/sharedVideoFrameUploadBridge.test.ts`
- 対象ファイルに絞った `npx tsc --noEmit` エラー確認。

### 残課題・次のステップ
- 次はpreview orchestrationから `render.nativeSharedFrame` を呼び、返ってきたoutput descriptorをshared memory copy bridge経由でこの入口へ流す。
- native render frame upload失敗時のPixi fallback / release policyを、実接続時の失敗理由に合わせてさらに細分化する。

## 2026-06-18 — preview native render resultをViewport表示へ接続

### 実施内容
- `prepareSharedRendererViewportNativeRenderUpload` を追加し、preview sessionからRust native render payloadを作って `render.nativeSharedFrame` を呼べるようにした。
- native render output descriptorをshared memory copy bridgeでrenderer upload bufferへ移し、`sharedRendererNativeRenderFrameUpload` としてpreview presenterへ渡す経路を追加した。
- media-only sceneでは `SolidColour` / PNG/JPG/JPEG `Image` のRust生成可能mediaだけを `sources: []` でnative renderするようにした。
- native render outputはGPU upload完了・upload abort・copy失敗のいずれでも `render.releaseNativeSharedFrame` へ到達するrelease callbackを持つようにした。
- native render previewが成功した場合は従来のper-video preview uploadをスキップし、Rust native render済みの最終合成frameを優先するようにした。
- `Viewport` から video cutover有効時にnative render preview pathを有効化した。
- 版を `0.1.1-Beta-105a` に更新した。

### 検証
- `npm test -- src/utils/sharedRendererViewportNativeRenderUpload.test.ts`
- `npm test -- src/utils/sharedRendererViewportPresenterOrchestration.test.ts`
- `npm test -- src/utils/sharedRendererViewportNativeRenderUpload.test.ts src/utils/sharedRendererViewportPresenterOrchestration.test.ts src/utils/sharedRendererPreviewPresenterController.test.ts src/utils/sharedRendererViewportNativeRenderSource.test.ts src/utils/sharedRendererExportFrameSource.test.ts`
- 対象ファイルに絞った `npx tsc --noEmit` エラー確認。

### 残課題・次のステップ
- 実機previewでnative render frame pathが有効化された際のdataset診断とPixi cleanup挙動を確認する。
- native render preview失敗時のreasonをdatasetへより細かく出し、どの境界でPixiへ戻ったかを見える化する。
- PSD/textなど、Rust native render source化されていない素材は引き続きPixi fallbackの主因として残る。

## 2026-06-18 — native render preview成功時にownershipを移管

### 実施内容
- native render frame表示成功時に、scene内の `Video` clipを `videoOwnership.owner=sharedRenderer` として公開するようにした。
- 同じく `SolidColour` clipを `solidColourOwnership.owner=sharedRenderer` として公開するようにした。
- ownership reasonに `nativeRenderFrameReady` を追加し、dataset diagnosticsでRust native render frame由来のcutoverを識別できるようにした。
- これにより `Viewport` の既存Pixi cleanup hookがnative render済みvideo/shapeをPixi側から外せるようになり、二重合成リスクを下げた。
- 版を `0.1.1-Beta-106a` に更新した。

### 検証
- `npm test -- src/utils/sharedRendererPreviewPresenterController.test.ts`
- `npm test -- src/utils/sharedRendererPreviewPresenterController.test.ts src/utils/sharedRendererViewportPresenterOrchestration.test.ts src/utils/sharedRendererViewportNativeRenderUpload.test.ts src/utils/pixiVideoCutover.test.ts src/utils/pixiSolidColourCutover.test.ts src/utils/sharedRendererVideoOwnership.test.ts src/utils/sharedRendererSolidColourOwnership.test.ts`
- 対象ファイルに絞った `npx tsc --noEmit` エラー確認。

### 残課題・次のステップ
- `Image` clipにはまだPixi ownership cleanup機構がないため、PNG/JPG/JPEG画像のpreview二重合成を防ぐ専用ownershipを追加する必要がある。
- native render preview失敗時のreasonをdatasetへより細かく出し、Rust native renderへ進めなかった理由を可視化する。

## 2026-06-18 — native render preview成功時にImage ownershipを移管

### 実施内容
- `SharedRendererImageOwnership` を追加し、native render frame成功時に `Image` clipをshared renderer ownershipとして公開するようにした。
- presenter diagnosticsに image owner / reason / count を追加し、datasetからImage cutover状態を確認できるようにした。
- `Viewport` に `sharedRendererImageObjectIds` refと更新処理を追加し、Pixi render helperへ渡すようにした。
- Pixi image branchにshared renderer owned imageのcleanupを追加し、spriteを外してhitAreaだけ残すようにした。
- `pixiImageCutover` helperを追加し、export中は従来通りPixi image描画を維持する契約を固定した。
- 版を `0.1.1-Beta-107a` に更新した。

### 検証
- `npm test -- src/utils/pixiImageCutover.test.ts`
- `npm test -- src/utils/sharedRendererPreviewPresenterController.test.ts`
- `npm test -- src/utils/pixiImageCutover.test.ts src/utils/pixiVideoCutover.test.ts src/utils/pixiSolidColourCutover.test.ts src/utils/sharedRendererPreviewPresenterController.test.ts src/utils/sharedRendererViewportPresenterOrchestration.test.ts src/utils/sharedRendererViewportNativeRenderUpload.test.ts src/utils/sharedRendererExportFrameSource.test.ts`
- 対象ファイルに絞った `npx tsc --noEmit` エラー確認。

### 残課題・次のステップ
- PSD/textはまだnative render source化・ownership移管されていないため、Pixi fallbackの主因として残る。
- native render preview失敗時のreasonをdatasetへより細かく出し、Rust native renderへ進めなかった理由を可視化する。

## 2026-06-18 — native render preview失敗理由をdataset診断へ接続

### 実施内容
- preview orchestrationがnative render upload失敗を受けた場合、`reason` / `detail` を `sharedRendererNativeRenderFailure` としてpreview presenterへ渡すようにした。
- presenter diagnosticsに `uxfdSharedRendererPresenterNativeRenderFailureReason` / `uxfdSharedRendererPresenterNativeRenderFailureDetail` を追加した。
- Pixi/per-video fallbackでready表示を継続しながら、Rust native render previewへ進めなかった理由をdataset上で追えるようにした。
- 版を `0.1.1-Beta-108a` に更新した。

### 検証
- `npm test -- src/utils/sharedRendererViewportPresenterOrchestration.test.ts src/utils/sharedRendererPresenterDiagnostics.test.ts src/utils/sharedRendererPreviewPresenterController.test.ts`
- 対象ファイルに絞った `npx tsc --noEmit` エラー確認。

### 残課題・次のステップ
- PSD/textはまだnative render source化・ownership移管されていないため、Pixi fallbackの主因として残る。
- 実機previewでdataset診断を確認し、Rust native render失敗理由がGoPro素材や未対応mediaで読み取れるか検証する。

## 2026-06-18 — native render preview診断のレビュー指摘を反映

### 実施内容
- サブエージェント Jason の軽量レビューを受け、Rust native render outputのWebGPU texture upload失敗時にも `uxfdSharedRendererPresenterNativeRenderFailureReason` / `Detail` を出すようにした。
- native render準備失敗後に単体video uploadへfallbackする場合、native render準備で更新されたactive decode jobを引き継ぐようにした。
- native render upload失敗診断とfallback active job継承の回帰テストを追加した。
- 版を `0.1.1-Beta-108b` に更新した。

### 検証
- `npm test -- src/utils/sharedRendererPreviewPresenterController.test.ts src/utils/sharedRendererViewportPresenterOrchestration.test.ts src/utils/sharedRendererPresenterDiagnostics.test.ts`
- 対象ファイルに絞った `npx tsc --noEmit` エラー確認。

### 残課題・次のステップ
- `requireSharedRendererVideo` のfail-loud fallback時は主reasonが `requiredVideoOwnershipUnavailable` になるため、必要ならnative render failure detailをfallback診断にも保持する。
- PSD/textはまだnative render source化・ownership移管されていないため、Pixi fallbackの主因として残る。

## 2026-06-18 — fail-loud fallbackでもnative render診断を保持

### 実施内容
- `writeSharedRendererPresenterDiagnostics` のfallback状態に `nativeRenderFailureReason` / `nativeRenderFailureDetail` を追加した。
- `requireSharedRendererVideo` が `requiredVideoOwnershipUnavailable` でfail-loudする場合も、native render previewが先に失敗していた理由をdatasetへ残すようにした。
- fail-loud fallback時にnative render失敗理由が消えない契約をTDDで追加した。
- 版を `0.1.1-Beta-108c` に更新した。

### 検証
- `npm test -- src/utils/sharedRendererPresenterDiagnostics.test.ts src/utils/sharedRendererPreviewPresenterController.test.ts src/utils/sharedRendererViewportPresenterOrchestration.test.ts`
- 対象ファイルに絞った `npx tsc --noEmit` エラー確認。

### 残課題・次のステップ
- PSD/textはまだnative render source化・ownership移管されていないため、Pixi fallbackの主因として残る。
- 次はPSD/textのどちらをRust native render sourceとして扱えるか、既存のRust PSD parserとtext rasterise方針を分けて詰める。

## 2026-06-18 — PSD media kindをRust境界へ追加

### 実施内容
- `RustSceneMediaReference` / rust-core `MediaKind` / boundary validatorに `Psd` を追加した。
- `buildRustSceneSnapshotForTimeline` がPSD objectを `kind=Psd` のmedia referenceとして出せるようにした。
- rust-backendのnative render media matchは、source生成未実装の `Psd` を `Video` と同じくmedia内生成対象から外すようにした。
- 版を `0.1.1-Beta-109a` に更新した。

### 検証
- `npm test -- src/utils/rustSceneSnapshot.test.ts src/utils/rustSceneSnapshotBoundary.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts`
- `cargo test --manifest-path rust-core/Cargo.toml --test media_schema`
- `cargo test --manifest-path rust-backend/Cargo.toml --test decode_control_plane`
- 対象ファイルに絞った `npx tsc --noEmit` エラー確認。

### 残課題・次のステップ
- PSD native source生成はまだ未実装のため、`sharedRendererNativeMediaSupport` はPsdをunsupportedとして扱う。
- 次はPSD `activeLayerIds` / `rootLayer` 相当をRust backendへ渡すschemaを決め、`psd_fast` から1枚のRGBA source frameを生成する。

## 2026-06-18 — PSD visible layerをRust backend内でRGBA合成

### 実施内容
- `psd_fast` に `composite_visible_psd_layers` を追加し、visibleなleaf layerをbottom-to-topで透明キャンバスへsource-over合成できるようにした。
- group layer / invisible layer / rgbaなしlayerを合成対象から外す契約を追加した。
- 半透明front layerが背面layerへ合成されるpixel結果をRust単体テストで固定した。
- 版を `0.1.1-Beta-110a` に更新した。

### 検証
- `cargo test --manifest-path rust-backend/Cargo.toml psd_fast::tests::composite_visible_psd_layers_draws_leaf_layers_from_bottom_to_top`

### 残課題・次のステップ
- `composite_visible_psd_layers` はまだ `render.nativeSharedFrame` から使っていないため、次に `MediaKind::Psd` のsource生成へ接続する。
- activeLayerIds / rootLayer対応は未接続のため、最初はPSDファイル内のvisible状態に基づく合成として扱う。

## 2026-06-18 — PSD mediaをRust native render sourceへ接続

### 実施内容
- `render.nativeSharedFrame` が `MediaKind::Psd` mediaを受け取った場合、PSDを読み込んで合成済みRGBA source frameとしてnative render sourcesへ渡すようにした。
- PSD sourceはImageと同じlocal path / file URL gateを使い、remote URLを誤ってRust backendで読む設計にしないようにした。
- PSD寸法がmedia referenceと一致しない場合はfail-loudにするようにした。
- backend integration test用に最小single-layer PSD fixture生成helperを追加し、`sources: []` のPSD media-only native renderが成功する契約を固定した。
- 版を `0.1.1-Beta-111a` に更新した。

### 検証
- `cargo test --manifest-path rust-backend/Cargo.toml native_render_shared_frame_builds_psd_sources_from_media`
- `cargo test --manifest-path rust-backend/Cargo.toml psd_fast::tests::composite_visible_psd_layers_draws_leaf_layers_from_bottom_to_top`
- `cargo test --manifest-path rust-backend/Cargo.toml --test decode_control_plane`

### 残課題・次のステップ
- TS側 `sharedRendererNativeMediaSupport` はまだPsdをunsupportedとして扱うため、preview/export capabilityへPSD対応を公開する必要がある。
- UI側 `activeLayerIds` / `rootLayer` をRust backendのPSD合成へ渡すschemaは未実装。

## 2026-06-18 — native render preview成功時にPSD ownershipを移管

### 実施内容
- native render preview frame成功時にPSD clipをshared renderer ownershipとして公開する `SharedRendererPsdOwnership` を追加した。
- presenter diagnosticsへ `uxfdSharedRendererPresenterPsdOwner` / `PsdCutoverReason` / `SharedPsdObjectCount` を追加した。
- `Viewport` がPSD ownership idをPixi render helperへ渡し、該当PSDのPixi描画をcleanupしてhitAreaだけ残すようにした。
- Pixi PSD cutover helperを追加し、previewでは二重描画を避けつつ、exportでは従来のPixi PSD描画を維持する契約を固定した。
- 版を `0.1.1-Beta-112a` に更新した。

### 検証
- `npm test -- src/utils/sharedRendererPreviewPresenterController.test.ts src/utils/pixiPsdCutover.test.ts`
- `npm test -- src/utils/sharedRendererPreviewPresenterController.test.ts src/utils/pixiPsdCutover.test.ts src/utils/pixiImageCutover.test.ts src/utils/sharedRendererViewportPresenterOrchestration.test.ts`
- 対象ファイルに絞った `npx tsc --noEmit` エラー確認。

### 残課題・次のステップ
- TS側 `sharedRendererNativeMediaSupport` はまだPsdをunsupportedとして扱うため、PSDをpreview/export capabilityへ公開する必要がある。
- UI側 `activeLayerIds` / `rootLayer` をRust backendのPSD合成へ渡すschemaは未実装。

## 2026-06-18 — PSDをnative media supportへ公開

### 実施内容
- `sharedRendererNativeMediaSupport` でローカルpath / `file://` / `file://localhost` の `.psd` をRust native-renderable mediaとして扱うようにした。
- remote / blob / data sourceのPSDは引き続きunsupportedにし、Rust backendへ同期ファイル読み込みできないsourceを渡さない契約を固定した。
- PSD-only previewが `nativeRenderUnsupportedMediaOnly` で止まらず `render.nativeSharedFrame` へ進む契約を追加した。
- 動画の前面にあるローカルPSDをvideo cutover stack safetyのblockerにしない契約を追加した。
- 版を `0.1.1-Beta-113a` に更新した。

### 検証
- `npm test -- src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/sharedRendererVideoCutoverStack.test.ts src/utils/sharedRendererViewportNativeRenderUpload.test.ts`
- `npm test -- src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/sharedRendererVideoCutoverStack.test.ts src/utils/sharedRendererViewportNativeRenderUpload.test.ts src/utils/sharedRendererPreviewPresenterController.test.ts src/utils/pixiPsdCutover.test.ts src/utils/sharedRendererViewportPresenterOrchestration.test.ts`
- 対象ファイルに絞った `npx tsc --noEmit` エラー確認。

### 残課題・次のステップ
- PSD-only exportがRust native render direct encodeへ進む契約は未追加。
- UI側 `activeLayerIds` / `rootLayer` をRust backendのPSD合成へ渡すschemaは未実装。

## 2026-06-18 — PSD active layer idsをRust境界へ追加

### 実施内容
- `RustSceneMediaReference` に `active_layer_ids` を追加した。
- `PsdObject.activeLayerIds` のtrueキーをsortし、Rust native render payloadでdeterministicに渡せるようにした。
- `validateRustSceneSnapshotBoundary` が `active_layer_ids` を文字列配列として受け入れるようにした。
- rust-core `SceneMediaReference` に `active_layer_ids` を追加し、serde boundaryでPSD layer選択状態を保持できるようにした。
- 版を `0.1.1-Beta-114a` に更新した。

### 検証
- `npm test -- src/utils/rustSceneSnapshot.test.ts src/utils/rustSceneSnapshotBoundary.test.ts`
- `npm test -- src/utils/rustSceneSnapshot.test.ts src/utils/rustSceneSnapshotBoundary.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts`
- `cargo test --manifest-path rust-core/Cargo.toml --test media_schema`
- `cargo test --manifest-path rust-core/Cargo.toml`
- 対象ファイルに絞った `npx tsc --noEmit` エラー確認。

### 残課題・次のステップ
- Rust backendのPSD合成はまだ `active_layer_ids` を使っておらず、ファイル内visible状態に基づく。
- 次は `psd_fast` compositeでactive layer id filterを受け取り、UIのレイヤー選択をnative preview/exportへ反映する。

## 2026-06-18 — PSD active layer idsをRust合成へ反映

### 実施内容
- WASM/Rust PSD parser fast pathの `PsdLayerNode.id` を `psd-layer-{layer_index}` / `psd-group-{group_id}` の安定IDへ寄せた。
- `psd_fast::PsdFastLayer` にstable idを追加し、Rust backendで再parseしたPSD layerとUIの `activeLayerIds` を照合できるようにした。
- `composite_visible_psd_layers_with_active_layer_ids` を追加し、active id指定時は選択されたvisible leaf layerだけを合成するようにした。
- `render.nativeSharedFrame` のPSD source生成が `SceneMediaReference.active_layer_ids` を合成filterへ渡すようにした。
- 版を `0.1.1-Beta-115a` に更新した。

### 検証
- `npm test -- src/utils/psdLayerStableId.test.ts src/utils/psdParserPersistence.test.ts src/utils/psdTextureUrl.test.ts src/utils/rustSceneSnapshot.test.ts`
- `cargo test --manifest-path rust-backend/Cargo.toml psd_fast::tests`
- `cargo test --manifest-path rust-backend/Cargo.toml --test decode_control_plane`
- `cargo test --manifest-path rust-core/Cargo.toml --test media_schema`
- 対象ファイルに絞った `npx tsc --noEmit` エラー確認。

### 残課題・次のステップ
- PSD-only export direct encodeの明示テストを追加し、Rust native render経路からPixi/readbackへ戻らない契約を固定する。
- 既存プロジェクトに保存済みの旧ランダムPSD layer idを新stable idへ移行する必要があるか確認する。

## 2026-06-18 — PSD-only export native render経路を診断へ記録

### 実施内容
- PSD-only exportが `render.nativeSharedFrame` でdirect encode payloadを返す契約を追加した。
- PSD-only export成功時に `uxfdRustExportFrameSourceFramePath=nativeRenderSharedFrame` をdatasetへ残すようにした。
- PSD-only exportではPixi presenter / WebGPU readback / JS shared-frame writerへ戻らないことをテストで固定した。
- 版を `0.1.1-Beta-116a` に更新した。

### 検証
- `npm test -- src/utils/sharedRendererExportFrameSource.test.ts`
- 対象ファイルに絞った `npx tsc --noEmit` エラー確認。

### 残課題・次のステップ
- video+PSD exportの積層sceneで、video decode shared frame source + PSD media sourceが同じnative renderへ入る契約を追加する。
- 既存プロジェクトに保存済みの旧PSD layer idを新stable idへ移行する必要があるか確認する。

## 2026-06-18 — export encode fallback経路を診断へ記録

### 実施内容
- presenter shared-frame handoffでencode payloadを返した場合、`uxfdRustExportFrameSourceFramePath=presentedSharedFrame` をdatasetへ残すようにした。
- WebGPU readback結果をJS shared-frame writerへ渡した場合、`uxfdRustExportFrameSourceFramePath=webGpuReadbackSharedFrameWriter` をdatasetへ残すようにした。
- native render直通 / presenter handoff / readback writerの3経路をdiagnosticsで区別できるようにした。
- 版を `0.1.1-Beta-117a` に更新した。

### 検証
- `npm test -- src/utils/sharedRendererExportFrameSource.test.ts`
- 対象ファイルに絞った `npx tsc --noEmit` エラー確認。

### 残課題・次のステップ
- video+PSD exportの積層sceneで、video decode shared frame source + PSD media sourceが同じnative renderへ入る契約を追加する。
- 既存プロジェクトに保存済みの旧PSD layer idを新stable idへ移行する必要があるか確認する。

## 2026-06-18 — 保存済みPSD復元をstable id経路へ接続

### 実施内容
- Red: `parsePsdArrayBufferAsObject` がWASM PSD metadata pathを使い、保存済みPSD復元でも `psd-group-*` / `psd-layer-*` のstable idを返す契約を追加した。
- Green: ArrayBuffer入力のPSD parseを先に `parsePsdWithWasm` へ通し、WASM失敗時だけ既存ag-psd parseへfallbackするようにした。
- Refactor: 通常ファイルWASM parseとArrayBuffer復元parseのPSD layer tree / activeLayerIds構築を共通化した。
- 版を `0.1.1-Beta-118a` に更新した。

### 検証
- `npm test -- src/utils/psdParserArrayBufferWasm.test.ts src/utils/psdLayerStableId.test.ts src/utils/psdParserPersistence.test.ts src/utils/projectFile.test.ts src/utils/rustSceneSnapshot.test.ts`
- 対象ファイルに絞った `npx tsc --noEmit` エラー確認。

### 残課題・次のステップ
- video+PSD exportの積層sceneで、video decode shared frame source + PSD media sourceが同じnative renderへ入る契約を追加する。
- 保存済みPSDの旧IDを持つactiveLayerIdsが存在する場合に、復元後のstable idへどこまで移せるかを実ファイルfixtureで確認する。

## 2026-06-18 — 旧PSD active idをstable idへ復元

### 実施内容
- Red: 旧projectに保存された `legacy-face-id: false` が、再parse後の `psd-layer-1: false` へ移らないことをテストで固定した。
- Green: 保存済み `rootLayer` と復元後stable `rootLayer` を同名・同種・同位置で対応づけ、保存時のactive状態をstable idへ移植するようにした。
- `layerTree` も移植後のactive stateから再構築し、UI表示とRust `active_layer_ids` 境界の状態が分離しないようにした。
- 版を `0.1.1-Beta-119a` に更新した。

### 検証
- `npm test -- src/utils/projectFile.test.ts src/utils/psdParserArrayBufferWasm.test.ts src/utils/psdLayerStableId.test.ts src/utils/psdParserPersistence.test.ts src/utils/rustSceneSnapshot.test.ts`
- 対象ファイルに絞った `npx tsc --noEmit` エラー確認。

### 残課題・次のステップ
- video+PSD exportの積層sceneで、video decode shared frame source + PSD media sourceが同じnative renderへ入る契約を追加する。
- 旧projectのPSD構造が保存時と実ファイル再parse時で大きく変わっている場合は、安全側にdefault visibleを使うため、実ファイルfixtureで移植範囲を追加確認する。

## 2026-06-19 — video+PSD混在exportのnative render内訳を診断へ記録

### 実施内容
- Red: video decode shared frame sourceとPSD media sourceが同じ `render.nativeSharedFrame` export passへ入ったとき、datasetへnative render内訳が残る契約を追加した。
- Green: `nativeRenderSharedFrame` 成功時にmedia count / media kinds / source count / source media idsを `uxfdRustExportFrameSource*` datasetへ記録するようにした。
- video+PSD混在exportではPixi presenter / WebGPU readback / JS shared-frame writerへ戻らず、Rust native render payloadへvideo source 1件とPSD media referenceが同時に渡ることをテストで固定した。
- 版を `0.1.1-Beta-120a` に更新した。

### 検証
- `npm test -- src/utils/sharedRendererExportFrameSource.test.ts`
- 対象ファイルに絞った `npx tsc --noEmit` エラー確認。

### 残課題・次のステップ
- video+PSD混在exportを実際のfile path付き `TimelineObject` から `buildSharedRendererExportSession` 経由で構築する統合契約を追加する。
- native render内訳診断をpreview側にも揃え、exportとpreviewで同じRust ownership状態を見られるようにする。

## 2026-06-19 — video混在exportのunsupported overlay mediaを事前block

### 実施内容
- Red: video sourceがRust decode shared frameとして準備済みでも、remote PSD overlayがある場合はbackend呼び出し前に `nativeRenderUnsupportedMedia` でblockedになる契約を追加した。
- Green: `render.nativeSharedFrame` 呼び出し前にsnapshot内の非video mediaをnative media support契約で検査し、未対応mediaをfail-loudにするようにした。
- remote PSD / remote画像などをRust backendへ渡してから失敗させず、Pixi fallbackへ曖昧に戻る余地を減らした。
- 版を `0.1.1-Beta-120b` に更新した。

### 検証
- `npm test -- src/utils/sharedRendererExportFrameSource.test.ts`
- 対象ファイルに絞った `npx tsc --noEmit` エラー確認。

### 残課題・次のステップ
- video+PSD混在exportを実際のfile path付き `TimelineObject` から `buildSharedRendererExportSession` 経由で構築する統合契約を追加する。
- preview側のnative render診断にもunsupported overlay mediaのreasonを揃え、preview/exportで同じ判断を見られるようにする。

## 2026-06-19 — preview native renderにもunsupported overlay media gateを適用

### 実施内容
- Red: video sourceがpreview native render用に準備済みでも、remote PSD overlayがある場合はbackend呼び出し前に `nativeRenderUnsupportedMedia` で止まる契約を追加した。
- Green: preview native render uploadにも非video mediaのnative support gateを追加し、export側と同じ `resolveMixedNativeRenderUnsupportedMedia` helperへ集約した。
- preview/exportでremote PSD / remote画像などをRust backendへ渡す前に同じ理由でfail-loudできるようにした。
- 版を `0.1.1-Beta-120c` に更新した。

### 検証
- `npm test -- src/utils/sharedRendererViewportNativeRenderUpload.test.ts src/utils/sharedRendererExportFrameSource.test.ts`
- 対象ファイルに絞った `npx tsc --noEmit` エラー確認。

### 残課題・次のステップ
- video+PSD混在exportを実際のfile path付き `TimelineObject` から `buildSharedRendererExportSession` 経由で構築する統合契約を追加する。
- preview presenter diagnosticsへnative render media count / kinds / source idsを出し、export側の内訳診断と揃える。

## 2026-06-19 — preview native render内訳を診断へ記録

### 実施内容
- Red: video+PSDが同じnative rendered preview frameに入ったとき、presenter datasetへmedia count / media kinds / source count / source media idsが残る契約を追加した。
- Green: `SharedRendererPresenterDiagnosticState` にnative render内訳を追加し、native render frame ready時に `Video,Psd` とvideo source idをdatasetへ記録するようにした。
- preview/exportのどちらでもRust native renderに乗ったmedia構成を同じ粒度で追えるようにした。
- 版を `0.1.1-Beta-121a` に更新した。

### 検証
- `npm test -- src/utils/sharedRendererPreviewPresenterController.test.ts`
- 対象ファイルに絞った `npx tsc --noEmit` エラー確認。

### 残課題・次のステップ
- video+PSD混在exportを実際のfile path付き `TimelineObject` から `buildSharedRendererExportSession` 経由で構築する統合契約を追加する。
- 実機のGoPro動画 + PSD overlayで、preview/export双方のdatasetが `Video,Psd` / `video-1` 相当を示すか確認する。

## 2026-06-19 — export sessionにnative render envelopeを追加

### 実施内容
- Red: 実 `VideoObject` + `PsdObject` から `buildSharedRendererExportSession` を作ったとき、snapshot/mediaに加えてnative render envelopeが `Video,Psd` / `video-1` を示す契約を追加した。
- Green: export sessionへ `nativeRenderEnvelope` を追加し、surface gate OK時にmedia count / media kinds / source count / source media idsを公開するようにした。
- unsupported overlay mediaの場合も共通media gate経由で `nativeRenderUnsupportedMedia` をsession envelopeから確認できるようにした。
- 版を `0.1.1-Beta-122a` に更新した。

### 検証
- `npm test -- src/utils/sharedRendererExportSession.test.ts src/utils/sharedRendererExportFrameSource.test.ts src/utils/viewportRustExportFrameSource.test.ts`
- 対象ファイルに絞った `npx tsc --noEmit` エラー確認。

### 残課題・次のステップ
- `nativeRenderEnvelope` をexport source / Viewport diagnosticsへ接続し、session構築時点とframe render時点のnative render内訳が一致するかを確認できるようにする。
- 実機のGoPro動画 + PSD overlayで、preview/export双方のdatasetが `Video,Psd` / `video-1` 相当を示すか確認する。

## 2026-06-19 — native render source decoded slotのrelease所有権を追加

### 実施内容
- Red: Rust native render source準備後に、decoded source slotを成功時 `gpuUploadFenceSignalled`、失敗時 `rendererUploadAborted` でreleaseする契約を追加した。
- Green: `SharedRendererViewportNativeRenderSource` に `releaseAfterNativeRenderComplete` / `releaseAfterNativeRenderAbort` を追加し、単回release helperで二重解放を防いだ。
- export native render成功時はsourceをcomplete releaseし、native render失敗・unsupported media block・例外時はabort releaseするようにした。
- 版を `0.1.1-Beta-200a` に更新した。

### 検証
- `npm test -- sharedRendererViewportNativeRenderSource sharedRendererExportFrameSource`
- `npx tsc --noEmit 2>&1 | rg "sharedRendererViewportNativeRenderSource|sharedRendererExportFrameSource"`

### 残課題・次のステップ
- native render output側のencode失敗時releaseと、source decoded slot releaseの診断を同一datasetで追えるようにする。
- 実機のGoPro動画で、native render失敗後もdecode slotが枯渇しないことをsmokeで確認する。

## 2026-06-19 — preview native render source decoded slotもrelease

### 実施内容
- Red: preview native render uploadで、video sourceを使ったrender成功時にcomplete release、unsupported media block時にabort releaseする契約を追加した。
- Green: `prepareSharedRendererViewportNativeRenderUpload` が `SharedRendererViewportNativeRenderSource` を保持し、成功時は `releaseAfterNativeRenderComplete`、unsupported / render失敗 / render例外 / output upload失敗時は `releaseAfterNativeRenderAbort` を呼ぶようにした。
- サブエージェントレビューで指摘されたpreview経路のdecoded slot leakを修正した。
- 版を `0.1.1-Beta-200b` に更新した。

### 検証
- `npm test -- sharedRendererViewportNativeRenderUpload sharedRendererViewportNativeRenderSource sharedRendererExportFrameSource`
- `npx tsc --noEmit 2>&1 | rg "sharedRendererViewportNativeRenderUpload|sharedRendererViewportNativeRenderSource|sharedRendererExportFrameSource"`

### 残課題・次のステップ
- render例外とoutput upload失敗時のpreview source abort releaseを個別テストで厚くする。
- 実機のGoPro動画で、preview native render失敗後もdecode slotが枯渇しないことをsmokeで確認する。

## 2026-06-19 — native render source release必須gateを追加

### 実施内容
- Red: preview/export native renderがrelease callbackを持たないdecoded sourceを受け取った場合、Rust backend native rendererへ渡さず `nativeRenderSourceReleaseUnavailable` で止める契約を追加した。
- Green: `resolveNativeRenderSourceReleaseUnavailable` を追加し、preview/exportの両consumerでrender前にrelease callback欠落をfail-loudにした。
- release callbackを持つ既存fixtureはその所有権を明示する形へ更新した。
- 版を `0.1.1-Beta-201a` に更新した。

### 検証
- `npm test -- sharedRendererViewportNativeRenderUpload sharedRendererViewportNativeRenderSource sharedRendererExportFrameSource`
- `npx tsc --noEmit 2>&1 | rg "sharedRendererViewportNativeRenderUpload|sharedRendererViewportNativeRenderSource|sharedRendererExportFrameSource"`

### 残課題・次のステップ
- `nativeRenderSourceReleaseUnavailable` をpreview/export diagnostics datasetでより見やすく集約する。
- 実機のGoPro動画で、source release gateに引っかからずpreview/exportがRust native renderへ進むことをsmokeで確認する。

## 2026-06-19 — native render source release診断を追加

### 実施内容
- Red: preview/export diagnosticsで `nativeRenderSourceReleaseUnavailable` を専用フラグとして見分けられる契約を追加した。
- Green: preview presenter diagnosticsへ `uxfdSharedRendererPresenterNativeRenderSourceReleaseRequired=true`、export frame source diagnosticsへ `uxfdRustExportFrameSourceNativeRenderSourceReleaseRequired=true` を出すようにした。
- 状態遷移時に古いrelease requiredフラグが残らないよう、diagnostics writerのclear対象へ追加した。
- 版を `0.1.1-Beta-202a` に更新した。

### 検証
- `npm test -- sharedRendererPresenterDiagnostics sharedRendererPreviewPresenterController sharedRendererExportFrameSource`
- `npx tsc --noEmit 2>&1 | rg "sharedRendererPresenterDiagnostics|sharedRendererPreviewPresenterController|sharedRendererExportFrameSource"`

### 残課題・次のステップ
- 実機のGoPro動画で、source release gateに引っかからずpreview/exportがRust native renderへ進むことをsmokeで確認する。
- native render output側のencode失敗時releaseとsource decoded slot releaseを、同じ診断ビューで追えるようにする。

## 2026-06-19 — native render output release診断を追加

### 実施内容
- Red: Rust encode writeがnative render outputを消費する前に失敗した場合、native render output release結果を診断eventとして受け取れる契約を追加した。
- Green: `runRustBackendVideoEncodeExport` に `onNativeRenderOutputRelease` を追加し、`released` / `missingBridge` / `skipped` を通知するようにした。
- `render.releaseNativeSharedFrame` bridgeが無い場合もsilentにせず `missingBridge` として観測できるようにした。
- 版を `0.1.1-Beta-203a` に更新した。

### 検証
- `npm test -- rustBackendVideoEncodeExport`
- `npx tsc --noEmit 2>&1 | rg "rustBackendVideoEncodeExport"`

### 残課題・次のステップ
- `onNativeRenderOutputRelease` を `useProjectExport` / export diagnostics datasetへ接続し、実UIからnative render output release状態を確認できるようにする。
- 実機のGoPro動画で、encode失敗時にもnative render output shared memoryが残らないことをsmokeで確認する。

## 2026-06-19 — native render output releaseをexport progressへ接続

### 実施内容
- Red: `exportProgress` がnative render output release診断を保持でき、`useProjectExport` がencode runnerのrelease callbackを渡す契約を追加した。
- Green: `ExportProgress.nativeRenderOutputRelease` を追加し、`runRustBackendVideoEncodeExport` の `onNativeRenderOutputRelease` から現在のprogressへ診断eventをマージするようにした。
- 版を `0.1.1-Beta-204a` に更新した。

### 検証
- `npm test -- exportProgress useProjectExportBoundary`
- `npx tsc --noEmit 2>&1 | rg "useProjectExport|useStore|exportProgress|rustBackendVideoEncodeExport"`

### 残課題・次のステップ
- `ExportProgressModal` にnative render output release診断を表示し、実UI上で `released` / `missingBridge` を確認できるようにする。
- 実機のGoPro動画で、encode失敗時にもnative render output shared memoryが残らないことをsmokeで確認する。

## 2026-06-19 — native render output releaseをprogress modalへ表示

### 実施内容
- Red: export progress modalが `exportProgress.nativeRenderOutputRelease` を読み、native render output release状態を表示する契約を追加した。
- Green: `formatNativeRenderOutputReleaseDiagnostic` を追加し、`released` / `missingBridge` / `skipped` を短い診断行として表示するようにした。
- 日本語UIでは `解放済み` / `release bridge未接続` / `対象外` として表示する。
- 版を `0.1.1-Beta-205a` に更新した。

### 検証
- `npm test -- ExportProgressModal useProjectExportBoundary`
- `npx tsc --noEmit 2>&1 | rg "ExportProgressModal|useProjectExport|rustBackendVideoEncodeExport"`

### 残課題・次のステップ
- 実機のGoPro動画で、encode失敗時にもprogress modal上でnative render output release状態を確認する。
- release診断を必要なら開発者向け詳細パネルへ集約する。

## 2026-06-19 — native render output release失敗をmodalへ表示

### 実施内容
- Red: `render.releaseNativeSharedFrame` がrejectした場合も、元のencode write失敗を隠さず `failed` release診断eventを出す契約を追加した。
- Green: release bridge例外をcatchして `status=failed` / `error` を通知し、throw元はencode write失敗のまま保持するようにした。
- progress modalで `failed` を `解放失敗` / `release failed` と表示するようにした。
- 版を `0.1.1-Beta-205b` に更新した。

### 検証
- `npm test -- rustBackendVideoEncodeExport ExportProgressModal`
- `npx tsc --noEmit 2>&1 | rg "rustBackendVideoEncodeExport|ExportProgressModal"`

### 残課題・次のステップ
- 実機のGoPro動画で、encode失敗時にもprogress modal上でnative render output release状態を確認する。
- release失敗時の詳細errorを開発者向け詳細パネルに集約するか判断する。

## 2026-06-19 — compatibility encoderの静的WebCodecs依存を分離

### 実施内容
- Red: `projectExportCompatibilityEncoder` が `videoExportPipeline` を静的importしない契約を追加した。
- Green: `EncodeVideoConfig` / `EncodeResult` の型importをやめ、互換adapter内に必要最小限の入力・結果型を定義した。
- WebCodecs/mp4-muxer pipelineへの接続は、動画object拒否後のdynamic importだけに閉じた。
- 版を `0.1.1-Beta-205c` に更新した。

### 検証
- `npm test -- src/utils/projectExportCompatibilityEncoder.test.ts`
- `npx tsc --noEmit 2>&1 | rg "projectExportCompatibilityEncoder|useProjectExport"`

### 残課題・次のステップ
- `electron/main.ts` の旧WebCodecs export stream IPCを、非動画互換export専用としてさらに境界テストで固定する。
- `sharedRendererExportFrameSource` の `createImageBitmap` fallbackがRust必須時に到達不能であることを、追加の境界テストで確認する。

## 2026-06-19 — video export blocked診断でlegacy fallback不可を明示

### 実施内容
- Red: 動画を含む `renderFrame` が `videoBitmapCaptureDisabled` でblockedになった時、legacy canvas fallback不可を診断できる契約を追加した。
- Green: `SharedRendererExportFrameSourceBlockedError` に `legacyCanvasFallbackAllowed` を追加し、動画bitmap capture拒否では `false` を設定した。
- 既存の `fallbackToLegacyCanvas` は互換の型ガードとして維持し、実際の退避可否は新しい診断フラグで見る形にした。
- 版を `0.1.1-Beta-205d` に更新した。

### 検証
- `npm test -- src/utils/sharedRendererExportFrameSource.test.ts -t "blocks video renderFrame"`
- `npm test -- src/utils/sharedRendererExportFrameSource.test.ts src/utils/projectExportFrameCanvas.test.ts src/utils/projectExportRustEncodeFrame.test.ts`
- `npx tsc --noEmit 2>&1 | rg "sharedRendererExportFrameSource|projectExportFrameCanvas|projectExportRustEncodeFrame|useProjectExport"`

### 残課題・次のステップ
- export hook側でblocked errorの `legacyCanvasFallbackAllowed=false` をprogress diagnosticsへ載せるか判断する。
- `electron/main.ts` の旧WebCodecs export stream IPCを非動画互換export専用として境界テストで固定する。

## 2026-06-19 — frame source blocked診断をexport progressへ接続

### 実施内容
- Red: `useProjectExport` がRust/shared renderer frame source blockedを捕まえた時、fail/fallback判定の前にprogressへ診断を載せる契約を追加した。
- Green: `ExportProgress.rustFrameSourceBlocked` を追加し、`reason` / `frameIndex` / `legacyCanvasFallbackAllowed` を保存するようにした。
- `exportProgress` storeテストにもblocked診断payloadの保持を追加した。
- 版を `0.1.1-Beta-206a` に更新した。

### 検証
- `npm test -- src/utils/useProjectExportBoundary.test.ts src/store/exportProgress.test.ts`
- `npx tsc --noEmit 2>&1 | rg "useProjectExport|useStore|exportProgress|sharedRendererExportFrameSource"`

### 残課題・次のステップ
- `ExportProgressModal` に `rustFrameSourceBlocked` を表示し、Rust必須動画exportがどこで止まったかUIから確認できるようにする。
- サブエージェントのレビュー結果を見て、残るPixi/browser動画fallback穴を優先度順に潰す。

## 2026-06-19 — WebCodecs stream開始前に動画exportを拒否

### 実施内容
- Red: WebCodecs/mp4-muxer互換branchで、Electron `export-stream-open` を呼ぶ前に動画objectを拒否する境界テストを追加した。
- Green: Rust backend encoder branchを抜けた後、互換WebCodecs branch冒頭で `hasVideoObjects` を再確認し、動画ならfail-loudにした。
- これにより、将来encode planが崩れても旧Electron stream IPCへ動画exportが触れる前に止まる。
- 版を `0.1.1-Beta-206b` に更新した。

### 検証
- `npm test -- src/utils/useProjectExportBoundary.test.ts src/utils/projectExportEncodePlan.test.ts src/utils/projectExportCompatibilityEncoder.test.ts`
- `npx tsc --noEmit 2>&1 | rg "useProjectExport|projectExportEncodePlan|projectExportCompatibilityEncoder"`

### 残課題・次のステップ
- `ExportProgressModal` に `rustFrameSourceBlocked` を表示し、Rust必須動画exportの停止理由をUIへ出す。
- 実機GoPro素材でRust native render / Rust encode / release diagnosticsのsmokeを行う。

## 2026-06-19 — frame source blocked診断をmodalへ表示

### 実施内容
- Red: `rustFrameSourceBlocked` を日本語/英語で短く整形するmodal formatter契約を追加した。
- Green: `formatRustFrameSourceBlockedDiagnostic` を追加し、export progress modalへRust frame source blocked診断行を表示するようにした。
- `legacyCanvasFallbackAllowed=false` の場合は `legacy fallback不可` として、動画exportが旧canvasへ戻れない停止であることをUIから確認できる。
- 版を `0.1.1-Beta-207a` に更新した。

### 検証
- `npm test -- src/components/ExportProgressModal.test.ts src/utils/useProjectExportBoundary.test.ts src/store/exportProgress.test.ts`
- `npx tsc --noEmit 2>&1 | rg "ExportProgressModal|useProjectExport|useStore|exportProgress"`

### 残課題・次のステップ
- 実機GoPro素材で、Rust native render / Rust encode / source release / output release / frame source blocked診断をsmoke確認する。
- WebCodecs/mp4-muxer互換出口を完全削除するか、非動画互換出口として残すかを実機安定後に判断する。

## 2026-06-19 — Rust encode finish結果をexport summaryへ反映

### 実施内容
- Red: `runRustBackendVideoEncodeExport` が Rust backend の `encode.finish` 結果を完了summaryの正本として使う契約を追加した。
- Green: `finishResponse.result` から `frameCount` / `sessionId` / `filePath` を読み、backendが返した値を優先するようにした。
- renderer側の送信フレーム数や要求filePathだけで完了扱いしないようにした。
- 版を `0.1.1-Beta-208a` に更新した。

### 検証
- `npm test -- src/utils/rustBackendVideoEncodeExport.test.ts src/utils/rustVideoEncodeBackendBridge.test.ts src/utils/rustBackendVideoEncodeControl.test.ts`
- `npx tsc --noEmit 2>&1 | rg "rustBackendVideoEncodeExport|rustVideoEncodeBackendBridge|rustBackendVideoEncodeControl|useProjectExport"`

### 残課題・次のステップ
- Rust backend側の `encode.finish` / ffmpeg実行をcargo testで再確認し、実機smoke前にbackend contractの緑を取る。
- 実機GoPro素材でRust native render / Rust encode / release diagnosticsを確認する。

## 2026-06-19 — native render output release falseを失敗診断にする

### 実施内容
- Red: `render.releaseNativeSharedFrame` がrejectではなく `{ success:false, error }` を返した場合も、release失敗として診断する契約を追加した。
- Green: release bridgeの返却値を確認し、`success=false` の場合は `nativeRenderOutputRelease.status=failed` として通知するようにした。
- encode write失敗そのものは引き続き隠さず、release失敗はprogress診断へ分離する。
- 版を `0.1.1-Beta-208b` に更新した。

### 検証
- `npm test -- src/utils/rustBackendVideoEncodeExport.test.ts src/components/ExportProgressModal.test.ts src/utils/useProjectExportBoundary.test.ts`
- `npx tsc --noEmit 2>&1 | rg "rustBackendVideoEncodeExport|ExportProgressModal|useProjectExport"`

### 残課題・次のステップ
- 実機GoPro素材で、encode write失敗時の native render output release 診断が `released` / `failed` を正しく示すか確認する。
- release失敗の詳細を開発者向けログや診断パネルにさらに集約するか判断する。

## 2026-06-19 — Rust encode finish summary欠落を失敗にする

### 実施内容
- Red: `encode.finish` がsuccessでも `frameCount` / `sessionId` / `filePath` を返さない場合、renderer側の値で補完せず失敗する契約を追加した。
- Green: finish summary parserを必須化し、不完全なsummaryでは `Rust backend video encode finish did not return a complete export summary.` を投げるようにした。
- 成功系テストのmockをRust backend実装の返却形へ揃えた。
- 版を `0.1.1-Beta-208c` に更新した。

### 検証
- `npm test -- src/utils/rustBackendVideoEncodeExport.test.ts src/utils/rustVideoEncodeBackendBridge.test.ts src/utils/rustBackendVideoEncodeControl.test.ts src/utils/useProjectExportBoundary.test.ts`
- `npx tsc --noEmit 2>&1 | rg "rustBackendVideoEncodeExport|rustVideoEncodeBackendBridge|rustBackendVideoEncodeControl|useProjectExport"`

### 残課題・次のステップ
- 実機GoPro素材でRust backend finish summaryがUI完了通知へ正しく反映されるか確認する。
- Rust backend encode/decode/native render全体のcargo testを定期的に回し、実機smoke前のbackend contractを保つ。

## 2026-06-19 — decode slot release falseを拒否

### 実施内容
- Red: preview uploadの `releaseAfterGpuUpload` が、`decode.releaseFrame` の `{ success:false }` を成功扱いしない契約を追加した。
- Green: `sharedRendererRustVideoUploadPipeline` で decoded slot release結果を検証し、`success=false` ならcallbackをrejectするようにした。
- Red: native render sourceの `releaseAfterNativeRenderComplete` でも、`decode.releaseFrame` の `{ success:false }` を拒否する契約を追加した。
- Green: `sharedRendererViewportNativeRenderSource` でもrelease結果を検証し、native renderへ渡したdecoded slotの解放漏れを黙らせないようにした。
- 版を `0.1.1-Beta-208d` に更新した。

### 検証
- `npm test -- src/utils/sharedRendererRustVideoUploadPipeline.test.ts src/utils/sharedRendererViewportVideoUpload.test.ts src/utils/sharedRendererViewportNativeRenderSource.test.ts`
- `npm test -- src/utils/sharedRendererViewportNativeRenderSource.test.ts src/utils/sharedRendererViewportNativeRenderUpload.test.ts src/utils/sharedRendererExportFrameSource.test.ts`
- `npx tsc --noEmit 2>&1 | rg "sharedRendererRustVideoUploadPipeline|sharedRendererViewportVideoUpload|sharedRendererViewportNativeRenderSource|sharedRendererViewportNativeRenderUpload|sharedRendererExportFrameSource"`

### 残課題・次のステップ
- stale decode responseなど、直接 `decode.releaseFrame` を呼ぶ残り経路でも `success=false` を観測できるようにする。
- 実機GoPro素材で decoded slot release / native render source release の失敗診断が期待通り表面化するか確認する。

## 2026-06-19 — stale native render source release失敗を分離

### 実施内容
- Red: native render source準備中にstale decoded responseを破棄する `decode.releaseFrame` が `{ success:false }` を返した場合、通常の `staleDecodeResponse` に隠さない契約を追加した。
- Green: stale decoded frameのrelease結果を検証し、失敗時は `staleDecodeReleaseFailed` として返すようにした。
- 版を `0.1.1-Beta-208e` に更新した。

### 検証
- `npm test -- src/utils/sharedRendererViewportNativeRenderSource.test.ts src/utils/sharedRendererViewportNativeRenderUpload.test.ts src/utils/sharedRendererExportFrameSource.test.ts`
- `npx tsc --noEmit 2>&1 | rg "sharedRendererViewportNativeRenderSource|sharedRendererViewportNativeRenderUpload|sharedRendererExportFrameSource"`

### 残課題・次のステップ
- preview upload側のstale decode response release失敗も同じく分離し、直接release経路を揃える。
- 実機GoPro素材で stale response / release failure diagnostics がUI・dataset上で追えるか確認する。

## 2026-06-19 — stale preview upload release失敗を分離

### 実施内容
- Red: preview upload側のstale decoded response破棄で `decode.releaseFrame` が `{ success:false }` を返した場合、通常の `staleDecodeResponse` に隠さない契約を追加した。
- Green: 単体video uploadでrelease結果を検証し、失敗時は `staleDecodeReleaseFailed` として返すようにした。
- 複数video upload preparationでも同じ `staleDecodeReleaseFailed` 契約を回帰テストとして固定した。
- 版を `0.1.1-Beta-208f` に更新した。

### 検証
- `npm test -- src/utils/sharedRendererViewportVideoUpload.test.ts src/utils/sharedRendererRustVideoUploadPipeline.test.ts src/utils/sharedRendererPreviewPresenterController.test.ts`
- `npm test -- src/utils/sharedRendererViewportVideoUpload.test.ts -t "multi-video upload preparation"`
- `npx tsc --noEmit 2>&1 | rg "sharedRendererViewportVideoUpload|sharedRendererRustVideoUploadPipeline|sharedRendererPreviewPresenterController"`

### 残課題・次のステップ
- releasePreparedViewportVideoUploadsAfterAbort の複数slot abort時に、途中のrelease失敗で後続slotのreleaseが止まらないよう集約診断を検討する。
- 実機GoPro素材で stale response / release failure diagnostics がUI・dataset上で追えるか確認する。

## 2026-06-19 — prepared upload abort releaseを全件試行

### 実施内容
- Red: 複数video uploadで後続clipのuploadが失敗した際、準備済みslotのabort releaseが途中で失敗しても、残りのslot releaseを試行する契約を追加した。
- Green: `releasePreparedViewportVideoUploadsAfterAbort` を全件試行・最初の失敗メッセージ返却に変更した。
- abort release失敗時は `uploadAbortReleaseFailed` として返し、release漏れを単なる `uploadFailed` に隠さないようにした。
- 版を `0.1.1-Beta-208g` に更新した。

### 検証
- `npm test -- src/utils/sharedRendererViewportVideoUpload.test.ts src/utils/sharedRendererRustVideoUploadPipeline.test.ts src/utils/sharedRendererPreviewPresenterController.test.ts`
- `npx tsc --noEmit 2>&1 | rg "sharedRendererViewportVideoUpload|sharedRendererRustVideoUploadPipeline|sharedRendererPreviewPresenterController"`

### 残課題・次のステップ
- native render source側で複数source abort releaseを行う経路にも、全件試行・失敗集約が必要か確認する。
- 実機GoPro素材で複数動画や失敗時release diagnosticsを確認する。

## 2026-06-19 — native render abort release失敗を診断化

### 実施内容
- Red: preview native renderが失敗した後、複数decoded sourceの `releaseAfterNativeRenderAbort` の一部がrejectしても全sourceのreleaseを試行し、失敗を診断結果として返す契約を追加した。
- Green: `releaseNativeRenderSourcesAfterAbort` を `Promise.allSettled` ベースに変更し、最初のrelease失敗を `nativeRenderSourceReleaseFailed` として返すようにした。
- Rust native render / upload失敗経路では、source abort release失敗を `nativeRenderFailed` や `uploadFailed` に隠さず、decoded slot ownershipの異常として表面化させるようにした。
- 版を `0.1.1-Beta-208h` に更新した。

### 検証
- `npm test -- src/utils/sharedRendererViewportNativeRenderUpload.test.ts`
- `npm test -- src/utils/sharedRendererViewportNativeRenderUpload.test.ts src/utils/sharedRendererViewportNativeRenderSource.test.ts src/utils/sharedRendererPreviewPresenterController.test.ts`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererViewportNativeRenderUpload\\.ts|src/utils/sharedRendererViewportNativeRenderUpload\\.test\\.ts|src/utils/sharedRendererViewportNativeRenderSource\\.ts|src/utils/sharedRendererPreviewPresenterController\\.ts)"`

### 残課題・次のステップ
- export frame source側の native render source abort / complete release失敗も、throwではなくRust frame source blocked診断へ落とせるか確認する。
- preview成功後の `releaseAfterNativeRenderComplete` 失敗時に、native render output releaseも含めた安全な失敗診断が必要か検討する。

## 2026-06-19 — export native render release失敗をblocked診断化

### 実施内容
- Red: export native renderが失敗した後、decoded sourceの `releaseAfterNativeRenderAbort` がrejectした場合に、生のErrorではなく `SharedRendererExportFrameSourceBlockedError` として診断される契約を追加した。
- Green: export frame sourceのabort releaseを全件試行・失敗集約に変更し、release失敗時は `nativeRenderSourceReleaseFailed` をdatasetとblocked errorへ記録するようにした。
- `useProjectExport` が `rustFrameSourceBlocked` として拾える形に揃え、動画exportの失敗理由がUI診断から消えないようにした。
- 版を `0.1.1-Beta-208i` に更新した。

### 検証
- `npm test -- src/utils/sharedRendererExportFrameSource.test.ts -t "release diagnostic"`
- `npm test -- src/utils/sharedRendererExportFrameSource.test.ts src/utils/sharedRendererViewportNativeRenderUpload.test.ts src/utils/sharedRendererViewportNativeRenderSource.test.ts src/utils/useProjectExportBoundary.test.ts src/components/ExportProgressModal.test.ts`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererExportFrameSource\\.ts|src/utils/sharedRendererExportFrameSource\\.test\\.ts|src/utils/sharedRendererViewportNativeRenderUpload\\.ts|src/hooks/useProjectExport\\.ts|src/components/ExportProgressModal\\.tsx)"`

### 残課題・次のステップ
- native render成功後の `releaseAfterNativeRenderComplete` 失敗時に、生成済みnative render outputをどう解放・診断するかをTDDで固定する。
- export側のrelease失敗診断が `ExportProgressModal` の表示文言として十分に分かりやすいか確認する。

## 2026-06-19 — native render complete release失敗時に出力を解放

### 実施内容
- Red: preview native renderとshared memory copyが成功した後、decoded sourceの `releaseAfterNativeRenderComplete` がrejectした場合に、native render outputを解放してから診断を返す契約を追加した。
- Green: complete releaseも全件試行・失敗集約に変更し、失敗時は準備済みuploadの `releaseAfterUploadAbort` を呼んでnative render outputを解放するようにした。
- 成功後のdecoded source release失敗を `nativeRenderSourceReleaseFailed` として返し、プレビュー側で出力shared frameを返さない経路の解放漏れを防いだ。
- 版を `0.1.1-Beta-208j` に更新した。

### 検証
- `npm test -- src/utils/sharedRendererViewportNativeRenderUpload.test.ts -t "complete release"`
- `npm test -- src/utils/sharedRendererViewportNativeRenderUpload.test.ts src/utils/sharedRendererViewportNativeRenderSource.test.ts src/utils/sharedRendererPreviewPresenterController.test.ts src/utils/sharedRendererExportFrameSource.test.ts`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererViewportNativeRenderUpload\\.ts|src/utils/sharedRendererViewportNativeRenderUpload\\.test\\.ts|src/utils/sharedRendererViewportNativeRenderSource\\.ts|src/utils/sharedRendererExportFrameSource\\.ts)"`

### 残課題・次のステップ
- export native render成功後の complete release失敗でも、生成済みnative render outputをRust側へ解放できる契約を追加する。
- preview/exportのrelease失敗reason表示をユーザー向け文言として整える。

## 2026-06-19 — export complete release失敗時に出力を解放

### 実施内容
- Red: export native render成功後、decoded sourceの `releaseAfterNativeRenderComplete` がrejectした場合に、生成済みnative render outputをRustへ解放してからblocked診断を返す契約を追加した。
- Green: `createSharedRendererExportFrameSource` に `releaseNativeSharedFrame` 注入点を追加し、complete release失敗時は `render.releaseNativeSharedFrame` を呼んでから `nativeRenderSourceReleaseFailed` を投げるようにした。
- export側のcomplete releaseも全件試行・失敗集約へ揃え、生成済みshared frameがencoderへ渡らない失敗経路でRust側のoutput ringを残さないようにした。
- 版を `0.1.1-Beta-208k` に更新した。

### 検証
- `npm test -- src/utils/sharedRendererExportFrameSource.test.ts -t "complete release"`
- `npm test -- src/utils/sharedRendererExportFrameSource.test.ts src/utils/sharedRendererViewportNativeRenderUpload.test.ts src/utils/sharedRendererViewportNativeRenderSource.test.ts src/utils/rustBackendNativeRenderControl.test.ts src/utils/useProjectExportBoundary.test.ts src/components/ExportProgressModal.test.ts`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererExportFrameSource\\.ts|src/utils/sharedRendererExportFrameSource\\.test\\.ts|src/utils/sharedRendererViewportNativeRenderUpload\\.ts|src/utils/rustBackendNativeRenderControl\\.ts|src/hooks/useProjectExport\\.ts|src/components/ExportProgressModal\\.tsx)"`

### 残課題・次のステップ
- release bridge自体がrejectまたは `success:false` を返した場合、source release失敗とoutput release失敗をどう優先表示するかをTDDで固定する。
- release失敗reasonの表示文言を、ユーザーが実機素材で原因追跡しやすい形へ整える。

## 2026-06-19 — export native output release falseを診断化

### 実施内容
- Red: export native render output cleanupで `render.releaseNativeSharedFrame` が `{ success:false }` を返した場合、source release失敗に隠さず `nativeRenderOutputReleaseFailed` としてblocked診断へ出す契約を追加した。
- Green: output release helperを追加し、`success:false` とrejectを失敗detailへ変換するようにした。
- source complete release失敗後のcleanupでは、output release失敗を優先してdataset / `SharedRendererExportFrameSourceBlockedError` に記録し、Rust output ringが解放できていない状態を成功扱いしないようにした。
- 版を `0.1.1-Beta-208l` に更新した。

### 検証
- `npm test -- src/utils/sharedRendererExportFrameSource.test.ts -t "output release failure"`
- `npm test -- src/utils/sharedRendererExportFrameSource.test.ts src/utils/sharedRendererViewportNativeRenderUpload.test.ts src/utils/sharedRendererViewportNativeRenderSource.test.ts src/utils/rustBackendNativeRenderControl.test.ts src/utils/useProjectExportBoundary.test.ts src/components/ExportProgressModal.test.ts`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererExportFrameSource\\.ts|src/utils/sharedRendererExportFrameSource\\.test\\.ts|src/utils/sharedRendererViewportNativeRenderUpload\\.ts|src/utils/rustBackendNativeRenderControl\\.ts|src/hooks/useProjectExport\\.ts|src/components/ExportProgressModal\\.tsx)"`

### 残課題・次のステップ
- preview側の native output release callback でも `success:false` / reject を専用診断へ分離する。
- `nativeRenderOutputReleaseFailed` の表示文言をExport progress modalでより分かりやすくする。

## 2026-06-19 — preview native output release falseを診断化

### 実施内容
- Red: preview native render output cleanupで `render.releaseNativeSharedFrame` が `{ success:false }` を返した場合、source complete release失敗に隠さず `nativeRenderOutputReleaseFailed` として返す契約を追加した。
- Green: preview native render output releaserでRust応答を検証し、`success:false` はcallback rejectへ変換するようにした。
- complete release失敗後のcleanupではoutput release失敗を優先し、`nativeRenderOutputReleaseFailed` として返すようにした。
- 版を `0.1.1-Beta-208m` に更新した。

### 検証
- `npm test -- src/utils/sharedRendererViewportNativeRenderUpload.test.ts -t "output release failure"`
- `npm test -- src/utils/sharedRendererViewportNativeRenderUpload.test.ts src/utils/sharedRendererExportFrameSource.test.ts src/utils/sharedRendererViewportNativeRenderSource.test.ts src/utils/rustBackendNativeRenderControl.test.ts src/utils/sharedRendererPreviewPresenterController.test.ts`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererViewportNativeRenderUpload\\.ts|src/utils/sharedRendererViewportNativeRenderUpload\\.test\\.ts|src/utils/sharedRendererExportFrameSource\\.ts|src/utils/sharedRendererViewportNativeRenderSource\\.ts|src/utils/rustBackendNativeRenderControl\\.ts)"`

### 残課題・次のステップ
- preview native output releaseのrejectケースも同じ診断へ落ちることを回帰テストで固定する。
- preview/exportの `nativeRenderOutputReleaseFailed` をUI表示で追いやすくする。

## 2026-06-19 — preview upload失敗時のoutput releaseを診断化

### 実施内容
- Red: preview native render outputのcopy/upload準備が失敗した後、output cleanupも `{ success:false }` を返した場合に、生Errorではなく `nativeRenderOutputReleaseFailed` として返す契約を追加した。
- Green: upload準備の例外経路と `upload.ok=false` 経路でも output release helperを通し、release失敗を結果unionへ集約するようにした。
- copy/upload失敗時にRust native render outputが解放できていない状態を `uploadFailed` や生throwに隠さないようにした。
- 版を `0.1.1-Beta-208n` に更新した。

### 検証
- `npm test -- src/utils/sharedRendererViewportNativeRenderUpload.test.ts -t "upload preparation fails"`
- `npm test -- src/utils/sharedRendererViewportNativeRenderUpload.test.ts src/utils/sharedRendererExportFrameSource.test.ts src/utils/sharedRendererViewportNativeRenderSource.test.ts src/utils/rustBackendNativeRenderControl.test.ts src/utils/sharedRendererPreviewPresenterController.test.ts`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererViewportNativeRenderUpload\\.ts|src/utils/sharedRendererViewportNativeRenderUpload\\.test\\.ts|src/utils/sharedRendererExportFrameSource\\.ts|src/utils/sharedRendererViewportNativeRenderSource\\.ts|src/utils/rustBackendNativeRenderControl\\.ts)"`

### 残課題・次のステップ
- preview native output releaseのrejectケースを明示的な回帰テストにする。
- `nativeRenderOutputReleaseFailed` をpreview/exportのUI診断で追いやすくする。

## 2026-06-19 — export native render throwをblocked診断化

### 実施内容
- Red: export native render bridgeがthrowした場合でも、生Errorではなく `SharedRendererExportFrameSourceBlockedError(reason=nativeRenderFailed)` としてdataset診断へ載る契約を追加した。
- Green: native render throw経路でdecoded sourceをabort releaseした後、throw detailを `nativeRenderFailed` blocked errorへ変換するようにした。
- `useProjectExport` が `rustFrameSourceBlocked` として拾える形に揃え、Rust native render bridge例外時もExport UIから原因を追えるようにした。
- 版を `0.1.1-Beta-208o` に更新した。

### 検証
- `npm test -- src/utils/sharedRendererExportFrameSource.test.ts -t "native render bridge throws"`
- `npm test -- src/utils/sharedRendererExportFrameSource.test.ts src/utils/sharedRendererViewportNativeRenderUpload.test.ts src/utils/sharedRendererViewportNativeRenderSource.test.ts src/utils/useProjectExportBoundary.test.ts src/components/ExportProgressModal.test.ts`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererExportFrameSource\\.ts|src/utils/sharedRendererExportFrameSource\\.test\\.ts|src/utils/sharedRendererViewportNativeRenderUpload\\.ts|src/hooks/useProjectExport\\.ts|src/components/ExportProgressModal\\.tsx)"`

### 残課題・次のステップ
- preview native render bridge throwも結果unionの `nativeRenderFailed` へ落とし、生Errorでpreview orchestrationを崩さないようにする。
- native render throw診断の表示文言をユーザー向けに整える。

## 2026-06-19 — preview native render throwを診断化

### 実施内容
- Red: preview native render bridgeがthrowした場合、生Errorではなく `nativeRenderFailed` 結果へ落とし、decoded source abort releaseを試行する契約を追加した。
- Green: preview native render throw経路でrelease失敗がなければ `nativeRenderFailed` として返し、例外messageをdetailに保持するようにした。
- preview orchestrationがRust native render bridge例外で崩れず、診断可能な結果unionとして扱えるようにした。
- 版を `0.1.1-Beta-208p` に更新した。

### 検証
- `npm test -- src/utils/sharedRendererViewportNativeRenderUpload.test.ts -t "bridge throws"`
- `npm test -- src/utils/sharedRendererViewportNativeRenderUpload.test.ts src/utils/sharedRendererExportFrameSource.test.ts src/utils/sharedRendererViewportNativeRenderSource.test.ts src/utils/sharedRendererPreviewPresenterController.test.ts`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererViewportNativeRenderUpload\\.ts|src/utils/sharedRendererViewportNativeRenderUpload\\.test\\.ts|src/utils/sharedRendererExportFrameSource\\.ts|src/utils/sharedRendererViewportNativeRenderSource\\.ts)"`

### 残課題・次のステップ
- native render throw / output release failure のUI文言をpreview/exportで揃える。
- Rust backend decode/native render/encodeの統合テストを再実行し、最近の所有権診断変更がbackend contractと矛盾しないことを確認する。

## 2026-06-19 — Rust backend/native renderer contractを再検証

### 実施内容
- 最近追加したpreview/exportのrelease ownership診断がRust backend decode / native render / encode contractと矛盾しないか再検証した。
- native-wgpu-rendererのテスト実行時に、`uxfd-golden-harness` の `jpeg-decoder` 依存が `native-wgpu-renderer/Cargo.lock` へ反映されたため、再現性のためlockfileを更新対象にした。
- package versionは挙動変更ではないため `0.1.1-Beta-208p` のまま据え置いた。

### 検証
- `cargo test --manifest-path rust-backend/Cargo.toml decode_`
- `cargo test --manifest-path rust-backend/Cargo.toml native_render`
- `cargo test --manifest-path rust-backend/Cargo.toml encode_`
- `cargo test --manifest-path native-wgpu-renderer/Cargo.toml --test shared_frame_output --test shm_decoded_frame_render --test frame_stage_timings`
- `cargo test --manifest-path shared-memory-spike/Cargo.toml posix_shm`
- `npm run test:bridge-node`
- `npm test -- src/utils/sharedRendererViewportNativeRenderUpload.test.ts src/utils/sharedRendererExportFrameSource.test.ts src/utils/sharedRendererViewportNativeRenderSource.test.ts src/utils/rustBackendNativeRenderControl.test.ts src/utils/rustBackendVideoEncodeExport.test.ts src/utils/useProjectExportBoundary.test.ts src/components/ExportProgressModal.test.ts`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererViewportNativeRenderUpload\\.ts|src/utils/sharedRendererExportFrameSource\\.ts|src/utils/rustBackendVideoEncodeExport\\.ts|src/utils/rustBackendNativeRenderControl\\.ts|src/hooks/useProjectExport\\.ts|src/components/ExportProgressModal\\.tsx)"`

### 残課題・次のステップ
- `nativeRenderOutputReleaseFailed` / `nativeRenderFailed` のUI文言をpreview/exportで揃える。
- 実機GoPro素材でRust decode -> native render -> encodeのsmokeを確認する。

## 2026-06-19 — Rust native診断の表示文言を整備

### 実施内容
- Red: Export progress modalで native render失敗 / native render output解放失敗のreasonを生IDではなく読める文言として表示し、release失敗errorも隠さない契約を追加した。
- Green: `formatRustFrameSourceBlockedDiagnostic` にreason labelを追加し、`nativeRenderFailed` / `nativeRenderOutputReleaseFailed` を日本語・英語で読みやすくした。
- `formatNativeRenderOutputReleaseDiagnostic` は failed eventの `error` を末尾に出すようにした。
- 版を `0.1.1-Beta-208q` に更新した。

### 検証
- `npm test -- src/components/ExportProgressModal.test.ts`
- `npm test -- src/components/ExportProgressModal.test.ts src/store/exportProgress.test.ts src/utils/useProjectExportBoundary.test.ts src/utils/sharedRendererExportFrameSource.test.ts`
- `npx tsc --noEmit 2>&1 | rg "(src/components/ExportProgressModal\\.tsx|src/components/ExportProgressModal\\.test\\.ts|src/store/useStore\\.ts|src/hooks/useProjectExport\\.ts|src/utils/sharedRendererExportFrameSource\\.ts)"`

### 残課題・次のステップ
- 実機GoPro素材でRust decode -> native render -> encodeのsmokeを確認し、UI診断が実画面で追えるか見る。
- preview側のnative render failureもユーザーに見える形へ必要に応じて昇格する。

## 2026-06-19 — preview native診断labelをdatasetへ出力

### 実施内容
- Red: preview presenter diagnosticsで `nativeRenderFailed` / `nativeRenderOutputReleaseFailed` のreasonに加え、読めるlabelもdatasetへ出す契約を追加した。
- Green: `writeSharedRendererPresenterDiagnostics` が `uxfdSharedRendererPresenterNativeRenderFailureLabel` をready/fallback両方で出力し、stale labelを消すようにした。
- preview実機デバッグ時にdatasetからRust native render失敗の種類を追いやすくした。
- 版を `0.1.1-Beta-208r` に更新した。

### 検証
- `npm test -- src/utils/sharedRendererPresenterDiagnostics.test.ts`
- `npm test -- src/utils/sharedRendererPresenterDiagnostics.test.ts src/utils/sharedRendererPreviewPresenterController.test.ts src/utils/sharedRendererViewportNativeRenderUpload.test.ts`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererPresenterDiagnostics\\.ts|src/utils/sharedRendererPreviewPresenterController\\.ts|src/utils/sharedRendererViewportNativeRenderUpload\\.ts)"`

### 残課題・次のステップ
- 実機GoPro素材でpreview/exportのRust native診断が画面・datasetから追えるか確認する。
- 必要ならpreviewにも軽量な可視診断表示を追加する。

## 2026-06-19 — Rust export中のtimeline同期を抑止

### 実施内容
- Red: `projectExportFrameCanvas` に、Rust frame sourceがexport frameを所有している間はtimeline time同期を行わない契約を追加した。
- Green: `shouldSynchroniseTimelineForProjectExportFrame` を追加し、`useProjectExport` の `setTime` 呼び出しをlegacy canvas renderingが必要なruntime planに限定した。
- Rust source ready時にpreview/Pixi/HTMLVideoElement側の時間更新副作用が走らないようにし、Rust-owned export frame pathをさらに独立させた。
- 版を `0.1.1-Beta-208s` に更新した。

### 検証
- `npm test -- projectExportFrameCanvas`
- `npm test -- projectExportFrameCanvas useProjectExportBoundary`

### 残課題・次のステップ
- 実機GoPro素材でRust decode -> native render -> encode export中にpreview側のlegacy動画更新が発火しないことをsmoke確認する。
- Rust frame source ready時の残るbrowser/Pixi fallback境界を引き続き潰す。

## 2026-06-19 — MP4Boxをproduction依存から除外

### 実施内容
- Red: `productionVideoDependencyBoundary` に、`mp4box` がproduction `dependencies` ではなくdevDependencyにのみ存在する契約を追加した。
- Green: `mp4box` を `dependencies` から `devDependencies` へ移し、`src/exportTest/` の検証用デマックス依存として隔離した。
- 本体配布側からVideoDecoder/MP4Box系のbrowser動画デマックス依存をさらに外した。
- 版を `0.1.1-Beta-208t` に更新した。

### 検証
- `npm test -- productionVideoDependencyBoundary`
- `npm ls mp4box --depth=0`

### 残課題・次のステップ
- `src/exportTest/` に残るWebCodecs/MP4Box検証資材を、Rust backend smokeへ置き換えられる範囲で縮小する。
- production packageから将来的にPixi自体を剥がすため、preview ownershipの残りを引き続き段階的に移す。

## 2026-06-19 — Pixi動画cutover入力を削除

### 実施内容
- Red: `pixiVideoCutover` が `objectType` / export / ownership gate入力を公開せず、Pixi動画branchを常にshared renderer専用として扱う契約へ更新した。
- Green: `shouldSkipPixiVideoForSharedRenderer` / `resolvePixiVideoRenderPath` を入力不要にし、`pixiRenderHelper` の動画branchから判定材料の受け渡しを削除した。
- Pixi側へ動画所有権を戻すための分岐材料をさらに減らし、Rust/shared renderer video ownershipを既定経路として固定した。
- 版を `0.1.1-Beta-208u` に更新した。

### 検証
- `npm test -- pixiVideoCutover`
- `npm test -- pixiVideoCutover viewportRustVideoOnlyBoundary productionVideoDependencyBoundary`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/pixiVideoCutover\\.ts|src/utils/pixiRenderHelper\\.ts|src/utils/pixiVideoCutover\\.test\\.ts|src/utils/viewportRustVideoOnlyBoundary\\.test\\.ts)"`

### 残課題・次のステップ
- `sharedRendererVideoOwnership` のRust decode/upload readiness診断を実機GoPro素材で確認する。
- WebGPU presenterのvideo texture bind group経路とRust decode multi-sessionの残りを引き続き検証する。

## 2026-06-19 — native render動画ownershipをbuilderへ統合

### 実施内容
- Red: `sharedRendererVideoOwnership` に、Rust native render frameがvideo sceneを既に含む場合はdecode/upload readinessや通常cutover flagに依存せず `sharedRenderer` ownerになる契約を追加した。
- Green: `buildSharedRendererVideoOwnership` に `nativeRenderFrameReady` / `nativeRenderVideoObjectIds` を追加し、`sharedRendererPreviewPresenterController` の手作業ownership上書きをbuilder入力へ統合した。
- native render preview成功時の動画ownershipを単一の所有権判定へ寄せ、Pixiへ動画所有を戻す余地を減らした。
- 版を `0.1.1-Beta-208v` に更新した。

### 検証
- `npm test -- sharedRendererVideoOwnership`
- `npm test -- sharedRendererVideoOwnership sharedRendererPreviewPresenterController sharedRendererViewportPresenterOrchestration`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererVideoOwnership\\.ts|src/utils/sharedRendererVideoOwnership\\.test\\.ts|src/utils/sharedRendererPreviewPresenterController\\.ts|src/utils/sharedRendererPreviewPresenterController\\.test\\.ts|src/utils/sharedRendererViewportPresenterOrchestration\\.ts)"`

### 残課題・次のステップ
- SolidColour側のnative render ownership上書きもbuilderへ寄せ、native render ownershipの一貫性を揃える。
- 実機GoPro素材でnative render preview成功時にPixi動画childrenがcleanupされることを確認する。

## 2026-06-19 — native render SolidColour ownershipをbuilderへ統合

### 実施内容
- Red: `sharedRendererSolidColourOwnership` に、Rust native render frameがSolidColour sceneを既に含む場合は通常cutover flagやRust/WASM geometryに依存せず `sharedRenderer` ownerになる契約を追加した。
- Green: `buildSharedRendererSolidColourOwnership` に `nativeRenderFrameReady` / `nativeRenderSolidColourObjectIds` を追加し、`sharedRendererPreviewPresenterController` の手作業ownership上書きをbuilder入力へ統合した。
- native render preview成功時のSolidColour ownershipも単一の所有権判定へ寄せ、Pixiとの二重合成を避ける契約を強めた。
- 版を `0.1.1-Beta-208w` に更新した。

### 検証
- `npm test -- sharedRendererSolidColourOwnership`
- `npm test -- sharedRendererSolidColourOwnership sharedRendererPreviewPresenterController sharedRendererViewportPresenterOrchestration`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedRendererSolidColourOwnership\\.ts|src/utils/sharedRendererSolidColourOwnership\\.test\\.ts|src/utils/sharedRendererPreviewPresenterController\\.ts|src/utils/sharedRendererPreviewPresenterController\\.test\\.ts|src/utils/sharedRendererViewportPresenterOrchestration\\.ts)"`

### 残課題・次のステップ
- native render preview成功時のImage/PSD ownership builderとdiagnosticsも同じ観点で確認する。
- 実機GoPro素材でnative render preview成功時にPixi動画/shape childrenがcleanupされることを確認する。

## 2026-06-19 — shared frame copy sequence検証を追加

### 実施内容
- Red: `sharedVideoFrameUploadBridge` に、native copy bridgeのcopy report `sequence` が decoded frame `ptsFrame` と一致しない場合はuploadを拒否する契約を追加した。
- Green: `prepareSharedRendererDecodedVideoFrameUpload` が `copyReportSequenceMismatch` を返すようにし、stale copy reportをWebGPU uploadへ進ませないようにした。
- Rust decode -> shared memory copy -> renderer upload bufferのdata-plane検証を強めた。
- 版を `0.1.1-Beta-208x` に更新した。

### 検証
- `npm test -- sharedVideoFrameUploadBridge`
- `npm test -- sharedVideoFrameUploadBridge sharedRendererRustVideoUploadPipeline sharedRendererViewportVideoUpload`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedVideoFrameUploadBridge\\.ts|src/utils/sharedVideoFrameUploadBridge\\.test\\.ts|src/utils/sharedRendererRustVideoUploadPipeline\\.ts|src/utils/sharedRendererViewportVideoUpload\\.ts)"`

### 残課題・次のステップ
- copy reportのchecksum検証をRust側契約と突き合わせ、必要なら expected/actual checksum mismatchもfail-loudにする。
- 実機GoPro素材でshared memory copy reportとGPU upload診断を確認する。

## 2026-06-20 — GeneratedGradientをRust native render mediaへ追加

### 実施内容
- 方針を「石橋を叩きすぎない」方向へ寄せ、診断の追加よりもRustで描ける表現を増やす作業を優先した。
- Red: `rustSceneSnapshot` / `sharedRendererNativeMediaSupport` / `rust-core` media schemaに、グラデーション矩形を `GeneratedGradient` mediaとして扱う契約を追加した。
- Green: `GeneratedGradient` をTS/Rust境界へ追加し、Rust backend `render.nativeSharedFrame` がグラデーション定義JSONからRGBA source frameを生成するようにした。
- `rust-backend` のRPCテストで、GeneratedGradientがshared frameへ実際に描かれることを確認した。
- 版を `0.1.1-Beta-216x` に更新した。

### 検証
- `npm test -- rustSceneSnapshot sharedRendererNativeMediaSupport`
- `cargo test --test media_schema generated_gradient` (`rust-core/`)
- `npm test -- rustSceneSnapshot sharedRendererNativeMediaSupport sharedRendererPreviewSurface sharedRendererExportSession`
- `cargo test` (`rust-core/`)
- `cargo test` (`rust-backend/`)
- `npx tsc --noEmit --pretty false 2>&1 | rg "src/utils/rustSceneSnapshot|src/utils/sharedRendererNativeMediaSupport|src/utils/sharedRendererExportSession|src/utils/sharedRendererPreviewSurface"`

### 残課題・次のステップ
- GeneratedGradientのpreview ownershipをSolidColour/Image/PSDと同じnative render成功時cleanupへ接続する。
- 次は動画そのもののRust decode/native render経路へ戻り、実素材でのRust側表示面積を増やす。

## 2026-06-20 — GeneratedGradient native render ownershipを接続

### 実施内容
- Red: native render frame ready時にGeneratedGradient shapeが `solidColourOwnership.solidColourObjectIds` へ入る契約を追加した。
- Red: 前面GeneratedGradientがshared-renderer paint候補なら背面SolidColourのcutoverを塞がない契約を追加した。
- Green: presenterのsolid paint判定を `SolidColour` / `GeneratedGradient` の両方へ広げた。
- z-order safetyでもGeneratedGradientをSolidColourと同じshared-renderer paint候補として扱うようにした。
- これにより、Rust native render済みのグラデーション矩形をPixi shape描画から降ろせるようになった。
- 版を `0.1.1-Beta-216y` に更新した。

### 検証
- `npm test -- sharedRendererPreviewPresenterController -t "generated gradient shape ownership"`
- `npm test -- sharedRendererSolidColourOwnership -t "generated gradient plane above"`
- `npm test -- sharedRendererPreviewPresenterController sharedRendererSolidColourOwnership pixiSolidColourCutover`
- `npx tsc --noEmit --pretty false 2>&1 | rg "src/utils/sharedRendererPreviewPresenterController|src/utils/sharedRendererSolidColourOwnership|src/utils/pixiSolidColourCutover|src/components/Viewport"`

### 残課題・次のステップ
- 動画Rust decode/native render経路へ戻り、実素材でのRust側表示面積をさらに増やす。

## 2026-06-20 — multi-video native render source途中失敗時にreleaseする

### 実施内容
- Red: 2本目video decode requestが失敗した場合でも、1本目の準備済みnative render sourceが `rendererUploadAborted` で解放される契約を追加した。
- Green: decode start失敗、decode request失敗、decoded frame未返却の各分岐で、先に準備済みのsourceをabort releaseしてから戻るようにした。
- multi-video native render source準備中にRust decode slotを保持したままfallback/次フレームへ進むリスクを減らした。
- 版を `0.1.1-Beta-216z` に更新した。

### 検証
- `npm test -- sharedRendererViewportNativeRenderSource -t "later multi-video decode request fails"`
- `npm test -- sharedRendererViewportNativeRenderSource`
- `npm test -- sharedRendererViewportNativeRenderSource sharedRendererViewportNativeRenderUpload sharedRendererExportFrameSource`
- `npx tsc --noEmit --pretty false 2>&1 | rg "src/utils/sharedRendererViewportNativeRenderSource|src/utils/sharedRendererViewportVideoUpload|src/utils/sharedRendererViewportNativeRenderUpload"`

### 残課題・次のステップ
- decode start失敗時のprepared source abort release failureも明示テスト化する。
- 実機GoPro素材でmulti-video/native render sourceのdecode job再利用とstop/retryを確認する。

### 追加検証
- `npm test -- sharedRendererViewportNativeRenderSource -t "decode start fails"` を実行し、decode start失敗時のprepared source abort release failure契約も固定した。
- 既存実装で契約を満たしていたため、挙動変更と版更新は行っていない。

## 2026-06-20 — 動画sourceとGeneratedGradientを同一Rust native render passで固定

### 実施内容
- 前進重視の方針に合わせ、細かい失敗境界ではなく、Rustで実際に描ける混合表現をテストで固定した。
- Red: `rust-backend` に、shared memory上のVideo sourceを背景にし、GeneratedGradient mediaを前面合成する `render.nativeSharedFrame` 契約を追加した。
- Red: `sharedRendererViewportNativeRenderUpload` に、decoded video sourceとGeneratedGradient mediaを同じ `renderNativeSharedFrame` payloadへ渡す契約を追加した。
- 既存実装で契約を満たしていたため、挙動変更と版更新は行っていない。

### 検証
- `cargo test native_render_shared_frame_composites_video_source_with_generated_gradient_media` (`rust-backend/`)
- `npm test -- sharedRendererViewportNativeRenderUpload -t "generated gradient media"`

### 残課題・次のステップ
- presenter診断でも動画 + GeneratedGradientのnative render readyを明示し、実機で「どこまでRustか」を追いやすくする。
- 次は実装が必要な前進スライスとして、動画 + GeneratedGradient以外の混合mediaをRust native render uploadへ広げる。

## 2026-06-20 — 動画 + GeneratedGradient native render診断を固定

### 実施内容
- Red: `sharedRendererPreviewPresenterController` に、動画とGeneratedGradientが同じnative render済みframeに含まれる場合のdataset契約を追加した。
- `uxfdSharedRendererPresenterNativeRenderMediaKinds=Video,GeneratedGradient`、`uxfdSharedRendererPresenterNativeRenderSourceMediaIds=video-1`、Video/GeneratedGradient双方のsharedRenderer ownershipを確認できるようにした。
- 既存実装で契約を満たしていたため、挙動変更と版更新は行っていない。

### 検証
- `npm test -- sharedRendererPreviewPresenterController -t "video and generated gradient"`

### 残課題・次のステップ
- 次は実装が必要な前進スライスとして、Image/PSD/GeneratedGradientを含む混合mediaのRust native render uploadと実機表示確認を広げる。

## 2026-06-20 — Rust native renderにrotation transformを接続

### 実施内容
- Red: `reference-renderer` に、2x1 sourceをtop-left pivotで90度回転する契約を追加した。
- Green: CPU reference rendererがtranslation後に逆回転してsource座標をsampleするようにした。
- Red: `native-wgpu-renderer` に、同じ90度回転がCPU referenceと一致するparity契約を追加した。
- Green: native rendererのuniformへrotation cos/sinを渡し、共有WGSL `solid_composite.wgsl` で逆回転サンプリングするようにした。
- Red: `rustSceneSnapshot` に、Timeline objectの `rotation` を `rotation_degrees` としてRust境界へ渡す契約を追加した。
- Green: TS snapshot builderのrotation 0固定とunsupportedRotation gateを外した。既存のunsupported fixtureは、まだ未対応のscale変形へ差し替えた。
- 版を `0.1.1-Beta-217a` に更新した。

### 検証
- `cargo test` (`reference-renderer/`)
- `cargo test native_wgpu_matches_reference_for_top_left_pivot_rotation` (`native-wgpu-renderer/`)
- `npm test -- rustSceneSnapshot sharedRendererPreviewSurface sharedRendererExportSession`
- `npx tsc --noEmit --pretty false 2>&1 | rg "(src/utils/rustSceneSnapshot\\.ts|src/utils/rustSceneSnapshot\\.test\\.ts|src/utils/sharedRendererPreviewSurface\\.test\\.ts|src/utils/sharedRendererExportSession\\.test\\.ts)"`

### 残課題・次のステップ
- WebGPU preview vertex scene側のrotation parityはまだ別gate。native render済みframeの経路を優先して実機確認する。
- 次はscale変形か、Image/PSD/GeneratedGradient混合mediaの実機native render表示確認へ進む。

## 2026-06-20 — 図形/画像/音声つきRust encode MVP経路を優先

### 実施内容
- 方針を「PixiJSからの逐次剥がし」より「必要機能を列挙してRust/native経路へ再構築」に寄せた。
- Red: `productionVideoDependencyBoundary` に、通常起動時のVite dependency scanがexport test harness / mp4boxを拾わない契約を追加した。
- Green: `src/main.tsx` のexport test harness動的importへ `/* @vite-ignore */` を付け、`npm run dev` がmp4box dep-scanで止まらないようにした。
- Red: `rustSceneSnapshot` に、active audio objectがあってもvisual Rust scene snapshotは映像objectだけで成立する契約を追加した。
- Green: visual snapshot構築前にaudio objectを除外し、音声は `audioMixdown` とRust encoderの `audioPath` muxへ任せる形へ分離した。
- 版を `0.1.1-Beta-217b` に更新した。

### 検証
- `npm test -- productionVideoDependencyBoundary -t "dependency scanning"`
- `npm test -- rustSceneSnapshot -t "audio objects"`
- `npm test -- rustSceneSnapshot sharedRendererExportSession sharedRendererPreviewSurface`
- `npx tsc --noEmit --pretty false 2>&1 | rg "(src/utils/rustSceneSnapshot\\.ts|src/utils/rustSceneSnapshot\\.test\\.ts)"`
- `npm run dev` を起動し、`http://localhost:5173/` のHTTP 200を確認した。

### 残課題・次のステップ
- 実機UIで Rectangle / Image / Audio を置いて、Rust backend encoderでMP4へ出ることを確認する。
- 次は、必要なら「Quick Native Export」導線をUIに追加し、Pixi互換分岐を通らずRust native render + encodeを直接呼べるようにする。

## 2026-06-20 — Native MVP再構築計画と図形native export判定を追加

### 実施内容
- `markdown/Native_MVP_Rebuild_Plan.md` を追加し、PixiJSを細かく剥がすよりも、図形・画像・音声を配置してRust/native経路でMP4を書き出せるMVPへジャンプする方針を明文化した。
- Red: `projectExportFrameCanvas` に、Shape + AudioだけのMVP exportでもnative render mediaとして扱う契約を追加した。
- Green: export frame source contextのnative render media判定をShape / Image / PSD / Videoへ広げ、通常export hookも同じ判定を使うようにした。
- Audioはvisual mediaではなく、既存のmixdownとRust encoder `audioPath` muxへ流す設計を維持した。
- Rust backend側に、PNG画像をRustでdecode/renderし、そのshared frameをRust encoderへ渡してWAV音声とmuxしたMP4を生成する結合契約を追加した。
- 版を `0.1.1-Beta-218a` に更新した。

### 検証
- `npm test -- projectExportFrameCanvas`
- `cargo test --manifest-path rust-backend/Cargo.toml --test decode_control_plane native_rendered_image_frame_can_feed_audio_muxed_encode -- --nocapture`
- `npx tsc --noEmit --pretty false 2>&1 | rg "(src/utils/projectExportFrameCanvas\\.ts|src/utils/projectExportFrameCanvas\\.test\\.ts|src/hooks/useProjectExport\\.ts)"`

### 残課題・次のステップ
- 実機UIで Rectangle / Image / Audio を配置し、通常ExportからRust backend MP4が出るか確認する。
- 失敗する場合は、Quick Native Export導線を追加してPixi互換分岐を通らないMVP用の直通exportを作る。

## 2026-06-20 — GoPro系動画読み込みとencode失敗診断を改善

### 実施内容
- 実機確認で画像・音声・PSDは読み込めた一方、動画読み込みとencodeが失敗したため、MVPの入口を広げた。
- Red: `useTimelineDrop` に、ElectronがMIME typeを空で渡す `.MP4` も動画として扱う契約を追加した。
- Green: 動画drop判定をMIME typeだけでなく `.mp4` / `.mov` / `.m4v` / `.webm` / `.avi` / `.mkv` の拡張子にも対応させた。
- Red: `rust-backend` decodeに、非sRGB transfer metadataの動画を拒否せず読み込む契約を追加した。
- Green: Rust decodeの色メタデータgateを緩め、rangeだけをfull/limited変換へ使い、primaries/transfer/matrixはffmpegの変換へ任せるようにした。
- Red/Green: encode失敗時にffmpeg stderrを `encode.finish` のRPCエラーへ含めるようにした。
- 版を `0.1.1-Beta-218b` に更新した。

### 検証
- `npm test -- useTimelineDrop`
- `cargo test --manifest-path rust-backend/Cargo.toml --test decode_control_plane -- --nocapture`
- `npx tsc --noEmit --pretty false 2>&1 | rg "(src/hooks/useTimelineDrop\\.ts|src/hooks/useTimelineDrop\\.test\\.ts|rust-backend/src/main\\.rs)"`

### 残課題・次のステップ
- アプリを再起動し、GoPro動画をdropしてTimelineへ入るか確認する。
- encodeがまだ失敗する場合は、新しく表示されるffmpeg stderrを元にcodec / mux / save pathを直接修正する。

## 2026-06-20 — IPCなし動画metadata fallbackとexport診断を追加

### 実施内容
- 実機確認で `Failed to load video metadata` と `Cannot read properties of undefined (reading 'invoke')` が出たため、Electron IPCがない環境の扱いを改善した。
- Red: `mediaMetadata` に、Electron IPCがない場合もHTMLVideoElementで動画metadataを読む契約を追加した。
- Green: `resolveVideoMetadata` をRust probe優先にしつつ、probe不可ならbrowser video metadata fallbackでduration/width/heightを読むようにした。
- Red: `useProjectExportBoundary` に、module load時点で `window.ipcRenderer` を捕まない契約を追加した。
- Green: export開始時に `getProjectExportIpcRenderer` でIPCを取得し、未接続なら原因不明の `undefined.invoke` ではなくElectron app windowが必要だと明示するようにした。
- 版を `0.1.1-Beta-218c` に更新した。

### 検証
- `npm test -- mediaMetadata useTimelineDrop useProjectExportBoundary`
- `npx tsc --noEmit --pretty false 2>&1 | rg "(src/utils/mediaMetadata\\.ts|src/utils/mediaMetadata\\.test\\.ts|src/hooks/useProjectExport\\.ts|src/hooks/useProjectExportBoundary\\.test\\.ts|src/hooks/useTimelineDrop\\.ts)"`

### 残課題・次のステップ
- 動画読み込みはブラウザfallbackでもTLに入るはず。Rust exportはElectron IPCが必要なので、Electron window側で再確認する。
- Electron window側でもIPC未接続になる場合は、preload設定または起動経路を直接修正する。

## 2026-06-20 — Rust preview/export診断を画面に表示

### 実施内容
- PixiJSへ戻す選択肢を避け、Rust/shared renderer経路で動画preview/exportが止まっている地点を画面上に出す方針へ寄せた。
- Red: `ExportProgress` と `ExportProgressModal` に、Rust exportの現在工程 `stepDetail` を保持・表示する契約を追加した。
- Red: `Viewport` に、動画previewが空白のままにならないようshared renderer presenter診断を表示する契約を追加した。
- Green: export hookのsave path待ち、audio mix、shared-frame source待ち、encoder終了などの工程を進捗モーダルへ表示するようにした。
- Green: shared renderer presenterのdatasetからstatus / native render failure / video upload failureを集め、動画objectがあるpreview上へ診断として表示するようにした。
- shared-frame取得が長時間返らない場合、15秒で工程名付きエラーへ変換し、意味のない無限プログレスを避けるようにした。
- 版を `0.1.1-Beta-218d` に更新した。

### 検証
- `npm test -- exportProgress ExportProgressModal viewportRustVideoOnlyBoundary useProjectExportBoundary`
- `npx tsc --noEmit --pretty false` は既存のThree/mp4box/古いテスト型エラーで失敗。今回触ったファイルで絞った `tsc` 出力は空。

### 残課題・次のステップ
- Electron windowでGoPro動画previewを再確認し、表示されたshared renderer診断を元にRust video upload / native render uploadの実不具合を直接修正する。
- Export失敗時はモーダルの `Rust export: ...` 工程名とalertの詳細を元に、Rust backend encoderまたはshared-frame handoff側を直す。

## 2026-06-20 — Rust inline動画preview経路を追加

### 実施内容
- 方針を「動画編集の基本機能を触れる状態」へ寄せ、native copy bridge未接続でも動画previewへ進めるMVP経路を追加した。
- Red: shared memory native copyが `Shared video frame native bridge is unavailable.` で失敗した場合、Rust inline decoded RGBAをWebGPU uploadへ使う契約を追加した。
- Green: `decode.requestFrameInline` をRust backendへ追加し、通常の `decode.requestFrame` はpixel payloadなしのまま、inline専用RPCだけbase64 RGBAを返すようにした。
- Electron main/preloadから `rust-backend-decode-request-frame-inline` / `requestVideoDecodeFrameInline` を公開した。
- Renderer側はnative copy bridge失敗時のみinline RPCへ進み、取得したRGBAを既存のshared renderer WebGPU upload/drawへ渡すようにした。
- PixiJS動画描画へ戻さず、Rust decode -> WebGPU previewのMVP救済経路として実装した。
- 版を `0.1.1-Beta-219a` に更新した。

### 検証
- `npm test -- sharedRendererRustVideoUploadPipeline sharedRendererViewportVideoUpload sharedVideoFrameUploadBridge`
- `cargo test --manifest-path rust-backend/Cargo.toml --test decode_control_plane -- --nocapture`
- 対象ファイルで絞った `tsc` 出力は空。

### 残課題・次のステップ
- Electron windowでGoPro動画をTLへ置き、previewに動画フレームが表示されるか確認する。
- 表示される場合は再生時のフレーム更新とexport側の同経路接続へ進む。
- inline経路はMVP救済なので、native bridgeが安定したら重いIPC payloadを消して共有メモリ経路を正本へ戻す。

## 2026-06-20 — 通常devのmp4box依存scan再発を修正

### 実施内容
- `npm run dev` 起動時にViteが `phase3b-webgpu-harness/index.html` / `src/index.html` までdep-scanし、export test harnessの `mp4box` importで落ちる問題を修正した。
- Red: production boundary testに、通常Vite dependency scanのentryをapp root `index.html` に限定する契約を追加した。
- Green: `vite.config.ts` の `optimizeDeps.entries` を `['index.html']` に固定し、通常devからexport test harnessをdep-scan対象外にした。
- 版を `0.1.1-Beta-219b` に更新した。

### 検証
- `npm test -- productionVideoDependencyBoundary -t "dependency scanning"`
- 対象ファイルで絞った `tsc` 出力は空。
- `npm run dev` 起動後、`http://localhost:5174/` でHTTP 200を確認した。

### 残課題・次のステップ
- Electron windowで動画previewを確認し、Rust inline decode経路で最初のフレームが見えるか確認する。

## 2026-06-20 — Rust動画previewのE2E契約を追加

### 実施内容
- 実機で出た `presenterStartFailed` と `nativeRenderUnsupportedMediaOnly` 系の診断を受け、動画previewがその状態で終わらないことを固定するE2E寄りの統合テストを追加した。
- `src/e2e/rustVideoPreview.e2e.test.ts` を追加し、native renderが `nativeRenderUnsupportedMediaOnly` を返しても、Rust video uploadへ進み、presenterがready controlを返す流れを検証した。
- このテストではPixiJS動画描画へ戻さず、Rust decoded uploadが `sharedRendererDecodedVideoFrameUploads` としてpresenterへ渡ることを確認している。
- テスト追加のみのため、版は `0.1.1-Beta-219b` 据え置き。

### 検証
- `npm test -- rustVideoPreview.e2e`
- `npm test -- rustVideoPreview.e2e sharedRendererViewportPresenterOrchestration sharedRendererPreviewPresenterController`
- 対象E2Eファイルで絞った `tsc` 出力は空。

### 残課題・次のステップ
- 実機の `presenterStartFailed` はViewport側のcatchで出るため、次はElectron window上で再確認し、まだ出る場合はWebGPU presenter起動そのものの失敗理由をE2Eへ追加する。

## 2026-06-19 — shared frame copy checksum検証を追加

### 実施内容
- Red: `sharedVideoFrameUploadBridge` に、native copy bridgeのcopy report `expectedChecksum` / `actualChecksum` が一致しない場合はuploadを拒否する契約を追加した。
- Green: `prepareSharedRendererDecodedVideoFrameUpload` が `copyReportChecksumMismatch` を返すようにし、checksum検証に失敗したshared memory copyをWebGPU uploadへ進ませないようにした。
- Rust decode -> shared memory copy -> renderer upload bufferのdata-plane検証をさらに強めた。
- 版を `0.1.1-Beta-208y` に更新した。

### 検証
- `npm test -- sharedVideoFrameUploadBridge`
- `npm test -- sharedVideoFrameUploadBridge sharedRendererRustVideoUploadPipeline sharedRendererViewportVideoUpload`
- `npx tsc --noEmit 2>&1 | rg "(src/utils/sharedVideoFrameUploadBridge\\.ts|src/utils/sharedVideoFrameUploadBridge\\.test\\.ts|src/utils/sharedRendererRustVideoUploadPipeline\\.ts|src/utils/sharedRendererViewportVideoUpload\\.ts)"`

### 残課題・次のステップ
- Rust backend/native bridge側のchecksum report生成テストを再実行し、renderer側fail-loud契約と一致していることを確認する。
- 実機GoPro素材でcopy report mismatch時の診断表示を追えるようにする。

## 2026-06-20 — 動画スケールのRust snapshot gateを修正

### 実施内容
- 動画の `Scale X/Y` を変更すると Rust/shared renderer 経路の scene snapshot が `unsupportedTransform` で弾かれ、スケールが効かない問題を修正した。
- Red: `rustSceneSnapshot` に、動画だけは正の有限 `scaleX/scaleY` を Rust snapshot へ通す契約を追加した。
- Green: shared renderer transform gateを分岐し、画像/PSD/図形は従来どおりidentity scaleのみ、動画は正の有限scaleを許可するようにした。
- Rust core側にも、動画平面の右下頂点が `reference.width/height * scale_x/scale_y` で計算される契約を追加した。
- 版を `0.1.1-Beta-224c` に更新した。

### 検証
- `npm test -- rustSceneSnapshot sharedRendererVideoPlaneScene sharedRendererRustVideoPlaneScene`
- `cargo test --manifest-path rust-core/Cargo.toml applies_video_transform_scale`

### 残課題・次のステップ
- 実Electron windowでScale X/Y変更後の動画描画範囲をE2E観測する。
- 動画入りエクスポートの実経路を再現するE2Eを追加し、停止または失敗理由を修正する。

## 2026-06-20 — export失敗時のRust encode session残留を修正

### 実施内容
- 動画入りexportで `encode.start` 後にshared-frame生成やframe writeが失敗した場合、`encode.finish` に到達せずRust backend側のffmpeg/sessionが残る問題を修正した。
- Red: renderer export helper、Electron backend bridge、IPC channel、Rust backend RPCに `encode.abort` 契約を追加した。
- Green: `runRustBackendVideoEncodeExport` を `try/finally` 化し、finish未完了の失敗時は元エラーを隠さず `abortVideoEncode` をbest-effortで呼ぶようにした。
- Rust backendに冪等な `encode.abort` を追加し、active sessionをremoveしてstdinを閉じ、ffmpegをkill/waitし、stderrをdrainするようにした。
- Electron main/preloadから `rust-backend-encode-abort` / `window.rustVideoEncoder.abortVideoEncode` を公開した。
- 版を `0.1.1-Beta-224d` に更新した。

### 検証
- `npm test -- rustBackendVideoEncodeExport rustBackendVideoEncodeControl rustVideoEncodeBackendBridge rustVideoEncodeIpcChannels`
- `cargo test --manifest-path rust-backend/Cargo.toml --test decode_control_plane encode_abort_removes_active_session_after_frame_source_failure -- --nocapture`
- `npm test -- useProjectExportBoundary projectExportFrameCanvas projectExportFrameRenderer sharedRendererExportFrameSource rustBackendVideoEncodeExport rustBackendVideoEncodeControl projectExportRustEncodeFrame`
- `cargo test --manifest-path rust-backend/Cargo.toml --test decode_control_plane encode_ -- --nocapture`
- 対象ファイルで絞った `tsc` 出力は空。

### 残課題・次のステップ
- `test:export:fast` は古い `resolve-4k-proxy-video` IPCをexport test harnessが呼んで失敗する。production IPCへ戻さず、harness側のfixture解決へ切り替える。
- 実Electron windowのexportクリックを通るE2Eを追加し、保存ダイアログ・失敗時modal終了・次回export再試行まで検証する。

## 2026-06-20 — export test harnessのproxy解決を復旧

### 実施内容
- production Electron mainから削除済みの `resolve-4k-proxy-video` IPCを、export test harnessがまだ呼んで `test:export:fast` が失敗していた問題を修正した。
- Red: `exportTestHarnessBoundary` を追加し、削除済みproxy IPCへの依存が戻らない契約を固定した。
- Green: harness側に `resolveExportHarnessProxyVideo` を追加し、既存の `resolve-perf-heavy-video` + `check-proxy` + `generate-proxy` でH.264 proxyを解決/生成するようにした。
- production IPCにはVideoDecoder検証専用fixture resolverを戻していない。
- 版を `0.1.1-Beta-224e` に更新した。

### 検証
- `npm test -- exportTestHarnessBoundary productionVideoDependencyBoundary`
- `npm run test:export:fast` は ALL PASSED。
- 対象ファイルで絞った `tsc` は既存の `mp4box` 型解決エラーのみ。

### 残課題・次のステップ
- 実Electron windowのexportクリックを通るE2Eを追加し、保存ダイアログ・失敗時modal終了・次回export再試行まで検証する。

## 2026-06-20 — encode.start timeoutとexport後preview復帰を修正

### 実施内容
- 実Electron windowで `エクスポート失敗: Rust backend request timed out: encode.start` が出る問題を受け、Rust encode startのIPC timeoutを15秒から120秒へ延長した。
- Red: `rustVideoEncodeBackendBridge` に、`encode.start` が120秒timeoutで呼ばれる契約を追加した。
- 動画が消滅する症状への対策として、export中にexternal video sourceを破棄した場合は presenter session keyも無効化し、export失敗/終了後に同じsession扱いで破棄済み動画sourceを再利用しないようにした。
- Red: `viewportRustVideoOnlyBoundary` に、export中のexternal video source破棄がpresenter session keyを無効化する契約を追加した。
- 版を `0.1.1-Beta-224f` に更新した。

### 検証
- `npm test -- rustVideoEncodeBackendBridge viewportRustVideoOnlyBoundary`
- `npm test -- sharedRendererExternalVideoSource sharedRendererPreviewPresenterController sharedRendererViewportPresenterOrchestration`
- `/Volumes/ExtendSSD-W/GX020052.MP4` で `UXFD_VIDEO_LOAD_E2E_VIDEO_PATH=/Volumes/ExtendSSD-W/GX020052.MP4 UXFD_VIDEO_LOAD_E2E_EXPECT_EXTERNAL_TEXTURE=1 npm run test:video-load:e2e` 成功。
- E2E結果: `presenterStatus=ready` / `videoOwner=sharedRenderer` / `videoPresentationSource=external-video-source` / `uniquePresentedFrameCount=21` / `presentedFrameSpan=300` / `blockedSampleCount=0` / `externalVideoMaxAbsDriftMs=6` / `blockingDiagnostics=[]`。
- 対象ファイルで絞った `tsc` は既存の `ThreeStageViewport.tsx` three型エラーのみ。

### 残課題・次のステップ
- 実Electron windowのexportクリックを通るE2Eを追加し、保存ダイアログ・失敗時modal終了・次回export再試行まで検証する。
- まだ `encode.start` timeoutが出る場合は、Rust backendが直前のdecode/native render/proxy生成で詰まっていないか、RPCキュー時間を診断へ出す。

## 2026-06-20 — decode slot枯渇時の自動復旧を追加

### 実施内容
- 実Electron windowで動画入りexportが `No free decode frame slot: NoFreeSlot` で失敗し、一時停止時にもエラー表示が出る問題への復旧策を追加した。
- Red: preview video upload経路とnative render source経路へ、cached Rust decode jobが `No free decode frame slot: NoFreeSlot` を返した場合に既存jobをstopしてstartし直し、同じframe requestをretryする契約を追加した。
- Red: `viewportRustVideoOnlyBoundary` に、再生中から一時停止したcleanupでは古いshared renderer presenterを保持し続けない契約を追加した。
- Green: `sharedRendererViewportVideoUpload` と `sharedRendererViewportNativeRenderSource` が `No active decode session` だけでなく `No free decode frame slot` もrecoverableなcached decode job失敗として扱うようにした。`NoFreeSlot` の場合は枯れたringを含むsessionをstopしてからstartし直す。
- Green: `Viewport` のpresenter cleanupは次のplayback stateが再生中のときだけ既存controlを保持し、一時停止時はdisposeして破棄済みdecode/upload所有が残らないようにした。
- 版を `0.1.1-Beta-224g` に更新した。

### 検証
- `npm test -- --run src/utils/sharedRendererViewportVideoUpload.test.ts src/utils/sharedRendererViewportNativeRenderSource.test.ts src/utils/viewportRustVideoOnlyBoundary.test.ts` は51件成功。
- `npm test -- --run src/utils/sharedRendererPreviewPresenterController.test.ts src/utils/sharedRendererViewportPresenterOrchestration.test.ts src/utils/sharedRendererExportFrameSourceBoundary.test.ts src/utils/exportTestHarnessBoundary.test.ts` は67件成功。
- `npm run test:export:fast` は ALL PASSED。
- `npx tsc --noEmit` は既存の `ThreeStageViewport.tsx` three型定義、`mp4box` 型定義、既存test fixture型不整合で失敗。今回変更ファイル由来の新規型エラーは確認されていない。

### 残課題・次のステップ
- 実Electron windowで `/Volumes/ExtendSSD-W/GX020052.MP4` を配置し、pause/resumeとexportを連続実行して `NoFreeSlot` が再発しないか確認する。
- `src/e2e/rustVideoPreview.e2e.test.ts` は現在のorchestrationがvideo upload成功時にnative render prepareをskipするため、古いイベント順期待で失敗する。次回、現行仕様に合わせてE2E契約を更新する。

## 2026-06-20 — 実動画export E2Eを通し、共有メモリ名とdecode復旧を修正

### 実施内容
- 実Electron windowで `/Volumes/ExtendSSD-W/GX020052.MP4` を読み込み、動画出力ボタンからRust backend rawvideo/ffmpeg経路でMP4を生成するE2Eを追加した。
- Red: E2Eが実ファイル選択、Timeline配置、Rust shared renderer readiness、動画出力クリック、完了dialog、成果物MP4の存在とサイズを検証する契約を追加した。
- Green: macOSの `shm_open` で失敗していた長すぎるshared memory名を、export sourceは `/uxe-...`、native render outputは `/uxn-...` の短い安定hash名へ変更した。
- Green: Rust backend側では同じdecode jobが既にactiveなのにrenderer側の `activeJobs` cacheが空の状態で `No free decode frame slot: NoFreeSlot` が返る場合も、対象jobをstop/startして同じframe requestをretryするようにした。
- E2E専用に `UXFD_VIDEO_EXPORT_E2E_SAVE_PATH` をElectron mainへ渡し、保存ダイアログを固定出力先へ迂回して、テストが実成果物を確実に検査できるようにした。通常のユーザー操作では従来どおり保存ダイアログを表示する。
- 版を `0.1.1-Beta-224h` に更新した。

### 検証
- `npm test -- --run src/utils/legacyBase64ExportBoundary.test.ts src/utils/sharedRendererViewportNativeRenderSource.test.ts src/utils/sharedRendererViewportVideoUpload.test.ts src/utils/sharedRendererExportFrameSource.test.ts` は72件成功。
- `UXFD_VIDEO_EXPORT_E2E_VIDEO_PATH=/Volumes/ExtendSSD-W/GX020052.MP4 npm run test:video-export:e2e` は成功。
- E2E結果: `エクスポート完了` / `コーデック: Rust backend rawvideo/ffmpeg` / `フレーム: 60` / 出力 `/Users/yuki/GitHub/UX-Film-Director/.codex/video-export-e2e/video-export-e2e-output.mp4` / サイズ `506379` bytes。

### 残課題・次のステップ
- 今回のE2Eは確実な回帰検出のため1秒/60フレームに短縮している。長尺4K exportの速度と安定性は別途計測・最適化する。
- export中のpreviewは `status=fallback / reason=exporting` になる。これはexport中にpreview surfaceを止める既存制御であり、書き出し自体はRust shared-frame sourceで完了している。

## 2026-06-20 — Rust動画exportのrender/writeを1フレーム先読みで重ねる

### 実施内容
- 動画export高速化の初手として、Rust shared-frame exportの `renderNativeSharedFrame` と `encode.writeFrame` を完全直列にせず、現在フレームのwrite中に次フレーム生成を1つだけ先読みするようにした。
- Red: `runRustBackendVideoEncodeExport` に、current frame writeが未完了の間にnext frame generatorが進む契約を追加した。
- Red: current frame writeが失敗した時、先読み済みのnative render outputもreleaseしてリークさせない契約を追加した。
- Green: async iteratorを手動駆動し、`writeSharedFrameToRustBackend(current)` を開始してから `iterator.next()` で次フレームを生成する形へ変更した。
- Green: write失敗時はcurrent frame outputの既存releaseに加え、prefetched frame outputもbest-effortでreleaseするようにした。
- 版を `0.1.1-Beta-224i` に更新した。

### 検証
- `npm test -- --run src/utils/rustBackendVideoEncodeExport.test.ts` は14件成功。
- `npm test -- --run src/utils/rustBackendVideoEncodeExport.test.ts src/utils/rustBackendVideoEncodeControl.test.ts src/utils/projectExportRustEncodeFrame.test.ts src/utils/sharedRendererExportFrameSource.test.ts` は64件成功。
- `UXFD_VIDEO_EXPORT_E2E_VIDEO_PATH=/Volumes/ExtendSSD-W/GX020052.MP4 npm run test:video-export:e2e` は成功。起動込みの実測は約25秒、出力は60 frames / `506379` bytes。

### 残課題・次のステップ
- 今回の改善はrender/write待ちの重なりを作る低リスク施策で、decode/native renderそのものの回数はまだ減っていない。
- 次はE2Eにexport開始から完了までの純粋なdurationを記録し、2〜5秒尺で「先読みあり/なし」の差分を測る。
- その後、native render output ringの再利用、decode requestの順方向バッチ化、ffmpeg encode preset/pipe設定の見直しに進む。

## 2026-06-20 — 動画export E2Eに純粋な書き出し時間を記録

### 実施内容
- 動画export高速化の判断材料として、E2E resultへElectron/Vite起動時間を除いたexportボタン押下から完了dialogまでの `exportDurationMs` を記録するようにした。
- Red: `packageScripts.test` に、`run-video-export-e2e.mjs` が `UXFD_VIDEO_EXPORT_E2E_DURATION_SECONDS`、`exportDurationMs`、`exportFramesPerSecond` を持つ契約を追加した。
- Green: `UXFD_VIDEO_EXPORT_E2E_DURATION_SECONDS` でE2E用timeline durationを可変にし、dialogの `フレーム:` から `exportedFrameCount` を抽出して `exportFramesPerSecond` を算出するようにした。
- 版を `0.1.1-Beta-224j` に更新した。

### 検証
- `npm test -- --run src/utils/packageScripts.test.ts` は2件成功。
- `UXFD_VIDEO_EXPORT_E2E_VIDEO_PATH=/Volumes/ExtendSSD-W/GX020052.MP4 UXFD_VIDEO_EXPORT_E2E_DURATION_SECONDS=1 npm run test:video-export:e2e` は成功。60 frames / `16306` ms / 約 `3.68` fps / `506379` bytes。
- `UXFD_VIDEO_EXPORT_E2E_VIDEO_PATH=/Volumes/ExtendSSD-W/GX020052.MP4 UXFD_VIDEO_EXPORT_E2E_DURATION_SECONDS=2 npm run test:video-export:e2e` は成功。120 frames / `29373` ms / 約 `4.09` fps / `1029465` bytes。

### 残課題・次のステップ
- 現状は1〜2秒の動画only exportで約4fpsに留まっている。次はframe単位に `native render/decode/write` の時間を分解し、最も大きい待ちを優先して削る。
- E2Eのdurationは完了dialog検知のpollingを含むため、より細かい最適化ではrenderer内のexport progress diagnosticsにも開始/終了timestampを入れる。

## 2026-06-20 — native WGPU renderer永続化とRGBA8 readbackで30fps級exportへ到達

### 実施内容
- Rust backendの動画export hot pathで、frameごとにWGPU adapter/device/pipeline/output texture/readback bufferを作り直していた構造を改め、`BackendState` に `NativeWgpuRenderer` を保持して解像度が変わらない限り再利用するようにした。
- native WGPU readback formatを `Rgba16Float` から `Rgba8Srgb` に変更し、CPU側のhalf-float decode / linear-to-srgb変換 / unpremultiply処理を外した。
- Red: native WGPU rendererのsetup時間が永続rendererのframe timingへ入らない契約、Rust backendがrendererを再利用する契約、native WGPU readbackがRGBA8で返る契約を追加済み。
- Green: `NativeWgpuRenderer::new` / `render_frame_stages` / `render_frame_to_shared_ring` を追加し、既存の単発APIは永続rendererを内部利用する互換実装に整理した。
- 版を `0.1.1-Beta-225a` に更新した。

### 検証
- `cargo test --manifest-path native-wgpu-renderer/Cargo.toml --test frame_stage_timings -- --nocapture` は3件成功。
- `cargo test --manifest-path native-wgpu-renderer/Cargo.toml --test native_reference_parity -- --nocapture` は10件成功。
- `cargo test --manifest-path rust-backend/Cargo.toml --test decode_control_plane native_render_shared_frame -- --nocapture` は10件成功。
- `cargo test --manifest-path rust-backend/Cargo.toml --test decode_control_plane native_rendered_image_frame_can_feed_audio_muxed_encode -- --nocapture` は1件成功。
- `npm test -- --run src/utils/rustBackendNativeRenderBoundary.test.ts` は3件成功。
- `cargo build --manifest-path rust-backend/Cargo.toml` は成功。
- `/Volumes/ExtendSSD-W/GX020052.MP4` の実Electron E2Eで、1秒尺は60 frames / 3017ms / 約19.89fps、2秒尺は120 frames / 4348ms / 約27.60fps、5秒尺は300 frames / 8910ms / 約33.67fpsで成功。

### 残課題・次のステップ
- 5秒尺では30fpsを超えたが、短尺では初期化・Electron側待ちの比率が残る。次はRust renderer出力をshared memoryへ書いてからencode側で再読込する往復を削り、Rust内direct encode pathへ寄せる。
- decode frame source textureをframeごとに作り直している可能性が残るため、動画only exportではsource texture/cache再利用を計測してから進める。

## 2026-06-20 — direct native encode RPCを実装し、性能低下のため実験フラグへ隔離

### 実施内容
- Red: Rust backendに `encode.writeNativeFrame` が存在し、native render output shared memory descriptorを返さずにMP4へ書ける契約を追加した。
- Red: Electron/renderer bridgeに `writeNativeEncodeFrame` が露出し、export helperが `nativeEncodeFramePayload` を受けた時に `encode.writeFrame` ではなくdirect RPCへ書く契約を追加した。
- Green: Rust backendに `EncodeWriteNativeFrameParams` と `handle_encode_write_native_frame` を追加し、`NativeWgpuRenderer::render_frame_stages` のRGBA8結果をffmpeg stdinへ直接書けるようにした。
- Green: native render source収集を `collect_native_render_sources` へ共通化し、既存 `render.nativeSharedFrame` と `encode.writeNativeFrame` で共有した。
- Green: Electron main/preload/renderer型へ `rust-backend-encode-write-native-frame` / `writeNativeEncodeFrame` を追加した。
- 実測でdirect pathが遅くなることを確認したため、通常exportでは使わず、`VITE_UXFD_NATIVE_DIRECT_ENCODE=1` の時だけ有効にした。
- 版を `0.1.1-Beta-226a` に更新した。

### 検証
- `npm test -- --run src/utils/sharedRendererExportFrameSource.test.ts src/utils/rustBackendVideoEncodeExport.test.ts src/utils/rustBackendNativeRenderBoundary.test.ts src/utils/rustVideoEncodeIpcChannels.test.ts src/utils/rustVideoEncodeBackendBridge.test.ts src/utils/rustBackendVideoEncodeControl.test.ts` は75件成功。
- `cargo test --manifest-path rust-backend/Cargo.toml --test decode_control_plane native_render -- --nocapture` は15件成功。
- `cargo build --manifest-path rust-backend/Cargo.toml` は成功。
- 通常E2E: `/Volumes/ExtendSSD-W/GX020052.MP4` 5秒尺は300 frames / 8871ms / 約33.82fpsで成功。
- direct opt-in E2E: `VITE_UXFD_NATIVE_DIRECT_ENCODE=1` 2秒尺は120 frames / 8863ms / 約13.54fpsで成功したが、既存経路より明確に遅い。

### 残課題・次のステップ
- 単純なdirect RPC結合は、shared memory往復を消す代わりにrender/writeの先読み重なりを失って遅くなる。次はRust backend内でrender queueとencode queueを分け、direct pathでも2〜3frameのpipelineを維持する設計へ進む。
- 通常exportは30fps級を維持するため、当面はshared native render output経路をデフォルトにする。

## 2026-06-20 — 単一動画の軽量合成fast pathで「軽い素材は軽い」方向へ寄せる

### 実施内容
- Red: renderer側に、単一・無加工・同サイズ動画はdecoded shared frameを直接encoderへ渡し、成功/失敗時にdecode slotを解放する契約を追加した。
- Green: `RustBackendVideoEncodeSharedFramePayloadFrame` に成功/失敗後のshared frame解放callbackを追加し、passthrough frameでもslotをリークしないようにした。
- Green: shared renderer export sourceに `decodedVideoPassthrough` を追加した。ただし適用条件は、単一動画・identity transform・opacity 1・effectsなし・出力サイズ一致に限定した。
- Red: Rust backendに、単一動画を整数座標へ置くだけのnative renderが `cpuSimpleVideoComposite` を返す契約を追加した。
- Green: `render.nativeSharedFrame` で単一Video clip、scale 1、rotation 0、opacity 1、effectsなし、整数translationの場合、WGPU upload/render/readbackを通さずCPU row-copyでoutput shared ringを作るfast pathを追加した。
- 版を `0.1.1-Beta-227a` に更新した。

### 検証
- `npm test -- --run src/utils/sharedRendererExportFrameSource.test.ts src/utils/rustBackendVideoEncodeExport.test.ts` は61件成功。
- `npm test -- --run src/utils/sharedRendererExportFrameSource.test.ts src/utils/rustBackendVideoEncodeExport.test.ts src/utils/rustBackendNativeRenderBoundary.test.ts src/utils/rustVideoEncodeBackendBridge.test.ts src/utils/rustBackendVideoEncodeControl.test.ts src/utils/packageScripts.test.ts` は79件成功。
- `cargo test --manifest-path rust-backend/Cargo.toml --test decode_control_plane native_render -- --nocapture` は16件成功。
- `cargo build --manifest-path rust-backend/Cargo.toml` は成功。
- 実Electron E2E: `/Volumes/ExtendSSD-W/GX020052.MP4` 5秒尺は300 frames / 8518ms / 約35.22fpsで成功した。今回のfast path前に同条件で再測定したWGPU経路は約24.30〜25.17fps、以前の良好値は約33.82fps。

### 残課題・次のステップ
- CPU simple compositeは「単一動画・単純配置」専用。scaleや複数オブジェクト、フィルタが入ると従来のnative WGPU合成へ戻る。
- 次は単純scale付き動画、静止画+動画、音声付きexportの実測を分け、どの時点から重くなるかをE2Eで見える化する。

## 2026-06-20 — exportで低解像度プロキシを使わないように修正

### 実施内容
- Red: previewでは既存プロキシを使い、exportでは原本動画file pathを使う契約を追加した。
- Red: export用decodeではviewport向けの縮小上限を呼び出し側で制御できる契約を追加した。
- Green: `VideoObject` に `sourceWidth` / `sourceHeight` を追加し、動画インポート時に原本metadataを保持するようにした。
- Green: `buildRustSceneSnapshotForTimeline` に `videoSourceMode` を追加し、previewは `previewProxy`、exportは `exportOriginal` を使うようにした。
- Green: export時はプロキシではなく原本sourceを使い、原本サイズをrender-safeな2048px上限へ縮小したmedia referenceにする。visual geometryは `object.width / decodedWidth` のscale補正で維持する。
- Green: export frame sourceはnative render source準備時のdecode edgeを2048へ上げ、640pxプロキシ由来のモニョモニョ画質を避けるようにした。
- 版を `0.1.1-Beta-228a` に更新した。

### 検証
- `npm test -- --run src/utils/rustSceneSnapshot.test.ts src/utils/sharedRendererExportSession.test.ts src/utils/sharedRendererViewportNativeRenderSource.test.ts src/utils/sharedRendererExportFrameSource.test.ts` は76件成功。
- 実Electron E2E: `/Volumes/ExtendSSD-W/GX020052.MP4` 1秒尺は60 frames / 7758ms / 約7.73fpsで成功。出力MP4は1920x1080 / 60fps。

### 残課題・次のステップ
- 品質優先で原本2048px decodeへ戻したため、直前のプロキシ高速経路より速度は落ちる。次は「原本高品質decode + 単純scale合成fast path」を追加して、画質と速度を両立する。

# 2026-06-21 — 実Electron動画export E2Eに混在メディア投入を追加

## 実施内容
- Red: `packageScripts` に、動画export E2E scriptが `UXFD_VIDEO_EXPORT_E2E_ADD_MIXED_MEDIA` と `mixedMediaResult` を持つ契約を追加した。
- Green: `UXFD_VIDEO_EXPORT_E2E_ADD_MIXED_MEDIA=1` の時、実Electron windowで動画に加えて図形・`public/icon.jpg`・生成WAVをUI経由でTimelineへ追加してからexportするようにした。
- 画像追加完了前に音声追加を走らせると `insertTarget` が競合するため、各Timeline item出現を待ってから次の入力へ進むようにした。

## 検証
- `npm test -- --run src/utils/packageScripts.test.ts` は4件成功。
- `UXFD_VIDEO_EXPORT_E2E_ADD_MIXED_MEDIA=1 UXFD_VIDEO_EXPORT_E2E_DURATION_SECONDS=1 UXFD_VIDEO_EXPORT_E2E_TIMEOUT_MS=240000 npm run test:video-export:e2e` は成功。
- 実測: `GX010052.MP4` / `Rectangle` / `icon.jpg` / `mixed-audio.wav` を含むTimelineから `Rust backend rawvideo/ffmpeg` で300 frames、2,719,114 bytesのMP4を出力した。

## 残課題・次のステップ
- `UXFD_VIDEO_EXPORT_E2E_DURATION_SECONDS=1` でも混在ケースは300 frames出力になり、57.3秒 / 約5.23fpsだった。次は混在時にもproject durationを短縮できるようにし、画像/図形/音声入りnative renderの速度を測る。

# 2026-06-21 — 全読込可能メディアRust境界E2Eの実行導線を追加

## 実施内容
- Red: `packageScripts` に `test:all-readable-media:e2e` の契約を追加し、未定義で失敗することを確認した。
- Red: 全読込可能メディアE2Eを強化し、図形・画像・PSDのsub-pixel translation / scaleがRust snapshotに残ることを確認するようにした。
- Green: `package.json` に `test:all-readable-media:e2e` scriptを追加した。

## 検証
- `npm test -- --run src/utils/packageScripts.test.ts src/e2e/allReadableMedia.e2e.test.ts` は5件成功。
- `npm run test:all-readable-media:e2e` は1件成功。

## 残課題・次のステップ
- 次は実Electron windowで画像・音声・動画を追加して、実export成果物の音声/映像/進捗を確認するE2Eへ広げる。

# 2026-06-21 — sub-pixel配置をRust scene snapshotへ移管

## 実施内容
- Red: 図形・画像・PSD・動画の `x/y` が小数でも `translation_x/translation_y` としてRust scene snapshotへ残る契約を追加した。
- Green: shared renderer transform gateの整数translation制限を撤廃し、finite translation / positive finite scale / finite rotationをRust境界へ渡すようにした。
- Green: preview/export sessionにもsub-pixel画像配置の契約を追加し、Pixi fallbackではなくshared renderer comparison/export surfaceへ進むようにした。
- 設計ドキュメントを更新し、SceneSnapshot/native render境界はsub-pixel translationを扱い、整数translation専用fast pathは最適化として残ることを明記した。
- 版を `0.1.1-Beta-234a` に更新した。

## 検証
- `npm test -- --run src/utils/rustSceneSnapshot.test.ts src/utils/sharedRendererPreviewBridge.test.ts src/utils/sharedRendererPreviewSurface.test.ts src/utils/sharedRendererExportSession.test.ts` は29件成功。
- `npm test -- --run src/utils/sharedRendererExportFrameSource.test.ts src/utils/projectExportFrameCanvas.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/sharedRendererPreviewPresenterController.test.ts` は127件成功。
- `cargo test --manifest-path native-wgpu-renderer/Cargo.toml --test native_reference_parity` は10件成功。

## 残課題・次のステップ
- mask / group / blur / shadowなどの複雑filterはまだfail-loud。次は実ウィンドウE2Eで画像・PSD・動画・音声を混在させ、Rust exportの見た目・音声・速度を確認する。

# 2026-06-20 — Canvas media scaleをRust scene snapshotへ移管

## 実施内容
- UIはTypeScript/Reactのまま維持し、Canvas描画結果に関わる画像・PSD・SolidColour矩形のscale transformをRust scene snapshotへ渡す境界に変更した。
- Red: `rustSceneSnapshot` に、画像・PSD・SolidColour矩形の正の有限 `scaleX/scaleY` が `scale_x/scale_y` としてRust境界へ残る契約を追加した。
- Green: 非動画のscale 1固定gateを撤廃し、正の有限scaleと整数translationをshared renderer対応範囲として扱うようにした。
- Green: preview/export surfaceの旧Pixi fallback期待を更新し、スケール付き画像もshared renderer comparison/export sessionへ進む契約にした。
- 版を `0.1.1-Beta-233a` に更新した。

## 検証
- `npm test -- --run src/utils/rustSceneSnapshot.test.ts src/utils/sharedRendererPreviewBridge.test.ts src/utils/sharedRendererPreviewSurface.test.ts src/utils/sharedRendererExportSession.test.ts src/utils/sharedRendererExportFrameSource.test.ts src/utils/projectExportFrameCanvas.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts` は109件成功。
- `cargo test --manifest-path native-wgpu-renderer/Cargo.toml --test native_reference_parity` は10件成功。

## 残課題・次のステップ
- まだサブピクセルtranslation、複雑なmask/group/filterはfail-loudのまま。次はCanvas系の回転・画像/PSD混在・音声付きexportをE2Eで確認し、Rust/native render側の実フレーム品質と速度を測る。
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

## 2026-06-22 — 93音声玉source JSONをRust export境界で受理

### 実施内容
- Red: 93音声玉の `audio-sphere-93` source JSONが、波形専用の `thickness` / `amplitude` を含まなくてもRust境界で受理される契約を追加した。
- Green: `AudioWaveformSource` の `thickness` / `amplitude` をgenerator別の任意フィールドへ変更し、`audio-waveform-r` の場合だけ必須検証するようにした。
- Green: native-wgpu-rendererの93音声玉テストを、実際のTypeScript snapshotが出す最小JSONへ寄せた。
- 版を `0.1.1-Beta-293b` に更新した。

### 検証
- `cargo test --manifest-path rust-core/Cargo.toml --test audio_waveform_scene -- --nocapture` は3件成功。
- `cargo test --manifest-path native-wgpu-renderer/Cargo.toml native_wgpu_renders_generated_audio_sphere_frame_from_audio_samples -- --nocapture` は1件成功。
- `cargo test --manifest-path rust-backend/Cargo.toml --test decode_control_plane native_render -- --nocapture` は22件成功。

### 残課題・次のステップ
- 実Electron E2Eで、GetColor / hksy / 93優先効果を混在させた動画exportが通るか再確認する。

## 2026-06-22 — Rust所有cutoverでPixi WebGPU context破壊を回避

### 実施内容
- Red: Rust/shared renderer所有のSolidColour shape cutover時と、Rust video専有時に、PixiのGPU contextをdestroyしない契約を追加した。
- Green: shape/video cutoverを `removeChildren()` + `destroy({ context: true })` から、生成効果と同じ `hidePixiChildrenForSharedRendererCutover` に切り替えた。
- 版を `0.1.1-Beta-293c` に更新した。

### 検証
- `npm test -- --run src/utils/pixiRenderHelperGeneratedEffectCutover.test.ts src/utils/viewportRustVideoOnlyBoundary.test.ts src/utils/pixiSolidColourCutover.test.ts --reporter=dot` は30件成功。
- `UXFD_VIDEO_EXPORT_E2E_ADD_MIXED_MEDIA=1 UXFD_VIDEO_EXPORT_E2E_ADD_AVIUTL_GENERATED_EFFECTS=1 UXFD_VIDEO_EXPORT_E2E_DURATION_SECONDS=1 UXFD_VIDEO_EXPORT_E2E_TIMEOUT_MS=240000 npm run test:video-export:e2e` は成功。60/60フレームを書き出し、生成効果画素検査が通り、`runtimeErrors` は空。
- `npx tsc --noEmit` は既知の `ThreeStageViewport.tsx` のthree型、`mp4box` 型、`heavyEffectsStress.test.ts` の `PositionKeyframe` 型エラーのみで、今回変更由来の型エラーは出ていない。

### 残課題・次のステップ
- GetColor / hksy / 93優先効果の代表exportは通った。次は画素検査対象をGetColor/hksy/SpotLight/93音声玉固有色や形状へ広げるか、次のAviUtlPackV4優先候補をRust生成効果へ追加する。

## 2026-06-22 — AviUtl優先効果のexport E2E固有画素検査を追加

### 実施内容
- Red: `test:video-export:e2e` が、GetColor V2R、hksyチェッカー/グリッド、93 SpotLight、93音声玉それぞれの固有画素検査フィールドを持つ契約を追加した。
- Green: E2E専用hookでAviUtl優先効果を画面上に分離配置し、export後のRGBAフレームから領域別に代表色を検査するようにした。
- Green: `generatedEffectsFrameInspection` に `getColorCyanPixelCount`、`hksyDarkCellPixelCount`、`spotLightWarmPixelCount`、`audioSphereCyanPixelCount` を追加した。
- 版を `0.1.1-Beta-293d` に更新した。

### 検証
- `npm test -- --run src/utils/packageScripts.test.ts --reporter=dot` は6件成功。
- `UXFD_VIDEO_EXPORT_E2E_ADD_MIXED_MEDIA=1 UXFD_VIDEO_EXPORT_E2E_ADD_AVIUTL_GENERATED_EFFECTS=1 UXFD_VIDEO_EXPORT_E2E_DURATION_SECONDS=1 UXFD_VIDEO_EXPORT_E2E_TIMEOUT_MS=240000 npm run test:video-export:e2e` は成功。60/60フレームを書き出し、`runtimeErrors` は空。
- 実E2Eの固有画素検査は `getColorCyanPixelCount=14080`、`hksyDarkCellPixelCount=6405`、`spotLightWarmPixelCount=2393`、`audioSphereCyanPixelCount=1903` で、各最小閾値を上回った。
- `npx tsc --noEmit` は既知の `ThreeStageViewport.tsx` のthree型、`mp4box` 型、`heavyEffectsStress.test.ts` の `PositionKeyframe` 型エラーのみで、今回変更由来の型エラーは出ていない。

### 残課題・次のステップ
- GetColor / hksy / 93代表効果は、タイムライン投入だけでなくexport結果内の固有画素まで確認できた。次はAviUtlPackV4の次候補を選び、Rust生成効果またはRust/WebGPU effectへ追加する。

## 2026-06-22 — hksy直線をRust生成プリセットへ追加

### 実施内容
- Red: `hksy-line` がAviUtlPackV4カタログへ入り、Timeline右クリックメニューとfactoryから `hksy 直線` を追加できる契約を作った。
- Green: `buildHksyLineObject` を追加し、既存の `hksy_checker_grid` / `GeneratedHksyCheckerGrid` 経路を使う線のみプリセットとして標準搭載した。
- Green: Timeline右クリックメニューに `hksy直線を追加` / `Add hksy Lines` を追加した。
- 版を `0.1.1-Beta-294a` に更新した。

### 検証
- `npm test -- --run src/utils/hksyCheckerGridObjectFactory.test.ts src/utils/aviutlPackFeatureCatalog.test.ts src/components/TimelineContextMenu.particle.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/projectFile.test.ts src/utils/projectExportFrameCanvas.test.ts src/utils/sharedRendererNativeMediaSupport.test.ts src/utils/pixiGeneratedEffectCutover.test.ts --reporter=dot` は104件成功。
- `cargo test --manifest-path rust-backend/Cargo.toml generated_hksy_checker_grid_source_frame_contains_checker_cells_and_grid -- --nocapture` は1件成功。
- `npm test -- --run src/utils/packageScripts.test.ts --reporter=dot` は6件成功。
- `npx tsc --noEmit` は既知の `ThreeStageViewport.tsx` のthree型、`mp4box` 型、`heavyEffectsStress.test.ts` の `PositionKeyframe` 型エラーのみで、今回変更由来の型エラーは出ていない。

### 残課題・次のステップ
- hksy系はチェッカー/グリッド/直線までRust生成メディアへ乗った。次はhksy複数色チェッカー、またはGetColorの画像サンプリング寄り拡張へ進む。

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
