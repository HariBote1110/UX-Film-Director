# 動画なしセッションのpresenter再利用

## 決定

- 通常のshared renderer cutover構成でも、動画を含まないnative-render-onlyセッションは
  presenterを再利用する。
- video-onlyと動画を含む混在セッションは、従来どおり
  `rustVideoOnlyEnabled` のときだけnative render presenterを再利用する。
- publish側とpresenter start effect側は、純粋関数
  `shouldReuseSharedRendererNativeRenderPresenter` を共有してkey判定を一致させる。
- 砕け散る球E2EはNative Overlayを明示無効化し、DOM WebGPU native render uploadの
  `nativeRenderFrameReady`と実画素を検証する。定常再生中のpresenter再起動0回も
  合否条件とする。

## 根本原因

- `shattered-sphere` E2EはDOM WebGPU upload由来の
  `uxfdSharedRendererPresenterNativeRenderFrameReady`を待っていたが、
  Native Overlayが既定有効だった。
- `GeneratedShatteredSphere` はdirect overlay適格であり、overlay present成功時は
  DOM uploadを意図的に省略する。このため製品描画が成功していてもE2Eだけが
  `nativePreviewReadyTimeout`になっていた。
- overlayを無効化して本来の検証経路へ固定すると、修正前は2秒の再生でpresenterが
  41回フル再起動した。`rustVideoOnlyEnabled`単独ゲートにより、
  video-freeセッションでもframeごとにsession keyが変わっていたためである。

## 検証結果

- `npm run test:shattered-sphere-preview:e2e` を修正後に2回連続実行し、双方PASS。
- 画素検査は両実行とも`visible=true`。
- presenter再起動は両実行とも、定常再生区間で`before=3`、`after=3`、
  `duringPlayback=0`、`valid=true`。
- CDP起動時のexecution context交換は最大20回の短時間再試行で吸収する。
- 計測値欠落を0回と誤認しないよう、window上の単調カウンタと`valid` gateを使う。

## 却下した案

- Native Overlay成功時にもDOM WebGPU uploadを重ねる案は、二重描画と不要なGPU転送を
  増やすため採用しない。
- E2Eのready条件をoverlay成功だけへ緩める案は、DOM canvasの画素検査と
  `nativeRenderFrameReady`契約を失うため採用しない。
- 混在セッションまで通常cutoverでreuseする案は、HTMLVideoElementの音声クロックと
  Rust側video decodeが二重化するため採用しない。

## 制約

- 通常cutoverでのreuse拡大は`nativeRenderOnly`に限定する。
- `VITE_UXFD_SHARED_RENDERER_VIDEO_CUTOVER=0`の明示opt-outは維持する。
- 混在セッションの再起動ストーム解消には、動画と音声の供給・クロックをRust側へ
  統合してから同じgateを広げる必要がある。
