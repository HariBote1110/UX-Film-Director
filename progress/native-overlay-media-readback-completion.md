# Native Overlay media搬送とlive readbackの完了

日付: 2026-07-28  
版: 0.1.1-Beta-484a

## 決定

Native Overlayの直接提示について、次の4点を同じresident scene境界で完了した。

- JPEGをPNGと同じImage payloadからnative addonで直接decodeする。
- PSDの`active_layer_ids`をTypeScript、Electron、N-API、Rustへ搬送し、
  Rust backendの既存PSD compositorで選択レイヤーを合成する。
- Electron main所有のnative playbackで、異なるmedia IDの複数Videoと
  Video＋`GeneratedAudioWaveform`／`GeneratedAudioSphere`を同じ
  `presentScene`へ一括搬送する。
- CAMetalLayerの実drawableをreadbackし、同じsceneのoffscreen reference renderとの
  最大チャンネル差をE2E gateにする。

renderer側の`presentSharedFrame`はdecode済みRGBA 1枚を注入する契約のままなので、
複数VideoやVideo＋音声生成物に対してこのgateを緩めない。混在sceneは
Electron main所有のresident decoder／resident PCM経路だけで直接提示する。

## JPEG

`native-overlay/src/lib.rs`のImage loaderをPNG/JPEG共通入口にし、ローカルパスと
`file://` URLのquery、fragment、percent encodingを正規化してからdecoderを選ぶ。
JPEGの宣言上のmedia寸法ではなく、decodeした画像本来の寸法をRGBA sourceへ登録する。

`isNativeOverlayDirectMediaSourceSupported`は`.png`、`.jpg`、`.jpeg`だけを
Imageのdirect sourceとして許可する。WebPなどは既存rendererへ戻す。

## PSD active layer

`active_layer_ids`は次の境界を欠落なく通る。

1. Rust scene評価のmedia reference
2. Electron main playback payload
3. TypeScriptのNative Overlay scene media payload
4. N-API object
5. native-overlay内部media
6. rust-backendのPSD parser／compositor

PSD parserをaddon側へ複製せず、`rust-backend/src/lib.rs`の
`build_native_psd_source_frame`を再利用する。active layer ID列はsource content
revisionにも含め、選択レイヤーが変わったときに古いRGBA cacheを再利用しない。

## 複数Video／Video＋音声

`RustScenePlaybackController`はscene評価が返した全clipと全mediaを1回の
`presentScene`へ渡す。addonはmedia IDごとのVideoToolbox decoderとNV12 IOSurface、
`target_source`ごとのresident PCM cacheを保持し、native WGPU rendererが同じ
z-index列へ合成する。

同じresident media IDを同一sceneで異なる`source_frame`として要求する場合は、
addonで片方を暗黙に上書きせず、Electron main側で`unsupportedDirectMedia`として
提示前に拒否する。この判定は開始時だけでなく毎評価frameに適用する。

## live surface readback

診断フラグ`UXFD_NATIVE_OVERLAY_READBACK_TRACE=1`のときだけ、resident NV12、
音声反応source、GPU生成物、選択デコレーションを含む実drawableを描画と同じ
command bufferからreadbackする。通常提示ではreadbackを行わない。

比較用offscreen reference frameにも同じRGBA、NV12、音声反応、GPU生成source
mapを渡す。renderer APIはこれらのsourceを同じ経路で扱えるが、今回の実Electron
E2Eが直接検証する代表sceneは`GeneratedShatteredSphere`である。
E2Eは次をすべて満たすまで成功にしない。

- native present成功
- prepared clip数が1以上
- 非透明ピクセル数が1以上
- checksumが1以上
- exportとの最大チャンネル差が0
- 定常再生中のpresenterフル再起動が0

砕け散る球の実Electron E2E結果:

- prepared clip: 13
- 非透明ピクセル: 23,766
- checksum: 19,184,723
- export最大チャンネル差: 0
- 定常再生中presenter再起動: 0

## 検証

- `npm run test:native-overlay-live-readback:e2e`: PASS
- `src/utils/rustScenePlaybackController.test.ts`: 16 tests PASS
- `src/utils/packageScripts.test.ts`＋`src/utils/nativeOverlayMainBridge.test.ts`:
  39 tests PASS
- native-overlayの複数Video＋resident音声source契約: PASS
- frontend全体: 230 test files、1,681 tests PASS
- native-overlay全体: 74 tests PASS
- native-wgpu-renderer全体: PASS（4K throughput probe 1件は既定どおりignore）
- `npx tsc --noEmit`: PASS

## 既知の境界

- 音声反応sourceの`target_source`は既存schemaどおり非空文字列を要求するが、
  protocolをローカルファイルへ限定していない。任意URIの拒否と`file://`の
  PCM cache invalidation正規化は別のhardening作業とする。
- live readback E2Eはtrace cursorとmedia kindを使い、球追加後の
  `GeneratedShatteredSphere` sceneだけを合格対象にする。
