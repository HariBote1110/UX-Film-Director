# PSDビルボードのDataTexture直接転送

## 決定

- Rustバックエンドが返すstraight-alpha RGBA8をCanvas2Dへ書き戻さず、
  `Uint8Array`のままキャッシュして`THREE.DataTexture`へ渡す。
- IPCの`ArrayBuffer`には新しいtyped-array viewだけを作り、画素列をコピーしない。
- CPU側のRGBAキャッシュは`Viewport`、GPUテクスチャは`ThreeStageViewport`が
  所有する。同じPSD合成結果を複数オブジェクトが使う場合、RGBAは共有するが
  GPUテクスチャはオブジェクトごとに持つ。
- 同じ`filePath::activeLayerIds`ではDataTextureを再利用し、毎tickの
  `needsUpdate`を行わない。キー変更時は旧テクスチャを破棄して作り直す。

## 根本原因

`psd.renderComposite`は既に完成したRGBA8を返していたが、
`psdBillboardSync.ts`は`ImageData`を作って`putImageData`でcanvasへ描き、
`ThreeStageViewport`がそのcanvasから`CanvasTexture`を作っていた。
この往復は合成処理ではなく、Three.jsへ渡す形式を合わせるためだけのCPUコピーだった。

加えて、従来実装は同期のたびに`CanvasTexture.needsUpdate = true`を設定していたため、
画素が変わっていなくてもGPU再転送を要求していた。オブジェクト削除と画面破棄では
materialとgeometryだけを破棄し、texture自体を明示破棄していなかった。

## 表示互換の設定

Three.js 0.172の`DataTexture`既定値は従来の`CanvasTexture`と異なるため、
次を明示した。

- `RGBAFormat` / `UnsignedByteType`
- `SRGBColorSpace`
- `flipY = true`
- `premultiplyAlpha = false`
- `LinearFilter` / `LinearMipmapLinearFilter`
- `generateMipmaps = true`
- `unpackAlignment = 1`

`flipY = true`は上下方向、`premultiplyAlpha = false`はRust合成結果のstraight alpha、
線形filterとmipmapは縮小表示時の従来品質を維持するために必要である。

## 所有権と破棄

- billboard IDごとのDataTexture状態を`ThreeStageViewport`のMapで所有する。
- PSDのファイルまたは有効レイヤー集合が変わった場合、旧DataTextureを一度破棄して
  新しい寸法・画素列のDataTextureへ置換する。
- billboard削除時は該当textureだけを破棄する。
- `ThreeStageViewport`のunmount時は残っている全textureを破棄してMapを空にする。
- materialはtextureを所有しないため、materialの`dispose()`とは別にtextureを
  明示破棄する。

## 検証

- RedではCanvas依存、未実装のRGBA API、未実装のDataTexture管理をそれぞれ確認した。
- 対象テストは18件PASS。
- 全体は230 test files、1656 tests PASS。
- `npx tsc --noEmit --pretty false` PASS。
- 不正なRGBA長に加え、負数・小数・安全でない寸法をGPU転送前に拒否する契約も
  追加した。

## 対象外

- `psdParser.ts`のPSD import用canvasは別経路であり、今回変更していない。
- 3D Stage自体は引き続きThree.js/WebGLで描画する。今回除去したのはPSD billboardの
  `putImageData`往復とCanvasTexture経路だけである。
- 同一RGBAを使う複数billboard間でGPU textureを共有する案は、参照カウントが必要に
  なるため採用していない。
- PSD削除・レイヤー変更後に旧IPC要求が完了すると、次のrender tickで削除されるまで
  古いRGBA cache keyを一時的に再挿入できる競合は従来どおり残る。誤描画には
  直結しないが、最新live keyまたは世代番号で完了結果を拒否する改善余地がある。
