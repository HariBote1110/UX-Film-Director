# path B′（真のメタデータ専用パース）end-to-end 計測

## 目的 / 仮説

`e2e-path-b-rust-metadata-import.md`（path B v1）で、pixel搬送・ImageBitmap化を除去しても
`input→parsed` が end-to-end の81.5〜84.6%を占め続け、仮説「parsedがms一桁〜数十msへ」
「支配区間がevaluateReady側へシフト」が両方棄却された。原因は `handle_psd_parse_meta` が
依然 `psd_fast::parse_psd_fast`（全レイヤーのチャンネル画像データを毎回伸長・RGBA化する
関数）を呼んでいたため。ベンチ用コード
（`vm_tuning_research/tools/psd-native-bench/src/psd_fast.rs` の `compute_leaf_ranges`）が
実証済みの「チャンネルデータ区間を伸長せずカーソル演算だけで読み飛ばす」手法を本実装
（`rust-backend/src/psd_fast.rs`）に移植し、`psd.parseMeta` だけを真にメタデータ専用に
切り替える。`parse_psd_fast` 自体・その既存呼び出し元（`source_frames.rs` の独立再デコード
表示パス、`psd.parse`／`psd.renderComposite` の blob 経路）は一切変更しない。

**仮説（再固定）**:
1. `input→parsed` は low double-digit ms 以下（IPC + 約30MBファイル読み込み + レコード走査）
   へ落ちる。
2. end-to-end の支配区間は `objectAdded→evaluateReady`（native present 待ち相当）側へ
   シフトする。
3. end-to-end 合計（evaluateReady）は 150ms を十分に下回る。

**反証条件**: `parsed` が引き続き100msを超えたら、ファイルI/OかIPCシリアライズ側に
別のボトルネックがあり、そちらを別途調査する必要がある。

## 実装

- `rust-backend/src/psd_fast.rs` に新しい公開関数 `parse_psd_meta_only(bytes: &[u8])` を追加。
  `parse_psd_fast` と同じヘッダ解析・`parse_layer_record`（レイヤーレコード読み取り）・
  グループツリー復元・pre-order flatten ロジックを使うが、**チャンネル画像データ区間は
  `decode_layer_rgba` を一切呼ばず、各チャンネルの既知の `data_len` 分だけ `skip()` で
  読み飛ばす**（伸長ゼロ）。返す `PsdFastResult` は形状同一（`layers[].rgba` は常に
  `None`）。`parse_psd_fast` 自身は無変更（意図的にコードを共有せず独立関数として複製 —
  ピクセルを運ぶ既存経路に影響を与えないことを最優先した）。
- `rust-backend/src/media.rs` の `handle_psd_parse_meta` を `parse_psd_meta_only` 呼び出しに
  切替（`psd.parse` / `psd.renderComposite` は引き続き `parse_psd_fast` のまま）。
- TDD: `rust-backend/src/psd_fast.rs` の単体テストに、手書きの最小PSDバイト列
  （グループ1つ＋子リーフ1つ）を `parse_psd_fast` と `parse_psd_meta_only` の両方に通し、
  メタデータ（id・名前・座標・可視性・親子構造・並び順）が完全一致し、かつ
  `parse_psd_meta_only`側は全レイヤーで `rgba.is_none()` であることを確認するテストを追加
  （`parse_psd_meta_only_matches_full_parse_metadata_without_decoding_pixels`）。
  関数未実装の状態でコンパイルエラーになることを確認してから実装した（Red→Green）。

## 環境

- macOS Apple M4（開発機、これまでの一連のノートと同一機）
- ブランチ: `feature-proxy`
- アプリバージョン: `0.1.1-Beta-490b`
- 対象 PSD: `葵ちゃん.psd`（30MB、171レイヤー = グループ28 + リーフ143）
- 計測フラグ: `psdImportTrace=1&psdRustImport=1`
- rust-backend は `cargo build --release --manifest-path rust-backend/Cargo.toml` でビルドし
  `UXFD_RUST_BACKEND_BIN` で明示指定（path B v1 の教訓を踏襲。debug ビルドのまま計測すると
  一桁以上遅い数値が出る）。

## 手順

```
cargo build --release --manifest-path rust-backend/Cargo.toml
export UXFD_RUST_BACKEND_BIN=$(pwd)/rust-backend/target/release/uxfd-rust-backend
export UXFD_PSD_IMPORT_E2E_OUTPUT_DIR=$(pwd)/vm_tuning_research/e2e-path-b-metaonly
node scripts/run-psd-import-e2e.mjs b
```

`scripts/run-psd-import-e2e.mjs` に `UXFD_PSD_IMPORT_E2E_OUTPUT_DIR` を追加し、path B v1 の
結果（`vm_tuning_research/e2e-path-b/`）を上書きせず別ディレクトリに出力できるようにした。
それ以外の手順は path A / path B v1 と同一（3回のアプリ起動 × 各2回import）。

## 結果

### 計測点ごとの経過時間（msec、input=0起点に補正）

| 起動# | import順 | input→parsed(Δ) | parsed→objectAdded(Δ) | objectAdded→evaluateReady(Δ) | 合計(evaluateReady) |
|---|---|---|---|---|---|
| 1 | 1回目 | 13.0 | 1.2 | 71.7 | 85.9 |
| 1 | 2回目 | 16.3 | 1.8 | 35.7 | 53.8 |
| 2 | 1回目 | 17.0 | 1.1 | 66.0 | 84.2 |
| 2 | 2回目 | 17.7 | 1.6 | 45.9 | 65.3 |
| 3 | 1回目 | 30.1 | 1.2 | 71.1 | 102.4 |
| 3 | 2回目 | 22.9 | 1.5 | 32.0 | 56.4 |

生データ: `vm_tuning_research/e2e-path-b-metaonly/result-{47433,47855,48246}.json`。
3回とも `passed: true`、`runtimeErrors: []`、`[data-timeline-item="true"]` にPSDが正しく
出現。T5（native present）は path A / path B v1 と同じ既知の制約
（`prepareNativeRenderUpload` 未配線）で今回も到達せず
（`uxfdSharedRendererPresenterPsdCutoverReason: nativeRenderFrameUnavailable`,
`owner: pixi`）——これは本変更の影響範囲外。

参考: プロセスがウォームな状態（Electron越しではなく、起動済みの rust-backend に対して
直接 `psd.parseMeta` を連続で叩いた場合）では 1呼び出しあたり 5〜10ms だった。上表の
`input→parsed`（13〜30ms）との差は、Electron IPC のシリアライズ・スケジューリング分と
みてよい。

### A（基準）/ B（v1、blob省略のみ）/ B′（今回、真のメタデータ専用）並記（median、input起点補正、単位ms）

| 区間 | A 1回目 | B 1回目 | B′ 1回目 | A→B′ 倍速 | A 2回目 | B 2回目 | B′ 2回目 | A→B′ 倍速 |
|---|---|---|---|---|---|---|---|---|
| input→parsed | 936.7 | 276.5 | 17.0 | 55.0× | 638.0 | 323.3 | 17.7 | 36.0× |
| evaluateReady合計 | 1022.6 | 333.7 | 85.9 | 11.9× | 680.1 | 351.8 | 56.4 | 12.1× |

A・B の値は `e2e-path-a-baseline.md` / `e2e-path-b-rust-metadata-import.md` から
本ノートと同じ方法（起動1〜3の中央値、input起点補正）で再掲。

### 支配区間の内訳（仮説2の検証）

| 起動# | import順 | input→parsed比率 | objectAdded→evaluateReady比率 |
|---|---|---|---|
| 1 | 1回目 | 15.1% | 83.5% |
| 1 | 2回目 | 30.3% | 66.3% |
| 2 | 1回目 | 20.2% | 78.4% |
| 2 | 2回目 | 27.1% | 70.4% |
| 3 | 1回目 | 29.4% | 69.4% |
| 3 | 2回目 | 40.6% | 56.7% |

path B v1 では `input→parsed` が81.5〜84.6%を占めていたのに対し、path B′ では逆転し
`objectAdded→evaluateReady`（native present 待ち相当、実体はPixiプレビュー合成待ちと
推定——T5未到達なので厳密にはnative present待ちではないが、計測上はここに落ちる）が
56.7〜83.5%と支配的になった。

## 結論

**仮説1（parsedがlow double-digit ms以下）: 採用**。`input→parsed` は 13.0〜30.1ms
（median 17.0ms・17.7ms）で、100msの反証しきい値を大きく下回った。path A（936.7ms /
638.0ms）比で36〜55倍速。

**仮説2（支配区間がevaluateReady側へシフト）: 採用**。`input→parsed` の比率は
15.1〜40.6%まで下がり、`objectAdded→evaluateReady` が56.7〜83.5%で支配的になった。
path B v1 で仮説2が棄却された原因（`parse_psd_fast`のフルデコードが残っていたこと）は
本変更で解消された。

**仮説3（合計150ms未満）: 採用**。evaluateReady合計は 53.8〜102.4ms（median 85.9ms・
56.4ms）で全サンプルが150ms未満。path A（1022.6ms / 680.1ms）比で約12倍速。

**layer木のRust/ag-psdパリティ**: 変更後も葵ちゃん.psdで総ノード数171
（グループ28・リーフ143）が維持されている（新規ユニットテストで `parse_psd_fast` と
`parse_psd_meta_only` の完全一致を機械的に検証済み。実PSDでの手動比較は前回ノート
[e2e-path-b-rust-metadata-import.md] のものを流用——木構築ロジック自体は変更していない
ため再現するはず。実PSDでの再確認は未実施、次の一手に記載）。

**実用勝利の判定（`practical-victory-criteria.md` 指標1）**: 明確に採用（勝利）。
path B v1 時点でも1.9〜3.4倍速だったが、真のメタデータ専用化でさらに12〜55倍速まで
伸びた。ag-psdの壁（ここでは同一プロトコルで測った現行 path A）を実用面で大きく超えた。

## 5指標の判定状況（更新）

| # | 指標 | 判定 |
|---|---|---|
| 1 | 体感インポート時間（end-to-end） | **採用（勝利、強化）**。1回目11.9倍速、2回目12.1倍速 |
| 2 | メインスレッド阻害時間 | 未計測（構造的にはさらに有利——ImageBitmap生成もawait_blobもなく、Rust側のCPU時間も激減） |
| 3 | メモリピーク | 未計測 |
| 4 | スケーラビリティ | 未計測（同一PSD 1本のみ） |
| 5 | 段階的表示 | 未達成（本変更でもメタデータは一括取得のまま） |

## 次の一手 / 本実装移植の条件・未検証事項

- **本実装移植の条件はほぼ整った**: 仮説1〜3すべて採用。残る主なブロッカーは
  ag-psd由来メタデータの網羅性検証（下記）と、指標2〜4の実測。
- **ag-psd由来メタデータの網羅性は依然未確認**（path B v1からの持ち越し）。
  `src/utils/psdParser.ts` の `parsePsdViaRustMeta` が正しく引き継げているか未検証:
  - 16bit/32bit PSD（`depth` の伝播。`psd.parseMeta` の返り値に `depth` フィールド自体がない）
  - ラジオグループ（レイヤー名が `*` で始まる isRadio 判定）の初期可視状態が
    ag-psd 経路と完全一致するか
  - レイヤー名のエンコーディング復元（`restoreLayerNameEncoding`）の食い違い有無
- **実PSD（葵ちゃん.psd）での `parse_psd_meta_only` 出力とag-psdの直接比較は未再実施**
  （ユニットテストの手書きフィクスチャでは検証済みだが、実ファイルでのエンドツーエンド
  一致確認はpath B v1時点のもの——木構築ロジックは今回無変更なので再現するはずだが、
  念のための再確認は次の一手）。
- `objectAdded→evaluateReady` が新たな支配区間になった。ここを縮めたい場合は
  Pixiプレビュー合成側（native present自体は`prepareNativeRenderUpload`未配線で
  そもそも到達していない）の調査が必要——今回のスコープ外。
- 指標2（メインスレッド阻害）・3（メモリピーク）・4（スケーラビリティ）の実験3続きが必要。
