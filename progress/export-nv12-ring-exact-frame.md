# エクスポートNV12リングの正確フレーム待機

## Decision
- `InProcessDecodeSession::request_nv12_frame`（`rust-backend/src/inprocess_decode.rs`）は
  preview/playback向けに「即座に何か返す」ことを優先し、`nearest_frame`で
  「対象PTS以下の最新フレーム、なければ前方フォールバック（hold-last-frame）」を
  待機タイムアウトなしで返す設計になっている。
- エクスポート経路`collect_resident_video_nv12_sources`（`native_render.rs`）は
  `pts = 0, 1/60, 2/60, ...`を実時間より大幅に速く連続リクエストするため、
  この「即座に返す」設計では呼び出し側がデコーダワーカーを追い越し、
  古いフレーム（最大2秒ラグ、`FORWARD_SEEK_GAP_SECONDS`未満は素通し）を
  掴んでしまう。かつ`FORWARD_SEEK_GAP_SECONDS`(2.0秒)を超えるとシークが発生し、
  `RING_WAIT_TIMEOUT`(1.5秒)以内にAVAssetReader再起動が終わらないと
  「in-process decoder ring has no frame available yet」でエクスポートが失敗する。
- エクスポート専用の`request_nv12_frame_exact(target_pts_seconds, frame_duration_seconds)`を
  新設。純粋関数`frame_ready_for_exact`が「リングの最新フレームのPTS +
  1フレーム分の時間 > 対象PTS」（＝デコードが対象PTSを実際に追い越したことの証拠）を
  満たすまでNoneを返し続け、条件を満たしたら`nearest_frame`と同じロジックで
  対象PTS以下の最新フレームを返す。EOF時は証拠を待たず、残っているフレームを
  そのまま採用する（それ以上デコードは進まないため）。
- 待機ループは`request_nv12_frame`と`request_nv12_frame_exact`で共通化し
  （`request_nv12_frame_with`）、両者の違いは「どの待機時間を使うか」と
  「どのフレームなら今すぐ返してよいか（`pick`クロージャ）」だけに集約した。
- タイムアウトは既存の`RING_WAIT_TIMEOUT`(1.5秒、「シーク後の最初のフレーム」用)とは
  別に`EXACT_FRAME_WAIT_TIMEOUT`(15秒)を新設。外付けドライブ上の大きなHEVCファイルで
  シーク+キーフレームからのデコードが数秒かかりうるため、ハングしたデコーダの
  検知にのみ効く程度に余裕を持たせた。

## Alternatives considered
- 「エクスポート側でPTSを実時間ペースに揃えてリクエストする」案は、エクスポートの
  スループットを実時間制約に落とすことになり本末転倒なので不採用。
- `request_nv12_frame`自体の挙動を変える案は、preview/playback（低レイテンシ優先で
  多少古いフレームでも許容すべき）の契約を壊すため不採用。呼び出し元ごとに
  要求される保証が違う（preview=低レイテンシ優先、export=正確性優先）ので
  メソッドを分けた。

## Constraints / Gotchas
- `frame_ready_for_exact`の「デコードが追いついた」判定はリングの中身だけから
  導出する純粋関数（`RingState`/`VecDeque<RingFrame>`を直接構築するテストが可能）。
  ロックを握ったまま呼べるので、待機ループ内での多重ロックを避けられる。
- 実ファイル（1080p60 HEVC、外付けドライブ）で3000フレーム分の
  `request_nv12_frame_exact`連続呼び出しを検証（`export_sequential_requests_stay_within_one_frame_of_target`、
  `--ignored`）した結果、全フレームでlag=0.000秒、シークストームなし、
  総所要時間4.3秒（実デコード時間込み）。
- `request_nv12_frame`は現状コードベース内に呼び出し元が無くなった（旧来の
  唯一の呼び出し元だったエクスポート経路を`request_nv12_frame_exact`に
  切り替えたため）。preview/playback向けの契約として意図的に維持しているが、
  将来NV12プレビュー経路を追加する際に使う想定。dead-code警告が出るのは想定内。
