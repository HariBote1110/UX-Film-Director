# 生成系ソースフレームキャッシュの効果検証 — 102〜119fps、GPU律速に到達

## 目的 / 仮説

[collect-sources-cpu-rasterisation.md](collect-sources-cpu-rasterisation.md) の本命修正
（生成系ソースフレームの revision キー付きCPUキャッシュ + Arc渡し化、
claude/loving-meninsky-d07cde → merge 0cb6f455）の効果を、同一手順・3反復で検証する。
見込みは「collect ~7ms → ほぼゼロ、130〜140fps」だった。

## 環境

- これまでと同一（focus-tips 720p60/720枠、release backend、residentScene+IOSurface）
- 実装: `progress/generated-source-frame-cache.md`（実装側の設計記録）
- 計測パッチ: `encode_research/tools/preprocessing-split-instrumentation.patch` を再適用（計測後撤去）

## 結果（3反復）

| run | fps | RPC壁時計ms | collectSources | GPU計(totalMs) | sourceUpload | render |
|---|---|---|---|---|---|---|
| 1 | 106.6 | 8.23 | 0.29 | 7.34 | 2.25 | 5.00 |
| 2 | 101.9 | 8.54 | 0.20 | 7.30 | 2.82 | 4.33 |
| 3 | 118.6 | 7.34 | 0.19 | 6.49 | 2.70 | 3.65 |

- 修正前（同一構成）: collect 6.6〜8.2ms、67〜73fps
- **collect_native_render_sources: 7.03ms → 0.19〜0.29ms（-96%）**
- **fps: 中央値 106.6（修正前中央値 ~68 の 1.57倍、当初ベースライン 51.5fps の 2.07倍）**
- RPC壁時計 7.3〜8.5ms のうち GPU 6.5〜7.3ms — **フレーム時間はほぼGPU作業のみになり、
  「エンコードはGPU律速になるべき」というユーザー仮説の状態に到達**。

## 結論

- 修正は見込みどおり効いた。予測（130〜140fps）に届かないのは GPU render 自体が
  3.7〜5.0ms と揺れる負荷条件だったためで、下限 run3（GPU 6.5ms）では 118.6fps。
- 720p60 のエクスポートは 1.7〜2.0x realtime。

## 次の一手 / 未検証事項（優先順）

1. **sourceUploadMs 2.2〜2.8ms の残存**: revision 不変ならGPUテクスチャキャッシュに
   ヒットしてアップロードが飛ぶはずが、毎フレーム2ms台が残る。ここが次の最大項
   （取れれば ~5ms/frame ≒ 200fps 級）。
2. 既定経路（フラグ無効時）の vsync 供給律速 15.75ms は未解決のまま。
   residentScene 経路の既定化（フラグ卒業）を検討する段階。
3. 動画ソース入り・1080p/4K での再プロファイル（デコード・スケーリング特性は未計測）。
4. IOSurface 経路の audioPath 非対応（encode.rs）— 音声付きだと依然 ffmpeg 経路に落ちる。
