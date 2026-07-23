# CAMetalLayer直接プレビュー

## 結論

- 対応する非動画シーンと、可視動画が1件までの混在シーンは、
  完成済みRGBAフレームをCPUへ読み戻さず、Native Overlay内でsourceを揃えて
  WGPUから`CAMetalLayer`へ直接presentする。
- `GeneratedGetColorDots`を含む生成ソース、テキスト、単色、PNG画像は、
  Rust backendとNative Overlayで共有する生成関数からRGBA sourceを構築する。
- 直描画の適格性はシーン開始前に判定する。Native Overlayがsourceを構築できない
  PSD、音声波形、音声球、PNG以外の画像、可視動画が複数あるシーンは、
  `render.nativeSharedFrame`を使う従来経路へ安全にフォールバックする。

## 描画経路

### 非動画シーン

`SceneSnapshot`とmedia参照をNative Overlayへ渡し、参照されるsourceだけを生成する。
生成したGPU textureを合成し、`CAMetalLayer`のdrawableへ直接presentする。
この経路では、シーン全体と同じ大きさの完成RGBAフレームを生成・共有しない。

### 動画1件を含む混在シーン

VideoToolboxでデコードした動画フレームと、Native Overlay側で構築した生成sourceを
同じWGPU sceneへ渡し、`CAMetalLayer`へ直接presentする。
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

- GetColorなどの生成sourceは現在CPUでラスタライズしてからGPUへuploadする。
- scene generationが変わるたび、静的な生成sourceも再構築・再uploadされ得る。
- 動画はVideoToolboxでデコードするが、Native Overlayへの受け渡しではRGBA shared
  frameを経由する。Rust backend側にあるNV12 IOSurface直接importは、このOverlay
  present経路にはまだ接続していない。
- 診断traceを有効にした実機再生ではElectron renderer、Rust backend、Electron
  mainのCPU使用率が高く、直描画だけでCPU負荷問題が解消したとは判断しない。

次のGPU化候補は、優先順に以下とする。

1. media revision単位で生成source textureをキャッシュし、静的sourceの再生成と
   再uploadを止める。
2. VideoToolboxのNV12 IOSurfaceをNative Overlayへ直接importし、RGBA shared
   frameへの変換と複写を除去する。
3. 時間依存の生成エフェクトをcompute shaderへ移す。

## 採用しなかった案

- 対応可否を調べず全シーンを直描画する案は、`MissingSource`や複数動画欠落を
  再発させるため採用しない。
- scene-only presentへシーン解像度の透明dummy frameを渡す案は、不要な全画面転送を
  残すため採用しない。
- CAMetalLayerへpresentできたことを「GPUオフロード完了」と扱う案は、CPU生成と
  動画転送が残るため採用しない。
