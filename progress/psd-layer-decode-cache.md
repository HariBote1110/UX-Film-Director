# PSD per-layer解凍キャッシュ — トグルを再合成のみに短縮

## Decision

- `(ファイル同一性(path,mtime_nanos,file_len), layer stable_id) → Arc<RGBA>` の
  byte-budget LRU（既定512MB）を `rust-backend/src/psd_layer_cache.rs` に新設し、
  表示3経路を `parse_psd_fast_for_display_cached` へ切替（版 491b、`50121c86`）。
- トグル時は選択に新規追加されたリーフだけを解凍し、既存分は Arc 共有で再利用。
  ウォーム時のトグル遅延は「合成コストのみ」（葵~70ms / 茜ver0.7~360ms / 或窓~40ms）へ。
- `PsdFastLayer::rgba` を `Option<Arc<Vec<u8>>>` へ変更（ヒット時のディープコピー回避）。
  struct は psd_fast.rs 内に閉じており波及は機械的な適応のみ。

## Alternatives considered

- メディア単位キャッシュのキーから active_layer_ids を外す → 棄却
  （合成結果は選択依存なので最終合成キャッシュのキーからは外せない。
  解凍とキャッシュの粒度をレイヤーに下げるのが正しい分解）。
- プロセス跨ぎ共有（rust-backend RPC プロセスと native-overlay プロセス）→ 見送り
  （Rust static では不可能。各プロセス内共有で目的は達成。跨ぎたくなったら共有メモリ設計が別途要る）。

## Constraints / Gotchas

- ロック規約: 参照時に一括ロック→解放→rayon で未ヒット分を解凍→再ロックで挿入。
  解凍中はロックを持たない（プール飢餓防止）。
- 契約テスト4本（選択差分のみ解凍 / 2選択連続でのバイト一致 / mtime変更で全再解凍 /
  予算超過LRU退避）が回帰ゲート。stats(hits/misses/decodes/evictions) はテスト用API。
- 次の支配項は合成（全面 source-over blend）。茜ver0.7 で ~360ms。並列化は研究側で検証中。
