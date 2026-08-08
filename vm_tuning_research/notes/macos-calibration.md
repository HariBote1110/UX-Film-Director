# macOS 開発機での PSD チャレンジ数値較正

## 目的 / 仮説

`psd-challenge-scoreboard.md` までの数値はすべて借用 VM（i5-13400F、Linux）上の
計測であり、`environment.md` は「macOS との横比較はしない」運用規約を明記している。
しかし end-to-end 試作（実験3）は macOS 実機（開発機）上で動くため、VM の数値を
そのまま期待値として使うのは危険——**同一プロトコル・同一サンプルファイルを
開発機で計測し、VM 数値との乖離幅を先に押さえておく**ことが本ノートの目的。

仮説は立てない（探索的な較正作業）。事実の記録のみを行い、傾向があれば「事実として」
記述する。

## 環境

- ホスト: 開発機（macOS、Apple Silicon）— `vm_tuning_research/notes/environment.md` が
  指す借用 VM とは別物
- CPU: Apple M4（`sysctl -n machdep.cpu.brand_string`）
- コア数: physicalcpu = 10 / logicalcpu = 10（`sysctl -n hw.physicalcpu hw.logicalcpu`、
  Hyper-Threading相当なし）
- RAM: 32 GiB（`sysctl -n hw.memsize` = 34,359,738,368 bytes）
- OS: macOS 26.5.2（Build 25F84、`sw_vers`）
- node: v26.0.0（`node --version`）
- rustc: 1.93.0 (254b59607 2026-01-19)、cargo: 1.93.0（`rustc --version` / `cargo --version`）
- ag-psd: **29.0.0**（`npm ls ag-psd`。VM側ノート記載は 29.1.0 — マイナーバージョン差あり、
  数値差の一因になりうる点に留意）
- リポジトリの `node_modules` をそのまま使用（追加インストールなし）
- 対象ファイル: リポジトリルートの `葵ちゃん.psd`（29.74 MB）

## 手順

VM 側の計測プロトコル（`agpsd-baseline.md` / `native-psd-fast-single-thread.md` /
`parallel-layer-decode-scaling.md` / `lazy-visible-only-decode.md` /
`memory-peak-comparison.md`）を踏襲。

1. ag-psd ベンチ（Node、ブラウザ不使用）
   ```
   node vm_tuning_research/tools/bench-agpsd.mjs "<repo root>/葵ちゃん.psd"
   ```
   を2セット実行（各15回、先頭3回をウォームアップ破棄、有効サンプルn=12）。
   スクリプトは無改造（`require('ag-psd')` はリポジトリの `node_modules` を素直に
   解決するため、パス調整は不要だった。PSD ファイルパスのみ引数で明示）。

2. ag-psd ワンショット・ピークRSS
   ```
   /usr/bin/time -l node vm_tuning_research/tools/bench-agpsd-oneshot.mjs "<repo root>/葵ちゃん.psd"
   ```
   を3回実行。**macOS の `/usr/bin/time -l` は "maximum resident set size" を
   バイト単位で返す**（Linuxの `/usr/bin/time -v` は KiB 単位）。VM側ノートとの
   横並びのため MiB 換算は `bytes / 1,048,576` で統一。

3. ネイティブベンチのビルド・実行
   ```
   cd vm_tuning_research/tools/psd-native-bench
   cargo build --release
   ./target/release/psd-native-bench "<repo root>/葵ちゃん.psd" 15 <mode>
   ```
   `<mode>` は `serial` / `8` / `serial-visible` / `8-visible` の4種、各2セット
   （15回、先頭3回破棄、n=12）。Cargo.toml は VM と同一（opt-level=3, lto=fat,
   codegen-units=1, panic=abort）、無改造。

4. ネイティブのピークRSS
   ```
   /usr/bin/time -l ./target/release/psd-native-bench "<repo root>/葵ちゃん.psd" 1 serial
   /usr/bin/time -l ./target/release/psd-native-bench "<repo root>/葵ちゃん.psd" 1 8-visible
   ```
   を各3回実行（VM の `memory-peak-comparison.md` と同じ3回プロトコル）。

5. 正しさの検証: 全モード・全実行で出力される `layer_count` /
   `total_decoded_rgba_bytes` / `visible_leaf_count` / `visible_decoded_rgba_bytes`
   をVM側の確定値と突き合わせ。

## 結果

### 正しさの検証（VM値との一致確認）

| 指標 | VM確定値 | macOS実測 | 一致 |
|---|---|---|---|
| native layer_count | 171 | 171 | 一致 |
| ag-psd leaf layer_count | 143（グループ非カウントのため native と数え方が違うだけ） | 143 | 一致 |
| total_decoded_rgba_bytes | 345,168,656 | 345,168,656 | 一致 |
| visible_leaf_count | 27 | 27 | 一致 |
| visible_decoded_rgba_bytes | 161,814,464 | 161,814,464 | 一致 |

全構成・全反復でブレなく一致。デコード対象データ量・可視判定ロジックは
macOS でも同一挙動であることを確認した。

### パース+デコード時間（ms、2セット median の平均、n=12/セット）

| 構成 | VM (i5-13400F) | macOS (M4) | 差分（Mac ÷ VM − 1） |
|---|---|---|---|
| ag-psd (a) full readPsd() | 462.89 | 370.60 | **-19.9%** |
| ag-psd (b) skip系（"壁"） | 405.36 | 325.84 | **-19.6%** |
| native serial・全量 | 217.167 | 206.45 | -4.9% |
| native serial・可視限定 | 156.439 | 101.89 | **-34.9%** |
| native N=8・全量 | 106.067 | 65.31 | **-38.4%**（要注意: 下記ノイズ参照） |
| native N=8・可視限定 | 69.041 | 40.05 | **-42.0%** |

native N=8・全量モードは macOS 側で stddev が大きい（set1 stddev=16.3ms、
set2 stddev=33.7ms、maxが113〜182ms まで散る）。VM側（stddev一桁ms台）より
明らかにノイズが大きい。バックグラウンドプロセスやスケジューラの介入を
排除できていないため、この構成の -38.4% は参考値扱いとする。

### ピークRSS（MiB、3回実行の median）

| 構成 | VM (i5-13400F) | macOS (M4) | 差分（Mac ÷ VM − 1） |
|---|---|---|---|
| ag-psd oneshot（(b)相当） | 464.63 | 453.50 | -2.4% |
| native serial（1 iter） | 366.25 | 397.06 | **+8.4%（Macの方が高い）** |
| native N=8・可視限定（1 iter） | 224.30 | 312.05 | **+39.1%（Macの方が高い）** |

## 結論

- **時間は全構成で Mac が同等以上に速い**。特に並列・可視限定を組み合わせた
  構成（native N=8可視限定: -42.0%、native serial可視限定: -34.9%）で乖離が大きい。
  単スレ全量（native serial・全量: -4.9%）はほぼ横並びで、ag-psd 系（-19.6〜-19.9%）は
  その中間。「並列度・可視限定を効かせるほど VM 比の優位が拡大する」という傾向が
  事実として観測された（原因の特定は本ノートの範囲外・未検証）。
- **ピークRSS は逆の傾向**。ag-psd oneshot はほぼ同水準（-2.4%）だが、native
  serial は Mac の方が+8.4%高く、native N=8可視限定に至っては+39.1%も高い。
  時間が速いほどRSSも低いという単純な相関はMacでは成立しない。
- ピークRSSの逆転について、事実として確認できる差異点（因果の断定はしない）:
  - macOS は仮想メモリページサイズが 16KiB（Apple Silicon）、VM側の Linux/x86_64は
    4KiB。`maximum resident set size` はページ単位の丸めを含む計測のため、
    ページサイズの違いだけでもRSS値の見かけ上のかさ増しが起こりうる。
  - アロケータ実装が異なる（macOS: libmalloc、Linux VM: glibc malloc）。
    スレッド数が増えるほど（N=8）macOS側の逆転幅が拡大している
    （serial +8.4% → N=8可視限定 +39.1%）のは、並行アロケーション時の
    アリーナ確保パターンの違いと整合する事実関係にある。
  - ag-psd（Node/V8ヒープ）だけはほぼ同水準（-2.4%）で、native側のみ逆転幅が
    大きい。ランタイム／アロケータの差が主にネイティブ側の計測に効いている
    ことを示唆する事実。
- ag-psd のバージョン差（VM: 29.1.0 / macOS: 29.0.0）は今回の較正の交絡因子と
  して残る。マイナーバージョン内の変更が計測に影響する可能性は排除できていない。

## 次の一手

- 実験3（end-to-end、macOS実機）の期待値には、本ノートの macOS 実測値
  （native N=8可視限定 median ≈ 40ms、RSS ≈ 312MiB）を基準に据える。
  VM値をそのまま流用しない。
- native N=8・全量のノイズ要因（バックグラウンド負荷 / P・Eコアスケジューリング）の
  切り分けは未実施。taskset相当（macOSでは `thread_policy` や `qos_class` 指定）を
  使った固定化の効果測定は今後の課題。
- ピークRSS逆転の原因（ページサイズ vs アロケータ vs GC挙動）を切り分ける実験は
  未設計。優先度は低い（実験3の実施を優先）。
- ag-psd 29.0.0 → 29.1.0 のマイナーバージョン差分の内容確認は未実施。
