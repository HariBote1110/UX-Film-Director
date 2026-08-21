# 動画素材再生時の「再生位置巻き戻り＋FPS崩壊（<15fps）」仮説

## 目的 / 仮説

動画クリップをタイムラインに置いて再生すると、ほぼ確実に（ただし発生位置は不定で）
(1) 再生位置が後ろへジャンプし、(2) FPS が 15fps 未満まで崩壊する。
本ノートはコードリーディングによる原因仮説の記録。**未計測・未検証**。

## 環境

- リポジトリ: UX-Film-Director branch `feature-proxy`（b744c537 時点）
- コードリーディングのみ（実測なし）

## 仮説チェーン（有力順）

### H1: メインスレッド同期デコード → 追いつきスキップ → 非シーケンシャル要求 → O(GOP)同期シーク の自己増幅ループ（FPS崩壊の主犯候補）

1. `presentNativeOverlayScene` は同期 N-API（`native-overlay/src/lib.rs:1254-1264`）で、
   `present_scene()` 内の `resolve_video_sources`（`lib.rs:916-945, 959-978`）が
   **Electron メインスレッド上で同期的に**動画デコード／シークを行う。
   - PSD は同型の「ビーチボール」バグを `prepare_native_overlay_sources`
     （AsyncTask、`lib.rs:1266-1357`）への移設で修正済みだが、
     `load_overlay_native_sources_for_scene_cached_impl`（`lib.rs:2829-2857`）は
     `MediaKind::Video` を扱わず、**動画だけ pre-warm 経路から漏れている**。
2. ネイティブクロックの `tick`（`electron/rustScenePlaybackController.ts:451-473`）は
   壁時計から `frameIndex = floor(currentTime * fps)` を計算する「追いつき設計」
   （`progress/native-playback-clock.md`）。1フレームでも遅れると次の要求が +2 以上飛ぶ。
3. `NativeOverlayResidentVideoDecoder::request_frame`（`lib.rs:613-664`）は
   `current+1` ちょうどの要求以外は `seek()` → `AVAssetReader` 再生成
   （`macos-video-decode/src/session.rs:203-215, 242-261`）＋直前キーフレームからの
   再デマックス＋目標 pts までの同期デコードループ。GOP 長に比例するコスト。
4. シークが遅い → 次 tick でさらに飛ぶ → 毎 tick シーク、の暴走ループ。
   ffmpeg 側の兄弟経路には同種の "restart→runaway loop" 警告コメントあり
   （`rust-backend/src/decode.rs:717-722`）。
   一過性のヒッチ（GC/IO/CPU競合）が引き金になるため**発生位置が不定**な点と整合。

### H2: 遅れたメディアクロックへの無方向スナップ（巻き戻りの主犯候補）

- `setTime`（`src/store/slices/playbackSlice.ts:27-31`）には再生中の単調性ガードがなく、
  遅れた時刻を渡せば即座に巻き戻る。全経路がここに合流する。
- 巻き戻りを供給し得る経路:
  - `resolveSharedRendererExternalVideoMasterClockSnapTime`
    （`src/utils/sharedRendererExternalVideoMasterClock.ts:53-75`）:
    再生中、`HTMLVideoElement.currentTime` とヘッドの乖離が1フレーム超なら
    **前後の区別なく**要素側の時刻へスナップ → デコーダが遅れている場合は
    ヘッドが過去へ引き戻される。呼び出し元 `src/components/Viewport.tsx:1360-1367, 568-577`。
  - ネイティブ側 UI state IPC: `Viewport.tsx:1696` が
    `setTime(playbackState.currentTimeSeconds)` を無ガードで適用。
  - resident revision 変化での再エンゲージ（`Viewport.tsx:1717-1794`）:
    pause → setTime → start（engage ~370ms/回）で、再生中に繰り返せば
    FPS 崩壊と時刻の再発行が同時に起きる。

### H3: ドリフト>0.35s での強制 seekTo がスターベーションを増幅

- `syncSharedRendererExternalVideoPlayback`
  （`src/utils/sharedRendererExternalVideoSource.ts:180-275`）は再生中ドリフトが
  0.35s を超えるたび `seekTo` を発行。遅れている最中の連続シークが停滞を悪化させ、
  H2 のスナップ条件を再度満たす。

## 統合シナリオ

一過性ヒッチ → H1 のシーク暴走で FPS 崩壊 → メディアクロックがヘッドより遅れる →
H2 の無方向スナップ／無ガード setTime で再生位置が巻き戻る。

## 検証手段（未実施）

- `tick` の frameIndex ジャンプ幅と `request_frame` の sequential/seek 分岐をログし、
  FPS 崩壊開始と非シーケンシャル要求率の相関を測る。
- `setTime` に「後退呼び出し」ログ（呼び出し元別）を仕込み、巻き戻り時の供給源を特定。

## 修正候補（検証後に /development で本実装）

1. 動画を pre-warm / 非同期デコード経路へ移す（PSD 修正と同型）。
2. `setTime` に再生中の単調前進ガード（明示シーク・pause スナップは除外）。
3. master clock スナップを前方限定にする（遅れている場合はヘッドではなくデコーダが誤り）。

## 結論

未検証（仮説段階）。棄却記録なし。

## 次の一手

上記ログ計測で H1/H2 を確定させてから修正。
