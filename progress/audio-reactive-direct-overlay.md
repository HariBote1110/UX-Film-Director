# 音声生成物のNative Overlay直接提示

## 決定

- 動画を含まない`GeneratedAudioWaveform`と`GeneratedAudioSphere`を、
  renderer側PCM抽出と`render.nativeSharedFrame`による完成RGBA生成を経由させず、
  Native Overlay addonの`presentScene`へ直接渡す。
- Electron main所有のnative playback clockでも、同じ2種を
  `unsupportedDirectMedia`にせずresident scene presentへ渡す。
- renderer側の動画経路はdecode済み1枚を`presentSharedFrame`へ注入する方式で、
  addonのresident PCM descriptorを組み立てない。このため
  **Video＋音声生成物の混在は引き続きdirect scene不適格**とする。
- addonがscene payloadだけから構築できるsource種別の可否は
  `isNativeOverlayDirectMediaSourceSupported`へ一本化する。動画本数や組合せなど
  セッション全体の制約は別判定として残す。
- direct提示前に既存のnative media schema検証を再利用し、音声ターゲット欠落や
  壊れた生成sourceをaddonへ渡さない。

## 根本原因

Native Overlay addonには既に次の実装が揃っていた。

- `target_source`の音声をresident PCM cacheへ一度だけdecodeする。
- 現在の`source_frame`に対応するsample windowを切り出す。
- `NativeAudioReactiveSource`をnative WGPU rendererへ渡す。
- 音声波形・音声球をGPU生成し、他のnative sourceと同じCAMetalLayerへ合成する。

しかしrendererのdirect scene適格性、native-render-onlyの`presentScene`分岐、
Electron main所有再生のmedia適格性という3箇所が、両media kindを明示拒否していた。
そのため実装済みsourceでもChromium WebGPU presenterまたはshared RGBA経路へ
フォールバックしていた。

## 経路

動画なし音声生成物:

1. `isNativeOverlayDirectSceneSession`が適格と判定する。
2. `prepareSharedRendererViewportNativeRenderOverlayPresent`が
   renderer側の`requestAudioWaveformSamples`を呼ばず`presentScene`を呼ぶ。
3. addonがresident PCMを解決し、GPU audio reactive sourceとして直接提示する。

native media schemaを満たさないsourceは`presentScene`より前に拒否する。
renderer側ではnative-render-onlyの非対応診断、Electron main所有再生では
`unsupportedDirectMedia`として既存時計へ戻す。有効なschemaを通過した後の
addon側parse、ffmpeg PCM decode、GPU present失敗は、既存の
`nativeOverlayPresentFailed`診断とpresenter再起動を通じてDOM/WebGPU経路へ
フォールバックする。

renderer decoded-frame提示関数自身もdirect scene適格性を確認する。Video要求が
存在し、かつ音声生成物が混在する場合はdecode開始前に拒否する。一方、空セッションは
削除済みフレームを消去する既存契約のため、従来どおり`noVideoDecodeRequest`を返す。

## 検証

- renderer direct eligibility:
  - 音声波形のみ・音声球のみは適格。
  - Video＋音声波形、Video＋音声球は不適格。
  - resident PCM target欠落と壊れた生成sourceは不適格。
- native-render-only orchestration:
  - 両media kindで`presentScene`を使用。
  - renderer側PCM要求、shared RGBA render、shared frame uploadを呼ばない。
- Electron main playback:
  - 両media kindを`presentScene`へ渡して再生を開始する。
  - resident PCM target欠落は`unsupportedDirectMedia`でaddon呼び出し前に拒否する。
- frontend全体: 230 test files、1670 tests PASS。
- `npx tsc --noEmit --pretty false` PASS。
- native-overlay:
  `direct_audio_sphere_scene_reuses_resident_pcm_and_skips_cpu_rgba` PASS。

## 対象外・残件

- Video＋音声生成物はrenderer decoded-frame注入経路にresident PCM sourceを
  供給する設計が必要。
- PSDは`active_layer_ids`をNative Overlay payloadへ運んで合成loaderへ渡す必要がある。
- JPEGはaddonのimage loaderがPNG固定であり、JPEG decoderの配線が必要。
- 複数Videoはrenderer側のsingle decoded-frame routingとframe lease管理の変更が必要。
- direct `presentScene`の実GPU readback診断はrenderer/E2Eまで伝播していない。
  現在はnative-overlayのresident PCM契約とnative-wgpu-rendererの既存GPU画素テスト、
  TypeScript経路テストを組み合わせて検証している。live surfaceの非透明画素を
  E2E gateにするには、readback診断のbridge伝播を別作業で追加する。
