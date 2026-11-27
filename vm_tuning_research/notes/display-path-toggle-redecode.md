# 表示経路の再デコード挙動 — トグル1回で全レイヤー解凍をやり直している

## 事実（2026-08-09 読み取り調査、コード改変なし）

- キャッシュは3層あるが（native-overlay `NativeOverlaySourceCache` /
  rust-backend `SourceFrameCache` / native-wgpu `MediaTextureCache`、いずれも512MB級LRU）、
  **全部「メディア単位」のキーで、per-layer キャッシュは存在しない**。
  キーには `active_layer_ids` が含まれる（`native-overlay/src/lib.rs:3334` 等）。
- したがって**レイヤーを1枚トグルするだけで全キャッシュがミス**になり、
  `fs::read`（ファイル全読み）→ `parse_psd_fast`（**非可視も含む全リーフの解凍**、
  `psd_fast.rs:739-759`）→ 全面合成、を毎回やり直す。
  active_layer_ids のフィルタは合成段（`psd_fast.rs:557-576`）でしか効いていない。
- **3Dステージのビルボード経路はさらに悪く、サーバ側キャッシュがゼロ**
  （`media.rs:424-495` `handle_psd_render_composite`）。トグルのたびに
  全読み・全解凍・一時ファイル書き出し・非同期blob往復まで毎回フルコース。
- 再生・スクラブ中（トグル無し）はキャッシュヒットで再デコード無し。問題ない。
- export は `SourceFrameCache` 共有で active_layer_ids の組ごとに1回。フレーム毎ではない。

## 痛みランキング（ユーザー体感順）

1. ビルボードのトグル（キャッシュ皆無＋blob往復）
2. タイムラインのレイヤートグル（全リーフ再解凍。或窓式なら~760ms+合成）
3. スクラブ/再生（ヒット、問題なし）／初回インポート（1回は必然）／export（償却済み）

## 昇格設計の挿入点（調査で確定）

- (a) **並列化**: `parse_psd_fast` Phase 2 のループ（`psd_fast.rs:739-759`）。
  per-layer のバイト範囲を先に集めて rayon で解凍（bench 実証済みの手法そのまま）。
- (b) **active-only 解凍**: フィルタを合成段から Phase 2 へ前倒し。
  `parse_psd_fast` へ選択集合を渡す API 拡張が要る。
- (c) **per-layer 解凍キャッシュ（最高レバレッジ）**: `(ファイル同一性(mtime+size),
  layer stable_id) → Arc<RGBA>` を `parse_psd_fast`/`build_*_source_frame` 境界に新設。
  トグル時は未キャッシュ層のみ解凍＋再合成だけになる。既存3キャッシュは
  「最終合成の層」としてそのまま温存。タイムライン経路とビルボード経路の両方が同じ
  キャッシュを共有でき、キャッシュ皆無のビルボードが最も救われる。

## 次の一手

- フェーズ内訳計測（decode vs composite、別ノート）と合わせて本実装のTDD計画を確定。
- 予測: トグル体感は「全解凍(数百ms〜)」→「再合成のみ(全面ブレンド1回)」へ。
  合成コストが次の支配項になるため、内訳計測の composite 実測値が設計の鍵。
