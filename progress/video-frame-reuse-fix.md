# 動画再生が projectFps/materialFps 倍速になる不具合の修正

## 決定
- `native-overlay/src/lib.rs` の `NativeOverlayResidentVideoDecoder::request_frame` に、保持中フレームの再利用チェックを追加した。project fps（例: 60fps）が素材（material）fps（例: 30fps）を上回るとき、逐次(+0/+1)の `source_frame` 要求のたびに旧実装は無条件で最低1フレームを decode していた。60fps プロジェクトで `target_seconds` は 1/60s ずつしか進まないのに、素材は `next_frame()` 1回で 1/30s 進んでしまうため、結果として素材は `projectFps / materialFps` 倍速（30fps素材/60fpsプロジェクトなら2.0倍）で再生されていた。
- 修正: `current_frame_satisfies_target(current_pts_seconds, target_seconds, tolerance_seconds)` を追加し、保持フレームの pts が `pts + tolerance >= target_seconds` を満たすなら decode せず現在のフレームを再利用できると判定する。ただしこの比較は逆方向シークの停止フレーム（target よりずっと未来の pts）にも誤って一致し得るため、単独では使わず `should_reuse_current_frame(advance, ...)` でラップし、`FrameAdvance::Sequential`（要求フレームが現在と同じか、ちょうど次のフレーム）の場合に限って適用する。`DecodeForward` と `Seek` の挙動は一切変更していない。
- `request_frame` 冒頭、既存の「同一 `source_frame` なら即 return」チェックの直後、`resolve_frame_advance` 呼び出し直後に `should_reuse_current_frame` の早期 return を追加した。再利用時も `current_source_frame` は要求されたフレーム番号へ更新するが、`current_frame`（decodeされたフレーム本体）とその pts は変更しない。

## 検証（実機プローブ）
- 作業ツリーに残されている `[vspeed2-probe]` eprintln 計測により、修正前は 60fps プロジェクト・30fps素材で `target_seconds=36.6s` の要求に対し `served pts_seconds=72.2s` を返しており、正確に 2.0 倍のズレだった。
- 24fps プロジェクトでは 1.0倍（ズレなし）だった。target のステップ幅（1/24s ≈ 41.7ms）が素材フレーム長（1/30s ≈ 33.3ms）より大きく、逐次要求のたびに `reached_target` が偶然満たされていたため、旧実装でも症状が顕在化しなかった。
- 音声は `HTMLVideoElement` から独立に再生されているため本バグの影響を受けず、映像のみが早送りされてA/Vズレとして観測されていた。

## 代替案として検討したもの
- `target_seconds` と `pts` の差から必要な decode 回数を動的に計算し直す案: `DecodeForward` の budget 計算と役割が重複し、既存のシーク暴走対策（`video-seek-runaway-fix.md`）と整合を取るための変更範囲が広がるため見送った。今回は「シーケンシャル要求で既に足りているフレームは decode しない」という最小限の追加に留めた。
- `resolve_frame_advance` 自体に新しい `FrameAdvance::Reuse` バリアントを追加する案: `resolve_frame_advance` は decode/seek 戦略の分類のみを担っており、pts という別の入力（現在保持しているフレームの実際の再生位置）を混ぜると責務が肥大化するため、別関数として切り出した。

## 制約・注意点
- `should_reuse_current_frame` は `FrameAdvance::Sequential` 限定でしか呼ばれない。この制約を外すと、backward seek（`requested < current`）で保持している「target よりずっと未来の」古いフレームがそのまま返ってしまう（pts が numerically target を満たすため）。テスト `should_reuse_current_frame_backward_seek_never_reuses` で明示的に固定している。
- `[vspeed2-probe]` の eprintln 計測コードは本タスクでは削除していない（調査完了後に別途削除予定）。
