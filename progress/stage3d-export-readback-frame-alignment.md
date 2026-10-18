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

## 実機経路の調査とencoder選択の修正（2026-10-18）

- 検証済みRust backendを指定した実Electronの3D Stage exportで、WebGPU adapter/deviceの
  初期化までは成功したが、export開始後330〜348msで `unsupportedEditorMode` により停止し、
  出力動画は作成されなかった。設定の `VITE_UXFD_RUST_EXPORT_ONLY` を無効にしても再現した。
- 原因は、Rust encoder bridgeが存在するとencoder計画がRust backendを選び、frame source policyも
  Rust frame sourceを必須化していたこと。3D Stageは `viewportRustExportFrameSource` が明示的に
  unsupportedとなるため、既存の `StageRenderer#readbackRgba()` → legacy canvas経路へ到達できなかった。
- encoder計画へ `editorMode` と選択codecを渡す。3D StageはH.264のときWebCodecs互換encoderを選び、
  `VITE_UXFD_RUST_EXPORT_ONLY=1` は2D resident-render exportの指定として扱う。2Dは引き続きRust
  encoder/frame source必須、video sentinelおよびfail-closedを維持する。
- WebCodecs互換exportはH.264のみ対応するため、3D StageでHEVCまたはProResを選んだ場合は日本語の
  明示エラーを返す。別codecへ無言変換しない。3D Stageにvideo objectが含まれる場合も既存の
  WebCodecs video sentinelが適用され、Rust sourceのないvideo exportを通さない。
- 自動テストは3D H.264 route、HEVC/ProRes拒否、3D legacy canvas policy、encoder-hookのmode/codec
  接続、既存2D Rust-only/video sentinelの維持を確認する。`projectExportFrameRenderer.test.ts` の
  async readback待ち契約は引き続き対象となる。
- 実Electronではverified backendでWebGPU初期化と3D export拒否を確認済みだが、修正後の正常export、
  frame数/画素、フレーム当たり時間はGPU検証枠の調整後に再確認する。静的stageでは動的な画素差分に
  よる1フレーム遅延検出はできないため、遅延契約はframe-tag付きfake renderer testで担保する。
