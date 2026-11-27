# ag-psd ベースライン計測（VM・Node.js）

## 目的・仮説

`markdown/PSD_WASM_Challenge.md` に記録された過去の挑戦は、ブラウザ上で
WASM 並列展開が ag-psd（約 310ms）に勝てなかったという結論だった
（Phase 0 単一スレッド WASM は ~522ms、JS PackBits 再実装は ~726ms、
いずれも ag-psd に劣る）。この記録はブラウザ環境かつ macOS 開発機での
横比較が混在しており、他マシンでの自前実装検討の「勝敗ライン」として
再利用できる、単一環境（この VM）で完結したベースラインが存在しない。

**仮説**: この VM 上で ag-psd の readPsd() 実行時間を Node.js で計測すれば、
今後この VM 上で自前実装（Rust/WASM 含む）を評価する際の「超えるべき壁」
として使える基準値が得られる。

本ノートはその壁の記録であり、まだ自前実装の優劣を判定するものではない
（研究はここからが本番）。

## 環境

- 接続: `ssh haribote@100.72.111.20`（`vm_tuning_research/notes/environment.md` 参照）
- CPU: 13th Gen Intel Core i5-13400F、VM 割当 12 vCPU
  - `/proc/cpuinfo` の `cpu MHz` は 12 論理コア全て `2496.000` で完全に一致
    （ゲスト側からはスケーリングの揺れは観測されず、固定クロックに見える。
    ホスト側のガバナ設定は不明・未検証）
- OS: Ubuntu 26.04 LTS
- Node.js: v22.22.1
- ag-psd: **29.1.0**（`package.json` の指定は `^29.0.0`。開発機の
  `node_modules/ag-psd` は 29.0.0 だったが、VM に `npm install ag-psd@^29`
  した結果パッチ違いの 29.1.0 が入った。バージョン差の影響は本計測では
  未検証）
- PSD サンプル: `葵ちゃん.psd`（リポジトリルート）
  - ファイルサイズ: 29.74 MB（31,181,666 bytes）
  - レイヤー数: 171 layers（`PSD_WASM_Challenge.md` の実測値より。今回は
    改めて数えていない）

## 手順

1. ローカルでスクリプトを作成:
   - `vm_tuning_research/tools/bench-agpsd.mjs` — ag-psd 計測
   - `vm_tuning_research/tools/bench-wasm.mjs` — 既存 Node 向け WASM
     ビルド（`perf/wasm-node/`）の再利用計測
2. VM に転送:
   ```
   ssh haribote@100.72.111.20 "mkdir -p ~/psd-bench"
   scp 葵ちゃん.psd haribote@100.72.111.20:~/psd-bench/
   scp vm_tuning_research/tools/bench-agpsd.mjs haribote@100.72.111.20:~/psd-bench/
   scp vm_tuning_research/tools/bench-wasm.mjs   haribote@100.72.111.20:~/psd-bench/
   scp -r perf/wasm-node haribote@100.72.111.20:~/psd-bench/
   ```
3. VM 上で ag-psd を導入:
   ```
   cd ~/psd-bench && npm init -y && npm install ag-psd@^29
   node -e "console.log(require('ag-psd/package.json').version)"  # => 29.1.0
   ```
4. 計測実行（各 15 回、先頭 3 回をウォームアップとして破棄）:
   ```
   node bench-agpsd.mjs   # ag-psd、2 回実行してノイズを確認
   node bench-wasm.mjs    # 既存 Node-WASM（PsdParser、比較参考用）
   ```

### ag-psd の Node.js 上での注意点（実装メモ）

ag-psd は `useImageData: true` を指定してもピクセルバッファの確保に
`initializeCanvas()` で登録した `createImageData` を内部で呼ぶ
（`ag-psd/dist/psdReader.js` の `createImageDataBitDepth()` が
`helpers.createImageData()` を経由するため）。素の Node.js では
`canvas` npm package（cairo などネイティブ依存）が無いと
`Error: Canvas not initialized` で例外になる。

今回は `canvas` package のネイティブビルド一式を VM に入れる代わりに、
`bench-agpsd.mjs` 内でバッファ確保だけ行う最小スタブ
（`{ width, height, data: new Uint8ClampedArray(...) }` を返すだけの
`createCanvas`/`createImageData`）を `initializeCanvas()` に登録した。
実際の `canvas` package の `createImageData` も PSD 解析とは無関係な
バッファ確保しかしないため、計測対象のデコード処理のコストは変わらない
はずである（未検証: 本物の `canvas` package を入れた場合との差分計測は
していない。次の一手に記載）。

## 結果

### CPU クロック

全 12 vCPU の `cpu MHz` は `2496.000` で完全一致。ガバナ由来の揺れは
ゲスト観測範囲では見えなかった。

### ag-psd（29.1.0）— 2 セット計測

各セット: n=15 実行、先頭 3 回破棄、有効サンプル n=12。単位は ms。

**セット 1**

| 計測対象 | min | median | mean | max | stddev |
|---|---|---|---|---|---|
| (a) full readPsd()（composite + thumbnail + 全レイヤー） | 450.55 | 459.35 | 465.32 | 498.18 | 14.26 |
| (b) skipCompositeImageData + skipThumbnail（レイヤーのみ展開） | 398.21 | 404.95 | 414.27 | 439.79 | 15.24 |

**セット 2**

| 計測対象 | min | median | mean | max | stddev |
|---|---|---|---|---|---|
| (a) full readPsd() | 444.10 | 466.43 | 467.72 | 489.90 | 13.49 |
| (b) skip系 | 393.34 | 405.77 | 407.64 | 432.42 | 10.68 |

2 セット間の median 差は (a) で約 1.5%、(b) で約 0.2% とごく小さく、
VM のノイズは実用上無視できるレベルだった。

### 参考: 既存 Node-WASM（`perf/wasm-node/` の `PsdParser`、リビルドなし）

| 計測対象 | min | median | mean | max | stddev |
|---|---|---|---|---|---|
| PsdParser::new() + 全レイヤー get_layer_rgba（単一スレッド） | 533.99〜544.95 | 567.89〜572.79 | 573.73〜575.13 | 606.45〜613.17 | 16.54〜23.25 |

（2 セット計測、範囲で表記。単一スレッド・SIMD 無し・並列化無しの
フォールバック実装であり、`PSD_WASM_Challenge.md` の Phase 0 と同系統）

## 結論

- この VM・この Node バージョン・この PSD ファイルにおける ag-psd の
  実測ベースラインは、**全体解体込み(a) で median ≈ 460ms**、
  **合成画像/サムネイルをスキップした(b) で median ≈ 405ms**。
  今後この VM 上で自前実装を評価する際は、まずこの (b) の
  405ms を「超えるべき壁」とする（本番コード側もレイヤー展開が
  主目的で合成画像は使っていないため、(b) が実態に近い比較対象）。
- 既存の Node 向け WASM ビルド（単一スレッド `PsdParser`）は
  median ≈ 570ms で、ag-psd (a) 460ms より遅い。これは
  `PSD_WASM_Challenge.md` の Phase 0（ブラウザ上、対 ag-psd 1.68倍遅い）
  と定性的に一致する結果であり、単一スレッド WASM が V8 JIT に
  ネイティブ TypedArray 処理で勝てないという既存の知見をこの VM でも
  再現した（**新規棄却仮説ではなく、既知の結論の再確認**）。
- VM のノイズは 2 セット間で median 差 2%未満と小さく、以後の計測は
  1 セット（15 回、先頭 3 回破棄）でも十分な精度が見込める。ただし
  重要な意思決定（自前実装の採否判定）の際は念のため 2 セット計測を
  継続することを推奨する。

## 次の一手

- 自前実装（Rust/WASM もしくは Node ネイティブ拡張）が (b) の
  median ≈ 405ms を超えられるかを、同一 VM・同一プロトコルで検証する。
- 本物の `canvas` npm package（ネイティブビルド）を導入した場合の
  ag-psd 計測値と、今回のスタブ計測値の差分を確認する（スタブが
  実コストを過小評価していないかの裏取り）。ディスク残 9.4GB のため
  ネイティブ依存（cairo/pango/jpeg/gif/librsvg 系 apt パッケージ）の
  容量を先に見積もること。
- ag-psd 29.0.0（package.json 指定の下限）と 29.1.0（今回 VM に入った
  実バージョン）の性能差の有無を確認する（今回は未検証のまま）。
- `~/psd-bench` は VM 上に残置済み（45MB、node_modules 含む）。
  次回の計測はここを再利用できる。
