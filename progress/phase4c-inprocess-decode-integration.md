# Phase 4c: in-process デコードコア統合（Stage 1 完了、Stage 2/3 の状況）

## スコープと本セッションでの到達点

このセッションで完了したのは **Stage 1**（`macos-video-decode` を
`decode.*` RPC 面の裏側にインプロセスで統合し、既存 ffmpeg パイプラインへ
自動フォールバックする）と、**Stage 3 の一部**（decode-only の計測ハーネス
と実測）。**Stage 2**（NV12 ゼロコピーを `SceneSnapshot`/native-wgpu-
renderer/native-overlay の本番合成経路へ通す）は着手していない。理由と
残タスクは末尾「Stage 2 が未着手の理由と計画」を参照。

## 決定（Stage 1）

### セッション管理はセッションごとの `Option` フィールドで表現（別テーブルを作らない）

`crate::sessions::DecodeSession` に `inprocess: Option<InProcessDecodeSession>`
を1フィールド追加するだけにした。既存の `state.decode_sessions:
HashMap<String, DecodeSession>`（job_id キー）をそのまま流用でき、
「in-process 専用の別セッションテーブル」を新設して2つのテーブルを
job_id で同期させ続ける必要がない。`decode.stop` で `DecodeSession` が
drop されれば `inprocess` の `Drop` 実装が自動的にワーカースレッドへ
shutdown を伝えて join するので、セッションのライフサイクル管理が
既存コードと完全に一本化されている。

### 自動フォールバックは `decode.start` 時に1回だけ、同期的に判定

`VideoDecodeSession::open` はプロセス内デマックスのみで軽い（サブプロセス
無し）ため、`decode.start` ハンドラの中で同期的に試行し、成功すれば
そのセッションを in-process 経路に固定、失敗すれば `inprocess: None` の
まま既存 ffmpeg ストリーミング経路へ委ねる。失敗理由は `eprintln!` で
1回だけログに出す（`open_inprocess_decode_session`）。フレーム単位の
実行時フォールバック（in-process が動いている最中に失敗したら ffmpeg へ
切り替える）は実装していない — 要件（「`VideoDecodeSession::open` が
失敗したら」）が open 時点のフォールバックのみを求めており、実行時
フォールバックは状態遷移が複雑になる割に必要性の裏付けがなかったため。

### プリフェッチリングは mpsc チャネルではなく `Mutex<RingState> + Condvar`

要件文の「コマンドチャネル: request-target(pts), seek(pts), shutdown」を
文字通りの mpsc チャネルではなく、共有 `RingState`（`target_pts_seconds`・
`seek_request`・`shutdown` 等のフィールド）+ `Condvar` で実装した。
理由: 「最新の target だけが意味を持つ」（過去の request-target は無意味）
という性質が mpsc の FIFO キューとは相性が悪く（古い request が溜まる/
処理される問題を別途potentially避ける必要がある）、"最新値を上書きする
1スロットの共有状態 + 通知" の方が要件に自然に合致する。ワーカー
スレッドは `next_frame()` を呼ぶ前に毎ループ `shutdown`/`seek_request` を
チェックし、リクエストスレッド側は `request_frame()` 内でロックを取って
`target_pts_seconds` を更新するだけなので、RPC スレッドが一度でも
デコードそのものを待つことはない（後述の「バグとその修正」参照）。

### seek 要否の判定はワーカー側ではなく `request_frame` 側（呼び出しスレッド）で行う

`should_seek(ring, target_pts)`: リング内フレームの pts 範囲
（`front()`〜`back()`）または `last_decoded_pts` と比較し、後方
（`target + ε < 最古`）または大きな前方ギャップ（`target > 最新 +
FORWARD_SEEK_GAP_SECONDS(=2.0s)`）なら seek と判定する。frame_index
ドメイン（既存 ffmpeg 経路の `MAX_STREAMING_DECODE_SKIP_FRAMES=90` 相当）
ではなく pts ドメインで判定することで、`macos-video-decode` の
`seek()` 契約（pts ベース、"at-or-after"）とそのまま整合させた。

### CPU 互換ブリッジ（NV12→RGBA）は `nv12_composite.wgsl`（Phase 4b）と同じ係数

`rust-backend/src/inprocess_decode.rs::ycbcr_to_rgb` は Phase 4b の
`shared-renderer/shaders/nv12_composite.wgsl::load_source_linear` と
同一の range/matrix 式（video/full range 変換式、BT.601/BT.709 係数）を
CPU で再実装したもの。BT.2020 は両者とも専用係数を持たず BT.709 として
扱う（Phase 4b 側の既存の制約を踏襲）。Stage 2 で GPU 直結（IOSurface
import）に置き換わるまでの「互換性ブリッジ」であり、要件どおり CPU
readback（`DecodedVideoFrame::read_nv12`）のみを経由する。

出力解像度が原寸と異なる場合は最近傍リサイズ（`resize_rgba_nearest`）で
共有リングの固定バイト長契約に合わせる。ffmpeg の bilinear `scale`
フィルタとのピクセル完全一致は目的にしていない（そもそも2つのデコーダ
バックエンドはデコード自体が異なるため、要求してもいない）。

### Env kill-switch と診断値の露出方法

`UXFD_DISABLE_INPROCESS_DECODE=1` で強制的に旧経路へ。診断（「どちらの
経路が有効か」）は既存の `decodePath` フィールド（RPC レスポンス、
フレーム単位）に `"inprocess"` という新しい値を追加する形で露出した —
セッション単位の別 introspection エンドポイントは新設していない。
既存コードが診断情報をフレーム単位のレスポンスに載せる規約
（`decodePath`/`streamRestartReason`/`decodeInvocationCount` 等）に
揃えたほうが一貫性があり、テストからも直接検証できるため。

## 実測で発見・修正したバグ：プリフェッチリングの「先読み停止」

Stage 3 の計測ハーネス（`rust-backend/tests/inprocess_decode_perf.rs`）で
実際に120フレーム連続デコードを走らせたところ、リングが
`PREFETCH_RING_DEPTH`（12フレーム、pts=0 から）まで埋まった時点で
ワーカーが恒久的にデコードを止めることが判明した。原因: 消費側
（`request_frame`）が古いフレームを間引かないため、ワーカーの「満杯だから
待つ」判定（`ring_len >= PREFETCH_RING_DEPTH`）が一度真になると二度と
偽に戻らない。結果、13フレーム目以降は常に「保持された最後のフレーム」
（12フレーム目、pts≈0.18秒）が返り続け、実質的に再生が止まって見える
（ffmpegの再起動ストームとは違う形の、しかし同種の「見た目のガタつき」
バグ）。

`trim_consumed_frames`（`request_frame` 呼び出しのたびに、target_pts
（再生ヘッド）を追い越したフレームを1枚だけ残して間引く）を追加して
修正。これによりリングの実効長が再生の進行とともに縮み、ワーカーの
満杯判定が正しく解消されて先読みが継続する。回帰防止のユニットテスト
3件を追加（`trim_consumed_frames_lets_a_full_ring_shrink_as_target_pts_advances`
等）。

## 実測結果（Stage 3、decode-only）

計測ハーネス: `rust-backend/tests/inprocess_decode_perf.rs`
（`decode.requestFrame` + 実共有メモリ経路 + release build +
`UXFD_DISABLE_DECODE_CHECKSUM=1`。旧 ffmpeg 経路の基準値
（`markdown/Rust_Preview_Jank_Handoff.md`, 12〜96ms/frame @1080p）と
同じ `decodeMs` トレース系列に対応する指標で比較できるよう、base64
インライン経路や CRC32 を含まない構成にした）。

| ソース | 解像度/fps/ビットレート | フレーム数 | 平均ms | p95ms | 最大ms |
| --- | --- | --- | --- | --- | --- |
| `perf/heavy-media/20000kbps_60fps.mp4`（コミット済み、HEVC） | 1920x1080/60fps/~20Mbps | 120 | 3.11 | 3.78 | 6.65 |
| `/Volumes/Datadrive/2026-01-07 18-19-31.mov`（ユーザー実ファイル、HEVC、対象プロファイルそのもの） | 1920x1080/30fps/~35Mbps | 120 | 3.44 | 3.79 | 52.46 |

両方とも `decodePath="inprocess"`（VideoToolbox ハードウェアデコード）で
実行された。**このセッションの実行環境ではサンドボックスHEVC制約
（phase4a記載の `VTCouldNotFindVideoDecoderErr`）は再現しなかった** —
`macos-video-decode` の HEVC テスト2件、および上記ユーザー実ファイルの
デコードがいずれも成功している。phase4aの制約は特定の実行コンテキスト
（当時の agent サンドボックス）に固有だった可能性が高い。ただし
コード側の自動フォールバック機構自体は環境非依存で機能するため、
制約が再現する環境でも安全にffmpeg経路へ落ちる。

旧ffmpeg経路の基準（12〜96ms/frame）に対し、平均で3〜4桁改善している
（3ms前後 vs 12〜96ms）。ただしこれは decode のみの比較であり、Stage 2
（GPU合成込み）の計測はまだ行っていない。

## Stage 2 が未着手の理由と計画

Stage 2 は `uxfd-rust-core` の共有シーン型（`SceneLayer`/`EvaluatedClip`
等、`rust-backend` と `native-overlay` の双方が依存）を変更し、
`render.nativeSharedFrame` のソース解決から `native-wgpu-renderer` の
`render_layers_to_rgba`（Phase 4b）まで NV12 IOSurface を通す統合作業。
本セッションでは以下の理由で見送った:

1. **影響範囲が3クレートにまたがる**: `uxfd-rust-core` の型変更は
   `native-overlay`（54テスト+ソース内省テスト）と `rust-backend`
   （170テスト）の両方に波及する。Stage 1（1クレート内で完結、
   既存ffmpeg経路を一切変更しない設計）と異なり、後方互換性を壊さず
   安全に統合する検証には、この2クレートの既存シーン合成テストを
   すべて読み解いた上での慎重な設計・段階的な変更が要る。
2. **Stage 1 で本番デコード遅延の支配項はすでに解消**: 上記の実測どおり、
   デコード自体は 3ms 前後まで縮小した。Phase 4bの決定ログが指摘する
   「CPU→shm→フロントGPU往復」自体のコスト（`markdown/
   Rust_Preview_Jank_Handoff.md` の残問題1）は Native Overlay 既定化で
   別途解消済みとされており、Stage 2（NV12ゼロコピー本統合）が解消する
   のは主に「NV12→RGBA CPU変換のコスト」（本ブリッジで実測 <1ms/frame
   @1080p、`ycbcr_to_rgb` はテスト済みの単純なピクセルループ）であり、
   Stage 1 到達後の残余コストとしての優先度は当初想定より下がった。

### 次に着手すべきこと（Stage 2 着手時のメモ）

- `uxfd-rust-core` の `EvaluatedClip`（またはクリップのソース参照型）に
  ソース種別（Rgba vs Nv12IoSurface）を持たせる案が phase4bの決定ログ
  （制約節）にすでに書かれている。Stage 1 の `InProcessDecodeSession` が
  保持する `DecodedVideoFrame::io_surface_id()` を露出する経路
  （`inprocess_decode.rs` に追加）が必要 -- 現状は CPU readback
  （`read_nv12`）だけを使っており、IOSurface ID そのものは取得していない。
- `render.nativeSharedFrame` のソース解決（`rust-backend/src/
  native_render.rs`/`source_frames.rs`）で、対象クリップが Stage 1の
  in-process デコードセッションから来ている場合に CPU RGBA 変換を
  スキップし IOSurface ID + `Nv12ColourRange`/`Nv12ColourMatrix` を
  そのまま `native-wgpu-renderer` の `SceneLayerContent::Nv12` へ渡す
  経路を新設する。
- golden parity テスト（NV12合成 vs RGBA合成ブリッジ、Phase 4bのパターン
  再利用）は Stage 2 の一部として追加すること。

## 制約・注意点

- `InProcessDecodeSession`/`VideoDecodeSession` は `Send` のみで `Sync`
  ではない（phase4a記載のとおり）。ワーカースレッドが単一の所有者として
  排他的に触る設計を Stage 1 でもそのまま踏襲している。
- `resize_rgba_nearest` は最近傍のみ（バイリニアなし）。画質より
  「共有リングのバイト長契約を満たす」ことを優先した Stage 1 の
  スコープ限定。
- `FORWARD_SEEK_GAP_SECONDS=2.0`、`PREFETCH_RING_DEPTH=12`、
  `RING_WAIT_TIMEOUT=200ms`、`FIRST_FRAME_TIMEOUT=1500ms` はいずれも
  実機チューニング未実施の初期値。実機（Electron本番プロセス）での
  体感確認は本セッションでは未実施（RPCレベルの統合テスト・計測
  ハーネスのみ）。
