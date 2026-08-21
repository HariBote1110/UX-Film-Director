# per-frame 内訳分解 — 「GPU律速になるべき」仮説の検証

## 目的 / 仮説

ユーザー仮説:「エンコードはGPU律速になるべきで、今の経路はオーバーヘッドがでかい」。
per-frame timings を可視化し、フレーム時間のうち GPU 実作業とオーバーヘッドの比率を確定する。

## 環境

- ホスト: yuki の Mac (Darwin 25.5.0, Apple Silicon)、branch `feature-proxy` @ cff6cbd1
- backend: release ビルド（`UXFD_RUST_BACKEND_BIN` 明示）
- プロジェクト: focus-tips（1280x720@60fps, 720枠, shape/text/particle のみ、映像・音声ソースなし）
- 計測パッチ: `encode_research/tools/perframe-timing-instrumentation.patch`
  （electron bridge で RPC 壁時計 + backend timings 集計、renderer 側で produce/write 待ち集計、
  backend 側で block_on / append の計時。**撤去済み**。再計測時は `git apply` で再適用）
- 手順: [export-speed-baseline-and-first-experiments.md](export-speed-baseline-and-first-experiments.md) と同じ e2e コマンド

## 結果

### 系統3（既定・ffmpegRawRgba、53.4fps = 18.7ms/frame）

| 区間 | ms/frame | 備考 |
|---|---|---|
| ループ全体 | 17.52 | |
| **フレーム供給待ち（produce）** | **15.75** | **90%。≒60Hzの1リフレッシュ(16.7ms)** |
| backend 書き込み待ち（write） | 1.51 | RPC壁時計 1.61ms（encode.writeFrame） |

供給側は shared renderer の **presenter（画面プレゼント）経由**で presented frame を取る設計。
15.75ms ≒ vsync 1周期であり、**既定経路の上限は実質60fpsに天井が張られている**。
エンコード（共有メモリ→ffmpeg raw RGBA→VideoToolbox）は 1.6ms/frame で無罪。

### residentScene + IOSurface（66.5fps = 15.0ms/frame、ループ13.86ms）

| 区間 | ms/frame | 備考 |
|---|---|---|
| ループ全体 | 13.86 | produce待ち 0.00（renderer は {sceneId, frameIndex} を送るだけ） |
| RPC 壁時計（Electron main で計測） | 13.64 | |
| ├ backend GPU render（block_on） | 7.25 | 内訳: renderMs 4.71 + sourceUploadMs 2.18（totalMs 6.97） |
| ├ VideoToolbox append | **0.05** | **エンコーダ背圧ゼロ。エンコーダは完全に無罪** |
| └ **残差 ≒ 6.3** | **6.34** | RPC transport + params の serde parse（`params.clone()` あり）+ evaluate_frame + **snapshot/media の JSON Value 二重変換**（resident handler が json!(snapshot) で組み立て → native handler が serde from_value で再パース）+ collect_* |

## 結論

**仮説は採択。数字で裏付けられた。**

1. **エンコーダ（VideoToolbox）はどの経路でも律速でない**（append 0.05ms、ffmpeg 経路でも 1.6ms）。
2. **既定経路の主犯は「画面プレゼンタ経由のフレーム供給」= vsync 同期**（15.75ms/frame）。
   エクスポートが描画パイプラインの都合で 60fps に律速されている。
3. residentScene 経路でも **フレーム時間の約46%（6.3ms/frame）が RPC・JSON 変換系のオーバーヘッド**。
   GPU 実作業は 7.0ms（render 4.7 + sourceUpload 2.2）で、純粋に GPU 律速なら **140〜210fps 相当**が出るはず。
4. 書き込み RPC は **完全直列**（`runRustBackendVideoEncodeExport` は write を await してから次を発行。
   render-ahead は produce 側のプリフェッチのみで、residentScene では produce≒0 のため無意味）。
   RPC を 2 本インフライトにするだけで 6.3ms のオーバーヘッドは GPU 時間に隠れる計算。

## 高速化レバー（効果見込み順・未実装）

1. **residentScene 経路の write パイプライン化**（2フレーム インフライト）
   → 13.9ms/frame → 約7ms/frame ≒ **2倍**の見込み。TS ループの変更のみで済む。
2. **backend 内の JSON Value 往復排除**: evaluate_frame の結果を Value 経由で
   native handler に渡し直すのをやめ、型付きのまま直接呼ぶ（native_render.rs:121-142 の
   insert 群と from_value 再パース）。residentScene で `params.clone()` も削除。
3. **sourceUploadMs 2.2ms の削減**: text/generated 系テクスチャの per-frame 再アップロード疑い。
   content revision キャッシュのヒット状況を確認。
4. 既定経路の vsync 分離（エクスポート時はプレゼンタを介さない）— ただし residentScene への
   一本化の方が筋が良い可能性が高い。

## 次の一手 / 未検証事項

- レバー1（パイプライン化）を研究ブランチで試し、効果を実測（GPU 律速 ≒140fps に近づくか）。
- 映像ソース入りプロジェクトでの再計測（デコードが載ったときに GPU/デコード/転送のどれが立つか）。
- sourceUploadMs の内訳（どの media 種別が毎フレーム上がっているか）。
