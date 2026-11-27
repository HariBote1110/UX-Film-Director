# PSD 解析高速化チャレンジ — 技術的記録

> **結論**: WebAssembly 並列展開は ag-psd を超えられなかった。
> 最終的に「WASM でメタデータのみ解析 + ag-psd を Worker で実行」というハイブリッド構成に落ち着いた。
> この文書はその試行錯誤の全記録である。

---

## 背景と動機

PSD インポート時、ag-psd（JavaScript ライブラリ）がメインスレッドを約 **310 ms** ブロックしていた。
これによりタイムラインの操作が一時停止する UX 上の問題があった。

### 初期仮説

> 「Rust + WASM で PackBits/ZIP を展開し、Web Worker で並列化すれば ag-psd を大幅に超えられる」

---

## 試行と計測の記録

### Phase 0: 単一スレッド WASM（比較基準）

**実装**: `PsdParser` — Rust で全レイヤーを一括展開する WASM モジュール。

| 指標 | 値 |
|---|---|
| 合計 | ~522 ms |
| ag-psd 比 | 1.68× **遅い** |

**原因判明**: V8 JIT は TypedArray ループを WASM より最適化する。
PackBits は「1 バイトずつ読んで分岐する」単純なループであり、
V8 の JIT が WASM より効率的にコンパイルする。

---

### Phase 1: 二段階 + Worker 並列アーキテクチャ（WASM展開）

**実装**:
- Phase 1（メインスレッド）: `PsdLayout::new()` でメタデータのみ解析 → ~5 ms
- Phase 2（8 Worker 並列）: 各 Worker が `decompress_layer()` で担当レイヤーを展開

**工夫した点**:
1. `channel_data_offset` を事前計算し Worker がランダムアクセス可能に
2. Worker は `PsdLayout::new()` を毎回呼ばず `decompress_layer_raw()` で直接展開
3. 負荷分散をピクセル数ベース（`width × height`）の重み付きで実施

**計測結果**（実測値）:

```
[WASM parallel ×8] copy=4.2ms  phase1=5.3ms  phase2=475ms  total=485ms
END-TO-END: 706ms
```

**内訳**:
```
Worker 1: decompress=278ms  layers=3   (3枚の巨大レイヤー)
Worker 8: decompress=468ms  layers=52  (52枚の小レイヤー)
```

**問題**:
- 3 レイヤー担当 Worker が 278ms → **1 レイヤーあたり ~93ms**
- Node.js WASM のシリアル計測では 1 レイヤー ~6.7ms
- **ブラウザ WASM は Node.js より約 14 倍遅い**

**原因**:
各 Worker が独立した WASM インスタンスを持ち、V8 の JIT ウォームアップが
毎回走る。また SharedArrayBuffer へのランダムアクセスが CPU キャッシュの
スラッシングを引き起こす。シーケンシャルアクセスの ag-psd と根本的に設計が異なる。

---

### Phase 2: JS PackBits 実装（Worker での WASM 排除）

**実装**: `psdDecompress.ts` — TypeScript で PackBits / ZIP を実装。

**仮説**: 「WASM が遅いなら JS で実装すれば V8 JIT が最適化するはず」

**計測結果**:

```
[WASM parallel ×8] phase2=520ms  total=531ms
END-TO-END: 726ms
```

**結果**: WASM（475ms）より **さらに遅くなった**。

**原因の再分析**:
- SharedArrayBuffer へのランダムアクセスパターン自体が問題
- 143 レイヤーに散在する channel_data_offset への並列アクセスが
  キャッシュラインを汚染し、全 Worker のスループットが低下
- ag-psd はファイルを先頭から順に読む（シーケンシャルアクセス）ため
  プリフェッチャーが有効に機能する

---

### Phase 3（最終形）: ag-psd Worker ハイブリッド

**実装**:
- Phase 1（メインスレッド、~5ms）: WASM `PsdLayout` でメタデータのみ解析
  → グループ構造・レイヤー名・位置を即座に取得し UI に反映可能
- Phase 2（単一 Worker、~310ms）: ag-psd で全レイヤーを展開
  → OffscreenCanvas を使い RGBA データを取り出して転送

**最終計測値（実測）**:

```
[ag-psd Worker] readPsd=647ms  walk=6ms  layers=171
imageBitmap=0.2ms
END-TO-END=721ms
```

| 指標 | 修正前（blocking） | 最終形（non-blocking） |
|---|---|---|
| readPsd | 310ms | 647ms |
| walk（ピクセル取得） | — | **6ms**（transferToImageBitmap） |
| imageBitmap 生成 | 108ms | **0.2ms** |
| **合計** | **310ms（UI フリーズ）** | **721ms（UI 操作可能）** |

**`transferToImageBitmap()` が劇的効果**:
- 旧: `getImageData()` → RGBA バッファ転送 → `createImageBitmap()` = 317ms + 108ms
- 新: `canvas.transferToImageBitmap()` = 6ms（GPU テクスチャの所有権移転のみ）

**`skipCompositing: true` の効果**:
- 合成済み全体画像の読み込みをスキップして 200ms 削減
- 残り 647ms は 143 レイヤーの実際の展開コストであり、これ以上の削減は困難

**結論**: 絶対時間は 310ms → 721ms と増加したが、
メインスレッドは完全に非ブロッキング。UI の体感速度は向上している。

---

## 技術的知見のまとめ

### WASM が速いケースと遅いケース

| ケース | WASM の優位性 | 理由 |
|---|---|---|
| 重い数値計算（SIMD等） | ✅ 速い | JIT を超える最適化が可能 |
| バイト列の逐次処理（PackBits等） | ❌ 遅い | V8 JIT の TypedArray 最適化に負ける |
| シーケンシャルファイル解析 | △ 同等 | V8 と互角程度 |
| ランダムアクセス並列 | ❌ 遅い | SAB のキャッシュスラッシング |

### ag-psd が強い理由

1. **シーケンシャルアクセス**: CPU プリフェッチャーが有効に機能する
2. **長年の最適化**: ブラウザの V8 JIT 特性に合わせたコードパス
3. **モノリシック処理**: Worker 間通信オーバーヘッドなし

### Web Worker 並列化の限界

「CPU ヘビーな処理を N 分割すれば N 倍速くなる」は幻想。

- **共有メモリへのランダムアクセス**はキャッシュスラッシングを引き起こす
- **JIT ウォームアップ**が各 Worker で独立して走る（特に WASM）
- **ファイル解析**はシーケンシャル前提の設計が前提のため並列化と相性が悪い

並列化が有効な処理:
- 独立した計算（各 Worker が独自データを保有）
- CPU バウンドかつキャッシュに収まるサイズ
- 前後依存がない純粋な変換処理

---

## 最終アーキテクチャ

```
psdParser.ts
└─ parsePsdViaWasm()
   └─ psdWasm.ts: parsePsdWithWasm()
      ├─ [Phase 1 ~5ms]  WASM PsdLayout::new()  → メタデータ（グループ構造・位置）
      └─ [Phase 2 ~310ms] psdAgPsdWorker.ts       → ag-psd readPsd() + ピクセル抽出
         ├─ OffscreenCanvas で initializeCanvas()
         ├─ readPsd(buffer, { skipCompositing: true })
         └─ 各レイヤーの canvas.getImageData() → ArrayBuffer 転送
```

---

## 関連ファイル

> **削除済み（`Rust_Source_Of_Truth_Plan.md` R5-2、§8 設計判断 5 = 削除で確定）**:
> `psd-wasm/`（クレート本体）・`src/wasm/psd/`（ビルド成果物）・
> `perf/wasm-node/`（Node 向け WASM ビルド）・`perf/bench-psd.mjs` は
> デッドコードのため削除した。以下の表はチャレンジ当時の記録として残す。

| ファイル | 役割 |
|---|---|
| `psd-wasm/src/lib.rs`（削除済み） | WASM バインディング（Phase 1 メタデータ用） |
| `psd-wasm/src/psd_fast.rs`（削除済み） | Rust PSD パーサー（Phase 1 のみ使用） |
| `src/wasm/psd/`（削除済み） | wasm-pack ビルド成果物 |
| `src/utils/psdWasm.ts` | ハイブリッドパーサー（公開 API） |
| `src/utils/psdAgPsdWorker.ts` | ag-psd Worker |
| `src/utils/psdDecompress.ts` | JS PackBits 実装（現在は未使用・参考実装） |
| `src/utils/psdWorker.ts` | 旧 WASM Worker（現在は未使用） |
| `perf/bench-psd.mjs`（削除済み） | Node.js ベンチマークスクリプト |
| `perf/wasm-node/`（削除済み） | Node.js 向け WASM ビルド |
