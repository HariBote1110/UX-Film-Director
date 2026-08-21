# 生成系ソースフレームの revision キー付き CPU キャッシュ

## Decision

- `encode_research/notes/collect-sources-cpu-rasterisation.md` の犯人確定
  （`collect_native_render_sources` の `_` アーム = Text/SolidColour/
  GeneratedShape/GeneratedGradient 等の毎フレーム無条件 CPU 再ラスタライズが
  ~7ms/frame）を受けて、`GeneratedSourceFrameCache`（
  `rust-backend/src/state.rs`）を新設した。
  - キー: `media_id`（1 media = 1 エントリ、revision が変われば置換）。
  - revision: `media_content_revision(media, None)`
    （`rust-backend/src/source_frames.rs`）。
    隣接する `collect_native_render_source_content_revisions` が同じ種別群に
    使っている revision 計算式と **完全に同じもの** を再利用した
    （time_seed なし）。理由: `build_native_generated_source_frame` は
    `_` アームに到達する種別に対しては `source_frame` 引数を一切参照しない
    （`rust-backend/src/lib.rs:10` のコードリーディングで確認済み）。時間
    依存の生成系（GeneratedParticle 等）はこの `_` アームへ到達する前に
    `continue` しているため、`_` アームには時間非依存の種別しか来ない。
  - 2 つの計算式を意図的に同じ関数呼び出し形（`media_content_revision`）で
    揃えることで、将来どちらかだけ変更されて revision の意味がズレる事故を
    防いだ。
- 同時に `collect_native_render_sources` の戻り値を
  `HashMap<String, RgbaFrame>` から `HashMap<String, Arc<RgbaFrame>>` へ変更
  した。`build_image_source_frame`/`build_psd_source_frame` が末尾で行って
  いた `(*frame).clone()`（フレームごとに 0.3〜0.5ms のピクセルディープ
  コピー）を排除し、キャッシュヒットした生成系フレームも同様に Arc のまま
  返せるようにするため。
- Arc 化は `native-wgpu-renderer`（レンダラー本体の `sources: &HashMap<...>`
  シグネチャ群、約40箇所）と `native-overlay`（Chromium プレビュー側の
  `merged_sources`/`decoration_sources` 等、collect_native_render_sources を
  経由しないが同じ `render_native_wgpu_frame*` 系関数を直接呼んでいるため
  波及）まで一貫させた。両クレートとも本体コードはシグネチャの型書き換え
  だけで済み、テストコード側は `render_reference_frame`（CPU 参照実装、
  `Arc` 化しない別クレート）と同じ fixture を共有していた箇所のみ
  `arc_sources()` ヘルパーで変換を挟んだ。

## Alternatives considered

- **`SourceFrameCache`（Image/Psd 用の既存キャッシュ）を流用**: キー型が
  ファイルパス＋mtime＋サイズ＋レイヤー選択という「ファイル由来」の識別子
  前提で、生成系（パラメータ由来、ファイルなし）には合わない。無理に共用
  すると偽陽性/偽陰性のリスクがあるため、専用の小さいキャッシュを新設した。
- **ピクセルハッシュでキャッシュキーを作る**: 正確だが生成のたびにピクセル
  全体を触ることになり、削減したい CPU コスト自体を再導入してしまう。
  既存の `collect_native_render_source_content_revisions` と同じ「パラメータ
  ハッシュのみ」方式を踏襲した。

## Constraints・Gotchas

- `GeneratedSourceFrameCache` は media_id ごとに 1 エントリしか持たない
  （revision が変われば古いエントリを置換）ため、Image/Psd 用
  `SourceFrameCache` のような世代またぎの多重エントリは発生しない。無限
  成長を防ぐための entry 数上限（256、超過時は任意の 1 件を evict）のみ
  防御的に入れてある。
- `render_reference_frame`（`uxfd_reference_renderer` クレート、CPU 並列
  検証用リファレンス実装）は今回 Arc 化していない。native-wgpu-renderer の
  テストの一部は同じ fixture を `render_reference_frame`（owned
  `RgbaFrame`）と `render_native_wgpu_frame`（`Arc<RgbaFrame>`）の両方に
  渡す必要があり、`arc_sources()` という薄い変換ヘルパーをテストファイル側
  に置いて対応した（本番コードには影響なし）。
- **sourceUploadMs が 2〜3ms 残っている件の調査結果**:
  `native-wgpu-renderer/src/lib.rs` の `prepare_scene_clips_with_upload_fence`
  は、GPU テクスチャキャッシュがヒットしても（`get_or_upload_media_texture`
  内で `create_texture`/`write_texture` をスキップしても）クリップごとに
  以下を **無条件で毎フレーム** 実行している:
  - `texture.create_view(...)`（キャッシュヒット時も呼ぶ実 GPU ドライバ
    コール）
  - `build_prepared_clip_bind_group(...)`（BindGroup はテクスチャと違って
    キャッシュされておらず、毎フレーム新規作成）
  - クリップ種別判定のための複数 HashMap（nv12/particle/audio_reactive/
    getcolor/hksy/simple_tube/focus_lines/shaking_polygon/
    shattered_sphere/sources）への逐次ルックアップ
  さらに `source_upload` の計測区間（`upload_start = Instant::now()`〜）は
  このクリップループ全体を包んでいるため、テクスチャ再アップロードそのもの
  ではなく「毎フレームの CreateView/CreateBindGroup + 複数 HashMap 探索」の
  コストを `sourceUploadMs` として計上している。これが 2〜3ms 残存の主因と
  見られる（未修正・追加調査/最適化は別タスク）。
