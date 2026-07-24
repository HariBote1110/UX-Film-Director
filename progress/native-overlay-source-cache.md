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
