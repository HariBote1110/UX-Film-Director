# PSD ピクセル搬送経路の棚卸しと Rust 完結化の設計図

## 目的

「ag-psd を実用面で超える」ための本命＝Rust 完結経路の設計に先立ち、
現行の全経路のコピー・変換・境界跨ぎを数え上げる（2026-08-08 読み取り調査、コード改変なし）。

## 現行 3 経路のコスト（30MB / 171 レイヤーの葵ちゃん.psd 基準）

### 経路1: ag-psd Worker（現行の本流）

`psdParser.ts:1050-1087` → `psdWasm.ts`（名前は WASM だが実体は ag-psd Worker）→
`psdAgPsdWorker.ts:115` readPsd → `transferToImageBitmap()` → ImageBitmap を transfer で返送。

- ファイル 30MB を 1 回読み、Worker へゼロコピー transfer。復路もほぼゼロコピー。
- 支配コストは搬送ではなく **ag-psd 内部のデコード＋RGBA 書き込み（405〜650ms）**。
- 搬送設計としては意外に無駄が少ない。倒すべきはデコード時間そのもの。

### 経路2: Electron Rust フォールバック `parse-psd`（最悪の経路）

`psdParser.ts:853-1016` → IPC → `media.rs:212-315` `psd.parse` →
**全レイヤー RGBA（100MB超）を一時ファイルへ書き出し** → Node が読み戻し →
Electron IPC で structured-clone → renderer で ImageData/createImageBitmap 再構築。

- **ピクセル全量のフルコピー最大5回＋ディスク往復2回**。
- 幸い本流ではなく ag-psd 失敗時のみ。ただし「Rust でパースしても搬送で全部溶ける」
  という反面教師として重要。**Rust 完結化の敵はパース速度ではなくこの搬送設計**。

### 経路3: native overlay の in-process 合成（目標の姿、既存）

`native-overlay/src/lib.rs:2775-2798` → `build_native_psd_source_frame`（`rust-backend/src/lib.rs:86-123`）→
`parse_psd_fast` → `select_psd_composite_frame` → `RgbaFrame` を直接 wgpu テクスチャキャッシュへ。

- **IPC 無し・直列化無し・ディスク無し**。同一プロセスの関数呼び出しのみ。
- ただし現状は「合成済み 1 枚」専用（キーは filePath::activeLayerIds）。

## Rust 完結インポートに足りないもの（＝本実装の仕様候補）

1. **per-layer テクスチャ導線**: 現状の native 側キャッシュは合成1枚のみ。
   レイヤー個別編集には per-layer `RgbaFrame` のキャッシュ/アップロード経路が要る。
2. **メタデータ橋**: JS 側が必要とするのはツリー形状 JSON のみ
   （`media.rs:276-289` が返す nodes 形式から pixel 系フィールドを落としたもの）。
   正式な JSON Schema は未整備（TS `RustPsdNode` と serde_json の ad hoc ミラー）。
3. **stable_id の一元化**: Rust 側 `psd_fast.rs:829,851` の `psd-layer-{idx}` /
   `psd-group-{id}` が事実上の共有スキーマ。JS 側 `buildStablePsdLayerNodeId`
   （`psdParser.ts:327-340`）の再生成をやめ Rust 発行に寄せると ID 不整合を構造的に防げる。

## end-to-end 実験（実験3）の計測点設計

- A: 経路1（ag-psd Worker）: ファイル投入 → 全 ImageBitmap 到着まで。
- B: Rust 完結試作: `parse_psd_fast`（並列版）→ per-layer RgbaFrame 生成完了
  ＋ツリー JSON 生成まで（VM で計測可能な区間）。テクスチャ化以降は macOS 実機で別途。
- 経路2 は比較対象として温存する価値なし（棄却根拠のみ記録）。
- 段階的表示の実証: B はメタデータ JSON を先行返却（既存実測 ~5ms オーダー）できる。
  A は readPsd 完了まで何も返せない。この差を「実用で超える」提示の柱にする。

## 結論

- 勝負所は 2 つ: (1) デコード時間（ネイティブ単騎 220ms、並列化でさらに短縮見込み）、
  (2) 搬送ゼロ化（経路3 の in-process パターンを per-layer に一般化）。
- 経路2 の disk-blob 設計は棄却済みの前例として記録する。再利用しない。
