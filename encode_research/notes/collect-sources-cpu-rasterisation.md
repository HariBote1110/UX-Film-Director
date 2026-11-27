# 前処理6msの最終帰属 — JSON往復は無罪、`collect_native_render_sources` の毎フレームCPU再ラスタライズが犯人

## 目的 / 仮説

前ノート（[write-pipelining-rejected-backend-serial-cpu.md](write-pipelining-rejected-backend-serial-cpu.md)）の
レバー2仮説「前処理6msの正体はJSON Value往復＋clone＋再パース」を分割計測で検証する。

## 環境

- これまでと同一（focus-tips 720p60/720枠、release backend、residentScene+IOSurface、
  二重起動修正 d7ef41ab とCannot Save修正 acbe7358 のマージ後）
- 計測パッチ: `encode_research/tools/preprocessing-split-instrumentation.patch`（撤去済み）
  - resident wrapper 側: parse / evaluate / jsonBuild を分割計時
  - native handler 側: 再パース / collect群 / `collect_native_render_sources` 単独 を分割計時
- 注意: この計測群の実行時はマシン負荷が高めで絶対値が悪化している
  （fps 53〜68、collect 7.0〜8.2ms と揺れる）。**帰属（比率）は全runで一貫**。

## 結果（代表run: 57.0fps, RPC壁時計15.4ms）

| 区間 | ms/frame | 判定 |
|---|---|---|
| resident parse（params.clone込み） | 0.00 | 無罪 |
| evaluate_frame | 0.02 | 無罪 |
| json!(snapshot/media) 構築 | 0.03 | 無罪 |
| native handler の serde 再パース | 0.03 | **無罪（レバー2仮説は棄却）** |
| **collect群** | 7.05 | |
| └ **`collect_native_render_sources` 単独** | **7.03** | **犯人確定** |
| GPU render（block_on, sourceUpload込み） | 7.35 | |

他run（負荷低め）でも collect ≒ 6.6〜6.9ms / nativePre とほぼ一致し、比率は安定。

## 機構（source_frames.rs のコードリーディングで確定）

`collect_native_render_sources`（rust-backend/src/source_frames.rs:20）は:

- `Image` / `Psd` → `source_frame_cache` でキャッシュ（mtime+サイズ+レイヤー選択キー）
- `GeneratedParticle` 等のGPU直行系・`Video` → `continue`（対象外）
- **それ以外（`Text`・`SolidColour`・`GeneratedShape`・`GeneratedGradient` 等）→
  `build_native_generated_source_frame` を毎フレーム無条件に呼び、CPUでラスタライズし直す。**
  キャッシュ機構なし。focus-tips はこの系が10 media中8つ（Text×3・Shape×3・Gradient・SolidColour）。

皮肉なことに、隣の `collect_native_render_source_content_revisions` は同じ media から
**安定した内容revision**（パラメータハッシュ）を算出して GPU テクスチャキャッシュを
効かせている。つまり「内容が変わっていない」ことをシステムは知っているのに、
CPU側ソースフレーム生成だけが毎フレーム同じピクセルを作って捨てている。

補足: 生成系のrevisionはGPUキャッシュにヒットしているはずなのに sourceUploadMs が
2.0〜2.9ms 残っている。アップロード側にも取りこぼしがある可能性（未検証、修正時に確認）。

## 結論

- **レバー2（JSON Value往復排除）: 棄却。** serialise/parse系は合計 <0.1ms/frame。
- **本命確定: 生成系ソースフレームの revision キー付き CPU キャッシュ。**
  既に `media_content_revision`（時間依存系は source_frame 込み）が「変化したか」を
  知っているので、時間非依存の生成系（Text/SolidColour/Shape/Gradient 等）は
  revision 不変なら前フレームの `RgbaFrame`（Arc）を再利用すればよい。
  見込み: collect ~7ms → ほぼゼロ、フレーム時間 13〜15ms → **7〜8ms ≒ 130〜140fps**。
  Image/Psd の `source_frame_cache` と同じパターンの拡張なので実装リスクも低い。

## 次の一手 / 未検証事項

1. **/development で生成系ソースフレームキャッシュを TDD 実装**（タスク発行済み）。
   実装時に (a) `(*frame).clone()` で毎回ピクセルをディープコピーして返している点も
   Arc渡しに直せるか確認（Image/Psdにも効く）、(b) sourceUploadMs 2〜3ms の残存理由を確認。
2. 修正後に同一手順で再計測し、GPU律速（≒renderMs+α）に到達したか判定。
3. その後に残る課題: 既定経路のvsync供給律速（residentSceneへの一本化 or プレゼンタ分離）。
