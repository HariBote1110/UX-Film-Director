# 動画再生シーク暴走（FPS崩壊）のフォワードギャップ吸収修正

## 決定

- `NativeOverlayResidentVideoDecoder::request_frame`（`native-overlay/src/lib.rs`）が、
  `current+1` ちょうど以外の要求を全て `session.seek()`（`AVAssetReader` 再生成＋
  直前キーフレームからの再デマックス）していた挙動を変更し、`current+2`〜`current+90`
  の**小さい前方ギャップ**はシークせず `next_frame()` を連続実行して中間フレームを
  破棄しながら目標フレームまで進める（discard-decode）方式へ変更した。
- 判定ロジックは `resolve_frame_advance(current: Option<u64>, requested: u64,
  max_forward_gap: u64) -> FrameAdvance`（`Sequential` / `DecodeForward { frames }` /
  `Seek`）としてプラットフォーム非依存の純関数へ切り出し、単体テストで
  境界値（ギャップ0/1/最大値/最大値+1、後方、`current=None`、`max_forward_gap=0`）を
  網羅した。
- 後方要求、および前方ギャップが `max_forward_gap` を超える要求は従来どおり
  フルシークのまま。
- discard-decode 中にストリーム終端（`next_frame()` が `None`）へ到達した場合、
  または decode-forward の予算（ギャップ数+1）を使い切っても目標 pts に届かない
  場合は、フルシークへフォールバックしてから再試行する（無限ループ・失敗の回避）。
- `max_forward_gap` の値は `NATIVE_OVERLAY_MAX_FORWARD_DECODE_GAP_FRAMES = 90` として
  `native-overlay/src/lib.rs` 内に定義。`rust-backend/src/decode.rs` の
  `MAX_STREAMING_DECODE_SKIP_FRAMES`（同じく90、ffmpeg系ストリーミングデコーダの
  同種ガード）に値を揃えたが、デコードバックエンドが異なる（VideoToolbox vs
  ffmpegパイプ）ため定数は別々に定義し、クレート間の直接依存は作らなかった。

## 検討した代替案

1. **`current+1` 判定を単純に `current+N` まで拡張するだけ**（discard-decode の
   予算管理なし）: 却下。ストリーム終端やデコーダ内部エラーで無限ループする
   リスクがあり、フォールバック経路が必要と判断した。
2. **判定ロジックをインラインのまま `if/else` で拡張**: 却下。境界値（ちょうど
   `max_forward_gap`、`max_forward_gap+1`、`current=None`、後方）のテストを
   `request_frame` 全体（`VideoDecodeSession` を要するmacOS専用コード）に対して
   書く必要があり、CI（非macOS環境含む）で回せない。純粋関数へ切り出すことで
   プラットフォーム非依存の単体テストとして全環境で実行可能にした。
3. **`MAX_STREAMING_DECODE_SKIP_FRAMES` を `pub` にして `rust-backend` から
   re-export し native-overlay 側で共有する**: 却下（今回は見送り）。
   両者はそれぞれ別のデコードバックエンド向けに独立してチューニングされる
   ガードであり、値が偶然一致しているだけで、クレート間結合を増やすメリットが
   薄いと判断した。値だけ揃え、コメントで対応関係を明記した。
4. **根本修正（デコードをメインスレッドから外す）を今回のスコープに含める**:
   見送り。`perf_research/notes/video-playback-probe-results.md` の H1 確認により
   `presentNativeOverlayScene` が同期 N-API で Electron main thread を最大
   800ms〜1000ms超ブロックしていることが判明済みだが、これは PSD の
   `prepare_native_overlay_sources`（AsyncTask化）と同型の別タスクであり、
   影響範囲が `native-overlay/` 全体の非同期化に及ぶため本修正の直接スコープ外
   とした。今回の修正はシーク暴走の自己増幅ループ（ヒッチ→大きいシークコスト→
   次tickでさらに遅れる→さらに大きいギャップ）を断ち切ることで、根本修正までの
   間、崩壊の速度と深刻度を抑える対症療法という位置づけ。

## 制約・注意点

- 本修正は「非シーケンシャル要求のたびにフルシークする」ことによる**シーク回数と
  1回あたりコストの自己増幅**を軽減するものであり、`presentNativeOverlayScene` が
  Electron main thread を同期ブロックすること自体（H1のもう一つの要因）は未解消。
  再生開始直後や長時間ギャップ（>90フレーム）のシークは引き続きメインスレッドを
  ブロックしうる。
- `NATIVE_OVERLAY_MAX_FORWARD_DECODE_GAP_FRAMES = 90` は
  `MAX_STREAMING_DECODE_SKIP_FRAMES` に値を揃えただけの経験的な数値であり、
  discard-decode 自体のコスト（1フレームあたり数ms、GOP内であれば安価だが
  GOP境界をまたぐキーフレーム待ちが発生する場合はコストが変動しうる）について
  本タスクでは実測比較（before/after）を行っていない。次の一手は
  `video-playback-probe-results.md` の計測プロトコルで non-sequential 比率と
  `renderFrame` 最大所要時間を before/after 比較すること。
- `setTime` の再生中単調性ガード欠如（H2, `src/store/slices/playbackSlice.ts`）は
  本タスクのスコープ外（native-overlay/ のみを対象としたため）。別タスクで対応。
- discard-decode 中に `session.seek()` へフォールバックした場合、`request_frame`
  1回の呼び出しの中で2回シークが走る経路（decode-forward失敗→フォールバック
  シーク→そこでも終端）がありうるが、いずれのシークも失敗すればエラーを
  そのまま呼び出し元へ返す（無限リトライはしない）。
