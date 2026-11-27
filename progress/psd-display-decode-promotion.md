# PSD表示経路デコードの並列+active-only昇格

## Decision

- 表示3経路（native overlay `build_native_psd_source_frame` / プレビュー
  `decode_psd_source_frame` / ビルボード `handle_psd_render_composite`）の PSD デコードを
  `parse_psd_fast_for_display(bytes, selection)` へ切替（版 491a、`e6bc9838`）。
  合成が実際に読むリーフだけを、rayon 共有プール（`OnceLock`、`min(8, cores)`）で並列解凍する。
- 根拠は vm_tuning_research の実測: 表示合計 葵ちゃん276→101ms / 茜ver0.7 1117→561ms /
  或窓式 1361→85ms、全モードで合成バイト一致。
- `parse_psd_fast` 本体と他呼び出し元（psd.parse blob / psd.parseMeta）は無変更。

## Alternatives considered

- スレッドプールを呼び出し毎に生成 → 棄却（研究実測で毎回~50msのオーバーヘッド）。
- 12スレッド → 棄却（研究実測でN=8頭打ち、メモリ帯域律速）。
- 選択フィルタを合成段に残したまま並列化のみ → 棄却（or窓式のように非可視が多い
  ファイルで数百msを捨てることになる。active-only前倒しはチェックサム一致を実証済み）。

## Constraints / Gotchas

- 選択×解凍の等価性が成立するのは、現行 psd_fast にクリッピングマスク・調整レイヤー・
  通常以外のブレンドモードが**存在しない**（フラットな per-leaf source-over のみ）ため。
  これらを将来サポートする場合、「選択外レイヤーのピクセルが合成に影響しない」前提が
  崩れるので `compute_display_selection_flags` の再検討が必須。
- 契約テスト2本（default選択とactive上書きの双方で、合成バイト一致＋除外リーフの
  rgba None によるスキップ実証）が回帰ゲート。
- 次段: per-layer解凍キャッシュ（トグル時の再解凍ゼロ化）、合成の並列化
  （茜ver0.7では合成364msが新支配項）。
