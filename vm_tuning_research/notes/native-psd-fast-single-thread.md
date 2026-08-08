# 自前 PSD パーサ（psd_fast.rs）のネイティブ単一スレッド計測

## 目的・仮説（棄却条件含む）

`agpsd-baseline.md` により、この VM 上での ag-psd（29.1.0）のベースラインは
**(a) full readPsd() median ≈ 460ms**、**(b) skipCompositeImageData +
skipThumbnail（レイヤーのみ展開） median ≈ 405ms** と確定している。また
既存の Node 向け WASM ビルド（`perf/wasm-node/` の単一スレッド `PsdParser`）
は median ≈ 570ms で、ag-psd (b) の 405ms の壁を超えられていない。

**仮説**: Node-WASM 単一スレッド版が ag-psd (b) 405ms に負けている主因は
WASM 実行オーバーヘッド（V8 の TypedArray ネイティブ処理との差）であり、
同一アルゴリズム（`rust-backend/src/psd_fast.rs`、並列化なし）をネイティブ
コンパイルして単一スレッドで実行すれば、WASM の壁を取り払うことで ag-psd
(b) 405ms を下回るはずである。

**棄却条件**: ネイティブ単一スレッド版の median が 405ms 以上であれば、
「ネイティブ化だけでは勝てない」と記録し、次の実験では並列化を必須の
変数として導入する。

## 環境

- 接続: `ssh haribote@100.72.111.20`（`environment.md` 参照）
- CPU: 13th Gen Intel Core i5-13400F、VM 割当 12 vCPU（本計測はシングル
  スレッドのため 1 コアのみ使用。フルコア 100% 張り付き実行は所有者了承済み
  だが、この計測自体はシングルスレッドなので該当しない）
- OS: Ubuntu 26.04 LTS
- rustc / cargo: 1.93.1（VM 上、apt 系導入）
- 比較対象（ag-psd）: 29.1.0、node v22.22.1（`agpsd-baseline.md` と同一計測）
- PSD サンプル: `葵ちゃん.psd`（29.74 MB、171 layers）

## 手順

### ベンチ crate の構成

- 場所（ローカル）: `vm_tuning_research/tools/psd-native-bench/`
- 場所（VM）: `~/psd-bench/psd-native-bench/`
- `Cargo.toml`: edition 2021、`publish = false`。
  `[profile.release]` は `opt-level = 3`, `lto = "fat"`,
  `codegen-units = 1`, `panic = "abort"` を採用（ネイティブ単一スレッド
  性能の天井を見るための積極設定。ビルド時間とのトレードオフとして、
  VM 上のリリースビルドは約 54 秒だった）。
- 依存クレートは `flate2 = "1"` のみ（`psd_fast.rs` が ZIP 展開に使用）。

### `psd_fast.rs` の取り込み方法

`rust-backend/src/psd_fast.rs`（コミット
`9680117d911da05722d599cb518be264afc8317a` 時点）はトップレベルで
`uxfd_golden_harness::RgbaFrame` を import しており、これはクレート内部
専用の依存（`uxfd-golden-harness`）で、単体クレートとしてはビルドできない。
このため `#[path]` 参照ではなく、**ファイルをコピーして
`vm_tuning_research/tools/psd-native-bench/src/psd_fast.rs` に配置**し、
以下を除去した:

- `use uxfd_golden_harness::RgbaFrame;`
- `composite_visible_psd_layers`, `composite_visible_psd_layers_with_active_layer_ids`,
  `select_psd_composite_frame`, `composite_visible_psd_layers_with_filter`,
  `composite_layer_source_over`, `source_over_pixel`
  （合成画像生成専用のロジックで `RgbaFrame` に依存する。今回の比較対象
  である ag-psd (b) も合成画像は生成しないため、除去しても公平性は保たれる）
- `#[cfg(test)] mod tests { ... }`（開発機のローカルパスをハードコードした
  実素材回帰テストを含むため。研究コードとして使い捨てなのでベンチには
  不要と判断）

`stable_layer_id` はレイヤーツリーの平坦化（`flatten`）内部で使われる
ため残置。`parse_psd_fast` 本体・`decode_layer_rgba`・`interleave_rgba`・
PackBits/ZIP デコーダは無改変でそのまま使用。

### 公平性: 両側で行っている作業の対応

| 作業 | ag-psd (b) skipComposite+skipThumbnail | native bench (`parse_psd_fast`) |
|---|---|---|
| 全レイヤーのメタデータ解析（座標・可視性・グループ構造） | ○ | ○ |
| 各レイヤーの全チャンネル圧縮解除（PackBits/ZIP/Raw） | ○ | ○ |
| レイヤー寸法での planar→interleaved RGBA8 変換（straight alpha、alpha欠如時は255） | ○（`useImageData` 経由で内部生成） | ○（`interleave_rgba`、既存実装のまま） |
| 合成画像（フラット化コンポジット）生成 | ✗（skip 指定） | ✗（該当関数を除去済み） |
| サムネイル生成 | ✗（skip 指定） | 元々未実装（対象外） |

→ 両者は「メタデータ解析 + 全レイヤー圧縮解除 + レイヤー単位 RGBA8 化」
という同じ範囲の作業をしている。`parse_psd_fast` は元々レイヤーごとに
`decode_layer_rgba` → `interleave_rgba` を呼んでおり、追加実装は不要
だった。

### ビルドと転送

1. ローカルで `cargo check` → `cargo build --release` により成功を確認
   （ローカル 5 反復のスモークテストで `layer_count = 171`、
   `total_decoded_rgba_bytes = 345168656` を確認）。
2. `rsync -a --exclude target vm_tuning_research/tools/psd-native-bench/
   haribote@100.72.111.20:~/psd-bench/psd-native-bench/`
3. VM 上で `cargo build --release`（約54秒、成功。`dead_code` 警告のみ
   — 除去した合成関数の消費者がいなくなったことに起因する無害な警告）。
4. VM 上でプロトコル通り 2 セット（各 15 回、先頭 3 回をウォームアップ
   として破棄、有効サンプル n=12）を実行。

### レイヤー数の突き合わせ

ag-psd 側と自前パーサ側でレイヤー数（グループ含む平坦化ノード数）が
一致するか確認するため、`ag-psd` の `readPsd()` 結果をツリー走査して
ノード数をカウントする一時スクリプトを VM 上で実行（`initializeCanvas`
スタブは `bench-agpsd.mjs` と同じもの流用）。

```
$ node count-layers.mjs
ag-psd flattened layer+group node count: 171
```

`psd-native-bench` の `layer_count = 171` と完全一致。**両パーサの
レイヤー数は一致**しており、比較の前提が成立している。

## 結果（表、単位: ms）

各セット: n=15 実行、先頭 3 回破棄、有効サンプル n=12。

**セット 1**

| min | median | mean | max | stddev |
|---|---|---|---|---|
| 215.556 | 223.585 | 225.524 | 243.596 | 8.093 |

**セット 2**

| min | median | mean | max | stddev |
|---|---|---|---|---|
| 211.765 | 219.398 | 220.839 | 233.470 | 6.950 |

2 セット間の median 差は約 1.9% で、`agpsd-baseline.md` で確認済みの
VM ノイズレベル（2%未満）と同水準。

両セットとも `layer_count = 171`、`total_decoded_rgba_bytes = 345168656`
で一致（ラン間の決定性を確認）。

### 比較サマリ

| 実装 | median (ms) | 対 ag-psd (b) 405ms |
|---|---|---|
| ag-psd (b) skipComposite+skipThumbnail（`agpsd-baseline.md`） | 404.95 〜 405.77 | 基準 |
| ag-psd (a) full readPsd()（`agpsd-baseline.md`） | 459.35 〜 466.43 | — |
| 既存 Node-WASM 単一スレッド `PsdParser`（`agpsd-baseline.md`） | 567.89 〜 572.79 | 1.40〜1.41倍遅い |
| **本計測: psd_fast.rs ネイティブ単一スレッド** | **219.40 〜 223.59** | **約 1.81〜1.85倍速い（45.8〜45.9%短縮）** |

## 結論（仮説の採否）

**仮説は採用（falsify されなかった）。**

ネイティブ単一スレッド版の psd_fast.rs は median ≈ 219〜224ms を記録し、
棄却条件（405ms 以上）を大きく下回った。ag-psd (b) 405ms の壁に対して
約 45.8〜45.9% の時間短縮（約 1.8 倍速）を達成しており、「WASM 実行
オーバーヘッドが主因」という仮説と整合する結果になった。同じ
`psd_fast.rs` アルゴリズムが Node-WASM では 405ms の壁を超えられず
(570ms)、ネイティブでは楽に超える (220ms) という対比から、少なくとも
このワークロード・この VM では **WASM 化そのものが主要なコストであり、
アルゴリズム自体（PackBits/ZIP デコード、レイヤーツリー構築、RGBA
インターリーブ）はネイティブ実行下では ag-psd（V8 ネイティブ
TypedArray 処理）にも十分競合できる** ことが分かった。

並列化は今回未実施（意図的に単一変数に絞った）。並列化なしで既に
勝っているため、「並列化が必須」という前提は本タスクでは成立しない
（棄却条件に該当しなかったため、次の一手は任意の追加最適化という位置
づけになる）。

## 次の一手

- 本番コード（`rust-backend/src/psd_fast.rs` を使う実行パス）が実際に
  ネイティブ（非WASM）で動く経路かどうかを確認する。もし本番が
  WASM 経由（ブラウザ/Node-WASM）のままなら、この 220ms という数字は
  「ネイティブなら出せる性能」であって現行本番の実測値ではない点に注意。
  ネイティブ経路（Tauri sidecar 等、`rust-backend` は最終的にネイティブ
  バイナリになる想定か）を確認し、本ノートの数値がどの実行経路に
  適用可能かを次の記録で明確化する。
- 並列化（レイヤー単位でのマルチスレッド展開）を追加した場合の伸びしろ
  を計測する。今回は「ネイティブ化だけで勝てるか」に一変数で絞ったため
  未検証。12 vCPU 環境なので理論上の余地は大きいが、フルコア実行の
  承認は得ているため次の実験で着手可能。
- `lto = "fat"` と `codegen-units = 1` の効果分の切り分け（`lto = "thin"`
  や `codegen-units` のデフォルトとの差分）は未検証。ビルド時間との
  トレードオフを含めて次回計測できる。
- WASM 側（Node-WASM 570ms）に `opt-level`/`lto` などの release
  最適化が正しく効いていたかは本ノートでは検証していない
  （`agpsd-baseline.md` の計測を再利用しただけで、リビルドしていない）。
  WASM 側のビルド設定を洗い直せば、この 1.8 倍差の一部が「WASM vs
  ネイティブ」ではなく「最適化設定の差」である可能性も残る。
- `vm_tuning_research/tools/psd-native-bench/src/psd_fast.rs` は
  `rust-backend/src/psd_fast.rs` の使い捨てコピー（コミット
  `9680117d911da05722d599cb518be264afc8317a` 時点、合成関数・テストを
  除去）。本番側が更新されても自動追従しないため、再計測が必要な際は
  差分を確認してから再コピーすること。
