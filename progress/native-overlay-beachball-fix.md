# PSDプレビューbeachball対策（devビルド + main thread PSDデコード）

## 背景

`vm_tuning_research/notes/beachball-diagnosis.md` で確定した2つの独立原因:

1. `scripts/dev-native-overlay.mjs` が native-overlay/shared-video-frame-bridge-node
   アドオンを `--release` なし（debugビルド）で起動していた。rust-backend のみ
   release ビルドで、PSD のデコード・合成は全て native-overlay アドオン内で
   実行されるため、debugビルド（最適化なし）で10〜40倍遅い状態になっていた。
2. `presentNativeOverlayScene`（native-overlay/src/lib.rs）が Electron main thread
   上で完全同期実行される napi 関数で、PSD の `fs::read` + decode + composite
   （`build_native_psd_source_frame`）もその中で行われるため、処理時間がそのまま
   UI をブロックしていた。

## Fix 1: devビルドをreleaseへ統一（版491d）

### Decision
`scripts/dev-native-overlay.mjs` の native-overlay / shared-video-frame-bridge-node
両アドオンビルド呼び出しに `--release` を追加した。

`shared-video-frame-bridge-node` も対象にした理由: 同クレートの
`copy_into_upload_buffer` / `write_into_shared_frame_ring_node` /
`copy_into_shared_upload_buffer` はフレーム単位の memcpy を行うホットパスであり、
debugビルドのままだと同様の劣化要因になり得るため。

### Constraints / Gotchas
- `scripts/build-native-overlay-addon.mjs` / `scripts/build-shared-video-frame-node-addon.mjs`
  は元々 `--release` フラグを受け取れる作りだった（呼び出し側が渡していなかっただけ）。

## Fix 2: PSDソース構築をmain threadから逃がす（版491e）

### Decision
napi の libuv threadpool を使う `AsyncTask`/`Task` で
`prepareNativeOverlaySources(payload)` を新設した（native-overlay/src/lib.rs）。

- `compute()`（background thread）: 対象 window の `LIVE_OVERLAY_RENDERERS` から
  renderer を取得し、`load_overlay_native_sources_for_scene_cached_impl` を呼んで
  `native_source_cache`（PSD含む）を温める。GPU/AppKit ハンドルには一切触れず、
  cache フィールドへの挿入のみを行う。
- `resolve()`（main thread）: 結果をそのまま `NativeOverlayResponse` として返す。
- TS側 `electron/nativeOverlayMainBridge.ts` の `presentScene` は、addon が
  `prepareNativeOverlaySources` を公開していれば `presentNativeOverlayScene` の
  前にこれを await する。prepare が失敗しても無視して従来どおり同期 present へ
  フォールバックする（prepare はあくまで最適化であり、失敗時に present 自体を
  失敗させない）。

`presentNativeOverlayScene` 自体は変更していない（引き続き同期・キャッシュ hit
前提で高速になる）。

### Alternatives considered
- **presentNativeOverlayScene 自体を非同期化する**: AppKit/CAMetalLayer への
  描画呼び出しは main thread 制約があり、napi 関数全体を background thread へ
  逃がすことはできない。プレゼンテーション自体をリファクタする範囲は「最小の
  正しい変更」から外れるため不採用。
- **source cache を renderer から切り離した独立レジストリにする**: attach 前でも
  prepare できる・スレッド安全性の説明が楽になるという利点はあったが、
  present 側のキャッシュ参照経路まで変更する必要がありスコープが広がるため
  見送った。現状は renderer の `native_source_cache` フィールドをそのまま
  background thread から読み書きする設計（`NativeOverlayLiveSurfaceRenderer` は
  `unsafe impl Send` 済みで、`Mutex<HashMap<..>>` は `T: Send` のみで `Sync` に
  なるため型システム上安全）。
- **`build_native_psd_source_frame` の `fs::read` をキャッシュでスキップする
  追加キャッシュ**: Fix 1 で release ビルドになり、かつ既存の
  `psd_layer_cache`（レイヤー解凍キャッシュ）とこの `native_source_cache`
  （合成済みフレームキャッシュ）が既に効いているため、追加の raw bytes
  キャッシュを新設する効果は限定的と判断し実装しなかった。

### Constraints / Gotchas
- prepare が attach 前（renderer 未登録）の window に対して呼ばれた場合は
  何もせず成功を返す（エラーにすると、起動直後のタイミング競合で beachball
  対策のはずの prepare 自体が失敗要因になってしまうため）。この場合 present
  側は通常どおり同期デコードするだけで、prepare を挟まなかった場合と結果は
  同一。
- `native-overlay/src/lib.rs` の `psd_source_cache_warm_then_present_incurs_zero_additional_decode`
  テストは、warm→present で追加デコードが発生しないという契約を
  `NativeOverlaySourceCache::stats()`（hits/misses）で固定している。これは
  既存の汎用キャッシュ機構で成立する契約のため実装前から green（真の
  red→green ではなく契約固定テスト）。新規ロジックである napi 非同期
  エントリ自体は FFI 越しのため `cargo test` では直接 red 化できず、
  TS 側（`src/utils/nativeOverlayMainBridge.test.ts`）で prepare→present の
  呼び出し順序とフォールバックを検証した。
