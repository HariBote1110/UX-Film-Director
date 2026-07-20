# Phase 4c: in-process デコードコア統合（Stage 1・Stage 2 完了）

## スコープと到達点

**Stage 1**（`macos-video-decode` を `decode.*` RPC 面の裏側にインプロセスで
統合し、既存 ffmpeg パイプラインへ自動フォールバックする）と **Stage 3 の
一部**（decode-only の計測ハーネスと実測）は前セッションで完了。

本セッションでは **Stage 2**（NV12 ゼロコピーを `render.nativeSharedFrame`
の本番合成経路へ通し、CPU の NV12→RGBA 変換ブリッジを rust 側 GPU
コンポジタで省略する）と、Stage 3 の残り（decode+GPU合成の計測、NV12 vs
RGBA ブリッジの実測比較）を完了した。詳細は末尾「Stage 2: 実装内容と決定
（本セッション）」を参照。**scope 決定**: cross-process `IOSurfaceLookup`
の実機検証の結果、NV12 ゼロコピーは **rust-backend 自身の GPU コンポジタ
（`render.nativeSharedFrame`、rust-backend プロセス内で完結）に限定**し、
native-overlay（Electron プロセス側）の `presentSharedFrame` 経由の
オーバーレイ注入パスは既存の RGBA 共有メモリのままとした（詳細は後述）。

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
（3ms前後 vs 12〜96ms）。decode+GPU合成込みの計測は下記「Stage 2」参照。

## Stage 2: 実装内容と決定（本セッション）

### cross-process IOSurfaceLookup の実機検証結果（scope決定の根拠）

Phase 4b の決定ログでは「`Nv12IoSurfaceSource.surface_id` は
`IOSurfaceLookup` で解決可能なグローバル ID」と書かれており、理論上は
native-overlay（Electron プロセス側）からも同じ ID でルックアップできる
はずだった。本セッションでは実装に入る前に、この前提を実機で検証した:

同一 macOS ホスト上で、`macos-video-decode/src/session.rs` の
`build_output_settings` と全く同じ形（`kCVPixelBufferIOSurfacePropertiesKey`
に空辞書、`kIOSurfaceIsGlobal` 等の明示的グローバルフラグなし）で
`CVPixelBufferCreate` した IOSurface の ID を、**別プロセス**として起動した
子プロセスから `IOSurfaceLookup` で解決できるかを検証する最小 Rust
プログラム（producer/consumer 2バイナリ）を書いて実行した（macOS
26.5.2、arm64、agent サンドボックス無効化済みでも同結果）。

結果:
- 同一プロセス内での自己ルックアップ: **成功**（Phase 4b の既存テストが
  検証している経路そのもの）。
- 別プロセスからのルックアップ: **失敗**（`IOSurfaceLookup` が null を
  返す）。sandbox-exec の有無に関わらず再現し、単純な親子プロセス関係
  ですら通らなかった。

これは「IOSurface は 10.11 以降 ID だけでプロセス横断的に解決できる」
という一般的な理解（過去の macOS では成立していたとされる）が、少なくとも
この検証環境の macOS バージョンでは成り立たないことを示す一次情報である。
`kIOSurfaceIsGlobal` に相当するキーは `objc2-io-surface` の現行バインディング
にも存在せず、cross-process 共有には mach port 経由の明示的な受け渡し
（`IOSurfaceCreateMachPort`/`IOSurfaceLookupFromMachPort` 等）が必要と
推測される。

**決定**: NV12 ゼロコピーは **rust-backend 自身の GPU コンポジタ
（`render.nativeSharedFrame`、decode セッションと同一プロセス内）に限定**
する。native-overlay（別プロセスである Electron 側）の
`presentSharedFrame`／`presentNativeOverlaySharedFrame` は本ステージでは
変更せず、既存の RGBA 共有メモリ経路のままとした。これは要件書が明示的に
許容している帰結（「if global lookup is unavailable... document it and
scope the NV12 path to rust-backend's own compositor... that is an
acceptable outcome」）であり、native-overlay 側のコードは無改修（54テスト
そのままグリーン）。実際に mach port 経由の cross-process import を実装
する場合は、rust-backend と native-overlay 間に IOSurface 用の mach port
受け渡しチャネル（現状の JSON-RPC + 共有メモリ記述子だけでは運べない）を
新設する必要があり、別フェーズの独立したタスクとするのが妥当。

### `uxfd-rust-core::Nv12IoSurfaceRef`（共有型）

`SceneSnapshot`/`EvaluatedClip`（JSON ワイヤーコントラクト、
`tests/timeline_snapshot_contract.rs` で固定）には一切手を入れず、
`rust-core/src/nv12_source.rs` に独立した新型 `Nv12IoSurfaceRef {
surface_id, width, height, colour_range, colour_matrix, revision }` +
`Nv12ColourRange`/`Nv12ColourMatrix`（3値: Bt601/Bt709/Bt2020）を追加した。
理由: IOSurface ID は JS/Electron 側が一切関知しない rust-backend
プロセス内部のデコードセッション詳細であり、`SceneSnapshot` 側のクリップ
表現に埋め込む動機がそもそも無い（埋め込もうとすると「JS がどうやって
IOSurface ID を知るのか」という解けない問題が生じる）。呼び出し側は
`HashMap<String, RgbaFrame>`（既存の RGBA sources map）と並行する
サイドカー `HashMap<String, Nv12IoSurfaceRef>` として渡す設計にした。
media_id がこの map に無ければ従来どおり RGBA 解決のままなので、既存
snapshot JSON の解釈・挙動には一切影響しない（100% 追加的）。

### `rust-backend/src/inprocess_decode.rs`: 直近提供フレームの NV12 参照公開

`InProcessDecodeSession` に `last_served_nv12_source() ->
Option<Nv12IoSurfaceRef>` を追加。`request_frame`（`decode.requestFrame`
が呼ぶ）が実際に返したフレームと**同一のフレーム**の NV12 参照を返す
（別途 pts で再検索するのではなく、`nearest_frame` が選んだ
`RingFrame` からそのまま導出することで、CPU RGBA ブリッジと NV12
ゼロコピーが常に同じ内容のフレームを指すことを保証している）。

実装上のハマりどころ: `DecodedVideoFrame` は意図的に `Send` のみで
`Sync` ではない（phase4a）。素朴に `Arc<DecodedVideoFrame>` を
`RingFrame`/`RingState` に持たせると、`Arc<T>: Send` が `T: Send + Sync`
を要求するため `Arc<DecodedVideoFrame>` 自体が `Send` にならず、
`Mutex<RingState>` を介してワーカースレッドとまたぐ既存の設計全体が
コンパイルできなくなる。`Arc<Mutex<DecodedVideoFrame>>` に包むことで
型レベルの `Send`/`Sync` を回復した（`Mutex` は一度も再ロックしない ——
`surface_id`/`width`/`height`/`colour` はデコード時点で plain Copy
データとして先に取り出しておき、`Mutex` はサーフェスを生かしておく
ためだけのリテインハンドルとして扱う）。

### 本番合成パスへの統合（native-wgpu-renderer / rust-backend）

- `native-wgpu-renderer`: `prepare_scene_clips_with_upload_fence` に
  `nv12_sources: &HashMap<String, Nv12IoSurfaceRef>` を追加。media_id が
  ここに見つかれば `sources`（RGBA）を一切参照せず、Phase 4b の
  `get_or_import_nv12_media_textures`/`Nv12MediaTextureCache` を再利用する
  新設ヘルパー `prepare_nv12_clip` で GPU テクスチャを import する。
  `PreparedClip` に `pipeline_kind`（Rgba/Nv12）タグを追加し、
  `encode_prepared_clips` がクリップごとに正しいパイプラインへ切り替える
  ことで、RGBA クリップと NV12 クリップが同一シーン・同一レンダーパスに
  混在合成できる。`Nv12ColourRange`/`Nv12ColourMatrix` は
  `uxfd-rust-core` の正準定義を re-export する形に変更（重複型を排除）。
  既存の RGBA 専用呼び出し（`nv12_sources` を渡さない、あるいは
  live-surface パス）は空 map を内部で補うため、シグネチャ・挙動とも
  完全後方互換。
- `rust-backend`: `render.nativeSharedFrame`
  （`handle_native_render_shared_frame`）が `shared_sources` の各
  media_id を `state.decode_sessions` と突き合わせ（JS 側の
  `mediaId ?? jobId` 規約と同一の相関）、in-process セッションかつ
  `last_served_nv12_source()` が `Some` を返す media_id だけ
  `nv12_sources` map へ入れて native-wgpu-renderer へ渡す。
  `UXFD_DISABLE_NV12_ZERO_COPY_RENDER=1` で無効化でき、レスポンスに
  `nv12ZeroCopyMediaIds`（実際にゼロコピー経路を通った media_id 一覧）を
  追加して診断・テストから直接観測できるようにした。
  `encode.writeNativeFrame`（export 経路）は本ステージのスコープ外の
  まま、常に空 map を渡して既存挙動を維持する。

### バグ発見と修正: CPU 高速パスが NV12 zero-copy を実質デッドコード化していた

統合直後にテスト（`render_nv12_zero_copy.rs`）で発覚: `render.
nativeSharedFrame` には Phase 3 以前から既存の CPU 高速パス
（`cpu_simple_video::try_render_simple_video_frame_to_shared_ring`、
単一 video クリップ・`effects` 空・恒等に近い transform のシーンを GPU
ラウンドトリップ無しで CPU 直接合成する最適化）があり、これが
`nv12_sources` の解決より**先に**判定されていた。実運用で最も典型的な
「エフェクトなしの単一動画クリップ全画面プレビュー」シーンはまさに
この高速パスの対象条件そのものであるため、GPU コンポジタに一切到達
せず、本フェーズの主目的である NV12 zero-copy が実質的に永久に
デッドコードになる状態だった（`nv12ZeroCopyMediaIds` すら応答に
含まれない）。

修正: `handle_native_render_shared_frame` で `nv12_sources` を CPU 高速
パスの判定より前に計算し、`nv12_sources` が非空なら CPU 高速パスを
試みず常に GPU コンポジタへ委譲するようにした（`audio_waveforms.
is_empty() && nv12_sources.is_empty()` を高速パス試行の条件に変更）。
CPU 高速パスの本来の目的（RGBA 専用の軽量ケースでの GPU ラウンド
トリップ回避）は `nv12_sources` が空のとき（ffmpeg フォールバック
セッション等）は従来どおり温存される。レスポンス形状を揃えるため、
CPU 高速パスのレスポンスにも `nv12ZeroCopyMediaIds`（常に空配列）を
追加した。既存 `decode_control_plane.rs` の63テストは in-process
セッションを一切使わない（`nv12_sources` は常に空）ため無変更で
全green。

### golden parity テスト（実測）

`rust-backend/tests/render_nv12_zero_copy.rs`: 同一の決定論的フレーム
（`keyint=1` フィクスチャの frame 0）を独立起動した2バックエンドプロセス
でそれぞれ NV12 ゼロコピー経路・RGBA ブリッジ経路（kill switch で強制）
で合成し比較。**実測 maxByteDelta=0（完全一致）**、許容誤差は 2/255 に
設定。

### 実測（decode+GPU合成、Stage 3残り）

`rust-backend/tests/inprocess_decode_perf.rs::
inprocess_render_latency_nv12_zero_copy_vs_rgba_bridge_on_committed_hevc_1080p_fixture`
（コミット済み HEVC 1920x1080/60fps/~20Mbps フィクスチャ、release build、
120フレーム、`render.nativeSharedFrame` 経由 decode+GPU合成）:

| 経路 | 平均ms | p95ms | 最大ms |
| --- | --- | --- | --- |
| NV12 zero-copy | 11.91 | 13.81 | 31.51 |
| RGBA ブリッジ | 13.38 | 15.59 | 60.30 |

平均で約1.5ms/frame、最大レイテンシで約2倍の改善（CPU NV12→RGBA変換＋
それに伴うテクスチャアップロード経路の省略が効いている）。decode-only の
数値（平均約3ms/frame、上表）に対し decode+合成の絶対値が数倍になるのは
GPUセットアップ・readback・JSON往復を含むため。

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
- （Stage 2）native-overlay の `presentSharedFrame`／
  `presentNativeOverlaySharedFrame` は無改修。cross-process
  IOSurfaceLookup が使えない以上、これらのオーバーレイ注入パスに動画を
  流す場合は引き続き RGBA 共有メモリ経由（CPU ブリッジ）になる。
  Native Overlay 自体は既定でオーバーレイではなく `render.
  nativeSharedFrame` の直接合成を使う構成（phase3b参照）のため、
  実運用上の主要経路は今回のゼロコピー化の恩恵を受ける。
- （Stage 2）`encode.writeNativeFrame`（export/トランスコード経路）は
  スコープ外のまま、常に空 `nv12_sources` を渡して既存の RGBA ブリッジ
  挙動を維持している。export 経路の高速化は別タスク。
- （Stage 2）NV12 ソースの `max_texture_dimension_2d` 超過時のダウン
  スケールは未実装（Phase 4b から引き継いだ既知の制約。RGBA 側は
  `downscale_rgba_frame_to_fit` で対応済み）。通常の動画解像度は
  device 上限内に収まるため優先度低。
- （Stage 2）`Nv12ColourMatrix::Bt2020` は rust-core の型としては
  Bt601/Bt709 と区別して保持されるが、GPU shader（`Nv12Params::new`）・
  CPU ブリッジ（`ycbcr_to_rgb`）双方とも数値係数としては Bt709 と同一
  （Phase 4b から引き継いだ「専用係数なし」の近似で、変更なし）。
