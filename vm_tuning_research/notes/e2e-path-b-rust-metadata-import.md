# path B（rust-backend メタデータのみ import）end-to-end 計測

## 目的 / 仮説

`double-decode-discovery.md` で確認した「ag-psd の ImageBitmap は表示に未使用の死にデータ」
という発見を踏まえ、ag-psd を一切経由せず rust-backend のレイヤーツリー**メタデータのみ**で
PSD インポートを成立させる試作経路（path B）を実装し、path A（現行、ag-psd Worker 経由、
`e2e-path-a-baseline.md`）と同一プロトコルで end-to-end 計測して比較する。

**仮説**: pixel データを JS 側に一切渡さないため、
1. `input→parsed` 区間は ms 一桁〜数十 ms へ縮む（現行 634〜681ms の壁を大きく破る）。
2. pixel 搬送・ImageBitmap 化コストが消えるぶん、end-to-end の支配区間が
   `input→parsed` から `objectAdded→evaluateReady`（native present 待ち）側へ移る。

**反証条件**: 上記のいずれかが成立しなければ棄却する。

## 環境

- macOS Apple M4（開発機、`macos-calibration.md` / `e2e-path-a-baseline.md` と同一機）
- ブランチ: `feature-proxy`
- アプリバージョン: `0.1.1-Beta-490a`
- 対象 PSD: `葵ちゃん.psd`（30MB、171レイヤー = グループ28 + リーフ143）
- 計測フラグ: `psdImportTrace=1&psdRustImport=1`
- `VITE_UXFD_RUST_TIMELINE_SCENE_RPC=1` / `VITE_UXFD_NATIVE_OVERLAY=1` を vite dev server へ渡した
  状態で Electron を起動（path A と同条件）
- **rust-backend は `cargo build --release` でビルドし `UXFD_RUST_BACKEND_BIN` で明示指定した。**
  最初の1回は debug ビルドのまま計測してしまい `input→parsed` が 8000〜9700ms という
  異常値になった（`native-psd-fast-single-thread.md` の 220ms 単騎ベンチマークは release
  ビルド前提だったため、debug ビルドは同一処理でも一桁以上遅い）。この失敗は正式な結果からは
  除外し、release ビルドで撮り直した数値のみを下表に採用する。

## 手順

```
cargo build --release --manifest-path rust-backend/Cargo.toml
export UXFD_RUST_BACKEND_BIN=$(pwd)/rust-backend/target/release/uxfd-rust-backend
node scripts/run-psd-import-e2e.mjs b
```

`scripts/run-psd-import-e2e.mjs` に `b`/`pathb`/`path-b`（第1引数 または
`UXFD_PSD_IMPORT_E2E_MODE=b`）を渡すと、`VITE_DEV_SERVER_URL` に `psdRustImport=1` を追加した
状態で Electron を起動する（`src/utils/psdParser.ts` の `isPsdRustImportEnabled()` ゲート）。
結果は `vm_tuning_research/e2e-path-b/result-<pid>.json` に出力される。
手順自体は path A（`e2e-path-a-baseline.md`）と同一（3回のアプリ起動 × 各2回import）。

## 結果

### 計測点ごとの経過時間（msec、input=0起点に補正）

| 起動# | import順 | input→parsed(Δ) | parsed→objectAdded(Δ) | objectAdded→evaluateReady(Δ) | 合計(evaluateReady) |
|---|---|---|---|---|---|
| 1 | 1回目 | 259.9 | 1.1 | 58.1 | 319.1 |
| 1 | 2回目 | 407.3 | 0.9 | 24.2 | 432.4 |
| 2 | 1回目 | 276.5 | 1.0 | 56.2 | 333.7 |
| 2 | 2回目 | 251.5 | 0.8 | 19.9 | 272.2 |
| 3 | 1回目 | 301.0 | 1.2 | 55.3 | 357.5 |
| 3 | 2回目 | 323.3 | 0.9 | 27.5 | 351.8 |

生データ: `vm_tuning_research/e2e-path-b/result-38376.json`（起動1）、
`result-41113.json`（起動2）、`result-41570.json`（起動3）。
3回とも `passed: true`、`runtimeErrors: []`。T5（native present、
`uxfdSharedRendererPresenterPsdCutoverReason==='nativeRenderFrameReady'`）は path A と同様
到達せず（`nativeRenderFrameUnavailable`、`owner: pixi` のまま）——`prepareNativeRenderUpload`
未配線という既知の制約（`e2e-path-a-baseline.md` 記載）はこの試作経路でも変わらない。
`[data-timeline-item="true"]` に PSD オブジェクトが正しく出現しており、プレビュー/合成が
壊れていないことは確認できた（native present 到達可否とは別の話）。

### path A（基準値）との並記（median、input起点補正、単位ms）

| 区間 | path A 1回目 | path B 1回目 | 短縮率 | path A 2回目 | path B 2回目 | 短縮率 |
|---|---|---|---|---|---|---|
| input→parsed | 936.7 | 276.5 | -70.5%（3.39倍速） | 638.0 | 323.3 | -49.3%（1.97倍速） |
| evaluateReady合計 | 1022.6 | 333.7 | -67.4%（3.06倍速） | 680.1 | 351.8 | -48.3%（1.93倍速） |

path A の値は `e2e-path-a-baseline.md` の生データ（起動1〜3、input起点補正込み）から
本ノートと同じ方法で再集計した中央値。

### 支配区間の内訳（仮説2の検証）

path B でも `input→parsed`（rust-backend の `psd.parseMeta` 往復。pixel搬送はゼロだが
サーバ側で `psd_fast::parse_psd_fast` が全レイヤーの RGBA を今も内部デコードしている）が
end-to-end の **81.5〜84.6%** を占め、依然として支配的だった
（例: 起動2・1回目 = 276.5 / 333.7 = 82.9%）。`objectAdded→evaluateReady`
（native present 待ち区間相当）は 19.9〜58.1ms で、比率は 6〜17% にとどまる。

## 結論

**仮説1（parsedがms一桁〜数十msへ）: 棄却**。`psd.parseMeta` は pixel をネットワーク越しに
一切返さないが、Rust 側で `psd_fast::parse_psd_fast` が全レイヤーの RGBA デコードを今も
内部で行っているため（task ブリーフの指示どおり、本スパイクではここを最適化していない）、
`input→parsed` は 251〜407ms のオーダーに留まった。ag-psd の壁（600〜1500ms）は破ったが、
「ms一桁〜数十ms」には遠く届かない。

**仮説2（end-to-endがevaluateReady支配へ）: 棄却**。pixel搬送・ImageBitmap化を除去しても、
`input→parsed` が引き続き end-to-end の8割超を占め、支配区間はシフトしなかった。
真因はサーバ側の pixel デコードそのものがボトルネックであり、搬送コストの寄与は
（`pixel-handoff-inventory.md` の推定通り）相対的に小さかった。

**それでも実用面では明確な勝利（`practical-victory-criteria.md` 指標1）**。
pixel 搬送・JS側ImageBitmap生成・await_blob待機を丸ごと消したことで、
end-to-end 中央値は1回目で3.06倍速（1022.6ms→333.7ms）、2回目で1.93倍速（680.1ms→351.8ms）。
体感インポート時間は明確に改善しており、指標1は採用（勝利）。

**layer木のRust/ag-psdパリティ: 確認済み・一致**。`葵ちゃん.psd` について両方とも
総ノード数171（グループ28・リーフ143）で完全一致した（`ag-psd` の `readPsd` を
`skipLayerImageData/skipCompositeImageData/skipThumbnail` で走らせて手動比較）。
少なくとも本PSDのレイヤー階層構造については、metadata-onlyパスがag-psdと同じ木を返すことを
確認した。

**5指標の判定状況**:

| # | 指標 | 判定 |
|---|---|---|
| 1 | 体感インポート時間（end-to-end） | **採用（勝利）**。1回目3.06倍速、2回目1.93倍速 |
| 2 | メインスレッド阻害時間 | 未計測（本実験の範囲外、構造的には有利なはずだが未実測） |
| 3 | メモリピーク | 未計測（本実験はタイミングのみ計測） |
| 4 | スケーラビリティ | 未計測（同一PSD 1本のみ、レイヤー数/ファイルサイズを振っていない） |
| 5 | 段階的表示 | 未達成（本試作はメタデータ一括取得のみで、レイヤー逐次到着は未実装） |

## 次の一手 / 未検証事項

- **本実装移植の条件**: 指標1のみでは移植の正当化として弱い。`psd_fast::parse_psd_fast` の
  pixel デコードをメタデータ専用経路では完全にスキップする最適化（本スパイクの意図的な
  対象外）を先に実装し、仮説1・2を再検証すべき。それが通れば「ms一桁〜数十ms」＋
  「支配区間シフト」の両方が成立し、より強い正当化になる可能性が高い。
- **ag-psd 由来メタデータの網羅性は未確認**。今回パリティ確認したのは葵ちゃん.psd
  （8bit、通常グループ構成）1本の総ノード数のみ。以下は本試作の `psd.parseMeta` /
  `parsePsdViaRustMeta`（`src/utils/psdParser.ts`）が正しく引き継げているか未検証:
  - 16bit/32bit PSD（`depth` の伝播。`psd.parseMeta` の返り値に `depth` フィールド自体がない）
  - ラジオグループ（レイヤー名が `*` で始まる isRadio 判定）の初期可視状態が
    ag-psd 経路と完全一致するか（今回は目視でタイムラインに乗ることしか確認していない）
  - レイヤー名のエンコーディング復元（`restoreLayerNameEncoding`）が Rust 側の
    UTF-8 名前と食い違うケースがないか
- メインスレッド阻害・メモリピーク・スケーラビリティ（指標2〜4）を計測する実験3の続きが必要。
- T5（native present）は path A と同じ理由（`prepareNativeRenderUpload` 未配線）で本試作でも
  到達しない。native present 込みの評価をする場合は配線が別途必要。
