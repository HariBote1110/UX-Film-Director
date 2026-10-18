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
- 修正後、`VITE_UXFD_RUST_EXPORT_ONLY=1`、verified backend `uxfd-rust-backend-verified-20261018`、
  overlay無効・shared preview/export有効の実Electronで、640×360・30fps・1秒の空3D stageを
  H.264 exportした。完了ダイアログは`avc1.640028`で成功し、runtime errorは空。`ffprobe`でH.264
  High、640×360、30/1 fps、30 frames、duration 0.966667秒を確認した。動画は2359 bytes。
- E2E wrapperの結果全体は、互換経路の完了ダイアログに汎用parserが期待する`フレーム: N`表示がなく、
  `exportedFrameCount`を取得できなかったため`passed:false`となる。これはexport失敗を示さない。
  UI完了ダイアログ、生成物、codec probeと独立した`ffprobe`のframe countで完走を確認した。
- JSONの`exportDurationMs`は3200 ms（完了ダイアログ表示は3.0秒）で、空sceneの今回の観測値は
  約106.7 ms/frame。GPU、codec、静的な空sceneに限定した一回の測定であり、性能保証値ではない。
- frame 0とframe 15のPNGは640×360、SHA-256が両方
  `bdb45551126b13f695e9518e7ed75a6fdc12c587166e2eb7f3d214d1865829ba`で、画素配列も同一だった。
  目視上は暗灰色の背景と一部の床線で、空sceneの設定（背景#1e1e1e、床線#333333、中心線#444444）と
  整合する。これは空stageのreadback出力の確認に限り、preview/export画素一致やgrid全体の描画正当性は
  検証していない。PNGは`/tmp/uxfd-p4-stage3d-frame0.png`と`/tmp/uxfd-p4-stage3d-frame15.png`、
  動画は`/tmp/uxfd-p4-stage3d-export.mp4`、E2E記録は`/tmp/uxfd-p4-stage3d-export-result.json`。
- この空sceneは静的なため、実コンテンツの動的フレーム整合・1フレーム遅延は未検証。非同期readback
  の順序は引き続き`projectExportFrameRenderer.test.ts`のframe-tag付きfake renderer testで担保する。
  検証用recipeは実行後に削除した。
