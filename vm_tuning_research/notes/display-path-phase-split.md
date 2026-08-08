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

（実行後に追記）

## 結論

（実行後に追記）

## 次の一手

（実行後に追記）
