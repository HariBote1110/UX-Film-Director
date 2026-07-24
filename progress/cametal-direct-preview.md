# CAMetalLayer直接プレビュー

## 結論

- 対応する非動画シーンと、可視動画が1件までの混在シーンは、
  完成済みRGBAフレームをCPUへ読み戻さず、Native Overlay内でsourceを揃えて
  WGPUから`CAMetalLayer`へ直接presentする。
- `GeneratedGetColorDots`、HKSY、SimpleTubeを含む生成ソース、テキスト、単色、
  PNG画像は、Rust backendとNative Overlayで共有する生成関数からRGBA sourceを
  構築する。静的sourceはrevision cacheで再利用する。
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

- GetColor、HKSY、SimpleTube、テキストなどのsourceは初回またはrevision変更時に
  Rust側CPUでラスタライズしてGPUへuploadする。静的sourceはrevision cacheにより
  毎frameの再生成・再uploadを行わない。
- ParticleはGPU instance描画済みであり、CPU RGBA source生成・uploadを行わない。
- 動画はVideoToolboxのNV12 IOSurfaceをNative Overlayへ直接import済みであり、
  このdirect present経路ではRGBA shared frameを経由しない。
- 音声波形と音声球はPCM windowをWGPU storage bufferへ送り、GPU上でsource textureを
  生成する。texture/storage bufferはmedia単位で再利用し、CPU RGBA upload cacheを
  通らない。export/readback/共有リング/BGRA IOSurface経路の同一合成へ接続済みである。
  AudioSphereはresident ProjectからNative Overlayへ接続済みで、対象音源をRust側で
  一度だけ8 kHz PCMへデコードし、frameごとのffmpeg起動やChromium IPCを行わない。
  通常の音声波形objectのresident Project変換は未対応である。
- 診断traceを有効にした実機再生ではElectron renderer、Rust backend、Electron
  mainのCPU使用率が高く、直描画だけでCPU負荷問題が解消したとは判断しない。

次のGPU化候補は、優先順に以下とする。

1. 通常の音声波形objectもresident Projectへ追加し、AudioSphereと同じPCM cacheを使う。
2. GetColor、HKSY、SimpleTubeなどCPUラスタライズの生成sourceをcompute shaderへ
   移し、revision変更時のCPU処理も削減する。
3. 複数動画、PSD、PNG以外の静止画を含むsceneのdirect present適格性を、同じ
   zero-copy/Native source契約で段階的に広げる。

## 採用しなかった案

- 対応可否を調べず全シーンを直描画する案は、`MissingSource`や複数動画欠落を
  再発させるため採用しない。
- scene-only presentへシーン解像度の透明dummy frameを渡す案は、不要な全画面転送を
  残すため採用しない。
- CAMetalLayerへpresentできたことを「GPUオフロード完了」と扱う案は、CPU生成と
  動画転送が残るため採用しない。
