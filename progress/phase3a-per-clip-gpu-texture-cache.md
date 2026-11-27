# Phase 3a: per-clip GPU テクスチャキャッシュ（リコンシリエーション方式）

## 決定

`render.nativeSharedFrame`（プレビュー合成の毎フレーム RPC）が全クリップの
GPU テクスチャを毎回作り直していた構造的コストを、`prepare_clip` を
「media_id ＋呼び出し側供給の内容世代（revision）」でキー付けした
per-media GPU テクスチャキャッシュに置き換えて解消した。

### キャッシュキー設計

- キー: `media_id: String` ＋ `revision: u64`（呼び出し側供給）。
- `NativeWgpuRenderer::media_texture_cache: Mutex<MediaTextureCache>`
  （native-wgpu-renderer/src/lib.rs）が `wgpu::Texture` そのものを保持し、
  revision が前回と一致すれば `create_texture`/`write_texture` を一切行わず、
  テクスチャの `create_view` と毎フレームの uniform buffer／bind group 再構築
  （`build_prepared_clip_bind_group`、安価）だけを行う。
- revision の算出は rust-backend 側
  （`collect_native_render_source_content_revisions`,
  rust-backend/src/source_frames.rs）が担う。ピクセルは一切ハッシュしない:
  - Image/Psd: 既存 `SourceFrameCache` の識別キー（パス＋mtime＋サイズ＋
    アクティブレイヤー）をハッシュ。
  - シェアードメモリ動画フレーム: `FrameDescriptor::generation` をそのまま
    使う（デコーダが新フレームを書くたびに進む値）。
  - その他の生成コンテンツ: `SceneMediaReference` の各フィールドをハッシュ。
    `GeneratedParticle`/`GeneratedFocusLinesPlus`/`GeneratedShakingPolygon`/
    `GeneratedShatteredSphere` は `clip.source_frame`（再生位置）も混ぜ、
    従来どおり毎フレーム再アップロードされる。
  - `GeneratedAudioWaveform`/`GeneratedAudioSphere`/`Video`（通常動画パス）は
    revision を算出しない＝常にミス扱い（既存の毎フレーム再生成のまま）。
- revision が存在しない media_id は常にミス扱いにすることで、呼び出し側が
  revision を渡さない経路（native-overlay の live surface 系、export/readback
  系の各種テスト・ヘルパー）は挙動を一切変えずに済む設計にした。

### リサイズ耐性

`NativeWgpuRenderer::resize_output(width, height)` を追加し、
`rust-backend/src/native_render.rs` の `get_or_create_native_wgpu_renderer`
がサイズ変更時にレンダラ全体（device／pipeline／`media_texture_cache`）を
破棄・再構築せず、出力サイズ依存リソース（`output_texture`／
`readback_buffer`）のみを作り直すよう変更した。

### 退避（eviction）

`MediaTextureCache` は二段構え:
1. `MEDIA_TEXTURE_CACHE_IDLE_FRAME_LIMIT`（30 フレーム）連続で参照されな
   かった media は即座に解放（クリップ削除・シーンクリア後の GPU メモリ
   回収）。
2. `MEDIA_TEXTURE_CACHE_MAX_BYTES`（512MB、`SourceFrameCache` と同じ予算）
   を超えた分は挿入順 LRU（`SourceFrameCache` と同じ設計）で追加退避。

### 既存の `PreparedSceneCache`（whole-scene, live surface 専用）との関係

native-overlay 経由の live surface 系（`present_scene_with_decoration_to_
surface_texture` 等）は内容世代（revision）を持たないため、per-clip
キャッシュは常にミス扱いで通過するだけに留めた（native-overlay 側のコードは
変更禁止のため、シグネチャは一切変えていない）。既存の generation ベースの
`PreparedSceneCache` はそのまま独立して動作し続け、退行なし
（既存テスト 3 件、全て green）。per-clip キャッシュへの一般化は将来の
拡張余地として残したが、今回のスコープ（`render.nativeSharedFrame` の
ホットパス）では不要と判断し実施しなかった。

## 検討して却下した代替案

- **`prepare_base_scene_clips_cached`（whole-scene キャッシュ）を per-clip
  キャッシュの上に完全に再実装する** — native-overlay へ revision 情報を
  渡す経路がなく実益がない一方、live surface 系の既存テスト（generation
  ベースの hit/miss 契約を直接検証）を壊すリスクがあるため見送った。
- **`sources: HashMap<String, RgbaFrame>` を `HashMap<String,
  NativeRenderSource>`（revision 同梱の新型）に置き換える** —
  decode.rs を含む広範囲（CPU simple video 経路・encode 経路・多数のテスト
  ヘルパー）に影響し、変更禁止ファイルの隣接コードまで揺らすリスクがある
  ため却下。`content_revisions: &HashMap<String, u64>` を並行引数として
  スレッディングする方式（revision 情報が無い呼び出し元は空 map を渡すだけ
  で従来どおり動く）を採用した。

## 制約・注意点

- `content_revisions` に media_id が存在しない場合は常にミス扱い
  （安全側のデフォルト）。native-overlay・多くの export/readback 系
  ヘルパーはこの経路を通り、挙動は変更前と完全に同一。
- バイト予算超過時の LRU 退避は `SourceFrameCache` 同様、真の最終アクセス
  時刻ではなく挿入順キューに基づく単純な近似。
