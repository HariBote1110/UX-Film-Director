# Native Overlay生成sourceキャッシュ

## 決定

- CAMetalLayer直接描画の静的mediaは、native-overlay内で`media_id`と内容revisionをキーにCPU source frameとGPU textureを再利用する。
- CPU sourceは`Arc<RgbaFrame>`で保持し、live sceneと同じ割当てを共有する。cache hitでの`Vec<u8>`複製を許容しない。
- GPU側は既存の`media_texture_cache`を利用し、live surfaceから同じrevisionを渡す。transform/effect変更ではprepared clipだけを作り直し、texture uploadは行わない。
- GetColorはsource JSONの`source_image`について、パスだけでなくファイルサイズと更新時刻をrevisionへ含める。参照画像の外部更新で古い生成結果を表示しないためである。

## 退避

- CPU/GPUともに512MiBの予算と31フレーム連続不参照で退避する。overlay detach時はrendererのdropにより即時に解放される。

## 制約

- 動画、音声波形、音声sphereはこの静的cacheの対象外である。
- Particle、FocusLinesPlus、ShakingPolygon、ShatteredSphereはsource frameをrevisionに含め、時間変化を保持する。
- `UXFD_OVERLAY_CLEAR_READBACK=1`の診断経路だけは比較用にsourceを通常の`RgbaFrame`へ複製する。既定のlive present経路には存在しない。

## 2026-07-24 実機確認

- GetColor、HKSY、SimpleTubeを各12個、計36オブジェクト配置した
  1920×1080/60 fpsシーンをCAMetalLayerへ直接表示した。
- 初期評価は要求1件・応答1件・失敗0件、5秒再生後は要求300件・応答300件・
  stale 1件・失敗0件で完走した。最終GPU revision伝搬とArc共有を入れる前の
  3オブジェクト確認ではstale 58件だった。シーン規模が異なるため厳密な
  ベンチマーク比較ではないが、より重い最終シーンでlatest-winsがほぼ
  取りこぼさず完走することは確認できた。
- 再生中の観測値ではElectron main/native側が約55–57%、Chromium rendererが
  約47–49%、Rust backendが約1%だった。描画素材生成とGPU uploadはnativeへ
  移ったが、60 fpsのReact時刻更新・IPC要求発行はまだChromium側に残る。
  したがって「GPUへ完全オフロード済み」ではなく、次段階は再生クロックと
  frame要求駆動をnative側へ寄せることである。
