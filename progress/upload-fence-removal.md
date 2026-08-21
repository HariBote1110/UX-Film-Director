# IOSurfaceエクスポート経路の毎フレームuploadフェンス除去

## Decision
- `native-wgpu-renderer/src/lib.rs` の
  `render_frame_to_bgra_iosurface_with_audio_reactive_sources` が
  `prepare_scene_clips_with_upload_fence(..., wait_for_upload=true, ...)` を
  呼んでいたのを `false` に変更した。
- `wait_for_upload=true` は毎フレーム `queue.submit(std::iter::empty())` +
  `wait_for_submitted_work`（GPU完了待ち、実測約2.0ms）を実行しており、
  生成系ソースフレームキャッシュ導入後の全テクスチャキャッシュhit状態でも
  この待機だけが残ってGPU律速の下限を押し上げていた。
- wgpu は単一キューでは `write_texture` が発行順で後続の `submit` のコマンドより
  先に完了することを保証するため、このフェンスは不要。live surface 経路
  （`present_scene_with_decoration_to_surface_texture`）はすでに
  `wait_for_upload=false` で呼んでおり、今回の変更でIOSurfaceエクスポート
  経路も同じ前提に揃えた。
- e2e実測（`scripts/run-video-export-e2e.mjs`, focus-tips.json, 720フレーム）:
  変更前 98.7fps 相当 → 変更後 115.9〜134.8fps（実行ばらつきあり、定常的には
  133〜139fps域に収束）。

## Alternatives considered
- フェンスを条件付き（キャッシュ全hit時のみskip）にする案 → 複雑さの割に
  利益が薄い。wgpuの単一キュー順序保証はキャッシュhit/miss問わず常に成立する
  ため、無条件で `false` にする方がシンプルで正しい。
- フェンス自体を削除して `wait_for_upload` 引数を撤去する案 → 他の呼び出し
  経路（`render_frame_stages` 系のテスト用途など）が `true` を使い続けて
  いる可能性があり、引数を残したまま呼び出し側だけを変更する方が影響範囲を
  最小化できる。

## Constraints・Gotchas
- 本変更はTDDで検証: `native-wgpu-renderer/src/lib.rs` の
  `tests::bgra_iosurface_upload_fence::steady_state_export_frame_does_not_take_the_upload_fence`
  が、テスト専用カウンタ `upload_fence_wait_count`（`AtomicU64`、
  `#[cfg(test)]`、本番挙動には影響しない）を用いて、ウォームアップ後の
  定常状態フレームで `queue.submit(empty)` + `wait_for_submitted_work` が
  一切実行されないことを固定している。macOS(Metal) 限定のIOSurfaceテスト。
- この根拠は事前の研究ノート
  `encode_research/notes/upload-fence-per-frame-removal.md`（コミット
  62b291a3）に基づく。単一queueでの `write_texture`→後続`submit`の順序保証は
  wgpu自体のqueue契約に依存するため、将来wgpuをアップグレードする際は
  この前提が崩れていないか確認すること。
