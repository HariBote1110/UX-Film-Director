# CAMetalLayer直接プレビュー

## 結論

- 対応する非動画シーンと、可視動画が1件までの混在シーンは、
  完成済みRGBAフレームをCPUへ読み戻さず、Native Overlay内でsourceを揃えて
  WGPUから`CAMetalLayer`へ直接presentする。
- SimpleTubeを含む生成ソース、テキスト、単色、PNG画像は、Rust backendと
  Native Overlayで共有する生成関数からRGBA sourceを構築する。静的sourceは
  revision cacheで再利用する。
- `GeneratedGetColorDots`は例外で、完成RGBA sourceをCPUで構築しない。配置パラメータと
  必要なサンプル画像だけをNative WGPUへ渡し、ドット形状、画像サンプリング、色相変換、
  枠線をGPU source passで描画する。
- `GeneratedParticle`は例外で、RGBA sourceを構築しない。粒子パラメータと
  source frameをNative WGPUのinstance描画へ直接渡し、GPU上で時間変化を描画する。
- `GeneratedAudioSphere`もRGBA sourceを構築しない。Rust overlayのresident PCM
  cacheから現在windowを切り出し、Native WGPUのstorage bufferからGPU描画する。
- `SpotLight`はsceneの`effects`としてN-API境界を通過し、Native WGPU compositor
  のfragment shaderで適用する。ChromiumのCanvas/WebGPUでエフェクトを合成しない。
- 直描画の適格性はシーン開始前に判定する。Native Overlayがsourceを構築できない
  PSD、通常の音声波形、PNG以外の画像、可視動画が複数あるシーンは、
  `render.nativeSharedFrame`を使う従来経路へ安全にフォールバックする。

## 描画経路

### 非動画シーン

`SceneSnapshot`とmedia参照をNative Overlayへ渡し、参照されるsourceだけを生成する。
生成したGPU textureを合成し、`CAMetalLayer`のdrawableへ直接presentする。
この経路では、シーン全体と同じ大きさの完成RGBAフレームを生成・共有しない。

### 動画1件を含む混在シーン

VideoToolboxでデコードした動画フレームをNV12 `IOSurface`としてNative Overlayへ
直接importし、Native Overlay側で構築した生成sourceと同じWGPU sceneへ渡して
`CAMetalLayer`へpresentする。動画画素はChromiumやCPU RGBA shared frameを通らない。
動画1件だけを渡したまま全シーンを合成しようとしていた旧経路と異なり、
参照される生成sourceも同時に揃うため、`MissingSource`にならない。

## 廃止できた往復

対応シーンの通常プレビューでは、次の全画面RGBA往復を行わない。

1. `render.nativeSharedFrame`でGPU合成する。
2. 完成フレームをGPUからCPUへ読み戻す。
3. shared memoryへ複写する。
4. Native Overlayが同じ完成フレームをGPUへ再アップロードする。

scene-only presentでは、既存の一貫したscene fitting、装飾、present処理を再利用する
ため、参照されない1×1透明uploadを内部入口として使う。このuploadは完成フレーム
ではなく、シーン解像度に比例する転送も発生しない。

## エフェクト境界

`SceneSnapshot`内の`effects`はRust compositorが直接解釈できるため、
CAMetalLayer直描画でも必ず保持する。以前はTS側のsnapshotには存在していたが、
N-API用clip payloadにフィールドがなく、overlayで`effects: Vec::new()`へ
置き換えられていた。このため直描画だけ色補正・ぼかし・輪郭などが無音で脱落した。

2026-07-24以降は、rust-coreのexternally-tagged `Vec<Effect>`を`effectsJson`
としてN-API境界へ渡し、native-overlayが同じrust-core型へ復元する。
Effect variantをTS/N-API/Rustで三重定義せず、rust-coreのserde契約を正本とする。
不正JSONはエフェクトなしへ退避せず、scene payloadエラーとして拒否する。

## `MissingSource`診断

`MissingSource`は描画失敗そのものではなく、Overlayへ渡した
`SceneSnapshot`が要求するmedia sourceをOverlay側で構築できないときの契約違反だった。
今回、次の2段階で防止する。

- 生成ソースとテキスト、単色、PNG画像をNative Overlay自身が構築する。
- 構築不能なsourceや複数動画を含むシーンは、present前の適格判定で直描画対象から外す。

エラー表示だけを隠したり、欠けたsourceのままpresentを試したりはしない。

## 実機確認

2026-07-23にElectron実アプリで1920×1080、60 fpsのプロジェクトを使い、
次を確認した。

- GetColor V2R Dot Field単体がNative Overlayへ表示される。
- 動画とGetColorを重ねた混在シーンで、両方が同じviewportへ合成される。
- 非動画では`presentSceneTrace`、混在では`presentSharedFrameTrace`が成功する。
- `MissingSource`が発生しない。
- 対応シーンでは`render.nativeSharedFrame`が呼ばれない。

## CPUとGPUの境界

今回の変更で最も重い全画面完成RGBAの読戻し・共有・再uploadは除去したが、
GPUオフロードはまだ完了していない。

- テキストなど、まだGPU source passへ移していないsourceは初回またはrevision変更時に
  Rust側CPUでラスタライズしてGPUへuploadする。静的sourceはrevision cacheにより
  毎frameの再生成・再uploadを行わない。
- ParticleはGPU instance描画済みであり、CPU RGBA source生成・uploadを行わない。
- 動画はVideoToolboxのNV12 IOSurfaceをNative Overlayへ直接import済みであり、
  このdirect present経路ではRGBA shared frameを経由しない。
- 通常の音声波形と音声球はPCM windowをWGPU storage bufferへ送り、GPU上でsource textureを
  生成する。texture/storage bufferはmedia単位で再利用し、CPU RGBA upload cacheを
  通らない。export/readback/共有リング/BGRA IOSurface経路の同一合成へ接続済みである。
  AudioSphereはresident ProjectからNative Overlayへ接続済みで、対象音源をRust側で
  一度だけ8 kHz PCMへデコードし、frameごとのffmpeg起動やChromium IPCを行わない。
- 通常の音声波形objectもresident Projectへ変換され、同じPCM cacheを利用する。
- GetColorは列・行ごとの配置だけをrevision変更時にCPUで前計算し、ピクセル走査、
  source画像のnearest sampling、HSV変換、circle/square/diamondと枠線の描画を
  Native WGPUへ移した。出力textureはmedia revision単位で再利用する。PNG/JPEG/PSDの
  sample画像はRustで一度だけ読み、resident sample cacheへ保持する。
- HKSYはchecker-gridとdiamondをfullscreen fragment pass、measured-gridと
  anchor-lineをGPU line instance passへ移した。完成RGBAのCPUラスタライズとuploadを
  direct previewから除去し、media revision単位の出力textureを再利用する。
  GPU cacheは512 MiB上限と30フレームidle退避を持つ。
- SimpleTubeはtube/torusの点座標、色、fogをrevision変更時にRustでline instanceへ
  展開し、ピクセル走査と有限線分のラスタライズをNative WGPUへ移した。CPU正本と同じ
  線順序、丸端、透明背景を保持し、完成RGBAのCPU生成とuploadをdirect previewから
  除去した。GPU出力textureはmedia revision単位で再利用し、512 MiB上限と
  30フレームidle退避を持つ。
- FocusLinesPlusは最大511本のrayをrevision変更時にRustでquad instanceへ展開し、
  triangle rasteriseをNative WGPUへ移した。`keyframeInterval=0`ではsource frameが
  進んでも同じGPU textureを再利用し、既定設定で発生していた毎フレームのCPU完成RGBA
  生成とuploadを除去した。正のintervalではframe bucket境界だけをrevisionに含める。
- ShakingPolygonは揺れた頂点列をsource frameごとにRustで生成し、多角形fill、
  丸端の輪郭線、頂点discを同一WGPU render passで描画する。repeatごとの
  `fill → outline → vertex`順と上書き合成を保持し、direct previewのCPU完成RGBA生成と
  uploadを除去した。GPU textureはmedia revision単位で再利用し、512 MiB上限と
  30フレームidle退避を持つ。
- ShatteredSphereは最大64×64 fragmentを12 vertex/instanceの4 triangle fanとして
  Native WGPUで描画する。60 fps基準の時間、決定論ノイズ、fragment色とalpha、
  `blend: None`による後描き優先を保持する。同一設定ではsource frameが進んでも
  textureを再生成せず、uniform更新と同じtextureへのrenderだけを行う。direct previewの
  CPU完成RGBA生成とuploadを除去し、GPU cacheは512 MiB上限と30フレームidle退避を持つ。
- Beta-474aでShakingPolygonとShatteredSphereのGPU descriptorをshared frame、
  RGBA readback export、VideoToolboxのBGRA IOSurface exportへ接続した。両sourceを
  CPU RGBA収集から除外し、GPU sourceがあるsceneではCPU simple compositorを選ばない。
  macOS統合テストでは空のCPU RGBA mapからShakingPolygonをBGRA IOSurfaceへ直接描画し、
  readback時間0と有色ピクセルを確認した。
- Beta-475aで7種類の生成GPU source（Particle、GetColor、HKSY、SimpleTube、
  FocusLinesPlus、ShakingPolygon、ShatteredSphere）を
  `NativeGeneratedGpuSources`へ集約した。shared frame、RGBA readback、
  BGRA IOSurfaceの各入口は個別のmapを受け取らず、このbundleを正本とする。
  これにより新しいGPU sourceを追加したときに出力経路の一部だけへ渡し忘れる構造を
  解消した。GetColorはexport/shared frameでもCPU完成RGBAを生成せず、sample画像だけを
  RustのLRU cacheに常駐させる。cache keyとGPU revisionには画像パス、mtime、サイズ、
  PSD active layerを含め、外部編集時だけ再デコード・再uploadする。
- Beta-476aでHKSYとSimpleTubeも同じbundleへ接続し、shared frameとexportの
  CPU完成RGBA生成を除去した。両sourceは時間非依存の設定revisionを使うため、
  source frameが進んでも同じGPU textureを再利用する。
- Beta-477aでParticleとFocusLinesPlusも同じbundleへ接続した。これにより
  `NativeGeneratedGpuSources`の7フィールドすべてをbackendが構築し、direct preview、
  shared frame、RGBA readback、BGRA IOSurface exportの全経路で同じdescriptor契約を
  使う。Particleは時間で変わる`source_frame`と設定revisionを分離し、instance設定を
  再利用する。FocusLinesPlusは`keyframeInterval`から求めるframe bucketだけを
  revisionへ含め、その計算をCPU参照描画、direct overlay、WGPU、exportで共通化した。
- Beta-478aでGeneratedHologramの回転、prism band、stripe、tint、HSV gradientを
  fullscreen fragment passへ移した。1920×1080の重量fixtureを追加し、CPU完成RGBA mapを
  空にしたdirect preview、shared frame、exportで同じ静的GPU textureを再利用する。
  初回E2Eで常駐Rust Projectだけが`hologram`を`unsupportedObjectType`として拒否する
  型境界漏れを検出し、`GeneratedHologramPlane`へ接続した。
- 診断traceを有効にした実機再生ではElectron renderer、Rust backend、Electron
  mainのCPU使用率が高く、直描画だけでCPU負荷問題が解消したとは判断しない。
- CDP traceを重量E2Eへ統合した代表測定では、Renderer main threadのScriptが
  約403～415 ms、Layoutが約28 ms、Style再計算が約9 msだった。上位処理は
  React DOM開発ビルドの同期callbackだった。React Profilerでcomponent別に分離すると、
  Timelineが67 commit・合計211.55 ms・平均3.16 msで主要因と確認できた。
- Timeline本体から再生時刻の購読を外し、2本のplayheadだけへ局所化した後は、
  代表実行の平均commit時間が0.88 msまで低下した。これはChromium側のUI更新削減であり、
  GPU化とは別だが、Rust側へ移した再生clockの効果をUI全体の再描画で相殺しないために必要。
- 書き出し中のRust preview評価を抑止し、書き出し終了時に現在frameを再要求する。
  これによりexport用surface gateの`exporting`状態がpreviewへ残留しない。

次のGPU化・Rust移管候補は、優先順に以下とする。

1. Rust exportが未対応sourceでblockedになった場合だけ到達するlegacy canvas
   captureを、残る生成source・Text・Shapeのnative化により到達不能にする。
2. CAMetalLayer direct presentが利用可能な場面ではChromium WebGPU presenterと
   browser側GPU capability probeを起動しない契約を固定する。presenter自体は
   native direct非対応環境のfallbackとして隔離する。
3. 残る29種類のCPU完成RGBA生成sourceを、画素数、時間依存性、重量fixtureでの
   利用頻度から順にGPU descriptorへ移す。次はTartanCheck、Houndstooth、Yagasuri、
   AsanohaPatternを共通procedural pattern passへまとめ、その後に
   PlainEffectorLineをline instance基盤へ載せる。Text・GeneratedShapeは単発effect
   とは別の共通vector/text source境界として設計する。
4. 複数動画、PSD、PNG以外の静止画を含むsceneのdirect present適格性を、同じ
   zero-copy/Native source契約で段階的に広げる。
5. ShakingPolygonのsource frame更新で行うtexture再生成を、同一textureへの
   geometry buffer更新とrenderへ変え、Metal resource churnを減らす。
6. 3D StageのThree.js/WebGLは2D compositorの残作業と混ぜず、camera、controls、
   billboard、selectionを含む独立したRust renderer移行として扱う。

## 採用しなかった案

- 対応可否を調べず全シーンを直描画する案は、`MissingSource`や複数動画欠落を
  再発させるため採用しない。
- scene-only presentへシーン解像度の透明dummy frameを渡す案は、不要な全画面転送を
  残すため採用しない。
- CAMetalLayerへpresentできたことを「GPUオフロード完了」と扱う案は、CPU生成と
  動画転送が残るため採用しない。
