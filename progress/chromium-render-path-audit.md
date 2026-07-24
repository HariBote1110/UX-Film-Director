# 残存Chromium描画経路の棚卸し

## 決定

「Chromiumを UI・編集命令の発行に限定する」ゴールに対して、production
（通常操作）で到達しうるChromium描画経路を洗い出し、廃止順序を
**5 → 4 → 2 → 1 → 3** と定めた。判断軸はCPUピクセル往復の有無、規模、
依存関係（3D Stageが1と4のfallback原因である点）。

| # | 経路 | 主な実装箇所 | 到達条件 | CPU往復 | Rust代替 | 規模 |
|---|---|---|---|---|---|---|
| 1 | legacy canvas capture | `src/utils/projectExportLegacyCanvasCapture.ts:23`、判定 `src/utils/projectExportFrameCanvas.ts:186-266,300-315` | `rustFrameSourcePolicy` が `allowLegacyCanvas` のとき。video/image/psd/shape/生成source系を含まない構成（テキストのみ等）や、export中にRust frame sourceが`blocked`になった場合 | あり | 部分的 | 中 |
| 2 | WebGPU presenter | `src/utils/sharedRendererWebGpuPresenter.ts:389` | `isNativeOverlayDirectSceneSession`（`src/utils/nativeOverlayDirectSceneEligibility.ts:14-29`）が偽のとき。1クリップでもdirect非対応のmedia kindを含むと落ちる | 無（ただしChromium GPUプロセス経由の合成） | あり（native overlay presenter） | 小〜中 |
| 3 | 3D Stage Three.js/WebGL | `src/components/ThreeStageViewport.tsx:270` | `projectSettings.editorMode === '3d_stage'`。`getRustExportFrameSource` が2d必須（`src/utils/viewportRustExportFrameSource.ts:115`）のため、3D Stageではexportが必ず経路1へ落ちる | あり（export/snapshot時） | なし | 大 |
| 4 | PSD import時の一時canvas | `src/utils/psdParser.ts:56,67,512,607,622,634,954`、`src/utils/psdBillboardSync.ts:61-71` | PSD読込時に常時 | あり | 部分的（`rust-backend/src/psd_fast.rs` で合成済み） | 小〜中 |
| 5 | 文字boxの `measureText` | `src/utils/textBoxMeasurement.ts:22-46` | テキストオブジェクトで常時 | **無**（メトリクスのみ） | なし | 小 |

## 廃止順序の根拠

1. **5 は後回し**。ピクセル往復が無く、per-frame compositorの外。Rust側に
   フォントメトリクスAPIを新設する必要があり、費用対効果が最も低い。
2. **4 のうち `psdBillboardSync.ts` の `putImageData` を先に潰す**。Rust側で
   合成済みRGBAを受け取りながらCanvas2Dへ書き戻しており、往復が明確に無駄。
   `THREE.DataTexture` への直接投入で除去できる。
3. **2 を次に**。判定が `nativeOverlayDirectSceneEligibility.ts` 一箇所へ
   集約済みで、対応media kindを広げるだけで到達率を下げられる。
4. **1 は 2・4 の後**。まず後述の判定漏れを直し、`requireRustFrameSource`
   側へ段階的に寄せる。3D Stageの依存が切れるまで完全除去は不可。
5. **3 が最大かつ最後**。Three.jsシーングラフ・カメラ・ライティング・PSD
   ビルボードをRust側3D評価系へ丸ごと移す独立プロジェクト。GetColor/HKSY等と
   同じ「1要素ずつ移して重量E2Eで検証する」サイクルを新設して段階移行する。

## 見つかった判定漏れ

`hasProjectExportNativeRenderMediaObjects`（`src/utils/projectExportFrameCanvas.ts:317-358`）
のobject typeリストに `shattered_sphere` が含まれていない。ShatteredSphereは
GPU source化済み（Beta-473a）にもかかわらず、これだけで構成されたプロジェクトは
export時にlegacy canvas経路へ落ちうる。

### 対応（Beta-480a）

`hasProjectExportNativeRenderMediaObjects` を手書きOR式のまま個別修正するのではなく、
Rust/native側の対応object typeを唯一管理している `rustSceneSnapshot.ts` の
`isSupportedSceneObject` を `export` し、そこから導出する形へ書き換えた
（`object.type !== 'text'` のみ追加条件。text はPixiの標準テキスト描画がlegacy canvas
captureでも正しく動作するため意図的に対象外）。これにより `shattered_sphere` に加えて
同様に漏れていた `plain_effector_line` も一括で解消し、以後同種の判定漏れは
`isSupportedSceneObject` 側の更新だけで自動的に追従する。契約テストは
`src/utils/projectExportFrameCanvas.test.ts` にSSOT総当たりの形で追加済み。

## 制約・注意点

- 監査5項目の外に、ユーザー操作によるフレームスナップショット保存
  （`src/components/Viewport.tsx:2288,2306` の `toDataURL`）という独立した
  Chromium readback経路がある。頻度は低いが production 到達可能。
- `src/utils/videoExportPipeline.ts:71` の `createImageBitmap(ImageData)` は
  WebCodecsエンコーダのprobe用ダミーフレーム生成であり、毎フレーム経路ではない。
- `src/utils/psdAgPsdWorker.ts:22` の `OffscreenCanvas` は wasm パース失敗時の
  フォールバック。production到達可能。
- `src/exportTest/exportTestHarness.ts` や `*.test.ts`、`src/e2e/` 配下の
  canvas利用は診断・テスト専用であり、廃止対象ではない。
