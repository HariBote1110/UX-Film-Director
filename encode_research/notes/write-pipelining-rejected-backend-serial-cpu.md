# write パイプライン化の実測 — 棄却。真犯人は backend の直列前処理CPU（6.05ms/frame）

## 目的 / 仮説

[per-frame-overhead-breakdown.md](per-frame-overhead-breakdown.md) のレバー1:
「write RPC を2フレーム インフライトにすれば、6.3ms のオーバーヘッドが GPU 時間に隠れて約2倍になる」
を実測で検証する。

## 環境

- [per-frame-overhead-breakdown.md](per-frame-overhead-breakdown.md) と同一
  （focus-tips 720p60/720枠、release backend、residentScene+IOSurface フラグ有効）
- 実験パッチ: `encode_research/tools/write-inflight-and-preRender-experiment.patch`（撤去済み）
  - `VITE_UXFD_RUST_EXPORT_WRITE_INFLIGHT` で write の同時インフライト数を制御（既定1=従来）
  - backend に `researchPreRenderMs`（ハンドラ入口→GPU render 開始までの前処理時間）を追加
  - 後述の「エクスポート二重起動バグ」を抑止する再入ガード（計測を通すために必須だった）

## 結果

### inflight スイープ（全条件 720枠完走・出力検証パス）

| inflight | fps | ループms/frame | RPC壁時計ms | 対inflight=1 |
|---|---|---|---|---|
| 1 | 69.4 | 13.67 | 13.45 | 1.00x |
| 2 | 71.5 | 13.22 | 26.19 | **1.03x** |
| 4 | 73.0 | 13.08 | 51.99 | **1.05x** |

RPC 壁時計がインフライト数にほぼ比例して伸びている＝リクエストは backend 手前の
キューで待っているだけ。**backend は1フレームずつ直列処理するサーバであり、
先行発行しても処理は重ならない。**

### per-frame の完全な会計（inflight=1, preRender 計測 run, 67.7fps）

| 区間 | ms/frame |
|---|---|
| RPC 壁時計 | 13.39 |
| ├ **前処理 CPU（researchPreRenderMs）** | **6.05** |
| ├ GPU render（block_on, sourceUpload 2.05 込み） | 7.08 |
| ├ VideoToolbox append | 0.05 |
| └ 転送・その他 | 約0.2 |

前処理 6.05ms の中身（ハンドラ入口→render 開始）:
`params.clone()` 込みの serde parse → `evaluate_frame` → snapshot/media を
`json!()` で Value に組み直し → `handle_encode_write_native_frame` で再度 serde parse →
collect_*（native_render.rs:37-160 前後）。

## 副次的な発見: エクスポート二重起動バグ（本命の安定性バグ）

`useProjectExport.ts` のエクスポート effect（deps: `[isExporting, renderScene, ...,
getRustExportFrameSource]`, 513行付近）は、**エクスポート実行中に依存の同一性が変わると
再発火して runExport が並走する**。sceneRPC 有効時は revision 更新等で高確率で発生し、
`encode.start count=2` を実測（同一出力パスに AVAssetWriter が2本）。これが:

- 「Cannot Save」失敗（2本目の start が1本目の作ったファイルに衝突）
- 0バイト残骸ファイル
- 12秒設定 run の 120s タイムアウト（前ノートで「再現条件不明のフレーク」とした事象）

の統一的な真因。前ノートの「フレーク」はこれで説明がつく。
また cleanup の `cancelled = true` は再発火でも走るため、単純な再入ガードを入れると
今度は「旧 run がキャンセル・新 run がスキップ」で沈黙死する（実測済み）。
修正はキャンセル意味論ごと設計が必要（effect 依存から実行トリガを分離するのが本筋）。

## 結論

- **レバー1（write パイプライン化）: 棄却。** +3〜5% しか出ない。ボトルネックは
  renderer/転送側の待ちではなく、backend 内の直列前処理 CPU。
- **確定した本命はレバー2: backend の JSON Value 往復の排除。** 前処理 6.05ms は
  GPU render 7.08ms に匹敵する。evaluate 結果を Value 経由で再パースせず型付きで
  native render へ直接渡し、`params.clone()` を消せば、理論上 ~7.3ms/frame ≒ **135fps 前後**。
  実装時は preRender 内の evaluate / json往復 / collect をさらに分割計測して
  無駄な部分（json往復）が支配的であることを確認してから削ること。
- それでも足りなければ次段は backend 処理のパイプライン化
  （前処理スレッドと GPU submit の重なり）だが、レバー2の後で再評価。

## 次の一手 / 未検証事項

1. **/development で二重起動バグ修正**（安定性・最優先。速度以前に export が壊れる）。
2. レバー2（JSON Value 往復排除）の研究実装と実測。preRender の内訳分割計測を先に。
3. sourceUploadMs 2.05ms の内訳（テクスチャキャッシュのヒット状況）。
4. 動画ソース入りプロジェクト・高解像度でのプロファイル再取得。
