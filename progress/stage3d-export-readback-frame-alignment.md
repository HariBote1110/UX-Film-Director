# 3Dステージ動画exportのreadbackフレーム整合

## Decision

- `3d_stage` の互換キャンバスexportでは、`renderProjectExportFrame` が
  `renderScene(frameIndex / fps, objects)` の戻り値を確認し、Promiseであれば
  解決を待ってから legacy canvas capture を行うようにした。
- Viewportの3D経路は、ビルボード同期後に
  `refreshStage3dSnapshotCanvas()` のPromiseを返す。これにより
  `StageRenderer#render()` と非同期の `readbackRgba()` が完了し、RGBAを2D
  キャンバスへ書き込んだ後のピクセルが、当該フレームのエンコーダ入力になる。
- readbackの要求世代を保持し、古い非同期要求が後から解決しても、新しい
  ステージスナップショットを上書きしないようにした。
- `projectExportFrameRenderer.test.ts` は、非同期に解決するframe-tag付きの
  fake rendererを使い、frame 7でエンコーダへ渡るRGBAがtag 7であることを固定する。
  修正前はtag 0が捕捉され、実際に1フレーム遅延が再現した。

## Alternatives considered

- `getExportCanvas()` を非同期APIへ変更する案は採用しなかった。既存の
  canvas解決・legacy capture境界を広く変更することになり、2D exportにも
  不要な影響が及ぶためである。
- `StageRenderer` / wasm側でreadbackを同期化する案は採用しなかった。WebGPUの
  readbackは非同期であり、wasm生成物とoxidise-engineはこのリポジトリの変更範囲外である。
- プレビュー更新を同期化する案は採用しなかった。通常プレビューは引き続き
  Promiseを待たずに更新し、export時だけ既存フレームループが待機する。

## Constraints

- 3Dステージはshared rendererのRustフレームソースを持たず、動画exportでは
  `StageRenderer#readbackRgba()` の結果を描いた2Dキャンバスをlegacy captureする。
- `renderScene` は2D時には同期のままであり、exportフレームレンダラも戻り値が
  `void` の場合は待機しない。したがって2D exportの描画・capture順序は変更しない。
- readback完了待ちは3Dステージexportの各フレームに必要なGPU同期であり、実機の
  GPU/ドライバ別の書き出し速度はElectron実機で別途確認する必要がある。
