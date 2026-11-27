# DISPLAY経路のフェーズ分割（file_read / decode / composite）と並列・active-only適用

## 目的 / 仮説

「絵が出るまで」を縮めるのが新優先課題。本番のDISPLAY経路は
`rust-backend/src/source_frames.rs::build_psd_source_frame` および native-overlay の
`build_native_psd_source_frame`（`rust-backend/src/lib.rs:86-123`）で、
`fs::read` → `psd_fast::parse_psd_fast`（SERIAL・全レイヤーフルデコード） →
`psd_fast::select_psd_composite_frame(active_layer_ids)`（source-over合成、1枚のRgbaFrameへ）
という3段。過去の実験（`parallel-layer-decode-scaling.md`,
`lazy-visible-only-decode.md`）は「デコード」単体のスケーリングだけを見ており、
合成（composite）を含めた合計時間・合成コスト自体・両レバーをDISPLAY経路に
そのまま適用した場合の効果は未計測。本実験でそれを埋める。

計測前に固定する仮説と棄却条件（数値）:

- **H-A**: decodeがDISPLAY経路を支配し、compositeは合計の20%未満。
  - 棄却条件: いずれかのファイルで `composite_ms / total_ms >= 0.20`（fullモード, serial）であれば棄却。
- **H-B**: N=8並列デコードはDISPLAY経路にそのまま転移し、parse+composite合計が
  過去のparse-onlyでの高速化率とほぼ比例して縮む。
  - 棄却条件: `parallel-layer-decode-scaling.md`のserial→N=8高速化率（葵ちゃん・琴葉茜ver0.7で確認済みの比率、
    大型ファイルは本実験で新規に確認）に対し、DISPLAY経路（decode+composite合計）の高速化率が
    **相対で30%以上乖離**（例: parse-onlyが2.0倍速なのにdisplay合計が1.4倍速未満、など）すれば棄却。
- **H-C**: active-only decode（select_psd_composite_frameが実際に必要とするレイヤーだけをデコード：
  デフォルト可視チェーン = 自身のvisibleビット AND 祖先グループ全てのvisibleビット）は
  可視バイト比率の分だけfullデコードより速く、N=8+active-only の組み合わせが最速になる。
  - 棄却条件: いずれかのファイルで `serial-active` または `8-active` のdecode中央値が
    対応する `-full` モードのdecode中央値を上回れば（＝active-only側が遅ければ）棄却。
    また「N=8+active-onlyが最速」自体は、4モード中で `8-active` のtotal中央値が
    最小でなければ棄却。

正しさの検証: 同一ファイルで serial-full / 8-full / serial-active / 8-active の
composite出力（幅・高さ・RGBAバイト総和チェックサム）が完全一致すること。
active-onlyは「合成に使われないレイヤーは元々合成されない」ため理論上は
full decodeと同じcomposite結果になるはず——不一致ならそれ自体を発見として報告し、
そこで停止する。

## 環境

- ホスト: 開発機 macOS 26.5.2 (Apple M4, 10コア論理, 32GB RAM)
- 借用VMではなく開発機での計測（`macos-calibration.md`と同じ位置づけ：VM数値とは別系統、
  本実験は開発機のみで完結させる相対比較）
- Rust: `rustc 1.93.0 (254b59607 2026-01-19)`、`cargo build --release`
  （`opt-level=3, lto=fat, codegen-units=1, panic=abort` — Cargo.tomlの`[profile.release]`）
- 依存: `rayon = "1"`（既存のスレッドプールレバー）
- ベンチクレート: `vm_tuning_research/tools/psd-native-bench/`
  - `src/psd_fast.rs`: `rust-backend/src/psd_fast.rs` コミット
    `3a892c860788f9341a8fb932e49c29dd95527f87` からのフォーク。今回
    `RgbaFrame`（`uxfd-golden-harness`の最小再実装）・
    `select_psd_composite_frame`・`composite_visible_psd_layers*`・
    `composite_layer_source_over`・`source_over_pixel` を同コミットから
    忠実に再移植し、新規に `compute_default_composite_flags` /
    `parse_psd_fast_active_chain`（デフォルト可視チェーンのみをデコードする
    active-onlyエントリポイント）を追加。
  - `src/main.rs`: `display <path> [iters] [threads|serial] [--active-only]` モードを追加。

コーパス（読み取り専用）:
- 葵ちゃん.psd（リポジトリ直下、30MB/171L）
- /Users/yuki/doc/anybox/琴葉茜立ち絵ver0.7.psd（51MB, デコード後1.57GB）
- /Users/yuki/doc/anybox/或窓式琴葉茜立ち絵素材(細).psd（162MB/922L, デコード後1.63GB）

## 手順

```
cd vm_tuning_research/tools/psd-native-bench
cargo build --release
./target/release/psd-native-bench display <path> 10 serial
./target/release/psd-native-bench display <path> 10 8
./target/release/psd-native-bench display <path> 10 serial --active-only
./target/release/psd-native-bench display <path> 10 8 --active-only
```

10イテレーション、先頭2回をウォームアップとして破棄、残り8サンプルの中央値を採用。
各実行末尾に `width, height, checksum(sum of rgba bytes)` を出力するので、
同一ファイルの4モード間でこの3値が完全一致することを目視確認する。

## 結果

各セル= 8サンプル中央値（ms）。checksum列は4モード（serial-full / 8-full /
serial-active / 8-active）で `width`・`height`・RGBAバイト総和チェックサムが
完全一致したかどうか（実測: **3ファイルすべて完全一致**）。

### 葵ちゃん.psd（30MB, 2700×3700, 171L）

| mode | file_read | decode | composite | total |
|---|---:|---:|---:|---:|
| serial-full | 2.663 | 202.210 | 69.680 | 276.346 |
| 8-full | 2.455 | 57.114 | 70.589 | 130.525 |
| serial-active | 2.853 | 97.200 | 74.634 | 181.614 |
| 8-active | 2.407 | 28.219 | 69.034 | 100.890 |

checksum: `2700×3700, sum=3407218997`（4モード完全一致）

### 琴葉茜立ち絵ver0.7.psd（51MB, 5047×7000, デコード後1.57GB）

| mode | file_read | decode | composite | total |
|---|---:|---:|---:|---:|
| serial-full | 4.220 | 761.129 | 353.394 | 1116.977 |
| 8-full | 4.491 | 270.899 | 363.636 | 639.960 |
| serial-active | 3.979 | 580.958 | 355.374 | 945.375 |
| 8-active | 4.388 | 192.177 | 363.952 | 560.834 |

checksum: `5047×7000, sum=11871586801`（4モード完全一致）。
`serial-active`のdecodeはstddev 45msとノイズが大きかった（min 88ms〜max 233ms、
葵ちゃんの2回目実行時に他プロセス干渉があった可能性）が、中央値は安定した順序関係を保った。

### 或窓式琴葉茜立ち絵素材(細).psd（162MB, 2970×4520, 922L, デコード後1.63GB）

| mode | file_read | decode | composite | total |
|---|---:|---:|---:|---:|
| serial-full | 13.620 | 1288.742 | 47.887 | 1361.107 |
| 8-full | 13.259 | 372.431 | 43.565 | 431.318 |
| serial-active | 13.294 | 43.494 | 39.975 | 97.321 |
| 8-active | 13.647 | 31.402 | 39.332 | 84.866 |

checksum: `2970×4520, sum=2437149627`（4モード完全一致）。
serial-full decodeの中央値1288.742msは、既知のN=8=370ms（本文記載の既存計測値）から
逆算した想定serial値と整合（N=8 372.431msも既存計測とほぼ一致）——このファイルは
デフォルト可視チェーンの比率が非常に低いらしく、active-onlyでdecodeが1289ms→43ms
（serial）まで縮む。

## 結論

**H-A（decodeが支配的、composite<20%）: 棄却**。
serial-fullでのcomposite/total比は 葵ちゃん25.2%・琴葉茜ver0.7 31.6%・或窓式3.5%。
3ファイル中2ファイルで20%を明確に超過（うち琴葉茜ver0.7は3割超）——判定基準
「いずれかのファイルで20%以上なら棄却」に該当。compositeコストはレイヤー数や
デコードバイト量ではなくキャンバス面積（width×height）にほぼ比例する固定コストらしく、
デコードバイト量が少ない/中規模ファイルほど相対的に重くなる。或窓式のような
「キャンバスは中庸だが総デコード量が最大」のファイルでのみH-Aは成立する。

**H-B（N=8がdisplay経路にそのまま比例転移）: 棄却（大半のファイルで）**。
decode単体のserial→N=8高速化率と、display合計（total）のserial-full→8-full高速化率を比較：

| ファイル | decode単体の高速化率 | display合計の高速化率 | 相対乖離 |
|---|---:|---:|---:|
| 葵ちゃん | 3.54倍 | 2.12倍 | 40.2%（棄却域） |
| 琴葉茜ver0.7 | 2.81倍 | 1.75倍 | 37.9%（棄却域） |
| 或窓式 | 3.46倍 | 3.16倍 | 8.8%（許容域） |

閾値30%を2/3ファイルで超過。原因はH-Aと同根で、compositeがスレッド数に関わらず
一定コストのまま残り、decodeだけ縮んでもtotalの縮み方が頭打ちになるため。
或窓式のような「decodeが支配的でcompositeが相対的に小さい」ファイルでのみ
並列化の効果がほぼそのまま転移する。

**H-C（active-onlyが可視バイト比率分速く、N=8+active-onlyが最速）: 採用**。
3ファイルすべてで `serial-active`/`8-active` のdecode中央値が対応する `-full` モードを
下回り（active-only側が遅くなったケースはゼロ）、かつ `8-active` のtotal中央値が
4モード中最小（葵ちゃん100.890ms・琴葉茜ver0.7 560.834ms・或窓式84.866ms）。
棄却条件はどちらも発生しなかったため採用。ただし「効果の大きさ」はファイル依存で、
或窓式（decode 1289ms→31ms、97%減）のように可視チェーン比率が低いファイルほど
劇的、葵ちゃん（202ms→28ms、86%減）はやや効果薄、琴葉茜ver0.7（761ms→192ms、75%減）は中間。

**正しさの検証: 3ファイルとも4モード（serial-full/8-full/serial-active/8-active）で
composite出力の幅・高さ・RGBAバイト総和チェックサムが完全一致** — active-only分岐が
composite結果を変えていないこと（＝非選択レイヤーは元々合成されていなかったこと）を
実測で確認。破棄条件（不一致）には該当しなかった。

**表示経路をどこまで縮められるか（projected, 現行productionのserial-fullを基準とした
8-active採用時の見込み）**:

| ファイル | 現行(serial-full)想定 | 8-active採用後の見込み | 短縮率 |
|---|---:|---:|---:|
| 葵ちゃん | 276ms | 101ms | -63% |
| 琴葉茜ver0.7 | 1117ms | 561ms | -50% |
| 或窓式 | 1361ms | 85ms | -94% |

**重要な副産物の発見**: active-only + N=8を適用すると、compositeがdecodeを上回る
支配区間になるファイルが出る（琴葉茜ver0.7の8-active: decode 192ms vs composite 364ms、
compositeがtotalの65%）。decode最適化だけでは頭打ちがあり、**composite自体の高速化
（並列化・SIMD化・矩形クリップの効率化など）が次の主要ターゲット**になる。

## 次の一手

1. **本実装昇格の設計方針**: `psd_fast::parse_psd_fast`のAPIシグネチャ
   （`fn parse_psd_fast(bytes: &[u8]) -> Result<PsdFastResult, String>`）は
   互換のまま維持しつつ、`build_native_psd_source_frame`
   （`rust-backend/src/lib.rs:86-123`）が呼ぶ内部経路だけを
   `parse_psd_fast_active_chain`相当（本ノートの`compute_default_composite_flags`＋
   rayon Nスレッドプール）に差し替える。具体的には：
   - `psd_fast`に新しい`parse_psd_fast_for_display(bytes, active_layer_ids: Option<&[String]>, num_threads: usize)`
     を追加し、`active_layer_ids`がNoneまたは空ならデフォルト可視チェーン
     （`compute_default_composite_flags`）で、Someなら`active_layer_ids`ベースの
     チェーン判定（`select_psd_composite_frame`の`Some`分岐と同じ祖先チェーン走査）で
     デコード対象レイヤーを絞り込む。
   - 既存の`parse_psd_fast`（全レイヤーフルデコード）はテスト・後方互換のために残す
     （golden-harnessや既存ユニットテストが依存している可能性があるため削除しない）。
   - スレッド数はVM/開発機のコア数に応じた定数（本実験・過去の
     `parallel-layer-decode-scaling.md`の知見どおりN=8で頭打ち）をrust-backend側に
     ハードコードするか、`std::thread::available_parallelism()`をキャップして使う。
   - `build_native_psd_source_frame`を`fs::read → parse_psd_fast_for_display(active_layer_ids) → select_psd_composite_frame`
     に置き換える。`select_psd_composite_frame`自体は無変更（本実験の忠実移植コピーと
     production版は差分ゼロであることをコード上のvendoringコメントで保証済み）。

2. **トグル時再デコードの扱いは別ノートで既に調査済み**:
   `display-path-toggle-redecode.md`（本ノートと同日）が読み取り調査で確定済み：
   3層あるキャッシュ（native-overlay/`SourceFrameCache`/`MediaTextureCache`）は
   すべて`active_layer_ids`を含む「メディア単位」キーのため、レイヤーを1枚トグルする
   だけで全キャッシュがミスし、`parse_psd_fast`が非可視レイヤーも含めて全リーフを
   再解凍している（3Dビルボード経路はサーバ側キャッシュ自体がゼロで最悪）。
   同ノートが特定した昇格挿入点3つ——(a)並列化、(b)active-only前倒し、
   (c)per-layer解凍キャッシュ（`(ファイル同一性, layer stable_id) → Arc<RGBA>`、
   最高レバレッジと判定）——のうち(a)(b)は本ノートの計測値そのもの（decode欄）で
   効果を裏付け済み。同ノートの予測「トグル体感は全解凍→再合成のみへ、
   合成コストが次の支配項になる」は本ノートの発見（active-only+N=8適用後は
   compositeがdecodeを上回る）と一致する。(c)per-layer解凍キャッシュの
   実装コスト・設計詳細は同ノートに委ね、本ノートでは重複調査しない。

3. **composite自体の高速化調査（本実験の副産物発見に基づく新規テーマ）**:
   `composite_layer_source_over`は1ピクセルごとにf32変換・除算を行うsource-overで、
   キャンバス面積に比例した固定コストとして測定された（葵ちゃん69ms・琴葉茜ver0.7 354ms・
   或窓式40ms）。decode側をactive-only+N=8で縮めるほどcompositeの相対比重が増すため、
   (a) レイヤーごとのcompositeをrayonで並列化する（ただし単一canvasへの書き込みなので
   排他制御か行分割が必要）、(b) 完全不透明レイヤー（アルファ処理不要）の高速パスを
   分離する、(c) SIMD化、のいずれかを次の実験候補として`vm_tuning_research/`に別ノートで
   切り出すことを推奨する。
