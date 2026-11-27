# Native Overlay `MissingSource` 誤診断

> 2026-07-23追補: 本文の「動画のみへ限定」は当時の暫定方針である。
> 生成sourceの構築と直描画適格判定を追加した現在の方針は
> [cametal-direct-preview.md](cametal-direct-preview.md)を参照すること。

## 決定

- 動画のデコード済みフレームを直接Native Overlayへ渡す起動経路は、
  全クリップが`Video`であるセッションだけで有効にする。
- 動画と生成物・図形などが共存する混在セッションは、全メディアを合成できる
  `render.nativeSharedFrame`経路を使い、DOM WebGPU canvasへpresentする。
- Native Overlayの有効フラグだけでデコード済み動画presentを試行せず、
  `isSharedRendererExternalVideoOnlySession`を同じ判定に含める。
- 現在のセッションがOverlay presentを試行しない場合は、前セッションの
  `NativeOverlayAttempt`、failure reason、failure detailをdatasetから消去する。
  これにより、混在シーンへ切り替わった後に旧成功・失敗状態を表示しない。

## 根本原因

デコード済み動画presentは、動画1件のRGBA sourceとSceneSnapshot全体を
Native Overlayへ渡していた。混在シーンではSnapshotに
`GeneratedGetColorDots`など別メディアのclipも含まれる一方、それらのsourceは
Overlay側へ注入されない。このため本来のNV12/WebGPU混在合成が成功していても、
先行する不要なOverlay試行だけが`MissingSource`で失敗し、診断へ残っていた。

## 検討した代替案

- `MissingSource`だけを診断から隠す案は採用しない。不要なGPU・IPC処理と
  誤ったpresent試行自体が残るため。
- 混在シーンの全sourceをデコード済み動画presentへ追加する案は採用しない。
  既に汎用の`render.nativeSharedFrame`経路があり、同じ合成機能をOverlay addonへ
  重複実装することになるため。

## 制約・注意点

- 動画のみのセッションでは、低遅延なデコード済みフレームのNative Overlay
  presentを維持する。
- 図形・画像のみの再利用tickは、既存の
  `prepareSharedRendererViewportNativeRenderOverlayPresent`経路を維持する。
- 混在セッションを将来Native Overlayへ直接presentする場合は、単一動画source
  注入ではなく、完成済みのネイティブ合成出力を渡す必要がある。
